# Colour Palette Picker — Design Spec

## Context

The admin panel currently uses native `<input type="color">` for team colours and tile colour overrides. This is awkward to use and allows arbitrary colours that may clash with the map's visual language. The goal is to replace all three colour pickers with a popover-based palette picker limited to a curated set of colours.

---

## Palette

### Standard palette (20 colours) — used for team colours

| Hex       | Name                              |
| --------- | --------------------------------- |
| `#FF3333` | Red _(required — in test data)_   |
| `#33FF33` | Green _(required — in test data)_ |
| `#3333FF` | Blue _(required — in test data)_  |
| `#1A8C1A` | Dark Green                        |
| `#AADD00` | Green-Yellow                      |
| `#FF8800` | Orange                            |
| `#FFFF00` | Yellow                            |
| `#00CC44` | Emerald                           |
| `#33FFCC` | Turquoise                         |
| `#00CCFF` | Azure                             |
| `#0066FF` | Royal Blue                        |
| `#9933FF` | Purple                            |
| `#CC33FF` | Violet                            |
| `#FF33CC` | Hot Pink                          |
| `#FF0066` | Crimson                           |
| `#FF6633` | Coral                             |
| `#D4A853` | Sand                              |
| `#CD853F` | Brown                             |
| `#8B4513` | Dark Brown                        |
| `#607D8B` | Blue-Grey                         |

`PALETTE.length === 20`.

### Extended palette (22 colours) — used for tile colour override

Same as above, plus:

| Hex       | Name      |
| --------- | --------- |
| `#000000` | Black     |
| `#555555` | Dark Grey |

`TILE_PALETTE.length === 22`.

Colours intentionally excluded from both palettes: `#333333` (neutral tile), `#cccc99` (tile interior default), `#a3e635` (resource label), `#44403c` (defence mesh).

---

## Architecture

### New module: `src/admin/colorPicker.ts`

**`PALETTE`** — exported constant, array of `{ hex: string; name: string }` (20 entries).

**`TILE_PALETTE`** — exported constant, `[...PALETTE, { hex: '#000000', name: 'Black' }, { hex: '#555555', name: 'Dark Grey' }]` (22 entries).

**`colorPickerHtml(id: string, currentValue: string, palette?: { hex: string; name: string }[]): string`**

Returns an HTML string. The `id` attribute is placed on the outer `.color-picker` wrapper `<div>` — this is the element `document.getElementById(id)` returns. Structure:

```html
<div class="color-picker" id="{id}" data-value="{currentValue}">
  <div class="color-picker-swatch" style="background:{currentValue}"></div>
  <div class="color-picker-popover" hidden>
    <!-- one <button> per palette entry -->
  </div>
</div>
```

`data-value` lives on the outer wrapper. Each palette `<button>` has `data-hex="{hex}"` and `title="{name}"`. The button matching `currentValue` receives a `selected` class (white border); if `currentValue` is not in the palette (legacy data), no button is marked selected and the swatch still displays the saved colour.

Defaults to `PALETTE` if `palette` is not provided.

**`initColorPicker(id: string, onChange: (hex: string) => void): void`**

Called after the HTML is in the DOM. Safe to call only once per element — the caller is responsible for not calling it on an already-initialised picker (since `campaign.ts` rebuilds HTML from scratch when re-rendering sections, this is naturally ensured). Wires up:

- **Click on `.color-picker-swatch`** → close any other open `.color-picker-popover` on the page, then toggle this picker's popover visibility.
- **Click on a palette `<button>`** → set `data-value` on the wrapper, update the swatch `background`, mark the clicked button `selected` (remove `selected` from others), close the popover, call `onChange(hex)`.
- **Click outside any `.color-picker`** → handled via a single shared `document` click listener (added once on first `initColorPicker` call, not per-picker) that closes all open popovers when a click lands outside a `.color-picker` element.
- **Escape key** → handled via a single shared `document` keydown listener (added once) that closes all open popovers.

The current selected colour is always readable from `document.getElementById(id).dataset.value`.

---

## Changes to `src/admin/campaign.ts`

Three `<input type="color">` elements are replaced:

### 1. Edit team colour (~line 358)

- Replace `<input class="team-edit-color" type="color" value="${t.color}">` with `colorPickerHtml(\`team-edit-color-\${t.id}\`, t.color)`.
- Call `initColorPicker(...)` after the edit row is shown.
- On form submit, read colour from `document.getElementById(`team-edit-color-${t.id}`).dataset.value`.

### 2. Add team colour (~line 414)

- Replace `<input id="new-team-color" type="color" value="#888888">` with `colorPickerHtml('new-team-color', '#FF3333')`.
- The default changes from `#888888` to `#FF3333` (first palette colour) since `#888888` is not in the palette.
- Call `initColorPicker(...)` after the add-team section is rendered.
- On form submit, read colour from `document.getElementById('new-team-color').dataset.value`.

### 3. Tile colour override (~line 847)

- Replace `<input id="tile-color" type="color">` with `colorPickerHtml('tile-color', existingColorOverride ?? '#FF3333', TILE_PALETTE)`, where `existingColorOverride` is the tile's saved `colorOverride` value if present. If `existingColorOverride` is not in `TILE_PALETTE` (legacy data), it is displayed as-is in the swatch with no palette button selected.
- The enable/disable checkbox behaviour is preserved. `campaign.ts` applies `pointer-events: none; opacity: 0.4` to the `.color-picker` wrapper when the checkbox is unchecked, and removes those styles when checked. The picker is **initially disabled** (styles applied at render time) when the checkbox starts unchecked. Toggling the checkbox does not reset `dataset.value`.
- When the checkbox is unchecked on submit, the colour override is omitted from the API payload.
- Call `initColorPicker(...)` when the tile edit panel is rendered.
- On form submit, read colour from `document.getElementById('tile-color').dataset.value`.

---

## Styling

Styles are added as a `<style>` block injected once into the page head by `colorPicker.ts` (consistent with the existing pattern in `campaign.ts` of managing its own styles). Classes used:

- `.color-picker` — `position: relative; display: inline-block`
- `.color-picker-swatch` — `width: 48px; height: 28px; border-radius: 4px; cursor: pointer; border: 1px solid #555`
- `.color-picker-popover` — `position: absolute; z-index: 100; background: #1a1a1a; border: 1px solid #555; border-radius: 6px; padding: 8px; display: flex; flex-wrap: wrap; gap: 5px; width: 220px` (fits 6 × 28px swatches + gaps per row)
- `.color-picker-popover button` — `width: 28px; height: 28px; border-radius: 4px; border: 2px solid transparent; cursor: pointer; padding: 0`
- `.color-picker-popover button.selected` — `border-color: white`
- `[hidden]` already hides the popover via the browser default

When `initColorPicker` selects a new colour it removes `selected` from all buttons in that popover and adds it to the chosen one.

---

## Verification

1. Start the dev server: `npm run dev`
2. Open the admin panel and navigate to a campaign.
3. **Team colour (edit):** Click Edit on a team — confirm the native colour input is gone, the swatch popover opens on click, selecting a colour updates the swatch and marks it selected (white border). Check the `PATCH /campaigns/{id}/teams/{id}` request payload — `color` field must contain the selected hex value.
4. **Team colour (add):** Expand "+ Add team" — confirm the picker opens and the `color` field in the `POST /campaigns/{id}/teams` payload contains the chosen hex value.
5. **Tile colour override:** Click a tile. Confirm the picker is initially greyed out when the checkbox is unchecked. Enable the checkbox — confirm the picker becomes interactive. Select a colour and save — confirm `color_override` in the `PATCH /campaigns/{id}/tiles/{id}` payload contains the chosen hex. Uncheck and save — confirm `color_override` is absent from the payload.
6. **Click outside:** Open a popover, then click elsewhere on the page — confirm it closes.
7. **Multiple pickers:** With a tile edit panel open and a team row in edit mode simultaneously, confirm that opening one popover closes the other.
8. **Escape key:** Open a popover, press Escape — confirm it closes.
9. **Legacy colour:** If a tile has a saved `colorOverride` not in the palette, confirm the swatch shows the saved colour and no palette button is marked selected.
10. Run `npm run build` to confirm no TypeScript errors.
