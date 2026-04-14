# Task: Highlight Available Doors When Door Action Selected

**Priority**: Medium  
**Status**: Open  
**Source**: Playtest 2026-04-14

## Problem
Currently, available movement tiles are highlighted in green when a player selects the move action. But when a player selects the "open door" action, no doors are highlighted.

## Expected Behavior
- When player selects the Door action, highlight all doors that can be opened
- Use a distinct highlight color (different from movement green)
- Only highlight doors the player can actually open (adjacent, closed, and player has door-opening equipment: Fire Axe, Crowbar, or Chainsaw)
- Clicking a highlighted door should open it

## Reference
Similar to how movement zones are highlighted in green — apply the same UX pattern to doors.
