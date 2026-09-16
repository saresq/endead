## Context

- The PIXI canvas is `resizeTo: window` and mounted in `#app`; `#game-hud` is an absolute, full-inset CSS grid painted over it. The centre cell contains `.hud-map-window`, a purely decorative dashed frame today.
- `PixiBoardRenderer.container` starts at (0,0) scale 1. Tiles are placed at `tile.x * TILE_PIXEL_SIZE` (450). The default map's first tile column is x=1, so the board spans world x 450..1800. The only code that moves the container is drag (`+= dx`) and `applyZoom` (zoom-to-cursor, clamped 0.2..3.0).
- Below 1024px the HUD stacks topbar / squad rail / centre / right rail / actions. On a 390x664 phone the centre row collapses to ~105px. The action bar is a 2-column grid of four rows plus a "MORE" tray absolutely positioned over the loadout. No orientation query exists. Tablets deliberately reuse the phone stack.
- `game-layout.css` (303 lines) defines a `.game-layout__*` shell that no TypeScript ever emits.
- Constraints: vanilla TypeScript, no framework, keep code simple. Desktop rail layout is considered fine and must not regress. Tokens/colours are reserved for the later skin stage.

## Goals / Non-Goals

**Goals:**
- Board always visible and framed on first render on every viewport.
- Camera follows the game: active survivor framed at turn change, board never lost.
- Phone portrait: board dominant, HUD as a bottom sheet with peek/half/full.
- Phone landscape and tablet get real layouts.
- Sharp rendering on retina.
- Fewer layout files, not more.

**Non-Goals:**
- Feedback, animations, event log (stage 2).
- Copy, i18n (stage 3).
- Visual skin, board token redesign, colour changes (stage 4).
- Editor camera (`MapEditor.ts`) beyond not breaking it.

## Decisions

### D1. Camera lives in the renderer as three methods, not a new class
`PixiBoardRenderer` gains `setViewport(rect)`, `fitBoard()`, `focusZone(zoneId)`, plus a private `clampPan()` called after every drag/pinch/zoom. State: `viewport: {x,y,w,h}` in screen px and `boardBounds` computed from placed tiles. A separate `Camera` class was considered and rejected: it would need the same container and bounds and only adds indirection for ~80 lines.

### D2. Visible area comes from the DOM, not the window
`GameHUD` owns the layout, so it measures `.hud-map-window.getBoundingClientRect()` via a `ResizeObserver` and calls `renderer.setViewport(rect)`. The renderer never reads the DOM. On desktop this is the centre column; on phone portrait it is the area above the sheet's current snap edge; in landscape it is the left column. When the sheet snaps, the HUD re-measures and calls `fitBoard()` only if the board was fitted (not user-panned) at that moment, otherwise it just re-clamps.

### D3. Fit rule
`fitBoard()`: scale = min(vw / boardW, vh / boardH) * 0.92, clamped to [0.2, 1.0]; centre the board in the viewport rect. If the fitted scale is below 0.55 (small phone, big map) fall through to centring the local survivor's zone at scale 0.75 so the first thing a phone player sees is their own survivor and its neighbours. Min zoom becomes the fitted scale (so the user cannot zoom the board to a dot); max stays 3.0.

### D4. Focus rule on turn change
`main.ts` already subscribes to state; on `activePlayerIndex` change it calls `renderer.focusZone(zoneOfActiveSurvivor, { onlyIfOffscreen: true })`. Ease over 300ms using the existing `performance.now()`-based tween pattern from `animateMove`; skipped under `prefers-reduced-motion`. The camera never moves during a player's own turn except by their input.

Camera-driven moves (this focus, the D3 fall-through, double-tap zoom) use a cover rule (`coverPose` in `src/client/camera.ts`): on each axis where the scaled board is larger than the viewport, the board's edges stay outside the viewport so no empty ground shows; on smaller axes the D5 clamp applies. Near a board edge the zone is therefore visible but not exactly centred. User drags, pinches and wheel zoom use only the D5 clamp. The pure camera math (fit, centre, clamp, cover, tap and double-tap tests) lives in `src/client/camera.ts` with unit tests in `src/client/__tests__/camera.test.ts`.

### D5. Pan clamp
After any pan/zoom, translate the container so that at least 35% of the board's width and height stays inside the viewport rect. Cheap, no bounce physics.

### D6. Recentre affordances
- Keyboard: `F` and `Home` → `fitBoard()`.
- A 44px icon button in the bottom-left of the map window (rendered by GameHUD, `pointer-events: auto`) → `fitBoard()`.
- Touch double-tap on a zone: if scale < 1 → `focusZone(zone, 1.0)`, else `fitBoard()`. Detected in the renderer's existing pointer handlers (two taps within 300ms and 24px). A double-tap on empty ground below scale 1.0 centres the tapped point at 1.0. A second tap on the pending move zone is a move confirmation and never zooms (the renderer checks `pendingMoveZoneId` from the last render options).

### D7. Display resolution
`app.init({ resolution: Math.min(window.devicePixelRatio, 2), autoDensity: true, antialias: true, roundPixels: true })`. Cap at 2 to limit fill cost on 3x phones. Applied in both `startRoom` and the editor init in `main.ts`.

### D8. Phone portrait shell: one bottom sheet, three snap points, CSS transform
Structure below 1024px becomes: topbar, board (full remaining height), squad chips overlaid top-left on the board, sheet fixed to the bottom, toast stack under the topbar.
- Sheet content order: handle + header (avatar, name, HP/AP pips, End Turn) → `.hud-sheet__half` block (wound alert when pending, action row, loadout: hands + bag) → `.hud-sheet__more` block (XP bar, free-action pips and skill tags) → nothing else in this stage.
- Snap points: the sheet is `85svh` tall; peek = grab area (handle + header) height, half = bottom of `.hud-sheet__half`, full = the whole sheet with the body scrolling. Heights are measured from the DOM (plus the bottom safe-area padding), so they follow content. Before the helper measures, CSS rests the sheet at ~76px.
- Implementation: the sheet's `translateY` is set from JS on pointer drag of the handle/header, snapping to the nearest point on release using distance plus a velocity threshold; header tap toggles peek/half. ~60 lines in a small `BottomSheet` helper in `src/client/ui/components/`. No library.
- The map viewport rect for D2 is the board area minus the sheet's current snapped height, capped at the half height, so the board is never hidden behind the sheet in peek or half; in full the board stays framed above the half line and is partially covered, which is acceptable because the user asked for it. The same offset is exposed as `--hud-sheet-offset` so the recentre button rides above the sheet.
- On phone layouts the event feed is overlaid on the board below the squad chips instead of taking layout space.
- Reduced motion: snaps without transition.

### D9. Action row
Replace the grid + MORE tray with `.hud-actions` as one horizontal, scrollable row of 56x56 icon+label buttons: Search, Noise, Door, Trade, Objective (only when `currentZone.hasObjective`), skill actions. End Turn is a separate, wider, pinned button at the right edge of the sheet header so it is thumb-reachable and always visible in peek. The desktop rail keeps its current grid. `mobileActionsTrayOpen`, `setMobileActionsTrayOpen` and the tray markup are deleted.

### D10. Squad chips
Below 1024px, `renderSquadRail` renders 36px avatar chips with the player colour ring and an amber ring for the current-turn survivor, overlaid on the board's top-left with `pointer-events: auto`. Tap selects that survivor (existing behaviour). The full plates stay on desktop. The rail row is removed from the phone grid, giving the board ~50px back.

### D11. Landscape phone and tablet
- Three layouts: `rail` (desktop and tablet landscape), `sheet` (phone portrait), `side` (phone landscape).
- Rail query: `(min-width: 744px) and (min-height: 500px) and (orientation: landscape)`, so iPad Mini landscape (1133x744, 1024x744) and larger get the rail. The `min-height` keeps wide landscape phones (844x390) out of the rail. Portrait tablets use the phone sheet, which works fine at 744-768px wide.
- Side layout (not rail, landscape): two columns, board `1fr` left, a 300px column right (plus the right safe-area inset) that holds the same sheet element as a scrollable panel with no snapping; the `BottomSheet` helper is not attached. Squad chips stay overlaid on the board.
- The queries are defined once in `src/client/ui/layoutQueries.ts` (`RAIL_LAYOUT_QUERY`, `LANDSCAPE_QUERY`, `resolveHudLayout`). `GameHUD` resolves them with `matchMedia`, stamps `data-layout="rail|sheet|side"` on `#game-hud` and re-renders on change; `hud.css` styles by that attribute and never repeats the media queries. `laptopBreakpoint` is removed.
- Only one of right rail / sheet carries the operative markup at a time, so element ids such as `btn-end-turn` stay unique.

### D12. Heights, safe areas, inputs
- `#game-hud` height is `100dvh` (with a `100vh` fallback); the sheet height uses `svh` so snap points never jump with the URL bar. `body` gets `min-height: 100dvh` in `reset.css`.
- `env(safe-area-inset-bottom)` on the sheet and action row, `env(safe-area-inset-top)` on the toast stack, left/right insets on topbar and rails in landscape.
- `@media (pointer: coarse)`: one rule in `forms.css` gives every text input and select `font-size: max(16px, 1rem)` and `min-height: 44px`, using an `:is(...):not(...)` selector whose specificity beats single-class input styles (`.fm-input`, `.menu-input`, `.lobby-area__select`) regardless of import order; `menu.css` and `lobby.css` are not edited. The topbar menu button and turn chip get 44px hit areas from an invisible centred `::after` layer, so the visible glyphs do not grow. Squad chips extend their tap area the same way.
- Touch tap threshold in the renderer: tap if release within 300ms and hypot < 12px, else pan (today 6px per axis).

### D13. Rendering the sheet body without re-creating it
The sheet element is created once in `buildShell()`; `render()` only replaces the inner sections' `innerHTML` as today. The `BottomSheet` helper keeps snap state across renders, matching the existing pattern where `mobileActionsTrayOpen` survived renders.

### D14. Deletions
`game-layout.css` and its import, `.hud-fab-slot` and `elFab`, `.hud-actions__tray`/`__more` CSS and code, the standalone `actions` grid area, and `renderFieldLog` (unused now that the rail tail shows actions and phones hid the log). The `.hud-log` CSS is left in place for the stage-4 purge. Nothing else in `layout.css` is touched in this stage; the dead `.game-shell` there is left for the stage-4 purge.

## Risks / Trade-offs

- [ResizeObserver fires during sheet drag, causing fit thrash] → Only re-fit when `cameraMode === 'fitted'`; while dragging the sheet, throttle to one measure per frame and only re-clamp.
- [Editor uses the same renderer and has no `.hud-map-window`] → `setViewport` defaults to the full canvas when never called; `MapEditor` keeps current behaviour.
- [Pan clamp fights pinch-zoom at the edges] → Clamp is applied after the zoom transform, using the post-zoom bounds; 35% rule leaves room.
- [Double-tap conflicts with tap-to-confirm move] → Double-tap is only recognised when the second tap lands within 24px of the first, and the renderer skips the zoom when the tapped zone is the pending move zone, so the second tap confirms the move as before.
- [Long press no longer selects] → Per the tap threshold, a touch held longer than 300ms counts as a pan and does not fire a tap. Slow tappers may notice; revisit after the real-phone check.
- [Sheet drag steals board pan gestures] → Drag starts only on the handle/header; the body scrolls natively at full.
- [Changing the tablet breakpoint changes which screenshots users are used to] → Tablet layout was explicitly phone-stack "by design" comment; user confirmed tablet is not a primary device.

## Migration Plan

Client-only, deploy with `deploy.sh endead`. Rollback is a revert. No data changes.

## Open Questions

None. Resolved with the user:
- Fit scale is capped at 1.0 on large screens so tile art stays crisp.
- Peek shows the header only (avatar, name, HP/AP pips, End Turn); actions are one swipe away.
