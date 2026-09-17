## Context

`RULES-REVIEW.md` §1 lists six Critical rule violations. Investigation confirmed all six and found related duplication:

- Four separate LOS/range implementations (`handlerUtils.getDistance`, `handlerUtils.hasLineOfSight`, `ZombieAI.hasLineOfSight`, `InputController` BFS highlighting).
- `processActivations` and `activateZombieSet` in `ZombiePhaseManager` are the same 60 lines.
- `DoorHandlers` has its own spawn draw loop and deck rebuild, separate from `applySpawnDetail`.
- The Move AP pre-check in `TurnManager` duplicates, and disagrees with, the cost computed by `MovementHandlers`.
- The Zombie Phase runs Spawn and End Phase in one synchronous call, so wound decisions arrive after the round is over.
- `RESOLVE_WOUNDS` only bypasses the `NO_ACTIONS` check, so an owner cannot resolve "Is That All You've Got?" outside their turn.

The compiled state already carries everything the LOS walk needs: `zoneGeometry.cellToZone`, `zoneGeometry.zoneCells`, `edgeClassMap` (key `"x1,y1|x2,y2"`, normalized), and door state on `Zone.connections`.

Guiding principle: simplest code that plays correctly. Prefer deleting duplicates over adding parallel paths.

## Goals / Non-Goals

**Goals:**
- Fix C1–C6 as specified in `specs/`.
- Fold in same-file items: S4, S5, S6 (Hit & Run move waiver), B11, D6, dead `doubleSpawn`, dead `Zombie.activated`.
- Net reduction in code.
- Vitest coverage per capability.

**Non-Goals:**
- Tough scope (B3), friendly fire, Brute shielding and other combat items.
- Zombie group splitting (D4), noise tie-breaks (D5), zombie deck content (D3).
- Starting-building spawn exclusion (D7), character roster, starting gear.
- Removing the RNG burn in `spawnZombie`.

## Decisions

### D1. Skill choice is derived, not stored
Add `XPManager.getPendingSkillChoice(survivor): { level, options } | null`. It returns Orange options if none owned and level ≥ Orange, else Red options if none owned and level is Red. `canChooseSkill` becomes `getPendingSkillChoice(s)?.options.includes(skillId)`.
- *Why:* no flag to keep in sync; Lucky rollback, reconnects and saves all stay consistent for free.
- *Alternative:* `skillPending` flag set in `addXP` — rejected, needs clearing on every path that restores survivors.

`CHOOSE_SKILL` joins the turn-check bypass (like lobby actions); `handleChooseSkill` checks `survivor.playerId === intent.playerId`. It is not a game action, so no AP and no `checkEndTurn`.

`XPManager.unlockSkill` increments the matching free counter for `plus_1_free_*`. A new `resetSurvivorTurn(survivor)` (in `XPManager` or a small survivor util) sets actions, free counters and once-per-turn flags; `LobbyHandlers.handleStartGame` and `ZombiePhaseManager.endRound` both call it. This drops the lobby's `start_move` check that Amy's skill never matched.

Client: `GameHUD` render loop checks the local player's survivors with `getPendingSkillChoice`; if one exists and no skill modal is open, opens a `persistent: true` modal (same pattern as wound distribution) with one button per option using `SKILL_DEFINITIONS`. The modal closes when the next state has no pending choice.

### D2. `visibleZones(state, fromZoneId): Map<ZoneId, number>`
New file `src/services/LineOfSight.ts` (pure, imports only types, usable by client):

```
throw if !state.zoneGeometry
result = Map { from → 0 }
for cell in zoneCells[from]:
  for dir in N, E, S, W:
    zone = from; range = 0; (x, y) = cell
    loop:
      next = (x+dx, y+dy); nextZone = cellToZone[next]
      if !nextZone: break                                   // board edge
      if nextZone != zone:
        if edgeClassMap[edgeKey] == 'wall': break
        conn = zones[zone].connections.find(to == nextZone)
        if !conn or (conn.hasDoor and !conn.doorOpen): break
        range++; result[nextZone] = min(existing, range)
        if zones[nextZone].isBuilding: break                 // 1 zone into buildings
        zone = nextZone
      (x, y) = next
```

- The rule "stop after entering a building zone" covers all four RULEBOOK cases (street→street unlimited, street→building 1, building→street unlimited, building→building 1). Walking inside a multi-cell room or street zone is free.
- Checking the edge class per crossed edge (not just the zone connection) avoids seeing through a wall segment when two zones also share a doorway elsewhere.
- Callers:
  - `handleAttack`: `range = visibleZones(state, from).get(target)`; `undefined` → "No line of sight"; then min/max range check. Replaces `getDistance` + `hasLineOfSight`.
  - `handleLifesaver`: `get(target) === 1`.
  - `ZombieAI.findTargetZone`: compute once per zombie, survivor zone visible if present in map.
  - `InputController` attack highlighting: filter zones with zombies whose range is within weapon range.
- Delete `getDistance`, `hasLineOfSight` (handlerUtils), `ZombieAI.hasLineOfSight/checkRaycast/getZoneCells`, and the BFS in `InputController`.
- *Alternative:* extend ZombieAI's axis BFS — rejected, it follows zone connections rather than a straight cell line and cannot express the building depth rule cleanly.

### D3. Zombie activation cleanup
Delete `BREAK_DOOR` from `ZombieActionType`, `findBlockedDoor`, `breakDoor`, and all branches. `processActivations(state)` becomes `activateZombieSet(state, livingZombieIds)`. Remove the `activated` field from `Zombie` and its writes (never read).

### D4. Pending decisions: block, pause before End Phase, resume
One predicate in `ActionProcessor`:

```ts
const hasPendingWounds = (s) =>
  (s.pendingZombieWounds?.length ?? 0) > 0 ||
  Object.values(s.survivors).some(v => (v.pendingWounds ?? 0) > 0);
```

Flow in `processAction`:

```
before handler:
  if hasPendingWounds(state) and intent not in
     {DISTRIBUTE_ZOMBIE_WOUNDS, RESOLVE_WOUNDS, CHOOSE_SKILL, lobby, END_GAME, ACTIVATE_CHEAT}
     → reject "Resolve pending wounds first"

pre-check bypass (no validateTurn): DISTRIBUTE_ZOMBIE_WOUNDS, RESOLVE_WOUNDS, CHOOSE_SKILL
handlers check authority: host for distribute, owner for resolve/choose

after handler:
  wasPlayers = state.phase === Players
  if resolution action and newState.phase === Players: checkEndTurn   (as today)
  if wasPlayers and newState.phase === Zombies: executeZombiePhase
  if newState.phase === Zombies and !hasPendingWounds(newState): endRound
```

- `executeZombiePhase` = activations → spawns → `if (!hasPendingWounds) endRound`. `endRound` becomes public.
- A resolution action processed while paused in Zombies must NOT call `checkEndTurn` (survivors still have 0 actions and it would advance `activePlayerIndex`) and must NOT re-run `executeZombiePhase` — hence the `wasPlayers` guard.
- Door-open activations during Players phase only set pending state; the block covers them, no pause needed.
- Host = `state.lobby.players[0].id`, same as `handleEndGame`; server already promotes a new host when one disconnects, so a missing host does not deadlock.
- Game-end check keeps running after every action, so a death during distribution ends the game.
- *Alternative:* true pause/resume inside the activation loop — rejected, extra activations inside the spawn loop would need a resumable state machine. Deciding before End Phase is equivalent because wound timing only matters for deaths, and any death is defeat.

Client (`GameHUD`):
- Wound distribution modal: host only (unchanged).
- ITAYG picker: open for the owner whenever any owned survivor has `pendingWounds`, not only the selected one.
- New waiting banner, shown to everyone except the decider, one line per pending decision: "Host is assigning N zombie wounds in <zone>", "<survivor> is deciding Is That All You've Got?", "<survivor> is choosing a skill". Rendered from state; no new messages.

### D5. One place charges the move cost
- Delete the `MOVE` zombie pre-check in `validateTurn`.
- `deductAPWithFreeCheck`: compute `required = (usedFree ? 0 : 1) + extraCost`; if `required > actionsRemaining` throw `Not enough actions (need N)`. Remove both `Math.max(0, …)` clamps. Throwing inside the `try` in `processAction` discards the new state.
- Free check order: Move, Search, then free Melee (melee) / free Ranged (ranged), then free Combat.
- `validateTurn`'s generic "0 actions and no free action" check stays.
- Hit & Run: in `handleAttack`, after `addXP`, re-read `newState.survivors[id]`, add the free move and set `hitAndRunFreeMove = true`. `handleMove` already clears `_extraAPCost` when the flag is set.
- Pass `isMelee` into `deductAPWithFreeCheck` is out of scope; keep `_attackIsMelee`.

### D6. Door spawns reuse `applySpawnDetail`
- Make `ZombiePhaseManager.applySpawnDetail` and `getCurrentDangerLevel` public.
- `processAction` sets `newState.currentDangerLevel = getCurrentDangerLevel(newState)` after the handler (before zombie phase). `processSpawns` keeps its own refresh.
- `handleOpenDoor`: keep building BFS and "open at start" check; for each dark zone: rebuild deck if empty (extract the existing 4-line rebuild into `DeckService` or a local helper shared with `processSpawns`), draw, `applySpawnDetail(newState, zid, card[level])`.
- `applySpawnDetail`: after the Fest-mode activation of existing Abominations, skip the pool-exhaustion activation for Abominations (D6).
- Remove `doubleSpawn` from `SpawnDetail` and the second-card branch in `processSpawns`.

### D7. Tests
New Vitest files under `src/services/__tests__/`, each with small hand-built states:
- `LineOfSight.test.ts`: grid fixtures for straight street, corner, closed door, street→building depth, building→street, range values, missing geometry throws.
- `ZombieActivation.test.ts`: no door breaking; runners.
- `PendingDecisions.test.ts`: host-only distribute, owner-only resolve, block, pause then `endRound` after resolution, Medic after wounds, no `activePlayerIndex` drift.
- `MoveCost.test.ts`: cost table from spec; B11 order; Hit & Run.
- `SkillChoice.test.ts`: derivation, out-of-turn choice, non-owner rejected, free counters, Amy round 1.
- Extend `DoorHandlers.test.ts`: extra activation, pool exhaustion, live danger level.

## Risks / Trade-offs

- [Grid LOS hits an unexpected map layout (e.g. crosswalk edges, cross-tile edges)] → treat any non-wall edge with a passable zone connection as open; cover crosswalk in tests; playtest the default map.
- [Missing geometry throws inside zombie AI and blocks the round] → accepted; the user wants it reported. Compiler always produces geometry, so this indicates a real bug.
- [Game pauses in Zombies phase while the host is idle] → waiting banner tells everyone who is blocking; host migration covers disconnects.
- [Existing tests assert old behavior (door spawns skip Extra Activation, move pre-check messages, `activated` field)] → update those tests to the new specs.
- [RNG sequence on door-open spawns changes] → no persisted replays depend on it; `CLAUDE.md` RNG rules still followed.
- [Client and server drift on LOS] → both import the same `LineOfSight.ts`.
