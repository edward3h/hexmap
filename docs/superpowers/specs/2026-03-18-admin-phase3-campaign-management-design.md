# Admin Phase 3 — Campaign Management Design

**Date:** 2026-03-18
**Status:** Approved

---

## Goal

Add campaign management capabilities to the Hexmap admin SPA: any authenticated user can create a campaign (becoming its GM), GMs and superusers can edit campaign details and manage the campaign lifecycle, GMs can manage teams, and superusers can assign/remove GM roles.

---

## Scope

### In scope

- Create campaigns (any authenticated user; creator auto-assigned as GM)
- Edit campaign name and description (GM or superuser)
- Campaign lifecycle state transitions: Start, Pause, Resume, End (GM or superuser)
- Team CRUD: create, edit (name, display_name, colour), delete (GM or superuser)
- GM role assignment: add/remove GM for a campaign (superuser only)
- User list page at `/admin/users` (superuser only)
- GM roster on campaign detail page with search-by-email add flow (superuser only)

### Out of scope (deferred)

- Team sprite/image management (Phase 4)
- Player role assignment
- Campaign deletion

---

## Permissions Model

| Action                                         | Required role                 |
| ---------------------------------------------- | ----------------------------- |
| Create campaign                                | Any authenticated user        |
| Edit name/description                          | GM for campaign, or superuser |
| Lifecycle transitions (start/pause/resume/end) | GM for campaign, or superuser |
| Create/edit/delete team                        | GM for campaign, or superuser |
| View GM roster                                 | GM for campaign, or superuser |
| Add/remove GM                                  | Superuser only                |
| View `/admin/users`                            | Superuser only                |

When a user creates a campaign, the backend immediately inserts a `user_roles` row `(role_type='gm', campaign_id=<new_id>, team_id=0)` for the creator.

---

## Campaign Lifecycle State Machine

State is derived from the `campaigns` table columns:

| State       | `started_at` | `is_active` | `ended_at` |
| ----------- | ------------ | ----------- | ---------- |
| Not started | NULL         | 1           | NULL       |
| Active      | SET          | 1           | NULL       |
| Paused      | SET          | 0           | NULL       |
| Ended       | SET          | **0**       | SET        |

Valid transitions:

- **Not started** → Start → **Active** (sets `started_at = NOW()`, `is_active = 1`)
- **Active** → Pause → **Paused** (sets `is_active = 0`)
- **Active** → End → **Ended** (sets `ended_at = NOW()`, `is_active = 0`)
- **Paused** → Resume → **Active** (sets `is_active = 1`)
- **Paused** → End → **Ended** (sets `ended_at = NOW()`, `is_active` remains 0)

All Ended states have `is_active = 0`. The backend enforces these transitions; invalid requests return 409 Conflict.

---

## Backend

### New file: `backend/src/handlers/campaign-management.php`

All campaign management handlers live here, keeping `admin.php` focused on in-game GM write operations (tile/attack/asset editors from Phase 2).

### Campaign endpoints

| Method  | Path                        | Auth            | Description                         |
| ------- | --------------------------- | --------------- | ----------------------------------- |
| `POST`  | `/api/campaigns`            | Any auth        | Create campaign; creator becomes GM |
| `PATCH` | `/api/campaigns/:id`        | GM or superuser | Update name and/or description      |
| `POST`  | `/api/campaigns/:id/start`  | GM or superuser | Transition: Not started → Active    |
| `POST`  | `/api/campaigns/:id/pause`  | GM or superuser | Transition: Active → Paused         |
| `POST`  | `/api/campaigns/:id/resume` | GM or superuser | Transition: Paused → Active         |
| `POST`  | `/api/campaigns/:id/end`    | GM or superuser | Transition: any non-ended → Ended   |

**`POST /api/campaigns`** body: `{ "name": "...", "description": "..." }`
- `name` is required (non-empty string); returns 400 if missing or empty.
- `description` is optional (defaults to empty string).
- Duplicate campaign names are permitted (no uniqueness constraint on `campaigns.name`).
- Returns **201 Created** with body `{ "id": <new_campaign_id> }`.
- After insert, immediately inserts `user_roles` row for the creator as GM.

**`PATCH /api/campaigns/:id`** body: `{ "name": "...", "description": "..." }` (both optional; at least one must be present).

Each lifecycle endpoint takes no body. Returns 409 if the current state does not permit the transition. Lifecycle field changes are listed in the state machine section above.

### Team endpoints

| Method   | Path                               | Auth            | Description  |
| -------- | ---------------------------------- | --------------- | ------------ |
| `POST`   | `/api/campaigns/:id/teams`         | GM or superuser | Create team  |
| `PATCH`  | `/api/campaigns/:id/teams/:teamId` | GM or superuser | Edit team    |
| `DELETE` | `/api/campaigns/:id/teams/:teamId` | GM or superuser | Delete team  |

All team endpoints verify that the team's `campaign_id` matches `:id`, returning 404 if not.

**`POST /api/campaigns/:id/teams`** body: `{ "name": "...", "display_name": "...", "color": "#rrggbb" }` — all three fields required.
**`PATCH /api/campaigns/:id/teams/:teamId`** body: same shape, all fields optional.

`name` must be unique within the campaign (`UNIQUE(campaign_id, name)` DB constraint). Both create and edit return **409 Conflict** with `{ "error": "Team name already exists in this campaign" }` on a duplicate.

`color` uses US spelling for consistency with the DB column name. (British English used in prose only.)

On delete: tiles referencing the team have `team_id` set to NULL via the existing FK `ON DELETE SET NULL`.

**`POST`** returns 201 with `{ "id": <new_team_id> }`. **`PATCH`** and **`DELETE`** return 200 with `{ "ok": true }`.

### User / role endpoints

| Method   | Path                             | Auth            | Description                           |
| -------- | -------------------------------- | --------------- | ------------------------------------- |
| `GET`    | `/api/users`                     | Superuser       | List all users with their roles       |
| `GET`    | `/api/users/search?q=`           | Superuser       | Search users by email or display_name |
| `GET`    | `/api/campaigns/:id/gms`         | GM or superuser | List GMs for a campaign               |
| `POST`   | `/api/campaigns/:id/gms`         | Superuser       | Add GM (body: `{ "user_id": N }`)     |
| `DELETE` | `/api/campaigns/:id/gms/:userId` | Superuser       | Remove GM role                        |

**`GET /api/users`** returns all users (no pagination — user base is small, internal tool). Returns `[{ id, email, display_name, avatar_url, roles: [{ role_type, campaign_id, team_id }] }]`.

**`GET /api/users/search?q=foo`** performs `LIKE %foo%` on both `email` and `display_name` (OR). Requires `q` to be at least 2 characters; returns 400 if shorter. Returns max 20 results in the same shape as `GET /api/users`.

**`GET /api/campaigns/:id/gms`** returns `[{ user_id, display_name, email }]`. The field is named `user_id` (not `id`) to distinguish it from a campaign or team id in the frontend context.

**`DELETE /api/campaigns/:id/gms/:userId`** — the backend does **not** enforce a minimum-GM guard. A superuser can remove all GMs; a superuser is always available as a fallback to manage any campaign.

---

## Frontend

### New files

**`src/admin/campaign-form.ts`**
Renders the create-campaign form at `/admin/campaigns/new`. Fields: Name (required), Description (optional textarea). On submit: `POST /api/campaigns`; on success redirect to `/admin/campaigns/:newId`; on error display an inline error message (never a full-page reload).

**`src/admin/users.ts`**
Renders the `/admin/users` page. Superuser gate: if the current user is not a superuser, redirect to `/admin`. Shows a table of all users (display_name, email, roles). Only GM roles have a Remove button (`DELETE /api/campaigns/:id/gms/:userId`). Non-GM roles (superuser, player) are displayed read-only — no remove affordance — because player assignment and superuser management are out of scope for this phase.

### Modified files

**`src/admin/types.ts`** — add:

```typescript
// user_id (not id) is intentional — distinguishes this projection from AdminUser.id
// at the call site. AdminGm is only used for the GMs-list endpoint response.
interface AdminGm {
  user_id: number;
  display_name: string;
  email: string;
}
```

**`src/admin/index.ts`** — add routes:

- `/admin/campaigns/new` → `renderCampaignForm(app)`
- `/admin/users` → `renderUsersPage(app)`

**`src/admin/campaign.ts`** — add three new sections to the campaign detail page:

1. **Lifecycle section** (always visible to GM/superuser): Shows current state label (Not Started / Active / Paused / Ended) and only the action buttons valid for that state. Each button calls the appropriate endpoint then calls the existing `render()` closure to re-fetch all data and re-render the page in place (consistent with the attack editor pattern).

2. **Team management section** (GM/superuser): Table of existing teams (name, display_name, colour swatch — `color` field from API). Each row has Edit (reveals inline form) and Delete (with inline confirm). "Add Team" button reveals a form beneath the table. Duplicate-name 409 errors display inline.

3. **GMs section** (superuser only): Lists current GMs for the campaign (fetched from `GET /api/campaigns/:id/gms`). Each entry has a Remove button. Below the list: a text input (minimum 2 characters) that calls `GET /api/users/search?q=` and shows results in a small inline list, each with an "Add GM" button.

The campaign detail `loadData()` function is extended to also fetch `GET /api/campaigns/:id/gms` alongside the existing three fetches using `Promise.all`. Consistent with the existing pattern, any fetch failure rejects the whole `Promise.all` and the page shows an error state — no partial/degraded rendering of the GMs section.

### Route additions in `index.ts`

```
/admin/campaigns/new  → renderCampaignForm(app)
/admin/users          → renderUsersPage(app)
```

The existing `/admin/campaigns/:id` route already renders the campaign detail; the new sections are added within `campaign.ts`.

---

## Error Handling

- **400 Bad Request:** Missing required fields, empty campaign name, search query shorter than 2 characters.
- **404 Not Found:** Campaign, team, or user does not exist or does not belong to the specified campaign.
- **409 Conflict:** Invalid lifecycle transition, or duplicate team name within a campaign.
- **403 Forbidden:** Non-superuser attempts a superuser-only action. Frontend shows an inline error; the `/admin/users` page redirects to `/admin`.
- All error messages are displayed inline; no full-page reloads on error.

---

## No DB Changes Required

All required tables (`campaigns`, `teams`, `user_roles`, `users`) exist in `schema.sql` and `schema-auth.sql`. This phase adds no new tables.
