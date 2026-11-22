const { pool, withTransaction } = require("../config/db");
const { Group, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { findParticipantIds } = require("./users.service");

/** Groups the user belongs to, with their members, alphabetical */
async function listGroups(userId) {
  const { rows } = await pool.query(
    `SELECT groups.id, groups.name, groups.created_by, groups.created_at,
            json_agg(
              json_build_object('id', users.id, 'name', users.name, 'picture_url', users.picture_url)
              ORDER BY users.name
            ) AS members,
            (SELECT COUNT(*)::int FROM expenses
             WHERE expenses.group_id = groups.id AND expenses.deleted_at IS NULL) AS expense_count
     FROM groups
     JOIN group_members ON group_members.group_id = groups.id
     JOIN users ON users.id = group_members.user_id
     WHERE EXISTS (SELECT 1 FROM group_members mine WHERE mine.group_id = groups.id AND mine.user_id = $1)
     GROUP BY groups.id
     ORDER BY lower(groups.name)`,
    [userId]
  );
  return rows;
}

/** Validates { name, member_ids }. The user making the change is always a member. */
function parseGroupInput(body, userId) {
  const name = String(body?.name ?? "").trim();
  if (name === "") throw new HttpError(400, "Give the group a name");
  if (name.length > Group.NAME_MAX_LENGTH) {
    throw new HttpError(400, `Keep the group name under ${Group.NAME_MAX_LENGTH} characters`);
  }
  const rawIds = Array.isArray(body?.member_ids) ? body.member_ids : [];
  if (!rawIds.every((id) => typeof id === "string" && Validation.UUID_PATTERN.test(id))) {
    throw new HttpError(400, "One of the members isn't valid");
  }
  const memberIds = [...new Set([userId, ...rawIds.map((id) => id.toLowerCase())])];
  return { name, memberIds };
}

async function assertAllParticipants(client, memberIds) {
  const participantIds = await findParticipantIds(client, memberIds);
  if (!memberIds.every((id) => participantIds.has(id))) {
    throw new HttpError(400, "Someone in this group isn't on the allowed list anymore");
  }
}

async function createGroup(body, userId) {
  const { name, memberIds } = parseGroupInput(body, userId);
  return withTransaction(async (client) => {
    await assertAllParticipants(client, memberIds);
    const { rows } = await client.query("INSERT INTO groups (name, created_by) VALUES ($1, $2) RETURNING id", [
      name,
      userId,
    ]);
    const groupId = rows[0].id;
    await client.query("INSERT INTO group_members (group_id, user_id) SELECT $1, unnest($2::uuid[])", [
      groupId,
      memberIds,
    ]);
    return groupId;
  });
}

/**
 * Locks the group for a change by whoever made it. Other members get a 403; anyone outside the group
 * gets a 404, as if it didn't exist. Returns its current member ids.
 * The FOR UPDATE also makes this wait for, and then block, any expense being saved into the group
 * (assertGroupCovers holds a FOR SHARE lock on the same row).
 */
async function lockGroupForCreator(client, groupId, userId, action) {
  if (!Validation.UUID_PATTERN.test(groupId)) throw new HttpError(404, "That group doesn't exist");
  const { rows: groupRows } = await client.query("SELECT created_by FROM groups WHERE id = $1 FOR UPDATE", [
    groupId,
  ]);
  if (groupRows.length === 0) throw new HttpError(404, "That group doesn't exist");
  const { rows } = await client.query("SELECT user_id FROM group_members WHERE group_id = $1", [groupId]);
  const memberIds = rows.map((row) => row.user_id);
  if (!memberIds.includes(userId)) throw new HttpError(404, "That group doesn't exist");
  if (groupRows[0].created_by !== userId) {
    throw new HttpError(403, `Only the person who made this group can ${action} it`);
  }
  return memberIds;
}

/**
 * Renames the group and replaces its members. Only whoever made the group can, and they always stay
 * in it. Someone who added, paid for or has a share in one of the group's expenses can't be removed,
 * or that expense would have people outside its group.
 */
async function updateGroup(groupId, body, userId) {
  const { name, memberIds } = parseGroupInput(body, userId);
  await withTransaction(async (client) => {
    const currentIds = await lockGroupForCreator(client, groupId, userId, "change");
    const addedIds = memberIds.filter((id) => !currentIds.includes(id));
    await assertAllParticipants(client, addedIds);

    const removedIds = currentIds.filter((id) => !memberIds.includes(id));
    if (removedIds.length > 0) {
      const { rows } = await client.query(
        `SELECT DISTINCT users.name FROM expenses
         JOIN expense_splits ON expense_splits.expense_id = expenses.id
         JOIN users ON users.id IN (expenses.created_by, expenses.paid_by, expense_splits.user_id)
         WHERE expenses.group_id = $1 AND expenses.deleted_at IS NULL AND users.id = ANY($2::uuid[])`,
        [groupId, removedIds]
      );
      if (rows.length > 0) {
        throw new HttpError(409, `${rows.map((row) => row.name).join(", ")} can't leave: they're on this group's expenses`);
      }
    }

    await client.query("UPDATE groups SET name = $1 WHERE id = $2", [name, groupId]);
    await client.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])", [
      groupId,
      removedIds,
    ]);
    await client.query("INSERT INTO group_members (group_id, user_id) SELECT $1, unnest($2::uuid[])", [
      groupId,
      addedIds,
    ]);
  });
}

/** Only an empty group can be deleted: expenses keep their group so the history stays readable */
async function deleteGroup(groupId, userId) {
  await withTransaction(async (client) => {
    await lockGroupForCreator(client, groupId, userId, "delete");
    const { rowCount } = await client.query(
      "SELECT 1 FROM expenses WHERE group_id = $1 AND deleted_at IS NULL LIMIT 1",
      [groupId]
    );
    if (rowCount > 0) throw new HttpError(409, "This group still has expenses, so it can't be deleted");
    // Deleted expenses may still point here; they're hidden everywhere, so unlink them
    await client.query("UPDATE expenses SET group_id = NULL WHERE group_id = $1", [groupId]);
    await client.query("DELETE FROM groups WHERE id = $1", [groupId]);
  });
}

/**
 * For an expense in a group: the user must be a member, and so must everyone on the expense.
 * Runs inside the expense's transaction and locks the group's member list against changes.
 */
async function assertGroupCovers(client, groupId, userId, everyoneInvolved) {
  if (!Validation.UUID_PATTERN.test(groupId)) throw new HttpError(400, "That group doesn't exist");
  // Waits for a member change in progress, and holds off new ones until this expense is saved, so the
  // membership checked below is still the membership when this commits
  await client.query("SELECT 1 FROM groups WHERE id = $1 FOR SHARE", [groupId.toLowerCase()]);
  const { rows } = await client.query(
    "SELECT user_id FROM group_members WHERE group_id = $1 FOR SHARE",
    [groupId.toLowerCase()]
  );
  const memberIds = new Set(rows.map((row) => row.user_id));
  if (!memberIds.has(userId)) throw new HttpError(400, "That group doesn't exist");
  if (!everyoneInvolved.every((id) => memberIds.has(id))) {
    throw new HttpError(400, "Everyone on the expense has to be in its group");
  }
}

module.exports = { listGroups, createGroup, updateGroup, deleteGroup, assertGroupCovers };
