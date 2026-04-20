# Move to Faster Infra — Catan-Style In-RAM Gameplay Model

## Goal

Reach catanFullEndea-class perceived responsiveness on the **same render.com
free tier**. Target gameplay model:

- **Tiny payloads** — per-action messages of 10s of bytes, not 10s of KB
- **In-memory mutation** — no immutable snapshots, no `structuredClone`
- **No clone** — handlers mutate the live `GameState` object graph
- **No disk** — zero synchronous I/O on the action critical path
- **No diff** — per-event push to clients, not state-diff broadcasting

This is a directional rewrite of the server → broadcast → client pipeline.
Game-rule logic in `src/services/handlers/`, `ZombiePhaseManager`,
`CombatDice`, `Rng`, `TurnManager`, `XPManager`, etc. is preserved
**unchanged**. The work is concentrated in: how state lives, how it
mutates, how changes leave the server, and how the client consumes them.

## Is It Achievable? — Yes, Conditionally

It is **fully achievable** for the active-gameplay loop. Confirmed by
catanFullEndea running the same model on the same infra and feeling
snappy. The conditions / non-trivial constraints:

1. **Persistence semantics must change.** Endead today persists every state
   change to `data/endead.db` so an in-progress room survives server
   restart / render free-tier spin-down. The catan model accepts that
   in-flight games are lost on restart. Either match catan's posture
   (acceptable for free-tier hobby host) or move persistence off the hot
   path with snapshot-on-quiescence semantics (Step 1).
2. **State must be made safely mutable.** Code currently relies on
   `structuredClone` + immutable returns from handlers
   (`ActionProcessor.ts:150`). Mutation-in-place is faster but invalidates
   any code that compares object identity (`prev !== next` in client
   listeners; `state === this._state` short-circuit in
   `GameStore.update`, `GameStore.ts:37`). Replace identity checks with a
   monotonic version counter (Step 3).
3. **Frozen-in-dev (`shouldFreeze` + `freezeDeep` in `GameStore.ts:41,
   97-...`) is incompatible with mutation-in-place.** Replace with a
   structural-sharing audit pass (run a one-shot validator in dev that
   asserts no mutation outside designated mutators) or drop and rely on
   tests.
4. **Replay/history must be decoupled from broadcast payloads.** Currently
   `state.history` is part of `GameState` and grows monotonically
   (`ActionProcessor.ts:253-256`). Catan keeps no in-state history. Move
   history to an append-only side channel (Step 4).
5. **Tile definitions and maps are large but read-only.** Already loaded
   into memory once on startup (`server.ts:70-88`). They are **not** in
   the gameplay hot path; do not touch them. Confirm they stay out of any
   broadcast payload (they currently do — verify in audit).
6. **Pixi renderer is fine.** It already reconciles via `entitySprites`
   and does not gate this work.

If you cannot accept "in-flight room is lost on cold-start," the model
remains achievable but you must add Step 5 (snapshot-on-quiescence) which
keeps the hot path clean while still recovering from restart.

## Why This Works — Latency Math

Per-action work today (free tier, ~50 KB GameState, mid-game):

- Server: `processAction` (handler logic) ≈ 1–3 ms
- Server: `structuredClone(state)` (handler immutability) ≈ 2–5 ms
- Server: `generateDiff` ≈ 1–3 ms
- Server: `JSON.stringify` patch ≈ 1–3 ms
- Server: `JSON.stringify` full state (only to compare lengths) ≈ 3–8 ms
- Server: `structuredClone(state)` (to update `previousState`) ≈ 2–5 ms
- Server: SQLite `INSERT OR REPLACE` (stringify + WAL write) ≈ 2–10 ms
  (variance amplified on shared-disk free tier)
- Network: WS RTT on free tier ≈ 100–300 ms (this is the floor)
- Client: `JSON.parse` ≈ 1–3 ms
- Client: `structuredClone(state)` in `applyPatch` ≈ 3–8 ms
- Client: `applyPatch` ops ≈ 1–2 ms
- Client: `gameStore.update` + listener fan-out + Pixi reconcile ≈ 2–5 ms

**Total non-network cost per action: ~20–55 ms server-side, ~7–20 ms
client-side, monotonically growing with `history.length`.**

Catan model:

- Server: handler mutation ≈ 0.1–0.5 ms (no clone, no diff, no I/O)
- Server: `JSON.stringify` of small event payload ≈ <0.1 ms
- Network: same RTT floor
- Client: `JSON.parse` + targeted local mutation ≈ <1 ms

**Total non-network cost: ~1–2 ms total.** Network RTT becomes the only
remaining latency, and that's what catan feels like.

The win isn't faster infra — it's an architecture that doesn't burn the
infra you have on per-action overhead.

## Implementation Plan

Each step is independently shippable. Steps 1–4 are the core. Step 5 is
optional crash-recovery. Step 6 is the optimistic-UI layer (also covered
in `in-game-responsiveness.md`; either task can ship it).

### Step 1 — Strip persistence from the gameplay hot path

**Goal:** match catan's "no disk" property for the action loop.

1. Delete the `persistenceService.saveRoom(...)` call inside
   `broadcastRoomState` (`src/server/server.ts:292-297`).
2. **Choose persistence posture:**
   - **1A (catan-style):** Drop room persistence entirely. Rooms exist
     only in process memory. On server restart, all in-flight games are
     lost; clients that reconnect get a "room no longer exists" error and
     can rejoin a fresh lobby. Simplest. Matches catan posture.
   - **1B (snapshot-on-quiescence):** Persist only on:
     - `END_TURN` action (natural quiescence point)
     - Idle timeout (no actions for N seconds)
     - Graceful shutdown (`SIGTERM`/`SIGINT` handler iterates active
       rooms and saves)
     - On client disconnect that leaves room with zero connected players
     Persistence is async-from-the-perspective-of-the-actor: the action
     handler returns immediately; persistence is scheduled to run after
     the broadcast on the next event-loop tick (`setImmediate(() =>
     persistenceService.saveRoom(...))`). Better-sqlite3 is still
     synchronous when it runs, but it no longer blocks the actor's
     visible round-trip.
3. Keep `loadRoom` for room rejoin on reconnect (1B only) — it's not on
   the per-action path.
4. Tile-definition load on startup (`server.ts:70-88`) is unchanged — not
   on the action path.
5. Map load/save (editor) is unchanged — not on the action path.

**Acceptance:** `broadcastRoomState` issues zero DB calls. With option
1B, persistence happens at most once per turn or on quiescence. Verify
with timing (`ENDEAD_PERF=1`) that per-action server time has no I/O
spikes.

### Step 2 — Replace state-diff broadcasting with granular events

**Goal:** match catan's "tiny payloads" + "no diff" properties.

1. Define a new wire protocol in `src/types/Events.ts` (new file) — a
   discriminated union of game events. Examples:
   ```ts
   type GameEvent =
     | { kind: 'SURVIVOR_MOVED';   sid: string; from: string; to: string; ap: number }
     | { kind: 'DOOR_OPENED';      sid: string; doorId: string; noise: number }
     | { kind: 'NOISE_PLACED';     zoneId: string; count: number }
     | { kind: 'ATTACK_RESOLVED';  sid: string; targetIds: string[]; dice: number[]; hits: number; damagePerHit: number }
     | { kind: 'EQUIPMENT_DRAWN';  sid: string; cardId: string }
     | { kind: 'EQUIPMENT_MOVED';  sid: string; from: 'hand'|'reserve'|'body'; to: 'hand'|'reserve'|'body'|'discard'; slot: number; cardId: string }
     | { kind: 'WOUND_APPLIED';    sid: string; amount: number; source: string }
     | { kind: 'SURVIVOR_KILLED';  sid: string }
     | { kind: 'XP_AWARDED';       sid: string; amount: number; newDanger: string }
     | { kind: 'SKILL_GAINED';     sid: string; skillId: string }
     | { kind: 'ZOMBIE_SPAWNED';   ids: string[]; type: string; zoneId: string }
     | { kind: 'ZOMBIE_MOVED';     id: string; from: string; to: string }
     | { kind: 'ZOMBIE_KILLED';    id: string }
     | { kind: 'TURN_STARTED';     playerId: string }
     | { kind: 'PHASE_CHANGED';    phase: 'PLAYERS' | 'ZOMBIES' | 'GAME_OVER' }
     | { kind: 'OBJECTIVE_TAKEN';  zoneId: string; sid: string }
     | { kind: 'GAME_RESULT';      result: GameResult }
     ;
   ```
   List is illustrative — derive the complete set by walking
   `src/services/handlers/` and `ZombiePhaseManager.ts`. Each gameplay
   mutation must map to one or more events.
2. Action handlers in `src/services/handlers/*.ts` already encode
   what changed. Have each handler return
   `{ events: GameEvent[], error?: ActionError }` instead of (or in
   addition to) the new `GameState`. Easiest path: wrap each handler so
   it mutates state in place and emits events as side-effect via a
   passed-in collector.
3. `ActionProcessor.processAction` returns `events: GameEvent[]`.
4. `broadcastRoomState` is renamed `broadcastEvents(room, events,
   excludeSocket?)` and ships
   `JSON.stringify({ type: 'EVENTS', payload: events })`. Typical
   payload: a few hundred bytes. No diff, no full state, no clone.
5. Client's `NetworkManager.onmessage` (`src/client/NetworkManager.ts:52-67`)
   gets a new branch for `'EVENTS'` that dispatches each event to
   `gameStore.applyEvent(event)`.
6. `GameStore` gains `applyEvent(event: GameEvent)` that mutates the
   client's local state mirror in place (or via path-targeted clone if
   you keep immutability — see Step 3 trade-off).
7. **Keep STATE_UPDATE around** as a "full snapshot" message used only
   on initial join and reconnect-resync (Step 4). It is not used in the
   action loop.

**Acceptance:** Action broadcast payload size on the wire is bounded
(<2 KB for all action types in a 6-player game), independent of
`history.length` and of total entity count. Confirm by logging
`Buffer.byteLength(message)` in `broadcastEvents` during a full game
playthrough.

### Step 3 — Mutate state in place; drop `structuredClone`

**Goal:** match catan's "no clone" + "in-memory mutation" properties.

1. Remove `structuredClone(state)` at `ActionProcessor.ts:150`. Handlers
   mutate the passed `GameState` directly.
2. Remove `room.previousState = structuredClone(...)` at
   `server.ts:283`. There is no diffing anymore (Step 2), so no
   `previousState` is needed.
3. Add `state.version: number` (monotonic uint), bumped once per
   accepted action in `ActionProcessor`. This replaces the
   identity-check semantics that `gameStore.update` uses
   (`GameStore.ts:37`).
4. Update `GameStore.update` to compare `newState.version` to the
   current version, not object identity. Update listener contract:
   listeners receive `(state, prevVersion)`; listeners that need to
   diff must do so against the previous version snapshot they captured
   themselves.
5. Disable `freezeDeep` (`GameStore.ts:41`) entirely — mutation-in-place
   makes freezing impossible. To preserve dev-time mutation safety, add
   a separate `dev/MutationGuard.ts` that wraps `state` in a Proxy in
   dev mode and logs writes outside of `ActionProcessor.processAction`
   and `gameStore.applyEvent`.
6. The client mirror (`gameStore._state`) similarly mutates in place.
   Listeners react to the version bump.

**Acceptance:** No `structuredClone` calls in the action path
(server or client). `grep -n "structuredClone" src/` shows only legit
non-hot-path uses (e.g. test setup). Per-action server time drops by
roughly the cost of two full clones.

### Step 4 — Move history out of `GameState`

**Goal:** stop the monotonic growth of broadcast/persistence cost.

1. Add a per-room `eventLog: GameEvent[]` array on `RoomContext` in
   `server.ts`, separate from `room.gameState`.
2. After each `broadcastEvents`, append the same events to `eventLog`.
3. Remove `state.history` and the `history` append at
   `ActionProcessor.ts:253-256`.
4. Replay/UI consumers that read `state.history` switch to consuming
   `eventLog` (or a derived view of it). The action-log UI panel
   subscribes to incoming events directly via `NetworkManager` and
   maintains its own bounded ring buffer client-side (e.g. last 200
   entries).
5. **Initial sync (join/reconnect):** server sends `STATE_UPDATE` with
   the full current `gameState` (no history) plus, optionally, the
   tail of `eventLog` (last K entries) so the client log panel has
   recent context.
6. **Persistence (Step 1B only):** snapshot writes the current
   `gameState` plus a compact `eventLog` summary. Full event log can
   be persisted lazily (separate table) or dropped on restart — the
   game state snapshot is sufficient for rejoin.

**Acceptance:** `gameState` size is flat across a full game (modulo
real entity changes — survivors taking damage, zombies spawning, etc.).
Late-game per-action time matches early-game.

### Step 5 — Snapshot-on-quiescence persistence (only if you chose 1B)

**Goal:** keep crash recovery without paying per-action cost.

1. Add `room.dirty: boolean` on `RoomContext`. Set true after any
   broadcast.
2. Persistence triggers:
   - `END_TURN` action: schedule `setImmediate(() =>
     persistAndClear(room))`.
   - Per-room idle timer: when no actions for `IDLE_PERSIST_MS`
     (e.g. 10 s) and `dirty`, persist.
   - `SIGTERM`/`SIGINT` handler: iterate `rooms`, persist all dirty
     synchronously, then exit. Guard with a max-time budget so a
     hung disk doesn't block shutdown indefinitely.
   - All players disconnect: persist immediately, then schedule
     existing `ROOM_IDLE_CLEANUP_MS` deletion.
3. Persistence schema unchanged: write the `GameState` JSON to the
   existing `rooms` table (`PersistenceService.ts:42-47`).
4. On client reconnect to a room not in memory: `loadRoom` from DB
   into `rooms`, replay subsequent broadcast resumes normally.

**Acceptance:** Persistence happens at most once per turn per room
under normal play. Per-action latency is unaffected.

### Step 6 — Optimistic client updates (cross-listed with `in-game-responsiveness.md` Step 5)

**Goal:** make the player's own clicks feel instant, bounded by the
local frame rather than network RTT.

Implement once, in either task. See `in-game-responsiveness.md` Step 5
for the full plan. With Step 2 in place (granular events), the
optimistic path becomes simpler: the client predicts the events its own
action would generate, applies them locally, and rolls them back if the
server returns an `ERROR` for that action ID.

## What Stays the Same

- All game-rule logic in `src/services/handlers/`,
  `ZombiePhaseManager.ts`, `CombatDice.ts`, `Rng.ts`, `TurnManager.ts`,
  `XPManager.ts`, `EquipmentManager.ts`, `DeckService.ts`,
  `TileService.ts`, `ScenarioCompiler.ts`, `ZombieAI.ts`.
- Tile-definition + map loading on startup (`server.ts:70-88`,
  `PersistenceService.ts:127-138`). Read-only data, not on hot path.
- Pixi renderer (`PixiBoardRenderer.ts`). Already reconciles via
  `entitySprites`; gains efficiency naturally as event-driven updates
  touch fewer entities.
- WebSocket transport (`ws` library, `HeartbeatManager`). The
  bottleneck is payload + processing, not transport.
- Vite build, TypeScript pipeline, test harness.

## What Changes (Touch List)

- `src/server/server.ts` — Steps 1, 2, 4, 5
- `src/services/ActionProcessor.ts` — Steps 2, 3, 4
- `src/services/handlers/*.ts` — Step 2 (each handler emits events
  alongside or instead of returning new state)
- `src/services/PersistenceService.ts` — Step 5 (no schema change;
  `saveRoom` API unchanged)
- `src/services/ZombiePhaseManager.ts` — Step 2 (emit events for
  spawns, moves, attacks instead of mutating-and-returning state)
- `src/types/Events.ts` — **new** (Step 2)
- `src/types/GameState.ts` — Steps 3, 4 (add `version`, remove
  `history`)
- `src/utils/StateDiff.ts` — Step 2 makes this **dead code** in the
  action path. Either delete it or keep only for initial-sync
  reconciliation if needed.
- `src/client/NetworkManager.ts` — Step 2 ('EVENTS' branch), Step 6
- `src/client/GameStore.ts` — Steps 2 (add `applyEvent`), 3
  (version-based change detection, drop `freezeDeep`)
- `src/client/PixiBoardRenderer.ts` — Step 2 (subscribe to event
  stream for animations; state mirror still drives positions)
- `src/client/ui/*` — Step 4 (action log subscribes to events,
  maintains own ring buffer)
- `src/services/__tests__/` — Update tests that depend on
  immutability or `state.history`. Add tests for event emission per
  handler.
- `src/utils/MutationGuard.ts` — **new** (Step 3, dev-only)

## Trade-Offs Vs Catan Posture

| Property | Catan today | Endead today | After this task |
|---|---|---|---|
| In-flight game survives server restart | No | Yes (every action persisted) | No (1A) or yes-with-snapshot (1B) |
| Per-action server work | <1 ms | 10–30 ms+ | <1 ms |
| Per-action wire payload | <100 B | 5–50 KB | <1 KB |
| Per-action client work | <1 ms | 5–15 ms | <1 ms |
| Late-game vs early-game cost | flat | grows with `history.length` | flat |
| Client immutability guarantee | n/a | yes (deep frozen in dev) | mutation-in-place; mutation guard in dev |

Posture 1A matches catan exactly. Posture 1B keeps endead's stronger
crash-recovery story at the cost of one extra moving part (the
quiescence scheduler) and is the recommended default if anyone might
play a long campaign across server restarts.

## Why It Might *Not* Be Worth Going All The Way

If profiling after `in-game-responsiveness.md` Steps 1–4 (the
incremental optimization track) shows action latency is already in the
<5 ms range server-side, the remaining gap to catan is **all network
RTT**, which neither task can close. In that case Step 6 (optimistic
client updates) gives 90% of the felt-snappiness gain for 10% of the
work, and the full architectural rewrite (Steps 2–4 here) is
optional polish.

Recommended sequencing: ship `in-game-responsiveness.md` first, measure
on production, then decide whether to commit to this larger rewrite.

## Alternative: Actually Faster Infra

If the architecture rewrite is undesired and felt-latency must drop
without code changes, the bottleneck is render.com free tier itself
(spin-down, shared CPU, slow disk, throttled egress). Options, in
rough order of payoff vs disruption:

1. **Render.com paid starter tier** — no spin-down, dedicated CPU
   slice, faster disk. Eliminates cold start and reduces I/O variance.
   Lowest-effort change; biggest single infra win.
2. **Fly.io free allowance** — small always-on VMs in a region close
   to your players. No spin-down. Same Node + WebSocket model.
   Geographic proximity reduces RTT floor.
3. **Railway / Koyeb / similar** — comparable always-on free or
   low-tier offerings. Evaluate on egress + WS support specifically.
4. **Self-host on a cheap VPS** (Hetzner CX11, etc.) — most control,
   lowest variance, most operational burden.

None of these change the fact that endead's per-action work is
heavier than it needs to be. They just hide it behind faster hardware.
The architectural rewrite makes endead snappy on **any** infra.

## Verification

1. Add the `ENDEAD_PERF=1` instrumentation described in
   `in-game-responsiveness.md` §Verification.
2. Capture per-action timings on free tier:
   - Before (current `main`)
   - After Step 1 (no I/O on hot path)
   - After Step 2 (events instead of state)
   - After Step 3 (no clone)
   - After Step 4 (no history)
3. Wire-payload bytes per action should drop by ~50× between Step 1
   and Step 2.
4. Late-game (turn 20+) action time should match early-game after
   Step 4.
5. Final integration: deploy to render.com free tier, play through a
   full mission with ≥3 clients connected, compare felt
   responsiveness against catanFullEndea side-by-side.

## Constraints (per `CLAUDE.md`)

- Do not commit or push at any step. Develop → report → wait for
  explicit user authorization for each commit.
- Never call `Math.random` in gameplay code; all RNG goes through
  `src/services/Rng.ts`. The mutation-in-place rewrite must preserve
  this (handlers still call `Rng.*` and `CombatDice.*`, just mutate
  state instead of returning new state).
- `GameState.seed` remains a 4×uint32 tuple, JSON-serialized.
- Vitest tests under `src/**/__tests__/` continue to pass; legacy
  scripts under `src/tests/` are not converted.

## Cross-References

- `tasks/develop/in-game-responsiveness.md` — incremental optimization
  track for the same problem; ship that first if unsure.
- `src/server/server.ts:270-298, 580-595` — broadcast and dispatch
- `src/services/ActionProcessor.ts:140-260` — handler dispatch + clone
  + history
- `src/services/PersistenceService.ts:42-47` — per-action DB write
- `src/utils/StateDiff.ts:14, 21` — diff/patch (becomes dead in action
  path)
- `src/client/NetworkManager.ts:52-67, 106-117` — receive/send
- `src/client/GameStore.ts:30-77` — store + freeze
- catan reference: `/Users/duir/dev/catanFullEndea/index.js:34`
  (in-memory `GAME_SESSIONS`), `models/io_manager.js:148-162`
  (granular event emit pattern)
