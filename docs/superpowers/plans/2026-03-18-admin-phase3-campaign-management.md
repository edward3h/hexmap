# Admin Phase 3 — Campaign Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign creation/editing, lifecycle management (Start/Pause/Resume/End), team CRUD, and GM role assignment to the Hexmap admin SPA.

**Architecture:** New PHP handler file `campaign-management.php` for all Phase 3 write operations, keeping `admin.php` focused on Phase 2 in-game GM actions. TypeScript frontend adds two new page files (`campaign-form.ts`, `users.ts`) and extends `campaign.ts` with lifecycle, team management, and GM sections.

**Tech Stack:** PHP 8 + MySQL (backend), Vite + TypeScript strict mode (frontend), existing `requireAuth()`/`requireGm()`/`requireSuperuser()` middleware in `backend/src/middleware.php`.

---

## Key Conventions (read before implementing)

- **PHP handlers:** Every handler calls `requireAuth()` first, then the appropriate role check. All handlers are `never`-returning (call `jsonResponse()` which calls `exit`).
- **Route ordering in api.php:** More-specific paths come before less-specific. `PATCH /api/campaigns/:id` is a separate branch from `GET /api/campaigns/:id` — method differs, no conflict.
- **TypeScript:** Strict mode. Use `esc()` from `./utils` for any user content injected into innerHTML. Pattern for async event handlers: `void promise.catch(...)`.
- **Reload pattern:** After mutating state (attacks, lifecycle, teams, GMs), call `reload()` (the `render()` closure) to re-fetch all data and rebuild the page in place.
- **Error display:** Inline `<span>` elements, no `alert()` for non-attack editors (existing attack editor already uses `alert()` — leave it as-is; new sections should use inline errors).
- **DB sentinel:** `user_roles.team_id = 0` for GM roles (not scoped to a team). `campaign_id = 0` for superuser roles.

---

## File Map

**New files:**

- `backend/src/handlers/campaign-management.php` — campaign CRUD + lifecycle, team CRUD, user/role handlers
- `src/admin/campaign-form.ts` — create-campaign form page at `/admin/campaigns/new`
- `src/admin/users.ts` — user management page at `/admin/users`

**Modified files:**

- `backend/public/api.php` — add 14 new routes
- `src/admin/types.ts` — add `AdminGm` interface
- `src/admin/campaign.ts` — extend `loadData()`, add lifecycle/settings/team/GM sections
- `src/admin/index.ts` — add `/admin/campaigns/new` and `/admin/users` routes

---

## Chunk 1: PHP Backend

### Task 1: Campaign handlers (create, update, lifecycle)

**Files:**

- Create: `backend/src/handlers/campaign-management.php`

- [ ] **Step 1: Create the file with campaign create, update, and lifecycle handlers**

```php
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
```

- [ ] **Step 2: Verify PHP syntax**

```bash
cd /path/to/hexmap/backend && php -l src/handlers/campaign-management.php
```

Expected: `No syntax errors detected in src/handlers/campaign-management.php`

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/campaign-management.php
git commit -m "feat: add campaign CRUD and lifecycle handlers"
```

---

### Task 2: Team handlers (create, update, delete)

**Files:**

- Modify: `backend/src/handlers/campaign-management.php` (append)

- [ ] **Step 1: Append team handlers to campaign-management.php**

Add these functions at the end of the file:

```php
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
```

- [ ] **Step 2: Verify PHP syntax**

```bash
cd /path/to/hexmap/backend && php -l src/handlers/campaign-management.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/campaign-management.php
git commit -m "feat: add team CRUD handlers"
```

---

### Task 3: User and role handlers

**Files:**

- Modify: `backend/src/handlers/campaign-management.php` (append)

- [ ] **Step 1: Append user and role handlers to campaign-management.php**

```php
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
```

- [ ] **Step 2: Verify PHP syntax**

```bash
cd /path/to/hexmap/backend && php -l src/handlers/campaign-management.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/campaign-management.php
git commit -m "feat: add user list, search, and GM role handlers"
```

---

### Task 4: Wire routes in api.php + smoke test

**Files:**

- Modify: `backend/public/api.php`

- [ ] **Step 1: Add 14 new routes to api.php**

Find the existing `PUT /api/campaigns/:id/teams/:teamId/assets` block — it is the last route before the health check:

```php
} elseif ($method === 'PUT' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/assets$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTeamAssets((int)$m[1], (int)$m[2]);

} elseif ($method === 'GET' && $path === '/api/health') {
```

Insert all 14 new routes **between** those two blocks (i.e., after `handleUpdateTeamAssets` and before `GET /api/health`). The result should look like:

```php
} elseif ($method === 'PUT' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/assets$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTeamAssets((int)$m[1], (int)$m[2]);

// ── Campaign management routes (auth protected) ──────────────────────────────
} elseif (...new routes...) {
    ...
} elseif ($method === 'GET' && $path === '/api/health') {
    jsonResponse(['status' => 'ok']);
```

The complete set of new elseif blocks to insert:

```php
// ── Campaign management routes (auth protected) ──────────────────────────────
} elseif ($method === 'POST' && $path === '/api/campaigns') {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleCreateCampaign();

} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleUpdateCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/start$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleStartCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/pause$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handlePauseCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/resume$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleResumeCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/end$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleEndCampaign((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/teams$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleCreateTeam((int)$m[1]);

} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleUpdateTeam((int)$m[1], (int)$m[2]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleDeleteTeam((int)$m[1], (int)$m[2]);

} elseif ($method === 'GET' && $path === '/api/users') {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleListUsers();

} elseif ($method === 'GET' && $path === '/api/users/search') {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleSearchUsers();

} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/gms$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleListCampaignGms((int)$m[1]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/gms$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleAddCampaignGm((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/gms/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaign-management.php';
    handleRemoveCampaignGm((int)$m[1], (int)$m[2]);
```

- [ ] **Step 2: Verify PHP syntax**

```bash
cd /path/to/hexmap/backend && php -l public/api.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Ensure Docker is running and smoke-test existing routes still work**

```bash
cd backend && docker-compose up -d
# Wait for healthy, then:
curl http://localhost:8080/api/health
# Expected: {"status":"ok"}

curl http://localhost:8080/api/campaigns
# Expected: JSON array of campaigns

curl http://localhost:8080/api/campaigns/1
# Expected: single campaign object

# Check new route is wired (should get 401, not 404)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/campaigns \
  -H "Content-Type: application/json" -d '{"name":"Test"}'
# Expected: 401 (Unauthorised — no token — proves route is reached)

# Check lifecycle route (should get 401, not 404)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/campaigns/1/start
# Expected: 401

# Check users route (should get 401, not 404)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/users
# Expected: 401

# Check search route (should get 401, not 404)
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080/api/users/search?q=test"
# Expected: 401

# Check GMs route (should get 401, not 404)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/campaigns/1/gms
# Expected: 401
```

- [ ] **Step 4: Commit**

```bash
git add backend/public/api.php
git commit -m "feat: wire campaign management routes into api.php router"
```

---

## Chunk 2: TypeScript Frontend

### Task 5: Add AdminGm to types.ts

**Files:**

- Modify: `src/admin/types.ts`

- [ ] **Step 1: Append AdminGm interface to types.ts**

Add at the end of `src/admin/types.ts`:

```typescript
// user_id (not id) is intentional — distinguishes this projection from AdminUser.id
// at the call site. AdminGm is only used for the GMs-list endpoint response.
export interface AdminGm {
  user_id: number;
  display_name: string;
  email: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/types.ts
git commit -m "feat: add AdminGm type to admin types"
```

---

### Task 6: Create campaign-form.ts

**Files:**

- Create: `src/admin/campaign-form.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/admin/campaign-form.ts
// Create-campaign form page at /admin/campaigns/new.

import { api, ApiError } from './api';
import { esc } from './utils';

export function renderCampaignForm(container: HTMLElement): void {
  container.innerHTML = `
    <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;align-items:center;gap:16px">
      <a href="/admin" style="color:#7ab3f0">← Campaigns</a>
      <strong>New Campaign</strong>
    </header>
    <main style="padding:24px;max-width:600px">
      <form id="campaign-form" style="display:flex;flex-direction:column;gap:16px">
        <label style="display:flex;flex-direction:column;gap:4px">
          Name <span style="color:#f87171;font-size:0.85em">*</span>
          <input id="cf-name" type="text" required
            style="padding:8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:4px;font-size:1em">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">
          Description
          <textarea id="cf-desc" rows="4"
            style="padding:8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:4px;font-size:1em;resize:vertical"></textarea>
        </label>
        <div style="display:flex;align-items:center;gap:16px">
          <button type="submit" id="cf-submit"
            style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:1em">
            Create Campaign
          </button>
          <span id="cf-error" style="color:#f87171;font-size:0.9em"></span>
        </div>
      </form>
    </main>
  `;

  const form = document.getElementById('campaign-form') as HTMLFormElement;
  const nameInput = document.getElementById('cf-name') as HTMLInputElement;
  const descInput = document.getElementById('cf-desc') as HTMLTextAreaElement;
  const submitBtn = document.getElementById('cf-submit') as HTMLButtonElement;
  const errorEl = document.getElementById('cf-error') as HTMLSpanElement;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;

    void api
      .post<{ id: number }>('/campaigns', {
        name: nameInput.value.trim(),
        description: descInput.value,
      })
      .then(({ id }) => {
        window.location.href = `/admin/campaigns/${id}`;
      })
      .catch((err: unknown) => {
        errorEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
        submitBtn.disabled = false;
      });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles and lints**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
npm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign-form.ts
git commit -m "feat: add create-campaign form page"
```

---

### Task 7: Extend campaign.ts — loadData, lifecycle section, campaign settings

**Files:**

- Modify: `src/admin/campaign.ts`

This task extends `loadData()` to fetch the current user and GMs list, adds `getCampaignState()`, adds `renderLifecycle()`, adds `renderCampaignSettings()`, and wires them into `render()`.

- [ ] **Step 1: Update the imports at the top of campaign.ts**

Replace the existing import line:

```typescript
import { AdminAttack, AdminCampaign, AdminMapData } from './types';
```

with:

```typescript
import { AdminAttack, AdminCampaign, AdminGm, AdminMapData, AdminUser } from './types';
```

- [ ] **Step 2: Update the CampaignDetailData interface and loadData function**

> **Important:** The `CampaignDetailData` interface and `loadData` function are tightly coupled — the interface declares the shape that `loadData` returns. Both must be replaced in the same edit; editing one without the other will cause TypeScript type errors.

Replace the existing `CampaignDetailData` interface and `loadData` function:

```typescript
interface CampaignDetailData {
  campaign: AdminCampaign;
  mapData: AdminMapData;
  teams: CampaignTeam[];
  gms: AdminGm[];
  currentUser: AdminUser;
}

async function loadData(campaignId: number): Promise<CampaignDetailData> {
  const [campaign, mapData, teams, gms, currentUser] = await Promise.all([
    api.get<AdminCampaign>(`/campaigns/${campaignId}`),
    api.get<AdminMapData>(`/campaigns/${campaignId}/map-data`),
    api.get<CampaignTeam[]>(`/campaigns/${campaignId}/teams`),
    api.get<AdminGm[]>(`/campaigns/${campaignId}/gms`),
    api.get<AdminUser>('/auth/me'),
  ]);
  return { campaign, mapData, teams, gms, currentUser };
}
```

- [ ] **Step 3: Add getCampaignState helper and renderLifecycle function**

Add these after the `loadData` function:

```typescript
type CampaignState = 'not_started' | 'active' | 'paused' | 'ended';

function getCampaignState(campaign: AdminCampaign): CampaignState {
  if (campaign.ended_at) return 'ended';
  if (!campaign.started_at) return 'not_started';
  if (campaign.is_active) return 'active';
  return 'paused';
}

function renderLifecycle(
  container: HTMLElement,
  campaign: AdminCampaign,
  campaignId: number,
  reload: () => void,
): void {
  const state = getCampaignState(campaign);
  const stateLabel: Record<CampaignState, string> = {
    not_started: 'Not Started',
    active: 'Active',
    paused: 'Paused',
    ended: 'Ended',
  };
  const stateColor: Record<CampaignState, string> = {
    not_started: '#888',
    active: '#4ade80',
    paused: '#fbbf24',
    ended: '#888',
  };

  interface ActionButton {
    label: string;
    action: string;
    bg: string;
  }
  const buttons: ActionButton[] = [];
  if (state === 'not_started')
    buttons.push({ label: 'Start', action: 'start', bg: '#166534' });
  if (state === 'active') {
    buttons.push({ label: 'Pause', action: 'pause', bg: '#92400e' });
    buttons.push({ label: 'End Campaign', action: 'end', bg: '#7f1d1d' });
  }
  if (state === 'paused') {
    buttons.push({ label: 'Resume', action: 'resume', bg: '#1d4ed8' });
    buttons.push({ label: 'End Campaign', action: 'end', bg: '#7f1d1d' });
  }

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Campaign Status</h3>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-weight:600;color:${stateColor[state]}">${stateLabel[state]}</span>
      ${buttons
        .map(
          (b) =>
            `<button data-action="${b.action}"
               style="padding:6px 14px;color:white;border:none;border-radius:3px;cursor:pointer;background:${
                 b.bg
               }">
               ${esc(b.label)}
             </button>`,
        )
        .join('')}
      <span id="lifecycle-error" style="color:#f87171;font-size:0.9em"></span>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset['action']!;
      const errEl = document.getElementById('lifecycle-error');
      if (errEl) errEl.textContent = '';
      btn.disabled = true;
      void api
        .post(`/campaigns/${campaignId}/${action}`, {})
        .then(() => reload())
        .catch((err: unknown) => {
          if (errEl)
            errEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
          btn.disabled = false;
        });
    });
  });
}

function renderCampaignSettings(
  container: HTMLElement,
  campaign: AdminCampaign,
  campaignId: number,
  reload: () => void,
): void {
  container.innerHTML = `
    <h3 style="margin:0 0 12px">Campaign Settings</h3>
    <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:0.9em">
        Name
        <input id="cs-name" type="text" value="${esc(campaign.name)}"
          style="padding:6px 8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:0.9em">
        Description
        <textarea id="cs-desc" rows="3"
          style="padding:6px 8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px;resize:vertical">${esc(
            campaign.description ?? '',
          )}</textarea>
      </label>
      <div style="display:flex;align-items:center;gap:12px">
        <button id="cs-save"
          style="padding:6px 16px;background:#444;color:white;border:none;border-radius:3px;cursor:pointer">
          Save
        </button>
        <span id="cs-feedback" style="font-size:0.9em"></span>
      </div>
    </div>
  `;

  document.getElementById('cs-save')?.addEventListener('click', () => {
    const nameVal = (document.getElementById('cs-name') as HTMLInputElement).value.trim();
    const descVal = (document.getElementById('cs-desc') as HTMLTextAreaElement).value;
    const feedback = document.getElementById('cs-feedback')!;
    const saveBtn = document.getElementById('cs-save') as HTMLButtonElement;

    if (!nameVal) {
      feedback.style.color = '#f87171';
      feedback.textContent = 'Name is required.';
      return;
    }

    saveBtn.disabled = true;
    feedback.textContent = '';

    void api
      .patch(`/campaigns/${campaignId}`, { name: nameVal, description: descVal })
      .then(() => reload())
      .catch((err: unknown) => {
        feedback.style.color = '#f87171';
        feedback.textContent = esc(err instanceof ApiError ? err.message : String(err));
        saveBtn.disabled = false;
      });
  });
}
```

- [ ] **Step 4: Update render() in renderCampaignDetail to use new data and add new sections**

In `renderCampaignDetail`, update the `render()` closure. Replace the destructuring line:

```typescript
const { campaign, mapData, teams } = await loadData(campaignId);
```

with:

```typescript
const { campaign, mapData, teams, gms, currentUser } = await loadData(campaignId);
```

Replace the header status span (the `campaign.is_active ? 'Active' : 'Inactive'` part) with the state label. Replace:

```typescript
<span
  style="font-size:0.85em;color:${
            campaign.is_active ? '#4ade80' : '#888'
          }"
>
  ${campaign.is_active ? 'Active' : 'Inactive'}
</span>
```

with:

```typescript
<span
  style="font-size:0.85em;color:${
            campaign.ended_at ? '#888' : campaign.started_at && campaign.is_active ? '#4ade80' : campaign.started_at ? '#fbbf24' : '#888'
          }"
>
  $
  {campaign.ended_at
    ? 'Ended'
    : campaign.started_at && campaign.is_active
    ? 'Active'
    : campaign.started_at
    ? 'Paused'
    : 'Not Started'}
</span>
```

Add new section placeholders to the main grid. Replace:

```typescript
<main style="padding:24px;max-width:900px;display:grid;gap:32px">
  <section id="section-tiles"></section>
  <section id="section-attacks"></section>
  <section id="section-assets"></section>
</main>
```

with:

```typescript
<main style="padding:24px;max-width:900px;display:grid;gap:32px">
  <section id="section-lifecycle"></section>
  <section id="section-settings"></section>
  <section id="section-tiles"></section>
  <section id="section-attacks"></section>
  <section id="section-assets"></section>
  <section id="section-teams"></section>
  <section id="section-gms"></section>
</main>
```

Add calls to render the new sections after the existing `renderAssetEditor(...)` call:

```typescript
const isSuperuser = currentUser.roles.some((r) => r.role_type === 'superuser');

renderLifecycle(
  document.getElementById('section-lifecycle')!,
  campaign,
  campaignId,
  () => void render(),
);
renderCampaignSettings(
  document.getElementById('section-settings')!,
  campaign,
  campaignId,
  () => void render(),
);
renderTeamManager(
  document.getElementById('section-teams')!,
  teams,
  campaignId,
  () => void render(),
);
if (isSuperuser) {
  renderGmManager(
    document.getElementById('section-gms')!,
    gms,
    campaignId,
    () => void render(),
  );
}
```

Note: `renderTeamManager` and `renderGmManager` will be implemented in Tasks 8 and 9. Add stub implementations now so the code compiles:

```typescript
function renderTeamManager(
  _container: HTMLElement,
  _teams: CampaignTeam[],
  _campaignId: number,
  _reload: () => void,
): void {
  _container.innerHTML =
    '<p style="color:#888;font-size:0.9em">Team management coming soon…</p>';
}

function renderGmManager(
  _container: HTMLElement,
  _gms: AdminGm[],
  _campaignId: number,
  _reload: () => void,
): void {
  _container.innerHTML =
    '<p style="color:#888;font-size:0.9em">GM management coming soon…</p>';
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Expected: no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: extend campaign detail with lifecycle and settings sections"
```

---

### Task 8: Add team management section to campaign.ts

**Files:**

- Modify: `src/admin/campaign.ts`

- [ ] **Step 1: Replace the renderTeamManager stub with the full implementation**

Replace the stub `renderTeamManager` function with:

```typescript
function renderTeamManager(
  container: HTMLElement,
  teams: CampaignTeam[],
  campaignId: number,
  reload: () => void,
): void {
  const teamRows = teams
    .map(
      (t) => `
    <tr data-team-id="${t.id}">
      <td style="padding:6px 8px">
        <span class="team-view">${esc(t.name)}</span>
        <input class="team-edit-name" type="text" value="${esc(t.name)}"
          style="display:none;background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 6px;border-radius:3px;width:120px">
      </td>
      <td style="padding:6px 8px">
        <span class="team-view">${esc(t.display_name)}</span>
        <input class="team-edit-display" type="text" value="${esc(t.display_name)}"
          style="display:none;background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 6px;border-radius:3px;width:140px">
      </td>
      <td style="padding:6px 8px">
        <span class="team-view" style="display:inline-flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${esc(
            t.color,
          )}"></span>
          ${esc(t.color)}
        </span>
        <input class="team-edit-color" type="color" value="${esc(t.color)}"
          style="display:none;width:48px;height:28px;border:none;background:none;cursor:pointer">
      </td>
      <td style="padding:6px 8px;white-space:nowrap">
        <span class="team-view">
          <button class="team-edit-btn" style="padding:2px 8px;cursor:pointer;margin-right:4px">Edit</button>
          <button class="team-delete-btn" style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">Delete</button>
        </span>
        <span class="team-editing" style="display:none">
          <button class="team-save-btn" style="padding:2px 8px;cursor:pointer;background:#166534;color:white;border:none;border-radius:3px;margin-right:4px">Save</button>
          <button class="team-cancel-btn" style="padding:2px 8px;cursor:pointer">Cancel</button>
          <span class="team-edit-error" style="color:#f87171;font-size:0.85em;margin-left:6px"></span>
        </span>
        <span class="team-confirm-delete" style="display:none">
          Delete? <button class="team-confirm-btn" style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px;margin:0 4px">Confirm</button>
          <button class="team-cancel-delete-btn" style="padding:2px 8px;cursor:pointer">Cancel</button>
        </span>
      </td>
    </tr>`,
    )
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Teams</h3>
    <table style="width:100%;border-collapse:collapse;font-size:0.9em;margin-bottom:16px">
      <thead>
        <tr style="border-bottom:1px solid #444;text-align:left">
          <th style="padding:6px 8px">Name</th>
          <th style="padding:6px 8px">Display Name</th>
          <th style="padding:6px 8px">Colour</th>
          <th style="padding:6px 8px"></th>
        </tr>
      </thead>
      <tbody>${teamRows}</tbody>
    </table>
    <details>
      <summary style="cursor:pointer;color:#7ab3f0;margin-bottom:8px">+ Add team</summary>
      <div style="display:flex;flex-direction:column;gap:8px;max-width:400px;margin-top:8px">
        <input id="new-team-name" type="text" placeholder="Name (unique)"
          style="padding:6px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
        <input id="new-team-display" type="text" placeholder="Display name"
          style="padding:6px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.9em">
          Colour <input id="new-team-color" type="color" value="#888888"
            style="width:48px;height:28px;border:none;background:none;cursor:pointer">
        </label>
        <div style="display:flex;align-items:center;gap:12px">
          <button id="new-team-submit"
            style="padding:6px 14px;background:#1d4ed8;color:white;border:none;border-radius:3px;cursor:pointer">
            Create Team
          </button>
          <span id="new-team-error" style="color:#f87171;font-size:0.85em"></span>
        </div>
      </div>
    </details>
  `;

  // Edit / cancel / save per row
  container.querySelectorAll<HTMLTableRowElement>('tr[data-team-id]').forEach((row) => {
    const teamId = Number(row.dataset['teamId']);
    const viewEls = row.querySelectorAll<HTMLElement>('.team-view');
    const editingEl = row.querySelector<HTMLElement>('.team-editing')!;
    const confirmDeleteEl = row.querySelector<HTMLElement>('.team-confirm-delete')!;

    const showEdit = (): void => {
      viewEls.forEach((el) => (el.style.display = 'none'));
      editingEl.style.display = 'inline';
      row
        .querySelectorAll<HTMLInputElement>(
          '.team-edit-name,.team-edit-display,.team-edit-color',
        )
        .forEach((inp) => (inp.style.display = 'inline-block'));
    };
    const hideEdit = (): void => {
      viewEls.forEach((el) => (el.style.display = ''));
      editingEl.style.display = 'none';
      row
        .querySelectorAll<HTMLInputElement>(
          '.team-edit-name,.team-edit-display,.team-edit-color',
        )
        .forEach((inp) => (inp.style.display = 'none'));
    };

    row.querySelector('.team-edit-btn')?.addEventListener('click', showEdit);
    row.querySelector('.team-cancel-btn')?.addEventListener('click', hideEdit);

    row.querySelector('.team-save-btn')?.addEventListener('click', () => {
      const nameVal = (
        row.querySelector('.team-edit-name') as HTMLInputElement
      ).value.trim();
      const displayVal = (
        row.querySelector('.team-edit-display') as HTMLInputElement
      ).value.trim();
      const colorVal = (row.querySelector('.team-edit-color') as HTMLInputElement).value;
      const errEl = row.querySelector<HTMLElement>('.team-edit-error')!;
      errEl.textContent = '';

      if (!nameVal || !displayVal) {
        errEl.textContent = 'Name and display name are required.';
        return;
      }

      void api
        .patch(`/campaigns/${campaignId}/teams/${teamId}`, {
          name: nameVal,
          display_name: displayVal,
          color: colorVal,
        })
        .then(() => reload())
        .catch((err: unknown) => {
          errEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
        });
    });

    row.querySelector('.team-delete-btn')?.addEventListener('click', () => {
      viewEls.forEach((el) => (el.style.display = 'none'));
      confirmDeleteEl.style.display = 'inline';
    });
    row.querySelector('.team-cancel-delete-btn')?.addEventListener('click', () => {
      viewEls.forEach((el) => (el.style.display = ''));
      confirmDeleteEl.style.display = 'none';
    });
    row.querySelector('.team-confirm-btn')?.addEventListener('click', () => {
      void api
        .delete(`/campaigns/${campaignId}/teams/${teamId}`)
        .then(() => reload())
        .catch((err: unknown) => {
          // alert() is intentional here — the confirm-delete row has no inline error span.
          // This mirrors the existing attack editor pattern (which also uses alert() for delete errors).
          alert(
            `Failed to delete team: ${
              err instanceof ApiError ? err.message : String(err)
            }`,
          );
          viewEls.forEach((el) => (el.style.display = ''));
          confirmDeleteEl.style.display = 'none';
        });
    });
  });

  // Add team form
  document.getElementById('new-team-submit')?.addEventListener('click', () => {
    const nameVal = (
      document.getElementById('new-team-name') as HTMLInputElement
    ).value.trim();
    const displayVal = (
      document.getElementById('new-team-display') as HTMLInputElement
    ).value.trim();
    const colorVal = (document.getElementById('new-team-color') as HTMLInputElement)
      .value;
    const errEl = document.getElementById('new-team-error')!;
    errEl.textContent = '';

    if (!nameVal || !displayVal) {
      errEl.textContent = 'Name and display name are required.';
      return;
    }

    void api
      .post(`/campaigns/${campaignId}/teams`, {
        name: nameVal,
        display_name: displayVal,
        color: colorVal,
      })
      .then(() => reload())
      .catch((err: unknown) => {
        errEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
      });
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```

Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: add team management section to campaign detail page"
```

---

### Task 9: Add GMs section to campaign.ts

**Files:**

- Modify: `src/admin/campaign.ts`

- [ ] **Step 1: Replace the renderGmManager stub with the full implementation**

> **Search pattern note:** The spec says "a text input that calls `GET /api/users/search?q=`". This is implemented as a Search button (+ Enter key binding) rather than live-on-input search. The button pattern avoids excessive API calls while maintaining the minimum-2-character guard. The UX effect is equivalent from the user's perspective.

Replace the stub `renderGmManager` function with:

```typescript
function renderGmManager(
  container: HTMLElement,
  gms: AdminGm[],
  campaignId: number,
  reload: () => void,
): void {
  const gmRows = gms
    .map(
      (gm) => `
    <li style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333">
      <span>${esc(gm.display_name)} <span style="color:#888;font-size:0.85em">${esc(
        gm.email,
      )}</span></span>
      <button data-user-id="${gm.user_id}"
        style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px;font-size:0.85em">
        Remove
      </button>
    </li>`,
    )
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">GMs</h3>
    ${
      gms.length === 0
        ? '<p style="color:#888;font-size:0.9em">No GMs assigned yet.</p>'
        : `<ul style="list-style:none;padding:0;margin:0 0 16px">${gmRows}</ul>`
    }
    <div style="margin-top:12px">
      <div style="display:flex;gap:8px;align-items:flex-start;max-width:480px">
        <input id="gm-search-input" type="text" placeholder="Search by email or name (min 2 chars)"
          style="flex:1;padding:6px 8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
        <button id="gm-search-btn"
          style="padding:6px 12px;background:#444;color:white;border:none;border-radius:3px;cursor:pointer;white-space:nowrap">
          Search
        </button>
      </div>
      <ul id="gm-search-results" style="list-style:none;padding:0;margin:8px 0 0;max-width:480px"></ul>
      <span id="gm-search-error" style="color:#f87171;font-size:0.85em"></span>
    </div>
  `;

  // Remove GM buttons
  container.querySelectorAll<HTMLButtonElement>('button[data-user-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = Number(btn.dataset['userId']);
      btn.disabled = true;
      void api
        .delete(`/campaigns/${campaignId}/gms/${userId}`)
        .then(() => reload())
        .catch((err: unknown) => {
          // alert() is intentional — the Remove button row has no inline error span.
          alert(
            `Failed to remove GM: ${err instanceof ApiError ? err.message : String(err)}`,
          );
          btn.disabled = false;
        });
    });
  });

  // Search
  const searchInput = document.getElementById('gm-search-input') as HTMLInputElement;
  const searchResults = document.getElementById('gm-search-results')!;
  const searchError = document.getElementById('gm-search-error')!;

  interface UserResult {
    id: number;
    display_name: string;
    email: string;
  }

  const doSearch = (): void => {
    const q = searchInput.value.trim();
    searchError.textContent = '';
    searchResults.innerHTML = '';

    if (q.length < 2) {
      searchError.textContent = 'Enter at least 2 characters to search.';
      return;
    }

    void api
      .get<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`)
      .then((users) => {
        if (users.length === 0) {
          searchResults.innerHTML =
            '<li style="padding:6px 0;color:#888">No users found.</li>';
          return;
        }
        searchResults.innerHTML = users
          .map(
            (u) => `
          <li style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333">
            <span>${esc(u.display_name)} <span style="color:#888;font-size:0.85em">${esc(
              u.email,
            )}</span></span>
            <button data-add-user-id="${u.id}"
              style="padding:2px 8px;cursor:pointer;background:#166534;color:white;border:none;border-radius:3px;font-size:0.85em">
              Add GM
            </button>
          </li>`,
          )
          .join('');

        searchResults
          .querySelectorAll<HTMLButtonElement>('button[data-add-user-id]')
          .forEach((btn) => {
            btn.addEventListener('click', () => {
              const userId = Number(btn.dataset['addUserId']);
              btn.disabled = true;
              void api
                .post(`/campaigns/${campaignId}/gms`, { user_id: userId })
                .then(() => reload())
                .catch((err: unknown) => {
                  searchError.textContent = esc(
                    err instanceof ApiError ? err.message : String(err),
                  );
                  btn.disabled = false;
                });
            });
          });
      })
      .catch((err: unknown) => {
        searchError.textContent = esc(
          err instanceof ApiError ? err.message : String(err),
        );
      });
  };

  document.getElementById('gm-search-btn')?.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles and lints**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
npm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: add GMs management section to campaign detail page"
```

---

### Task 10: Create users.ts

**Files:**

- Create: `src/admin/users.ts`

- [ ] **Step 1: Create the file**

> **Note on imports:** `AdminUser` is imported from `./types` (not from `./index`). `./index` is the SPA entry point and exports nothing; all shared types live in `./types`.

```typescript
// src/admin/users.ts
// User management page at /admin/users — superuser only.

import { api, ApiError } from './api';
import { AdminUser } from './types';
import { esc } from './utils';

export async function renderUsersPage(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p style="padding:24px">Loading…</p>';

  let currentUser: AdminUser;
  try {
    currentUser = await api.get<AdminUser>('/auth/me');
  } catch {
    window.location.href = '/admin';
    return;
  }

  const isSuperuser = currentUser.roles.some((r) => r.role_type === 'superuser');
  if (!isSuperuser) {
    window.location.href = '/admin';
    return;
  }

  async function render(): Promise<void> {
    try {
      const users = await api.get<AdminUser[]>('/users');

      const rows = users
        .map((u) => {
          const gmRoles = u.roles.filter((r) => r.role_type === 'gm');
          const otherRoles = u.roles.filter((r) => r.role_type !== 'gm');

          const gmBadges = gmRoles
            .map(
              (r) => `
            <span style="display:inline-flex;align-items:center;gap:4px;background:#1e3a5f;border-radius:3px;padding:1px 6px;font-size:0.8em;margin:2px">
              GM #${r.campaign_id}
              <button data-remove-gm-user="${u.id}" data-remove-gm-campaign="${r.campaign_id}"
                style="background:none;border:none;color:#f87171;cursor:pointer;padding:0 2px;font-size:1em;line-height:1"
                title="Remove GM role">×</button>
            </span>`,
            )
            .join('');

          const otherBadges = otherRoles
            .map(
              (r) => `
            <span style="display:inline-block;background:#333;border-radius:3px;padding:1px 6px;font-size:0.8em;margin:2px;color:#aaa">
              ${esc(r.role_type)}${r.campaign_id ? ` #${r.campaign_id}` : ''}
            </span>`,
            )
            .join('');

          return `
          <tr style="border-bottom:1px solid #2a2a2a">
            <td style="padding:10px 12px">${esc(u.display_name)}</td>
            <td style="padding:10px 12px;color:#aaa;font-size:0.9em">${esc(u.email)}</td>
            <td style="padding:10px 12px">${gmBadges}${otherBadges}</td>
          </tr>`;
        })
        .join('');

      container.innerHTML = `
        <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;align-items:center;gap:16px">
          <a href="/admin" style="color:#7ab3f0">← Campaigns</a>
          <strong>Users</strong>
        </header>
        <main style="padding:24px;max-width:900px">
          <p style="color:#888;font-size:0.9em;margin:0 0 16px">${
            users.length
          } registered user${users.length === 1 ? '' : 's'}</p>
          <table style="width:100%;border-collapse:collapse;font-size:0.9em">
            <thead>
              <tr style="border-bottom:1px solid #444;text-align:left">
                <th style="padding:8px 12px">Name</th>
                <th style="padding:8px 12px">Email</th>
                <th style="padding:8px 12px">Roles</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </main>
      `;

      // Remove-GM buttons
      container
        .querySelectorAll<HTMLButtonElement>('button[data-remove-gm-user]')
        .forEach((btn) => {
          btn.addEventListener('click', () => {
            const userId = Number(btn.dataset['removeGmUser']);
            const campaignId = Number(btn.dataset['removeGmCampaign']);
            btn.disabled = true;
            void api
              .delete(`/campaigns/${campaignId}/gms/${userId}`)
              .then(() => render())
              .catch((err: unknown) => {
                // alert() is intentional — the user-table row has no inline error span.
                alert(
                  `Failed to remove GM: ${
                    err instanceof ApiError ? err.message : String(err)
                  }`,
                );
                btn.disabled = false;
              });
          });
        });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      container.innerHTML = `<p style="padding:24px;color:#f87171">Error: ${esc(
        String(err),
      )}</p>`;
    }
  }

  await render();
}
```

- [ ] **Step 2: Verify TypeScript compiles and lints**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
npm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/users.ts
git commit -m "feat: add users management page"
```

---

### Task 11: Wire routes in index.ts

**Files:**

- Modify: `src/admin/index.ts`

- [ ] **Step 1: Add imports for new page modules**

At the top of `src/admin/index.ts`, add after the existing import for `renderCampaignDetail`:

```typescript
import { renderCampaignForm } from './campaign-form';
import { renderUsersPage } from './users';
```

- [ ] **Step 2: Add routes in the route() function**

In the `route()` function, add two new routes. Find the existing campaign route:

```typescript
const campaignMatch = /^\/admin\/campaigns\/(\d+)$/.exec(pathname);
if (campaignMatch) {
  await renderCampaignDetail(app, Number(campaignMatch[1]));
  return;
}
```

Add before it (so `/admin/campaigns/new` is matched before the `\d+` regex which won't match it anyway, but position it here for clarity):

```typescript
if (pathname === '/admin/campaigns/new') {
  renderCampaignForm(app);
  return;
}

if (pathname === '/admin/users') {
  await renderUsersPage(app);
  return;
}
```

- [ ] **Step 3: Verify TypeScript compiles and lints cleanly**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
npm run lint
```

Expected: no errors, no lint warnings

- [ ] **Step 4: End-to-end smoke test**

With both `npm run dev` and `docker-compose up -d` running:

```
1. Visit http://localhost:5173/admin → redirects to /admin/login
2. Log in via OAuth → dashboard shows campaign list
3. Click "+ New Campaign" → form at /admin/campaigns/new
4. Fill in name "Test Campaign" → submit → redirects to /admin/campaigns/<new_id>
5. Campaign detail page shows:
   - Lifecycle section: "Not Started" with a Start button
   - Campaign Settings section with editable name/description
   - Tile editor (existing)
   - Attack editor (existing)
   - Team Assets editor (existing)
   - Teams section with Add team form
   - GMs section (if superuser)
6. Click "Start" → lifecycle updates to "Active" with Pause + End Campaign buttons
7. Add a team → team appears in table with Edit and Delete buttons
8. If superuser: search for a user by email → "Add GM" button → user appears in GMs list
9. Visit http://localhost:5173/admin/users (superuser) → user table with GM role badges
10. Click × on a GM role badge → role removed, page re-renders
```

- [ ] **Step 5: Commit**

```bash
git add src/admin/index.ts
git commit -m "feat: wire campaign-form and users routes into admin SPA router"
```

---

## Phase 3 Complete

Phase 3 delivers:

- ✅ Campaign creation (any auth user → auto-GM)
- ✅ Campaign name/description editing (GM/superuser)
- ✅ Campaign lifecycle: Start, Pause, Resume, End with state enforcement
- ✅ Team CRUD: create, edit, delete within a campaign
- ✅ GM roster on campaign detail page with search-by-email add flow (superuser)
- ✅ `/admin/users` page listing all users with GM role management (superuser)
- ✅ All error handling inline, no full-page reloads on error

**Next:** Phase 4 — Team sprite/image management (deferred from Phase 3)
