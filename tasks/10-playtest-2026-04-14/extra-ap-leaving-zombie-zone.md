# Task: Implement Extra AP Cost for Leaving Zombie Zones

**Priority**: High  
**Status**: Open  
**Source**: Playtest 2026-04-14

## Rules Reference
Per Zombicide 2E rules: Moving out of a zone costs **+1 Action per Zombie** in the zone you're LEAVING. So if 5 zombies are in the zone, the survivor needs 6 Actions total to leave (1 base move + 5 extra).

Exception: Survivors with the **Slippery** skill ignore this cost entirely.

## Implementation Notes
- When calculating movement cost, count zombies in the departure zone
- Validate the survivor has enough remaining actions before allowing the move
- Show the extra cost in the UI (e.g., "Move (6 AP)" when 5 zombies present)
- Respect the Slippery skill — skip extra cost if survivor has it
- Check if this is already partially implemented and just buggy, or entirely missing
