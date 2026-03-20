# Hexmap Admin — Phase 2: GM Write Operations

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated write endpoints and a campaign detail page to the admin SPA, allowing GMs to edit tile ownership, manage attacks, and update team asset scores.

**Architecture:** Extend the PHP backend with `handlers/admin.php` containing all write handlers, protected by `requireAuth`/`requireGm`. Add tile IDs to the existing map-data response so the frontend can reference tiles by ID. Add a campaign detail SPA page (`src/admin/campaign.ts`) with three inline editors: tile ownership, attacks, and team asset scores. Extract shared TypeScript types to `src/admin/types.ts`.

**Tech Stack:** PHP 8 + MySQL (backend), Vite + TypeScript (frontend)

---

## Key Decisions

- Tile IDs are added to the public `/api/campaigns/:id/map-data` response (additive, non-breaking)
- Tile updates record history in `tile_state_history`
- Attack resolution sets `resolved_at` and writes to `attack_history`
- Team asset update uses `INSERT … ON DUPLICATE KEY UPDATE` + `DELETE` to honour full-replace (`PUT`) semantics — assets omitted from the body are removed
- `handleUpdateTile` only updates `team_id` (ownership); `color_override` and `defense` are intentionally out of scope for Phase 2
- All write endpoints require `requireAuth` + `requireGm` — no player-level writes in Phase 2
- `defence` spelling used in JSON (matching existing API contract)

---

## File Map

**New files:**

- `backend/src/handlers/admin.php` — all GM write handlers
- `src/admin/utils.ts` — shared `esc()` helper (extracted from `index.ts` so `campaign.ts` can import it without a circular dependency)
- `src/admin/types.ts` — shared TypeScript interfaces for admin SPA; types are prefixed `Admin*` to avoid name collisions with `src/mapData.ts` exports
- `src/admin/campaign.ts` — campaign detail page (tile editor, attack editor, asset editor)

**Modified files:**

- `backend/src/handlers/campaigns.php` — add `id` field to tiles and attacks in `handleMapData`
- `backend/public/api.php` — add admin write routes (PATCH tiles, POST/DELETE attacks, PUT team assets)
- `src/admin/api.ts` — add `patch` method
- `src/admin/index.ts` — extract `esc` to `utils.ts`; add routing for `/admin/campaigns/:id`

---

## Chunk 1: Backend Write API

### Task 1: Add tile and attack IDs to map-data response

**Files:**

- Modify: `backend/src/handlers/campaigns.php`

The frontend needs tile IDs to reference tiles in PATCH requests, and attack IDs to reference attacks in DELETE requests. Both changes are additive — the map viewer ignores unknown fields.

- [ ] **Step 1: Add `id` to each tile object in `handleMapData`**

In `handleMapData`, locate the tile transform loop and add the `id` field:

```php
    $map = [];
    foreach ($tileRows as $row) {
        $tile = [
            'id'    => (int)$row['id'],          // ← add this line
            'col'   => (int)$row['col'],
            'row'   => (int)$row['row'],
            'coord' => $row['col'] . ',' . $row['row'],
        ];
```

- [ ] **Step 2: Add `id` to each attack object in `handleMapData`**

Locate the attacks SELECT query and add `id` to the column list:

```php
    $stmt = $db->prepare(
        'SELECT id, team_id, from_tile_id, to_tile_id
           FROM attacks
          WHERE campaign_id = ?
            AND resolved_at IS NULL'
    );
```

Then in the attack transform loop, add `id` to the attack array:

```php
    $attacks = [];
    foreach ($attackRows as $row) {
        $attacks[] = [
            'id'   => (int)$row['id'],           // ← add this line
            'team' => $teamNameById[(int)$row['team_id']] ?? '',
            'from' => $tileCoordById[(int)$row['from_tile_id']] ?? ['col' => 0, 'row' => 0],
            'to'   => $tileCoordById[(int)$row['to_tile_id']] ?? ['col' => 0, 'row' => 0],
        ];
    }
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend && docker-compose exec -T web php -l /var/www/src/handlers/campaigns.php
```

Expected: `No syntax errors detected`

- [ ] **Step 4: Smoke-test map-data includes ids**

```bash
curl -s http://localhost:8080/api/campaigns/1/map-data | python3 -c "
import sys, json
d = json.load(sys.stdin)
tile = d['map'][0]
assert 'id' in tile, 'tile missing id'
print('tile id present:', tile['id'])
if d['attacks']:
    atk = d['attacks'][0]
    assert 'id' in atk, 'attack missing id'
    print('attack id present:', atk['id'])
"
```

Expected: prints tile and attack ids

- [ ] **Step 5: Commit**

```bash
git add backend/src/handlers/campaigns.php
git commit -m "feat: include tile and attack ids in map-data response"
```

---

### Task 2: Create admin write handlers (backend/src/handlers/admin.php)

**Files:**

- Create: `backend/src/handlers/admin.php`

**Notes:**

- URL-segment IDs (e.g. `$campaignId`, `$tileId`, `$attackId`) are validated by the `\d+` regex in the router and cast with `(int)` — no further validation needed for path parameters.
- Body integer parameters (`team_id`, `from_tile_id`, `to_tile_id`) require explicit `is_int()` checks since JSON parsing does not guarantee types.
- `handleResolveAttack` writes to `attack_history` (which has an `outcome` column, not `change_reason`). It does NOT write to `tile_state_history` — tile history is only written when tile ownership changes.
- `handleUpdateTile` writes `change_reason = 'admin'` to `tile_state_history` (already in the code below).

- [ ] **Step 1: Create the file**

```php
<?php
// backend/src/handlers/admin.php

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';

// ── Tiles ────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/campaigns/:campaignId/tiles/:tileId
 * Body: { "team_id": 3 }  or  { "team_id": null }
 * Updates tile ownership and records history.
 * Requires GM role for the campaign.
 */
function handleUpdateTile(int $campaignId, int $tileId): never
{
    $user = requireAuth();
    requireGm($user, $campaignId);

    $body = json_decode(file_get_contents('php://input'), true) ?? [];

    // team_id may be null (unassign) or a positive int (assign)
    $newTeamId = array_key_exists('team_id', $body)
        ? ($body['team_id'] === null ? null : (int)$body['team_id'])
        : false;

    if ($newTeamId === false) {
        jsonResponse(['error' => 'team_id is required'], 400);
    }

    $db = getDb();

    // Verify tile belongs to this campaign
    $stmt = $db->prepare('SELECT id, team_id FROM tiles WHERE id = ? AND campaign_id = ?');
    $stmt->execute([$tileId, $campaignId]);
    $tile = $stmt->fetch();
    if (!$tile) {
        jsonResponse(['error' => 'Tile not found'], 404);
    }

    // Verify team belongs to this campaign (if assigning)
    if ($newTeamId !== null) {
        $stmt = $db->prepare('SELECT id FROM teams WHERE id = ? AND campaign_id = ?');
        $stmt->execute([$newTeamId, $campaignId]);
        if (!$stmt->fetch()) {
            jsonResponse(['error' => 'Team not found in this campaign'], 404);
        }
    }

    $previousTeamId = $tile['team_id'] !== null ? (int)$tile['team_id'] : null;

    // Update tile
    $db->prepare('UPDATE tiles SET team_id = ?, updated_at = NOW() WHERE id = ?')
       ->execute([$newTeamId, $tileId]);

    // Record history
    $db->prepare(
        'INSERT INTO tile_state_history (campaign_id, tile_id, previous_team_id, new_team_id, change_reason)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([$campaignId, $tileId, $previousTeamId, $newTeamId, 'admin']);

    jsonResponse(['ok' => true, 'tile_id' => $tileId, 'team_id' => $newTeamId]);
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
    // When $assetNames is empty the body was `{}` — clear all assets unconditionally.
    if (empty($assetNames)) {
        $db->prepare('DELETE FROM team_assets WHERE team_id = ?')->execute([$teamId]);
    } else {
        $placeholders = implode(',', array_fill(0, count($assetNames), '?'));
        $params = array_merge([$teamId], $assetNames);
        $db->prepare(
            "DELETE FROM team_assets WHERE team_id = ? AND asset_name NOT IN ($placeholders)"
        )->execute($params);
    }

    jsonResponse(['ok' => true]);
}
```

- [ ] **Step 2: Verify syntax**

```bash
cd backend && docker-compose exec -T web php -l /var/www/src/handlers/admin.php
```

Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add backend/src/handlers/admin.php
git commit -m "feat: add GM write handlers (tile, attack, team assets)"
```

---

### Task 3: Add admin routes to api.php

**Files:**

- Modify: `backend/public/api.php`

- [ ] **Step 1: Update CORS preflight to allow PATCH and DELETE**

Browsers send an OPTIONS preflight before `PATCH` and `DELETE` requests. Without listing them, the browser will refuse to send tile-update or attack-resolve requests. Find the existing `Allow-Methods` header in the OPTIONS block and replace it with the exact string below (adds `PATCH`):

```php
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
```

- [ ] **Step 2: Add admin write routes**

After the existing campaign routes block and before the health check, add:

```php
// ── Admin write routes (GM protected) ───────────────────────────────────────
} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTile((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/attacks$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleCreateAttack((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/attacks/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleResolveAttack((int)$m[1], (int)$m[2]);

} elseif ($method === 'PUT' && preg_match('#^/api/campaigns/(\d+)/teams/(\d+)/assets$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTeamAssets((int)$m[1], (int)$m[2]);
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend && docker-compose exec -T web php -l /var/www/html/api.php
```

Expected: `No syntax errors detected`

- [ ] **Step 4: Smoke-test write endpoints reject unauthenticated requests**

```bash
# Tile update — expect 401
curl -s -X PATCH http://localhost:8080/api/campaigns/1/tiles/1 \
  -H "Content-Type: application/json" \
  -d '{"team_id": 1}'
# Expected: {"error":"Unauthorised"}

# Create attack — expect 401
curl -s -X POST http://localhost:8080/api/campaigns/1/attacks \
  -H "Content-Type: application/json" \
  -d '{"team_id":1,"from_tile_id":1,"to_tile_id":2}'
# Expected: {"error":"Unauthorised"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/public/api.php
git commit -m "feat: add admin write routes to api.php router"
```

---

## Chunk 2: Frontend Campaign Detail Page

### Task 4: Create shared TypeScript types (src/admin/types.ts)

**Files:**

- Create: `src/admin/types.ts`

Centralises interfaces used across multiple admin SPA modules. Also adds the `id` field to `AdminTile` and `AdminAttack` to match the updated map-data API response (Task 1 above).

**Important:** All type names carry the `Admin` prefix to avoid collisions with the identically-named exports from `src/mapData.ts` (e.g. `Team`, `TileData`). The map viewer's types do not need updating — it ignores unknown fields.

- [ ] **Step 1: Create the file**

```typescript
// src/admin/types.ts
// Shared TypeScript interfaces for the admin SPA.
// All names carry the Admin prefix to avoid collisions with src/mapData.ts exports.

export interface AdminUserRole {
  role_type: 'superuser' | 'gm' | 'player';
  campaign_id: number;
  team_id: number;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  roles: AdminUserRole[];
}

export interface AdminCampaign {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface AdminTeam {
  name: string;
  display_name: string;
  color: string;
  assets: Record<string, number>;
}

export interface AdminTile {
  id: number;
  col: number;
  row: number;
  coord: string;
  locationName?: string;
  resourceName?: string;
  team?: string;
  defence?: number;
}

export interface AdminAttack {
  id: number;
  team: string;
  from: { col: number; row: number };
  to: { col: number; row: number };
}

export interface AdminMapData {
  teams: AdminTeam[];
  map: AdminTile[];
  attacks: AdminAttack[];
}
```

Note: `AdminTeam` here reflects the map-data response shape (no `id`). The campaign detail page fetches team IDs from a separate `/api/campaigns/:id/teams` endpoint (added in Task 7) which returns `[{ id, name, display_name, color }]`.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep -E "error" | head -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/types.ts
git commit -m "feat: add shared TypeScript types for admin SPA"
```

---

### Task 5: Create utils.ts and add patch to api.ts

**Files:**

- Create: `src/admin/utils.ts`
- Modify: `src/admin/api.ts`

`esc()` is needed in both `index.ts` and `campaign.ts`. Defining it in `utils.ts` avoids duplication and prevents a circular import (`campaign.ts` cannot import from `index.ts` because `index.ts` already imports from `campaign.ts`).

- [ ] **Step 1: Create src/admin/utils.ts**

```typescript
// src/admin/utils.ts
// Shared utilities for the admin SPA.

/** Escape user-supplied strings for safe innerHTML injection. */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Update src/admin/index.ts to import esc from utils**

Replace the local `esc` function definition in `index.ts`:

```typescript
/** Escape user-supplied strings before injecting into innerHTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

with an import at the top of the file:

```typescript
import { esc } from './utils';
```

- [ ] **Step 3: Add patch method to src/admin/api.ts**

In the `export const api = { ... }` block in `src/admin/api.ts`, add `patch` after `put`:

```typescript
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
```

- [ ] **Step 4: Verify build and lint**

```bash
npm run build 2>&1 | grep -iE "error" | head -20
npm run lint
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/admin/utils.ts src/admin/api.ts src/admin/index.ts
git commit -m "feat: extract esc() to utils.ts; add api.patch method"
```

---

### Task 6: Create campaign detail page (src/admin/campaign.ts)

**Files:**

- Create: `src/admin/campaign.ts`

The campaign detail page shows three editors:

1. **Tiles** — table of all tiles with a team dropdown per row
2. **Attacks** — list of active attacks with a Resolve button, plus create form
3. **Team Assets** — per-team table of asset names and editable score values

**Reload strategy:** After creating or resolving an attack the page re-fetches all data and re-renders the full campaign detail view. This keeps state consistent (tile dropdowns keep their current values from the server) at the cost of a brief flicker. Tiles and assets editors do not trigger a reload — they send their PATCH/PUT inline and show local feedback only.

- [ ] **Step 1: Create src/admin/campaign.ts**

```typescript
// src/admin/campaign.ts
// Campaign detail page: tile editor, attack editor, team asset editor.

import { api, ApiError } from './api';
import { AdminAttack, AdminCampaign, AdminMapData } from './types';
import { esc } from './utils';

interface CampaignTeam {
  id: number;
  name: string;
  display_name: string;
  color: string;
}

interface CampaignDetailData {
  campaign: AdminCampaign;
  mapData: AdminMapData;
  teams: CampaignTeam[];
}

async function loadData(campaignId: number): Promise<CampaignDetailData> {
  const [campaign, mapData, teams] = await Promise.all([
    api.get<AdminCampaign>(`/campaigns/${campaignId}`),
    api.get<AdminMapData>(`/campaigns/${campaignId}/map-data`),
    api.get<CampaignTeam[]>(`/campaigns/${campaignId}/teams`),
  ]);
  return { campaign, mapData, teams };
}

function renderTileEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
): void {
  const teamByName = Object.fromEntries(teams.map((t) => [t.name, t]));

  const rows = mapData.map
    .map((tile) => {
      const selectedTeam = tile.team ? teamByName[tile.team] : null;
      const opts = teams
        .map(
          (t) =>
            `<option value="${t.id}" ${selectedTeam?.id === t.id ? 'selected' : ''}>${esc(
              t.display_name,
            )}</option>`,
        )
        .join('');

      return `<tr>
        <td style="padding:6px 8px;font-family:monospace">${esc(tile.coord)}</td>
        <td style="padding:6px 8px">${esc(tile.locationName ?? '')}</td>
        <td style="padding:6px 8px">${esc(tile.resourceName ?? '')}</td>
        <td style="padding:6px 8px">
          <select data-tile-id="${
            tile.id
          }" style="background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 4px;border-radius:3px">
            <option value="">— none —</option>
            ${opts}
          </select>
        </td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Tiles</h3>
    <table style="width:100%;border-collapse:collapse;font-size:0.9em">
      <thead>
        <tr style="border-bottom:1px solid #444;text-align:left">
          <th style="padding:6px 8px">Coord</th>
          <th style="padding:6px 8px">Location</th>
          <th style="padding:6px 8px">Resource</th>
          <th style="padding:6px 8px">Team</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll<HTMLSelectElement>('select[data-tile-id]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const tileId = Number(sel.dataset['tileId']);
      const teamId = sel.value ? Number(sel.value) : null;
      sel.disabled = true;
      void api
        .patch(`/campaigns/${campaignId}/tiles/${tileId}`, { team_id: teamId })
        .catch((err: unknown) => {
          alert(
            `Failed to update tile: ${
              err instanceof ApiError ? err.message : String(err)
            }`,
          );
        })
        .finally(() => {
          sel.disabled = false;
        });
    });
  });
}

function renderAttackEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
  reload: () => void,
): void {
  const teamByName = Object.fromEntries(teams.map((t) => [t.name, t]));

  const attackRows = mapData.attacks
    .map((atk: AdminAttack) => {
      const team = teamByName[atk.team];
      return `<tr>
        <td style="padding:6px 8px">${esc(team?.display_name ?? atk.team)}</td>
        <td style="padding:6px 8px;font-family:monospace">${esc(
          `${atk.from.col},${atk.from.row}`,
        )}</td>
        <td style="padding:6px 8px;font-family:monospace">${esc(
          `${atk.to.col},${atk.to.row}`,
        )}</td>
        <td style="padding:6px 8px">
          <button data-attack-id="${atk.id}"
            style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">
            Resolve
          </button>
        </td>
      </tr>`;
    })
    .join('');

  const tileOptions = mapData.map
    .map(
      (t) =>
        `<option value="${t.id}">${esc(t.coord)}${
          t.locationName ? ' — ' + esc(t.locationName) : ''
        }</option>`,
    )
    .join('');
  const teamOptions = teams
    .map((t) => `<option value="${t.id}">${esc(t.display_name)}</option>`)
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Attacks</h3>
    ${
      mapData.attacks.length === 0
        ? '<p style="color:#888">No active attacks.</p>'
        : `<table style="width:100%;border-collapse:collapse;font-size:0.9em;margin-bottom:16px">
          <thead><tr style="border-bottom:1px solid #444;text-align:left">
            <th style="padding:6px 8px">Team</th>
            <th style="padding:6px 8px">From</th>
            <th style="padding:6px 8px">To</th>
            <th style="padding:6px 8px"></th>
          </tr></thead>
          <tbody>${attackRows}</tbody>
        </table>`
    }
    <details style="margin-top:8px">
      <summary style="cursor:pointer;color:#7ab3f0;margin-bottom:8px">+ Add attack</summary>
      <div style="display:flex;flex-direction:column;gap:8px;max-width:360px;margin-top:8px">
        <label>Team
          <select id="atk-team" style="display:block;width:100%;margin-top:2px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:4px;border-radius:3px">
            ${teamOptions}
          </select>
        </label>
        <label>From tile
          <select id="atk-from" style="display:block;width:100%;margin-top:2px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:4px;border-radius:3px">
            ${tileOptions}
          </select>
        </label>
        <label>To tile
          <select id="atk-to" style="display:block;width:100%;margin-top:2px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:4px;border-radius:3px">
            ${tileOptions}
          </select>
        </label>
        <button id="atk-submit" style="padding:6px 16px;background:#1d4ed8;color:white;border:none;border-radius:3px;cursor:pointer;align-self:flex-start">
          Create Attack
        </button>
      </div>
    </details>
  `;

  container
    .querySelectorAll<HTMLButtonElement>('button[data-attack-id]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const attackId = Number(btn.dataset['attackId']);
        btn.disabled = true;
        void api
          .delete(`/campaigns/${campaignId}/attacks/${attackId}`)
          .then(() => reload())
          .catch((err: unknown) => {
            alert(
              `Failed to resolve attack: ${
                err instanceof ApiError ? err.message : String(err)
              }`,
            );
            btn.disabled = false;
          });
      });
    });

  document.getElementById('atk-submit')?.addEventListener('click', () => {
    const teamId = Number(
      (document.getElementById('atk-team') as HTMLSelectElement).value,
    );
    const fromId = Number(
      (document.getElementById('atk-from') as HTMLSelectElement).value,
    );
    const toId = Number((document.getElementById('atk-to') as HTMLSelectElement).value);
    if (fromId === toId) {
      alert('From and To tiles must differ.');
      return;
    }
    void api
      .post(`/campaigns/${campaignId}/attacks`, {
        team_id: teamId,
        from_tile_id: fromId,
        to_tile_id: toId,
      })
      .then(() => reload())
      .catch((err: unknown) => {
        alert(
          `Failed to create attack: ${
            err instanceof ApiError ? err.message : String(err)
          }`,
        );
      });
  });
}

function renderAssetEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
): void {
  const teamById = Object.fromEntries(teams.map((t) => [t.name, t]));

  const teamSections = mapData.teams
    .map((teamData) => {
      const team = teamById[teamData.name];
      if (!team) return '';
      const assets = teamData.assets;
      const assetRows = Object.entries(assets)
        .map(
          ([name, value]) => `
          <tr>
            <td style="padding:4px 8px">${esc(name)}</td>
            <td style="padding:4px 8px">
              <input type="number" data-asset-name="${esc(name)}" value="${value}"
                style="width:70px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 4px;border-radius:3px">
            </td>
          </tr>`,
        )
        .join('');

      return `
        <div style="margin-bottom:20px">
          <h4 style="margin:0 0 6px;color:${esc(team.color)}">${esc(
        team.display_name,
      )}</h4>
          ${
            assetRows
              ? `<table style="font-size:0.9em;border-collapse:collapse">
              <thead><tr style="border-bottom:1px solid #444;text-align:left">
                <th style="padding:4px 8px">Asset</th><th style="padding:4px 8px">Score</th>
              </tr></thead>
              <tbody>${assetRows}</tbody>
            </table>
            <button data-team-id="${team.id}" style="margin-top:6px;padding:4px 12px;background:#166534;color:white;border:none;border-radius:3px;cursor:pointer">
              Save
            </button>`
              : '<p style="color:#888;font-size:0.9em">No assets.</p>'
          }
        </div>`;
    })
    .join('');

  container.innerHTML = `<h3 style="margin:0 0 12px">Team Assets</h3>${teamSections}`;

  container.querySelectorAll<HTMLButtonElement>('button[data-team-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const teamId = Number(btn.dataset['teamId']);
      const section = btn.closest('div')!;
      const payload: Record<string, number> = {};
      section
        .querySelectorAll<HTMLInputElement>('input[data-asset-name]')
        .forEach((inp) => {
          payload[inp.dataset['assetName']!] = Number(inp.value);
        });
      btn.disabled = true;
      void api
        .put(`/campaigns/${campaignId}/teams/${teamId}/assets`, payload)
        .then(() => {
          btn.textContent = 'Saved ✓';
          setTimeout(() => {
            btn.textContent = 'Save';
            btn.disabled = false;
          }, 1500);
        })
        .catch((err: unknown) => {
          alert(
            `Failed to save assets: ${
              err instanceof ApiError ? err.message : String(err)
            }`,
          );
          btn.disabled = false;
        });
    });
  });
}

export async function renderCampaignDetail(
  container: HTMLElement,
  campaignId: number,
): Promise<void> {
  container.innerHTML = '<p style="padding:24px">Loading…</p>';

  // render() re-fetches all data and rebuilds the full page.
  // Called after attack create/resolve to keep state consistent.
  async function render(): Promise<void> {
    try {
      const { campaign, mapData, teams } = await loadData(campaignId);

      container.innerHTML = `
        <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center">
          <span><a href="/admin" style="color:#7ab3f0">← Campaigns</a></span>
          <strong>${esc(campaign.name)}</strong>
          <span style="font-size:0.85em;color:${
            campaign.is_active ? '#4ade80' : '#888'
          }">${campaign.is_active ? 'Active' : 'Inactive'}</span>
        </header>
        <main style="padding:24px;max-width:900px;display:grid;gap:32px">
          <section id="section-tiles"></section>
          <section id="section-attacks"></section>
          <section id="section-assets"></section>
        </main>
      `;

      renderTileEditor(
        document.getElementById('section-tiles')!,
        mapData,
        teams,
        campaignId,
      );
      renderAttackEditor(
        document.getElementById('section-attacks')!,
        mapData,
        teams,
        campaignId,
        () => void render(),
      );
      renderAssetEditor(
        document.getElementById('section-assets')!,
        mapData,
        teams,
        campaignId,
      );
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

- [ ] **Step 2: Verify build and lint**

```bash
npm run build 2>&1 | grep -iE "error" | head -20
npm run lint
```

Expected: no TypeScript errors, no lint errors

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: add campaign detail page with tile/attack/asset editors"
```

---

### Task 7: Add teams endpoint to backend

**Files:**

- Modify: `backend/src/handlers/campaigns.php`
- Modify: `backend/public/api.php`

The campaign detail page needs team IDs to send write requests. Add a lightweight public endpoint — this is intentionally unauthenticated because team names, colours, and display names are already exposed in the public `map-data` response; adding `id` does not reveal new sensitive information.

- [ ] **Step 1: Add handleListTeams to campaigns.php**

```php
function handleListTeams(int $campaignId): void
{
    $db   = getDb();
    $stmt = $db->prepare('SELECT id FROM campaigns WHERE id = ?');
    $stmt->execute([$campaignId]);
    if (!$stmt->fetch()) {
        jsonResponse(['error' => 'Campaign not found'], 404);
    }

    $stmt = $db->prepare(
        'SELECT id, name, display_name, color
           FROM teams
          WHERE campaign_id = ?
          ORDER BY name'
    );
    $stmt->execute([$campaignId]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
    }

    jsonResponse($rows);
}
```

- [ ] **Step 2: Add route to api.php**

Add **before** the `/api/campaigns/:id` route — the more-specific path `/campaigns/:id/teams` must be matched first or it will be swallowed by the shorter pattern:

```php
} elseif ($method === 'GET' && preg_match('#^/api/campaigns/(\d+)/teams$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/campaigns.php';
    handleListTeams((int)$m[1]);
```

- [ ] **Step 3: Verify syntax**

```bash
cd backend && docker-compose exec -T web php -l /var/www/src/handlers/campaigns.php && \
             docker-compose exec -T web php -l /var/www/html/api.php
```

Expected: no syntax errors for both files

- [ ] **Step 4: Smoke-test**

```bash
curl -s http://localhost:8080/api/campaigns/1/teams
# Expected: JSON array with id, name, display_name, color fields
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/handlers/campaigns.php backend/public/api.php
git commit -m "feat: add GET /api/campaigns/:id/teams endpoint"
```

---

### Task 8: Wire campaign detail into admin router

**Files:**

- Modify: `src/admin/index.ts`

- [ ] **Step 1: Update the route function in index.ts**

Import `renderCampaignDetail` and add a route for `/admin/campaigns/:id`. Add to the top imports:

```typescript
import { renderCampaignDetail } from './campaign';
```

In the `route()` function, add before the "not yet implemented" fallback:

```typescript
const campaignMatch = /^\/admin\/campaigns\/(\d+)$/.exec(pathname);
if (campaignMatch) {
  await renderCampaignDetail(app, Number(campaignMatch[1]));
  return;
}
```

- [ ] **Step 2: Verify build and lint**

```bash
npm run build 2>&1 | grep -iE "error" | head -20
npm run lint
```

Expected: no errors

- [ ] **Step 3: End-to-end smoke test**

```
1. npm run dev + cd backend && docker-compose up -d
2. Visit http://localhost:5173/admin → login → dashboard
3. Click a campaign name → campaign detail page loads
4. Tile table shows with team dropdowns pre-selected
5. Change a tile's team dropdown → network request fires, no error
6. Attacks section shows active attacks with Resolve buttons
7. Click Resolve → attack disappears, page re-renders with fresh data
8. Open "Add attack", fill in form → click Create Attack → new row appears
9. Team Assets section shows per-team score inputs
10. Change a score value → click Save → button shows "Saved ✓"
```

- [ ] **Step 4: Commit**

```bash
git add src/admin/index.ts
git commit -m "feat: wire campaign detail route into admin SPA router"
```

---

## Phase 2 Complete

Phase 2 delivers:

- ✅ Tile and attack IDs in map-data response
- ✅ `GET /api/campaigns/:id/teams` — team list with IDs (public, consistent with existing map-data)
- ✅ `PATCH /api/campaigns/:id/tiles/:tileId` — update tile ownership (GM only)
- ✅ `POST /api/campaigns/:id/attacks` — create attack (GM only)
- ✅ `DELETE /api/campaigns/:id/attacks/:attackId` — resolve attack (GM only)
- ✅ `PUT /api/campaigns/:id/teams/:teamId/assets` — update team asset scores (GM only)
- ✅ `src/admin/utils.ts` — shared `esc()` helper
- ✅ `src/admin/types.ts` — Admin-prefixed shared interfaces
- ✅ Campaign detail page at `/admin/campaigns/:id`
- ✅ Inline tile ownership editor
- ✅ Inline attack manager (create + resolve)
- ✅ Inline team asset score editor

**Next:** Phase 3 — Campaign management (create/edit campaign, manage teams, assign GM roles)
