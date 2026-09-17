## Why

Two verification tasks were archived unchecked because they were written as "manual on a real phone" and "manual playtest": `board-camera-and-mobile-shell` 7.3 and `fix-critical-rules` 7.4. Between them they are the only unverified work across eleven archived changes, and they cover the parts most likely to break silently — touch gestures, the phone shell, and whether the rules fixes actually hold end to end through the real client rather than only in Vitest.

They do not need to be manual. Chromium device emulation covers touch, mobile viewports and pinch through CDP, and `main.ts:203` already publishes `window.__endead` in dev precisely so a browser test can find the pixel for a zone. `CLAUDE.md` documents the whole pattern — `TILE_SIZE`, clicking away from tokens, `?tab` for a second player. What is missing is that none of it is committed: every browser check so far has been a throwaway script, so nothing re-runs and nothing catches a regression.

## What Changes

- **Playwright becomes a real project dependency.** `@playwright/test` is declared, with a config and `npm run test:e2e`. Today `playwright` only resolves transitively at 1.63.0 and is in no manifest, so the suite would break on a fresh clone.
- **A committed phone-shell suite** replaces `board-camera-and-mobile-shell` 7.3: sheet drag and snap, double-tap zoom, pinch, tap-to-move confirming on the second tap, End Turn reachable when the visual viewport shrinks, and inputs staying at 16px or larger on coarse pointers.
- **A committed rules suite** replaces `fix-critical-rules` 7.4: line of sight on a shot, zombies not opening closed doors, the move-cost prompt, a door-open spawn, wound pause and resume, and the skill modal at Orange — each driven through real actions against the real server.
- **Room creation accepts a seed outside production.** `server.ts:255` seeds from `Date.now()` and `Math.random()`, so no game is reproducible and a rules test cannot rely on which card comes next. An optional seed on `POST /api/rooms`, ignored when `NODE_ENV === 'production'`, is the smallest change that makes the suite deterministic.
- **The suite states what it cannot prove.** Emulation is not a phone: real Safari, real glass and a real URL bar are out of reach. Where a check is a substitute rather than the thing itself, the test says so in its name, and the two source tasks are marked complete-by-substitution rather than silently ticked.

Not in this change: the three items still carried as deferred — a keyboard path for board move and attack, structured history payloads, and `forced-colors` / `prefers-contrast` support. None is a verification gap.

## Capabilities

### New Capabilities
- `automated-verification`: what the browser suite must cover, what counts as end-to-end versus UI-level, and how a test declares itself a substitute for a physical check.

### Modified Capabilities

(none; the suite asserts behaviour that `board-camera`, `mobile-game-shell`, `line-of-sight`, `move-cost`, `building-spawn`, `pending-decisions` and `skill-progression` already specify. It adds no requirement to them.)

## Impact

- `package.json`: `@playwright/test` devDependency, `test:e2e` script.
- `playwright.config.ts`: new, with a dev-server launch and the device profiles the suite uses.
- `tests/`: currently empty; gains the phone-shell and rules suites plus a small helper module for room setup, joining a second player with `?tab`, and clicking a zone through `window.__endead`.
- `src/server/server.ts:255`: optional seed on room creation, ignored in production.
- `openspec/changes/archive/2026-09-16-board-camera-and-mobile-shell/tasks.md` and `.../2026-09-16-fix-critical-rules/tasks.md`: task 7.3 and 7.4 resolved, with a note naming the tests that replaced them.
- `CLAUDE.md`: point at the committed suite instead of describing the pattern for throwaway scripts.
- No production dependency, no change to game rules or state shape.
