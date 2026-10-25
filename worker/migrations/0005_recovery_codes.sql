-- Keep users unchanged so the previous Worker remains compatible during rollout.
CREATE TABLE recovery_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  recovery_hash TEXT NOT NULL,
  encrypted_code TEXT
);
