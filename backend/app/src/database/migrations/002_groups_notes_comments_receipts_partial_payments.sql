-- Groups, notes, comments, receipt files and partial payments.

-- Groups organise expenses (the flat, a trip, ...). Balances and settle-ups stay between two people
-- across all groups, so a group never changes what anyone owes.
CREATE TABLE groups (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  created_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users (id),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_id_idx ON group_members (user_id);

ALTER TABLE expenses
  ADD COLUMN group_id   UUID REFERENCES groups (id),
  ADD COLUMN notes      TEXT CHECK (length(notes) <= 1000),
  ADD COLUMN updated_at TIMESTAMPTZ;
CREATE INDEX expenses_group_id_idx ON expenses (group_id) WHERE deleted_at IS NULL;

CREATE TABLE expense_comments (
  id         UUID PRIMARY KEY DEFAULT uuidv7(),
  expense_id UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users (id),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expense_comments_expense_id_idx ON expense_comments (expense_id, created_at);

-- A photo or PDF of the bill, kept for reference only. Stored in Postgres so the existing database
-- backup covers it; the app shrinks photos before upload, and the backend caps each file's size.
CREATE TABLE expense_attachments (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  expense_id   UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES users (id),
  file_name    TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size    INTEGER NOT NULL CHECK (byte_size > 0),
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expense_attachments_expense_id_idx ON expense_attachments (expense_id, created_at);

-- A partial payment is a settlement row that settles no shares. It lowers the balance between the two
-- people until a full settle-up, which pays whatever is left and closes it (closed_by points there).
ALTER TABLE settlements
  ADD COLUMN is_partial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN closed_by  UUID REFERENCES settlements (id),
  ADD CONSTRAINT settlements_partial_amount_positive CHECK (NOT is_partial OR amount_minor > 0);
CREATE INDEX settlements_open_partial_idx ON settlements (from_user, to_user, currency)
  WHERE is_partial AND closed_by IS NULL;
