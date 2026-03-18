<?php
// backend/src/handlers/campaign-management.php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns
 * Body: { "name": "...", "description": "..." }
 * Any authenticated user can create a campaign; creator is auto-assigned as GM.
 * Returns: 201 { "id": <new_campaign_id> }
 */
function handleCreateCampaign(): never
{
    $user = requireAuth();
    $db   = getDb();

    $body        = json_decode(file_get_contents('php://input'), true) ?? [];
    $name        = trim((string)($body['name'] ?? ''));
    $description = (string)($body['description'] ?? '');

    if ($name === '') {
        jsonResponse(['error' => 'name is required'], 400);
    }

    // NOTE: is_active is NOT specified here — the schema default is 1.
    // Per spec, "Not Started" state = started_at IS NULL, is_active = 1.
    // The started_at column (NULL) is what distinguishes Not Started from Active.
    $db->prepare('INSERT INTO campaigns (name, description) VALUES (?, ?)')->execute([$name, $description]);
    $campaignId = (int)$db->lastInsertId(); // Use this ID — not 0 — for the GM role below.

    // Auto-assign creator as GM for THIS campaign.
    // Sentinel convention: team_id=0 (GM is not scoped to a team), campaign_id=$campaignId.
    // campaign_id=0 would mean superuser scope — do NOT use 0 here.
    $db->prepare(
        'INSERT INTO user_roles (user_id, role_type, campaign_id, team_id) VALUES (?, ?, ?, 0)'
    )->execute([$user['id'], 'gm', $campaignId]);

    jsonResponse(['id' => $campaignId], 201);
}

/**
 * PATCH /api/campaigns/:campaignId
 * Body: { "name": "...", "description": "..." } — at least one required.
 * Requires GM role (or superuser).
 */
function handleUpdateCampaign(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db   = getDb();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $fields = [];
    $params = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string)$body['name']);
        if ($name === '') {
            jsonResponse(['error' => 'name must not be empty'], 400);
        }
        $fields[] = 'name = ?';
        $params[]  = $name;
    }

    if (array_key_exists('description', $body)) {
        $fields[] = 'description = ?';
        $params[]  = (string)$body['description'];
    }

    if (empty($fields)) {
        jsonResponse(['error' => 'At least one of name or description is required'], 400);
    }

    // Verify campaign exists
    $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    $params[] = $campaignId;
    $db->prepare('UPDATE campaigns SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    jsonResponse(['ok' => true]);
}

// ── Campaign Lifecycle ────────────────────────────────────────────────────────

/**
 * Fetch campaign state columns. Returns null if not found.
 *
 * @return array{started_at: string|null, ended_at: string|null, is_active: string}|null
 */
function fetchCampaignState(PDO $db, int $campaignId): ?array
{
    $stmt = $db->prepare('SELECT started_at, ended_at, is_active FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * POST /api/campaigns/:campaignId/start
 * Transition: Not started → Active.
 * Sets started_at = NOW(), is_active = 1.
 * 409 if already started.
 */
function handleStartCampaign(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db  = getDb();
    $row = fetchCampaignState($db, $campaignId);
    if (!$row) jsonResponse(['error' => 'Campaign not found'], 404);

    if ($row['started_at'] !== null) {
        jsonResponse(['error' => 'Campaign has already been started'], 409);
    }

    $db->prepare('UPDATE campaigns SET started_at = NOW(), is_active = 1 WHERE id = ?')->execute([$campaignId]);
    jsonResponse(['ok' => true]);
}

/**
 * POST /api/campaigns/:campaignId/pause
 * Transition: Active → Paused.
 * Sets is_active = 0.
 * 409 if not currently active.
 */
function handlePauseCampaign(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db  = getDb();
    $row = fetchCampaignState($db, $campaignId);
    if (!$row) jsonResponse(['error' => 'Campaign not found'], 404);

    if ($row['started_at'] === null || $row['ended_at'] !== null || (int)$row['is_active'] !== 1) {
        jsonResponse(['error' => 'Campaign is not currently active'], 409);
    }

    $db->prepare('UPDATE campaigns SET is_active = 0 WHERE id = ?')->execute([$campaignId]);
    jsonResponse(['ok' => true]);
}

/**
 * POST /api/campaigns/:campaignId/resume
 * Transition: Paused → Active.
 * Sets is_active = 1.
 * 409 if not currently paused.
 */
function handleResumeCampaign(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db  = getDb();
    $row = fetchCampaignState($db, $campaignId);
    if (!$row) jsonResponse(['error' => 'Campaign not found'], 404);

    if ($row['started_at'] === null || $row['ended_at'] !== null || (int)$row['is_active'] !== 0) {
        jsonResponse(['error' => 'Campaign is not currently paused'], 409);
    }

    $db->prepare('UPDATE campaigns SET is_active = 1 WHERE id = ?')->execute([$campaignId]);
    jsonResponse(['ok' => true]);
}

/**
 * POST /api/campaigns/:campaignId/end
 * Transition: Active or Paused → Ended.
 * Sets ended_at = NOW(), is_active = 0.
 * 409 if already ended.
 */
function handleEndCampaign(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db  = getDb();
    $row = fetchCampaignState($db, $campaignId);
    if (!$row) jsonResponse(['error' => 'Campaign not found'], 404);

    if ($row['ended_at'] !== null) {
        jsonResponse(['error' => 'Campaign has already ended'], 409);
    }

    if ($row['started_at'] === null) {
        jsonResponse(['error' => 'Campaign has not been started yet'], 409);
    }

    $db->prepare('UPDATE campaigns SET ended_at = NOW(), is_active = 0 WHERE id = ?')->execute([$campaignId]);
    jsonResponse(['ok' => true]);
}
