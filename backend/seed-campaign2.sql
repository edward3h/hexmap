-- Seed data for Campaign 2: Veridian Reach 2026
-- Two teams, ~18 tiles, 4 attacks

-- ============================================================================
-- Campaign
-- ============================================================================

INSERT INTO campaigns (id, name, description, is_active) VALUES
  (2, 'Veridian Reach 2026', 'The battle for supremacy in the Veridian Reach sector', 1);

-- ============================================================================
-- Teams
-- ============================================================================

INSERT INTO teams (id, campaign_id, name, sprite_url, sprite_width, sprite_height, color, display_name) VALUES
  (4, 2, 'red', 'birb.png', 96, 96, '#FF3333', 'The Crimson Talons'),
  (5, 2, 'green', 'leaf-solid.png', 512, 512, '#33FF33', 'Verdant Guard');

-- ============================================================================
-- Team Assets
-- ============================================================================

INSERT INTO team_assets (team_id, asset_name, score_value) VALUES
  (4, 'Vital Intel', 3),
  (4, 'Total War', 2),
  (4, 'Seized Ground', 1);

INSERT INTO team_assets (team_id, asset_name, score_value) VALUES
  (5, 'Vital Intel', 2),
  (5, 'Hearts and Minds', 1),
  (5, 'Relics', 2);

-- ============================================================================
-- Tiles
-- ============================================================================

INSERT INTO tiles (campaign_id, col, `row`, location_name, resource_name, team_id, color_override, defense) VALUES
  -- Red territory (west)
  (2, -3, -1, 'Forge Infernus',        'HQ',              4, '#FF3333', 0),
  (2, -3,  0, 'Pyraxis',               'Manufactorum',     4, NULL,      0),
  (2, -2, -1, 'Cinderwatch',           'CommandBastion',   4, NULL,      0),
  (2, -2,  0, 'Ashgrave',              'PowerStation',     4, NULL,      0),
  (2, -2,  1, 'Emberfell',             'ShieldGenerator',  4, NULL,      0),
  (2, -1, -1, 'Scorchfield',           NULL,               4, NULL,      0),
  (2, -1,  0, 'Molten Crossing',       'SpacePort',        4, '#FF3333', 0),
  -- Neutral / contested (centre)
  (2,  0, -1, 'Verdis Nexus',          'HiveCity',         NULL, '#333333', 2),
  (2,  0,  0, 'Thornwall',             'CommandBastion',   NULL, '#333333', 0),
  (2,  0,  1, 'Misthollow',            'ShieldGenerator',  5, NULL,      0),
  (2,  1, -1, 'Duskmeadow',            'PowerStation',     4, NULL,      0),
  -- Green territory (east)
  (2,  1,  0, 'Briarvale',             NULL,               5, NULL,      0),
  (2,  1,  1, 'Canopy Reach',          'CommandBastion',   5, NULL,      0),
  (2,  2, -1, 'Sylvan Beacon',         'SpacePort',        5, NULL,      0),
  (2,  2,  0, 'Roothold',              'PowerStation',     5, NULL,      0),
  (2,  2,  1, 'Fernwatch',             'ShieldGenerator',  5, NULL,      0),
  (2,  3,  0, 'Verdant Citadel',       'HQ',              5, '#33FF33', 0),
  (2,  3,  1, 'Mosskeep',              'Manufactorum',     5, NULL,      0);

-- ============================================================================
-- Active Attacks
-- ============================================================================

INSERT INTO attacks (campaign_id, team_id, from_tile_id, to_tile_id)
SELECT 2, t.id, ft.id, tt.id
FROM (SELECT 'red' AS team_name,   -1 AS from_col, 0 AS from_row,  0 AS to_col, 0 AS to_row
      UNION ALL SELECT 'red',       1, -1,  0, -1
      UNION ALL SELECT 'green',     0,  1,  0,  0
      UNION ALL SELECT 'green',     1,  0,  1, -1
) AS data
JOIN teams t ON t.name = data.team_name AND t.campaign_id = 2
JOIN tiles ft ON ft.col = data.from_col AND ft.`row` = data.from_row AND ft.campaign_id = 2
JOIN tiles tt ON tt.col = data.to_col AND tt.`row` = data.to_row AND tt.campaign_id = 2;
