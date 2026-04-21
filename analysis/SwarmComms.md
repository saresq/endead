# SwarmComms — Fast, Granular, Client-Reactive Comms

**Mission:** Replace Endead's chunky STATE_PATCH pipeline with a swarm of tiny, fast-travelling event messages so the client resolves action feedback in a single frame, bounded by network RTT rather than serialization cost.

**Source tasks folded in:** `tasks/develop/in-game-responsiveness.md`, `tasks/develop/move-to-faster-infra.md`.

## 0. Operating Posture

- **No backward compatibility.** This is a new game version. No dual-pipeline operation, no STATE_PATCH interop layer, no "inspector" that synthesizes events from before/after state. Every step cuts over cleanly; tests are rewritten, not gated.
- **Handlers flip in one shot** (§3.3, Step 3): return-newState → mutation-in-place + collector. No transitional contract.
- **Redaction is explicit and tested.** `GameState.seed` and `lastAction.rollbackSnapshot` are stripped from every client-bound payload via a single `projectForSocket(state, socket)` function (§3.7.1). Not per-field `delete` calls scattered at broadcast sites.
- **Validate-first, mutate-second.** Every handler does all checks and reads before the first mutation or event emit. A mid-handler `throw` must leave `state` untouched. Load-bearing under mutation-in-place: no cloning means no rollback. (§3.10).
- **Persistence is off the hot path forever** (Step 1). Do not re-introduce writes on user-action broadcast.
- **Pre-flight bugfix batch** — see §0.1. These gameplay bugs surfaced in the same review as this plan; they land before Step 1 so we're not migrating a broken baseline.

### 0.1 Pre-flight gameplay bugfixes (land before Step 1)

Tracked in detail in `tasks/develop/rules-audit-findings.md` under "Review Bugfixes (B1–B12)". One-line summary:

| Id | Problem | Fix |
|---|---|---|
| B1 | `pendingFriendlyFire` doesn't block `checkEndTurn` | Add to the guard list alongside `drawnCard` / `drawnCardsQueue` / `activeTrade` (`TurnManager.ts:128-174`). |
| B2 | Lucky reroll strips `_attackIsMelee` before AP deduction | Move the `delete` to after `deductAPWithFreeCheck` (`CombatHandlers.ts:717-722`). |
| B3 | Ranged LOS silently fails without `zoneGeometry.zoneCells` | Fail fast at map-load; reject maps missing geometry. No runtime BFS fallback. |
| B4 | Dual-wield reload flags one weapon | Track both weapon `id`s during dual-wield; flip `reloaded=false` on each. |
| B5 | Reloadable cards re-enter deck as spent | Reset `reloaded=true` on every discard-to-deck path. |
| B6 | `DoorHandlers.doubleSpawn` skips Rush activation | Route each draw through the shared Rush/extra-activation handler. |
| B7 | Tough FF flag resets per round, not per FF instance | Remove FF-flag reset from End Phase (`ZombiePhaseManager.ts:557`); reset `toughUsedFriendlyFire=false` on survivors in target zone at FF-resolution entry in both `handleAttack` and `handleAssignFriendlyFire`. |
| B8 | `preferredFreePool` too wide on attack payloads | Narrow to `'combat'\|'melee'\|'ranged'`. |
| B9 | Red-objective branch reads like a missing case | Add comment: red zones are always active; `activateNextPhase` is blue/green only. |
| B10 | `epic_aaahh` has `stats: undefined` | Make `EquipmentCard.stats` optional; drop explicit `undefined`. |
| B11 | Reaper removal completeness | Grep for residual `reaper_combat`/`reaper_melee` references; pick core-box replacements for any affected character skill tree. |
| B12 | Broadcast leaks secret state | **Blocks Step 4.** Strip from every client-bound payload: (a) `GameState.seed`, (b) `state._attackIsMelee` / `state._extraAPCost` (transient scratch; ideally lift them out of `GameState` entirely), (c) **`lastAction.rollbackSnapshot`** — contains `seedAfterRoll` AND the full `equipmentDeck` in order (a sniffing client sees every upcoming card), (d) other players' `survivor.drawnCard` / `drawnCardsQueue`, (e) `activeTrade.offers` for non-participants. Client renders a Lucky button from a boolean `canLucky` flag, not the snapshot. Regression test covers each case. |

Reaper skills stay removed (per rules-audit U1 — not in Z2E core box).

---

## 1. Problem In One Breath

Every click today costs (verified against current `main`):
- **Server:** one `structuredClone` *per handler* (each of ~10 handlers clones `state` on entry — e.g. `MovementHandlers.ts:7`, `CombatHandlers.ts:61`, `ItemHandlers.ts:9`) **plus** shallow clones inside `TurnManager.advanceTurnState` / `checkEndTurn` (~4 sites) and `handlerUtils.deductAPWithFreeCheck` (4 sites) and `EquipmentManager`, plus `handleAttack` captures a 5-field deep-clone rollback snapshot for Lucky + `generateDiff(room.previousState, room.gameState)` at `server.ts:274` + **three** `JSON.stringify` calls at `server.ts:275, 276, 280` + a second `structuredClone(room.gameState)` at `server.ts:283` to refresh `previousState` + synchronous SQLite write at `server.ts:294` — all before `ws.send` fires. Total clone/spread sites in scope: ~60 across the service layer.
- **Wire:** ~50–60 KB mid-game `STATE_UPDATE` fallback, ~40 KB of which is `history`. `STATE_PATCH` is smaller but still re-serializes the diff.
- **Client:** `JSON.parse` + `structuredClone(state)` inside `StateDiff.applyPatch` (line 25) + full `reconcileEntities` walk in `PixiBoardRenderer.ts:1003`.

`catanFullEndea` gets the same UX on the same infra by sending **~40–100 byte** per-method events that mutate state in place. Endead can reach the same place without giving up server authority.

---

## 2. Target End-State

A single mental model: **the wire is a stream of small, named, ordered events. Both sides mutate in place. The client predicts what it can, and the server is the only source of truth for what it can't.**

| Property | Today | SwarmComms |
|---|---|---|
| Per-action server work | 10–30 ms+ | 1–3 ms typical, ≤5 ms for heavy combat |
| Per-action wire payload | 5–50 KB | <1 KB |
| Per-action client work | 5–15 ms | ≤1 ms typical |
| Late-game cost growth | linear in `history.length` | flat |
| Click→visible latency (safe actions) | RTT + overhead | **1 frame, locally** |
| In-flight game survives restart | yes (every action) | yes (quiescence snapshot) |

Numbers above replace the earlier "<1 ms" aspirational target — measured floor on current hardware after clone/serialize removal is bounded by `JSON.parse` + validation + `JSON.stringify` + WS syscall.

---

## 3. Architecture

### 3.1 Wire protocol

One message type on the hot path: `EVENTS`.

```ts
{ type: 'EVENTS', v: number, events: GameEvent[] }
```

- `v` is a monotonic per-room state version; each accepted action bumps it by 1. Both sides track it. Out-of-order / gap detection = "request resync."
- `events` is a small array (almost always 1–8; up to ~50 for a full zombie phase).
- All events in one frame share the same `v` — they are the atomic result of one accepted action.

Two other message types:
- `SNAPSHOT` — redacted `GameState` + tail of the event log keyed by version. Used only on join, reconnect, or detected desync.
- `ERROR` — `{ v, actionId, reason }`. Triggers client rollback of any optimistic events tagged with the same `actionId`.

Crucially: **no STATE_PATCH, no diff, no `previousState`.**

### 3.2 Event taxonomy

From the taxonomy audit, ~83 distinct mutations map to a flat discriminated union. Grouped:

- **SURVIVOR:** `SURVIVOR_MOVED`, `SURVIVOR_SPRINTED`, `SURVIVOR_WOUNDED`, `SURVIVOR_HEALED`, `SURVIVOR_DIED`, `SURVIVOR_XP_GAINED`, `SURVIVOR_DANGER_LEVEL_CHANGED`, `SURVIVOR_SKILL_ELIGIBLE` (server-side marker; **not** the player's chosen skill), `SURVIVOR_SKILL_CHOSEN` (emitted only on the later `CHOOSE_SKILL` action — never in an attack chain), `SURVIVOR_FREE_ACTION_CONSUMED`, `SURVIVOR_ACTIONS_REMAINING_CHANGED`.
- **COMBAT:** `ATTACK_ROLLED` (for dual-wield, emit **two** events — one per hand — so animations stagger cleanly), `ATTACK_REROLLED` (see §3.3.1 Lucky), `MOLOTOV_DETONATED`, `FRIENDLY_FIRE_PENDING`, `FRIENDLY_FIRE_ASSIGNED`, `WEAPON_RELOADED`, `WEAPON_FIRED_NOISE`.
- **ZOMBIE:** `ZOMBIE_SPAWNED`, `ZOMBIE_MOVED`, `ZOMBIE_ATTACKED_ZONE`, `ZOMBIE_WOUNDS_PENDING`, `ZOMBIE_WOUNDS_DISTRIBUTED`, `ZOMBIE_DOOR_BROKEN`, `ZOMBIE_KILLED`, `ZOMBIE_ACTIVATED`, `ZOMBIE_EXTRA_ACTIVATION_TRIGGERED`.
- **BOARD:** `DOOR_OPENED`, `ZONE_SPAWNED`, `ZONE_SPAWN_POINT_ACTIVATED`, `NOISE_GENERATED`, `NOISE_CLEARED`.
- **OBJECTIVE:** `OBJECTIVE_TAKEN`, `OBJECTIVE_PROGRESS_UPDATED`, `OBJECTIVE_COMPLETED`, `EPIC_CRATE_OPENED`.
- **DECK:** `CARD_DRAWN` (private to searcher; public observers receive redacted `CARD_DRAWN_HIDDEN`), `CARD_EQUIPMENT_RESOLVED`, `EQUIPMENT_EQUIPPED`, `EQUIPMENT_REORGANIZED`, `EQUIPMENT_DISCARDED`, `DECK_SHUFFLED` (payload: `{ deckSize, discardSize }` **only** — never the reshuffled card order, which would leak future draws), `SPAWN_CARDS_DRAWN`, `SPAWN_DECK_REINITIALIZED`.
- **TURN:** `TURN_STARTED`, `ACTIVE_PLAYER_CHANGED`, `ZOMBIE_PHASE_STARTED`, `ROUND_ENDED`.
- **TRADE:** `TRADE_SESSION_STARTED`, `TRADE_OFFER_UPDATED` (private to trade participants; others see `TRADE_OFFER_UPDATED_HIDDEN { offerer, count }`), `TRADE_ACCEPTED`, `TRADE_CANCELLED`.
- **GAME:** `GAME_STARTED`, `GAME_ENDED`, `GAME_RESET`, `DANGER_LEVEL_GLOBAL_CHANGED`.
- **LOBBY (low-frequency):** `LOBBY_PLAYER_JOINED`, `LOBBY_PLAYER_LEFT`, `LOBBY_CHARACTER_SELECTED`, `LOBBY_NICKNAME_UPDATED`, `LOBBY_PLAYER_KICKED`. Or — alternative — leave lobby on the SNAPSHOT path entirely (the frequency is too low to matter). **Decision:** events for lobby too, so there is one transport. No scope drift at implementation time.

The full taxonomy (with `file:line` triggers, payload shape, and "predictable client-side?" tags) lives alongside this file as an appendix — see §A.

### 3.3 Logic delegation: three tiers

The question "should the client run game logic?" splits three ways.

**Tier 1 — deterministic, no-RNG. Run locally + ship as optimistic event. Server confirms.**

The client **already** has this logic, in `src/client/InputController.ts`:
- `getValidMoveZones` (BFS, zone graph, skill-aware) — line 277
- `getValidSprintZones` / `findSprintPath` (BFS depth 3) — lines 330, 375
- `getValidAttackZones` (range + skill) — line 411
- `getAvailableDoorZones` (door-open check) — line 475
- `getMoveCostForZone` (AP + zombie penalty + skills) — line 259

Safe-for-optimism set (**narrowed** from the first draft — see §3.3.2 for rationale on exclusions):
- `MOVE (depth-1 adjacent only)`, `RELOAD`, `END_TURN`, `ORGANIZE` (inventory), `CHOOSE_SKILL`, `PROPOSE_TRADE` / `UPDATE_TRADE_OFFER` (UI-only offers; confirmation requires both players).

For these, the client **emits the predicted event into its own store before the message even leaves the wire**, tags it with an `actionId`, and waits for the server to confirm (echo back the same event with authoritative version `v`) or reject (`ERROR` with `actionId` → roll back).

**Tier 2 — RNG-bearing (`ATTACK`, `SEARCH`, spawn draws). DO NOT run client-side.**

The client has the seed today (it's in `GameState.seed`), so it *could* replay `Rng.ts`. Don't:
- **Cheating surface.** `Rng.from(seed).d6()` is three lines. A client with the current seed peeks the next N rolls and *then* decides whether to attack, swap weapons, or skip. The point of seeded RNG server-side is that the seed is a secret. (B12 redacts seed + the nested `seedAfterRoll` in `rollbackSnapshot`.)
- **Interleaved ordering diverges anyway.** The RNG is a single stream shared across players and the zombie phase. Player A's in-flight attack and Player B's concurrent search consume in the server's order; no client can know that order without a full arbitration oracle. Predicted rolls desync as often as they matter.
- **Rollback cost is high, not low.** A predicted attack that kills a zombie which the server decides survived leaves the UI showing a dead zombie, resurrecting it, then possibly killing the survivor on the next activation. Worse than a 150 ms spinner.

**Instead — animation carve-out.** Decouple *presentation* from *resolution*:
- On click: fire dice-tumbling, muzzle flash, "rolling..." text, camera nudge — immediately, locally, no server dependency.
- On server echo (`ATTACK_ROLLED` event): fill in the actual dice values and resolve hits.

This gives the click its tactile response without ever falsifying an outcome. The seed stays server-only, always.

**Tier 3 — truly server-only.** Zombie phase resolution, other players' actions, game-end arbitration. No client-side logic. Server broadcasts the event stream and the client renders.

#### 3.3.1 Lucky reroll — partial snapshot, not inverse events

`handleRerollLucky` rewinds state: resurrects zombies, restores XP, un-advances the deck, un-applies Molotov wounds, restores noise tokens. Under event-stream delivery, inverse events for each forward event is a combinatorial explosion (~20 new event kinds, each with symmetric client animation logic).

**Chosen strategy:** emit a single `ATTACK_REROLLED` event carrying a scoped `PARTIAL_SNAPSHOT` — just the subtrees the reroll touches. Client atomically overwrites those subtrees on receive:

```ts
{ type: 'ATTACK_REROLLED',
  shooterId, originalDice, newDice,
  patch: {
    zombies: {...},            // full map — cheap, <2 KB typical
    survivors: {...},          // full map — includes XP/wound/skill-eligibility reversal
    objectives: [...],         // kill-objective progress reversal
    noiseTokens: number,
    zoneNoise: Record<ZoneId, number>,
    equipmentDeckCount: number,  // counts only — never the order
    equipmentDiscardCount: number,
  },
  followupEvents: [...]        // ATTACK_ROLLED for the reroll result,
                               // ZOMBIE_KILLED[], SURVIVOR_XP_GAINED, etc.
}
```

Ugly but bounded: one event type, scoped payload, clear semantics (snap to this partial state, then render follow-ups). Server never needs to synthesize inverse events. Client animates a brief "rewind" transition before the new roll.

This is the **only** event that carries a snapshot-shaped payload. Kept deliberately narrow so the event stream doesn't drift toward STATE_PATCH through the back door. Equipment deck is sent as `count`, never contents — Lucky cannot leak future draws (the reroll re-uses `seedAfterRoll` which continues the RNG; the deck order the server works from is unchanged).

#### 3.3.2 Why Tier-1 is narrower than it looks

- **`SPRINT` excluded.** 3-zone BFS diverges from server in edge cases: intermediate-zombie-zone stops, `slippery` interaction at depth 2 vs 3, door-state races. Snap-back on reject is visible over multiple tiles.
- **`OPEN_DOOR` excluded.** Opening a building can draw spawn cards (`DoorHandlers.ts:46-112`), advancing the secret seed. The client can predict the door opening but not the spawn — any optimistic render would immediately have to overlay zombies appearing, which looks like lag, not optimism. Server authoritative is simpler and honest.
- **`MOVE` to depth-2** (plus-1-zone-per-move skill) requires simulating intermediate-zombie-zone stop logic; whitelist depth-1 only on first pass. Depth-2 can land later once parity with `handleMove` is verified.
- **`ATTACK` / `SEARCH` / `ASSIGN_FRIENDLY_FIRE` / `DISTRIBUTE_ZOMBIE_WOUNDS` / `CONFIRM_TRADE` / anything during Zombie phase** — never optimistic.

### 3.4 Mutation-in-place, both sides

- Server: `ActionProcessor.ts:150` is `let newState = handler(state, intent);` — **the clone is not here**, it's inside each handler (`structuredClone(state)` at the top of `handleMove`, `handleAttack`, `handleUseItem`, etc.). Removing clones therefore means editing every file under `src/services/handlers/*.ts` plus `ZombiePhaseManager.ts`, `TurnManager.ts` (shallow clones in `advanceTurnState` / `checkEndTurn`), `DeckService.ts`, `EquipmentManager.ts`, and `handlerUtils.ts` (shallow `{ ...state }` in `deductAPWithFreeCheck`). Then `ActionProcessor.ts` changes shape from `newState = handler(...)` to `handler(state, collector)` mutating in place. The full clone/spread inventory is ~60 sites, not ten — see Step 5's widened acceptance check.
- Client: `GameStore` keeps a single mutable `state` object. `applyEvent(evt)` mutates it in place and bumps `state.version`. Listeners subscribe on version change, not object identity. `GameState.version` does not exist today — it is introduced in Step 2.
- **No client caller may hold a reference to a prior state object across frames** — with mutation-in-place, `prevState` and `newState` are the same object. Any `prevState !== newState` or `prevState.survivors !== newState.survivors` comparison breaks silently. The single listener in `main.ts:210` currently uses `prevState` only for field-level comparisons (`prevState.phase !== newState.phase`, `prevState.currentDangerLevel !== newState.currentDangerLevel`); those break too. Step 4 adds a `prevVersion` int captured before `applyEvent` so listeners can diff fields via event content, not object-identity.
- Remove the `freezeDeep` call at `GameStore.ts:41` (implementation at line 84). **Do not** replace with a Proxy guard on first pass — a root-only Proxy misses nested writes, and recursive Proxy has real dev-mode overhead and breaks `structuredClone`/`JSON.stringify`. Instead: re-apply `freezeDeep` **after** each event batch finishes applying. Inside `applyEvent`, state is thawed (via `structuredClone` of the frozen state — the one place a clone survives, dev-only) and mutated; at the end of the batch it's refrozen. Catches unauthorized mutation between frames with zero runtime cost in prod. A proper `MutationGuard` (AsyncLocalStorage-based write-token, or recursive Proxy) can land later as polish; do not gate Step 5 on it.

### 3.5 `history` out of `GameState`

`history` is 70% of wire size today and never participates in a diff usefully.

- Delete `state.history` (`ActionProcessor.ts:253-256`, `GameState.ts:346-366`).
- Server keeps two side-channel logs on `RoomContext`:
  - `room.eventLog: Array<{ v: number; events: GameEvent[] }>` (last ~500 entries) — the batch-at-v form is load-bearing for resync-from-version.
  - `room.actionLog: ActionRequest[]` (last ~500 intents) — preserves what `ReplayService` needs; see §3.5.1.
- Persistence snapshot writes `gameState` only; the two logs are tail-only and optional on restart.
- Client UI components that read `state.history` (the log modal in `GameHUD`, the action feed) subscribe to the incoming event stream and maintain their own bounded ring buffer (last ~200).

#### 3.5.1 ReplayService fate

`ReplayService.replayGame` consumes `state.history` entries as intents today. With `state.history` deleted, it consumes `room.actionLog` (intents) instead. Equivalent semantics; no rewrite of the replay logic itself. `compareStates` no longer strips `history` (it's gone) but must strip `version`, `lastAction.timestamp`, and any other non-deterministic fields — explicit allowlist in `ReplayService.ts`.

Replay is the plan's primary invariant-check tool (§6's event-taxonomy drift mitigation). Keeping it intact is not optional.

### 3.6 Persistence off the hot path

- Remove the `persistenceService.saveRoom(room.id, room.gameState)` call at `server.ts:294` (inside `broadcastRoomState`, which spans `server.ts:270–298`).
- Snapshot-on-quiescence. Trigger points, in priority order:
  1. **After every complete zombie phase** — natural round boundary, safest crash-recovery point (all entities committed, no mid-round indeterminacy).
  2. `END_TURN` — secondary, per-player boundary.
  3. Idle 10 s (no actions) — catches the dead-air gap.
  4. Last-disconnect — room becomes unobserved.
  5. `SIGTERM` / `SIGINT` — always flush.
- One `setImmediate` hop off the actor's round-trip.
- Persistence serializes `gameState` via a path-through `projectForSocket` with socket=null (server-local variant that keeps seed + full state but still drops transient `_extraAPCost` / `_attackIsMelee`).
- Better-sqlite3 stays synchronous when it runs; it just doesn't run on the click path.

### 3.7 Private vs public channels (catan inheritance)

Some events carry hidden info that doesn't belong in the public `EVENTS` frame:
- `CARD_DRAWN` (the card ID is private to the searcher until they keep/drop).
- `TRADE_OFFER_UPDATED` (an offered card is private to the trade participants).
- Any future "look at top of deck" Zombicide skill.

Route these to the recipient's socket only (`ws.send` per socket, not the room broadcast). Public observers get a redacted variant (`CARD_DRAWN_HIDDEN { survivorId }`). This is the `io.to(socket_id)` idea from catan, adapted to raw `ws`.

#### 3.7.1 `projectForSocket(state, socket)` — the single redaction choke point

All client-bound payloads go through one function (new file `src/server/projectForSocket.ts`). No ad-hoc `delete` at broadcast sites.

```ts
projectForSocket(state: GameState, socket: SocketContext | null): ClientGameState
```

Redactions (verified against current `main` fields):
- `seed` → omitted.
- `_attackIsMelee`, `_extraAPCost` → omitted (and ideally moved off `GameState` into ActionProcessor scratch).
- `lastAction.rollbackSnapshot` → replaced with `lastAction.canLucky: boolean` (true iff the viewing socket owns the shooter and reroll is still valid). `originalDice` stays — UI needs it for "Original: [3,5,1]" rendering.
- `survivors[sid].drawnCard` / `drawnCardsQueue` → visible to the owning player; other players/spectators see a scrubbed `{ hasDrawnCard: boolean, queueLength: number }`.
- `activeTrade.offers` → visible to the two trade participants; others see `{ offerCounts: { [survivorId]: number } }`.
- `equipmentDeck` / `spawnDeck` / `epicDeck` contents → never broadcast. Clients see counts only (`equipmentDeckCount`, etc.). Discard piles are public (cards that have been seen).
- `activePlayerIndex`, `firstPlayerTokenIndex`, `phase`, `zones`, `objectives`, `zombies`, positions, etc. → public.

`projectForSocket` is called:
- On every `SNAPSHOT` send (join, reconnect, desync, spectator join).
- On every per-socket `EVENTS` send if any event in the batch has per-recipient redaction.
- For persistence with `socket=null` (server-internal view).

Tested with a unit test matrix: (each redacted field) × (owner, non-owner, spectator) → assert the field is/isn't present. No regression can silently leak seed or `rollbackSnapshot` again.

### 3.8 Version, ordering, resync

Every accepted action bumps the room's `v`. Every `EVENTS` message carries the resulting `v`.

- Client tracks last-seen `v`. If it receives `v = N+2` without having seen `N+1`, it requests a `SNAPSHOT`.
- `room.eventLog` entries are `{ v, events[] }` — supports O(log n) seek on resync-from-version. A flat event array loses this.
- No out-of-order delivery is possible on a single WS, so gap detection is a safety net for reconnection, not a hot-path concern.
- Optimistic events on the client are tagged `{ v: null, pending: actionId }` until confirmed. On confirmation the client drops the tag; on `ERROR` it restores a per-action path-targeted snapshot of the touched subtree (D20 — snapshot-only rollback; there is no "inverse events" path).

### 3.9 Renderer integration

`PixiBoardRenderer.reconcileEntities` (line 1003) already reuses `entitySprites`. It becomes an event consumer, not a state-walker:
- `SURVIVOR_MOVED` → `AnimationController.moveSurvivor(id, from, to)`; sprite tween + final position comes from the mutated store.
- `ZOMBIE_MOVED` / `ZOMBIE_KILLED` → same pattern; drop the `generateDiff`-on-zombie-list hack in `main.ts:255-270`.
- Board graphics (zones, doors, noise) still redraw on relevant event kinds; event-driven dirty flags replace the always-full walk.

### 3.10 Handler contract

Binding for every handler touched by Step 3. Violations corrupt `room.gameState` under mutation-in-place.

```ts
type Handler = (state: GameState, intent: ActionRequest, collector: EventCollector) => void;
```

Rules:
1. **Validate first.** All preconditions (ownership, AP, range, inventory, phase) checked before the first `state.X = …` write or `collector.emit(...)` call. If any check fails, `throw`; the collector is discarded, state is untouched.
2. **Reads before writes.** Gather values needed for the mutation (old zone id, weapon stats, current noise count) via const locals at the top of the handler, then mutate.
3. **No `throw` after the first mutation or emit.** A partially applied action is a bug class that did not exist pre-SwarmComms because clones hid it. Now it's a corruption risk. Lint/test enforcement: a Vitest helper that runs each handler against a state where every validation path fails, and asserts `structuralEqual(stateBefore, stateAfter)`.
4. **Idempotent emits.** If a handler is called twice with the same input state (it shouldn't be, but replay does), emits are identical.
5. **Out-of-band mutations count too.** `handleDisconnect` (`server.ts:457-494`) and the `KICK_PLAYER` branch (`server.ts:537-578`) currently mutate `room.gameState` directly, outside `processAction`. Under SwarmComms they become event-emitting paths:
   - `handleDisconnect` → emits `LOBBY_PLAYER_LEFT` (lobby phase) or no-op + spectator toggle (gameplay).
   - `KICK_PLAYER` → emits `LOBBY_PLAYER_KICKED`, bumps `v`, routes through `broadcastEvents`.
   Both paths listed in Step 3's touch scope.

---

## 4. Implementation Plan

Each step is independently shippable and measurable. Step 6 is optional polish; steps 1–5 are the core.

### Step 1 — Strip persistence from the hot path
- Remove DB call from `broadcastRoomState`.
- Add `room.dirty` + quiescence scheduler (post-zombie-phase, `END_TURN`, idle 10 s, last-disconnect, SIGTERM).
- **Acceptance:** zero DB calls on per-action path; latency spikes from disk gone.

### Step 2 — Define the event wire protocol
- New file `src/types/Events.ts` — discriminated union per §3.2 (including lobby events).
- New file `src/types/Wire.ts` — `EVENTS | SNAPSHOT | ERROR` envelope.
- Add `GameState.version: number` (initialized to 0 in `initialGameState`).
- Define `ATTACK_REROLLED`'s `PARTIAL_SNAPSHOT` shape explicitly (§3.3.1).
- **Acceptance:** types compile; no runtime usage yet.

### Step 3 — Emit events from handlers
- Thread a `collector: EventCollector` through `ActionProcessor.processAction` and each handler in `src/services/handlers/*.ts`, `ZombiePhaseManager`, `TurnManager`, `DeckService`, `EquipmentManager`, `handlerUtils` (`deductAPWithFreeCheck`).
- Thread the same collector through the out-of-band paths in `server.ts`: `handleDisconnect`, `KICK_PLAYER`.
- Handler contract flips **in one shot** from `(state, intent) => newState` to `(state, intent, collector) => void` (mutation-in-place). **No intermediate return-newState stage.** We are releasing a new game version — no backward-compat path, no inspector shim.
- Enforce the §3.10 validate-first rule. Add a Vitest helper `assertValidationIsPure(handler, failingInputs[])` used by every handler's test.
- Rewrite every handler + `ActionProcessor.ts:150` (`let newState = handler(...)`) in the same PR. Combine with Step 5's clone-deletion (they're the same diff).
- **Acceptance:** each handler test asserts (a) an expected event sequence in addition to final state, (b) validation-failure paths leave state structurally identical to input; `grep -rE "structuredClone|\\{ *\\.\\.\\.(state|newState)" src/services/` returns zero matches.

### Step 4 — Switch broadcast to `EVENTS`
- `broadcastRoomState` → `broadcastEvents(room, events, options?)` where `options` includes per-socket visibility (§3.7).
- Introduce `projectForSocket(state, socket)` (§3.7.1) as the single choke point for all client-bound payloads.
- Delete the `generateDiff` call at `server.ts:274` plus the three `JSON.stringify` calls at `server.ts:275, 276, 280`. `JSON.stringify` once per event-batch per unique socket projection (room-wide public events serialize once).
- Delete `room.previousState` (declared at `server.ts:171`, initialized at `209`) and the post-broadcast clone at `server.ts:283`.
- Client `NetworkManager.onmessage` gains an `'EVENTS'` branch that calls `gameStore.applyEvent(evt)` per event.
- `GameStore.applyEvent(evt)` dispatch table mutates `state` in place and bumps `state.version`. Thaw → mutate → refreeze (§3.4) in dev.
- Keep `SNAPSHOT` (renamed from `STATE_UPDATE`) for join and resync; stop using it on the action path. Enable `permessage-deflate` on the `ws` server — the SNAPSHOT payload compresses ~5× and costs nothing on event frames (they're under the compression threshold).
- Redaction: `projectForSocket` regression tests cover (seed, `rollbackSnapshot`, transient fields, other-player `drawnCard`, trade offers, deck contents) across (owner, non-owner, spectator).
- **Acceptance:** typical action ships <1 KB on the wire; end-to-end round trip in local dev 1–3 ms server + ≤1 ms client; redaction tests green.

### Step 5 — Mutation-in-place on both sides
- Delete clones/spreads across the full service layer:
  - `structuredClone(state)` at the top of each handler (~12 sites).
  - Shallow `{ ...state }` and `{ ...newState.survivors }` in `handlerUtils.deductAPWithFreeCheck` (4 sites), `TurnManager.advanceTurnState` / `checkEndTurn` (~4 sites).
  - `EquipmentManager.swapDrawnCard` / `moveCardToSlot` internal clones.
  - The `structuredClone` in `SkillHandlers`, `LobbyHandlers`, `ObjectiveHandlers`, `ItemHandlers`, `TradeHandlers`, `DoorHandlers`, `MovementHandlers`, `CombatHandlers`.
  - `server.ts:283` (post-broadcast previousState refresh) — already removed in Step 4.
  - The two clones in `server.ts:411` and `server.ts:477` (spectator add, disconnect in lobby) once those paths are routed through event-emitting handlers.
- Flip `ActionProcessor.ts:150` from `let newState = handler(state, intent)` to `handler(state, intent, collector)` and stop reassigning `newState` through the rest of `processAction` — everything after becomes direct mutation on `state`.
- `handleAttack`'s `captureAttackState` (`CombatHandlers.ts:17-32`) keeps its `structuredClone` calls — Lucky's `rollbackSnapshot` is load-bearing and stays server-side. It is **not** broadcast (B12 + §3.7.1). This is one of the few intentionally-remaining clones.
- Delete `structuredClone` inside `StateDiff.applyPatch` (line 25) and delete `applyPatch` from the action path entirely; keep only if `SNAPSHOT` uses it for reconcile.
- `GameStore.update` switches from identity-check to `newState.version !== prevVersion`.
- Replace `freezeDeep` at call site (`GameStore.ts:41`) with **re-freeze after event batch** (§3.4) — a dev-only pattern in `applyEvent`'s tail. Do not ship Proxy-based MutationGuard in this step.
- Remove `state.history` (type definition `GameState.ts:346-366`, append site `ActionProcessor.ts:253-256`); move history consumers (action log UI) to event subscription + local ring buffer. `room.actionLog` takes over for `ReplayService`.
- **Acceptance:** `grep -rE "structuredClone|\\{ *\\.\\.\\.(state|newState)" src/` shows only: test setup, `handleAttack`'s `captureAttackState` (explicitly allowed), and `SNAPSHOT` reconcile. Late-game (turn 20+) per-action time matches early game. `ReplayService` tests green against the new action log.

### Step 6 — Optimistic client for Tier-1 actions
- `NetworkManager.sendAction(intent)` also calls `optimisticApply(intent)` which:
  1. Generates predicted events locally using the existing `InputController` helpers.
  2. Tags each event with `pending: actionId`.
  3. Pushes them through `gameStore.applyEvent` so the UI updates this frame.
  4. Saves a reversal snapshot (per-action, just the touched subtree via path-targeted clone — not full state).
- On server confirmation (`EVENTS` message with matching `actionId` in any contained event), drop the pending tag and discard the snapshot.
- On `ERROR`, reverse-apply the snapshot, surface the error inline.
- Whitelist (§3.3.2 narrowed): `MOVE (depth-1 only)`, `RELOAD`, `ORGANIZE`, `END_TURN`, `CHOOSE_SKILL`, `PROPOSE_TRADE`, `UPDATE_TRADE_OFFER`.
- **Non-whitelist (no optimism):** `ATTACK`, `SEARCH`, `RESOLVE_SEARCH`, `SPRINT`, `OPEN_DOOR`, `CONFIRM_TRADE`, `ASSIGN_FRIENDLY_FIRE`, `DISTRIBUTE_ZOMBIE_WOUNDS`, `REROLL_LUCKY`, `MOVE` depth-2 (pending parity check), anything during Zombie phase.
- **Acceptance:** click-to-visual on whitelisted actions is one frame regardless of server RTT. ERROR rollback surfaces within 2 frames of server response.

### Step 7 — Private channels for hidden info (ships with Step 4)
- `projectForSocket` handles per-recipient redaction end-to-end; no separate step is needed for events vs SNAPSHOT.
- Redact `CARD_DRAWN` → `CARD_DRAWN_HIDDEN` for non-drawers.
- Redact `TRADE_OFFER_UPDATED` → `TRADE_OFFER_UPDATED_HIDDEN` for non-participants.
- **Acceptance:** a second client watching the searcher sees the draw happen but not the card ID; a third-party client during trade sees offer counts only. Covered by the Step 4 redaction test matrix.

---

## 5. Verification

1. `ENDEAD_PERF=1` server timer wrapping `handleMessage → broadcastEvents`. Log ms + event count per action.
2. `?perf=1` client timer from `sendAction` to the corresponding confirmed event bump.
3. Baseline capture on current `main` (10 actions early, 10 actions turn-20+).
4. Delta after each step:
   - Step 1: -1 to -3 ms server; I/O variance gone.
   - Step 4: -3 to -8 ms server; wire payload 50× smaller.
   - Step 5: -3 to -8 ms client; flatlines late-game growth.
   - Step 6: ~0 ms perceived on whitelisted actions.
5. **Invariant check (dev flag):** periodic `ReplayService` pass over `room.actionLog` from initial state. Assert the replayed state equals the live state (modulo timestamps, `version`). A divergence proves the event stream + mutation-in-place path drifted from the canonical handler semantics. Fold into the existing Vitest suite + a run-on-SIGUSR1 server hook.
6. Final: deploy to render.com free tier, A/B felt responsiveness against catanFullEndea side-by-side.

---

## 6. Risks & Trade-offs

- **Event-taxonomy drift.** Missing an event = a silent desync. Mitigation: the §5 Verification #5 replay invariant, plus a dev-mode structural-hash broadcast (server includes a CRC of sorted-state every N actions; client computes the same, logs mismatch). Both behind a flag.
- **Mid-handler throw corruption.** Under mutation-in-place, a partial mutation followed by throw leaves `room.gameState` corrupt. Mitigated by §3.10's validate-first contract + the `assertValidationIsPure` test helper. Non-negotiable prerequisite for Step 5.
- **Lucky reroll semantics.** `ATTACK_REROLLED` carries a scoped partial snapshot (§3.3.1) — the only event that does. Reviewed for leaks (no full deck, no seed). If a future skill needs similar rewind semantics (none do today), extend the same pattern rather than adding inverse events.
- **Rollback ugliness on optimistic actions.** Optimistic move that server rejects = visible snap-back. Mitigation: tight Tier-1 whitelist (§3.3.2); reject reason is shown inline; only entertain optimism for actions whose local validator already matches server's. `SPRINT` and `OPEN_DOOR` explicitly excluded for this reason.
- **Freeze-after-batch vs live Proxy guard.** Freezing after each event batch in dev catches unauthorized between-frame mutation but not during-batch mistakes within `applyEvent`. Accepted: bugs during `applyEvent` surface as "the event didn't animate / wrong final position" within one frame — easy to spot, and we own the dispatch table. Real `MutationGuard` (AsyncLocalStorage write-token or recursive Proxy) is follow-up polish, not a Step 5 blocker.
- **Ordering assumption.** Client assumes monotonic `v` on a single WS. True for `ws` lib today; document it.
- **Persistence semantics.** Snapshot-on-quiescence means a mid-round crash loses the active player's in-progress turn. Post-zombie-phase snapshot + 10 s idle snapshot + SIGTERM catches most cases. Acceptable for hobby hosting. Do not re-introduce hot-path writes.
- **Cheating surface.** The seed, `rollbackSnapshot`, deck contents, and other players' hidden fields must never leave the server. Enforced by `projectForSocket` with a regression test matrix. B12 is a Step 4 hard blocker — it is not a follow-up.
- **Legacy tests.** Handler tests assume immutable return. They need to adopt an `EventCollector` assertion style in Step 3. Legacy scripts under `src/tests/` stay untouched per `CLAUDE.md`.
- **Spectator join / resync cost.** Full SNAPSHOT + 500 events tail is ~70 KB — same order as today's full `STATE_UPDATE`. Not a regression, not a win. Mitigated by `permessage-deflate` turned on in Step 4 (compresses SNAPSHOTs ~5×, leaves event frames alone).

---

## 7. Non-Goals

- Swapping `ws` for Socket.IO. Transport is fine.
- Async SQLite driver. Remove from hot path, don't make it async.
- New runtime deps (Immer/Redux/Mobx). Implement mutation-in-place inline.
- Changing game-rule semantics. Every handler must produce the same authoritative state transitions.
- Refactors outside the comms path (CharacterRegistry, SkillRegistry, EquipmentRegistry, etc.).
- Recursive Proxy-based MutationGuard on first pass. Freeze-after-batch is sufficient.

---

## 8. Sequencing

**Fixed order: 1 → 2 → 3 → 4 (with 7 folded in) → 5 → 6.**

We are releasing a new game version with no expectation of reconciling with the old pipeline. No intermediate optimism layer against `STATE_PATCH` — that would be throwaway code. Build optimism once, against the final event protocol.

- Step 1 first (cheapest, biggest single server-side win; unblocks the rest).
- Lock the event protocol (2), thread it through handlers (3), flip the wire (4). Private channels (7) ship inside Step 4 via `projectForSocket` — no separate PR.
- Kill clones (5). Steps 3 and 5 land in the same PR since the handler rewrite and the clone deletion are the same diff.
- Build optimism (6) directly on the event stream.

---

## 9. File Touch List

| File | Steps |
|---|---|
| `src/server/server.ts` | 1, 3 (handleDisconnect, KICK_PLAYER → event emitters), 4 |
| `src/server/projectForSocket.ts` | 4 (**new** — single redaction choke point) |
| `src/services/ActionProcessor.ts` | 3, 4, 5 |
| `src/services/handlers/*.ts` | 3, 5 (all 8 handler files: Movement, Combat, Item, Door, Objective, Skill, Trade, Lobby, Turn, handlerUtils) |
| `src/services/ZombiePhaseManager.ts` | 3, 5 |
| `src/services/TurnManager.ts` | 3, 5 (advanceTurnState/checkEndTurn lose shallow clones) |
| `src/services/DeckService.ts` | 3, 5 |
| `src/services/EquipmentManager.ts` | 3, 5 (internal clones) |
| `src/services/PersistenceService.ts` | 1 (caller change only; no schema change) |
| `src/services/PersistenceScheduler.ts` | 1 (**new**) |
| `src/services/ReplayService.ts` | 5 (consume `room.actionLog`; update `compareStates` allowlist) |
| `src/types/Events.ts` | 2 (**new**) |
| `src/types/Wire.ts` | 2 (**new**) |
| `src/types/GameState.ts` | 2 (add `version`), 5 (remove `history`; lift `_extraAPCost` / `_attackIsMelee` into ActionProcessor scratch) |
| `src/utils/StateDiff.ts` | 4, 5 (deleted from action path; kept for SNAPSHOT reconcile only, or removed) |
| `src/client/NetworkManager.ts` | 4, 6 |
| `src/client/GameStore.ts` | 4, 5, 6 (freeze-after-batch in dev; version-based update) |
| `src/client/InputController.ts` | 6 (call `optimisticApply` with predicted events) |
| `src/client/PixiBoardRenderer.ts` | 4 (event-driven dirty flags) |
| `src/client/main.ts` | 4 (drop `generateDiff` hack at lines 255-270; subscribe via event stream) |
| `src/client/ui/*` (action log, HUD) | 4, 5 (subscribe to events instead of reading `state.history`; consume `canLucky` flag instead of `rollbackSnapshot`) |
| `src/services/__tests__/*` | 3, 5 (event-emission assertions; `assertValidationIsPure`; remove immutability expectations; add redaction matrix) |

---

## 10. Constraints (per `CLAUDE.md`)

- Do **not** commit or push at any step. Develop → report → wait for explicit authorization.
- All RNG stays in `src/services/Rng.ts` (`xoshiro128**`). Attack dice stay in `src/services/CombatDice.ts` (`rollAttack`, `applyLuckyReroll`). Mutation-in-place must preserve this.
- `GameState.seed` remains a 4×uint32 tuple, JSON-serialized. It is stripped from every client-bound payload by `projectForSocket` (§3.7.1) — this is a Step 4 hard blocker, not a follow-up.
- Vitest tests under `src/**/__tests__/` stay green at every step.

---

## §A. Event Taxonomy Appendix

The full enumerated list of ~83 events, with file:line triggers, payload shapes, predictability tags, and high-frequency batching notes, was produced alongside this plan. See the agent audit output, or re-derive by walking `src/services/handlers/*.ts`, `ZombiePhaseManager.ts`, `ZombieAI.ts`, `TurnManager.ts`, `DeckService.ts`, `ActionProcessor.ts`. Key batching and ordering points:

- **Dual-wield ATTACK:** emit **two** `ATTACK_ROLLED` events in sequence — one per hand — so client can stagger dice-tumble animations cleanly. Server logic already iterates twice (`CombatHandlers.ts:270-286`).
- **Attack → kill chain:** `ATTACK_ROLLED → ZOMBIE_KILLED[] → SURVIVOR_XP_GAINED → SURVIVOR_DANGER_LEVEL_CHANGED → SURVIVOR_SKILL_ELIGIBLE`. **`SURVIVOR_SKILL_CHOSEN` is not in this chain** — it fires on the later `CHOOSE_SKILL` action, which is an asynchronous player input (modal pick). Emit as a single ordered list in one `EVENTS` frame; client renders the animation chain from the order.
- **`DECK_SHUFFLED` payload:** `{ deckSize: number, discardSize: 0 }` only — never the reshuffled card order. The client UI needs the count; leaking order would expose every upcoming draw.
- **Zombie-phase movement (Pass 2):** 5–50 `ZOMBIE_MOVED` per tick. Batch as one `ZOMBIE_BATCH_MOVED { moves: [...] }`.
- **Zombie-phase attacks (Pass 1/3):** already naturally batched via `pendingZombieWounds` → `ZOMBIE_WOUNDS_PENDING` + `ZOMBIE_ATTACKED_ZONE`.
- **Lucky reroll:** `ATTACK_REROLLED` with scoped `PARTIAL_SNAPSHOT` patch (§3.3.1) followed by the reroll's own `ATTACK_ROLLED` + kill chain. Single `EVENTS` frame, `v` bumps once.

---

## §B. Source Agent Reports

Five parallel audits were consolidated to produce this plan:

1. **Server broadcast pipeline audit** — documented **2 `structuredClone` server-side per action** (1 inside the dispatched handler at e.g. `MovementHandlers.ts:7` / `CombatHandlers.ts:61`, plus 1 at `server.ts:283` to refresh `previousState`) + **3 `JSON.stringify`** calls (`server.ts:275, 276, 280`) + 1 `generateDiff` (`server.ts:274`) + 1 sync DB write (`server.ts:294`). Plus a 3rd `structuredClone` fires client-side inside `StateDiff.applyPatch:25` on the receive path. Mid-game state ~50–60 KB with `history` as 70% of the bytes. Follow-up audit against current `main` widened the count to ~60 clone/spread sites once shallow spreads in `TurnManager`, `handlerUtils`, and `EquipmentManager` were counted.
2. **Client receive/render pipeline audit** — documented `applyPatch`'s mandatory `structuredClone`, the single-listener fan-out in `GameStore`, and — crucially — confirmed `InputController.ts` already has local pathfinding/AP/attack-range/sprint helpers, making Tier-1 optimistic resolution cheap. Also flagged that `main.ts:254-270`'s `generateDiff` on zombie lists becomes event-driven in Step 4.
3. **Catan reference pattern extraction** — validated the per-method granular event model, private-socket route for hidden info, HTML-template full-snapshot for initial sync, and deliberate lack of optimistic UI (server emits or doesn't; client just waits).
4. **Event taxonomy derivation** — enumerated ~83 distinct mutation *events* across all handlers and the zombie phase, with payloads and predictability tags. Re-verification (2026-04-20) counted 32 discrete action kinds in `Action.ts:6-42` and ~65 distinct `state.X` writes across handlers, so the 83-event figure is plausible once chain-and-meta events are included.
5. **Client logic delegation deep dive** — confirmed the three-tier model, argued decisively against client-side RNG replay on cheating + interleaving-divergence + rollback-cost grounds, and contributed the **animation carve-out** pattern for Tier 2: fire the tactile feedback (dice tumble, muzzle flash, "rolling..." text) on click, fill in the actual values from the server echo. This pattern is now embedded in §3.3. The agent also reinforced that `GameState.seed` must never leave the server, which promoted the seed-stripping work from a follow-up to a hard blocker on Step 4 (§6). A follow-up deep-read found the `rollbackSnapshot` leak (equipment deck + nested seed) — also B12 / Step 4 blocker.

---

## §C. Re-verification Log (2026-04-20)

This audit was re-run against current `main`. Corrections applied above:

- `ActionProcessor.ts:150` is `let newState = handler(state, intent)`, not a `structuredClone`. The clones live inside each handler (10+ files) plus shallow spreads in `TurnManager`/`handlerUtils`/`EquipmentManager`. Step 5 and §3.4 updated to reflect the wider touch surface (~60 clone/spread sites).
- `broadcastRoomState` spans `server.ts:270–298`. The `saveRoom` call is at line 294, not the range 292–297. Step 1 / §3.6 updated.
- `freezeDeep` call site is `GameStore.ts:41`; the implementation is at line 84. Both references now correct. Step 5's replacement strategy corrected: freeze-after-batch, not Proxy.
- `JSON.stringify` in `broadcastRoomState` is called **3** times (`server.ts:275, 276, 280`), not 2. §1 and §B updated.
- `GameState` has **no** `version` field today — it is introduced in Step 2. Noted explicitly in §3.4.
- `GameState.seed` is broadcast in plain today (confirmed in `server.ts:276, 280`). No stripping logic exists. §3.7.1 + B12 cover redaction.
- **`lastAction.rollbackSnapshot` is also broadcast today** — contains `seedAfterRoll` AND the full `equipmentDeck` in order. Cross-checked at `CombatHandlers.ts:290-297`; shape includes `zombies`, `survivors`, `equipmentDeck`, `equipmentDiscard`, `objectives`, `noiseTokens`, `zoneNoise`, `attackPayload`, `originalDice`, `seedAfterRoll`. This is a worse leak than the seed alone. B12 widened to cover it.
- All six `InputController` helpers exist at the claimed lines (259, 277, 330, 375, 411, 475). Tier-1 optimism remains cheap — but the whitelist is narrowed to `MOVE depth-1`, `RELOAD`, `ORGANIZE`, `END_TURN`, `CHOOSE_SKILL`, `PROPOSE_TRADE`, `UPDATE_TRADE_OFFER` after validator-parity review.
- `PixiBoardRenderer.reconcileEntities` lives at line 1003 and currently walks full state — confirming Step 4's event-driven dirty-flag work is non-trivial.
- Handler contract is `(state, intent) => newState` with an internal `structuredClone`, 100% consistent across all handler files. Flipping to `(state, intent, collector) => void` is a ~10-file change. The validate-first-mutate-second rule in §3.10 is a new constraint, not a hedge — without it, mutation-in-place corrupts state on handler throws.
- `handleDisconnect` (`server.ts:457-494`) and `KICK_PLAYER` (`server.ts:537-578`) mutate `room.gameState` outside `processAction`. They were missing from the Step 3 touch list in the first draft. Added to §3.10 rule 5 and §9.
- `ReplayService` depends on `state.history` — its fate is explicit in §3.5.1 (switch to `room.actionLog`).
- `captureAttackState` inside `handleAttack` does `structuredClone` of 5 subtrees (zombies, survivors, equipmentDeck, equipmentDiscard, objectives). This stays — Lucky rewinds real state — but the snapshot is server-side only under §3.7.1.

---

## §D. Analyst Skeptical Review (2026-04-20)

Read-through of this document against current `main`. Items are ordered by
severity; each item points to the paragraph it corrects or extends. **These
notes were added by the analyst pass, not the original author — treat as
review comments to fold in during implementation, not as decisions.**

### D1. PATH ERROR — `src/client/main.ts` does not exist (§1, §3.4, §3.9, §9)

The file is at `src/main.ts`, not `src/client/main.ts`. The listener at
§3.4 and the `generateDiff`-on-zombies hack at §3.9 / §9 live there.
`src/client/` contains `GameStore`, `NetworkManager`, `InputController`,
`PixiBoardRenderer`, `AnimationController`, `KeyboardManager`,
`AssetManager`, `AudioManager`, and `ui/*` — but no `main.ts`.

Fix in §9 File Touch List: row 20 path should read `src/main.ts`. Same
for the prose references in §1 ("JSON.parse + structuredClone…" attributes
client-side work to files; the main-listener work is at `src/main.ts:210`,
which is correct; the *path* in §9 is the only thing broken).

### D2. B2 is under-scoped — the same bug exists in the main attack path

`rules-audit-findings.md` B2 and §0.1 here both point at
`CombatHandlers.ts:717-722`. But the identical anti-pattern lives one
line before the main-path call: `ActionProcessor.ts:188-192` does

```ts
delete newState._extraAPCost;
delete (newState as any)._attackIsMelee;      // <— deleted here
const pref = intent.payload?.preferredFreePool as …;
newState = deductAPWithFreeCheck(newState, …, pref);
```

and `deductAPWithFreeCheck` keys `tryMelee` / `tryRanged` on
`state._attackIsMelee` (`handlerUtils.ts:77, 86`). With the flag
already deleted, both branches are *dead code in the normal flow* —
`preferredFreePool === 'melee'` still falls through to `tryCombat`.

Fix: reorder at BOTH sites, or — preferred — make the flag an
explicit parameter to `deductAPWithFreeCheck(…, isMelee?: boolean)`.
This also discharges the `_attackIsMelee`-off-`GameState` lift that
§3.7.1 / §3.10 want anyway.

Update B2's "Where" to include `ActionProcessor.ts:188-192` alongside
the CombatHandlers line range; update `rules-audit-findings.md` B2 so
the pre-flight fix doesn't leave the main path broken.

### D3. B12 widening needs to be back-ported to `rules-audit-findings.md`

`rules-audit-findings.md` B12 still reads as seed-only. This file's
B12 correctly extends the leak to `rollbackSnapshot` (equipmentDeck
order + `seedAfterRoll`), transient `_attackIsMelee` / `_extraAPCost`,
other-player `drawnCard` / `drawnCardsQueue`, and `activeTrade.offers`.
Update the source task file so whoever executes the pre-flight batch
implements the wider scope. Otherwise the bugfix lands narrow and §3.7.1
inherits a pre-existing leak on Step 4.

### D4. Clone/spread site count: ~~47~~ **54** structuredClone + 7 shallow ≈ 61

▸ REVIEWER: The per-file counts below are partially wrong — `grep -c
structuredClone src/**/*.ts` returns **54** sites (excl. tests), not 47.
CombatHandlers alone has **16** (not 9): 5 in `captureAttackState`
(`:24-28`), 5 at handler-top (`:61, :489, :533, :599, :652`), and 6 in
the Lucky-restore block (`:686-691`). The "intentionally kept" count is
therefore **11** (captureAttackState ×5 + Lucky restore ×6), not 6.
Step 5's allowance wording must cover both blocks explicitly. Net
deletion target ≈ **43 structuredClone** (54 − 11 allowed) + **7
shallow** spreads = ~50 sites. §3.4 / §C's "~60" was close; the
original §1 count of "~60" conflated clone/spread with other overhead.

Original (erroneous) breakdown retained below:

~~Step 5's acceptance `grep` and §3.4 / §C both say "~60". Actual:~~

- ~~47 `structuredClone(state|…)` across `src/` (excl. tests).~~
  - ~~Handlers: Skill ×5, Trade ×5, Lobby ×4, Item ×5, Movement ×2,
    Door ×2, Combat ×9 (incl. 6 in `captureAttackState` + Lucky
    restore — **intentionally kept** per §5), Objective ×1, Turn ×1.~~
  - ~~Services: Deck ×3, Equipment ×2, ZombiePhaseManager ×1.~~
  - ~~Server: `server.ts` ×5 (`:202 createRoom`, `:283 previousState`,
    `:411 lobby spectator add`, `:477 lobby disconnect`, `:553 kick`).~~
  - ~~Other: `StateDiff.applyPatch:25`, `ReplayService:19`.~~
- 7 shallow spreads: `TurnManager:130, 185, 189`; `handlerUtils:69, 70,
  144, 146` (this count is correct).

▸ REVIEWER corrected breakdown: Handlers = Skill ×5 + Trade ×5 +
Lobby ×4 + Item ×5 + Movement ×2 + Door ×2 + **Combat ×16** +
Objective ×1 + Turn ×1 = **41**. Services = Deck ×3 + Equipment ×2 +
ZombiePhaseManager ×1 = **6**. Server ×5, StateDiff ×1, ReplayService
×1. **Total = 54.**

Not a plan-logic issue — but Step 5's numeric statement and the §C
widening should match the grep you'll actually run.

### D5. `TurnHandlers.ts` (20 lines, `structuredClone` at :10) is implicit in §9

§9's row "`src/services/handlers/*.ts`" covers it by glob, but the
prose enumeration ("Movement, Combat, Item, Door, Objective, Skill,
Trade, Lobby, Turn, handlerUtils") uses "Turn" ambiguously —
`TurnManager.ts` has its own row. State explicitly that "Turn" =
`TurnHandlers.ts` (which contains `handleEndTurn`) so the PR touches
both.

### D6. `spawnContext` missing from §3.7.1 redaction list

`state.spawnContext` is stamped by the zombie phase with drawn card
ids + spawn details per zone and is read by `ActionProcessor:248-251`
into `history`. It's mostly resolved facts (public), but the
`projectForSocket` test matrix should list it explicitly so future
additions to the struct don't silently broadcast pre-shuffle deck
peeks or similar. Add one line to §3.7.1 redaction list: "`spawnContext`
— public (already-resolved spawn results); assert no future addition
leaks unresolved deck state."

### D7. §A event count (83) is plausible, not enumerated

§B.4 claims the full taxonomy "lives alongside this file as an
appendix" — no such file exists in `analysis/`. §A itself says
"re-derive by walking …". §C's back-of-envelope (32 action kinds +
~65 state.X writes → 83 plausible) is fine but unconfirmed.
Consequence for planning: Step 2 ("Define the event wire protocol")
owns the actual enumeration. Budget effort for it; expect the final
number to land between 40 and ~70 once chain-and-meta events are
correctly deduplicated. Don't let §A's "~83" calcify a decision.

### D8. `ReplayService.replayGame` input shape changes in Step 5 (§3.5.1)

§3.5.1 says "Equivalent semantics; no rewrite of the replay logic
itself." Minor correction: the reconstruction block at
`ReplayService.ts:28-33` (mapping `history` entry → `ActionRequest`)
disappears when the input type changes from `GameState['history']` to
`ActionRequest[]`. It's a ~5-line simplification, not a rewrite —
worth naming so the PR reviewer doesn't flag the signature change as
scope creep.

### D9. `compareStates` allowlist needs concrete fields named (§3.5.1)

Today `compareStates` strips only `history` (`ReplayService.ts:89-92`).
Post-Step-5 it must strip: `version`, `lastAction.timestamp`, any
surviving transient scratch (`_extraAPCost`, `_attackIsMelee` if
somehow still on `GameState`), and arguably all of `lastAction`
(pure UI feedback). §3.5.1 says "explicit allowlist" — list these
fields inline in the plan so the PR body has the exact scope.

### D10. `CHOOSE_SKILL` in Tier-1 whitelist risks cascaded optimism (§3.3.2)

Picking a skill optimistically mutates `survivor.skills`, which
immediately changes downstream Tier-1 validator results
(`plus_1_zone_per_move`, `sprint`, `slippery`, `point_blank`, etc.
— the same helpers `InputController` uses for move/attack/sprint
validity). A subsequent predicted MOVE during the in-flight
confirmation window will use the wrong skill set if the server
rejects the skill choice.

Mitigation: §3.8's `pending: actionId` machinery already tracks
pending events — extend "Tier-1 is allowed while any pending event
exists" to "Tier-1 optimism is suppressed while there is a pending
`CHOOSE_SKILL` or any pending skill-effect-bearing action." One-line
rule; worth making explicit before Step 6 to avoid a "sometimes
optimism double-applies" bug class.

### D11. `EquipmentManager` clone sites are `.ts:68` and `.ts:93` (Step 5)

Step 5's "EquipmentManager.swapDrawnCard / moveCardToSlot internal
clones" describes the intent but not the grep target. Name lines 68
(`updateDrawnCard`) and 93 (`moveCardToSlot`) so the PR checklist is
mechanical.

### D12. Invariant replay cost is O(turns) — keep it off the hot path (§5)

§5 #5's "periodic `ReplayService` pass over `room.actionLog` from
initial state" replays the whole game each invocation. Already
correctly gated behind a dev flag + SIGUSR1. Do not relax that —
late-game a single invariant pass is hundreds of milliseconds, which
would wipe out all the Step-1..5 latency wins if it ever ran
inline. Add a one-line note to §5 #5: "Not automatic; manual /
SIGUSR1 / CI-replay only."

### D13. `DECK_SHUFFLED` payload wording is correct but the invariant is seed-secrecy

§3.2 and §A both say "payload: `{ deckSize, discardSize }` only — never
the reshuffled card order". Correct — but note the deeper reason:
`DeckService` shuffles using `state.seed` via `Rng`. The shuffled
order is deterministic from the pre-shuffle seed. So the *payload*
doesn't need to carry the order because the client can't compute it
anyway — provided `projectForSocket` keeps the seed server-side.
B12 / §3.7.1 are the load-bearing redaction; the payload rule
is the corollary. Add one sentence to §A under DECK_SHUFFLED so a
future reader doesn't wonder "why is omitting the order safe?".

### D14. `freezeDeep` call-site note (§3.4, Step 5)

Verified `GameStore.ts:19-20, 41, 84-105`. §3.4's "re-apply `freezeDeep`
after each event batch finishes applying. Inside `applyEvent`, state
is thawed (via `structuredClone` of the frozen state — the one place
a clone survives, dev-only)" is implementable as written, but note:
frozen objects in strict mode `throw` on write, not silently no-op,
so the dev-mode thaw/refreeze *must* wrap every `applyEvent` call —
not just mutation-bearing ones — or the first listener-triggered
write outside the dispatch table blows up. One-liner addition for §3.4:
"the thaw/refreeze guard wraps the top of `applyEvent` unconditionally,
not per-event-kind."

### D15. `server.ts` out-of-band paths confirmed (§3.10 rule 5)

Verified: `handleDisconnect` runs `server.ts:457-494` (the
`structuredClone` + `history.push` pattern at :477-486 mutates
`room.gameState`); `KICK_PLAYER` runs `server.ts:537-578`
(`structuredClone` + `history.push` at :553-562). Both paths end in
`broadcastRoomState(room)` without going through `ActionProcessor`.
Plan §3.10 rule 5 and §9's "server.ts Steps 1, 3, 4" capture this
correctly. No change — just confirming the rule 5 claim is not
hand-wavy.

### D16. Pre-flight B-series lands before Step 1 — confirm ordering in §8

§0.1 says "They land before Step 1". §8 Sequencing says "Fixed order:
1 → 2 → 3 → 4 → 5 → 6". Read literally, §8 omits the pre-flight.
Add "**B1–B12 → 1 → 2 → …**" to §8 so the ordering constraint is on
the single-source-of-truth for sequencing.

### D17. Not a skepticism — worth confirming

Spot-checks that held up verbatim: `ActionProcessor.ts:150`,
`server.ts:270–298` + `:283` + `:294`, `GameStore.ts:41, 84`,
`StateDiff.ts:25`, `PixiBoardRenderer.ts:1003`, all six
`InputController` helper line numbers, `captureAttackState` at
`CombatHandlers.ts:17-32`, `rollbackSnapshot` shape at `:290-297`,
`checkEndTurn` guard list at `TurnManager.ts:128-174`, `End-Phase`
FF reset at `ZombiePhaseManager.ts:557`, `doubleSpawn` loop at
`DoorHandlers.ts:108-111`, dual-wield reload site at
`CombatHandlers.ts:479-483`. The plan's file:line references are
trustworthy.

### D18. `handleAttack` writes `_attackIsMelee` before LOS/melee-zone throws (§3.10 rule 1 concrete violation)

`CombatHandlers.ts:117` does `(newState as any)._attackIsMelee = isMelee;`
which is followed by two throws: `:119` (`throw new Error('Melee
attacks can only target your own zone')`) and `:126` (`throw new
Error('No line of sight to target zone')`). Under today's clone-per-
handler model the throw discards the clone and the mutation is moot.
Under mutation-in-place (Step 5), the throw leaves `state._attackIsMelee`
set and — worse — the throw-on-LOS-fail leaks the transient scratch
into the next broadcast if no subsequent handler call clears it.

This is *the* canonical case §3.10 rule 1 exists to prevent. The
fix is mechanical but non-trivial because it changes the interleave
of three local variables (`isMelee`, `isRangedWeapon`, `distance`)
and two throws. Proposed handler structure for the Step-3 rewrite:

1. **Pure read block** (no writes to `state`/`newState`): compute
   `isMelee`, `isRangedWeapon`, `distance`, `hasPointBlank`,
   `effectiveMinRange`, `effectiveMaxRange`, `hasLineOfSight`.
2. **All-throws block:** range, melee-zone, LOS.
3. **First mutation:** then — and only then — stash `isMelee` into
   `state` (or better, per D2 / §3.7.1, lift it off `GameState` as a
   parameter to `deductAPWithFreeCheck`).

Add `handleAttack` to the set of handlers with named rewrite work in
Step 3 — it is the worst offender in the current handler set and the
Vitest `assertValidationIsPure` helper catches it on the first
failing-input iteration.

### D19. `handleSearch` draws cards before the empty-deck throw (§3.10 rule 1 concrete violation)

`ItemHandlers.ts:68-74`:

```ts
const drawnCards: EquipmentCard[] = [];
for (let i = 0; i < cardsToDraw; i++) {
  const drawResult = DeckService.drawCard(newState);    // advances seed + mutates deck
  newState = drawResult.newState;
  if (drawResult.card) drawnCards.push(drawResult.card);
}

if (drawnCards.length === 0) throw new Error('Deck empty');
```

`DeckService.drawCard` reshuffles discard into deck (seeded) and pops
a card — advancing `newState.seed` and mutating `newState.equipmentDeck`
/ `newState.equipmentDiscard` before the empty-deck check throws.
Under mutation-in-place this is a real corruption: the seed advances,
the deck state diverges, and the client sees no change (the action
"failed"). The same happens at `:55-57` on the auto-initialize branch
and `:51-58`'s "validate before drawing" comment is literally
contradicted by `:69` drawing before the `drawnCards.length === 0`
throw at `:74`.

Fix: hoist the "both deck + discard empty after potential reshuffle"
check to *before* the draw loop, using a pure-read predicate. The
check at `:53` (`equipmentDeck.length === 0 && equipmentDiscard.length
=== 0`) is a reasonable starting point but it's narrower than what
`drawCard` actually handles — recompute the "can we draw `cardsToDraw`
cards without running dry" invariant as a pure function on
`state.equipmentDeck.length + state.equipmentDiscard.length`.

Add to Step 3's handler-rewrite scope.

### D20. §3.8 "inverse events" contradicts §6 / Step 6's snapshot-only rollback

§3.8: "On `ERROR` it walks backward applying **inverse events**
(restricted whitelist only, where inverses are trivial) **or** restores
a per-action snapshot of the touched subtree."

§6 / Step 6: "Saves a reversal snapshot (per-action, just the touched
subtree via path-targeted clone — not full state). … On `ERROR`,
reverse-apply the snapshot."

Pick one. Given the Tier-1 whitelist (`MOVE depth-1, RELOAD, ORGANIZE,
END_TURN, CHOOSE_SKILL, PROPOSE_TRADE, UPDATE_TRADE_OFFER`), every
touched subtree is ≤1 survivor + maybe an equipment card + (for
TRADE) activeTrade.offers entries. Path-targeted snapshots for these
are trivially cheap — probably ≤200 bytes each. Snapshot-only is the
simpler design. No "inverse events" machinery is needed for the
whitelist as specified.

Recommend: strike "inverse events" from §3.8 and rely on snapshot-
restore end to end. Keeps the Step-6 implementation surface small
and avoids the "two reversal mechanisms, with a whitelist, in two
places" maintenance burden. If a future Tier-1 action ever warrants
an inverse event it can be added then.

### D21. `server.ts:202` createRoom clone needs explicit Step-5 allowance

§3.4 and Step 5's acceptance grep command (`grep -rE
"structuredClone|\\{ *\\.\\.\\.(state|newState)" src/`) returns
`server.ts:202` (`structuredClone(initialGameState)` in `createRoom`)
and `server.ts:411`, `:477`, `:553` as matches. §5 intentionally
leaves `captureAttackState` (×5) and `Lucky-restore` (×6) — but
doesn't enumerate `createRoom`'s `initialGameState` clone. That
clone is **load-bearing**: every room gets a fresh copy of the
in-memory template; without it, two rooms share the same nested
object references.

Add to §5 allowances: "`server.ts:202` createRoom bootstrap clone
(required — `initialGameState` is a module-scope singleton)". The
lobby-path clones at `:411, :477, :553` are the ones that go away in
Step 3 when those paths route through event-emitting handlers (§3.10
rule 5). `previousState` at `:283` goes away in Step 4 (`room.previousState`
is deleted). So the final post-Step-5 `server.ts` grep should show
exactly ONE match: `:202`.

### D22. `lastAction.timestamp` + `spawnContext.timestamp` breaks `ReplayService.compareStates` today

Related to D9. `GameState.ts:376` (`lastAction.timestamp: number`) and
`:411` (`spawnContext.timestamp: number`) both capture `Date.now()`
in handlers (`CombatHandlers.ts:305, 192`, `DoorHandlers.ts:119-ish`,
`ZombiePhaseManager.ts:28`) and survive into the post-action state.
`ReplayService.compareStates` at `:89-92` only strips `history` — so
if anyone runs `compareStates(pristineReplay, liveState)` today it
already diverges on `lastAction.timestamp` and `spawnContext.timestamp`.

The §5 invariant check (`ReplayService` pass) will false-positive
from day one unless the allowlist specifically includes these two
timestamp fields. §3.5.1's "explicit allowlist in `ReplayService.ts`"
needs to name:

- `history` (already stripped)
- `version` (new, Step 2)
- `lastAction.timestamp`
- `spawnContext.timestamp`
- `_attackIsMelee`, `_extraAPCost` (if still on `GameState`;
  preferably lifted off per §3.7.1)

The §5 invariant test catches actual desync between canonical-replay
and mutation-in-place only if these already-diverging fields are
stripped. Otherwise the first green invariant check is the one that
means the test is broken, not the one that means the code is sound.

---
