# Page Navigation Links — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

Add navigation links between the four pages of the Hexmap application so users can move between the public campaign list, the 3D map view, the admin dashboard, and the campaign admin detail page without having to manually edit the URL.

## Pages and Links

### Root page (`/`) → Admin dashboard (`/admin`)

- Add a static "Admin →" anchor to `index.html`.
- Visible to all visitors; unauthenticated users will be redirected to login by the admin app.
- Placement: top-right corner of the page, as a positioned element (e.g. `position:fixed; top:12px; right:16px`). Style to match the surrounding rendered content in `src/campaigns.ts`: `font-family: system-ui, sans-serif; color: #7ab3f0; text-decoration: none; font-size: 0.9em`.

### Admin dashboard (`/admin`) → Root page (`/`)

- Add a "← Public site" link inside the existing `<header>` rendered by `renderDashboard()` in `src/admin/index.ts`.
- Placed on the left side of the header (alongside the existing "Hexmap Admin" label), or as a secondary link.

### Map page (`/map/{id}`) → Admin campaign page (`/admin/campaigns/{id}`)

- The campaign ID is already available via the exported `campaignId` from `src/mapData.ts`. `getCampaignId()` redirects to root if no ID is present, so the map page only renders with a valid campaign ID — no null-guard is needed.
- Inject an "Edit campaign →" anchor into the existing `<nav id="back-nav">` element at module top-level in `src/main.ts`, using `document.getElementById('back-nav')`. The nav element is static HTML present from initial parse, so no async wait is needed. Appended after the existing `← Campaigns` link, with a small gap (e.g. `margin-left: 16px`).
- Visible to all visitors.

### Admin campaign page (`/admin/campaigns/{id}`) → Map page (`/map/{id}`)

- The campaign ID is available from the URL (`/admin/campaigns/{id}`).
- The campaign detail header rendered by `renderCampaignDetail()` in `src/admin/campaign.ts` is a three-column flex row: left (`← Campaigns`), centre (campaign name), right (inline status badge). Add a "View map →" link by replacing the inline status badge in the right-hand `<span>`. The campaign status continues to appear in the Campaign Status / lifecycle section rendered below the header, so no information is lost.

## Implementation Approach

- **Static HTML for links that don't require the campaign ID** (root → admin, admin → root): added directly in `.html` files or in the TS render function for the admin header.
- **JS injection for links that require the campaign ID** (map → admin campaign, admin campaign → map): added in the relevant TS entry points using the already-available campaign ID.
- No new modules or components. Changes touch at most four files: `index.html`, `src/admin/index.ts`, `src/main.ts`, `src/admin/campaign.ts`.
- Styling follows the existing inline-style conventions (no new CSS files).

## Out of Scope

- Authentication-gating the admin link on the public pages.
- Shared navigation component or layout abstraction.
- Any changes to the backend or routing configuration.
