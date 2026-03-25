# Page Navigation Links Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add navigation links between the four Hexmap pages so users can move between the public campaign list, 3D map, admin dashboard, and campaign admin detail without manually editing the URL.

**Architecture:** Four targeted edits across four files — one static HTML file and three TypeScript entry points. No new modules or CSS files. Links that need the campaign ID are injected via existing TS entry points; links that don't require it are added as static HTML.

**Tech Stack:** TypeScript, Vite, inline HTML/DOM manipulation. No test framework — verification is `npm run build` (TypeScript check) + visual inspection.

---

## Chunk 1: Root and Admin dashboard links

### Task 1: Add "Admin →" link to root page

**Files:**

- Modify: `index.html`

**Background:** `index.html` is a near-empty HTML file — `<div id="campaign-list">` and a script tag. The body is styled by `src/campaigns.css` which sets `background: #0a0a0a`, `color: #ccc`, `font-family: Arial`. There are no inline styles in the HTML. A `position: fixed` link in the top-right corner is appropriate since the body layout is centred flex-column.

- [ ] **Step 1: Add the admin link to `index.html`**

  In `index.html`, add the following anchor inside `<body>`, before the `<div id="campaign-list">`:

  ```html
  <a
    href="/admin"
    style="position:fixed;top:12px;right:16px;color:#7ab3f0;text-decoration:none;font-size:0.9em;font-family:system-ui,sans-serif"
    >Admin →</a
  >
  ```

  Full resulting `<body>` section:

  ```html
  <body>
    <a
      href="/admin"
      style="position:fixed;top:12px;right:16px;color:#7ab3f0;text-decoration:none;font-size:0.9em;font-family:system-ui,sans-serif"
      >Admin →</a
    >
    <div id="campaign-list"></div>
    <script type="module" src="/src/campaigns.ts"></script>
  </body>
  ```

- [ ] **Step 2: Verify TypeScript build passes**

  ```bash
  npm run build
  ```

  Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Visual check**

  ```bash
  npm run dev
  ```

  Open `http://localhost:5173` — confirm "Admin →" appears top-right. Click it — confirm redirect to `/admin` (or `/admin/login` if not authenticated).

- [ ] **Step 4: Lint**

  ```bash
  npm run lint
  ```

  Expected: exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add index.html
  git commit -m "feat: add admin link to root campaign list page"
  ```

---

### Task 2: Add "← Public site" link to admin dashboard header

**Files:**

- Modify: `src/admin/index.ts`

**Background:** `renderDashboard()` (line ~53) builds the page HTML as a template literal. The `<header>` is a flex row with `justify-content:space-between`. Left side is `<strong>Hexmap Admin</strong>`, right side is the user name + logout button. Add the public site link alongside the left-side label.

- [ ] **Step 1: Update the header in `renderDashboard()`**

  Find this line in `src/admin/index.ts` (inside the template literal in `renderDashboard`):

  ```html
  <strong>Hexmap Admin</strong>
  ```

  Replace it with:

  ```html
  <span style="display:flex;align-items:center;gap:16px">
    <strong>Hexmap Admin</strong>
    <a href="/" style="color:#7ab3f0;font-size:0.85em;text-decoration:none"
      >← Public site</a
    >
  </span>
  ```

- [ ] **Step 2: Verify TypeScript build passes**

  ```bash
  npm run build
  ```

  Expected: exits 0.

- [ ] **Step 3: Visual check**

  Open `http://localhost:5173/admin` (log in if needed) — confirm "← Public site" appears in the header, left of centre. Click it — confirm it navigates to `/`.

- [ ] **Step 4: Lint**

  ```bash
  npm run lint
  ```

  Expected: exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add src/admin/index.ts
  git commit -m "feat: add public site link to admin dashboard header"
  ```

---

## Chunk 2: Map and campaign admin links

### Task 3: Add "Edit campaign →" link to map page nav

**Files:**

- Modify: `src/main.ts`

**Background:** `map/index.html` has a static `<nav id="back-nav"><a href="/">← Campaigns</a></nav>`. The nav is styled by `src/style.css` — `position: fixed; top: 0.75rem; left: 0.75rem` — and links inside it get green text on a dark semi-transparent background (see `#back-nav a` rule). `campaignId` is already imported from `./mapData` at the top of `main.ts` (line 23) and is a guaranteed non-null positive integer when the map page renders. Inject the new link at module top-level (synchronously), before the async scene setup.

- [ ] **Step 1: Inject the "Edit campaign →" link in `src/main.ts`**

  Find the module-level code near the top of `src/main.ts` where `campaignId` is first available (after imports). Add these lines at module top-level, before the `createScene` function definition or any async calls:

  ```typescript
  const backNav = document.getElementById('back-nav');
  if (backNav) {
    const adminLink = document.createElement('a');
    adminLink.href = `/admin/campaigns/${campaignId}`;
    adminLink.textContent = 'Edit campaign →';
    adminLink.style.marginLeft = '16px';
    backNav.appendChild(adminLink);
  }
  ```

  **Placement tip:** Insert after the title-fetch block (ending around line 132 with `});`), and before the `async function buildMap()` definition at line 134. Do not place it inside or before `createScene` — that function is defined at line 28, before `canvas` or `engine` exist at module level. The correct anchor looks like:

  ```typescript
  // One-time campaign title fetch (not part of poll cycle)
  void fetch(`/api/campaigns/${campaignId}`)
    .then((res) => (res.ok ? (res.json() as Promise<Campaign>) : null))
    .then((c) => {
      if (c) document.title = c.name;
    });

  // ← INSERT THE backNav BLOCK HERE

  async function buildMap(): Promise<{
  ```

- [ ] **Step 2: Verify TypeScript build passes**

  ```bash
  npm run build
  ```

  Expected: exits 0.

- [ ] **Step 3: Visual check**

  Open any campaign map (e.g. `http://localhost:5173/map/1`) — confirm "← Campaigns" and "Edit campaign →" appear in the top-left nav. The new link should have the same green-on-dark styling as the existing link (it inherits `#back-nav a` from `style.css`). Click "Edit campaign →" — confirm it navigates to `/admin/campaigns/1`.

- [ ] **Step 4: Lint**

  ```bash
  npm run lint
  ```

  Expected: exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main.ts
  git commit -m "feat: add edit campaign link to map page nav"
  ```

---

### Task 4: Add "View map →" link to campaign admin header

**Files:**

- Modify: `src/admin/campaign.ts`

**Background:** `renderCampaignDetail()` (around line 1251) renders the page as a template literal. The `<header>` is a three-column flex row: left `<span>` with `← Campaigns` link, centre `<strong>` with campaign name, right `<span>` with an inline status badge (colour-coded text: "Active", "Paused", "Ended", "Not Started"). The campaign status also appears in the "Campaign Status" lifecycle section rendered below the header, so removing the inline badge loses no information. Replace the right-hand `<span>` with a "View map →" link. The campaign ID is available as the `campaignId` parameter passed to `renderCampaignDetail()`.

- [ ] **Step 1: Replace the status badge with a "View map →" link**

  In `src/admin/campaign.ts`, find the right-hand `<span>` in the header template (around line 1259–1275). It looks like:

  ```html
  <span
    style="font-size:0.85em;color:${
    campaign.ended_at
      ? '#888'
      : campaign.started_at && campaign.is_active
      ? '#4ade80'
      : campaign.started_at
      ? '#fbbf24'
      : '#888'
  }"
    >${ campaign.ended_at ? 'Ended' : campaign.started_at && campaign.is_active ? 'Active'
    : campaign.started_at ? 'Paused' : 'Not Started' }</span
  >
  ```

  Replace it with:

  ```html
  <a href="/map/${campaignId}" style="color:#7ab3f0;text-decoration:none;font-size:0.85em"
    >View map →</a
  >
  ```

  Note: `campaignId` here refers to the parameter of `renderCampaignDetail(container, campaignId)` — check the function signature to confirm the parameter name matches.

- [ ] **Step 2: Verify TypeScript build passes**

  ```bash
  npm run build
  ```

  Expected: exits 0.

- [ ] **Step 3: Visual check**

  Open a campaign admin page (e.g. `http://localhost:5173/admin/campaigns/1`) — confirm "View map →" appears in the top-right of the header instead of the status badge. The status badge should still appear in the Campaign Status section below. Click "View map →" — confirm it navigates to `/map/1`.

- [ ] **Step 4: Lint**

  ```bash
  npm run lint
  ```

  Expected: exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add src/admin/campaign.ts
  git commit -m "feat: add view map link to campaign admin header"
  ```
