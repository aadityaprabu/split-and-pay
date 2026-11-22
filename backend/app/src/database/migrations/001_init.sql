-- All money is stored as integer minor units (cents for USD, paise for INR) in BIGINT columns.
-- Never use FLOAT/REAL for money: 0.1 + 0.2 != 0.3.
-- Each expense has its own currency. Balances and settle-ups are kept per currency, because
-- $20 and ₹500 can't be netted against each other without an exchange rate.
--
-- Ids are UUIDs from Postgres 18's uuidv7(): not guessable or countable like 1, 2, 3, but
-- time-ordered, so new rows still land at the end of the primary key index.

-- Sign-in is Google-only, so there are no passwords.
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuidv7(),
  google_sub  TEXT NOT NULL UNIQUE, -- Google's stable account id
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  picture_url TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- One row per signed-in browser. The cookie holds a random token; only its SHA-256 is stored,
-- so a leaked database dump can't be used to hijack sessions.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Google accounts the admin has let in (managed from the admin page).
-- The admin (ADMIN_EMAIL env) is always allowed and is not stored here.
CREATE TABLE allowed_emails (
  email      TEXT PRIMARY KEY CHECK (email = lower(email)),
  added_by   UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Everyone who can sign in shares one household, so there are no groups: any active user
-- can be added to an expense.
CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  description  TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency     CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  split_type   TEXT NOT NULL CHECK (split_type IN ('equal', 'percent', 'exact')),
  paid_by      UUID NOT NULL REFERENCES users (id),
  spent_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by   UUID NOT NULL REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ -- soft delete, so balances can be audited
);
CREATE INDEX expenses_listing_idx ON expenses (spent_on DESC, created_at DESC) WHERE deleted_at IS NULL;

-- "A paid B back". Settling up with someone clears every open share between the two of you in one
-- currency, so amount_minor is the net of those shares (0 when they cancel out exactly).
CREATE TABLE settlements (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  from_user    UUID NOT NULL REFERENCES users (id),
  to_user      UUID NOT NULL REFERENCES users (id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency     CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  created_by   UUID NOT NULL REFERENCES users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE INDEX settlements_from_user_idx ON settlements (from_user);
CREATE INDEX settlements_to_user_idx ON settlements (to_user);

-- How much of each expense each participant owes. Rows for one expense sum to expenses.amount_minor
-- (computed in the service layer, inside the same transaction that writes the expense).
-- The payer's own share is settled from the start: nobody owes it to anyone.
CREATE TABLE expense_splits (
  expense_id    UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id),
  amount_minor  BIGINT NOT NULL CHECK (amount_minor > 0),
  basis_points  INTEGER CHECK (basis_points BETWEEN 1 AND 10000), -- percent splits only; 100% = 10000
  settled_at    TIMESTAMPTZ,
  settlement_id UUID REFERENCES settlements (id),
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX expense_splits_open_idx ON expense_splits (user_id) WHERE settled_at IS NULL;

-- ---------------------------------------------------------------------------------------------------
-- Groups, notes, comments, receipt files and partial payments
-- ---------------------------------------------------------------------------------------------------

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
