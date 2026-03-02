
// src/client/editor/MapEditor.ts

import * as PIXI from 'pixi.js';
import { TileService, tileService } from '../../services/TileService';
import { TileInstance, ScenarioMap, MapRoom, MapDoor, MapMarker, MarkerType } from '../../types/Map';
import { PixiBoardRenderer } from '../PixiBoardRenderer';
import { GameState, initialGameState, Zone, ZoneConnection } from '../../types/GameState';
import { TILE_SIZE } from '../../config/Layout';
import { compileScenario } from '../../services/ScenarioCompiler';

// --- Editor Tool Modes ---
enum EditorTool {
  Tile = 'TILE',
  Room = 'ROOM',
  Door = 'DOOR',
  PlayerStart = 'PLAYER_START',
  ZombieSpawn = 'ZOMBIE_SPAWN',
  Exit = 'EXIT',
  Objective = 'OBJECTIVE',
  Eraser = 'ERASER',
}

// Helper: edge key for door lookup
function doorEdgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1},${y1}`;
  const b = `${x2},${y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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
  private rooms: MapRoom[] = [];
  private doors: MapDoor[] = [];
  private markers: MapMarker[] = [];

  // --- Room painting state ---
  private activeRoomId: string | null = null; // Room currently being painted
  private nextRoomIndex = 0;

  // --- Door placement state ---
  private doorStartCell: { x: number; y: number } | null = null;

  // --- Overlay layer for editor-specific visuals ---
  private overlayLayer: PIXI.Container;
  private overlayGraphics: PIXI.Graphics;

  // UI Elements
  private paletteContainer!: HTMLElement;
  private statusText!: HTMLElement;
  private toolButtons: Map<EditorTool, HTMLButtonElement> = new Map();

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
    this.overlayLayer.addChild(this.overlayGraphics);
    // We'll add this to the stage after the renderer's container
    // Access the stage directly
    this.app.stage.addChild(this.overlayLayer);
    
    // Setup UI
    this.createUI();
    
    // Draw Editor Grid
    this.renderer.drawEditorGrid(20, 20);

    this.setupInteraction();

    // Loop
    this.app.ticker.add(this.renderLoop, this);
  }

  // =============================================
  // UI CREATION
  // =============================================

  private createUI() {
    this.paletteContainer = document.createElement('div');
    this.paletteContainer.id = 'editor-palette';
    this.paletteContainer.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        width: 280px;
        height: 100vh;
        background: #1a1a2e;
        color: white;
        overflow-y: auto;
        padding: 12px;
        border-left: 2px solid #333;
        font-family: monospace;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    document.body.appendChild(this.paletteContainer);

    // --- Map Name + Save/Clear ---
    this.createToolbar();

    // --- Tool Selection ---
    this.createToolSelector();

    // --- Status ---
    this.statusText = document.createElement('div');
    this.statusText.style.cssText = 'padding: 6px; background: #111; border-radius: 4px; font-size: 12px; min-height: 20px;';
    this.statusText.innerText = 'Select a tool...';
    this.paletteContainer.appendChild(this.statusText);

    // --- Tile Palette (shown when Tile tool active) ---
    this.createTilePalette();

    // --- Room List (shown when Room tool active) ---
    this.createRoomPanel();

    // --- Validation Panel ---
    this.createValidationPanel();

    // --- Instructions ---
    this.createInstructions();
  }

  private createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    const title = document.createElement('h2');
    title.innerText = 'Map Editor';
    title.style.cssText = 'margin: 0; font-size: 16px; color: #8af;';
    toolbar.appendChild(title);

    const nameInput = document.createElement('input');
    nameInput.id = 'map-name-input';
    nameInput.placeholder = 'Map Name';
    nameInput.style.cssText = 'padding: 6px; background: #222; color: #fff; border: 1px solid #444; border-radius: 3px;';
    toolbar.appendChild(nameInput);
    
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 6px;';

    const saveBtn = document.createElement('button');
    saveBtn.innerText = 'Save Map';
    saveBtn.style.cssText = this.actionBtnStyle('#2a6');
    saveBtn.onclick = () => this.saveMap(nameInput.value);
    
    const clearBtn = document.createElement('button');
    clearBtn.innerText = 'Clear All';
    clearBtn.style.cssText = this.actionBtnStyle('#a33');
    clearBtn.onclick = () => this.clearAll();

    const loadBtn = document.createElement('button');
    loadBtn.innerText = 'Load';
    loadBtn.style.cssText = this.actionBtnStyle('#36a');
    loadBtn.onclick = () => this.showLoadDialog();

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(loadBtn);
    toolbar.appendChild(btnRow);

    this.paletteContainer.appendChild(toolbar);
  }

  private createToolSelector() {
    const section = document.createElement('div');
    section.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    
    const label = document.createElement('div');
    label.innerText = 'Tools';
    label.style.cssText = 'font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px;';
    section.appendChild(label);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 4px;';

    const tools: { tool: EditorTool; label: string; color: string; key: string }[] = [
      { tool: EditorTool.Tile, label: 'Tiles', color: '#555', key: '1' },
      { tool: EditorTool.Room, label: 'Rooms', color: '#964B00', key: '2' },
      { tool: EditorTool.Door, label: 'Doors', color: '#8B4513', key: '3' },
      { tool: EditorTool.PlayerStart, label: 'P. Start', color: '#0af', key: '4' },
      { tool: EditorTool.ZombieSpawn, label: 'Z. Spawn', color: '#f44', key: '5' },
      { tool: EditorTool.Exit, label: 'Exit', color: '#28f', key: '6' },
      { tool: EditorTool.Objective, label: 'Objective', color: '#fd0', key: '7' },
      { tool: EditorTool.Eraser, label: 'Eraser', color: '#666', key: 'E' },
    ];

    tools.forEach(({ tool, label, color, key }) => {
      const btn = document.createElement('button');
      btn.innerText = `[${key}] ${label}`;
      btn.style.cssText = `
        padding: 6px 4px; background: ${color}33; color: #ccc; border: 2px solid ${color}66;
        border-radius: 4px; cursor: pointer; font-size: 11px; font-family: monospace;
        transition: all 0.15s;
      `;
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
    this.tilePaletteEl.style.cssText = 'display: none;';

    const label = document.createElement('div');
    label.innerText = 'Tile Palette';
    label.style.cssText = 'font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;';
    this.tilePaletteEl.appendChild(label);

    const list = document.createElement('div');
    list.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;';

    const checkAssets = setInterval(() => {
      if (tileService.isReady) {
        clearInterval(checkAssets);
        this.populateTilePalette(list);
      }
    }, 100);

    this.tilePaletteEl.appendChild(list);
    this.paletteContainer.appendChild(this.tilePaletteEl);
  }

  private roomPanelEl!: HTMLElement;
  private roomListEl!: HTMLElement;
  private createRoomPanel() {
    this.roomPanelEl = document.createElement('div');
    this.roomPanelEl.id = 'room-panel-section';
    this.roomPanelEl.style.cssText = 'display: none;';

    const label = document.createElement('div');
    label.innerText = 'Rooms';
    label.style.cssText = 'font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;';
    this.roomPanelEl.appendChild(label);

    const newBtn = document.createElement('button');
    newBtn.innerText = '+ New Room';
    newBtn.style.cssText = this.actionBtnStyle('#964B00');
    newBtn.onclick = () => this.createNewRoom();
    this.roomPanelEl.appendChild(newBtn);

    this.roomListEl = document.createElement('div');
    this.roomListEl.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-top: 6px;';
    this.roomPanelEl.appendChild(this.roomListEl);

    this.paletteContainer.appendChild(this.roomPanelEl);
  }

  private validationPanelEl!: HTMLElement;
  private createValidationPanel() {
    this.validationPanelEl = document.createElement('div');
    this.validationPanelEl.id = 'validation-panel';
    this.validationPanelEl.style.cssText = 'padding: 6px; background: #111; border-radius: 4px; font-size: 11px;';
    this.paletteContainer.appendChild(this.validationPanelEl);
  }

  private createInstructions() {
    const instructions = document.createElement('div');
    instructions.style.cssText = 'font-size: 11px; color: #666; margin-top: auto; padding-top: 10px; border-top: 1px solid #333;';
    instructions.innerHTML = `
        <b>Controls:</b><br>
        <b>Click</b> to place | <b>Right-click</b> to remove<br>
        <b>R</b> rotate tile | <b>1-7, E</b> switch tools<br>
        <b>Scroll</b> zoom | <b>Drag</b> pan
    `;
    this.paletteContainer.appendChild(instructions);
  }

  private actionBtnStyle(color: string): string {
    return `padding: 6px 8px; background: ${color}; color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-family: monospace; flex: 1;`;
  }

  // =============================================
  // TOOL MANAGEMENT
  // =============================================

  private setTool(tool: EditorTool) {
    this.activeTool = tool;
    this.doorStartCell = null; // Reset partial door

    // Update button highlights
    this.toolButtons.forEach((btn, t) => {
      if (t === tool) {
        btn.style.outline = '2px solid #fff';
        btn.style.color = '#fff';
      } else {
        btn.style.outline = 'none';
        btn.style.color = '#ccc';
      }
    });

    // Show/hide sub-panels
    this.tilePaletteEl.style.display = tool === EditorTool.Tile ? 'block' : 'none';
    this.roomPanelEl.style.display = tool === EditorTool.Room ? 'block' : 'none';

    const hints: Record<EditorTool, string> = {
      [EditorTool.Tile]: 'Click grid to place/replace tiles. R to rotate.',
      [EditorTool.Room]: 'Select a room, then click zone cells to add/remove.',
      [EditorTool.Door]: 'Click a zone cell, then click an adjacent cell to place a door between them.',
      [EditorTool.PlayerStart]: 'Click a zone cell to set the Player Start position.',
      [EditorTool.ZombieSpawn]: 'Click zone cells to place Zombie Spawn points.',
      [EditorTool.Exit]: 'Click zone cells to place Exit points.',
      [EditorTool.Objective]: 'Click zone cells to place Objective tokens.',
      [EditorTool.Eraser]: 'Click to remove markers/rooms/doors from cells.',
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
      item.style.cssText = 'border: 2px solid #333; cursor: pointer; text-align: center; padding: 4px; background: #222; border-radius: 3px; font-size: 12px; font-weight: bold;';
      item.innerText = id;
      
      item.onclick = () => {
        this.selectedTileId = id;
        this.statusText.innerText = `Tile: ${id} (${this.currentRotation}\u00B0)`;
        
        Array.from(container.children).forEach((c: any) => {
          c.style.borderColor = '#333';
          c.style.background = '#222';
        });
        item.style.borderColor = '#0f0';
        item.style.background = '#363';
      };

      container.appendChild(item);
    });
  }

  // =============================================
  // ROOM MANAGEMENT
  // =============================================

  private createNewRoom() {
    const roomId = `room-${this.nextRoomIndex++}`;
    const room: MapRoom = {
      id: roomId,
      name: `Room ${this.rooms.length + 1}`,
      cells: [],
    };
    this.rooms.push(room);
    this.activeRoomId = roomId;
    this.refreshRoomList();
    this.statusText.innerText = `Created "${room.name}". Click zone cells to add.`;
  }

  private refreshRoomList() {
    this.roomListEl.innerHTML = '';

    this.rooms.forEach(room => {
      const el = document.createElement('div');
      const isActive = room.id === this.activeRoomId;
      el.style.cssText = `
        padding: 4px 8px; background: ${isActive ? '#553322' : '#222'}; 
        border: 1px solid ${isActive ? '#a66' : '#444'}; border-radius: 3px; 
        cursor: pointer; display: flex; justify-content: space-between; align-items: center;
      `;

      const nameSpan = document.createElement('span');
      nameSpan.innerText = `${room.name} (${room.cells.length} cells)`;
      nameSpan.style.fontSize = '11px';
      el.appendChild(nameSpan);

      const delBtn = document.createElement('button');
      delBtn.innerText = 'X';
      delBtn.style.cssText = 'background: #a33; color: #fff; border: none; padding: 2px 6px; cursor: pointer; font-size: 10px; border-radius: 2px;';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this.rooms = this.rooms.filter(r => r.id !== room.id);
        if (this.activeRoomId === room.id) this.activeRoomId = null;
        this.refreshRoomList();
      };
      el.appendChild(delBtn);

      el.onclick = () => {
        this.activeRoomId = room.id;
        this.refreshRoomList();
        this.statusText.innerText = `Painting room: ${room.name}`;
      };

      this.roomListEl.appendChild(el);
    });
  }

  // =============================================
  // INTERACTION
  // =============================================

  private setupInteraction() {
    // Key bindings
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'r' && this.activeTool === EditorTool.Tile) {
        this.currentRotation = (this.currentRotation + 90) % 360 as any;
        if (this.selectedTileId) {
          this.statusText.innerText = `Tile: ${this.selectedTileId} (${this.currentRotation}\u00B0)`;
        }
      }
      // Number keys for tool switching
      const toolMap: Record<string, EditorTool> = {
        '1': EditorTool.Tile, '2': EditorTool.Room, '3': EditorTool.Door,
        '4': EditorTool.PlayerStart, '5': EditorTool.ZombieSpawn,
        '6': EditorTool.Exit, '7': EditorTool.Objective, 'e': EditorTool.Eraser,
      };
      if (toolMap[key]) this.setTool(toolMap[key]);
    });

    // Canvas Interaction
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointerup', (e) => {
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
    const TILE_PIXEL_SIZE = TILE_SIZE * 3;
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
    // Check if this zone cell falls within any placed tile
    const tx = Math.floor(zx / 3);
    const ty = Math.floor(zy / 3);
    return this.tiles.some(t => t.x === tx && t.y === ty);
  }

  private handleLeftClick(wx: number, wy: number) {
    switch (this.activeTool) {
      case EditorTool.Tile:
        this.handleTilePlacement(wx, wy);
        break;
      case EditorTool.Room:
        this.handleRoomPaint(wx, wy);
        break;
      case EditorTool.Door:
        this.handleDoorPlacement(wx, wy);
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
    // Right-click always erases in current tool context
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

    // Also clean up any rooms/doors/markers in the removed tile's zone cells
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const zx = tx * 3 + dx;
        const zy = ty * 3 + dy;
        this.removeAllAtCell(zx, zy);
      }
    }
  }

  // --- Room Painting ---

  private handleRoomPaint(wx: number, wy: number) {
    if (!this.activeRoomId) {
      this.statusText.innerText = 'Create or select a room first.';
      return;
    }

    const { zx, zy } = this.worldToZoneCoord(wx, wy);
    if (!this.isZoneCellValid(zx, zy)) {
      this.statusText.innerText = 'Cell outside placed tiles.';
      return;
    }

    const room = this.rooms.find(r => r.id === this.activeRoomId);
    if (!room) return;

    // Check if cell is already in THIS room -> remove it
    const cellIndex = room.cells.findIndex(c => c.x === zx && c.y === zy);
    if (cellIndex !== -1) {
      room.cells.splice(cellIndex, 1);
      this.statusText.innerText = `Removed cell (${zx},${zy}) from ${room.name}`;
    } else {
      // Check if cell belongs to ANOTHER room -> steal it
      for (const otherRoom of this.rooms) {
        if (otherRoom.id === room.id) continue;
        otherRoom.cells = otherRoom.cells.filter(c => c.x !== zx || c.y !== zy);
      }
      room.cells.push({ x: zx, y: zy });
      this.statusText.innerText = `Added cell (${zx},${zy}) to ${room.name}`;
    }
    this.refreshRoomList();
  }

  // --- Door Placement ---

  private handleDoorPlacement(wx: number, wy: number) {
    const { zx, zy } = this.worldToZoneCoord(wx, wy);
    if (!this.isZoneCellValid(zx, zy)) return;

    if (!this.doorStartCell) {
      this.doorStartCell = { x: zx, y: zy };
      this.statusText.innerText = `Door start: (${zx},${zy}). Click an adjacent cell to complete.`;
    } else {
      const dx = Math.abs(zx - this.doorStartCell.x);
      const dy = Math.abs(zy - this.doorStartCell.y);

      if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
        // Valid cardinal neighbor
        const ek = doorEdgeKey(this.doorStartCell.x, this.doorStartCell.y, zx, zy);
        
        // Toggle: if door exists, remove it
        const existingIndex = this.doors.findIndex(d => 
          doorEdgeKey(d.x1, d.y1, d.x2, d.y2) === ek
        );
        
        if (existingIndex !== -1) {
          this.doors.splice(existingIndex, 1);
          this.statusText.innerText = `Removed door between (${this.doorStartCell.x},${this.doorStartCell.y}) and (${zx},${zy})`;
        } else {
          this.doors.push({
            x1: this.doorStartCell.x,
            y1: this.doorStartCell.y,
            x2: zx,
            y2: zy,
            open: false, // Doors start closed by default
          });
          this.statusText.innerText = `Placed door (closed) between (${this.doorStartCell.x},${this.doorStartCell.y}) and (${zx},${zy})`;
        }
      } else {
        this.statusText.innerText = `Cells not adjacent. Try again.`;
      }
      this.doorStartCell = null;
    }
  }

  // --- Marker Placement ---

  private handleMarkerPlacement(wx: number, wy: number, type: MarkerType, unique: boolean) {
    const { zx, zy } = this.worldToZoneCoord(wx, wy);
    if (!this.isZoneCellValid(zx, zy)) {
      this.statusText.innerText = 'Cell outside placed tiles.';
      return;
    }

    // If unique (e.g. PlayerStart), remove any existing of this type
    if (unique) {
      this.markers = this.markers.filter(m => m.type !== type);
    }

    // Toggle: if marker of this type already at this cell, remove it
    const existingIndex = this.markers.findIndex(m => m.type === type && m.x === zx && m.y === zy);
    if (existingIndex !== -1) {
      this.markers.splice(existingIndex, 1);
      this.statusText.innerText = `Removed ${type} at (${zx},${zy})`;
    } else {
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
    // Remove markers at cell
    this.markers = this.markers.filter(m => m.x !== zx || m.y !== zy);
    // Remove cell from rooms
    for (const room of this.rooms) {
      room.cells = room.cells.filter(c => c.x !== zx || c.y !== zy);
    }
    // Remove doors touching cell
    this.doors = this.doors.filter(d => 
      !((d.x1 === zx && d.y1 === zy) || (d.x2 === zx && d.y2 === zy))
    );
  }

  // =============================================
  // PREVIEW STATE REBUILD
  // =============================================

  /**
   * Rebuild the GameState preview from authored data so the renderer shows
   * zones, doors, markers overlaid on tiles.
   */
  private rebuildPreviewState() {
    this.state.tiles = [...this.tiles];

    if (this.tiles.length === 0) {
      this.state.zones = {};
      return;
    }

    // Compile the authored scenario to produce zones
    const scenarioMap: ScenarioMap = {
      id: 'preview',
      name: 'Preview',
      width: Math.max(...this.tiles.map(t => t.x)) + 1,
      height: Math.max(...this.tiles.map(t => t.y)) + 1,
      tiles: this.tiles,
      rooms: this.rooms,
      doors: this.doors,
      markers: this.markers,
    };

    try {
      const compiled = compileScenario(scenarioMap);
      this.state.zones = compiled.zones;
    } catch (e) {
      console.warn('Preview compile error:', e);
      this.state.zones = {};
    }
  }

  // =============================================
  // OVERLAY RENDERING (editor-specific visuals)
  // =============================================

  private renderOverlay() {
    this.overlayGraphics.clear();
    
    // Sync overlay position with renderer's container
    // The renderer's container handles pan/zoom; overlay must match
    const rendererContainer = this.app.stage.children[0] as PIXI.Container;
    if (rendererContainer) {
      this.overlayLayer.position.copyFrom(rendererContainer.position);
      this.overlayLayer.scale.copyFrom(rendererContainer.scale);
    }

    const g = this.overlayGraphics;

    // --- Draw Room cell highlights ---
    const ROOM_COLORS = [0x964B00, 0x8B0000, 0x006400, 0x00008B, 0x4B0082, 0x800080];
    this.rooms.forEach((room, ri) => {
      const color = ROOM_COLORS[ri % ROOM_COLORS.length];
      room.cells.forEach(cell => {
        const px = cell.x * TILE_SIZE;
        const py = cell.y * TILE_SIZE;
        g.rect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        g.fill({ color, alpha: 0.25 });
        g.stroke({ width: 2, color, alpha: 0.6 });
      });
    });

    // --- Draw Door indicators on edges ---
    this.doors.forEach(door => {
      const cx1 = door.x1 * TILE_SIZE + TILE_SIZE / 2;
      const cy1 = door.y1 * TILE_SIZE + TILE_SIZE / 2;
      const cx2 = door.x2 * TILE_SIZE + TILE_SIZE / 2;
      const cy2 = door.y2 * TILE_SIZE + TILE_SIZE / 2;
      
      const mx = (cx1 + cx2) / 2;
      const my = (cy1 + cy2) / 2;
      
      const doorColor = door.open ? 0x00FF00 : 0x8B4513;
      
      // Door icon: small rectangle on edge midpoint
      if (door.x1 === door.x2) {
        // Vertical neighbors: horizontal edge
        g.rect(mx - 20, my - 5, 40, 10);
      } else {
        // Horizontal neighbors: vertical edge
        g.rect(mx - 5, my - 20, 10, 40);
      }
      g.fill({ color: doorColor, alpha: 0.8 });
      g.stroke({ width: 1, color: 0x000000 });
    });

    // --- Draw Marker icons ---
    this.markers.forEach(marker => {
      const cx = marker.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = marker.y * TILE_SIZE + TILE_SIZE / 2;

      switch (marker.type) {
        case MarkerType.PlayerStart:
          // Blue circle with P
          g.circle(cx, cy, 18);
          g.fill({ color: 0x0088FF, alpha: 0.7 });
          g.stroke({ width: 2, color: 0xFFFFFF });
          break;
        case MarkerType.ZombieSpawn:
          // Red diamond
          g.moveTo(cx, cy - 18);
          g.lineTo(cx + 14, cy);
          g.lineTo(cx, cy + 18);
          g.lineTo(cx - 14, cy);
          g.closePath();
          g.fill({ color: 0xFF2222, alpha: 0.7 });
          g.stroke({ width: 2, color: 0x000000 });
          break;
        case MarkerType.Exit:
          // Blue square with arrow
          g.rect(cx - 16, cy - 16, 32, 32);
          g.fill({ color: 0x2244AA, alpha: 0.7 });
          g.stroke({ width: 2, color: 0x4488FF });
          // Arrow
          g.moveTo(cx - 6, cy + 6);
          g.lineTo(cx + 8, cy);
          g.lineTo(cx - 6, cy - 6);
          g.stroke({ width: 3, color: 0xFFFFFF });
          break;
        case MarkerType.Objective:
          // Gold circle
          g.circle(cx, cy, 14);
          g.fill({ color: 0xFFD700, alpha: 0.8 });
          g.stroke({ width: 2, color: 0x000000 });
          g.circle(cx, cy, 5);
          g.fill({ color: 0x000000 });
          break;
      }
    });

    // --- Door placement preview (first cell selected) ---
    if (this.doorStartCell && this.activeTool === EditorTool.Door) {
      const px = this.doorStartCell.x * TILE_SIZE;
      const py = this.doorStartCell.y * TILE_SIZE;
      g.rect(px, py, TILE_SIZE, TILE_SIZE);
      g.stroke({ width: 3, color: 0xFFAA00, alpha: 0.8 });
    }
  }

  // =============================================
  // VALIDATION
  // =============================================

  private updateValidation() {
    const warnings: string[] = [];

    if (this.tiles.length === 0) {
      warnings.push('No tiles placed');
    }

    const hasPlayerStart = this.markers.some(m => m.type === MarkerType.PlayerStart);
    if (!hasPlayerStart) warnings.push('Missing: Player Start');

    const hasSpawn = this.markers.some(m => m.type === MarkerType.ZombieSpawn);
    if (!hasSpawn) warnings.push('Missing: Zombie Spawn');

    const hasExit = this.markers.some(m => m.type === MarkerType.Exit);
    if (!hasExit) warnings.push('Optional: No Exit point');

    // Check for rooms with 0 cells
    this.rooms.forEach(r => {
      if (r.cells.length === 0) warnings.push(`Empty room: "${r.name}"`);
    });

    // Check for orphaned markers (on cells not belonging to tiles)
    this.markers.forEach(m => {
      if (!this.isZoneCellValid(m.x, m.y)) {
        warnings.push(`Marker ${m.type} at (${m.x},${m.y}) outside tiles`);
      }
    });

    if (warnings.length === 0) {
      this.validationPanelEl.innerHTML = '<span style="color: #0f0;">Map valid</span>';
    } else {
      this.validationPanelEl.innerHTML = warnings.map(w => 
        `<div style="color: ${w.startsWith('Optional') ? '#fa0' : '#f44'};">${w}</div>`
      ).join('');
    }
  }

  // =============================================
  // SAVE / LOAD / CLEAR
  // =============================================

  private clearAll() {
    if (!confirm('Clear everything?')) return;
    this.tiles = [];
    this.rooms = [];
    this.doors = [];
    this.markers = [];
    this.activeRoomId = null;
    this.nextRoomIndex = 0;
    this.state.tiles = [];
    this.state.zones = {};
    this.refreshRoomList();
    this.updateValidation();
  }

  private async saveMap(name: string) {
    if (!name) {
      alert('Please enter a map name');
      return;
    }

    if (this.tiles.length === 0) {
      alert('Map is empty!');
      return;
    }

    // Clean empty rooms
    const cleanRooms = this.rooms.filter(r => r.cells.length > 0);

    const mapData: ScenarioMap = {
      id: `map-${Date.now()}`,
      name: name,
      width: Math.max(...this.tiles.map(t => t.x)) + 1,
      height: Math.max(...this.tiles.map(t => t.y)) + 1,
      tiles: this.tiles,
      rooms: cleanRooms,
      doors: this.doors,
      markers: this.markers,
    };

    try {
      const response = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapData),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Map saved! ID: ${result.id}`);
      } else {
        alert('Failed to save map');
      }
    } catch (e) {
      console.error(e);
      alert('Error saving map');
    }
  }

  private async showLoadDialog() {
    try {
      const res = await fetch('/api/maps');
      if (!res.ok) return;
      const maps = await res.json();

      if (maps.length === 0) {
        alert('No saved maps found.');
        return;
      }

      const names = maps.map((m: any, i: number) => `${i + 1}. ${m.name} (${m.id})`).join('\n');
      const choice = prompt(`Select map number to load:\n\n${names}`);
      if (!choice) return;

      const idx = parseInt(choice) - 1;
      if (idx < 0 || idx >= maps.length) return;

      this.loadMap(maps[idx]);
    } catch (e) {
      console.error('Failed to load maps:', e);
    }
  }

  private loadMap(mapData: any) {
    this.tiles = mapData.tiles || [];
    this.rooms = mapData.rooms || [];
    this.doors = mapData.doors || [];
    this.markers = mapData.markers || [];
    this.nextRoomIndex = this.rooms.length;
    this.activeRoomId = this.rooms.length > 0 ? this.rooms[0].id : null;

    const nameInput = document.getElementById('map-name-input') as HTMLInputElement;
    if (nameInput) nameInput.value = mapData.name || '';

    this.refreshRoomList();
    this.rebuildPreviewState();
    this.updateValidation();
    this.statusText.innerText = `Loaded: ${mapData.name}`;
  }

  // =============================================
  // LIFECYCLE
  // =============================================

  public destroy() {
    if (this.paletteContainer) {
      this.paletteContainer.remove();
    }
    this.app.ticker.remove(this.renderLoop, this);
    this.app.stage.removeChildren();
  }
  
  private renderLoop = () => {
    this.renderer.render(this.state);
    this.renderOverlay();
  };
}
