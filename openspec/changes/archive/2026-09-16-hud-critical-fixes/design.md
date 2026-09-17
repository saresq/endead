## Context

Every item here was verified twice: once by a reviewer in a running two-player game, once against the source. No item requires a design decision — where a choice existed it is recorded below.

The four UI stages are implemented but not archived, and nothing is committed, so this change lands on an uncommitted working tree.

## Goals / Non-Goals

**Goals:**
- A player can always see where they can move, and always gets a response to a tap.
- A control's appearance matches whether it can be used.
- Controls are reachable: nothing clipped off-screen, nothing under the minimum target size.
- No raw player ids in player-facing text.

**Non-Goals:**
- Layout, camera framing and the desktop rethink (`desktop-board-deck`).
- A keyboard path for move and attack (deferred; it needs board focus management).
- `forced-colors` / `prefers-contrast` support (nobody has asked; premature).
- Gating `/editor` in production (real, but a separate concern).

## Decisions

### D1. Move wash uses the palette colour, outline keeps the ink colour
`PixiBoardRenderer` fills valid and pending move cells with `BOARD_THEME.zone.validMoveHighlight` / `pendingMoveHighlight`, both `0x1a1614` (ink). The intended `validMove` / `pendingMove` (`0xffcc1a`) and their alphas are only used in a branch that never runs once real tiles load. Fix: fill with `validMove` / `pendingMove` at `validMoveAlpha` / `pendingMoveAlpha`, keep the ink colour for the stroke. This restores stage 4's own scenario ("reachable zones show a yellow wash with an ink outline").

### D2. Disabled state drops opacity
`.action-btn--disabled` and `.btn:disabled` express the state with `opacity`, which drags text to 2.79:1 and 2.29:1. The dashed outline already carries the meaning. Fix: remove the opacity, keep the outline, set the text to the muted ink token. Same for `.hud-slot--empty` (2.09:1), `.skill-badge--used` (1.46:1) and `.die--discarded` (2.20:1). This is not a palette change; static token pairs already pass.

### D3. `aria-pressed` is not a styling hook
`ActionButton` emits `aria-pressed="true"` for both `selected` (targeting mode active) and `highlight` (action available here), and `buttons.css` styles `[aria-pressed="true"]`. Fix: `aria-pressed` only for `selected`; add a real `.action-btn--highlight` rule (yellow left edge, no pressed semantics). Delete the dead `.action-btn--available` / `--unavailable` rules that no TypeScript emits.

### D4. Free actions are actions
`KeyboardManager` returns early when `actionsRemaining < 1`, above every action key, while the Search button stays enabled when `freeSearchesRemaining > 0` and `TurnManager` does not end the turn in that state. Fix: the gate also passes when any `free*Remaining > 0`; the per-action checks already exist below it.

### D5. Tap ceiling 500ms
`isTap` uses 300ms. Nothing in the game uses long-press, so a slow, deliberate tap is discarded for no benefit. 500ms matches the platform convention. The 12px distance threshold is unchanged, and the double-tap window stays 300ms.

### D6. Display name falls back to the character class
`survivor.name` is the lobby player name, which defaults to `player-${random}` when nobody sets a nickname. One accessor used by every renderer: if the name matches `/^player-\d+$/i` and `characterClass` exists, show the class. No server change, no lobby change.

### D7. Rail body scrolls
`.hud-rail` is `overflow: hidden` and `.hud-rail__body` has `height: 100%` with no overflow, so below ~700px of viewport height the action grid is clipped with no scrollbar and End Turn is unreachable. Fix: `overflow-y: auto` on `.hud-rail__body`. `desktop-board-deck` may delete this element; the one-line fix ships anyway as insurance.

### D8. Chip hit area
`.hud-chip` has `overflow: hidden` (to clip the avatar image) which also clips its `::after` 44px expander for hit-testing. Fix: move `overflow: hidden` onto `.hud-chip__img`, which already fills the chip.

### D9. Toasts clear the top bar
`--z-toast` (500) is above the HUD (200) and the stack starts at `top: 16px`, landing on the room code, log and menu buttons. Fix: on the rail/desktop arrangement offset the stack below the top bar height. Phone toasts already sit below it.

### D10. Target sizes
Stage 1's 44px rule never reached `buttons.css`, which has no `pointer: coarse` block. Coarse pointers: the wound alert in the phone sheet, the tablet rail action grid and skill buttons, `.fm-btn--small` (trade, pickup), `.food-slot__eat`. Fine pointers: `.hud-feed__dismiss` (22px) and `.hud-iconbtn` (28px) reach 24px by moving their `::after` expansion out of the coarse-only query.

## Risks / Trade-offs

- [The move wash may read as too strong on the new cream/ink palette] → the alphas (0.35 valid, 0.2 pending) are the values stage 4 chose for this palette; check on a phone before tuning.
- [Removing opacity from disabled states may make them look enabled] → the dashed outline plus muted text is the treatment stage 4 defined for exactly this; verify against a disabled End Turn during an opponent's turn.
- [Raising the tap ceiling could make a slow drag register as a tap] → the 12px distance check is unchanged and is what actually separates the two.
- [`desktop-board-deck` touches the same files] → land this change first, verify, then start the deck.

## Open Questions

None.
