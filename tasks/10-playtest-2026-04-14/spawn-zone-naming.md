# Task: Rename Spawn Zone Labels from "Z_S_1" to "Spawner 1"

**Priority**: Medium  
**Status**: Open  
**Source**: Playtest 2026-04-14

## Problem
Zombie spawn zones display internal IDs like "Z_S_1" instead of user-friendly names.

## Expected
Display as "Spawner 1", "Spawner 2", etc. since they are now numbered.

## Notes
- Check where spawn zone labels are rendered (board renderer, tooltips, history log)
- Update all display instances — keep internal IDs unchanged if needed for logic
