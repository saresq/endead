# Plan 09: Advanced Spawn System Features

**Priority**: Should Fix / Nice to Have
**Source tasks**:
- `02-zombie-phase/spawn-fixes.md`

**Why separate**: These are advanced spawn features that are not blocking playtesting. They add depth to the game but can wait until critical issues are resolved.

---

## Step 1: Abomination Spawn Rules (Should Fix)

1. Read spawn processing code
2. Track active Abomination count on the board
3. Standard mode: max 1 Abomination active
4. When Abom card drawn and one exists: replace with extra activation of all Abominations
5. Add Abomination Fest mode toggle: unlimited Abominations

---

## Step 2: Zombie Rush Cards (Should Fix)

1. Add `rush` field to `SpawnDetail` type
2. Rush cards: spawn zombies AND trigger extra activation of that type
3. Implement rush processing in spawn card resolution

---

## Step 3: Colored Spawn Zones (Nice to Have)

1. Add `spawnColor?: 'blue' | 'green'` field to Zone type
2. Colored zones only activate at certain danger levels
3. Add color setting to map editor for spawn zones

---

## Step 4: Zombie Overflow / Pool Exhaustion (Nice to Have)

1. Add `zombiePool` config (40 Walkers, 16 Runners, 8 Brutes, 1 Abomination)
2. Track count of each zombie type on the board
3. When pool exhausted: all zombies of that type get extra activation instead

---

## Step 5: Validation

Spawn an agent to:
1. Read `02-zombie-phase/spawn-fixes.md`
2. Verify Abomination spawn rules in spawn processing code
3. Check for rush field in SpawnDetail type
4. Check Zone type for spawnColor field
5. Check zombie pool tracking logic
6. If fully resolved: delete `02-zombie-phase/spawn-fixes.md`
7. If partially resolved: create a new task with remaining items
