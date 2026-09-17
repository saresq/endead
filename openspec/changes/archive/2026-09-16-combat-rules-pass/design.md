## Context

`RULES-REVIEW.md` §2 is the source for this change. It was produced by reading the server against `RULEBOOK.md` and the `zombicide-rules` skill, and it carries exact line numbers for every item. Its guiding principle is the one this change follows: **the simplest logic that delivers a fully functional game, preferring shared helpers over new parallel code paths.**

**Source of truth for any rules question that comes up during implementation:** `RULEBOOK.md` first. Where the rulebook does not answer it, official Guillotine Games / CMON material for Zombicide 2nd Edition — the printed component the rulebook points to, the official FAQ, or published errata. A house ruling is a last resort and must be recorded as a decision here, never invented silently in code.

Almost everything here lives in `src/services/handlers/CombatHandlers.ts`. The exceptions are the zombie-side wound path in `ZombiePhaseManager.applyZombieAttack` (`:107-136`), the death helper in `handlerUtils.handleSurvivorDeath`, the Tough reset in `XPManager.resetSurvivorTurn` (`:120-121`), the unread keywords in `EquipmentRegistry` (`:73`, `:165`, `:241`, `:319`), and the client's target picker (`InputController.ts:571`).

`fix-critical-rules` already established the patterns this change reuses: shared modules over duplicated logic, pending-decision state that blocks play until the owner answers (wound distribution, skill choice), and Vitest per capability.

## Goals / Non-Goals

**Goals:**
- Combat plays by the rulebook for `B1`–`B10`.
- Less combat code than before, not more.
- One place applies a wound, one place records a kill.
- Equipment keywords that exist in data actually do something.

**Non-Goals:**
- Cards, skills and inventory (`S1`–`S8`) and rule deviations (`D1`–`D11`); separate passes.
- Rebalancing anything the rulebook does not specify.
- Reworking the dice pipeline. `CombatDice.ts` keeps owning the accuracy clamp and reroll ordering per `CLAUDE.md`.
- A combat log redesign.

## Decisions

### D1. One wound function, and `B3` becomes small
Today a wound is applied in three places: `CombatHandlers.ts:532-556`, `ZombiePhaseManager.applyZombieAttack:107-136`, and `handlerUtils.handleSurvivorDeath`. Tough is checked in two of them with a flag reset in a third file. Fixing `B3` in place means editing three code paths and keeping them agreed.

Instead one `applyWound(state, survivorId, amount, context)` owns it: Tough consumption, death, and the resulting state. `context` says which attack step or Friendly Fire instance the wound belongs to, which is exactly what Tough needs to reset per instance instead of per round — so the `XPManager.resetSurvivorTurn` reset (`:120-121`) is deleted rather than rescheduled. The review's §5 table lists this as fixing `B3` on its own.

### D2. Hit assignment is one ordered walk with a stop condition
`B1` is not two behaviours. Ranged assigns by priority and stops when the current target cannot be killed; melee assigns freely and skips such targets. Both are the same walk over a priority-ordered list with a different response to "cannot kill": stop, or skip. One function taking that as a parameter, rather than two assignment routines.

### D3. Friendly Fire loops over misses, and asks only when it must
`B2`'s minimum fix is looping until every miss is spent instead of taking one survivor per miss in array order. The rules also let the player assign misses freely. Player assignment reuses the pending-decision pattern `fix-critical-rules` built for wound distribution rather than inventing a second mechanism.

Alternative considered: always auto-assign and never ask. Rejected — it is the same class of silent choice-stealing as `B10`, and the pending-decision machinery already exists. But the loop lands first and independently, so `B2` is fixed even if assignment UI slips.

### D4. Reload is a card flag plus an action, not a new subsystem
`B6` needs three things: a `loaded` flag on the card instance, a `RELOAD` action that sets it, and an End Phase sweep that sets it on every `reload` weapon. No new deck state, no per-weapon ammo counts. The attack path checks the flag when the weapon carries the keyword and refuses otherwise.

### D5. Melee-or-ranged is a card property and an attack parameter
`B7` exists because `CombatHandlers.ts:81` decides melee by `range[1] === 0`, so a 0–1 weapon is always ranged. The weapon declares that it can do both; the attack says which mode the player chose. This also removes `_attackIsMelee` from state in favour of a parameter, which the review lists as cleanup.

### D6. `B10` is the client half of the same rules
Free targeting, the Brute/Abomination tie, Steady Hand and Barbarian are all cases where the server already has the fields (`protectedSurvivorIds`, `useBarbarian`) and the client never sends them. The target picker at `InputController.ts:571` opens for melee only; it opens whenever the attack has a choice to make. No new picker component — the existing one gains the cases.

### D7. Delete as we go
`applyLuckyReroll` and its `AttackRollResult` import (`CombatDice.ts:93-113`, `CombatHandlers.ts:9`), `isRanged` (a duplicate of `isRangedWeapon`, `:309`), and `reaperUsed` (always false where checked, `:353`, `:389`) are dead or wrong and are removed in the commits that touch them, not in a separate sweep.

## Risks / Trade-offs

- [Molotov killing survivors is a real difficulty change players will feel] → It is the rule, and the review lists it as a bug. Called out as **BREAKING** in the proposal so it is not a surprise.
- [Tough resetting per attack step makes survivors tougher across a round with extra activations] → Also the rule. The current per-round reset is the deviation.
- [`B1`'s stop condition can leave hits unspent and feel like a bug to players] → That is the shielding rule working; the combat log should say the hit could not kill the target, so it reads as a rule and not a lost click.
- [One `applyWound` touching survivor combat and the zombie phase is a wide change] → It is the same change the review recommends, and `fix-critical-rules` already has Vitest coverage on the zombie attack step and wound distribution to catch regressions.
- [`B10` is client work in a mostly-server change] → It can land last; every server fix is independently testable without it. If it slips, the game is still more correct than today.
- [Reload changes shotgun tempo significantly] → Two weapons, both flagged in data as needing it. The End Phase free reload keeps the cost to one action per turn at most.

## Migration Plan

Order follows dependency, not the review's numbering:

1. `applyWound` + `recordKill` helpers, with existing tests kept green. Unlocks `B3`.
2. `B3` Tough, `B4` Molotov, `B8` Lucky, `B9` Reaper — all small once the helpers exist.
3. `B1` assignment walk, `B2` Friendly Fire loop.
4. `B5` sniper keyword, `B6` reload, `B7` melee-or-ranged.
5. `B10` client choices, including free Friendly Fire assignment.

Games live in memory, so a deploy restart clears any state shaped by the old rules. No migration of persisted data.

## Open Questions

None. Where the review offered a choice — `B2` player assignment versus a minimum loop — D3 takes both, in that order.
