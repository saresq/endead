## Why

A browser holds one player identity. `getOrCreatePlayerId` keeps `endead_player_id` in `localStorage` (`src/main.ts:36-42`), which is shared by every tab of the origin. The Playwright MCP server drives a single browser context, so an agent testing multiplayer opens a second tab, that tab JOINs with the same `playerId`, and the server terminates the older socket with `SESSION_REPLACED` (`src/server/server.ts:474-484`). The first tab lands back on the menu showing "Abriste esta partida en otra pestaña o dispositivo." Multiplayer cannot be playtested at all without closing the browser between players.

The server behaviour is correct and stays: a person who reopens the game must reclaim their seat, because an unknown `playerId` mid-game is admitted as a spectator (`src/server/server.ts:486-504`) and the client has no spectator UI. Losing that would punish a real player for closing a tab by accident. So the browser, not the server, has to learn to hold more than one identity.

## What Changes

- **A tab can opt into its own player identity** by loading any URL with a `tab` query parameter (`/?tab`, `/room/abc?tab`). That tab mints its own `playerId` and nickname in `sessionStorage`, which is per top-level browsing context, so two such tabs are two players.
- **Tabs without `tab` are unchanged**, byte for byte: `localStorage`, same keys, same values, same reconnect-after-close behaviour.
- **The choice of store is the latch.** No second flag and no key renaming: once a tab's id sits in `sessionStorage`, that tab keeps using `sessionStorage`. This matters because `window.history.pushState({}, '', '/room/<id>')` (`src/main.ts:82,95,102,350,357,369`) drops the query string the moment the player enters or leaves a room, and `src/client/roomExit.ts:12-13` then reloads.
- **`src/client/ui/LobbyUI.ts:839` stops writing `localStorage.setItem('endead_nickname', …)` directly.** It is the one place that bypasses the accessors in `main.ts`; left alone, a claiming tab renaming itself in the lobby would overwrite the real player's stored nickname.
- **Agents get documentation** in a new `## Player identity` section of `AGENTS.md`.
- **`AGENTS.md` becomes the single file every agent harness reads.** Today the project's directives exist in three tracked places that already disagree: `AGENTS.md` and `CLAUDE.md` are byte-identical copies with no import between them, and `.opencode/rules.md` is a separate 66-line primer that has drifted — it points at a `ROADMAP.MD` that does not exist. Any harness-specific path becomes a symlink to `AGENTS.md`, so a section written once is read by Claude Code, Codex, Junie, opencode and anything else added later.

Not in this change: seeding a lobby with N players from an API, any server change, any change to what `SESSION_REPLACED` does.

## Capabilities

### New Capabilities
- `player-identity`: how a client decides which `playerId` and nickname it is using, which store holds them, and how a tab opts into its own.

### Modified Capabilities

(none; no existing spec in `openspec/specs/` states where player identity is stored. The invite link this change must not disturb is already specified by `lobby-flow`, which pins it to `<origin>/room/<code>`.)

## Impact

- `src/client/identity.ts` (new, ~30 lines): `usesTabIdentity`, `getOrCreatePlayerId`, `getNickname`, `setNickname`.
- `src/main.ts`: the two key constants (`:23-24`) and three accessors (`:36-54`) move out; call sites at `:70`, `:74`, `:76`, `:92`, `:155-156` import them instead.
- `src/client/ui/LobbyUI.ts:839`: calls `setNickname`.
- `src/client/__tests__/identity.test.ts` (new): covers `usesTabIdentity` as a pure function, in the Node environment the suite already uses.
- `AGENTS.md`: new `## Player identity` section, plus the directives worth keeping from `.opencode/rules.md`.
- `CLAUDE.md`, `.opencode/rules.md`, `.junie/guidelines.md`: symlinks to `AGENTS.md`.
- No new dependency, no `vitest.config.ts` change, no server change.
