## 1. Server: history integrity and zombie wounds

- [x] 1.1 `GameState.ts`: add `threshold?: number` to `lastAction` and history entries; add `zombieWounds?: { survivorId: string; zoneId: string; amount: number }[]` to `spawnContext`
- [x] 1.2 `CombatHandlers.ts`: set `threshold: effectiveThreshold` on the ATTACK `lastAction` (reroll path keeps it)
- [x] 1.3 `ActionProcessor.ts` step 6: copy `lastAction` fields (including `threshold`) only when `newState.lastAction?.timestamp !== state.lastAction?.timestamp`; copy `spawnContext` only when its timestamp changed
- [x] 1.4 `ZombiePhaseManager.executeZombiePhase`: create `spawnContext` before the activation step; in `applyZombieAttack` record a wound in `zombieWounds` only when a wound is actually added
- [x] 1.5 Tests in `src/services/__tests__/`: noise after attack has no dice/description; move after zombie phase has no spawn context; single-survivor zone records wounds; multi-survivor zone records none; Tough-absorbed wound not recorded; attack entry carries `threshold`

## 2. Client helpers and entry renderer

- [x] 2.1 Create `src/client/ui/eventLog.ts`: `displayableEntries(history)`, `groupByRound(entries, currentRound?)` (round = previous entry's `turn`, player-turn separators at `END_TURN` boundaries, newest first), `boardCuesFor(prev, next)` per design D7
- [x] 2.2 Unit tests `src/client/__tests__/eventLog.test.ts`: filtering, two players in one round, cues for attack/miss/door/spawn/wound, no cues when history unchanged
- [x] 2.3 `EventEntry.ts`: `renderEventEntry(entry, state, { roll })` merging `renderLastActionEntry` and `GameHUD.renderHistoryEntry`; threshold-aware hit marking with 4+ fallback, `MISS` on 0 hits, reroll line, search/door text, zombie-phase block (spawns per zone, `Name -N` wounds) on `END_TURN` entries; remove the old renderers
- [x] 2.4 `renderDie(value, { hit, discarded })` in `EventEntry.ts`: `span.die` with `data-face`, pip grid, `role="img"` + `aria-label`; CSS `.die` (pips, `--size` 28px card / 20px log, hit/miss/discarded with existing tokens) replacing `.event-die` and `.history-die`
- [x] 2.5 Roll-in: `die--roll` keyframe (~400ms, staggered by `--i`, off under reduced motion); `GameHUD` applies it only when the card entry timestamp differs from `lastRolledEntryTs`

## 3. Latest-event card and Lucky

- [x] 3.1 `GameHUD`: replace `renderFeed` with `renderLatestEvent` (newest displayable entry, body `data-action="open-log"`, dismiss by `dismissedEntryTs`)
- [x] 3.2 Keep `renderLuckyRerollButton` on `state.lastAction`; hide the dismiss button while it renders
- [x] 3.3 Delete `FEED_TTL_MS`, `scheduleFeedAutoDismiss`, timer fields and cleanup, `dismiss-feed` timestamp logic, `.hud-feed__timer*` CSS and keyframes
- [x] 3.4 CSS in `hud.css` for the card body as a tappable element (existing tokens, 44px dismiss hit area on coarse pointers)

## 4. Event log

- [x] 4.1 Register `ScrollText` in `icons.ts`; add Log button with unread dot to `renderTopBar` right side on all layouts; Turn chip and card use `open-log`
- [x] 4.2 Rewrite `openHistoryModal` as `toggleLog`: title `Event Log`, body from `groupByRound` + `renderEventEntry`, `Round N` headers and player separators
- [x] 4.3 In `update()`, `modalManager.updateBody` on the open log; track `seenEntryCount` and render the dot when displayable count is greater
- [x] 4.4 `KeyboardManager`: `L` toggles the log (skip when a text input is focused); add to `?` help
- [x] 4.5 CSS: round header, player separator, `.hud-iconbtn__dot`

## 5. Board cues

- [x] 5.1 `PixiBoardRenderer`: expose `zoneCenter(zoneId)`, `cameraScale` and a top `fxLayer` container for transient text; `BOARD_THEME.cue` colours
- [x] 5.2 `AnimationController.floatText(zoneId, text, tone)`: screen-sized `PIXI.Text`, rise and fade over 1200ms, no rise under reduced motion, destroy on finish
- [x] 5.3 `main.ts`: after the zombie diff, when `prevState` is non-lobby, call `boardCuesFor(prevState, newState)` and play each cue

## 6. Turn signal

- [x] 6.1 `GameHUD.renderTurnLine`: `YOUR TURN · N AP` / `WAITING FOR <survivor>` / `ZOMBIE PHASE`; place in `renderSheetHeader` under the name and in the rail op card head
- [x] 6.2 CSS `hud-turnline` and `hud-turnline--mine`; confirm the sheet peek height still fits the header on a 390x664 phone
- [x] 6.3 `main.ts`: on active player change to the local player (with `prevState`), show `Your turn` toast; if `document.hidden`, prefix title with `● ` and restore on `visibilitychange`

## 7. Verify

- [x] 7.1 `npm test` and `npm run build` pass
- [x] 7.2 Two-browser manual check on rail, sheet (390x664) and side (844x390): attack hit and miss with dice and cue, Lucky reroll after 10s wait, door open, search, zombie phase spawn and wounds in card and log, log unread dot, turn line at peek, turn toast and background tab title
- [x] 7.3 Fixes from the 7.2 browser pass (round ending by running out of actions has no `END_TURN` entry): render the zombie-phase block on any entry with `spawnContext`; start a new player section in `groupByRound` when `playerId` changes; mark the current round by `state.turn`. Unit tests added.
