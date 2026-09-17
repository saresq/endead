## Context

Verified against the working tree before writing this.

- `playwright` resolves at 1.63.0 but appears in no manifest — it is transitive. `@playwright/test` does not resolve at all. There is no `playwright.config.*`. `tests/` exists and is empty. Chromium builds are already in the local cache.
- `main.ts:203` publishes `window.__endead` (`{ app, renderer, inputController, gameHud, playerId }`) behind `import.meta.env.DEV`, added specifically so a test can turn a zone id into a pixel. `CLAUDE.md` documents the pitfalls: `TILE_SIZE` is 15, click an outlying cell so `hitTestSurvivors` does not eat the click, zone clicks are silently ignored off-turn, widen the viewport first.
- `?tab` gives a second player its own identity in the same browser (`src/client/identity.ts`), with the warning that a `?tab` tab must be reloaded and never closed, or `abandonGame` ends the game for everyone ten minutes later.
- `server.ts:255` seeds every game from `roomId-Date.now()-Math.random()`. Nothing can pin it.
- Cheat mode (`CheatHandlers.ts`) grants 999 actions per turn but no experience and no equipment.
- `forms.css:515` already forces `max(16px, 1rem)` on inputs at `pointer: coarse`, with a `:not()` chain written to beat `.menu-input`'s flat `14px`. The guard exists; nothing asserts it.

The two tasks being replaced are `board-camera-and-mobile-shell` 7.3 (phone gestures and shell) and `fix-critical-rules` 7.4 (rules playtest).

## Goals / Non-Goals

**Goals:**
- Both tasks resolved by something that re-runs.
- The smallest product change that makes a game reproducible.
- Honest labelling where emulation is a proxy.

**Non-Goals:**
- A visual regression or screenshot-diff suite.
- CI wiring. The command exists; where it runs is a separate decision.
- Testing the map editor, the lobby copy, or anything the archived changes already verified.
- Replacing Vitest. The rules are specified there; this proves they hold through the real client.
- The three deferred items (board keyboard path, structured history, `forced-colors`). None is a verification gap.

## Decisions

### D1. `@playwright/test`, not hand-rolled scripts
Every browser check so far has been a script written, run once and deleted. That is why two tasks sat unverified. `@playwright/test` brings the runner, retries, fixtures and device profiles rather than reimplementing them, and it is the package the throwaway scripts were already importing a transitive copy of.

### D2. One dev-only seed on room creation
A rules test that cannot predict the next spawn card has to either play until the state appears — slow and flaky — or inject state, which `CLAUDE.md` correctly says is UI-level and not end to end. Pinning the seed is what makes a real-action test deterministic.

`POST /api/rooms` takes an optional seed, ignored when `NODE_ENV === 'production'`. One optional field, one guard.

Alternatives considered: an environment variable, rejected because it is process-wide and two tests could not run in parallel; and injecting state through `gameStore.update`, rejected because the server never sees it, so it proves the renderer and nothing else.

### D3. Real actions for the rules suite, with cheat mode for tempo only
Every rules assertion goes through a real action and a real server response. Cheat mode supplies action points so a scenario is not spread over ten turns, but it grants no experience and no equipment, so the Orange skill modal is reached by real kills on a seed chosen to put enough zombies on the board. Where a state is genuinely unreachable that way, the test is not written and the gap is recorded — an injected pass would be worse than a known hole.

### D4. Device emulation, and a named boundary where it ends
Chromium emulation covers touch events, mobile viewports, `deviceScaleFactor` and — through a CDP session — real pinch, which Playwright has no high-level API for. That covers the sheet, double-tap, pinch and tap-to-move.

Two parts of task 7.3 it cannot cover honestly:

- **"No page zoom on input focus"** is iOS Safari behaviour that Chromium does not reproduce. Its cause is exact, though: a focused field under 16px. So the test asserts the computed size instead. That is a proxy, and the spec makes it declare itself one. It also locks in the `forms.css:515` guard, which nothing currently protects.
- **"End Turn visible with the URL bar expanded"** is a real browser-chrome behaviour. The test shrinks the visual viewport to the same effect, which exercises the layout without proving Safari's chrome.

Both keep `substitute` in the test name, and the resolved task records what was and was not proven. The alternative — ticking the boxes and saying nothing — is how the project got two archived-but-unverified tasks.

### D5. A small helper, not a framework
One module: create a seeded room, join a second player with `?tab`, wait for the board, click a zone by id through `window.__endead`. The `CLAUDE.md` pitfalls live there once — outlying cell, check whose turn it is, widen the viewport — instead of being rediscovered per test.

## Risks / Trade-offs

- [`?tab` tabs are fragile: close one and `abandonGame` ends the game for everyone] → The helper reloads, never closes, and the suite tears down rooms at the end of a run. Documented in the helper, as `CLAUDE.md` documents it for humans.
- [Browser tests are flakier than unit tests] → Every wait is on a state assertion, never a sleep; the seed removes deck randomness; retries are configured once in the config rather than per test.
- [A dev-only seed parameter is new API surface on a server that was just hardened] → One optional field, ignored in production by the same `NODE_ENV` check the editor secret uses, and it grants nothing — worst case in development is a predictable game.
- [Emulation may pass where a real phone fails] → Exactly why D4 names the boundary. The two substitute checks are the honest limit, not a claim of coverage.
- [The suite needs a running server and browsers, so it is slower than `npm test`] → It stays a separate command. `npm test` remains the fast gate.
- [Reaching Orange by real kills may prove fragile across seeds] → If it is, the test pins a seed found to work and says so, rather than injecting XP.

## Migration Plan

1. Declare `@playwright/test`, add the config and the `test:e2e` script. Port one existing throwaway check as a smoke test to prove the wiring.
2. Add the seed parameter and a test that the same seed twice gives the same game.
3. Helper module, then the phone-shell suite.
4. Rules suite.
5. Resolve task 7.3 and 7.4 in their archived task files, naming the tests and the two substitutions.

No rollback concern: the suite adds no production code beyond the seed parameter.

## Open Questions

None.
