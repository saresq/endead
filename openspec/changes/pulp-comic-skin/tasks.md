## 1. Baseline

- [x] 1.1 Record baseline: `wc -l src/styles/*.css src/styles/components/*.css` (expect 11,348), counts of `rgba(`/hex literals per CSS file, `npm test` and `npx tsc --noEmit` passing
- [x] 1.2 Playwright "before" screenshots and element boxes (top bar, sheet, rail, action buttons, modal panel) for menu, lobby, dossier, sheet peek/expanded, rail, backpack/trade/log modals, toast, game-over at 390x844, 844x390, 1440x900; save under the scratchpad, not the repo
- [x] 1.3 Contrast script (scratchpad) that checks the D1 token pairs; confirm all pass

## 2. Tokens and fonts

- [x] 2.1 Rewrite the palette in `tokens.css` per design D1 (`--page`, `--paper*`, `--ink`, `--text*`, `--accent*`, `--highlight*`, status, `--line`, `--scrim`, `*-soft` via `color-mix`), `--player-N` equal to `PlayerIdentities.ts`, `--zombie-*` per D6
- [x] 2.2 Surface tokens per D3 (`--border`, `--border-heavy`, `--shadow`, `--shadow-lg`, `--radius*`, `--halftone`); redefine existing shadow/card/modal tokens to them
- [x] 2.3 Type tokens per D4: `--font-display` Bangers, `--font-body` Barlow Condensed, `--font-mono`/`--font-hud`/`--font-stencil`/`--font-sans` as aliases; reduce wide tracking tokens
- [x] 2.4 Danger per D5: `--dl-accent` and `--dl-accent-text` default plus four `[data-danger]` one-liners
- [x] 2.5 Add temporary aliases mapping old names (`--bg-*`, `--olive-*`, `--amber-*`, `--rust-*`, `--bone-*`, other `--dl-*`) to the new roles so the app renders during migration; mark them `TEMP stage4`
- [x] 2.6 `index.html`: Google Fonts link for `Bangers` and `Barlow Condensed:wght@400;500;600;700` only; update `theme-color` meta if present
- [x] 2.7 `base.css`: body on `--page`, `tabular-nums`; remove grain overlay, rust-stain block, `.scanlines`, `.bevel-corner`, `.hud-readout`, `.dl-glow-panel` (after reference check); rename tokens

## 3. Component CSS migration (one file per task; property-aware mapping from D1, literal rules from D2; delete clip-path chamfers, scanlines, glows, brackets, pulse animations)

- [x] 3.1 `layout.css`: delete `.game-shell*`; migrate the rest
- [x] 3.2 `utilities.css`: delete `fm-hazard-tape*`, `fm-brackets*`, `fm-panel--flush`, `fm-panel-dot*`, `fm-diagonal-stripe*`, `.noise*`; `fm-panel`/`fm-kicker` become paper panel and display-face label
- [x] 3.3 `buttons.css`: red primary, paper secondary, yellow selected, ink outline and offset shadow, pressed = translate + no shadow, disabled without hue alone; keep 44px coarse-pointer sizes
- [x] 3.4 `forms.css`: inputs on `--paper-3` with ink border, `--highlight` focus ring, 16px input font kept
- [x] 3.5 `hud.css`: delete `.hud-log*` (keep `.hud-logbtn`); top bar edge and danger chip use `--dl-accent`; sheet, rail, op card, latest-event card, dice, log groups, turn line (`--highlight` for your turn), avatar chips ring `--highlight`; board-overlay text uses on-page tokens
- [x] 3.6 `field-manual.css`: photoslot, squadplate (active = `--highlight`), statcell on new tokens; drop corner/stripe decoration rules not reachable from TS
- [x] 3.7 `lobby.css` and `menu.css`: page with `--halftone`, paper cards, room code in display face, Start red
- [x] 3.8 `modals.css`: paper panel, heavy border, `--shadow-lg`, `--scrim` backdrop
- [x] 3.9 `notifications.css` and `tooltip.css`: paper toasts/tooltips with status soft fills, no scanlines
- [x] 3.10 `item-card.css` and `trade.css`: paper cards, accept/reject via `--success`/`--accent` soft fills, no pulses
- [x] 3.11 `player-avatar.css`, `zombie.css`, `icons.css`: player/zombie tokens, ink outlines, no scanlines or pulses
- [x] 3.12 `editor.css`: token renames only
- [x] 3.13 After each group, reload the app and fix text clipping by trimming padding or stepping font size, never by changing box size

## 4. Board

- [x] 4.1 Rewrite `BoardTheme.ts` per D6, add `font`, `search`, `objectiveMarker`, `label` entries; update header comment and `KICKER` doc to new token names
- [x] 4.2 `PixiBoardRenderer.ts`: replace all hex literals and `fontFamily` strings with `BOARD_THEME` values; entity stroke 3px ink, yellow turn ring, red wound ring
- [x] 4.3 `AnimationController.ts`: cue text uses `BOARD_THEME.font.display` and cue colours
- [x] 4.4 `ZombieTypeConfig.ts`: `colorNumeric` values match D6

## 5. Cleanup

- [x] 5.1 Remove the `TEMP stage4` aliases, all other `--dl-*` tokens, texture tokens, unused size-less decoration tokens and keyframes listed in D7; fix any remaining references
- [x] 5.2 Rewrite `src/styles/README.md` for the new token names, surface rules and danger accent
- [x] 5.3 Grep checks from the spec: no colour literals in component/base/layout/utilities CSS; no `--bone-|--olive-|--amber-|--rust-|--bg-0|--grain-` in `src/`; no `.hud-log `/`.hud-log__`/`.game-shell`/`fm-hazard-tape` in `src/styles`; no `0x[0-9a-fA-F]{6}` in `PixiBoardRenderer.ts` and `AnimationController.ts`
- [x] 5.4 `wc -l` total below 11,348; report the new total

## 6. Verification

- [x] 6.1 `npm test` and `npx tsc --noEmit` pass with no test edits
- [x] 6.2 Playwright "after" screenshots at the same screens and sizes; element boxes within 2px of baseline
- [x] 6.3 Check danger levels blue→red change only the top bar edge and danger chip; reduced motion shows no skin animation; Network tab shows only Bangers and Barlow Condensed requested
- [x] 6.4 Rerun contrast script; spot-check phone at max brightness outdoors-like (DevTools high brightness not available, so review screenshots at 390x844 for thin or low-contrast text)
