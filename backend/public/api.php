<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/db.php';

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

$method = $_SERVER['REQUEST_METHOD'];
$uri = $_SERVER['REQUEST_URI'];

// Strip query string
$path = parse_url($uri, PHP_URL_PATH);

// Remove trailing slash (except root)
$path = rtrim($path, '/');

// Simple pattern matching
if ($method === 'GET' && $path === '/api/campaigns') {
    handleListCampaigns();
} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/map-data$#', $path, $m)) {
    handleMapData((int)$m[1]);
} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)$#', $path, $m)) {
    handleGetCampaign((int)$m[1]);
} elseif ($method === 'GET' && $path === '/api/resources') {
    handleListResources();
} elseif ($method === 'GET' && $path === '/api/health') {
    jsonResponse(['status' => 'ok']);
} else {
    jsonResponse(['error' => 'Not found'], 404);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleListCampaigns(): void
{
    $db = getDb();
    $rows = $db->query(
        'SELECT id, name, description, created_at, started_at, ended_at, is_active
         FROM campaigns
         ORDER BY created_at DESC'
    )->fetchAll();

    // Cast types
    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
        $row['is_active'] = (bool)$row['is_active'];
    }

    jsonResponse($rows);
}

function handleGetCampaign(int $id): void
{
    $db = getDb();
    $stmt = $db->prepare(
        'SELECT id, name, description, created_at, started_at, ended_at, is_active
         FROM campaigns
         WHERE id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    $row['id'] = (int)$row['id'];
    $row['is_active'] = (bool)$row['is_active'];

    jsonResponse($row);
}

function handleListResources(): void
{
    $db = getDb();
    $rows = $db->query(
        'SELECT name, display_name, description, icon_url
         FROM resources
         ORDER BY name'
    )->fetchAll();

    jsonResponse($rows);
}

function handleMapData(int $campaignId): void
{
    $db = getDb();

    // Verify campaign exists
    $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    // ---- Teams ----
    $stmt = $db->prepare(
        'SELECT id, name, sprite_url, sprite_width, sprite_height, color, display_name
         FROM teams
         WHERE campaign_id = ?
         ORDER BY name'
    );
    $stmt->execute([$campaignId]);
    $teamRows = $stmt->fetchAll();

    // ---- Team assets ----
    $stmt = $db->prepare(
        'SELECT ta.team_id, ta.asset_name, ta.score_value
         FROM team_assets ta
         JOIN teams t ON ta.team_id = t.id
         WHERE t.campaign_id = ?'
    );
    $stmt->execute([$campaignId]);
    $assetRows = $stmt->fetchAll();

    // Build assets lookup by team_id
    $assetsByTeam = [];
    foreach ($assetRows as $asset) {
        $teamId = (int)$asset['team_id'];
        $assetsByTeam[$teamId][$asset['asset_name']] = (int)$asset['score_value'];
    }

    // Build team name lookup by ID
    $teamNameById = [];
    foreach ($teamRows as $row) {
        $teamNameById[(int)$row['id']] = $row['name'];
    }

    // Transform to frontend Team format
    $teams = [];
    foreach ($teamRows as $row) {
        $id = (int)$row['id'];
        $teams[] = [
            'name' => $row['name'],
            'spriteUrl' => $row['sprite_url'] ?? '',
            'spriteWidth' => (int)($row['sprite_width'] ?? 0),
            'spriteHeight' => (int)($row['sprite_height'] ?? 0),
            'color' => $row['color'],
            'displayName' => $row['display_name'],
            'assets' => $assetsByTeam[$id] ?? (object)[],
        ];
    }

    // ---- Tiles ----
    $stmt = $db->prepare(
        'SELECT id, col, `row`, location_name, resource_name, terrain_rules_name,
                terrain_rules_url, team_id, color_override, defense
         FROM tiles
         WHERE campaign_id = ?
         ORDER BY col, `row`'
    );
    $stmt->execute([$campaignId]);
    $tileRows = $stmt->fetchAll();

    // Build tile coordinate lookup for attacks
    $tileCoordById = [];
    foreach ($tileRows as $row) {
        $tileCoordById[(int)$row['id']] = [
            'col' => (int)$row['col'],
            'row' => (int)$row['row'],
        ];
    }

    // Transform to frontend TileData format
    $map = [];
    foreach ($tileRows as $row) {
        $tile = [
            'col' => (int)$row['col'],
            'row' => (int)$row['row'],
            'coord' => $row['col'] . ',' . $row['row'],
        ];

        if ($row['color_override'] !== null) {
            $tile['colorOverride'] = $row['color_override'];
        }

        if ($row['team_id'] !== null) {
            $teamId = (int)$row['team_id'];
            if (isset($teamNameById[$teamId])) {
                $tile['team'] = $teamNameById[$teamId];
            }
        }

        if ($row['resource_name'] !== null) {
            $tile['resourceName'] = $row['resource_name'];
        }

        if ($row['terrain_rules_name'] !== null && $row['terrain_rules_url'] !== null) {
            $tile['terrainRules'] = [
                'name' => $row['terrain_rules_name'],
                'url' => $row['terrain_rules_url'],
            ];
        }

        if ($row['location_name'] !== null) {
            $tile['locationName'] = $row['location_name'];
        }

        $defense = (int)$row['defense'];
        if ($defense > 0) {
            $tile['defence'] = $defense;
        }

        $map[] = $tile;
    }

    // ---- Attacks ----
    $stmt = $db->prepare(
        'SELECT team_id, from_tile_id, to_tile_id
         FROM attacks
         WHERE campaign_id = ?
           AND resolved_at IS NULL'
    );
    $stmt->execute([$campaignId]);
    $attackRows = $stmt->fetchAll();

    $attacks = [];
    foreach ($attackRows as $row) {
        $teamId = (int)$row['team_id'];
        $fromId = (int)$row['from_tile_id'];
        $toId = (int)$row['to_tile_id'];

        $attacks[] = [
            'team' => $teamNameById[$teamId] ?? '',
            'from' => $tileCoordById[$fromId] ?? ['col' => 0, 'row' => 0],
            'to' => $tileCoordById[$toId] ?? ['col' => 0, 'row' => 0],
        ];
    }

    jsonResponse([
        'teams' => $teams,
        'map' => $map,
        'attacks' => $attacks,
    ]);
}
