# 00b — Preflight Bugfixes: Phases & Turn Guards

Source: `analysis/SwarmComms.md` §0.1 — B1, B7. Cross-reference `tasks/develop/rules-audit-findings.md`.

## Scope

Fix two phase/turn coordination bugs that today mask themselves behind the clone-per-handler model. Both become **worse** under mutation-in-place (Step 3+5), so they must land first.

Non-goals: larger TurnManager / ZombiePhaseManager restructure.

## Preconditions

`00a-bugfixes-combat.md` reviewed and deleted.

## Work items

### B1 — `pendingFriendlyFire` doesn't block `checkEndTurn`
- Location: `src/services/TurnManager.ts:128-174` — the `checkEndTurn` guard list.
- Today `checkEndTurn` guards on `drawnCard`, `drawnCardsQueue`, `activeTrade`. It does NOT guard on `pendingFriendlyFire` — meaning a turn can end with unresolved FF assignment, leaving state in an invariant-violating configuration.
- Fix: add `pendingFriendlyFire` to the guard list alongside the three existing guards. `checkEndTurn` should early-return (not end-turn) if `pendingFriendlyFire` is defined.
- Test: attack that triggers FF, do NOT resolve it, attempt to end turn → must be blocked.

### B7 — Tough FF flag resets per round, not per FF instance
- Locations:
  1. `src/services/ZombiePhaseManager.ts:557` — remove the `toughUsedFriendlyFire=false` reset that fires in End Phase.
  2. `src/services/handlers/CombatHandlers.ts` `handleAttack` — at the point where FF resolution begins (before dice are matched against survivors in target zone), reset `toughUsedFriendlyFire=false` on every survivor in the target zone.
  3. `src/services/handlers/CombatHandlers.ts` `handleAssignFriendlyFire` — same reset at entry.
- Reason: the rule is "Tough survives 1 FF hit **per FF instance**", not "per round". Today's round-based reset lets a Tough survivor eat multiple FF hits per round.
- Test: Tough survivor in a zone takes FF from two separate attacks in the same round → second attack should deal the hit (Tough already consumed on attack #1 within that FF instance, but reset between instances so attack #2 FF resolution starts fresh).

## Gameplay invariants that MUST hold

1. **End turn is blocked** while `pendingFriendlyFire` exists.
2. **Tough absorbs one FF hit per FF instance** — not per round. Two FF instances in the same round both give Tough a chance to absorb.
3. **Non-FF gameplay:** end-turn flow, zombie phase End Phase, normal attacks — all unchanged.
4. **All three existing end-turn guards** (`drawnCard`, `drawnCardsQueue`, `activeTrade`) still function.

## Verification

- `npm test` — green.
- Manual: play to FF (dual-wield melee with hit-low so one die lands on a survivor). Try to end turn → blocked. Resolve FF → end-turn enabled.
- Manual: setup two Tough survivors, FF in two separate attacks same round → both Toughs absorb correctly per instance.
- Confirm: `git diff` scope: `TurnManager.ts`, `ZombiePhaseManager.ts`, `CombatHandlers.ts`, tests.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms preflight B1/B7. Do NOT rubber-stamp.
>
> Required checks:
> 1. For B1: read `TurnManager.ts:checkEndTurn`. Is `pendingFriendlyFire` in the guard list with the same semantics as the other three guards (early-return without ending turn)? Is there a Vitest exercising the block?
> 2. For B7: confirm the End Phase reset at `ZombiePhaseManager.ts:~557` is REMOVED. Confirm resets are ADDED at FF-resolution entry in BOTH `handleAttack` and `handleAssignFriendlyFire`. The resets should iterate all survivors in the FF target zone, setting `toughUsedFriendlyFire=false`. Is there a Vitest with two Tough-triggering FF instances in the same round?
> 3. Mid-handler throw safety (preview of Step 3 rule): does the B7 fix add a mutation before any throw that wasn't there before? Report any.
> 4. `npm test` — run it.
> 5. Does the diff touch files outside `TurnManager.ts`, `ZombiePhaseManager.ts`, `CombatHandlers.ts`, and tests? If so, justify.
> 6. Invariants (see task file): all four must hold. For each, name the code path proving it.
>
> Output format:
> - `VERDICT: PASS` or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant
> - `DID NOT VERIFY:` unreachable items

On PASS: delete this file; flip the checkbox in `README.md`.
On FAIL: loop fixes until PASS.
