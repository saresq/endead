## Context

- Server is authoritative. Every processed action appends a `GameState.history` entry in `ActionProcessor` step 6, merging fields from `newState.lastAction` and `newState.spawnContext`. Handlers set `lastAction` for move, attack, search, door, objective, epic crate, item use and cheat; noise, trade, end turn, organize and most skills do not. Nothing clears `lastAction` or `spawnContext`, so step 6 used to copy stale feedback into later entries (hidden only because the history modal rendered a few fields per action type).
- Zombie phase runs inside the processing of whichever action ends the last player's turn of a round (`ActionProcessor` step 5 calls `ZombiePhaseManager.executeZombiePhase` when the phase goes Players → Zombies). That is `END_TURN`, or any action that spends the last player's last action, because `checkEndTurn` then ends the turn without an `END_TURN` entry. Spawns are recorded in `spawnContext`; wounds applied directly by `applyZombieAttack` were not recorded anywhere. Multi-survivor zones and "Is That All You've Got?" defer to `DISTRIBUTE_ZOMBIE_WOUNDS` / wound-picker actions, which are logged; the round then ends (`endRound`) inside the last of those decisions.
- Client (before): `GameHUD.renderFeed()` showed `lastAction` or `spawnContext` (whichever was newer) for 3s (`FEED_TTL_MS`) with a countdown bar, a dismiss button and the Lucky reroll button. `renderLastActionEntry` marked dice `>= 4` as hits regardless of weapon. The history modal (`openHistoryModal`, opened by the Turn chip) duplicated the entry rendering in `renderHistoryEntry` and grouped by `END_TURN` while labelling groups "Turn N" (actually rounds).
- Turn state (before): top bar `hud-phaseindicator` text (`PLAYER · NAME`), `hud-topbar--my-turn` class, and the amber ring on the active squad chip. The sheet header at peek showed no turn information.
- `AnimationController` has spawn/move/death tweens on PIXI sprites; `main.ts` diffs zombies between states to trigger them. No audio files ship, so sound is not an option.
- Stage 1 defined layouts `rail | sheet | side` stamped as `data-layout` on `#game-hud`. Constraints: vanilla TS, keep it simple, no colour/token changes in CSS (stage 4), no copy rewrite (stage 3).

## Goals / Non-Goals

**Goals:**
- One source of truth for "what happened": `state.history`, rendered by one function for the card and the log.
- Result of an action visible long enough to read, and on the board where eyes are.
- Log one tap away on every layout.
- Turn status readable at sheet peek.

**Non-Goals:**
- Physics or 3D dice, a dice tray overlay, sound, haptics.
- Server-side log capping or pagination (history is small per game; revisit if payloads grow).
- New layouts, colours, i18n, copy rewrite. Labels in this stage are placeholders stage 3 will translate.

## Decisions

### D1. The card and the log both read `state.history`
The latest-event card shows the newest *displayable* history entry instead of `lastAction`/`spawnContext`. A pure helper module `src/client/ui/eventLog.ts` exports `displayableEntries(history)`, `groupByRound(entries, currentRound?)` and `boardCuesFor(prev, next)`, unit tested in `src/client/__tests__/eventLog.test.ts`. Hidden (not displayable): `JOIN_LOBBY`, `START_GAME`, `SELECT_CHARACTER`, `UPDATE_NICKNAME`, `KICK_PLAYER`, `DISCONNECT`, `RESOLVE_SEARCH`, `CHOOSE_SKILL`, `END_GAME`, `ABANDON`. Rejected: keeping `lastAction` for the card, because actions that do not set it (noise, trade, end turn) would leave an old attack on screen, and the card would disagree with the log.

`state.lastAction` is still read for exactly one thing: Lucky reroll eligibility (it holds `rollbackSnapshot`, which never goes into history). The button additionally requires the card's entry to be that survivor's `ATTACK`, so it disappears once anything newer is shown.

### D2. Fix history integrity at the source
In `ActionProcessor` step 6, copy `lastAction` fields only when its timestamp differs from the pre-action state's (`newState.lastAction?.timestamp !== state.lastAction?.timestamp`), and copy `spawnContext` only when its timestamp changed the same way and it has spawn cards or zombie wounds. Both are set with `Date.now()` inside the handler or zombie phase, so a changed timestamp means the current action produced them. The card then needs no client workaround: it just shows the newest entry. `threshold` is added to `lastAction` (set in `CombatHandlers` from `effectiveThreshold`, carried through the Lucky reroll re-run) and to the history entry copy.

### D3. Zombie wounds live in `spawnContext`
`executeZombiePhase` creates `spawnContext` (with `zombieWounds: []`) before the activation step instead of after, with a new optional `zombieWounds: { survivorId, zoneId, amount }[]`. `applyZombieAttack` calls `recordZombieWound` only when it actually adds a wound (after Tough and the "Is That All You've Got?" deferral), one record per survivor and zone, and only while `phase === Zombies`, so activations from door-open spawns during a player turn never write into the previous phase's record. Because step 6 copies `spawnContext` into the entry of the action that ran the zombie phase (`END_TURN`, or the last action of a turn that ran out of actions), no new state field or broadcast path is needed. Rejected: a separate `zombiePhaseContext` field (same lifetime as `spawnContext`, more plumbing), or diffing wounds on the client for the log (not shared, lost on reconnect).

### D4. Latest-event card replaces the timed feed
`renderFeed()` becomes `renderLatestEvent()`: newest displayable entry via the shared renderer, wrapped in `.hud-feed__body` (`role="button"`, `tabindex="0"`, `data-action="open-log"`; Enter/Space handled by a container keydown listener), plus a dismiss button and the Lucky button. The dismiss button is omitted while the Lucky button renders. State kept in `GameHUD`: `dismissedEntryTs` (the card hides while the newest entry's timestamp is not newer). Deleted: `FEED_TTL_MS`, `scheduleFeedAutoDismiss`, the timer fields, `.hud-feed__timer*` CSS and keyframes. Waiting banners (`renderWaitingBanner`) stay above the card unchanged. The card lives in the existing `.hud-feed-slot`, so its position per layout is the one stage 1 set.

### D5. One entry renderer
`EventEntry.ts` exports `renderEventEntry(entry, state, { roll? })`, using `state` for survivor names, lobby player names and zone labels, and escaping player-provided text. It replaces `renderLastActionEntry`, `renderSpawnEntry` and `GameHUD.renderHistoryEntry`. Rules:
- Handler descriptions are full sentences, so when present they replace the action label; `MOVE`/`SPRINT`/`CHARGE` ignore the description (it carries raw zone ids) and show `Move → <zone>` from the payload. `OPEN_DOOR` shows `Opened door to <zone>` plus `· zombies spawned`; `REROLL_LUCKY` is prefixed `Lucky reroll:`; `DISTRIBUTE_ZOMBIE_WOUNDS` shows `Zombie wounds in <zone>` and `Name -N`.
- Attack dice: hit test `d >= (entry.threshold ?? 4)` (fallback for entries recorded before deploy), `MISS` when hits is 0, otherwise `N hits` (plus damage each when above 1), bonus dice/damage, and the reroll line `<Lucky|Plenty of Bullets|Plenty of Shells>, rerolled:` with the discarded dice.
- Zombie-phase block (`Zombie phase`, spawns per zone as `<zone>: 2 Walker, 1 Runner`, extra activations, `Name -N` wounds) is rendered for *any* entry that carries `spawnContext`, not only `END_TURN`, because the round can end on the last action of a turn (see Context).

### D5b. Die faces
`renderDie(value, { hit, discarded, roll, index })` in `EventEntry.ts` returns a `span.die` with nine pip slots in a 3x3 CSS grid; `data-face="1..6"` selects which pips show, so it is pure CSS with no SVG or images (`role="img"`, `aria-label="5, hit"` / `"2, miss"` / `"3, discarded"`). `.die` uses a `--size` custom property: 20px default (log, and discarded reroll dice in the card), 28px in `.hud-feed`. Miss: `--bg-3` with `--bone-500` pips; hit: solid `--olive-300` with `--bg-0` pips (an early translucent variant was too close to misses on the board); discarded: faded. `.history-die` and `.event-die` are removed. Roll-in: `die--roll` (a 400ms rotate + scale keyframe, staggered 60ms per die via `--i`) is added only when the card entry's timestamp differs from `lastRolledEntryTs` stored in `GameHUD`, which is then updated, so re-renders do not replay; the entry already present on the first render (join or reconnect) records its timestamp without rolling; the keyframe is off under reduced motion. Rejected: a dice tray overlay on the board (covers the board on phones, and the card already sits where players look), and animated random faces before the result (more code for little gain).

### D6. Log stays a modal, opened from a top-bar button
The log is a `ModalManager` modal (already full-width on phones) titled `Event Log`, opened by `GameHUD.toggleLog()`. Grouping (`groupByRound`, newest first at every level):
- An entry's round is the `turn` recorded on the previous displayable entry (the first uses its own), because `entry.turn` is written after the action ran and the action that ends a round already carries the next number.
- Within a round a new player section starts after an `END_TURN` entry or whenever `playerId` differs from the current section's player (a turn can end by running out of actions with no `END_TURN`).
- `Round N` headers; the round equal to `state.turn` is marked `current` (so a round with no entries yet leaves no stale "current" label). Player separators name the lobby player (falling back to their survivor).

A Log icon button (Lucide `ScrollText`, registered in `icons.ts`, `.hud-logbtn`) sits in `hud-topbar__right` before the menu button on all layouts, with an unread dot (`.hud-iconbtn__dot`) and the existing coarse-pointer 44px hit area of `.hud-iconbtn`. `L` toggles it in `KeyboardManager` (listed in `?` help). The Turn chip also uses `open-log`. While open, `GameHUD.update` calls `modalManager.updateBody(id, html)` when the displayable count changed; the scroll container is `.modal__body`, so position is kept. Unread: `GameHUD.seenEntryCount` starts at the displayable count of the first state received (history already present on join counts as read), is set to the current count when the log opens or refreshes while open, and the dot shows when the count is greater. It counts the local player's own actions too. Rejected: a docked log panel in the rail and a sheet tab. Both need layout work stage 1 just finished, for a view players open occasionally.

### D7. Board cues via floating PIXI text
`AnimationController` takes an optional third constructor argument `FxTarget` (`fxLayer`, `cameraScale`, `zoneCenter(zoneId)`), which `PixiBoardRenderer` satisfies: it adds `layerFx` as the top child of the camera container (world coordinates, `eventMode = 'none'`) and makes `zoneCenter` public. `floatText(zoneId, text, tone: 'hit' | 'miss' | 'wound' | 'spawn' | 'info')` adds a bold `PIXI.Text` sized in screen px (22px scaled by `1 / cameraScale` at spawn), stacked upward when several cues hit the same zone at once, rising 30px over 1200ms (fully visible for the first half, then fading) with the existing `performance.now()` ticker pattern; no rise under reduced motion; destroyed at the end. Tone colours live in a new `BOARD_THEME.cue` block that mirrors existing token colours (success, bone-300, danger, danger-orange, accent). `main.ts`, in the store subscription after the existing zombie diff and only when `prevState` is a non-lobby state, plays each cue from the pure `boardCuesFor(prev, next)`:
- new `ATTACK` / `REROLL_LUCKY` entries with `hits` → `N HIT(S)` / `MISS` at `payload.targetZoneId` (a reroll has no payload, so it uses that survivor's previous `ATTACK` target);
- new `OPEN_DOOR` entries → `OPEN` at `payload.targetZoneId`;
- new entries with `spawnContext.cards` → `+N` per zone (sum of zombies; extra activations add nothing);
- survivors whose `wounds` increased → `-N` at their zone (covers zombies, friendly fire, molotov, distribution).
The first state after join or reload has no `prevState`, so no cues play. Dice themselves are shown in the card (D5b), not on the board.

### D8. Turn line and turn-start notice
`GameHUD.renderTurnLine(isMyTurn, survivor)` returns one `.hud-turnline` element used in `renderSheetHeader` (under the name, inside peek height) and under the name in the rail op card: `ZOMBIE PHASE` when `phase === GamePhase.Zombies` (e.g. paused on a wound decision), else `YOUR TURN · N AP` (`∞ AP` in cheat mode) with `hud-turnline--mine` (amber, existing token), else `WAITING FOR <active player's survivor>`. The sheet's pre-measure peek offset grows from 76px to 90px for the extra line; `BottomSheet` measures the real height afterwards. Turn-start notice in `main.ts`: when `prevState` is a non-lobby state, the game has no result, the new phase is `Players`, and the local player is active and either was not active before or the round (`turn`) changed, show `notificationManager.show({ variant: 'info', message: 'Your turn', duration: 2000 })`; if `document.hidden`, prefix `document.title` with `● ` and remove it on the next `visibilitychange` to visible. Rejected: a full-screen "YOUR TURN" splash (blocks the board, annoying in same-room play).

## Risks / Trade-offs

- [Old history entries lack `threshold`, carry stale fields] → Renderer falls back to 4+; stale fields only affect games started before deploy, and games live in memory, so a deploy restart clears them.
- [Two actions in the same millisecond produce equal `lastAction` timestamps, so the second entry would miss its feedback] → Handlers run sequentially per room with `structuredClone` work in between; collision is theoretical. If it shows up, switch the check to a monotonic action counter.
- [Moving `spawnContext` creation before activation changes when its timestamp is set] → Only used for ordering against `lastAction` in the old feed, which is removed.
- [Floating text on a heavily zoomed-out phone board is tiny] → Text is sized in screen px by dividing by container scale at spawn; no further work.
- [Cue lands off-screen when the action passes the turn] → The turn-change camera pan (`focusZone` on the next active survivor) can move the attacked zone out of view before the cue ends. Accepted for now; the card still shows the result.
- [Log modal re-render while scrolled] → Refresh keeps the scroll container and only replaces inner HTML; newest-first means the reader's position shifts only when they are at the top.
- [Card covers board on phones] → Same slot and footprint as today's feed, which stage 1 already placed; entry is compact (one description line plus dice row).
- [Lobby default map] → The lobby preselects the newest saved map; a map whose only spawn is colour-dormant produces zombie phases with no spawns. Not changed here; manual checks must pick a map with an active spawn (ENDEAD).

## Migration Plan

Server and client change together; deploy with `deploy.sh endead`. Restart ends in-memory games, so no mixed-version state. Rollback is a revert and redeploy.

## Open Questions

None blocking. Labels (`YOUR TURN`, `WAITING FOR`, `Round`, `Zombie phase`) are English placeholders for stage 3.
