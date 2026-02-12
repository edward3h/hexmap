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

INSERT INTO campaigns (id, name, description, is_active) VALUES
  (1, 'Gratus 2025', 'Campaign for control of the Gratus system', 1);

-- ============================================================================
-- Teams (Campaign-Specific)
-- ============================================================================

INSERT INTO teams (id, campaign_id, name, sprite_url, sprite_width, sprite_height, color, display_name) VALUES
  (1, 1, 'green', 'leaf-solid.png', 512, 512, '#33FF33', 'Green Grotmas Gratus Gang'),
  (2, 1, 'red', 'birb.png', 96, 96, '#FF3333', 'Red Team'),
  (3, 1, 'blue', 'square-solid.png', 448, 512, '#3333FF', 'Blue Team');

-- ============================================================================
-- Team Assets
-- ============================================================================

-- Green team assets
INSERT INTO team_assets (team_id, asset_name, score_value) VALUES
  (1, 'Vital Intel', 6),
  (1, 'Daggers and Olive Branches', 1),
  (1, 'Sap Their Lines', 1),
  (1, 'Encirclement', 1);

-- Red team assets
INSERT INTO team_assets (team_id, asset_name, score_value) VALUES
  (2, 'Seized Ground', 1),
  (2, 'Daggers and Olive Branches', 1),
  (2, 'Hearts and Minds', 1),
  (2, 'Sap Their Lines', 1),
  (2, 'Winter supplies', 1),
  (2, 'Total War', 2),
  (2, 'Vital Intel', 2);

-- Blue team assets
INSERT INTO team_assets (team_id, asset_name, score_value) VALUES
  (3, 'Sap Their Lines', 1),
  (3, 'Vital Intel', 4),
  (3, 'Relics', 1),
  (3, 'Total War', 1);

-- ============================================================================
-- Tiles (Map Geography with Ownership)
-- ============================================================================

INSERT INTO tiles (campaign_id, col, `row`, location_name, resource_name, team_id, color_override, defense) VALUES
  (1, -4, -2, 'Port Celestine', NULL, 1, NULL, 0),
  (1, -4, -1, 'Keeler', NULL, 1, NULL, 0),
  (1, -4, 0, 'Gheradon', 'CommandBastion', 2, NULL, 0),
  (1, -4, 1, 'Purgatus', 'Manufactorum', 2, NULL, 0),
  (1, -4, 2, 'Dantorum Gate', 'HQ', 2, '#FF3333', 0),
  (1, -3, -2, 'Gherick''s Rapture', NULL, 1, NULL, 0),
  (1, -3, -1, 'Mancunian Cluster', NULL, 1, NULL, 0),
  (1, -3, 0, 'Interdictus Maximus', NULL, NULL, '#333333', 0),
  (1, -3, 1, 'Gerstahl''s Beacon', NULL, 2, NULL, 0),
  (1, -3, 2, 'Castiga', NULL, 2, NULL, 0),
  (1, -3, 3, 'Arabella Secondus', 'ShieldGenerator', 2, NULL, 0),
  (1, -2, -2, 'Pyrar Tertius', 'ShieldGenerator', 1, NULL, 0),
  (1, -2, -1, 'Cyclopos', 'CommandBastion', 1, NULL, 0),
  (1, -2, 0, 'Curia Station', 'SpacePort', 1, '#33FF33', 0),
  (1, -2, 1, 'Beladon', 'PowerStation', 2, NULL, 0),
  (1, -2, 2, 'Nephtheradon', 'CommandBastion', 2, NULL, 0),
  (1, -2, 3, 'Praxedes Cluster', NULL, 2, NULL, 0),
  (1, -1, -2, 'Requiem Tertius', NULL, 1, NULL, 0),
  (1, -1, -1, 'Alphorum', 'PowerStation', 1, NULL, 0),
  (1, -1, 0, 'Sacellum Tertius', NULL, 1, NULL, 0),
  (1, -1, 1, 'Noxar', 'ShieldGenerator', 3, '#3333FF', 0),
  (1, -1, 2, 'Coraxum Secondus', 'CommandBastion', 2, NULL, 0),
  (1, -1, 3, 'Maleradon Primus', 'PowerStation', 2, NULL, 0),
  (1, 0, -3, 'Cryptos Hive', 'HQ', 1, '#33FF33', 0),
  (1, 0, -2, 'Arkhi', 'PowerStation', 1, NULL, 0),
  (1, 0, -1, 'Repentance', NULL, 1, '#33FF33', 0),
  (1, 0, 0, 'Cor Gratus (Outskirts)', 'HiveCity', 3, NULL, 2),
  (1, 0, 1, 'Volcanum', 'PowerStation', 3, '#3333FF', 0),
  (1, 0, 2, 'Balronas Rad-Wastes', NULL, NULL, '#333333', 0),
  (1, 0, 3, 'Vinovia', 'CommandBastion', 2, NULL, 0),
  (1, 1, -2, 'Zephadon', 'ShieldGenerator', 1, NULL, 0),
  (1, 1, -1, 'Valerius', 'PowerStation', 1, NULL, 0),
  (1, 1, 0, 'Guayota', 'ShieldGenerator', 1, '#33FF33', 0),
  (1, 1, 1, 'Alexia''s Mourning', 'CommandBastion', 3, NULL, 0),
  (1, 1, 2, 'Volcus Secondus', 'ShieldGenerator', 3, NULL, 0),
  (1, 1, 3, 'Communion Crossing', 'SpacePort', 2, '#FF3333', 0),
  (1, 2, -3, 'Saint''s Eyrie', NULL, 1, NULL, 0),
  (1, 2, -2, 'Port Mortium', 'SpacePort', 1, NULL, 0),
  (1, 2, -1, 'Lorrin''s Sanctuary', NULL, 1, NULL, 0),
  (1, 2, 0, 'Marduk''s Watch', 'ShieldGenerator', 3, NULL, 0),
  (1, 2, 1, 'Raveni', 'PowerStation', 3, NULL, 0),
  (1, 2, 2, 'Eboracum', 'CommandBastion', 3, NULL, 0),
  (1, 3, -2, 'Warrior''s Haven', NULL, 3, NULL, 0),
  (1, 3, -1, 'Mari', 'PowerStation', 3, NULL, 0),
  (1, 3, 0, 'Death-Zone Epsilon', NULL, NULL, '#333333', 0),
  (1, 3, 1, 'Achallor', 'ShieldGenerator', 3, NULL, 0),
  (1, 3, 2, 'Glevensium', 'CommandBastion', 3, NULL, 0),
  (1, 3, 3, 'Burghalus', 'Manufactorum', 3, NULL, 0),
  (1, 4, -1, 'Naraka', 'ShieldGenerator', 3, NULL, 0),
  (1, 4, 0, 'Castra Secondus', 'PowerStation', 3, NULL, 0),
  (1, 4, 1, 'Diabolar Tertius', 'CommandBastion', 3, NULL, 0),
  (1, 4, 2, 'Port Kasanaan', 'HQ', 3, '#3333FF', 0);

-- ============================================================================
-- Active Attacks
-- ============================================================================

INSERT INTO attacks (campaign_id, team_id, from_tile_id, to_tile_id)
SELECT 1, t.id, ft.id, tt.id
FROM (SELECT 'green' AS team_name, 2 AS from_col, -2 AS from_row, -4 AS to_col, 2 AS to_row
      UNION ALL SELECT 'green', -2, -1, -2, 0
      UNION ALL SELECT 'green', -1, 0, 0, 0
      UNION ALL SELECT 'green', 0, -2, 0, -1
      UNION ALL SELECT 'green', 1, -1, 1, 0
      UNION ALL SELECT 'red', -2, 0, 0, -3
      UNION ALL SELECT 'red', -1, 1, 0, 0
      UNION ALL SELECT 'red', 0, 1, 0, 0
      UNION ALL SELECT 'red', 0, 3, 1, 3
      UNION ALL SELECT 'blue', 0, 0, -1, 1
      UNION ALL SELECT 'blue', 1, 1, 0, 1
) AS data
JOIN teams t ON t.name = data.team_name AND t.campaign_id = 1
JOIN tiles ft ON ft.col = data.from_col AND ft.`row` = data.from_row AND ft.campaign_id = 1
JOIN tiles tt ON tt.col = data.to_col AND tt.`row` = data.to_row AND tt.campaign_id = 1;
