-- backend/schema-auth.sql
-- Additive migration: run once against existing hexmap database.
-- All FK constraints use ON DELETE RESTRICT (explicit) — deleting a user
-- requires removing their sessions, roles, and OAuth providers first.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  avatar_url VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_oauth_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider ENUM('google','discord') NOT NULL,
  oauth_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_oauth (provider, oauth_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- campaign_id and team_id intentionally have NO foreign key constraints.
-- They use sentinel value 0 (meaning "not scoped") so that MySQL's UNIQUE
-- constraint works correctly — NULL values are never considered equal in
-- UNIQUE indexes, which would allow duplicate superuser rows.
-- Application code enforces valid combinations: superuser→(0,0),
-- gm→(campaign_id,0), player→(campaign_id,team_id).
CREATE TABLE IF NOT EXISTS user_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  role_type ENUM('superuser','gm','player') NOT NULL,
  campaign_id INT NOT NULL DEFAULT 0,
  team_id INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_role (user_id, role_type, campaign_id, team_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sessions (
  token CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
