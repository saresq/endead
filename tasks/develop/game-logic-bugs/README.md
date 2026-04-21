# Game Logic Bugs — Implementation Tracker

Source findings: `../game-logic-bugs.md` (canonical). This dir contains the
phased execution plan for those findings.

Authoritative rules source: `.claude/skills/zombicide-rules/SKILL.md` and
`RULEBOOK.md`. When in doubt, invoke the `zombicide-rules` skill.

## Phase Order (FIXED)

Phases ordered by risk, starting with silent-corruption fixes and ending with
polish. Each phase is a self-contained PR-sized unit.

- [x] `01-criticals-surgical.md` — C5, C2, C3 (movement AP flat, delete auto-reload, Lucky per-Action)
- [x] `02-criticals-combat-handlers.md` — C4, C6 (Molotov zone-wipe, Epic Aaahh! trap helper)
- [x] `03-zombie-ai-and-tests.md` — m9 then C1, M4 (add coverage, no door-break, tied-noise splitting)
- [x] `04-movement-and-turn.md` — M1, M2, M3, m10, m11 (Sprint partial, Reorganize AP, Trade-cancel AP, Search validator, born_leader)
- [x] `05-spawn-and-objectives.md` — M6, M7 (Abomination cap, per-zone objective XP)
- [x] `06-inventory-and-search.md` — M5, m5, m4 (EQUIP validation, matching_set through DeckService, mid-turn skill seed)
- [x] `07-polish-and-questions.md` — m1, m2, m3, m6, m7, Q1, Q2, Q3 (safety clamps, priority tie UX, deck exhaustion, product decisions)
- [x] `08-necromancer.md` — m8 (Necromancer implementation; **deferred — out of scope for this version**)

## Review Protocol (applies to every phase)

Each phase file embeds this protocol in its `## Review protocol` section.
After finishing a phase's work items:

1. Spawn a **skeptical gameplay-integrity reviewer** subagent (general-purpose
   or Explore) with the protocol text from the phase file.
2. Reviewer outputs `VERDICT: PASS` or `VERDICT: FAIL` + concerns.
3. On FAIL: fix every concern; re-run reviewer; repeat until PASS.
4. On PASS: delete the phase file; flip the checkbox above to `[x]`; append a
   line to the Progress Log below.

Reviewer charter: default to "what could be broken?" Never rubber-stamp. Treat
the developer's claims with suspicion. Cite `.claude/skills/zombicide-rules/`
for every rules call.

## Constraints (HARD — from `CLAUDE.md`)

- **No git actions.** No `git commit`, no `git add`, no `git push`, no
  `git reset`, no `git checkout`, no `git stash`, no `git rebase`. Not on task
  pass, not on phase completion, not on "wrapping up". Overrides any reviewer
  suggestion.
- **Development-only focus.** Each phase is code changes, tests, and in-memory
  verification.
- All gameplay RNG stays in `src/services/Rng.ts`. Combat dice stay in
  `src/services/CombatDice.ts`.
- `GameState.seed` remains a 4×uint32 tuple.
- Vitest tests under `src/**/__tests__/` stay green at every phase boundary.
- No backward compat. Rewrite tests; do not gate.
- Source-of-truth update: when a phase passes, update both this README *and*
  `../game-logic-bugs.md` (strike or remove the addressed entries).

## Progress Log

- 2026-04-20 — Phase 01 (C5, C2, C3) PASS. 8 new tests in `src/services/__tests__/Phase01Criticals.test.ts`; suite 158→166 green. Reviewer noted pre-existing Hit & Run validator/handler divergence (out of phase scope).
- 2026-04-20 — Phase 02 (C4, C6) PASS. 9 new tests in `src/services/__tests__/Phase02Criticals.test.ts`; suite 166→175 green. Molotov now kills all zone actors with lethal damage (separate `pendingMolotovWounds` field for Is That All You've Got? cancellation); Aaahh!! trap handling extracted into `handleAaahhTrap` helper shared across Search, Epic Crate, and Hold Your Nose draw paths.
- 2026-04-21 — Phase 03 (m9, C1, M4) PASS, one reviewer round. 26 new tests across `src/services/__tests__/ZombieAI.test.ts` (10) and `src/services/__tests__/ZombiePhaseManager.test.ts` (14) + 2 added within the existing split tests; suite 175→201 green. `ZombieAction` type union trimmed to `ATTACK | MOVE | NONE`; `findBlockedDoor`, `breakDoor`, and `ZOMBIE_DOOR_BROKEN` removed. New `ZombieAI.planMoves` groups zombies by `(source, type, tied-option-set)`, apportions round-robin, and emits per-zombie prompts for the remainder; `pendingZombieSplit` stages `pass2` and `pass3` pauses; `RESOLVE_ZOMBIE_SPLIT` action handler (active player only) resolves each prompt and auto-resumes via `executeZombiePhase` re-entry.
- 2026-04-21 — Phase 05 (M6, M7) PASS, two reviewer rounds. 6 new tests in `src/services/__tests__/Phase05SpawnAndObjectives.test.ts` + 1 new validate-first case in `src/services/__tests__/HandlerValidation.test.ts`; suite 217→224 green. M6: default `zombiePool[Abomination]` = 1 (was 4) so multi-count spawn details can't bypass the Standard-mode cap. M7: `Objective.zoneId?: string` added; `ScenarioCompiler` emits one `TakeObjective` per token zone (`obj-take-${zid}`, `xpValue: 5`) instead of one aggregate; `handleTakeObjective` matches by zoneId (with payload color/id tiebreaker), throws on unresolved match or missing xpValue, awards and updates only the matched objective. Validate-first §3.10 compliance: lookup moved above all mutations/emits.
- 2026-04-21 — Phase 04 (M1, M2, M3, m10, m11) completed without reviewer round (user ended workflow early). 16 new tests in `src/services/__tests__/Phase04MovementAndTurn.test.ts`; suite 201→217 green. M1: removed `if (i + 1 < 2) throw` from `handleSprint` so a 1-zone zombie stop is legal. M2: `handleOrganize` now owns its AP deduction with free-path predicate (drawnCard OR trade participant) snapshotted pre-mutation — fixes DISCARD-drawnCard timing bug; ORGANIZE moved to the ActionProcessor "handler owns AP" skip group. M3: `handleTradeStart` calls `deductAPWithFreeCheck(..., TRADE_START)`; the post-execute refund line removed from `executeTrade`; Cancel/Accept remain free sub-actions. m10: TurnManager rejects SEARCH with `ALREADY_SEARCHED` when `hasSearched && !can_search_more_than_once`, independent of `freeSearchesRemaining`. m11: one-line comment at SkillHandlers.ts explaining "free Action" == `target.actionsRemaining += 1` in this AP==slot engine; no behavior change.
- 2026-04-21 — Phase 07 (m1, m2, m3, m6, m7, Q1, Q2, Q3) PASS, one reviewer round. 13 new tests in `src/services/__tests__/Phase07PolishAndQuestions.test.ts`; suite 241→254 green (two dead B6 doubleSpawn tests removed with the feature). m1: `CombatDice.clampThreshold` now clamps to `[2, 6]` so a natural 6 always hits even with bad weapon data. m2/m3: new validate-first block in `handleAttack` rejects ranged attacks with a Brute+Abomination priority-1 tie and multi-target melee attacks when `targetZombieIds` is absent. m6: new `EPIC_DECK_EXHAUSTED` event emitted from `handleTakeObjective` on a null Epic draw (map editor deferred to cap Epic Crate count). m7: `doubleSpawn` removed — field stripped from `SpawnDetail`, branches deleted in `ZombiePhaseManager` and `DoorHandlers`, client renderer cleaned, stale tests removed. Q1: `config.friendlyFire` removed entirely — FF is always on per rules. Q2: `CharacterRegistry` defaults now match the grey-back starter deck (Bat×1, Crowbar×1, Fire Axe×1, Pistol×3); player-choice picker UI logged as follow-up TODO. Q3: Flashlight + `search_plus_1` stay non-stacking at 2 draws with an explanatory comment.
- 2026-04-21 — Phase 06 (M5, m5, m4) PASS, two reviewer rounds. 19 new tests in `src/services/__tests__/Phase06InventoryAndSearch.test.ts`; suite 224→243 green. M5: `handleResolveSearch` EQUIP branch whitelists target slots (`HAND_1|HAND_2|BACKPACK_0|BACKPACK_1|BACKPACK_2`) and rejects sentinels (`BACKPACK`/`DISCARD`) and unknown names before any mutation. m5: `DeckService.drawCardWhere(state, predicate, collector)` replaces the direct `equipmentDeck.splice` in matching_set — reshuffles discard on empty-deck miss (emitting `DECK_SHUFFLED`), shuffles live deck after successful splice (RULEBOOK.md:543 "Shuffle deck after"), and `handleSearch` routes any Aaahh!! returned via `handleAaahhTrap`. m4: `XPManager.unlockSkill` immediately increments the matching per-turn pool (`freeMovesRemaining`, `freeSearchesRemaining`, `freeMeleeRemaining`, `freeRangedRemaining`, `freeCombatsRemaining`) when the unlocked skill is a `plus_1_free_*` — end-of-round reseed stays authoritative for subsequent turns.
- 2026-04-21 — Phase 08 (m8 Necromancer) DEFERRED by user decision — not planned for this version. Phase file removed; `game-logic-bugs.md` m8 entry struck with a deferral note. Queue empty.
