-- MySQL Schema for Hexmap Campaign Map
-- All entities (teams, tiles) are campaign-specific
-- Supports history tracking for tile ownership and attacks

-- ============================================================================
-- Core Lookup Tables
-- ============================================================================

-- Strategic objective types (resources on tiles)
CREATE TABLE resources (
  name VARCHAR(50) PRIMARY KEY,
  display_name VARCHAR(100),
  description TEXT,
  icon_url VARCHAR(255)
);

-- ============================================================================
-- Campaign Management
-- ============================================================================

-- Individual game instances
CREATE TABLE campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  ended_at DATETIME,
  is_active TINYINT(1) DEFAULT 1
);

-- ============================================================================
-- Teams (Campaign-Specific)
-- ============================================================================

CREATE TABLE teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  sprite_url VARCHAR(255),
  sprite_width INT,
  sprite_height INT,
  color VARCHAR(7) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, name),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Team assets (campaign-specific via team)
CREATE TABLE team_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  asset_name VARCHAR(255) NOT NULL,
  score_value INT NOT NULL DEFAULT 0,
  UNIQUE(team_id, asset_name),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- ============================================================================
-- Map Tiles (Campaign-Specific, includes ownership state)
-- ============================================================================

CREATE TABLE tiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  col INT NOT NULL,
  `row` INT NOT NULL,
  location_name VARCHAR(255),
  resource_name VARCHAR(50),
  terrain_rules_name VARCHAR(255),
  terrain_rules_url VARCHAR(512),
  -- Ownership state
  team_id INT,
  color_override VARCHAR(7),
  defense INT DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, col, `row`),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_name) REFERENCES resources(name),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- ============================================================================
-- Attacks
-- ============================================================================

-- Active attacks in a campaign
CREATE TABLE attacks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  team_id INT NOT NULL,
  from_tile_id INT NOT NULL,
  to_tile_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (from_tile_id) REFERENCES tiles(id),
  FOREIGN KEY (to_tile_id) REFERENCES tiles(id),
  CHECK (from_tile_id != to_tile_id)
);

-- ============================================================================
-- History Tables (Audit Trail)
-- ============================================================================

-- Audit trail of tile ownership changes
CREATE TABLE tile_state_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  tile_id INT NOT NULL,
  previous_team_id INT,
  new_team_id INT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  change_reason VARCHAR(255),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (tile_id) REFERENCES tiles(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (new_team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- Record of past attacks and outcomes
CREATE TABLE attack_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  team_id INT NOT NULL,
  from_tile_id INT NOT NULL,
  to_tile_id INT NOT NULL,
  created_at DATETIME NOT NULL,
  resolved_at DATETIME,
  outcome VARCHAR(50),
  notes TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (from_tile_id) REFERENCES tiles(id),
  FOREIGN KEY (to_tile_id) REFERENCES tiles(id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_teams_campaign ON teams(campaign_id);
CREATE INDEX idx_team_assets_team ON team_assets(team_id);
CREATE INDEX idx_tiles_campaign ON tiles(campaign_id);
CREATE INDEX idx_tiles_team ON tiles(team_id);
CREATE INDEX idx_tiles_col_row ON tiles(campaign_id, col, `row`);
CREATE INDEX idx_attacks_campaign ON attacks(campaign_id);
CREATE INDEX idx_attacks_team ON attacks(team_id);
CREATE INDEX idx_tile_state_history_campaign ON tile_state_history(campaign_id);
CREATE INDEX idx_tile_state_history_tile ON tile_state_history(tile_id);
CREATE INDEX idx_tile_state_history_changed_at ON tile_state_history(changed_at);
CREATE INDEX idx_attack_history_campaign ON attack_history(campaign_id);
CREATE INDEX idx_attack_history_resolved ON attack_history(resolved_at);
