# Plan 07: Zombie Attack Verification & Game History Improvements

**Priority**: High
**Source tasks**:
- `10-playtest-2026-04-14/zombie-attack-all-survivors.md`
- `10-playtest-2026-04-14/game-history-improvements.md`

**Why grouped**: Both relate to how game events are processed and communicated to players. Zombie attack wound distribution needs to be logged in history. History improvements will capture the output of combat changes.

---

## Step 1: Verify & Fix Zombie Wound Distribution

**Task file**: `zombie-attack-all-survivors.md`

1. Read zombie attack code in `ZombiePhaseManager.ts`
2. Confirm: all zombies in a zone with survivors DO attack (this is rules-correct)
3. Check if wound distribution choice is implemented (players should choose how to split wounds)
4. If missing: add UI prompt for wound assignment when multiple survivors are in a zone
5. Test: 4 zombies + 2 survivors in zone = 4 wounds, player chooses split

---

## Step 2: Game History Improvements

**Task file**: `game-history-improvements.md`

1. Find the history/turn log system (likely in game state or a dedicated manager)
2. Add turn separators: group entries by turn number and player name
3. Enhance combat entries: weapon used, dice rolled, accuracy threshold, hits/misses, damage dealt
4. Enhance movement entries: from zone -> to zone
5. Enhance search entries: what was found
6. Enhance door entries: which door, any spawns triggered
7. Enhance zombie phase entries: attacks, movements, wounds, spawn results

---

## Step 3: Validation

Spawn an agent to:
1. Read both source task files
2. Verify wound distribution UI exists and works per rules
3. Read history log output — verify turn separators, combat details, movement details
4. If fully resolved: delete both source task files
5. If partially resolved: create a new task with remaining items
