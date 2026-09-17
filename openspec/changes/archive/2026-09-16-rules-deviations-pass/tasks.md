## 1. Shared helpers first (no behaviour change)

- [x] 1.1 `zoneHasZombies` / `zombiesInZone` helper; route Move, Sprint, Charge, Bloodlust, Lifesaver, Search and Combat through it
- [x] 1.2 Shared path validation used by Charge and Bloodlust
- [x] 1.3 Precompute a building id per zone in `ScenarioCompiler`; replace the runtime walk in `DoorHandlers.ts:45-81`
- [x] 1.4 `idsOfType(type)` helper for `ZombiePhaseManager.ts:269`, `:291`, `:310`, `:326`
- [x] 1.5 Existing Vitest suites stay green

## 2. Spawn eligibility and movement skills

- [x] 2.1 D7 Mark the building containing `playerStartZoneId`, and any building open at the start, as spawned at compile time (`ScenarioCompiler.ts:396`)
- [x] 2.2 D7 Tests: opening a door of the starting building spawns nothing; another building still spawns once
- [x] 2.3 D8 Sprint stops in the first zone holding zombies instead of throwing; honours Slippery; can spend a free Move (`MovementHandlers.ts:133-137`)
- [x] 2.4 D8 Charge applies movement rules to the middle zone of a two-zone path (`SkillHandlers.ts:39-50`)
- [x] 2.5 D8 Born Leader drops the same-zone requirement and refuses a grant the target cannot use (`SkillHandlers.ts:85`)
- [x] 2.6 D8 Tests per skill

## 3. Zombie movement (D4)

- [x] 3.1 `ZombieAI.getNextStep` returns every first step tied for shortest (`:122-152`)
- [x] 3.2 Caller distributes the group across those steps round-robin per zombie type
- [x] 3.3 Tests: four Walkers with two equal routes split two and two; a mixed group splits per type; one shortest route still moves the whole group

## 4. Small corrections

- [x] 4.1 D10 Reject game actions from a survivor with a pending skill choice, reusing the pending-wounds gate in `ActionProcessor`; other players unaffected
- [x] 4.2 D11 Push door-open spawn cards into a fresh `spawnContext` in the Spawn Step's shape (`DoorHandlers.ts:84-89`), so the feed shows card detail
- [x] 4.3 D9 Matching set shuffles the deck afterwards
- [x] 4.4 D9 Remove the no-op `NOTHING` action (`TurnHandlers.ts:4`); END_TURN already covers it
- [x] 4.5 D9 Stop double-logging Objective and Epic crate actions (`ObjectiveHandlers.ts:78`, `EpicCrateHandlers.ts:82`, `ActionProcessor.ts:308`)
- [x] 4.6 Tests for 4.1 and 4.2

## 5. Content

- [x] 5.0 D1 Source the skill trees. `RULEBOOK.md:593` says they live on the physical ID Cards, so take them from official Guillotine Games / CMON material for Zombicide 2nd Edition and validate each against the shape the rulebook gives: Blue fixed, Yellow = +1 Action, Orange = pick 1 of 2, Red = pick 1 of 3. Record the source used. A character whose tree cannot be sourced does not ship
- [x] 5.1 D1 Add Lili, Odin, Lou and Ostara (Classic, Health 3) and Tiger Sam and Bunny G (Kid, Health 2) to `CharacterRegistry` per `RULEBOOK.md:575-591`; land one at a time as each tree is confirmed
- [x] 5.2 D1 Kid type: Health 2, Slippery once per Turn on a single Move; applies to both Tiger Sam and Bunny G
- [x] 5.3 D1 Read `maxHealth` from the definition instead of the hardcoded 3 (`LobbyHandlers.ts:128`)
- [x] 5.4 D1 Reject an unknown character id instead of falling back to Wanda
- [x] 5.5 D1 Spanish names, roles and descriptions for the new characters in `src/strings/es/`
- [x] 5.6 D2 Deal one starting weapon per survivor at random from Baseball Bat, Crowbar, Fire Axe and 3x Pistol, drawing through `src/services/Rng.ts` seeded from `GameState.seed`
- [x] 5.7 D2 First player token goes to the Fire Axe holder instead of index 0 (`GameState.ts:491`)
- [x] 5.8 D2 Tests: the same seed deals the same weapons; the axe holder goes first
- [x] 5.9 D3 Enter the real zombie deck data in `SpawnRegistry`, including Rush cards and Blue-level Abominations on #019-#036
- [x] 5.10 D3 Test the deck's composition — counts per card and per danger level — so a transcription error fails a test
- [x] 5.11 D1 Register the new ids in `AssetManager.ts:35` (`survivorClasses`, currently the six Classic ids only) so portraits load
- [x] 5.12 D1 Add character portraits to `public/images/characters/` for the six new survivors; only the original six `.webp` files exist. Until one is added, that character's chip and photo slot fall back to the initial (`GameHUD.renderSquadChips`)

## 6. Dead code

- [x] 6.1 Delete `advanceTurnState` and `canAct` (`TurnManager.ts:152`, `:178`)
- [x] 6.2 Delete the duplicate `DANGER_VALUES` (`ActionProcessor.ts:57`, `ZombiePhaseManager.ts:8`) and duplicate `getZombieToughness` (`ZombiePhaseManager.ts:54`, `handlerUtils.ts:113`)
- [x] 6.3 Delete the RNG burn in `spawnZombie` (`ZombiePhaseManager.ts:341-344`) and confirm no seeded test depends on the sequence
- [x] 6.4 Delete the full state clone in `DeckService.drawSpawnCard` and the unused living-survivors branch in `checkGameEndConditions`
- [x] 6.5 Confirm the touched areas are smaller than before this change

## 7. Verification

- [x] 7.1 `npm test` passes; `npm run build` type-checks
- [x] 7.2 Two-player playtest: a new character, a dealt starting weapon with the axe holder going first, a zombie group splitting, opening the starting building, a Rush card
- [x] 7.3 Update `RULES-REVIEW.md`: remove `D1`-`D4`, `D7`-`D11`; record `D5` as closed and intentional; refresh line numbers; note the change that fixed them
- [x] 7.4 Confirm `RULES-REVIEW.md` has no open items left, or list what remains and why

## Notes

- Odin's card grants `+1 Die: Melee` at Blue and offers it again at Red. Numeric skills stack, so `Survivor.skills` is a multiset and `skillCount` (`SkillRegistry.ts`) reads the copies for the dice, damage, dice-roll and max-range bonuses, server and HUD preview alike. `XPManager.gainSkill` always appends; `unlockSkill` keeps its guard so re-reaching Blue or Yellow never grants a second copy.
- `5.2` ships as `Survivor.survivorType` (`'Classic' | 'Kid'`) read from the character definition at setup, so the Kid rule is state-driven and tested (`MovementSkills.test.ts`) before either Kid character exists.
- `2.4` applies the middle-zone rule to Bloodlust as well as Charge: both read "Move up to 2 Zones to a Zone with at least 1 Zombie" and share `walkSurvivorMove`, so splitting them would have meant a flag for one caller.
- `2.5` refuses a Born Leader grant when the target's player sits earlier in this round's turn order than the leader's, since that player can never spend it.
- The lobby dossier showed each character's fixed starting weapon; with `5.6` dealing it, that panel now shows the survivor's type and health instead.
- `5.7`: with fewer than six survivors the Fire Axe may not be dealt at all — the base game always plays six, so the rulebook never faces this. The token then stays with the host.
- `7.2` live checks on ENDEAD 4×3: two players got dealt weapons (Wanda a Pistol, Doug a Crowbar, no longer the fixed loadouts); `ScenarioCompiler` grouped the map into six buildings with none wrongly pre-marked as spawned; the lobby lists all twelve survivors; Bunny G's dossier renders his ID-card tree and Kid status, and starting a game with him gives a Kid with Health 2 and Lucky, with a 40-card deck holding 12 Rush cards. The map's player start is a street zone, so D7's starting-building case is covered by Vitest only.

- `5.11`: the asset id is now a slug (`characterSlug` in `src/client/utils/characterAsset.ts`), because a character id is a display name and "Tiger Sam".toLowerCase() leaves a space in the path. `AssetManager`, the lobby grid, the HUD chips and the avatar all go through it, and it drives `survivorClasses` off `CHARACTER_DEFINITIONS` so a new survivor never needs registering twice.
- `5.12`: the six portraits are 200x200 head-and-shoulders crops of CMON's character art (`cdn.svc.asmodee.net/.../f<Name>.webp`, 926x800), cut and encoded to match the six already in the repo — which are crops of the same artwork. Approved and installed. All twelve tiles verified loading in the lobby grid.

## Sources for 5.0 and 5.9

- **Skill trees, survivor types and health**: the official Survivor ID cards published by CMON at `zombicide.com/pg/<survivor>/`, images at `cdn.svc.asmodee.net/production-zombicide/uploads/image-converter/2022/03/sic-Z2-<Name>.webp`. All twelve read directly off the cards. They disagree with `RULEBOOK.md`'s roster table, which named Tiger Sam and Bunny G as the only Kids; the cards show six Kids — Lili, Odin, Lou, Ostara, Tiger Sam and Bunny G — and CMON's own rules document confirms Bunny G. `RULEBOOK.md` was corrected.
- **Zombie deck**: per-card amounts from the ZombiDeck companion app (`github.com/dapitch666/ZombiDeck`, `data/Cards.kt`). Fan-made, so cross-checked against every figure the rulebook does give — the #1-18 / #19-36 / #37-40 split, no Abomination at Blue below #19, Abominations at Blue above it, Extra Activations being 2× Walker / 1× Brute / 1× Runner, Runners never having a Rush card, and the Blue 3 / Yellow 5 / Orange 7 / Red 9 Walker card the rulebook prints as its example. Every one matched.
- **Five skills the cards use that the code lacked** — Jump, Shove, Roll 6: +1 Die Combat, +1 to Dice Roll: Melee and +1 to Dice Roll: Combat — are all defined in `RULEBOOK.md` §12 and were implemented rather than declared, so no survivor ships with a skill that does nothing.
