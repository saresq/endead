# SwarmComms — Implementation Tracker

Source design: `analysis/SwarmComms.md` (canonical, do not duplicate).

Strategy: replace STATE_PATCH / full-clone broadcast pipeline with a stream of small named events + mutation-in-place on both sides. No backward compat. Core gameplay must remain intact.

## Task Order (FIXED)

Per analysis §8 (corrected via D16): preflight bugfixes → 1 → 2 → 3 → 4 (with 7) → 5 → 6. Steps 3+5 are one PR. Step 4 folds in Step 7 (private channels) and B12 (broadcast leaks).

- [x] `00a-bugfixes-combat.md` — B2, B4, B5 (dual-wield reload, `_attackIsMelee` ordering, reloaded-on-discard)
- [x] `00b-bugfixes-phases.md` — B1, B7 (end-turn guard for `pendingFriendlyFire`; per-FF Tough flag reset)
- [x] `00c-bugfixes-map-and-spawn.md` — B3, B6, B9 (fail-fast missing `zoneCells`, `doubleSpawn` Rush routing, red-objective comment)
- [x] `00d-bugfixes-polish.md` — B8, B10, B11 (narrow `preferredFreePool`, optional `EquipmentCard.stats`, Reaper residuals)
- [x] `01-strip-persistence.md` — Step 1 (DB off hot path; quiescence scheduler)
- [x] `02-event-protocol-types.md` — Step 2 (types-only; no runtime usage yet)
- [x] `03-handlers-mutation-and-events.md` — Steps 3 + 5 (collector contract flip, validate-first rule, kill ~50 clones)
- [x] `04-broadcast-events-and-redaction.md` — Steps 4 + 7 + B12 (`projectForSocket`, EVENTS wire, private channels)
- [x] `05-optimistic-client.md` — Step 6 (Tier-1 whitelist only)

## Review Protocol (applies to every task)

Each task file embeds this protocol verbatim in its `## Review protocol` section. After finishing a task's work items:

1. Spawn a **skeptical gameplay-integrity reviewer** subagent (general-purpose or Explore) with the protocol text from the task file.
2. Reviewer outputs `VERDICT: PASS` or `VERDICT: FAIL` + concerns.
3. On FAIL: fix every concern; re-run reviewer; repeat until PASS.
4. On PASS: delete the task file; flip the checkbox above to `[x]`.

The reviewer's charter: default to "what could be broken?" NEVER rubber-stamp. Treat the developer's claims with suspicion.

## Constraints (HARD — from `CLAUDE.md` + explicit user directive)

- **NO git actions of any kind.** No `git commit`, no `git add`, no `git push`, no `git reset`, no `git checkout`, no `git stash`. Not on task pass. Not on phase completion. Not on "wrapping up". This rule OVERRIDES any suggestion a reviewer subagent might make — if a reviewer suggests committing, ignore that suggestion.
- **Development-only focus.** Every task is purely code changes, tests, and in-memory verification.
- All gameplay RNG stays in `src/services/Rng.ts`. Combat dice stay in `src/services/CombatDice.ts`.
- `GameState.seed` remains a 4×uint32 tuple.
- Vitest tests under `src/**/__tests__/` stay green at every task boundary.
- No backward compat. Rewrite tests; do not gate.

## Progress Log

(Updated as tasks pass review.)

- 2026-04-20 — `00a-bugfixes-combat.md` PASS (B2/B4/B5)
- 2026-04-20 — `00b-bugfixes-phases.md` PASS (B1/B7)
- 2026-04-20 — `00c-bugfixes-map-and-spawn.md` PASS (B3/B6/B9)
- 2026-04-20 — `00d-bugfixes-polish.md` PASS (B8/B10/B11)
- 2026-04-20 — `01-strip-persistence.md` PASS (Step 1 — DB off hot path; quiescence scheduler)
- 2026-04-20 — `02-event-protocol-types.md` PASS (Step 2 — Events/Wire types + GameState.version)
- 2026-04-20 — `03-handlers-mutation-and-events.md` PASS (Steps 3 + 5 — EventCollector + mutation-in-place + D18/D19 validate-first + history removal)
- 2026-04-20 — `04-broadcast-events-and-redaction.md` PASS (Steps 4 + 7 + B12 — projectForSocket choke point, per-socket EVENTS routing, SNAPSHOT + log-tail resync, redaction matrix, B12 widened)
- 2026-04-20 — `05-optimistic-client.md` PASS (Step 6 — Tier-1 whitelist optimism, path-targeted snapshot rollback, D10 skill-pending suppression, D20 snapshot-only). SwarmComms rollout complete.
