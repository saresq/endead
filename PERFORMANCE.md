# Endead — Performance Punch List (Render Free Tier)

Target: reduce perceived and actual response time for Endead when hosted on Render's free tier. Host change is not an option; only code changes.

## Deployment constraints (ground truth)

- Single shared CPU, 512 MB RAM.
- Instance spins down after ~15 minutes of inactivity. First request after idle pays a multi-second boot.
- Egress bandwidth is metered; no edge/CDN.
- Ephemeral filesystem — no persistent disk on free plan.

---

## Architecture snapshot (relevant to perf)

- **Transport**: raw `ws` WebSocket (not socket.io). Server at `src/server/server.ts:21`, client at `src/client/NetworkManager.ts:36`.
- **Messages**: `JOIN`, `ACTION` (client→server); `STATE_UPDATE`, `STATE_PATCH`, `ERROR` (server→client). All `JSON.stringify`, no binary frames.
- **Action round-trip**: `InputController.ts:176` → `NetworkManager.sendAction` → server `handleAction` → `processAction` (`ActionProcessor.ts:109`) → `broadcastRoomState` → client `applyPatch` → `gameStore.update` → Pixi re-render.
- **No optimistic/predictive layer on the client.** Every action blocks on the full round-trip.
- **Persistence**: synchronous `better-sqlite3` write (WAL mode) on every broadcast (`PersistenceService.ts:42-47`, `server.ts:293-296`).
- **Static assets**: served by `express.static` with default options (no `Cache-Control`, no `maxAge`).
- **No HTTP compression** middleware.
- **No `/healthz` endpoint** — Render probes fall through to the SPA `sendFile`.

---

## Tier 1 — Immediate wins (high impact, tiny effort)

### 1. Enable HTTP compression
- **Impact**: H | **Effort**: S
- **Evidence**: `src/server/server.ts:17-18` — no `compression` middleware; `package.json` has no `compression` dep.
- **Why**: All HTML, JS, CSS, and `/api/maps` / `/api/tile-definitions` JSON ships uncompressed over metered egress.
- **Fix**:
  ```ts
  // package.json: npm i compression @types/compression
  import compression from 'compression';
  app.use(compression());
  ```
  Add before `express.static`. Does not affect WS frames; affects HTML and initial API payloads.

### 2. Add a no-op `/healthz`
- **Impact**: H | **Effort**: S
- **Evidence**: `src/server/server.ts:26-165` — no health endpoint; Render's health check hits `/`, which falls through to the SPA `sendFile` and does a disk read every probe.
- **Fix**:
  ```ts
  app.get('/healthz', (_req, res) => res.send('ok'));
  ```
  Register before any other route. Configure Render's health-check path to `/healthz`.

### 3. Long-lived cache headers for fingerprinted assets
- **Impact**: H | **Effort**: S
- **Evidence**: `src/server/server.ts:162` — `express.static(distPath)` with defaults (no `maxAge`). `vite.config.ts` uses default hashed filenames.
- **Fix**:
  ```ts
  app.use(express.static(distPath, { maxAge: '1y', immutable: true }));
  ```
  Keep the SPA fallback (`app.get('/{*any}', ...)`) without cache headers so `index.html` is always fresh.

---

## Tier 2 — Game hot-path cleanup (runs on every action)

### 4. Remove double-serialize in `broadcastRoomState`
- **Impact**: H | **Effort**: S
- **Evidence**: `src/server/server.ts:274-283` — per broadcast: `JSON.stringify(fullState)` + `generateDiff(prev, next)` + `JSON.stringify(patch)` + pick smaller + `structuredClone(state)` for next `previousState`. On single shared CPU this is the dominant per-tick cost.
- **Fix**: after the first snapshot, always send `STATE_PATCH`. Drop the size comparison.
  ```ts
  let message: string;
  if (room.previousState) {
    const patch = generateDiff(room.previousState, room.gameState);
    message = JSON.stringify({ type: 'STATE_PATCH', payload: patch });
  } else {
    message = JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState });
  }
  room.previousState = structuredClone(room.gameState);
  ```

### 5. Prepare SQLite statements once
- **Impact**: M | **Effort**: S
- **Evidence**: `src/services/PersistenceService.ts:43-47` — `this.db.prepare(...)` called inside `saveRoom` on every invocation. Same pattern in `loadRoom`, `saveMap`, etc. (~7 methods). `saveRoom` is called per action at `server.ts:294`.
- **Fix**: compile statements in the constructor, store as class fields, reuse:
  ```ts
  private saveRoomStmt = this.db.prepare(
    'INSERT OR REPLACE INTO rooms (id, state, updated_at) VALUES (?, ?, ?)'
  );
  saveRoom(roomId: string, state: GameState): void {
    this.saveRoomStmt.run(roomId, JSON.stringify(state), Date.now());
  }
  ```
  Apply to every method that currently calls `this.db.prepare` inside its body.

### 6. Move SQLite write off the broadcast critical path
- **Impact**: M | **Effort**: S
- **Evidence**: `src/server/server.ts:293-296` — synchronous `persistenceService.saveRoom` runs before/around broadcast.
- **Fix**: queue the write behind `setImmediate`, or debounce per-room at ~100ms, so the WS frame reaches clients before the disk write completes. Acceptable for a turn-based game.
  ```ts
  setImmediate(() => persistenceService.saveRoom(room.id, room.gameState));
  ```

### 7. Collapse triple `getActiveZombies` re-scan
- **Impact**: M | **Effort**: S
- **Evidence**: `src/services/ZombiePhaseManager.ts:63-68` — closure called three times across three passes; each pass does a full filter + sort.
- **Fix**: evaluate once before the three passes and re-filter subsets locally.
  ```ts
  const allActive = Object.values(state.zombies)
    .filter(z => !this.isZombieDead(z))
    .sort((a, b) => a.id.localeCompare(b.id));
  ```

---

## Tier 3 — Perceived latency (the real "snappy feel")

### 8. Optimistic client prediction (start with MOVE)
- **Impact**: H | **Effort**: M
- **Evidence**: `src/client/NetworkManager.ts:106-117` and `src/client/GameStore.ts` — no local prediction. Every action waits a full WS round-trip before rendering.
- **Fix**: for actions the server cannot reject (MOVE into an adjacent owned zone, open own inventory, end phase when no triggers pending), apply the mutation locally immediately and reconcile when `STATE_PATCH` arrives. Tag in-flight optimistic actions so the reconcile step can roll back on `ERROR`. Start with `MOVE` only — single highest-leverage UX win.

### 9. Cold-start splash in `index.html`
- **Impact**: M | **Effort**: S
- **Evidence**: `src/main.ts:342-387` — `init()` awaits `app.init(...)` with nothing visible; cold-start shows a blank browser page for 4–8s.
- **Fix**: inline CSS splash/skeleton in `#app` inside `index.html`; remove it when `init()` resolves. No server cost.

### 10. `lucide` bundle-size audit
- **Impact**: M | **Effort**: S
- **Evidence**: `package.json:18` — `lucide` in dependencies; used in `src/client/ui/components/icons.ts`. Lucide ships ~1600 SVGs.
- **Fix**: verify Vite's tree-shake removes unused icons (check the production bundle with `vite build --report` or `rollup-plugin-visualizer`). If tree-shake fails, inline the handful of icons actually used.

---

## Optional — flag before shipping

### 11. Keep-warm self-ping
- **Impact**: H on first-visit-after-idle | **Effort**: S
- **Evidence**: no self-ping in `src/server/server.ts` or `src/server/HeartbeatManager.ts`. Render's 15-min spin-down causes cold-start every time traffic is sparse.
- **Caveat**: Render discourages abusing keep-alive to circumvent spin-down. Decide explicitly before enabling.
- **Fix** (if acceptable):
  ```ts
  const SELF_URL = process.env.RENDER_EXTERNAL_URL;
  if (SELF_URL) {
    setInterval(() => fetch(`${SELF_URL}/healthz`).catch(() => {}), 14 * 60 * 1000);
  }
  ```

---

## Already good — do not touch

- WebSocket transport (no polling overhead).
- State-diff protocol is implemented end-to-end (`STATE_PATCH` + `applyPatch` in `src/utils/StateDiff.ts`).
- SQLite WAL mode is on (`PersistenceService.ts:13`).
- Reconnect uses exponential backoff with jitter (`NetworkManager.ts:126-134`).
- Asset loading is non-blocking with graceful fallbacks (`main.ts:173`).

---

## Suggested sequencing

1. **PR 1 — Tier 1** (compression + `/healthz` + static cache headers). ~15 min of work, globally noticeable.
2. **PR 2 — Tier 2** (broadcast dedup + prepared statements + async persist + zombie-scan). Single CPU gets its breathing room back.
3. **PR 3 — Optimistic MOVE** (#8). Biggest "feels like a different game" moment.
4. **PR 4 — Cold-start splash + bundle audit** (#9, #10). Polish.
5. **Optional** — keep-warm self-ping (#11), only after a call on the Render ToS question.
