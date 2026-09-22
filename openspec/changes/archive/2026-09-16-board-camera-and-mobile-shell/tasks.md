## 1. Camera model in the renderer

- [x] 1.1 Add `boardBounds` computation in `renderTiles` (min/max of placed tiles in world px) and a `viewport` rect field defaulting to the full canvas in `PixiBoardRenderer`
- [x] 1.2 Add `setViewport(rect)`, `fitBoard()`, `focusZone(zoneId, { scale?, onlyIfOffscreen?, animate? })` and a private `clampPan()`; track `cameraMode: 'fitted' | 'user'` (drag/zoom sets `user`, `fitBoard` sets `fitted`); camera-driven moves use `coverPose` so board edges stay off-screen
- [x] 1.3 Call `clampPan()` after drag, pinch and wheel zoom; make min zoom the fitted scale
- [x] 1.4 Call `fitBoard()` after the first `renderTiles` and after `tileService.loadAssets()` resolves; re-fit on `setViewport` only when `cameraMode === 'fitted'`, otherwise re-clamp
- [x] 1.5 Implement the 300ms eased pan for `focusZone` using the `performance.now()` pattern from `animateMove`; skip animation under `prefers-reduced-motion`
- [x] 1.6 Touch: tap threshold 300ms / 12px hypot; double-tap detection (300ms, 24px) → `focusZone(zone, 1.0)` when scale < 1 else `fitBoard()`
- [x] 1.7 Unit tests under `src/client/__tests__/` for fit scale, centring, clamp and the 0.55 fall-through rule (pure functions extracted for testability)

## 2. Wiring in main and keyboard

- [x] 2.1 `app.init` in both `startRoom` and the editor path: `resolution: Math.min(devicePixelRatio, 2)`, `autoDensity: true`, `roundPixels: true`
- [x] 2.2 In the store subscription in `main.ts`, on `activePlayerIndex` change call `renderer.focusZone(activeSurvivorZone, { onlyIfOffscreen: true, animate: true })`
- [x] 2.3 `KeyboardManager`: `F` and `Home` → `renderer.fitBoard()`; document in the `?` help
- [x] 2.4 Verify `MapEditor` still works with the default full-canvas viewport (no fit call there)

## 3. HUD measures the map window

- [x] 3.1 In `GameHUD.buildShell` attach a `ResizeObserver` to `.hud-map-window`, subtract the sheet's snapped height below the desktop breakpoint, and call `renderer.setViewport(rect)`; throttle to one call per animation frame
- [x] 3.2 Add the recentre button (44px, bottom-left of the map window, `pointer-events: auto`, `aria-label`) → `renderer.fitBoard()`
- [x] 3.3 Give `GameHUD` a renderer reference (constructor option) so it can call `setViewport`/`fitBoard`; keep it optional so tests without a renderer still run
- [x] 3.4 Detach the observer in `destroy()`

## 4. Bottom sheet

- [x] 4.1 Create `src/client/ui/components/BottomSheet.ts`: takes the sheet element and snap heights, handles pointer drag on handle/header with distance + velocity snapping, header tap toggles peek/half, exposes `snap(to)`, `currentHeight()`, `onSnap(cb)`; respects reduced motion
- [x] 4.2 In `GameHUD.buildShell` below the desktop breakpoint create the sheet once: handle, header (avatar, name, HP/AP pips, End Turn), action row, loadout, skills; render only inner sections on each `render()`
- [x] 4.3 CSS in `hud.css`: `.hud-sheet` fixed bottom, `100dvh` root, `svh` peek anchor, `translateY` transform, `env(safe-area-inset-bottom)`, body scroll only at full with `overscroll-behavior: contain`
- [x] 4.4 On `onSnap` re-run the map-window measurement from 3.1

## 5. Action row, squad chips, deletions

- [x] 5.1 Replace `renderActionRow` grid + tray with one horizontal row of 56x56 buttons; Objective rendered only when `currentZone.hasObjective`; End Turn moved to the sheet header
- [x] 5.2 Delete `mobileActionsTrayOpen`, `setMobileActionsTrayOpen`, the `toggle-actions-tray` handler, `.hud-actions__tray` and `.hud-actions__more` CSS
- [x] 5.3 `renderSquadRail` below the desktop breakpoint renders 36px avatar chips overlaid top-left on the board (player colour ring, amber ring for the current-turn survivor); remove the `rail-l` row from the phone grid
- [x] 5.4 Delete `src/styles/components/game-layout.css`, its import in `index.css`, `elFab` and `.hud-fab-slot`

## 6. Landscape, tablet, ergonomics

- [x] 6.1 Add the `data-layout="side"` (not rail, landscape) two-column layout: board left, 300px scrollable panel right reusing the sheet sections without snapping (the `BottomSheet` helper is not attached in landscape)
- [x] 6.2 Change the rail breakpoint to `(min-width: 744px) and (min-height: 600px)`, defined once in `src/client/ui/layoutQueries.ts`; `GameHUD` stamps `data-layout` on `#game-hud` and `hud.css` styles by it (replaces `laptopBreakpoint`). No orientation clause: a portrait viewport at least 744px wide is always at least 744px tall, so iPad portrait gets the desktop layout rather than the phone sheet. The later `desktop-board-deck` change replaced the rail itself with the bottom deck.
- [x] 6.3 `@media (pointer: coarse)`: one input rule in `forms.css` (`font-size: max(16px, 1rem)`, `min-height: 44px`, specificity above single-class input styles); 44px hit areas for the top bar menu button and turn chip via an invisible `::after` layer
- [x] 6.4 Safe areas: `env(safe-area-inset-top)` on the toast stack in `notifications.css`; left/right insets on top bar and side panel in landscape
- [x] 6.5 Replace `min-height: 100vh` in `reset.css` with `100dvh` for the game root

## 7. Verification

- [x] 7.1 `npm test` passes; `npm run build` type-checks
- [x] 7.2 Headless screenshot tour (scratchpad Playwright script `tour4.mjs`, or Playwright MCP): board fully visible and centred at 1440x900, 1024x768, 1920x1080; survivor visible at 390x664 portrait; landscape 844x390 shows board and End Turn; iPad Mini landscape uses the rail
- [x] 7.3 Manual on a real phone: sheet drag/snap, double-tap zoom, pinch, tap-to-move still confirms on second tap, no page zoom on input focus, End Turn visible with the URL bar expanded — all six passed on a real phone 2026-09-17; UI notes raised from the same pass (free-action chip overlapping the action icon, crowded top bar, duplicate search glyph, `PX`) are tracked separately
- [x] 7.4 Grep confirms no `game-layout`, `hud-fab-slot`, `hud-actions__tray` references remain
