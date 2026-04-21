# Remaining TODOs — Roll-Up

Harvested 2026-04-21 from:

- `tasks/develop/rules-audit-findings.md`
- `tasks/develop/game-logic-bugs.md`
- `tasks/develop/game-logic-bugs/README.md`
- `tasks/develop/swarmcomms/README.md`
- `tasks/develop/in-game-responsiveness.md`
- `tasks/develop/move-to-faster-infra.md`
- In-repo `TODO` markers

All SwarmComms steps (01–05) PASS. All Game-Logic phases (01–07) PASS;
Phase 08 (Necromancer) DEFERRED by user decision. B1–B12 review bugfixes
all landed via the SwarmComms `00a–00d` bugfix phases and Step 4. The
performance tasks (`in-game-responsiveness.md`, `move-to-faster-infra.md`)
are effectively **superseded** by SwarmComms — `StateDiff.ts` deleted,
event protocol in place (`src/types/Events.ts`, `src/types/Wire.ts`),
mutation-in-place collectors active (`EventCollector.ts`), optimistic
client shipped (`OptimisticStore.ts`, `predictors.ts`), persistence moved
to `PersistenceScheduler.ts` (quiescence-based), server broadcast through
`broadcastEvents.ts` + `projectForSocket.ts`.

What's left is **content + product polish**. Five items, grouped into
three PR-sized phases.

## Authoritative sources

- Rules: `.claude/skills/zombicide-rules/SKILL.md`, `RULEBOOK.md`,
  invoke the `zombicide-rules` skill when in doubt.
- Character rosters + Kid rules: Zombicide 2E core box + 2E rulebook
  §Survivor Identity Card.

## Phase Order (FIXED)

Ordered by risk and cross-dependency (M4 Kid type must land before
M3 character roster so the Kid entries ship correctly).

- [ ] `01-kid-survivor-type.md` — M4 (`survivorType: CLASSIC | KID`,
  `maxHealth=2` for Kids, Slippery once-per-Turn with a Move Action
  regardless of skill tree). Touches `Survivor` type, character
  instantiation, `MovementHandlers` (Slippery fast-path), UI HUD badge.
- [ ] `02-missing-characters.md` — M3 (Lili, Tiger Sam [Kid], Odin,
  Bunny G [Kid], Lou, Ostara). Requires Phase 01 so Tiger Sam + Bunny G
  instantiate as Kids. Portraits / colors / skill trees per core-box
  identity cards. Update `CHARACTER_DEFINITIONS` in
  `src/config/CharacterRegistry.ts`; pick grey-deck-legal starting
  weapon per character until the picker UI (Phase 03) lands.
- [x] `03-expansion-skill-audit.md` — U1. Deleted 7 non-2E skills
  (`hit_and_run`, `is_that_all_youve_got`, `lifesaver`,
  `bloodlust_melee`, `low_profile`, `barbarian`, `swordmaster`) plus
  their handlers, survivor state flags, action types, UI, and the
  now-dead `handleResolveWounds` + `pendingWounds`/`pendingMolotovWounds`
  surface area. Core-box skills kept: `hold_your_nose` (Ned),
  `matching_set` (Doug), `medic` (Amy), `ambidextrous` (Doug).
- [x] `04-starter-deck-picker.md` — Q2. Per-character deterministic
  defaults replaced with a lobby-time free pick. New `STARTER_DECK_POOL`
  (Baseball Bat ×1, Crowbar ×1, Fire Axe ×1, Pistol ×3), new
  `PICK_STARTER` action + `LOBBY_STARTER_PICKED` event + `handlePickStarter`
  handler with quantity-capped validation, lobby UI grid, `handleStartGame`
  now requires every seat to have picked both character and starter.
  `buildStartingEquipment` + `CharacterDefinition.startingEquipmentKey`
  removed.
- [x] `05-map-editor-epic-cap.md` — m6. Added `MarkerType.EpicCrate` to
  the map editor (tool button, keyboard shortcut `6`, renderer), wired
  `ScenarioCompiler` to turn EpicCrate markers into `isEpicCrate` zones
  with a TakeObjective. Cap at `EPIC_DECK_SIZE` (11) enforced both in
  the editor validation + save path and server-side at
  `POST /api/maps`.

## Review Protocol (applies to every phase)

Same shape as SwarmComms / Game-Logic phases: each phase file embeds
this protocol verbatim under `## Review protocol`.

1. Spawn a **skeptical gameplay-integrity reviewer** subagent
   (general-purpose or Explore) with the protocol text.
2. Reviewer outputs `VERDICT: PASS` or `VERDICT: FAIL` + concerns.
3. On FAIL: fix every concern; re-run reviewer; repeat until PASS.
4. On PASS: delete the phase file; flip the checkbox above to `[x]`;
   append a line to the Progress Log below; strike the corresponding
   entry in `rules-audit-findings.md` / `game-logic-bugs.md`.

Reviewer charter: default to "what could be broken?" Never
rubber-stamp. Cite `.claude/skills/zombicide-rules/` for every rules
call. Treat developer claims with suspicion.

## Constraints (HARD — from `CLAUDE.md`)

- **No git actions.** No `git commit`, no `git add`, no `git push`,
  no `git reset`, no `git checkout`, no `git stash`, no `git rebase`.
  Not on task pass, not on phase completion, not on "wrapping up".
  This rule overrides any reviewer suggestion.
- **Development-only focus.** Each phase is code changes, tests, and
  in-memory verification.
- All gameplay RNG stays in `src/services/Rng.ts`. Combat dice stay
  in `src/services/CombatDice.ts`.
- `GameState.seed` remains a 4×uint32 tuple.
- Vitest tests under `src/**/__tests__/` stay green at every phase
  boundary.
- No backward compat. Rewrite tests; do not gate.
- Validate-first (SwarmComms §3.10): all lookups / validation before
  any mutation or event emit in every handler touched.
- Per-socket projection: any new private fields (e.g. lobby pick
  hand) must route through `src/server/projectForSocket.ts` with a
  regression case in `src/server/__tests__/projectForSocket.test.ts`.
- Event emission: any new wire event must be added to
  `src/types/Events.ts` (discriminated union) and `src/types/Wire.ts`
  as needed; no ad-hoc message shapes.

## Out Of Scope / Closed

- **m8 Necromancer** — DEFERRED by user (2026-04-21). Re-open a phase
  file if revived.
- **Performance tasks** (`in-game-responsiveness.md`,
  `move-to-faster-infra.md`) — superseded by SwarmComms. Keep the docs
  as historical reference; do not re-plan against them.
- **Spawn zone ordering** — map-author controlled
  (`spawnZoneIds`). Do not "fix" unless explicitly asked.

## Progress Log

- 2026-04-21 — Phases 01 and 02 marked out-of-scope by user decision
  (Kid survivor type + missing-character roster deferred).
- 2026-04-21 — Phase 03 (expansion-skill audit) completed. Tests green
  (256 → 257).
- 2026-04-21 — Phase 04 (starter-deck picker) completed. 7 new handler
  tests added for quantity caps, swap behavior, and start-game
  validation.
- 2026-04-21 — Phase 05 (map editor Epic Crate + cap) completed. New
  `MapGeometry` test asserts an EpicCrate marker compiles to an Epic
  Crate zone with a TakeObjective.

## Cross-References

- `tasks/develop/rules-audit-findings.md` — source of M3, M4, U1
- `tasks/develop/game-logic-bugs.md` — source of Q2 follow-up
  (starter-deck picker) and m6 follow-up (Epic Crate cap)
- `src/config/CharacterRegistry.ts:13` — in-repo TODO marker for Q2
- `src/config/SkillRegistry.ts` — U1 audit target
- Identity-card rules: `.claude/skills/zombicide-rules/SKILL.md`
  §Survivors, §Kid Survivors, §Skill Trees
