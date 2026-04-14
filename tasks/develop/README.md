# Development Plans

**Created**: 2026-04-14
**Total plans**: 10 (covering all 18 source task files)

## Execution Order

Execute plans in order. Plans 01-02 are blockers. Plans 03-07 are the core work. Plans 08-10 are polish.

| # | Plan | Priority | Source Tasks | Depends On |
|---|------|----------|-------------|------------|
| 01 | [Critical Bugs](01-critical-bugs.md) | Critical | tile-image-loading, trading-drag-drop, weapon-loss | — |
| 02 | [Critical Game Rules](02-critical-game-rules.md) | Critical | tile-9r-crosswalk, building-spawn-card-draw | — |
| 03 | [Skill Bugs & Partials](03-skill-bugs-and-partials.md) | High | character-skills-audit (Phase 0+1) | — |
| 04 | [Skill Combat & Actions](04-skill-implementations-combat.md) | High | character-skills-audit (Phase 2+3) | 03 |
| 05 | [Skill Movement & Advanced](05-skill-implementations-advanced.md) | High | character-skills-audit (Phase 4+5), extra-ap | 03 |
| 06 | [Skill Visuals](06-skill-visuals.md) | High | character-skills-audit (Phase 6) | 03, 04, 05 |
| 07 | [Zombie Attack & History](07-zombie-attack-and-history.md) | High | zombie-attack-all-survivors, game-history | — |
| 08 | [UI Polish](08-ui-polish.md) | Medium | 6 UI tasks + board-visuals | — |
| 09 | [Spawn System Advanced](09-spawn-system-advanced.md) | Should Fix | spawn-fixes | 02 |
| 10 | [Client Infrastructure](10-client-infrastructure.md) | Should Fix | client-fixes, architecture-refactor | 01 (partial) |

## Parallelization

These can run in parallel (no dependencies between them):
- **01** + **02** + **03** + **07** + **08** (all independent)

Then:
- **04** + **05** after 03
- **06** after 03 + 04 + 05
- **09** after 02
- **10** after 01

## Validation Pattern

Every plan ends with a validation step:
1. Spawn an agent to read the original task file(s)
2. Verify fixes exist in the codebase via grep/read
3. If fully done: **delete the source task file**
4. If partially done: **create a new task file** with the remaining items
