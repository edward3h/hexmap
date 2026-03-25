# Colour Palette Picker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all three native `<input type="color">` elements in the admin campaign panel with a popover-based palette picker limited to 20 curated colours (22 for tile colour override).

**Architecture:** A new `src/admin/colorPicker.ts` module exports `PALETTE`, `TILE_PALETTE`, `colorPickerHtml()`, and `initColorPicker()`. The module injects its own CSS once into the document head. `campaign.ts` imports and uses these to replace the three existing colour inputs.

**Tech Stack:** TypeScript, Vite, vanilla DOM — no framework, no test runner (project has none). Verification is via `npm run build` (TypeScript check) and manual browser testing.

**Spec:** `docs/superpowers/specs/2026-03-21-colour-palette-picker-design.md`

---

## Chunk 1: New colorPicker module

### Task 1: Create `src/admin/colorPicker.ts`

**Files:**

- Create: `src/admin/colorPicker.ts`

**Note:** No test framework exists in this project. TypeScript type safety (`npm run build`) is the primary automated check. Manual browser testing covers runtime behaviour.

- [ ] **Step 1: Create the file with palette constants and CSS injection**

```typescript
// src/admin/colorPicker.ts

export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#FF3333', name: 'Red' },
  { hex: '#33FF33', name: 'Green' },
  { hex: '#3333FF', name: 'Blue' },
  { hex: '#1A8C1A', name: 'Dark Green' },
  { hex: '#AADD00', name: 'Green-Yellow' },
  { hex: '#FF8800', name: 'Orange' },
  { hex: '#FFFF00', name: 'Yellow' },
  { hex: '#00CC44', name: 'Emerald' },
  { hex: '#33FFCC', name: 'Turquoise' },
  { hex: '#00CCFF', name: 'Azure' },
  { hex: '#0066FF', name: 'Royal Blue' },
  { hex: '#9933FF', name: 'Purple' },
  { hex: '#CC33FF', name: 'Violet' },
  { hex: '#FF33CC', name: 'Hot Pink' },
  { hex: '#FF0066', name: 'Crimson' },
  { hex: '#FF6633', name: 'Coral' },
  { hex: '#D4A853', name: 'Sand' },
  { hex: '#CD853F', name: 'Brown' },
  { hex: '#8B4513', name: 'Dark Brown' },
  { hex: '#607D8B', name: 'Blue-Grey' },
];

export const TILE_PALETTE: { hex: string; name: string }[] = [
  ...PALETTE,
  { hex: '#000000', name: 'Black' },
  { hex: '#555555', name: 'Dark Grey' },
];

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .color-picker { position: relative; display: inline-block; }
    .color-picker-swatch {
      width: 48px; height: 28px; border-radius: 4px;
      cursor: pointer; border: 1px solid #555;
    }
    .color-picker-popover {
      position: absolute; z-index: 100;
      background: #1a1a1a; border: 1px solid #555;
      border-radius: 6px; padding: 8px;
      display: flex; flex-wrap: wrap; gap: 5px;
      width: 220px;
    }
    .color-picker-popover button {
      width: 28px; height: 28px; border-radius: 4px;
      border: 2px solid transparent; cursor: pointer; padding: 0;
    }
    .color-picker-popover button.selected { border-color: white; }
  `;
  document.head.appendChild(style);
}
```

- [ ] **Step 2: Add `colorPickerHtml` function**

```typescript
export function colorPickerHtml(
  id: string,
  currentValue: string,
  palette: { hex: string; name: string }[] = PALETTE,
): string {
  injectStyles();
  const buttons = palette
    .map(
      ({ hex, name }) =>
        `<button data-hex="${hex}" title="${name}"
          class="${hex.toLowerCase() === currentValue.toLowerCase() ? 'selected' : ''}"
          style="background:${hex}"></button>`,
    )
    .join('');
  return `<div class="color-picker" id="${id}" data-value="${currentValue}">
    <div class="color-picker-swatch" style="background:${currentValue}"></div>
    <div class="color-picker-popover" hidden>${buttons}</div>
  </div>`;
}
```

- [ ] **Step 3: Add `initColorPicker` function with shared document listeners**

```typescript
let sharedListenersAdded = false;

function addSharedListeners(): void {
  if (sharedListenersAdded) return;
  sharedListenersAdded = true;

  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.color-picker')) {
      document.querySelectorAll<HTMLElement>('.color-picker-popover').forEach((p) => {
        p.hidden = true;
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll<HTMLElement>('.color-picker-popover').forEach((p) => {
        p.hidden = true;
      });
    }
  });
}

export function initColorPicker(id: string, onChange: (hex: string) => void): void {
  addSharedListeners();

  const wrapper = document.getElementById(id);
  if (!wrapper) return;

  const swatch = wrapper.querySelector<HTMLElement>('.color-picker-swatch')!;
  const popover = wrapper.querySelector<HTMLElement>('.color-picker-popover')!;

  swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close any other open popovers
    document.querySelectorAll<HTMLElement>('.color-picker-popover').forEach((p) => {
      if (p !== popover) p.hidden = true;
    });
    popover.hidden = !popover.hidden;
  });

  popover.querySelectorAll<HTMLButtonElement>('button[data-hex]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hex = btn.dataset['hex']!;
      wrapper.dataset['value'] = hex;
      swatch.style.background = hex;
      popover.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      popover.hidden = true;
      onChange(hex);
    });
  });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/edward/github/edward3h/hexmap && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /home/edward/github/edward3h/hexmap
git checkout -b feat/colour-palette-picker
git add src/admin/colorPicker.ts
git commit -m "feat: add colour palette picker module"
```

---

## Chunk 2: Integrate into campaign.ts — team colour pickers

### Task 2: Replace edit-team colour picker

**Files:**

- Modify: `src/admin/campaign.ts:358-359` (HTML template)
- Modify: `src/admin/campaign.ts:435-452` (showEdit/hideEdit functions)
- Modify: `src/admin/campaign.ts:480` (colorVal read on save)

- [ ] **Step 1: Add import at the top of `campaign.ts`**

Find the existing import block (imports are sorted via eslint-plugin-simple-import-sort). Add:

```typescript
import { colorPickerHtml, initColorPicker } from './colorPicker';
```

- [ ] **Step 2: Replace the edit-team colour `<input>` in the HTML template (line ~358)**

Old:

```typescript
        <input class="team-edit-color" type="color" value="${esc(t.color)}"
          style="display:none;width:48px;height:28px;border:none;background:none;cursor:pointer">
```

New:

```typescript
<div class="team-edit-color" style="display:none">
  ${colorPickerHtml(`team-edit-color-${t.id}`, t.color)}
</div>
```

- [ ] **Step 3: Update `showEdit` and `hideEdit` to use `HTMLElement`**

`initColorPicker` must be called once per row at render time (see Step 3a below), not inside `showEdit`, to avoid duplicate event listeners on repeated Edit clicks.

Old `showEdit` (line ~435):

```typescript
const showEdit = (): void => {
  viewEls.forEach((el) => (el.style.display = 'none'));
  editingEl.style.display = 'inline';
  row
    .querySelectorAll<HTMLInputElement>(
      '.team-edit-name,.team-edit-display,.team-edit-color',
    )
    .forEach((inp) => (inp.style.display = 'inline-block'));
};
```

New `showEdit`:

```typescript
const showEdit = (): void => {
  viewEls.forEach((el) => (el.style.display = 'none'));
  editingEl.style.display = 'inline';
  row
    .querySelectorAll<HTMLElement>('.team-edit-name,.team-edit-display')
    .forEach((inp) => (inp.style.display = 'inline-block'));
  row.querySelector<HTMLElement>('.team-edit-color')!.style.display = 'inline-block';
};
```

Old `hideEdit` (line ~444):

```typescript
const hideEdit = (): void => {
  viewEls.forEach((el) => (el.style.display = ''));
  editingEl.style.display = 'none';
  row
    .querySelectorAll<HTMLInputElement>(
      '.team-edit-name,.team-edit-display,.team-edit-color',
    )
    .forEach((inp) => (inp.style.display = 'none'));
};
```

New `hideEdit`:

```typescript
const hideEdit = (): void => {
  viewEls.forEach((el) => (el.style.display = ''));
  editingEl.style.display = 'none';
  row
    .querySelectorAll<HTMLElement>('.team-edit-name,.team-edit-display')
    .forEach((inp) => (inp.style.display = 'none'));
  row.querySelector<HTMLElement>('.team-edit-color')!.style.display = 'none';
};
```

- [ ] **Step 3a: Call `initColorPicker` once per row at render time**

In the `container.querySelectorAll<HTMLTableRowElement>('tr[data-team-id]').forEach(...)` block (line ~429), at the top of the callback (where `teamId` is extracted), add:

```typescript
initColorPicker(`team-edit-color-${teamId}`, () => {});
```

This runs once per row after `container.innerHTML` is set, before any user interaction.

- [ ] **Step 4: Update colorVal read in save handler (line ~480)**

Old:

```typescript
const colorVal = (row.querySelector('.team-edit-color') as HTMLInputElement).value;
```

New:

```typescript
const colorVal =
  document.getElementById(`team-edit-color-${teamId}`)?.dataset['value'] ?? t.color;
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/edward/github/edward3h/hexmap && npm run build
```

Expected: no errors.

- [ ] **Step 6: Manual test — edit team colour**

1. Start: `npm run dev`
2. Open admin campaign page in browser.
3. Click **Edit** on any team.
4. Confirm the old native colour input is gone; a coloured swatch appears.
5. Click the swatch — confirm the 20-colour popover opens.
6. Select a different colour — confirm swatch updates, popover closes.
7. Click **Save** — confirm `PATCH /campaigns/{id}/teams/{id}` payload has `"color": "<selected hex>"` (check Network tab in DevTools).
8. Click **Cancel** — confirm popover is hidden.

### Task 3: Replace add-team colour picker

**Files:**

- Modify: `src/admin/campaign.ts:413-416` (HTML template)
- Modify: `src/admin/campaign.ts:527-555` (add-team submit handler area — add initColorPicker call and update colorVal read)

- [ ] **Step 1: Replace the add-team colour `<input>` in the HTML template (line ~414)**

Old:

```typescript
        <label style="display:flex;align-items:center;gap:8px;font-size:0.9em">
          Colour <input id="new-team-color" type="color" value="#888888"
            style="width:48px;height:28px;border:none;background:none;cursor:pointer">
        </label>
```

New:

```typescript
<label style="display:flex;align-items:center;gap:8px;font-size:0.9em">
  Colour ${colorPickerHtml('new-team-color', '#FF3333')}
</label>
```

- [ ] **Step 2: Call `initColorPicker` after the add-team section HTML is set**

Old (lines ~426–429):

```typescript
  `;

  // Edit / cancel / save per row
  container.querySelectorAll<HTMLTableRowElement>('tr[data-team-id]').forEach((row) => {
```

New:

```typescript
  `;

  initColorPicker('new-team-color', () => {});

  // Edit / cancel / save per row
  container.querySelectorAll<HTMLTableRowElement>('tr[data-team-id]').forEach((row) => {
```

- [ ] **Step 3: Update colorVal read in add-team submit handler (line ~535)**

Old:

```typescript
const colorVal = (document.getElementById('new-team-color') as HTMLInputElement).value;
```

New:

```typescript
const colorVal = document.getElementById('new-team-color')?.dataset['value'] ?? '#FF3333';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/edward/github/edward3h/hexmap && npm run build
```

Expected: no errors.

- [ ] **Step 5: Manual test — add team colour**

1. Open admin campaign page.
2. Expand **+ Add team**.
3. Confirm old native colour input is gone; a red swatch (default `#FF3333`) appears.
4. Click swatch — confirm palette opens, select a colour.
5. Fill in Name and Display Name, click **Create Team**.
6. Confirm `POST /campaigns/{id}/teams` payload has `"color": "<selected hex>"`.

- [ ] **Step 6: Commit**

```bash
cd /home/edward/github/edward3h/hexmap
git add src/admin/campaign.ts
git commit -m "feat: replace team colour inputs with palette picker"
```

---

## Chunk 3: Integrate into campaign.ts — tile colour override picker

### Task 4: Replace tile colour override picker

**Files:**

- Modify: `src/admin/campaign.ts:804-805` (colorVal / hasColor setup)
- Modify: `src/admin/campaign.ts:843-851` (colour override label HTML)
- Modify: `src/admin/campaign.ts:880-886` (checkbox change handler)
- Modify: `src/admin/campaign.ts:909-` (`renderPanel` function — add initColorPicker call after innerHTML)
- Modify: `src/admin/campaign.ts:924-928` (colorOverride read in handleSave)

- [ ] **Step 1: Add `TILE_PALETTE` to the import from `colorPicker`**

Update the import added in Task 2:

```typescript
import { colorPickerHtml, initColorPicker, TILE_PALETTE } from './colorPicker';
```

- [ ] **Step 2: Update `colorVal` default on line ~805**

Old:

```typescript
const colorVal = hasColor ? tile.colorOverride ?? '#000000' : '#000000';
```

New:

```typescript
const colorVal = hasColor ? tile.colorOverride ?? '#FF3333' : '#FF3333';
```

- [ ] **Step 2a: Replace the colour override `<input>` in the tile panel HTML (line ~843–851)**

Old:

```typescript
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
```

New:

```typescript
          <label style="display:flex;flex-direction:column;gap:4px;color:#888;font-size:0.9em">
            Colour override
            <span style="display:flex;gap:8px;align-items:center">
              <input id="tile-color-on" type="checkbox" ${hasColor ? 'checked' : ''}
                style="width:16px;height:16px;cursor:pointer">
              <span id="tile-color-picker" style="${!hasColor ? 'pointer-events:none;opacity:0.4' : ''}">${colorPickerHtml('tile-color', colorVal, TILE_PALETTE)}</span>
            </span>
          </label>
```

- [ ] **Step 3: Update checkbox change handler (line ~880)**

Old:

```typescript
panelContainer
  .querySelector<HTMLInputElement>('#tile-color-on')!
  .addEventListener('change', (e) => {
    panelContainer.querySelector<HTMLInputElement>('#tile-color')!.disabled = !(
      e.target as HTMLInputElement
    ).checked;
  });
```

New:

```typescript
panelContainer
  .querySelector<HTMLInputElement>('#tile-color-on')!
  .addEventListener('change', (e) => {
    const pickerWrapper =
      panelContainer.querySelector<HTMLElement>('#tile-color-picker')!;
    const enabled = (e.target as HTMLInputElement).checked;
    pickerWrapper.style.pointerEvents = enabled ? '' : 'none';
    pickerWrapper.style.opacity = enabled ? '' : '0.4';
  });
```

- [ ] **Step 4: Call `initColorPicker` after `panelContainer.innerHTML` is set**

Old (lines ~878–882):

```typescript
    `;

    panelContainer
      .querySelector<HTMLInputElement>('#tile-color-on')!
      .addEventListener('change', (e) => {
```

New:

```typescript
    `;

    initColorPicker('tile-color', () => {});

    panelContainer
      .querySelector<HTMLInputElement>('#tile-color-on')!
      .addEventListener('change', (e) => {
```

- [ ] **Step 5: Update colorOverride read in `handleSave` (line ~924)**

Old:

```typescript
const colorOn = panelContainer.querySelector<HTMLInputElement>('#tile-color-on')!.checked;
const colorOverride = colorOn
  ? panelContainer.querySelector<HTMLInputElement>('#tile-color')!.value
  : null;
```

New:

```typescript
const colorOn = panelContainer.querySelector<HTMLInputElement>('#tile-color-on')!.checked;
const colorOverride = colorOn
  ? document.getElementById('tile-color')?.dataset['value'] ?? null
  : null;
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /home/edward/github/edward3h/hexmap && npm run build
```

Expected: no errors.

- [ ] **Step 7: Run linter**

```bash
cd /home/edward/github/edward3h/hexmap && npm run lint
```

Expected: no errors (auto-fixes formatting).

- [ ] **Step 8: Manual test — tile colour override**

1. Open admin campaign page, click a hex tile.
2. Confirm the **Colour override** section shows a greyed-out swatch when the checkbox is unchecked.
3. Check the checkbox — confirm the swatch becomes interactive.
4. Click swatch — confirm the 22-colour palette (includes Black and Dark Grey at end) opens.
5. Select a colour, click **Save** — confirm `color_override` in `PATCH /campaigns/{id}/tiles/{id}` payload contains the chosen hex.
6. Open the same tile again — confirm the swatch shows the saved colour.
7. Uncheck the checkbox, click **Save** — confirm `color_override` is absent from the payload.

- [ ] **Step 9: Manual test — cross-picker and keyboard behaviour**

1. Open a tile edit panel (picker A) and put a team row into edit mode (picker B) simultaneously.
2. Open picker A's popover, then click picker B's swatch — confirm picker A's popover closes.
3. Open any popover, press **Escape** — confirm it closes.
4. Open any popover, click anywhere outside the picker — confirm it closes.

- [ ] **Step 10: Commit**

```bash
cd /home/edward/github/edward3h/hexmap
git add src/admin/campaign.ts
git commit -m "feat: replace tile colour override input with palette picker"
```
