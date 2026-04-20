# 04 — Broadcast Events + Private Channels + Redaction (Steps 4 + 7 + B12)

Source: `analysis/SwarmComms.md` §3.7, §3.7.1, §3.9, Step 4, Step 7, §0.1 B12, D3, D6.

## Scope

Switch the wire from STATE_PATCH/STATE_UPDATE to `EVENTS`. Introduce `projectForSocket(state, socket)` as the single client-bound payload choke point. Ship per-socket private redaction for hidden info. Fix B12 broadcast leaks (seed, `rollbackSnapshot`, transient scratch, other-player `drawnCard`, trade offers). Flip the client to consume events with mutation-in-place and dev-only freeze-after-batch.

Non-goals: optimistic client (Step 6).

## Preconditions

`03-handlers-mutation-and-events.md` reviewed, deleted, checkbox flipped. The collector is producing events; they just aren't broadcast yet.

## Work items

### A. Server: new `projectForSocket`

1. **New file: `src/server/projectForSocket.ts`**:
   ```ts
   function projectForSocket(state: GameState, socket: SocketContext | null): ClientGameState
   ```
2. Redactions (§3.7.1):
   - `seed` → omitted.
   - `_attackIsMelee`, `_extraAPCost` → should already be off `GameState` post-Step 3; belt-and-braces omit if present.
   - `lastAction.rollbackSnapshot` → REPLACED with `lastAction.canLucky: boolean` (true iff the viewing socket owns the shooter AND reroll is still valid). `originalDice` remains (UI renders "Original: [3,5,1]").
   - `survivors[sid].drawnCard` / `drawnCardsQueue` → visible to the owning player only; others see `{ hasDrawnCard: boolean, queueLength: number }`.
   - `activeTrade.offers` → visible to the two participants only; others see `{ offerCounts: { [survivorId]: number } }`.
   - `equipmentDeck` / `spawnDeck` / `epicDeck` contents → never broadcast. Clients see counts only (`equipmentDeckCount`, etc.). Discards remain public.
   - `spawnContext` (D6) → public (already-resolved spawn facts). Test asserts no future addition leaks unresolved deck state.
3. `socket=null` variant: server-internal (used by persistence) — keeps seed + full state but still drops transient scratch.

### B. Server: `broadcastEvents`

1. Replace `broadcastRoomState(room, excludeSocket?)` with `broadcastEvents(room, events, options?)`.
2. Delete `generateDiff` call at the old `server.ts:274`.
3. Delete the three `JSON.stringify` calls at `:275, :276, :280`.
4. Delete `room.previousState` (declared at `:171`, initialized at `:209`) and the post-broadcast clone at `:283`.
5. For a public event batch, serialize ONCE; fan out to every socket. For per-socket private events, serialize per unique projection.
6. Enable `permessage-deflate` on the `ws` server (SNAPSHOT compresses ~5×; event frames below threshold, unaffected).
7. `SNAPSHOT` replaces `STATE_UPDATE` for join/resync. Payload: `projectForSocket(state, socket)` + event-log tail from `room.eventLog`.
8. `ERROR` message: `{ v, actionId, reason }`.

### C. Private-channel routing (§3.7)

- `CARD_DRAWN` → emit to the drawer's socket only. Public observers receive `CARD_DRAWN_HIDDEN { survivorId }`.
- `TRADE_OFFER_UPDATED` → emit to the two trade participants only. Others receive `TRADE_OFFER_UPDATED_HIDDEN { offerer, count }`.
- Collector must tag events with an optional `recipients?: 'public' | SurvivorId[]`. `broadcastEvents` inspects and routes.

### D. Client: `NetworkManager` + `GameStore`

1. `NetworkManager.onmessage` gains an `'EVENTS'` branch that calls `gameStore.applyEvent(evt)` per event in the batch.
2. `GameStore.applyEvent(evt)` — new dispatch table mutates `state` in place per event kind. Bumps `state.version` once per batch (not per event).
3. `GameStore.update` — switch from identity check to `newState.version !== prevVersion`.
4. Dev-mode freeze discipline (§3.4, D14): at the top of `applyEvent` (unconditionally per D14), thaw via `structuredClone` of the frozen state, mutate, refreeze at end of batch. Wrap ENTIRE `applyEvent` body, not per-event-kind branches — or strict-mode `throw` on first frozen write blows up.
5. Remove `freezeDeep` call at `GameStore.ts:41`. Replace with `applyEvent`-tail refreeze.
6. Delete `StateDiff.applyPatch` call from the action path; if `SNAPSHOT` reconcile doesn't need it, delete the file.
7. Listeners (esp. `src/main.ts:210` per D1): capture `prevVersion` before `applyEvent`; diff fields via event content, not object identity. `prevState !== newState` comparisons are now BROKEN with mutation-in-place; replace with version check or explicit field diff from event payload.
8. `src/client/PixiBoardRenderer.ts:1003` (`reconcileEntities`) becomes event-driven: `SURVIVOR_MOVED` → `AnimationController.moveSurvivor(id, from, to)`; `ZOMBIE_MOVED` / `ZOMBIE_KILLED` → same pattern. Drop the `generateDiff`-on-zombies hack at `src/main.ts:255-270`.

### E. Client: UI components

1. `src/client/ui/*` (action log, HUD) — subscribe to the event stream; maintain a bounded ring buffer (last ~200). No longer read `state.history` (which is gone post-Step-3).
2. Lucky-reroll button — read `lastAction.canLucky` (boolean) instead of `lastAction.rollbackSnapshot`.

### F. Resync / SNAPSHOT

1. `GameState.version` tracking client-side.
2. Client receives `v`; if it jumps (seen `v=N+2` without `v=N+1`), request SNAPSHOT.
3. Server on SNAPSHOT request: send `projectForSocket(state, socket)` + `room.eventLog` tail keyed by version.
4. Single-WS ordering assumption documented in code comment where it's load-bearing.

### G. Redaction test matrix (B12 regression)

Unit test matrix: `(field) × (role)`:

Fields:
- `seed`
- `lastAction.rollbackSnapshot`
- `lastAction.canLucky` (should be present/absent correctly)
- `_attackIsMelee` / `_extraAPCost` (should already be off state post-Step-3)
- `survivors[other].drawnCard` / `drawnCardsQueue`
- `activeTrade.offers` (non-participant)
- `equipmentDeck` / `spawnDeck` / `epicDeck` contents

Roles:
- Owner of the private info
- Non-owner (different player in the same game)
- Spectator

For each cell, assert the field is/isn't present in `projectForSocket(state, socket).toJSON()`. Every cell must be explicitly tested. No drive-by "assert redacted somewhere" — each combination.

### H. rules-audit-findings.md B12 (D3 back-port)

Update `/Users/duir/dev/endead/tasks/develop/rules-audit-findings.md` B12 to reflect the widened scope (seed + `rollbackSnapshot` + transient scratch + other-player `drawnCard` + trade offers + deck contents). One edit; no behavior impact.

## Gameplay invariants that MUST hold

1. **Every action produces identical final state** as before — the wire changes, not the semantics.
2. **Seed never leaves the server**. Grep any socket-bound payload construction (`JSON.stringify.*state`, `ws.send.*state`) — all routed via `projectForSocket`.
3. **`rollbackSnapshot` never leaves the server**. `projectForSocket` test matrix confirms.
4. **Lucky button still works** — clicking it still rerolls; `canLucky` flag gates the UI.
5. **Other players don't see each other's drawn card** during search — searcher sees the card; observers see `hasDrawnCard: true`.
6. **Trade privacy** — participants see offers; spectators see counts.
7. **Deck contents never leak** — counts only on the wire.
8. **Resync works** — disconnect/reconnect mid-game restores state identical to live.
9. **Dev-mode freeze** catches unauthorized between-frame mutations (a test deliberately mutates state outside `applyEvent` → throws in dev).
10. **Client animations**: survivor/zombie movement still tweens correctly via `AnimationController`.
11. **Action log UI**: still shows the action history, now fed by the event stream.
12. **Wire payload <1 KB** for a typical action (MOVE, RELOAD, etc.) — perf probe.
13. **Per-socket routing**: private events go ONLY to their recipient(s); public observers receive the redacted variant.

## Verification

- `npm test` — green. Redaction matrix test file is the new centerpiece.
- `ENDEAD_PERF=1` probe: per-action wire payload <1 KB; server time 1–3 ms typical; ≤5 ms heavy combat; client ≤1 ms.
- Manual 2-client: Player A searches → sees card; Player B sees "Player A drew a card" but NO card ID in dev tools → network tab.
- Manual 2-client: Player A trades with B → C and D see offer counts, not contents.
- Manual: disconnect Player A mid-game → reconnect → state restored identical to live view.
- Manual: run a full round — identical game behavior to Step-3 state.
- `grep -rE "ws\.send\(.*state" src/server/` — every match must pass through `projectForSocket` or be a test.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms Step 4+7+B12. This is the security-critical task — a leak here is a cheat surface. Do NOT rubber-stamp. Assume leaks exist until you've actively ruled each out.
>
> Required checks:
> 1. **Grep for direct socket sends**: `grep -rnE "ws\.send|socket\.send" src/server/` — every match must go through a payload built via `projectForSocket`. Any direct `JSON.stringify(state)` or `ws.send(state)` is a FAIL.
> 2. **`projectForSocket` test matrix exists and passes**: count cells = (7 fields) × (3 roles) = 21 minimum. Every cell must be explicitly tested. Trace the test file.
> 3. **Seed leak check**: `grep -rn "state\.seed\|gameState\.seed" src/server/` — outside `projectForSocket`, `PersistenceScheduler` (with `socket=null`), and game-logic code paths, every appearance in a broadcast-adjacent function is a FAIL. Specifically: does SNAPSHOT ever include seed? It must not.
> 4. **`rollbackSnapshot` leak check**: does any client-bound payload include `lastAction.rollbackSnapshot`? The matrix test must cover this explicitly.
> 5. **Private channel routing**: `CARD_DRAWN` to drawer only, `CARD_DRAWN_HIDDEN` to others. Trace `broadcastEvents` — does it inspect `event.recipients` and route correctly? Is there a test for a 3-player game where B searches and C sees only the hidden variant?
> 6. **Dev freeze discipline**: does `applyEvent` thaw-mutate-refreeze WRAP the entire body, per D14? If it's per-event-kind, strict-mode throws will crash listeners — FAIL.
> 7. **Object-identity listeners**: grep client for `prevState !==`, `prev\.survivors !==`, `prev\.zombies !==` etc. Under mutation-in-place, these are broken. Each must be replaced with version diff or event-payload diff.
> 8. **`generateDiff` deletion**: `grep -rn "generateDiff" src/` — should match only test files / deleted/removed areas. Never on the action path.
> 9. **`StateDiff.applyPatch` deletion from action path**: any remaining usage? If kept for SNAPSHOT, justify.
> 10. **Resync correctness**: pick an action that mutates multiple subtrees (e.g., ATTACK with kill). Disconnect mid-batch; reconnect; does SNAPSHOT + eventLog tail fully recover? Is there a test?
> 11. **UI still works**: action log consumes events; Lucky button reads `canLucky`. Grep `rollbackSnapshot` in client code — should be zero.
> 12. **Wire payload perf**: `ENDEAD_PERF=1` — is it actually wired and emitting? If the task claims <1 KB, load the perf output for a MOVE action and verify.
> 13. **Gameplay invariants #1-13**: for each, name the code path.
> 14. `npm test` — green.
> 15. Unrelated regressions in the diff.
>
> Specifically hunt these known leak shapes:
> - Any `ws.send(JSON.stringify({..., state: room.gameState ...}))` not routed through `projectForSocket`.
> - `lastAction.rollbackSnapshot` appearing in any non-server-local payload.
> - Spectator join path sending unfiltered state.
>
> Output format:
> - `VERDICT: PASS` (only if no leaks, all invariants hold) or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant + leak severity if applicable
> - `DID NOT VERIFY:` unreachable items (esp. browser testing — note explicitly)

On PASS: delete this file; flip the checkbox; append Progress Log entry.
On FAIL: loop until PASS. This task has the lowest tolerance for "good enough".
