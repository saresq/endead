## Why

The UI still wears the military "field manual" skin (olive and amber on near-black, stencil type, hazard tape, scanlines, grain, corner brackets, chamfered panels) while the copy is now friendly rioplatense Spanish. The skin fights the new tone, dim amber-on-olive text is hard to read on a phone outdoors, and the effects stack up a lot of CSS (about 450 hand-tuned `rgba()` tints, 11,348 lines of CSS). This is stage 4 of 4 of the UI rework (stages 1–3 `board-camera-and-mobile-shell`, `feedback-and-event-log`, `lobby-and-spanish-copy` are done).

## What Changes

- **Pulp-comic palette and surfaces**: cream "paper" panels with black ink text, 2–3px ink outlines and a hard offset ink shadow, on a dark ink page and board. Comic red for primary actions and danger, comic yellow for highlight and "active" states, plus blue and green for info and success. Applies to menu, lobby, character dossier, HUD (top bar, rails, sheet, latest-event card, action buttons), modals, toasts, tooltips, item cards, trade and game-over.
- **Tokens first**: `tokens.css` is rewritten with semantic role names (`--page`, `--paper`, `--ink`, `--text`, `--accent`, `--highlight`, ...) because the old names encode the dark theme (`--bone-100` is light text, `--bg-*` are dark). Component CSS switches to the new names; hard-coded `rgba()` tints and glows are replaced by tokens or deleted. **BREAKING** for anyone referencing the old token names (only this repo's CSS).
- **Type**: display face `Bangers` (headings, buttons, big numbers, board cues) and body face `Barlow Condensed` (everything else, numbers use tabular figures). `Oswald` and `JetBrains Mono` are no longer loaded; `--font-mono` resolves to the body face.
- **Danger level** is shown by one accent colour (`--dl-accent`: blue, yellow, orange, red) on the top bar edge and danger chip, instead of retinting every surface and adding vignette, scanline, flicker and rust effects.
- **Board restyle**: `BoardTheme.ts` mirrors the new palette: ink background and walls, yellow move highlights with ink stroke, red attack wash, yellow noise and objective markers with ink outlines, survivor tokens with ink outline, yellow active-turn ring and red wound ring, comic-palette zombie fallbacks and cue colours. Hex literals still inlined in `PixiBoardRenderer.ts` move into `BoardTheme.ts`. Player identity colours stay as they are; `--player-N` tokens are aligned to `PlayerIdentities.ts`.
- **Purge dead and field-manual styles**: `.hud-log*` in `hud.css`, `.game-shell*` in `layout.css`, unused `fm-*` classes (`fm-hazard-tape*`, `fm-brackets--bone`, `fm-panel--flush`), field-manual decorations (grain, scanlines, rust stains, vignettes, hazard tape, corner brackets, chamfer `clip-path`s, flicker and pulse keyframes), and the deprecated token alias shim.
- **Net CSS shrinks**: total lines under `src/styles/` end below the 11,348-line baseline.

Out of scope: layout and breakpoints (stage 1), feedback and log behaviour (stage 2), copy (stage 3), gameplay, the dev-only map editor skin beyond what shared tokens change, new icons or illustrations, a light/dark toggle, renaming component classes (`fm-*` classes that are still used keep their names).

## Capabilities

### New Capabilities
- `visual-skin`: the pulp-comic design tokens and their use: palette, type, surface treatment, danger accent, board theme mirror, legibility (contrast, 44px targets, reduced motion), font budget, and removal of the field-manual styles.

### Modified Capabilities

(none; `openspec/specs/` has no archived specs. Stage 1's `mobile-game-shell` scenario mentions an "amber ring" on the current-turn avatar chip; the ring keeps its behaviour and now uses the highlight colour.)

## Impact

- `src/styles/tokens.css`: rewritten palette, type, radius, shadow, surface, danger and motion tokens; removes deprecated aliases, grain/rust/hazard/scanline tokens and unused keyframes.
- `src/styles/base.css`, `layout.css`, `utilities.css`: token renames, remove grain/scanline/rust/vignette/bevel rules, `.game-shell*`, `fm-hazard-tape*`, `fm-brackets--bone`, `fm-panel--flush`; `tabular-nums` on body.
- `src/styles/components/*.css` (buttons, forms, hud, lobby, menu, modals, notifications, item-card, trade, tooltip, zombie, player-avatar, icons, field-manual, editor): token renames, replace `rgba()` tints and glows with tokens, drop clip-path chamfers and decorative overlays; delete `.hud-log*`.
- `src/styles/README.md`: rewritten for the new token names.
- `index.html`: Google Fonts link loads `Bangers` and `Barlow Condensed` only; `theme-color` meta if present.
- `src/client/config/BoardTheme.ts`: new palette, new entries for colours now inlined in `PixiBoardRenderer.ts`; `KICKER` doc updated.
- `src/client/PixiBoardRenderer.ts`, `src/client/AnimationController.ts`: read colours from `BOARD_THEME`, text uses the theme font families.
- `src/client/config/ZombieTypeConfig.ts`: fallback colours aligned with zombie tokens.
- No TS behaviour, markup structure, layout or copy changes. No new dependencies. Client-only deploy (`deploy.sh endead`).
