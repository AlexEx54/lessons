-- A registration waits here until its email code is confirmed; only then a row appears in users.
-- token_hash binds the code to the browser that submitted the form, so a later submission
-- for the same email by someone else cannot be confirmed with the code sent to the owner.
CREATE TABLE pending_registrations (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX pending_registrations_expires_at_idx ON pending_registrations(expires_at);
