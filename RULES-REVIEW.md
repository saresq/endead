# Rules Compliance Review — Game Logic

Date: 2026-09-14
Scope: server-side game logic vs Zombicide 2nd Edition rules (`RULEBOOK.md` and the `rules/` chapters it indexes).
Method: four parallel reviews (player actions, combat, zombie phase, skills/inventory). Read-only; no code changed.
Line numbers refer to the working tree at review time.
Updated 2026-09-14 after change `fix-critical-rules`: fixed items removed (C1–C6, B11, S4, S5, D6, Hit & Run part of S6, `doubleSpawn`), line numbers refreshed, new findings added (D10, D11). C7 (host disconnect stalls pending wounds) found and fixed the same day.
Updated 2026-09-16 after change `cards-and-inventory-pass`: S1, S2, S3, S6, S7 and S8 fixed and removed, along with the simplifications that fixed them (`resolveDrawnCard`, the discard routing helper, the action cost table) and the `moveCardToSlot` DISCARD branch. Line numbers refreshed for the files it touched.
Updated 2026-09-16 after change `combat-rules-pass`: B1–B10 fixed and removed, along with the simplifications that fixed them (`applyWound` / `recordKill` in `src/services/Wounds.ts`, the single hit-assignment walk, `isMelee` as a parameter) and the dead code they retired. Line numbers refreshed for the files it touched.
Updated 2026-09-16 after change `rules-deviations-pass`: D1–D5 and D7–D11 all closed. D5 is recorded as intentional; the rest are fixed, along with §5's simplifications and dead code (`zoneHasZombies` / `zombiesInZone` / `walkMovePath` / `walkSurvivorMove` in `handlerUtils.ts`, `idsOfType`, compile-time building ids, `DANGER_VALUES` in `src/config/DangerValues.ts`). D1 and D3 needed data the rulebook does not carry: the skill trees came from the official Survivor ID cards published at zombicide.com, the Zombie deck's per-card amounts from the ZombiDeck companion app, cross-checked against every figure the rulebook does give. `RULEBOOK.md`'s roster table was wrong about which survivors are Kids and has been corrected from the cards.

Guiding principle for fixes: **simplest logic that delivers a fully functional game**. Prefer shared helpers that remove duplication over new parallel code paths.

Out of scope / intentional: spawn zone order follows the map author's `spawnZoneIds` placement order (do not change). The rule it implements is page 25 — Starting Spawn Zone first, then clockwise — which the mapper authors by placement order; see `MAP-GUIDE.md`.

---

## 1. Critical (breaks the game or core rules)

None open. A player who stays disconnected mid-game for 10 minutes now ends the game (`server.ts` `abandonGame`); the next lobby player becomes host.

---

## 2. Combat bugs

None open. `combat-rules-pass` closed all ten:

- **B1** — one ordered assignment walk (`assignHits`, `CombatHandlers.ts`) spends hits over targets in order and takes "cannot kill" behaviour as a parameter: a priority-ordered ranged attack stops, so a Brute shields the Walkers behind it, while melee and free targeting skip the unkillable target instead of wasting the hit.
- **B2** — every Friendly Fire miss lands. One eligible victim takes them all; more than one and the shooter's player assigns them, through the same pending decision as zombie wound distribution (`pendingZombieWounds` with `source: 'FRIENDLY_FIRE'`). The shooter is never a target.
- **B3** — `applyWound` (`src/services/Wounds.ts`) owns Tough: it ignores one wound per wound context and subtracts exactly one, so a Damage 2 miss still wounds. The context is one `activateZombieSet` call or one attack action, and `survivor.toughUsedContext` replaces the two booleans and the per-round reset in `XPManager.resetSurvivorTurn`.
- **B4** — a Molotov kills every actor in the zone: survivors go through `applyWound` for their remaining health, with neither Tough nor a discard saving them. **Breaking** for players used to surviving their own Molotov.
- **B5** — a weapon whose keywords include `sniper` grants Sniper for that attack, skill or no skill.
- **B6** — a `reload` weapon is unloaded once fired (`EquipmentCard.loaded`), refuses to fire again, reloads with a `RELOAD` action, and is loaded for free by `reloadAllWeapons` in the End Phase.
- **B7** — `WeaponStats.melee` marks a weapon usable both ways, and `attackMode` on the attack carries the player's choice; melee is no longer inferred from `range[1] === 0`. `_attackIsMelee` is gone from state in favour of `lastAction.isMelee` and a parameter on `deductAPWithFreeCheck`.
- **B8** — Lucky is one reroll per attack action: `luckyUsedThisAction` is cleared at the start of each attack, and the Lucky rerun passes `isRerun` so it does not re-arm itself.
- **B9** — Reaper grants one extra kill per killing hit, inside the assignment walk. The always-false `reaperUsed` is gone.
- **B10** — the attack picker (`InputController.openAttackPicker`) opens whenever the attack has a choice to make: free targeting for melee, Sniper and Point-blank, a Brute-versus-Abomination priority tie, the melee/ranged mode of a dual weapon, Steady Hand's protected survivors and Barbarian. `protectedSurvivorIds` and `useBarbarian` are sent.

---

## 3. Cards, skills, inventory bugs

None open. `cards-and-inventory-pass` closed the last six:

- **S1 / S2** — one `resolveDrawnCard` (`src/services/CardDraw.ts`) resolves every drawn card for search, Epic crate and Hold your nose alike: a card is kept, offered, or discarded, and an Aaahh!! spawns a Walker and stops the draw wherever it came from.
- **S3** — one `DeckService.discard` routes by card id prefix, so starting equipment leaves play and Epic cards go to the Epic discard instead of being reshuffled into the Equipment deck.
- **S6** — Hold your nose resolves through the shared draw, which re-reads the survivor from state after `addXP`.
- **S7** — `EquipmentManager.validateLoadout` is called on both inventories a trade would produce and returns the rule that failed; a trade with a dead partner, or one whose payload doesn't say where a card goes, is rejected.
- **S8** — discarding is free at any time (`DISCARD_CARD`), and `ORGANIZE_START` opens a session where every move is free, so rearranging costs one action however many cards move.

---

## 4. Rule deviations (lower priority)

None open. `rules-deviations-pass` closed all ten:

- **D1** — the full twelve-survivor roster ships, with the skill trees transcribed from the official Survivor ID cards (zombicide.com, `sic-Z2-<name>.webp`) and validated by test against the shape the rulebook gives. Six Classic and six Kids — `RULEBOOK.md`'s own table had this wrong and was corrected. A survivor's health and type come from its definition, an unknown character id is rejected instead of silently becoming Wanda, and the Kid rule (Health 2, Slippery once per Turn on a single Move) is enforced from `Survivor.survivorType`. The five skills the cards use that the code lacked — Jump, Shove, Roll 6: +1 Die Combat, and +1 to Dice Roll for Melee and for Combat — are implemented rather than declared. `Survivor.skillChoices` records which option was taken at each level, and a repeat stacks: Odin's Red offers the `+1 Die: Melee` he already holds at Blue, and taking it rolls a second extra die (`skillCount` in `SkillRegistry.ts` reads the copies for every numeric skill).
- **D2** — starting equipment is dealt from the six grey-back cards, seeded from `GameState.seed`, and the Fire Axe holder takes the first player token. With fewer than six survivors the Axe may not be dealt at all — the base game always plays six — and the token then stays with the host.
- **D3** — the Zombie deck is the real 40 cards: one zombie type per card, Rush cards (never Runners), Abominations from Blue on #019–#036, and the 2× Walker / 1× Brute / 1× Runner Extra Activations. `SpawnRegistry.test.ts` pins the composition so a transcription slip fails a test.
- **D4** — a zombie group splits between every equally short route, dealt round-robin per type.
- **D5** — breaking noise ties by distance is **closed as intentional**: the rules leave the tie-break open, and distance is deterministic and matches what a table would do.
- **D7** — `ScenarioCompiler` groups building zones at compile time and marks the building holding the player start, and any building open at the start, as already spawned.
- **D8** — Sprint stops in the first zone with zombies instead of failing, honours Slippery and spends a free Move; Charge and Bloodlust apply movement rules to the zone they cross; Born Leader drops the same-zone requirement and refuses a grant to a player whose turn has passed.
- **D9** — Matching Set shuffles the deck afterwards, the no-op `NOTHING` action is gone, and Objective and Epic crate actions are logged once.
- **D10** — a survivor owing an Orange/Red skill choice cannot act until it is made; the other players are unaffected.
- **D11** — door-open spawns record their cards in a `spawnContext` of the Spawn Step's shape, so the feed shows what was drawn.

---

## 5. Simplification opportunities

None open. `rules-deviations-pass` applied the table:

- `zoneHasZombies` / `zombiesInZone` (`handlerUtils.ts`) is the one reading of zone control, used by Move, Sprint, Charge, Bloodlust, Lifesaver, Search and Combat.
- `walkMovePath` is the one walk of a movement path — connection, door, extra Action per zombie left, stop on entering zombies — and `walkSurvivorMove` wraps it with Slippery, the skill or a Kid's once per Turn. Move, Sprint, Charge and Bloodlust all go through it, which is what made D8 three call sites instead of three reimplementations.
- `ScenarioCompiler.assignBuildings` labels each building zone with its building at compile time and marks the ones that can never spawn, replacing the runtime walk in `DoorHandlers` and giving D7 somewhere to live.
- `idsOfType` in `ZombiePhaseManager` replaced four copies of the same filter, and `countZombiesOfType` with it.
- `DANGER_VALUES` moved to `src/config/DangerValues.ts`; `getZombieToughness` is only in `handlerUtils.ts`; `DeckService.shuffleDeck` is the shared seeded shuffle.

**Dead code removed:** the `NOTHING` action, `advanceTurnState`, `canAct`, the duplicate `DANGER_VALUES` and `getZombieToughness`, the RNG burn in `spawnZombie`, the full state clone in `DeckService.drawSpawnCard`, the unused living-survivors branch in `checkGameEndConditions`, the double history entries in `ObjectiveHandlers` and `EpicCrateHandlers`, and the `sprintBlocked` string Sprint no longer needs.

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
- (After `cards-and-inventory-pass`, covered by Vitest) Every drawn card ends in an inventory, the staging slot or a discard pile, and card totals are conserved; Aaahh!! spawns a Walker and stops the draw from search, Epic crate and Hold your nose; discards route to the pile their deck owns and a reshuffled Equipment deck holds no starting or Epic card; a trade leaves both inventories legal and its partner alive; discarding is free at any time and a whole reorganize costs one action.
- (After `rules-deviations-pass`, covered by Vitest) All twelve survivors carry the skill tree on their ID card, every skill those trees name exists, a skill a card grants twice stacks (Odin rolls two extra melee dice, not one), and the Zombie deck's composition — cards per type, the tier split, Rush cards without Runners, the Extra Activations — is pinned. Jump crosses the zone between and still pays for the one it leaves; Shove pushes a zone's zombies one zone over for free; Roll 6 rolls again for each 6; +1 to Dice Roll lifts every die. Starting equipment is dealt from the six grey-back cards and is reproducible from the seed, and the Fire Axe holder takes the first player token; a survivor's health and type come from its character definition and an unknown character id is rejected; a Kid's Slippery waives the zombie rules on one Move per Turn; Sprint stops in the first zone with zombies, honours Slippery and spends a free Move; Charge stops in a middle zone holding zombies; Born Leader reaches another zone but refuses a player whose turn has passed; a zombie group splits evenly per type between equally short routes; the building holding the player start, and any building open at the start, never spawn, while another building spawns once and reports its card in the event feed; a survivor owing a skill choice cannot act until it is made, and the other players can.
- (After `combat-rules-pass`, covered by Vitest) A Brute shields the Walker behind it from a ranged attack and dies first when the damage is enough; melee skips it; every Friendly Fire miss is offered for assignment and applied, never to the shooter; Tough ignores one wound per attack step and per attack action, including one of a Damage 2 miss; Lucky re-arms on the next attack; Reaper kills one extra per killing hit; a Molotov kills the survivors in the zone; the `sniper` keyword grants free targeting and suppresses Friendly Fire; a `reload` weapon refuses a second shot, reloads by action and free in the End Phase; a dual-mode weapon resolves as melee in the own zone with Super Strength and no Friendly Fire, and as ranged on request.
- Equipment deck 45 cards, Epic deck 11, stats and counts match.
- (After `fix-critical-rules`, covered by Vitest) Straight-line LOS/range shared by combat, Lifesaver, zombies and client; zombies never open doors; move cost = base + zombies left, rejected when unaffordable, Hit & Run waiver; free Melee/Ranged before free Combat; door spawns use full spawn rules at live danger level; wound distribution (host) and ITAYG (owner) block play and delay End Phase; Orange/Red skill choice; free-action skills immediate; Amy free Move round 1.

---

## Nothing open

Every item this review raised — C1–C7, B1–B11, S1–S8, D1–D11 — is closed. One note carried forward rather than filed as a bug:

- Ultrared mode (earning skills past Red) is not implemented; it is an optional mode, not a base rule. The rule, what the code would need and when to revisit are written up in `TODO.md`.
