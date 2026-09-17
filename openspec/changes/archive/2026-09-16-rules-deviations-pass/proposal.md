## Why

`RULES-REVIEW.md` §4 lists the last open block: the rule deviations `D1`–`D5` and `D7`–`D11`. They are lower priority than combat or card handling because none of them loses state or blocks a game, but together they are the difference between "a Zombicide-shaped game" and the game the rulebook describes. Half the character roster is missing, starting equipment is fixed instead of dealt, the zombie deck has no Rush cards and no Blue-level Abominations, a whole zombie group always walks the same way when the rules say it splits, and the building players start in can spawn zombies on top of them.

They are grouped because they share a shape: most are content or a small helper, and three of them (`D7`, `D8`, `D9`) fall out of helpers the review's §5 table already recommends.

## What Changes

- **The character roster is completed.** The six missing survivors are added per `RULEBOOK.md:575-591` — Lili, Odin, Lou and Ostara as Classic (Health 3), and Tiger Sam and Bunny G as **Kid** (Health 2, Slippery once per Turn). There are two Kids, not one. The `|| SURVIVOR_CLASSES['Wanda']` fallback that hides an unknown character is removed, and `maxHealth` stops being hardcoded to 3 at `LobbyHandlers.ts:128`. (`D1`)
- **Starting equipment is dealt, not assigned.** Each survivor draws randomly from Baseball Bat, Crowbar, Fire Axe and three Pistols instead of a fixed per-character loadout, and the first player is whoever holds the Fire Axe rather than always the host. (`D2`)
- **The zombie deck matches the rulebook.** Real card data, including the Rush cards that are never set and the Blue-level Abominations missing from cards #019–#036. (`D3`)
- **A zombie group splits between equally short routes**, distributing evenly by type, instead of the whole group following the first connection found. (`D4`)
- **The starting building cannot spawn.** The building holding the player start — and any building open at the start — is marked as already spawned at compile time. (`D7`)
- **Movement skills follow movement rules.** Sprint stops in the first zone with zombies instead of throwing, respects Slippery, and can use a free Move; Charge respects zombies in the middle zone of a two-zone path; Born Leader no longer requires the same zone and no longer grants an action to a survivor who cannot use it. (`D8`)
- **Small corrections** (`D9`): Matching set shuffles the deck afterwards; the no-op `NOTHING` action is removed; Objective and Epic crate actions stop being logged twice.
- **A pending skill choice blocks that survivor's actions** until it is made, matching "the skill is chosen on reaching the level". Other players are unaffected. (`D10`)
- **Door-open spawns appear in the event feed** with their card detail, instead of a bare "zombies spawned!". (`D11`)
- **`D5` is closed as intentional.** Breaking zombie noise ties by distance is automation the rules leave open; the review already calls it acceptable. Recorded as a decision rather than carried forward as an open item.
- **Shared helpers** from the review's §5: `zoneHasZombies` / `zombiesInZone` used by Move, Sprint, Charge, Bloodlust, Lifesaver, Search and Combat, which is what makes `D8` small; `idsOfType` in `ZombiePhaseManager`; precomputed building id per zone, which is what makes `D7` small and replaces the walk in `DoorHandlers.ts:45-81`; shared path validation for Charge and Bloodlust.
- **Dead code goes**: `advanceTurnState` and `canAct` (`TurnManager.ts:152`, `:178`), duplicate `DANGER_VALUES`, duplicate `getZombieToughness`, the RNG burn in `spawnZombie`, the full state clone in `DeckService.drawSpawnCard`, and the unused living-survivors branch in `checkGameEndConditions`.

**BREAKING**: `D2` changes how every game starts, and `D1` changes the character list players choose from.

Not in this change: combat (`B1`–`B10`) and cards, skills and inventory (`S1`–`S8`), which land first per the review's fix order.

## Capabilities

### New Capabilities
- `character-roster`: which survivors exist, their health and their types.
- `game-setup`: how starting equipment is dealt and who takes the first player token.
- `zombie-deck`: what the spawn deck contains.
- `zombie-movement`: how a zombie group chooses and splits between routes.
- `spawn-eligibility`: which buildings can spawn, and when.
- `movement-skills`: how Sprint, Charge and Born Leader interact with movement rules.
- `pending-skill-choice`: what a survivor may do while owing a skill choice.

### Modified Capabilities

(none; `openspec/specs/` holds no archived specs.)

## Impact

- `src/config/CharacterRegistry.ts`, `src/config/SkillRegistry.ts:295`, `src/services/handlers/LobbyHandlers.ts:128`: roster, Kid type, `maxHealth`.
- `src/config/SpawnRegistry.ts`: zombie deck content.
- `src/services/ZombieAI.ts:122-152`: route splitting.
- `src/services/ScenarioCompiler.ts:396`: starting building marked spawned; building id per zone precomputed.
- `src/services/handlers/DoorHandlers.ts:45-81`, `:84-89`: building lookup replaced; door spawns recorded in `spawnContext`.
- `src/services/handlers/MovementHandlers.ts:133-137`, `src/services/handlers/SkillHandlers.ts:39-50`, `:85`: Sprint, Charge, Born Leader.
- `src/services/ActionProcessor.ts`, `src/services/XPManager.ts`: pending skill choice gate.
- `src/services/handlers/ObjectiveHandlers.ts:78`, `src/services/handlers/EpicCrateHandlers.ts:82`, `src/services/ActionProcessor.ts:308`: double logging.
- `src/services/TurnManager.ts`, `src/services/DeckService.ts`, `src/services/ZombiePhaseManager.ts`: dead code and duplicate helpers.
- `src/strings/es/`: names and descriptions for the six new characters and any new message.
- Vitest per capability. RNG for the starting deal goes through `src/services/Rng.ts` and is seeded from `GameState.seed`.
- No new dependencies.
