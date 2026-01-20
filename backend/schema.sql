-- PostgreSQL Schema for Hexmap Campaign Map
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
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- Teams (Campaign-Specific)
-- ============================================================================

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  sprite_url VARCHAR(255),
  sprite_width INT,
  sprite_height INT,
  color VARCHAR(7) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, name)
);

-- Team assets (campaign-specific via team)
CREATE TABLE team_assets (
  id SERIAL PRIMARY KEY,
  team_id INT REFERENCES teams(id) ON DELETE CASCADE,
  asset_name VARCHAR(255) NOT NULL,
  score_value INT NOT NULL DEFAULT 0,
  UNIQUE(team_id, asset_name)
);

-- ============================================================================
-- Map Tiles (Campaign-Specific, includes ownership state)
-- ============================================================================

CREATE TABLE tiles (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  col INT NOT NULL,
  row INT NOT NULL,
  location_name VARCHAR(255),
  resource_name VARCHAR(50) REFERENCES resources(name),
  terrain_rules_name VARCHAR(255),
  terrain_rules_url VARCHAR(512),
  -- Ownership state
  team_id INT REFERENCES teams(id) ON DELETE SET NULL,
  color_override VARCHAR(7),
  defense INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, col, row)
);

-- ============================================================================
-- Attacks
-- ============================================================================

-- Active attacks in a campaign
CREATE TABLE attacks (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  team_id INT REFERENCES teams(id) NOT NULL,
  from_tile_id INT REFERENCES tiles(id) NOT NULL,
  to_tile_id INT REFERENCES tiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CHECK (from_tile_id != to_tile_id)
);

-- ============================================================================
-- History Tables (Audit Trail)
-- ============================================================================

-- Audit trail of tile ownership changes
CREATE TABLE tile_state_history (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  tile_id INT REFERENCES tiles(id) ON DELETE CASCADE,
  previous_team_id INT REFERENCES teams(id) ON DELETE SET NULL,
  new_team_id INT REFERENCES teams(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_reason VARCHAR(255)
);

-- Record of past attacks and outcomes
CREATE TABLE attack_history (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE,
  team_id INT REFERENCES teams(id) NOT NULL,
  from_tile_id INT REFERENCES tiles(id) NOT NULL,
  to_tile_id INT REFERENCES tiles(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  outcome VARCHAR(50),
  notes TEXT
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

CREATE INDEX idx_teams_campaign ON teams(campaign_id);
CREATE INDEX idx_team_assets_team ON team_assets(team_id);
CREATE INDEX idx_tiles_campaign ON tiles(campaign_id);
CREATE INDEX idx_tiles_team ON tiles(team_id);
CREATE INDEX idx_tiles_col_row ON tiles(campaign_id, col, row);
CREATE INDEX idx_attacks_campaign ON attacks(campaign_id);
CREATE INDEX idx_attacks_team ON attacks(team_id);
CREATE INDEX idx_tile_state_history_campaign ON tile_state_history(campaign_id);
CREATE INDEX idx_tile_state_history_tile ON tile_state_history(tile_id);
CREATE INDEX idx_tile_state_history_changed_at ON tile_state_history(changed_at);
CREATE INDEX idx_attack_history_campaign ON attack_history(campaign_id);
CREATE INDEX idx_attack_history_resolved ON attack_history(resolved_at);
