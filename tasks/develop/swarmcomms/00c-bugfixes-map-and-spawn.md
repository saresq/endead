# 00c — Preflight Bugfixes: Map Geometry & Spawn Routing

Source: `analysis/SwarmComms.md` §0.1 — B3, B6, B9.

## Scope

Harden three board-level paths: fail-fast on missing geometry, route double-spawn activations through the shared Rush handler, and clarify the red-objective branch with a comment.

Non-goals: rewriting ZoneGeometry; redesigning Rush mechanics.

## Preconditions

`00b-bugfixes-phases.md` reviewed and deleted.

## Work items

### B3 — Ranged LOS silently fails without `zoneGeometry.zoneCells`
- Locations: map-loading code path (likely `ScenarioCompiler.ts` / `TileService.ts` — verify with grep for `zoneGeometry` writes); LOS check site in `CombatHandlers.ts` (currently has a BFS fallback).
- Fix: at map-load time, if the compiled map lacks `zoneGeometry.zoneCells`, `throw` immediately — reject the map. No runtime BFS fallback at LOS-check time.
- Delete the BFS fallback branch in the LOS check; leave the straight-line LOS computation as the single path. If LOS computation needs `zoneCells`, it is a programmer error to reach it without them.
- Test: map missing `zoneCells` → load throws with a clear error message.

### B6 — `DoorHandlers.doubleSpawn` skips Rush activation
- Location: `src/services/handlers/DoorHandlers.ts:108-111` (the doubleSpawn loop per D17).
- The double-spawn path draws spawn cards directly without going through the shared Rush/extra-activation handler, so zombies that should activate immediately on spawn don't.
- Fix: extract (or reuse) the Rush/extra-activation helper from `ZombiePhaseManager` / wherever it lives; route each spawn draw in `doubleSpawn` through it. If multiple draws happen in one door-open, each draw independently checks Rush.
- Test: open a building door with conditions that make `doubleSpawn` trigger AND the drawn card has a Rush effect → Rush activates.

### B9 — Red-objective branch reads like a missing case
- Location: the `activateNextPhase` function where blue/green objectives are advanced; red objective branch is a no-op.
- Fix: add a one-line comment clarifying "red zones are always active; `activateNextPhase` is blue/green only". No logic change.
- No new test (comment-only change).

## Gameplay invariants that MUST hold

1. **Maps with complete geometry** still load and play identically — B3 only rejects incomplete maps, which today silently misbehave.
2. **Normal spawn** (non-doubleSpawn) still routes through Rush correctly — B6 only fixes the doubleSpawn branch.
3. **Red-objective** behavior is unchanged — B9 is comment-only.
4. **Ranged LOS** still correctly blocks through walls for valid maps; the deleted BFS fallback was dead code for complete maps.

## Verification

- `npm test` — green.
- Manual: load default map (has geometry) → plays. Load a corrupt map (remove `zoneCells` in a test fixture) → rejected at load.
- Manual: trigger a doubleSpawn on a Rush-eligible spawn card → zombies activate same turn.
- Confirm `git diff` scope: map-loader files, `DoorHandlers.ts`, `CombatHandlers.ts` (LOS), the `activateNextPhase` site.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms preflight B3/B6/B9. Do NOT rubber-stamp.
>
> Required checks:
> 1. For B3: grep for the BFS fallback — is it truly deleted? Is the map-load throw clear enough that a future dev knows what's wrong? Is there a Vitest or loader test covering the reject path?
> 2. For B6: read `DoorHandlers.ts` doubleSpawn loop. Is every draw in the loop routed through the shared Rush handler? Is there a test with doubleSpawn + Rush card?
> 3. For B9: comment-only — trivially verify.
> 4. Unrelated regressions: does the diff touch files outside the scope above? Justify.
> 5. `npm test` — run it.
> 6. Invariants: all four must hold. Specifically for #4: play a ranged attack on a valid map with walls between shooter and target — does LOS still block correctly after the BFS fallback is gone?
> 7. Mid-handler throw safety: does the B3 fix move a `throw` to a sane pre-mutation position (map-load time), not after a state write? Good.
>
> Output format:
> - `VERDICT: PASS` or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant
> - `DID NOT VERIFY:` unreachable items

On PASS: delete this file; flip the checkbox in `README.md`.
On FAIL: loop until PASS.
