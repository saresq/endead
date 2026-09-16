## 1. Move affordance and tap feedback

- [x] 1.1 `PixiBoardRenderer.drawBoard`: fill valid-move cells with `BOARD_THEME.zone.validMove` at `validMoveAlpha` and the pending zone with `pendingMove` at `pendingMoveAlpha`; keep the ink colour for the outline stroke
- [x] 1.2 `InputController`: replace the `console.warn` on an unreachable zone with a short `notificationManager` message; keep clearing the pending move
- [x] 1.3 Check both on a phone viewport and on desktop against the board art before tuning alphas

## 2. States

- [x] 2.1 `buttons.css`: apply the disabled treatment to `:disabled` as well as `.action-btn--disabled` / `.btn--disabled`
- [x] 2.2 Replace `opacity` with the dashed outline + muted ink text in the disabled treatments (`.action-btn--disabled`, `.btn:disabled`, `.hud-slot--empty`, `.skill-badge--used`, `.die--discarded`); verify each reaches 4.5:1
- [x] 2.3 Add a real `.action-btn--highlight` rule; delete the dead `.action-btn--available` / `--unavailable` rules
- [x] 2.4 `ActionButton.ts`: emit `aria-pressed` only for `selected`
- [x] 2.5 `KeyboardManager`: the action-key gate passes when AP is 0 but any `free*Remaining > 0`

## 3. Reachability and target sizes

- [x] 3.1 `.hud-rail__body`: `overflow-y: auto`
- [x] 3.2 `.hud-chip`: move `overflow: hidden` to `.hud-chip__img` so the 44px `::after` expander hit-tests
- [x] 3.3 Offset the toast stack below the top bar on the desktop layout
- [x] 3.4 Coarse pointers to 44px: `.hud-wound-alert`, `.hud-actions__grid > .action-btn`, `.hud-actions__skills > .action-btn`, `.fm-btn--small`, `.food-slot__eat`
- [x] 3.5 Fine pointers to 24px: move the `::after` expansion of `.hud-feed__dismiss` and `.hud-iconbtn` out of the coarse-only query
- [x] 3.6 `camera.ts`: tap ceiling 300ms → 500ms; update the `isTap` test and the stage-1 spec scenario wording

## 4. Names and copy

- [x] 4.1 One display-name helper: fall back to `characterClass` when the name matches `/^player-\d+$/i`; use it in `GameHUD`, the log, chip labels and `LobbyUI`
- [x] 4.2 `index.html`: Spanish title, description and og/twitter strings from `src/strings/es/menu.ts`; fix `og:site_name`
- [x] 4.3 Deduplicate `zombiePhase` and `free` in `src/strings/es/`; settle `Sacar` vs `Expulsar` and `Reconectando` vs `Reintentando` on one term each
- [x] 4.4 `ZombieTypeConfig.ts`: Spanish initial for Corredor
- [x] 4.5 Add overflow handling (ellipsis or wrap) wherever `white-space: nowrap` holds a long Spanish skill name: `.hud-actions__skills` labels, `.skill-badge`, `.lobby-rank-pill`

## 5. Contrast and dead code

- [x] 5.1 Ink outline on the XP bar fill and on the danger / your-turn top edge
- [x] 5.2 Delete the six `fm-brackets*` emit sites (`GameHUD`, `LobbyUI`, `MenuUI`) and the `menu-field__vignette` / `fm-brackets--rust` / `--lg` / `--amber` leftovers
- [x] 5.3 Delete `--text-disabled` if still unused after 2.2, use `--text-on-page-muted` for the board-adjacent muted text it was defined for, drop the duplicate `.truncate` and the dead `.scroll-row*`
- [x] 5.4 `tooltip.css`: resolve `max-width: 260px` vs `white-space: nowrap`

## 6. Verification

- [x] 6.1 `npm test` passes; `npm run build` type-checks
- [x] 6.2 Two-player Playwright pass: reachable zones visible at 1440x900 and 390x664; unreachable tap shows a message; End Turn reads disabled off-turn; `S` works with 0 AP and a free search; End Turn reachable at 1366x660; chip tap 4px off-centre registers
- [x] 6.3 Contrast check on every state touched in 2.2 and 5.1
- [x] 6.4 Grep confirms no `fm-brackets`, `action-btn--available`, duplicate `.truncate` or `player-\d+` name leak remains
