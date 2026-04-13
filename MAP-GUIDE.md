# Map & Tile System Guide

## How Zombicide Maps Work

Each tile is a **3x3 grid of cells**. Cells are either **street** or **building**.

- **Building zones**: A room = 1 zone. Cells with the same `roomId` within a tile form one room.
- **Street zones**: Connected street cells without crosswalks between them merge into a single zone, even across tiles.
- **Crosswalks** (white stripes on tile art) divide streets into separate zones.
- **Doors** connect buildings to streets or rooms to rooms. Placed in the map editor, not tile definitions.
- **Walls** separate buildings from streets unless a door exists.

## Tile Definition Editor

Open the Map Editor (`/editor`). In the tile palette, click the **gear icon** on any tile to open the interactive Tile Definition Editor.

The editor shows the tile image at full size with a clickable 3x3 grid overlay:

**Cells mode** (default):
- Left-click a cell to toggle between street (green overlay) and building (colored by room)
- Building cells are assigned to the currently selected room letter from the palette
- Right-click a building cell to cycle its room letter (A, B, C...)

**Edges mode**:
- Click between two street cells to toggle a **crosswalk** (zone divider)
- Click external edge strips on the tile border to cycle: **street -> street+crosswalk -> wall**

Click **Save** to persist to the database. Definitions load automatically on startup.
Click **Reset to Default** to revert to the hardcoded seed data without saving.

### What each part controls

| Element | What it does | When to use |
|---------|-------------|-------------|
| Cell type (street/building) | Determines if a cell is outdoor or indoor | Always define this first |
| Room ID (A, B, C...) | Groups building cells into rooms. Same letter = one room (open passage) | Assign after marking cells as building |
| Internal crosswalk | Zone boundary between two adjacent street cells within the tile | Where the tile art has crosswalk markings between street cells |
| External edge type | Controls what happens when this tile connects to an adjacent tile | Set to wall for building edges, street for road edges |
| External crosswalk | Zone boundary at the tile border, even when both sides are street | Where the tile art has crosswalk markings at the tile edge |

### How edges affect zone merging

When two tiles are placed adjacent, the compiler checks both tiles' external edges at the shared border:

- Both **street**, no crosswalk on either: streets **merge** into one zone
- Either has **crosswalk**: streets stay **separate** zones (crosswalk = zone divider)
- Either is **wall**: **no connection** (building wall)

## Adding a New Tile Pack

### 1. Add the spritesheet

Place the image in `public/images/tiles/`. The spritesheet should be a grid of square tiles with consistent padding.

### 2. Update TileService

In `src/services/TileService.ts`, load and slice the new spritesheet:

```typescript
const x = PADDING + (col * (TILE_SIZE + PADDING));
const y = PADDING + (row * (TILE_SIZE + PADDING));
const frame = new PIXI.Rectangle(x, y, TILE_SIZE, TILE_SIZE);
const tileTex = new PIXI.Texture({ source: this.tilesheet.source, frame });
this.tileTextures.set(tileId, tileTex);
```

Key constants for your spritesheet: `TILE_PADDING`, `TILE_SIZE`, `COLS`, `ROWS`.

### 3. Define tile metadata

Open the Map Editor and use the gear icon on each new tile to define it visually. No code required.

For programmatic registration (e.g. batch import):

```typescript
import { registerTileDefinitions } from './TileDefinitions';
registerTileDefinitions([{ id: 'EX1R', cells: [...], edges: [...], internalEdges: [...] }]);
```

### 4. Verify

Place tiles in the map editor. The overlay shows:
- **Dashed white lines**: crosswalk positions from tile definitions
- **Colored cell tints**: merged street zones (multi-cell zones share a color)
- **Room highlights**: auto-created rooms from tile definitions

## Tile Definition Data Structure

```typescript
{
  id: '1R',
  cells: [
    // 9 entries (3x3). localX: 0-2 (left to right), localY: 0-2 (top to bottom)
    { localX: 0, localY: 0, type: 'street' },
    { localX: 1, localY: 0, type: 'building', roomId: 'A' },
    // ...
  ],
  edges: [
    // 12 entries (3 per side). localIndex along edge:
    //   north/south: 0=left, 1=center, 2=right
    //   east/west:   0=top, 1=middle, 2=bottom
    { side: 'north', localIndex: 0, type: 'street', crosswalk: false },
    { side: 'north', localIndex: 1, type: 'wall', crosswalk: false },
    // ...
  ],
  internalEdges: [
    // Only crosswalks between adjacent street cells within the tile
    { fromX: 0, fromY: 1, toX: 0, toY: 2, type: 'crosswalk' },
  ],
}
```

## How the Compiler Works

`ScenarioCompiler.compileScenario()` converts a `ScenarioMap` into runtime zones:

1. Reads tile definitions for each placed tile (applies rotation)
2. Classifies every cell as street or building
3. Classifies every edge between adjacent cells (open / wall / crosswalk / door)
4. **Union-Find** merges connected street cells without crosswalks into single zones
5. Building cells are grouped by `roomId` into room zones
6. Builds zone connection graph (adjacency, doors)
7. Outputs `zones` + `zoneGeometry` (cell-to-zone mappings)

Tiles without definitions default to all-street (everything merges).

### Zone ID formats

| Format | Meaning |
|--------|---------|
| `z_3_5` | Single-cell zone at grid position (3,5) |
| `sz_0_2` | Multi-cell street zone (named after its top-left cell) |
| `bz_1_0` | Multi-cell building zone (named after its top-left cell) |

## Map Editor Workflow

1. **Define tiles** (one-time) - Open gear icon on each tile, set cells/edges/crosswalks, save
2. **Place tiles** - Select from palette, click to place, R to rotate
3. **Rooms auto-populate** - Tile definitions create rooms automatically when tiles are placed
4. **Add doors** - Use Door tool to connect buildings to streets
5. **Place markers** - PlayerStart, ZombieSpawn, Exit, Objective
6. **Verify zones** - Overlay shows merged street zones and crosswalks
7. **Save map** - Stores to SQLite via `/api/maps`

Manual room painting is only needed to override tile definitions or merge rooms across tiles.

## Persistence

| Data | Storage | API |
|------|---------|-----|
| Tile definitions | SQLite `tile_definitions` table | `GET/POST /api/tile-definitions` |
| Maps | SQLite `maps` table | `GET/POST /api/maps` |

On first server start, hardcoded tile definitions from `TileDefinitions.ts` are seeded into the database. Subsequent edits via the editor override these defaults.

On client startup, definitions are fetched from the server and registered into the runtime registry before the editor loads.

## File Reference

| File | Purpose |
|------|---------|
| `src/types/TileDefinition.ts` | Type interfaces for tile metadata |
| `src/config/TileDefinitions.ts` | Hardcoded defaults + runtime registry + server loader |
| `src/services/TileDefinitionService.ts` | Rotation transforms + cell/edge lookups |
| `src/services/TileService.ts` | Spritesheet loading + texture slicing |
| `src/services/ScenarioCompiler.ts` | Map compilation + Union-Find zone merging |
| `src/services/PersistenceService.ts` | SQLite persistence (maps + tile definitions) |
| `src/client/editor/MapEditor.ts` | Map editor UI + auto-rooms from tile defs |
| `src/client/editor/TileDefinitionEditor.ts` | Interactive tile definition modal |
| `src/client/PixiBoardRenderer.ts` | Zone rendering + tile seam fix |
| `src/client/utils/zoneLayout.ts` | Zone geometry lookups for multi-cell zones |
| `src/services/ZombieAI.ts` | LOS system (updated for multi-cell zones) |
