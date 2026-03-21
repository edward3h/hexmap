# Live Map Auto-Refresh — Design Spec

**Date:** 2026-03-21
**Status:** Draft

## Summary

Add automatic polling to the public-facing Babylon.js map viewer so that players
opening the map on their own devices see up-to-date campaign state without
manually refreshing. The map rebuilds every 30 minutes in the background.

## Context

Players open the map URL on their own devices during a session. The GM slowly
trickles in updates (tile ownership changes, attack resolutions, score edits)
via the admin panel. Currently players must reload the page manually to see
changes. A 30-minute polling interval is sufficient — real-time push is not
required.

## Scope

Changes are confined to `src/main.ts`, `src/mapData.ts`, and `src/style.css`.
No other modules are modified.

## Architecture

### Refactor: `createScene()` returns a Promise

Currently `createScene()` fires its async work (`Promise.all([loadTileFactory,
fetchMapData])`) internally with `void` and returns `{ scene, camera }`
synchronously — before tiles and data are loaded. This is refactored so that
`createScene()` returns a `Promise<{ scene, camera }>` that resolves only after
`loadTileFactory` and `fetchMapData` have both completed and the map is fully
drawn.

### Refactor: extract `buildMap()`

A new `async buildMap()` function wraps `createScene()` plus the seven
`createKeyScene()` calls. The main scene must be created first (so
`AdvancedDynamicTexture.CreateFullscreenUI` inside each `createKeyScene()` call
attaches to the last-created scene, which is the key scene itself — correct
existing behaviour that depends on creation order). `buildMap()` returns
`{ scene, camera, keyScenes }` — the camera is returned explicitly so that
`pollRefresh` can clear its `onViewMatrixChangedObservable` observers before
disposal (see Polling section). The campaign title fetch (`fetch /api/campaigns/...`)
remains outside `buildMap()` — it is a one-time operation and does not belong
in the refresh cycle.

### Initialisation order

The `canvas` element and `engine` must be initialised before `buildMap()` is
called, as `createScene()` closes over `canvas`. `engine.displayLoadingUI()` is
called before `buildMap()`. The render loop is started **only after** the
initial `buildMap()` resolves and `currentScene` / `currentKeyScenes` are
assigned. If the initial `buildMap()` rejects (e.g. network failure on first
load), the error is caught, the loading UI is hidden, and an error message is
displayed to the user — the render loop is not started.

```ts
engine.displayLoadingUI();
buildMap()
  .then(({ scene, camera, keyScenes }) => {
    engine.hideLoadingUI();
    let currentScene = scene;
    let currentCamera = camera;
    let currentKeyScenes = keyScenes;

    engine.runRenderLoop(() => {
      currentScene.render();
      currentKeyScenes.forEach((x) => x.render());
    });

    setInterval(pollRefresh, 30 * 60 * 1000);
  })
  .catch((err) => {
    engine.hideLoadingUI();
    // display error to user
  });
```

`engine.hideLoadingUI()` is called only at initial load (success or failure) —
it is **not** called during background refreshes.

### Polling

A `setInterval` fires every 30 minutes (1 800 000 ms), calling `pollRefresh()`.

A boolean flag `refreshing` prevents concurrent overlapping refreshes. If a
tick fires while a refresh is already in progress it is silently skipped.

`pollRefresh()` logic:

1. If `refreshing` is true, return.
2. Set `refreshing = true` and call `clearHighlight()` (already imported from
   `tileDefs.ts`). `clearHighlight()`: (a) calls `disableEdgesRendering()` on
   the currently highlighted mesh and nulls the `highlighted` reference —
   preventing a call on a disposed mesh after `scene.dispose()`; (b) calls
   `overlay.hide()` on the old overlay. This must happen before `buildMap()`
   starts, because `buildMap()` → `createScene()` → `loadTileFactory()`
   reassigns the module-level `overlay` in `tileDefs.ts` — calling
   `clearHighlight()` afterwards would operate on the new overlay.
3. Call `buildMap()` and await it. Use a `try/finally` to ensure `refreshing`
   is reset regardless of outcome.
4. On success:
   - Call `currentCamera.onViewMatrixChangedObservable.clear()` to explicitly
     remove the observers registered by `createKeyScene()`. These observers are
     on the old main camera (not the key scenes' own cameras), so `scene.dispose()`
     does not automatically remove them. Clearing the observable before disposal
     ensures no stale observer can fire or hold references.
   - Dispose `currentScene` and all `currentKeyScenes`. `scene.dispose()` clears
     `registerBeforeRender` observers (including `ol.tick()`), disposes cameras,
     and detaches camera controls from the canvas.
   - Assign new values to `currentScene`, `currentCamera`, and `currentKeyScenes`.
   - Show the toast notification.
5. On failure (network error or non-OK response):
   - Current scene is left intact. No toast shown. Failure is silent —
     no `console.warn` or user notification. Intentional: a background refresh
     failure is not actionable by the player.
6. `finally`: set `refreshing = false`.

### `teamRef` clearing (`src/mapData.ts`)

`fetchMapData()` has two chained `.then()` calls: the first checks `response.ok`
and parses JSON; the second populates `teamRef`. Without clearing first, removed
teams persist across polls. Fix: at the start of the second `.then()` (the one
that receives `mapData` and populates `teamRef`), clear all existing keys:

```ts
.then((mapData) => {
  for (const key of Object.keys(teamRef)) {
    delete teamRef[key];
  }
  for (const team of mapData.teams) {
    teamRef[team.name] = team;
  }
  return mapData;
});
```

`teamRef` is only read at build time (tile creation, `showScores()`) and on user
interaction (tile click) — never inside the Babylon.js render loop. The clear
and repopulate is atomic with respect to render frames (JavaScript single-threaded
event model).

### Toast Notification

After a successful scene rebuild:

- If a `#map-refresh-toast` element already exists in the DOM (from a previous
  refresh whose animation has not yet completed), remove it first.
- Create a new `<div id="map-refresh-toast">` with text "Map refreshed" and
  append it to `document.body`.
- A CSS `@keyframes` fade-out animation runs for 2 seconds.
- An `animationend` listener removes the element from the DOM after the
  animation completes.

## Data Flow

```
Initial load:
  engine.displayLoadingUI()
  buildMap()
    → createScene() → fetchMapData() (clears+repopulates teamRef)
                    → loadTileFactory()
    → createKeyScene() × 7 (after main scene, in order)
  ├─ success → engine.hideLoadingUI()
  │            currentScene = scene; currentKeyScenes = keyScenes
  │            start render loop
  │            start setInterval (30 min)
  └─ failure → engine.hideLoadingUI(); display error

Polling tick (pollRefresh):
  refreshing? → skip
  refreshing = true
  clearHighlight()        ← before buildMap()
  try {
    buildMap()
      ├─ success → currentCamera.onViewMatrixChangedObservable.clear()
      │            dispose old scene + keyScenes
      │            assign new scene + camera + keyScenes
      │            showToast()
      └─ failure → no-op (silent)
  } finally { refreshing = false }
```

## Error Handling

- Network errors or non-OK API responses from `fetchMapData()` cause the inner
  promise to reject, which propagates through `createScene()` and `buildMap()`.
- On rejection during polling: current scene is untouched, no toast, `refreshing`
  reset to false.
- On rejection during initial load: loading screen is hidden, error displayed.
- No retry logic for polling. The next scheduled tick (30 minutes later) tries again.

## Styling (`src/style.css`)

```css
#map-refresh-toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  pointer-events: none;
  animation: toast-fade 2s forwards;
  z-index: 1000;
}

@keyframes toast-fade {
  0%   { opacity: 1; }
  70%  { opacity: 1; }
  100% { opacity: 0; }
}
```

## Known Limitations

- Backgrounded tabs still poll every 30 minutes, making unnecessary network
  requests. Acceptable for this use case.

## Out of Scope

- Configurable polling interval (fixed at 30 minutes).
- WebSocket / server-sent events.
- Error toasts or retry UI.
- Polling on the campaigns list page or admin pages.
