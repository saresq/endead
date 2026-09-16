## Context

Every fact below was verified against the working tree, and the map verdicts by compiling each stored map with `compileScenario` against the real tile registry.

The server is a single Express app that also serves the built client (`server.ts:165-167`). There is no user model, no session store and no auth of any kind anywhere in the project except the WebSocket `UNAUTHORIZED` path for room actions (`server.ts:557`). The editor is a client-side route: `main.ts:414` mounts `MapEditor` when the path is `/editor` or the query has `editor`. Its API calls are plain `fetch` with no credentials — `MapEditor.ts:2120` (save), `:2218` (delete), and `TileDefinitionEditor.ts:1290`, `:1360` (tile writes).

Deployment shape matters here. `deploy/` lives in the **workspace root**, not in this repo — it is a copy of `/opt/endea` on the VPS. Its `docker-compose.yml` gives the `catan` service `env_file: ./catan.env` (holding `API_SALT`, VPS-only, never committed) while the `endead` service has no `env_file` at all. The endead SQLite database lives in the Docker volume `endea_endead-data`, seeded from the image's `data/` on first run and never overwritten by later pulls.

Current map state, by compilation:

| Map | Zones | Spawn zones | Active turn 1 | Objective zones | Win conditions | Verdict |
|---|---|---|---|---|---|---|
| `123` (newest, lobby default) | 29 | 1, GREEN | **0** | 0 | 1 | broken |
| `Wasd` | 29 | 1, BLUE | **0** | 4 | 3 | broken |
| `ENDEAD` | 47 | 2, plain | 2 | 6 | 2 | playable |

`Wasd` looks like it has a plain spawn in its marker list, but its `ZOMBIE_SPAWN` and `ZOMBIE_SPAWN_BLUE` markers sit three cells apart and compile into one zone that inherits the colour. The dormant gate is `ZombiePhaseManager.ts:168-172`: a zone with `spawnColor` spawns only once its colour objective is taken and `state.turn > activatedOnTurn`.

## Goals / Non-Goals

**Goals:**
- No one without the secret can write map or tile data, in production or locally.
- An unplayable map cannot be stored, offered or started.
- The shipped map set is playable, and so is the live one.
- One definition of "playable", used by the server, the editor and the lobby.
- A finished game is leaveable by everyone.

**Non-Goals:**
- Accounts, roles, sessions, password reset, rate limiting, audit logging. One shared secret is the whole model.
- Translating or restyling the editor; it stays dev-facing and English.
- Repairing `Wasd` or `123`. They are editor scratch, and `ENDEAD` already works.
- Teaching the editor to author colour-dormant spawns correctly — it may still produce them, it just cannot save a map where they are the *only* spawns.
- The `RULES-REVIEW.md` backlog, the structured-history refactor, and board keyboard navigation.

## Decisions

### D1. A shared secret in a request header, checked by Express middleware
The five write routes get one middleware that compares a header against `EDITOR_SECRET` from the environment. A plain string comparison: the threat is someone guessing the URL, not timing the response, and a constant-time compare would be ceremony without a matching risk. The editor prompts once, keeps the value in `sessionStorage`, and sends it on every write; a `401` clears it and re-prompts so a typo is recoverable.

Alternative considered: **Caddy basic auth** on `/editor` and `/api/maps*`. Rejected as the primary mechanism because it lives only on the VPS, so `npm run dev` locally — or anything reaching the container directly on `127.0.0.1:8081` — still writes unauthenticated, and the protection would vanish the moment the app moved. App-level is where the guarantee belongs. Caddy basic auth stays available as a second layer; nothing here conflicts with it.

### D2. One global body limit, lowered
`express.json({ limit: '50mb' })` at `server.ts:19` is the wrong number, not the wrong shape. A stored map is under 1 KB; the largest real payload is a tile-definition import, and the whole `tile-definitions.json` is 2.2 MB. One global `express.json({ limit: '5mb' })` covers every legitimate request and bounds an unauthenticated parse to something trivial.

Alternative considered: moving the parser off the global chain so auth runs *before* any body is read. Rejected as more machinery than the risk earns — it turns one line into per-route middleware chains on five routes to save parsing at most 5 MB from an unauthenticated caller.

### D3. No secret means no writes, everywhere
If `EDITOR_SECRET` is unset, writes are rejected. No `NODE_ENV` branch, no environment-dependent behaviour, one rule to reason about. Local map authoring sets the variable like any other local config.

Alternative considered: allowing writes in development when the secret is absent, so a fresh clone can author maps with no setup. Rejected: it is a second code path, and a mode where the check silently does nothing is exactly the mode that reaches production by accident.

### D4. One validator module, three callers, one computation
A new module exports `validateMapPlayability(map)` returning the reasons a map is unplayable (empty when playable). It works on the output of `compileScenario`, so it tests what the game actually gets rather than re-reading markers — this is precisely how `Wasd` fools a marker-level reading.

Three rules, from the spec: a player start zone; at least one spawn zone with no `spawnColor`; at least one win condition. A fourth rule — require an exit when a win condition needs one — was dropped: it is the only conditional rule in the set, no current map fails it, and the three flat rules already catch both broken maps.

The server calls it in `POST /api/maps` and rejects with the reasons. The editor calls it directly and surfaces the reasons in the existing validation panel. The **lobby does not call it** — `GET /api/maps` returns a `playable` flag per map, computed server-side. Compiling every stored map in the browser to filter a dropdown is wasted work and a second place for the rules to drift.

### D5. Preselect the first playable map, keep newest-first ordering
`PersistenceService.ts:57` keeps `ORDER BY created_at DESC` — newest-first is a reasonable authoring convenience. `LobbyUI.ts:285` changes from `availableMaps[0]` to the first entry with `playable === true`, over a list already filtered to playable maps. When none is playable the lobby says so and start stays disabled, which is a better failure than today's silent start onto a map that never spawns.

### D6. Two separate deletions, because the repo db does not reach production
Deleting the rows from the committed `data/endead.db` fixes fresh installs and local development only. The live volume `endea_endead-data` was seeded once and is never touched by a pull. Production therefore needs its own one-time step, run after `docker compose stop endead` and a volume backup, and it is part of this change's task list rather than an afterthought. The two junk maps exist locally; whether they also exist in production is unknown until someone looks, so the step starts by listing what is there.

### D7. Compare `equipmentId`, not `name`
`CombatHandlers.ts:187` (`hand1.name === hand2.name`), `:196` (`'Plenty of Bullets'` / `'Plenty of Shells'`), `ItemHandlers.ts:75` (`'Flashlight'`) and `:111` (`d.name === card.name`) all key game logic off English display names that `EquipmentRegistry` happens to still store in English. It works only because nobody has translated the registry, and the day someone does, Reload and Flashlight break silently with no test to catch it. Switch to `equipmentId` and add a regression test that renames a registry entry and asserts the behaviour survives.

### D8. Game-over leave reuses the lobby's leave path
`GameHUD.ts:1395` branches host / non-host for the action slot. The leave control is added for everyone rather than only the non-host, so the host is not stuck either when they do not want to replay, and it dispatches the same leave-room action the lobby already uses instead of inventing a second path.

## Risks / Trade-offs

- [The secret sits in `sessionStorage`, so an XSS on the game origin could read it] → It grants map editing only, never player data or server access, and it is one environment variable to rotate. Accepted; the alternative that avoids it entirely is Caddy basic auth, which D1 rejects for leaving local and direct-port access open.
- [An unauthenticated caller can still make the server parse up to 5 MB] → Bounded and cheap, and D2 takes that over per-route parser wiring on five endpoints. If it ever matters, the parser moves behind the auth middleware then.
- [A shared secret cannot be revoked per person and does not say who changed what] → Matches the actual need: one map author. If that changes, this becomes real auth rather than a bigger password.
- [Deleting rows from the live volume is destructive and irreversible] → Back up the volume first, list the maps before deleting, and delete by explicit id rather than by a predicate. The tasks order it that way.
- [Touching `data/endead.db` can corrupt it] → The `AGENTS.md` gotcha: WAL mode with `-wal`/`-shm` gitignored. Stop the server, let SQLite checkpoint, verify no `-wal` remains, then edit and commit. This has already cost one `sqlite3 .recover`.
- [The validator might reject `ENDEAD` and leave the game with no map] → Run it against `ENDEAD` before wiring it into the save path, and keep a test that asserts the shipped map set is playable, so the spec's "stored maps are playable" requirement cannot rot.
- [Dropping the exit rule lets someone save a map with an escape win condition and no exit] → No current map does, and the three flat rules stay one readable function. Adding the fourth rule later is a few lines in one place.
- [The playable rules are stricter than some future map wants, e.g. a scenario intentionally starting with only dormant spawns] → No such map exists and the rulebook's dormant spawns are an escalation on top of active ones, not a replacement. Loosening later is a one-line change in one module.
- [The compose edit lives outside this repo] → `deploy/docker-compose.yml` and `endead.env` are workspace/VPS artefacts, so they cannot ship in this commit. The tasks call them out as explicit manual deploy steps, and `AGENTS.md` gains the `endead.env` line next to `catan.env`.

## Migration Plan

1. Land the code. Set `EDITOR_SECRET` locally for anyone authoring maps.
2. On the VPS: back up `endea_endead-data`; create `/opt/endea/endead.env` with `EDITOR_SECRET=…`; add `env_file: ./endead.env` to the `endead` service in `/opt/endea/docker-compose.yml`; mirror both into the workspace `deploy/` copy.
3. Deploy with `vps deploy endead`.
4. Verify: an unauthenticated `POST /api/maps` returns `401`; `GET /api/maps` still works; `/editor` prompts.
5. One-time data cleanup on the VPS: list maps in the volume, then delete any that the validator reports unplayable, by id.
6. Rollback: remove the `env_file` line and redeploy restores the previous behaviour; the deleted maps come back only from the volume backup, which is why step 2 takes it first.

## Open Questions

None. The secret's value and where it is stored are an operational choice for the deploy step, not a design decision.
