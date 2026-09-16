## 1. Shared helpers first (no behaviour change)

- [ ] 1.1 `zoneHasZombies` / `zombiesInZone` helper; route Move, Sprint, Charge, Bloodlust, Lifesaver, Search and Combat through it
- [ ] 1.2 Shared path validation used by Charge and Bloodlust
- [ ] 1.3 Precompute a building id per zone in `ScenarioCompiler`; replace the runtime walk in `DoorHandlers.ts:45-81`
- [ ] 1.4 `idsOfType(type)` helper for `ZombiePhaseManager.ts:269`, `:291`, `:310`, `:326`
- [ ] 1.5 Existing Vitest suites stay green

## 2. Spawn eligibility and movement skills

- [ ] 2.1 D7 Mark the building containing `playerStartZoneId`, and any building open at the start, as spawned at compile time (`ScenarioCompiler.ts:396`)
- [ ] 2.2 D7 Tests: opening a door of the starting building spawns nothing; another building still spawns once
- [ ] 2.3 D8 Sprint stops in the first zone holding zombies instead of throwing; honours Slippery; can spend a free Move (`MovementHandlers.ts:133-137`)
- [ ] 2.4 D8 Charge applies movement rules to the middle zone of a two-zone path (`SkillHandlers.ts:39-50`)
- [ ] 2.5 D8 Born Leader drops the same-zone requirement and refuses a grant the target cannot use (`SkillHandlers.ts:85`)
- [ ] 2.6 D8 Tests per skill

## 3. Zombie movement (D4)

- [ ] 3.1 `ZombieAI.getNextStep` returns every first step tied for shortest (`:122-152`)
- [ ] 3.2 Caller distributes the group across those steps round-robin per zombie type
- [ ] 3.3 Tests: four Walkers with two equal routes split two and two; a mixed group splits per type; one shortest route still moves the whole group

## 4. Small corrections

- [ ] 4.1 D10 Reject game actions from a survivor with a pending skill choice, reusing the pending-wounds gate in `ActionProcessor`; other players unaffected
- [ ] 4.2 D11 Push door-open spawn cards into a fresh `spawnContext` in the Spawn Step's shape (`DoorHandlers.ts:84-89`), so the feed shows card detail
- [ ] 4.3 D9 Matching set shuffles the deck afterwards
- [ ] 4.4 D9 Remove the no-op `NOTHING` action (`TurnHandlers.ts:4`); END_TURN already covers it
- [ ] 4.5 D9 Stop double-logging Objective and Epic crate actions (`ObjectiveHandlers.ts:78`, `EpicCrateHandlers.ts:82`, `ActionProcessor.ts:308`)
- [ ] 4.6 Tests for 4.1 and 4.2

## 5. Content

- [ ] 5.0 D1 Source the skill trees. `RULEBOOK.md:584` says they live on the physical ID Cards, so take them from official Guillotine Games / CMON material for Zombicide 2nd Edition and validate each against the shape the rulebook gives: Blue fixed, Yellow = +1 Action, Orange = pick 1 of 2, Red = pick 1 of 3. Record the source used. A character whose tree cannot be sourced does not ship
- [ ] 5.1 D1 Add Lili, Odin, Lou and Ostara (Classic, Health 3) and Tiger Sam and Bunny G (Kid, Health 2) to `CharacterRegistry` per `RULEBOOK.md:566-582`; land one at a time as each tree is confirmed
- [ ] 5.2 D1 Kid type: Health 2, Slippery once per Turn on a single Move; applies to both Tiger Sam and Bunny G
- [ ] 5.3 D1 Read `maxHealth` from the definition instead of the hardcoded 3 (`LobbyHandlers.ts:128`)
- [ ] 5.4 D1 Reject an unknown character id instead of falling back to Wanda
- [ ] 5.5 D1 Spanish names, roles and descriptions for the new characters in `src/strings/es/`
- [ ] 5.6 D2 Deal one starting weapon per survivor at random from Baseball Bat, Crowbar, Fire Axe and 3x Pistol, drawing through `src/services/Rng.ts` seeded from `GameState.seed`
- [ ] 5.7 D2 First player token goes to the Fire Axe holder instead of index 0 (`GameState.ts:491`)
- [ ] 5.8 D2 Tests: the same seed deals the same weapons; the axe holder goes first
- [ ] 5.9 D3 Enter the real zombie deck data in `SpawnRegistry`, including Rush cards and Blue-level Abominations on #019-#036
- [ ] 5.10 D3 Test the deck's composition — counts per card and per danger level — so a transcription error fails a test

## 6. Dead code

- [ ] 6.1 Delete `advanceTurnState` and `canAct` (`TurnManager.ts:152`, `:178`)
- [ ] 6.2 Delete the duplicate `DANGER_VALUES` (`ActionProcessor.ts:57`, `ZombiePhaseManager.ts:8`) and duplicate `getZombieToughness` (`ZombiePhaseManager.ts:54`, `handlerUtils.ts:113`)
- [ ] 6.3 Delete the RNG burn in `spawnZombie` (`ZombiePhaseManager.ts:341-344`) and confirm no seeded test depends on the sequence
- [ ] 6.4 Delete the full state clone in `DeckService.drawSpawnCard` and the unused living-survivors branch in `checkGameEndConditions`
- [ ] 6.5 Confirm the touched areas are smaller than before this change

## 7. Verification

- [ ] 7.1 `npm test` passes; `npm run build` type-checks
- [ ] 7.2 Two-player playtest: a new character, a dealt starting weapon with the axe holder going first, a zombie group splitting, opening the starting building, a Rush card
- [ ] 7.3 Update `RULES-REVIEW.md`: remove `D1`-`D4`, `D7`-`D11`; record `D5` as closed and intentional; refresh line numbers; note the change that fixed them
- [ ] 7.4 Confirm `RULES-REVIEW.md` has no open items left, or list what remains and why
