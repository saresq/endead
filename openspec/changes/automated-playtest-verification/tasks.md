## 1. Wiring

- [ ] 1.1 Declare `@playwright/test` as a devDependency; `playwright` currently only resolves transitively at 1.63.0 and is in no manifest
- [ ] 1.2 `playwright.config.ts`: launch the dev server, Chromium desktop and an emulated touch device, retries set once here
- [ ] 1.3 `npm run test:e2e` script; `npm test` stays Vitest-only and stays the fast gate
- [ ] 1.4 Port one throwaway check (deck layout at 1440x900) as a smoke test to prove the wiring end to end

## 2. Seeded games

- [ ] 2.1 Optional seed on `POST /api/rooms`, ignored when `NODE_ENV === 'production'` (`server.ts:255` currently seeds from `Date.now()` and `Math.random()`)
- [ ] 2.2 Test: two rooms with the same seed and the same actions draw the same cards and spawn the same zombies
- [ ] 2.3 Test: the seed is ignored in production

## 3. Test helper

- [ ] 3.1 Helper module: create a seeded room, join a second player with `?tab`, wait for the board
- [ ] 3.2 Click a zone by id through `window.__endead` — `TILE_SIZE` 15, `renderer.container.toGlobal`, no `devicePixelRatio` scaling
- [ ] 3.3 Pick an outlying cell from `zoneGeometry.zoneCells` so `hitTestSurvivors` (`InputController.ts:141`) does not eat the click
- [ ] 3.4 Guard turn order before clicking, since zone clicks are silently ignored off-turn
- [ ] 3.5 Never close a `?tab` tab — reload it; a closed one triggers `abandonGame` and ends the game for everyone. Teardown removes rooms at end of run

## 4. Phone shell suite (replaces board-camera 7.3)

- [ ] 4.1 Sheet drag settles at a snap position
- [ ] 4.2 Double-tap zooms
- [ ] 4.3 Pinch zooms, via a CDP session since Playwright has no high-level pinch
- [ ] 4.4 Tap-to-move confirms on the second tap and does not zoom
- [ ] 4.5 `substitute`: End Turn reachable with the visual viewport shrunk the way expanded browser chrome shrinks it
- [ ] 4.6 `substitute`: every input, select and textarea computes to at least 16px at `pointer: coarse`, locking in the `forms.css:515` guard that beats `.menu-input`'s flat 14px

## 5. Rules suite (replaces fix-critical-rules 7.4)

- [ ] 5.1 Shooting a zone with no line of sight is refused and the client says so
- [ ] 5.2 Zombies do not pass a closed door
- [ ] 5.3 Move-cost prompt appears and charges correctly when leaving a zone with zombies
- [ ] 5.4 Opening a building door spawns, with the card shown in the feed
- [ ] 5.5 A wound decision blocks play and play resumes once answered
- [ ] 5.6 Skill modal at Orange, reached by real kills on a seed with enough zombies; cheat mode supplies action points only
- [ ] 5.7 Any state not reachable through real actions is left untested and recorded, never faked with injected state

## 6. Close the loop

- [ ] 6.1 Resolve 7.3 in `openspec/changes/archive/2026-09-16-board-camera-and-mobile-shell/tasks.md`, naming the tests and the two substitutions
- [ ] 6.2 Resolve 7.4 in `openspec/changes/archive/2026-09-16-fix-critical-rules/tasks.md`, naming the tests
- [ ] 6.3 `CLAUDE.md`: point at the committed suite and its helper instead of describing the pattern for throwaway scripts
- [ ] 6.4 `npm test` and `npm run build` still pass; `npm run test:e2e` passes twice in a row to catch flakiness
