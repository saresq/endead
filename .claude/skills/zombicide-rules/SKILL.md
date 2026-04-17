---
name: zombicide-rules
description: Complete Zombicide 2nd Edition rules reference. Use when implementing game logic, fixing rules bugs, resolving combat/movement/spawning mechanics, checking equipment stats, validating turn structure, or understanding any game mechanic. This is the authoritative source for building a 1:1 digital Zombicide clone.
allowed-tools: Read Grep Glob
---

# Zombicide 2nd Edition - Rules Engine Reference

This skill contains ALL rules needed to implement a faithful Zombicide 2nd Edition web clone.
For the full detailed reference with missions and flavor text, see `RULEBOOK.md` in the project root.

---

## GAME STRUCTURE

### Round Flow (strict order)
1. **Player Phase** - Each player activates Survivors clockwise from First Player
2. **Zombie Phase** - Step 1: ALL Attacks, then ALL Moves. Step 2: Spawn
3. **End Phase** - Remove Noise tokens, pass First Player token left

### Player Turn
- Survivor gets **3 Actions** at Blue level, **4 Actions** at Yellow+ (the Yellow skill is always "+1 Action")
- Available Actions: Move, Search, Door, Reorganize/Trade, Melee Attack, Ranged Attack, Take Objective, Make Noise, Do Nothing
- Each Action type can be repeated unless restricted (Search is limited to 1/turn)

---

## ACTIONS REFERENCE

### Move
- Move 1 Zone to an adjacent Zone (shared edge, NO diagonals)
- Cannot move through walls or closed doors
- **Extra cost**: +1 Action per Zombie in the Zone you're LEAVING
- **Entering a Zone with Zombies ENDS the Move** (unless Slippery)
- Sprint: move 2-3 Zones but still stops on entering Zombie Zone

### Search
- **Building Zones only** (streets only with Scavenger skill)
- **No Zombies in Zone**
- Draw top card from Equipment deck; keep or discard immediately
- **Once per Turn** (even free Search Actions count toward this limit)
- When deck empty: reshuffle discards (exclude Starting Equipment)

### Door Action
- Use Door-opening Equipment (Fire Axe, Crowbar, Chainsaw) - no roll needed
- Opens the door permanently (cannot close doors)
- Place Noise token if Equipment is noisy
- **First time opening a building triggers Zombie spawn in all Dark Zones**

### Building Spawn (on first door open)
- Determine each Dark Zone in the building (all connected rooms via openings)
- Draw 1 Zombie card per Dark Zone (suggest processing farthest to closest)
- Use highest Danger Level among ALL Survivors
- Rush cards: place Zombies, they immediately Activate, then continue spawning
- Extra Activation cards: all Zombies of that type get extra Activation immediately
- Buildings open at game start are NEVER spawned in

### Reorganize/Trade (1 Action)
- Reorganize own inventory freely
- Trade with exactly 1 other Survivor in same Zone
- Trade can be unequal (everything for nothing is valid)
- Both Survivors can reorganize freely during trade

### Combat Actions
- **Melee Action**: Melee weapon in Hand, attack Zone 0 (your Zone)
- **Ranged Action**: Ranged weapon in Hand, attack Zone within Range and LOS
- Using Ranged weapon at Range 0 is still a Ranged Action

### Take/Activate Objective (1 Action)
- Take Objective token in your Zone
- Usually grants 5 AP
- Epic Weapon Crate: grants random Epic Weapon + free reorganize

### Make Noise (1 Action)
- Place Noise token in your Zone

### Do Nothing
- Ends Survivor's Turn; remaining Actions lost

---

## LINE OF SIGHT (LOS)

- **Street Zones**: Straight lines parallel to board edges. Extends until wall/closed door/board edge
- **Building Zones**: See all Zones sharing an opening. Limited to 1 Zone depth into buildings
- **Street to Building**: 1 Zone into the building
- **Building to Street**: Through any number of street Zones in a straight line
- **NO diagonal LOS ever**
- **Closed Doors block LOS**

---

## COMBAT RESOLUTION

### Melee
1. Roll dice = weapon's Dice value
2. Each die >= Accuracy = hit
3. Player freely assigns hits to targets in Zone
4. Each hit deals weapon's Damage to 1 target
5. **No Friendly Fire from Melee misses**

### Ranged
1. Roll dice = weapon's Dice value
2. Each die >= Accuracy = hit
3. Hits assigned by **Targeting Priority Order** (NOT player's choice):
   - Priority 1: Brute or Abomination (shooter picks between them)
   - Priority 2: Walker
   - Priority 3: Runner
4. Assign all hits to lowest priority until eliminated, then next
5. If targets share same priority, player chooses among them
6. **Misses cause Friendly Fire** to Survivors in target Zone

### Dual Weapons
- 2 identical Dual weapons in both Hands = use both with 1 Action
- Must target same Zone
- Each weapon rolls its own dice separately

### Damage Rules
- Each success = 1 hit at weapon's Damage value (damage does NOT stack)
- Walker/Runner: dies to Damage 1+
- Brute: dies to Damage 2+ (Damage 1 has NO effect regardless of hit count)
- Abomination: dies to Damage 3+ OR Molotov
- **Minimum Accuracy is always 2+** (no matter how many bonuses stack)

### Friendly Fire (Ranged Only)
- When shooting at Zone with teammates: misses hit Survivors
- Assign Friendly Fire hits in any way player wants
- Damage applies normally (Damage 2 = 2 Wounds)
- Cannot hit yourself
- Only MISSES hit Survivors (successes that overkill don't cause FF)

### Molotov (Special Ranged Action)
- Equip in Hand, perform Ranged Action (Range 0-1), discard card
- KILLS ALL ACTORS in target Zone (including Survivors, including Abominations)
- Thrower earns all AP
- No dice roll needed (auto-hit)

---

## ZOMBIE PHASE

### Step 1: Activation (strict order: ALL Attacks first, then ALL Moves)

**Attack:**
- Each Zombie in Zone with Survivors attacks (auto-hit, 1 Wound each)
- Players choose how to distribute Wounds among Survivors in the Zone
- Survivor eliminated at 0 Health = game lost

**Move:**
- Zombies NOT in Zone with Survivors move 1 Zone toward target
- Target priority:
  1. Zone with Survivors in LOS with most Noise (each Survivor = 1 Noise)
  2. If no Survivors visible: noisiest Zone on board
  3. Distance doesn't matter
- Move via shortest path. If no open path: don't move
- **Splitting**: Equal routes = split evenly by type. Players choose remainders

**Runners:**
- Get 2 Actions per Activation
- After ALL Zombies (including Runners) do their 1st Action, Runners do their 2nd
- Can: attack twice, attack+move, move+attack, or move twice

### Step 2: Spawn
1. **Starting Spawn Zone always goes first**
2. Proceed clockwise through remaining active Spawn Zones
3. Draw 1 Zombie card per Spawn Zone
4. Read line matching highest Danger Level among ANY Survivor
5. Place indicated Zombies in the Spawn Zone

**Colored Spawn Zones**: Blue/Green don't spawn until activated (usually by taking matching Objective). Start spawning on NEXT Zombie Phase after activation.

> **Endead implementation note — spawn zone ordering.** Spawn order follows the
> **placement order defined by the map author** in the map editor
> (`spawnZoneIds`). This is an intentional design decision: mappers place spawn
> zones in the correct Starting-first-then-clockwise sequence, so the engine
> does not need to compute clockwise geometry. **Never change or "fix" the
> engine to auto-detect clockwise order or add a separate starting-spawn flag
> unless the user explicitly asks for it.**

**Zombie Rush cards**: Place Zombies normally, then those Zombies immediately Activate.
**Extra Activation cards**: No spawn. All Zombies of indicated type get extra Activation. NO EFFECT at Blue Level.
**Out of miniatures**: Place what you can, then ALL Zombies of that type get extra Activation.
**Deck empty**: Reshuffle all discarded Zombie cards.

---

## ZOMBIES

| Type | Damage to Kill | Actions | AP Reward | Targeting Priority |
|---|---|---|---|---|
| Walker | 1 | 1 | 1 | 2 |
| Brute | 2 | 1 | 1 | 1 (tied with Abom) |
| Runner | 1 | 2 | 1 | 3 |
| Abomination | 3 or Molotov | 1 | 5 | 1 (tied with Brute) |

**Abomination special rules (two modes — support both as game setting):**
- **Standard mode**: Max 1 on board. Spawn card drawn when one exists = extra Activation for existing one (no new spawn)
- **Abomination Fest mode**: Multiple allowed. Spawn card drawn when one exists = all Abominations get extra Activation, THEN a new one is placed. Players can set a max count.
- Both modes require extra Activation trigger on duplicate spawn card
- 4 variants: Patient 0 (no special), Hobomination (no combat in its Zone), Abominacop (first in targeting), Abominawild (Molotov only kills it, not other Actors)

**Miniature counts:** 40 Walkers, 16 Brutes, 16 Runners, 4 Abominations

---

## DANGER LEVELS & ADRENALINE

| Level | AP Threshold | Skill |
|---|---|---|
| Blue | 0 | 1 fixed Skill |
| Yellow | 7 | +1 Action (always) |
| Orange | 19 | Pick 1 of 2 |
| Red | 43 | Pick 1 of 3 |

- AP earned: 1 per Zombie kill, 5 per Objective (usually)
- Global Danger = max Danger Level of ANY Survivor (affects spawning)
- Skills take effect immediately when acquired
- Skills stack (you keep all previously earned)

---

## INVENTORY

5 slots per Survivor:
- **Hand 1, Hand 2**: Items here can be used
- **Backpack 1, 2, 3**: Storage only (exception: "May be used in Backpack" items)
- Cards can be discarded at any time for free (even during other players' turns)

---

## EQUIPMENT STATS (STARTING)

| Weapon | Type | Range | Dice | Acc | Dmg | Noise | Door | Dual | Count |
|---|---|---|---|---|---|---|---|---|---|
| Baseball Bat | Melee | 0 | 2 | 4+ | 1 | Silent | No | No | 1 |
| Crowbar | Melee | 0 | 1 | 4+ | 1 | Silent | Yes* | No | 1 |
| Fire Axe | Melee | 0 | 1 | 4+ | 2 | Silent | Yes* | No | 1 |
| Pistol | Ranged | 0-1 | 1 | 4+ | 1 | Noisy | No | Yes | 3 |

*Door-opening is Noisy even if combat is Silent

## EQUIPMENT STATS (STANDARD DECK - 45 cards)

| Equipment | Type | Range | Dice | Acc | Dmg | Noise | Door | Dual | Special | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| Aaahh!! | - | - | - | - | - | - | - | - | Spawns Walker | 4 |
| Bag of Rice | Food | - | - | - | - | - | - | - | 1 AP | 2 |
| Canned Food | Food | - | - | - | - | - | - | - | 1 AP | 2 |
| Chainsaw | Melee | 0 | 5 | 5+ | 2 | Noisy | Yes | No | - | 2 |
| Crowbar | Melee | 0 | 1 | 4+ | 1 | Silent | Yes* | No | - | 1 |
| Fire Axe | Melee | 0 | 1 | 4+ | 2 | Silent | Yes* | No | - | 1 |
| Flashlight | Util | - | - | - | - | - | - | - | Search: 2 cards (Backpack OK) | 2 |
| Katana | Melee | 0 | 1 | 4+ | 2 | Silent | No | Yes | - | 2 |
| Kukri | Melee | 0 | 1 | 4+ | 1 | Silent | No | Yes | - | 2 |
| Machete | Melee | 0 | 1 | 4+ | 1 | Silent | No | Yes | - | 4 |
| Molotov | Ranged | 0-1 | - | Auto | All | Noisy | No | No | Kills everything, discard after use | 4 |
| Pistol | Ranged | 0-1 | 1 | 4+ | 1 | Noisy | No | Yes | Bullets | 1 |
| Plenty of Bullets | Util | - | - | - | - | - | - | - | Re-roll (Bullets). Backpack OK | 3 |
| Plenty of Shells | Util | - | - | - | - | - | - | - | Re-roll (Shells). Backpack OK | 3 |
| Sawed-Off | Ranged | 0-1 | 2 | 4+ | 1 | Noisy | No | No | Shells, Reload | 4 |
| Shotgun | Ranged | 0-1 | 2 | 4+ | 2 | Noisy | No | No | Shells | 2 |
| Sniper Rifle | Ranged | 1-3 | 1 | 2+ | 2 | Noisy | No | No | Bullets, Sniper skill | 2 |
| Sub-MG | Ranged | 0-1 | 3 | 5+ | 1 | Noisy | No | Yes | Bullets | 2 |
| Water | Food | - | - | - | - | - | - | - | 1 AP | 2 |

## EPIC WEAPONS (11 cards)

| Weapon | Type | Range | Dice | Acc | Dmg | Dual | Special | Count |
|---|---|---|---|---|---|---|---|---|
| Aaahh! | - | - | - | - | - | - | Spawns Walker | 2 |
| Army Sniper Rifle | Ranged | 1-3 | 1 | 2+ | 3 | No | Bullets, Sniper | 1 |
| Automatic Shotgun | Ranged | 0-1 | 3 | 4+ | 2 | No | Shells | 1 |
| Evil Twins | Ranged | 0-1 | 2 | 3+ | 1 | Yes | Bullets | 1 |
| Golden AK-47 | Ranged | 0-2 | 3 | 4+ | 1 | No | Bullets | 1 |
| Golden Kukri | Melee | 0 | 2 | 3+ | 2 | Yes | - | 1 |
| Gunblade | Both | 0-1 | 2 | 4+ | 2 | No | Bullets | 1 |
| Ma's Shotgun | Ranged | 0-1 | 3 | 4+ | 2 | No | Shells, Reload | 1 |
| Nailbat | Melee | 0 | 2 | 3+ | 2 | No | - | 1 |
| Zantetsuken | Melee | 0 | 2 | 4+ | 3 | No | - | 1 |

---

## SKILLS (Implementation Reference)

### Stat Modifiers
- **+1 Action**: Extra Action per Turn
- **+1 Damage: [Melee/Ranged/Combat]**: +1 to Damage value for that Action type
- **+1 die: [Melee/Ranged/Combat]**: +1 die per weapon. Dual weapons each get +1 (so +2 total)
- **+1 free [Move/Search/Combat/Melee/Ranged] Action**: 1 extra free Action of that type only
- **+1 max Range**: Ranged weapon max Range +1
- **+1 Zone per Move**: Move 1 or 2 Zones per Move Action. Zombie Zone still ends move
- **+1 to dice roll: [Type]**: +1 to each die result. Max result always 6

### Combat Skills
- **Lucky**: Re-roll ALL dice once per Action. New result replaces old. Stacks with equipment re-rolls
- **Sniper**: Freely choose Ranged targets (ignores Priority). No Friendly Fire
- **Steady hand**: Ignore chosen Survivors for FF (not Molotov)
- **Point-blank**: Ranged at Range 0 ignoring min Range. At Range 0: free target choice + no FF
- **Super strength**: All Melee weapons = Damage 3
- **[Type]: Damage 2**: Damage 1 weapons of type become Damage 2

### Movement Skills
- **Slippery**: No extra Actions leaving Zombie Zones. Ignore Zombies during Move Actions
- **Sprint**: Once/Turn, Move 2-3 Zones. Zombie Zone still ends move
- **Charge**: Once/Turn, free: Move up to 2 Zones to Zone with Zombie

### Utility Skills
- **Tough**: Ignore first Wound per Attack Step and per Friendly Fire instance
- **Scavenger** (search_anywhere): Search in any Zone type (streets too)
- **Can Search more than once**: Multiple Searches per Turn
- **Search: 2 cards**: Draw 2 cards per Search
- **Born leader**: Give 1 free Action to another Survivor during your Turn

### Survivor Types
- **Classic**: Health 3 (eliminated at 0)
- **Kid**: Health 2, can use Slippery once per Turn with single Move Action

---

## NOISE SYSTEM

- Noisy Actions produce 1 Noise token in the Survivor's Zone
- 1 Action = max 1 Noise token (regardless of dice/hits/Dual)
- Each Survivor miniature = permanent Noise source (counts as 1 Noise)
- Noise tokens removed during End Phase
- Zombies move toward noisiest target (LOS Survivors > noisiest Zone)

---

## CHARACTERS (12 in core box)

Josh, Lili, Doug, Tiger Sam (Kid), Elle, Odin, Amy, Bunny G (Kid), Ned, Lou, Wanda, Ostara

Each has unique Skill tree: Blue (fixed), Yellow (+1 Action always), Orange (pick 1/2), Red (pick 1/3)

---

## CRITICAL IMPLEMENTATION NOTES

1. **State immutability**: Clone state before each action handler modifies it
2. **Deterministic RNG**: Seeded PRNG ensures replay capability
3. **Zombie activation order**: ALL Attacks resolved before ANY Moves
4. **Runner second actions**: After ALL first actions (including other Runners), then Runners do second
5. **Spawn order**: Starting Spawn Zone ALWAYS first, then clockwise. **In Endead, this sequence is set by the map author's placement order in the editor (`spawnZoneIds`) — do NOT modify the engine to auto-detect or re-order unless explicitly asked.**
6. **Danger Level for spawning**: Use the HIGHEST among ALL living Survivors
7. **Dead Survivors**: Should NOT count toward Danger Level calculation
8. **Spawn discard**: Used Zombie cards go to discard pile (reshuffle when empty)
9. **Targeting Priority is Ranged-only**: Melee hits are freely assigned by player
10. **Brutes shield lower-priority zombies**: First in priority AND immune to Dmg 1
11. **Search once per turn**: Even free Search Actions count toward the 1/turn limit
12. **Minimum Accuracy 2+**: No amount of bonuses can make Accuracy better than 2+
13. **Doors cannot be closed**: Once open, permanently open
14. **Out of miniatures = extra activation**: Critical for game balance
15. **Abomination spawn modes**: Standard = max 1 (second spawn = extra Activation only). Abomination Fest = multiple allowed (extra Activation THEN spawn new). Support both as game setting
