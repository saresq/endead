## 1. Layout predicate and shell

- [x] 1.1 `layoutQueries.ts`: `deck | side | sheet` from width >= 744 and height >= 600, else orientation; keep the `data-layout` stamping
- [x] 1.2 `GameHUD.buildShell`: render the deck element for the `deck` arrangement, reusing the sheet header and body sections; stop rendering the right rail
- [x] 1.3 Delete `renderRightPanel` and its call sites
- [x] 1.4 `measureViewport`: subtract the deck height for the `deck` arrangement, the way `--hud-sheet-offset` already does for the sheet
- [x] 1.5 Move the recentre button after the deck in DOM order

## 2. Deck styling

- [x] 2.1 `hud.css`: add the deck block — fixed to the bottom, centred, `max-width: min(1400px, 100%)`, fixed height in `--hud-deck-height`, sections in a row
- [x] 2.2 Delete the rail blocks (`.hud-rail--right`, `.hud-rail__actions`, `.hud-actions__grid` and the rail-only action rules) and `renderActionRow`'s grid markup
- [x] 2.3 `clamp()` on the action label size, action button min-height and deck padding
- [x] 2.4 One `@media (max-height: 820px)` single-row collapse
- [x] 2.5 `tokens.css`: drop `--hud-right-panel-width`, add `--hud-deck-height`
- [x] 2.6 Confirm the stylesheet is no larger than before this change

## 3. Squad chips

- [x] 3.1 Add HP and AP pips to the chip overlay; keep the 44px hit area and the current-turn ring
- [x] 3.2 Check legibility at 36px on a phone before enlarging anything

## 4. Camera

- [x] 4.1 `camera.ts`: remove the upper clamp on the fitted scale (drop `MAX_FIT_SCALE` from `fitScale`, keep `MIN_ZOOM` and the 3.0 manual-zoom ceiling)
- [x] 4.2 `clampAxis`: when the scaled board is smaller than the viewport on an axis, keep it fully inside on that axis
- [x] 4.3 Update the camera unit tests for both

## 5. Feedback placement

- [x] 5.1 Latest-event card centred above the deck, capped at ~640px
- [x] 5.2 Log modal to `lg` with 12px entries

## 6. Verification

- [x] 6.1 `npm test` passes; `npm run build` type-checks
- [x] 6.2 Measure board centre → End Turn at 1920, 2560 and 3440; confirm it does not grow more than 15%
- [x] 6.3 Measure the fitted board height as a share of the space between top bar and deck at 1920 and 2560
- [x] 6.4 Screenshot pass at 1280x800, 1440x900, 1920x1080, 2560x1440, 3440x1440, 1366x700, 1024x768, iPad portrait 744x1133 and landscape 1133x744
- [x] 6.5 Confirm the phone sheet at 390x664 and the side panel at 844x390 are unchanged
- [x] 6.6 Tab order reaches the deck before the recentre button; no control clipped at any tested size
