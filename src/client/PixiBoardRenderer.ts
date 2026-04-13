// src/client/PixiBoardRenderer.ts

import * as PIXI from 'pixi.js';
import { GameState, ZoneId, EntityId, Survivor, Zombie, ZombieType } from '../types/GameState';
import { TILE_SIZE, TILE_CELLS_PER_SIDE, TILE_PIXEL_SIZE, ENTITY_RADIUS, ENTITY_SPACING } from '../config/Layout';
import { tileService } from '../services/TileService';
import { TileInstance } from '../types/Map';
import { getPlayerColorNumeric } from './config/PlayerIdentities';
import { getZoneLayout, setZoneGeometry } from './utils/zoneLayout';
import { AnimationController } from './AnimationController';
import { AssetManager } from './AssetManager';
import { BOARD_THEME } from './config/BoardTheme';
import { getZombieTypeDisplay } from './config/ZombieTypeConfig';
import { tooltip } from './ui/components/Tooltip';
// Zone indicator icons loaded as static assets from /images/icons/

export interface RenderOptions {
  activeSurvivorId?: EntityId;
  validMoveZones?: ZoneId[];
  pendingMoveZoneId?: ZoneId;
  editorMode?: boolean;
}


export class PixiBoardRenderer {
  private app: PIXI.Application;
  private container: PIXI.Container;
  
  // Camera Control
  private isDragging = false;
  private _wasDragging = false;
  private lastDragPos = { x: 0, y: 0 };
  private _pointerIsDown = false;
  private _pointerStartPos: { x: number, y: number } | null = null;
  private activeTouchPoints: Map<number, { x: number, y: number }> = new Map();
  private pinchDistance = 0;
  private pinchCenter: { x: number, y: number } | null = null;
  private suppressTapUntil = 0;
  private _spacebarDown = false;
  private _abortController = new AbortController();

  // Animation
  private _animationController: AnimationController | null = null;

  // Assets
  private _assetManager: AssetManager | null = null;

  // State-tracking cache for reconciliation
  private entitySprites: Map<EntityId, PIXI.Container> = new Map();
  private tileSprites: PIXI.Container[] = [];
  private _lastTileHash: string = '';
  private _lastState: GameState | null = null;

  // Layers
  private layerGrid: PIXI.Container;
  private layerTiles: PIXI.Container;
  private layerSeams: PIXI.Container;
  private layerBoard: PIXI.Container;    // Single-pass zone overlay (fills + edges + indicators)
  private boardGraphics: PIXI.Graphics;  // One Graphics object for all zone visuals
  private iconContainer: PIXI.Container; // Lucide icon sprites (cleared each frame)
  private layerEntities: PIXI.Container;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    // Create Layers
    this.layerGrid = new PIXI.Container();
    this.layerTiles = new PIXI.Container();
    this.layerSeams = new PIXI.Container();
    this.layerBoard = new PIXI.Container();
    this.boardGraphics = new PIXI.Graphics();
    this.iconContainer = new PIXI.Container();
    this.layerBoard.addChild(this.boardGraphics);
    this.layerBoard.addChild(this.iconContainer);
    this.layerEntities = new PIXI.Container();

    this.container.addChild(this.layerGrid);
    this.container.addChild(this.layerTiles);
    this.container.addChild(this.layerSeams);
    this.container.addChild(this.layerBoard);
    this.container.addChild(this.layerEntities);

    // Ensure tiles loaded
    tileService.loadAssets();

    // Pre-load Lucide icon textures for zone indicators
    PIXI.Assets.load([
      '/images/icons/alert-triangle.svg',
      '/images/icons/search-white.svg',
      '/images/icons/skull-red.svg',
      '/images/icons/door-open-white.svg',
    ]);

    this.setupCameraControls();
  }

  /** Whether spacebar is currently held (used by editor for pan mode). */
  public get spacebarDown(): boolean { return this._spacebarDown; }

  private setupCameraControls(): void {
    // Make stage interactive for background dragging
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    // Spacebar pan mode
    const signal = this._abortController.signal;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          this._spacebarDown = true;
          this.app.canvas.style.cursor = 'grab';
          tooltip.hide();
        }
      }
    }, { signal });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this._spacebarDown = false;
        if (this.isDragging) {
          this._wasDragging = true;
          this.suppressTapUntil = Date.now() + 150;
          this.isDragging = false;
          this._pointerIsDown = false;
          this._pointerStartPos = null;
        }
        this.app.canvas.style.cursor = '';
      }
    }, { signal });

    this.app.stage.on('pointerdown', (e) => {
      this._wasDragging = false;

      if (e.pointerType === 'touch') {
        this.activeTouchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y });

        if (this.activeTouchPoints.size === 1) {
          this._pointerStartPos = { x: e.global.x, y: e.global.y };
          this._pointerIsDown = true;
          this.lastDragPos = { x: e.global.x, y: e.global.y };
        } else if (this.activeTouchPoints.size >= 2) {
          this.beginPinch();
        }
        return;
      }

      // Only start drag on middle mouse button (wheel click) to avoid
      // conflicting with left-click tile placement in editor mode
      if (e.button === 1) {
        this.isDragging = true;
        this.lastDragPos = { x: e.global.x, y: e.global.y };
      }
      // Spacebar + left-click: immediate pan (no threshold)
      if (e.button === 0 && this._spacebarDown) {
        this.isDragging = true;
        this.lastDragPos = { x: e.global.x, y: e.global.y };
        this.app.canvas.style.cursor = 'grabbing';
        return;
      }
      // Left-click drag: track start position for drag-threshold detection
      if (e.button === 0) {
        this._pointerStartPos = { x: e.global.x, y: e.global.y };
        this._pointerIsDown = true;
      }
    });

    this.app.stage.on('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        this.activeTouchPoints.delete(e.pointerId);

        if (this.activeTouchPoints.size >= 2) {
          this.beginPinch();
          return;
        }

        if (this.activeTouchPoints.size === 1) {
          const remaining = Array.from(this.activeTouchPoints.values())[0];
          this._pointerStartPos = { x: remaining.x, y: remaining.y };
          this.lastDragPos = { x: remaining.x, y: remaining.y };
          this._pointerIsDown = true;
          this.pinchDistance = 0;
          this.pinchCenter = null;
          this.isDragging = false;
          return;
        }

        if (this.isDragging || this.pinchCenter) {
          this._wasDragging = true;
          this.suppressTapUntil = Date.now() + 150;
        }
        this.endPointerGesture();
        return;
      }

      // Preserve drag state for one frame so editor's pointerup handler can check it
      if (this.isDragging) {
        this._wasDragging = true;
        this.suppressTapUntil = Date.now() + 150;
      }
      this.endPointerGesture();
    });

    this.app.stage.on('pointerupoutside', (e) => {
      if (e.pointerType === 'touch') {
        this.activeTouchPoints.delete(e.pointerId);
        if (this.activeTouchPoints.size === 0) {
          if (this.isDragging || this.pinchCenter) {
            this.suppressTapUntil = Date.now() + 150;
          }
          this.endPointerGesture();
        }
        return;
      }

      if (this.isDragging) {
        this._wasDragging = true;
        this.suppressTapUntil = Date.now() + 150;
      }
      this.endPointerGesture();
    });

    this.app.stage.on('pointercancel', (e) => {
      if (e.pointerType === 'touch') {
        this.activeTouchPoints.delete(e.pointerId);
      }
      this.endPointerGesture();
      this.suppressTapUntil = Date.now() + 150;
    });

    this.app.stage.on('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        if (!this.activeTouchPoints.has(e.pointerId)) return;

        this.activeTouchPoints.set(e.pointerId, { x: e.global.x, y: e.global.y });

        if (this.activeTouchPoints.size >= 2) {
          const pinch = this.getPinchMetrics();
          if (!pinch) return;

          if (!this.pinchCenter || this.pinchDistance <= 0) {
            this.pinchCenter = pinch.center;
            this.pinchDistance = pinch.distance;
            return;
          }

          const dx = pinch.center.x - this.pinchCenter.x;
          const dy = pinch.center.y - this.pinchCenter.y;
          this.container.x += dx;
          this.container.y += dy;

          if (this.pinchDistance > 0 && pinch.distance > 0) {
            const scaleDelta = pinch.distance / this.pinchDistance;
            const targetScale = this.container.scale.x * scaleDelta;
            this.applyZoom(targetScale, pinch.center.x, pinch.center.y);
          }

          this.pinchCenter = pinch.center;
          this.pinchDistance = pinch.distance;
          this.isDragging = true;
          this._wasDragging = true;
          this.suppressTapUntil = Date.now() + 150;
          return;
        }

        if (this._pointerIsDown && this._pointerStartPos) {
          const dx = e.global.x - this._pointerStartPos.x;
          const dy = e.global.y - this._pointerStartPos.y;
          if (!this.isDragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
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
          this._wasDragging = true;
          this.suppressTapUntil = Date.now() + 150;
        }
        return;
      }

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
      
      const newScale = this.container.scale.x * (zoomIn ? scaleFactor : 1 / scaleFactor);

      // Zoom towards mouse pointer
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.applyZoom(newScale, mouseX, mouseY);
    }, { passive: false, signal });
  }

  private endPointerGesture(): void {
    this.isDragging = false;
    this._pointerIsDown = false;
    this._pointerStartPos = null;
    this.pinchDistance = 0;
    this.pinchCenter = null;
  }

  private beginPinch(): void {
    const pinch = this.getPinchMetrics();
    if (!pinch) return;
    this.pinchDistance = pinch.distance;
    this.pinchCenter = pinch.center;
    this._pointerIsDown = false;
    this._pointerStartPos = null;
  }

  private getPinchMetrics(): { distance: number, center: { x: number, y: number } } | null {
    if (this.activeTouchPoints.size < 2) return null;
    const points = Array.from(this.activeTouchPoints.values());
    const p1 = points[0];
    const p2 = points[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return {
      distance: Math.sqrt(dx * dx + dy * dy),
      center: {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      }
    };
  }

  private applyZoom(targetScale: number, screenX: number, screenY: number): void {
    const newScale = Math.max(0.2, Math.min(targetScale, 3.0));
    const worldPos = {
      x: (screenX - this.container.x) / this.container.scale.x,
      y: (screenY - this.container.y) / this.container.scale.y
    };

    this.container.scale.set(newScale);
    this.container.position.set(
      screenX - worldPos.x * newScale,
      screenY - worldPos.y * newScale,
    );
  }

  public setAnimationController(controller: AnimationController): void {
    this._animationController = controller;
  }

  public setAssetManager(manager: AssetManager): void {
    this._assetManager = manager;
  }

  /**
   * Returns a sprite by ID if it exists in the scene.
   * Used by AnimationController.
   */
  public getSprite(id: EntityId): PIXI.Container | undefined {
    return this.entitySprites.get(id);
  }

  /** Returns true when latest pointer gesture should suppress click actions. */
  public consumeGestureSuppression(): boolean {
    const now = Date.now();
    const shouldSuppress = this._wasDragging || now < this.suppressTapUntil;
    this._wasDragging = false;
    return shouldSuppress;
  }

  /** Backward compatible gesture check used by editor mode. */
  public get wasDragging(): boolean {
    return this._wasDragging || Date.now() < this.suppressTapUntil;
  }

  public screenToWorld(x: number, y: number): { x: number, y: number } {
    const point = new PIXI.Point(x, y);
    const local = this.container.toLocal(point);
    return { x: local.x, y: local.y };
  }


  public drawEditorGrid(width: number, height: number): void {
      this.layerGrid.removeChildren();
      const graphics = new PIXI.Graphics();
      this.layerGrid.addChild(graphics);

      // Draw Tiles Grid
      
      // Draw background rect for visibility
      graphics.rect(0, 0, width * TILE_PIXEL_SIZE, height * TILE_PIXEL_SIZE);
      graphics.fill({ color: BOARD_THEME.background });

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
      graphics.stroke({ width: BOARD_THEME.editorGrid.lineWidth, color: BOARD_THEME.editorGrid.lineColor, alpha: BOARD_THEME.editorGrid.lineAlpha });

  }

  public render(state: GameState, options: RenderOptions = {}): void {
    // 0. Update zone geometry for layout resolver
    setZoneGeometry(state.zoneGeometry ?? null);

    // 1. Tiles
    if (state.tiles) {
       this.renderTiles(state.tiles);
       this.renderSeams(state);
    }

    // 2. Board overlay (zones + edges + indicators — single pass)
    this.drawBoard(state, options.validMoveZones || [], options.pendingMoveZoneId, options.editorMode);

    // 3. Entities (Survivors & Zombies)
    this._lastState = state;
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
         
         const targetSize = TILE_PIXEL_SIZE;
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

  /**
   * Draw opaque strips at tile boundaries where both sides are street cells.
   * This covers the doubled lane markings that appear when two tiles share a street edge.
   */
  private renderSeams(state: GameState): void {
    this.layerSeams.removeChildren();
    if (!state.tiles || state.tiles.length < 2 || !state.zoneGeometry) return;

    const g = new PIXI.Graphics();
    const SEAM_WIDTH = 12; // pixels to cover on each side of the boundary
    const STREET_COLOR = BOARD_THEME.seam.streetColor;

    // Build a tile lookup: "tx,ty" → TileInstance
    const tileLookup = new Map<string, typeof state.tiles[0]>();
    for (const t of state.tiles) {
      tileLookup.set(`${t.x},${t.y}`, t);
    }

    for (const tile of state.tiles) {
      // Check east neighbor
      const eastKey = `${tile.x + 1},${tile.y}`;
      const eastTile = tileLookup.get(eastKey);
      if (eastTile) {
        // Check each cell pair along the shared edge
        for (let i = 0; i < TILE_CELLS_PER_SIDE; i++) {
          const cellAx = tile.x * TILE_CELLS_PER_SIDE + (TILE_CELLS_PER_SIDE - 1);
          const cellAy = tile.y * TILE_CELLS_PER_SIDE + i;
          const cellBx = eastTile.x * TILE_CELLS_PER_SIDE;
          const cellBy = eastTile.y * TILE_CELLS_PER_SIDE + i;

          const zoneA = state.zoneGeometry.cellToZone[`${cellAx},${cellAy}`];
          const zoneB = state.zoneGeometry.cellToZone[`${cellBx},${cellBy}`];

          if (zoneA && zoneB && state.zones[zoneA] && state.zones[zoneB]) {
            const bothStreet = !state.zones[zoneA].isBuilding && !state.zones[zoneB].isBuilding;
            if (bothStreet) {
              const boundaryX = (tile.x + 1) * TILE_PIXEL_SIZE;
              const cellWorldY = cellAy * TILE_SIZE;
              g.rect(boundaryX - SEAM_WIDTH, cellWorldY + 2, SEAM_WIDTH * 2, TILE_SIZE - 4);
              g.fill({ color: STREET_COLOR, alpha: BOARD_THEME.seam.alpha });
            }
          }
        }
      }

      // Check south neighbor
      const southKey = `${tile.x},${tile.y + 1}`;
      const southTile = tileLookup.get(southKey);
      if (southTile) {
        for (let i = 0; i < TILE_CELLS_PER_SIDE; i++) {
          const cellAx = tile.x * TILE_CELLS_PER_SIDE + i;
          const cellAy = tile.y * TILE_CELLS_PER_SIDE + (TILE_CELLS_PER_SIDE - 1);
          const cellBx = southTile.x * TILE_CELLS_PER_SIDE + i;
          const cellBy = southTile.y * TILE_CELLS_PER_SIDE;

          const zoneA = state.zoneGeometry.cellToZone[`${cellAx},${cellAy}`];
          const zoneB = state.zoneGeometry.cellToZone[`${cellBx},${cellBy}`];

          if (zoneA && zoneB && state.zones[zoneA] && state.zones[zoneB]) {
            const bothStreet = !state.zones[zoneA].isBuilding && !state.zones[zoneB].isBuilding;
            if (bothStreet) {
              const cellWorldX = cellAx * TILE_SIZE;
              const boundaryY = (tile.y + 1) * TILE_PIXEL_SIZE;
              g.rect(cellWorldX + 2, boundaryY - SEAM_WIDTH, TILE_SIZE - 4, SEAM_WIDTH * 2);
              g.fill({ color: STREET_COLOR, alpha: BOARD_THEME.seam.alpha });
            }
          }
        }
      }
    }

    this.layerSeams.addChild(g);
  }

  /**
   * Single-pass board overlay: draws zone fills, edges, and indicators
   * on one PIXI.Graphics object. Matches the proven MapEditor overlay pattern.
   */
  private drawBoard(state: GameState, validZones: ZoneId[], pendingMoveZoneId?: ZoneId, editorMode?: boolean): void {
    const g = this.boardGraphics;
    g.clear();
    this.iconContainer.removeChildren();

    const geo = state.zoneGeometry;
    if (!geo) return;

    const hasTiles = !!state.tiles && state.tiles.length > 0;

    // Build spawn point numbering map — use spawnZoneIds order (placement order from map editor)
    const spawnNumberMap = new Map<string, number>();
    if (state.spawnZoneIds) {
      state.spawnZoneIds.forEach((id, i) => spawnNumberMap.set(id, i + 1));
    } else {
      let spawnIdx = 1;
      for (const zone of Object.values(state.zones)) {
        if (zone.spawnPoint) spawnNumberMap.set(zone.id, spawnIdx++);
      }
    }

    // --- 1. Zone fills ---
    for (const zone of Object.values(state.zones)) {
      const cells = geo.zoneCells[zone.id];
      if (!cells) continue;

      const isValidMove = validZones.includes(zone.id);
      const isPendingMove = zone.id === pendingMoveZoneId;

      if (hasTiles) {
        if (isValidMove) {
          for (const c of cells) {
            g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            g.fill({ color: BOARD_THEME.zone.validMoveHighlight, alpha: 0.3 });
          }
        }
        if (isPendingMove) {
          const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
          for (const c of cells) {
            g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            g.fill({ color: BOARD_THEME.zone.pendingMoveHighlight, alpha: 0.5 });
          }
          // Zone-boundary outline only (no per-cell stroke)
          for (const c of cells) {
            const px = c.x * TILE_SIZE;
            const py = c.y * TILE_SIZE;
            if (!cellSet.has(`${c.x},${c.y - 1}`)) { g.moveTo(px, py); g.lineTo(px + TILE_SIZE, py); }
            if (!cellSet.has(`${c.x},${c.y + 1}`)) { g.moveTo(px, py + TILE_SIZE); g.lineTo(px + TILE_SIZE, py + TILE_SIZE); }
            if (!cellSet.has(`${c.x - 1},${c.y}`)) { g.moveTo(px, py); g.lineTo(px, py + TILE_SIZE); }
            if (!cellSet.has(`${c.x + 1},${c.y}`)) { g.moveTo(px + TILE_SIZE, py); g.lineTo(px + TILE_SIZE, py + TILE_SIZE); }
          }
          g.stroke({ width: 2, color: BOARD_THEME.zone.pendingMoveStroke, alpha: 0.9 });
        }
      } else {
        // No tiles — procedural zone colors
        let color: number = BOARD_THEME.zone.street;
        if (zone.isBuilding) color = BOARD_THEME.zone.building;
        if (isValidMove) color = BOARD_THEME.zone.validMove;
        if (isPendingMove) color = BOARD_THEME.zone.pendingMove;

        for (const c of cells) {
          g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          g.fill({ color });
        }
      }
    }

    // --- 2. Edges from compiled edgeClassMap ---
    const edgeMap = state.edgeClassMap;
    const W = 3;

    // Collect door edges for grouped plank rendering
    interface DoorEdge { x1: number; y1: number; x2: number; y2: number; isVertical: boolean; doorOpen: boolean }
    const doorEdges: DoorEdge[] = [];

    if (edgeMap) {
      for (const [ek, cls] of Object.entries(edgeMap)) {
        if (cls === 'open') continue;

        const [partA, partB] = ek.split('|');
        const [x1, y1] = partA.split(',').map(Number);
        const [x2, y2] = partB.split(',').map(Number);
        const isVertical = x1 !== x2;

        if (cls === 'wall') {
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            g.rect(ex - W / 2, y1 * TILE_SIZE, W, TILE_SIZE);
          } else {
            const ey = Math.max(y1, y2) * TILE_SIZE;
            g.rect(x1 * TILE_SIZE, ey - W / 2, TILE_SIZE, W);
          }
          g.fill({ color: BOARD_THEME.wall.color, alpha: BOARD_THEME.wall.alpha });
        } else if (cls === 'door') {
          let doorOpen = false;
          const zA = geo.cellToZone[`${x1},${y1}`];
          const zB = geo.cellToZone[`${x2},${y2}`];
          if (zA && zB && state.zones[zA]) {
            const conn = state.zones[zA].connections?.find(c => c.toZoneId === zB);
            if (conn) doorOpen = conn.doorOpen;
          }
          doorEdges.push({ x1, y1, x2, y2, isVertical, doorOpen });
        } else if (cls === 'crosswalk') {
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            const ey = y1 * TILE_SIZE;
            for (let dy = 2; dy < TILE_SIZE; dy += 6) {
              g.rect(ex - 1, ey + dy, 2, 3);
              g.fill({ color: BOARD_THEME.crosswalk.color, alpha: BOARD_THEME.crosswalk.alpha });
            }
          } else {
            const ex = x1 * TILE_SIZE;
            const ey = Math.max(y1, y2) * TILE_SIZE;
            for (let dx = 2; dx < TILE_SIZE; dx += 6) {
              g.rect(ex + dx, ey - 1, 3, 2);
              g.fill({ color: BOARD_THEME.crosswalk.color, alpha: BOARD_THEME.crosswalk.alpha });
            }
          }
        } else if (cls === 'doorway') {
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            const ey = y1 * TILE_SIZE;
            g.rect(ex - 2, ey + 4, 4, TILE_SIZE - 8);
            g.fill({ color: BOARD_THEME.doorway.color, alpha: BOARD_THEME.doorway.alpha });
          } else {
            const ex = x1 * TILE_SIZE;
            const ey = Math.max(y1, y2) * TILE_SIZE;
            g.rect(ex + 4, ey - 2, TILE_SIZE - 8, 4);
            g.fill({ color: BOARD_THEME.doorway.color, alpha: BOARD_THEME.doorway.alpha });
          }
        }
      }
    }

    // --- 3. Map boundary walls ---
    const allCells = new Set<string>();
    for (const cells of Object.values(geo.zoneCells)) {
      for (const c of cells) allCells.add(`${c.x},${c.y}`);
    }
    for (const key of allCells) {
      const [cx, cy] = key.split(',').map(Number);
      const wx = cx * TILE_SIZE;
      const wy = cy * TILE_SIZE;
      if (!allCells.has(`${cx},${cy - 1}`)) {
        g.rect(wx, wy - W / 2, TILE_SIZE, W);
        g.fill({ color: BOARD_THEME.wall.color, alpha: BOARD_THEME.wall.alpha });
      }
      if (!allCells.has(`${cx},${cy + 1}`)) {
        g.rect(wx, wy + TILE_SIZE - W / 2, TILE_SIZE, W);
        g.fill({ color: BOARD_THEME.wall.color, alpha: BOARD_THEME.wall.alpha });
      }
      if (!allCells.has(`${cx - 1},${cy}`)) {
        g.rect(wx - W / 2, wy, W, TILE_SIZE);
        g.fill({ color: BOARD_THEME.wall.color, alpha: BOARD_THEME.wall.alpha });
      }
      if (!allCells.has(`${cx + 1},${cy}`)) {
        g.rect(wx + TILE_SIZE - W / 2, wy, W, TILE_SIZE);
        g.fill({ color: BOARD_THEME.wall.color, alpha: BOARD_THEME.wall.alpha });
      }
    }

    // --- 3b. Grouped door plank rendering ---
    // Group adjacent door edges into visual door units (matching tile editor style)
    const doorVisited = new Set<number>();
    for (let i = 0; i < doorEdges.length; i++) {
      if (doorVisited.has(i)) continue;
      doorVisited.add(i);

      const first = doorEdges[i];
      const group = [first];

      // Find adjacent door edges in same orientation and open state
      for (let j = i + 1; j < doorEdges.length; j++) {
        if (doorVisited.has(j)) continue;
        const other = doorEdges[j];
        if (other.isVertical !== first.isVertical) continue;
        if (other.doorOpen !== first.doorOpen) continue;

        // Check adjacency to any member of the group
        for (const g of group) {
          let adjacent = false;
          if (first.isVertical) {
            // Vertical doors: same x boundary, adjacent y
            adjacent = g.x1 === other.x1 && g.x2 === other.x2 && Math.abs(g.y1 - other.y1) === 1;
          } else {
            // Horizontal doors: same y boundary, adjacent x
            adjacent = g.y1 === other.y1 && g.y2 === other.y2 && Math.abs(g.x1 - other.x1) === 1;
          }
          if (adjacent) {
            group.push(other);
            doorVisited.add(j);
            break;
          }
        }
      }

      const doorColor = first.doorOpen ? BOARD_THEME.door.open : BOARD_THEME.door.closed;
      const doorAlpha = first.doorOpen ? BOARD_THEME.door.openAlpha : BOARD_THEME.door.closedAlpha;
      const halfBar = BOARD_THEME.door.barWidth / 2;
      const gap = BOARD_THEME.door.plankGap;

      // Draw each plank individually (segmented look like tile editor)
      for (const edge of group) {
        if (edge.isVertical) {
          const ex = Math.max(edge.x1, edge.x2) * TILE_SIZE;
          const ey = edge.y1 * TILE_SIZE;
          g.rect(ex - halfBar, ey + gap, BOARD_THEME.door.barWidth, TILE_SIZE - gap * 2);
          g.fill({ color: doorColor, alpha: doorAlpha });
          g.stroke({ width: BOARD_THEME.door.strokeWidth, color: BOARD_THEME.door.strokeColor });
        } else {
          const ex = edge.x1 * TILE_SIZE;
          const ey = Math.max(edge.y1, edge.y2) * TILE_SIZE;
          g.rect(ex + gap, ey - halfBar, TILE_SIZE - gap * 2, BOARD_THEME.door.barWidth);
          g.fill({ color: doorColor, alpha: doorAlpha });
          g.stroke({ width: BOARD_THEME.door.strokeWidth, color: BOARD_THEME.door.strokeColor });
        }
      }

      // Draw outer border around entire door group (like editor)
      if (group.length > 0) {
        let minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
        for (const edge of group) {
          if (edge.isVertical) {
            const ex = Math.max(edge.x1, edge.x2) * TILE_SIZE;
            const ey = edge.y1 * TILE_SIZE;
            minPx = Math.min(minPx, ex - halfBar); minPy = Math.min(minPy, ey);
            maxPx = Math.max(maxPx, ex + halfBar); maxPy = Math.max(maxPy, ey + TILE_SIZE);
          } else {
            const ex = edge.x1 * TILE_SIZE;
            const ey = Math.max(edge.y1, edge.y2) * TILE_SIZE;
            minPx = Math.min(minPx, ex); minPy = Math.min(minPy, ey - halfBar);
            maxPx = Math.max(maxPx, ex + TILE_SIZE); maxPy = Math.max(maxPy, ey + halfBar);
          }
        }
        g.rect(minPx - 1, minPy - 1, maxPx - minPx + 2, maxPy - minPy + 2);
        g.stroke({ width: 1, color: BOARD_THEME.door.plankBorder, alpha: BOARD_THEME.door.plankBorderAlpha });
      }
    }

    // --- 4. Zone indicators (skip in editor mode — editor draws its own) ---
    if (editorMode) return;

    // Helper: add a Lucide icon sprite at (x, y) from static SVG asset
    const addIcon = (path: string, x: number, y: number, size = 24) => {
      const texture = PIXI.Texture.from(path);
      const sprite = new PIXI.Sprite(texture);
      sprite.width = size;
      sprite.height = size;
      sprite.position.set(x, y);
      this.iconContainer.addChild(sprite);
    };

    for (const zone of Object.values(state.zones)) {
      const layout = getZoneLayout(zone.id);
      const cx = (layout.centroidX ?? layout.col) * TILE_SIZE + TILE_SIZE / 2;
      const cy = (layout.centroidY ?? layout.row) * TILE_SIZE + TILE_SIZE / 2;

      if (zone.noiseTokens > 0) {
        // Lucide AlertTriangle at zone top-right corner
        const ox = (layout.col + layout.w) * TILE_SIZE - 24;
        const oy = layout.row * TILE_SIZE;
        addIcon('/images/icons/alert-triangle.svg', ox, oy);
      }

      if (zone.searchable && zone.isBuilding) {
        // Lucide Search at zone bottom-right corner
        const ox = (layout.col + layout.w) * TILE_SIZE - 24;
        const oy = (layout.row + layout.h) * TILE_SIZE - 24;
        addIcon('/images/icons/search-white.svg', ox, oy);
      }

      if (zone.spawnPoint) {
        // Lucide Skull at zone center
        addIcon('/images/icons/skull-red.svg', cx - 12, cy - 12);
        // Spawn number
        const spawnNum = spawnNumberMap.get(zone.id);
        if (spawnNum !== undefined) {
          const numText = new PIXI.Text({
            text: String(spawnNum),
            style: { fontFamily: 'Arial', fontSize: 10, fontWeight: 'bold', fill: BOARD_THEME.spawn.numberColor, stroke: { color: BOARD_THEME.spawn.numberStroke, width: 2 } },
          });
          numText.anchor.set(0.5);
          numText.position.set(cx + 12, cy - 3);
          this.iconContainer.addChild(numText);
        }
      }

      if (zone.isExit) {
        // Green rectangle background
        g.rect(cx - 14, cy - 14, 28, 28);
        g.fill({ color: 0x22AA44, alpha: 0.85 });
        g.stroke({ width: 2, color: 0x44DD66 });
        // Lucide DoorOpen icon, white
        addIcon('/images/icons/door-open-white.svg', cx - 12, cy - 12);
      }

      if (zone.hasObjective) {
        const ox = cx - TILE_SIZE / 2 + 25;
        const oy = cy + TILE_SIZE / 2 - 25;
        g.circle(ox, oy, 10);
        g.fill({ color: BOARD_THEME.objective.fillColor });
        g.stroke({ width: BOARD_THEME.objective.strokeWidth, color: BOARD_THEME.objective.strokeColor });
        g.circle(ox, oy, 3);
        g.fill({ color: BOARD_THEME.objective.dotColor });
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

      // Animate movement if entity has moved zones and is not mid-animation
      if (this._animationController && !this._animationController.isAnimating(entity.id)) {
        const oldX = sprite.position.x;
        const oldY = sprite.position.y;
        const moved = (oldX !== 0 || oldY !== 0) && (Math.abs(oldX - pos.x) > 1 || Math.abs(oldY - pos.y) > 1);
        if (moved) {
          this._animationController.animateMove(entity.id, oldX, oldY, pos.x, pos.y);
        } else {
          sprite.position.set(pos.x, pos.y);
        }
      } else if (!this._animationController || !this._animationController.isAnimating(entity.id)) {
        sprite.position.set(pos.x, pos.y);
      }
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

    // Enable pointer events for tooltip
    container.eventMode = 'static';
    container.cursor = 'pointer';

    // Hit area so hover works on the full circle
    container.hitArea = new PIXI.Circle(0, 0, ENTITY_RADIUS + 4);

    container.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
      if (this._spacebarDown || this.isDragging) return;
      const html = this.buildTooltipContent(entity.id);
      if (html) {
        tooltip.show(e.clientX, e.clientY, html);
      }
    });

    container.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (this._spacebarDown || this.isDragging) {
        tooltip.hide();
        return;
      }
      const html = this.buildTooltipContent(entity.id);
      if (html) {
        tooltip.show(e.clientX, e.clientY, html);
      }
    });

    container.on('pointerout', () => {
      tooltip.hide();
    });

    // We draw the shape once, visuals updated later
    return container;
  }

  private buildTooltipContent(entityId: EntityId): string | null {
    const state = this._lastState;
    if (!state) return null;

    const survivor = state.survivors[entityId];
    if (survivor) {
      const weapon = survivor.inventory.find(c => c.inHand && c.stats);
      const weaponName = weapon ? weapon.name : 'None';
      const hp = survivor.maxHealth - survivor.wounds;
      return `<div class="tooltip-title">${survivor.name}</div>`
        + `<div class="tooltip-row"><span>Health</span><span class="tooltip-value">${hp}/${survivor.maxHealth}</span></div>`
        + `<div class="tooltip-row"><span>Weapon</span><span class="tooltip-value">${weaponName}</span></div>`;
    }

    const zombie = state.zombies[entityId];
    if (zombie) {
      const display = getZombieTypeDisplay(zombie.type);
      return `<div class="tooltip-title" style="color:${display.colorHex}">${display.label}</div>`
        + `<div class="tooltip-row"><span>Wounds</span><span class="tooltip-value">${zombie.wounds}</span></div>`;
    }

    return null;
  }

  private getPlayerColor(playerId: string, state: GameState): number {
    return getPlayerColorNumeric(state, playerId);
  }

  private updateEntityVisuals(container: PIXI.Container, entity: Survivor | Zombie, state: GameState, activeId?: EntityId): void {
    const graphics = container.children[0] as PIXI.Graphics;
    graphics.clear();

    // Remove any existing sprite child (index 1+)
    while (container.children.length > 1) container.removeChildAt(1);

    if (this.isZombie(entity)) {
      const zombieTex = this._assetManager?.getZombieTexture(entity.type);
      if (zombieTex) {
        const sprite = new PIXI.Sprite(zombieTex);
        sprite.anchor.set(0.5);
        sprite.width = ENTITY_RADIUS * 2;
        sprite.height = ENTITY_RADIUS * 2;
        container.addChild(sprite);
        graphics.circle(0, 0, ENTITY_RADIUS);
        graphics.stroke({ width: 2, color: 0x000000 });
      } else {
        const display = getZombieTypeDisplay(entity.type);
        const r = ENTITY_RADIUS * display.boardScale;
        const sides = display.boardSides;

        // Draw polygon shape
        graphics.moveTo(0, -r);
        for (let i = 1; i <= sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          graphics.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        graphics.closePath();
        graphics.fill({ color: display.colorNumeric });
        graphics.stroke({ width: 2, color: 0x111111 });

        // Draw initial letter
        const text = new PIXI.Text({
          text: display.initial,
          style: { fontFamily: 'Arial', fontSize: BOARD_THEME.zombie.initialFontSize * display.boardScale, fontWeight: 'bold', fill: BOARD_THEME.zombie.initialColor },
        });
        text.anchor.set(0.5);
        container.addChild(text);
      }
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
        graphics.circle(0, 0, ENTITY_RADIUS + 4);
        graphics.stroke({ width: 3, color: 0xFFD700 }); // Gold Border
      }

      // 3. Survivor Body — sprite or colored circle
      const survivorTex = this._assetManager?.getSurvivorTexture(survivor.characterClass);
      if (survivorTex) {
        const sprite = new PIXI.Sprite(survivorTex);
        sprite.anchor.set(0.5);
        sprite.width = ENTITY_RADIUS * 2;
        sprite.height = ENTITY_RADIUS * 2;
        container.addChild(sprite);
        // Draw colored ring around sprite
        const playerColor = this.getPlayerColor(survivor.playerId, state);
        graphics.circle(0, 0, ENTITY_RADIUS);
        graphics.stroke({ width: 2, color: playerColor });
      } else {
        const playerColor = this.getPlayerColor(survivor.playerId, state);
        graphics.circle(0, 0, ENTITY_RADIUS);
        graphics.fill({ color: playerColor });
      }

      // 4. Wound Indicator
      if (survivor.wounds > 0) {
        graphics.stroke({ width: 3, color: 0xFF0000 }); // Red Outline if wounded
      } else if (!survivorTex) {
        // Standard Outline only for placeholder circles
        graphics.stroke({ width: 2, color: 0x000000 });
      }
    }
  }

  private calculatePosition(zoneId: ZoneId, index: number, isZombie: boolean): { x: number, y: number } {
    const layout = getZoneLayout(zoneId);

    // Use centroid for multi-cell zones, top-left corner for single-cell
    const centerX = layout.centroidX !== undefined
      ? layout.centroidX * TILE_SIZE + TILE_SIZE / 2
      : layout.col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = layout.centroidY !== undefined
      ? layout.centroidY * TILE_SIZE + TILE_SIZE / 2
      : layout.row * TILE_SIZE + TILE_SIZE / 2;

    if (isZombie) {
      // Bottom of zone center
      const offsetX = -30 + (index % 4) * ENTITY_SPACING;
      const offsetY = 20 + Math.floor(index / 4) * ENTITY_SPACING;
      return { x: centerX + offsetX, y: centerY + offsetY };
    } else {
      // Top of zone center
      const offsetX = -20 + (index % 3) * ENTITY_SPACING;
      const offsetY = -20 - Math.floor(index / 3) * ENTITY_SPACING;
      return { x: centerX + offsetX, y: centerY + offsetY };
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

  /** Tear down renderer, removing all event listeners and PIXI resources. */
  public destroy(): void {
    // Remove window/DOM event listeners via AbortController
    this._abortController.abort();

    // Remove all PIXI stage event listeners added by setupCameraControls
    this.app.stage.removeAllListeners();

    // Hide tooltip
    tooltip.hide();

    // Clear sprite caches
    this.entitySprites.clear();
    this.tileSprites = [];

    // Destroy the container tree (recursively destroys children)
    this.container.destroy({ children: true });
  }
}
