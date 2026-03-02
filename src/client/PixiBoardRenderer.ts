// src/client/PixiBoardRenderer.ts

import * as PIXI from 'pixi.js';
import { GameState, ZoneId, EntityId, Survivor, Zombie, Zone, ZoneConnection } from '../types/GameState';
import { MarkerType } from '../types/Map';
import { ZONE_LAYOUT, TILE_SIZE, ENTITY_RADIUS, ENTITY_SPACING } from '../config/Layout';
import { tileService } from '../services/TileService';
import { TileInstance } from '../types/Map';

export interface RenderOptions {
  activeSurvivorId?: EntityId;
  validMoveZones?: ZoneId[];
}

type GridMap = Record<string, ZoneId>;

// Helper to build grid lookup from layout
const buildGrid = (): GridMap => {
  const grid: GridMap = {};
  for (const [id, layout] of Object.entries(ZONE_LAYOUT)) {
    for (let x = 0; x < layout.w; x++) {
      for (let y = 0; y < layout.h; y++) {
        const key = `${layout.col + x},${layout.row + y}`;
        grid[key] = id;
      }
    }
  }
  return grid;
};

export class PixiBoardRenderer {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private grid: GridMap;
  
  // Camera Control
  private isDragging = false;
  private _wasDragging = false;
  private lastDragPos = { x: 0, y: 0 };
  private _pointerIsDown = false;
  private _pointerStartPos: { x: number, y: number } | null = null;

  // State-tracking cache for reconciliation
  private entitySprites: Map<EntityId, PIXI.Container> = new Map();
  private zoneGraphics: Map<ZoneId, PIXI.Graphics> = new Map();
  private tileSprites: PIXI.Container[] = [];
  private _lastTileHash: string = '';
  
  // Layers
  private layerGrid: PIXI.Container;
  private layerTiles: PIXI.Container;
  private layerZones: PIXI.Container;
  private layerEntities: PIXI.Container;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);
    
    // Create Layers
    this.layerGrid = new PIXI.Container();
    this.layerTiles = new PIXI.Container();
    this.layerZones = new PIXI.Container();
    this.layerEntities = new PIXI.Container();
    
    this.container.addChild(this.layerGrid);
    this.container.addChild(this.layerTiles);
    this.container.addChild(this.layerZones);
    this.container.addChild(this.layerEntities);

    this.grid = buildGrid();

    // Ensure tiles loaded
    tileService.loadAssets();

    this.setupCameraControls();
  }

  private setupCameraControls(): void {
    // Make stage interactive for background dragging
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e) => {
      // Only start drag on middle mouse button (wheel click) to avoid
      // conflicting with left-click tile placement in editor mode
      if (e.button === 1) {
        this.isDragging = true;
        this.lastDragPos = { x: e.global.x, y: e.global.y };
      }
      // Also support right-button drag for camera pan (shift+right or just middle)
      // Left-click drag: track start position for drag-threshold detection
      if (e.button === 0) {
        this._pointerStartPos = { x: e.global.x, y: e.global.y };
        this._pointerIsDown = true;
      }
    });

    this.app.stage.on('pointerup', () => {
      // Preserve drag state for one frame so editor's pointerup handler can check it
      this._wasDragging = this.isDragging;
      this.isDragging = false;
      this._pointerIsDown = false;
      this._pointerStartPos = null;
    });

    this.app.stage.on('pointerupoutside', () => {
      this._wasDragging = this.isDragging;
      this.isDragging = false;
      this._pointerIsDown = false;
      this._pointerStartPos = null;
    });

    this.app.stage.on('pointermove', (e) => {
      // Left-click: only start dragging after a movement threshold (5px)
      // This prevents accidental drags when placing tiles
      if (this._pointerIsDown && !this.isDragging && this._pointerStartPos) {
        const dx = e.global.x - this._pointerStartPos.x;
        const dy = e.global.y - this._pointerStartPos.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          this.isDragging = true;
          this.lastDragPos = { x: e.global.x, y: e.global.y };
        }
      }

      if (this.isDragging) {
        const dx = e.global.x - this.lastDragPos.x;
        const dy = e.global.y - this.lastDragPos.y;
        
        this.container.x += dx;
        this.container.y += dy;
        
        this.lastDragPos = { x: e.global.x, y: e.global.y };
      }
    });

    // Zoom (Wheel)
    const canvas = this.app.canvas;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const scaleFactor = 1.1;
      const zoomIn = e.deltaY < 0;
      
      let newScale = this.container.scale.x * (zoomIn ? scaleFactor : 1/scaleFactor);
      
      // Clamp Zoom
      newScale = Math.max(0.2, Math.min(newScale, 3.0));

      // Zoom towards mouse pointer
      // Get mouse pos relative to container
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldPos = {
        x: (mouseX - this.container.x) / this.container.scale.x,
        y: (mouseY - this.container.y) / this.container.scale.y
      };

      this.container.scale.set(newScale);

      // Adjust position to keep mouse over same world point
      const newX = mouseX - worldPos.x * newScale;
      const newY = mouseY - worldPos.y * newScale;

      this.container.position.set(newX, newY);
    }, { passive: false });
  }

  /**
   * Returns a sprite by ID if it exists in the scene.
   * Used by AnimationController.
   */
  public getSprite(id: EntityId): PIXI.Container | undefined {
    return this.entitySprites.get(id);
  }

  /** Returns true if the camera was being dragged when pointer was released (to suppress click actions). */
  public get wasDragging(): boolean {
    return this._wasDragging;
  }

  public screenToWorld(x: number, y: number): { x: number, y: number } {
    const point = new PIXI.Point(x, y);
    const local = this.container.toLocal(point);
    return { x: local.x, y: local.y };
  }

  // Helper to resolve layout from static config OR dynamic ID convention
  private getZoneLayout(zoneId: ZoneId): { col: number, row: number, w: number, h: number } {
      if (ZONE_LAYOUT[zoneId]) return ZONE_LAYOUT[zoneId];
      
      // Dynamic Zone: z_x_y
      const parts = zoneId.split('_');
      if (parts.length === 3 && parts[0] === 'z') {
          return {
              col: parseInt(parts[1]),
              row: parseInt(parts[2]),
              w: 1,
              h: 1
          };
      }

      return { col: 0, row: 0, w: 1, h: 1 };
  }

  public drawEditorGrid(width: number, height: number): void {
      console.log(`[Renderer] Drawing Editor Grid: ${width}x${height}`);
      
      this.layerGrid.removeChildren();
      const graphics = new PIXI.Graphics();
      this.layerGrid.addChild(graphics);

      // Draw Tiles Grid (450px)
      const TILE_PIXEL_SIZE = TILE_SIZE * 3;
      
      // Draw background rect for visibility
      graphics.rect(0, 0, width * TILE_PIXEL_SIZE, height * TILE_PIXEL_SIZE);
      graphics.fill({ color: 0x1a1a1a });

      // Build all grid lines as a single path, then stroke once (PIXI v8 pattern)
      for (let x = 0; x <= width; x++) {
          const px = x * TILE_PIXEL_SIZE;
          graphics.moveTo(px, 0);
          graphics.lineTo(px, height * TILE_PIXEL_SIZE);
      }

      for (let y = 0; y <= height; y++) {
          const py = y * TILE_PIXEL_SIZE;
          graphics.moveTo(0, py);
          graphics.lineTo(width * TILE_PIXEL_SIZE, py);
      }

      // Single stroke call for all grid lines
      graphics.stroke({ width: 2, color: 0xFF0000, alpha: 0.5 });

  }

  public render(state: GameState, options: RenderOptions = {}): void {
    // 0. Tiles
    if (state.tiles) {
       this.renderTiles(state.tiles);
    }
    
    // 1. Zones (Board)
    this.reconcileZones(state, options.validMoveZones || []);

    // 2. Entities (Survivors & Zombies)
    this.reconcileEntities(state, options.activeSurvivorId);
  }

  private renderTiles(tiles: TileInstance[]): void {
     if (!tileService.isReady) return;

     // Dirty check: compare a hash of tile data to detect replacements
     const tileHash = tiles.map(t => `${t.tileId}:${t.x},${t.y}:${t.rotation}`).join('|');
     if (tileHash === this._lastTileHash) return;
     this._lastTileHash = tileHash;
     
     this.layerTiles.removeChildren();

     tiles.forEach(tile => {
         const texture = tileService.getTexture(tile.tileId);
         if (!texture) return;
         
         const sprite = new PIXI.Sprite(texture);
         
         // Logic Size: 3x3 Zones = 450x450px
         const targetSize = TILE_SIZE * 3;
         const scale = targetSize / texture.width;
         
         sprite.scale.set(scale);
         sprite.anchor.set(0.5);

         // Position logic
         const px = (tile.x * targetSize) + (targetSize / 2);
         const py = (tile.y * targetSize) + (targetSize / 2);
         
         sprite.x = px;
         sprite.y = py;
         sprite.rotation = (tile.rotation * Math.PI) / 180;
         
         this.layerTiles.addChild(sprite);
     });
  }

  private reconcileZones(state: GameState, validZones: ZoneId[]): void {
    // Check for removed zones (rare, but good practice)
    for (const [id, graphic] of this.zoneGraphics) {
      if (!state.zones[id]) {
        this.layerZones.removeChild(graphic);
        this.zoneGraphics.delete(id);
      }
    }

    Object.values(state.zones).forEach((zone) => {
      let graphic = this.zoneGraphics.get(zone.id);
      
      if (!graphic) {
        graphic = new PIXI.Graphics();
        this.layerZones.addChild(graphic);
        this.zoneGraphics.set(zone.id, graphic);
      }
      
      const hasTiles = !!state.tiles && state.tiles.length > 0;
      this.drawZone(graphic, zone, validZones.includes(zone.id), state, hasTiles);
    });
  }

  private drawZone(graphic: PIXI.Graphics, zone: Zone, isValidMove: boolean, state: GameState, hasTiles: boolean): void {
    const layout = this.getZoneLayout(zone.id);
    
    graphic.clear();

    // --- 1. Draw Floor ---
    const x = layout.col * TILE_SIZE;
    const y = layout.row * TILE_SIZE;
    const width = layout.w * TILE_SIZE;
    const height = layout.h * TILE_SIZE;

    if (hasTiles) {
        // If tiles exist, we only draw HIGHLIGHTS, not the base floor color
        if (isValidMove) {
            graphic.rect(x, y, width, height);
            graphic.fill({ color: 0x00FF00, alpha: 0.3 }); // Green overlay
        }
        
        // Debug / Editor mode might want grid lines
        // graphic.rect(x, y, width, height);
        // graphic.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
    } else {
        // Legacy Mode: Procedural Colors
        let color = 0x333333; // Default Street Gray
        if (zone.isBuilding) color = 0x554444; // Building Brownish
        if (isValidMove) color = 0x225522; // Highlight Green
        if (zone.isExit) color = 0x224466; // Exit Zone Blue-ish (Unique Color)

        graphic.rect(x, y, width, height);
        graphic.fill({ color });
        
        // Grid Lines (Subtle)
        graphic.stroke({ width: 1, color: 0x444444, alpha: 0.5 });
    }

    // --- 2. Draw Walls & Doors ---
    // Walls should ALWAYS be drawn for clarity, even with tiles
    // Iterate over each cell in the zone to check neighbors
    for (let i = 0; i < layout.w; i++) {
      for (let j = 0; j < layout.h; j++) {
        const gridX = layout.col + i;
        const gridY = layout.row + j;
        
        this.drawCellEdges(graphic, zone, gridX, gridY, state);
      }
    }

    // --- 3. Indicators (Noise, Searchable, Markers) ---
    if (zone.noiseTokens > 0) {
      graphic.circle(x + width - 20, y + 20, 10);
      graphic.fill({ color: 0xFFFF00 });
    }
    
    if (zone.searchable && zone.isBuilding) {
       graphic.circle(x + 20, y + 20, 5);
       graphic.fill({ color: 0xFFFFFF });
       graphic.stroke({ width: 1, color: 0x000000 });
    }

    // Spawn Point indicator (red diamond)
    if (zone.spawnPoint) {
      const cx = x + width / 2;
      const cy = y + height - 20;
      graphic.moveTo(cx, cy - 10);
      graphic.lineTo(cx + 8, cy);
      graphic.lineTo(cx, cy + 10);
      graphic.lineTo(cx - 8, cy);
      graphic.closePath();
      graphic.fill({ color: 0xFF0000 });
      graphic.stroke({ width: 1, color: 0x000000 });
    }

    // Exit indicator (blue arrow)
    if (zone.isExit) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      graphic.rect(cx - 15, cy - 15, 30, 30);
      graphic.fill({ color: 0x2244AA, alpha: 0.6 });
      graphic.stroke({ width: 2, color: 0x4488FF });
      // Arrow shape
      graphic.moveTo(cx - 6, cy + 6);
      graphic.lineTo(cx + 6, cy);
      graphic.lineTo(cx - 6, cy - 6);
      graphic.stroke({ width: 3, color: 0xFFFFFF });
    }

    // Objective token indicator (gold star)
    if (zone.hasObjective) {
      const cx = x + 25;
      const cy = y + height - 25;
      graphic.circle(cx, cy, 10);
      graphic.fill({ color: 0xFFD700 });
      graphic.stroke({ width: 2, color: 0x000000 });
      // Inner dot
      graphic.circle(cx, cy, 3);
      graphic.fill({ color: 0x000000 });
    }
  }

  private drawCellEdges(g: PIXI.Graphics, zone: Zone, gx: number, gy: number, state: GameState): void {
    const cellSize = TILE_SIZE;
    const worldX = gx * TILE_SIZE;
    const worldY = gy * TILE_SIZE;

    // Helper to get neighbor zone
    const getNeighbor = (nx: number, ny: number): ZoneId | null => {
      // 1. Try static grid
      const key = `${nx},${ny}`;
      if (this.grid[key]) return this.grid[key];

      // 2. Try dynamic ID convention
      const dynamicId = `z_${nx}_${ny}`;
      if (state.zones[dynamicId]) return dynamicId;

      return null;
    };

    const checkAndDrawEdge = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
      const neighborId = getNeighbor(nx, ny);
      
      // 1. Same Zone (Internal Cell Border) -> Draw Nothing (Open)
      if (neighborId === zone.id) return;

      let drawWall = true;
      let isDoor = false;
      let isGap = false;
      let doorOpen = false;

      if (neighborId) {
        const isConnected = zone.connectedZones.includes(neighborId);
        const neighbor = state.zones[neighborId];
        
        if (isConnected && neighbor) {
          // Use edge-level connection data if available
          const conn = zone.connections?.find(c => c.toZoneId === neighborId);

          if (conn && conn.hasDoor) {
            // Explicit door on this edge
            drawWall = true;
            isDoor = true;
            doorOpen = conn.doorOpen;
          } else if (zone.isBuilding && neighbor.isBuilding) {
            // Building <-> Building = Wall with Gap (open passage between rooms)
            drawWall = true;
            isGap = true;
          } else if (!zone.isBuilding && !neighbor.isBuilding) {
            // Street <-> Street = Open
            drawWall = false;
          } else {
            // Building <-> Street connected but no door = open passage
            drawWall = false;
          }
        } else {
           // Not connected -> Solid Wall
           drawWall = true;
        }
      } else {
        // No Neighbor (Map Edge) -> Solid Wall
        drawWall = true;
      }

      if (drawWall) {
        if (isDoor) {
          this.drawDoor(g, x1, y1, x2, y2, doorOpen);
        } else if (isGap) {
          this.drawGap(g, x1, y1, x2, y2);
        } else {
          // Solid Wall
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.stroke({ width: 4, color: 0x000000, cap: 'round' });
        }
      }
    };

    // North
    checkAndDrawEdge(worldX, worldY, worldX + cellSize, worldY, gx, gy - 1);
    // South
    checkAndDrawEdge(worldX, worldY + cellSize, worldX + cellSize, worldY + cellSize, gx, gy + 1);
    // West
    checkAndDrawEdge(worldX, worldY, worldX, worldY + cellSize, gx - 1, gy);
    // East
    checkAndDrawEdge(worldX + cellSize, worldY, worldX + cellSize, worldY + cellSize, gx + 1, gy);
  }

  private drawGap(g: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number): void {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const gapSize = 60; // Wider than a door

    // If vertical edge
    if (x1 === x2) {
       // Top part
       g.moveTo(x1, y1);
       g.lineTo(x1, cy - gapSize/2);
       g.stroke({ width: 4, color: 0x000000, cap: 'round' });
       
       // Bottom part
       g.moveTo(x1, cy + gapSize/2);
       g.lineTo(x1, y2);
       g.stroke({ width: 4, color: 0x000000, cap: 'round' });
    } else {
       // Horizontal edge
       // Left part
       g.moveTo(x1, y1);
       g.lineTo(cx - gapSize/2, y1);
       g.stroke({ width: 4, color: 0x000000, cap: 'round' });
       
       // Right part
       g.moveTo(cx + gapSize/2, y1);
       g.lineTo(x2, y1);
       g.stroke({ width: 4, color: 0x000000, cap: 'round' });
    }
  }

  private drawDoor(g: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, isOpen: boolean): void {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    // Wall segments
    const gapSize = 40;
    
    // If vertical edge
    if (x1 === x2) {
       // Top part
       g.moveTo(x1, y1);
       g.lineTo(x1, cy - gapSize/2);
       g.stroke({ width: 4, color: 0x000000 });
       
       // Bottom part
       g.moveTo(x1, cy + gapSize/2);
       g.lineTo(x1, y2);
       g.stroke({ width: 4, color: 0x000000 });

       // Door Visual
       if (isOpen) {
         // Open Door (Angled)
         g.moveTo(x1, cy - gapSize/2);
         g.lineTo(x1 - 20, cy + gapSize/4);
         g.stroke({ width: 3, color: 0x00FF00 }); // Green for open
       } else {
         // Closed Door (Solid Fill)
         g.rect(x1 - 4, cy - gapSize/2, 8, gapSize);
         g.fill({ color: 0x8B4513 }); // Wood Brown
         g.stroke({ width: 1, color: 0x000000 });
       }
    } else {
       // Horizontal edge
       // Left part
       g.moveTo(x1, y1);
       g.lineTo(cx - gapSize/2, y1);
       g.stroke({ width: 4, color: 0x000000 });
       
       // Right part
       g.moveTo(cx + gapSize/2, y1);
       g.lineTo(x2, y1);
       g.stroke({ width: 4, color: 0x000000 });

       // Door Visual
       if (isOpen) {
         // Open Door (Angled)
         g.moveTo(cx - gapSize/2, y1);
         g.lineTo(cx + gapSize/4, y1 - 20);
         g.stroke({ width: 3, color: 0x00FF00 });
       } else {
         // Closed Door
         g.rect(cx - gapSize/2, y1 - 4, gapSize, 8);
         g.fill({ color: 0x8B4513 });
         g.stroke({ width: 1, color: 0x000000 });
       }
    }
  }

  private reconcileEntities(state: GameState, activeId?: EntityId): void {
    const currentIds = new Set<EntityId>();
    
    // Combine lists
    const allEntities: (Survivor | Zombie)[] = [
      ...Object.values(state.survivors),
      ...Object.values(state.zombies)
    ];

    // Group for layout
    const entitiesByZone = this.groupEntitiesByZone(allEntities);

    for (const entity of allEntities) {
      currentIds.add(entity.id);
      
      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.createEntitySprite(entity);
        this.container.addChild(sprite);
        this.entitySprites.set(entity.id, sprite);
        // Note: New sprites appear instantly unless AnimationController intervenes via Events
      }

      // Update Visuals (Highlight, Wounds)
      this.updateEntityVisuals(sprite, entity, state, activeId);

      // Update Position (Layout Logic)
      const zoneEntities = entitiesByZone[entity.position.zoneId] || [];
      const index = zoneEntities.indexOf(entity); // Inefficient O(N^2) total, but N is small per zone
      
      const pos = this.calculatePosition(entity.position.zoneId, index, this.isZombie(entity));
      
      // Direct update (AnimationController can tween this if needed)
      sprite.position.set(pos.x, pos.y);
    }

    // Cleanup Removed Entities
    for (const [id, sprite] of this.entitySprites) {
      if (!currentIds.has(id)) {
        this.container.removeChild(sprite);
        this.entitySprites.delete(id);
      }
    }
  }

  private createEntitySprite(entity: Survivor | Zombie): PIXI.Container {
    const container = new PIXI.Container();
    const graphics = new PIXI.Graphics();
    container.addChild(graphics);
    
    // We draw the shape once, visuals updated later
    return container;
  }

  private getPlayerColor(playerId: string, state: GameState): number {
    const playerIndex = state.players.indexOf(playerId);
    // Colors: Red, Blue, Green, Yellow, Purple, Cyan
    const colors = [0xFF0000, 0x0000FF, 0x00FF00, 0xFFFF00, 0xFF00FF, 0x00FFFF];
    if (playerIndex === -1) return 0xAAAAAA; // Fallback Gray
    return colors[playerIndex % colors.length];
  }

  private updateEntityVisuals(container: PIXI.Container, entity: Survivor | Zombie, state: GameState, activeId?: EntityId): void {
    const graphics = container.children[0] as PIXI.Graphics;
    graphics.clear();

    if (this.isZombie(entity)) {
      let color = 0x00FF00;
      if (entity.type === 'RUNNER') color = 0xFF8800;
      if (entity.type === 'FATTY') color = 0xFF00FF;
      if (entity.type === 'ABOMINATION') color = 0xFF0000;

      graphics.circle(0, 0, ENTITY_RADIUS);
      graphics.fill({ color });
      graphics.stroke({ width: 2, color: 0x000000 });
    } else {
      // Survivor
      const survivor = entity as Survivor;
      const isSelected = entity.id === activeId;
      const isActiveTurn = state.players[state.activePlayerIndex] === survivor.playerId;
      
      // 1. Selection Highlight (Local Player Selection)
      if (isSelected) {
        graphics.circle(0, 0, ENTITY_RADIUS + 6);
        graphics.fill({ color: 0xFFFFFF, alpha: 0.5 }); // White Glow
      }

      // 2. Active Player Highlight (Turn Indicator)
      if (isActiveTurn) {
        // Draw a pulsing ring or specialized border
        graphics.circle(0, 0, ENTITY_RADIUS + 4);
        graphics.stroke({ width: 3, color: 0xFFD700 }); // Gold Border
      }

      // 3. Survivor Body (Player Color)
      const playerColor = this.getPlayerColor(survivor.playerId, state);
      
      graphics.circle(0, 0, ENTITY_RADIUS);
      graphics.fill({ color: playerColor });
      
      // 4. Wound Indicator
      if (survivor.wounds > 0) {
        graphics.stroke({ width: 3, color: 0xFF0000 }); // Red Outline if wounded
      } else {
        // Standard Outline (Black for contrast against colored body)
        graphics.stroke({ width: 2, color: 0x000000 });
      }
    }
  }

  private calculatePosition(zoneId: ZoneId, index: number, isZombie: boolean): { x: number, y: number } {
    const layout = this.getZoneLayout(zoneId);
    const zoneX = layout.col * TILE_SIZE;
    const zoneY = layout.row * TILE_SIZE;
    const zoneH = layout.h * TILE_SIZE;

    if (isZombie) {
      // Bottom align
      const offsetX = 30 + (index % 4) * ENTITY_SPACING;
      const offsetY = zoneH - 30 - Math.floor(index / 4) * ENTITY_SPACING;
      return { x: zoneX + offsetX, y: zoneY + offsetY };
    } else {
      // Top align
      const offsetX = 30 + (index % 3) * ENTITY_SPACING;
      const offsetY = 30 + Math.floor(index / 3) * ENTITY_SPACING;
      return { x: zoneX + offsetX, y: zoneY + offsetY };
    }
  }

  private isZombie(entity: any): entity is Zombie {
    return (entity as Zombie).type !== undefined;
  }

  private groupEntitiesByZone(entities: (Survivor | Zombie)[]): Record<ZoneId, (Survivor | Zombie)[]> {
    const groups: Record<ZoneId, (Survivor | Zombie)[]> = {};
    for (const entity of entities) {
      const z = entity.position.zoneId;
      if (!groups[z]) groups[z] = [];
      groups[z].push(entity);
    }
    return groups;
  }
}
