<?php
// backend/src/handlers/admin.php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';

// ── Tiles ────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/campaigns/:campaignId/tiles/:tileId
 * Body: any subset of { "team_id", "location_name", "resource_name", "color_override", "defense" }
 * Updates tile fields dynamically and records history when team_id is present.
 * Requires GM role for the campaign.
 */
function handleUpdateTile(int $campaignId, int $tileId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $db   = getDb();

    // Verify tile belongs to this campaign
    $stmt = $db->prepare('SELECT id, team_id FROM tiles WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$tileId, $campaignId]);
    $tile = $stmt->fetch();
    if (!$tile) {
        jsonResponse(['error' => 'Tile not found'], 404);
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
 * Body: { "team_id": 3, "from_tile_id": 10, "to_tile_id": 11 }
 * Creates a new unresolved attack.
 * Requires GM role for the campaign.
 */
function handleCreateAttack(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    // Cast and validate — all three must be positive integers
    $teamId     = isset($body['team_id'])      && is_int($body['team_id'])      ? $body['team_id']      : 0;
    $fromTileId = isset($body['from_tile_id']) && is_int($body['from_tile_id']) ? $body['from_tile_id'] : 0;
    $toTileId   = isset($body['to_tile_id'])   && is_int($body['to_tile_id'])   ? $body['to_tile_id']   : 0;

    if ($teamId <= 0 || $fromTileId <= 0 || $toTileId <= 0) {
        jsonResponse(['error' => 'team_id, from_tile_id, and to_tile_id are required positive integers'], 400);
    }

    if ($fromTileId === $toTileId) {
        jsonResponse(['error' => 'from_tile_id and to_tile_id must differ'], 400);
    }

    $db = getDb();

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

    $stmt = $db->prepare(
        'INSERT INTO attacks (campaign_id, team_id, from_tile_id, to_tile_id) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$campaignId, $teamId, $fromTileId, $toTileId]);
    $attackId = (int)$db->lastInsertId();

    jsonResponse(['ok' => true, 'attack_id' => $attackId], 201);
}

/**
 * DELETE /api/campaigns/:campaignId/attacks/:attackId
 * Resolves an attack: sets resolved_at and records in attack_history.
 * Requires GM role for the campaign.
 */
function handleResolveAttack(int $campaignId, int $attackId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();

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
        'resolved',
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
