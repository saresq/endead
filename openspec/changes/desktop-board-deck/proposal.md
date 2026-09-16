## Why

The desktop layout was never reworked. Stage 1 wrote "desktop rail rendering unchanged" into its own proposal, and stages 2, 3 and 4 each scoped layout out again, so the current desktop screen is the pre-rework rail with a new skin painted on it. Measured in a running game: the rail is 300px wide at 1280, 1920, 2560 and 3440; action buttons are 135x41px with 10.4px labels at every one of those; there is not one width-based media query above 744px in the stylesheet.

The deeper problem is that **the board is anchored to the centre of the window while every control is anchored to the window edge**. As the screen grows the two pull apart: the dead gap above the action grid goes 109px at 1280 → 389px at 1920 → 749px at 2560, and the distance from board centre to End Turn goes 776px → 1125px → 1899px. The most frequent loop costs about 3000px of mouse travel at 1920. Widening the rail or enlarging the type treats the symptom and leaves the divergence in place.

Two more measured facts shape the fix. The board is square and the window is 16:9, so the board is always height-limited and the left/right gutters (359px each at 1920) can never be used by the board. And `MAX_FIT_SCALE = 1.0` caps the fit, so on the current map the board never exceeds ~900px: at 2560 it fills 69% of the window height, and pressing `F` *shrinks* a board the player had zoomed to a sensible size. The cap exists only to avoid upscaling the 450px tile art, which the project is not worried about.

## What Changes

- **The right rail is replaced by a centred bottom deck.** The operative panel becomes a horizontal deck pinned to the bottom of the window, centred, capped at 1400px wide. Because the board and the deck are both centred, the distance between them stops growing with the viewport: board centre to End Turn becomes roughly 520-575px at 1920, 2560 and 3440 alike.
- **One action renderer everywhere.** The deck reuses the sheet's header, action strip, loadout and tags, so `renderRightPanel` and the two-column `.hud-actions__grid` are deleted. This also ends the Spanish label wrapping ("INTER-CAMBIAR", "TERMINAR TURNO" on two lines) that only the narrow grid caused.
- **Squad chips carry teammate state.** With the plate rail gone, the existing chip overlay gains small HP and AP pips so a player can still read the squad at a glance.
- **Three sizes scale, no new breakpoints.** Action label, button height and deck padding use `clamp()`; one `max-height` query collapses the deck to a single row on short screens. No `min-width` ladder.
- **The board fills the space it is given.** The upper cap on the fitted scale is removed, so a large screen gets a board framed to its viewport and `F` stops being a zoom-out key. Manual zoom still stops at 3.0 and the minimum zoom is still the fitted scale.
- **The pan clamp keeps a board that already fits fully inside the viewport**, instead of allowing a 900px board to be dragged into a corner of a 2560px screen.
- **Feedback moves to where the eye is**: the latest-event card is centred above the deck and capped at ~640px instead of a 1596x37px ribbon at the top of the board; the log modal grows to `lg` with 12px entries.
- **The layout predicate simplifies** to width >= 744 and height >= 600 for the deck, otherwise landscape gives the side panel and portrait the sheet. iPad portrait stops using the phone sheet.
- **Tab order follows the screen**: the recentre button moves after the deck in DOM order instead of landing fifth.

Not in this change: the defects in `hud-critical-fixes`, which ships first; a keyboard path for move and attack (deferred, it needs board focus management); any change to the phone sheet or the landscape side panel, both of which reviewers found good.

## Capabilities

### New Capabilities
- `desktop-board-deck`: the desktop and tablet in-game arrangement — board-anchored chrome, the bottom deck and its contents, viewport-invariant control distance, size scaling without breakpoints, and the camera framing that goes with it.

### Modified Capabilities

(none; `openspec/specs/` has no archived specs. Stage 1's `mobile-game-shell` rail requirement and its `board-camera` fit cap are both restated here as they now behave.)

## Impact

- `src/client/ui/GameHUD.ts`: delete `renderRightPanel`; the deck renders the sheet sections; `measureViewport` subtracts the deck height; chips gain pips; recentre button moves in DOM order.
- `src/client/ui/layoutQueries.ts`: `deck | side | sheet` predicate.
- `src/client/camera.ts`: `MAX_FIT_SCALE` 1.25; clamp keeps a fitting board fully inside.
- `src/styles/components/hud.css`: delete the rail and rail-actions blocks and the action grid; add the deck block. Net CSS should shrink.
- `src/styles/tokens.css`: drop `--hud-right-panel-width`, add `--hud-deck-height`.
- `src/styles/components/modals.css`: log modal size.
- No server changes. No new dependencies.
