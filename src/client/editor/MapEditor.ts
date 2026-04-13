
// src/client/editor/MapEditor.ts

import * as PIXI from 'pixi.js';
import { TileService, tileService } from '../../services/TileService';
import { TileInstance, ScenarioMap, MapMarker, MarkerType } from '../../types/Map';
import { PixiBoardRenderer } from '../PixiBoardRenderer';
import { GameState, initialGameState, Zone, ZoneConnection } from '../../types/GameState';
import { TILE_SIZE, TILE_CELLS_PER_SIDE, TILE_PIXEL_SIZE } from '../../config/Layout';
import { compileScenario } from '../../services/ScenarioCompiler';
import { getRotatedTileDefinition, getCellAt } from '../../services/TileDefinitionService';
import { setZoneGeometry } from '../utils/zoneLayout';
import { renderButton } from '../ui/components/Button';
import { TileDefinitionEditor } from './TileDefinitionEditor';
import { notificationManager } from '../ui/NotificationManager';
// Zone indicator icons loaded as static assets from /images/icons/
import { modalManager } from '../ui/overlays/ModalManager';

// --- Editor Color Theme ---
const EDITOR_THEME = {
  // Zone overlay fills
  zone: {
    streetColors: [
      0x5588CC, 0xCC7744, 0x55AA66, 0xAA55AA, 0xBBAA33,
      0x44AABB, 0xCC5577, 0x77BB44, 0x7766CC, 0xCC9944,
    ],
    buildingColors: [
      0x8B6F47, 0x7B5B3A, 0x6B4F2E, 0x9B7F57, 0x5B3F1E,
      0xA08060, 0x705030, 0x604020, 0x907050, 0x806040,
    ],
    streetAlpha: 0.3,
    buildingAlpha: 0.55,
  },

  // Edge / wall rendering
  wall: {
    color: 0x000000,
    alpha: 0.9,
    width: 3,
  },
  door: {
    frameColor: 0x000000,
    panelColor: 0x8B4513,
    panelAlpha: 0.85,
  },
  crosswalk: {
    color: 0xFFFFFF,
    alpha: 0.7,
  },
  doorway: {
    color: 0x44AA44,
    alpha: 0.6,
  },

  // Tile boundary grid
  tileBorder: {
    color: 0x666666,
    alpha: 0.3,
    width: 1,
  },

  // Marker icons
  marker: {
    playerStart: {
      fill: 0x0088FF,
      fillAlpha: 0.7,
      stroke: 0xFFFFFF,
      strokeWidth: 2,
    },
    zombieSpawn: {
      fill: 0xFF2222,
      fillAlpha: 0.7,
      stroke: 0x000000,
      strokeWidth: 2,
    },
    exit: {
      fill: 0x2244AA,
      fillAlpha: 0.7,
      stroke: 0x4488FF,
      strokeWidth: 2,
      arrowColor: 0xFFFFFF,
      arrowWidth: 3,
    },
    objective: {
      fill: 0xFFD700,
      fillAlpha: 0.8,
      stroke: 0x000000,
      strokeWidth: 2,
      dotColor: 0x000000,
    },
  },
} as const;

// --- Editor Tool Modes ---
enum EditorTool {
  Tile = 'TILE',
  PlayerStart = 'PLAYER_START',
  ZombieSpawn = 'ZOMBIE_SPAWN',
  Exit = 'EXIT',
  Objective = 'OBJECTIVE',
  Eraser = 'ERASER',
}

interface EditorSnapshot {
  tiles: TileInstance[];
  markers: MapMarker[];
}

const MAX_UNDO = 50;

export class MapEditor {
  private app: PIXI.Application;
  private renderer: PixiBoardRenderer;
  private state: GameState;

  // --- Tile tool state ---
  private selectedTileId: string | null = null;
  private currentRotation: 0 | 90 | 180 | 270 = 0;

  // --- Active tool ---
  private activeTool: EditorTool = EditorTool.Tile;

  // --- Authored scenario data ---
  private tiles: TileInstance[] = [];
  private markers: MapMarker[] = [];

  // --- Undo/Redo ---
  private undoStack: EditorSnapshot[] = [];
  private redoStack: EditorSnapshot[] = [];

  // --- Brush drag state ---
  private isDragging = false;
  private dragStartCell: { x: number; y: number } | null = null;

  // --- Overlay layer for editor-specific visuals ---
  private overlayLayer: PIXI.Container;
  private overlayGraphics: PIXI.Graphics;
  private spawnLabelContainer: PIXI.Container;
  private roomIconContainer: PIXI.Container;

  // UI Elements
  private paletteContainer!: HTMLElement;
  private statusText!: HTMLElement;
  private toolButtons: Map<EditorTool, HTMLButtonElement> = new Map();

  // Tile Definition Editor
  private tileDefEditor: TileDefinitionEditor | null = null;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.renderer = new PixiBoardRenderer(app);

    // Clone initial state to start fresh
    this.state = JSON.parse(JSON.stringify(initialGameState));
    this.state.tiles = [];
    this.state.zones = {};

    // Create overlay layer on top of renderer
    this.overlayLayer = new PIXI.Container();
    this.overlayGraphics = new PIXI.Graphics();
    this.spawnLabelContainer = new PIXI.Container();
    this.roomIconContainer = new PIXI.Container();
    this.overlayLayer.addChild(this.overlayGraphics);
    this.overlayLayer.addChild(this.spawnLabelContainer);
    this.overlayLayer.addChild(this.roomIconContainer);
    this.app.stage.addChild(this.overlayLayer);

    // Pre-load icon assets for marker overlays
    PIXI.Assets.load([
      '/images/icons/door-open-white.svg',
      '/images/icons/moon-white.svg',
      '/images/icons/sun-yellow.svg',
    ]);

    // Setup UI
    this.createUI();

    // Draw Editor Grid
    this.renderer.drawEditorGrid(20, 20);

    this.setupInteraction();

    // Loop
    this.app.ticker.add(this.renderLoop, this);
  }

  private onTileDefSaved = () => {
    this.rebuildPreviewState();
    this.updateValidation();
  };

  // =============================================
  // UI CREATION
  // =============================================

  private createUI() {
    this.paletteContainer = document.createElement('div');
    this.paletteContainer.className = 'editor-sidebar';
    document.body.appendChild(this.paletteContainer);

    this.createToolbar();
    this.createToolSelector();

    // Status
    this.statusText = document.createElement('div');
    this.statusText.className = 'editor-status';
    this.statusText.innerText = 'Select a tool...';
    this.paletteContainer.appendChild(this.statusText);

    this.createTilePalette();
    this.createValidationPanel();
    this.createInstructions();
  }

  private createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-section';

    const title = document.createElement('h2');
    title.innerText = 'Map Editor';
    title.className = 'editor-sidebar__title';
    toolbar.appendChild(title);

    const nameInput = document.createElement('input');
    nameInput.id = 'map-name-input';
    nameInput.className = 'input';
    nameInput.placeholder = 'Map Name';
    nameInput.style.height = '32px';
    nameInput.style.fontSize = 'var(--text-sm)';
    toolbar.appendChild(nameInput);

    const btnRow = document.createElement('div');
    btnRow.className = 'editor-btn-row';
    btnRow.innerHTML = `
      ${renderButton({ label: 'Save', variant: 'primary', size: 'sm', dataAction: 'map-save' })}
      ${renderButton({ label: 'Clear', variant: 'destructive', size: 'sm', dataAction: 'map-clear' })}
      ${renderButton({ label: 'Load', variant: 'secondary', size: 'sm', dataAction: 'map-load' })}
    `;
    toolbar.appendChild(btnRow);

    // Edit Tiles button
    const editTilesRow = document.createElement('div');
    editTilesRow.innerHTML = renderButton({ label: 'Edit Tiles', variant: 'ghost', size: 'sm', fullWidth: true, dataAction: 'edit-tiles', icon: 'Settings' });
    toolbar.appendChild(editTilesRow);

    // Event delegation for toolbar buttons
    toolbar.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'map-save') this.saveMap(nameInput.value);
      else if (action === 'map-clear') this.clearAll();
      else if (action === 'map-load') this.showLoadDialog();
      else if (action === 'edit-tiles') this.openTileEditor();
    });

    this.paletteContainer.appendChild(toolbar);
  }

  private openTileEditor() {
    if (this.tileDefEditor) return;
    // Hide map editor UI
    this.paletteContainer.style.display = 'none';
    this.app.canvas.style.display = 'none';

    this.tileDefEditor = new TileDefinitionEditor({
      onBack: () => {
        this.tileDefEditor?.destroy();
        this.tileDefEditor = null;
        this.paletteContainer.style.display = '';
        this.app.canvas.style.display = '';
      },
      onSave: this.onTileDefSaved,
    });
  }

  private createToolSelector() {
    const section = document.createElement('div');
    section.className = 'editor-section';

    const label = document.createElement('div');
    label.innerText = 'Tools';
    label.className = 'editor-section__label';
    section.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'editor-tool-grid';

    const tools: { tool: EditorTool; label: string; key: string }[] = [
      { tool: EditorTool.Tile, label: 'Tiles', key: '1' },
      { tool: EditorTool.PlayerStart, label: 'P. Start', key: '2' },
      { tool: EditorTool.ZombieSpawn, label: 'Z. Spawn', key: '3' },
      { tool: EditorTool.Exit, label: 'Exit', key: '4' },
      { tool: EditorTool.Objective, label: 'Objective', key: '5' },
      { tool: EditorTool.Eraser, label: 'Eraser', key: 'E' },
    ];

    tools.forEach(({ tool, label, key }) => {
      const btn = document.createElement('button');
      btn.innerText = `[${key}] ${label}`;
      btn.className = 'editor-tool-btn';
      btn.onclick = () => this.setTool(tool);
      this.toolButtons.set(tool, btn);
      grid.appendChild(btn);
    });

    section.appendChild(grid);
    this.paletteContainer.appendChild(section);
  }

  private tilePaletteEl!: HTMLElement;
  private createTilePalette() {
    this.tilePaletteEl = document.createElement('div');
    this.tilePaletteEl.id = 'tile-palette-section';
    this.tilePaletteEl.style.display = 'none';

    const label = document.createElement('div');
    label.innerText = 'Tile Palette';
    label.className = 'editor-section__label';
    this.tilePaletteEl.appendChild(label);

    const list = document.createElement('div');
    list.className = 'editor-tile-list';

    const checkAssets = setInterval(() => {
      if (tileService.isReady) {
        clearInterval(checkAssets);
        this.populateTilePalette(list);
      }
    }, 100);

    this.tilePaletteEl.appendChild(list);
    this.paletteContainer.appendChild(this.tilePaletteEl);
  }

  private validationPanelEl!: HTMLElement;
  private createValidationPanel() {
    this.validationPanelEl = document.createElement('div');
    this.validationPanelEl.id = 'validation-panel';
    this.validationPanelEl.className = 'editor-validation';
    this.paletteContainer.appendChild(this.validationPanelEl);
  }

  private createInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'editor-instructions';
    instructions.innerHTML = `
        <b>Controls:</b><br>
        <b>Click</b> to place | <b>Right-click</b> to remove<br>
        <b>R</b> rotate tile | <b>1-5, E</b> switch tools<br>
        <b>Ctrl+Z</b> undo | <b>Ctrl+Shift+Z</b> redo<br>
        <b>Shift+Drag</b> brush fill (Tiles)<br>
        <b>Scroll</b> zoom | <b>Space+Drag</b> pan
    `;
    this.paletteContainer.appendChild(instructions);
  }

  // =============================================
  // UNDO / REDO
  // =============================================

  private takeSnapshot(): EditorSnapshot {
    return {
      tiles: JSON.parse(JSON.stringify(this.tiles)),
      markers: JSON.parse(JSON.stringify(this.markers)),
    };
  }

  private restoreSnapshot(snap: EditorSnapshot): void {
    this.tiles = JSON.parse(JSON.stringify(snap.tiles));
    this.markers = JSON.parse(JSON.stringify(snap.markers));
    this.rebuildPreviewState();
    this.updateValidation();
  }

  private pushUndo(): void {
    this.undoStack.push(this.takeSnapshot());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private undo(): void {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.takeSnapshot());
    const snap = this.undoStack.pop()!;
    this.restoreSnapshot(snap);
    this.statusText.innerText = 'Undo';
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.takeSnapshot());
    const snap = this.redoStack.pop()!;
    this.restoreSnapshot(snap);
    this.statusText.innerText = 'Redo';
  }

  // =============================================
  // TOOL MANAGEMENT
  // =============================================

  private setTool(tool: EditorTool) {
    this.activeTool = tool;

    // Update button highlights
    this.toolButtons.forEach((btn, t) => {
      btn.classList.toggle('editor-tool-btn--active', t === tool);
    });

    // Show/hide sub-panels
    this.tilePaletteEl.style.display = tool === EditorTool.Tile ? 'block' : 'none';

    const hints: Record<EditorTool, string> = {
      [EditorTool.Tile]: 'Click grid to place/replace tiles. R to rotate.',
      [EditorTool.PlayerStart]: 'Click a STREET zone cell to set the Player Start position.',
      [EditorTool.ZombieSpawn]: 'Click STREET zone cells to place Zombie Spawn points.',
      [EditorTool.Exit]: 'Click STREET zone cells to place Exit points.',
      [EditorTool.Objective]: 'Click any zone cell to place Objective tokens.',
      [EditorTool.Eraser]: 'Click to remove markers from cells.',
    };
    this.statusText.innerText = hints[tool] || '';
  }

  // =============================================
  // TILE PALETTE
  // =============================================

  private populateTilePalette(container: HTMLElement) {
    const ids = tileService.getAllIds();

    ids.forEach(id => {
      const item = document.createElement('div');
      item.className = 'editor-tile-item';
      item.textContent = id;

      item.onclick = () => {
        this.selectedTileId = id;
        this.statusText.innerText = `Tile: ${id} (${this.currentRotation}\u00B0)`;

        Array.from(container.children).forEach((c) => {
          c.classList.remove('editor-tile-item--selected');
        });
        item.classList.add('editor-tile-item--selected');
      };

      container.appendChild(item);
    });
  }

  // =============================================
  // INTERACTION
  // =============================================

  private setupInteraction() {
    // Key bindings
    window.addEventListener('keydown', (e) => {
      // Don't handle keys when tile definition editor is open
      if (this.tileDefEditor) return;

      // Spacebar is handled by PixiBoardRenderer for panning
      if (e.code === 'Space') {
        e.preventDefault();
        return;
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'r' && this.activeTool === EditorTool.Tile) {
        this.currentRotation = (this.currentRotation + 90) % 360 as any;
        if (this.selectedTileId) {
          this.statusText.innerText = `Tile: ${this.selectedTileId} (${this.currentRotation}\u00B0)`;
        }
      }
      // Number keys for tool switching
      const toolMap: Record<string, EditorTool> = {
        '1': EditorTool.Tile, '2': EditorTool.PlayerStart, '3': EditorTool.ZombieSpawn,
        '4': EditorTool.Exit, '5': EditorTool.Objective, 'e': EditorTool.Eraser,
      };
      if (toolMap[key]) this.setTool(toolMap[key]);
    });

    // Canvas Interaction
    this.app.stage.eventMode = 'static';

    this.app.stage.on('pointerdown', (e) => {
      // Spacebar pan mode: ignore editor interactions
      if (this.renderer.spacebarDown) return;
      if (e.button === 0 && e.shiftKey && this.activeTool === EditorTool.Tile) {
        const worldPos = this.renderer.screenToWorld(e.global.x, e.global.y);
        const { tx, ty } = this.worldToTileCoord(worldPos.x, worldPos.y);
        this.dragStartCell = { x: tx, y: ty };
        this.isDragging = true;
      }
    });

    this.app.stage.on('pointerup', (e) => {
      // Spacebar pan mode: ignore editor interactions
      if (this.renderer.spacebarDown) return;
      if (this.isDragging && this.dragStartCell && e.button === 0) {
        const worldPos = this.renderer.screenToWorld(e.global.x, e.global.y);
        this.pushUndo();
        const { tx, ty } = this.worldToTileCoord(worldPos.x, worldPos.y);
        this.brushFillTiles(this.dragStartCell.x, this.dragStartCell.y, tx, ty);
        this.isDragging = false;
        this.dragStartCell = null;
        this.rebuildPreviewState();
        this.updateValidation();
        return;
      }

      this.isDragging = false;
      this.dragStartCell = null;

      if (this.renderer.wasDragging) return;

      const button = e.button;
      const worldPos = this.renderer.screenToWorld(e.global.x, e.global.y);

      if (button === 0) {
        this.handleLeftClick(worldPos.x, worldPos.y);
      } else if (button === 2) {
        this.handleRightClick(worldPos.x, worldPos.y);
      }
    });

    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private worldToTileCoord(wx: number, wy: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(wx / TILE_PIXEL_SIZE),
      ty: Math.floor(wy / TILE_PIXEL_SIZE),
    };
  }

  private worldToZoneCoord(wx: number, wy: number): { zx: number; zy: number } {
    return {
      zx: Math.floor(wx / TILE_SIZE),
      zy: Math.floor(wy / TILE_SIZE),
    };
  }

  private isZoneCellValid(zx: number, zy: number): boolean {
    const tx = Math.floor(zx / TILE_CELLS_PER_SIDE);
    const ty = Math.floor(zy / TILE_CELLS_PER_SIDE);
    return this.tiles.some(t => t.x === tx && t.y === ty);
  }

  private getCellType(zx: number, zy: number): 'street' | 'building' | null {
    const tx = Math.floor(zx / TILE_CELLS_PER_SIDE);
    const ty = Math.floor(zy / TILE_CELLS_PER_SIDE);
    const tile = this.tiles.find(t => t.x === tx && t.y === ty);
    if (!tile) return null;
    const def = getRotatedTileDefinition(tile.tileId, tile.rotation);
    if (!def) return null;
    const localX = zx - tx * TILE_CELLS_PER_SIDE;
    const localY = zy - ty * TILE_CELLS_PER_SIDE;
    const cell = getCellAt(def, localX, localY);
    return cell?.type ?? 'street';
  }

  private handleLeftClick(wx: number, wy: number) {
    this.pushUndo();
    switch (this.activeTool) {
      case EditorTool.Tile:
        this.handleTilePlacement(wx, wy);
        break;
      case EditorTool.PlayerStart:
        this.handleMarkerPlacement(wx, wy, MarkerType.PlayerStart, true);
        break;
      case EditorTool.ZombieSpawn:
        this.handleMarkerPlacement(wx, wy, MarkerType.ZombieSpawn, false);
        break;
      case EditorTool.Exit:
        this.handleMarkerPlacement(wx, wy, MarkerType.Exit, false);
        break;
      case EditorTool.Objective:
        this.handleMarkerPlacement(wx, wy, MarkerType.Objective, false);
        break;
      case EditorTool.Eraser:
        this.handleErase(wx, wy);
        break;
    }
    this.rebuildPreviewState();
    this.updateValidation();
  }

  private handleRightClick(wx: number, wy: number) {
    this.pushUndo();
    if (this.activeTool === EditorTool.Tile) {
      this.handleTileRemoval(wx, wy);
    } else {
      this.handleErase(wx, wy);
    }
    this.rebuildPreviewState();
    this.updateValidation();
  }

  // --- Tile Placement ---

  private handleTilePlacement(wx: number, wy: number) {
    if (!this.selectedTileId) return;
    const { tx, ty } = this.worldToTileCoord(wx, wy);
    if (tx < 0 || ty < 0) return;

    const existingIndex = this.tiles.findIndex(t => t.x === tx && t.y === ty);

    const newTile: TileInstance = {
      id: `tile-${tx}-${ty}`,
      tileId: this.selectedTileId,
      x: tx,
      y: ty,
      rotation: this.currentRotation,
    };

    if (existingIndex !== -1) {
      this.tiles[existingIndex] = newTile;
    } else {
      this.tiles.push(newTile);
    }
  }

  private handleTileRemoval(wx: number, wy: number) {
    const { tx, ty } = this.worldToTileCoord(wx, wy);
    this.tiles = this.tiles.filter(t => t.x !== tx || t.y !== ty);

    for (let dy = 0; dy < TILE_CELLS_PER_SIDE; dy++) {
      for (let dx = 0; dx < TILE_CELLS_PER_SIDE; dx++) {
        const zx = tx * TILE_CELLS_PER_SIDE + dx;
        const zy = ty * TILE_CELLS_PER_SIDE + dy;
        this.removeAllAtCell(zx, zy);
      }
    }
  }

  // --- Marker Placement ---

  private static readonly STREET_ONLY_MARKERS = [
    MarkerType.PlayerStart,
    MarkerType.ZombieSpawn,
    MarkerType.Exit,
  ];

  private handleMarkerPlacement(wx: number, wy: number, type: MarkerType, unique: boolean) {
    const { zx, zy } = this.worldToZoneCoord(wx, wy);
    if (!this.isZoneCellValid(zx, zy)) {
      this.statusText.innerText = 'Cell outside placed tiles.';
      return;
    }

    // Enforce street-only constraint for spawns, starts, and exits
    if (MapEditor.STREET_ONLY_MARKERS.includes(type)) {
      const cellType = this.getCellType(zx, zy);
      if (cellType !== 'street') {
        this.statusText.innerText = `${type} can only be placed on street zones.`;
        return;
      }
    }

    // Resolve which zone this cell belongs to
    const cellKey = `${zx},${zy}`;
    const zoneId = this.state.zoneGeometry?.cellToZone[cellKey];

    // Toggle off if clicking same cell
    const existingIndex = this.markers.findIndex(m => m.type === type && m.x === zx && m.y === zy);
    if (existingIndex !== -1) {
      this.markers.splice(existingIndex, 1);
      this.statusText.innerText = `Removed ${type} at (${zx},${zy})`;
    } else {
      // Check: only one marker of same type per zone
      if (zoneId) {
        const sameTypeInZone = this.markers.find(m => {
          if (m.type !== type) return false;
          const mk = `${m.x},${m.y}`;
          return this.state.zoneGeometry?.cellToZone[mk] === zoneId;
        });
        if (sameTypeInZone) {
          this.statusText.innerText = `Zone already has a ${type} marker.`;
          return;
        }
      }

      if (unique) {
        this.markers = this.markers.filter(m => m.type !== type);
      }
      this.markers.push({ type, x: zx, y: zy });
      this.statusText.innerText = `Placed ${type} at (${zx},${zy})`;
    }
  }

  // --- Eraser ---

  private handleErase(wx: number, wy: number) {
    const { zx, zy } = this.worldToZoneCoord(wx, wy);
    this.removeAllAtCell(zx, zy);
    this.statusText.innerText = `Erased all at (${zx},${zy})`;
  }

  private removeAllAtCell(zx: number, zy: number) {
    this.markers = this.markers.filter(m => m.x !== zx || m.y !== zy);
  }

  // =============================================
  // BRUSH FILL
  // =============================================

  private brushFillTiles(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.selectedTileId) return;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (tx < 0 || ty < 0) continue;
        const existingIndex = this.tiles.findIndex(t => t.x === tx && t.y === ty);

        const newTile: TileInstance = {
          id: `tile-${tx}-${ty}`,
          tileId: this.selectedTileId,
          x: tx,
          y: ty,
          rotation: this.currentRotation,
        };
        if (existingIndex !== -1) {
          this.tiles[existingIndex] = newTile;
        } else {
          this.tiles.push(newTile);
        }
      }
    }
    this.statusText.innerText = `Brush filled tiles (${minX},${minY}) to (${maxX},${maxY})`;
  }

  // =============================================
  // PREVIEW STATE REBUILD
  // =============================================

  private rebuildPreviewState() {
    this.state.tiles = [...this.tiles];

    if (this.tiles.length === 0) {
      this.state.zones = {};
      this.state.zoneGeometry = undefined;
      this.state.edgeClassMap = undefined;
      this.state.doorPositions = undefined;
      this.state.cellTypes = undefined;
      setZoneGeometry(null);
      return;
    }

    const scenarioMap: ScenarioMap = {
      id: 'preview',
      name: 'Preview',
      width: Math.max(...this.tiles.map(t => t.x)) + 1,
      height: Math.max(...this.tiles.map(t => t.y)) + 1,
      tiles: this.tiles,
      markers: this.markers,
    };

    try {
      const compiled = compileScenario(scenarioMap);
      this.state.zones = compiled.zones;
      this.state.zoneGeometry = compiled.zoneGeometry;
      this.state.edgeClassMap = compiled.edgeClassMap;
      this.state.doorPositions = compiled.doorPositions;
      this.state.cellTypes = compiled.cellTypes;
      setZoneGeometry(compiled.zoneGeometry);
    } catch (e) {
      console.warn('Preview compile error:', e);
      this.state.zones = {};
      this.state.zoneGeometry = undefined;
      this.state.edgeClassMap = undefined;
      this.state.doorPositions = undefined;
      this.state.cellTypes = undefined;
      setZoneGeometry(null);
    }
  }

  // =============================================
  // OVERLAY RENDERING — zone-centric visuals
  // =============================================

  // Zone color palettes (reference EDITOR_THEME)

  private renderOverlay() {
    this.overlayGraphics.clear();

    const rendererContainer = this.app.stage.children[0] as PIXI.Container;
    if (rendererContainer) {
      this.overlayLayer.position.copyFrom(rendererContainer.position);
      this.overlayLayer.scale.copyFrom(rendererContainer.scale);
    }

    const g = this.overlayGraphics;
    const geo = this.state.zoneGeometry;
    const edgeMap = this.state.edgeClassMap;

    // --- 1. Zone fills (primary visual) ---
    if (geo) {
      let streetIdx = 0;
      let buildingIdx = 0;

      for (const [zoneId, cells] of Object.entries(geo.zoneCells)) {
        const zone = this.state.zones[zoneId];
        if (!zone) continue;

        let color: number;
        let alpha: number;
        if (zone.isBuilding) {
          color = EDITOR_THEME.zone.buildingColors[buildingIdx % EDITOR_THEME.zone.buildingColors.length];
          buildingIdx++;
          alpha = EDITOR_THEME.zone.buildingAlpha;
        } else {
          color = EDITOR_THEME.zone.streetColors[streetIdx % EDITOR_THEME.zone.streetColors.length];
          streetIdx++;
          alpha = EDITOR_THEME.zone.streetAlpha;
        }

        for (const c of cells) {
          g.rect(c.x * TILE_SIZE, c.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          g.fill({ color, alpha });
        }
      }
    }

    // --- 2. Edge rendering from compiled edge classification ---
    if (edgeMap) {
      const W = EDITOR_THEME.wall.width; // wall thickness
      for (const [ek, cls] of Object.entries(edgeMap)) {
        if (cls === 'open') continue;

        const [partA, partB] = ek.split('|');
        const [x1, y1] = partA.split(',').map(Number);
        const [x2, y2] = partB.split(',').map(Number);

        const isVertical = x1 !== x2;

        if (cls === 'wall') {
          // Solid wall as filled rect
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            g.rect(ex - W / 2, y1 * TILE_SIZE, W, TILE_SIZE);
          } else {
            const ey = Math.max(y1, y2) * TILE_SIZE;
            g.rect(x1 * TILE_SIZE, ey - W / 2, TILE_SIZE, W);
          }
          g.fill({ color: EDITOR_THEME.wall.color, alpha: EDITOR_THEME.wall.alpha });
        } else if (cls === 'door') {
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            const ey = y1 * TILE_SIZE;
            g.rect(ex - W / 2, ey, W, 3);
            g.fill({ color: EDITOR_THEME.door.frameColor });
            g.rect(ex - W / 2, ey + TILE_SIZE - 3, W, 3);
            g.fill({ color: EDITOR_THEME.door.frameColor });
            g.rect(ex - 3, ey + 3, 6, TILE_SIZE - 6);
            g.fill({ color: EDITOR_THEME.door.panelColor, alpha: EDITOR_THEME.door.panelAlpha });
          } else {
            const ex = x1 * TILE_SIZE;
            const ey = Math.max(y1, y2) * TILE_SIZE;
            g.rect(ex, ey - W / 2, 3, W);
            g.fill({ color: EDITOR_THEME.door.frameColor });
            g.rect(ex + TILE_SIZE - 3, ey - W / 2, 3, W);
            g.fill({ color: EDITOR_THEME.door.frameColor });
            g.rect(ex + 3, ey - 3, TILE_SIZE - 6, 6);
            g.fill({ color: EDITOR_THEME.door.panelColor, alpha: EDITOR_THEME.door.panelAlpha });
          }
        } else if (cls === 'crosswalk') {
          // Dashed white crosswalk line
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            const ey = y1 * TILE_SIZE;
            for (let dy = 2; dy < TILE_SIZE; dy += 6) {
              g.rect(ex - 1, ey + dy, 2, 3);
              g.fill({ color: EDITOR_THEME.crosswalk.color, alpha: EDITOR_THEME.crosswalk.alpha });
            }
          } else {
            const ex = x1 * TILE_SIZE;
            const ey = Math.max(y1, y2) * TILE_SIZE;
            for (let dx = 2; dx < TILE_SIZE; dx += 6) {
              g.rect(ex + dx, ey - 1, 3, 2);
              g.fill({ color: EDITOR_THEME.crosswalk.color, alpha: EDITOR_THEME.crosswalk.alpha });
            }
          }
        } else if (cls === 'doorway') {
          // Building passage — green gap indicator
          if (isVertical) {
            const ex = Math.max(x1, x2) * TILE_SIZE;
            const ey = y1 * TILE_SIZE;
            g.rect(ex - 2, ey + 4, 4, TILE_SIZE - 8);
            g.fill({ color: EDITOR_THEME.doorway.color, alpha: EDITOR_THEME.doorway.alpha });
          } else {
            const ex = x1 * TILE_SIZE;
            const ey = Math.max(y1, y2) * TILE_SIZE;
            g.rect(ex + 4, ey - 2, TILE_SIZE - 8, 4);
            g.fill({ color: EDITOR_THEME.doorway.color, alpha: EDITOR_THEME.doorway.alpha });
          }
        }
        // 'open' edges: no visual needed
      }
    }

    // --- 3. Tile boundary grid (subtle) ---
    for (const tile of this.tiles) {
      const px = tile.x * TILE_PIXEL_SIZE;
      const py = tile.y * TILE_PIXEL_SIZE;
      g.rect(px, py, TILE_PIXEL_SIZE, TILE_PIXEL_SIZE);
      g.stroke({ width: EDITOR_THEME.tileBorder.width, color: EDITOR_THEME.tileBorder.color, alpha: EDITOR_THEME.tileBorder.alpha });
    }

    // --- 4. Marker icons ---
    this.markers.forEach(marker => {
      const cx = marker.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = marker.y * TILE_SIZE + TILE_SIZE / 2;

      switch (marker.type) {
        case MarkerType.PlayerStart:
          g.circle(cx, cy, 18);
          g.fill({ color: EDITOR_THEME.marker.playerStart.fill, alpha: EDITOR_THEME.marker.playerStart.fillAlpha });
          g.stroke({ width: EDITOR_THEME.marker.playerStart.strokeWidth, color: EDITOR_THEME.marker.playerStart.stroke });
          break;
        case MarkerType.ZombieSpawn:
          g.moveTo(cx, cy - 18);
          g.lineTo(cx + 14, cy);
          g.lineTo(cx, cy + 18);
          g.lineTo(cx - 14, cy);
          g.closePath();
          g.fill({ color: EDITOR_THEME.marker.zombieSpawn.fill, alpha: EDITOR_THEME.marker.zombieSpawn.fillAlpha });
          g.stroke({ width: EDITOR_THEME.marker.zombieSpawn.strokeWidth, color: EDITOR_THEME.marker.zombieSpawn.stroke });
          break;
        case MarkerType.Exit:
          g.rect(cx - 14, cy - 14, 28, 28);
          g.fill({ color: 0x22AA44, alpha: 0.85 });
          g.stroke({ width: 2, color: 0x44DD66 });
          break;
        case MarkerType.Objective:
          g.circle(cx, cy, 14);
          g.fill({ color: EDITOR_THEME.marker.objective.fill, alpha: EDITOR_THEME.marker.objective.fillAlpha });
          g.stroke({ width: EDITOR_THEME.marker.objective.strokeWidth, color: EDITOR_THEME.marker.objective.stroke });
          g.circle(cx, cy, 5);
          g.fill({ color: EDITOR_THEME.marker.objective.dotColor });
          break;
      }
    });

    // --- 5. Spawn number labels ---
    // Remove old labels
    this.spawnLabelContainer.removeChildren();
    // Count spawn markers in array order to assign numbers
    let spawnNum = 1;
    for (const marker of this.markers) {
      if (marker.type !== MarkerType.ZombieSpawn) continue;
      const cx = marker.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = marker.y * TILE_SIZE + TILE_SIZE / 2;
      const label = new PIXI.Text({
        text: String(spawnNum),
        style: {
          fontFamily: 'Arial',
          fontSize: 14,
          fontWeight: 'bold',
          fill: 0xFFFFFF,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.anchor.set(0.5, 0.5);
      label.position.set(cx, cy);
      this.spawnLabelContainer.addChild(label);
      spawnNum++;
    }

    // --- 6. Room dark/lit icons (moon/sun via PIXI.Graphics) ---
    this.roomIconContainer.removeChildren();
    if (geo) {
      const seenZones = new Set<string>();
      for (const [zoneId, cells] of Object.entries(geo.zoneCells)) {
        const zone = this.state.zones[zoneId];
        if (!zone || !zone.isBuilding || seenZones.has(zoneId)) continue;
        seenZones.add(zoneId);

        // Calculate zone centroid
        let sumX = 0, sumY = 0;
        for (const c of cells) { sumX += c.x; sumY += c.y; }
        const cx = (sumX / cells.length) * TILE_SIZE + TILE_SIZE / 2;
        const cy = (sumY / cells.length) * TILE_SIZE + TILE_SIZE / 2;

        const iconPath = zone.isDark ? '/images/icons/moon-white.svg' : '/images/icons/sun-yellow.svg';
        const sprite = PIXI.Sprite.from(iconPath);
        sprite.width = 24;
        sprite.height = 24;
        sprite.anchor.set(0.5, 0.5);
        sprite.position.set(cx, cy);
        this.roomIconContainer.addChild(sprite);
      }
    }

    // --- 7. Exit marker icons (after roomIconContainer clear) ---
    this.markers.forEach(marker => {
      if (marker.type === MarkerType.Exit) {
        const cx = marker.x * TILE_SIZE + TILE_SIZE / 2;
        const cy = marker.y * TILE_SIZE + TILE_SIZE / 2;
        const exitSprite = PIXI.Sprite.from('/images/icons/door-open-white.svg');
        exitSprite.width = 24;
        exitSprite.height = 24;
        exitSprite.position.set(cx - 12, cy - 12);
        this.roomIconContainer.addChild(exitSprite);
      }
    });
  }

  // =============================================
  // VALIDATION
  // =============================================

  private updateValidation() {
    const warnings: string[] = [];

    if (this.tiles.length === 0) {
      warnings.push('No tiles placed');
    }

    const playerStart = this.markers.find(m => m.type === MarkerType.PlayerStart);
    if (!playerStart) warnings.push('Missing: Player Start');

    const hasSpawn = this.markers.some(m => m.type === MarkerType.ZombieSpawn);
    if (!hasSpawn) warnings.push('Missing: Zombie Spawn');

    const hasExit = this.markers.some(m => m.type === MarkerType.Exit);
    if (!hasExit) warnings.push('Optional: No Exit point');

    this.markers.forEach(m => {
      if (!this.isZoneCellValid(m.x, m.y)) {
        warnings.push(`Marker ${m.type} at (${m.x},${m.y}) outside tiles`);
      } else if (MapEditor.STREET_ONLY_MARKERS.includes(m.type)) {
        const ct = this.getCellType(m.x, m.y);
        if (ct && ct !== 'street') {
          warnings.push(`${m.type} at (${m.x},${m.y}) must be on a street zone`);
        }
      }
    });

    if (playerStart && Object.keys(this.state.zones).length > 0) {
      const cellKey = `${playerStart.x},${playerStart.y}`;
      const startZoneId = this.state.zoneGeometry?.cellToZone[cellKey] || `z_${playerStart.x}_${playerStart.y}`;
      if (this.state.zones[startZoneId]) {
        const visited = new Set<string>();
        const queue = [startZoneId];
        visited.add(startZoneId);

        while (queue.length > 0) {
          const current = queue.shift()!;
          const zone = this.state.zones[current];
          if (!zone) continue;
          for (const neighbor of zone.connections.map(c => c.toZoneId)) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }

        const allZoneIds = Object.keys(this.state.zones);
        const unreachable = allZoneIds.filter(id => !visited.has(id));
        if (unreachable.length > 0) {
          warnings.push(`${unreachable.length} zone(s) unreachable from Player Start`);
        }
      }
    }

    // Check tile edge compatibility at shared boundaries
    this.checkTileEdgeCompatibility(warnings);

    // Zone count summary
    const zoneCount = Object.keys(this.state.zones).length;
    if (zoneCount > 0) {
      const streetZones = Object.values(this.state.zones).filter(z => !z.isBuilding).length;
      const buildingZones = Object.values(this.state.zones).filter(z => z.isBuilding).length;
      warnings.push(`Optional: ${zoneCount} zones (${streetZones} street, ${buildingZones} building)`);
    }

    if (warnings.length === 0) {
      this.validationPanelEl.innerHTML = '<span class="editor-validation__ok">Map valid</span>';
    } else {
      this.validationPanelEl.innerHTML = warnings.map(w =>
        `<div class="${w.startsWith('Optional') ? 'editor-validation__warn' : 'editor-validation__error'}">${w}</div>`
      ).join('');
    }
  }

  private checkTileEdgeCompatibility(warnings: string[]) {
    const tileMap = new Map<string, TileInstance>();
    for (const t of this.tiles) {
      tileMap.set(`${t.x},${t.y}`, t);
    }

    const checked = new Set<string>();

    for (const tile of this.tiles) {
      const neighbors: { dx: number; dy: number; sideA: 'north' | 'south' | 'east' | 'west'; sideB: 'north' | 'south' | 'east' | 'west' }[] = [
        { dx: 1, dy: 0, sideA: 'east', sideB: 'west' },
        { dx: 0, dy: 1, sideA: 'south', sideB: 'north' },
      ];

      for (const { dx, dy, sideA, sideB } of neighbors) {
        const neighborKey = `${tile.x + dx},${tile.y + dy}`;
        const neighbor = tileMap.get(neighborKey);
        if (!neighbor) continue;

        const pairKey = `${tile.x},${tile.y}|${neighborKey}`;
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);

        const defA = getRotatedTileDefinition(tile.tileId, tile.rotation);
        const defB = getRotatedTileDefinition(neighbor.tileId, neighbor.rotation);
        if (!defA || !defB) continue;

        // Check a sample of edge positions for mismatches
        let mismatches = 0;
        for (let i = 0; i < TILE_CELLS_PER_SIDE; i++) {
          const edgeA = defA.edges.find(e => e.side === sideA && e.localIndex === i);
          const edgeB = defB.edges.find(e => e.side === sideB && e.localIndex === i);
          if (!edgeA || !edgeB) continue;

          // Mismatch: one side is street, other is wall
          if (edgeA.type !== edgeB.type) {
            mismatches++;
          }
        }

        if (mismatches > 0) {
          warnings.push(`Edge mismatch: tile (${tile.x},${tile.y}) ${sideA} ↔ tile (${neighbor.x},${neighbor.y}) ${sideB}: ${mismatches} cells`);
        }
      }
    }
  }

  // =============================================
  // SAVE / LOAD / CLEAR
  // =============================================

  private clearAll() {
    modalManager.open({
      title: 'Clear Everything?',
      size: 'sm',
      renderBody: () => '<p class="text-secondary">This will remove all tiles and markers.</p>',
      renderFooter: () => `
        ${renderButton({ label: 'Cancel', variant: 'secondary', dataAction: 'modal-close' })}
        ${renderButton({ label: 'Clear', variant: 'destructive', dataAction: 'confirm-clear' })}
      `,
      onOpen: (el) => {
        el.addEventListener('click', (ev) => {
          if ((ev.target as HTMLElement).closest('[data-action="confirm-clear"]')) {
            modalManager.close();
            this.tiles = [];
            this.markers = [];
            this.state.tiles = [];
            this.state.zones = {};
            this.state.zoneGeometry = undefined;
            setZoneGeometry(null);
            this.updateValidation();
          }
        });
      },
    });
  }

  private async saveMap(name: string) {
    if (!name) {
      notificationManager.show({ variant: 'warning', message: 'Please enter a map name' });
      return;
    }

    if (this.tiles.length === 0) {
      notificationManager.show({ variant: 'warning', message: 'Map is empty!' });
      return;
    }

    const mapData: ScenarioMap = {
      id: `map-${Date.now()}`,
      name: name,
      width: Math.max(...this.tiles.map(t => t.x)) + 1,
      height: Math.max(...this.tiles.map(t => t.y)) + 1,
      gridSize: TILE_CELLS_PER_SIDE,
      tiles: this.tiles,
      markers: this.markers,
    };

    try {
      const response = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapData),
      });

      if (response.ok) {
        notificationManager.show({ variant: 'success', message: `Map "${name}" saved` });
      } else {
        notificationManager.show({ variant: 'danger', message: 'Failed to save map' });
      }
    } catch (e) {
      console.error(e);
      notificationManager.show({ variant: 'danger', message: 'Error saving map' });
    }
  }

  private async showLoadDialog() {
    try {
      const res = await fetch('/api/maps');
      if (!res.ok) return;
      const maps = await res.json();

      if (maps.length === 0) {
        notificationManager.show({ variant: 'info', message: 'No saved maps found.' });
        return;
      }

      modalManager.open({
        title: 'Load Map',
        size: 'md',
        renderBody: () => `
          <div class="stack stack--sm">
            ${maps.map((m: any, i: number) => `
              <div style="display:flex;align-items:center;gap:4px">
                ${renderButton({
                  label: `${m.name} (${m.id})`,
                  variant: 'ghost',
                  fullWidth: true,
                  dataAction: 'load-map',
                  dataId: String(i),
                })}
                ${renderButton({
                  icon: 'Trash2',
                  variant: 'destructive',
                  size: 'sm',
                  dataAction: 'delete-map',
                  dataId: String(i),
                  title: 'Delete map',
                })}
              </div>
            `).join('')}
          </div>`,
        onOpen: (el) => {
          el.addEventListener('click', async (ev) => {
            const loadBtn = (ev.target as HTMLElement).closest('[data-action="load-map"]') as HTMLElement | null;
            if (loadBtn) {
              const idx = parseInt(loadBtn.dataset.id || '');
              if (idx >= 0 && idx < maps.length) {
                modalManager.close();
                this.loadMap(maps[idx]);
              }
              return;
            }
            const delBtn = (ev.target as HTMLElement).closest('[data-action="delete-map"]') as HTMLElement | null;
            if (delBtn) {
              const idx = parseInt(delBtn.dataset.id || '');
              if (idx >= 0 && idx < maps.length) {
                const map = maps[idx];
                modalManager.close();
                modalManager.open({
                  title: 'Delete Map',
                  size: 'sm',
                  renderBody: () => `<p>Delete map "<strong>${map.name}</strong>"? This cannot be undone.</p>`,
                  renderFooter: () => `
                    ${renderButton({ label: 'Cancel', variant: 'secondary', dataAction: 'modal-close' })}
                    ${renderButton({ label: 'Delete', icon: 'Trash2', variant: 'destructive', dataAction: 'confirm-delete' })}`,
                  onOpen: (el) => {
                    el.addEventListener('click', async (e) => {
                      if (!(e.target as HTMLElement).closest('[data-action="confirm-delete"]')) return;
                      try {
                        await fetch(`/api/maps/${encodeURIComponent(map.id)}`, { method: 'DELETE' });
                        maps.splice(idx, 1);
                        modalManager.close();
                        if (maps.length > 0) {
                          this.showLoadDialog();
                        } else {
                          notificationManager.show({ variant: 'info', message: 'No saved maps found.' });
                        }
                      } catch (e) {
                        console.error('Failed to delete map:', e);
                      }
                    });
                  },
                });
              }
            }
          });
        },
      });
    } catch (e) {
      console.error('Failed to load maps:', e);
    }
  }

  private loadMap(mapData: any) {
    // Migrate legacy coordinates to current grid size
    const isLegacy = !mapData.gridSize || mapData.gridSize !== TILE_CELLS_PER_SIDE;
    const scale = isLegacy ? TILE_CELLS_PER_SIDE / (mapData.gridSize || 3) : 1;

    this.tiles = mapData.tiles || [];
    this.markers = (mapData.markers || []).map((m: any) => ({
      ...m,
      x: m.x * scale, y: m.y * scale,
    }));

    const nameInput = document.getElementById('map-name-input') as HTMLInputElement;
    if (nameInput) nameInput.value = mapData.name || '';

    this.rebuildPreviewState();
    this.updateValidation();
    this.statusText.innerText = `Loaded: ${mapData.name}${isLegacy ? ' (migrated from 3x3)' : ''}`;
  }

  // =============================================
  // LIFECYCLE
  // =============================================

  public destroy() {
    if (this.paletteContainer) {
      this.paletteContainer.remove();
    }
    this.tileDefEditor?.destroy();
    this.app.ticker.remove(this.renderLoop, this);
    this.app.stage.removeChildren();
  }

  private renderLoop = () => {
    this.renderer.render(this.state, { editorMode: true });
    this.renderOverlay();
  };
}
