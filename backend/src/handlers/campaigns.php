<?php
// backend/src/handlers/campaigns.php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';

function handleListCampaigns(): void
{
    $db   = getDb();
    $rows = $db->query(
        'SELECT id, name, description, created_at, started_at, ended_at, is_active
           FROM campaigns
          ORDER BY created_at DESC'
    )->fetchAll();

    foreach ($rows as &$row) {
        $row['id']        = (int)$row['id'];
        $row['is_active'] = (bool)$row['is_active'];
    }

    jsonResponse($rows);
}

function handleGetCampaign(int $id): void
{
    $db   = getDb();
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

    $row['id']        = (int)$row['id'];
    $row['is_active'] = (bool)$row['is_active'];

    jsonResponse($row);
}

function handleListResources(): void
{
    $db   = getDb();
    $rows = $db->query(
        'SELECT name, display_name, description, icon_url
           FROM resources
          ORDER BY name'
    )->fetchAll();

    jsonResponse($rows);
}

function handleMapData(int $campaignId): void
{
    $db   = getDb();
    $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    // Teams
    $stmt = $db->prepare(
        'SELECT id, name, sprite_url, sprite_width, sprite_height, color, display_name
           FROM teams
          WHERE campaign_id = ?
          ORDER BY name'
    );
    $stmt->execute([$campaignId]);
    $teamRows = $stmt->fetchAll();

    // Team assets
    $stmt = $db->prepare(
        'SELECT ta.team_id, ta.asset_name, ta.score_value
           FROM team_assets ta
           JOIN teams t ON ta.team_id = t.id
          WHERE t.campaign_id = ?'
    );
    $stmt->execute([$campaignId]);
    $assetRows = $stmt->fetchAll();

    $assetsByTeam = [];
    foreach ($assetRows as $asset) {
        $tid = (int)$asset['team_id'];
        $assetsByTeam[$tid][$asset['asset_name']] = (int)$asset['score_value'];
    }

    $teamNameById = [];
    foreach ($teamRows as $row) {
        $teamNameById[(int)$row['id']] = $row['name'];
    }

    $teams = [];
    foreach ($teamRows as $row) {
        $id       = (int)$row['id'];
        $teams[] = [
            'name'         => $row['name'],
            'spriteUrl'    => $row['sprite_url'] ?? '',
            'spriteWidth'  => (int)($row['sprite_width'] ?? 0),
            'spriteHeight' => (int)($row['sprite_height'] ?? 0),
            'color'        => $row['color'],
            'displayName'  => $row['display_name'],
            'assets'       => $assetsByTeam[$id] ?? (object)[],
        ];
    }

    // Tiles
    $stmt = $db->prepare(
        'SELECT id, col, `row`, location_name, resource_name, terrain_rules_name,
                terrain_rules_url, team_id, color_override, defense
           FROM tiles
          WHERE campaign_id = ?
          ORDER BY col, `row`'
    );
    $stmt->execute([$campaignId]);
    $tileRows = $stmt->fetchAll();

    $tileCoordById = [];
    foreach ($tileRows as $row) {
        $tileCoordById[(int)$row['id']] = ['col' => (int)$row['col'], 'row' => (int)$row['row']];
    }

    $map = [];
    foreach ($tileRows as $row) {
        $tile = [
            'id'    => (int)$row['id'],
            'col'   => (int)$row['col'],
            'row'   => (int)$row['row'],
            'coord' => $row['col'] . ',' . $row['row'],
        ];
        if ($row['color_override'] !== null) $tile['colorOverride'] = $row['color_override'];
        if ($row['team_id'] !== null && isset($teamNameById[(int)$row['team_id']])) {
            $tile['team'] = $teamNameById[(int)$row['team_id']];
        }
        if ($row['resource_name'] !== null) $tile['resourceName'] = $row['resource_name'];
        if ($row['terrain_rules_name'] !== null && $row['terrain_rules_url'] !== null) {
            $tile['terrainRules'] = ['name' => $row['terrain_rules_name'], 'url' => $row['terrain_rules_url']];
        }
        if ($row['location_name'] !== null) $tile['locationName'] = $row['location_name'];
        $defense = (int)$row['defense'];
        if ($defense > 0) $tile['defence'] = $defense;
        $map[] = $tile;
    }

    // Attacks
    $stmt = $db->prepare(
        'SELECT id, team_id, from_tile_id, to_tile_id
           FROM attacks
          WHERE campaign_id = ?
            AND resolved_at IS NULL'
    );
    $stmt->execute([$campaignId]);
    $attackRows = $stmt->fetchAll();

    $attacks = [];
    foreach ($attackRows as $row) {
        $attacks[] = [
            'id'   => (int)$row['id'],
            'team' => $teamNameById[(int)$row['team_id']] ?? '',
            'from' => $tileCoordById[(int)$row['from_tile_id']] ?? ['col' => 0, 'row' => 0],
            'to'   => $tileCoordById[(int)$row['to_tile_id']] ?? ['col' => 0, 'row' => 0],
        ];
    }

    jsonResponse(['teams' => $teams, 'map' => $map, 'attacks' => $attacks]);
}
