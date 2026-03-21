# Page Navigation Links — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

Add navigation links between the four pages of the Hexmap application so users can move between the public campaign list, the 3D map view, the admin dashboard, and the campaign admin detail page without having to manually edit the URL.

## Pages and Links

### Root page (`/`) → Admin dashboard (`/admin`)

- Add a static "Admin →" anchor to `index.html`.
- Visible to all visitors; unauthenticated users will be redirected to login by the admin app.
- Placement: top-right corner of the page, styled consistently with the existing inline styles used throughout the project.

### Admin dashboard (`/admin`) → Root page (`/`)

- Add a "← Public site" link inside the existing `<header>` rendered by `renderDashboard()` in `src/admin/index.ts`.
- Placed on the left side of the header (alongside the existing "Hexmap Admin" label), or as a secondary link.

### Map page (`/map/{id}`) → Admin campaign page (`/admin/campaigns/{id}`)

- The campaign ID is already available via the exported `campaignId` from `src/mapData.ts`.
- Inject an "Admin →" anchor into the existing `<nav id="back-nav">` element after the DOM is ready, via `src/main.ts`.
- Visible to all visitors.

### Admin campaign page (`/admin/campaigns/{id}`) → Map page (`/map/{id}`)

- The campaign ID is available from the URL (`/admin/campaigns/{id}`).
- Add a "View map →" link inside the campaign detail header rendered by `renderCampaignDetail()` in `src/admin/campaign.ts`.

## Implementation Approach

- **Static HTML for links that don't require the campaign ID** (root → admin, admin → root): added directly in `.html` files or in the TS render function for the admin header.
- **JS injection for links that require the campaign ID** (map → admin campaign, admin campaign → map): added in the relevant TS entry points using the already-available campaign ID.
- No new modules or components. Changes touch at most four files: `index.html`, `src/admin/index.ts`, `src/main.ts`, `src/admin/campaign.ts`.
- Styling follows the existing inline-style conventions (no new CSS files).

## Out of Scope

- Authentication-gating the admin link on the public pages.
- Shared navigation component or layout abstraction.
- Any changes to the backend or routing configuration.
