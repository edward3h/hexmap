# Live Map Auto-Refresh — Design Spec

**Date:** 2026-03-21
**Status:** Approved

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

Changes are confined to `src/main.ts` and `src/style.css`. No other modules
are modified.

## Architecture

### Polling

- A `setInterval` is registered in `main.ts` after the initial scene load,
  firing every 30 minutes (1 800 000 ms).
- On each tick: call the existing `fetchMapData()`, dispose the current
  Babylon.js scene, then rebuild the scene using the same code path as initial
  load.
- The existing `Engine` instance is reused; only the `Scene` is disposed and
  recreated.

### Toast Notification

- After a successful scene rebuild, a `<div id="map-refresh-toast">` is
  injected into (or reused from) the page DOM.
- Positioned fixed, top-right corner, above the canvas.
- Text: "Map refreshed".
- A CSS `@keyframes` fade-out animation runs for ~2 seconds, after which the
  element is hidden.
- On each successful refresh the animation is reset (remove/re-add the element
  or toggle a class) so it plays again if triggered multiple times.

### Error Handling

- If `fetchMapData()` throws (network error, non-OK response), the refresh is
  silently skipped.
- The existing scene is left intact.
- No toast is shown on failure.
- No retry logic — the next scheduled tick will attempt again in 30 minutes.

## Data Flow

```
setInterval (30 min)
  └─ fetchMapData()          ← existing function, no changes
       ├─ success → scene.dispose() → createScene() → showToast()
       └─ failure → no-op (silent)
```

## Styling

- Toast uses a simple CSS fade-out animation defined in `src/style.css`.
- Positioned `fixed`, `top: 1rem`, `right: 1rem`.
- No external libraries.

## Out of Scope

- Configurable polling interval (fixed at 30 minutes).
- WebSocket / server-sent events.
- Error toasts or retry UI.
- Polling on the campaigns list page or admin pages.
