// src/client/editor/TileDefinitionEditor.ts
//
// Tile definition editor with zone-based painting and room-boundary editing.
// - Cells mode: paint zones (street zones S1-S9, building rooms A-Z)
// - Edges mode: set boundary types between zones (wall/crosswalk/open)
// - Doors mode: place 3-cell-wide doors on zone boundaries

import { renderButton } from '../ui/components/Button';
import { icon } from '../ui/components/icons';
import { tileService } from '../../services/TileService';
import {
  TileDefinition,
  TileCellDef,
  TileEdgeDef,
  TileInternalEdge,
  TileDoorDef,
  EdgeSide,
  BoundaryEdgeType,
} from '../../types/TileDefinition';
import {
  getTileDefinition,
  registerTileDefinitions,
  TILE_DEFINITIONS,
} from '../../config/TileDefinitions';
import { TILE_CELLS_PER_SIDE } from '../../config/Layout';
import { notificationManager } from '../ui/NotificationManager';
import { modalManager } from '../ui/overlays/ModalManager';

// --- Constants ---

const GRID = TILE_CELLS_PER_SIDE;
const CELL_PX = 15;
const TILE_DISPLAY = CELL_PX * GRID;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOOR_WIDTH = 3; // doors are always 3 cells wide/tall

const ROOM_COLORS: Record<string, string> = {};
const BASE_COLORS = [
  '#4488ff', '#ff6644', '#44cc66', '#cc44cc', '#ffcc00', '#00cccc',
  '#ff4488', '#88ff44', '#ff8844', '#44aaff', '#aa44ff', '#44ffaa',
  '#ffaa44', '#8844ff', '#44ff88', '#ff44aa', '#88ffaa', '#aa88ff',
  '#ffaa88', '#44ccaa', '#cc88ff', '#88ccff', '#ffcc88', '#aaff44',
  '#ccaa44', '#44aacc',
];
const STREET_COLORS = ['#33aa44', '#44bb55', '#55cc66', '#66dd77', '#339944', '#448855', '#557766', '#336644', '#449955'];

// Room letters A-Z
for (let i = 0; i < 26; i++) {
  ROOM_COLORS[String.fromCharCode(65 + i)] = BASE_COLORS[i % BASE_COLORS.length];
}
// Street zones S1-S9
for (let i = 0; i < 9; i++) {
  ROOM_COLORS[`S${i + 1}`] = STREET_COLORS[i];
}

type EditorMode = 'cells' | 'edges' | 'doors';

interface BoundaryInfo {
  roomA: string;
  roomB: string;
  edges: { x1: number; y1: number; x2: number; y2: number }[];
}

interface EditorState {
  tileId: string;
  def: TileDefinition;
  mode: EditorMode;
  activeZoneId: string; // 'A'-'Z' or 'S1'-'S9'
  isPainting: boolean;
  dragStart: { x: number; y: number } | null;
  dragEnd: { x: number; y: number } | null;
  activeEdgeBrush: BoundaryEdgeType;
  zoom: number;
}

interface TileDefinitionEditorOptions {
  onBack: () => void;
  onSave: () => void;
}

// --- Helpers ---

function getTileImageDataUrl(tileId: string): string | null {
  const texture = tileService.getTexture(tileId);
  if (!texture) return null;
  try {
    const canvas = document.createElement('canvas');
    const frame = texture.frame;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const source = (texture.source as any)?.resource;
    if (!source) return null;
    ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    return canvas.toDataURL();
  } catch { return null; }
}

function getCellDef(def: TileDefinition, x: number, y: number): TileCellDef | undefined {
  return def.cells.find(c => c.localX === x && c.localY === y);
}

function getEdgeDef(def: TileDefinition, side: EdgeSide, idx: number): TileEdgeDef | undefined {
  return def.edges.find(e => e.side === side && e.localIndex === idx);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function zoneColor(zoneId: string): string {
  return ROOM_COLORS[zoneId] || '#885500';
}

function isStreetZone(zoneId: string): boolean {
  return zoneId.startsWith('S');
}

function boundaryKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function doorEdgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1},${y1}`, b = `${x2},${y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function getUsedZones(def: TileDefinition): string[] {
  const zones = new Set<string>();
  for (const c of def.cells) {
    if (c.roomId) zones.add(c.roomId);
  }
  return [...zones].sort((a, b) => {
    const aStr = isStreetZone(a), bStr = isStreetZone(b);
    if (aStr !== bStr) return aStr ? -1 : 1;
    return a.localeCompare(b);
  });
}

function cloneDef(def: TileDefinition): TileDefinition {
  return JSON.parse(JSON.stringify(def));
}

function createDefaultDef(tileId: string): TileDefinition {
  const cells: TileCellDef[] = [];
  const edges: TileEdgeDef[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      cells.push({ localX: x, localY: y, type: 'street' });
    }
  }
  const sides: EdgeSide[] = ['north', 'south', 'east', 'west'];
  for (const side of sides) {
    for (let i = 0; i < GRID; i++) {
      edges.push({ side, localIndex: i, type: 'street', crosswalk: false });
    }
  }
  return { id: tileId, gridSize: GRID, cells, edges, internalEdges: [] };
}

// --- Boundary computation ---

function cellZoneId(def: TileDefinition, x: number, y: number): string {
  const cell = getCellDef(def, x, y);
  if (!cell) return '__empty';
  return cell.roomId || '__empty';
}

function computeBoundaries(def: TileDefinition): Map<string, BoundaryInfo> {
  const boundaries = new Map<string, BoundaryInfo>();

  const addEdge = (zoneA: string, zoneB: string, x1: number, y1: number, x2: number, y2: number) => {
    if (zoneA === zoneB || zoneA === '__empty' || zoneB === '__empty') return;
    const key = boundaryKey(zoneA, zoneB);
    if (!boundaries.has(key)) {
      const [a, b] = zoneA < zoneB ? [zoneA, zoneB] : [zoneB, zoneA];
      boundaries.set(key, { roomA: a, roomB: b, edges: [] });
    }
    boundaries.get(key)!.edges.push({ x1, y1, x2, y2 });
  };

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const zid = cellZoneId(def, x, y);
      if (x < GRID - 1) addEdge(zid, cellZoneId(def, x + 1, y), x, y, x + 1, y);
      if (y < GRID - 1) addEdge(zid, cellZoneId(def, x, y + 1), x, y, x, y + 1);
    }
  }
  return boundaries;
}

function defaultBoundaryType(roomA: string, roomB: string): BoundaryEdgeType {
  const aStreet = isStreetZone(roomA);
  const bStreet = isStreetZone(roomB);
  if (aStreet && bStreet) return 'open'; // street↔street default open
  return 'wall'; // anything involving a building defaults to wall
}

function getBoundaryType(def: TileDefinition, key: string, roomA: string, roomB: string): BoundaryEdgeType {
  return def.boundaryTypes?.[key] ?? defaultBoundaryType(roomA, roomB);
}

// --- Regenerate internal edges + external edges from boundaries ---

/** Rebuild external edges from the cell grid. Syncs type from perimeter cells,
 *  always sets crosswalk: false (crosswalks are internal only), preserves doorway flags. */
function regenerateExternalEdges(def: TileDefinition): void {
  // Build lookup of existing edges for doorway preservation
  const existingEdges = new Map<string, TileEdgeDef>();
  for (const e of def.edges) {
    existingEdges.set(`${e.side}:${e.localIndex}`, e);
  }

  const newEdges: TileEdgeDef[] = [];
  const sides: { side: EdgeSide; getCell: (i: number) => { x: number; y: number } }[] = [
    { side: 'north', getCell: (i) => ({ x: i, y: 0 }) },
    { side: 'south', getCell: (i) => ({ x: i, y: GRID - 1 }) },
    { side: 'east', getCell: (i) => ({ x: GRID - 1, y: i }) },
    { side: 'west', getCell: (i) => ({ x: 0, y: i }) },
  ];

  for (const { side, getCell } of sides) {
    for (let i = 0; i < GRID; i++) {
      const { x, y } = getCell(i);
      const cell = getCellDef(def, x, y);
      const cellType = cell?.type ?? 'street';
      const existing = existingEdges.get(`${side}:${i}`);

      const preserveDoorway = existing?.doorway ?? false;
      newEdges.push({
        side,
        localIndex: i,
        // A doorway implies passage — keep type 'street' so rendering
        // doesn't mask the doorway flag behind a wall check.
        type: preserveDoorway ? 'street' : (cellType === 'street' ? 'street' : 'wall'),
        crosswalk: false, // External edges never carry crosswalk
        doorway: preserveDoorway,
      });
    }
  }

  def.edges = newEdges;
}

function regenerateEdges(def: TileDefinition): void {
  const boundaries = computeBoundaries(def);
  const doorSet = new Set<string>();
  for (const d of (def.doors || [])) {
    doorSet.add(doorEdgeKey(d.x1, d.y1, d.x2, d.y2));
  }

  const newEdges: TileInternalEdge[] = [];

  for (const [key, info] of boundaries) {
    const type = getBoundaryType(def, key, info.roomA, info.roomB);
    for (const e of info.edges) {
      if (doorSet.has(doorEdgeKey(e.x1, e.y1, e.x2, e.y2))) continue; // doors override
      // 'open' = no internal edge needed; 'doorway' needs an explicit edge so the
      // compiler can distinguish it from a wall between different rooms.
      if (type === 'open') continue;
      newEdges.push({ fromX: e.x1, fromY: e.y1, toX: e.x2, toY: e.y2, type: type as 'wall' | 'crosswalk' | 'doorway' });
    }
  }

  def.internalEdges = newEdges;

  // Also rebuild external edges from the cell grid (Fix 1: Root Cause B)
  regenerateExternalEdges(def);
}

// ==========================================================================
// TileDefinitionEditor
// ==========================================================================

export class TileDefinitionEditor {
  private container: HTMLElement;
  private options: TileDefinitionEditorOptions;
  private state: EditorState | null = null;
  private tileListEl!: HTMLElement;
  private mainEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private viewportEl!: HTMLElement;
  private zoomContainerEl!: HTMLElement;
  private gridWrapperEl!: HTMLElement;
  private propsEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private dragPreviewEl: HTMLElement | null = null;
  private tileIds: string[] = [];
  private isPanning = false;
  private panStart: { x: number; y: number } | null = null;
  private panOffset = { x: 0, y: 0 };
  private spaceHeld = false;
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;

  constructor(options: TileDefinitionEditorOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'tde-container';
    document.body.appendChild(this.container);

    // Spacebar pan — handlers reference viewportEl which is created in buildLayout
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !this.spaceHeld) {
        e.preventDefault();
        this.spaceHeld = true;
        this.container.classList.add('tde--panning');
      }
      if (!this.state) return;
      const key = e.key;

      // Mode hotkeys: 1=Cells, 2=Edges, 3=Doors
      if (key === '1') { this.state.mode = 'cells'; this.updateAll(); return; }
      if (key === '2') { this.state.mode = 'edges'; this.updateAll(); return; }
      if (key === '3') { this.state.mode = 'doors'; this.updateAll(); return; }

      // Cells-mode sub-hotkeys
      if (this.state.mode === 'cells') {
        if (key === 's' || key === 'S') {
          const used = getUsedZones(this.state.def);
          for (let i = 1; i <= 9; i++) {
            if (!used.includes(`S${i}`)) { this.state.activeZoneId = `S${i}`; this.updateHeader(); return; }
          }
        }
        if (key === 'r' || key === 'R') {
          const used = getUsedZones(this.state.def);
          for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i);
            if (!used.includes(letter)) { this.state.activeZoneId = letter; this.updateAll(); return; }
          }
        }
      }

      // Edges-mode sub-hotkeys
      if (this.state.mode === 'edges') {
        if (key === 'o' || key === 'O') { this.state.activeEdgeBrush = 'open'; this.updateHeader(); return; }
        if (key === 'd' || key === 'D') { this.state.activeEdgeBrush = 'doorway'; this.updateHeader(); return; }
        if (key === 'c' || key === 'C') { this.state.activeEdgeBrush = 'crosswalk'; this.updateHeader(); return; }
        if (key === 'w' || key === 'W') { this.state.activeEdgeBrush = 'wall'; this.updateHeader(); return; }
      }
    };
    this.keyupHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.spaceHeld = false;
        this.isPanning = false;
        this.panStart = null;
        this.container.classList.remove('tde--panning');
      }
    };

    this.tileIds = tileService.isReady ? tileService.getAllIds() : [];
    this.buildLayout();

    // Attach after buildLayout so viewportEl exists
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);

    if (!tileService.isReady) {
      const check = setInterval(() => {
        if (tileService.isReady) {
          clearInterval(check);
          this.tileIds = tileService.getAllIds();
          this.buildTileList();
        }
      }, 100);
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
    this.container.remove();
  }

  private applyTransform() {
    if (!this.state) return;
    this.zoomContainerEl.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.state.zoom})`;
  }

  // =============================================
  // LAYOUT
  // =============================================

  private buildLayout() {
    const listPanel = document.createElement('div');
    listPanel.className = 'tde-list-panel';

    const listHeader = document.createElement('div');
    listHeader.className = 'tde-list-header';
    const title = document.createElement('h2');
    title.className = 'tde-list-header__title';
    title.textContent = 'Tile Definitions';
    listHeader.appendChild(title);

    const backBtn = document.createElement('div');
    backBtn.innerHTML = renderButton({ label: 'Back to Map Editor', variant: 'ghost', size: 'sm', fullWidth: true, dataAction: 'tde-back', icon: 'ArrowLeft' });
    backBtn.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="tde-back"]')) this.options.onBack();
    });
    listHeader.appendChild(backBtn);

    const ioRow = document.createElement('div');
    ioRow.className = 'tde-list-header__io';
    ioRow.style.display = 'flex';
    ioRow.style.gap = '4px';
    ioRow.style.padding = '0 8px 8px';
    ioRow.innerHTML = `
      ${renderButton({ label: 'Export All', variant: 'secondary', size: 'sm', dataAction: 'tde-export', icon: 'Download' })}
      ${renderButton({ label: 'Import', variant: 'secondary', size: 'sm', dataAction: 'tde-import', icon: 'Upload' })}
    `;
    ioRow.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'tde-export') this.exportAll();
      if (action === 'tde-import') this.triggerImport();
    });
    listHeader.appendChild(ioRow);

    listPanel.appendChild(listHeader);

    this.tileListEl = document.createElement('div');
    this.tileListEl.className = 'tde-tile-list';
    listPanel.appendChild(this.tileListEl);
    this.container.appendChild(listPanel);

    this.mainEl = document.createElement('div');
    this.mainEl.className = 'tde-main';

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'tde-header';
    this.mainEl.appendChild(this.headerEl);

    this.viewportEl = document.createElement('div');
    this.viewportEl.className = 'tde-viewport';
    this.zoomContainerEl = document.createElement('div');
    this.zoomContainerEl.className = 'tde-zoom-container';
    this.gridWrapperEl = document.createElement('div');
    this.gridWrapperEl.className = 'tde-grid-wrapper';
    this.gridWrapperEl.style.position = 'relative';
    this.gridWrapperEl.style.width = `${TILE_DISPLAY}px`;
    this.gridWrapperEl.style.height = `${TILE_DISPLAY}px`;
    this.gridWrapperEl.style.margin = '14px';
    this.zoomContainerEl.appendChild(this.gridWrapperEl);
    this.viewportEl.appendChild(this.zoomContainerEl);
    this.viewportEl.addEventListener('wheel', (e) => {
      if (!this.state) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      this.state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.state.zoom + delta));
      this.applyTransform();
    }, { passive: false });

    // Spacebar pan — capture phase so it fires before cell/boundary handlers
    this.viewportEl.addEventListener('mousedown', (e) => {
      if (this.spaceHeld) {
        e.preventDefault();
        e.stopPropagation();
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
        this.container.classList.add('tde--panning');
      }
    }, true);
    window.addEventListener('mousemove', (e) => {
      if (this.isPanning && this.panStart) {
        this.panOffset.x = e.clientX - this.panStart.x;
        this.panOffset.y = e.clientY - this.panStart.y;
        this.applyTransform();
      }
    });
    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.panStart = null;
        if (!this.spaceHeld) this.container.classList.remove('tde--panning');
      }
    });
    this.mainEl.appendChild(this.viewportEl);

    this.propsEl = document.createElement('div');
    this.propsEl.className = 'tde-props-panel';
    this.mainEl.appendChild(this.propsEl);

    this.footerEl = document.createElement('div');
    this.footerEl.className = 'tde-footer';
    this.footerEl.innerHTML = `
      ${renderButton({ label: 'Wipe', variant: 'destructive', size: 'sm', dataAction: 'tde-wipe' })}
      ${renderButton({ label: 'Save', variant: 'primary', size: 'sm', dataAction: 'tde-save' })}
    `;
    this.footerEl.addEventListener('click', async (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'tde-save') await this.saveDef();
      else if (action === 'tde-wipe') this.wipeDef();
    });
    this.mainEl.appendChild(this.footerEl);

    this.propsEl.innerHTML = '<div class="tde-cell-info tde-cell-info--empty">Select a tile to edit</div>';
    this.footerEl.style.display = 'none';
    this.container.appendChild(this.mainEl);
    this.buildTileList();
  }

  private buildTileList() {
    this.tileListEl.innerHTML = '';
    for (const id of this.tileIds) {
      const entry = document.createElement('div');
      entry.className = 'tde-tile-entry';
      entry.textContent = id;
      entry.addEventListener('click', () => {
        this.tileListEl.querySelectorAll('.tde-tile-entry').forEach(el => el.classList.remove('tde-tile-entry--active'));
        entry.classList.add('tde-tile-entry--active');
        this.selectTile(id);
      });
      this.tileListEl.appendChild(entry);
    }
  }

  // =============================================
  // TILE SELECTION
  // =============================================

  private selectTile(tileId: string) {
    const existing = getTileDefinition(tileId);
    this.state = {
      tileId,
      def: existing ? cloneDef(existing) : createDefaultDef(tileId),
      mode: 'cells',
      activeZoneId: 'S1',
      isPainting: false,
      dragStart: null,
      dragEnd: null,
      activeEdgeBrush: 'wall',
      zoom: 1,
    };
    this.footerEl.style.display = '';
    this.updateAll();
  }

  private updateAll() {
    this.updateHeader();
    this.updateGrid();
    this.updateProps();
  }

  // =============================================
  // HEADER
  // =============================================

  private updateHeader() {
    if (!this.state) return;
    this.headerEl.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'tde-toolbar';

    // Mode toggle
    const modeSection = this.makeSection('Mode:');
    for (const mode of ['cells', 'edges', 'doors'] as EditorMode[]) {
      const btn = document.createElement('button');
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      btn.className = `tde-mode-btn${this.state.mode === mode ? ' tde-mode-btn--active' : ''}`;
      btn.addEventListener('click', () => { this.state!.mode = mode; this.updateAll(); });
      modeSection.appendChild(btn);
    }
    toolbar.appendChild(modeSection);

    if (this.state.mode === 'cells') {
      // Zone palette
      const zoneSection = this.makeSection('Zone:');
      const used = getUsedZones(this.state.def);
      const available = new Set(used);
      if (!available.has('S1')) available.add('S1');
      const activeIsNew = !available.has(this.state.activeZoneId);

      for (const zid of [...available].sort((a, b) => {
        const aS = isStreetZone(a), bS = isStreetZone(b);
        if (aS !== bS) return aS ? -1 : 1;
        return a.localeCompare(b);
      })) {
        const active = this.state.activeZoneId === zid;
        const color = zoneColor(zid);
        const btn = document.createElement('button');
        btn.className = 'tde-room-btn';
        btn.textContent = zid;
        btn.style.borderColor = active ? '#fff' : color;
        btn.style.background = active ? color : hexToRgba(color, 0.3);
        btn.style.fontSize = zid.length > 1 ? '9px' : '12px';
        btn.title = isStreetZone(zid) ? `Street zone ${zid}` : `Building room ${zid}`;
        btn.addEventListener('click', () => { this.state!.activeZoneId = zid; this.updateHeader(); });
        zoneSection.appendChild(btn);
      }

      // +S button — find next unused street zone
      let nextStreet = '';
      for (let i = 1; i <= 9; i++) {
        if (!available.has(`S${i}`)) { nextStreet = `S${i}`; break; }
      }
      if (nextStreet) {
        // If active zone IS the next street (user clicked +S but hasn't painted yet), highlight it
        const isActive = activeIsNew && this.state.activeZoneId === nextStreet;
        const addStreet = document.createElement('button');
        addStreet.className = `tde-mode-btn tde-add-zone-btn${isActive ? ' tde-add-zone-btn--active' : ''}`;
        addStreet.textContent = `+${nextStreet}`;
        addStreet.title = `Create new street zone ${nextStreet}`;
        addStreet.style.borderColor = zoneColor(nextStreet);
        addStreet.style.color = zoneColor(nextStreet);
        addStreet.addEventListener('click', () => { this.state!.activeZoneId = nextStreet; this.updateHeader(); });
        zoneSection.appendChild(addStreet);
      }

      // +R button — find next unused room
      let nextRoom = '';
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(65 + i);
        if (!available.has(letter)) { nextRoom = letter; break; }
      }
      if (nextRoom) {
        const isActive = activeIsNew && this.state.activeZoneId === nextRoom;
        const addRoom = document.createElement('button');
        addRoom.className = `tde-mode-btn tde-add-zone-btn${isActive ? ' tde-add-zone-btn--active' : ''}`;
        addRoom.textContent = `+${nextRoom}`;
        addRoom.title = `Create new building room ${nextRoom}`;
        addRoom.style.borderColor = zoneColor(nextRoom);
        addRoom.style.color = zoneColor(nextRoom);
        addRoom.addEventListener('click', () => { this.state!.activeZoneId = nextRoom; this.updateAll(); });
        zoneSection.appendChild(addRoom);
      }

      toolbar.appendChild(zoneSection);
    }

    if (this.state.mode === 'edges') {
      const edgeSection = this.makeSection('Edge type:');
      const brushes: { type: BoundaryEdgeType; label: string; desc: string }[] = [
        { type: 'open', label: 'Open', desc: 'Passage — movement allowed' },
        { type: 'doorway', label: 'Doorway', desc: 'Room-to-room open passage (no door)' },
        { type: 'crosswalk', label: 'Crosswalk', desc: 'Zone divider — separates street zones' },
        { type: 'wall', label: 'Wall', desc: 'Blocks movement and line of sight' },
      ];
      for (const { type, label, desc } of brushes) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.title = desc;
        btn.className = `tde-brush-btn tde-brush-btn--${type}${this.state.activeEdgeBrush === type ? ' tde-brush-btn--active' : ''}`;
        btn.addEventListener('click', () => { this.state!.activeEdgeBrush = type; this.updateHeader(); });
        edgeSection.appendChild(btn);
      }
      toolbar.appendChild(edgeSection);
    }

    if (this.state.mode === 'doors') {
      const info = this.makeSection('');
      info.innerHTML = '<span class="tde-toolbar__label">Click boundary edges to place/remove 3-cell doors</span>';
      toolbar.appendChild(info);
    }

    // Zoom
    const zoomSection = document.createElement('div');
    zoomSection.className = 'tde-toolbar__section';
    zoomSection.style.marginLeft = 'auto';
    zoomSection.innerHTML = `<span class="tde-toolbar__label">${Math.round(this.state.zoom * 100)}%</span>`;
    toolbar.appendChild(zoomSection);

    this.headerEl.appendChild(toolbar);
  }

  private makeSection(label: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'tde-toolbar__section';
    if (label) {
      const lbl = document.createElement('span');
      lbl.className = 'tde-toolbar__label';
      lbl.textContent = label;
      section.appendChild(lbl);
    }
    return section;
  }

  // =============================================
  // GRID
  // =============================================

  private updateGrid() {
    if (!this.state) return;
    this.gridWrapperEl.innerHTML = '';

    const imageUrl = getTileImageDataUrl(this.state.tileId);
    this.gridWrapperEl.style.backgroundImage = imageUrl ? `url(${imageUrl})` : '';
    this.gridWrapperEl.style.backgroundSize = 'cover';

    // Cells
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const cellDef = getCellDef(this.state.def, x, y);
        const div = document.createElement('div');
        div.className = 'tde-cell';
        div.style.left = `${x * CELL_PX}px`;
        div.style.top = `${y * CELL_PX}px`;
        div.style.width = `${CELL_PX}px`;
        div.style.height = `${CELL_PX}px`;
        this.applyCellStyle(div, cellDef, x, y);

        if (this.state.mode === 'cells') {
          div.addEventListener('mousedown', (e) => {
            if (this.spaceHeld) return;
            e.preventDefault();
            this.state!.isPainting = true;
            this.state!.dragStart = { x, y };
            this.state!.dragEnd = { x, y };
            this.updateDragPreview();
          });
          div.addEventListener('mouseenter', () => {
            if (this.spaceHeld) return;
            if (this.state!.isPainting && this.state!.dragStart) {
              this.state!.dragEnd = { x, y };
              this.updateDragPreview();
            }
          });
        }

        this.gridWrapperEl.appendChild(div);
      }
    }

    // Drag preview
    this.dragPreviewEl = document.createElement('div');
    this.dragPreviewEl.className = 'tde-drag-preview';
    this.dragPreviewEl.style.display = 'none';
    this.gridWrapperEl.appendChild(this.dragPreviewEl);

    // Mouseup/leave for cells drag
    this.gridWrapperEl.addEventListener('mouseup', () => {
      if (this.state?.isPainting && this.state.dragStart && this.state.dragEnd) {
        this.applyZoneRect(this.state.dragStart, this.state.dragEnd);
        this.state.dragStart = null;
        this.state.dragEnd = null;
        this.updateAll();
      }
      if (this.state) this.state.isPainting = false;
    });
    this.gridWrapperEl.addEventListener('mouseleave', () => {
      if (this.state) {
        this.state.isPainting = false;
        this.state.dragStart = null;
        this.state.dragEnd = null;
        if (this.dragPreviewEl) this.dragPreviewEl.style.display = 'none';
      }
    });

    // Boundaries visible in all modes
    this.renderBoundaries();

    // External tile edges (editable in edges/doors mode)
    this.renderExternalEdges();

    // Merged door overlays in cells mode
    if (this.state.mode === 'cells') {
      this.renderDoorOverlays();
    }

    // Dark/lit room icons on building zones
    this.renderRoomLightIcons();
  }

  private renderRoomLightIcons() {
    if (!this.state) return;
    const def = this.state.def;
    const roomProps = def.roomProperties || {};

    // Group cells by roomId to find building zone centroids
    const roomCells = new Map<string, { x: number; y: number }[]>();
    for (const cell of def.cells) {
      if (cell.type !== 'building' || !cell.roomId) continue;
      if (!roomCells.has(cell.roomId)) roomCells.set(cell.roomId, []);
      roomCells.get(cell.roomId)!.push({ x: cell.localX, y: cell.localY });
    }

    for (const [roomId, cells] of roomCells) {
      const isDark = roomProps[roomId]?.isDark ?? false;
      // Compute centroid
      let sumX = 0, sumY = 0;
      for (const c of cells) { sumX += c.x; sumY += c.y; }
      const cx = (sumX / cells.length) * CELL_PX + CELL_PX / 2;
      const cy = (sumY / cells.length) * CELL_PX + CELL_PX / 2;

      const iconEl = document.createElement('div');
      iconEl.className = 'tde-room-light-icon';
      iconEl.innerHTML = isDark ? icon('Moon', 'md') : icon('Sun', 'md');
      iconEl.style.left = `${cx}px`;
      iconEl.style.top = `${cy}px`;
      if (isDark) iconEl.classList.add('tde-room-light-icon--dark');
      this.gridWrapperEl.appendChild(iconEl);
    }
  }

  private renderBoundaries() {
    if (!this.state) return;
    const boundaries = computeBoundaries(this.state.def);

    for (const [key, info] of boundaries) {
      const type = getBoundaryType(this.state.def, key, info.roomA, info.roomB);

      for (const e of info.edges) {
        const isVertical = e.x1 !== e.x2;
        let left: number, top: number, w: number, h: number;

        if (isVertical) {
          // Vertical boundary (between columns)
          left = Math.max(e.x1, e.x2) * CELL_PX - 2;
          top = e.y1 * CELL_PX;
          w = 4;
          h = CELL_PX;
        } else {
          // Horizontal boundary (between rows)
          left = e.x1 * CELL_PX;
          top = Math.max(e.y1, e.y2) * CELL_PX - 2;
          w = CELL_PX;
          h = 4;
        }

        const div = document.createElement('div');
        div.className = 'tde-boundary';
        div.style.left = `${left}px`;
        div.style.top = `${top}px`;
        div.style.width = `${w}px`;
        div.style.height = `${h}px`;

        // Check if this edge has a door
        const isDoor = (this.state.def.doors || []).some(d => doorEdgeKey(d.x1, d.y1, d.x2, d.y2) === doorEdgeKey(e.x1, e.y1, e.x2, e.y2));

        const interactive = this.state.mode === 'edges' || this.state.mode === 'doors';
        const subtle = !interactive;

        if (isDoor) {
          div.style.background = 'rgba(180, 80, 20, 0.9)';
          div.title = `Door (${info.roomA}↔${info.roomB})`;
        } else if (type === 'wall') {
          div.style.background = subtle ? 'rgba(60, 60, 60, 0.4)' : 'rgba(60, 60, 60, 0.85)';
          div.title = `Wall (${info.roomA}↔${info.roomB})`;
        } else if (type === 'crosswalk') {
          div.style.background = subtle ? 'rgba(0, 100, 200, 0.35)' : 'rgba(0, 100, 200, 0.7)';
          div.title = `Crosswalk (${info.roomA}↔${info.roomB})`;
        } else if (type === 'doorway') {
          div.style.background = subtle ? 'rgba(255, 200, 50, 0.2)' : 'rgba(255, 200, 50, 0.5)';
          div.title = `Doorway (${info.roomA}↔${info.roomB})`;
        } else {
          div.style.background = subtle ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.15)';
          div.title = `Open (${info.roomA}↔${info.roomB})`;
        }

        if (this.state.mode === 'edges') {
          div.style.cursor = 'pointer';
          div.addEventListener('click', () => {
            if (!this.state!.def.boundaryTypes) this.state!.def.boundaryTypes = {};
            this.state!.def.boundaryTypes[key] = this.state!.activeEdgeBrush;
            regenerateEdges(this.state!.def);
            this.updateGrid();
          });
        } else if (this.state.mode === 'doors') {
          div.style.cursor = 'pointer';
          div.addEventListener('click', () => {
            this.toggleDoor3(e.x1, e.y1, e.x2, e.y2, info.edges);
            regenerateEdges(this.state!.def);
            this.updateGrid();
            this.updateProps();
          });
          div.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            if (isDoor) {
              this.removeDoorGroup(e.x1, e.y1, e.x2, e.y2);
              regenerateEdges(this.state!.def);
              this.updateGrid();
              this.updateProps();
            }
          });
        }

        this.gridWrapperEl.appendChild(div);
      }
    }
  }

  private renderExternalEdges() {
    if (!this.state) return;
    const interactive = this.state.mode === 'edges' || this.state.mode === 'doors';
    const THICK = 6;

    const sides: { side: EdgeSide; getPos: (i: number) => { left: number; top: number; w: number; h: number } }[] = [
      { side: 'north', getPos: (i) => ({ left: i * CELL_PX, top: -THICK, w: CELL_PX, h: THICK }) },
      { side: 'south', getPos: (i) => ({ left: i * CELL_PX, top: TILE_DISPLAY, w: CELL_PX, h: THICK }) },
      { side: 'west', getPos: (i) => ({ left: -THICK, top: i * CELL_PX, w: THICK, h: CELL_PX }) },
      { side: 'east', getPos: (i) => ({ left: TILE_DISPLAY, top: i * CELL_PX, w: THICK, h: CELL_PX }) },
    ];

    for (const { side, getPos } of sides) {
      for (let i = 0; i < GRID; i++) {
        const edgeDef = getEdgeDef(this.state.def, side, i);
        const pos = getPos(i);
        const div = document.createElement('div');
        div.className = 'tde-boundary';
        div.style.left = `${pos.left}px`;
        div.style.top = `${pos.top}px`;
        div.style.width = `${pos.w}px`;
        div.style.height = `${pos.h}px`;

        // Style based on edge type
        if (!edgeDef || edgeDef.type === 'wall') {
          div.style.background = interactive ? 'rgba(60, 60, 60, 0.85)' : 'rgba(60, 60, 60, 0.4)';
          div.title = `Wall (${side} ${i})`;
        } else if (edgeDef.crosswalk) {
          div.style.background = interactive ? 'rgba(0, 100, 200, 0.7)' : 'rgba(0, 100, 200, 0.35)';
          div.title = `Crosswalk (${side} ${i})`;
        } else if (edgeDef.doorway) {
          div.style.background = interactive ? 'rgba(255, 200, 50, 0.5)' : 'rgba(255, 200, 50, 0.2)';
          div.title = `Doorway (${side} ${i})`;
        } else {
          div.style.background = interactive ? 'rgba(0, 200, 0, 0.4)' : 'rgba(0, 200, 0, 0.15)';
          div.title = `Open (${side} ${i})`;
        }

        if (interactive) {
          div.style.cursor = 'pointer';
          const s = side, idx = i;
          div.addEventListener('click', () => {
            this.applyExternalEdgeBrush(s, idx);
            this.updateGrid();
          });
        }

        this.gridWrapperEl.appendChild(div);
      }
    }
  }

  /** Find all contiguous edge indices along `side` that share the same perimeter zone as `idx`. */
  private getPerimeterZoneRun(side: EdgeSide, idx: number): number[] {
    const def = this.state!.def;
    const perimeterCell = (i: number) => {
      if (side === 'north') return getCellDef(def, i, 0);
      if (side === 'south') return getCellDef(def, i, GRID - 1);
      if (side === 'west') return getCellDef(def, 0, i);
      return getCellDef(def, GRID - 1, i); // east
    };

    const targetZone = perimeterCell(idx)?.roomId ?? '__empty';
    const indices: number[] = [idx];

    // Expand left/up
    for (let i = idx - 1; i >= 0; i--) {
      if ((perimeterCell(i)?.roomId ?? '__empty') === targetZone) indices.push(i);
      else break;
    }
    // Expand right/down
    for (let i = idx + 1; i < GRID; i++) {
      if ((perimeterCell(i)?.roomId ?? '__empty') === targetZone) indices.push(i);
      else break;
    }
    return indices;
  }

  private applyExternalEdgeBrush(side: EdgeSide, idx: number) {
    if (!this.state) return;
    const brush = this.state.activeEdgeBrush;
    const indices = this.getPerimeterZoneRun(side, idx);

    for (const i of indices) {
      const edge = getEdgeDef(this.state.def, side, i);
      if (!edge) continue;
      // External edges only allow: open, wall, doorway.
      // Crosswalk on external edges is not allowed — crosswalks are internal only.
      if (brush === 'open' || brush === 'crosswalk') {
        edge.type = 'street';
        edge.crosswalk = false;
        edge.doorway = false;
      } else if (brush === 'doorway') {
        edge.type = 'street';
        edge.crosswalk = false;
        edge.doorway = true;
      } else {
        edge.type = 'wall';
        edge.crosswalk = false;
        edge.doorway = false;
      }
    }
  }

  private renderDoorOverlays() {
    if (!this.state) return;
    const doors = this.state.def.doors || [];
    if (doors.length === 0) return;

    // Group adjacent doors into visual blocks
    const visited = new Set<string>();
    for (const door of doors) {
      const key = doorEdgeKey(door.x1, door.y1, door.x2, door.y2);
      if (visited.has(key)) continue;

      // Find all connected door edges in same orientation
      const isVertical = door.x1 !== door.x2;
      const group = [door];
      visited.add(key);

      // Find adjacent doors in the same boundary direction
      for (const other of doors) {
        const oKey = doorEdgeKey(other.x1, other.y1, other.x2, other.y2);
        if (visited.has(oKey)) continue;
        const oVert = other.x1 !== other.x2;
        if (oVert !== isVertical) continue;

        // Check adjacency
        for (const g of group) {
          const adjacent = isVertical
            ? (g.x1 === other.x1 && g.x2 === other.x2 && Math.abs(g.y1 - other.y1) === 1)
            : (g.y1 === other.y1 && g.y2 === other.y2 && Math.abs(g.x1 - other.x1) === 1);
          if (adjacent) { group.push(other); visited.add(oKey); break; }
        }
      }

      // Render merged door
      if (this.state.mode !== 'doors' && this.state.mode !== 'edges') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const d of group) {
          const cx1 = d.x1 * CELL_PX + CELL_PX / 2;
          const cy1 = d.y1 * CELL_PX + CELL_PX / 2;
          const cx2 = d.x2 * CELL_PX + CELL_PX / 2;
          const cy2 = d.y2 * CELL_PX + CELL_PX / 2;
          const mx = (cx1 + cx2) / 2;
          const my = (cy1 + cy2) / 2;
          minX = Math.min(minX, mx); minY = Math.min(minY, my);
          maxX = Math.max(maxX, mx); maxY = Math.max(maxY, my);
        }

        const div = document.createElement('div');
        div.className = 'tde-door-marker';
        div.title = 'Right-click to remove door';
        const pad = 4;
        div.style.left = `${minX - pad}px`;
        div.style.top = `${minY - pad}px`;
        div.style.width = `${maxX - minX + pad * 2}px`;
        div.style.height = `${maxY - minY + pad * 2}px`;
        // Right-click to remove door from any mode
        const firstDoor = group[0];
        div.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          this.removeDoorGroup(firstDoor.x1, firstDoor.y1, firstDoor.x2, firstDoor.y2);
          regenerateEdges(this.state!.def);
          this.updateGrid();
          this.updateProps();
        });
        this.gridWrapperEl.appendChild(div);
      }
    }
  }

  // =============================================
  // DOOR PLACEMENT (3 cells)
  // =============================================

  private toggleDoor3(x1: number, y1: number, x2: number, y2: number, boundaryEdges: { x1: number; y1: number; x2: number; y2: number }[]) {
    if (!this.state) return;
    if (!this.state.def.doors) this.state.def.doors = [];

    const clickKey = doorEdgeKey(x1, y1, x2, y2);

    // Check if clicking an existing door — remove the whole 3-cell group
    const existingIdx = this.state.def.doors.findIndex(d => doorEdgeKey(d.x1, d.y1, d.x2, d.y2) === clickKey);
    if (existingIdx >= 0) {
      // Remove this door and its adjacent group
      this.removeDoorGroup(x1, y1, x2, y2);
      return;
    }

    // Place a 3-cell door centered on clicked edge
    const isVertical = x1 !== x2;

    // Find edges in the same boundary that are adjacent and aligned
    const aligned = boundaryEdges.filter(e => {
      if (isVertical) {
        return e.x1 === x1 && e.x2 === x2; // same column boundary
      } else {
        return e.y1 === y1 && e.y2 === y2; // same row boundary
      }
    }).sort((a, b) => isVertical ? a.y1 - b.y1 : a.x1 - b.x1);

    // Find the clicked edge's index in aligned list
    const clickIdx = aligned.findIndex(e => doorEdgeKey(e.x1, e.y1, e.x2, e.y2) === clickKey);
    if (clickIdx < 0) return;

    // Center 3-cell door on clicked edge (or shift if near boundary end)
    let startIdx = Math.max(0, Math.min(clickIdx - 1, aligned.length - DOOR_WIDTH));
    const doorEdges = aligned.slice(startIdx, startIdx + DOOR_WIDTH);

    // Remove any existing doors that overlap
    for (const de of doorEdges) {
      this.removeDoorGroup(de.x1, de.y1, de.x2, de.y2);
    }

    // Add new door edges
    for (const de of doorEdges) {
      this.state.def.doors!.push({ x1: de.x1, y1: de.y1, x2: de.x2, y2: de.y2 });
    }
  }

  private removeDoorGroup(x1: number, y1: number, x2: number, y2: number) {
    if (!this.state?.def.doors) return;
    const isVertical = x1 !== x2;

    // Find the door at this position
    const target = doorEdgeKey(x1, y1, x2, y2);
    const idx = this.state.def.doors.findIndex(d => doorEdgeKey(d.x1, d.y1, d.x2, d.y2) === target);
    if (idx < 0) return;

    // Find all adjacent doors in same orientation → remove as group
    const group = new Set<string>([target]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of this.state.def.doors) {
        const k = doorEdgeKey(d.x1, d.y1, d.x2, d.y2);
        if (group.has(k)) continue;
        const dVert = d.x1 !== d.x2;
        if (dVert !== isVertical) continue;

        for (const gk of group) {
          const gd = this.state.def.doors.find(dd => doorEdgeKey(dd.x1, dd.y1, dd.x2, dd.y2) === gk)!;
          const adj = isVertical
            ? (d.x1 === gd.x1 && d.x2 === gd.x2 && Math.abs(d.y1 - gd.y1) === 1)
            : (d.y1 === gd.y1 && d.y2 === gd.y2 && Math.abs(d.x1 - gd.x1) === 1);
          if (adj) { group.add(k); changed = true; break; }
        }
      }
    }

    this.state.def.doors = this.state.def.doors.filter(d => !group.has(doorEdgeKey(d.x1, d.y1, d.x2, d.y2)));
  }

  // =============================================
  // STYLES
  // =============================================

  private applyCellStyle(div: HTMLElement, cellDef: TileCellDef | undefined, x?: number, y?: number) {
    if (!cellDef?.roomId) {
      div.style.background = 'rgba(100, 100, 100, 0.15)';
      return;
    }
    const color = zoneColor(cellDef.roomId);
    div.style.background = hexToRgba(color, isStreetZone(cellDef.roomId) ? 0.2 : 0.45);

    // Draw zone border where neighbors differ
    if (x !== undefined && y !== undefined && this.state) {
      const zid = cellDef.roomId;
      const borders: string[] = [];
      const borderColor = isStreetZone(zid) ? 'rgba(0,80,20,0.6)' : hexToRgba(color, 0.7);

      if (x === 0 || cellZoneId(this.state.def, x - 1, y) !== zid) borders.push('left');
      if (x === GRID - 1 || cellZoneId(this.state.def, x + 1, y) !== zid) borders.push('right');
      if (y === 0 || cellZoneId(this.state.def, x, y - 1) !== zid) borders.push('top');
      if (y === GRID - 1 || cellZoneId(this.state.def, x, y + 1) !== zid) borders.push('bottom');

      if (borders.length > 0 && borders.length < 4) {
        div.style.borderTop = borders.includes('top') ? `1px solid ${borderColor}` : 'none';
        div.style.borderBottom = borders.includes('bottom') ? `1px solid ${borderColor}` : 'none';
        div.style.borderLeft = borders.includes('left') ? `1px solid ${borderColor}` : 'none';
        div.style.borderRight = borders.includes('right') ? `1px solid ${borderColor}` : 'none';
      }
    }
  }

  // =============================================
  // DRAG PREVIEW + ZONE PAINTING
  // =============================================

  private updateDragPreview() {
    if (!this.dragPreviewEl || !this.state?.dragStart || !this.state?.dragEnd) return;
    const s = this.state.dragStart, e = this.state.dragEnd;
    const minX = Math.min(s.x, e.x), maxX = Math.max(s.x, e.x);
    const minY = Math.min(s.y, e.y), maxY = Math.max(s.y, e.y);

    this.dragPreviewEl.style.display = 'block';
    this.dragPreviewEl.style.left = `${minX * CELL_PX}px`;
    this.dragPreviewEl.style.top = `${minY * CELL_PX}px`;
    this.dragPreviewEl.style.width = `${(maxX - minX + 1) * CELL_PX}px`;
    this.dragPreviewEl.style.height = `${(maxY - minY + 1) * CELL_PX}px`;

    const color = zoneColor(this.state.activeZoneId);
    this.dragPreviewEl.style.background = hexToRgba(color, 0.3);
    this.dragPreviewEl.style.borderColor = color;
  }

  private applyZoneRect(start: { x: number; y: number }, end: { x: number; y: number }) {
    if (!this.state) return;
    const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
    const zoneId = this.state.activeZoneId;
    const cellType = isStreetZone(zoneId) ? 'street' : 'building';

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cell = getCellDef(this.state.def, x, y);
        if (cell) {
          cell.type = cellType as 'street' | 'building';
          cell.roomId = zoneId;
        }
      }
    }

    regenerateEdges(this.state.def);
  }

  // =============================================
  // PROPERTIES PANEL
  // =============================================

  private updateProps() {
    if (!this.state) return;
    this.propsEl.innerHTML = '';

    const used = getUsedZones(this.state.def);
    const doorCount = (this.state.def.doors || []).length;
    const boundaries = computeBoundaries(this.state.def);

    const stats = document.createElement('div');
    stats.className = 'tde-props-stats';
    stats.innerHTML = `<span>Zones: ${used.length}</span><span>Boundaries: ${boundaries.size}</span><span>Door cells: ${doorCount}</span>`;
    this.propsEl.appendChild(stats);

    if (used.length === 0) return;

    const roomProps = this.state.def.roomProperties || {};
    const row = document.createElement('div');
    row.className = 'tde-props-rooms';

    for (const zid of used) {
      const color = zoneColor(zid);
      const isDark = roomProps[zid]?.isDark ?? false;
      const isStreet = isStreetZone(zid);

      const item = document.createElement('div');
      item.className = 'tde-room-prop-row';

      const swatch = document.createElement('span');
      swatch.className = 'tde-room-swatch';
      swatch.style.background = color;
      item.appendChild(swatch);

      const label = document.createElement('span');
      label.textContent = zid;
      item.appendChild(label);

      if (!isStreet) {
        const darkBtn = document.createElement('button');
        darkBtn.className = `tde-dark-toggle${isDark ? ' tde-dark-toggle--dark' : ''}`;
        darkBtn.innerHTML = isDark ? icon('Moon', 'sm') : icon('Sun', 'sm');
        darkBtn.addEventListener('click', () => {
          if (!this.state!.def.roomProperties) this.state!.def.roomProperties = {};
          if (!this.state!.def.roomProperties[zid]) this.state!.def.roomProperties[zid] = { isDark: false };
          this.state!.def.roomProperties[zid].isDark = !isDark;
          this.updateProps();
        });
        item.appendChild(darkBtn);
      }

      row.appendChild(item);
    }

    this.propsEl.appendChild(row);
  }

  // =============================================
  // SAVE / RESET
  // =============================================

  private async saveDef() {
    if (!this.state) return;
    this.state.def.gridSize = GRID;
    regenerateEdges(this.state.def);
    try {
      const res = await fetch('/api/tile-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state.def),
      });
      if (res.ok) {
        registerTileDefinitions([this.state.def]);
        this.options.onSave();
        notificationManager.show({ variant: 'success', message: `Tile "${this.state.def.id}" saved` });
      } else {
        notificationManager.show({ variant: 'danger', message: 'Failed to save tile definition' });
      }
    } catch (e) {
      console.error('Error saving tile definition:', e);
      notificationManager.show({ variant: 'danger', message: 'Error saving tile definition' });
    }
  }

  private wipeDef() {
    if (!this.state) return;
    modalManager.open({
      title: 'Wipe Tile Data?',
      size: 'sm',
      renderBody: () => '<p class="text-secondary">All data for this tile will be erased. This cannot be undone.</p>',
      renderFooter: () => `
        ${renderButton({ label: 'Cancel', variant: 'secondary', dataAction: 'modal-close' })}
        ${renderButton({ label: 'Wipe', variant: 'destructive', dataAction: 'confirm-wipe' })}
      `,
      onOpen: (el) => {
        el.addEventListener('click', (ev) => {
          if ((ev.target as HTMLElement).closest('[data-action="confirm-wipe"]')) {
            modalManager.close();
            this.state!.def = createDefaultDef(this.state!.tileId);
            this.updateAll();
          }
        });
      },
    });
  }

  private async exportAll() {
    try {
      const res = await fetch('/api/tile-definitions');
      if (!res.ok) { notificationManager.show({ variant: 'danger', message: 'Failed to fetch definitions' }); return; }
      const defs = await res.json();
      const blob = new Blob([JSON.stringify(defs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tile-definitions.json';
      a.click();
      URL.revokeObjectURL(url);
      notificationManager.show({ variant: 'success', message: `Exported ${defs.length} tile definitions` });
    } catch (e) {
      console.error('Export error:', e);
      notificationManager.show({ variant: 'danger', message: 'Error exporting tile definitions' });
    }
  }

  private triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const defs = JSON.parse(text);
        if (!Array.isArray(defs)) { notificationManager.show({ variant: 'danger', message: 'JSON must be an array of tile definitions' }); return; }
        const res = await fetch('/api/tile-definitions/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        });
        if (!res.ok) { notificationManager.show({ variant: 'danger', message: 'Server rejected import' }); return; }
        const result = await res.json();
        // Reload client-side registry
        const freshRes = await fetch('/api/tile-definitions');
        if (freshRes.ok) {
          const freshDefs = await freshRes.json();
          registerTileDefinitions(freshDefs);
        }
        notificationManager.show({ variant: 'success', message: `Imported ${result.imported} tile definitions` });
        // Re-select current tile to refresh
        if (this.state) this.selectTile(this.state.tileId);
      } catch (e) {
        console.error('Import error:', e);
        notificationManager.show({ variant: 'danger', message: 'Error importing — check JSON format' });
      }
    });
    input.click();
  }
}
