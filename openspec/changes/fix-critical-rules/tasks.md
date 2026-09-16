## 0. Baseline

- [x] 0.1 Run `npm test` and record currently passing/failing tests before any change

## 1. Line of Sight (C2)

- [x] 1.1 Create `src/services/LineOfSight.ts` with `visibleZones(state, fromZoneId): Map<ZoneId, number>` per design D2 (throws "Missing zone geometry")
- [x] 1.2 Add `LineOfSight.test.ts`: straight street, corner, closed door, wall between zones sharing a doorway elsewhere, street→building 1 zone, building→building 1 zone, building→street unlimited, range values, missing geometry throws
- [x] 1.3 `handleAttack`: replace `getDistance` + `hasLineOfSight` with `visibleZones` lookup (Molotov included)
- [x] 1.4 `handleLifesaver`: require range 1 via `visibleZones`
- [x] 1.5 `ZombieAI.findTargetZone`: use `visibleZones`; delete `hasLineOfSight`, `checkRaycast`, `getZoneCells`, `DIRECTIONS`
- [x] 1.6 `InputController` attack highlighting: use `visibleZones` + weapon range; delete BFS
- [x] 1.7 Delete `getDistance` and `hasLineOfSight` from `handlerUtils.ts` and unused imports

## 2. Zombie activation (C3)

- [x] 2.1 Remove `BREAK_DOOR` from `ZombieActionType`, delete `findBlockedDoor` and all `BREAK_DOOR` branches
- [x] 2.2 Delete `ZombiePhaseManager.breakDoor`
- [x] 2.3 Replace `processActivations` body with `activateZombieSet(state, livingZombieIds)`
- [x] 2.4 Remove `Zombie.activated` from type, `spawnZombie`, `endRound`, `activateZombieSet`
- [x] 2.5 Add `ZombieActivation.test.ts`: target behind closed door → no move, door stays closed; Runner moves then attacks

## 3. Move cost (C5, S6, B11)

- [x] 3.1 Delete zombie-zone Move pre-check in `validateTurn`
- [x] 3.2 `deductAPWithFreeCheck`: throw when `(usedFree ? 0 : 1) + extraCost > actionsRemaining`; remove `Math.max(0, …)` clamps
- [x] 3.3 Reorder free attack consumption: free Melee/Ranged before free Combat
- [x] 3.4 `handleAttack` Hit & Run: re-read survivor after `addXP`, add free move and set `hitAndRunFreeMove`
- [x] 3.5 Add `MoveCost.test.ts`: 3 AP/3 zombies rejected, 4 AP/3 zombies ok, free move + zombies, Slippery, Sprint, B11 order, Hit & Run move

## 4. Building spawn (C6, D6)

- [x] 4.1 Make `applySpawnDetail`, `getCurrentDangerLevel` public in `ZombiePhaseManager`
- [x] 4.2 Refresh `currentDangerLevel` after the handler in `processAction`
- [x] 4.3 Extract empty spawn deck rebuild into one helper used by `processSpawns` and door spawns
- [x] 4.4 `handleOpenDoor`: per dark zone draw a card and call `applySpawnDetail`; delete the local zombie placement loop
- [x] 4.5 `applySpawnDetail`: skip pool-exhaustion activation for Abominations after Fest activation
- [x] 4.6 Remove `doubleSpawn` from `SpawnDetail` and its branch in `processSpawns`
- [x] 4.7 Extend `DoorHandlers.test.ts`: Extra Activation on door open, pool exhaustion, live danger level, Fest single activation

## 5. Pending decisions (C4)

- [x] 5.1 Add `hasPendingWounds(state)` helper
- [x] 5.2 `processAction`: reject non-resolution actions while `hasPendingWounds` (allow DISTRIBUTE_ZOMBIE_WOUNDS, RESOLVE_WOUNDS, CHOOSE_SKILL, lobby, END_GAME, ACTIVATE_CHEAT)
- [x] 5.3 Move `RESOLVE_WOUNDS` and `CHOOSE_SKILL` to the turn-check bypass with `DISTRIBUTE_ZOMBIE_WOUNDS`
- [x] 5.4 `handleDistributeZombieWounds`: reject unless sender is `lobby.players[0]`
- [x] 5.5 `handleResolveWounds`: reject unless sender owns the survivor
- [x] 5.6 `executeZombiePhase`: skip `endRound` while wounds are pending; make `endRound` public
- [x] 5.7 `processAction`: run zombie phase only on Players→Zombies transition; run `endRound` when phase is Zombies and nothing is pending; skip `checkEndTurn` for resolution actions while in Zombies phase
- [x] 5.8 Add `PendingDecisions.test.ts`: host-only distribute, owner-only resolve out of turn, MOVE blocked, round pauses and resumes, Medic heals distributed wounds, `activePlayerIndex` unchanged by resolution, death → defeat

## 6. Skill progression (C1, S4, S5)

- [x] 6.1 Add `XPManager.getPendingSkillChoice(survivor)`; rewrite `canChooseSkill` on top of it
- [x] 6.2 `handleChooseSkill`: reject unless sender owns the survivor
- [x] 6.3 `unlockSkill`: increment matching free counter for `plus_1_free_*`
- [x] 6.4 Add shared `resetSurvivorTurn(survivor)`; use it in `handleStartGame` and `endRound`
- [x] 6.5 Add `SkillChoice.test.ts`: Orange/Red derivation, Lucky rollback clears choice, out-of-turn choice, non-owner rejected, invalid skill rejected, free counter immediate, Amy free move round 1

## 7. Client

- [x] 7.1 `GameHUD`: undismissable skill choice modal for the owner's survivor with pending choice
- [x] 7.2 `GameHUD`: open ITAYG picker for any owned survivor with pending wounds (not only selected)
- [x] 7.3 `GameHUD`: waiting banner for non-deciders (host wound distribution, ITAYG owner, skill choice)
- [ ] 7.4 Manual playtest on default map: shooting lines, zombie movement at closed doors, move cost prompt, door spawn, wound pause/resume, skill modal at Orange

## 8. Wrap-up

- [x] 8.1 Run `npm test` and `tsc`; update legacy tests that assert removed behavior
- [x] 8.2 Mark C1–C6, S4, S5, S6 (move part), B11, D6 as fixed in `RULES-REVIEW.md`
