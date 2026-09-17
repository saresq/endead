## Why

The rules review (`RULES-REVIEW.md`, §1) found six Critical deviations from Zombicide 2nd Edition that break core play: survivors never gain Orange/Red skills, ranged attacks and zombies see around corners, zombies smash closed doors, the player phase starts before zombie wounds are assigned, leaving multi-zombie zones is undercharged, and door-open spawns skip half the spawn rules. Several of these have duplicated code paths; fixing them through shared helpers makes the game correct and the code smaller.

## What Changes

- **Skill choice (C1):** When a survivor reaches Orange or Red without a skill from that level, the owner gets an undismissable "pick 1 of N" modal and sends `CHOOSE_SKILL`. The pending choice is derived from survivor data (no new state flag). `CHOOSE_SKILL` is accepted outside the owner's turn. Newly unlocked `plus_1_free_*` skills take effect immediately (S5). Starting free actions come from the same per-turn reset used at end of round, so Amy gets her free Move in round 1 (S4).
- **Line of Sight and Range (C2):** One shared `visibleZones(state, zoneId)` helper implements straight-line LOS (walls, closed doors, board edge block; LOS stops after entering a building zone) and returns the range to each visible zone. Used by combat, Lifesaver, zombie targeting and client target highlighting. Missing zone geometry is an error, not a silent fallback. **Removes** `getDistance`, BFS `hasLineOfSight`, ZombieAI's private LOS, and the client's BFS range search.
- **Zombies never break doors (C3):** No open path → zombie does not move. **Removes** `BREAK_DOOR`, `findBlockedDoor`, `breakDoor`. `processActivations` becomes a call to `activateZombieSet` over all living zombies; **removes** the ~60 duplicated lines and the unused `Zombie.activated` field.
- **Wound decisions block the game (C4):**
  - The zombie phase does not run End Phase while zombie wounds or "Is That All You've Got?" wounds are pending; it resumes once they are resolved.
  - While anything is pending, only resolution actions (plus lobby/end-game/cheat) are accepted — this also covers wounds caused mid-turn by door-open activations.
  - Zombie wound distribution is decided by the **host** only. "Is That All You've Got?" is resolved by the **survivor's owner** only, in or out of their turn.
  - All other players see who is deciding what while they wait (also for skill choices).
  - Medic now heals after wounds are applied.
- **Move cost (C5):** The Move pre-check is removed; AP deduction throws when the survivor cannot pay `base + zombies in zone left` instead of clamping to 0. Hit & Run's waiver of the zombie-leave cost works (S6, move part). Type-specific free Melee/Ranged actions are consumed before the flexible free Combat action (B11).
- **Building spawns (C6):** Door-open spawns call the same `applySpawnDetail` as the Spawn Step (Extra Activation, Rush, pool limits, Abomination rules). `currentDangerLevel` is refreshed after every action. Abomination Fest mode no longer triggers a second extra activation (D6). **Removes** the duplicated draw loop in `DoorHandlers` and the unused `doubleSpawn` card field.
- Vitest coverage for each of the above.

## Capabilities

### New Capabilities
- `skill-progression`: Orange/Red skill choice, immediate skill effects, per-turn free action reset.
- `line-of-sight`: Straight-line LOS and range shared by survivors, zombies and client.
- `zombie-activation`: Zombie movement without open paths; single activation routine.
- `pending-decisions`: Blocking wound distribution (host) and "Is That All You've Got?" (owner), game flow pause, awareness for waiting players.
- `move-cost`: Zombie-leave action cost, Hit & Run waiver, free action consumption order.
- `building-spawn`: Door-open spawning using the shared spawn rules and live danger level.

### Modified Capabilities
(none — no existing specs)

## Impact

- Server: `XPManager.ts`, `SkillHandlers.ts`, `handlerUtils.ts`, `CombatHandlers.ts`, `ZombieAI.ts`, `ZombiePhaseManager.ts`, `TurnManager.ts`, `ActionProcessor.ts`, `MovementHandlers.ts`, `DoorHandlers.ts`, `LobbyHandlers.ts`, `types/GameState.ts`.
- Client: `GameHUD.ts` (skill choice modal, waiting banner, wound modal visibility), `InputController.ts` (attack target highlighting).
- Game flow: a round can now pause in the Zombies phase until wounds are resolved.
- Seeds/replays: removing duplicated spawn code may change RNG consumption on door-open spawns; no persisted-data migration required.
- Out of scope: Tough scope (B3) and all other combat, card and deviation items stay for later passes.
