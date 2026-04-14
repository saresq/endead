# Plan 08: UI Polish — Board Visuals & Medium-Priority Playtest Fixes

**Priority**: Medium
**Source tasks**:
- `10-playtest-2026-04-14/dismiss-notification-placement.md`
- `10-playtest-2026-04-14/spawn-zone-naming.md`
- `10-playtest-2026-04-14/spawner-visual-upgrade.md`
- `10-playtest-2026-04-14/highlight-doors-on-action.md`
- `10-playtest-2026-04-14/map-editor-tile-preview.md`
- `08-ui-features/board-visuals.md`

**Why grouped**: All are visual/UI improvements with no gameplay logic changes. Independent of each other, can be done in any order. All touch rendering or CSS.

---

## Step 1: Quick CSS/Layout Fixes

### 1a. Dismiss Notification Placement
- Fix dismiss button positioning in notification component CSS
- Ensure top-right corner placement, test mobile + desktop

### 1b. Spawn Zone Naming
- Replace "Z_S_1" display with "Spawner 1" in board renderer, tooltips, history log
- Keep internal IDs unchanged

---

## Step 2: Board Renderer Visual Upgrades

### 2a. Spawner Visual Upgrade
- Dark red rectangle background instead of just an icon
- Bigger skull icon inside the rectangle
- Bigger spawn number text

### 2b. Zombie Initials on Circles
- Add W/R/B/A text labels on zombie entity circles
- Use PIXI.Text child centered in zombie container
- Use `BOARD_THEME.zombie.initialColor` / `initialFontSize`

### 2c. Searchable Zone Magnifying Glass
- Replace small white circle indicator with magnifying glass shape or more visible icon

---

## Step 3: Interactive UI Enhancements

### 3a. Highlight Doors on Door Action
- When player selects Door action, highlight openable doors
- Distinct highlight color (different from movement green)
- Only highlight doors player can open (adjacent, closed, has right equipment)

### 3b. Map Editor Tile Preview
- Add preview area in editor sidebar
- On tile selection, render tile image at thumbnail size (~150-200px)
- No zone overlays, just raw tile image

### 3c. Keyboard Drag-and-Drop Alternative
- Add keyboard alternative for equipment management (accessibility)

---

## Step 4: Validation

Spawn an agent to:
1. Read all 6 source task files
2. Check notification CSS for proper dismiss button placement
3. Grep for "Z_S_" display strings — verify renamed
4. Read board renderer — verify spawner visuals, zombie initials, magnifying glass
5. Check door highlight logic exists
6. Check map editor for tile preview
7. If fully resolved: delete all source task files and `08-ui-features/board-visuals.md`
8. If partially resolved: create a new task with remaining items
