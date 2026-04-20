# In-Game Responsiveness — Server-Side Latency Per Action

## Symptom

Hosted on render.com **free tier** (shared CPU, ~1-2 vCPU, slow disk, slower
network egress). After cold-start completes and clients are fully loaded into
the room, every player action (MOVE, ATTACK, SEARCH, OPEN_DOOR, USE_ITEM, etc.)
takes longer to reflect on screen than it should. The Pixi renderer itself is
fine (it reconciles via `entitySprites`, no scene rebuild). The lag is
**upstream of rendering** — server processing + persistence + payload size +
client patch reconciliation, all on the critical path of a single user click.

Reference comparison: `catanFullEndea` (Socket.IO, in-memory state, granular
per-event broadcasts of <100 B payloads, no DB) feels instant on the same
free-tier infrastructure. Endead's per-action work is at least one order of
magnitude heavier and serialized on the broadcast critical path.

## Root Causes (ordered by impact)

### R1. Synchronous SQLite write on the broadcast critical path
- **Where:** `src/server/server.ts:292-297` (inside `broadcastRoomState`)
- **What:** `persistenceService.saveRoom(room.id, room.gameState)` is called
  every time state changes. `saveRoom`
  (`src/services/PersistenceService.ts:42-47`) does
  `JSON.stringify(state)` of the **full GameState** and runs an
  `INSERT OR REPLACE` against `rooms`. better-sqlite3 is synchronous — it
  blocks the Node event loop for the duration of the stringify + disk write.
- **Why it matters here:** This call sits **after** the diff is computed but
  the broadcast loop (`server.ts:285-290`) and persistence are in the same
  function with no concurrency. While disk I/O blocks, no other ws message
  can be parsed or dispatched. On render.com free tier disk I/O is
  measurably slower and more variable than dev.
- **Note:** WAL is enabled (`PersistenceService.ts:13`) — it helps, but does
  not make the write free. Stringify of a ~50 KB object dominates anyway.

### R2. Double full-state JSON.stringify per broadcast
- **Where:** `src/server/server.ts:273-281`
- **What:** When `room.previousState` exists, the code does:
  ```ts
  const patch    = generateDiff(room.previousState, room.gameState);
  const patchMsg = JSON.stringify({ type: 'STATE_PATCH',  payload: patch });
  const fullMsg  = JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState });
  message = patchMsg.length < fullMsg.length ? patchMsg : fullMsg;
  ```
  Both messages are fully serialized just to compare lengths and pick the
  smaller one. `fullMsg` is then thrown away most of the time. `JSON.stringify`
  on a 50 KB GameState is a measurable hot path on shared CPU.

### R3. `structuredClone(room.gameState)` on every broadcast
- **Where:** `src/server/server.ts:283`
- **What:** `room.previousState = structuredClone(room.gameState);` runs
  unconditionally after every broadcast. Deep-clones every survivor, zombie,
  zone, objective, and the entire `history` array. Cost grows monotonically
  with `history.length`.

### R4. `history[]` grows monotonically and is part of every broadcast/persist
- **Where:** `src/services/ActionProcessor.ts:223-257`
- **What:** Every gameplay action appends a `historyEntry` to
  `newState.history` via spread copy: `[...(newState.history || []), entry]`.
  `history` is part of `GameState`, so it is:
  1. Cloned on every server `structuredClone` (R3).
  2. Serialized on every server `JSON.stringify` (R1, R2).
  3. Diffed on every `generateDiff` (R5).
  4. Patched on every client `applyPatch` → `structuredClone` (R6).
- **Effect:** Action 200 is materially slower than action 5. By turn 10+ this
  is noticeable to humans on free tier.

### R5. `generateDiff` is recursive over the full state
- **Where:** `src/utils/StateDiff.ts:14`, called from `server.ts:274`
- **What:** Recursive structural diff over the entire GameState tree on every
  action. Cheap individually but compounds with R1/R2/R3.

### R6. Client `applyPatch` does `structuredClone(state)` on every patch
- **Where:** `src/utils/StateDiff.ts:21-32`, invoked from
  `src/client/NetworkManager.ts:57-59`
- **What:** `applyPatch` calls `structuredClone(state)` of the **full client
  GameState** before mutating. This runs on every STATE_PATCH the client
  receives. On a player's own action the chain is:
  1. Server stringifies full state (R2)
  2. Server stringifies patch (R2)
  3. Server clones full state (R3)
  4. Client `JSON.parse` of patch
  5. Client `structuredClone(state)` (R6)
  6. Client patch application
  7. `gameStore.update` → `freezeDeep` if dev (`src/client/GameStore.ts:41`)
  8. Listeners fire → renderer reconciles
- **Note:** In dev, `freezeDeep` recursively freezes the new state — another
  full-tree walk. Confirm this is gated to dev-only in the production bundle
  (it appears to be, via `shouldFreeze`, but verify build flag).

### R7. No optimistic client updates; one click = one full RTT
- **Where:** `src/client/NetworkManager.ts:106-117` (`sendAction`)
- **What:** Client fires the action over WS and waits silently. No local
  prediction, no provisional UI state. Player sees nothing until
  STATE_PATCH/STATE_UPDATE returns. On render.com free tier the WS RTT is
  variable and frequently 150-400 ms even between idle pings.

### R8. Coarse event model: every action ships full state shape
- **What:** Catan's snappiness comes from sending tiny event-shaped messages
  (`SOC.BUILD <type> <id>`, `SOC.DICE_VALUE <n> <pid>`) and letting the
  client mutate its store. Endead always ships either a STATE_PATCH (still
  potentially many ops) or full STATE_UPDATE. There is no
  semantic-event channel for cases where the client already knows how to
  apply the change locally.

### R9. `room.previousState` is only set inside `broadcastRoomState`
- **Where:** `src/server/server.ts:283`
- **What:** Subtle correctness/perf interaction — `previousState` advances
  even on broadcasts that excluded the actor. If multiple actions land
  back-to-back the diff base may be a state the recipient never saw, forcing
  larger STATE_UPDATE fallbacks. Audit before optimizing.

## Implementation Plan

Do these in order. Each step is independently shippable and measurable.

### Step 1 — Move persistence off the broadcast hot path
**Goal:** Eliminate R1 from per-action latency.

1. Remove the `persistenceService.saveRoom(...)` call from
   `broadcastRoomState` (`server.ts:292-297`).
2. Add a per-room debounced/throttled persistence scheduler. Recommended:
   - Mark `room.dirty = true` after each state mutation in `handleAction`.
   - A single `setInterval` (e.g. 5 s) iterates active rooms and persists any
     `dirty` ones, then clears the flag.
   - Also persist on: `END_TURN` action (cheap snapshot point), room idle
     cleanup, room deletion, and process `SIGTERM`/`SIGINT` shutdown hook.
3. Make sure `cleanupStaleRooms` still finds these rooms — the `updated_at`
   column will lag by up to one interval, which is fine (24 h cutoff).
4. **Acceptance:** `broadcastRoomState` no longer touches the DB. Per-action
   latency on local machine drops by the cost of one stringify + one disk
   write. Verify by adding a `performance.now()` bracket around the function
   in dev.

### Step 2 — Stop double-serializing
**Goal:** Eliminate R2.

1. In `broadcastRoomState`, build the patch first.
2. Estimate patch size cheaply. Heuristic: if `patch.length === 0`, skip
   broadcast entirely (nothing changed). If `patch.length > N` (start with
   `N = 50` ops, tune), send full STATE_UPDATE; otherwise send STATE_PATCH.
   Do **not** stringify both. Stringify only the chosen message.
3. Optional: precompute a rough byte budget by recursively summing string
   lengths in `patch.value` payloads (cheaper than full stringify); only
   needed if the op-count heuristic misclassifies.
4. **Acceptance:** Only one `JSON.stringify` per broadcast; zero on no-op
   broadcasts.

### Step 3 — Trim `history` from broadcast/persist payloads
**Goal:** Cut R3/R4/R5/R6 cost ceiling.

Two acceptable approaches — pick one:

**3a (preferred). Move history out of broadcast payload.**
- Keep `state.history` server-side for replay/persistence only.
- When building the broadcast message, send a shallow clone of state with
  history replaced by `history.slice(-K)` for some small K (e.g. 20 most
  recent entries) — enough for the action log UI.
- On the client side, `gameStore.update` should merge incoming
  `history` with locally retained history rather than replace, so older
  entries don't disappear from the log.
- This shrinks the diff base too: the previous-state snapshot used by
  `generateDiff` should be the truncated form so diffs don't churn on
  history at all.

**3b (fallback). Send only the appended history entries as a delta.**
- Add a custom diff op for "history append" so STATE_PATCH carries
  `{ op: 'append', path: ['history'], value: [newEntries] }` instead of a
  full `replace` of the array.
- Requires extending `StateDiff.ts` and `applyPatch` to handle the new op.
- Lower risk than 3a but doesn't help the persistence/clone size at all.

**Acceptance:** Late-game (turn 20+) per-action server time is flat compared
to early-game. `structuredClone(state)` cost stops growing.

### Step 4 — Replace client `structuredClone` in `applyPatch`
**Goal:** Eliminate R6 from client-side latency.

Two options:

**4a.** Mutate-in-place. The client's `gameStore._state` is only frozen in
dev; in prod it's a plain object. `applyPatch` can mutate the live state
directly and notify listeners with the same reference (listeners that
compare by identity must be updated to react to a version counter or the
patch payload). Simplest, fastest, most invasive.

**4b.** Path-targeted clone. For each op in the patch, walk the path and
shallow-clone only the ancestors of the touched node (immutable update
pattern, the same one Redux/Immer use). Touch `O(depth)` objects per op
instead of `O(state)`. Keeps current "new reference per update" semantics.

Pick **4b** unless profiling shows 4a is necessary. Update
`StateDiff.ts:applyPatch` accordingly. Add unit tests in
`src/services/__tests__/` confirming path-clone preserves untouched subtree
identity (`oldState.zones === newState.zones` when no zone changed).

**Acceptance:** Client patch processing time drops from `O(state size)` to
`O(patch size × depth)`.

### Step 5 — Optimistic client updates for safe actions
**Goal:** Eliminate R7 perceptual latency on the player's own clicks.

Scope: limit to actions whose effect is fully predictable client-side and
cheap to reconcile if rejected.

1. Identify a whitelist of "optimistic-safe" actions. Start with: `MOVE` (when
   target zone is reachable per local pathfinder), `OPEN_DOOR` (when door is
   unlocked client-side state), `RELOAD` (when survivor has matching ammo),
   `END_TURN`. Do **not** optimistically resolve: any dice roll (`ATTACK`,
   `SEARCH` resolution, zombie phase outcomes), trade, spawn.
2. In `NetworkManager.sendAction`, after sending, also call a new
   `applyOptimistic(action)` that mutates `gameStore` to the predicted state.
   Tag the optimistic state with `state._pendingActionId` and a copy of the
   pre-action snapshot.
3. On STATE_UPDATE/STATE_PATCH receipt, drop the snapshot and accept server
   state as authoritative. On `ERROR` receipt, restore the snapshot and
   surface the error.
4. Show a subtle "pending" visual cue (e.g. ghost-render the survivor's
   committed move target) so the user can tell the action is in flight.

**Acceptance:** Click→visible-update on whitelisted actions is bounded by the
local frame, not by server RTT. Server rejection paths still work correctly.

### Step 6 — Add granular event channel (optional, high payoff for late-game)
**Goal:** Address R8 for the cases where state snapshots are overkill.

1. Introduce a parallel server→client message type:
   `EVENT { kind, payload }` (e.g. `kind: 'SURVIVOR_MOVED'`,
   `payload: { survivorId, fromZone, toZone, apCost }`).
2. Action handlers that have a clean "what happened" summary attach it to
   the response (e.g. `response.events: GameEvent[]`).
3. Server emits per-event messages **before** the diff, so the renderer can
   start animating immediately while the authoritative state catches up.
4. Client uses events for animation/feedback only; STATE_PATCH remains
   authoritative for game logic.

**Acceptance:** Movement/door/draw animations begin within a frame of patch
arrival rather than waiting for full reconciliation.

## Verification Strategy

1. Add a server-side timer wrapper around `handleMessage` →
   `processAction` → `broadcastRoomState` that logs ms per action with
   `intent.type`. Throw it behind an `ENDEAD_PERF=1` env flag.
2. Add a client-side timer from `sendAction` call to next
   `gameStore.update` containing the resulting state version. Log to
   console behind `?perf=1` query param.
3. Capture a baseline (10 actions early game, 10 actions late game) before
   any change.
4. After each step, re-run and record the delta. Expect:
   - Step 1: -1 to -3 ms server; eliminates I/O variance spikes.
   - Step 2: -2 to -5 ms server (proportional to state size).
   - Step 3: flatlines late-game cost growth.
   - Step 4: -2 to -10 ms client.
   - Step 5: ~0 perceived latency on whitelisted actions.
5. Final integration check: deploy to render.com free tier and exercise a
   full game. Compare felt responsiveness against the pre-change deployment.

## Constraints & Non-Goals

- **Do not** change game-rule semantics. All optimization must preserve
  identical authoritative GameState transitions.
- **Do not** swap better-sqlite3 for an async driver. The fix is to remove
  persistence from the hot path, not to make it async.
- **Do not** rewrite to Socket.IO. Native `ws` is fine; the bottleneck is
  payload + persistence, not the transport library.
- **Do not** introduce new external dependencies (no Immer, no Redux Toolkit,
  no Mobx) — implement immutable updates inline.
- **Preserve** existing test contracts in `src/services/__tests__/`. Add new
  tests for any altered serialization or patch behavior.
- **Per `CLAUDE.md`:** do not commit or push at any step; report progress
  and wait for explicit user authorization.

## File Inventory (touch list)

- `src/server/server.ts` — Steps 1, 2, 3, 6
- `src/services/PersistenceService.ts` — Step 1 (no API change expected;
  may want a `saveRoomBatch` if useful)
- `src/services/ActionProcessor.ts` — Step 3 (history handling), Step 6
  (event emission)
- `src/utils/StateDiff.ts` — Step 2 (only if `applyPatch` is changed),
  Step 3b (if chosen), Step 4
- `src/client/NetworkManager.ts` — Step 5 (optimistic apply), Step 6
  (event channel)
- `src/client/GameStore.ts` — Step 5 (snapshot/rollback support)
- `src/services/__tests__/` — Coverage for new patch behavior
- New file (suggested): `src/services/PersistenceScheduler.ts` — Step 1

## Cross-References

- Diff/patch implementation: `src/utils/StateDiff.ts:14, 21`
- Server broadcast: `src/server/server.ts:270-298`
- Server action dispatch: `src/server/server.ts:580-595`
- Action processor + history append: `src/services/ActionProcessor.ts:140-257`
- Client receive: `src/client/NetworkManager.ts:52-67`
- Client send: `src/client/NetworkManager.ts:106-117`
- Client store: `src/client/GameStore.ts:30-77`
- Persistence: `src/services/PersistenceService.ts:42-47, 13`
