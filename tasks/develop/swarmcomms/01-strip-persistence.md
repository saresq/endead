# 01 — Strip Persistence from the Hot Path

Source: `analysis/SwarmComms.md` §3.6 + Step 1 (§4).

## Scope

Remove the synchronous SQLite write from `broadcastRoomState`. Introduce a quiescence-based scheduler that writes at safe boundaries only. Cheapest, biggest single server-side win; unblocks the rest of the refactor.

Non-goals: changing the persistence schema, going async (keep better-sqlite3 sync when it runs); anything wire-protocol related.

## Preconditions

All preflight tasks (`00a`–`00d`) reviewed, deleted, and checkboxes flipped in `README.md`.

## Work items

1. **Delete DB call from `broadcastRoomState`** — `src/server/server.ts:~294` inside `broadcastRoomState` (the span is ~270–298). Remove the `persistenceService.saveRoom(...)` call and the surrounding `try/catch`.
2. **Add `room.dirty: boolean`** to `RoomContext`. Flip to `true` after every accepted action broadcast (anywhere `broadcastRoomState` is called today).
3. **New file: `src/services/PersistenceScheduler.ts`** — owns quiescence triggers. Keep it small; import `persistenceService` and call `saveRoom` when any trigger fires AND `room.dirty === true`. Clear `room.dirty` on write.
4. **Quiescence triggers** (priority order per §3.6):
   - **After every complete zombie phase** — primary safe point. Hook from `ZombiePhaseManager` completion path.
   - **After `END_TURN`** — per-player boundary. Hook from `ActionProcessor` or `TurnManager.checkEndTurn` transition.
   - **Idle 10s** — no actions on the room. Use `setTimeout`, reset on each action.
   - **Last disconnect** — room becomes unobserved. Hook from `handleDisconnect` when `room.connections.size === 0`.
   - **SIGTERM / SIGINT** — always flush all dirty rooms. Add signal handlers in `server.ts` boot.
5. **One `setImmediate` hop** off the actor's round-trip — when a trigger fires synchronously on the action path, schedule the actual write via `setImmediate` so it runs after the WS send.
6. **Persistence write uses `projectForSocket(state, null)`** — wait, this function lands in Step 4. For now, write the raw `gameState`. A TODO comment references Step 4's future switch.

## Gameplay invariants that MUST hold

1. **Crash-recovery**: a round that completed zombie phase before the crash is fully restorable.
2. **Mid-turn crash**: user loses their in-progress turn (acceptable; documented).
3. **Clean shutdown (SIGTERM)**: all dirty rooms flush before process exits.
4. **No DB write on user-action path** — click-to-broadcast latency has no disk I/O on the critical path.
5. **Disconnect flush**: the last player leaving a room writes once.
6. **No double-writes**: if zombie phase completes AND END_TURN fires in sequence, the room writes once (debounce via `dirty` flag).
7. **Correctness**: state loaded from DB after write equals the live state that was written (no data loss from scheduler).

## Verification

- `npm test` — green. Existing persistence tests adapted if any.
- `ENDEAD_PERF=1` probe: per-action server time drops by 1–3 ms; I/O variance gone.
- Manual: start a game, play 5 turns → kill server with SIGTERM → restart → state matches turn-5. Start a game, play 2 actions, crash (kill -9) → reload → state is last-quiescence (possibly start of round, depending on when zombie phase last ran).
- Manual: play a full round, observe no DB write between actions; observe a single write after zombie phase completes.
- Confirm no `persistenceService.saveRoom` call on any action path.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms Step 1. Do NOT rubber-stamp.
>
> Required checks:
> 1. Grep for `persistenceService.saveRoom` — should appear only in `PersistenceScheduler.ts` and wherever SIGTERM/SIGINT flush lives. It must NOT appear in `broadcastRoomState` or any handler.
> 2. Read `PersistenceScheduler.ts`. For each of the 5 quiescence triggers, trace the code path that fires it. Can the "idle 10s" timer leak across rooms? Is it cleared on disconnect?
> 3. `room.dirty` flag: grep for sets and clears. Is there any path that skips setting dirty after an action that mutates state? Is there any path that clears dirty without writing?
> 4. SIGTERM handler: does it wait for the writes to complete before exiting (better-sqlite3 is sync, so the write is naturally blocking — confirm the exit path doesn't `process.exit(0)` before the loop)?
> 5. Mid-turn crash-recovery: if a player opens a door → draws spawn cards (seed advances) → crashes before zombie phase, what do they load? Is that consistent with what the task claims ("lose in-progress turn")?
> 6. Invariants: all seven must hold. Specifically verify #6 (no double-write) by reading the zombie-phase-end + END_TURN sequence — does dirty get cleared after the first write?
> 7. `npm test` green.
> 8. Unrelated regressions: diff touches `server.ts`, `PersistenceScheduler.ts` (new), `PersistenceService.ts` (caller cleanup only), `ZombiePhaseManager.ts`, `ActionProcessor.ts`/`TurnManager.ts` (END_TURN hook). Anything outside? Justify.
>
> Output format:
> - `VERDICT: PASS` or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant
> - `DID NOT VERIFY:` unreachable items

On PASS: delete this file; flip the checkbox in `README.md`; append a one-line entry to the `README.md` Progress Log.
On FAIL: loop until PASS.
