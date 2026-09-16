## Why

Two read-only UX reviews (desktop and phone/tablet, both driven through Playwright against a real two-player game) found a set of defects that make the game harder to read and play on every device. They are independent of any layout rework: a player literally cannot see which zones they can move to, a waiting player sees an End Turn button that looks pressable, and a missed tap produces no response at all. None of these needed a design decision — each is a wrong colour, a missing CSS rule, a wrong guard or a missing message.

This change ships those fixes on their own, before the desktop layout rework (`desktop-board-deck`), so the worst bugs do not wait behind a redesign and so a regression in either change has one suspect, not two.

## What Changes

- **Move affordance**: reachable and pending zones paint with the highlight yellow wash again instead of the ink colour, so the player can see where they can go.
- **Missed taps speak**: tapping an unreachable zone or outside the board shows a short message instead of a silent `console.warn`.
- **Disabled controls look disabled**: the native `disabled` attribute gets the same treatment as `.action-btn--disabled`, and the disabled treatment stops relying on `opacity` (which fails contrast at 2.79:1) in favour of the existing dashed-outline + muted-ink treatment.
- **Available ≠ pressed**: `.action-btn--highlight` gets a real CSS rule and stops borrowing `aria-pressed="true"`, which currently makes screen readers announce an available action as pressed and renders it identically to active targeting mode.
- **Keyboard parity with the buttons**: `S`, `E` and the other action keys work when AP is 0 but a free action remains, matching what the buttons already allow.
- **Reachable controls**: the right rail body scrolls instead of clipping End Turn on viewports under ~700px tall; squad chips get their intended 44px tap area; toasts stop covering the room code, log and menu buttons.
- **Touch targets left behind by stage 1**: the wound alert inside the phone sheet, the tablet rail action grid, and the trade/pickup confirm buttons reach 44px on coarse pointers; the feed dismiss and icon buttons reach 24px on fine pointers.
- **Long press selects**: the tap ceiling goes from 300ms to 500ms, matching platform convention. No gesture in the game uses long-press, so the reservation costs players and buys nothing.
- **Names**: a survivor whose name is still a generated `player-123456` id falls back to its character class, so the HUD, log, turn line and chip labels stop showing raw ids.
- **Spanish gaps from stage 3**: the `index.html` meta strings (the invite-link preview), the duplicate glossary entries, the two terms that are live in both variants, the untranslated Corredor initial, and the `nowrap`-without-overflow rules that let long skill names escape their buttons.
- **Non-text contrast**: the XP bar fill (1.07:1 on its own track) and the danger / your-turn top edge (1.26:1) get an ink outline so they are visible without changing the palette.
- **Dead code**: the six `fm-brackets*` emit sites whose CSS stage 4 deleted, the two spec-mandated tokens defined but never used, the duplicate `.truncate`, the dead `.scroll-row*`, and the tooltip's contradictory `max-width` + `nowrap`.

Not in this change: the desktop layout, the camera fit cap, the pan clamp, the event-card placement, the log modal size, iPad portrait's layout, and a keyboard path for move and attack. The first six belong to `desktop-board-deck`; the last is deferred.

## Capabilities

### New Capabilities
- `hud-affordances`: the in-game affordances a player relies on to act — move highlighting, disabled and available states, failure messages, touch and pointer target sizes, and the tap threshold.

### Modified Capabilities

(none; `openspec/specs/` has no archived specs. Stage 1's `board-camera` tap threshold and stage 4's `visual-skin` move-wash scenario are both restated here as they now behave.)

## Impact

- `src/client/PixiBoardRenderer.ts`: valid/pending move fills; `isTap` ceiling.
- `src/client/camera.ts`: tap duration constant.
- `src/client/InputController.ts`: message on an unreachable or missed tap.
- `src/client/KeyboardManager.ts`: action-key gate accounts for free actions.
- `src/client/ui/GameHUD.ts`, `src/client/ui/LobbyUI.ts`, `src/client/ui/MenuUI.ts`: display-name fallback, `fm-brackets*` removal.
- `src/client/ui/components/ActionButton.ts`: `aria-pressed` only for `selected`.
- `src/client/config/ZombieTypeConfig.ts`: Corredor initial.
- `src/strings/es/*`: duplicate keys, conflicting terms.
- `index.html`: Spanish meta strings, `og:site_name`.
- `src/styles/components/buttons.css`, `hud.css`, `notifications.css`, `item-card.css`, `tooltip.css`, `tokens.css`, `utilities.css`, `layout.css`: disabled state, highlight rule, target sizes, toast offset, contrast outlines, dead rules.
- No server changes. No new dependencies. Net CSS should not grow.
