# 03 — Handlers: Collector + Mutation-in-Place (Steps 3 + 5 merged)

Source: `analysis/SwarmComms.md` §3.3–§3.5, §3.10, Steps 3 & 5 (§4), §8 "3 and 5 land in the same PR". D2, D4, D5, D8, D9, D11, D14, D18, D19, D21, D22 folded in.

## Scope

Flip the handler contract from `(state, intent) => newState` to `(state, intent, collector) => void` mutation-in-place. Thread `EventCollector` through every handler + service path. Delete ~50 clone/spread sites. Enforce the validate-first rule. Remove `state.history`; switch ReplayService to `room.actionLog`.

**Big PR by design** — the handler rewrite and the clone deletion are the same diff (§8). Do not try to split.

Non-goals: broadcast changes (Step 4), private-channel redaction (Step 4), client optimism (Step 6). The collector's output is not yet being sent on the wire.

## Preconditions

`02-event-protocol-types.md` reviewed, deleted, checkbox flipped.

## Work items

### A. Core contracts

1. **Define `EventCollector`** (new lightweight class or interface, e.g. in `src/services/EventCollector.ts`):
   ```ts
   class EventCollector {
     private events: GameEvent[] = [];
     emit(event: GameEvent): void;
     drain(): GameEvent[];
   }
   ```
2. **Flip `ActionHandler` type** in `handlerUtils.ts:6`:
   ```ts
   type ActionHandler = (state: GameState, intent: ActionRequest, collector: EventCollector) => void;
   ```
3. **Flip `ActionProcessor.processAction`** — `ActionProcessor.ts:150` stops assigning `newState = handler(...)`. Instead:
   ```ts
   const collector = new EventCollector();
   handler(state, intent, collector);
   ```
   Every subsequent reference to `newState` in `processAction` becomes `state` (direct mutation). Bump `state.version` once per accepted action.
4. **`room.actionLog`** — new field on `RoomContext` in `server.ts`: bounded ring (last ~500 `ActionRequest` entries). Append before dispatch.
5. **`room.eventLog`** — new field: `Array<{ v: number; events: GameEvent[] }>` (last ~500). Append after dispatch with the drained events. (Not yet broadcast — Step 4 sends these.)

### B. §3.10 validate-first contract — non-negotiable

Every handler must: **reads & preconditions first; throws before any mutation or emit; mutations + emits after**. D18 and D19 are concrete known violations that MUST be fixed here:

- **D18 `handleAttack`** (`CombatHandlers.ts:117` and surrounding): the `(newState as any)._attackIsMelee = isMelee` write currently fires BEFORE the two `throw`s at :119 and :126. Restructure into three blocks:
  1. Pure read block: compute `isMelee`, `isRangedWeapon`, `distance`, `hasPointBlank`, `effectiveMinRange`, `effectiveMaxRange`, `hasLineOfSight`.
  2. All-throws block: range, melee-zone, LOS.
  3. First mutation.
  Better: per D2, lift `_attackIsMelee` off `GameState` entirely — pass as parameter to `deductAPWithFreeCheck(state, actor, apCost, pool, isMelee?)`. Delete the field from `GameState`.
- **D19 `handleSearch`** (`ItemHandlers.ts:68-74`): `DeckService.drawCard` mutates before the empty-deck throw at :74. Hoist a pure-read predicate "can-draw-N-cards" to before the loop; throw there.
- **Lift `_extraAPCost` too** — same treatment as `_attackIsMelee`. Pass through parameters; delete from `GameState`.

### C. Per-file handler rewrite + clone deletion

For EACH file below: thread `collector`, remove ALL `structuredClone(state)` entries-level clones, enforce validate-first, emit the right events per §3.2.

- `src/services/handlers/CombatHandlers.ts` (16 clones — keep `captureAttackState` ×5 at `:24-28` AND the Lucky restore block ×6 at `:686-691`, per D4 — delete the other ~5)
- `src/services/handlers/MovementHandlers.ts` (2)
- `src/services/handlers/ItemHandlers.ts` (5) — includes D19 fix
- `src/services/handlers/DoorHandlers.ts` (2)
- `src/services/handlers/ObjectiveHandlers.ts` (1)
- `src/services/handlers/SkillHandlers.ts` (5)
- `src/services/handlers/TradeHandlers.ts` (5)
- `src/services/handlers/LobbyHandlers.ts` (4)
- `src/services/handlers/TurnHandlers.ts` (1) — D5: `handleEndTurn` lives here
- `src/services/handlers/handlerUtils.ts` — remove 7 shallow spreads (`TurnManager:130, 185, 189` + `handlerUtils:69, 70, 144, 146`); `deductAPWithFreeCheck` mutates in place; add `isMelee?: boolean` parameter per D2

### D. Service-level clone deletion

- `src/services/ZombiePhaseManager.ts` (1)
- `src/services/TurnManager.ts` (shallow spreads)
- `src/services/DeckService.ts` (3) — emits `DECK_SHUFFLED`, `CARD_DRAWN`, `SPAWN_CARDS_DRAWN` as appropriate
- `src/services/EquipmentManager.ts` (D11: lines 68 + 93)

### E. Out-of-band paths (§3.10 rule 5)

- `handleDisconnect` (`server.ts:457-494`): stop `structuredClone`; in lobby phase, mutate in place; emit `LOBBY_PLAYER_LEFT`. Gameplay phase: no-op + spectator toggle (no event). Route through a `broadcastEvents` placeholder (Step 4 wires it up).
- `KICK_PLAYER` (`server.ts:537-578`): same treatment. Emit `LOBBY_PLAYER_KICKED`. Bump `v`.

### F. Delete `state.history`

- Remove `history` field from `GameState` (`src/types/GameState.ts:346-366`).
- Remove `history.push` sites (`ActionProcessor.ts:253-256`, `server.ts:477-486, 553-562`, any handler push).
- `ReplayService` (`src/services/ReplayService.ts`) switches input from `state.history` → `room.actionLog`. D8: the reconstruction block at `:28-33` becomes a ~5-line pass-through; not a rewrite.
- `ReplayService.compareStates` (D9, D22): update the stripped-field allowlist to `['history' (now gone), 'version', 'lastAction.timestamp', 'spawnContext.timestamp', '_attackIsMelee' (now lifted), '_extraAPCost' (now lifted)]`. Document inline.

### G. Vitest helper: `assertValidationIsPure`

- New helper in `src/services/__tests__/` (e.g. `assertValidationIsPure.ts`):
  ```ts
  function assertValidationIsPure(handler, state, failingInputs: ActionRequest[]) {
    for (const input of failingInputs) {
      const before = structuredClone(state);
      expect(() => handler(state, input, new EventCollector())).toThrow();
      expect(state).toStrictEqual(before);
    }
  }
  ```
- Used by at least one test per handler file. CombatHandlers must include the D18 scenarios (melee attack on non-adjacent zone; ranged with no LOS).

### H. D21 — allowed clones post-Step-5

After this task, the allowed clones in `src/` are:
1. `server.ts:202` — `structuredClone(initialGameState)` in `createRoom` (module-singleton bootstrap).
2. `CombatHandlers.ts:24-28` — `captureAttackState` (Lucky snapshot, server-side only).
3. `CombatHandlers.ts:686-691` — Lucky restore block (rewinds from snapshot).
4. `StateDiff.applyPatch` — deleted from action path entirely (D4 + Step 5). If kept for SNAPSHOT reconcile, document it; otherwise delete the file.
5. Dev-mode `freezeDeep` thaw/refreeze inside `applyEvent` (client — Step 4 adds this; not in this task).
6. Test setup.

Acceptance grep: `grep -rE "structuredClone|\{ *\.\.\.(state|newState)" src/` matches ONLY those allowed sites.

### I. `freezeDeep` — do NOT change in this task

`GameStore.ts:41, 84` stays as-is. Step 4 rewires it to thaw-mutate-refreeze inside `applyEvent`.

## Gameplay invariants that MUST hold

1. **Every action produces the same final state** as before this task. Test it via `ReplayService` on a pre-recorded action log (pre-task state + action log → post-task state).
2. **Validate-first**: every handler's failing-input path leaves state structurally identical (strict equality). `assertValidationIsPure` green on every handler.
3. **D18**: `handleAttack` with no-LOS input throws with `_attackIsMelee` unset on state.
4. **D19**: `handleSearch` with empty deck throws BEFORE seed advances or deck mutates.
5. **Dual-wield ATTACK**: still resolves two rolls (B4 preserved). Two `ATTACK_ROLLED` events emitted in sequence.
6. **Friendly fire**: still blocks end-turn (B1 preserved). `FRIENDLY_FIRE_PENDING` emitted.
7. **Lucky reroll**: `captureAttackState` + restore still work (clones intentionally preserved).
8. **`handleDisconnect` / `KICK_PLAYER`**: lobby players still leave; kicks still work; mutations still fire.
9. **ReplayService**: can replay `room.actionLog` to the same state as live (modulo timestamps, version — per D22).
10. **`_attackIsMelee` / `_extraAPCost`**: no longer on `GameState`. Grep confirms zero residuals.
11. **`state.history`**: gone. Grep confirms zero residuals.
12. **Mid-handler throw**: no handler leaves partial mutation on throw.
13. **All existing Vitest suites** green — they may need rewriting to assert event sequences in addition to final state; do that here.

## Verification

- `npm test` — green (with rewrites).
- `grep -rE "structuredClone|\{ *\.\.\.(state|newState)" src/` — matches only the D21 allowlist.
- `grep -r "state\.history\|state\._attackIsMelee\|state\._extraAPCost" src/` — zero matches.
- `grep -r "_attackIsMelee\|_extraAPCost" src/types/` — zero matches (deleted from interface).
- Manual: full round, all action types, Lucky reroll, zombie phase, FF assignment — identical outcome to pre-task.
- `ReplayService` invariant: record an action log from a fresh game, replay from initial state, `compareStates(replayed, live)` returns equal (stripping the D22 allowlist).

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms Step 3+5. This is the biggest, most corruption-prone task in the plan. Do NOT rubber-stamp. Assume the developer missed a mid-handler throw until you've proven otherwise.
>
> Required checks:
> 1. **Clone grep**: `grep -rnE "structuredClone|\{ *\.\.\.(state|newState)" src/` should match ONLY the D21 allowlist (`server.ts:202`, `CombatHandlers.ts` captureAttackState + Lucky restore, test setup, possibly `StateDiff` if retained). Every other hit is a FAIL.
> 2. **Mid-handler throw safety**: for EACH file in work item C, read the top-to-bottom flow. For every `throw` in a handler, verify NO `state.X =`, `state.survivors[...] =`, `state.X.push(...)`, or `collector.emit(...)` precedes it on any reachable path. Specifically verify D18 (`CombatHandlers.ts handleAttack`) and D19 (`ItemHandlers.ts handleSearch`) — these were flagged as known violators.
> 3. **`assertValidationIsPure` coverage**: is the helper used by AT LEAST one test per handler file? Do the failing-input test cases actually fail on the handler (before this task, without the fix)? If the test doesn't exercise real failure paths, it's useless.
> 4. **`_attackIsMelee` / `_extraAPCost` lifted off GameState**: `grep -rn "_attackIsMelee\|_extraAPCost" src/types/` must be empty. `grep -rn "state\._attackIsMelee\|state\._extraAPCost" src/` must be empty. If the flag moved to a function parameter, is every caller passing it correctly?
> 5. **`state.history` removal**: `grep -rn "state\.history\|\.history\.push" src/` must be empty (except `room.actionLog` if a similar name was used — verify).
> 6. **ReplayService switch**: does it consume `room.actionLog`? Does `compareStates` strip the D22 fields? Is there a test for the round-trip?
> 7. **Dual-wield** (B4 preserved): attack with two reloadable weapons → two `ATTACK_ROLLED` events emitted in the collector in order.
> 8. **Friendly fire** (B1 preserved): `handleAttack` that triggers FF emits `FRIENDLY_FIRE_PENDING`; `pendingFriendlyFire` set; `checkEndTurn` still blocks.
> 9. **Lucky reroll**: `captureAttackState` still clones (allowed); `handleRerollLucky` still restores. The collector emits `ATTACK_REROLLED` with the scoped patch per §3.3.1. NO full deck in the patch (`equipmentDeckCount`, not `equipmentDeck`).
> 10. **Out-of-band paths**: `handleDisconnect` and `KICK_PLAYER` route through the collector, no `structuredClone`. In lobby phase, a player leaves via event.
> 11. `npm test` — run it. Any failure FAILs this review.
> 12. **Replay invariant**: record a game, replay, `compareStates` equal. If the task didn't test this, run it yourself.
> 13. **Gameplay invariants #1-13** in the task file: for each, name the code path that proves it holds.
>
> Output format:
> - `VERDICT: PASS` (only if you can honestly find nothing) or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant violated
> - `DID NOT VERIFY:` unreachable items (esp. UI, since this task doesn't ship broadcast)

On PASS: delete this file; flip the checkbox; append Progress Log entry.
On FAIL: loop until PASS. Expect multiple loops — this is the hardest task.
