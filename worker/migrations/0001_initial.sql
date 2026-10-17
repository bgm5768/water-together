PRAGMA foreign_keys = ON;
-- statement
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, recovery_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
-- statement
CREATE TABLE groups (id TEXT PRIMARY KEY, invite_code_hash TEXT UNIQUE, created_at TEXT NOT NULL);
-- statement
CREATE TABLE group_members (group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','member')), joined_at TEXT NOT NULL, PRIMARY KEY(group_id,user_id));
-- statement
CREATE TRIGGER two_members BEFORE INSERT ON group_members WHEN (SELECT count(*) FROM group_members WHERE group_id=NEW.group_id)>=2 BEGIN SELECT RAISE(ABORT,'GROUP_FULL'); END;
-- statement
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
-- statement
CREATE INDEX sessions_user ON sessions(user_id);
-- statement
CREATE TABLE notification_settings (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 1, start_time TEXT NOT NULL DEFAULT '09:00', end_time TEXT NOT NULL DEFAULT '22:00', interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK(interval_minutes IN (30,45,60,90,120)), active_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]', stop_when_goal_reached INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'Asia/Seoul', daily_goal_ml INTEGER NOT NULL DEFAULT 2000 CHECK(daily_goal_ml BETWEEN 100 AND 10000), updated_at TEXT NOT NULL);
-- statement
CREATE TABLE water_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_id TEXT NOT NULL, amount_ml INTEGER NOT NULL CHECK(amount_ml BETWEEN 1 AND 3000), consumed_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(group_id,user_id) REFERENCES group_members(group_id,user_id));
-- statement
CREATE INDEX water_logs_group_date ON water_logs(group_id,consumed_at);
-- statement
CREATE INDEX water_logs_user_date ON water_logs(user_id,consumed_at);
-- statement
CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint_hash TEXT NOT NULL UNIQUE, encrypted_subscription_data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_sent_at TEXT, revoked_at TEXT);
-- statement
CREATE INDEX push_user ON push_subscriptions(user_id,revoked_at);
-- statement
CREATE TRIGGER max_devices BEFORE INSERT ON push_subscriptions WHEN (SELECT count(*) FROM push_subscriptions WHERE user_id=NEW.user_id AND revoked_at IS NULL)>=3 AND NOT EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint_hash=NEW.endpoint_hash) BEGIN SELECT RAISE(ABORT,'DEVICE_LIMIT'); END;
-- statement
CREATE TRIGGER max_revived_devices BEFORE UPDATE OF revoked_at ON push_subscriptions WHEN NEW.revoked_at IS NULL AND OLD.revoked_at IS NOT NULL AND (SELECT count(*) FROM push_subscriptions WHERE user_id=NEW.user_id AND revoked_at IS NULL)>=3 BEGIN SELECT RAISE(ABORT,'DEVICE_LIMIT'); END;
-- statement
CREATE TABLE notification_delivery_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE, scheduled_at TEXT NOT NULL, sent_at TEXT, status TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, attempts INTEGER NOT NULL DEFAULT 1, retry_at TEXT, updated_at TEXT NOT NULL);
-- statement
CREATE INDEX delivery_retry ON notification_delivery_logs(status,retry_at);
-- statement
CREATE INDEX delivery_cleanup ON notification_delivery_logs(updated_at);
-- statement
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
-- statement
CREATE INDEX rate_expiry ON rate_limits(expires_at);
