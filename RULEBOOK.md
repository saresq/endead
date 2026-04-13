# Zombicide 2nd Edition - Complete Rules Reference

Extracted from the official Zombicide 2nd Edition Rules & Missions rulebook (CMON, 2020).
This document is the authoritative reference for building a 1:1 digital clone.

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Setup](#2-setup)
3. [The Basics](#3-the-basics)
4. [Equipment Cards](#4-equipment-cards)
5. [Adrenaline, Danger Levels & Skills](#5-adrenaline-danger-levels--skills)
6. [Inventory](#6-inventory)
7. [The Zombies](#7-the-zombies)
8. [Player Phase](#8-player-phase)
9. [Zombie Phase](#9-zombie-phase)
10. [Combat](#10-combat)
11. [Equipment Traits](#11-equipment-traits)
12. [Skills Reference](#12-skills-reference)
13. [Characters](#13-characters)
14. [Equipment Registry](#14-equipment-registry)
15. [Spawn Cards](#15-spawn-cards)
16. [Additional Game Modes](#16-additional-game-modes)
17. [Missions](#17-missions)

---

## 1. Game Overview

Zombicide is a cooperative game where 1-6 players control Survivors battling Zombies controlled by the game itself. All players win or lose together.

### Game Round Structure

Each round proceeds through 3 phases in order:

#### Phase 1: Player Phase
- The player with the First Player token activates their Survivors one at a time, in any order
- Each Survivor can perform **3 Actions** at Blue Danger Level (more with skills)
- When a player finishes all their Survivors, the player to their left takes their turn
- Continue clockwise until all players have played

#### Phase 2: Zombie Phase
- **Step 1 - Activation**: All Zombies activate. Resolve ALL Attacks first, then ALL Moves
  - Zombies in a Zone with Survivors: Attack
  - Zombies not in a Zone with Survivors: Move toward Survivors
  - Runners get 2 Actions (all other zombies get 1)
- **Step 2 - Spawn**: Draw a Zombie card for each active Spawn Zone
  - Always start with the Starting Spawn Zone
  - Then proceed clockwise through remaining Spawn Zones

#### Phase 3: End Phase
- Remove ALL Noise tokens from the board
- Pass the First Player token to the player on the left
- A new Game Round begins

### Winning and Losing
- **Win**: All Mission objectives accomplished
- **Lose**: Any Survivor is eliminated, OR Mission objectives can no longer be fulfilled, OR a Mission-specific losing condition is met

---

## 2. Setup

1. Choose a Mission
2. Place tiles as shown in the Mission map
3. Place Spawn Zones, tokens, and miniatures as indicated
4. Select Survivors (always 6 total), distribute among players
5. Each Survivor gets a Dashboard with their ID Card, a colored base, and 5 trackers
6. Prepare card decks (shuffle separately):
   - **Starting Equipment** (grey backs)
   - **Equipment** (blue backs)
   - **Epic Weapons** (red backs)
   - **Zombies** (yellow backs)
   - **Abominations** (separate small deck)
7. Deal Starting Equipment randomly and as evenly as possible among Survivors
8. Place Survivor miniatures in the Starting Zone
9. Set Dashboard: Adrenaline arrow on 0 (Blue), Wound tracker on starting Health, Skill tracker on Blue Skill, 3 trackers in reserve
10. The player with the **Fire Axe** as Starting Equipment is the first player

### Survivor Types
- **Classic Survivors**: Start with Health 3 (3 Wounds to eliminate)
- **Kids**: Start with Health 2 (2 Wounds to eliminate), can use Slippery Skill once per Turn with a single Move Action

### Tile Features
- Tiles predefine places for Epic Weapon Crates and Objective tokens
- Closed doors are already drawn on buildings
- Open Objective crates and Epic Weapon Crate positions are marked on tiles

---

## 3. The Basics

### Definitions
- **Actor**: A Survivor or Zombie
- **Zone**: Inside a building = a room. On a street = area between linear markings/walls/board edges
- Buildings can straddle multiple tiles
- Street Zones can straddle multiple tiles

### Line of Sight (LOS)

**Street Zones:**
- Actors see in straight lines parallel to board edges
- **No diagonal LOS** - ever
- LOS extends until hitting a wall, closed door, or board edge
- Can see through any number of street Zones in a straight line

**Building Zones:**
- An Actor sees into all Zones that share an opening with their current room
- LOS is limited to **1 Zone** into a building
- If looking FROM a building Zone OUT to street Zones: LOS can go through any number of street Zones in a straight line
- If looking FROM a street Zone INTO a building: LOS goes only 1 Zone into the building

**Key Rules:**
- Closed Doors block LOS
- Walls block LOS
- No diagonal LOS exists in Zombicide

### Movement

- Actors move from one Zone to an adjacent Zone (sharing an edge, NOT corners)
- **No diagonal movement**
- Must go through an open door/opening to move between building and street Zones
- In buildings, Zones must be linked by an opening (open door)
- Position of miniature within a Zone doesn't matter - only Zone connectivity

---

## 4. Equipment Cards

### Weapon Types
- **Melee weapons**: Have Range 0 only. Used with Melee Actions. (Baseball Bat, Crowbar, Fire Axe, Katana, Kukri, Machete, Chainsaw)
- **Ranged weapons**: Have Range 0-N. Used with Ranged Actions. Even at Range 0, it's still a Ranged Action. (Pistol, Shotgun, Sawed-Off, Sub-MG, Sniper Rifle)

### Combat Characteristics
- **Dice**: Number of dice rolled when attacking
- **Accuracy**: Each die result >= this value is a success. **Minimum Accuracy is always 2+** no matter how effects stack
- **Damage**: Damage inflicted per success. Damage does NOT stack with multiple successes (each success = separate hit at stated Damage)
- **Range** [min-max]: Min and max Zones the weapon can reach. 0 = Survivor's own Zone only

### Ammo Types
- **Bullets**: Small-caliber. Can use "Plenty of Bullets" card for re-rolls
- **Shells**: Higher-caliber. Can use "Plenty of Shells" card for re-rolls

### Door-Opening Equipment
- Equipment with the door symbol can open doors
- Crowbar, Fire Axe, and Chainsaw can both open doors AND kill Zombies

### Noise
- Each Action used to attack or open a door with **noisy** Equipment produces 1 Noise token
- A single Action produces only 1 Noise token (regardless of dice, hits, or Dual weapons)
- Noise token is placed in the Zone where the Action was resolved
- Noise tokens stay in their Zone (don't follow the Survivor)
- Noise tokens are removed during End Phase
- **Each Survivor miniature also counts as a Noise token** (permanent, always)

### Dual Weapons
- If a Survivor has 2 identical weapons with the Dual symbol in each Hand slot, they may use both with a single Action
- Both weapons must be aimed at the same Zone
- Each weapon rolls its own dice (so 2 Pistols = 2 dice total with 1 Action)

---

## 5. Adrenaline, Danger Levels & Skills

### Adrenaline Points (AP)
- For each Zombie eliminated, the eliminating Survivor gains **1 AP**
- Objectives typically grant **5 AP**
- Food cards and other features may grant additional AP

### Danger Levels & Thresholds

| Danger Level | AP Threshold | Skill Gained | Actions Available |
|---|---|---|---|
| **Blue** | 0 | 1 starting Skill (fixed) | 3 Actions |
| **Yellow** | 7 | +1 Action (4th Action) | 4 Actions |
| **Orange** | 19 | Choose 1 of 2 Skills | 4 Actions |
| **Red** | 43 | Choose 1 of 3 Skills | 4 Actions |

### Global Danger Level
- When spawning Zombies, read the line corresponding to the **highest Danger Level achieved by ANY Survivor**
- The stronger the best Survivor is, the more Zombies appear for everyone

### Skill Acquisition
- Skills stack across Danger Levels (you keep all previously earned Skills)
- Blue: Fixed Skill (predetermined on ID Card)
- Yellow: Always "+1 Action"
- Orange: Player chooses 1 of 2 options shown on ID Card
- Red: Player chooses 1 of 3 options shown on ID Card
- New Skills take effect immediately (can be used in the same Turn they're acquired)

---

## 6. Inventory

Each Survivor carries up to **5 Equipment cards**:

| Slot | Count | Usage |
|---|---|---|
| **Hand** | 2 slots | Weapons and items here can be used normally |
| **Backpack** | 3 slots | Items stored here CANNOT be used (except cards marked "May be used in the Backpack") |

### Inventory Rules
- Players may discard cards from inventory to make room **at any time, for free** (even during another player's Turn)
- Reorganizing inventory (moving cards between slots) is a free action during a Reorganize/Trade Action
- Items must be in a Hand slot to be used in combat (exception: "May be used in the Backpack" cards like Plenty of Bullets/Shells)

---

## 7. The Zombies

Zombicide features 4 types of Zombies:

### Zombie Types

| Type | Wounds Dealt | Damage to Kill | Adrenaline Reward | Actions | Special |
|---|---|---|---|---|---|
| **Walker** | 1 | 1 | 1 | 1 | None |
| **Brute** | 1 | 2 | 1 | 1 | Immune to Damage 1 weapons |
| **Runner** | 1 | 1 | 1 | **2** | Gets 2 Actions per Activation |
| **Abomination** | 1 | 3 (or Molotov) | 5 | 1 | Only Damage 3+ or Molotov can kill |

### Miniature Counts (Base Game)
- 40 Walkers (10 sculpts x 4 each)
- 16 Brutes (4 sculpts x 4 each)
- 16 Runners (4 sculpts x 4 each)
- 4 Abominations (4 unique sculpts)

### Brute Details
- Weapons dealing only 1 Damage can't hurt them **at all**
- No matter how many times hit with Damage 1, they are unaffected
- First in Targeting Priority Order (tied with Abomination - shooter chooses)

### Abomination Details
- Only weapons dealing 3+ Damage can kill them (no base weapon in core box does this naturally)
- Damage 3 can be reached via Skills (+1 Damage) or Mission special rules
- A Molotov **always** kills an Abomination (kills everything in the Zone)
- Only 1 Abomination can be on the board at a time (in standard rules)
- If a spawn card calls for an Abomination when one is already on the board: the existing Abomination gets an **extra Activation** instead

### Abomination Variants (4 in core box)
1. **Patient 0**: No special rules (good for teaching)
2. **Hobomination**: Survivors in its Zone cannot perform Combat Actions
3. **Abominacop**: Goes first in Targeting Priority Order
4. **Abominawild**: Molotov effects in its Zone only kill the Abominawild (other Actors unaffected)

### Zombie Rush
- Some Zombie cards have the "Rush" keyword
- Zombies placed by a Rush card immediately perform a free Activation after being placed
- Runners do NOT have Rush cards

### Extra Activation Cards
- When drawn, no Zombies spawn. Instead, ALL Zombies of the indicated type immediately perform an extra Activation
- These cards have **no effect at Blue Danger Level**

### Running Out of Miniatures
- When required to place a Zombie type but no miniatures are available:
  1. Place remaining miniatures (if any)
  2. ALL Zombies of that type immediately get an extra Activation
- Multiple extra Activations can occur in a row

---

## 8. Player Phase

Starting with the First Player token holder, each player activates their Survivors one at a time. Each Survivor can perform up to 3 Actions (at Blue level). Available Actions:

### Move
- Move from current Zone to an adjacent Zone
- **Cannot move through walls or closed doors**
- **Extra Action cost**: Spend 1 additional Action per Zombie in the Zone you're LEAVING
- **Entering a Zone with Zombies ends the Move Action** (unless you have the Slippery Skill)
- Kids can use Slippery once per Turn

**Sprint Interaction**: If using Sprint (move up to 3 Zones), entering a Zone with Zombies still ends the move immediately.

### Search
- **Building Zones only** (not streets, unless you have Scavenger Skill)
- **No Zombies** can be in the Zone
- Draw the top card from the Equipment deck
- Either place it in inventory (reorganize for free) or immediately discard it
- **Once per Turn** - A Survivor can only perform a single Search Action per Turn (even if it's a free Action)
- When Equipment deck runs out: reshuffle discarded cards (excluding Starting Equipment) to form a new deck

### Door Action
- Use Door-opening Equipment to open a door in the Survivor's Zone
- **No roll required** - automatic success
- Place a Door token on its open side (or flip a closed Door token)
- Place Noise token if Equipment is noisy
- **Open Doors cannot be closed again**
- Some Missions have colored doors requiring specific conditions to open

### Spawning in Buildings
- Opening a building for the **first time** reveals all Zombies waiting inside
- A building = all rooms connected by openings (can straddle tiles)
- Determine each **Dark Zone** of the building, one at a time (suggest farthest to closest)
- Draw a Zombie card for each Dark Zone
- Place Zombies according to the highest Danger Level among any Survivor
- Rush cards during building spawning: place Zombies, they immediately Activate, then continue spawning
- Extra Activation cards during building spawning: all Zombies of that type on the board immediately Activate
- **Buildings open at start of game are never spawned in**
- **Buildings with Survivors at start are never spawned in** (Companions don't count)

### Reorganize/Trade
- Reorganize: Move cards between your own slots freely
- Trade: Exchange any number of cards with **1 (and only 1)** other Survivor in the same Zone
  - The other Survivor can reorganize their inventory for free
  - Trade doesn't have to be equal (can give everything for nothing)

### Combat Actions
- **Melee Action**: Use a Melee weapon in Hand to attack Zombies in your Zone
- **Ranged Action**: Use a Ranged weapon in Hand to fire at a Zone within Range and LOS
  - Survivors shoot at **Zones**, not specific Actors
  - Using a Ranged weapon at Range 0 is still a Ranged Action

### Take or Activate an Objective
- Take an Objective token or activate it in the Survivor's Zone
- Each Objective typically gives **5 AP**
- Epic Weapon Crates: Take the token, immediately gain a random Epic Weapon, reorganize inventory for free

### Make Noise
- Place a Noise token in the Survivor's Zone (costs 1 Action)

### Do Nothing
- Prematurely ends the Survivor's Turn
- All remaining Actions are lost

---

## 9. Zombie Phase

### Step 1: Activation

All Zombies activate. **Resolve ALL Attacks first, then ALL Moves.**

#### Attack
- Each Zombie in the same Zone as Survivors performs an Attack
- Zombie Attacks are **always successful** - no die rolls needed
- Each Zombie Attack deals **1 Wound**
- Survivors in the same Zone **split the Wounds** in any way the players prefer
- A Survivor is eliminated when their Wound Bar reaches 0 (3 Wounds for Classic, 2 for Kids)
- When a Survivor is eliminated, the game is **lost**

#### Move
- Zombies that did NOT Attack use their Action to Move 1 Zone toward Survivors
- **Target Selection Priority**:
  1. Zone with Survivors in LOS that has the **most Noise** (each Survivor = 1 Noise token). LOS targets take priority
  2. If no Survivors visible: the **noisiest Zone** on the board
  3. Distance doesn't matter - always go for noisiest target

- **Movement**: Move 1 Zone toward destination via **shortest available path**
- If no open path exists to destination: Zombies don't move

#### Splitting
- If there are multiple routes of the same length: Zombies split into **equal groups separated by type**
- Uneven groups: players decide which split group gets the extra Zombie and which direction
- Single Zombie with multiple routes: players choose direction

#### Runners
- Runners have **2 Actions** per Activation
- After ALL Zombies (including Runners) resolve their first Action, Runners resolve their second Action
- Second Action: Attack if in a Zone with Survivors, otherwise Move
- Can attack twice, attack+move, move+attack, or move twice

### Step 2: Spawn
- Draw a Zombie card for each active Spawn Zone
- **Starting Spawn Zone always goes first**
- Then clockwise through remaining Spawn Zones
- Read the line corresponding to the **highest Danger Level** among ANY Survivor
- Place indicated Zombies in the Spawn Zone
- When Zombie deck runs out: reshuffle all discarded Zombie cards

#### Colored Spawn Zones
- Blue/Green Spawn Zones don't spawn until activated (usually by taking a matching Objective)
- When activated, they start spawning on the **next** Zombie Phase (not immediately)

---

## 10. Combat

### Melee Action
- Must have a Melee weapon equipped in Hand
- Attack Zombies in the Survivor's Zone (Range 0)
- Roll dice equal to the weapon's Dice value
- Each die >= Accuracy = successful hit
- Player divides hits freely among targets in the Zone
- **Missed Melee strikes CANNOT cause Friendly Fire**

### Ranged Action
- Must have a Ranged weapon equipped in Hand
- Shoot at a single Zone within Range and LOS
- Ignore Actors in Zones between shooter and target Zone (can shoot through occupied Zones)
- Can shoot at another Zone even while Zombies are in your Zone
- Roll dice equal to weapon's Dice value
- Each die >= Accuracy = successful hit

### Dual Weapons
- If Survivor has 2 identical weapons with Dual symbol in both Hands, use both with 1 Action
- Must aim at the same Zone
- Each weapon rolls its own dice

### Damage Resolution
- Each hit inflicts the weapon's Damage value to a **single target**
- If all targets eliminated, extra hits are lost
- Damage does NOT stack (each success is a separate hit)
- Walkers/Runners: killed by Damage 1+
- Brutes: killed by Damage 2+ (Damage 1 has NO effect, no matter how many hits)
- Abominations: killed by Damage 3+ (or Molotov)

### Targeting Priority Order (Ranged Only)
When using a Ranged weapon, the shooter does **NOT** choose targets. Hits are assigned by priority:

| Priority | Zombie Type |
|---|---|
| 1 | Brute or Abomination (shooter chooses between them) |
| 2 | Walker |
| 3 | Runner |

- Assign all hits to the lowest priority level until all eliminated, then move to next level
- If multiple targets share the same priority, **players choose** which ones are hit
- **Targeting Priority does NOT apply to Melee Actions** (player freely assigns Melee hits)

**Critical Implication**: Brutes are first in priority AND immune to Damage 1. They effectively **shield** Walkers and Runners from Damage 1 Ranged weapons.

### Friendly Fire
- **Only applies to Ranged Actions** (never Melee)
- When shooting at a Zone containing a teammate: **misses** automatically hit Survivors in the target Zone
- Assign Friendly Fire hits in any way the player wants
- Damage applies normally (Damage 2 weapons inflict 2 Wounds)
- A Survivor cannot hit themselves with their own attacks
- Only **missed** shots hit Survivors - successful hits that eliminate all Zombies don't cause Friendly Fire

### Range
- First value = minimum Range (can't shoot closer than this)
- Second value = maximum Range (can't shoot further)
- Range 0 = Survivor's own Zone only (still a Ranged Action for Ranged weapons)

---

## 11. Equipment Traits

### Flashlight
- Grants the **Search: 2 cards** Skill - draw 2 cards when Searching
- Does NOT stack with itself (multiple Flashlights don't give more than 2 cards)
- "May be used in the Backpack"

### Molotov
- Perform a Ranged Action with Molotov in Hand, then **discard the card**
- Creates a Molotov effect in the targeted Zone: **ALL Actors are eliminated**, regardless of Damage threshold
- Yes, this includes Abominations
- The Survivor who threw it earns all associated AP
- **Warning**: Kills friendly Survivors in the Zone too!

### Reload
- Weapons with Reload trait are emptied after being fired
- Spend 1 Action to Reload the weapon to fire it again in the same Round
- All reloadable weapons are **freely reloaded during End Phase**
- If traded without reloading, new owner must reload before using
- A single Reload Action reloads 2 Dual reloadable weapons
- Can fire one Dual reloadable weapon at one Zone, then the other at a different Zone (requires 2 separate Actions)

### Equipment Skill
- Some Equipment cards have built-in Skills (e.g., Sniper Rifle has Sniper)
- Weapon cards: Skill applies when performing a Combat Action with that weapon
- Non-weapon cards: Skill applies as long as the Equipment is in inventory

---

## 12. Skills Reference

### Stat Modifier Skills
| Skill | Effect |
|---|---|
| **+1 Action** | Extra Action per Turn (always the Yellow Level Skill) |
| **+1 Damage: [Type]** | +1 Damage bonus with specified Action type (Combat/Melee/Ranged) |
| **+1 die: [Type]** | Extra die per weapon with specified Action type. Dual weapons each gain a die (+2 total per Dual Action) |
| **+1 free [Type] Action** | 1 extra free Action of specified type (Combat/Melee/Move/Ranged/Search). Can only be used for that type |
| **+1 max Range** | Maximum Range of Ranged weapons increased by 1 |
| **+1 Zone per Move** | Move 1 or 2 Zones with 1 Move Action. Entering Zone with Zombies still ends Move |
| **+1 to dice roll: [Type]** | Add 1 to each die result with specified Action type. Maximum result is always 6 |
| **[Type]: Damage 2** | Weapons of indicated type with Damage 1 are treated as Damage 2 |

### Combat Skills
| Skill | Effect |
|---|---|
| **Ambidextrous** | Treats all weapons as having the Dual symbol |
| **Barbarian** | When resolving Melee Action, may substitute weapon's Dice number with number of Zombies in Zone. Dice-affecting Skills still apply |
| **Blitz** | Once per Turn: spend 1 Action to Move up to 2 Zones to a Zone where Zombies are within Range of an equipped Ranged weapon, then gain 1 free Ranged Action |
| **Bloodlust: [Type]** | Once per Turn: spend 1 Action to Move up to 2 Zones to a Zone with at least 1 Zombie, then gain 1 free Action of specified type |
| **Combat reflexes** | When Zombies spawn within Range 0-1 (before Rush), may perform a free Combat Action against them. Once per Zombie card drawn |
| **Dual expert** | Free Combat Action as long as Dual weapons are equipped. This Action may only use the Dual weapons |
| **Escalation: [Type]** | Gains 1 extra die for each consecutive Action of specified type. Cumulative until end of Turn. Lost when performing a different Action type |
| **Full auto** | When resolving Ranged Action, may substitute weapon's Dice number with number of Zombies in targeted Zone |
| **Gunslinger** | Treats all Ranged weapons as having the Dual symbol |
| **Improvised weapon: Melee** | Once per Turn: free Melee Attack with Range 0, Dice 2, Accuracy 4+, Damage 1 |
| **Improvised weapon: Ranged** | Once per Turn: free Ranged Attack with Range 1-1, Dice 2, Accuracy 4+, Damage 1 |
| **Point-blank** | Can perform Ranged Actions at Range 0 regardless of minimum Range. At Range 0, freely choose targets (ignores Targeting Priority), and Friendly Fire is ignored |
| **Reaper: [Type]** | When assigning hits from specified Action type, 1 hit can freely eliminate 1 additional identical Zombie. Only 1 extra per Action. Earns AP for the additional kill |
| **Roll 6: +1 Damage [Type]** | Each 6 rolled adds +1 Damage for that weapon. Re-rolls must be used before determining bonus |
| **Roll 6: +1 die [Type]** | Each 6 rolled grants an additional die. Keep rolling as long as 6s appear. Re-rolls used before rolling additional dice |
| **Sniper** | Freely choose targets of all Ranged Actions (ignores Targeting Priority). Friendly Fire is ignored |
| **Steady hand** | Can ignore other Survivors when missing with Ranged Action. Does NOT apply to Molotov |
| **Super strength** | Melee weapons used by this Survivor have Damage 3 |
| **Swordmaster** | Treats all Melee weapons as having the Dual symbol |

### Movement Skills
| Skill | Effect |
|---|---|
| **Charge** | Once per Turn, for free: Move up to 2 Zones to a Zone with at least 1 Zombie. Normal movement rules apply |
| **Hit & run** | After resolving a Melee or Ranged Action that kills at least 1 Zombie: free Move Action. No extra Actions for Zombies in Zone |
| **Jump** | Once per Turn: spend 1 Action to move exactly 2 Zones. Ignore everything in intervening Zone (except walls/closed doors). Movement Skills ignored, but Zone-leaving penalties apply |
| **Slippery** | No extra Actions when moving out of a Zone with Zombies. Also ignores Zombies when performing Move Actions (including multi-zone moves like Sprint) |
| **Sprint** | Once per Turn: spend 1 Move Action to move 2 or 3 Zones instead of 1. Entering Zone with Zombies still ends Move |

### Utility Skills
| Skill | Effect |
|---|---|
| **Born leader** | During this Survivor's Turn: give 1 free Action to another Survivor (used immediately), then resume Turn |
| **Break-in** | Can open doors without Equipment (silently). Also gains 1 extra free Action that can only open doors |
| **Brother in arms: [effect]** | When in same Zone as at least 1 other Survivor: all Survivors in Zone benefit from indicated Skill. Companions excluded |
| **Can Search more than once** | Can Search multiple times per Turn (1 Action per Search) |
| **Destiny** | Once per Turn when revealing drawn Equipment card: ignore and discard it, draw another from same deck |
| **Distributor** | During Spawn Step: draw all Zombie Cards at once, then assign 1 to each active Spawn Zone |
| **Field medic** | Once per Turn: spend 1 Action to Move up to 2 Zones to a Zone with a Survivor, then heal 1 Wound from any Survivor in destination Zone |
| **Free reload** | Reloads reloadable weapons for free |
| **Hoard** | Can carry 2 extra Equipment cards (in Backpack, near Dashboard) |
| **Hold your nose** | Draw an Equipment card whenever the last Zombie in the Survivor's Zone is eliminated. Works in any Zone. Not a Search Action |
| **Home defender** | Not limited to Range 0-1 when tracing LOS through building Zones |
| **Is That All You've Got?** | When about to endure Wounds: negate 1 Wound per Equipment card discarded |
| **Lifesaver** | Once per Turn, free: Select a Zone at Range 1 with Zombie(s) and Survivor(s), with clear path and LOS. Drag chosen Survivors to your Zone. Not a Move Action |
| **Low profile** | Can't be hit by Friendly Fire (Molotov still applies). Ignored when shooting at their Zone |
| **Lucky** | For each Action: may re-roll ALL dice one additional time. New result replaces previous. Stacks with Equipment re-rolls |
| **Matching set** | When Search draws a Dual weapon: immediately take a second copy from the Equipment deck. Shuffle deck after |
| **Medic** | Free during each End Phase: this Survivor and all Survivors in same Zone may heal 1 Wound. Earns 1 AP per Wound healed |
| **Regeneration** | During each End Phase: Health fully restored to maximum |
| **Scavenger** | May Search in any Zone (building or street). Normal Search rules apply (no Zombies in Zone) |
| **Search: 2 cards** | Draw 2 cards when Searching |
| **Shove** | Once per Turn, free: push all Zombies from your Zone to a Zone at Range 1 (needs clear path). Not a Movement |
| **Sidestep** | When Zombies spawn within Range 0-1 (before Rush): free Move Action (no extra Actions for Zombies). Once per Zombie card drawn |
| **Tactician** | Turn can be resolved anytime during Player Phase (before or after any other Survivor) |
| **Taunt** | Once per Turn, free: select Zone up to 2 Zones away with clear path. All Zombies there get extra Activation toward you, ignoring other Survivors |
| **Tough** | Ignores first Wound received during each Attack Step (Zombie Phase) and during Friendly Fire |
| **Webbing** | All Equipment in inventory is considered equipped in Hand |
| **Zombie link** | Plays extra Turn each time an Extra Activation card (not Rush) is drawn. Plays before the extra-activated Zombies |

### Starting Skills
| Skill | Effect | Notes |
|---|---|---|
| **Starts with [X] Health** | Survivor starts with indicated Health | Cannot be used as Companion |
| **Starts with 2 AP** | Begins game with 2 Adrenaline Points | Cannot be used as Companion |
| **Starts with [Equipment]** | Begins game with indicated Equipment | Cannot be used as Companion |

---

## 13. Characters

### Core Box Survivors (12)

| # | Name | Type | Starting Health | Notes |
|---|---|---|---|---|
| 1 | Josh | Classic | 3 | |
| 2 | Lili | Classic | 3 | |
| 3 | Doug | Classic | 3 | |
| 4 | Tiger Sam | Kid | 2 | Slippery once per Turn |
| 5 | Elle | Classic | 3 | |
| 6 | Odin | Classic | 3 | |
| 7 | Amy | Classic | 3 | |
| 8 | Bunny G | Kid | 2 | Slippery once per Turn |
| 9 | Ned | Classic | 3 | |
| 10 | Lou | Classic | 3 | |
| 11 | Wanda | Classic | 3 | |
| 12 | Ostara | Classic | 3 | |

**Note**: Each character has a unique Skill tree (Blue fixed, Yellow = +1 Action, Orange = pick 1 of 2, Red = pick 1 of 3). The exact Skill trees are printed on each character's ID Card and vary per character.

---

## 14. Equipment Registry

### Starting Equipment (6 cards, grey backs)

| Weapon | Type | Range | Dice | Accuracy | Damage | Noise | Door | Dual | Ammo | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| Baseball Bat | Melee | 0 | 2 | 4+ | 1 | Silent | No | No | - | 1 |
| Crowbar | Melee | 0 | 1 | 4+ | 1 | Silent | Yes (Noisy) | No | - | 1 |
| Fire Axe | Melee | 0 | 1 | 4+ | 2 | Silent | Yes (Noisy) | No | - | 1 |
| Pistol | Ranged | 0-1 | 1 | 4+ | 1 | Noisy | No | Yes | Bullets | 3 |

### Standard Equipment (45 cards, blue backs)

| Equipment | Type | Range | Dice | Accuracy | Damage | Noise | Door | Dual | Ammo | Skill | Count |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Aaahh!! | Special | - | - | - | - | - | - | - | - | Spawns a Walker | 4 |
| Bag of Rice | Food | - | - | - | - | - | - | - | - | Consume for 1 AP | 2 |
| Canned Food | Food | - | - | - | - | - | - | - | - | Consume for 1 AP | 2 |
| Chainsaw | Melee | 0 | 5 | 5+ | 2 | Noisy | Yes (Noisy) | No | - | - | 2 |
| Crowbar | Melee | 0 | 1 | 4+ | 1 | Silent | Yes (Noisy) | No | - | - | 1 |
| Fire Axe | Melee | 0 | 1 | 4+ | 2 | Silent | Yes (Noisy) | No | - | - | 1 |
| Flashlight | Utility | - | - | - | - | - | - | - | - | Search: 2 cards | 2 |
| Katana | Melee | 0 | 1 | 4+ | 2 | Silent | No | Yes | - | - | 2 |
| Kukri | Melee | 0 | 1 | 4+ | 1 | Silent | No | Yes | - | - | 2 |
| Machete | Melee | 0 | 1 | 4+ | 1 | Silent | No | Yes | - | - | 4 |
| Molotov | Ranged | 0-1 | - | Auto | All | Noisy | No | No | - | See Molotov rules | 4 |
| Pistol | Ranged | 0-1 | 1 | 4+ | 1 | Noisy | No | Yes | Bullets | - | 1 |
| Plenty of Bullets | Utility | - | - | - | - | - | - | - | Bullets | Re-roll misses (Bullets weapons). Backpack-usable | 3 |
| Plenty of Shells | Utility | - | - | - | - | - | - | - | Shells | Re-roll misses (Shells weapons). Backpack-usable | 3 |
| Sawed-Off | Ranged | 0-1 | 2 | 4+ | 1 | Noisy | No | No | Shells | Reload | 4 |
| Shotgun | Ranged | 0-1 | 2 | 4+ | 2 | Noisy | No | No | Shells | - | 2 |
| Sniper Rifle | Ranged | 1-3 | 1 | 2+ | 2 | Noisy | No | No | Bullets | Sniper | 2 |
| Sub-MG | Ranged | 0-1 | 3 | 5+ | 1 | Noisy | No | No | Bullets | - | 2 |
| Water | Food | - | - | - | - | - | - | - | - | Consume for 1 AP | 2 |

**Total Standard Equipment**: 45 cards

### Epic Weapons (11 cards, red backs)

| Weapon | Type | Range | Dice | Accuracy | Damage | Noise | Dual | Ammo | Skill | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| Aaahh! | Special | - | - | - | - | - | - | - | Spawns a Walker | 2 |
| Army Sniper Rifle | Ranged | 1-3 | 1 | 2+ | 3 | Noisy | No | Bullets | Sniper | 1 |
| Automatic Shotgun | Ranged | 0-1 | 3 | 4+ | 2 | Noisy | No | Shells | - | 1 |
| Evil Twins | Ranged | 0-1 | 2 | 3+ | 1 | Noisy | Yes | Bullets | - | 1 |
| Golden AK-47 | Ranged | 0-2 | 3 | 4+ | 1 | Noisy | No | Bullets | - | 1 |
| Golden Kukri | Melee | 0 | 2 | 3+ | 2 | Silent | Yes | - | - | 1 |
| Gunblade | Melee/Ranged | 0-1 | 2 | 4+ | 2 | Noisy | No | Bullets | - | 1 |
| Ma's Shotgun | Ranged | 0-1 | 3 | 4+ | 2 | Noisy | No | Shells | Reload | 1 |
| Nailbat | Melee | 0 | 2 | 3+ | 2 | Silent | No | - | - | 1 |
| Zantetsuken | Melee | 0 | 2 | 4+ | 3 | Silent | No | - | - | 1 |

**Total Epic Weapons**: 11 cards

### Aaahh!! Card
- When drawn from Equipment deck: immediately spawns a Walker in the Survivor's Zone
- The card is then discarded (not added to inventory)
- Interrupts Search (even with Flashlight)

---

## 15. Spawn Cards

### Zombie Deck Composition (40 cards)

Cards are numbered #001-#040 and divided into difficulty tiers:
- **#001-#018**: Easier spawns. Lower Zombie counts. No Abominations at Blue level
- **#019-#036**: Harder spawns. More Zombies, especially at low Danger Levels. Abominations can appear at Blue level
- **#037-#040**: Extra Activation cards (all Zombies of a type get extra Activation)

### Spawn Card Reading
Each card shows a Zombie type and 4 lines (Blue/Yellow/Orange/Red). Read the line matching the highest Danger Level among ALL Survivors.

**Example spawn card**:
- Blue: 3 Walkers
- Yellow: 5 Walkers
- Orange: 7 Walkers
- Red: 9 Walkers

### Extra Activation Cards
- No Zombies are spawned
- All Zombies of the indicated type perform an extra Activation
- **No effect at Blue Danger Level**

### Zombie Rush Cards
- Zombies are placed normally
- Then those Zombies immediately perform a free Activation
- **Runners do NOT have Rush cards**

### Abomination Deck (4 cards)
- Separate from the Zombie deck
- Drawn when a Zombie card indicates an Abomination spawn
- Contains 1 card for each Abomination variant (Patient 0, Hobomination, Abominacop, Abominawild)
- Can be customized by removing/adding cards

---

## 16. Additional Game Modes

### Abomination Fest
- Allows multiple Abominations on the board simultaneously
- If Abomination spawn card drawn and one is already on board:
  1. All existing Abominations get extra Activation
  2. THEN draw from Abomination deck and place a new one
- Players can set a maximum number of simultaneous Abominations

### Car Actions
Two car types: Muscle Car and Police Car. Both play the same way with special abilities.

#### Get In/Out of a Car (1 Action)
- Must have no Zombies in the Zone to get in
- Car holds 1 Driver + up to 3 Passengers
- No restrictions to getting out

#### Change Seats (1 Action)
- Switch between Driver and Passenger
- Can be done with Zombies present
- Not a Move Action

#### Drive a Car (1 Action, Driver only)
- Cannot drive into building Zones
- Not a Move Action, not subject to movement modifiers
- Can leave/go through Zones with Zombies without extra Actions

**Slow Drive**: Move 1 Zone. No attack.
**Fast Drive**: Move 2 consecutive Zones (no U-turns). Perform a Car Attack in each Zone with Zombies entered.
- Car Attack: Accuracy 4+, Damage 2
- Hits assigned via Targeting Priority Order
- Can cause Friendly Fire to pedestrian Survivors
- Survivors in the car or another car are immune
- Driving makes no Noise

#### Muscle Car Special
- Some Missions place Epic Weapon Crates on Muscle Cars

#### Police Car Special
- Can be Searched for weapons
- Draw cards until a weapon card is found (discard non-weapons)
- Aaahh!! card interrupts the Search

### Dark Zones
- Actors can't trace LOS to Dark Zones except at Range 0-1
- Ranged Attacks at Dark Zones have **Accuracy 6+** (need a 6 to hit)
- Having a Flashlight cancels the Accuracy penalty
- Accuracy modifiers still apply on top of 6+
- Automatic success (Molotov) still works
- Melee Attacks are NOT affected

### Companions
- Survivor miniatures used as objectives or support characters
- Always stay with their Leader
- Count as 1 Noise
- Hit by Friendly Fire
- Eliminated by ANY Wound (1 Wound = dead)
- Game is usually lost if a Companion is eliminated
- No inventory, no Actions
- The Leader gets the Companion's Blue Level Skill
- Can be traded like Equipment

### Ultrared Mode
- When reaching Red Level, Adrenaline tracker resets to 0 (stays Red Level)
- Continue earning AP and gaining unselected Skills at each Danger Level reached again
- When all Survivor Skills are selected: choose from the full Skill list at Orange and Red Levels

### Tuning Difficulty
- Zombie cards #001-#018: easier
- Zombie cards #019-#036: harder
- Zombie cards #037-#040: Extra Activations
- Mix and match to customize difficulty

---

## 17. Missions

The core box contains 26 Missions (M0-M25):

| Mission | Name | Difficulty | Duration | Tiles |
|---|---|---|---|---|
| M0 | Zombicide Life (Tutorial) | Easy | 30 min | 2 |
| M1 | City Blocks | Medium | 45 min | 9 |
| M2 | Y-Zone | Hard | 60 min | 9 |
| M3 | The 24hrs Race of Zombicity | Medium | 90 min | 9 |
| M4 | Drive-By Shooting | Medium | 90 min | 6 |
| M5 | Big W | Hard | 90 min | 9 |
| M6 | The Escape | Hard | 90 min | 6 |
| M7 | Grindhouse | Hard | 45 min | 4 |
| M8 | Zombie Police | Hard | 30 min | 6 |
| M9 | Might Makes Right | Medium | 60 min | 4 |
| M10 | Small Town | Easy | 30 min | 4 |
| M11 | The Ditch | Medium | 30 min | 4 |
| M12 | Car Crash | Medium | 60 min | 6 |
| M13 | Burning Streets | Medium | 45 min | 6 |
| M14 | Breakfast at Jesse's | Medium | 45 min | 6 |
| M15 | United We Stand | Medium | 45 min | 9 |
| M16 | Pale Shelter | Medium | 45 min | 4 |
| M17 | The Blight | Hard | 60 min | 9 |
| M18 | The End of the Road | Hard | 60 min | 6 |
| M19 | Best Friends Forever | Hard | 45 min | 6 |
| M20 | The Zombiefest | Hard | 45 min | 6 |
| M21 | Heavy-Duty | Hard | 60 min | 6 |
| M22 | Crank It Up to 11 | Hard | 45 min | 6 |
| M23 | Mercy Street | Medium | 45 min | 6 |
| M24 | Ram Speed | Hard | 60 min | 9 |
| M25 | Ned's Moloturbo | Hard | 90 min | 6 |

### Common Mission Elements
- Most Objectives give 5 AP
- Most Epic Weapon Crates give a random Epic Weapon + free inventory reorganize
- Colored Spawn Zones (Blue/Green) are activated by taking matching colored Objectives
- Exit Zones: Survivors escape at end of their Turn if no Zombies present
- Many Missions feature cars (Muscle Car / Police Car) with standard or restricted rules

### Tile Set
- 9 double-sided tiles (labeled 1-9, with V and R sides)
- Each tile has predefined positions for Doors, Objectives, Epic Weapon Crates
- Dark Zones are marked on building interiors

---

## Appendix: Key Numbers Quick Reference

| Item | Value |
|---|---|
| Survivors per game | Always 6 |
| Actions per Turn (Blue) | 3 |
| Actions per Turn (Yellow+) | 4 |
| Inventory slots | 5 (2 Hand + 3 Backpack) |
| Health - Classic Survivor | 3 |
| Health - Kid Survivor | 2 |
| Blue AP Threshold | 0 |
| Yellow AP Threshold | 7 |
| Orange AP Threshold | 19 |
| Red AP Threshold | 43 |
| AP per Zombie kill | 1 |
| AP per Objective | 5 (usually) |
| Noise tokens per noisy Action | 1 |
| Minimum Accuracy | 2+ (always) |
| Walker miniatures | 40 |
| Brute miniatures | 16 |
| Runner miniatures | 16 |
| Abomination miniatures | 4 |
| Zombie cards | 40 |
| Equipment cards | 45 (+ 6 Starting) |
| Epic Weapon cards | 11 |
| Spawn Zones (Red/Red) | 5 |
| Starting Spawn Zone | 1 |
| Colored Spawn Zones | 2 (Blue + Green) |
| Dice (d6) | 6 |
