## Context

All numbers below were measured in a running two-player game at 1280x800, 1440x900, 1920x1080, 2560x1440, 3440x1440 and 1366x600, by decoding screenshots rather than by eye.

The phone sheet and the landscape side panel from stage 1 were reviewed and found good (no clipped text at 300px, the whole loop thumb-reachable, board 79% of the viewport at peek). They are not touched.

`GameHUD` already renders the operative panel twice: `renderRightPanel` for the rail and `renderSheetHeader` + `renderSheetBody` for the sheet and side panel. The camera already accepts a viewport rect and already subtracts a chrome offset on phones (`--hud-sheet-offset`).

## Goals / Non-Goals

**Goals:**
- Distance from the board to the controls stops growing with the viewport.
- Controls are legible and comfortably sized on a 2560px screen.
- The board uses the space it is given.
- One rendering path for the operative panel.
- Less CSS than before, not more.

**Non-Goals:**
- Changing the phone sheet or the landscape side panel.
- A responsive type/spacing system or a breakpoint ladder.
- Docking the log as a permanent panel.
- A draggable or snapping deck.
- Keyboard board navigation.

## Decisions

### D1. Chrome is anchored to the board, not to the window edge
This is the principle the rest follows from. A centred deck under a centred board keeps their distance constant as the window grows; an edge-anchored rail cannot.

### D2. A bottom deck, not a side dock
The board is height-limited on every desktop size (at 1920 it draws 878px tall in a 951px box), so the deck spends the scarce axis: about 4-6% of board size at 1920 (877 → 835). It buys roughly 54% of the cursor travel, and the rail was already spending more width than the deck spends height for a panel the player reads twice a turn.

A vertical dock in the left/right gutter was the alternative. It costs the board nothing, which is its real argument. Rejected: travel is worse (you cross half the board width plus the gutter), it cannot hold the loadout without becoming a second rail, and at 1280 the gutter is 169px, so it needs a fallback arrangement — two layouts again.

### D3. Deck contents are the sheet sections, laid out in a row
Header (portrait, name, HP/AP pips, turn line, End Turn), loadout (two hands + bag), action strip, tags. Same markup the sheet already emits; only the flex direction and sizes differ. `renderRightPanel` and `.hud-actions__grid` are deleted, which removes the duplicate renderer and the label wrapping in one move. The deck never drags or snaps; `BottomSheet` stays phone-only.

### D4. Squad chips gain HP and AP pips
Deleting the rail deletes the squad plates, which are the only place a player reads a teammate's health and actions. The chip overlay already exists on every non-rail layout; it gains two small pip rows. Cheaper than keeping a plate strip, and it costs no vertical space.

### D5. Three `clamp()` calls, one `max-height` query
Action label `clamp(10px, 0.55vw, 13px)`, action button `min-height: clamp(44px, 3.2vh, 56px)`, deck padding likewise. One `@media (max-height: 820px)` collapses the deck to a single row (~86px) so a 1366x768 laptop keeps its board. No `min-width` breakpoints are added; a fixed-height deck also cannot clip its contents the way the `overflow: hidden` rail did.

### D6. The fitted scale has no upper cap
`fitBoard` clamps to `[MIN_ZOOM, MAX_FIT_SCALE = 1.0]`, which is why a 900px board stays 900px on a 2560px screen and why `F` shrinks a board the player had zoomed. The cap was there to avoid upscaling the 450px tile art; the project is explicitly not concerned about that, so the upper clamp is removed and the fit is bound only by the viewport and the 0.92 padding. Manual zoom keeps its 3.0 ceiling, and the minimum zoom stays the fitted scale. At 2560 the board goes 903 → ~1206px, filling the height it is given.

### D7. Clamp keeps a fitting board fully inside
`MIN_VISIBLE_FRACTION` is 35% of the board, which is 315px of a 900px board: a third of a 1280px window but an eighth of a 2560px one, so one drag parks the board in a corner. When the scaled board is smaller than the viewport on an axis, clamp it fully inside on that axis; otherwise keep the existing rule. This is the same `clampAxis` helper, plus a case.

### D8. Feedback moves to the deck's edge, the log stays a modal
The latest-event card is centred directly above the deck and capped at about 640px, so the outcome of a click appears next to the controls that caused it instead of 900-1180px away at the top of the board. The log stays a modal on `L`, widened to `lg` with 12px entries; a permanent log panel would be a second rail.

### D9. Layout predicate
`width >= 744 && height >= 600` → `deck`; else landscape → `side`; else `sheet`. This drops the orientation condition from the desktop test, so iPad portrait (744x1133) gets the deck instead of the phone sheet, which reviewers flagged as wrong. The `data-layout` mechanism and the three arrangements are unchanged.

## Risks / Trade-offs

- [The deck spends vertical space, which is what limits the board] → measured cost is 4-6% of board size at 1920, and the short-screen collapse protects laptops. If it still bites, the collapse threshold moves before the deck does.
- [128px is 17% of a 768px laptop screen] → the single-row collapse under 820px height is part of this change, not a follow-up.
- [Upscaled tile art may look soft on very large screens] → accepted by the project; the fit is bound by the viewport, and manual zoom already reached these scales without complaint.
- [Deleting `renderRightPanel` changes desktop and tablet in one step] → land `hud-critical-fixes` first so a regression has one suspect; the two changes touch the same files.
- [Chips with pips may get busy at 36px] → pips are the smallest element that carries the state; if they do not read, the chip grows before the pips shrink.

## Open Questions

None.
