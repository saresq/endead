// src/client/PixiBoardRenderer.ts

import * as PIXI from 'pixi.js';
import { GameState, ZoneId, EntityId, Survivor, Zombie, ZombieType, DangerLevel, ObjectiveColor } from '../types/GameState';
import { TILE_SIZE, TILE_CELLS_PER_SIDE, TILE_PIXEL_SIZE, ENTITY_RADIUS, ENTITY_SPACING, MIN_ENTITY_RADIUS, GROUP_BADGE_RADIUS } from '../config/Layout';
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
  moveCostByZone?: Record<ZoneId, number>;
  availableDoorZones?: ZoneId[];
  sprintZones?: ZoneId[];
  attackZones?: ZoneId[];
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
  private groupBadges: Map<string, PIXI.Container> = new Map(); // keyed by `${zoneId}:${type}`
  private groupedRepresentatives = new Map<EntityId, { zoneId: ZoneId; type: ZombieType }>();
  private tileSprites: PIXI.Container[] = [];
  private _lastTileHash: string = '';
  private _lastState: GameState | null = null;

  // Layers
  private layerGrid: PIXI.Container;
  private layerTiles: PIXI.Container;
  private layerBoard: PIXI.Container;    // Single-pass zone overlay (fills + edges + indicators)
  private boardGraphics: PIXI.Graphics;  // One Graphics object for all zone visuals
  private iconContainer: PIXI.Container; // Lucide icon sprites (cleared each frame)
  private layerEntities: PIXI.Container;
  private layerBadges: PIXI.Container;

  // Empty-state blueprint placeholder (HUD-D1) — shown when no real map is
  // loaded. Lives on the stage (outside the camera-transformed container) so
  // it stays pinned to the viewport.
  private placeholderLayer: PIXI.Container;
  private placeholderVisible = false;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    // Create Layers
    this.layerGrid = new PIXI.Container();
    this.layerTiles = new PIXI.Container();
    this.layerBoard = new PIXI.Container();
    this.boardGraphics = new PIXI.Graphics();
    this.iconContainer = new PIXI.Container();
    this.layerBoard.addChild(this.boardGraphics);
    this.layerBoard.addChild(this.iconContainer);
    this.layerEntities = new PIXI.Container();
    this.layerBadges = new PIXI.Container();

    this.container.addChild(this.layerGrid);
    this.container.addChild(this.layerTiles);
    this.container.addChild(this.layerBoard);
    this.container.addChild(this.layerEntities);
    this.container.addChild(this.layerBadges);

    // Placeholder layer sits directly on the stage so it ignores camera pan/zoom.
    this.placeholderLayer = new PIXI.Container();
    this.placeholderLayer.visible = false;
    this.placeholderLayer.eventMode = 'none';
    this.app.stage.addChild(this.placeholderLayer);

    // Load tiles, then re-render if state arrived before tiles were ready
    tileService.loadAssets().then(() => {
      if (this._lastState?.tiles) {
        this._lastTileHash = '';  // force redraw
        this.renderTiles(this._lastState.tiles);
      }
    });

    // Pre-load Lucide icon textures for zone indicators
    PIXI.Assets.load([
      '/images/icons/alert-triangle.svg',
      '/images/icons/search-white.svg',
      '/images/icons/skull-red.svg',
      '/images/icons/door-open-white.svg',
      '/images/icons/sport-shoe-lightblue.svg',
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

    // Re-flow the empty-state placeholder when the viewport resizes so the
    // mobile/desktop variants swap at the right breakpoints.
    window.addEventListener('resize', () => {
      if (this.placeholderVisible) this.renderPlaceholder();
    }, { signal });

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

    // Empty-state blueprint: show a stylized placeholder when there is no
    // real map data to render (initial state, between operations, dev review).
    // Triggers when the editor has no tiles AND no zone geometry.
    const hasTiles = !!state.tiles && state.tiles.length > 0;
    const hasZoneGeometry = !!state.zoneGeometry;
    if (!hasTiles && !hasZoneGeometry && !options.editorMode) {
      this.renderPlaceholder();
    } else if (this.placeholderVisible) {
      this.clearPlaceholder();
    }

    // 1. Tiles
    if (state.tiles) {
       this.renderTiles(state.tiles);
    }

    // 2. Board overlay (zones + edges + indicators — single pass)
    this.drawBoard(state, options.validMoveZones || [], options.pendingMoveZoneId, options.editorMode, options.availableDoorZones || [], options.moveCostByZone, options.sprintZones || [], options.attackZones || []);

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
   * Single-pass board overlay: draws zone fills, edges, and indicators
   * on one PIXI.Graphics object. Matches the proven MapEditor overlay pattern.
   */
  private drawBoard(state: GameState, validZones: ZoneId[], pendingMoveZoneId?: ZoneId, editorMode?: boolean, doorHighlightZones: ZoneId[] = [], moveCostByZone?: Record<ZoneId, number>, sprintZones: ZoneId[] = [], attackZones: ZoneId[] = []): void {
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

    // --- 1b. AP cost labels on movement-highlighted zones ---
    if (moveCostByZone) {
      for (const zoneId of validZones) {
        const cost = moveCostByZone[zoneId];
        if (cost === undefined || cost <= 1) continue;
        const cells = geo.zoneCells[zoneId];
        if (!cells || cells.length === 0) continue;
        // Compute centroid
        let cx = 0, cy = 0;
        for (const c of cells) { cx += c.x; cy += c.y; }
        cx = (cx / cells.length) * TILE_SIZE + TILE_SIZE / 2;
        cy = (cy / cells.length) * TILE_SIZE + TILE_SIZE / 2;

        const label = new PIXI.Text({
          text: `${cost} AP`,
          style: {
            fontFamily: 'Arial',
            fontSize: 14,
            fontWeight: 'bold',
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5);
        label.position.set(cx, cy);
        this.iconContainer.addChild(label);
      }
    }

    // --- 1c. Sprint zone highlights (light blue fill + shoe icon) ---
    for (const zoneId of sprintZones) {
      if (validZones.includes(zoneId)) continue; // already highlighted as move zone
      const cells = geo.zoneCells[zoneId];
      if (!cells || cells.length === 0) continue;

      if (hasTiles) {
        for (const c of cells) {
          g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          g.fill({ color: 0x87CEEB, alpha: 0.3 });
        }
      }

      // Shoe icon at centroid
      let cx = 0, cy = 0;
      for (const c of cells) { cx += c.x; cy += c.y; }
      cx = (cx / cells.length) * TILE_SIZE + TILE_SIZE / 2;
      cy = (cy / cells.length) * TILE_SIZE + TILE_SIZE / 2;

      const iconSize = 20;
      const texture = PIXI.Texture.from('/images/icons/sport-shoe-lightblue.svg');
      const sprite = new PIXI.Sprite(texture);
      sprite.width = iconSize;
      sprite.height = iconSize;
      sprite.anchor.set(0.5);
      sprite.position.set(cx, cy);
      this.iconContainer.addChild(sprite);
    }

    // --- 1d. Attack zone highlights (red fill + swords icon) ---
    for (const zoneId of attackZones) {
      const cells = geo.zoneCells[zoneId];
      if (!cells || cells.length === 0) continue;

      if (hasTiles) {
        for (const c of cells) {
          g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          g.fill({ color: BOARD_THEME.attack.fillColor, alpha: BOARD_THEME.attack.fillAlpha });
        }
      }

      let cx = 0, cy = 0;
      for (const c of cells) { cx += c.x; cy += c.y; }
      cx = (cx / cells.length) * TILE_SIZE + TILE_SIZE / 2;
      cy = (cy / cells.length) * TILE_SIZE + TILE_SIZE / 2;

      const iconSize = 24;
      const texture = PIXI.Texture.from('/images/icons/swords-red.svg');
      const sprite = new PIXI.Sprite(texture);
      sprite.width = iconSize;
      sprite.height = iconSize;
      sprite.anchor.set(0.5);
      sprite.position.set(cx, cy);
      this.iconContainer.addChild(sprite);
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

    // --- 3c. Highlight zones with openable doors ---
    if (doorHighlightZones.length > 0) {
      for (const zoneId of doorHighlightZones) {
        const cells = geo.zoneCells[zoneId];
        if (!cells) continue;
        for (const c of cells) {
          g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          g.fill({ color: BOARD_THEME.door.highlightColor, alpha: BOARD_THEME.door.highlightAlpha });
        }
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
        // Noise indicator at zone top-right corner: triangle + count
        const iconSize = 24;
        const ox = (layout.col + layout.w) * TILE_SIZE - iconSize - 2;
        const oy = layout.row * TILE_SIZE + 2;
        addIcon('/images/icons/alert-triangle.svg', ox, oy, iconSize);

        // Noise count text overlaid on the triangle
        const numText = new PIXI.Text({
          text: String(zone.noiseTokens),
          style: {
            fontFamily: 'Arial',
            fontSize: 11,
            fontWeight: 'bold',
            fill: BOARD_THEME.noise.markColor,
            stroke: { color: BOARD_THEME.noise.triangleFill, width: 2 },
          },
        });
        numText.anchor.set(0.5);
        numText.position.set(ox + iconSize / 2, oy + iconSize / 2 + 2);
        this.iconContainer.addChild(numText);
      }

      if (zone.searchable && zone.isBuilding) {
        // Magnifying glass at zone bottom-right corner
        const iconSize = 28;
        const ox = (layout.col + layout.w) * TILE_SIZE - iconSize - 2;
        const oy = (layout.row + layout.h) * TILE_SIZE - iconSize - 2;
        // Circle background for visibility
        g.circle(ox + iconSize / 2, oy + iconSize / 2, iconSize / 2 + 2);
        g.fill({ color: BOARD_THEME.searchable.circleColor, alpha: 0.5 });
        g.stroke({ width: 1, color: BOARD_THEME.searchable.strokeColor });
        addIcon('/images/icons/search-white.svg', ox + 2, oy + 2, iconSize - 4);
      }

      if (zone.spawnPoint) {
        const sp = BOARD_THEME.spawn;
        const spawnNum = spawnNumberMap.get(zone.id);
        const halfW = sp.bgWidth / 2;
        const halfH = sp.bgHeight / 2;

        // Dormancy: a colored Spawn Zone stays dormant until its color is
        // activated (Blue/Green Objective taken). We render dormant zones with
        // a desaturated overlay tint so the mapper / players can see them at
        // game start without confusing them for active spawns.
        const isDormantColored = zone.spawnColor !== undefined && (
          !state.spawnColorActivation ||
          !state.spawnColorActivation[zone.spawnColor]?.activated
        );

        // Background — color shifts for blue/green spawns
        let bgColor: number = sp.bgColor;
        let strokeColor: number = sp.strokeColor;
        if (zone.spawnColor === ObjectiveColor.Blue) {
          bgColor = 0x1A3A6B;
          strokeColor = 0x3D8BFD;
        } else if (zone.spawnColor === ObjectiveColor.Green) {
          bgColor = 0x1A4A2E;
          strokeColor = 0x33C16C;
        }

        g.roundRect(cx - halfW, cy - halfH, sp.bgWidth, sp.bgHeight, sp.bgRadius);
        g.fill({ color: bgColor, alpha: isDormantColored ? sp.bgAlpha * 0.55 : sp.bgAlpha });
        g.stroke({ width: sp.strokeWidth, color: strokeColor });

        // Larger skull icon inside the rectangle
        const skullOff = sp.skullSize / 2;
        const skullX = spawnNum !== undefined ? cx - skullOff - 2 : cx - skullOff;
        addIcon('/images/icons/skull-red.svg', skullX, cy - skullOff, sp.skullSize);

        // Spawn number to the right of skull
        if (spawnNum !== undefined) {
          const numText = new PIXI.Text({
            text: String(spawnNum),
            style: { fontFamily: 'Arial', fontSize: sp.numberFontSize, fontWeight: 'bold', fill: sp.numberColor, stroke: { color: sp.numberStroke, width: 2 } },
          });
          numText.anchor.set(0.5);
          numText.position.set(cx + halfW - 8, cy);
          this.iconContainer.addChild(numText);
        }

        // Dormant marker: small "Z" hatch under the spawn rect
        if (isDormantColored) {
          g.rect(cx - halfW, cy + halfH + 1, sp.bgWidth, 3);
          g.fill({ color: strokeColor, alpha: 0.7 });
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
        // Color the objective token according to the marker variant; default
        // to yellow (the existing common Objective color).
        let fillColor: number = BOARD_THEME.objective.fillColor;
        let dotColor: number = BOARD_THEME.objective.dotColor;
        if (zone.objectiveColor === ObjectiveColor.Blue) {
          fillColor = 0x3D8BFD;
          dotColor = 0xFFFFFF;
        } else if (zone.objectiveColor === ObjectiveColor.Green) {
          fillColor = 0x33C16C;
          dotColor = 0xFFFFFF;
        }
        g.circle(ox, oy, 10);
        g.fill({ color: fillColor });
        g.stroke({ width: BOARD_THEME.objective.strokeWidth, color: BOARD_THEME.objective.strokeColor });
        g.circle(ox, oy, 3);
        g.fill({ color: dotColor });
      }

      if (zone.hasEpicCrate) {
        // Red Epic Weapon Crate token in the opposite corner from yellow
        // Objectives so both can coexist visually if the mapper allows it.
        const ox = cx + TILE_SIZE / 2 - 25;
        const oy = cy + TILE_SIZE / 2 - 25;
        g.rect(ox - 10, oy - 10, 20, 20);
        g.fill({ color: 0xCC2222, alpha: 0.9 });
        g.stroke({ width: 2, color: 0xFFCC00 });
        // Yellow "E" glyph
        g.rect(ox - 5, oy - 6, 2, 12);
        g.rect(ox - 5, oy - 6, 8, 2);
        g.rect(ox - 5, oy - 1, 6, 2);
        g.rect(ox - 5, oy + 4, 8, 2);
        g.fill({ color: 0xFFCC00 });
      }
    }
  }

  private computeZoneEntityLayout(
    zoneId: ZoneId,
    zombieCount: number,
    survivorCount: number,
    zombies: Zombie[]
  ): { scale: number; spacing: number; maxVisible: number; showGroupBadge: boolean } {
    if (zombieCount === 0) {
      return { scale: 1, spacing: ENTITY_SPACING, maxVisible: 0, showGroupBadge: false };
    }

    const layout = getZoneLayout(zoneId);
    const zonePixelWidth = layout.w * TILE_SIZE;
    const zonePixelHeight = layout.h * TILE_SIZE;
    // Zombies use the bottom half of the zone
    const halfZoneHeight = zonePixelHeight / 2;

    // Compute effective count weighted by area (boardScale^2)
    let effectiveCount = 0;
    for (const z of zombies) {
      const display = getZombieTypeDisplay(z.type);
      effectiveCount += display.boardScale * display.boardScale;
    }

    // Check if entities fit at a given spacing
    const fitsAtSpacing = (spacing: number): boolean => {
      const cols = Math.max(1, Math.floor(zonePixelWidth / spacing));
      const rows = Math.max(1, Math.floor(halfZoneHeight / spacing));
      return effectiveCount <= cols * rows;
    };

    // Level 1: fits at normal spacing
    if (fitsAtSpacing(ENTITY_SPACING)) {
      return { scale: 1, spacing: ENTITY_SPACING, maxVisible: zombieCount, showGroupBadge: false };
    }

    // Level 2: try to shrink spacing and scale proportionally
    // Find the spacing that fits
    const cols = Math.max(1, Math.floor(zonePixelWidth / ENTITY_SPACING));
    const rows = Math.max(1, Math.floor(halfZoneHeight / ENTITY_SPACING));
    const normalCapacity = cols * rows;

    if (normalCapacity > 0) {
      const scaleFactor = Math.sqrt(normalCapacity / effectiveCount);
      const clampedScale = Math.max(0.5, Math.min(1.0, scaleFactor));
      const reducedSpacing = ENTITY_SPACING * clampedScale;

      // Check if smallest zombie (Runner 0.9) would still be visible
      const smallestRadius = ENTITY_RADIUS * 0.9 * clampedScale;
      if (smallestRadius >= MIN_ENTITY_RADIUS && fitsAtSpacing(reducedSpacing)) {
        return { scale: clampedScale, spacing: reducedSpacing, maxVisible: zombieCount, showGroupBadge: false };
      }
    }

    // Level 3: group mode — show 1 representative + badge above
    return { scale: 1, spacing: ENTITY_SPACING, maxVisible: 1, showGroupBadge: true };
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

    // Pre-compute zone layouts for overflow handling
    const zoneLayouts = new Map<ZoneId, ReturnType<typeof this.computeZoneEntityLayout>>();
    for (const [zoneId, entities] of Object.entries(entitiesByZone)) {
      const zombies = entities.filter(e => this.isZombie(e)) as Zombie[];
      const survivors = entities.filter(e => !this.isZombie(e));
      zoneLayouts.set(zoneId as ZoneId, this.computeZoneEntityLayout(zoneId as ZoneId, zombies.length, survivors.length, zombies));
    }

    // Track which zone+type combos need group badges this frame
    const activeBadgeKeys = new Set<string>();

    // Rebuild grouped representatives: when grouping, pick first zombie of each type per zone
    this.groupedRepresentatives.clear();

    // Pre-compute per-zone type representatives for grouped zones
    const zoneTypeReps = new Map<ZoneId, Map<ZombieType, { repId: EntityId; count: number }>>();
    for (const [zoneId, entities] of Object.entries(entitiesByZone)) {
      const zid = zoneId as ZoneId;
      const zLayout = zoneLayouts.get(zid);
      if (!zLayout?.showGroupBadge) continue;

      const typeMap = new Map<ZombieType, { repId: EntityId; count: number }>();
      for (const e of entities) {
        if (!this.isZombie(e)) continue;
        const z = e as Zombie;
        if (!typeMap.has(z.type)) {
          typeMap.set(z.type, { repId: z.id, count: 1 });
          this.groupedRepresentatives.set(z.id, { zoneId: zid, type: z.type });
        } else {
          typeMap.get(z.type)!.count++;
        }
      }
      zoneTypeReps.set(zid, typeMap);
    }

    for (const entity of allEntities) {
      currentIds.add(entity.id);

      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.createEntitySprite(entity);
        this.layerEntities.addChild(sprite);
        this.entitySprites.set(entity.id, sprite);
      }

      const zoneId = entity.position.zoneId;
      const zoneEntities = entitiesByZone[zoneId] || [];
      const isZomb = this.isZombie(entity);
      const zoneLayout = zoneLayouts.get(zoneId);

      if (isZomb && zoneLayout) {
        if (zoneLayout.showGroupBadge) {
          // Group mode: only type representatives are visible
          const repInfo = this.groupedRepresentatives.get(entity.id);
          if (!repInfo) {
            // Not a representative — hidden
            sprite.visible = false;
            continue;
          }

          sprite.visible = true;
          this.updateEntityVisuals(sprite, entity, state, activeId, zoneLayout.scale);

          // Position: representatives are indexed by type order in the zone
          const typeReps = zoneTypeReps.get(zoneId)!;
          const typeKeys = [...typeReps.keys()];
          const repIndex = typeKeys.indexOf(repInfo.type);
          const pos = this.calculatePosition(zoneId, repIndex, true, zoneLayout.scale, zoneLayout.spacing);

          if (this._animationController && !this._animationController.isAnimating(entity.id)) {
            const oldX = sprite.position.x;
            const oldY = sprite.position.y;
            const moved = Math.abs(oldX - pos.x) > 1 || Math.abs(oldY - pos.y) > 1;
            if (moved) {
              this._animationController.animateMove(entity.id, oldX, oldY, pos.x, pos.y);
            } else {
              sprite.position.set(pos.x, pos.y);
            }
          } else if (!this._animationController || !this._animationController.isAnimating(entity.id)) {
            sprite.position.set(pos.x, pos.y);
          }

          // Mark badge for this type
          const badgeKey = `${zoneId}:${repInfo.type}`;
          activeBadgeKeys.add(badgeKey);
        } else {
          // Normal mode: all zombies visible
          sprite.visible = true;
          this.updateEntityVisuals(sprite, entity, state, activeId, zoneLayout.scale);

          const zombiesInZone = zoneEntities.filter(e => this.isZombie(e));
          const zombieIndex = zombiesInZone.indexOf(entity);
          const pos = this.calculatePosition(zoneId, zombieIndex, true, zoneLayout.scale, zoneLayout.spacing);

          if (this._animationController && !this._animationController.isAnimating(entity.id)) {
            const oldX = sprite.position.x;
            const oldY = sprite.position.y;
            const moved = Math.abs(oldX - pos.x) > 1 || Math.abs(oldY - pos.y) > 1;
            if (moved) {
              this._animationController.animateMove(entity.id, oldX, oldY, pos.x, pos.y);
            } else {
              sprite.position.set(pos.x, pos.y);
            }
          } else if (!this._animationController || !this._animationController.isAnimating(entity.id)) {
            sprite.position.set(pos.x, pos.y);
          }
        }
      } else {
        // Survivor — always visible, normal layout
        sprite.visible = true;
        this.updateEntityVisuals(sprite, entity, state, activeId);

        const survivorsInZone = zoneEntities.filter(e => !this.isZombie(e));
        const survivorIndex = survivorsInZone.indexOf(entity);
        const pos = this.calculatePosition(zoneId, survivorIndex, false, 1, ENTITY_SPACING);

        if (this._animationController && !this._animationController.isAnimating(entity.id)) {
          const oldX = sprite.position.x;
          const oldY = sprite.position.y;
          const moved = Math.abs(oldX - pos.x) > 1 || Math.abs(oldY - pos.y) > 1;
          if (moved) {
            this._animationController.animateMove(entity.id, oldX, oldY, pos.x, pos.y);
          } else {
            sprite.position.set(pos.x, pos.y);
          }
        } else if (!this._animationController || !this._animationController.isAnimating(entity.id)) {
          sprite.position.set(pos.x, pos.y);
        }
      }
    }

    // --- Group badges (one per zone+type) ---
    for (const [zoneId, typeReps] of zoneTypeReps) {
      const zLayout = zoneLayouts.get(zoneId)!;
      const typeKeys = [...typeReps.keys()];

      for (const [typeIdx, [type, { count }]] of [...typeReps.entries()].entries()) {
        const badgeKey = `${zoneId}:${type}`;

        // Compute badge position: top-right of the representative for this type
        const repPos = this.calculatePosition(zoneId, typeIdx, true, zLayout.scale, zLayout.spacing);
        const r = ENTITY_RADIUS * zLayout.scale;
        const badgePos = { x: repPos.x + r * 0.6, y: repPos.y - r * 0.6 };

        let badge = this.groupBadges.get(badgeKey);
        const prevCount = (badge as any)?._cachedZombieCount as number | undefined;

        if (!badge) {
          badge = new PIXI.Container();
          badge.eventMode = 'static';
          badge.cursor = 'pointer';
          badge.hitArea = new PIXI.Circle(0, 0, GROUP_BADGE_RADIUS + 2);

          const capturedZoneId = zoneId;
          const capturedType = type;
          badge.on('pointerover', (e: PIXI.FederatedPointerEvent) => {
            if (this._spacebarDown || this.isDragging) return;
            const html = this.buildTypeTooltipContent(capturedZoneId, capturedType);
            if (html) tooltip.show(e.clientX, e.clientY, html);
          });
          badge.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
            if (this._spacebarDown || this.isDragging) { tooltip.hide(); return; }
            const html = this.buildTypeTooltipContent(capturedZoneId, capturedType);
            if (html) tooltip.show(e.clientX, e.clientY, html);
          });
          badge.on('pointerout', () => tooltip.hide());

          this.layerBadges.addChild(badge);
          this.groupBadges.set(badgeKey, badge);
        }

        // Only rebuild badge visuals if count changed
        if (prevCount !== count) {
          while (badge.children.length > 0) badge.removeChildAt(0);

          const bg = new PIXI.Graphics();
          bg.circle(0, 0, GROUP_BADGE_RADIUS);
          bg.fill({ color: BOARD_THEME.groupBadge.bgColor, alpha: BOARD_THEME.groupBadge.bgAlpha });
          bg.stroke({ width: BOARD_THEME.groupBadge.strokeWidth, color: BOARD_THEME.groupBadge.strokeColor });
          badge.addChild(bg);

          const text = new PIXI.Text({
            text: `\u00d7${count}`,
            style: {
              fontFamily: 'Arial',
              fontSize: BOARD_THEME.groupBadge.fontSize,
              fontWeight: 'bold',
              fill: BOARD_THEME.groupBadge.textColor,
            },
          });
          text.anchor.set(0.5);
          badge.addChild(text);

          (badge as any)._cachedZombieCount = count;
        }

        badge.position.set(badgePos.x, badgePos.y);
      }
    }

    // Cleanup stale badges
    for (const [key, badge] of this.groupBadges) {
      if (!activeBadgeKeys.has(key)) {
        this.layerBadges.removeChild(badge);
        badge.destroy({ children: true });
        this.groupBadges.delete(key);
      }
    }

    // Cleanup removed entities
    for (const [id, sprite] of this.entitySprites) {
      if (!currentIds.has(id)) {
        this.layerEntities.removeChild(sprite);
        sprite.destroy({ children: true });
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
      const repInfo = this.groupedRepresentatives.get(entity.id);
      const html = repInfo
        ? this.buildTypeTooltipContent(repInfo.zoneId, repInfo.type)
        : this.buildTooltipContent(entity.id);
      if (html) {
        tooltip.show(e.clientX, e.clientY, html);
      }
    });

    container.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (this._spacebarDown || this.isDragging) {
        tooltip.hide();
        return;
      }
      const repInfo = this.groupedRepresentatives.get(entity.id);
      const html = repInfo
        ? this.buildTypeTooltipContent(repInfo.zoneId, repInfo.type)
        : this.buildTooltipContent(entity.id);
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
      const hand1 = survivor.inventory.find(c => c.slot === 'HAND_1');
      const hand2 = survivor.inventory.find(c => c.slot === 'HAND_2');
      const hand1Name = hand1 ? hand1.name : 'Empty';
      const hand2Name = hand2 ? hand2.name : 'Empty';
      const hp = survivor.maxHealth - survivor.wounds;
      const xpColor = PixiBoardRenderer.DANGER_LEVEL_COLORS[survivor.dangerLevel];
      return `<div class="tooltip-title">${survivor.name} <span class="tooltip-count">${survivor.characterClass}</span></div>`
        + `<div class="tooltip-row"><span>Health</span><span class="tooltip-value">${hp}/${survivor.maxHealth}</span></div>`
        + `<div class="tooltip-row"><span>XP</span><span class="tooltip-value" style="color:${xpColor}">${survivor.experience}</span></div>`
        + `<div class="tooltip-row"><span>Hand 1</span><span class="tooltip-value">${hand1Name}</span></div>`
        + `<div class="tooltip-row"><span>Hand 2</span><span class="tooltip-value">${hand2Name}</span></div>`;
    }

    const zombie = state.zombies[entityId];
    if (zombie) {
      const display = getZombieTypeDisplay(zombie.type);
      const toughness = PixiBoardRenderer.ZOMBIE_TOUGHNESS[zombie.type];
      const remaining = toughness - zombie.wounds;
      let html = `<div class="tooltip-title" style="color:${display.colorHex}">${display.label}</div>`;
      html += this.buildHealthBar(remaining, toughness, display.colorHex);
      return html;
    }

    return null;
  }

  private buildHealthBar(current: number, max: number, color: string): string {
    const pct = max > 0 ? (current / max) * 100 : 0;
    return `<div class="tooltip-health-row">`
      + `<span class="tooltip-heart">&#9829;</span>`
      + `<span class="tooltip-hp-track"><span class="tooltip-hp-fill" style="width:${pct}%;background:${color}"></span></span>`
      + `<span class="tooltip-hp-text">${current}/${max}</span>`
      + `</div>`;
  }

  private static ZOMBIE_TOUGHNESS: Record<ZombieType, number> = {
    [ZombieType.Walker]: 1,
    [ZombieType.Runner]: 1,
    [ZombieType.Brute]: 2,
    [ZombieType.Abomination]: 3,
  };

  private static DANGER_LEVEL_COLORS: Record<DangerLevel, string> = {
    [DangerLevel.Blue]: '#6aa8d0',
    [DangerLevel.Yellow]: '#d0a030',
    [DangerLevel.Orange]: '#c86820',
    [DangerLevel.Red]: '#c02820',
  };

  private buildTypeTooltipContent(zoneId: ZoneId, type: ZombieType): string | null {
    const state = this._lastState;
    if (!state) return null;

    const zombies = Object.values(state.zombies)
      .filter(z => z.position.zoneId === zoneId && z.type === type);
    if (zombies.length === 0) return null;

    const display = getZombieTypeDisplay(type);
    const toughness = PixiBoardRenderer.ZOMBIE_TOUGHNESS[type];

    let html = `<div class="tooltip-title" style="color:${display.colorHex}">${display.label} <span class="tooltip-count">\u00d7${zombies.length}</span></div>`;
    for (const z of zombies) {
      const remaining = toughness - z.wounds;
      html += this.buildHealthBar(remaining, toughness, display.colorHex);
    }
    return html;
  }

  private getPlayerColor(playerId: string, state: GameState): number {
    return getPlayerColorNumeric(state, playerId);
  }

  private updateEntityVisuals(container: PIXI.Container, entity: Survivor | Zombie, state: GameState, activeId?: EntityId, entityScale = 1): void {
    const graphics = container.children[0] as PIXI.Graphics;
    graphics.clear();

    // Remove any existing sprite child (index 1+)
    while (container.children.length > 1) container.removeChildAt(1);

    if (this.isZombie(entity)) {
      const zombieTex = this._assetManager?.getZombieTexture(entity.type);
      if (zombieTex) {
        const sprite = new PIXI.Sprite(zombieTex);
        sprite.anchor.set(0.5);
        sprite.width = ENTITY_RADIUS * 2 * entityScale;
        sprite.height = ENTITY_RADIUS * 2 * entityScale;
        container.addChild(sprite);
        graphics.circle(0, 0, ENTITY_RADIUS * entityScale);
        graphics.stroke({ width: 2, color: 0x000000 });
      } else {
        const display = getZombieTypeDisplay(entity.type);
        const r = ENTITY_RADIUS * display.boardScale * entityScale;
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
          style: { fontFamily: 'Arial', fontSize: BOARD_THEME.zombie.initialFontSize * display.boardScale * entityScale, fontWeight: 'bold', fill: BOARD_THEME.zombie.initialColor },
        });
        text.anchor.set(0.5);
        container.addChild(text);
      }

      // Update hitArea to match scaled radius
      container.hitArea = new PIXI.Circle(0, 0, (ENTITY_RADIUS + 4) * entityScale);
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

      // 3. Survivor Body — portrait sprite masked to a circle, or fallback colored circle
      const survivorTex = this._assetManager?.getSurvivorTexture(survivor.characterClass);
      const playerColor = this.getPlayerColor(survivor.playerId, state);
      if (survivorTex) {
        const r = ENTITY_RADIUS;
        const sprite = new PIXI.Sprite(survivorTex);
        sprite.anchor.set(0.5);
        // Scale the portrait to "cover" the circle while preserving aspect ratio,
        // then bias upward so the face sits inside the token.
        const srcW = survivorTex.width || 1;
        const srcH = survivorTex.height || 1;
        const cover = Math.max((r * 2) / srcW, (r * 2) / srcH);
        // Zoom in a touch more so the head fills the token instead of shoulders.
        const scale = cover * 1.35;
        sprite.scale.set(scale);
        sprite.y = -r * 0.25;

        const spriteMask = new PIXI.Graphics();
        spriteMask.circle(0, 0, r);
        spriteMask.fill({ color: 0xFFFFFF });
        container.addChild(spriteMask);
        sprite.mask = spriteMask;
        container.addChild(sprite);

        // Colored ring around the portrait to preserve player identity
        graphics.circle(0, 0, r);
        graphics.stroke({ width: 3, color: playerColor });
      } else {
        graphics.circle(0, 0, ENTITY_RADIUS);
        graphics.fill({ color: playerColor });
      }

      // 4. Wound Indicator
      if (survivor.wounds > 0) {
        graphics.circle(0, 0, ENTITY_RADIUS);
        graphics.stroke({ width: 3, color: 0xFF0000 }); // Red Outline if wounded
      } else if (!survivorTex) {
        // Standard Outline only for placeholder circles
        graphics.stroke({ width: 2, color: 0x000000 });
      }
    }
  }

  private calculatePosition(zoneId: ZoneId, index: number, isZombie: boolean, scale = 1, spacing = ENTITY_SPACING): { x: number, y: number } {
    const layout = getZoneLayout(zoneId);

    // Use centroid for multi-cell zones, top-left corner for single-cell
    const centerX = layout.centroidX !== undefined
      ? layout.centroidX * TILE_SIZE + TILE_SIZE / 2
      : layout.col * TILE_SIZE + TILE_SIZE / 2;
    const centerY = layout.centroidY !== undefined
      ? layout.centroidY * TILE_SIZE + TILE_SIZE / 2
      : layout.row * TILE_SIZE + TILE_SIZE / 2;

    // Zone bounding box for clamping
    const margin = ENTITY_RADIUS * scale;
    const zoneLeft = layout.col * TILE_SIZE + margin;
    const zoneRight = (layout.col + layout.w) * TILE_SIZE - margin;
    const zoneTop = layout.row * TILE_SIZE + margin;
    const zoneBottom = (layout.row + layout.h) * TILE_SIZE - margin;

    let x: number, y: number;

    if (isZombie) {
      // Bottom of zone center
      const cols = Math.max(1, Math.floor((layout.w * TILE_SIZE) / spacing));
      const startX = -(cols - 1) * spacing / 2;
      const offsetX = startX + (index % cols) * spacing;
      const offsetY = 20 * scale + Math.floor(index / cols) * spacing;
      x = centerX + offsetX;
      y = centerY + offsetY;
      // Clamp to zone bounds
      x = Math.max(zoneLeft, Math.min(zoneRight, x));
      y = Math.max(zoneTop, Math.min(zoneBottom, y));
    } else {
      // Top of zone center — survivors always use normal spacing
      const offsetX = -20 + (index % 3) * ENTITY_SPACING;
      const offsetY = -20 - Math.floor(index / 3) * ENTITY_SPACING;
      x = centerX + offsetX;
      y = centerY + offsetY;
      // Clamp to zone bounds (with softer margin for survivors)
      x = Math.max(zoneLeft, Math.min(zoneRight, x));
      y = Math.max(zoneTop, Math.min(zoneBottom, y));
    }

    return { x, y };
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

  /**
   * Render the empty-state blueprint placeholder. Called when no real map is
   * loaded. Output: greyed tile rectangles, two operative dots in BLUE/YELLOW
   * rank colors, one hostile cluster, faint coordinate gridlines, compass mark,
   * and a `// PREVIEW · NO ACTIVE MAP` mono label.
   */
  private renderPlaceholder(): void {
    const layer = this.placeholderLayer;
    layer.removeChildren();
    layer.visible = true;
    this.placeholderVisible = true;

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const t = BOARD_THEME.placeholder;

    // Backdrop wash so the placeholder reads as a designed surface, not a void.
    const backdrop = new PIXI.Graphics();
    backdrop.rect(0, 0, w, h);
    backdrop.fill({ color: t.backdrop, alpha: t.backdropAlpha });
    layer.addChild(backdrop);

    // Faint orthogonal coordinate gridlines across the whole viewport.
    const grid = new PIXI.Graphics();
    for (let x = 0; x <= w; x += t.gridStep) {
      grid.moveTo(x, 0);
      grid.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += t.gridStep) {
      grid.moveTo(0, y);
      grid.lineTo(w, y);
    }
    grid.stroke({ width: 1, color: t.gridLine, alpha: t.gridLineAlpha });
    layer.addChild(grid);

    // Tile grid — denser at desktop, sparser at mobile.
    const isSmall = w < 720;
    const isMedium = w >= 720 && w < 1100;
    const cols = isSmall ? 4 : isMedium ? 5 : 6;
    const rows = isSmall ? 3 : 4;

    const maxByWidth = (w * 0.7) / cols;
    const maxByHeight = (h * 0.6) / rows;
    const cell = Math.max(56, Math.min(140, Math.min(maxByWidth, maxByHeight)));
    const gap = Math.round(cell * 0.14);

    const totalW = cols * cell + (cols - 1) * gap;
    const totalH = rows * cell + (rows - 1) * gap;
    const startX = Math.round((w - totalW) / 2);
    const startY = Math.round((h - totalH) / 2);

    // Deterministic irregularity: vary tile widths a bit so the layout reads
    // as a stylized blueprint, not a uniform grid. Pattern repeats predictably.
    const widthVariants = [1, 1, 1.35, 0.85, 1.15, 1, 0.9, 1.25];
    const buildingPattern = [false, true, false, true, true, false, true, false, false, true, false, true];

    const tiles = new PIXI.Graphics();
    let pIdx = 0;
    type TileRect = { x: number; y: number; w: number; h: number; col: number; row: number };
    const tileRects: TileRect[] = [];
    for (let row = 0; row < rows; row++) {
      let cursorX = startX;
      for (let col = 0; col < cols; col++) {
        const variant = widthVariants[(row * cols + col) % widthVariants.length];
        const tw = Math.round(cell * variant);
        const th = cell;
        // Keep the row aligned even with width variance — clamp the last tile.
        const remaining = (startX + totalW) - cursorX;
        const finalW = col === cols - 1 ? remaining : tw;
        if (finalW <= 0) continue;

        const isBuilding = buildingPattern[(row + col) % buildingPattern.length];
        tiles.rect(cursorX, startY + row * (cell + gap), finalW, th);
        tiles.fill({
          color: isBuilding ? t.tileBuilding : t.tileFill,
          alpha: t.tileFillAlpha,
        });
        tiles.rect(cursorX, startY + row * (cell + gap), finalW, th);
        tiles.stroke({
          width: t.tileStrokeWidth,
          color: t.tileStroke,
          alpha: t.tileStrokeAlpha,
        });

        tileRects.push({
          x: cursorX,
          y: startY + row * (cell + gap),
          w: finalW,
          h: th,
          col,
          row,
        });
        cursorX += finalW + gap;
        pIdx++;
      }
    }
    layer.addChild(tiles);

    // Pick stable tile slots for the rank dots and hostile cluster. Indices
    // chosen so they land on different tiles at every viewport tier.
    const tileCount = tileRects.length;
    if (tileCount > 0) {
      const blueTile = tileRects[Math.min(1, tileCount - 1)];
      const yellowTile = tileRects[Math.min(Math.max(0, Math.floor(tileCount * 0.55)), tileCount - 1)];
      const hostileTile = tileRects[Math.min(Math.max(0, tileCount - 2), tileCount - 1)];

      const dotR = Math.max(7, Math.round(cell * 0.16));

      const dots = new PIXI.Graphics();
      // Operative dots — concentric: dark stroke ring + colored core.
      const drawOperative = (rect: TileRect, color: number) => {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        dots.circle(cx, cy, dotR);
        dots.fill({ color });
        dots.circle(cx, cy, dotR);
        dots.stroke({ width: t.operativeStrokeWidth, color: t.operativeStroke });
      };
      drawOperative(blueTile, t.operativeBlue);
      drawOperative(yellowTile, t.operativeYellow);

      // Hostile cluster — three small dots in a triangular formation.
      const hostileR = Math.max(4, Math.round(cell * 0.09));
      const hcx = hostileTile.x + hostileTile.w / 2;
      const hcy = hostileTile.y + hostileTile.h / 2;
      const spread = hostileR * 2.4;
      const offsets: Array<[number, number]> = [
        [0, -spread * 0.6],
        [-spread * 0.7, spread * 0.5],
        [spread * 0.7, spread * 0.5],
      ];
      for (const [dx, dy] of offsets) {
        dots.circle(hcx + dx, hcy + dy, hostileR);
        dots.fill({ color: t.hostile });
        dots.circle(hcx + dx, hcy + dy, hostileR);
        dots.stroke({ width: t.hostileStrokeWidth, color: t.operativeStroke, alpha: 0.7 });
      }
      layer.addChild(dots);
    }

    // Compass mark — small "N" in the top-right corner of the placeholder.
    const compass = new PIXI.Graphics();
    const compassX = startX + totalW - 18;
    const compassY = startY - 22;
    compass.moveTo(compassX, compassY + 12);
    compass.lineTo(compassX, compassY - 4);
    compass.lineTo(compassX - 4, compassY);
    compass.moveTo(compassX, compassY - 4);
    compass.lineTo(compassX + 4, compassY);
    compass.stroke({ width: 1.5, color: t.compass, alpha: t.compassAlpha });
    layer.addChild(compass);

    const compassLabel = new PIXI.Text({
      text: 'N',
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        fontWeight: '600',
        fill: t.compass,
        letterSpacing: 1,
      },
    });
    compassLabel.alpha = t.compassAlpha;
    compassLabel.anchor.set(0.5, 0);
    compassLabel.position.set(compassX, compassY + 14);
    layer.addChild(compassLabel);

    // Mono preview label — top-center of the tile region so reviewers can't
    // mistake the blueprint for live game state.
    const label = new PIXI.Text({
      text: '// PREVIEW · NO ACTIVE MAP',
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: isSmall ? 11 : 12,
        fontWeight: '600',
        fill: t.label,
        letterSpacing: 2,
      },
    });
    label.alpha = t.labelAlpha;
    label.anchor.set(0.5, 1);
    label.position.set(w / 2, startY - 12);
    layer.addChild(label);
  }

  /** Hide and clear the empty-state placeholder. */
  private clearPlaceholder(): void {
    this.placeholderLayer.visible = false;
    this.placeholderLayer.removeChildren();
    this.placeholderVisible = false;
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
    for (const [, sprite] of this.entitySprites) {
      this.layerEntities.removeChild(sprite);
      sprite.destroy({ children: true });
    }
    this.entitySprites.clear();
    for (const [, badge] of this.groupBadges) {
      this.layerBadges.removeChild(badge);
      badge.destroy({ children: true });
    }
    this.groupBadges.clear();
    this.tileSprites = [];

    // Placeholder layer lives on the stage (not the camera container) so
    // tear it down explicitly.
    if (this.placeholderLayer) {
      this.app.stage.removeChild(this.placeholderLayer);
      this.placeholderLayer.destroy({ children: true });
    }

    // Destroy the container tree (recursively destroys children)
    this.container.destroy({ children: true });
  }
}
