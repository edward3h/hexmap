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

// ── Team CRUD ─────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/:campaignId/teams
 * Body: { "name": "...", "display_name": "...", "color": "#rrggbb" } — all required.
 * Requires GM role.
 * Returns: 201 { "id": <new_team_id> }
 * 409 if name already taken in this campaign.
 */
function handleCreateTeam(int $campaignId): never
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

    $body        = json_decode(file_get_contents('php://input'), true) ?? [];
    $name        = trim((string)($body['name'] ?? ''));
    $displayName = trim((string)($body['display_name'] ?? ''));
    $color       = trim((string)($body['color'] ?? ''));

    if ($name === '' || $displayName === '' || $color === '') {
        jsonResponse(['error' => 'name, display_name, and color are required'], 400);
    }

    try {
        $stmt = $db->prepare(
            'INSERT INTO teams (campaign_id, name, display_name, color) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$campaignId, $name, $displayName, $color]);
    } catch (\PDOException $e) {
        // Duplicate name within campaign (UNIQUE constraint)
        if ($e->getCode() === '23000') {
            jsonResponse(['error' => 'Team name already exists in this campaign'], 409);
        }
        throw $e;
    }

    $teamId = (int)$db->lastInsertId();
    jsonResponse(['id' => $teamId], 201);
}

/**
 * PATCH /api/campaigns/:campaignId/teams/:teamId
 * Body: { "name": "...", "display_name": "...", "color": "#rrggbb" } — all optional.
 * Requires GM role.
 * 409 if name conflicts with an existing team in this campaign.
 */
function handleUpdateTeam(int $campaignId, int $teamId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();

    // Verify team belongs to this campaign
    $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$teamId, $campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Team not found in this campaign'], 404);
    }

    $body   = json_decode(file_get_contents('php://input'), true) ?? [];
    $fields = [];
    $params = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string)$body['name']);
        if ($name === '') jsonResponse(['error' => 'name must not be empty'], 400);
        $fields[] = 'name = ?';
        $params[]  = $name;
    }

    if (array_key_exists('display_name', $body)) {
        $displayName = trim((string)$body['display_name']);
        if ($displayName === '') jsonResponse(['error' => 'display_name must not be empty'], 400);
        $fields[] = 'display_name = ?';
        $params[]  = $displayName;
    }

    if (array_key_exists('color', $body)) {
        $fields[] = 'color = ?';
        $params[]  = (string)$body['color'];
    }

    if (empty($fields)) {
        jsonResponse(['error' => 'At least one field is required'], 400);
    }

    $params[] = $teamId;

    try {
        $db->prepare('UPDATE teams SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            jsonResponse(['error' => 'Team name already exists in this campaign'], 409);
        }
        throw $e;
    }

    jsonResponse(['ok' => true]);
}

/**
 * DELETE /api/campaigns/:campaignId/teams/:teamId
 * Requires GM role.
 * Tiles owned by this team will have team_id set to NULL (FK ON DELETE SET NULL).
 */
function handleDeleteTeam(int $campaignId, int $teamId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db = getDb();

    // Verify team belongs to this campaign
    $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$teamId, $campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Team not found in this campaign'], 404);
    }

    $db->prepare('DELETE FROM teams WHERE id = ?')->execute([$teamId]);
    jsonResponse(['ok' => true]);
}

// ── Users and Roles ───────────────────────────────────────────────────────────

/**
 * Fetch roles for a list of user IDs and attach them to user rows.
 * Returns the user rows augmented with a 'roles' key.
 *
 * @param array<array{id: string, email: string, display_name: string, avatar_url: string|null}> $users
 * @return array<array{id: int, email: string, display_name: string, avatar_url: string|null, roles: array}>
 */
function attachRolesToUsers(PDO $db, array $users): array
{
    if (empty($users)) return [];

    $ids = array_map(fn(array $u): int => (int)$u['id'], $users);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare(
        "SELECT user_id, role_type, campaign_id, team_id FROM user_roles WHERE user_id IN ($placeholders) ORDER BY user_id"
    );
    $stmt->execute($ids);

    $rolesByUser = [];
    foreach ($stmt->fetchAll() as $role) {
        $rolesByUser[(int)$role['user_id']][] = [
            'role_type'   => $role['role_type'],
            'campaign_id' => (int)$role['campaign_id'],
            'team_id'     => (int)$role['team_id'],
        ];
    }

    return array_map(function (array $u) use ($rolesByUser): array {
        return [
            'id'           => (int)$u['id'],
            'email'        => $u['email'],
            'display_name' => $u['display_name'],
            'avatar_url'   => $u['avatar_url'],
            'roles'        => $rolesByUser[(int)$u['id']] ?? [],
        ];
    }, $users);
}

/**
 * GET /api/users
 * Returns all users with their roles. Superuser only.
 */
function handleListUsers(): never
{
    $user = requireAuth();
    requireSuperuser($user);

    $db    = getDb();
    $users = $db->query('SELECT id, email, display_name, avatar_url FROM users ORDER BY display_name')->fetchAll();

    jsonResponse(attachRolesToUsers($db, $users));
}

/**
 * GET /api/users/search?q=<query>
 * Search users by email or display_name (LIKE %q%). Superuser only.
 * q must be at least 2 characters. Returns max 20 results.
 */
function handleSearchUsers(): never
{
    $user = requireAuth();
    requireSuperuser($user);

    $q = trim($_GET['q'] ?? '');
    if (mb_strlen($q) < 2) {
        jsonResponse(['error' => 'Search query must be at least 2 characters'], 400);
    }

    $db      = getDb();
    $pattern = '%' . $q . '%';
    $stmt    = $db->prepare(
        'SELECT id, email, display_name, avatar_url FROM users
          WHERE email LIKE ? OR display_name LIKE ?
          ORDER BY display_name
          LIMIT 20'
    );
    $stmt->execute([$pattern, $pattern]);
    $users = $stmt->fetchAll();

    jsonResponse(attachRolesToUsers($db, $users));
}

/**
 * GET /api/campaigns/:campaignId/gms
 * Returns list of GMs for the campaign. Requires GM or superuser.
 * Intentional asymmetry: listing GMs is accessible to any GM of the campaign
 * (so GMs can see their co-GMs), but add/remove is superuser-only.
 * Returns: [{ user_id, display_name, email }]
 */
function handleListCampaignGms(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db   = getDb();
    $stmt = $db->prepare(
        'SELECT u.id AS user_id, u.display_name, u.email
           FROM user_roles r
           JOIN users u ON r.user_id = u.id
          WHERE r.role_type = ? AND r.campaign_id = ?
          ORDER BY u.display_name'
    );
    $stmt->execute(['gm', $campaignId]);
    $rows = $stmt->fetchAll();

    $result = array_map(function (array $r): array {
        return [
            'user_id'      => (int)$r['user_id'],
            'display_name' => $r['display_name'],
            'email'        => $r['email'],
        ];
    }, $rows);

    jsonResponse($result);
}

/**
 * POST /api/campaigns/:campaignId/gms
 * Body: { "user_id": N }
 * Adds a GM role for the user in this campaign. Superuser only.
 * Idempotent: adding an existing GM returns 200 ok.
 */
function handleAddCampaignGm(int $campaignId): never
{
    $user = requireAuth();
    requireSuperuser($user);

    $db   = getDb();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $targetUserId = isset($body['user_id']) && is_int($body['user_id']) ? $body['user_id'] : 0;
    if ($targetUserId <= 0) {
        jsonResponse(['error' => 'user_id is required and must be a positive integer'], 400);
    }

    // Verify user exists
    $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
    $stmt->execute([$targetUserId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'User not found'], 404);
    }

    // Verify campaign exists
    $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    // INSERT IGNORE makes this idempotent (UNIQUE constraint: user_id, role_type, campaign_id, team_id)
    $db->prepare(
        'INSERT IGNORE INTO user_roles (user_id, role_type, campaign_id, team_id) VALUES (?, ?, ?, 0)'
    )->execute([$targetUserId, 'gm', $campaignId]);

    jsonResponse(['ok' => true]);
}

/**
 * DELETE /api/campaigns/:campaignId/gms/:userId
 * Removes the GM role for the user in this campaign. Superuser only.
 * No minimum-GM guard (intentional per spec): a superuser can remove all GMs
 * because superusers are always available as a management fallback.
 */
function handleRemoveCampaignGm(int $campaignId, int $targetUserId): never
{
    $user = requireAuth();
    requireSuperuser($user);

    $db   = getDb();
    $stmt = $db->prepare(
        'DELETE FROM user_roles WHERE user_id = ? AND role_type = ? AND campaign_id = ?'
    );
    $stmt->execute([$targetUserId, 'gm', $campaignId]);

    if ($stmt->rowCount() === 0) {
        jsonResponse(['error' => 'GM role not found for this user in this campaign'], 404);
    }

    jsonResponse(['ok' => true]);
}

// ── Player management ─────────────────────────────────────────────────────────

/**
 * GET /api/campaigns/:campaignId/players
 * Returns list of players for the campaign, grouped with their team_id.
 * Requires GM or superuser.
 * Returns: [{ user_id, display_name, email, team_id }]
 */
function handleListCampaignPlayers(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db   = getDb();
    $stmt = $db->prepare(
        'SELECT u.id AS user_id, u.display_name, u.email, r.team_id
           FROM user_roles r
           JOIN users u ON r.user_id = u.id
          WHERE r.role_type = ? AND r.campaign_id = ?
          ORDER BY r.team_id, u.display_name'
    );
    $stmt->execute(['player', $campaignId]);
    $rows = $stmt->fetchAll();

    $result = array_map(function (array $r): array {
        return [
            'user_id'      => (int)$r['user_id'],
            'display_name' => $r['display_name'],
            'email'        => $r['email'],
            'team_id'      => (int)$r['team_id'],
        ];
    }, $rows);

    jsonResponse($result);
}

/**
 * POST /api/campaigns/:campaignId/players
 * Body: { "user_id": N, "team_id": N }
 * Assigns a player role for the user in this campaign for a specific team.
 * Requires GM or superuser. Idempotent.
 */
function handleAddCampaignPlayer(int $campaignId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db   = getDb();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    $targetUserId = isset($body['user_id']) && is_int($body['user_id']) ? $body['user_id'] : 0;
    $teamId       = isset($body['team_id']) && is_int($body['team_id']) ? $body['team_id'] : 0;

    if ($targetUserId <= 0 || $teamId <= 0) {
        jsonResponse(['error' => 'user_id and team_id are required positive integers'], 400);
    }

    // Verify user exists
    $stmt = $db->prepare('SELECT id FROM users WHERE id = ?');
    $stmt->execute([$targetUserId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'User not found'], 404);
    }

    // Verify team belongs to campaign
    $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$teamId, $campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Team not found in this campaign'], 404);
    }

    // INSERT IGNORE makes this idempotent (UNIQUE constraint: user_id, role_type, campaign_id, team_id)
    $db->prepare(
        'INSERT IGNORE INTO user_roles (user_id, role_type, campaign_id, team_id) VALUES (?, ?, ?, ?)'
    )->execute([$targetUserId, 'player', $campaignId, $teamId]);

    jsonResponse(['ok' => true], 201);
}

/**
 * DELETE /api/campaigns/:campaignId/players/:userId
 * Removes the player role for the user in this campaign.
 * Requires GM or superuser.
 */
function handleRemoveCampaignPlayer(int $campaignId, int $targetUserId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $db   = getDb();
    $stmt = $db->prepare(
        'DELETE FROM user_roles WHERE user_id = ? AND role_type = ? AND campaign_id = ?'
    );
    $stmt->execute([$targetUserId, 'player', $campaignId]);

    if ($stmt->rowCount() === 0) {
        jsonResponse(['error' => 'Player role not found for this user in this campaign'], 404);
    }

    jsonResponse(['ok' => true]);
}
