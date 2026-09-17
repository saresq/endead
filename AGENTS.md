# Endead — Project Directives

## Commands

- `npm install` — install dependencies.
- `npm run dev` — backend and frontend together; the game is at `http://localhost:5173`.
- `npm run server` / `npm run front` — one half at a time.
- `npm run build` — production build into `dist/`.
- `npm test` — the Vitest suite.

## Rules reference

- The Zombicide rules live in [`rules/`](rules/), one chapter per file, transcribed from
  `rulebook.pdf`. [`RULEBOOK.md`](RULEBOOK.md) is the index — chapter table plus a
  "where a question lives" map. `rulebook.pdf` settles anything disputed.
- Facts the rulebook does not carry (Skill trees, card stats, per-card Zombie amounts) are marked
  `> **Not in the rulebook**` with their source named.
- Reference a rule from code by section anchor — `rules/11-combat.md#friendly-fire` — never by line
  number. Headings are stable; line numbers are not.

## Working style

- The server is the source of truth for validation and state mutation. The client renders, takes input and draws UI.
- Extend an existing service before adding a parallel path that does the same job.
- Prefer a localized fix to rewriting a stable system.
- Edit files; never blind-overwrite a whole file with a write.

## Git & commits

- **Do not commit or push.** Only create commits when the user explicitly asks ("commit this", "make a commit", etc.). Finishing a task, passing tests, or wrapping up a phase does NOT authorize a commit.
- Do not run `git push`, `git push --force`, `git reset --hard`, `git commit --amend`, or `git rebase` without an explicit request for that specific action.
- Develop → report → wait for the user to ask for a commit.

## Testing

- Unit tests live under `src/**/__tests__/` and run via `npm test` (Vitest).
- Standalone scripts under `src/tests/` are legacy — do not convert them to Vitest unless asked.

## RNG

- Use `src/services/Rng.ts` (xoshiro128**) for every random draw. Never import `Math.random` into gameplay code.
- `GameState.seed` is a 4×uint32 tuple (`RngState`). Serialize as JSON; never parse/format as a string.
- Attack dice go through `src/services/CombatDice.ts` (`rollAttack`). Do not call `Rng.rollD6` directly from combat code — the pipeline enforces the accuracy clamp and reroll ordering. A Lucky reroll is `handleRerollLucky` restoring the pre-attack snapshot and re-running `handleAttack`, not a separate dice helper.

## Player identity

- The two keys (`endead_player_id`, `endead_nickname`) live behind `src/client/identity.ts`. Go through the accessors — no other module addresses the keys directly.
- **The keys must not move to `sessionStorage` for ordinary tabs.** An accidental close would then return an unknown `playerId`, and `src/server/server.ts:486-504` admits that mid-game as a spectator, which has no client UI.
- **To drive a second player, load the tab with `?tab`** (`/?tab`, `/room/<id>?tab`). The flag takes no value and is case-sensitive.
- The choice latches on the store, so entering a room (`pushState` drops the query) and leaving it (a reload) do not cost the tab its identity.
- **Reload a `?tab` tab, never close it.** Its identity dies with the tab, so it can never return, and ten minutes later `abandonGame` (`src/server/server.ts:322,331-354`) ends the game for *everyone* with a defeat screen.
- **Open each extra player as a fresh tab** (`browser_tabs` new tab, which has no opener). A tab duplicated from a `?tab` tab inherits a copy of its `sessionStorage`, same `playerId`, and kicks its source with `SESSION_REPLACED` (`src/server/server.ts:474-484`).
- If the console says `sessionStorage is unavailable`, the browser is blocking it: the `?tab` tab silently shares the stored identity and will be replaced. The page still loads — that warning is the only symptom, and it is logged once per tab.
- A backgrounded tab's rendering and timers are throttled, so bring a tab to the front before reading its state. The socket itself survives, since `HeartbeatManager.ts:31` pings at the protocol level.
- `npm run dev`, then `http://localhost:5173`. Names default to the generated `player-123456` and can be typed into `#menu-nickname` or `#lobby-nickname`, but once a character is picked the UI shows the class instead (`displayName.ts:13`), so give each tab a different character to tell them apart.

## Driving the board from a browser test

`main.ts` publishes `window.__endead` (`{ app, renderer, inputController, gameHud, playerId }`) behind
`import.meta.env.DEV`, so it exists under `npm run dev` and is stripped from `npm run build`. Nothing in
the game reads it. It is there because the board is a PIXI canvas: without the renderer a test can find a
zone id but not the pixel to click, and every zone click has to go through the real canvas to exercise
`InputController`.

- **`TILE_SIZE` is 15** (`src/config/Layout.ts`), not 32. World coords are `cell * TILE_SIZE`; screen is
  `renderer.container.toGlobal(world)`, which is already CSS pixels — do not scale by `devicePixelRatio`.
  Getting this wrong silently targets a zone on the far side of the map and the server answers
  `No tenés línea de visión hacia esa zona`.
- **Click a cell away from the tokens.** `handleClick` runs `hitTestSurvivors` before the zone branch
  (`InputController.ts:141`), so a click on the zone's centroid usually selects a survivor instead of
  attacking. Pick an outlying cell from `zoneGeometry.zoneCells[zoneId]`.
- **Zone clicks are ignored when it is not your turn**, silently. Check `state.players[state.activePlayerIndex]`
  before clicking, or end the other tab's turn first.
- **Widen the viewport first** (1440×900 works). At phone width a valid zone can sit outside the canvas and
  the click lands on nothing.
- `gameStore` and `networkManager` are reachable in dev as `await import('/src/client/GameStore.ts')` — Vite
  serves the same module instance the app holds. Patch `networkManager.sendAction` to assert the payload a
  control actually sends.
- `gameStore.update(structuredClone(state))` renders any board the running game will not deal you (a weapon
  the deck never drew, a pending decision, a zombie line-up). Useful for checking a modal renders and gates
  the send, but the server never saw it: **report that as UI-level, not end to end**, and cover the rule
  itself with Vitest. A server broadcast overwrites the injected state on the next action.
