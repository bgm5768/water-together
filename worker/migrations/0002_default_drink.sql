ALTER TABLE notification_settings ADD COLUMN default_drink_ml INTEGER NOT NULL DEFAULT 200 CHECK(default_drink_ml BETWEEN 1 AND 3000);
