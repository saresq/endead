
// src/client/editor/MapEditor.ts

import * as PIXI from 'pixi.js';
import { TileService, tileService } from '../../services/TileService';
import { TileInstance, ScenarioMap, MapMarker, MarkerType, WinConditionConfig } from '../../types/Map';
import { PixiBoardRenderer } from '../PixiBoardRenderer';
import { GameState, initialGameState, Zone, ZoneConnection } from '../../types/GameState';
import { TILE_SIZE, TILE_CELLS_PER_SIDE, TILE_PIXEL_SIZE } from '../../config/Layout';
import { EPIC_CRATE_LIMIT, EQUIPMENT_CARDS, EPIC_EQUIPMENT_CARDS } from '../../config/EquipmentRegistry';
import { compileScenario } from '../../services/ScenarioCompiler';
import { migrateImportedMap } from '../../services/MapMigration';
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
    objectiveBlue: {
      fill: 0x3D8BFD,
      fillAlpha: 0.85,
      stroke: 0x0B1E3F,
      strokeWidth: 2,
      dotColor: 0xFFFFFF,
    },
    objectiveGreen: {
      fill: 0x33C16C,
      fillAlpha: 0.85,
      stroke: 0x0F3D22,
      strokeWidth: 2,
      dotColor: 0xFFFFFF,
    },
    epicCrate: {
      fill: 0xCC2222,
      fillAlpha: 0.85,
      stroke: 0xFFCC00,
      strokeWidth: 2,
    },
    zombieSpawnBlue: {
      fill: 0x3D8BFD,
      fillAlpha: 0.55,
      stroke: 0x0B1E3F,
      strokeWidth: 2,
      dashColor: 0xFFFFFF,
    },
    zombieSpawnGreen: {
      fill: 0x33C16C,
      fillAlpha: 0.55,
      stroke: 0x0F3D22,
      strokeWidth: 2,
      dashColor: 0xFFFFFF,
    },
  },
} as const;

// --- Editor Tool Modes ---
enum EditorTool {
  Tile = 'TILE',
  PlayerStart = 'PLAYER_START',
  ZombieSpawn = 'ZOMBIE_SPAWN',
  ZombieSpawnBlue = 'ZOMBIE_SPAWN_BLUE',
  ZombieSpawnGreen = 'ZOMBIE_SPAWN_GREEN',
  Exit = 'EXIT',
  Objective = 'OBJECTIVE',
  ObjectiveBlue = 'OBJECTIVE_BLUE',
  ObjectiveGreen = 'OBJECTIVE_GREEN',
  EpicCrate = 'EPIC_CRATE',
  Eraser = 'ERASER',
}

import {
  applyZoneClassMutex,
  getMarkerClass,
  OBJECTIVE_CLASS_MARKERS,
  SPAWN_CLASS_MARKERS,
} from './markerClasses';

interface EditorSnapshot {
  tiles: TileInstance[];
  markers: MapMarker[];
  winConditions: WinConditionConfig[];
}

const DEFAULT_WIN_CONDITIONS: WinConditionConfig[] = [{ type: 'REACH_EXIT' }];

const WIN_CONDITION_TYPE_LABELS: Record<WinConditionConfig['type'], string> = {
  REACH_EXIT: 'Reach Exit',
  TAKE_OBJECTIVE: 'Take Objectives (yellow)',
  TAKE_COLOR_OBJECTIVE: 'Take Color Objective',
  TAKE_EPIC_CRATE: 'Take Epic Crates',
  KILL_ZOMBIE: 'Kill Zombies',
  COLLECT_ITEMS: 'Collect Items',
  REACH_DANGER_LEVEL: 'Reach Danger Level',
};

function defaultWinCondition(type: WinConditionConfig['type']): WinConditionConfig {
  switch (type) {
    case 'REACH_EXIT': return { type: 'REACH_EXIT' };
    case 'TAKE_OBJECTIVE': return { type: 'TAKE_OBJECTIVE', amount: 1 };
    case 'TAKE_COLOR_OBJECTIVE': return { type: 'TAKE_COLOR_OBJECTIVE', color: 'BLUE', amount: 1 };
    case 'TAKE_EPIC_CRATE': return { type: 'TAKE_EPIC_CRATE', amount: 1 };
    case 'KILL_ZOMBIE': return { type: 'KILL_ZOMBIE', zombieType: 'ANY', amount: 1 };
    case 'COLLECT_ITEMS': return { type: 'COLLECT_ITEMS', items: [] };
    case 'REACH_DANGER_LEVEL': return { type: 'REACH_DANGER_LEVEL', threshold: 'YELLOW' };
  }
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
  private winConditions: WinConditionConfig[] = [{ type: 'REACH_EXIT' }];

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
  private winConditionsListEl!: HTMLElement;
  private winConditionRowEls: HTMLElement[] = [];
  private migrationBannerEl: HTMLElement | null = null;
  /** True from the moment a v1 map is imported until at least one win condition is authored. */
  private migrationPending = false;

  // --- Win Conditions panel collapse state (UI-only, not persisted) ---
  private winConditionsCollapsed = false;
  private winConditionsBodyEl: HTMLElement | null = null;
  private winConditionsToggleBtn: HTMLButtonElement | null = null;
  private winConditionsSummaryEl: HTMLElement | null = null;
  /** Last computed row-error count, used to render the collapsed summary. */
  private winConditionsLastErrorCount = 0;

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
    this.createWinConditionPanel();
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

    const ioRow = document.createElement('div');
    ioRow.className = 'editor-btn-row';
    ioRow.innerHTML = `
      ${renderButton({ label: 'Import', variant: 'secondary', size: 'sm', dataAction: 'map-import', icon: 'Upload' })}
      ${renderButton({ label: 'Export', variant: 'secondary', size: 'sm', dataAction: 'map-export', icon: 'Download' })}
    `;
    toolbar.appendChild(ioRow);

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
      else if (action === 'map-export') this.exportCurrentMap(nameInput.value);
      else if (action === 'map-import') this.triggerImport();
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
      { tool: EditorTool.EpicCrate, label: `Epic Crate (0/${EPIC_CRATE_LIMIT})`, key: '6' },
      { tool: EditorTool.ObjectiveBlue, label: 'Obj. Blue', key: '7' },
      { tool: EditorTool.ObjectiveGreen, label: 'Obj. Green', key: '8' },
      { tool: EditorTool.ZombieSpawnBlue, label: 'Spawn Blue', key: '9' },
      { tool: EditorTool.ZombieSpawnGreen, label: 'Spawn Green', key: '0' },
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
  private tilePreviewEl!: HTMLCanvasElement;
  private createTilePalette() {
    this.tilePaletteEl = document.createElement('div');
    this.tilePaletteEl.id = 'tile-palette-section';
    this.tilePaletteEl.style.display = 'none';

    const label = document.createElement('div');
    label.innerText = 'Tile Palette';
    label.className = 'editor-section__label';
    this.tilePaletteEl.appendChild(label);

    // Tile preview canvas
    this.tilePreviewEl = document.createElement('canvas');
    this.tilePreviewEl.className = 'editor-tile-preview';
    this.tilePreviewEl.width = 180;
    this.tilePreviewEl.height = 180;
    this.tilePreviewEl.style.display = 'none';
    this.tilePaletteEl.appendChild(this.tilePreviewEl);

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

  // =============================================
  // WIN CONDITION PANEL
  // =============================================

  private createWinConditionPanel() {
    const section = document.createElement('div');
    section.className = 'editor-section';

    // --- Header row: label + collapsed-state summary + toggle button ---
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '6px';

    const label = document.createElement('div');
    label.className = 'editor-section__label';
    label.innerText = 'Win Conditions';
    label.style.flex = '1';
    label.style.margin = '0';
    header.appendChild(label);

    // Compact summary shown next to the label when collapsed (e.g. "3 conditions").
    const summary = document.createElement('span');
    summary.style.fontSize = '11px';
    summary.style.opacity = '0.7';
    summary.style.display = 'none';
    this.winConditionsSummaryEl = summary;
    header.appendChild(summary);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'editor-tool-btn';
    toggleBtn.style.flex = '0 0 auto';
    toggleBtn.style.padding = '0 8px';
    toggleBtn.style.height = '24px';
    toggleBtn.style.fontSize = '14px';
    toggleBtn.style.lineHeight = '1';
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Toggle Win Conditions panel');
    toggleBtn.innerText = '−';
    toggleBtn.onclick = () => this.setWinConditionsCollapsed(!this.winConditionsCollapsed);
    this.winConditionsToggleBtn = toggleBtn;
    header.appendChild(toggleBtn);

    section.appendChild(header);

    // Phase F migration banner — non-dismissable. Visible only while a v1
    // import is pending configuration. Hidden the moment `winConditions`
    // becomes non-empty (or a v2 map is loaded over the top). Stays outside
    // the collapsible body so it remains visible regardless of collapse state.
    this.migrationBannerEl = document.createElement('div');
    this.migrationBannerEl.className = 'editor-validation__error';
    this.migrationBannerEl.style.fontSize = '11px';
    this.migrationBannerEl.style.padding = '6px';
    this.migrationBannerEl.style.marginTop = '6px';
    this.migrationBannerEl.style.marginBottom = '6px';
    this.migrationBannerEl.style.borderRadius = '4px';
    this.migrationBannerEl.style.background = 'rgba(255, 90, 90, 0.18)';
    this.migrationBannerEl.style.border = '1px solid rgba(255, 90, 90, 0.5)';
    this.migrationBannerEl.innerText =
      'This map was authored with an older format. Please configure win conditions before saving.';
    this.migrationBannerEl.style.display = 'none';
    section.appendChild(this.migrationBannerEl);

    // --- Collapsible body: hint, condition rows, add controls ---
    const body = document.createElement('div');
    body.style.marginTop = '6px';
    this.winConditionsBodyEl = body;

    const hint = document.createElement('div');
    hint.style.fontSize = '11px';
    hint.style.opacity = '0.7';
    hint.style.marginBottom = '6px';
    hint.innerText = 'AND-composed (all must be met). Required: at least 1.';
    body.appendChild(hint);

    this.winConditionsListEl = document.createElement('div');
    this.winConditionsListEl.className = 'win-conditions-list';
    body.appendChild(this.winConditionsListEl);

    const addRow = document.createElement('div');
    addRow.style.display = 'flex';
    addRow.style.gap = '4px';
    addRow.style.marginTop = '6px';

    const select = document.createElement('select');
    select.className = 'input';
    select.style.flex = '1';
    select.style.height = '32px';
    select.style.fontSize = '12px';
    (Object.keys(WIN_CONDITION_TYPE_LABELS) as WinConditionConfig['type'][]).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = WIN_CONDITION_TYPE_LABELS[t];
      select.appendChild(opt);
    });
    addRow.appendChild(select);

    const addBtn = document.createElement('button');
    addBtn.className = 'editor-tool-btn';
    addBtn.style.flex = '0 0 auto';
    addBtn.innerText = '+ Add';
    addBtn.onclick = () => this.addWinCondition(select.value as WinConditionConfig['type']);
    addRow.appendChild(addBtn);

    body.appendChild(addRow);
    section.appendChild(body);

    this.paletteContainer.appendChild(section);

    // Default collapsed state: expanded if zero conditions OR a migration is
    // pending (legacy import banner must stay visible with the rows). Otherwise
    // start collapsed to reduce sidebar clutter on layout-heavy phases.
    const initialCollapsed = this.winConditions.length > 0 && !this.migrationPending;
    this.setWinConditionsCollapsed(initialCollapsed);

    this.renderWinConditionList();
  }

  /**
   * Win Conditions panel collapse toggle. UI-only — not persisted to
   * `EditorSnapshot`. When collapsed, the rows + Add controls hide but the
   * panel header, the migration banner, and the global validation panel
   * remain visible so error counts stay discoverable.
   */
  private setWinConditionsCollapsed(collapsed: boolean) {
    this.winConditionsCollapsed = collapsed;
    if (this.winConditionsBodyEl) {
      this.winConditionsBodyEl.style.display = collapsed ? 'none' : '';
    }
    if (this.winConditionsToggleBtn) {
      this.winConditionsToggleBtn.innerText = collapsed ? '+' : '−';
      this.winConditionsToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    this.refreshWinConditionsSummary();
  }

  /**
   * Update the compact summary shown in the panel header when collapsed.
   * Format: "3 conditions" or "3 conditions, 1 issue" if errors are present.
   */
  private refreshWinConditionsSummary() {
    if (!this.winConditionsSummaryEl) return;
    if (!this.winConditionsCollapsed) {
      this.winConditionsSummaryEl.style.display = 'none';
      return;
    }
    const count = this.winConditions.length;
    const errorCount = this.winConditionsLastErrorCount;
    const noun = count === 1 ? 'condition' : 'conditions';
    let text = `${count} ${noun}`;
    if (errorCount > 0) {
      const issueNoun = errorCount === 1 ? 'issue' : 'issues';
      text += `, ${errorCount} ${issueNoun}`;
      this.winConditionsSummaryEl.style.color = 'rgb(255, 120, 120)';
    } else {
      this.winConditionsSummaryEl.style.color = '';
    }
    this.winConditionsSummaryEl.innerText = text;
    this.winConditionsSummaryEl.style.display = '';
  }

  private addWinCondition(type: WinConditionConfig['type']) {
    this.pushUndo();
    this.winConditions = [...this.winConditions, defaultWinCondition(type)];
    this.renderWinConditionList();
    this.updateValidation();
    this.refreshMigrationBanner();
  }

  private removeWinCondition(idx: number) {
    this.pushUndo();
    this.winConditions = this.winConditions.filter((_, i) => i !== idx);
    this.renderWinConditionList();
    this.updateValidation();
    this.refreshMigrationBanner();
  }

  private updateWinCondition(idx: number, patch: Partial<WinConditionConfig>) {
    const current = this.winConditions[idx];
    if (!current) return;
    const merged = { ...current, ...patch } as WinConditionConfig;
    this.winConditions = this.winConditions.map((c, i) => (i === idx ? merged : c));
    this.updateValidation();
  }

  /**
   * Phase F migration banner: visible iff a v1 import is still missing
   * win conditions. Once the user adds at least one, the banner clears and
   * the migration is considered complete (next save writes schemaVersion 2).
   */
  private refreshMigrationBanner() {
    if (!this.migrationBannerEl) return;
    const showBanner = this.migrationPending && this.winConditions.length === 0;
    this.migrationBannerEl.style.display = showBanner ? '' : 'none';
    // Force-expand the panel while a migration is pending so the user sees
    // both the banner and the empty rows area immediately on legacy import.
    if (this.migrationPending && this.winConditionsCollapsed) {
      this.setWinConditionsCollapsed(false);
    }
    if (this.migrationPending && this.winConditions.length > 0) {
      // First condition authored — migration complete.
      this.migrationPending = false;
    }
    this.refreshWinConditionsSummary();
  }

  private renderWinConditionList() {
    if (!this.winConditionsListEl) return;
    this.winConditionsListEl.replaceChildren();
    this.winConditionRowEls = [];

    if (this.winConditions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'editor-validation__error';
      empty.style.fontSize = '11px';
      empty.innerText = 'At least one win condition is required';
      this.winConditionsListEl.appendChild(empty);
      return;
    }

    this.winConditions.forEach((cond, idx) => {
      const row = this.createWinConditionRow(cond, idx);
      this.winConditionsListEl.appendChild(row);
      this.winConditionRowEls.push(row);
    });
  }

  private createWinConditionRow(cond: WinConditionConfig, idx: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'win-condition-row';
    row.style.border = '1px solid rgba(255,255,255,0.1)';
    row.style.borderRadius = '4px';
    row.style.padding = '6px';
    row.style.marginBottom = '4px';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap = '4px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '6px';

    const title = document.createElement('strong');
    title.style.fontSize = '12px';
    title.innerText = WIN_CONDITION_TYPE_LABELS[cond.type];
    header.appendChild(title);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'editor-tool-btn';
    removeBtn.style.flex = '0 0 auto';
    removeBtn.style.padding = '2px 8px';
    removeBtn.innerText = 'Remove';
    removeBtn.title = 'Remove this condition';
    removeBtn.onclick = () => this.removeWinCondition(idx);
    header.appendChild(removeBtn);

    row.appendChild(header);

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '4px';
    this.renderWinConditionFields(body, cond, idx);
    row.appendChild(body);

    const errorEl = document.createElement('div');
    errorEl.className = 'editor-validation__error';
    errorEl.style.fontSize = '11px';
    errorEl.style.display = 'none';
    errorEl.dataset.role = 'wc-error';
    row.appendChild(errorEl);

    return row;
  }

  private renderWinConditionFields(body: HTMLElement, cond: WinConditionConfig, idx: number) {
    body.replaceChildren();

    switch (cond.type) {
      case 'REACH_EXIT':
        // No fields.
        return;
      case 'TAKE_OBJECTIVE':
        body.appendChild(this.makeNumberRow('Amount', cond.amount, 1, (v) => {
          this.updateWinCondition(idx, { amount: v });
        }));
        return;
      case 'TAKE_COLOR_OBJECTIVE': {
        body.appendChild(this.makeSelectRow('Color', cond.color, [
          { value: 'BLUE', label: 'Blue' },
          { value: 'GREEN', label: 'Green' },
        ], (v) => {
          this.updateWinCondition(idx, { color: v as 'BLUE' | 'GREEN' });
        }));
        body.appendChild(this.makeNumberRow('Amount', cond.amount, 1, (v) => {
          this.updateWinCondition(idx, { amount: v });
        }));
        return;
      }
      case 'TAKE_EPIC_CRATE':
        body.appendChild(this.makeNumberRow('Amount', cond.amount, 1, (v) => {
          this.updateWinCondition(idx, { amount: v });
        }));
        return;
      case 'KILL_ZOMBIE':
        body.appendChild(this.makeSelectRow('Type', cond.zombieType, [
          { value: 'ANY', label: 'Any' },
          { value: 'WALKER', label: 'Walker' },
          { value: 'RUNNER', label: 'Runner' },
          { value: 'BRUTE', label: 'Brute' },
          { value: 'ABOMINATION', label: 'Abomination' },
        ], (v) => {
          this.updateWinCondition(idx, { zombieType: v as any });
        }));
        body.appendChild(this.makeNumberRow('Amount', cond.amount, 1, (v) => {
          this.updateWinCondition(idx, { amount: v });
        }));
        return;
      case 'COLLECT_ITEMS':
        this.renderCollectItemsBody(body, cond, idx);
        return;
      case 'REACH_DANGER_LEVEL':
        body.appendChild(this.makeSelectRow('Threshold', cond.threshold, [
          { value: 'YELLOW', label: 'Yellow' },
          { value: 'ORANGE', label: 'Orange' },
          { value: 'RED', label: 'Red' },
        ], (v) => {
          this.updateWinCondition(idx, { threshold: v as 'YELLOW' | 'ORANGE' | 'RED' });
        }));
        return;
    }
  }

  private renderCollectItemsBody(
    body: HTMLElement,
    cond: Extract<WinConditionConfig, { type: 'COLLECT_ITEMS' }>,
    idx: number,
  ) {
    body.replaceChildren();

    const equipmentOptions: { value: string; label: string }[] = [
      ...Object.entries(EQUIPMENT_CARDS).map(([id, c]) => ({
        value: id,
        label: `${c.name} (${id}) — Standard`,
      })),
      ...Object.entries(EPIC_EQUIPMENT_CARDS).map(([id, c]) => ({
        value: id,
        label: `${c.name} (${id}) — Epic`,
      })),
    ];

    if (cond.items.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.opacity = '0.7';
      empty.innerText = 'No items configured';
      body.appendChild(empty);
    }

    cond.items.forEach((item, itemIdx) => {
      const itemRow = document.createElement('div');
      itemRow.style.display = 'flex';
      itemRow.style.gap = '4px';
      itemRow.style.alignItems = 'center';

      const select = document.createElement('select');
      select.className = 'input';
      select.style.flex = '1';
      select.style.height = '28px';
      select.style.fontSize = '11px';
      equipmentOptions.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === item.equipmentId) o.selected = true;
        select.appendChild(o);
      });
      // If current id isn't in catalog, add a fallback option so the select
      // doesn't silently auto-pick the first entry.
      if (!equipmentOptions.some(o => o.value === item.equipmentId)) {
        const o = document.createElement('option');
        o.value = item.equipmentId;
        o.textContent = `${item.equipmentId} (unknown)`;
        o.selected = true;
        select.insertBefore(o, select.firstChild);
      }
      select.onchange = () => {
        const next = { ...cond, items: cond.items.map((it, i) => i === itemIdx ? { ...it, equipmentId: select.value } : it) };
        this.winConditions = this.winConditions.map((c, i) => i === idx ? next : c);
        this.updateValidation();
      };
      itemRow.appendChild(select);

      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '1';
      qty.value = String(item.quantity);
      qty.className = 'input';
      qty.style.width = '60px';
      qty.style.height = '28px';
      qty.style.fontSize = '11px';
      qty.onchange = () => {
        const v = Math.max(1, parseInt(qty.value, 10) || 1);
        qty.value = String(v);
        const next = { ...cond, items: cond.items.map((it, i) => i === itemIdx ? { ...it, quantity: v } : it) };
        this.winConditions = this.winConditions.map((c, i) => i === idx ? next : c);
        this.updateValidation();
      };
      itemRow.appendChild(qty);

      const rm = document.createElement('button');
      rm.className = 'editor-tool-btn';
      rm.style.flex = '0 0 auto';
      rm.style.padding = '2px 8px';
      rm.innerText = '×';
      rm.title = 'Remove item';
      rm.onclick = () => {
        this.pushUndo();
        const next = { ...cond, items: cond.items.filter((_, i) => i !== itemIdx) };
        this.winConditions = this.winConditions.map((c, i) => i === idx ? next : c);
        // Structural change — re-render this row's body.
        const rowEl = this.winConditionRowEls[idx];
        const bodyEl = rowEl?.children[1] as HTMLElement | undefined;
        if (bodyEl) this.renderCollectItemsBody(bodyEl, next, idx);
        this.updateValidation();
      };
      itemRow.appendChild(rm);

      body.appendChild(itemRow);
    });

    const addItemBtn = document.createElement('button');
    addItemBtn.className = 'editor-tool-btn';
    addItemBtn.style.alignSelf = 'flex-start';
    addItemBtn.style.padding = '2px 8px';
    addItemBtn.innerText = '+ Add item';
    addItemBtn.onclick = () => {
      this.pushUndo();
      const firstId = equipmentOptions[0]?.value ?? '';
      const next = { ...cond, items: [...cond.items, { equipmentId: firstId, quantity: 1 }] };
      this.winConditions = this.winConditions.map((c, i) => i === idx ? next : c);
      this.renderCollectItemsBody(body, next, idx);
      this.updateValidation();
    };
    body.appendChild(addItemBtn);
  }

  private makeNumberRow(
    label: string,
    value: number,
    min: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const wrap = document.createElement('label');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';
    wrap.style.fontSize = '11px';
    const span = document.createElement('span');
    span.innerText = label;
    span.style.flex = '0 0 70px';
    wrap.appendChild(span);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.value = String(value);
    input.className = 'input';
    input.style.flex = '1';
    input.style.height = '28px';
    input.style.fontSize = '11px';
    input.onchange = () => {
      const v = Math.max(min, parseInt(input.value, 10) || min);
      input.value = String(v);
      onChange(v);
    };
    wrap.appendChild(input);
    return wrap;
  }

  private makeSelectRow(
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
  ): HTMLElement {
    const wrap = document.createElement('label');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';
    wrap.style.fontSize = '11px';
    const span = document.createElement('span');
    span.innerText = label;
    span.style.flex = '0 0 70px';
    wrap.appendChild(span);
    const select = document.createElement('select');
    select.className = 'input';
    select.style.flex = '1';
    select.style.height = '28px';
    select.style.fontSize = '11px';
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    });
    select.onchange = () => onChange(select.value);
    wrap.appendChild(select);
    return wrap;
  }

  private validateWinConditions(): { rowErrors: (string | null)[]; topLevelErrors: string[] } {
    const rowErrors: (string | null)[] = this.winConditions.map(() => null);
    const topLevelErrors: string[] = [];

    if (this.winConditions.length === 0) {
      topLevelErrors.push('At least one win condition is required');
      return { rowErrors, topLevelErrors };
    }

    const seenKeys = new Map<string, number>();
    this.winConditions.forEach((c, i) => {
      const key = JSON.stringify(c);
      const prev = seenKeys.get(key);
      if (prev !== undefined) {
        rowErrors[i] = `Duplicate of condition #${prev + 1}`;
      } else {
        seenKeys.set(key, i);
      }
    });

    const exitCount = this.markers.filter(m => m.type === MarkerType.Exit).length;
    const yellowCount = this.markers.filter(m => m.type === MarkerType.Objective).length;
    const blueCount = this.markers.filter(m => m.type === MarkerType.ObjectiveBlue).length;
    const greenCount = this.markers.filter(m => m.type === MarkerType.ObjectiveGreen).length;
    const epicCount = this.markers.filter(m => m.type === MarkerType.EpicCrate).length;
    const knownIds = new Set([
      ...Object.keys(EQUIPMENT_CARDS),
      ...Object.keys(EPIC_EQUIPMENT_CARDS),
    ]);

    this.winConditions.forEach((c, i) => {
      if (rowErrors[i]) return;
      switch (c.type) {
        case 'REACH_EXIT':
          if (exitCount === 0) rowErrors[i] = 'Requires at least 1 Exit marker on the map';
          break;
        case 'TAKE_OBJECTIVE':
          if (c.amount < 1) rowErrors[i] = 'Amount must be at least 1';
          else if (c.amount > yellowCount) rowErrors[i] = `Amount (${c.amount}) exceeds yellow Objectives placed (${yellowCount})`;
          break;
        case 'TAKE_COLOR_OBJECTIVE': {
          const cnt = c.color === 'BLUE' ? blueCount : greenCount;
          const colorLower = c.color.toLowerCase();
          if (c.amount < 1) rowErrors[i] = 'Amount must be at least 1';
          else if (cnt === 0) rowErrors[i] = `No ${colorLower} Objective markers placed`;
          else if (c.amount > cnt) rowErrors[i] = `Amount (${c.amount}) exceeds ${colorLower} Objectives placed (${cnt})`;
          break;
        }
        case 'TAKE_EPIC_CRATE':
          if (c.amount < 1) rowErrors[i] = 'Amount must be at least 1';
          else if (c.amount > epicCount) rowErrors[i] = `Amount (${c.amount}) exceeds Epic Crates placed (${epicCount})`;
          else if (c.amount > EPIC_CRATE_LIMIT) rowErrors[i] = `Amount exceeds Epic deck size (${EPIC_CRATE_LIMIT})`;
          break;
        case 'KILL_ZOMBIE':
          if (c.amount < 1) rowErrors[i] = 'Amount must be at least 1';
          break;
        case 'COLLECT_ITEMS':
          if (c.items.length === 0) {
            rowErrors[i] = 'Add at least one item';
          } else {
            for (const it of c.items) {
              if (!knownIds.has(it.equipmentId)) {
                rowErrors[i] = `Unknown equipment id: ${it.equipmentId}`;
                break;
              }
              if (it.quantity < 1) {
                rowErrors[i] = `Quantity for ${it.equipmentId} must be at least 1`;
                break;
              }
            }
          }
          break;
        case 'REACH_DANGER_LEVEL':
          break;
      }
    });

    return { rowErrors, topLevelErrors };
  }

  private applyWinConditionRowErrors(rowErrors: (string | null)[]) {
    this.winConditionRowEls.forEach((row, i) => {
      const errEl = row.querySelector('[data-role="wc-error"]') as HTMLElement | null;
      if (!errEl) return;
      const msg = rowErrors[i];
      if (msg) {
        errEl.style.display = '';
        errEl.innerText = msg;
      } else {
        errEl.style.display = 'none';
        errEl.innerText = '';
      }
    });
  }

  private createInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'editor-instructions';
    instructions.innerHTML = `
        <b>Controls:</b><br>
        <b>Click</b> to place | <b>Right-click</b> to remove<br>
        <b>R</b> rotate tile | <b>1-9, 0, E</b> switch tools<br>
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
      winConditions: JSON.parse(JSON.stringify(this.winConditions)),
    };
  }

  private restoreSnapshot(snap: EditorSnapshot): void {
    this.tiles = JSON.parse(JSON.stringify(snap.tiles));
    this.markers = JSON.parse(JSON.stringify(snap.markers));
    this.winConditions = JSON.parse(JSON.stringify(
      snap.winConditions ?? DEFAULT_WIN_CONDITIONS
    ));
    this.rebuildPreviewState();
    this.renderWinConditionList();
    this.updateValidation();
    this.refreshEpicCrateButtonLabel();
    this.refreshMigrationBanner();
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
      [EditorTool.ZombieSpawnBlue]: 'Click STREET zone cells to place a BLUE dormant Spawn (activates when a blue Objective is taken).',
      [EditorTool.ZombieSpawnGreen]: 'Click STREET zone cells to place a GREEN dormant Spawn (activates when a green Objective is taken).',
      [EditorTool.Exit]: 'Click STREET zone cells to place Exit points.',
      [EditorTool.Objective]: 'Click any zone cell to place Objective tokens.',
      [EditorTool.ObjectiveBlue]: 'Click any zone cell to place a BLUE Objective (activates BLUE dormant Spawn Zones when taken).',
      [EditorTool.ObjectiveGreen]: 'Click any zone cell to place a GREEN Objective (activates GREEN dormant Spawn Zones when taken).',
      [EditorTool.EpicCrate]: `Click any zone cell to place Epic Weapon Crate (max ${EPIC_CRATE_LIMIT}).`,
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
        this.updateTilePreview(id);
      };

      container.appendChild(item);
    });
  }

  private updateTilePreview(tileId: string) {
    const texture = tileService.getTexture(tileId);
    if (!texture || !this.tilePreviewEl) return;

    const canvas = this.tilePreviewEl;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Extract image from PIXI texture source
    const source = texture.source?.resource;
    if (!source) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';
    const size = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Rotate around the canvas center
    ctx.translate(size / 2, size / 2);
    ctx.rotate((this.currentRotation * Math.PI) / 180);
    ctx.translate(-size / 2, -size / 2);

    // Draw the tile image scaled to fit the preview canvas
    const frame = texture.frame;
    ctx.drawImage(
      source as CanvasImageSource,
      frame.x, frame.y, frame.width, frame.height,
      0, 0, size, size,
    );
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
          this.updateTilePreview(this.selectedTileId);
        }
      }
      // Number keys for tool switching
      const toolMap: Record<string, EditorTool> = {
        '1': EditorTool.Tile, '2': EditorTool.PlayerStart, '3': EditorTool.ZombieSpawn,
        '4': EditorTool.Exit, '5': EditorTool.Objective, '6': EditorTool.EpicCrate,
        '7': EditorTool.ObjectiveBlue, '8': EditorTool.ObjectiveGreen,
        '9': EditorTool.ZombieSpawnBlue, '0': EditorTool.ZombieSpawnGreen,
        'e': EditorTool.Eraser,
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
      case EditorTool.ZombieSpawnBlue:
        this.handleMarkerPlacement(wx, wy, MarkerType.ZombieSpawnBlue, false);
        break;
      case EditorTool.ZombieSpawnGreen:
        this.handleMarkerPlacement(wx, wy, MarkerType.ZombieSpawnGreen, false);
        break;
      case EditorTool.Exit:
        this.handleMarkerPlacement(wx, wy, MarkerType.Exit, false);
        break;
      case EditorTool.Objective:
        this.handleMarkerPlacement(wx, wy, MarkerType.Objective, false);
        break;
      case EditorTool.ObjectiveBlue:
        this.handleMarkerPlacement(wx, wy, MarkerType.ObjectiveBlue, false);
        break;
      case EditorTool.ObjectiveGreen:
        this.handleMarkerPlacement(wx, wy, MarkerType.ObjectiveGreen, false);
        break;
      case EditorTool.EpicCrate:
        this.handleMarkerPlacement(wx, wy, MarkerType.EpicCrate, false);
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
    MarkerType.ZombieSpawnBlue,
    MarkerType.ZombieSpawnGreen,
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

    // Toggle off if clicking same cell with the SAME exact type
    const existingIndex = this.markers.findIndex(m => m.type === type && m.x === zx && m.y === zy);
    if (existingIndex !== -1) {
      this.markers.splice(existingIndex, 1);
      this.statusText.innerText = `Removed ${type} at (${zx},${zy})`;
    } else {
      // Epic Crates are capped at the deck size — one crate per epic weapon card.
      if (type === MarkerType.EpicCrate) {
        const placed = this.markers.filter(m => m.type === MarkerType.EpicCrate).length;
        if (placed >= EPIC_CRATE_LIMIT) {
          this.statusText.innerText = `Epic Crate limit reached (${EPIC_CRATE_LIMIT}). Remove one before placing another.`;
          return;
        }
      }

      // Zone-level class mutex: at most ONE objective-class and ONE
      // spawn-class marker per zone. Placing a new class member replaces
      // any pre-existing same-class marker anywhere in that zone (covers
      // cell-level too). Cross-class markers still coexist (Spawn +
      // Objective in the same zone is fine). Falls back to cell-only when
      // the zone is unresolved.
      //
      // The compiler otherwise folds multiple class members in one zone
      // into a single zone-level entry — colored variants win silently
      // over yellow/normal — so we surface and resolve the conflict here.
      const klass = getMarkerClass(type);
      if (klass) {
        const result = applyZoneClassMutex(
          this.markers,
          type,
          zx,
          zy,
          zoneId,
          this.state.zoneGeometry?.cellToZone,
        );
        if (result.replaced) {
          const label = klass === SPAWN_CLASS_MARKERS
            ? 'spawn'
            : klass === OBJECTIVE_CLASS_MARKERS
              ? 'objective'
              : 'marker';
          this.statusText.innerText = `Replaced existing ${label} marker in zone`;
        }
        this.markers = result.markers;
      } else if (zoneId) {
        // Non-class markers (PlayerStart, Exit): keep the original
        // one-per-zone rejection — they're singletons per zone, not
        // class-replaceable.
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
    // Class-mutex may have removed an EpicCrate; always refresh.
    this.refreshEpicCrateButtonLabel();
  }

  private refreshEpicCrateButtonLabel() {
    const btn = this.toolButtons.get(EditorTool.EpicCrate);
    if (!btn) return;
    const placed = this.markers.filter(m => m.type === MarkerType.EpicCrate).length;
    btn.innerText = `Epic Crate (${placed}/${EPIC_CRATE_LIMIT})`;
  }

  // --- Eraser ---

  private handleErase(wx: number, wy: number) {
    const { zx, zy } = this.worldToZoneCoord(wx, wy);
    this.removeAllAtCell(zx, zy);
    this.statusText.innerText = `Erased all at (${zx},${zy})`;
  }

  private removeAllAtCell(zx: number, zy: number) {
    this.markers = this.markers.filter(m => m.x !== zx || m.y !== zy);
    this.refreshEpicCrateButtonLabel();
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
        case MarkerType.ZombieSpawnBlue: {
          const t = EDITOR_THEME.marker.zombieSpawnBlue;
          g.moveTo(cx, cy - 18);
          g.lineTo(cx + 14, cy);
          g.lineTo(cx, cy + 18);
          g.lineTo(cx - 14, cy);
          g.closePath();
          g.fill({ color: t.fill, alpha: t.fillAlpha });
          g.stroke({ width: t.strokeWidth, color: t.stroke });
          // Dormancy hint: small white "Z" cross-mark
          g.rect(cx - 6, cy - 1, 12, 2);
          g.fill({ color: t.dashColor });
          break;
        }
        case MarkerType.ZombieSpawnGreen: {
          const t = EDITOR_THEME.marker.zombieSpawnGreen;
          g.moveTo(cx, cy - 18);
          g.lineTo(cx + 14, cy);
          g.lineTo(cx, cy + 18);
          g.lineTo(cx - 14, cy);
          g.closePath();
          g.fill({ color: t.fill, alpha: t.fillAlpha });
          g.stroke({ width: t.strokeWidth, color: t.stroke });
          g.rect(cx - 6, cy - 1, 12, 2);
          g.fill({ color: t.dashColor });
          break;
        }
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
        case MarkerType.ObjectiveBlue: {
          const t = EDITOR_THEME.marker.objectiveBlue;
          g.circle(cx, cy, 14);
          g.fill({ color: t.fill, alpha: t.fillAlpha });
          g.stroke({ width: t.strokeWidth, color: t.stroke });
          g.circle(cx, cy, 5);
          g.fill({ color: t.dotColor });
          break;
        }
        case MarkerType.ObjectiveGreen: {
          const t = EDITOR_THEME.marker.objectiveGreen;
          g.circle(cx, cy, 14);
          g.fill({ color: t.fill, alpha: t.fillAlpha });
          g.stroke({ width: t.strokeWidth, color: t.stroke });
          g.circle(cx, cy, 5);
          g.fill({ color: t.dotColor });
          break;
        }
        case MarkerType.EpicCrate:
          // Red square crate with yellow 'E' inside to differentiate from Exit.
          g.rect(cx - 14, cy - 14, 28, 28);
          g.fill({ color: EDITOR_THEME.marker.epicCrate.fill, alpha: EDITOR_THEME.marker.epicCrate.fillAlpha });
          g.stroke({ width: EDITOR_THEME.marker.epicCrate.strokeWidth, color: EDITOR_THEME.marker.epicCrate.stroke });
          g.rect(cx - 8, cy - 8, 3, 16);
          g.rect(cx - 8, cy - 8, 12, 3);
          g.rect(cx - 8, cy - 2, 8, 3);
          g.rect(cx - 8, cy + 5, 12, 3);
          g.fill({ color: EDITOR_THEME.marker.epicCrate.stroke });
          break;
      }
    });

    // --- 5. Spawn number labels ---
    // Remove old labels
    this.spawnLabelContainer.removeChildren();
    // Count spawn markers (any variant) in placement order — this mirrors
    // ScenarioCompiler's `spawnZoneIds` ordering, which all spawn variants
    // share regardless of color.
    let spawnNum = 1;
    for (const marker of this.markers) {
      if (!SPAWN_CLASS_MARKERS.includes(marker.type)) continue;
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

    const hasSpawn = this.markers.some(m => SPAWN_CLASS_MARKERS.includes(m.type));
    const hasAlwaysOnSpawn = this.markers.some(m => m.type === MarkerType.ZombieSpawn);
    if (!hasSpawn) {
      warnings.push('Missing: Zombie Spawn');
    } else if (!hasAlwaysOnSpawn) {
      warnings.push('Optional: All Spawn Zones are dormant — game starts with no active spawns');
    }

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

    // Win condition validation — surfaces in panel rows + summarized here.
    const wcVal = this.validateWinConditions();
    this.applyWinConditionRowErrors(wcVal.rowErrors);
    wcVal.topLevelErrors.forEach(e => warnings.push(e));
    const rowErrorCount = wcVal.rowErrors.filter(Boolean).length;
    if (rowErrorCount > 0) {
      warnings.push(`Win Conditions: ${rowErrorCount} issue(s) — see panel`);
    }
    // Surface the same count in the collapsed-state header summary.
    this.winConditionsLastErrorCount = rowErrorCount + wcVal.topLevelErrors.length;
    this.refreshWinConditionsSummary();

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
            this.winConditions = JSON.parse(JSON.stringify(DEFAULT_WIN_CONDITIONS));
            this.migrationPending = false;
            this.state.tiles = [];
            this.state.zones = {};
            this.state.zoneGeometry = undefined;
            setZoneGeometry(null);
            this.renderWinConditionList();
            this.updateValidation();
            this.refreshEpicCrateButtonLabel();
            this.refreshMigrationBanner();
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

    const blockingError = this.firstWinConditionError();
    if (blockingError) {
      notificationManager.show({ variant: 'danger', message: `Cannot save — ${blockingError}` });
      return;
    }

    const mapData: ScenarioMap = this.buildScenarioMap(name);

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
                  icon: 'Download',
                  variant: 'secondary',
                  size: 'sm',
                  dataAction: 'export-map',
                  dataId: String(i),
                  title: 'Export map to file',
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
            const exportBtn = (ev.target as HTMLElement).closest('[data-action="export-map"]') as HTMLElement | null;
            if (exportBtn) {
              const idx = parseInt(exportBtn.dataset.id || '');
              if (idx >= 0 && idx < maps.length) {
                this.downloadMapJson(maps[idx]);
                notificationManager.show({ variant: 'success', message: `Exported "${maps[idx].name}"` });
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

  private firstWinConditionError(): string | null {
    const wcVal = this.validateWinConditions();
    if (wcVal.topLevelErrors.length > 0) return wcVal.topLevelErrors[0];
    const rowError = wcVal.rowErrors.findIndex(e => e !== null);
    if (rowError !== -1) {
      return `Win Condition #${rowError + 1}: ${wcVal.rowErrors[rowError]}`;
    }
    return null;
  }

  private buildScenarioMap(name: string): ScenarioMap {
    return {
      id: `map-${Date.now()}`,
      name,
      width: Math.max(...this.tiles.map(t => t.x)) + 1,
      height: Math.max(...this.tiles.map(t => t.y)) + 1,
      gridSize: TILE_CELLS_PER_SIDE,
      schemaVersion: 2,
      tiles: this.tiles,
      markers: this.markers,
      winConditions: JSON.parse(JSON.stringify(this.winConditions)),
    };
  }

  private downloadMapJson(map: ScenarioMap) {
    const safeName = (map.name || 'map').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase() || 'map';
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.endead-map.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private exportCurrentMap(name: string) {
    if (this.tiles.length === 0) {
      notificationManager.show({ variant: 'warning', message: 'Map is empty — nothing to export' });
      return;
    }
    const blockingError = this.firstWinConditionError();
    if (blockingError) {
      notificationManager.show({ variant: 'danger', message: `Cannot export — ${blockingError}` });
      return;
    }
    const finalName = name || `map-${Date.now()}`;
    const map = this.buildScenarioMap(finalName);
    this.downloadMapJson(map);
    notificationManager.show({ variant: 'success', message: `Exported "${finalName}"` });
  }

  private triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.tiles)) {
          notificationManager.show({ variant: 'danger', message: 'Invalid map file — missing tiles array' });
          return;
        }
        if (!Array.isArray(data.markers)) data.markers = [];
        this.loadMap(data);
        notificationManager.show({ variant: 'success', message: `Imported "${data.name || 'map'}" — click Save to persist` });
      } catch (e) {
        console.error('Import error:', e);
        notificationManager.show({ variant: 'danger', message: 'Error importing — check JSON format' });
      }
    });
    input.click();
  }

  private loadMap(mapData: any) {
    // Migrate legacy coordinates to current grid size
    const isLegacyGrid = !mapData.gridSize || mapData.gridSize !== TILE_CELLS_PER_SIDE;
    const scale = isLegacyGrid ? TILE_CELLS_PER_SIDE / (mapData.gridSize || 3) : 1;

    // Phase F: detect v1 schema and gate save until win conditions are authored.
    const migrated = migrateImportedMap(mapData);

    this.tiles = mapData.tiles || [];
    this.markers = (mapData.markers || []).map((m: any) => ({
      ...m,
      x: m.x * scale, y: m.y * scale,
    }));

    // v2 map → load authored conditions (or fall back to default if the file
    // is v2 but somehow missing the array — defensive). v1 map → empty array,
    // which the existing save validation will block until the user authors
    // at least one. The migration banner surfaces this state.
    if (migrated.isLegacy) {
      this.winConditions = [];
      this.migrationPending = true;
    } else {
      this.winConditions = migrated.winConditions.length > 0
        ? migrated.winConditions
        : JSON.parse(JSON.stringify(DEFAULT_WIN_CONDITIONS));
      this.migrationPending = false;
    }

    const nameInput = document.getElementById('map-name-input') as HTMLInputElement;
    if (nameInput) nameInput.value = mapData.name || '';

    this.rebuildPreviewState();
    this.renderWinConditionList();
    this.updateValidation();
    this.refreshEpicCrateButtonLabel();
    // Re-apply default collapse policy for the freshly loaded map: expanded
    // when there are zero conditions or a migration is pending; otherwise
    // collapsed. refreshMigrationBanner() force-expands if needed.
    this.setWinConditionsCollapsed(
      this.winConditions.length > 0 && !this.migrationPending,
    );
    this.refreshMigrationBanner();
    const suffix = [
      isLegacyGrid ? 'migrated from 3x3' : null,
      migrated.isLegacy ? 'legacy schema — configure win conditions' : null,
    ].filter(Boolean).join(', ');
    this.statusText.innerText = `Loaded: ${mapData.name}${suffix ? ` (${suffix})` : ''}`;
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
