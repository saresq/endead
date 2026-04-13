# Endead - Comprehensive Codebase Review

Review date: 2026-04-11  
Scope: Game rules accuracy (vs Zombicide 2nd Edition), missing features, code quality.

---

## 1. Zombicide v2 Rules Issues

### 1.1 Combat System

**Target Priority Order is Wrong**  
`ActionProcessor.ts:910-917` — The priority order is Walker(1) < Fatty(2) < Abomination(3) < Runner(4), meaning Walkers are hit first. Per the Zombicide v2 rulebook (RULEBOOK.md §10), the correct Targeting Priority Order is: **1. Brute or Abomination** (shooter chooses between them), **2. Walker**, **3. Runner**. Brutes/Abominations must be eliminated first before hits can go to Walkers, and Runners are last. This is purely type-based — there is no distance component. The current code has the order essentially reversed.

**One Hit Per Zombie, Not One Hit = One Kill**  
`ActionProcessor.ts:953-978` — Each hit is consumed whether or not it kills the zombie. In Zombicide v2, a single successful hit that meets the damage threshold kills that zombie — but if damage is insufficient, the hit is **wasted** (no wound tracking on zombies, except Abominations via house rules). The code gets this right for the kill check but deducts `hits--` even when the zombie survives (`line 977`), which means a failed hit against a Fatty still "uses up" a success. This is actually correct per v2 rules (hits are allocated one at a time), but the naming/comment is misleading.

**Molotov Has No Special Implementation**  
`EquipmentRegistry.ts:96-104` — Molotov has `dice: 0, accuracy: 0, damage: 3`. In Zombicide v2, Molotov kills ALL zombies in a target zone automatically (no roll needed) and wounds ALL survivors in that zone. The current implementation would roll 0 dice and hit nothing. It needs a completely separate handler.

**Ranged Attack Distance Calculation Ignores Walls**  
`ActionProcessor.ts:843-844` — `getDistance()` (`line 1222`) uses BFS through all connected zones including through buildings. In Zombicide v2, ranged attacks require **Line of Sight** (orthogonal, no walls/closed doors blocking). The current distance check allows shooting around corners.

**No Melee Target Zone Validation**  
`ActionProcessor.ts:840-842` — For melee attacks (range 0-0), the code allows `targetZoneId` to differ from `currentZoneId` as long as distance is 0. This is correct but could be tighter — melee should only target the attacker's own zone.

**Friendly Fire Triggers on HITS Instead of MISSES**  
`ActionProcessor.ts:919-950` — The code applies Friendly Fire from successful hits (`result.hits`), distributing them to friendly Survivors before Zombies. Per the Zombicide v2 rulebook (RULEBOOK.md §10), Friendly Fire applies to **misses only** — dice that did NOT meet the Accuracy threshold. Successful hits should go to Zombies via Targeting Priority; only misses automatically hit Survivors in the target Zone. The FF damage should equal the weapon's Damage value (e.g., Damage 2 weapon inflicts 2 Wounds per FF hit). Additionally, the same Survivor can take multiple FF wounds — the current one-wound-per-survivor cap is also wrong.

**Dual Wield Rules Incomplete**  
`ActionProcessor.ts:867-873` — Dual wield only adds +1 die when both hand slots hold the same weapon. In Zombicide v2, dual wielding means you make **two separate attacks** (one per weapon) for a single action — not a dice bonus. Each weapon rolls independently. The current implementation is a homebrew simplification.

### 1.2 Movement

**Sprint Rules Are Wrong in Multiple Ways**  
`ActionProcessor.ts:599-612` — Two issues:  
1. The code blocks Sprint from **leaving** a zone with zombies (`line 602`: throws error). Per the rulebook (RULEBOOK.md §8, §12 Sprint), Sprint should allow leaving zombie zones (paying +1 AP per zombie, same as regular move). The restriction is on **entering** a zone with zombies — that ends the move immediately.  
2. The code never checks if **entering** a zone with zombies should stop the Sprint. A Sprint of 3 zones will pass through zombie-occupied intermediate zones without stopping. Per the rulebook, "Entering a Zone containing Zombies still ends the Survivor's Move Action."  
3. Sprint minimum distance: the code allows sprinting 1 zone (`line 581`: `path.length > 3`). Per the rulebook, Sprint must move exactly **2 or 3** Zones (minimum 2).

**No Car/Vehicle Movement**  
Zombicide v2 includes car mechanics. Not present (minor — can be considered expansion content).

### 1.3 Search Rules

**Search Once Per Turn — Code is Actually Correct**  
`ActionProcessor.ts:719` — `hasSearched` flag limits to one search per turn. Per the Zombicide v2 rulebook (RULEBOOK.md §8 Search): "A Survivor can only perform a **single Search Action per Turn** (even if it's a free Action)." The code's per-survivor per-turn limit is correct. The only exception is the "Can Search more than once" skill (not implemented, see §2.3). ~~Previously this was marked as a bug — it is not.~~

**Search Validates Building-Only Correctly (with skill exception)**  
`ActionProcessor.ts:721-723` — Correctly blocks street searches unless `search_anywhere` skill is present. Good.

**Flashlight Grants Attack Bonus Instead of Search Bonus**  
`ActionProcessor.ts:875-879` — Flashlight is checked during attack resolution and grants `+1 die` to attacks. Per the Zombicide v2 rulebook (RULEBOOK.md §11, §14), Flashlight grants the **"Search: 2 cards"** Skill — draw 2 cards when Searching. It has NO combat benefit. The search handler (`line 705-741`) has no Flashlight handling at all and draws exactly 1 card. Additionally, Flashlight is "May be used in the Backpack" but the code requires it to be in Hand.

**No "Search the Room" Mechanic**  
In Zombicide v2, searching a zone with zombies is forbidden (correctly implemented at `line 723`), but opening a door to a building should trigger an initial spawn check. This spawn-on-door-open is not implemented.

### 1.4 Zombie Phase

**Zombie Activation Is Single Interleaved Loop (Should Be Two-Pass)**  
`ZombiePhaseManager.ts:43-69` — The code iterates zombies once in a single loop, executing each zombie's action (attack or move) immediately before the next zombie decides. Per the Zombicide v2 rulebook (RULEBOOK.md §9): "Resolve **ALL Attacks first**, then **ALL Moves**." This requires a two-pass system: first pass for all zombie attacks, second pass for all zombie moves. The current interleaved approach means a zombie's move can change the board state before later zombies have decided to attack or move.

**Runner Second Action Fires Immediately Instead of After All First Actions**  
`ZombiePhaseManager.ts:47-67` — Runners get `actions = 2` and both actions execute immediately in the inner loop (`for (let i = 0; i < actions; i++)`), before other zombies have had their first action. Per the rulebook (RULEBOOK.md §9 Runners): "After ALL Zombies (including Runners) resolve their first Action, Runners resolve their second Action." Runners should complete only their first action in the first pass, then do their second action in a separate pass after all other zombies have acted.

**Dead Zombie Check is Type-Specific (Bug)**  
`ZombiePhaseManager.ts:45` — `if (zombie.wounds >= 1 && zombie.type === ZombieType.Walker) continue;` — This only skips wounded Walkers. Runners, Fatties, and Abominations with wounds would still act. While zombies are typically deleted on kill (`ActionProcessor.ts:959`), if a zombie survives a hit (damage < toughness on a Fatty/Abomination), the wound is not tracked and the check here only guards Walkers. The condition should be generalized to skip any zombie that should be dead based on its type's toughness, and the same bug propagates to the extra activation logic at line 209-234.

**Zombie Splitting When Moving**  
In Zombicide v2, when multiple zombies move toward survivors, they should **split evenly** between equidistant survivor groups. `ZombieAI.ts:86-89` picks the closest visible zone but doesn't implement splitting for tied distances.

**No Zombie Overflow/Extra Spawn Rule**  
In Zombicide v2, if the zombie miniature pool runs out, ALL zombies of that type get an extra activation. This is not tracked or implemented.

**Extra Activation Fires at Blue Danger Level (Should Have No Effect)**  
`ZombiePhaseManager.ts:209-234` and `SpawnRegistry.ts:53-60` — Extra Activation spawn cards trigger at all Danger Levels. Per the Zombicide v2 rulebook (RULEBOOK.md §9, §15): "Extra Activation cards have **no effect at Blue Danger Level**." The code has no check for `currentLevel === DangerLevel.Blue` before triggering extra activations.

**Abomination Spawn Rules Not Implemented (Standard or Fest)**  
`ZombiePhaseManager.ts:238-244` — `applySpawnDetail` spawns Abominations without any special handling. The rulebook defines two modes:  
- **Standard (RULEBOOK.md §7)**: Max 1 Abomination on the board. If a spawn card calls for one when one exists, the existing one gets an extra Activation instead of spawning a new one.  
- **Abomination Fest (RULEBOOK.md §16)**: Multiple Abominations allowed. If one already exists, all Abominations get an extra Activation, THEN a new one is placed.  
Both modes require an extra Activation trigger when an Abomination spawn card is drawn while one is already on the board. Neither mode is implemented — Abominations just spawn silently with no extra Activation. Support both modes as a game setting.

**Zombie Rush Cards Not Implemented**  
`ZombiePhaseManager.ts:238-244` — The `SpawnDetail` type has no `rush` field. Per the rulebook (RULEBOOK.md §7, §9): Rush cards place zombies normally, then those zombies **immediately perform a free Activation**. No Rush-triggered activation exists in the code.

**Zombie Targeting Uses Distance, Not Noise**  
`ZombieAI.ts:85-89` — When LOS survivors are found, the code picks the **closest** zone (`findClosestZone()`), ignoring noise count. Per the rulebook (RULEBOOK.md §9): among zones with Survivors in LOS, zombies pick the one with the **most Noise** (noise tokens + 1 per Survivor). Distance doesn't matter — noise determines priority.

**Starting Spawn Zone Has No Special Marker**  
`ZombiePhaseManager.ts:146-148` — Spawn zones are sorted by string ID (`a.id.localeCompare(b.id)`). Per the rulebook (RULEBOOK.md §9): the Starting Spawn Zone always spawns first, then clockwise. The Zone type has no `isStartingSpawn` field and no geometric clockwise ordering exists.

**Colored Spawn Zones (Blue/Green) Not Implemented**  
`ZombiePhaseManager.ts:146` — All zones with `spawnPoint: true` always spawn. Per the rulebook (RULEBOOK.md §9): Blue/Green Spawn Zones don't spawn until activated by taking a matching Objective, and start spawning on the **next** Zombie Phase after activation.

### 1.5 Game Over Condition

**Game Over Triggers on ALL Dead Instead of ANY Single Death**  
`ActionProcessor.ts:465-531` (`checkGameEndConditions`) — The code checks `survivors.every(s => s.wounds >= s.maxHealth)` — Defeat only triggers when ALL survivors are dead. Per the Zombicide v2 rulebook (RULEBOOK.md §1): "The game is lost whenever **a Survivor** is eliminated." Any single Survivor death should end the game immediately.

### 1.6 Turn Structure

**First Player Rotation**  
`ZombiePhaseManager.ts:307-316` — Rotates by shifting the `players` array. In Zombicide v2, the first player token rotates clockwise (index-based), but the array reorder means `activePlayerIndex` always resets to 0. This works but changes the player IDs' positions in the array every round, which could cause issues with anything that relies on stable player ordering.

**No "Starter Equipment" Selection**  
`ActionProcessor.ts:355-373` — All survivors start with a Fire Axe in HAND_1. In Zombicide v2, each character has specific starting equipment defined on their character card. All 6 base game survivors start with different items.

### 1.6 Doors

**Spawn on Door Open Not Implemented**  
In Zombicide v2, the first time a building door is opened, zombies spawn inside based on a spawn card draw. This is a critical missing mechanic — buildings should be dangerous to open.

**Door-Opening Flag Approach is Correct, But Flags Are Missing**  
`ActionProcessor.ts:663` — Checks for `canOpenDoor` flag on equipment. Per the Zombicide v2 rulebook (RULEBOOK.md §4, §14), only specific equipment with the door-opening symbol can open doors: **Fire Axe, Crowbar, and Chainsaw**. The flag-based approach is correct. However, only Chainsaw has `canOpenDoor: true` in `EquipmentRegistry.ts` — Fire Axe and Crowbar in the registry are missing it. ~~Previously claimed "any melee weapon" could open doors — this was incorrect per the rulebook.~~

### 1.7 Noise

**Noise Tokens Are Cleared Every Round — Correct**  
`ZombiePhaseManager.ts:283-286` — This matches Zombicide v2 rules.

**Survivors Count as Noise for Zombie Targeting — Correct**  
`ZombieAI.ts:101` — Each survivor counts as 1 noise. Matches v2 rules.

### 1.8 Combat Misc

**Minimum Accuracy 2+ Not Enforced**  
No check anywhere clamps the Accuracy threshold to a minimum of 2. Per the rulebook (RULEBOOK.md §4, §10): "The minimum Accuracy value is always 2+." If a +1 to dice roll skill is applied to the Sniper Rifle (Accuracy 2+), it could reach an effective 1+ (auto-hit on any roll). A clamp is needed.

### 1.9 Danger Level / XP

**XP Thresholds Are Correct**  
`XPManager.ts:6-11` — Blue(0), Yellow(7), Orange(19), Red(43). Per the Zombicide v2 rulebook (RULEBOOK.md §5): Blue(0), Yellow(7), Orange(**19**), Red(43). The code matches the rulebook. ~~Previously reported as off by 1 — this was incorrect.~~

**Global Danger Uses Max Survivor — Correct**  
`ZombiePhaseManager.ts:265-277` — Matches v2 rules.

**Danger Level Not Recalculated When Survivor Dies**  
When a survivor dies, the global danger level should potentially drop. The current code recalculates during spawn phase (`processSpawns`), but dead survivors are still in `state.survivors` with high XP. Since `getCurrentDangerLevel` iterates all survivors (including dead ones), the danger never decreases.

---

## 2. Missing Features

### 2.1 Characters

**Only 3 Character Classes Defined**  
`SkillRegistry.ts:121-140` — "Goth Girl", "Standard", "Promotional". Zombicide 2nd Edition base game has **6 survivors**, each with unique skill trees:
- **Wanda** — Starts with: +1 Zone per Move
- **Ned** — Starts with: Search +1 Card
- **Phil** — Starts with: +1 die: Melee
- **Amy** — Starts with: +1 free Move Action
- **Josh** — Starts with: Slippery
- **Doug** — Starts with: Matching Set (dual wield bonus)

The current classes don't correspond to any official Zombicide characters and use generic names.

### 2.2 Equipment

**Missing Base Game Equipment:**
- **Scope** — Ranged weapon accuracy modifier
- **Plenty of Shells** — Shotgun bonus (similar to Plenty of Ammo)
- **Evil Twins** (Dual Pistols) — Special dual wield card
- **Ma's Shotgun** — Unique weapon
- **Concrete Saw** — Two-handed weapon

**Equipment Stat Inaccuracies (vs Zombicide v2 rulebook, RULEBOOK.md §14):**
| Weapon | Code Stats | Rulebook Stats | Issues |
|--------|-----------|----------------|--------|
| Fire Axe | dice:1, acc:4+, dmg:2, **noise:true**, no canOpenDoor | dice:1, acc:4+, dmg:2, **Silent**, Door:Yes(Noisy) | `noise:true` wrong (Silent in combat), missing `canOpenDoor` |
| Crowbar | dice:1, acc:4+, dmg:1, **noise:true**, no canOpenDoor | dice:1, acc:4+, dmg:1, **Silent**, Door:Yes(Noisy) | `noise:true` wrong (Silent in combat), missing `canOpenDoor` |
| Pistol | dice:1, **acc:3+**, dmg:1, dual:true | dice:1, **acc:4+**, dmg:1, dual:true, Bullets | Accuracy too high (3+ should be 4+) |
| Shotgun | dice:2, acc:4+, **dmg:2** | dice:2, acc:4+, **dmg:2**, Shells | **Correct** ~~(previously reported as wrong)~~ |
| Sniper Rifle (registry key: `rifle`) | dice:1, **acc:3+**, **dmg:1**, no Sniper skill | dice:1, **acc:2+**, **dmg:2**, Bullets, **Sniper** skill | Accuracy wrong (3+ should be 2+), damage wrong (1 should be 2), missing Sniper skill |
| Baseball Bat | dice:2, **acc:3+**, dmg:1 | dice:2, **acc:4+**, dmg:1 | Accuracy too high (3+ should be 4+) |
| Sub-MG | dice:3, acc:5+, dmg:1, **dual:true** | dice:3, acc:5+, dmg:1, **No Dual**, Bullets | `dualWield:true` wrong ~~(previously marked "Correct")~~ |
| Katana | **dice:2**, acc:4+, **dmg:1**, dual:true | **dice:1**, acc:4+, **dmg:2**, dual:true | Dice and damage are swapped |
| Machete | dice:1, **acc:3+**, **dmg:2**, dual:true | dice:1, **acc:4+**, **dmg:1**, dual:true | Accuracy wrong, damage wrong |
| Sawed-Off | dice:2, **acc:3+**, dmg:1, **dual:true**, no Reload | dice:2, **acc:4+**, dmg:1, **No Dual**, Shells, **Reload** | Accuracy wrong, dual wrong, missing Reload trait |
| Chainsaw | dice:5, acc:5+, dmg:2, noise:true, canOpenDoor | dice:5, acc:5+, dmg:2, Noisy, Door:Yes(Noisy) | Correct |
| Frying Pan | acc:6+, dmg:1, noise:true | **Not in rulebook** | Homebrew weapon — remove or mark as custom |

**Missing from Standard Equipment Deck (45 cards in rulebook):**
- **Aaahh!! (x4)** — Spawns a Walker on draw, interrupts Search. Critical missing mechanic — searching is currently risk-free
- **Kukri (x2)** — Melee, 0, 1 die, 4+, dmg 1, Silent, Dual
- **Bag of Rice (x2)** — Food, consume for 1 AP
- **Plenty of Shells (x3)** — Re-roll for Shells weapons (Backpack-usable). Currently only "Plenty of Ammo" exists (applies to all weapons)
- Deck count: code has ~41 cards (including 3x homebrew Frying Pan), rulebook has 45

**Missing Epic Weapon Deck (11 cards in rulebook, 0 in code):**
Army Sniper Rifle (Dmg 3, Sniper), Automatic Shotgun, Evil Twins (Dual pistols), Golden AK-47, Golden Kukri, Gunblade, Ma's Shotgun (Reload), Nailbat, Zantetsuken (Dmg 3), Aaahh!! (x2)

**BODY Armor Slot — Goalie Mask is Not in v2 Rulebook**  
`ZombiePhaseManager.ts:90-96` — Armor absorbs one wound then is discarded. Only "Goalie Mask" exists (key `go_hockeys` — typo). Per the Zombicide v2 rulebook (RULEBOOK.md §14), there is **no Goalie Mask or armor card** in the base game equipment. This appears to be a homebrew addition. ~~Previously claimed it should stay equipped per v2 — cannot be verified from the rulebook.~~ The implementation can stay as-is or be removed; it's a custom card.

### 2.3 Skills

**15 Skills Defined, Most Not Wired In**  
Skills defined in `SkillRegistry.ts` but effect implementations vary:

| Skill | Defined | Implemented |
|-------|---------|-------------|
| start_move | Yes | Yes (free move at start) |
| plus_1_action | Yes | Yes (via XPManager) |
| plus_1_damage_melee | Yes | Yes (in attack handler) |
| plus_1_damage_ranged | Yes | Yes (in attack handler) |
| plus_1_die_melee | Yes | Yes (in attack handler) |
| plus_1_die_ranged | Yes | Yes (in attack handler) |
| plus_1_free_move | Yes | Yes (free action system) |
| plus_1_free_search | Yes | Yes (free action system) |
| plus_1_free_combat | Yes | Yes (free action system) |
| lucky | Yes | Yes (reroll via rollDiceWithReroll) |
| sniper | Yes | Yes (bypasses friendly fire) |
| tough | Yes | Yes (in zombie attack + friendly fire) |
| sprint | Yes | Yes (dedicated handler) |
| slippery | Yes | Yes (zombie zone control bypass) |
| search_anywhere | Yes | Yes (building restriction bypass) |

Actually, after thorough review, **all 15 skills are implemented**. The ARCHITECTURE.md claim of "most skills unimplemented" is outdated.

**Missing v2 Skills:**
- Born Leader (give 1 action to another survivor)
- Bloodlust (free Move toward zombies)
- Is That All You Got? (1 free Combat action when a zombie enters your zone)
- Reaper: Combat (kill additional zombie with each success)
- Lifesaver (free zone change for 1 companion)
- Hold Your Nose (can search zones with zombies)
- Medic (heal 1 wound with 1 AP)

### 2.4 Spawn Deck

**Spawn Deck Has Only 8 Cards (Rulebook Has 40)**  
`SpawnRegistry.ts` — Only 8 spawn cards defined. Per the rulebook (RULEBOOK.md §15): the Zombie deck has 40 cards (#001-#040), with #001-#018 being easier spawns, #019-#036 harder, and #037-#040 Extra Activations. The "Double Spawn" card type (`spawn-008`) is also not in the official rules — it's homebrew and has a known bug.

**No Abomination Deck**  
The rulebook has a separate 4-card Abomination deck (Patient 0, Hobomination, Abominacop, Abominawild). No such deck exists in the code.

### 2.5 Missing Game Mechanics

1. **Spawn on Door Open** — First building entry triggers spawn cards
2. **Wound/Death Effects** — On death, equipment drops in the zone (implemented), but survivors should discard an equipment card per wound received (not implemented — wounds just increment a counter)
3. **Objective Tokens Give 5XP** — Implemented correctly
4. **Car Mechanics** — Driving, running over zombies (expansion-level, not critical)
5. **Companion System** — Some scenarios have NPC companions
6. **Pimpweapons** — Named unique weapons from the v2 base game
7. **Starting Equipment per Character** — Each character should have a unique starting item

---

## 3. Code Quality Issues

### 3.1 Critical Bugs

**`executeTrade` Mutates Its Argument Directly**  
`ActionProcessor.ts:1098-1171` — While other handlers use `JSON.parse(JSON.stringify(state))` internally, `executeTrade` mutates `state` in-place (mutates `s1.inventory`, `s2.inventory`, pushes to `state.history`, deletes `state.activeTrade`). Note: the caller `handleTradeAccept` does clone before calling it, so this is a code style/consistency issue rather than data corruption. However, the inconsistent contract is fragile — if `executeTrade` is ever called from a different path, it will mutate the original.

**`handleSearch` Mutates Input State Before Clone**  
`ActionProcessor.ts:706-711` — When the deck is empty, the code mutates `state.equipmentDeck` and `state.seed` directly on the *input* state before `DeckService.drawCard` does its own clone. This means the mutation leaks to the original state object.

**`_extraAPCost` Hack on State Object**  
`ActionProcessor.ts:202-204, 562-563` — Extra AP cost is stored as a non-typed property `_extraAPCost` on the state object using `(newState as any)`. This breaks type safety and is fragile. Should be a return value or part of the handler result.

**Zombie ID Collision Possible**  
`ZombiePhaseManager.ts:253` — Zombie IDs use `zombie-${state.turn}-${zoneId}-${Math.floor(rnd.value * 10000)}`. With multiple spawns in the same zone on the same turn, there's a ~0.01% chance of collision per pair. Should use a monotonic counter instead.

**Spawn Card Not Added to Discard**  
`DeckService.ts:95-96` and `ZombiePhaseManager.ts:160-164` — After drawing a spawn card, it's removed from the deck but never added to `spawnDiscard`. Cards are lost permanently. The deck will eventually empty with no discard pile to reshuffle.

**Fire Axe from Equipment Deck Can't Open Doors**  
`EquipmentRegistry.ts:6-17` — The `fire_axe` equipment definition does NOT have `canOpenDoor: true`. Only the hardcoded starting equipment (`ActionProcessor.ts:362`) and the Chainsaw have this flag. Any Fire Axe drawn from the equipment deck will be unable to open doors. The `canOpenDoor` flag should be on the EquipmentRegistry entry, not just the hardcoded starter.

**Double Spawn Skips First Card's Zombies**  
`ZombiePhaseManager.ts:180-201` — When `detail.doubleSpawn` is true, the code draws a second card and applies the second card's detail, but the `else` on line 199 means `applySpawnDetail` for the original card only runs when `doubleSpawn` is false. The first card's spawn detail is **never applied** on a double spawn — only the second card's zombies appear.

**Trade Discards Vanish Into Void**  
`ActionProcessor.ts:1152` — During trade execution, items mapped to the `DISCARD` slot are filtered out of inventory via `.filter(c => c.slot !== 'DISCARD')`, but these discarded cards are never added to `equipmentDiscard`. They simply disappear from the game.

**Dead Survivors Still Count for Danger Level**  
`ZombiePhaseManager.ts:269-275` — `getCurrentDangerLevel()` iterates all survivors including dead ones (no `wounds < maxHealth` filter). Once a high-XP survivor dies, the danger level can never decrease. This makes the game progressively harder with no counterbalance.

**`cleanupStaleRooms` Never Called**  
`PersistenceService.ts:62-65` — The function exists to clean up old rooms from the SQLite database but is never invoked from `server.ts` or anywhere else. Stale rooms accumulate indefinitely in the database.

**Zombie Door Break Doesn't Advance**  
`ZombiePhaseManager.ts:62-65` — When a zombie breaks a door, the door opens but the zombie does NOT move through it. It stays in its current zone and will only move through the opened door on its next activation. This is technically valid per Zombicide rules (door-breaking consumes the action) but is worth noting as it can feel unintuitive.

**Server Mutates State Directly on Disconnect**  
`server.ts` — When handling player disconnects and kicks, the code mutates `room.gameState.lobby.players` and `room.gameState.spectators` directly instead of going through ActionProcessor. This bypasses history logging, persistence, and state immutability.

### 3.2 Architecture Issues

**Massive `ActionProcessor.ts` (1265 lines)**  
All game logic is in one file. Each handler should be its own module or at minimum grouped into separate files (combat.ts, trade.ts, lobby.ts, inventory.ts).

**Inconsistent State Cloning**  
Some handlers deep-clone via `JSON.parse(JSON.stringify())`, others return shallow copies, and `executeTrade` mutates in place. There should be a single consistent strategy (e.g., Immer, or always deep-clone at the dispatcher level).

**No Input Validation Layer**  
`ActionRequest.payload` is typed as `any`. Each handler manually validates its expected payload shape. A Zod schema or similar validation at the dispatcher would catch malformed requests before they reach handlers.

**`handleSearch` Does Two Things**  
The search handler both draws a card AND validates search conditions. The validation (building check, zombie check, hasSearched check) happens *after* the card is already drawn from the deck (`line 713`). If any validation fails, the drawn card is lost (removed from deck but never returned or discarded).

**Test Coverage**  
Only 2 test files exist (`StateDiff.test.ts`, `ReplayService.test.ts`), both using `console.log` assertions. No test framework, no unit tests for any game logic. Critical bugs in combat, turn management, or spawn logic cannot be caught automatically.

### 3.3 Performance Concerns

**Full State Broadcast**  
`server.ts` broadcasts the entire `GameState` to all clients on every action. For a game with ~50 cards, ~100 zones, and ~40 zombies, this can be 50-100KB per action. `StateDiff.ts` exists but isn't used for network sync.

**`JSON.parse(JSON.stringify())` for Deep Clone**  
Used ~15 times across the codebase. Loses type information, breaks `undefined` values (converts to `null`), and is slower than structured alternatives. Consider using `structuredClone()` (available in Node 17+) or a dedicated clone utility.

**BFS for Every Ranged Attack**  
`getDistance()` (`ActionProcessor.ts:1222-1246`) runs BFS every time a ranged attack is performed. For large maps, this could be slow. Could be cached per turn since zone connectivity doesn't change mid-turn.

### 3.4 Dead Code

- `src/services/combat/CombatResolver.ts` — Deleted (in git status as `D`)
- `src/services/combat/TargetSelector.ts` — Deleted (in git status as `D`)
- `src/client/ui/SurvivorDashboard.ts` — Deleted
- `src/style.css` — Deleted (migrated to `src/styles/`)
- `ROADMAP.MD` — Deleted
- `ActionType.TRADE` handler — Throws "deprecated" error but is still registered
- `ActionType.NOTHING` — Returns state unchanged, unclear purpose
- `Zone.doorOpen` — Marked deprecated, still present
- `Zone.connectedZones` — Marked as "backward compat" but still used as primary movement check (`line 548`)

### 3.5 Type Safety

- `ActionRequest.payload` is `any` — should be a discriminated union per ActionType
- Multiple `as any` casts throughout ActionProcessor (lines 202, 558, 828, 902)
- `survivor.inventory` iterated with `(c: EquipmentCard)` annotations on lambda params (lines 622, 663, etc.) instead of relying on TypeScript inference — suggests the types aren't flowing correctly

### 3.6 Client-Side Issues

- **Event listener leaks** — Multiple UI classes (GameHUD, PickupUI, TradeUI, PixiBoardRenderer) add event listeners on every render without removing old ones. No `destroy()` methods exist on most UI classes. Over time this causes memory leaks and duplicate handler invocations.
- **innerHTML full re-renders** — GameHUD, PickupUI, LobbyUI use `innerHTML` to rebuild entire DOM trees on every state update. This destroys form state, breaks drag animations, causes layout thrashing, and re-attaches all event listeners.
- **NetworkManager has reconnection** — Actually does have auto-reconnect (up to 10 attempts with exponential backoff), but no user-facing notification when reconnecting or when max attempts are exhausted.
- **No state rollback on server rejection** — If an action fails server-side, the client may have already updated optimistically.
- **AnimationController is incomplete** — Spawn/death tweens are stubbed. Movement animation has a false-trigger bug at line ~764 where it assumes entities start at (0,0).
- **Hit testing layout duplication** — InputController hardcodes entity spacing (40px) separately from PixiBoardRenderer's `ENTITY_SPACING` constant, creating potential sync bugs if either value changes.
- **PixiBoardRenderer has no destroy()** — Wheel event listeners and gesture suppression timers persist even if the renderer is torn down.
- **Missing keyboard shortcut documentation** — KeyboardManager defines ~15 shortcuts (S, N, D, O, T, E, Tab, 1-6, Space, Escape) but no on-screen help or legend is available.

---

## 4. Summary of Priorities

### Must Fix (Game-Breaking)
1. **Game over on ANY death** — Game only ends when ALL survivors dead; should end on first death (`ActionProcessor.ts:471`)
2. **Molotov has no working implementation** — Rolls 0 dice, hits nothing
3. **Friendly Fire triggers on HITS not MISSES** — Inverted FF logic (`ActionProcessor.ts:919-950`)
4. **Zombie activation is interleaved** — Should be ALL Attacks first, then ALL Moves (`ZombiePhaseManager.ts:43-69`)
5. **Runner second action is immediate** — Should fire after ALL zombies' first actions
6. **Flashlight grants attack bonus instead of Search: 2 cards** — Completely wrong effect (`ActionProcessor.ts:875`)
7. **Aaahh!! cards missing** — Search deck has no risk (4 cards should spawn Walkers on draw)
8. **Spawn cards never added to discard pile** — Deck drains permanently
9. **Double spawn skips first card's zombies** — Only second card spawns
10. **`handleSearch` draws card before validation** — Card loss on failed search
11. **Fire Axe + Crowbar from deck can't open doors** — Missing `canOpenDoor` flag in registry
12. **Dead survivors inflate danger level permanently** — No filter in `getCurrentDangerLevel`
13. **Trade discards vanish** — Filtered out but never added to `equipmentDiscard`
14. **Door-open spawn mechanic missing** — Buildings are risk-free to enter

### Should Fix (Rules Accuracy)
1. Sniper Rifle: accuracy 3+ should be 2+, damage 1 should be 2, missing Sniper skill
2. Katana: dice 2/damage 1 should be dice 1/damage 2 (swapped)
3. Machete: accuracy 3+/damage 2 should be 4+/damage 1
4. Sawed-Off: accuracy 3+ should be 4+, dualWield:true should be false, missing Reload trait
5. Pistol accuracy too high (3+ should be 4+)
6. Baseball Bat accuracy too high (3+ should be 4+)
7. Sub-MG: dualWield:true should be false
8. Fire Axe + Crowbar: `noise:true` wrong — Silent in combat (door-opening is separately Noisy)
9. Dual wield should be two separate attacks, not +1 die
10. Targeting Priority Order is reversed (Walkers first instead of Brutes/Abominations)
11. Sprint rules wrong in multiple ways (blocks leaving, doesn't block entering, allows 1-zone)
12. Minimum Accuracy 2+ not enforced anywhere
13. Extra Activation fires at Blue Danger Level (should have no effect)
14. Abomination spawn rules missing — support both Standard (max 1, extra Activation on duplicate) and Abomination Fest (multiple, extra Activation then spawn) as a game setting
15. Zombie Rush cards not implemented (spawned zombies should immediately Activate)
16. Zombie targeting uses distance instead of noise count
17. Starting Spawn Zone has no special marker; no clockwise ordering
18. Colored Spawn Zones (Blue/Green) not implemented
19. Ranged attack distance should use LOS, not BFS pathfinding
20. All characters should have unique starting equipment
21. `executeTrade` mutates argument directly (inconsistent clone pattern)
22. Spawn deck only 8 cards (rulebook has 40) + no Abomination deck
23. Missing equipment: Kukri, Bag of Rice, Plenty of Shells, all 11 Epic Weapons

### Requested Changes (User Feedback)
1. **Rename Fatty to Brute** — `ZombieType.Fatty` becomes `ZombieType.Brute` across all files (GameState.ts, SpawnRegistry.ts, ZombiePhaseManager.ts, ActionProcessor.ts toughness/XP tables, ZombieTypeConfig.ts, ZombieBadge.ts, ZombieAI.ts). Keep same stats (toughness 2, 1 action/turn, 1 XP).
2. **Number spawn points** — Spawn zones should have a stable numeric order (already sorted by zone ID in `ZombiePhaseManager.ts:148`). This number should be visible on the board, in spawn event log entries, and in history. `spawnContext.cards` entries should include the spawn point number.
3. **Enrich game history** — `state.history` entries currently store raw `actionType` + `payload`. They need richer data for a browsable turn history log: survivor names, dice roll results, kill counts, zone names, equipment names. Either enrich at write-time (in ActionProcessor after each handler) or hydrate at read-time (in the UI rendering function).
4. **Abomination kill rule** — Per the Zombicide v2 rulebook (RULEBOOK.md §7, §10): Abominations can be killed by **Damage 3+ weapons OR Molotov**. The code's `effectiveDamage >= toughness` check (`ActionProcessor.ts:956-958`) is actually correct. ~~Previously claimed Molotov-only — this was wrong.~~ However, no base game weapon naturally has Damage 3 — it requires Skills (+1 Damage) or Epic Weapons (Zantetsuken, Army Sniper Rifle). The Molotov implementation (Must Fix #1) is still critical since it's the primary way to kill Abominations.

### Nice to Have
1. Real Zombicide v2 character names and skill trees (12 characters)
2. Zombie splitting on equidistant targets
3. Zombie overflow extra activation rule (miniature pool tracking)
4. "Can Search more than once" skill implementation
5. Proper test framework and game logic tests
6. Break ActionProcessor into smaller modules
7. Use StateDiff for network optimization
8. Type-safe action payloads
9. Remove homebrew Frying Pan weapon (or clearly mark as custom)
10. Goalie Mask is homebrew — mark as custom or remove

---

## 5. What's Working Well

- **Core game loop** is functional: move, search, attack, trade, open doors
- **Search once-per-turn** limit is correctly implemented per rulebook
- **Deterministic RNG** via seeded LCG enables replay
- **Turn management** with AP, free actions, and auto-advance is solid
- **XP thresholds** are correct (Blue 0, Yellow 7, Orange 19, Red 43)
- **Zombie AI** with LOS, BFS pathfinding, noise targeting, and door breaking works
- **XP/Danger level** system with skill choices at Orange/Red is correct
- **Trade system** (despite the mutation bug) has a good UX flow
- **UI redesign** effort (tasks/) shows systematic approach with design tokens
- **All 15 defined skills are implemented** — contrary to what ARCHITECTURE.md claims
- **Edge-based door model** (ZoneConnection) is architecturally clean
- **Spectator support** exists in the game state
