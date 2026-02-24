// src/client/PixiBoardRenderer.ts

import * as PIXI from 'pixi.js';
import { GameState, ZoneId, EntityId, Survivor, Zombie, Zone } from '../types/GameState';
import { ZONE_LAYOUT, TILE_SIZE, ENTITY_RADIUS, ENTITY_SPACING } from '../config/Layout';

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
  private lastDragPos = { x: 0, y: 0 };

  // State-tracking cache for reconciliation
  private entitySprites: Map<EntityId, PIXI.Container> = new Map();
  private zoneGraphics: Map<ZoneId, PIXI.Graphics> = new Map();

  constructor(app: PIXI.Application) {
    this.app = app;
    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);
    this.grid = buildGrid();

    this.setupCameraControls();
  }

  private setupCameraControls(): void {
    // Make stage interactive for background dragging
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e) => {
      this.isDragging = true;
      this.lastDragPos = { x: e.global.x, y: e.global.y };
    });

    this.app.stage.on('pointerup', () => {
      this.isDragging = false;
    });

    this.app.stage.on('pointerupoutside', () => {
      this.isDragging = false;
    });

    this.app.stage.on('pointermove', (e) => {
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

  public screenToWorld(x: number, y: number): { x: number, y: number } {
    const point = new PIXI.Point(x, y);
    const local = this.container.toLocal(point);
    return { x: local.x, y: local.y };
  }

  public render(state: GameState, options: RenderOptions = {}): void {
    // 1. Zones (Board)
    this.reconcileZones(state, options.validMoveZones || []);

    // 2. Entities (Survivors & Zombies)
    this.reconcileEntities(state, options.activeSurvivorId);
  }

  private reconcileZones(state: GameState, validZones: ZoneId[]): void {
    // Check for removed zones (rare, but good practice)
    for (const [id, graphic] of this.zoneGraphics) {
      if (!state.zones[id]) {
        this.container.removeChild(graphic);
        this.zoneGraphics.delete(id);
      }
    }

    Object.values(state.zones).forEach((zone) => {
      let graphic = this.zoneGraphics.get(zone.id);
      
      if (!graphic) {
        graphic = new PIXI.Graphics();
        this.container.addChildAt(graphic, 0); // Keep zones at bottom
        this.zoneGraphics.set(zone.id, graphic);
      }

      this.drawZone(graphic, zone, validZones.includes(zone.id), state);
    });
  }

  private drawZone(graphic: PIXI.Graphics, zone: Zone, isValidMove: boolean, state: GameState): void {
    const layout = ZONE_LAYOUT[zone.id] || { col: 0, row: 0, w: 1, h: 1 };
    
    graphic.clear();

    // --- 1. Draw Floor ---
    const x = layout.col * TILE_SIZE;
    const y = layout.row * TILE_SIZE;
    const width = layout.w * TILE_SIZE;
    const height = layout.h * TILE_SIZE;

    let color = 0x333333; // Default Street Gray
    if (zone.isBuilding) color = 0x554444; // Building Brownish
    if (isValidMove) color = 0x225522; // Highlight Green
    if (zone.isExit) color = 0x224466; // Exit Zone Blue-ish (Unique Color)

    graphic.rect(x, y, width, height);
    graphic.fill({ color });
    
    // Grid Lines (Subtle)
    graphic.stroke({ width: 1, color: 0x444444, alpha: 0.5 });

    // --- 2. Draw Walls & Doors ---
    // Iterate over each cell in the zone to check neighbors
    for (let i = 0; i < layout.w; i++) {
      for (let j = 0; j < layout.h; j++) {
        const gridX = layout.col + i;
        const gridY = layout.row + j;
        
        this.drawCellEdges(graphic, zone, gridX, gridY, state);
      }
    }

    // --- 3. Indicators (Noise, Searchable) ---
    if (zone.noiseTokens > 0) {
      graphic.circle(x + width - 20, y + 20, 10);
      graphic.fill({ color: 0xFFFF00 });
      // Could add text for count here if using BitmapText
    }
    
    if (zone.searchable && zone.isBuilding) {
       // Search Icon Indicator (Small Magnifying Glass Proxy)
       graphic.circle(x + 20, y + 20, 5);
       graphic.fill({ color: 0xFFFFFF });
       graphic.stroke({ width: 1, color: 0x000000 });
    }
  }

  private drawCellEdges(g: PIXI.Graphics, zone: Zone, gx: number, gy: number, state: GameState): void {
    const cellSize = TILE_SIZE;
    const worldX = gx * TILE_SIZE;
    const worldY = gy * TILE_SIZE;

    // Helper to get neighbor zone
    const getNeighbor = (nx: number, ny: number): ZoneId | null => {
      const key = `${nx},${ny}`;
      return this.grid[key] || null;
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
        // Check connectivity
        const isConnected = zone.connectedZones.includes(neighborId);
        const neighbor = state.zones[neighborId];
        
        if (isConnected && neighbor) {
          // Connected Logic
          if (zone.isBuilding && neighbor.isBuilding) {
            // Building <-> Building = Wall with Gap
            drawWall = true;
            isGap = true;
          } else if (!zone.isBuilding && !neighbor.isBuilding) {
            // Street <-> Street = Open
            drawWall = false;
          } else {
            // Building <-> Street = Door
            drawWall = true; // Use wall as base
            isDoor = true;
            // Determine door state: use the building's state
            doorOpen = zone.isBuilding ? zone.doorOpen : neighbor.doorOpen;
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
    const layout = ZONE_LAYOUT[zoneId] || { col: 0, row: 0, w: 1, h: 1 };
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
