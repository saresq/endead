## Why

The board has no camera: the PIXI container is only ever moved by drag and zoom, so at game start the board sits at world origin, the local survivor is under the top bar, and on a phone the entire board is off-screen (a grey strip). On portrait phones the HUD takes ~85% of the viewport, landscape has no layout at all, and tablets get the phone stack. This is the first of four UI stages (camera + shell, feedback + log, lobby + Spanish copy, pulp-comic skin) and it fixes the two things that stop people from playing on the devices they actually use: phones in the same room, phones remote, and laptops.

## What Changes

- Add a camera model to `PixiBoardRenderer`: fit the board into the visible map area on first render and on resize, pan to the active survivor on turn change when it is outside the visible area, clamp panning so the board cannot be lost, expose `fitBoard()` and `focusZone()`.
- Measure the visible map area from the DOM (`.hud-map-window` rect) instead of the full window, so HUD rails never cover the board.
- Add a recentre control in the map window (`F` / `Home` on keyboard, button on touch) and double-tap on touch to toggle zoom-on-zone / fit.
- Initialise PIXI with `resolution: min(devicePixelRatio, 2)`, `autoDensity: true` so retina renders sharp.
- Rework the sub-1024px game shell: the board owns the screen; a single bottom sheet with three snap points (peek / half / full) holds the operative card, loadout and actions; squad rail collapses to avatar chips over the board.
- Replace the four-row mobile action grid and the floating "MORE" tray with one horizontal action row plus a pinned End Turn button. Objective appears inline only when the current zone has an objective.
- Add a landscape layout for phones (board left, scrollable column right) and give landscape tablets (>= 744px wide and >= 500px tall) the desktop rail layout.
- Use `dvh`/`svh` for in-game heights and apply `env(safe-area-inset-*)` on the sheet, action row and toast stack.
- Enforce 16px input font size and 44px targets on coarse pointers.
- Delete the dead `src/styles/components/game-layout.css` and the unused `.hud-fab-slot`.

Not in this stage: feedback/log, copy, i18n, visual skin, board token redesign. Tokens and colours are untouched so the later skin stage does not redo layout.

## Capabilities

### New Capabilities
- `board-camera`: framing, focusing, clamping and recentring the PIXI board relative to the visible map area; display resolution.
- `mobile-game-shell`: in-game layout below the desktop breakpoint: bottom sheet with snap points, single action row, landscape and tablet layouts, safe areas and touch ergonomics.

### Modified Capabilities

(none; `openspec/specs/` has no existing UI capabilities)

## Impact

- `src/client/PixiBoardRenderer.ts`: new camera methods, pan clamp, touch tap/double-tap; existing drag/pinch/zoom code stays.
- New: `src/client/camera.ts` (pure camera math) with `src/client/__tests__/camera.test.ts`; `src/client/ui/components/BottomSheet.ts`; `src/client/ui/layoutQueries.ts` (shared layout queries).
- `src/main.ts`: `app.init` options; call `fitBoard()` after first state; `focusZone()` on turn change.
- `src/client/ui/GameHUD.ts`: shell structure below 1024px (sheet, chips, action row), map-window rect exposure, recentre button; desktop rail rendering unchanged.
- `src/client/KeyboardManager.ts`: `F`/`Home` recentre (takes an optional renderer).
- `src/client/ui/components/icons.ts`: `LocateFixed` icon for the recentre button.
- `src/client/ui/overlays/ModalManager.ts`: unchanged; the sheet is a HUD element, not a modal.
- `src/styles/components/hud.css` (layout by `data-layout`), `src/styles/reset.css` (`dvh`), `src/styles/components/notifications.css` (safe-area top/right), `src/styles/components/forms.css` (coarse-pointer input sizing). `src/styles/tokens.css` is untouched.
- Removed: `src/styles/components/game-layout.css` and its import in `src/styles/index.css`.
- No server changes. No new dependencies.
