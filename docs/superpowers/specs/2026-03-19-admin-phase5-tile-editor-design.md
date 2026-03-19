# Admin Phase 5 — Full Tile Editor Design

**Date:** 2026-03-19
**Status:** Pending approval

---

## Goal

Allow GMs and superusers to create, edit, and delete map tiles from the campaign detail admin page. Currently tiles are read-only except for team assignment. Phase 5 adds a visual hex grid for selecting tiles, a property edit panel, and full CRUD for tile records.

---

## Scope

### In scope

- SVG hex grid showing existing tiles and available empty slots
- Click any tile to edit its properties in a panel below the grid
- Click an empty slot to create a new tile at that position
- Edit: `location_name`, `resource_name`, `color_override`, `defense`, `team_id`
- Create: all editable fields plus `col`/`row` (pre-filled, read-only)
- Delete tile with confirm step (blocked if tile has any referencing attack records)
- Team assignment moves from the tile table into the edit panel
- Read-only tile summary table below the grid (replaces current editable table, adds Defence column)

### Out of scope

- `terrain_rules_name` / `terrain_rules_url` — set via DB/seed only
- Player-facing tile management
- Bulk operations

---

## Spelling convention

The DB column is `defense` (American). The JSON API and TypeScript interfaces use British `defence` for existing camelCase keys (`AdminTile.defence`). For **request bodies** (snake_case keys sent from frontend to backend), American spelling is used to match DB column names: `defense`, `color_override`, `location_name`, `resource_name`, `team_id`. This matches the existing PATCH body which already sends `team_id`.

---

## Backend

### Extended: `PATCH /api/campaigns/:id/tiles/:tileId`

Currently accepts only `team_id` (required). Extended to accept all editable fields — all optional; only keys present in the body are updated. The existing `team_id`-required validation is removed. Requires GM or superuser.

| Field | Type | Validation |
|-------|------|------------|
| `team_id` | `int\|null` | Must belong to campaign, or null |
| `location_name` | `string\|null` | Max 255 chars, or null to clear |
| `resource_name` | `string\|null` | Must exist in `resources` table (`SELECT name FROM resources WHERE name = ?`), or null to clear |
| `color_override` | `string\|null` | Must match `/^#[0-9a-f]{6}$/i`; normalised to lowercase by the backend; or null to clear |
| `defense` | `int` | Non-negative integer (0 = no defence bonus) |

**History recording:** The existing logic that writes a `tile_state_history` row is conditioned on `team_id` being present in the request body. Patches that do not include `team_id` must not write a history row. When `team_id: null` is included in the body (unassigning a team), a history row IS written (previous team → null).

**Response:** Returns 200 `{ "ok": true }`. The existing extra fields (`tile_id`, `team_id`) are removed from the response body. The existing call site (`campaign.ts` line with `.patch(…/tiles/${tileId}…)`) does not read any fields from the response, so this is not a breaking change.

**Call-site update:** `renderCampaignDetail` currently calls `renderTileEditor(container, mapData, teams, campaignId)` with no `reload` argument. The call site must be updated to pass `() => void render()` as the fifth argument.

### New: `POST /api/campaigns/:id/tiles`

Requires `requireAuth()` + `requireGm($user, $campaignId)`. Create a tile. Body (snake_case):

```json
{
  "col": 3,
  "row": 2,
  "location_name": "Ironhold",
  "resource_name": "base",
  "color_override": null,
  "defense": 1,
  "team_id": null
}
```

- `col` and `row` required integers
- `location_name` max 255 chars if provided
- `resource_name` optional; must exist in `resources` table if provided
- `color_override` optional; must match `/^#[0-9a-f]{6}$/i` (normalised to lowercase) if provided
- `defense` optional, non-negative integer; defaults to `0`
- `team_id` optional; must belong to campaign if provided
- First verify the campaign exists: `SELECT id FROM campaigns WHERE id = ?`; return **404** if not found. (Unlike PATCH/DELETE, there is no tile to look up first, so this requires an explicit campaign check.)
- 400 if any provided field fails validation
- 409 if `(campaign_id, col, row)` already exists
- Returns 201 `{ "id": <new_tile_id> }`

### New: `DELETE /api/campaigns/:id/tiles/:tileId`

Requires `requireAuth()` + `requireGm($user, $campaignId)`. Delete a tile.

First verify the tile exists and belongs to this campaign (`WHERE id = ? AND campaign_id = ?`). Return **404** if not found.

**Attack constraint:** `attacks.from_tile_id`, `attacks.to_tile_id`, `attack_history.from_tile_id`, and `attack_history.to_tile_id` all reference `tiles(id)` with no `ON DELETE CASCADE`. Before deleting, check in order:

1. Count unresolved `attacks` rows: `WHERE (from_tile_id = ? OR to_tile_id = ?) AND resolved_at IS NULL`. If count > 0 → **409** (regardless of whether `attack_history` rows also exist):
   ```json
   { "error": "Tile has N active attack(s) referencing it. Resolve those attacks before deleting this tile." }
   ```
2. Otherwise, count `attack_history` rows: `WHERE from_tile_id = ? OR to_tile_id = ?`. If count > 0 → **409**:
   ```json
   { "error": "This tile appears in attack history records and cannot be deleted." }
   ```

If neither table references the tile, proceed with deletion. `tile_state_history` rows cascade automatically via their existing `ON DELETE CASCADE` FK.

Returns 200 `{ "ok": true }`.

### New router entries in `api.php`

Two new route-match branches added to `backend/public/api.php` only. The staging copy (`backend/deploy_staging/public_html/api.php`) is a read-only deployment with no auth infrastructure and must not be modified. Place the new branches **after the existing `PATCH /api/campaigns/:id/tiles/:tileId` entry** and before the health/catch-all entries:

```php
} elseif ($method === 'POST' && preg_match('#^/api/campaigns/(\d+)/tiles$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleCreateTile((int)$m[1]);

} elseif ($method === 'DELETE' && preg_match('#^/api/campaigns/(\d+)/tiles/(\d+)$#', $path, $m)) {
    require_once __DIR__ . '/../src/handlers/admin.php';
    handleDeleteTile((int)$m[1], (int)$m[2]);

/* ... existing routes continue here unchanged ... */

} elseif ($method === 'GET' && $path === '/api/health') {
```

### Modified: `handleUpdateTile` in `admin.php`

Extend to accept all editable fields. Remove the hard requirement for `team_id`. Build the `UPDATE` query dynamically: maintain a `$setClauses` array and a `$params` array; for each field key present in the request body, append `"fieldname = ?"` to `$setClauses` and append the validated value to `$params`. If `$setClauses` is empty (no recognised field was sent), return 400. Otherwise, execute `UPDATE tiles SET {implode(',', $setClauses)} WHERE id = ? AND campaign_id = ?`. `tiles.updated_at` has `ON UPDATE CURRENT_TIMESTAMP`, so it is updated automatically by MySQL without being listed in `$setClauses`. Condition `tile_state_history` insertion on `team_id` being a key present in the request body (write history when `team_id` key is present, whether null or an integer). Simplify response to `{ "ok": true }`.

---

## Frontend

### Hex Grid (SVG)

A `renderHexGrid` function appends an `<svg>` element as a child of `container` and returns a `setSelected` helper for updating the selection highlight without re-rendering:

```typescript
function renderHexGrid(
  container: HTMLElement,
  tiles: AdminTile[],
  teams: CampaignTeam[],
  onSelect: (sel: { col: number; row: number; tile: AdminTile | null }) => void,
): { setSelected: (col: number | null, row: number | null) => void }
```

`renderTileEditor` creates separate sub-containers for the grid and the table before calling `renderHexGrid`, so the SVG and table elements do not interfere.

Each rendered `<polygon>` carries `data-col` and `data-row` attributes. `setSelected(col, row)` finds the matching polygon by those attributes, sets `stroke="#fff" stroke-width="2"`, and resets the previously selected polygon's stroke to its default. Pass `(null, null)` to clear the selection entirely (e.g., on Cancel).

Uses **pointy-top hex geometry**, matching `hexUtil.ts` (column spacing = `sin(60°)` of hex height; odd columns are offset upward). SVG uses a y-down coordinate system: a lower y value means the polygon appears higher on screen. Odd columns are shifted to a lower y, i.e. visually higher — this matches the 3D viewer, where odd columns are shifted in the negative-z direction (upward from the viewer's perspective):

```
hexH = 52    // tip-to-tip height (controls vertical row spacing)
r    = hexH / 2          // = 26  (tip radius)
hexW = hexH * 0.866      // ≈ 45  (flat-to-flat width = column spacing)

// Centre position:
x = col * hexW
y = row * hexH - colParity * hexH * 0.5

// Safe modulo for negative columns:
colParity = ((col % 2) + 2) % 2   // always 0 or 1
```

> **Note on negative columns:** The safe modulo `((col % 2) + 2) % 2` is used here so that negative column values (e.g. col = -1) produce the correct parity (1, not -1). `hexUtil.ts` uses `col % 2 != 0` for the same purpose, which also works correctly in JavaScript because `(-1 % 2) === -1` and `-1 != 0` is true — so both produce the right stagger. The SVG spec uses the explicit safe-modulo form for clarity.

Six vertices of a pointy-top hex at centre `(cx, cy)`, clockwise from top:

```
(cx,           cy - r   )   // top
(cx + hexW/2,  cy - r/2 )   // top-right
(cx + hexW/2,  cy + r/2 )   // bottom-right
(cx,           cy + r   )   // bottom
(cx - hexW/2,  cy + r/2 )   // bottom-left
(cx - hexW/2,  cy - r/2 )   // top-left
```

**Auto-sizing:** ViewBox spans `[minCol-1 .. maxCol+1]` × `[minRow-1 .. maxRow+1]` relative to existing tiles, ensuring a 1-hex border of empty slots is always visible around the occupied area. After converting to pixel extents (using the centre-position formula above), add padding of `r` pixels on all sides of the viewBox to prevent clipping at the edges.

**Zero-tile campaigns:** Show a 5×5 starter grid of empty slots, columns -2..2, rows -2..2, centred on `(0, 0)`.

**Polygon types:**

- **Existing tile** — filled with team colour (or `#333` if unowned), solid border. Label shows `locationName` truncated to ~10 chars, or coord if no name.
- **Empty slot** — `#111` fill, dashed border (`stroke-dasharray="4,3"`), `+` label in muted colour. Rendered only at the 1-cell border around existing tiles.
- **Selected** — white outline (`stroke="#fff"`, `stroke-width="2"`) overlaid on whichever polygon is selected. At most one selected at a time.

Clicking any polygon calls `onSelect({ col, row, tile: AdminTile | null })`, which opens/replaces the edit panel below and updates the selection highlight. The page scrolls to the edit panel when it opens.

### Edit / Create Panel

Rendered immediately below the grid. Replaced (not toggled) on each new selection. After any successful write, `reload()` re-renders the entire tile section (grid + table) from fresh `/map-data` data.

**Create mode** (empty slot selected):
- Coord shown as read-only label
- Inputs: Location name (text, max 255), Resource (dropdown), Defence (number ≥ 0, default 0), Colour override (see below), Team (dropdown with "— none —" default)
- **Create** → `POST /api/campaigns/:id/tiles` → `reload()`
- **Cancel** → removes panel, clears selection highlight

**Edit mode** (existing tile selected):
- Same inputs, pre-populated from `AdminTile` data
- `AdminTile.team` is a team name string (not id). Pre-select the team dropdown by finding `teams.find(t => t.name === tile.team)?.id`. If not found (team deleted), default to "— none —". `AdminTile.team` is absent (not null) when the tile has no team; absent counts as "— none —".
- `AdminTile.defence` is absent (not 0) when the tile has no defence bonus (the API omits the field when `defense = 0`). The Defence input pre-populates to `0` when the field is absent.
- **Save** → `PATCH /api/campaigns/:id/tiles/:tileId` → `reload()`
- **Delete tile** → inline confirm ("Delete this tile? [Confirm] [Cancel]") → `DELETE /api/campaigns/:id/tiles/:tileId` → `reload()`. On 409 response, show the server error message inline; keep panel open.
- **Cancel** → removes panel, clears selection highlight

Inline error displayed below the buttons on any API failure. Clicking a table row (below the grid) also opens the edit panel and scrolls to the grid.

### Colour override input

`color_override` is nullable. A checkbox **"Override colour"** controls the picker:
- Unchecked → colour picker disabled; `color_override: null` sent on save
- Checked → colour picker enabled
- Pre-population: if `AdminTile.colorOverride` is absent/undefined → checkbox unchecked, picker disabled. If present → checkbox checked, picker shows that colour.

### Resource dropdown

Fetched once from `/api/resources` when the tile section first renders. The endpoint returns an array of `{ name, display_name, description, icon_url }` objects. Use `name` as the `<option value>` (this is what the backend validates and stores) and `display_name` as the visible label. Include a leading `<option value="">— none —</option>` to allow clearing `resource_name`.

If the fetch fails, show an inline error in the tile section container, render the grid, and **disable the Save/Create button** in the panel with a note that resources failed to load. Do not fall back to free-text input — the backend validates `resource_name` against the `resources` table and would reject unknown values.

### Read-only Tile Table

Replaces the existing editable table. Columns: **Coord, Location, Resource, Defence** (new column not in current table), **Team**. Clicking any row calls the same `onSelect` handler as clicking a polygon: it updates the SVG selection highlight, opens (or replaces) the edit panel, and scrolls to the panel (which appears directly below the grid).

### Modified: `renderTileEditor` in `campaign.ts`

New signature:

```typescript
function renderTileEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
  reload: () => void,
): void
```

The call site in `renderCampaignDetail` must pass `() => void render()` as `reload`.

Implementation:
1. Fetches resources from `/api/resources` (inline error + disabled Save on failure)
2. Creates a `gridContainer` div and a `tableContainer` div inside `container`; appends both
3. Calls `renderHexGrid(gridContainer, …)`; stores the returned `setSelected` reference
4. Renders the read-only tile table into `tableContainer`
5. Wires polygon and table row click handlers to the same `onSelect` callback
6. `onSelect(sel)` calls `setSelected(sel.col, sel.row)`, renders/replaces the edit panel (appended to `container` after `tableContainer`), and scrolls to the panel

Team assignment is handled inside the edit panel only. The team dropdown column is removed from the tile table.

### Modified: `AdminTile` interface in `types.ts`

Add the missing `colorOverride` field (`defence` already present):

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
  colorOverride?: string;   // ← new
}
```

---

## Error Handling

| Code | Condition |
|------|-----------|
| 400 | Invalid field value (unknown resource, negative defence, malformed colour, location_name > 255 chars) |
| 403 | Non-GM/superuser attempts any write |
| 404 | Tile or campaign not found; tile does not belong to campaign (delete) |
| 409 | col/row already occupied (create); tile referenced by active attacks or attack history (delete) |

All errors displayed inline in the panel. No full-page reloads.

---

## No changes to map viewer

The viewer reads `team`, `resourceName`, `colorOverride`, `defence`, `locationName` from `/map-data`. Those fields are already returned correctly. No changes needed to `mapData.ts` or any Babylon.js modules.
