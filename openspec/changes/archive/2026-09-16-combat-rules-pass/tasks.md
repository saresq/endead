## 1. Shared helpers first

- [x] 1.1 `applyWound(state, survivorId, amount, context)` owning Tough consumption and death; replaces the wound paths in `CombatHandlers.ts:532-556`, `ZombiePhaseManager.applyZombieAttack:107-136` and `handlerUtils.handleSurvivorDeath`
- [x] 1.2 `recordKill(state, zombie)` replacing the three kill sites (`CombatHandlers.ts:101`, `:368`, `:399`) and deduping the objective updates
- [x] 1.3 Existing Vitest suites stay green with no behaviour change yet

## 2. Small fixes the helpers unlock

- [x] 2.1 B3 Tough: reset per `activateZombieSet` call and per ranged action via the wound `context`; subtract exactly 1 wound; delete the per-round reset at `XPManager.ts:120-121`
- [x] 2.2 B3 Tough: fix the "every Turn" wording in `SkillRegistry.ts`
- [x] 2.3 B4 Molotov kills survivors in the zone through `applyWound` / death (`CombatHandlers.ts:113-127`)
- [x] 2.4 B8 Lucky once per action instead of `luckyUsedThisTurn` (`CombatHandlers.ts:210`, `:583`)
- [x] 2.5 B9 Reaper one extra kill per killing hit (`CombatHandlers.ts:353`, `:389`); delete the always-false `reaperUsed`
- [x] 2.6 Tests per fix, including Tough across two attack steps in one round and Tough on a Damage-2 Friendly Fire miss

## 3. Hit assignment

- [x] 3.1 B1 One ordered assignment walk taking "cannot kill" behaviour as a parameter: ranged stops, melee skips (`CombatHandlers.ts:380-383`)
- [x] 3.2 B1 Tests: Brute + Walker with two Damage 1 hits kills neither; enough damage kills the Brute then continues; melee kills both Walkers past a Brute
- [x] 3.3 B2 Friendly Fire loops until every miss is spent, damage applied per miss, shooter never a target (`CombatHandlers.ts:326-350`)
- [x] 3.4 B2 Tests: three misses into a zone with two other survivors apply all three

## 4. Weapon keywords

- [x] 4.1 B5 `hasSniper = skills.includes('sniper') || weapon.keywords?.includes('sniper')` (`CombatHandlers.ts:285`)
- [x] 4.2 B6 `loaded` flag on the card instance; attack refuses an unloaded `reload` weapon with a clear message
- [x] 4.3 B6 `RELOAD` action in `ActionProcessor`, and an End Phase sweep loading every `reload` weapon for free
- [x] 4.4 B7 Card property for melee-and-ranged; attack intent carries the chosen mode; replace the `range[1] === 0` test at `CombatHandlers.ts:81` and drop `_attackIsMelee` from state
- [x] 4.5 Tests: sniper rifle grants Sniper without the skill; shotgun cannot fire twice unloaded, reloads by action and free in End Phase; Gunblade in melee gets melee skills, no Friendly Fire and Super Strength

## 5. Client combat choices (B10)

- [x] 5.1 Open the existing target picker when the attack allows free targeting (Sniper, Point-blank at range 0), not melee only (`InputController.ts:571`)
- [x] 5.2 Ask the player on a Brute-versus-Abomination priority tie (`CombatHandlers.ts:283`)
- [x] 5.3 Send `protectedSurvivorIds` and `useBarbarian`; add Steady Hand and Barbarian toggles to the attack UI
- [x] 5.4 Free Friendly Fire assignment reusing the pending-decision pattern from wound distribution
- [x] 5.5 Spanish strings for every new control and message in `src/strings/es/`

## 6. Dead code

- [x] 6.1 Delete `applyLuckyReroll` and the `AttackRollResult` import (`CombatDice.ts:93-113`, `CombatHandlers.ts:9`)
- [x] 6.2 Delete `isRanged`, the duplicate of `isRangedWeapon` (`CombatHandlers.ts:309`)
- [x] 6.3 Confirm combat code is smaller than before this change — **it is not**: the combat files went from 1332 to 1429 lines. The refactors removed code (three wound paths, three kill sites, two assignment loops, `applyLuckyReroll`, `isRanged`, `reaperUsed`, `_attackIsMelee`), but the change also adds two features the review asked for: the Reload action and sweep (50 lines) and the friendly-fire pending decision. Net of Reload the delta is +47.

## 7. Verification

- [x] 7.1 `npm test` passes; `npm run build` type-checks
- [x] 7.2 Two-player playtest (Chromium via Playwright MCP, two tabs, `npm run dev`):
  - **Live, end to end:** a ranged attack from the own zone (dice, hits, threshold, `lastAction.isMelee: false`, kill, AP charged); a melee attack that opened the target picker over three zombies, where picking the *second* one killed exactly that one (`isMelee: true`, Damage 2, XP credited); zombie wound distribution of 3 wounds across two survivors in one zone, with the new `contextId` on the entry and the non-host waiting banner; the Reload button appearing only for an unloaded `reload` weapon and going away once loaded; the Molotov confirmation naming the survivor in the zone, warning that it kills the thrower too and that a death loses the run, and sending nothing when cancelled.
  - **UI verified with injected client state** (no crowbar or axe was ever drawn, so no building could be opened and no weapon beyond the starting pistol and katana could be searched for): the friendly-fire assignment modal (its own title, "3 fallos … cada uno hace 2 heridas"), the Brute-versus-Abomination tie offering *only* those two, Steady Hand's protect toggles, the melee/ranged switch on a dual-mode weapon and the Barbarian toggle. Each one sent the right payload: `targetZombieIds`, `protectedSurvivorIds`, `attackMode: 'MELEE'`, `useBarbarian: true`.
  - **Not reproduced live:** Brute shielding and friendly fire with more misses than survivors — both need equipment or a board the running game never dealt. Covered by `CombatRules.test.ts`.
  - Console showed no client errors beyond `NOT_YOUR_TURN` from the script acting out of turn.
- [x] 7.3 Update `RULES-REVIEW.md`: remove `B1`–`B10`, refresh line numbers, note the change that fixed them
