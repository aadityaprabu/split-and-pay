const groupsService = require("../services/groups.service");
const response = require("../models/response.model");

const listGroups = async (req, res) => {
  const groups = await groupsService.listGroups(req.user.id);
  res.json(response.success(groups, "groups", 200));
};

// Body: { name, member_ids }. The signed-in user is always a member.
const createGroup = async (req, res) => {
  const id = await groupsService.createGroup(req.body, req.user.id);
  res.status(201).json(response.success({ id }, "group created", 201));
};

const updateGroup = async (req, res) => {
  await groupsService.updateGroup(req.params.id, req.body, req.user.id);
  res.json(response.success({ id: req.params.id }, "group updated", 200));
};

const deleteGroup = async (req, res) => {
  await groupsService.deleteGroup(req.params.id, req.user.id);
  res.json(response.success(null, "group deleted", 200));
};

module.exports = { listGroups, createGroup, updateGroup, deleteGroup };
