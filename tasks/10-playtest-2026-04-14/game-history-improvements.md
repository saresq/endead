# Task: Improve Game History / Turn Log

**Priority**: High  
**Status**: Open  
**Source**: Playtest 2026-04-14

## Problems
1. History is not separated by turns — all entries blend together
2. Not all information is displayed
3. Missing: whether a player hit or missed an attack
4. Missing: what dice result was needed to hit (accuracy threshold)
5. Missing: actual dice roll results

## Expected Behavior
- Group history entries by turn number and player
- Show clear turn separators (e.g., "--- Turn 3: Player Name ---")
- For attacks, show: weapon used, dice rolled, results, accuracy needed, hits/misses, targets hit, damage dealt
- For movement, show: from zone → to zone
- For search, show: what was found
- For door actions, show: which door opened, any spawns triggered
- For zombie phase, show: which zombies attacked/moved, wounds dealt, spawn results
