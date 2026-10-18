ALTER TABLE notification_settings ADD COLUMN partner_notifications INTEGER NOT NULL DEFAULT 1 CHECK(partner_notifications IN (0,1));
-- statement
CREATE TABLE partner_deliveries (
  log_id TEXT NOT NULL REFERENCES water_logs(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  amount_ml INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retry_at TEXT,
  PRIMARY KEY(log_id,subscription_id)
);
-- statement
CREATE INDEX partner_delivery_status ON partner_deliveries(status,retry_at);
-- statement
CREATE TRIGGER enqueue_partner_notification AFTER INSERT ON water_logs BEGIN
  INSERT INTO partner_deliveries(log_id,subscription_id,sender_name,amount_ml,created_at,updated_at)
  SELECT NEW.id,p.id,u.display_name,NEW.amount_ml,NEW.created_at,NEW.created_at
  FROM group_members m
  JOIN notification_settings n ON n.user_id=m.user_id
  JOIN push_subscriptions p ON p.user_id=m.user_id AND p.revoked_at IS NULL
  JOIN users u ON u.id=NEW.user_id
  WHERE m.group_id=NEW.group_id AND m.user_id<>NEW.user_id AND n.partner_notifications=1;
END;
