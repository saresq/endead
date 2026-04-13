# Task: Remaining Spawn System Features

**Priority**: Should Fix / Nice to Have  
**Status**: Core bugs fixed. These are remaining advanced features.

## Should Fix

### 1. Abomination Spawn Rules
- Max 1 Abomination active at a time (standard mode)
- Abomination Fest mode: unlimited Abominations
- When Abom card drawn and one exists: replace with extra activation of all Abominations

### 2. Zombie Rush Cards
- Add `rush` field to `SpawnDetail` type
- Rush cards spawn zombies AND trigger extra activation of that type
- Currently no rush support in spawn processing

### 3. Colored Spawn Zones (Blue/Green)
- Add `spawnColor?: 'blue' | 'green'` field to `Zone`
- Some spawn zones only activate at certain danger levels
- Map editor should allow setting spawn zone color

## Nice to Have

### 4. Zombie Overflow / Miniature Pool Exhaustion
- Track count of each zombie type on the board
- When pool exhausted: all zombies of that type get an extra activation instead
- Needs `zombiePool` config (e.g., 40 Walkers, 16 Runners, 8 Brutes, 1 Abomination)
