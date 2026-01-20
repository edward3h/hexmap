-- Seed data for Hexmap Campaign Map
-- Migrated from src/data.yml

-- ============================================================================
-- Resources (Strategic Objectives)
-- ============================================================================

INSERT INTO resources (name, display_name, description) VALUES
  ('HiveCity', 'Hive City', 'A massive urban center with millions of inhabitants'),
  ('SpacePort', 'Space Port', 'Critical facility for orbital transport and supply'),
  ('CommandBastion', 'Command Bastion', 'Fortified military command center'),
  ('ShieldGenerator', 'Shield Generator', 'Defensive energy shield installation'),
  ('PowerStation', 'Power Station', 'Primary energy generation facility'),
  ('Manufactorum', 'Manufactorum', 'Industrial production facility'),
  ('HQ', 'Headquarters', 'Team headquarters and primary base of operations');

-- ============================================================================
-- Campaign: Gratus 2025
-- ============================================================================

INSERT INTO campaigns (name, description, is_active) VALUES
  ('Gratus 2025', 'Campaign for control of the Gratus system', TRUE);

-- ============================================================================
-- Teams (Campaign-Specific)
-- ============================================================================

INSERT INTO teams (campaign_id, name, sprite_url, sprite_width, sprite_height, color, display_name)
SELECT c.id, t.name, t.sprite_url, t.sprite_width, t.sprite_height, t.color, t.display_name
FROM campaigns c
CROSS JOIN (VALUES
  ('green', 'leaf-solid.png', 512, 512, '#33FF33', 'Green Grotmas Gratus Gang'),
  ('red', 'birb.png', 96, 96, '#FF3333', 'Red Team'),
  ('blue', 'square-solid.png', 448, 512, '#3333FF', 'Blue Team')
) AS t(name, sprite_url, sprite_width, sprite_height, color, display_name)
WHERE c.name = 'Gratus 2025';

-- ============================================================================
-- Team Assets
-- ============================================================================

-- Green team assets
INSERT INTO team_assets (team_id, asset_name, score_value)
SELECT t.id, asset.name, asset.value
FROM teams t
JOIN campaigns c ON t.campaign_id = c.id
CROSS JOIN (VALUES
  ('Vital Intel', 6),
  ('Daggers and Olive Branches', 1),
  ('Sap Their Lines', 1),
  ('Encirclement', 1)
) AS asset(name, value)
WHERE t.name = 'green' AND c.name = 'Gratus 2025';

-- Red team assets
INSERT INTO team_assets (team_id, asset_name, score_value)
SELECT t.id, asset.name, asset.value
FROM teams t
JOIN campaigns c ON t.campaign_id = c.id
CROSS JOIN (VALUES
  ('Seized Ground', 1),
  ('Daggers and Olive Branches', 1),
  ('Hearts and Minds', 1),
  ('Sap Their Lines', 1),
  ('Winter supplies', 1),
  ('Total War', 2),
  ('Vital Intel', 2)
) AS asset(name, value)
WHERE t.name = 'red' AND c.name = 'Gratus 2025';

-- Blue team assets
INSERT INTO team_assets (team_id, asset_name, score_value)
SELECT t.id, asset.name, asset.value
FROM teams t
JOIN campaigns c ON t.campaign_id = c.id
CROSS JOIN (VALUES
  ('Sap Their Lines', 1),
  ('Vital Intel', 4),
  ('Relics', 1),
  ('Total War', 1)
) AS asset(name, value)
WHERE t.name = 'blue' AND c.name = 'Gratus 2025';

-- ============================================================================
-- Tiles (Map Geography with Ownership)
-- ============================================================================

INSERT INTO tiles (campaign_id, col, row, location_name, resource_name, team_id, color_override, defense)
SELECT
  c.id,
  data.col,
  data.row,
  data.location_name,
  data.resource_name,
  t.id,
  data.color_override,
  data.defense
FROM campaigns c
CROSS JOIN (VALUES
  (-4, -2, 'Port Celestine', NULL, 'green', NULL, 0),
  (-4, -1, 'Keeler', NULL, 'green', NULL, 0),
  (-4, 0, 'Gheradon', 'CommandBastion', 'red', NULL, 0),
  (-4, 1, 'Purgatus', 'Manufactorum', 'red', NULL, 0),
  (-4, 2, 'Dantorum Gate', 'HQ', 'red', '#FF3333', 0),
  (-3, -2, 'Gherick''s Rapture', NULL, 'green', NULL, 0),
  (-3, -1, 'Mancunian Cluster', NULL, 'green', NULL, 0),
  (-3, 0, 'Interdictus Maximus', NULL, NULL, '#333333', 0),
  (-3, 1, 'Gerstahl''s Beacon', NULL, 'red', NULL, 0),
  (-3, 2, 'Castiga', NULL, 'red', NULL, 0),
  (-3, 3, 'Arabella Secondus', 'ShieldGenerator', 'red', NULL, 0),
  (-2, -2, 'Pyrar Tertius', 'ShieldGenerator', 'green', NULL, 0),
  (-2, -1, 'Cyclopos', 'CommandBastion', 'green', NULL, 0),
  (-2, 0, 'Curia Station', 'SpacePort', 'green', '#33FF33', 0),
  (-2, 1, 'Beladon', 'PowerStation', 'red', NULL, 0),
  (-2, 2, 'Nephtheradon', 'CommandBastion', 'red', NULL, 0),
  (-2, 3, 'Praxedes Cluster', NULL, 'red', NULL, 0),
  (-1, -2, 'Requiem Tertius', NULL, 'green', NULL, 0),
  (-1, -1, 'Alphorum', 'PowerStation', 'green', NULL, 0),
  (-1, 0, 'Sacellum Tertius', NULL, 'green', NULL, 0),
  (-1, 1, 'Noxar', 'ShieldGenerator', 'blue', '#3333FF', 0),
  (-1, 2, 'Coraxum Secondus', 'CommandBastion', 'red', NULL, 0),
  (-1, 3, 'Maleradon Primus', 'PowerStation', 'red', NULL, 0),
  (0, -3, 'Cryptos Hive', 'HQ', 'green', '#33FF33', 0),
  (0, -2, 'Arkhi', 'PowerStation', 'green', NULL, 0),
  (0, -1, 'Repentance', NULL, 'green', '#33FF33', 0),
  (0, 0, 'Cor Gratus (Outskirts)', 'HiveCity', 'blue', NULL, 2),
  (0, 1, 'Volcanum', 'PowerStation', 'blue', '#3333FF', 0),
  (0, 2, 'Balronas Rad-Wastes', NULL, NULL, '#333333', 0),
  (0, 3, 'Vinovia', 'CommandBastion', 'red', NULL, 0),
  (1, -2, 'Zephadon', 'ShieldGenerator', 'green', NULL, 0),
  (1, -1, 'Valerius', 'PowerStation', 'green', NULL, 0),
  (1, 0, 'Guayota', 'ShieldGenerator', 'green', '#33FF33', 0),
  (1, 1, 'Alexia''s Mourning', 'CommandBastion', 'blue', NULL, 0),
  (1, 2, 'Volcus Secondus', 'ShieldGenerator', 'blue', NULL, 0),
  (1, 3, 'Communion Crossing', 'SpacePort', 'red', '#FF3333', 0),
  (2, -3, 'Saint''s Eyrie', NULL, 'green', NULL, 0),
  (2, -2, 'Port Mortium', 'SpacePort', 'green', NULL, 0),
  (2, -1, 'Lorrin''s Sanctuary', NULL, 'green', NULL, 0),
  (2, 0, 'Marduk''s Watch', 'ShieldGenerator', 'blue', NULL, 0),
  (2, 1, 'Raveni', 'PowerStation', 'blue', NULL, 0),
  (2, 2, 'Eboracum', 'CommandBastion', 'blue', NULL, 0),
  (3, -2, 'Warrior''s Haven', NULL, 'blue', NULL, 0),
  (3, -1, 'Mari', 'PowerStation', 'blue', NULL, 0),
  (3, 0, 'Death-Zone Epsilon', NULL, NULL, '#333333', 0),
  (3, 1, 'Achallor', 'ShieldGenerator', 'blue', NULL, 0),
  (3, 2, 'Glevensium', 'CommandBastion', 'blue', NULL, 0),
  (3, 3, 'Burghalus', 'Manufactorum', 'blue', NULL, 0),
  (4, -1, 'Naraka', 'ShieldGenerator', 'blue', NULL, 0),
  (4, 0, 'Castra Secondus', 'PowerStation', 'blue', NULL, 0),
  (4, 1, 'Diabolar Tertius', 'CommandBastion', 'blue', NULL, 0),
  (4, 2, 'Port Kasanaan', 'HQ', 'blue', '#3333FF', 0)
) AS data(col, row, location_name, resource_name, team_name, color_override, defense)
LEFT JOIN teams t ON t.name = data.team_name AND t.campaign_id = c.id
WHERE c.name = 'Gratus 2025';

-- ============================================================================
-- Active Attacks
-- ============================================================================

INSERT INTO attacks (campaign_id, team_id, from_tile_id, to_tile_id)
SELECT
  c.id,
  t.id,
  from_tile.id,
  to_tile.id
FROM campaigns c
CROSS JOIN (VALUES
  ('green', 2, -2, -4, 2),
  ('green', -2, -1, -2, 0),
  ('green', -1, 0, 0, 0),
  ('green', 0, -2, 0, -1),
  ('green', 1, -1, 1, 0),
  ('red', -2, 0, 0, -3),
  ('red', -1, 1, 0, 0),
  ('red', 0, 1, 0, 0),
  ('red', 0, 3, 1, 3),
  ('blue', 0, 0, -1, 1),
  ('blue', 1, 1, 0, 1)
) AS data(team_name, from_col, from_row, to_col, to_row)
JOIN teams t ON t.name = data.team_name AND t.campaign_id = c.id
JOIN tiles from_tile ON from_tile.col = data.from_col AND from_tile.row = data.from_row AND from_tile.campaign_id = c.id
JOIN tiles to_tile ON to_tile.col = data.to_col AND to_tile.row = data.to_row AND to_tile.campaign_id = c.id
WHERE c.name = 'Gratus 2025';
