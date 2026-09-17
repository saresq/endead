## 1. The identity module

- [x] 1.1 `src/client/identity.ts` holding `PLAYER_ID_KEY` / `NICKNAME_KEY` and the three accessors moved verbatim from `src/main.ts:23-24,36-54`, with no top-level access to `window` or either storage
- [x] 1.2 `usesTabIdentity(search: string, tabHasId: boolean): boolean` — `tabHasId || new URLSearchParams(search).has('tab')`
- [x] 1.3 An internal `store()` calling it with `window.location.search` and a `sessionStorage.getItem(PLAYER_ID_KEY) !== null` probe wrapped in `try`/`catch`, as `editorSecret.ts:13-19` does. The `catch` returns `localStorage` — **not** `false`, which on a `/?tab` URL would select the `sessionStorage` that just threw and kill the boot at `init()`'s claim — and logs one `console.warn` naming the consequence: the tab shares the stored identity and may be replaced. The warn is latched behind a module-level flag, since `store()` runs inside every accessor and so on every nickname keystroke
- [x] 1.4 Header comment in the house style (`roomExit.ts:1-6`, `displayName.ts:1-6`, `editorSecret.ts:1-7`): why a tab may want its own identity, why the store choice is its own latch (`pushState` drops the query at six call sites), and the invariant that the id must be claimed while `tab` is still in the URL

## 2. Call sites

- [x] 2.1 `src/main.ts`: delete `:23-24` and `:36-54`, import the accessors; the call sites are `:70`, `:74`, `:76`, `:92`, `:155-156`
- [x] 2.2 `init()` (`src/main.ts:414`) calls `getOrCreatePlayerId()` once, after the editor branch returns at `:443` and before `onpopstate` is installed, so the claim never depends on `getNickname()`'s fallback happening to mint it first. The editor branch keeps touching no identity
- [x] 2.3 `src/client/ui/LobbyUI.ts:839`: `setNickname(nextName)` in place of the hardcoded `localStorage.setItem('endead_nickname', …)`. Behaviour-preserving: `:837-838` returns early on an empty name, so `setNickname`'s `|| getOrCreatePlayerId()` fallback cannot fire from this path, and the 24-character clamp already lives inside `setNickname`
- [x] 2.4 No other module needs touching — a full grep for `localStorage|sessionStorage` finds only `src/main.ts:37,40,46,53`, `src/client/ui/LobbyUI.ts:839`, `src/client/AudioManager.ts:30,31,148,156` (volume keys, deliberately shared across tabs) and `src/client/editor/editorSecret.ts` (its own key)

## 3. Test

- [x] 3.1 `src/client/__tests__/identity.test.ts` over `usesTabIdentity` with plain values, in the existing Node environment: `('', false)` false; `('?tab', false)` true; `('?x=1&tab', false)` true (the flag is rarely first in a real URL); `('?tabs=2', false)` false (pins the behaviour against a naive `search.includes('tab')`); `('?TAB', false)` false (parameters are case-sensitive — pin it either way so it is not an agent trap); `('', true)` true — the latch after `pushState`, the only case this design invents
- [x] 3.2 `npm test` green — baseline is 41 files / 309 tests — with no `vitest.config.ts` change and no new dependency in `package.json`
- [x] 3.3 `npx tsc --noEmit` clean; `tsconfig.json:23` includes `src`, so the new test typechecks with the build

## 4. One agent file

- [x] 4.1 New `## Player identity` section in `AGENTS.md` — a topic noun like the three sections already there, and the place an agent editing identity code will actually look. Bullets, in the voice of `## RNG`:
  - the two keys live behind `src/client/identity.ts`; go through the accessors, no module addresses the keys directly
  - **the keys must not move to `sessionStorage` for ordinary tabs** — an accidental close would return an unknown `playerId`, and `src/server/server.ts:486-504` admits that mid-game as a spectator, which has no client UI
  - **to drive a second player, load the tab with `?tab`** (`/?tab`, `/room/<id>?tab`); the flag takes no value and is case-sensitive
  - the choice latches on the store, so entering a room (`pushState` drops the query) and leaving it (a reload) do not cost the tab its identity
  - **reload a `?tab` tab, never close it.** Its identity dies with the tab, so it can never return, and ten minutes later `abandonGame` (`src/server/server.ts:322,331-354`) ends the game for *everyone* with a defeat screen
  - **open each extra player as a fresh tab** (`browser_tabs` new tab, which has no opener). A tab duplicated from a `?tab` tab inherits a copy of its `sessionStorage`, same `playerId`, and kicks its source with `SESSION_REPLACED` (`src/server/server.ts:474-484`)
  - a backgrounded tab's rendering and timers are throttled, so bring a tab to the front before reading its state; the socket itself survives, since `HeartbeatManager.ts:31` pings at the protocol level
  - `npm run dev`, then `http://localhost:5173`; names default to the generated `player-123456` and can be typed into `#menu-nickname` or `#lobby-nickname`, but once a character is picked the UI shows the class instead (`displayName.ts:13`), so give each tab a different character to tell them apart
- [x] 4.2 Fold the directives worth keeping from `.opencode/rules.md` into `AGENTS.md` as two short sections — `## Commands` (`npm install`, `npm run dev`, `npm run server`, `npm run front`, `npm run build`, `npm test`) and `## Working style` (server is the source of truth for validation and state mutation; extend an existing service before adding a parallel path; prefer a localized fix to rewriting a stable system; edit files, never blind-overwrite). Leave the rest out: the stack, the path map and the gameplay summary already live in `README.md` and `ARCHITECTURE.md`, and duplicating them is what let `rules.md` drift to citing a `ROADMAP.MD` that does not exist
- [x] 4.3 Replace every harness-specific copy with a symlink to the one file, so a section written once is read by all of them:
  ```
  ln -sf AGENTS.md CLAUDE.md
  ln -sf ../AGENTS.md .opencode/rules.md
  mkdir -p .junie && ln -sf ../AGENTS.md .junie/guidelines.md
  ```
  `git add` the symlinks — git tracks them as links, so the content stays in one blob. `CLAUDE.md` could instead hold the single line `@AGENTS.md`, which is what the workspace root does, but a symlink is harness-neutral and this repo wants one file for every tool
- [x] 4.4 Verify the loop closes: `readlink CLAUDE.md .opencode/rules.md .junie/guidelines.md` all resolve to `AGENTS.md`, `git status` shows them as type-changed rather than deleted, and a fresh session in this repo sees the `## Player identity` section

## 5. Verification

- [x] 5.1 Two Playwright tabs, `/` and `/?tab`, both reach the same room's lobby as two players and neither reports `SESSION_REPLACED`
- [x] 5.2 The claiming tab types a nickname on the entry screen *before* creating the room, enters it (`pushState` drops the query), leaves through the pause menu (reload), and still holds its own identity — this is the path that breaks if the claim is left to `getNickname()`'s fallback
- [x] 5.3 Ordinary regression, the hard constraint: a tab that never saw `tab` closes mid-game, reopens the room URL, and is restored to its survivor rather than becoming a spectator; `sessionStorage` holds nothing for it
