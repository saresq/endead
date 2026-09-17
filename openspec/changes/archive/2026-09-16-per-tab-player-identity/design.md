## Context

`src/main.ts:36-54` holds three accessors over two `localStorage` keys:

```
endead_player_id    minted once as `player-${Math.floor(Math.random() * 1000000)}`
endead_nickname     falls back to the playerId when unset
```

`startRoom` reads both once into locals (`src/main.ts:155-156`) and passes them to `LobbyUI`, `InputController`, `KeyboardManager` and `networkManager.joinGame`; each caches the id for its own lifetime and all of them are destroyed and rebuilt by `cleanupRoomUi` / `startRoom`, and `NetworkManager` replays a captured `pendingJoin` on reconnect (`src/client/NetworkManager.ts:16,48-54`). So the `playerId` cannot go stale inside a tab.

Storage is not read only once, though: `showMenu` calls `getNickname()` at `src/main.ts:70`, and it runs mid-session without a reload from `:88`, `:103`, `:351`, `:358`, `:363`, `:370` and the `onpopstate` handler at `:453`. With the store choice living inside each accessor it is therefore re-derived on every call, including every keystroke through `:74`. That is harmless only while both inputs to the choice are stable, which is what the next decision has to guarantee.

One module bypasses the accessors: `src/client/ui/LobbyUI.ts:839` writes `localStorage.setItem('endead_nickname', …)` against a hardcoded literal.

The codebase already has per-tab storage with the same shape and reasoning: `src/client/editor/editorSecret.ts:11-31` keeps the editor secret in `sessionStorage`, "kept in sessionStorage for the tab", with every access wrapped in `try`/`catch` for private mode.

## Goals

- Two or more players drivable from one Playwright browser context.
- Nothing an ordinary player can notice, including after an accidental tab close.
- Small enough that no new dependency, test environment or server change is needed.

## Non-Goals

- Reducing the number of clicks an agent needs to fill a lobby and start a game.
- Any change to `SESSION_REPLACED`, spectators, or the abandon timer.
- Multi-account support as a product feature.

## Decisions

### Pick the store, do not namespace the keys

Both stores use the same two key names. Which store a tab reads is the entire mechanism: `sessionStorage` if the current URL carries `tab` **or** `sessionStorage` already holds `endead_player_id`, otherwise `localStorage`.

The second arm of that disjunction is the latch, and it needs no extra key: a tab that has already minted its id into `sessionStorage` is, by that fact alone, a tab that uses `sessionStorage`. This is what carries the claim across `pushState`, which rewrites the location to `/room/<id>` or `/` and so destroys the query string at six call sites (`src/main.ts:82,95,102,350,357,369`), and across the reload in `src/client/roomExit.ts:12-13`.

Considered and rejected: appending `location.search` at each `pushState` call. Six edit sites today and a silent regression the first time a seventh is added.

Considered and rejected: suffixed keys (`endead_player_id:<n>`) in `localStorage`. That needs a parameter value, validation of that value, and leaves permanent junk in the store — all to rebuild what `sessionStorage` already provides for free.

### Claim at load, not by accident

The latch only works if the id reaches `sessionStorage` while `tab` is still in the URL. Today that happens, but for a reason nobody chose. On `/?tab`, `init()` (`src/main.ts:414-465`) runs the editor branch, then routes: with no room in the path it calls `showMenu()`, whose first act is `getNickname()` at `:70`; `sessionStorage` is empty, so it falls through `:48` to `getOrCreatePlayerId()` and the id is minted — by the nickname fallback, before the first `pushState` at `:82`. On `/room/x?tab`, `startRoom` mints directly at `:155`.

That is one ordinary UX change away from breaking. Give `getNickname()` a literal default such as `'Superviviente'` instead of returning the playerId and the sequence becomes: `showMenu` returns the default and mints nothing, the player types a name, `setNickname` writes `endead_nickname` to `sessionStorage` but short-circuits past `getOrCreatePlayerId()` at `:53`, `pushState` drops `?tab`, and `startRoom` then probes for `endead_player_id`, finds null, and falls back to `localStorage` — the same id as the first tab, and a `SESSION_REPLACED`. A split store with the nickname claimed and the id not is genuinely reachable.

So the claim is taken explicitly: `init()` calls `getOrCreatePlayerId()` once, after the editor branch returns and before any routing. Nothing else in the module then depends on which accessor happens to run first. The editor path (`:415-443`) returns before this and keeps touching no identity at all, so `/editor?tab` neither claims nor interferes.

### `tab` takes no value

Nothing reads the value, so nothing has to validate it. `/?tab` and `/?tab=2` behave identically. A valueless flag also has no failure mode where two tabs accidentally choose the same name and kick each other, which a named-seat design does. The parameter is named after the scope it selects rather than after a lobby slot, so it does not invite a number; `seat` was the first candidate and was dropped for exactly that reason. Neither name collides: `grep -rni seat src/` and the same for `tab` as a parameter find nothing.

### The pure seam, so the test needs no DOM

`vitest.config.ts` sets no `environment`, so the suite runs in Node, and neither jsdom nor happy-dom is a dependency. Adding one to test this would change how all existing test files run. Instead the decision is a pure function over plain values, in the same shape as `parseRoomInput` (exported from the DOM-heavy `MenuUI.ts`, tested with plain strings in `src/client/__tests__/parseRoomInput.test.ts`):

```ts
export function usesTabIdentity(search: string, tabHasId: boolean): boolean {
  return tabHasId || new URLSearchParams(search).has('tab');
}
```

`URLSearchParams` is a Node global, so the test imports the real function. The module must therefore have **no top-level access to `window`, `localStorage` or `sessionStorage`** — every such access lives inside a function body, so importing the module in Node is safe.

The thin wrapper around it is not unit-tested; it is a single expression and is exercised by the Playwright run described in `AGENTS.md`.

### Probe `sessionStorage` defensively

Every tab, including an ordinary one, now performs one `sessionStorage.getItem` at boot. In a context where storage is blocked this throws, where before an ordinary tab only touched `localStorage`. The probe is wrapped in `try`/`catch`, matching `editorSecret.ts:13-19`, so a blocked context degrades to exactly today's behaviour instead of a new crash.

The `catch` returns `localStorage` itself, not a `false` fed back into `usesTabIdentity`. Returning `false` reads as the natural shape and is wrong: on a `/?tab` URL the flag is still in the query, so `usesTabIdentity('?tab', false)` is `true`, `store()` hands back the `sessionStorage` that just threw, and the first `getItem` inside `getOrCreatePlayerId()` throws uncaught. Since `init()` claims the id before routing, that kills the boot — a blank page in a context that merely blocks storage, which is strictly worse than the behaviour being replaced. Only an early `return localStorage` gives the degradation this design wants, and it is the one the `console.warn` describes.

That warn is latched behind a module-level flag. `store()` is not called once: it runs inside every accessor, so `showMenu`'s `getNickname()` and every keystroke through `setNickname` would each log it, and one blocked tab would fill the console an agent is reading for `SESSION_REPLACED`.

The existing unwrapped `localStorage` access is left as it is — its behaviour is not part of this change.

### A new module, not an in-place edit

The accessors move to `src/client/identity.ts` because `LobbyUI` needs the same store choice and cannot get it from a string literal, and importing from `main.ts` — the entry point, which runs side effects on import — would be worse. `src/client/roomExit.ts` is the precedent: a tiny module extracted so three surfaces cannot drift. The module is roughly 30 lines and exports `usesTabIdentity`, `getOrCreatePlayerId`, `getNickname`, `setNickname`.

## Risks

- **A duplicated tab inherits the claim.** Browsers copy `sessionStorage` into a tab opened *from* another tab — duplicate-tab, `window.open`, `target="_blank"`. Duplicating a claiming tab therefore produces a second tab with the *same* `playerId`, which reproduces the exact bug this change removes. Nothing in `src/` or `index.html` opens such a tab, so this is only reachable by hand or by an agent duplicating a tab instead of opening a fresh one; `AGENTS.md` says to open each player as a fresh tab.
- **Closing a claiming tab mid-game ends the game for everyone.** `handleDisconnect` (`src/server/server.ts:587-588`) schedules `abandonGame` after `ABANDON_TIMEOUT_MS`, ten minutes (`:36`, `:322`), and that sets `phase = GameOver`, `gameResult = Defeat` and `abandonedBy`, then broadcasts (`:331-354`). A closed claiming tab can never come back — its identity died with it — so the timer always fires. An agent who closes a spare tab and keeps playing in the others loses the whole session ten minutes later, with no visible cause. This, not the spectator path, is the reason the docs say to reload rather than close.
- **A claiming tab loses its identity when closed.** Reopening the room mid-game hits the unknown-player path at `src/server/server.ts:486` and joins as a spectator, which has no client UI. This only affects tabs that asked for their own identity, i.e. agent tabs, and is documented as "reload, do not close".
- **Blocked `sessionStorage` degrades into the bug being fixed.** If the probe throws, a `tab` tab falls back to `localStorage` and two tabs collide on one id — the original symptom, now with a puzzling cause. The `catch` therefore carries a `console.warn`, logged once per tab, so it is visible in the console the agent is already reading; it changes nothing else.
- **`tab` is reachable in production.** The cost is that someone can occupy two lobby seats from one browser — which they can already do with a private window. No secret, no write access, nothing gated behind identity.
- **A hidden tab's UI goes stale.** With several live tabs all but one are backgrounded, so `rAF` pauses the PIXI ticker and `setTimeout` is clamped after a few minutes, which slows `NetworkManager.scheduleReconnect` (`:144`) and the lobby's 500 ms nickname debounce (`LobbyUI.ts:935`). Sockets survive regardless, because `HeartbeatManager.ts:31` pings at the protocol level and the browser pongs without JS. Bring a tab to the front before reading its state.
- **`LobbyUI` gains an import from a client module.** It already imports `networkManager` from a sibling, so this is the established direction.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| Move both keys to `sessionStorage` unconditionally | Simplest possible change, and the reason it is out is the whole point of this design: a real player who closes a tab by accident would lose their survivor to the spectator path. |
| Keep all identity code in `main.ts` and give `LobbyUI` an `onNicknameChange` callback, as `MenuUI` already has (`src/client/ui/MenuUI.ts:39,169-170`) | The idiomatic fix for the `LobbyUI:839` anomaly, and a fair challenge to extracting a module at all. But `LobbyUI` is constructed positionally at `src/main.ts:201,229`, so it means a signature change at two sites plus threading the callback through — not smaller than a 30-line module, and it leaves identity logic inside the entry point where nothing else can import it. |
| Let the server hold several sockets per `playerId` | Turns `room.connections: Map<PlayerId, WebSocket>` into a multimap and reworks `src/server/server.ts:474-484`, the broadcast path and the disconnect bookkeeping at `:558` — and still leaves both tabs as the *same player*, which is not multiplayer. |
| Two origins: `localhost` vs `127.0.0.1` | Zero code, but broken here: `src/client/NetworkManager.ts:24` special-cases only the `localhost` hostname and otherwise dials `ws://<host>` with no path, which Vite's proxy (`vite.config.ts`, path `/ws`) does not cover. Caps at two or three origins for a six-player game. |
| No code; the agent sets `localStorage` via `browser_evaluate` before navigating | Works today, but has to be remembered every session, clobbers the developer's own stored identity in that browser profile, and fails silently into a kicked tab and a confusing error when forgotten. Worth one line in the docs as a fallback for older builds, not as the plan. |
