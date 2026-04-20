# 00d — Preflight Bugfixes: Polish

Source: `analysis/SwarmComms.md` §0.1 — B8, B10, B11.

## Scope

Three small cleanups that don't fit the other preflight groups. Small blast radius each.

Non-goals: any restructure beyond the three items.

## Preconditions

`00c-bugfixes-map-and-spawn.md` reviewed and deleted.

## Work items

### B8 — Narrow `preferredFreePool` type
- Location: `src/types/Action.ts` (ATTACK payload) and `handlerUtils.ts`'s `deductAPWithFreeCheck` signature.
- Today the type is likely `string | undefined` or similarly broad. Narrow to `'combat' | 'melee' | 'ranged' | undefined`.
- Propagate through attack payload constructors in `CombatHandlers.ts` and `ActionProcessor.ts`.
- No behavior change; this is a type-safety preflight so Step 3's collector threading doesn't inherit a wide type.

### B10 — `epic_aaahh` has `stats: undefined`
- Location: `src/config/EquipmentRegistry.ts` (the `epic_aaahh` entry).
- Today stats is explicitly `undefined`. Make `EquipmentCard.stats` **optional** in `src/types/GameState.ts` (or wherever the interface lives), then drop the explicit `undefined` in the registry entry.
- Propagate: any code that reads `card.stats` without a nullish guard gets a clean fix (should already guard — verify).

### B11 — Reaper removal completeness
- Grep across `src/` for `reaper_combat` and `reaper_melee`. For each residual reference:
  - If it's a character skill tree slot: pick a core-box replacement (per rules-audit U1 — Reaper skills are not in Z2E core box). Coordinate with whatever character registry still refers to them.
  - If it's dead code / legacy test fixture: delete it.
- Test: start a game with every character that previously had Reaper skills → their skill tree uses core-box replacements; no runtime errors.

## Gameplay invariants that MUST hold

1. **Attack flow**: narrowing `preferredFreePool` does not change which free-pool is consumed on any existing attack path.
2. **Epic equipment**: `epic_aaahh` (and any other stat-less card) still draws, equips, and uses without crashing — the nullish-safe read paths work.
3. **Characters with former Reaper slots**: have a valid skill tree entry for every level that previously held a Reaper skill; none crash on level-up.
4. **No test fixtures** still reference Reaper skills after this task.

## Verification

- `npm test` — green.
- Manual: play through level-up for each affected character; confirm skill tree shows real skills.
- Confirm `git diff` scope: `Action.ts`, `handlerUtils.ts`, `CombatHandlers.ts`, `ActionProcessor.ts`, `EquipmentRegistry.ts`, `GameState.ts` (if card interface), `CharacterRegistry.ts` (if reaper residuals), `SkillRegistry.ts`.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms preflight B8/B10/B11. Do NOT rubber-stamp.
>
> Required checks:
> 1. For B8: grep for `preferredFreePool` — is every site using the narrow type? Does the TS compile clean? Any suspicious `as any` casts introduced to paper over type errors?
> 2. For B10: grep `stats: undefined` — is `epic_aaahh` the only one, is it removed? Is `EquipmentCard.stats` optional in the type? Does every read-site of `card.stats` nullish-guard? Is there a Vitest drawing/equipping/using `epic_aaahh`?
> 3. For B11: grep `reaper_combat|reaper_melee` across the entire `src/` — every hit must be either removed or replaced. Is there a test covering level-up for every affected character?
> 4. `npm test` — green.
> 5. Unrelated regressions: diff scope matches the task file's list.
> 6. Invariants: all four hold. For each, name the code path.
>
> Output format:
> - `VERDICT: PASS` or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant
> - `DID NOT VERIFY:` unreachable items

On PASS: delete this file; flip the checkbox in `README.md`.
On FAIL: loop until PASS.
