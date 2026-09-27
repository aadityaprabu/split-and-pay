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
