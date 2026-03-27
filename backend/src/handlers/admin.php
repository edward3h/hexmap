<?php
// backend/src/handlers/admin.php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';
require_once __DIR__ . '/../hex.php';

// ── Tiles ────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/campaigns/:campaignId/tiles/:tileId
 * Body: any subset of { "team_id", "location_name", "resource_name", "color_override", "defense" }
 * Updates tile fields dynamically and records history when team_id is present.
 * Requires GM role for the campaign.
 */
function handleUpdateTile(int $campaignId, int $tileId): never
{
    $user  = requireAuth();
    $db    = getDb();
    $roles = getUserRoles($db, $user['id']);

    $isGm         = isGmForCampaign($roles, $campaignId);
    $playerTeamId = getPlayerTeam($roles, $campaignId);

    if (!$isGm && $playerTeamId === null) {
        jsonResponse(['error' => 'Forbidden'], 403);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    // Verify tile belongs to this campaign
    $stmt = $db->prepare('SELECT id, team_id FROM tiles WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$tileId, $campaignId]);
    $tile = $stmt->fetch();
    if (!$tile) {
        jsonResponse(['error' => 'Tile not found'], 404);
    }

    if (!$isGm) {
        // Players may only update defense on their own tiles
        if ((int)$tile['team_id'] !== $playerTeamId) {
            jsonResponse(['error' => 'You do not own this tile'], 403);
        }
        foreach (array_keys($body) as $key) {
            if ($key !== 'defense') {
                jsonResponse(['error' => 'Players may only update defense'], 403);
            }
        }
    }

    $setClauses = [];
    $params     = [];
    $hasTeamId  = array_key_exists('team_id', $body);

    // team_id
    if ($hasTeamId) {
        $newTeamId = $body['team_id'] === null ? null : (int)$body['team_id'];
        if ($newTeamId !== null) {
            $s = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
            $s->execute([$newTeamId, $campaignId]);
            if (!$s->fetch()) {
                jsonResponse(['error' => 'Team not found in this campaign'], 404);
            }
        }
        $setClauses[] = 'team_id = ?';
        $params[]     = $newTeamId;
    }

    // location_name
    if (array_key_exists('location_name', $body)) {
        $v = $body['location_name'];
        if ($v !== null && (!is_string($v) || mb_strlen($v) > 255)) {
            jsonResponse(['error' => 'location_name must be a string of max 255 characters'], 400);
        }
        $setClauses[] = 'location_name = ?';
        $params[]     = $v;
    }

    // resource_name
    if (array_key_exists('resource_name', $body)) {
        $v = $body['resource_name'];
        if ($v !== null) {
            $s = $db->prepare('SELECT name FROM resources WHERE name = ?');
            $s->execute([$v]);
            if (!$s->fetch()) {
                jsonResponse(['error' => 'resource_name not found in resources table'], 400);
            }
        }
        $setClauses[] = 'resource_name = ?';
        $params[]     = $v;
    }

    // color_override
    if (array_key_exists('color_override', $body)) {
        $v = $body['color_override'];
        if ($v !== null) {
            if (!is_string($v) || !preg_match('/^#[0-9a-f]{6}$/i', $v)) {
                jsonResponse(['error' => 'color_override must be in #rrggbb format'], 400);
            }
            $v = strtolower($v);
        }
        $setClauses[] = 'color_override = ?';
        $params[]     = $v;
    }

    // defense
    if (array_key_exists('defense', $body)) {
        $v = $body['defense'];
        if (!is_int($v) || $v < 0) {
            jsonResponse(['error' => 'defense must be a non-negative integer'], 400);
        }
        $setClauses[] = 'defense = ?';
        $params[]     = $v;
    }

    if (empty($setClauses)) {
        jsonResponse(['error' => 'No valid fields provided'], 400);
    }

    $params[] = $tileId;
    $params[] = $campaignId;
    $db->prepare(
        'UPDATE tiles SET ' . implode(', ', $setClauses) . ' WHERE id = ? AND campaign_id = ?'
    )->execute($params);

    // Record history only when team_id key was present in the body
    if ($hasTeamId) {
        $previousTeamId = $tile['team_id'] !== null ? (int)$tile['team_id'] : null;
        $writtenTeamId  = $body['team_id'] === null ? null : (int)$body['team_id'];
        $db->prepare(
            'INSERT INTO tile_state_history
                (campaign_id, tile_id, previous_team_id, new_team_id, change_reason)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$campaignId, $tileId, $previousTeamId, $writtenTeamId, 'admin']);
    }

    jsonResponse(['ok' => true]);
}

// ── Attacks ──────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/:campaignId/attacks
 * Body (GM): { "team_id": 3, "from_tile_id": 10, "to_tile_id": 11 }
 * Body (player): { "from_tile_id": 10, "to_tile_id": 11 }
 * Creates a new unresolved attack.
 * GMs: no adjacency enforcement. Players: from_tile must be owned by their team,
 * to_tile must be adjacent (or long-range via Spaceport), and must not be their own tile.
 */
function handleCreateAttack(int $campaignId): never
{
    $user  = requireAuth();
    $db    = getDb();
    $roles = getUserRoles($db, $user['id']);

    $isGm         = isGmForCampaign($roles, $campaignId);
    $playerTeamId = getPlayerTeam($roles, $campaignId);

    if (!$isGm && $playerTeamId === null) {
        jsonResponse(['error' => 'Forbidden'], 403);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $fromTileId = isset($body['from_tile_id']) && is_int($body['from_tile_id']) ? $body['from_tile_id'] : 0;
    $toTileId   = isset($body['to_tile_id'])   && is_int($body['to_tile_id'])   ? $body['to_tile_id']   : 0;

    if ($fromTileId <= 0 || $toTileId <= 0) {
        jsonResponse(['error' => 'from_tile_id and to_tile_id are required positive integers'], 400);
    }

    if ($fromTileId === $toTileId) {
        jsonResponse(['error' => 'from_tile_id and to_tile_id must differ'], 400);
    }

    if ($isGm) {
        // GM path: team_id required in body
        $teamId = isset($body['team_id']) && is_int($body['team_id']) ? $body['team_id'] : 0;
        if ($teamId <= 0) {
            jsonResponse(['error' => 'team_id is required for GM attacks'], 400);
        }

        // Verify team belongs to campaign
        $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
        $stmt->execute([$teamId, $campaignId]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => 'Team not found in this campaign'], 404);
        }

        // Verify both tiles belong to campaign
        $stmt = $db->prepare('SELECT id FROM tiles WHERE id IN (?, ?) AND campaign_id = ?');
        $stmt->execute([$fromTileId, $toTileId, $campaignId]);
        if ($stmt->rowCount() !== 2) {
            jsonResponse(['error' => 'One or both tiles not found in this campaign'], 404);
        }
    } else {
        // Player path: team_id from role, validate ownership and adjacency
        $teamId = $playerTeamId;

        // Fetch from_tile: must belong to campaign and be owned by player's team
        $stmt = $db->prepare(
            'SELECT id, col, row, resource_name, team_id FROM tiles WHERE id = ? AND campaign_id = ?'
        );
        $stmt->execute([$fromTileId, $campaignId]);
        $fromTile = $stmt->fetch();
        if (!$fromTile) {
            jsonResponse(['error' => 'From tile not found in this campaign'], 404);
        }
        if ((int)$fromTile['team_id'] !== $teamId) {
            jsonResponse(['error' => 'From tile is not owned by your team'], 422);
        }

        // Fetch to_tile: must belong to campaign and not be owned by player's team
        $stmt = $db->prepare(
            'SELECT id, col, row, team_id FROM tiles WHERE id = ? AND campaign_id = ?'
        );
        $stmt->execute([$toTileId, $campaignId]);
        $toTile = $stmt->fetch();
        if (!$toTile) {
            jsonResponse(['error' => 'To tile not found in this campaign'], 404);
        }
        if ($toTile['team_id'] !== null && (int)$toTile['team_id'] === $teamId) {
            jsonResponse(['error' => 'Cannot attack a tile owned by your own team'], 422);
        }

        // Validate adjacency (or Spaceport long-range rule)
        $fromCol = (int)$fromTile['col'];
        $fromRow = (int)$fromTile['row'];
        $toCol   = (int)$toTile['col'];
        $toRow   = (int)$toTile['row'];

        if (!areHexesAdjacent($fromCol, $fromRow, $toCol, $toRow)) {
            // Long-range attack: from_tile must have Spaceport resource
            if ($fromTile['resource_name'] !== 'Spaceport') {
                jsonResponse(['error' => 'Target tile is not adjacent to the source tile'], 422);
            }
            // Only one long-range (non-adjacent) attack allowed from a Spaceport tile at a time
            $stmt = $db->prepare(
                'SELECT a.id, t.col, t.row
                   FROM attacks a
                   JOIN tiles t ON t.id = a.to_tile_id
                  WHERE a.campaign_id = ? AND a.from_tile_id = ? AND a.resolved_at IS NULL'
            );
            $stmt->execute([$campaignId, $fromTileId]);
            foreach ($stmt->fetchAll() as $existing) {
                if (!areHexesAdjacent($fromCol, $fromRow, (int)$existing['col'], (int)$existing['row'])) {
                    jsonResponse(['error' => 'Spaceport is already in use for another long-range attack'], 422);
                }
            }
        }
    }

    $stmt = $db->prepare(
        'INSERT INTO attacks (campaign_id, team_id, from_tile_id, to_tile_id) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$campaignId, $teamId, $fromTileId, $toTileId]);
    $attackId = (int)$db->lastInsertId();

    jsonResponse(['ok' => true, 'attack_id' => $attackId], 201);
}

/**
 * DELETE /api/campaigns/:campaignId/attacks/:attackId
 * GMs: resolves the attack (sets resolved_at, records outcome='resolved' in history).
 * Players: cancels their own team's attack (sets resolved_at, records outcome='cancelled').
 */
function handleResolveAttack(int $campaignId, int $attackId): never
{
    $user  = requireAuth();
    $db    = getDb();
    $roles = getUserRoles($db, $user['id']);

    $isGm         = isGmForCampaign($roles, $campaignId);
    $playerTeamId = getPlayerTeam($roles, $campaignId);

    if (!$isGm && $playerTeamId === null) {
        jsonResponse(['error' => 'Forbidden'], 403);
    }

    // Verify attack belongs to this campaign and is unresolved
    $stmt = $db->prepare(
        'SELECT id, team_id, from_tile_id, to_tile_id, created_at
           FROM attacks
          WHERE id = ? AND campaign_id = ? AND resolved_at IS NULL'
    );
    $stmt->execute([$attackId, $campaignId]);
    $attack = $stmt->fetch();

    if (!$attack) {
        jsonResponse(['error' => 'Attack not found or already resolved'], 404);
    }

    // Players may only cancel attacks belonging to their own team
    if (!$isGm && (int)$attack['team_id'] !== $playerTeamId) {
        jsonResponse(['error' => 'You can only cancel your own team\'s attacks'], 403);
    }

    $outcome = $isGm ? 'resolved' : 'cancelled';

    $db->prepare('UPDATE attacks SET resolved_at = NOW() WHERE id = ?')
       ->execute([$attackId]);

    $db->prepare(
        'INSERT INTO attack_history (campaign_id, team_id, from_tile_id, to_tile_id, created_at, resolved_at, outcome)
         VALUES (?, ?, ?, ?, ?, NOW(), ?)'
    )->execute([
        $campaignId,
        $attack['team_id'],
        $attack['from_tile_id'],
        $attack['to_tile_id'],
        $attack['created_at'],
        $outcome,
    ]);

    jsonResponse(['ok' => true]);
}

// ── Team Assets ───────────────────────────────────────────────────────────────

/**
 * PUT /api/campaigns/:campaignId/teams/:teamId/assets
 * Body: { "Asset Name": 3, "Other Asset": 1, ... }
 * Full-replace: upserts provided assets and deletes any assets not in the body.
 * Requires GM role for the campaign.
 */
function handleUpdateTeamAssets(int $campaignId, int $teamId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();

    // Verify team belongs to campaign
    $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$teamId, $campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Team not found in this campaign'], 404);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    if (!is_array($body) || empty($body)) {
        jsonResponse(['error' => 'Request body must be a non-empty object of asset_name => score_value'], 400);
    }

    // Upsert each asset.
    // Use alias syntax (MySQL 8.0.20+) instead of deprecated VALUES() function.
    $upsert = $db->prepare(
        'INSERT INTO team_assets (team_id, asset_name, score_value)
         VALUES (?, ?, ?) AS new_val
         ON DUPLICATE KEY UPDATE score_value = new_val.score_value'
    );

    $assetNames = [];
    foreach ($body as $assetName => $scoreValue) {
        $assetNames[] = (string)$assetName;
        $upsert->execute([$teamId, (string)$assetName, (int)$scoreValue]);
    }

    // Delete assets not in the body (honour full PUT semantics).
    if (!empty($assetNames)) {
        $placeholders = implode(',', array_fill(0, count($assetNames), '?'));
        $params = array_merge([$teamId], $assetNames);
        $db->prepare(
            "DELETE FROM team_assets WHERE team_id = ? AND asset_name NOT IN ($placeholders)"
        )->execute($params);
    }

    jsonResponse(['ok' => true]);
}

// ── Tile CRUD ─────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/:campaignId/tiles
 * Body: { col, row, location_name?, resource_name?, color_override?, defense?, team_id? }
 * Creates a new tile. Requires GM role for the campaign.
 */
function handleCreateTile(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();

    // Verify campaign exists
    $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    if (!array_key_exists('col', $body) || !is_int($body['col']) ||
        !array_key_exists('row', $body) || !is_int($body['row'])) {
        jsonResponse(['error' => 'col and row are required integers'], 400);
    }
    $col = $body['col'];
    $row = $body['row'];

    $locationName = null;
    if (array_key_exists('location_name', $body) && $body['location_name'] !== null) {
        if (!is_string($body['location_name']) || mb_strlen($body['location_name']) > 255) {
            jsonResponse(['error' => 'location_name must be a string of max 255 characters'], 400);
        }
        $locationName = $body['location_name'];
    }

    $resourceName = null;
    if (array_key_exists('resource_name', $body) && $body['resource_name'] !== null) {
        $s = $db->prepare('SELECT name FROM resources WHERE name = ?');
        $s->execute([$body['resource_name']]);
        if (!$s->fetch()) {
            jsonResponse(['error' => 'resource_name not found in resources table'], 400);
        }
        $resourceName = $body['resource_name'];
    }

    $colorOverride = null;
    if (array_key_exists('color_override', $body) && $body['color_override'] !== null) {
        if (!is_string($body['color_override']) || !preg_match('/^#[0-9a-f]{6}$/i', $body['color_override'])) {
            jsonResponse(['error' => 'color_override must be in #rrggbb format'], 400);
        }
        $colorOverride = strtolower($body['color_override']);
    }

    $defense = 0;
    if (array_key_exists('defense', $body) && $body['defense'] !== null) {
        if (!is_int($body['defense']) || $body['defense'] < 0) {
            jsonResponse(['error' => 'defense must be a non-negative integer'], 400);
        }
        $defense = $body['defense'];
    }

    $teamId = null;
    if (array_key_exists('team_id', $body) && $body['team_id'] !== null) {
        $teamId = (int)$body['team_id'];
        $s = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
        $s->execute([$teamId, $campaignId]);
        if (!$s->fetch()) {
            jsonResponse(['error' => 'Team not found in this campaign'], 404);
        }
    }

    try {
        $stmt = $db->prepare(
            'INSERT INTO tiles
                (campaign_id, col, `row`, location_name, resource_name, color_override, defense, team_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$campaignId, $col, $row, $locationName, $resourceName, $colorOverride, $defense, $teamId]);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            jsonResponse(['error' => 'A tile already exists at this position'], 409);
        }
        throw $e;
    }

    jsonResponse(['id' => (int)$db->lastInsertId()], 201);
}

/**
 * DELETE /api/campaigns/:campaignId/tiles/:tileId
 * Deletes a tile. Blocked if referenced by attacks or attack_history.
 * Requires GM role for the campaign.
 */
function handleDeleteTile(int $campaignId, int $tileId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();

    $stmt = $db->prepare('SELECT id FROM tiles WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$tileId, $campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Tile not found'], 404);
    }

    // Check 1: unresolved attacks
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM attacks
          WHERE (from_tile_id = ? OR to_tile_id = ?) AND resolved_at IS NULL'
    );
    $stmt->execute([$tileId, $tileId]);
    $activeCount = (int)$stmt->fetchColumn();
    if ($activeCount > 0) {
        jsonResponse([
            'error' => "Tile has {$activeCount} active attack(s) referencing it. " .
                       'Resolve those attacks before deleting this tile.',
        ], 409);
    }

    // Check 2: attack history
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM attack_history WHERE from_tile_id = ? OR to_tile_id = ?'
    );
    $stmt->execute([$tileId, $tileId]);
    if ((int)$stmt->fetchColumn() > 0) {
        jsonResponse(['error' => 'This tile appears in attack history records and cannot be deleted.'], 409);
    }

    // tile_state_history rows cascade automatically via ON DELETE CASCADE
    $db->prepare('DELETE FROM tiles WHERE id = ?')->execute([$tileId]);

    jsonResponse(['ok' => true]);
}
