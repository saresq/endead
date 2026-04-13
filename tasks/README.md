# Endead — Remaining Tasks

**Last updated:** 2026-04-13  
**Completed:** 23 of 27 task files (85+ items implemented)

## What's Left

```
tasks/
├── 02-zombie-phase/
│   └── spawn-fixes.md          ← Advanced spawn features (Abom rules, Rush, colored zones, overflow)
├── 08-ui-features/
│   └── board-visuals.md        ← Zombie initials, magnifying glass, keyboard drag alt
├── 09-code-quality/
│   ├── architecture-refactor.md ← ActionProcessor split, state cloning, StateDiff
│   └── client-fixes.md         ← innerHTML rerenders, animations, reconnection, rollback
└── README.md
```

## Priority

| Task | Priority | Items |
|------|----------|-------|
| 02-zombie-phase/spawn-fixes.md | Should Fix / Nice to Have | 4 features |
| 08-ui-features/board-visuals.md | Nice to Have | 3 items |
| 09-code-quality/architecture-refactor.md | Nice to Have | 3 items |
| 09-code-quality/client-fixes.md | Should Fix | 4 items |

## What Was Completed

- **Phase 0**: Fatty → Brute rename, connectedZones removal
- **Phase 1**: All game-breaking fixes (combat, zombie phase, movement/search, equipment, state bugs, game rules)
- **Phase 2**: UI cleanup (native dialogs, modals, console.logs, BoardTheme, EDITOR_THEME, TradeUI migration, tooltips, turn history, accessibility, ARIA, keyboard help)
- **Phase 3**: Content (6 characters, 25 skills, 40 spawn cards), code quality (typed payloads, destroy methods, dead code removal)
- **Spawn ordering**: Placement-order spawn with numbered labels in editor and game board
