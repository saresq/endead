## 1. Shared helpers first

- [ ] 1.1 `applyWound(state, survivorId, amount, context)` owning Tough consumption and death; replaces the wound paths in `CombatHandlers.ts:532-556`, `ZombiePhaseManager.applyZombieAttack:107-136` and `handlerUtils.handleSurvivorDeath`
- [ ] 1.2 `recordKill(state, zombie)` replacing the three kill sites (`CombatHandlers.ts:101`, `:368`, `:399`) and deduping the objective updates
- [ ] 1.3 Existing Vitest suites stay green with no behaviour change yet

## 2. Small fixes the helpers unlock

- [ ] 2.1 B3 Tough: reset per `activateZombieSet` call and per ranged action via the wound `context`; subtract exactly 1 wound; delete the per-round reset at `XPManager.ts:120-121`
- [ ] 2.2 B3 Tough: fix the "every Turn" wording in `SkillRegistry.ts`
- [ ] 2.3 B4 Molotov kills survivors in the zone through `applyWound` / death (`CombatHandlers.ts:113-127`)
- [ ] 2.4 B8 Lucky once per action instead of `luckyUsedThisTurn` (`CombatHandlers.ts:210`, `:583`)
- [ ] 2.5 B9 Reaper one extra kill per killing hit (`CombatHandlers.ts:353`, `:389`); delete the always-false `reaperUsed`
- [ ] 2.6 Tests per fix, including Tough across two attack steps in one round and Tough on a Damage-2 Friendly Fire miss

## 3. Hit assignment

- [ ] 3.1 B1 One ordered assignment walk taking "cannot kill" behaviour as a parameter: ranged stops, melee skips (`CombatHandlers.ts:380-383`)
- [ ] 3.2 B1 Tests: Brute + Walker with two Damage 1 hits kills neither; enough damage kills the Brute then continues; melee kills both Walkers past a Brute
- [ ] 3.3 B2 Friendly Fire loops until every miss is spent, damage applied per miss, shooter never a target (`CombatHandlers.ts:326-350`)
- [ ] 3.4 B2 Tests: three misses into a zone with two other survivors apply all three

## 4. Weapon keywords

- [ ] 4.1 B5 `hasSniper = skills.includes('sniper') || weapon.keywords?.includes('sniper')` (`CombatHandlers.ts:285`)
- [ ] 4.2 B6 `loaded` flag on the card instance; attack refuses an unloaded `reload` weapon with a clear message
- [ ] 4.3 B6 `RELOAD` action in `ActionProcessor`, and an End Phase sweep loading every `reload` weapon for free
- [ ] 4.4 B7 Card property for melee-and-ranged; attack intent carries the chosen mode; replace the `range[1] === 0` test at `CombatHandlers.ts:81` and drop `_attackIsMelee` from state
- [ ] 4.5 Tests: sniper rifle grants Sniper without the skill; shotgun cannot fire twice unloaded, reloads by action and free in End Phase; Gunblade in melee gets melee skills, no Friendly Fire and Super Strength

## 5. Client combat choices (B10)

- [ ] 5.1 Open the existing target picker when the attack allows free targeting (Sniper, Point-blank at range 0), not melee only (`InputController.ts:571`)
- [ ] 5.2 Ask the player on a Brute-versus-Abomination priority tie (`CombatHandlers.ts:283`)
- [ ] 5.3 Send `protectedSurvivorIds` and `useBarbarian`; add Steady Hand and Barbarian toggles to the attack UI
- [ ] 5.4 Free Friendly Fire assignment reusing the pending-decision pattern from wound distribution
- [ ] 5.5 Spanish strings for every new control and message in `src/strings/es/`

## 6. Dead code

- [ ] 6.1 Delete `applyLuckyReroll` and the `AttackRollResult` import (`CombatDice.ts:93-113`, `CombatHandlers.ts:9`)
- [ ] 6.2 Delete `isRanged`, the duplicate of `isRangedWeapon` (`CombatHandlers.ts:309`)
- [ ] 6.3 Confirm combat code is smaller than before this change

## 7. Verification

- [ ] 7.1 `npm test` passes; `npm run build` type-checks
- [ ] 7.2 Two-player playtest: Brute shielding, Friendly Fire with more misses than survivors, Molotov clearing a zone with a survivor in it, shotgun reload across two turns
- [ ] 7.3 Update `RULES-REVIEW.md`: remove `B1`–`B10`, refresh line numbers, note the change that fixed them
