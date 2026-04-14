# Task: Add Tile Preview in Map Editor Sidebar

**Priority**: Medium  
**Status**: Open  
**Source**: Playtest 2026-04-14

## Problem
When selecting a tile in the map editor, there's no way to see what it looks like before placing it.

## Expected Behavior
- When a tile is selected in the sidebar tile list, show a preview of it
- Preview should be in the sidebar, not full-size
- Preview should show only the tile image — no room/street zone overlays
- Should be small enough to fit in the sidebar without disrupting the layout

## Implementation Notes
- Add a preview area in the editor sidebar (above or below the tile list)
- On tile selection, render the tile's image at a thumbnail size (~150-200px)
- No zone visualization needed, just the raw tile image
