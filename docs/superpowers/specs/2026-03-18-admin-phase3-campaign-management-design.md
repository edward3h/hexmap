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

| Action | Required role |
|--------|---------------|
| Create campaign | Any authenticated user |
| Edit name/description | GM for campaign, or superuser |
| Lifecycle transitions (start/pause/resume/end) | GM for campaign, or superuser |
| Create/edit/delete team | GM for campaign, or superuser |
| View GM roster | GM for campaign, or superuser |
| Add/remove GM | Superuser only |
| View `/admin/users` | Superuser only |

When a user creates a campaign, the backend immediately inserts a `user_roles` row `(role_type='gm', campaign_id=<new_id>, team_id=0)` for the creator.

---

## Campaign Lifecycle State Machine

State is derived from the `campaigns` table columns:

| State | `started_at` | `is_active` | `ended_at` |
|-------|-------------|-------------|------------|
| Not started | NULL | 1 | NULL |
| Active | SET | 1 | NULL |
| Paused | SET | 0 | NULL |
| Ended | SET | 0 or 1 | SET |

Valid transitions:

- **Not started** → Start → **Active**
- **Active** → Pause → **Paused**
- **Active** → End → **Ended**
- **Paused** → Resume → **Active**
- **Paused** → End → **Ended**

The backend enforces these transitions; invalid requests return 409 Conflict.

---

## Backend

### New file: `backend/src/handlers/campaign-management.php`

All campaign management handlers live here, keeping `admin.php` focused on in-game GM write operations (tile/attack/asset editors).

### Campaign endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/campaigns` | Any auth | Create campaign; creator becomes GM |
| `PATCH` | `/api/campaigns/:id` | GM or superuser | Update name and/or description |
| `POST` | `/api/campaigns/:id/start` | GM or superuser | Transition: Not started → Active |
| `POST` | `/api/campaigns/:id/pause` | GM or superuser | Transition: Active → Paused |
| `POST` | `/api/campaigns/:id/resume` | GM or superuser | Transition: Paused → Active |
| `POST` | `/api/campaigns/:id/end` | GM or superuser | Transition: any non-ended → Ended |

`POST /api/campaigns` body: `{ "name": "...", "description": "..." }`
`PATCH /api/campaigns/:id` body: `{ "name": "...", "description": "..." }` (both optional)

Each lifecycle endpoint takes no body. Returns 409 if the current state does not permit the transition.

### Team endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/campaigns/:id/teams` | GM or superuser | Create team |
| `PATCH` | `/api/campaigns/:id/teams/:teamId` | GM or superuser | Edit team |
| `DELETE` | `/api/campaigns/:id/teams/:teamId` | GM or superuser | Delete team |

`POST` and `PATCH` body: `{ "name": "...", "display_name": "...", "color": "#rrggbb" }` (all required for POST, all optional for PATCH).

On delete: tiles referencing the team have `team_id` set to NULL (existing FK `ON DELETE SET NULL`).

### User / role endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users` | Superuser | List all users with their roles |
| `GET` | `/api/users/search?q=` | Superuser | Search users by email or display_name |
| `GET` | `/api/campaigns/:id/gms` | GM or superuser | List GMs for a campaign |
| `POST` | `/api/campaigns/:id/gms` | Superuser | Add GM (body: `{ "user_id": N }`) |
| `DELETE` | `/api/campaigns/:id/gms/:userId` | Superuser | Remove GM role |

`GET /api/users` returns: `[{ id, email, display_name, avatar_url, roles: [...] }]`
`GET /api/users/search?q=foo` performs a `LIKE %foo%` on both `email` and `display_name`, returns same shape (max 20 results).

---

## Frontend

### New files

**`src/admin/campaign-form.ts`**
Renders the create-campaign form at `/admin/campaigns/new`. Fields: Name (required), Description (optional textarea). On submit: `POST /api/campaigns`, then `window.location.href = /admin/campaigns/:newId`.

**`src/admin/users.ts`**
Renders the `/admin/users` page (superuser gate: redirects to `/admin` if not superuser). Shows a table of all users with columns: display_name, email, roles. Each role has a Remove button (`DELETE /api/campaigns/:id/gms/:userId` or role-specific deletion).

### Modified files

**`src/admin/types.ts`** — add:
```typescript
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

1. **Lifecycle section** (always visible to GM/superuser): Shows current state label and only the action buttons valid for that state. Each button calls the appropriate endpoint and triggers a full page re-render.

2. **Team management section** (GM/superuser): Table of existing teams (name, display_name, colour swatch). Each row has Edit (reveals inline form) and Delete (with confirm). "Add Team" button reveals a form beneath the table.

3. **GMs section** (superuser only): Lists current GMs for the campaign. Each has a Remove button. Below the list: a text input for searching users by email/name, showing results in a small dropdown, with an "Add GM" button per result.

### Route additions in `index.ts`

```
/admin/campaigns/new  → renderCampaignForm(app)
/admin/users          → renderUsersPage(app)
```

The existing `/admin/campaigns/:id` route already renders the campaign detail; the new sections are added within `campaign.ts`.

---

## Error Handling

- **409 Conflict:** Returned by lifecycle endpoints on invalid transitions. Frontend displays an inline error message.
- **403 Forbidden:** Returned when a non-superuser attempts a superuser-only action. Frontend shows an error; the users page redirects to `/admin`.
- **404 Not Found:** Returned when the campaign/team/user does not exist or doesn't belong to the campaign.
- All error messages are displayed inline (no full-page reloads on error).

---

## No DB Changes Required

All required tables (`campaigns`, `teams`, `user_roles`, `users`) exist in `schema.sql` and `schema-auth.sql`. This phase adds no new tables.
