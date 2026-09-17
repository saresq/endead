## 1. Map playability validator

- [x] 1.1 New module exporting `validateMapPlayability(map)` → reasons array (empty = playable), working on `compileScenario` output. Three rules: player start present; at least one spawn zone with no `spawnColor`; at least one win condition
- [x] 1.2 Vitest coverage per rule, including the `Wasd` shape (plain and coloured spawn markers three cells apart collapsing into one coloured zone) and the `123` shape (only a coloured spawn)
- [x] 1.3 Run it against `ENDEAD` and confirm it reports playable **before** wiring it into any save or filter path
- [x] 1.4 Test asserting every map in the committed `data/endead.db` is playable, so the spec's "stored maps are playable" cannot rot

## 2. Editor and API access control

- [x] 2.1 Auth middleware comparing a request header against `EDITOR_SECRET`; plain string comparison; no secret set means every write is rejected, with no `NODE_ENV` branch
- [x] 2.2 Boot log when no `EDITOR_SECRET` is set, so the reason writes fail is obvious
- [x] 2.3 Lower the global `express.json` limit from 50mb to 5mb (`server.ts:19`); leave it on the global chain
- [x] 2.4 Apply the middleware to `POST /api/maps` (`:39`), `DELETE /api/maps/:id` (`:60`), `DELETE /api/tile-definitions` (`:103`), `POST /api/tile-definitions` (`:113`), `POST /api/tile-definitions/import` (`:127`); leave `GET /api/maps` (`:29`) and `GET /api/tile-definitions` (`:94`) public
- [x] 2.5 `main.ts:414`: prompt for the secret before mounting `MapEditor`; do not mount without it
- [x] 2.6 Send the secret on every editor write — `MapEditor.ts:2120`, `:2218`, `TileDefinitionEditor.ts:1290`, `:1360` — holding it in `sessionStorage`; a `401` clears it and re-prompts
- [x] 2.7 Tests: unauthenticated write returns 401 and stores nothing; write with no `EDITOR_SECRET` configured returns 401; authenticated write behaves as before; reads stay public

## 3. Playability enforced at the three call sites

- [x] 3.1 `POST /api/maps` rejects an unplayable map with the reasons named, storing nothing
- [x] 3.2 `GET /api/maps` returns a `playable` flag per map, computed server-side
- [x] 3.3 Editor shows the reasons in the existing validation panel and disables save while non-empty
- [x] 3.4 `LobbyUI` lists only playable maps; `LobbyUI.ts:285` preselects the first playable one instead of `availableMaps[0]`; `PersistenceService.ts:57` keeps `ORDER BY created_at DESC`
- [x] 3.5 Lobby states the problem and keeps start disabled when no stored map is playable

## 4. Map data cleanup

- [x] 4.1 Stop the dev server, confirm SQLite checkpointed and no `data/endead.db-wal` / `-shm` remains, per the `AGENTS.md` gotcha
- [x] 4.2 Delete `Wasd` (`map-1777488107907`) and `123` (`map-1777491864328`) from `data/endead.db` by explicit id; leave `ENDEAD` (`map-1776396353842`) untouched
- [x] 4.3 Re-run the validator over the db and confirm `ENDEAD` is the only map and is playable
- [x] 4.4 Confirm the lobby now defaults to `ENDEAD` in a real two-player game and the first zombie phase spawns

## 5. Deferred findings from earlier stages

- [x] 5.1 Game-over leave control for every player at `GameHUD.ts:1395`, dispatching the lobby's existing leave-room action; host keeps `Jugar de nuevo` alongside it
- [x] 5.2 Spanish string for the leave control in `src/strings/es/gameOver.ts`
- [x] 5.3 Replace English-name comparisons with `equipmentId`: `CombatHandlers.ts:187`, `:196`, `ItemHandlers.ts:75`, `:111`
- [x] 5.4 Regression test renaming a registry entry and asserting dual-wield, Reload and Flashlight still behave
- [x] 5.5 Delete `src/client/ui/components/StatBar.ts`, `src/client/ui/components/ZombieBadge.ts` and `.zombie-spawn-entry*` (`src/styles/components/zombie.css:143-186`); grep confirms no importers or markup remain

## 6. Deploy wiring (outside this repo)

- [x] 6.1 Add `env_file: ./endead.env` to the `endead` service in the workspace `deploy/docker-compose.yml`, mirroring the `catan` service's `env_file: ./catan.env`
- [x] 6.2 Document `endead.env` and `EDITOR_SECRET` in `AGENTS.md` next to `catan.env`, noting it is VPS-only and never committed
- [x] 6.3 Write the one-time production cleanup runbook: back up the `endea_endead-data` volume, `docker compose stop endead`, list the maps in the volume, delete unplayable ones by explicit id, restart

## 7. Verification

- [x] 7.1 `npm test` passes; `npm run build` type-checks
- [x] 7.2 Unauthenticated `POST /api/maps`, `DELETE /api/maps/:id` and the three tile-definition writes all return 401 with the data unchanged; both `GET`s still serve the lobby
- [x] 7.3 `/editor` does not mount without the secret and does mount with it; a save round-trips
- [x] 7.4 Saving a map whose only spawn is colour-dormant is refused by both the editor and the server, with the reason shown
- [x] 7.5 Two-player game start to first zombie phase on `ENDEAD`, confirming spawns occur
- [x] 7.6 Non-host can leave the game-over screen with the host's tab closed
- [x] 7.7 Grep confirms no `StatBar`, `ZombieBadge`, `.zombie-spawn-entry` or English-name equipment comparison remains
