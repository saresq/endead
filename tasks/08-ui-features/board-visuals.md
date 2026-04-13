# Task: Remaining Board Visual Polish

**Priority**: Nice to Have  
**Status**: Most visuals done (BoardTheme, spawn numbering, noise triangles, tooltips, skull icons). These remain.

## 1. Zombie Initials on Circles
- Add W/R/B/A text labels on zombie entity circles
- `ZombieTypeConfig` already has `initial` field
- Use PIXI.Text child centered in zombie container
- Use `BOARD_THEME.zombie.initialColor` / `initialFontSize`

## 2. Searchable Zone Magnifying Glass
- Current indicator is a small white circle
- Replace with magnifying glass shape or more visible icon
- Position at zone centroid

## 3. Keyboard Drag-and-Drop Alternative
- Equipment management requires mouse drag
- Add keyboard alternative for accessibility
