# Admin Phase 5 — Full Tile Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual SVG hex grid and full CRUD panel for tiles on the campaign detail admin page.

**Architecture:** Backend extends `handleUpdateTile` for all editable fields and adds `handleCreateTile` / `handleDeleteTile` in `admin.php`. Frontend extracts hex grid rendering into a new `hexGrid.ts` module and rewrites `renderTileEditor` in `campaign.ts` to use the grid plus an edit/create panel.

**Tech Stack:** PHP/PDO (backend), TypeScript/Vite/vanilla DOM (frontend), inline SVG for the hex grid.

---

## File Map

| File | Change |
|------|--------|
| `src/admin/types.ts` | Add `colorOverride?: string` to `AdminTile` |
| `backend/src/handlers/admin.php` | Rewrite `handleUpdateTile`; add `handleCreateTile`, `handleDeleteTile` |
| `backend/public/api.php` | Add 2 route entries for POST/DELETE tiles |
| `src/admin/hexGrid.ts` | **New** — `renderHexGrid` function |
| `src/admin/campaign.ts` | Add `renderTileTable` helper, rewrite `renderTileEditor`, update call site |

---

## Chunk 1: Backend

### Task 1: Add `colorOverride` to `AdminTile` in `types.ts`

**Files:**
- Modify: `src/admin/types.ts`

- [ ] **Step 1: Add the field**

In `src/admin/types.ts`, change the `AdminTile` interface from:

```typescript
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
```

To:

```typescript
export interface AdminTile {
  id: number;
  col: number;
  row: number;
  coord: string;
  locationName?: string;
  resourceName?: string;
  team?: string;
  defence?: number;
  colorOverride?: string;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/admin/types.ts
git commit -m "feat: add colorOverride field to AdminTile interface"
```

---

### Task 2: Rewrite `handleUpdateTile` in `admin.php`

**Files:**
- Modify: `backend/src/handlers/admin.php` lines 18–66

- [ ] **Step 1: Replace the function**

Replace the entire `handleUpdateTile` function with:

```php
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/handlers/admin.php
git commit -m "feat: extend handleUpdateTile to accept all tile fields"
```

---

### Task 3: Add `handleCreateTile` to `admin.php`

**Files:**
- Modify: `backend/src/handlers/admin.php` (append after `handleUpdateTeamAssets`)

- [ ] **Step 1: Append the function**

Add after the closing `}` of `handleUpdateTeamAssets` (end of file):

```php
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/handlers/admin.php
git commit -m "feat: add handleCreateTile endpoint"
```

---

### Task 4: Add `handleDeleteTile` to `admin.php`

**Files:**
- Modify: `backend/src/handlers/admin.php` (append after `handleCreateTile`)

- [ ] **Step 1: Append the function**

```php
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/handlers/admin.php
git commit -m "feat: add handleDeleteTile endpoint"
```

---

### Task 5: Add router entries to `api.php`

**Files:**
- Modify: `backend/public/api.php`

- [ ] **Step 1: Insert after the existing PATCH tiles entry (line 62)**

After the block ending with `handleUpdateTile((int)$m[1], (int)$m[2]);` and before the `POST .../attacks` block, insert:

```php
} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/tiles$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleCreateTile((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleDeleteTile((int)$m[1], (int)$m[2]);
```

The surrounding context should look like:

```php
} elseif ($method === 'PATCH' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleUpdateTile((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/tiles$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleCreateTile((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleDeleteTile((int)$m[1], (int)$m[2]);

} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/attacks$#', $path, $m)) {
```

- [ ] **Step 2: Commit**

```bash
git add backend/public/api.php
git commit -m "feat: add POST and DELETE tile routes to api.php"
```

---

## Chunk 2: Frontend — `hexGrid.ts`

### Task 6: Create `src/admin/hexGrid.ts`

**Files:**
- Create: `src/admin/hexGrid.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/admin/hexGrid.ts
// Renders an SVG pointy-top hex grid for the tile editor.

import type { AdminTile } from './types';

interface HexGridTeam {
  name: string;
  color: string;
}

const HEX_H = 52; // tip-to-tip height
const R = HEX_H / 2; // tip radius = 26
const HEX_W = HEX_H * 0.866; // flat-to-flat width ≈ 45

function hexCentre(col: number, row: number): { x: number; y: number } {
  // Safe modulo: ((col % 2) + 2) % 2 ensures correct parity for negative cols
  const colParity = ((col % 2) + 2) % 2;
  return { x: col * HEX_W, y: row * HEX_H - colParity * HEX_H * 0.5 };
}

function hexPoints(cx: number, cy: number): string {
  return [
    [cx, cy - R],
    [cx + HEX_W / 2, cy - R / 2],
    [cx + HEX_W / 2, cy + R / 2],
    [cx, cy + R],
    [cx - HEX_W / 2, cy + R / 2],
    [cx - HEX_W / 2, cy - R / 2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

export function renderHexGrid(
  container: HTMLElement,
  tiles: AdminTile[],
  teams: HexGridTeam[],
  onSelect: (sel: { col: number; row: number; tile: AdminTile | null }) => void,
): { setSelected: (col: number | null, row: number | null) => void } {
  const tileMap = new Map<string, AdminTile>(tiles.map((t) => [`${t.col},${t.row}`, t]));
  const teamColor = new Map<string, string>(teams.map((t) => [t.name, t.color]));

  // Grid bounds
  let minCol: number, maxCol: number, minRow: number, maxRow: number;
  if (tiles.length === 0) {
    minCol = -2; maxCol = 2; minRow = -2; maxRow = 2;
  } else {
    minCol = Math.min(...tiles.map((t) => t.col)) - 1;
    maxCol = Math.max(...tiles.map((t) => t.col)) + 1;
    minRow = Math.min(...tiles.map((t) => t.row)) - 1;
    maxRow = Math.max(...tiles.map((t) => t.row)) + 1;
  }

  // Compute SVG pixel extents of all hex centres, then add R padding on each side
  let svgMinX = Infinity, svgMaxX = -Infinity;
  let svgMinY = Infinity, svgMaxY = -Infinity;
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const { x, y } = hexCentre(col, row);
      svgMinX = Math.min(svgMinX, x - HEX_W / 2);
      svgMaxX = Math.max(svgMaxX, x + HEX_W / 2);
      svgMinY = Math.min(svgMinY, y - R);
      svgMaxY = Math.max(svgMaxY, y + R);
    }
  }
  svgMinX -= R; svgMinY -= R;
  svgMaxX += R; svgMaxY += R;

  // Build polygon group strings
  const groups: string[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const tile = tileMap.get(`${col},${row}`) ?? null;
      const { x, y } = hexCentre(col, row);
      const pts = hexPoints(x, y);
      const cx = x.toFixed(2);
      const cy = (y + 4).toFixed(2);
      if (tile) {
        const fill = tile.team ? (teamColor.get(tile.team) ?? '#333') : '#333';
        const raw = tile.locationName ? tile.locationName.slice(0, 10) : tile.coord;
        const label = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        groups.push(
          `<g data-col="${col}" data-row="${row}" style="cursor:pointer">` +
            `<polygon points="${pts}" fill="${fill}" stroke="#888" stroke-width="1"` +
            ` data-ds="#888" data-dsw="1"/>` +
            `<text x="${cx}" y="${cy}" fill="#eee" font-size="7"` +
            ` text-anchor="middle" pointer-events="none">${label}</text>` +
          `</g>`,
        );
      } else {
        groups.push(
          `<g data-col="${col}" data-row="${row}" style="cursor:pointer">` +
            `<polygon points="${pts}" fill="#111" stroke="#555" stroke-width="1"` +
            ` stroke-dasharray="4,3" data-ds="#555" data-dsw="1"/>` +
            `<text x="${cx}" y="${cy}" fill="#444" font-size="10"` +
            ` text-anchor="middle" pointer-events="none">+</text>` +
          `</g>`,
        );
      }
    }
  }

  const vb =
    `${svgMinX.toFixed(1)} ${svgMinY.toFixed(1)} ` +
    `${(svgMaxX - svgMinX).toFixed(1)} ${(svgMaxY - svgMinY).toFixed(1)}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', vb);
  svg.setAttribute(
    'style',
    'width:100%;max-height:400px;display:block;background:#1a1a1a;border-radius:4px',
  );
  svg.innerHTML = groups.join('');
  container.appendChild(svg);

  // Wire click handlers
  svg.querySelectorAll<SVGGElement>('g[data-col]').forEach((g) => {
    g.addEventListener('click', () => {
      const col = Number(g.dataset['col']);
      const row = Number(g.dataset['row']);
      onSelect({ col, row, tile: tileMap.get(`${col},${row}`) ?? null });
    });
  });

  // Selection highlight — mutates polygon stroke without re-rendering
  let selectedPoly: SVGPolygonElement | null = null;

  function setSelected(col: number | null, row: number | null): void {
    if (selectedPoly) {
      selectedPoly.setAttribute(
        'stroke',
        selectedPoly.getAttribute('data-ds') ?? '#888',
      );
      selectedPoly.setAttribute(
        'stroke-width',
        selectedPoly.getAttribute('data-dsw') ?? '1',
      );
      selectedPoly = null;
    }
    if (col === null || row === null) return;
    const g = svg.querySelector<SVGGElement>(`g[data-col="${col}"][data-row="${row}"]`);
    const poly = g?.querySelector<SVGPolygonElement>('polygon') ?? null;
    if (!poly) return;
    poly.setAttribute('stroke', '#fff');
    poly.setAttribute('stroke-width', '2');
    selectedPoly = poly;
  }

  return { setSelected };
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/admin/hexGrid.ts
git commit -m "feat: add renderHexGrid SVG function"
```

---

## Chunk 3: Frontend — `campaign.ts` rewrite

### Task 7: Update imports and add `renderTileTable` helper

**Files:**
- Modify: `src/admin/campaign.ts`

- [ ] **Step 1: Update imports at the top of the file**

Change the existing `types` import (currently missing `AdminTile`) to include it, and add the `hexGrid` import. The imports block should become:

```typescript
import { api, ApiError } from './api';
import { renderHexGrid } from './hexGrid';
import {
  AdminAttack,
  AdminCampaign,
  AdminGm,
  AdminMapData,
  AdminSpriteHistory,
  AdminTile,
  AdminUser,
} from './types';
import { esc } from './utils';
```

- [ ] **Step 2: Insert `renderTileTable` before the existing `renderTileEditor` (line 691)**

Insert this function immediately before `renderTileEditor`:

```typescript
function renderTileTable(
  container: HTMLElement,
  tiles: AdminTile[],
  onSelect: (sel: { col: number; row: number; tile: AdminTile | null }) => void,
): void {
  const rows = tiles
    .map(
      (tile) =>
        `<tr data-tile-id="${tile.id}" style="cursor:pointer;border-bottom:1px solid #2a2a2a">
          <td style="padding:6px 8px;font-family:monospace">${esc(tile.coord)}</td>
          <td style="padding:6px 8px">${esc(tile.locationName ?? '')}</td>
          <td style="padding:6px 8px">${esc(tile.resourceName ?? '')}</td>
          <td style="padding:6px 8px">${tile.defence !== undefined ? String(tile.defence) : '0'}</td>
          <td style="padding:6px 8px">${esc(tile.team ?? '')}</td>
        </tr>`,
    )
    .join('');

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.9em;margin-top:8px">
      <thead>
        <tr style="border-bottom:1px solid #444;text-align:left">
          <th style="padding:6px 8px">Coord</th>
          <th style="padding:6px 8px">Location</th>
          <th style="padding:6px 8px">Resource</th>
          <th style="padding:6px 8px">Defence</th>
          <th style="padding:6px 8px">Team</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll<HTMLTableRowElement>('tr[data-tile-id]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const tileId = Number(tr.dataset['tileId']);
      const tile = tiles.find((t) => t.id === tileId);
      if (tile) onSelect({ col: tile.col, row: tile.row, tile });
    });
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: add renderTileTable helper and hexGrid import"
```

---

### Task 8: Replace `renderTileEditor` function body

**Files:**
- Modify: `src/admin/campaign.ts` (replace lines 691–761, the existing `renderTileEditor`)

- [ ] **Step 1: Replace the function**

Replace the entire existing `renderTileEditor` function (from `function renderTileEditor(` through its closing `}`) with:

```typescript
async function renderTileEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
  reload: () => void,
): Promise<void> {
  container.innerHTML = '<h3 style="margin:0 0 12px">Tiles</h3>';

  // Fetch resources; on failure show error and disable Save/Create
  type Resource = { name: string; display_name: string };
  let resources: Resource[] = [];
  let resourcesFailed = false;
  try {
    resources = await api.get<Resource[]>('/resources');
  } catch {
    resourcesFailed = true;
    const errMsg = document.createElement('p');
    errMsg.style.cssText = 'color:#f87171;padding:4px 0 12px;font-size:0.9em';
    errMsg.textContent = 'Failed to load resources. Save/Create will be disabled.';
    container.appendChild(errMsg);
  }

  const gridContainer = document.createElement('div');
  const tableContainer = document.createElement('div');
  const panelContainer = document.createElement('div');
  container.appendChild(gridContainer);
  container.appendChild(tableContainer);
  container.appendChild(panelContainer);

  // Stub replaced once renderHexGrid returns
  let setSelected: (col: number | null, row: number | null) => void = () => {};

  function onSelect(sel: { col: number; row: number; tile: AdminTile | null }): void {
    setSelected(sel.col, sel.row);
    renderPanel(sel);
    panelContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const grid = renderHexGrid(gridContainer, mapData.map, teams, onSelect);
  setSelected = grid.setSelected;
  renderTileTable(tableContainer, mapData.map, onSelect);

  function renderPanel(sel: { col: number; row: number; tile: AdminTile | null }): void {
    panelContainer.innerHTML = '';
    const { col, row, tile } = sel;
    const isCreate = tile === null;

    const teamOpts = teams
      .map((t) => {
        const selected = !isCreate && tile.team === t.name ? 'selected' : '';
        return `<option value="${t.id}" ${selected}>${esc(t.display_name)}</option>`;
      })
      .join('');

    const resourceOpts = resources
      .map((r) => {
        const selected = !isCreate && tile.resourceName === r.name ? 'selected' : '';
        return `<option value="${esc(r.name)}" ${selected}>${esc(r.display_name)}</option>`;
      })
      .join('');

    const hasColor = !isCreate && tile.colorOverride !== undefined;
    const colorVal = hasColor ? (tile!.colorOverride ?? '#000000') : '#000000';
    const defenceVal = isCreate ? 0 : (tile.defence ?? 0);
    const locationVal = isCreate ? '' : (tile.locationName ?? '');
    const heading = isCreate
      ? `New tile at (${col},${row})`
      : `Editing: ${esc(tile.locationName ?? tile.coord)}`;

    const disabledAttr = resourcesFailed ? ' disabled' : '';
    const disabledStyle = resourcesFailed ? ';opacity:0.5' : '';

    panelContainer.innerHTML = `
      <div style="background:#222;border:1px solid #555;border-radius:4px;padding:16px;margin-top:16px">
        <h4 style="margin:0 0 12px;color:#7ab3f0">${heading}</h4>
        ${isCreate ? `<p style="color:#888;font-size:0.85em;margin:0 0 12px">Position: (${col},${row}) — read-only</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <label style="display:flex;flex-direction:column;gap:4px;color:#888;font-size:0.9em">
            Location name
            <input id="tile-loc" type="text" maxlength="255" value="${esc(locationVal)}"
              style="background:#2a2a2a;border:1px solid #555;color:#eee;padding:4px 6px;border-radius:3px">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;color:#888;font-size:0.9em">
            Resource
            <select id="tile-res"
              style="background:#2a2a2a;border:1px solid #555;color:#eee;padding:4px 6px;border-radius:3px">
              <option value="">— none —</option>
              ${resourceOpts}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;color:#888;font-size:0.9em">
            Defence
            <input id="tile-def" type="number" min="0" value="${defenceVal}"
              style="background:#2a2a2a;border:1px solid #555;color:#eee;padding:4px 6px;border-radius:3px;width:80px">
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;color:#888;font-size:0.9em">
            Colour override
            <span style="display:flex;gap:8px;align-items:center">
              <input id="tile-color-on" type="checkbox" ${hasColor ? 'checked' : ''}
                style="width:16px;height:16px;cursor:pointer">
              <input id="tile-color" type="color" value="${colorVal}"
                ${!hasColor ? 'disabled' : ''}
                style="width:40px;height:28px;cursor:pointer;border:none;background:none">
            </span>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;color:#888;font-size:0.9em">
            Team
            <select id="tile-team"
              style="background:#2a2a2a;border:1px solid #555;color:#eee;padding:4px 6px;border-radius:3px">
              <option value="">— none —</option>
              ${teamOpts}
            </select>
          </label>
        </div>
        <div id="tile-btns" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button id="tile-save"
            style="padding:4px 16px;cursor:pointer;background:#166534;color:white;border:none;border-radius:3px${disabledStyle}"
            ${disabledAttr}>${isCreate ? 'Create' : 'Save'}</button>
          ${!isCreate ? `<button id="tile-del"
            style="padding:4px 16px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">
            Delete tile</button>` : ''}
          <button id="tile-cancel"
            style="padding:4px 12px;cursor:pointer;background:none;color:#888;border:1px solid #555;border-radius:3px">
            Cancel</button>
        </div>
        <p id="tile-err" style="color:#f87171;font-size:0.9em;margin:8px 0 0;display:none"></p>
      </div>
    `;

    panelContainer
      .querySelector<HTMLInputElement>('#tile-color-on')!
      .addEventListener('change', (e) => {
        panelContainer.querySelector<HTMLInputElement>('#tile-color')!.disabled = !(
          e.target as HTMLInputElement
        ).checked;
      });

    panelContainer.querySelector<HTMLButtonElement>('#tile-cancel')!.addEventListener('click', () => {
      panelContainer.innerHTML = '';
      setSelected(null, null);
    });

    panelContainer
      .querySelector<HTMLButtonElement>('#tile-save')!
      .addEventListener('click', () => {
        void handleSave();
      });

    if (!isCreate) {
      panelContainer
        .querySelector<HTMLButtonElement>('#tile-del')!
        .addEventListener('click', () => {
          showDeleteConfirm();
        });
    }

    async function handleSave(): Promise<void> {
      const errEl = panelContainer.querySelector<HTMLElement>('#tile-err')!;
      errEl.style.display = 'none';
      const saveBtn = panelContainer.querySelector<HTMLButtonElement>('#tile-save')!;
      saveBtn.disabled = true;

      const locationName =
        (panelContainer.querySelector<HTMLInputElement>('#tile-loc')!).value.trim() || null;
      const resourceName =
        (panelContainer.querySelector<HTMLSelectElement>('#tile-res')!).value || null;
      const defRaw = parseInt(
        (panelContainer.querySelector<HTMLInputElement>('#tile-def')!).value,
        10,
      );
      const defense = isNaN(defRaw) || defRaw < 0 ? 0 : defRaw;
      const colorOn = (panelContainer.querySelector<HTMLInputElement>('#tile-color-on')!).checked;
      const colorOverride = colorOn
        ? (panelContainer.querySelector<HTMLInputElement>('#tile-color')!).value
        : null;
      const teamIdStr = (panelContainer.querySelector<HTMLSelectElement>('#tile-team')!).value;
      const teamId = teamIdStr ? parseInt(teamIdStr, 10) : null;

      try {
        if (isCreate) {
          await api.post(`/campaigns/${campaignId}/tiles`, {
            col,
            row,
            location_name: locationName,
            resource_name: resourceName,
            color_override: colorOverride,
            defense,
            team_id: teamId,
          });
        } else {
          await api.patch(`/campaigns/${campaignId}/tiles/${tile!.id}`, {
            location_name: locationName,
            resource_name: resourceName,
            color_override: colorOverride,
            defense,
            team_id: teamId,
          });
        }
        reload();
      } catch (err: unknown) {
        errEl.textContent = err instanceof ApiError ? err.message : String(err);
        errEl.style.display = 'block';
        saveBtn.disabled = resourcesFailed;
      }
    }

    function showDeleteConfirm(): void {
      const btns = panelContainer.querySelector<HTMLElement>('#tile-btns')!;
      btns.innerHTML = `
        <span style="color:#f87171;font-size:0.9em">Delete this tile?</span>
        <button id="tile-del-ok"
          style="padding:4px 10px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">
          Confirm</button>
        <button id="tile-del-no"
          style="padding:4px 10px;cursor:pointer;background:none;color:#888;border:1px solid #555;border-radius:3px">
          Cancel</button>
      `;
      btns.querySelector<HTMLButtonElement>('#tile-del-ok')!.addEventListener('click', () => {
        void handleDelete();
      });
      btns.querySelector<HTMLButtonElement>('#tile-del-no')!.addEventListener('click', () => {
        resetDeleteButtons();
      });
    }

    function resetDeleteButtons(): void {
      const btns = panelContainer.querySelector<HTMLElement>('#tile-btns')!;
      btns.innerHTML = `
        <button id="tile-save"
          style="padding:4px 16px;cursor:pointer;background:#166534;color:white;border:none;border-radius:3px${disabledStyle}"
          ${disabledAttr}>Save</button>
        <button id="tile-del"
          style="padding:4px 16px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">
          Delete tile</button>
        <button id="tile-cancel"
          style="padding:4px 12px;cursor:pointer;background:none;color:#888;border:1px solid #555;border-radius:3px">
          Cancel</button>
      `;
      panelContainer.querySelector<HTMLButtonElement>('#tile-save')!.addEventListener('click', () => {
        void handleSave();
      });
      panelContainer.querySelector<HTMLButtonElement>('#tile-del')!.addEventListener('click', () => {
        showDeleteConfirm();
      });
      panelContainer.querySelector<HTMLButtonElement>('#tile-cancel')!.addEventListener('click', () => {
        panelContainer.innerHTML = '';
        setSelected(null, null);
      });
    }

    async function handleDelete(): Promise<void> {
      const errEl = panelContainer.querySelector<HTMLElement>('#tile-err')!;
      errEl.style.display = 'none';
      try {
        await api.delete(`/campaigns/${campaignId}/tiles/${tile!.id}`);
        reload();
      } catch (err: unknown) {
        errEl.textContent = err instanceof ApiError ? err.message : String(err);
        errEl.style.display = 'block';
        resetDeleteButtons();
      }
    }
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: rewrite renderTileEditor with hex grid and CRUD panel"
```

---

### Task 9: Update the `renderTileEditor` call site

**Files:**
- Modify: `src/admin/campaign.ts` (around line 1021)

- [ ] **Step 1: Add `reload` argument to the call**

Find the call to `renderTileEditor` (currently 4 args, no `reload`):

```typescript
      renderTileEditor(
        document.getElementById('section-tiles')!,
        mapData,
        teams,
        campaignId,
      );
```

Replace with:

```typescript
      void renderTileEditor(
        document.getElementById('section-tiles')!,
        mapData,
        teams,
        campaignId,
        () => void render(),
      );
```

- [ ] **Step 2: Run lint and build**

```bash
npm run lint && npm run build
```

Expected: exits 0, no errors or lint warnings.

- [ ] **Step 3: Commit**

```bash
git add src/admin/campaign.ts
git commit -m "feat: pass reload callback to renderTileEditor call site"
```

---

## Manual Verification Checklist

After all tasks, start the dev server (`npm run dev` + PHP backend) and verify:

- [ ] Campaign detail page loads; Tiles section shows SVG hex grid above tile table
- [ ] Existing tiles appear as coloured hexagons; empty border slots show `+` with dashed outline
- [ ] Clicking an existing tile opens the edit panel below; fields pre-populate from tile data
- [ ] Editing location name / resource / defence / colour / team and clicking Save updates the tile and reloads
- [ ] Clicking Cancel closes panel and clears selection highlight
- [ ] Clicking a `+` empty slot opens create panel with position shown read-only
- [ ] Creating a tile POSTs correctly and tile appears in the grid after reload
- [ ] Delete tile → Confirm deletes the tile and reloads
- [ ] Deleting a tile referenced by an active attack shows the 409 error inline
- [ ] Clicking a table row also opens the edit panel and scrolls to it
- [ ] Colour override checkbox toggles the picker; unchecked sends `null`
