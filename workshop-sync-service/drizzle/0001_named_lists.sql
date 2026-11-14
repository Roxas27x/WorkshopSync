ALTER TABLE lists ADD COLUMN named_lists TEXT NOT NULL DEFAULT 'null';
ALTER TABLE lists ADD COLUMN audience TEXT NOT NULL DEFAULT '{"mode":"all","friends":[]}';
ALTER TABLE profiles ADD COLUMN sharing_version INTEGER NOT NULL DEFAULT 1;
