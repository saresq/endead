# Rules Compliance Review — Game Logic

Date: 2026-09-14
Scope: server-side game logic vs Zombicide 2nd Edition rules (`.claude/skills/zombicide-rules/SKILL.md`, `RULEBOOK.md`).
Method: four parallel reviews (player actions, combat, zombie phase, skills/inventory). Read-only; no code changed.
Line numbers refer to the working tree at review time.
Updated 2026-09-14 after change `fix-critical-rules`: fixed items removed (C1–C6, B11, S4, S5, D6, Hit & Run part of S6, `doubleSpawn`), line numbers refreshed, new findings added (D10, D11). C7 (host disconnect stalls pending wounds) found and fixed the same day.

Guiding principle for fixes: **simplest logic that delivers a fully functional game**. Prefer shared helpers that remove duplication over new parallel code paths.

Out of scope / intentional: spawn zone order follows the map author's `spawnZoneIds` placement order (do not change).

---

## 1. Critical (breaks the game or core rules)

None open. A player who stays disconnected mid-game for 10 minutes now ends the game (`server.ts` `abandonGame`); the next lobby player becomes host.

---

## 2. Combat bugs

### B1. Ranged hits ignore Brute shielding
- **Where:** `src/services/handlers/CombatHandlers.ts:380-383`.
- **Problem:** A hit that fails to kill is consumed and assignment moves to the next zombie. Brute + Walker, Damage 1, 2 hits → Walker dies.
- **Rule:** Hits assigned by priority to lowest-priority target until eliminated; Damage 1 has no effect on Brute, which shields lower priorities.
- **Fix:** For priority-ordered ranged attacks, stop assigning once a hit can't kill the current target. For melee (free assignment), skip unkillable targets instead of wasting hits.

### B2. Friendly Fire distribution wrong
- **Where:** `CombatHandlers.ts:326-350`.
- **Problem:** Each friendly survivor takes at most one miss in array order; remaining misses dropped.
- **Rule:** Every miss hits a survivor in the target zone (not shooter); player assigns freely; damage applies per miss.
- **Fix:** Player assignment (reuse pending-wounds pattern) or at minimum loop until all misses are spent.

### B3. Tough skill scope wrong
- **Where:** `CombatHandlers.ts:332-336`, `CombatHandlers.ts:537-541`, `ZombiePhaseManager.ts:111-114`; reset once per round in `XPManager.resetSurvivorTurn` (`XPManager.ts:120-121`).
- **Problems:**
  - Flags reset once per round, not per attack step / per Friendly Fire instance. Rush/extra activations in spawn step don't get a fresh Tough.
  - On Friendly Fire, Tough cancels an entire miss (2 wounds for Damage 2) instead of 1 wound.
  - Skill description says "every Turn" (wrong).
- **Rule:** Ignore first Wound per zombie Attack Step and per Friendly Fire instance.
- **Fix:** Reset at start of each `activateZombieSet` call and per ranged action; subtract exactly 1 wound.

### B4. Molotov does not kill survivors
- **Where:** `CombatHandlers.ts:113-127`.
- **Problem:** Survivors in target zone take 1 wound; thrower's own zone not handled as kill.
- **Rule:** Kills ALL actors in the zone, survivors included.
- **Fix:** Kill survivors via `handleSurvivorDeath`.

### B5. Sniper rifles don't grant Sniper
- **Where:** `src/config/EquipmentRegistry.ts:73,241` (`keywords: ['sniper']` never read); `CombatHandlers.ts:285`.
- **Fix:** `hasSniper = skills.includes('sniper') || weapon.keywords?.includes('sniper')`.

### B6. Reload not implemented
- **Where:** `EquipmentRegistry.ts:165,319` (`keywords: ['reload']` never read).
- **Problem:** Sawed-Off and Ma's Shotgun fire every action.
- **Rule:** After firing, must spend an Action to reload (reloaded free in End Phase).
- **Fix:** `loaded` flag on card, Reload action, reset in End Phase.

### B7. Gunblade cannot melee
- **Where:** `CombatHandlers.ts:81` (melee decided by `range[1] === 0`).
- **Problem:** Range 0-1 → always ranged: no melee skills, FF at range 0, no Super Strength.
- **Fix:** Card flag for melee+ranged; attack intent carries chosen mode.

### B8. Lucky once per turn instead of once per action
- **Where:** `CombatHandlers.ts:210,583` (`luckyUsedThisTurn`).
- **Fix:** Allow when the last attack has not been rerolled yet (e.g. `rollbackSnapshot` present).

### B9. Reaper once per action instead of once per hit
- **Where:** `CombatHandlers.ts:353,389` (`reaperUsed` always false where checked).
- **Fix:** One bonus kill per killing hit.

### B10. Client can't express combat choices
- **Where:** `src/client/InputController.ts:571` (target picker melee-only); `protectedSurvivorIds`, `useBarbarian` never sent.
- **Problem:** Sniper / Point-blank free targeting, Brute vs Abomination tie choice (`CombatHandlers.ts:283`), Steady Hand, Barbarian unusable.
- **Fix:** Open target picker when free targeting or a priority tie applies; add Steady Hand / Barbarian toggles.

---

## 3. Cards, skills, inventory bugs

### S1. Search loses cards on overflow
- **Where:** `src/services/handlers/ItemHandlers.ts:131-135`.
- **Problem:** On multi-card draw (Flashlight, Search: 2 cards, Matching set), first overflow `break`s; remaining drawn cards are neither in inventory nor discard.
- **Fix:** Queue remaining cards or push to `equipmentDiscard`.

### S2. Aaahh!! handling incomplete
- **Where:** `ItemHandlers.ts:93-100`; `src/services/handlers/EpicCrateHandlers.ts:58-64`; `CombatHandlers.ts:430` (Hold your nose).
- **Problems:** Aaahh!! doesn't interrupt a multi-card search. Epic crate and Hold your nose put `aaahh_epic` into inventory instead of spawning a Walker.
- **Fix:** One shared `resolveDrawnCard` that spawns Walker + discards on Aaahh and stops the search.

### S3. Discard piles mixed
- **Where:** `handleResolveSearch` (`ItemHandlers.ts:162`), `swapDrawnCard` (`EquipmentManager.ts:120`), `discardCard` (`EquipmentManager.ts:91`), `handlerUtils.ts:39`, `ZombiePhaseManager.ts:186`; reshuffle `DeckService.drawCard:94`.
- **Problems:** Starting equipment (`card-start-*`) and Epic cards (`epic-*`) go to `equipmentDiscard` and get reshuffled into the Equipment deck.
- **Rule:** Starting equipment never enters the deck; Epic cards belong to the Epic deck.
- **Fix:** Single discard helper routing by id prefix (drop starting cards, `epic-` → `epicDiscard`).

### S6. Hold your nose writes to a stale survivor object
- **Where:** `CombatHandlers.ts:414-432`.
- **Problem:** `addXP` replaces the survivor; Hold your nose then calls `EquipmentManager.addCard(survivor, …)` on the old object, overwriting just-earned XP, and an overflow `drawnCard` is written to the stale object and lost.
- **Fix:** Re-read `newState.survivors[id]` before drawing (as Hit & Run now does).

### S7. Trade not validated
- **Where:** `src/services/handlers/TradeHandlers.ts:107` (`validateLoadout` unused anywhere).
- **Problem:** Unmapped cards default to `BACKPACK_0`; >5 cards or two cards per slot possible. Trade partner liveness unchecked.
- **Fix:** Validate both resulting inventories and partner alive.

### S8. Discard / reorganize action cost
- **Where:** `src/services/ActionProcessor.ts:212-222`.
- **Problem:** Each `ORGANIZE` card move costs 1 AP (swap = 2); discard costs 1 AP and requires AP / own turn; eating food requires AP.
- **Rule:** Discard free any time; Reorganize = 1 Action for any number of moves.
- **Fix:** Discard free; reorganize opens a free session for 1 AP (like trade).

---

## 4. Rule deviations (lower priority)

### D1. Character roster incomplete
- **Where:** `src/config/CharacterRegistry.ts`, `src/config/SkillRegistry.ts:295`, `LobbyHandlers.ts:128` (`maxHealth: 3` hardcoded).
- **Problem:** 6/12 characters (missing Lili, Tiger Sam, Odin, Bunny G, Lou, Ostara). No Kid type (Health 2, Slippery once per turn with single Move). `|| SURVIVOR_CLASSES['Wanda']` hides unknown characters. Existing skill trees not verifiable from RULEBOOK.md.

### D2. Starting equipment
- **Where:** `CharacterRegistry.ts:15`.
- **Problem:** Fixed per-character loadouts incl. Katana/Machete.
- **Rule:** Deal randomly from Baseball Bat, Crowbar, Fire Axe, 3× Pistol.
- **Also:** First player should be whoever holds the Fire Axe; currently `firstPlayerTokenIndex` = 0 (host) (`GameState.ts:491`).

### D3. Zombie deck doesn't match rulebook
- **Where:** `src/config/SpawnRegistry.ts`.
- **Problem:** No Rush cards (`rush` never set), no Blue-level Abominations on cards #019-#036.
- **Fix:** Enter real card data.

### D4. Zombie group splitting missing
- **Where:** `ZombieAI.ts:122-152` (`getNextStep`).
- **Problem:** First found connection used; whole group goes same way.
- **Rule:** Equal routes → split evenly by type.
- **Fix:** Collect all equally short first steps; distribute zombies of each type round-robin.

### D5. Zombie noise ties broken by distance (minor)
- **Where:** `ZombieAI.ts:85-89, 111-113`. Acceptable automation, not in rules.

### D7. Starting building can spawn
- **Where:** `src/services/ScenarioCompiler.ts:396` (`hasBeenSpawned: false` always).
- **Fix:** Mark building containing `playerStartZoneId` (and buildings open at start) as spawned at compile time.

### D8. Movement skill deviations
- **Sprint** (`MovementHandlers.ts:133-137`): throws if first zone has zombies (should stop there); entering a zombie zone ignores Slippery; can't use a free Move (`deductAPWithFreeCheck` only matches `MOVE`).
- **Charge** (`SkillHandlers.ts:39-50`): ignores zombies in middle zone of 2-zone path (normal movement rules apply).
- **Born Leader** (`SkillHandlers.ts:85`): requires same zone (rule doesn't); grants `actionsRemaining` to a survivor who can't act now, so action is lost if they already played.

### D9. Misc minor
- Matching set doesn't shuffle deck afterwards.
- `NOTHING` action is a no-op and not in `gameActions` (`TurnHandlers.ts:4`); END_TURN covers it.
- Objective and Epic crate actions logged twice (`ObjectiveHandlers.ts:78`, `EpicCrateHandlers.ts:82`, plus `ActionProcessor.ts:308`).

### D10. Pending skill choice does not block play (minor)
- **Where:** `src/services/ActionProcessor.ts` pending-wounds gate; `XPManager.getPendingSkillChoice`.
- **Problem:** A survivor who reached Orange/Red can keep acting (and the round can continue) before picking the skill. The client prompt can't be dismissed, but the server accepts other actions.
- **Rule:** The skill is chosen on reaching the level.
- **Fix:** Reject game actions from a survivor with a pending choice (other players unaffected), or accept as a UX-only rule.

### D11. Door-open spawns not shown in the event feed (minor)
- **Where:** `src/services/handlers/DoorHandlers.ts:84-89`; feed reads `spawnContext` (`ZombiePhaseManager.ts:31,170`).
- **Problem:** Building spawns draw cards (now including Extra Activation and Rush) but don't record them in `spawnContext`, so players only see "zombies spawned!" with no card detail.
- **Fix:** Push door-open cards into a fresh `spawnContext`, same shape as the Spawn Step.

---

## 5. Simplification opportunities

These reduce code and fix several bugs above at the same time.

| Change | Fixes / removes |
|---|---|
| One wound/Tough/death function (`CombatHandlers.ts:532-556`, `ZombiePhaseManager.applyZombieAttack:107-136`, `handlerUtils.handleSurvivorDeath`) | B3 |
| One `resolveDrawnCard` (search, epic crate, Hold your nose) | S1, S2 |
| One discard helper routing by card id prefix | S3 |
| One `recordKill(state, zombie)` (`CombatHandlers.ts:101,368,399`) | dedupe objective updates |
| `zoneHasZombies` / `zombiesInZone` helper (Move, Sprint, Charge, Bloodlust, Lifesaver, Search, Combat) | D8 |
| `idsOfType(type)` helper (`ZombiePhaseManager.ts:269,291,310,326`) | dedupe |
| Action cost table in `ActionProcessor` instead of if/else chain (incl. empty TRADE_* branch) | S8 |
| Delete now-unused `advanceTurnState` and `canAct` (`TurnManager.ts:152,178`) | dedupe |
| Precompute building id per zone at compile time (replaces walk in `DoorHandlers.ts:45-81`) | D7 |
| Pass `isMelee` as parameter instead of `_attackIsMelee` on state | cleanup |
| Reuse `DeckService` shuffle in `EpicCrateHandlers` | dedupe |
| Shared path validation for Charge and Bloodlust | D8 |

**Dead code to remove:** `applyLuckyReroll` + `AttackRollResult` import (`CombatDice.ts:93-113`, `CombatHandlers.ts:9`), `isRanged` (dup of `isRangedWeapon`, `CombatHandlers.ts:309`), `reaperUsed`, `NOTHING` action, `moveCardToSlot` DISCARD branch, duplicate `DANGER_VALUES` (`ActionProcessor.ts:57`, `ZombiePhaseManager.ts:8`), duplicate `getZombieToughness` (`ZombiePhaseManager.ts:54`, `handlerUtils.ts:113`), `advanceTurnState`, `canAct`, RNG burn in `spawnZombie` (`ZombiePhaseManager.ts:341-344`), full state clone in `DeckService.drawSpawnCard`, unused `checkGameEndConditions` living-survivors branch.

---

## 6. Verified correct

- 3 actions; 4 from Yellow +1 Action, applied immediately. AP thresholds 7/19/43.
- Global danger = max of living survivors.
- Entering zombie zone ends move; Slippery waives leave cost; closed doors block movement.
- Search: building-only (Scavenger override), no zombies, once per turn incl. free searches, "search more than once" and "Search: 2 cards" honored; Aaahh!! spawns Walker from Search.
- Doors: opener in hand, noisy, never close; each building spawns once, one card per dark zone.
- Take Objective 5 AP, activates colored spawn zones; colored zones start next zombie phase. Epic crate: card + free reorganize, no AP.
- Make Noise; End Phase clears noise, resets flags, passes first player.
- Any survivor death = defeat; all objectives = victory.
- Zombie phase: all attacks before all moves; runners' 2nd action after all 1st actions (incl. extra activations); zombies in survivor zones attack, don't move; target selection by LOS noise then global noise; shortest path; Extra Activation no effect at Blue; 40/16/16/4 limits trigger extra activation; Rush zombies activate; Abomination standard & Fest modes; zombie deck reshuffle.
- Combat: melee zone 0, no FF; FF never hits shooter, off for Sniper / Point-blank at range 0; Brute 2 / Abom 3 damage thresholds, no stacking; min accuracy 2+; +1 roll capped at 6; dual weapons 1 action / 1 noise / +1 die each; max 1 noise per action; Molotov range 0-1, AP to thrower, discarded; Plenty of Bullets/Shells from backpack by ammo type; Point-blank, +1 max range, Super Strength; Steady Hand excluded for Molotov; AP 1 per kill, 5 per Abomination.
- Inventory 2 hands + 3 backpack; trade 1 action, 1 partner same zone, unequal allowed; Flashlight usable in backpack; food 1 AP.
- Equipment deck 45 cards, Epic deck 11, stats and counts match.
- (After `fix-critical-rules`, covered by Vitest) Straight-line LOS/range shared by combat, Lifesaver, zombies and client; zombies never open doors; move cost = base + zombies left, rejected when unaffordable, Hit & Run waiver; free Melee/Ranged before free Combat; door spawns use full spawn rules at live danger level; wound distribution (host) and ITAYG (owner) block play and delay End Phase; Orange/Red skill choice; free-action skills immediate; Amy free Move round 1.

---

## Suggested fix order

1. Combat B1–B10.
2. Cards/skills/inventory S1–S3, S6–S8.
3. Deviations D1–D11 (content: roster, starting gear, zombie deck).
