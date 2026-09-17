## Why

The map editor and every API that writes game data are open to the public internet. In production the server's catch-all (`server.ts:166`) serves `index.html` for any path, so `/editor` loads for anyone who guesses the URL (`main.ts:414`), and the five endpoints behind it — `POST /api/maps`, `DELETE /api/maps/:id`, `POST /api/tile-definitions`, `DELETE /api/tile-definitions`, `POST /api/tile-definitions/import` — have no authentication at all. Anyone can overwrite or wipe every map and tile definition in the live `endea_endead-data` volume, with `express.json({ limit: '50mb' })` sizing the request body. This was written up as the highest-priority finding while planning `lobby-and-spanish-copy` and has been carried, unfixed, through four UI stages.

The same gap has already produced a live defect. Two maps saved from the editor during testing, `Wasd` and `123`, are both unplayable: each has exactly one spawn zone and that zone is colour-dormant, so `ZombiePhaseManager` spawns nothing from turn 1 until a matching coloured objective is taken. Nothing rejected them, because nothing validates a map's playability — `POST /api/maps` checks only that `name` and `tiles` exist, and the editor's validation panel covers tile edges, not scenarios. The lobby then preselects the *newest* map (`PersistenceService.ts:57` orders by `created_at DESC`, `LobbyUI.ts:285` takes index 0), so `123` is the current default. A new game today starts on a map that never spawns zombies.

## What Changes

- **A password gates the editor and every write API.** One shared secret, supplied through the environment the way `catan.env` already supplies `API_SALT`. The five write endpoints reject unauthenticated requests; the editor asks for the password before it will load. `GET /api/maps` and `GET /api/tile-definitions` stay public — the lobby needs them.
- **The body-size limit stops applying to unauthenticated routes.** `express.json({ limit: '50mb' })` is scoped to the routes that actually need a large body, so an unauthenticated request can no longer make the server parse 50 MB.
- **A map must be playable to be saved.** One validator, shared by the server and the editor, checks that a map has a player start, at least one spawn zone that is active on turn 1, at least one win condition, and an exit if a win condition needs one. `POST /api/maps` rejects a map that fails; the editor shows why before the player can save.
- **The lobby only offers playable maps**, and preselects a playable one rather than blindly taking the newest.
- **`Wasd` and `123` are deleted.** `ENDEAD` compiles clean — 47 zones, two spawn zones active from turn 1, six objective zones, two win conditions — so it needs no repair and becomes the only map. **BREAKING** for anyone with a saved game on a deleted map; games live in memory and a deploy restart clears them anyway.
- **Production is cleaned separately.** The committed `data/endead.db` snapshot seeds the Docker volume only on first run, so deleting rows from the repo copy does not touch the live volume. The change ships a one-time documented cleanup for the VPS, run after a volume backup.
- **Every player can leave a finished game.** Today `GameHUD.ts:1395` gives the host `Jugar de nuevo` and everyone else `Esperando al anfitrión…` with no way out; if the host leaves, the others must close the tab.
- **Two small cleanups carried from `lobby-and-spanish-copy`**: delete `StatBar.ts`, `ZombieBadge.ts` and the unused `.zombie-spawn-entry*` rules; and compare `equipmentId` instead of English `card.name` in `CombatHandlers` and `ItemHandlers`, which works today only because nobody has translated `EquipmentRegistry`.

Not in this change, each needing its own: the 25 open items in `RULES-REVIEW.md` (combat `B1`–`B10`, cards and skills `S1`–`S3`, `S7`, `S8`, deviations `D1`–`D5`, `D7`–`D11`), which the review already orders; replacing the server's sentence-shaped history `description`s with structured fields composed on the client; and a keyboard path for board move and attack, deferred by both `hud-critical-fixes` and `desktop-board-deck` because it needs board focus management.

## Capabilities

### New Capabilities
- `editor-access-control`: who may reach the map editor and the APIs that write maps and tile definitions, and what an unauthenticated request gets instead.
- `map-playability`: what makes a map playable, when that is checked, and which maps the lobby will offer and preselect.
- `game-exit`: how a player leaves a game that has ended, host or not.

### Modified Capabilities

(none; `openspec/specs/` holds no archived specs. The dormant-spawn rule this change validates against is `RULEBOOK.md` §9, already implemented at `ZombiePhaseManager.ts:168`.)

## Impact

- `src/server/server.ts`: auth middleware on the five write routes; `express.json` limit scoped; map validation on `POST /api/maps`.
- `src/main.ts`: editor entry asks for the password before mounting `MapEditor`.
- `src/client/editor/MapEditor.ts`: playability shown in the validation panel; save blocked while it fails.
- New shared validator module used by both the server and the editor; new Vitest coverage for it.
- `src/client/ui/LobbyUI.ts`: filter to playable maps, preselect a playable one.
- `src/client/ui/GameHUD.ts`: leave button on the game-over screen for every player.
- `src/services/handlers/CombatHandlers.ts`, `src/services/handlers/ItemHandlers.ts`: `equipmentId` comparisons.
- Deleted: `src/client/ui/components/StatBar.ts`, `src/client/ui/components/ZombieBadge.ts`, `.zombie-spawn-entry*` in `src/styles/components/zombie.css`.
- `data/endead.db`: two map rows removed. Observe the WAL gotcha in `AGENTS.md` — stop the server and let SQLite checkpoint before touching the committed db.
- `deploy/docker-compose.yml` and a new `endead.env` on the VPS carry the secret; `AGENTS.md` documents it alongside `catan.env`.
- No new dependencies. No change to game rules, RNG, or state shape.
