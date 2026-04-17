# Endead - Architecture Reference

Quick-reference for understanding the codebase without crawling every file.

---

## Directory Layout

```
src/
├── main.ts                      # Client entry: PixiJS init, routing, room lifecycle
├── client/
│   ├── PixiBoardRenderer.ts     # PixiJS canvas: zones, entities, doors, walls, camera
│   ├── InputController.ts       # Click/tap handling: mode-based (move/attack/door)
│   ├── NetworkManager.ts        # WebSocket client, sends actions, receives state
│   ├── GameStore.ts             # Reactive state store with subscribe/unsubscribe
│   ├── AnimationController.ts   # Spawn/death tweens (incomplete)
│   ├── AssetManager.ts          # Sprite/texture asset loading
│   ├── AudioManager.ts          # Sound effect playback
│   ├── KeyboardManager.ts       # Keyboard shortcut bindings
│   ├── config/
│   │   ├── PlayerIdentities.ts  # 6-color+shape palette for player identification
│   │   └── ZombieTypeConfig.ts  # Display properties per zombie type (color, icon, shape)
│   ├── utils/
│   │   └── zoneLayout.ts        # Zone grid position resolver (z_x_y convention)
│   ├── editor/
│   │   └── MapEditor.ts         # In-browser scenario authoring tool
│   └── ui/
│       ├── GameHUD.ts           # Main game UI: action bar, inventory, stats, modals
│       ├── LobbyUI.ts           # Pre-game: player cards, character select, map pick
│       ├── MenuUI.ts            # Landing: create/join room
│       ├── PickupUI.ts          # Inventory full modal when searching
│       ├── TradeUI.ts           # Trade interface
│       ├── NotificationManager.ts # Toast/alert notification system
│       ├── components/
│       │   ├── Button.ts        # Reusable button component
│       │   ├── ActionButton.ts  # Game action button with icon + label
│       │   ├── StatBar.ts       # Health/XP/AP progress bar
│       │   ├── ItemCard.ts      # Equipment card display
│       │   ├── PlayerAvatar.ts  # Color+shape player identifier
│       │   ├── ZombieBadge.ts   # Zombie type indicator
│       │   ├── EventEntry.ts    # History/event log entry
│       │   └── icons.ts         # Lucide icon helper
│       └── overlays/
│           └── ModalManager.ts  # Focus trap, scroll lock, bottom-sheet modals
├── server/
│   ├── server.ts                # Express + WS server, room management, message routing
│   └── HeartbeatManager.ts      # 20s ping/pong for connection health
├── services/
│   ├── ActionProcessor.ts       # Central dispatcher: maps ActionType -> handler function
│   ├── TurnManager.ts           # Turn validation, AP deduction, phase transitions
│   ├── ZombiePhaseManager.ts    # Zombie activation, spawning, round reset
│   ├── ZombieAI.ts              # Per-zombie decision: attack/move/idle + pathfinding
│   ├── DeckService.ts           # Equipment & spawn deck init, shuffle, draw
│   ├── DiceService.ts           # Deterministic PRNG (LCG), dice rolling
│   ├── EquipmentManager.ts      # Inventory slot management (5 slots)
│   ├── XPManager.ts             # XP tracking, danger level, skill unlocks
│   ├── ScenarioCompiler.ts      # Converts MapData -> zones/connections/objectives
│   ├── TileService.ts           # Tile texture loading from spritesheet
│   ├── PersistenceService.ts    # Save/load state to SQLite (better-sqlite3)
│   └── ReplayService.ts         # Replay actions for validation
├── config/
│   ├── EquipmentRegistry.ts     # 18 equipment definitions, 37-card deck composition
│   ├── SkillRegistry.ts         # 15 skill definitions, 3 class progression trees
│   ├── SpawnRegistry.ts         # 8 spawn cards with per-danger-level details
│   ├── DefaultMap.ts            # Built-in "City Blocks" scenario
│   └── Layout.ts                # Static zone positions (legacy, mostly superseded)
├── styles/
│   ├── index.css                # CSS barrel import
│   ├── tokens.css               # Design tokens (colors, spacing, typography)
│   ├── reset.css                # CSS reset
│   ├── base.css                 # Base element styles
│   ├── utilities.css            # Utility classes
│   ├── layout.css               # Responsive layout system
│   └── components/              # Per-component CSS modules
├── types/
│   ├── GameState.ts             # Core types: Survivor, Zombie, Zone, Equipment, etc.
│   ├── Action.ts                # ActionType enum, ActionRequest/Response interfaces
│   └── Map.ts                   # ScenarioMap, TileInstance, MapRoom, MapDoor, MapMarker
├── utils/
│   └── StateDiff.ts             # JSON patch generation for state sync
└── tests/
    ├── StateDiff.test.ts        # StateDiff unit tests (console.log-based)
    └── ReplayService.test.ts    # Replay validation tests
```

---

## Data Flow

```
Player Click
  → InputController (validates turn ownership, determines mode)
  → NetworkManager.sendAction({ playerId, survivorId, type, payload })
  → WebSocket → server.ts
  → ActionProcessor.processAction(state, request)
    → TurnManager.validateTurn() (AP check, phase check, ownership)
    → handler function (deep clone state, apply changes)
    → TurnManager.advanceTurnState() (decrement AP)
    → check phase transition (all players done → zombie phase)
    → check game end conditions
  → broadcastRoomState() → WebSocket → all clients
  → NetworkManager receives STATE_UPDATE
  → GameStore.update(newState) → subscribers notified
  → PixiBoardRenderer.render() + GameHUD.render()
```

---

## Key Concepts

### Server Rooms
In-memory `Map<roomId, RoomContext>`. Each room holds:
- `gameState`: The complete game state
- `clients`: WebSocket → PlayerId mapping  
- `connections`: PlayerId → WebSocket reverse mapping
- `cleanupTimer`: 5-minute idle auto-delete

### State Immutability
Every action handler clones state via `JSON.parse(JSON.stringify(state))` before modifying. This ensures the broadcast state is a fresh object. **Exceptions**: `executeTrade()` mutates state directly (bug); `handleSearch()` mutates input state when deck is empty (bug). `XPManager.unlockSkill()` now returns a new object (fixed).

### Deterministic RNG
`DiceService` uses a seeded LCG (MINSTD). The seed is stored in `GameState.seed` and updated after every random operation. Same seed → same game. This enables `ReplayService` to re-apply action history and verify state consistency.

### Zone Connectivity Model
Zones connect via `ZoneConnection[]` on each zone, with per-edge door state:
```typescript
{ toZoneId: "z_1_2", hasDoor: true, doorOpen: false }
```
Opening a door updates both sides. Movement checks `isDoorBlocked()` before allowing transit.

### Turn Structure
1. **Players Phase**: Each player's survivors act (3 AP base). Active player rotates.
2. **Zombie Phase**: All zombies activate (ZombieAI decides per-zombie action).
3. **Spawn Phase**: Draw spawn card per spawn point, create zombies.
4. **End Phase**: Clear noise, reset AP, rotate first-player token, increment turn.

### Danger Level Escalation
Global danger = max danger of any survivor. XP thresholds: Blue(0) → Yellow(7) → Orange(19) → Red(43). Higher danger = more/tougher zombies from spawn cards.

---

## Equipment System

5 inventory slots per survivor:
- `HAND_1`, `HAND_2`: Weapons for combat (checked during attack)
- `BACKPACK_0`, `BACKPACK_1`, `BACKPACK_2`: Storage, items not usable until moved to hand
- `DISCARD`: Trade/pickup target for items to discard

Weapons have: `range[min,max]`, `dice`, `accuracy` (threshold), `damage`, `noise`, `dualWield`, `canOpenDoor`.

---

## Zombie Types

| Type | Toughness | Actions/Turn | XP Reward |
|------|-----------|-------------|-----------|
| Walker | 1 | 1 | 1 |
| Runner | 1 | 2 | 1 |
| Fatty | 2 | 1 | 1 |
| Abomination | 3 | 1 | 5 |

Combat resolution: if `weapon.damage >= zombie.toughness`, zombie dies in one hit. Wounds are not tracked across hits (simplification).

---

## Map System

Two formats:
1. **ScenarioMap** (modern): Tiles + Rooms + Doors + Markers → compiled by `ScenarioCompiler` into zones
2. **LegacyMap**: Tiles only → compiled by `compileLegacyTiles` with auto-generated connections

Zone IDs from compiler: `z_${tileX*3 + cellX}_${tileY*3 + cellY}` (e.g., `z_0_0`, `z_3_5`)

Zone positions are now derived from the `z_x_y` ID convention via `src/client/utils/zoneLayout.ts`, eliminating the dependency on the static `Layout.ts` table. `Layout.ts` is retained for legacy compatibility but is mostly superseded.

---

## Skill System

3 character classes ("Goth Girl", "Standard", "Promotional") with skill trees (Blue/Yellow fixed, Orange pick-1-of-2, Red pick-1-of-3). All 15 defined skills are now implemented:
- Stat mods: `plus_1_damage_melee/ranged`, `plus_1_die_melee/ranged` (applied in attack handler)
- Free actions: `plus_1_free_move/search/combat` (tracked per turn, reset in endRound)
- Combat: `lucky` (reroll via rollDiceWithReroll), `sniper` (bypasses friendly fire)
- Movement: `slippery` (no zombie zone penalty), `sprint` (move up to 3 zones for 1 AP)
- Utility: `search_anywhere` (search in streets), `tough` (ignore first wound/turn)
- Start: `start_move` (1 free move at game start)

---

## File Size Reference

Largest files (most logic):
- `ActionProcessor.ts`: ~1265 lines - all game action handlers
- `GameHUD.ts`: ~800 lines - main game UI
- `PixiBoardRenderer.ts`: ~700 lines - canvas rendering
- `GameState.ts`: ~350 lines - type definitions
- `MapEditor.ts`: ~400 lines - editor tool
- `server.ts`: ~384 lines - server + rooms
- `ZombiePhaseManager.ts`: ~327 lines - zombie phase orchestration
- `ZombieAI.ts`: ~275 lines - zombie behavior
- `ScenarioCompiler.ts`: ~269 lines - map compilation

## Active Initiatives

- **UI Redesign**: See `tasks/00-implementation-plan.md`. Phased migration from inline styles to CSS design tokens (`src/styles/`). New component library in `src/client/ui/components/`. Currently in progress.
- **Persistence**: Migrated from JSON files to SQLite via better-sqlite3 (`PersistenceService.ts`).
- **Review**: See `REVIEW.md` for comprehensive rules accuracy audit and code quality findings.
