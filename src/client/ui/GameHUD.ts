
import { GameState, GamePhase, PlayerId, EntityId, Survivor, GameResult, EquipmentCard, ObjectiveType } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { leaveRoom } from '../roomExit';
import { InputController } from '../InputController';
import { TradeUI } from './TradeUI';
import { PickupUI } from './PickupUI';
import { ReorganizeUI, openDiscardConfirm } from './ReorganizeUI';
import { getPlayerIdentity } from '../config/PlayerIdentities';
import { audioManager } from '../AudioManager';
import { icon } from './components/icons';
import { renderAvatar } from './components/PlayerAvatar';
import { renderActionButton } from './components/ActionButton';
import { renderEventEntry } from './components/EventEntry';
import { displayableEntries, groupByRound } from './eventLog';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlotsCounter } from './components/ItemCard';
import { renderPhotoSlot } from './components/PhotoSlot';
import { characterImageUrl } from '../utils/characterAsset';
import { skillCount } from '../../config/SkillRegistry';
import { modalManager } from './overlays/ModalManager';
import { notificationManager } from './NotificationManager';
import { formatZoneId } from '../utils/zoneFormat';
import { displayName, displayNameWithClass } from '../utils/displayName';
import { SKILL_DEFINITIONS } from '../../config/SkillRegistry';
import { XPManager } from '../../services/XPManager';
import { BottomSheet, type SheetHeights } from './components/BottomSheet';
import { DECK_LAYOUT_QUERY, LANDSCAPE_QUERY, resolveHudLayout, type HudLayout } from './layoutQueries';
import { es, equipmentName, skillName, skillDescription } from '../../strings/es';

/** Camera surface the HUD drives; optional so the HUD can run without a board. */
export interface HudBoardCamera {
  setViewport(rect: { x: number; y: number; w: number; h: number }): void;
  fitBoard(animate?: boolean): void;
}

export interface GameHUDOptions {
  renderer?: HudBoardCamera;
}

// Mirrors `FOOD_EQUIPMENT_IDS` in `services/handlers/ItemHandlers.ts`. Kept
// in sync manually because the client has no direct dependency on handler
// modules. If a fourth food card is ever added, update both sites.
const FOOD_EQUIPMENT_IDS = new Set(['bag_of_rice', 'canned_food', 'water']);

/** Action button costs; ActionButton hides COST_ONE and styles COST_FREE. */
const COST_ONE = es.common.actions(1);
const COST_FREE = es.common.free;

type RankColor = 'blue' | 'yellow' | 'orange' | 'red';

/** Rank colour for the XP bar, by Zombicide danger level. */
function dangerToRank(level: string): RankColor {
  switch ((level || '').toLowerCase()) {
    case 'yellow': return 'yellow';
    case 'orange': return 'orange';
    case 'red':    return 'red';
    default:       return 'blue';
  }
}

/** Color of the rank a survivor is progressing toward; max-rank survivors stay on their current color. */
function nextRankColor(level: string): RankColor {
  switch ((level || '').toLowerCase()) {
    case 'yellow': return 'orange';
    case 'orange': return 'red';
    case 'red':    return 'red';
    default:       return 'yellow';
  }
}

/** XP threshold required to reach the *next* danger level (mirrors XPManager). */
const XP_NEXT_THRESHOLD: Record<string, number | null> = {
  BLUE: 7,
  YELLOW: 19,
  ORANGE: 43,
  RED: null,
};

const XP_CURRENT_THRESHOLD: Record<string, number> = {
  BLUE: 0,
  YELLOW: 7,
  ORANGE: 19,
  RED: 43,
};

/** Map a skill id to a Lucide icon name. Falls back to Star. */
function iconForSkill(skillId: string): string {
  if (skillId.includes('search')) return 'Search';
  if (skillId.includes('melee') || skillId === 'swordmaster' || skillId === 'barbarian'
      || skillId === 'super_strength' || skillId === 'reaper_melee') return 'Swords';
  if (skillId.includes('ranged') || skillId === 'sniper' || skillId === 'point_blank'
      || skillId === 'plus_1_max_range') return 'Crosshair';
  if (skillId.includes('combat') || skillId === 'reaper_combat') return 'Target';
  if (skillId === 'sprint' || skillId === 'charge' || skillId === 'hit_and_run'
      || skillId === 'plus_1_zone_per_move' || skillId === 'plus_1_free_move'
      || skillId === 'slippery' || skillId === 'start_move'
      || skillId === 'bloodlust_melee') return 'Footprints';
  if (skillId === 'tough' || skillId === 'low_profile' || skillId === 'is_that_all_youve_got'
      || skillId === 'steady_hand') return 'ShieldCheck';
  if (skillId === 'lucky') return 'Sparkles';
  if (skillId === 'born_leader' || skillId === 'lifesaver' || skillId === 'medic') return 'Heart';
  if (skillId === 'ambidextrous' || skillId === 'matching_set') return 'ArrowLeftRight';
  if (skillId === 'plus_1_action') return 'Zap';
  if (skillId === 'hold_your_nose' || skillId === 'starts_with_equipment') return 'Star';
  return 'Star';
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One entry of `pendingZombieWounds` — a zombie attack step, or one attack's friendly fire. */
type WoundDistEntry = NonNullable<GameState['pendingZombieWounds']>[number];

export class GameHUD {
  private container: HTMLElement;
  private inputController: InputController;
  private tradeUI: TradeUI;
  private pickupUI: PickupUI;
  private reorganizeUI: ReorganizeUI;
  private localPlayerId: PlayerId;
  private state: GameState | null = null;
  private selectedSurvivorId: EntityId | null = null;
  private backpackModalId: string | null = null;
  private foodConfirmModalId: string | null = null;
  private endGameModalId: string | null = null;
  private logModalId: string | null = null;
  /** Displayable history length rendered into the open log. */
  private logRenderedCount = 0;
  /** Displayable entries seen when the log was last opened; null until the first state. */
  private seenEntryCount: number | null = null;
  private woundPickerModalId: string | null = null;
  private woundPickerSelected: Set<string> = new Set();
  private woundDistModalId: string | null = null;
  private woundDistAssignments: Record<string, number> = {};
  private skillChoiceModalId: string | null = null;
  private skillChoiceSurvivorId: EntityId | null = null;
  private dismissedEntryTs: number | null = null;
  /** Card entry whose dice already rolled in; null until the first render. */
  private lastRolledEntryTs: number | null = null;
  private boundDelegateHandler: (e: Event) => void;
  private boundKeyHandler = (e: KeyboardEvent) => {
    const body = (e.target as HTMLElement)?.closest?.('.hud-feed__body');
    if (body && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.toggleLog();
    }
  };
  private deckQuery: MediaQueryList = window.matchMedia(DECK_LAYOUT_QUERY);
  private landscapeQuery: MediaQueryList = window.matchMedia(LANDSCAPE_QUERY);
  private boundBreakpointHandler: () => void = () => this.render();
  private renderer: HudBoardCamera | null;
  // Stable shell elements — created once, updated per-section
  private elTopBar: HTMLDivElement | null = null;
  private elSquad: HTMLElement | null = null;
  private elFeed: HTMLDivElement | null = null;
  private elMapWindow: HTMLDivElement | null = null;
  private elSheet: HTMLElement | null = null;
  private elSheetGrab: HTMLDivElement | null = null;
  private elSheetHeader: HTMLDivElement | null = null;
  private elSheetBody: HTMLDivElement | null = null;
  private bottomSheet: BottomSheet | null = null;
  private mapObserver: ResizeObserver | null = null;
  private measureFrame: number | null = null;
  private shellBuilt = false;

  constructor(inputController: InputController, playerId: PlayerId, options: GameHUDOptions = {}) {
    this.inputController = inputController;
    this.localPlayerId = playerId;
    this.renderer = options.renderer ?? null;

    this.container = document.getElementById('game-hud') || document.createElement('div');
    if (!this.container.id) {
      this.container.id = 'game-hud';
      document.body.appendChild(this.container);
    }

    this.tradeUI = new TradeUI();
    this.pickupUI = new PickupUI();
    this.reorganizeUI = new ReorganizeUI();

    this.boundDelegateHandler = (e: Event) => this.handleDelegatedClick(e);
    this.container.addEventListener('click', this.boundDelegateHandler);
    this.container.addEventListener('keydown', this.boundKeyHandler);
    this.deckQuery.addEventListener('change', this.boundBreakpointHandler);
    this.landscapeQuery.addEventListener('change', this.boundBreakpointHandler);

    // Add in-game class for overscroll-behavior
    document.documentElement.classList.add('in-game');

    this.render();
  }

  // ─── Public API (unchanged from original) ────────────────────

  public hideMessage(): void {
    notificationManager.dismissAll();
  }

  public update(state: GameState, selectedSurvivorId: EntityId | null): void {
    this.state = state;
    this.selectedSurvivorId = selectedSurvivorId;
    if (this.seenEntryCount === null) this.seenEntryCount = displayableEntries(state.history).length;
    this.refreshLog();
    this.render();
    this.refreshBackpackModal();
  }

  public updateMode(_mode: string): void {
    this.render();
  }

  public destroy(): void {
    document.documentElement.removeAttribute('data-danger');
    this.container.removeEventListener('click', this.boundDelegateHandler);
    this.container.removeEventListener('keydown', this.boundKeyHandler);
    this.deckQuery.removeEventListener('change', this.boundBreakpointHandler);
    this.landscapeQuery.removeEventListener('change', this.boundBreakpointHandler);
    this.teardownShell();
    this.container.innerHTML = '';
  }

  // ─── Click Delegation (unchanged behavior) ──────────────────

  private handleDelegatedClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    const btn = target.closest('[data-action]') as HTMLElement | null;
    const closestButton = target.closest('button') as HTMLElement | null;
    const rawId = target.id || closestButton?.id || '';
    const id = rawId.replace(/-mobile$/, '');
    const action = btn?.dataset.action;

    const activeSurvivor = this.selectedSurvivorId && this.state ? this.state.survivors[this.selectedSurvivorId] : null;
    const isMyTurn = this.state ? this.state.players[this.state.activePlayerIndex] === this.localPlayerId : false;
    const isOwner = activeSurvivor ? activeSurvivor.playerId === this.localPlayerId : false;

    // --- Map recentre ---
    if (action === 'recenter') {
      this.renderer?.fitBoard(true);
      return;
    }

    // --- Top bar ---
    if (id === 'btn-mute' || action === 'toggle-mute') {
      audioManager.toggleMute();
      this.render();
      return;
    }
    if (id === 'btn-menu' || action === 'open-menu') {
      this.openPauseMenu();
      return;
    }
    if (action === 'open-log') {
      this.toggleLog();
      return;
    }

    // --- Latest-event card dismiss ---
    if (action === 'dismiss-feed') {
      const latest = this.latestEntry();
      if (latest) this.dismissedEntryTs = latest.timestamp;
      this.render();
      return;
    }

    // --- Lucky reroll ---
    if (action === 'reroll-lucky') {
      const last = this.state?.lastAction;
      if (last?.survivorId && last.playerId === this.localPlayerId) {
        networkManager.sendAction({
          playerId: this.localPlayerId,
          survivorId: last.survivorId,
          type: ActionType.REROLL_LUCKY,
        });
      }
      return;
    }

    // --- Squad rail: focus another local-controlled survivor ---
    if (action === 'select-survivor') {
      const sid = btn?.dataset.survivorId;
      if (sid && this.state) {
        const target = this.state.survivors[sid];
        if (target && target.playerId === this.localPlayerId) {
          this.inputController.selectMySurvivorById(sid);
        }
      }
      return;
    }

    // --- Backpack ---
    if (action === 'open-backpack') {
      this.openBackpack();
      return;
    }

    // --- Game over ---
    if (action === 'end-game') {
      this.openEndGameConfirm();
      return;
    }
    if (action === 'play-again') {
      this.openEndGameConfirm();
      return;
    }
    if (action === 'leave-room') {
      leaveRoom();
      return;
    }

    // --- Wound picker (not turn-gated — can resolve during any phase) ---
    if (action === 'resolve-wounds' && activeSurvivor) {
      this.openWoundPicker(activeSurvivor);
      return;
    }

    // --- Weapon buttons (not turn-gated — off-turn taps show a toast) ---
    const weaponBtn = target.closest('.hud-weapon-btn') as HTMLElement | null;
    if (weaponBtn) {
      const weaponId = weaponBtn.dataset.id;
      if (!weaponId || !activeSurvivor || !isOwner) return;
      const isCurrentlyArmed =
        this.inputController.mode === 'ATTACK' && this.inputController.weaponId === weaponId;
      if (isCurrentlyArmed) {
        this.inputController.setMode('DEFAULT');
        return;
      }
      const noAPNow = activeSurvivor.actionsRemaining < 1;
      const freeCombatAvailNow =
        activeSurvivor.freeCombatsRemaining > 0
        || activeSurvivor.freeMeleeRemaining > 0
        || activeSurvivor.freeRangedRemaining > 0;
      if (!isMyTurn) {
        notificationManager.show({ variant: 'warning', message: es.hud.toast.notYourTurn, duration: 2500 });
        return;
      }
      if (noAPNow && !freeCombatAvailNow) {
        notificationManager.show({ variant: 'warning', message: es.hud.toast.noActions, duration: 2500 });
        return;
      }
      this.inputController.setMode('ATTACK', weaponId);
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickAttackZone, duration: 5000 });
      return;
    }

    // --- Turn-gated actions ---
    if (!isMyTurn || !isOwner || !activeSurvivor) return;

    if (id === 'btn-search') {
      audioManager.playSFX('search');
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.SEARCH });
      return;
    }
    if (id === 'btn-noise') {
      audioManager.playSFX('button_click');
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.MAKE_NOISE });
      return;
    }
    if (id === 'btn-reload') {
      audioManager.playSFX('button_click');
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.RELOAD });
      return;
    }
    if (id === 'btn-door') {
      audioManager.playSFX('button_click');
      this.inputController.setMode('OPEN_DOOR');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickDoor, duration: 5000 });
      return;
    }
    if (id === 'btn-objective') {
      audioManager.playSFX('objective');
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.TAKE_OBJECTIVE });
      return;
    }
    if (id === 'btn-trade') {
      this.handleTrade(activeSurvivor);
      return;
    }
    if (id === 'btn-organize') {
      // One action buys the whole session; every move inside it is free.
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.ORGANIZE_START });
      return;
    }
    if (id === 'btn-end-turn') {
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.END_TURN });
      return;
    }

    // --- Skill action buttons ---
    if (id === 'btn-sprint') {
      this.inputController.setMode('SPRINT');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickSprint, duration: 5000 });
      return;
    }
    if (id === 'btn-charge') {
      this.inputController.setMode('CHARGE');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickCharge, duration: 5000 });
      return;
    }
    if (id === 'btn-born-leader') {
      this.openBornLeaderPicker(activeSurvivor);
      return;
    }
    if (id === 'btn-bloodlust') {
      this.inputController.setMode('BLOODLUST_MELEE');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickBloodlust, duration: 5000 });
      return;
    }
    if (id === 'btn-lifesaver') {
      this.inputController.setMode('LIFESAVER');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickLifesaver, duration: 5000 });
      return;
    }
    if (id === 'btn-jump') {
      this.inputController.setMode('JUMP');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickJump, duration: 5000 });
      return;
    }
    if (id === 'btn-shove') {
      this.inputController.setMode('SHOVE');
      notificationManager.show({ variant: 'info', message: es.hud.toast.pickShove, duration: 5000 });
      return;
    }

  }

  // ─── Rendering shell — Field Manual three-column grid ───────

  private buildShell(): void {
    if (this.shellBuilt) return;
    this.teardownShell();
    this.container.innerHTML = '';

    this.elTopBar = document.createElement('div');
    this.elTopBar.className = 'hud-topbar';

    this.elSquad = document.createElement('aside');
    this.elSquad.className = 'hud-squad';

    // Center column holds the feed overlay and the map window. The map
    // "window" is transparent so the PIXI canvas (mounted in #app) shows
    // through; its rect is the camera viewport.
    const center = document.createElement('div');
    center.className = 'hud-center';

    this.elFeed = document.createElement('div');
    this.elFeed.className = 'hud-feed-slot';

    const mapWindow = document.createElement('div');
    mapWindow.className = 'hud-map-window';
    this.elMapWindow = mapWindow;

    center.append(this.elFeed, mapWindow);

    // Operative panel — bottom deck on desktop and tablet, bottom sheet in
    // phone portrait, side panel in phone landscape. One element and one
    // renderer for all three; `data-layout` on #game-hud picks the
    // arrangement. Created once; render() only replaces header and body.
    this.elSheet = document.createElement('section');
    this.elSheet.className = 'hud-sheet';
    this.elSheet.setAttribute('aria-label', es.hud.sheetLabel);
    this.elSheetGrab = document.createElement('div');
    this.elSheetGrab.className = 'hud-sheet__grab';
    this.elSheetHeader = document.createElement('div');
    this.elSheetHeader.className = 'hud-sheet__header';
    this.elSheetGrab.innerHTML = '<div class="hud-sheet__handle" aria-hidden="true"></div>';
    this.elSheetGrab.append(this.elSheetHeader);
    this.elSheetBody = document.createElement('div');
    this.elSheetBody.className = 'hud-sheet__body';
    this.elSheet.append(this.elSheetGrab, this.elSheetBody);

    // The recentre button floats over the board but sits after the deck in
    // DOM order, so tabbing runs top bar → squad → deck → map overlay.
    const recenter = document.createElement('button');
    recenter.className = 'hud-recenter';
    recenter.dataset.action = 'recenter';
    recenter.title = es.hud.recenterTitle;
    recenter.setAttribute('aria-label', es.hud.recenter);
    recenter.innerHTML = icon('LocateFixed', 'sm');

    this.container.append(
      this.elTopBar,
      this.elSquad,
      center,
      this.elSheet,
      recenter,
    );

    if (typeof ResizeObserver !== 'undefined') {
      this.mapObserver = new ResizeObserver(() => this.scheduleViewportMeasure());
      this.mapObserver.observe(mapWindow);
    }
    this.shellBuilt = true;
  }

  private teardownShell(): void {
    this.mapObserver?.disconnect();
    this.mapObserver = null;
    this.bottomSheet?.destroy();
    this.bottomSheet = null;
    if (this.measureFrame !== null) {
      cancelAnimationFrame(this.measureFrame);
      this.measureFrame = null;
    }
    this.shellBuilt = false;
  }

  private currentLayout(): HudLayout {
    return resolveHudLayout(this.deckQuery.matches, this.landscapeQuery.matches);
  }

  /** Attach the drag helper only in phone portrait; the landscape panel does not snap. */
  private syncBottomSheet(layout: HudLayout): void {
    const wantSheet = layout === 'sheet' && !this.elSheet!.hidden;
    if (wantSheet && !this.bottomSheet) {
      this.bottomSheet = new BottomSheet(this.elSheet!, this.elSheetGrab!, () => this.measureSheet());
      this.bottomSheet.onSnap(() => this.scheduleViewportMeasure());
      this.scheduleViewportMeasure();
    } else if (!wantSheet && this.bottomSheet) {
      this.bottomSheet.destroy();
      this.bottomSheet = null;
      this.scheduleViewportMeasure();
    } else {
      this.bottomSheet?.refresh();
    }
  }

  private measureSheet(): SheetHeights {
    const sheet = this.elSheet!;
    const full = sheet.offsetHeight;
    const safeBottom = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    const peek = Math.min(full, this.elSheetGrab!.offsetHeight + safeBottom);
    const halfEnd = this.elSheetBody!.querySelector('.hud-sheet__half') as HTMLElement | null;
    const half = halfEnd
      ? Math.min(full, halfEnd.offsetTop + halfEnd.offsetHeight + 8 + safeBottom)
      : peek;
    return { peek, half: Math.max(peek, half), full };
  }

  private scheduleViewportMeasure(): void {
    if (this.measureFrame !== null) return;
    this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = null;
      this.measureViewport();
    });
  }

  /** Report the visible map area (map window minus the deck or snapped sheet) to the camera. */
  private measureViewport(): void {
    if (!this.elMapWindow || !this.elMapWindow.isConnected) return;
    let sheetOffset = 0;
    if (this.bottomSheet) {
      // At full the board stays framed above the half point; the user asked to cover it.
      sheetOffset = Math.min(this.bottomSheet.currentHeight(), this.measureSheet().half);
    } else if (this.container.dataset.layout === 'deck' && !this.elSheet!.hidden) {
      // The deck is pinned over the bottom of the map window, so the camera's
      // viewport ends where the deck starts — same subtraction the sheet makes.
      sheetOffset = this.elSheet!.offsetHeight;
    }
    this.container.style.setProperty('--hud-sheet-offset', `${sheetOffset}px`);

    if (!this.renderer) return;
    const rect = this.elMapWindow.getBoundingClientRect();
    const bottom = Math.min(rect.bottom, this.container.getBoundingClientRect().bottom - sheetOffset);
    const h = Math.max(0, bottom - rect.top);
    if (rect.width <= 0 || h <= 0) return;
    this.renderer.setViewport({ x: rect.left, y: rect.top, w: rect.width, h });
  }

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = '';
      this.shellBuilt = false;
      return;
    }

    if (this.state.gameResult) {
      this.shellBuilt = false;
      this.renderGameOver();
      return;
    }

    this.buildShell();

    document.documentElement.setAttribute('data-danger', this.state.currentDangerLevel.toLowerCase());

    const isMyTurn = this.state.players[this.state.activePlayerIndex] === this.localPlayerId;
    const activeSurvivor = this.selectedSurvivorId ? this.state.survivors[this.selectedSurvivorId] : null;
    const layout = this.currentLayout();
    if (this.container.dataset.layout !== layout) {
      this.container.dataset.layout = layout;
      this.scheduleViewportMeasure();
    }

    this.elTopBar!.innerHTML = this.renderTopBar(isMyTurn);
    this.elSquad!.innerHTML = this.renderSquadChips();
    const showActiveOp = !!activeSurvivor && activeSurvivor.playerId === this.localPlayerId;
    this.elSheet!.hidden = !showActiveOp;
    this.elSheetHeader!.innerHTML = showActiveOp ? this.renderSheetHeader(activeSurvivor!, isMyTurn) : '';
    this.elSheetBody!.innerHTML = showActiveOp ? this.renderSheetBody(activeSurvivor!, isMyTurn) : '';
    this.syncBottomSheet(layout);
    this.scheduleViewportMeasure();

    this.elFeed!.innerHTML = this.renderWaitingBanner() + this.renderLatestEvent();

    this.syncTradeAndPickup(activeSurvivor);

    // Auto-open the wound distribution modal for the player it belongs to:
    // zombie wounds are the host's to assign, friendly fire is the shooter's.
    const myDistribution = (this.state.pendingZombieWounds ?? []).find(entry =>
      entry.assignedByPlayerId
        ? entry.assignedByPlayerId === this.localPlayerId
        : this.isHost());
    if (myDistribution && !this.woundDistModalId) {
      this.openWoundDistribution(myDistribution);
    }

    const mySurvivors = Object.values(this.state.survivors).filter(s => s.playerId === this.localPlayerId);

    // Auto-open wound picker for any owned survivor with pending wounds
    const woundedSurvivor = mySurvivors.find(s => (s.pendingWounds ?? 0) > 0);
    if (woundedSurvivor && !this.woundPickerModalId && !this.woundDistModalId) {
      this.openWoundPicker(woundedSurvivor);
    }

    this.syncSkillChoice(mySurvivors);
  }

  /** Host = first lobby player, same rule the server uses for wound distribution. */
  private isHost(): boolean {
    return this.state?.lobby.players[0]?.id === this.localPlayerId;
  }

  // ─── Waiting banner ─────────────────────────────────────────

  /** One line per pending decision the local player is not making. */
  private renderWaitingBanner(): string {
    const state = this.state!;
    const lines: string[] = [];

    for (const entry of state.pendingZombieWounds ?? []) {
      if (entry.assignedByPlayerId) {
        if (entry.assignedByPlayerId === this.localPlayerId) continue;
        const who = state.lobby.players.find(p => p.id === entry.assignedByPlayerId);
        const whoName = displayName(who?.name, who?.characterClass) || es.common.host;
        lines.push(es.modals.waiting.playerAssigning(escapeHtml(whoName), entry.totalWounds, formatZoneId(entry.zoneId, state)));
      } else if (!this.isHost()) {
        const host = state.lobby.players[0];
        const hostName = displayName(host?.name, host?.characterClass) || es.common.host;
        lines.push(es.modals.waiting.hostAssigning(escapeHtml(hostName), entry.totalWounds, formatZoneId(entry.zoneId, state)));
      }
    }

    for (const survivor of Object.values(state.survivors)) {
      if (survivor.playerId === this.localPlayerId) continue;
      if ((survivor.pendingWounds ?? 0) > 0) {
        lines.push(es.modals.waiting.resolvingWounds(escapeHtml(displayName(survivor.name, survivor.characterClass))));
      }
      if (XPManager.getPendingSkillChoice(survivor)) {
        lines.push(es.modals.waiting.choosingSkill(escapeHtml(displayName(survivor.name, survivor.characterClass))));
      }
    }

    if (lines.length === 0) return '';
    return `<div class="hud-waiting">${lines.map(l => `<div class="event-entry event-entry--waiting">${l}</div>`).join('')}</div>`;
  }

  // ─── Skill Choice Modal ─────────────────────────────────────

  private syncSkillChoice(mySurvivors: Survivor[]): void {
    const pending = mySurvivors.find(s => XPManager.getPendingSkillChoice(s));

    // Close once the server state no longer has the choice we are showing.
    if (this.skillChoiceModalId && this.skillChoiceSurvivorId !== pending?.id) {
      modalManager.close(this.skillChoiceModalId);
      this.skillChoiceModalId = null;
      this.skillChoiceSurvivorId = null;
    }

    if (!pending || this.skillChoiceModalId || this.woundPickerModalId || this.woundDistModalId) return;

    const choice = XPManager.getPendingSkillChoice(pending)!;
    this.skillChoiceSurvivorId = pending.id;
    this.skillChoiceModalId = modalManager.open({
      title: escapeHtml(es.modals.skillChoice.title(displayName(pending.name, pending.characterClass), es.danger[choice.level] ?? choice.level)),
      size: 'md',
      persistent: true,
      renderBody: () => choice.options.map(skillId => {
        return `<div class="mb-3">
          ${renderButton({ label: escapeHtml(skillName(skillId)), variant: 'primary', fullWidth: true, dataAction: 'choose-skill', dataId: skillId })}
          <p class="text-secondary mt-1">${escapeHtml(skillDescription(skillId))}</p>
        </div>`;
      }).join(''),
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest('[data-action="choose-skill"]') as HTMLElement | null;
          if (!btn?.dataset.id) return;
          networkManager.sendAction({
            playerId: this.localPlayerId,
            survivorId: pending.id,
            type: ActionType.CHOOSE_SKILL,
            payload: { skillId: btn.dataset.id },
          });
        });
      },
      onClose: () => {
        this.skillChoiceModalId = null;
        this.skillChoiceSurvivorId = null;
      },
    });
  }

  // ─── Top phase bar ──────────────────────────────────────────

  private renderTopBar(isMyTurn: boolean): string {
    const state = this.state!;
    const activePid = state.players[state.activePlayerIndex];
    const activeSurvivor = Object.values(state.survivors).find(s => s.playerId === activePid);
    const activeName = displayName(activeSurvivor?.name, activeSurvivor?.characterClass);

    const phaseRaw = (state.phase || '').toUpperCase();
    const isPlayerPhase = phaseRaw.includes('PLAYER') || phaseRaw === 'SURVIVOR';
    const isZombiePhase = phaseRaw.includes('ZOMBIE');
    const isEndPhase    = phaseRaw.includes('END');

    const dangerLabel = es.danger[state.currentDangerLevel];
    const myTurnClass = isMyTurn ? ' hud-topbar--my-turn' : '';
    const dangerClass = ` hud-topbar--danger-${state.currentDangerLevel.toLowerCase()}`;

    const currentPhaseLabel = isZombiePhase
      ? es.hud.phaseZombies
      : isEndPhase
        ? es.hud.phaseEnd
        : es.hud.phasePlayers(escapeHtml(activeName));

    const tick = (active: boolean) =>
      `<span class="hud-phasetick${active ? ' hud-phasetick--current' : ''}" aria-hidden="true"></span>`;

    return `
      <div class="hud-topbar__inner${myTurnClass}${dangerClass}">
        <div class="hud-topbar__left">
          <button class="hud-turnchip" data-action="open-log" title="${es.hud.logTitle}" aria-label="${es.hud.roundChipAria(state.turn)}">
            <span class="hud-turnchip__label">${es.hud.round}</span>
            <span class="hud-turnchip__value">${String(state.turn).padStart(2, '0')}</span>
          </button>
          <div class="hud-phaseindicator" role="status" aria-live="polite" aria-label="${es.hud.phaseAria(currentPhaseLabel)}">
            <span class="hud-phaseindicator__bracket hud-phaseindicator__bracket--left" aria-hidden="true">[</span>
            <span class="hud-phaseindicator__label">${currentPhaseLabel}</span>
            <span class="hud-phaseindicator__bracket hud-phaseindicator__bracket--right" aria-hidden="true">]</span>
            <span class="hud-phaseindicator__ticks" aria-hidden="true">
              ${tick(isPlayerPhase)}
              ${tick(isZombiePhase)}
              ${tick(isEndPhase)}
            </span>
          </div>
        </div>
        <div class="hud-topbar__right">
          <span class="hud-danger" role="status" aria-live="polite" aria-label="${es.hud.dangerAria(dangerLabel)}">
            <span class="hud-danger__label">${es.hud.danger}</span>
            <span class="hud-danger__level">${escapeHtml(dangerLabel)}</span>
          </span>
          ${this.renderLogButton()}
          <button id="btn-menu" class="hud-iconbtn" data-action="open-menu" title="${es.hud.menu}" aria-label="${es.hud.menu}">${icon('Menu', 'sm')}</button>
        </div>
        <div class="hud-topbar__bar"></div>
      </div>`;
  }

  /**
   * Squad overlay on the board: a 36px avatar chip per survivor with HP and
   * AP pip rows beneath it. With the plate rail gone this is the only place a
   * player reads a teammate's state, so the pips are not decorative.
   */
  private renderSquadChips(): string {
    const state = this.state!;
    const activePid = state.players[state.activePlayerIndex];
    const chipPips = (on: number, max: number, kind: 'hp' | 'ap') =>
      Array.from({ length: max }, (_, i) =>
        `<i class="hud-chip__pip hud-chip__pip--${kind}${i < on ? ' hud-chip__pip--on' : ''}"></i>`).join('');

    const chips = state.players.map(pid => {
      const s = Object.values(state.survivors).find(sv => sv.playerId === pid);
      if (!s) return '';
      const color = getPlayerIdentity(state, s.playerId).primary;
      const isLocal = s.playerId === this.localPlayerId;
      const classes = [
        'hud-chip',
        s.playerId === activePid ? 'hud-chip--turn' : '',
        s.id === this.selectedSurvivorId ? 'hud-chip--selected' : '',
      ].filter(Boolean).join(' ');
      const img = s.characterClass
        ? `<img class="hud-chip__img" src="${escapeHtml(characterImageUrl(s.characterClass))}" alt="" />`
        : `<span class="hud-chip__initial">${escapeHtml(displayName(s.name, s.characterClass).charAt(0).toUpperCase())}</span>`;
      const hp = Math.max(0, s.maxHealth - s.wounds);
      // Cheat mode sets actionsPerTurn to 999 — one bar, never 999 pips.
      const apPips = s.cheatMode
        ? '<i class="hud-chip__pip hud-chip__pip--inf"></i>'
        : chipPips(Math.min(s.actionsRemaining, s.actionsPerTurn), s.actionsPerTurn, 'ap');
      const chipName = displayName(s.name, s.characterClass);
      const label = `${es.hud.chipAria(escapeHtml(chipName), hp, s.maxHealth, s.playerId === activePid)} · ${es.hud.actionsAria(s.cheatMode ? null : s.actionsRemaining, s.actionsPerTurn)}`;
      const chip = isLocal
        ? `<button class="${classes}" style="--chip-color:${color}" data-action="select-survivor" data-survivor-id="${escapeHtml(s.id)}" aria-label="${label}" title="${escapeHtml(chipName)}">${img}</button>`
        : `<span class="${classes}" style="--chip-color:${color}" role="img" aria-label="${label}" title="${escapeHtml(chipName)}">${img}</span>`;
      // The label above already carries HP and AP, so the pips are decoration
      // for assistive tech and must not intercept the chip's 44px hit area.
      return `<div class="hud-chip-cell">${chip}
        <span class="hud-chip__state" aria-hidden="true">
          <span class="hud-chip__pips">${chipPips(hp, s.maxHealth, 'hp')}</span>
          <span class="hud-chip__pips">${apPips}</span>
        </span>
      </div>`;
    }).join('');
    return `<div class="hud-chips">${chips}</div>`;
  }

  // ─── Latest-event card (center overlay) ─────────────────────

  private latestEntry(): GameState['history'][number] | undefined {
    const entries = displayableEntries(this.state?.history);
    return entries[entries.length - 1];
  }

  /** Newest displayable history entry; stays until replaced or dismissed. */
  private renderLatestEvent(): string {
    const state = this.state;
    const entry = this.latestEntry();
    if (!state || !entry) return '';
    if (this.dismissedEntryTs !== null && entry.timestamp <= this.dismissedEntryTs) return '';

    // Roll the dice in once per entry, and not for the entry already there on join.
    let roll = false;
    if (this.lastRolledEntryTs !== entry.timestamp) {
      roll = this.lastRolledEntryTs !== null && !!entry.dice?.length;
      this.lastRolledEntryTs = entry.timestamp;
    }

    const luckyBtn = this.renderLuckyRerollButton(entry);
    const dismissBtn = luckyBtn
      ? ''
      : `<button class="btn btn--icon btn--sm hud-feed__dismiss" data-action="dismiss-feed" title="${es.common.close}" aria-label="${es.common.close}">${icon('X', 'sm')}</button>`;

    return `<div class="hud-feed"><div class="hud-feed__card${luckyBtn ? '' : ' hud-feed__card--dismissable'}">
      ${dismissBtn}
      <div class="hud-feed__body" role="button" tabindex="0" data-action="open-log" aria-label="${es.hud.openLog}">${renderEventEntry(entry, state, { roll })}</div>
      ${luckyBtn}
    </div></div>`;
  }

  /**
   * Lucky reroll affordance — surfaces a button in the latest-event card when:
   * - local survivor owns the last ATTACK action,
   * - Lucky skill is unspent this turn,
   * - the attack carried a rollback snapshot.
   */
  private renderLuckyRerollButton(cardEntry: GameState['history'][number]): string {
    const state = this.state;
    if (!state || !state.lastAction) return '';
    const last = state.lastAction;
    if (last.type !== ActionType.ATTACK) return '';
    // Only offer it while the card still shows that attack.
    if (cardEntry.actionType !== ActionType.ATTACK || cardEntry.survivorId !== last.survivorId) return '';
    if (last.playerId !== this.localPlayerId) return '';
    if (!last.survivorId) return '';
    const survivor = state.survivors[last.survivorId];
    if (!survivor) return '';
    if (!survivor.skills.includes('lucky')) return '';
    if (survivor.luckyUsedThisAction && !survivor.cheatMode) return '';
    if (!last.rollbackSnapshot) return '';
    return `<button class="action-btn action-btn--lucky" data-action="reroll-lucky" title="${es.hud.luckyRerollTitle}">
      ${icon('Dices', 'sm')} ${es.hud.luckyReroll}
    </button>`;
  }

  // ─── Center action row ──────────────────────────────────────

  /**
   * Sheet / side panel: one horizontal row of square buttons. Objective only
   * appears when the zone has one; End Turn lives in the sheet header.
   */
  private renderActionStrip(survivor: Survivor, isMyTurn: boolean): string {
    const canOpenDoor = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
    const currentZone = this.state?.zones[survivor.position.zoneId];
    const noAP = survivor.actionsRemaining < 1;

    const buttons = [
      renderActionButton({ id: 'btn-search', icon: 'Search', label: es.hud.search, cost: survivor.freeSearchesRemaining > 0 ? COST_FREE : COST_ONE, disabled: !isMyTurn || (survivor.hasSearched && !survivor.cheatMode) || (noAP && survivor.freeSearchesRemaining <= 0) }),
      renderActionButton({ id: 'btn-noise', icon: 'Volume2', label: es.hud.noise, cost: COST_ONE, disabled: !isMyTurn || noAP }),
      renderActionButton({ id: 'btn-door', icon: 'DoorOpen', label: es.hud.door, cost: COST_ONE, disabled: !isMyTurn || noAP || !canOpenDoor }),
      renderActionButton({ id: 'btn-trade', icon: 'Handshake', label: es.hud.trade, cost: COST_ONE, disabled: !isMyTurn || noAP }),
      renderActionButton({ id: 'btn-organize', icon: 'Backpack', label: es.hud.organize, cost: COST_ONE, disabled: !isMyTurn || noAP }),
    ];
    // A `reload` weapon holds one shot; reloading it costs an action.
    const unloaded = survivor.inventory.filter(c => c.keywords?.includes('reload') && c.loaded === false);
    if (unloaded.length > 0) {
      buttons.push(renderActionButton({
        id: 'btn-reload', icon: 'RotateCcw', label: es.hud.reload, cost: COST_ONE,
        disabled: !isMyTurn || noAP || unloaded.length > 1,
        highlight: isMyTurn && !noAP && unloaded.length === 1,
      }));
    }
    if (currentZone?.hasObjective) {
      buttons.push(renderActionButton({ id: 'btn-objective', icon: 'Target', label: es.hud.objective, cost: COST_ONE, disabled: !isMyTurn || noAP, highlight: isMyTurn && !noAP }));
    }
    buttons.push(...this.renderSkillActionButtons(survivor, isMyTurn, noAP));

    return `<div class="hud-actionstrip" role="toolbar" aria-label="${es.hud.actionsToolbar}">${buttons.join('')}</div>`;
  }

  /** Sheet header: avatar, name, HP/AP pips and the pinned End Turn button. */
  private renderSheetHeader(survivor: Survivor, isMyTurn: boolean): string {
    const hp = Math.max(0, survivor.maxHealth - survivor.wounds);
    const pips = (on: number, max: number, kind: string) =>
      Array.from({ length: max }, (_, i) => `<i class="hud-pip hud-pip--${kind}${i < on ? ' hud-pip--on' : ''}"></i>`).join('');
    const apPips = survivor.cheatMode
      ? '<span class="hud-pips__inf">∞</span>'
      : pips(Math.min(survivor.actionsRemaining, survivor.actionsPerTurn), survivor.actionsPerTurn, 'ap')
        + (survivor.actionsRemaining > survivor.actionsPerTurn ? `<span class="hud-pips__inf">+${survivor.actionsRemaining - survivor.actionsPerTurn}</span>` : '');
    const avatarUrl = survivor.characterClass ? characterImageUrl(survivor.characterClass) : undefined;

    return `
      <div class="hud-sheet__who">
        ${renderPhotoSlot({ size: 'sm', imageUrl: avatarUrl })}
        <div class="hud-sheet__ident">
          <span class="hud-sheet__name">${escapeHtml(displayName(survivor.name, survivor.characterClass))}</span>
          ${this.renderTurnLine(isMyTurn, survivor)}
          <span class="hud-pips" aria-label="${es.hud.healthAria(hp, survivor.maxHealth)}">${icon('Heart', 'xs')}${pips(hp, survivor.maxHealth, 'hp')}</span>
          <span class="hud-pips" aria-label="${es.hud.actionsAria(survivor.cheatMode ? null : survivor.actionsRemaining, survivor.actionsPerTurn)}">${icon('Zap', 'xs')}${apPips}</span>
        </div>
      </div>
      <button id="btn-end-turn" class="action-btn action-btn--end-turn hud-sheet__endturn" ${isMyTurn ? '' : 'disabled'} aria-label="${es.common.endTurn}">
        <span class="action-btn__icon">${icon('SkipForward', 'sm')}</span>
        <span class="action-btn__label">${es.common.endTurn}</span>
      </button>`;
  }

  /** Sheet body: action row + loadout (the "half" snap), then skills and XP. */
  private renderSheetBody(survivor: Survivor, isMyTurn: boolean): string {
    const skillBadges = this.renderSkillBadges(survivor);
    const freeActionIndicators = this.renderFreeActionIndicators(survivor);
    const tagRow = (skillBadges || freeActionIndicators)
      ? `<div class="hud-op__tags">${freeActionIndicators}${skillBadges}</div>`
      : '';

    return `
      <div class="hud-sheet__half">
        ${this.renderWoundAlert(survivor)}
        ${this.renderActionStrip(survivor, isMyTurn)}
        ${this.renderLoadout(survivor, isMyTurn)}
      </div>
      <div class="hud-sheet__more">
        ${this.renderXpBar(survivor)}
        ${tagRow}
      </div>`;
  }

  // Loadout — render by actual slot occupancy so non-weapons in hand are visible.
  private renderLoadout(survivor: Survivor, isMyTurn: boolean): string {
    const noAP = survivor.actionsRemaining < 1;
    const weaponBoosts = this.getWeaponBoosts(survivor);
    const rHand = survivor.inventory.find(c => c.slot === 'HAND_1');
    const lHand = survivor.inventory.find(c => c.slot === 'HAND_2');
    const freeCombatAvail = survivor.freeCombatsRemaining > 0 || survivor.freeMeleeRemaining > 0 || survivor.freeRangedRemaining > 0;
    const attackDisabled = !isMyTurn || (noAP && !freeCombatAvail);

    const handSlot = (item: EquipmentCard | undefined, slotLabel: string) => {
      if (!item) {
        return `<div class="hud-slot hud-slot--empty" aria-label="${es.hud.emptySlotAria(slotLabel)}">
          <div class="hud-slot__empty">— ${es.common.empty} —</div>
        </div>`;
      }
      if (item.type !== 'WEAPON') {
        return `<div class="hud-slot hud-slot--item" aria-label="${slotLabel}">
          ${renderItemCard(item, { variant: 'default', showSlot: false })}
        </div>`;
      }
      const boosts = weaponBoosts.get(item.id) || { dice: 0, damage: 0 };
      const isActive = this.inputController.mode === 'ATTACK' && this.inputController.weaponId === item.id;
      const classes = [
        'hud-weapon-btn',
        isActive ? 'hud-weapon-btn--active' : '',
        attackDisabled ? 'hud-weapon-btn--locked' : '',
      ].filter(Boolean).join(' ');
      return `<div class="hud-slot hud-slot--weapon" aria-label="${slotLabel}">
        <button class="${classes}" data-id="${escapeHtml(item.id)}"${attackDisabled ? ' aria-disabled="true"' : ''}>
          ${renderItemCard(item, { variant: 'weapon', showSlot: false, bonusDice: boosts.dice, bonusDamage: boosts.damage })}
        </button>
      </div>`;
    };

    const bagItems = survivor.inventory.filter(c => !c.inHand);
    const bagSlot = `
      <div class="hud-slot hud-slot--bag">
        <button class="hud-bag-button" data-action="open-backpack" title="${es.hud.openBag}" aria-label="${es.hud.openBagAria(bagItems.length)}">
          <span class="hud-bag-button__icon">${icon('Backpack', 'md')}</span>
          <span class="hud-bag-button__label">${es.hud.bag}</span>
          ${bagItems.length > 0 ? `<span class="hud-bag-button__badge">${bagItems.length}</span>` : ''}
        </button>
      </div>`;

    return `
      <section class="hud-loadout">
        <div class="fm-kicker fm-kicker--secondary hud-loadout__kicker">${es.hud.loadout}</div>
        <div class="hud-loadout__grid">
          ${handSlot(rHand, es.hud.rightHand)}
          ${handSlot(lHand, es.hud.leftHand)}
          ${bagSlot}
        </div>
      </section>`;
  }

  private renderWoundAlert(survivor: Survivor): string {
    if (!survivor.pendingWounds || survivor.pendingWounds <= 0) return '';
    return `<button class="hud-wound-alert" data-action="resolve-wounds">
      ${icon('AlertTriangle', 'sm')}
      <span>${es.hud.pendingWounds(survivor.pendingWounds)}</span>
    </button>`;
  }

  // ─── Skill Visual Indicators ──────────────────────────────────

  private renderSkillBadges(survivor: Survivor): string {
    if (!survivor.skills || survivor.skills.length === 0) return '';

    const badges = survivor.skills.map(skillId => {
      const def = SKILL_DEFINITIONS[skillId];
      if (!def) return '';

      let used = false;
      if (skillId === 'sprint') used = survivor.sprintUsedThisTurn;
      else if (skillId === 'charge') used = survivor.chargeUsedThisTurn;
      else if (skillId === 'born_leader') used = survivor.bornLeaderUsedThisTurn;
      else if (skillId === 'bloodlust_melee') used = survivor.bloodlustUsedThisTurn;
      else if (skillId === 'lifesaver') used = survivor.lifesaverUsedThisTurn;

      const typeClass = def.type === 'PASSIVE' ? 'passive' : def.type === 'ACTION' ? 'action' : 'stat-mod';
      const usedClass = used ? ' skill-badge--used' : '';
      const skillIcon = icon(iconForSkill(skillId), 'sm');

      return `<span class="skill-badge skill-badge--${typeClass}${usedClass}" title="${escapeHtml(skillDescription(skillId))}">${skillIcon}<span>${escapeHtml(skillName(skillId))}</span></span>`;
    }).filter(Boolean).join('');

    return `<div class="hud-skills">${badges}</div>`;
  }

  private renderXpBar(survivor: Survivor): string {
    const level = String(survivor.dangerLevel).toUpperCase();
    const rank = dangerToRank(level);
    const fillRank = nextRankColor(level);
    const xp = Math.max(0, survivor.experience || 0);
    const next = XP_NEXT_THRESHOLD[level];
    const current = XP_CURRENT_THRESHOLD[level] ?? 0;

    if (next === null || next === undefined) {
      return `
        <div class="hud-op__xp hud-op__xp--rank-${rank} hud-op__xp--max">
          <div class="hud-op__xp-head">
            <span class="hud-op__xp-label">${es.hud.xp}</span>
            <span class="hud-op__xp-value">${xp} · ${es.hud.xpMax}</span>
          </div>
          <div class="hud-op__xp-track" role="progressbar" aria-label="${es.hud.xpAria}" aria-valuenow="${xp}" aria-valuemin="0" aria-valuemax="${xp}">
            <div class="hud-op__xp-fill hud-op__xp-fill--${fillRank}" style="width:100%"></div>
          </div>
        </div>`;
    }

    const span = Math.max(1, next - current);
    const progressed = Math.max(0, Math.min(span, xp - current));
    const pct = Math.round((progressed / span) * 100);

    return `
      <div class="hud-op__xp hud-op__xp--rank-${rank}">
        <div class="hud-op__xp-head">
          <span class="hud-op__xp-label">${es.hud.xp}</span>
          <span class="hud-op__xp-value">${xp} → ${next}</span>
        </div>
        <div class="hud-op__xp-track" role="progressbar" aria-label="${es.hud.xpAria}" aria-valuenow="${xp}" aria-valuemin="${current}" aria-valuemax="${next}">
          <div class="hud-op__xp-fill hud-op__xp-fill--${fillRank}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  private renderFreeActionIndicators(survivor: Survivor): string {
    const indicators: string[] = [];

    if (survivor.freeMovesRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="${es.hud.freeMove}">${icon('Footprints', 'sm')}<span class="free-action-pip__count">${survivor.freeMovesRemaining}</span></span>`);
    }
    if (survivor.freeCombatsRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="${es.hud.freeCombat}">${icon('Crosshair', 'sm')}<span class="free-action-pip__count">${survivor.freeCombatsRemaining}</span></span>`);
    }
    if (survivor.freeMeleeRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="${es.hud.freeMelee}">${icon('Swords', 'sm')}<span class="free-action-pip__count">${survivor.freeMeleeRemaining}</span></span>`);
    }
    if (survivor.freeRangedRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="${es.hud.freeRanged}">${icon('Crosshair', 'sm')}<span class="free-action-pip__count">${survivor.freeRangedRemaining}</span></span>`);
    }
    if (survivor.freeSearchesRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="${es.hud.freeSearch}">${icon('Search', 'sm')}<span class="free-action-pip__count">${survivor.freeSearchesRemaining}</span></span>`);
    }

    if (indicators.length === 0) return '';
    return `<div class="hud-free-actions">${indicators.join('')}</div>`;
  }

  private renderSkillActionButtons(survivor: Survivor, isMyTurn: boolean, noAP: boolean): string[] {
    const buttons: string[] = [];

    const cheat = !!survivor.cheatMode;
    if (survivor.skills.includes('sprint')) {
      buttons.push(renderActionButton({
        id: 'btn-sprint', icon: 'Zap', label: es.hud.sprint,
        cost: COST_ONE, disabled: !isMyTurn || noAP || (survivor.sprintUsedThisTurn && !cheat),
      }));
    }
    if (survivor.skills.includes('charge')) {
      buttons.push(renderActionButton({
        id: 'btn-charge', icon: 'Swords', label: es.hud.charge,
        cost: COST_FREE, disabled: !isMyTurn || (survivor.chargeUsedThisTurn && !cheat),
      }));
    }
    if (survivor.skills.includes('born_leader')) {
      buttons.push(renderActionButton({
        id: 'btn-born-leader', icon: 'Crown', label: es.hud.bornLeader,
        cost: COST_FREE, disabled: !isMyTurn || (survivor.bornLeaderUsedThisTurn && !cheat),
      }));
    }
    if (survivor.skills.includes('bloodlust_melee')) {
      buttons.push(renderActionButton({
        id: 'btn-bloodlust', icon: 'Flame', label: es.hud.bloodlust,
        cost: COST_ONE, disabled: !isMyTurn || noAP || (survivor.bloodlustUsedThisTurn && !cheat),
      }));
    }
    if (survivor.skills.includes('lifesaver')) {
      buttons.push(renderActionButton({
        id: 'btn-lifesaver', icon: 'HeartHandshake', label: es.hud.lifesaver,
        cost: COST_FREE, disabled: !isMyTurn || (survivor.lifesaverUsedThisTurn && !cheat),
      }));
    }
    if (survivor.skills.includes('jump')) {
      buttons.push(renderActionButton({
        id: 'btn-jump', icon: 'Zap', label: es.hud.jump,
        cost: COST_ONE, disabled: !isMyTurn || noAP || (survivor.jumpUsedThisTurn && !cheat),
      }));
    }
    if (survivor.skills.includes('shove')) {
      buttons.push(renderActionButton({
        id: 'btn-shove', icon: 'Swords', label: es.hud.shove,
        cost: COST_FREE, disabled: !isMyTurn || (survivor.shoveUsedThisTurn && !cheat),
      }));
    }

    return buttons;
  }

  private getWeaponBoosts(survivor: Survivor): Map<string, { dice: number; damage: number }> {
    const boosts = new Map<string, { dice: number; damage: number }>();
    const weapons = survivor.inventory.filter(c => c.type === 'WEAPON' && c.inHand);

    for (const w of weapons) {
      if (!w.stats) continue;
      const isMelee = w.stats.range[1] === 0;
      const isRanged = !isMelee;
      let bonusDice = 0;
      let bonusDamage = 0;

      // Copies stack — same reading as CombatHandlers, so the preview matches.
      const copies = (skillId: string) => skillCount(survivor.skills, skillId);
      if (isMelee) bonusDice += copies('plus_1_die_melee');
      if (isRanged) bonusDice += copies('plus_1_die_ranged');
      bonusDice += copies('plus_1_die_combat');
      if (isMelee) bonusDamage += copies('plus_1_damage_melee');
      if (isRanged) bonusDamage += copies('plus_1_damage_ranged');
      bonusDamage += copies('plus_1_damage_combat');
      if (isMelee && survivor.skills.includes('super_strength')) {
        bonusDamage = Math.max(bonusDamage, 3 - w.stats.damage);
      }

      if (bonusDice > 0 || bonusDamage > 0) {
        boosts.set(w.id, { dice: bonusDice, damage: bonusDamage });
      }
    }

    return boosts;
  }

  // ─── Wound Picker Modal ──────────────────────────────────────

  private openWoundPicker(survivor: Survivor): void {
    if (this.woundPickerModalId && modalManager.isOpen(this.woundPickerModalId)) return;
    if (!survivor.pendingWounds || survivor.pendingWounds <= 0) return;

    this.woundPickerSelected = new Set();
    const pendingCount = survivor.pendingWounds;

    this.woundPickerModalId = modalManager.open({
      title: skillName('is_that_all_youve_got'),
      size: 'md',
      persistent: true,
      renderBody: () => this.renderWoundPickerBody(survivor, pendingCount),
      renderFooter: () => this.renderWoundPickerFooter(pendingCount),
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const cardEl = (e.target as HTMLElement).closest('[data-action="toggle-wound-card"]') as HTMLElement;
          if (cardEl) {
            const cardId = cardEl.dataset.cardId;
            if (cardId) {
              if (this.woundPickerSelected.has(cardId)) {
                this.woundPickerSelected.delete(cardId);
              } else if (this.woundPickerSelected.size < pendingCount) {
                this.woundPickerSelected.add(cardId);
              }
              modalManager.updateBody(this.woundPickerModalId!, this.renderWoundPickerBody(survivor, pendingCount));
              modalManager.updateFooter(this.woundPickerModalId!, this.renderWoundPickerFooter(pendingCount));
            }
            return;
          }

          const confirmBtn = (e.target as HTMLElement).closest('[data-action="confirm-wounds"]');
          if (confirmBtn) {
            networkManager.sendAction({
              playerId: this.localPlayerId,
              survivorId: survivor.id,
              type: ActionType.RESOLVE_WOUNDS,
              payload: { discardCardIds: [...this.woundPickerSelected] },
            });
            modalManager.close(this.woundPickerModalId!);
            this.woundPickerModalId = null;
            this.woundPickerSelected = new Set();
          }
        });
      },
      onClose: () => {
        this.woundPickerModalId = null;
        this.woundPickerSelected = new Set();
      },
    });
  }

  private renderWoundPickerBody(survivor: Survivor, pendingCount: number): string {
    const negated = Math.min(this.woundPickerSelected.size, pendingCount);
    const remaining = pendingCount - negated;
    const desc = `<p class="text-secondary mb-3">${es.modals.woundPicker.incoming(`<strong>${pendingCount}</strong>`, pendingCount)}</p>`;
    const summary = `<div class="wound-picker__summary">
      <span>${es.modals.woundPicker.negated} <strong class="text-success">${negated}</strong></span>
      <span>${es.modals.woundPicker.taken} <strong class="${remaining > 0 ? 'text-danger' : 'text-success'}">${remaining}</strong></span>
    </div>`;

    const cards = survivor.inventory.map(card => {
      const selected = this.woundPickerSelected.has(card.id);
      return `<div class="wound-picker__card ${selected ? 'wound-picker__card--selected' : ''}" data-action="toggle-wound-card" data-card-id="${card.id}">
        ${renderItemCard(card, { variant: selected ? 'ghost' : 'default', showSlot: true })}
      </div>`;
    }).join('');

    return `${desc}${summary}<div class="grid grid--2 gap-2 mt-3">${cards}</div>`;
  }

  private renderWoundPickerFooter(pendingCount: number): string {
    const negated = Math.min(this.woundPickerSelected.size, pendingCount);
    const remaining = pendingCount - negated;
    return renderButton({ label: es.modals.woundPicker.confirm(remaining), variant: remaining > 0 ? 'destructive' : 'primary', dataAction: 'confirm-wounds' });
  }

  // ─── Wound Distribution Modal ─────────────────────────────────

  private openWoundDistribution(entry: WoundDistEntry): void {
    if (this.woundDistModalId && modalManager.isOpen(this.woundDistModalId)) return;
    if (!this.state) return;

    this.woundDistAssignments = {};
    for (const sid of entry.survivorIds) {
      this.woundDistAssignments[sid] = 0;
    }
    this.woundDistAssignments[entry.survivorIds[0]] = entry.totalWounds;

    const isFriendlyFire = entry.source === 'FRIENDLY_FIRE';

    this.woundDistModalId = modalManager.open({
      title: isFriendlyFire ? es.modals.woundDist.titleFriendlyFire : es.modals.woundDist.title,
      size: 'md',
      persistent: true,
      renderBody: () => this.renderWoundDistBody(entry),
      renderFooter: () => this.renderWoundDistFooter(entry),
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
          if (!btn) return;
          const action = btn.dataset.action;
          const sid = btn.dataset.survivorId;

          if (action === 'wound-dist-plus' && sid) {
            const total = Object.values(this.woundDistAssignments).reduce((s, n) => s + n, 0);
            if (total < entry.totalWounds) {
              this.woundDistAssignments[sid] = (this.woundDistAssignments[sid] || 0) + 1;
              modalManager.updateBody(this.woundDistModalId!, this.renderWoundDistBody(entry));
              modalManager.updateFooter(this.woundDistModalId!, this.renderWoundDistFooter(entry));
            }
          } else if (action === 'wound-dist-minus' && sid) {
            if ((this.woundDistAssignments[sid] || 0) > 0) {
              this.woundDistAssignments[sid]--;
              modalManager.updateBody(this.woundDistModalId!, this.renderWoundDistBody(entry));
              modalManager.updateFooter(this.woundDistModalId!, this.renderWoundDistFooter(entry));
            }
          } else if (action === 'confirm-wound-dist') {
            const total = Object.values(this.woundDistAssignments).reduce((s, n) => s + n, 0);
            if (total !== entry.totalWounds) return;

            networkManager.sendAction({
              playerId: this.localPlayerId,
              type: ActionType.DISTRIBUTE_ZOMBIE_WOUNDS,
              payload: {
                zoneId: entry.zoneId,
                contextId: entry.contextId,
                assignments: { ...this.woundDistAssignments },
              },
            });
            modalManager.close(this.woundDistModalId!);
            this.woundDistModalId = null;
            this.woundDistAssignments = {};
          }
        });
      },
      onClose: () => {
        this.woundDistModalId = null;
        this.woundDistAssignments = {};
      },
    });
  }

  private renderWoundDistBody(entry: WoundDistEntry): string {
    if (!this.state) return '';
    const assigned = Object.values(this.woundDistAssignments).reduce((s, n) => s + n, 0);
    const remaining = entry.totalWounds - assigned;

    const desc = `<p class="text-secondary mb-3">${entry.source === 'FRIENDLY_FIRE'
      ? es.modals.woundDist.descFriendlyFire(`<strong>${entry.totalWounds}</strong>`, entry.totalWounds, formatZoneId(entry.zoneId, this.state!), entry.damagePerWound ?? 1)
      : es.modals.woundDist.desc(`<strong>${entry.totalWounds}</strong>`, entry.totalWounds, formatZoneId(entry.zoneId, this.state!))}</p>`;
    const summary = `<div class="wound-picker__summary mb-3">
      <span>${es.modals.woundDist.assigned} <strong>${assigned}</strong> / ${entry.totalWounds}</span>
      <span>${es.modals.woundDist.remaining} <strong class="${remaining > 0 ? 'text-warning' : 'text-success'}">${remaining}</strong></span>
    </div>`;

    const rows = entry.survivorIds.map(sid => {
      const survivor = this.state!.survivors[sid];
      if (!survivor) return '';
      const count = this.woundDistAssignments[sid] || 0;
      const hp = survivor.maxHealth - survivor.wounds;
      const identity = getPlayerIdentity(this.state!, survivor.playerId);
      const avatar = renderAvatar(displayName(survivor.name, survivor.characterClass), identity, 'sm', undefined, survivor.characterClass);

      return `<div class="wound-dist__row">
        ${avatar}
        <div class="wound-dist__info">
          <span class="wound-dist__name">${escapeHtml(displayName(survivor.name, survivor.characterClass))}</span>
          <span class="wound-dist__hp">${es.modals.woundDist.hp(hp)}</span>
        </div>
        <div class="wound-dist__controls">
          <button class="btn btn--sm btn--icon" data-action="wound-dist-minus" data-survivor-id="${sid}" ${count <= 0 ? 'disabled' : ''}>${icon('Minus', 'sm')}</button>
          <span class="wound-dist__count ${count > 0 ? 'text-danger' : ''}">${count}</span>
          <button class="btn btn--sm btn--icon" data-action="wound-dist-plus" data-survivor-id="${sid}" ${remaining <= 0 ? 'disabled' : ''}>${icon('Plus', 'sm')}</button>
        </div>
      </div>`;
    }).join('');

    return `${desc}${summary}<div class="wound-dist__list">${rows}</div>`;
  }

  private renderWoundDistFooter(entry: WoundDistEntry): string {
    const assigned = Object.values(this.woundDistAssignments).reduce((s, n) => s + n, 0);
    const isValid = assigned === entry.totalWounds;
    return renderButton({
      label: es.modals.woundDist.confirm,
      variant: isValid ? 'primary' : 'secondary',
      dataAction: 'confirm-wound-dist',
      disabled: !isValid,
    });
  }

  // ─── Born Leader Picker ───────────────────────────────────────

  private openBornLeaderPicker(survivor: Survivor): void {
    if (!this.state) return;
    const zoneId = survivor.position.zoneId;
    const others = Object.values(this.state.survivors).filter(
      s => s.position.zoneId === zoneId && s.id !== survivor.id && s.wounds < s.maxHealth
    );

    if (others.length === 0) {
      notificationManager.show({ variant: 'warning', message: es.hud.toast.noBornLeaderTarget, duration: 3000 });
      return;
    }

    if (others.length === 1) {
      networkManager.sendAction({
        playerId: this.localPlayerId, survivorId: survivor.id,
        type: ActionType.BORN_LEADER, payload: { targetSurvivorId: others[0].id },
      });
      return;
    }

    modalManager.open({
      title: es.modals.bornLeader.title,
      size: 'sm',
      renderBody: () => `
        <div class="stack stack--sm">
          ${others.map(t => {
            const identity = getPlayerIdentity(this.state!, t.playerId);
            const avatar = renderAvatar(displayName(t.name, t.characterClass), identity, 'md', undefined, t.characterClass);
            return `
              <button class="action-btn" data-action="select-bl-target" data-id="${t.id}" style="width:100%">
                ${avatar}
                <span class="action-btn__label">${escapeHtml(displayNameWithClass(t.name, t.characterClass))}</span>
              </button>`;
          }).join('')}
        </div>`,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const t = (e.target as HTMLElement).closest('[data-action="select-bl-target"]') as HTMLElement | null;
          if (t) {
            const targetId = t.dataset.id;
            if (targetId) {
              networkManager.sendAction({
                playerId: this.localPlayerId, survivorId: survivor.id,
                type: ActionType.BORN_LEADER, payload: { targetSurvivorId: targetId },
              });
              modalManager.closeAll();
            }
          }
        });
      },
    });
  }

  // ─── Game Over ───────────────────────────────────────────────

  private renderGameOver(): void {
    const isVictory = this.state?.gameResult === GameResult.Victory;
    const isHost = this.isHost();
    const abandonedBy = this.state?.abandonedBy;

    const resultIcon = isVictory ? 'Trophy' : 'Skull';
    const resultClass = isVictory ? 'victory' : 'defeat';
    const resultText = isVictory ? es.gameOver.victory : abandonedBy ? es.gameOver.abandoned : es.gameOver.defeat;
    const desc = isVictory
      ? es.gameOver.victoryDesc
      : abandonedBy
        ? es.gameOver.abandonedDesc(escapeHtml(abandonedBy))
        : es.gameOver.defeatDesc;

    // Leaving is offered to everyone: without it a non-host whose host closed
    // their tab has no way out but closing their own.
    const leaveBtn = renderButton({ label: es.gameOver.leave, icon: 'ArrowLeft', variant: 'ghost', dataAction: 'leave-room' });
    const actions = isHost
      ? `${renderButton({ label: es.gameOver.playAgain, icon: 'Play', variant: 'primary', size: 'lg', dataAction: 'play-again' })}${leaveBtn}`
      : `<span class="text-secondary-sm">${es.gameOver.waitingHost}</span>${leaveBtn}`;

    this.container.innerHTML = `
      <div class="hud-game-over">
        <div class="hud-game-over__card">
          <span class="hud-game-over__icon hud-game-over__icon--${resultClass}">${icon(resultIcon, 'xl')}</span>
          <h1 class="hud-game-over__title hud-game-over__title--${resultClass}">${resultText}</h1>
          <p class="hud-game-over__desc">${desc}</p>
          <div class="hud-game-over__actions">
            ${actions}
          </div>
        </div>
      </div>`;
  }

  // ─── Modals ──────────────────────────────────────────────────

  private openBackpack(): void {
    const survivor = this.currentBackpackSurvivor();
    if (!survivor) return;

    if (this.backpackModalId && modalManager.isOpen(this.backpackModalId)) {
      modalManager.close(this.backpackModalId);
      this.backpackModalId = null;
      return;
    }

    this.backpackModalId = modalManager.open({
      title: this.backpackTitle(survivor),
      size: 'md',
      renderBody: () => {
        const current = this.currentBackpackSurvivor() ?? survivor;
        return this.renderBackpackBody(current);
      },
      renderFooter: () => renderButton({ label: es.common.close, variant: 'secondary', dataAction: 'modal-close' }),
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
          const cardId = btn?.dataset.id;
          if (!cardId) return;
          if (btn!.dataset.action === 'use-food') this.requestFoodConsume(cardId);
          else if (btn!.dataset.action === 'discard-item') this.requestDiscard(cardId);
        });
      },
      onClose: () => { this.backpackModalId = null; },
    });
  }

  private static readonly BAG_CAPACITY = 3;

  private currentBackpackSurvivor(): Survivor | null {
    return this.selectedSurvivorId && this.state ? this.state.survivors[this.selectedSurvivorId] ?? null : null;
  }

  private renderBackpackBody(survivor: Survivor): string {
    const bagItems = survivor.inventory.filter(c => !c.inHand);
    const emptyCount = Math.max(0, GameHUD.BAG_CAPACITY - bagItems.length);

    return `<div class="grid grid--2 gap-2">
      ${bagItems.map(item => {
        const isFood = FOOD_EQUIPMENT_IDS.has(item.equipmentId);
        const eatTitle = escapeHtml(es.modals.food.eatTitle(equipmentName(item)));
        const discardTitle = escapeHtml(es.hud.discardItem(equipmentName(item)));
        // Discarding is free and allowed at any time, so the chip is always
        // there — no turn or action-point gating.
        return `
          <div class="food-slot ${isFood ? 'food-slot--with-eat' : ''}">
            ${renderItemCard(item)}
            <div class="food-slot__actions">
              ${isFood ? `
                <button type="button"
                        class="food-slot__eat"
                        data-action="use-food"
                        data-id="${item.id}"
                        title="${eatTitle}"
                        aria-label="${eatTitle}">
                  ${icon('Utensils', 'sm')}
                  <span class="food-slot__eat-label">${es.modals.food.eatLabel}</span>
                </button>` : ''}
              <button type="button"
                      class="food-slot__eat food-slot__eat--danger"
                      data-action="discard-item"
                      data-id="${item.id}"
                      title="${discardTitle}"
                      aria-label="${discardTitle}">
                ${icon('Trash2', 'sm')}
              </button>
            </div>
          </div>`;
      }).join('')}
      ${renderEmptySlotsCounter(emptyCount)}
    </div>`;
  }

  private backpackTitle(survivor: Survivor): string {
    return es.modals.backpack.title(survivor.inventory.filter(c => !c.inHand).length, GameHUD.BAG_CAPACITY);
  }

  private refreshBackpackModal(): void {
    if (!this.backpackModalId || !modalManager.isOpen(this.backpackModalId)) return;
    const survivor = this.currentBackpackSurvivor();
    if (!survivor) return;
    modalManager.updateBody(this.backpackModalId, this.renderBackpackBody(survivor));
    const el = modalManager.getElement(this.backpackModalId);
    const titleEl = el?.querySelector('.modal__title');
    if (titleEl) titleEl.textContent = this.backpackTitle(survivor);
  }

  /** Free discard from the bag — allowed on anyone's turn, so no gating here. */
  private requestDiscard(cardId: EntityId): void {
    const survivor = this.currentBackpackSurvivor();
    const card = survivor?.inventory.find(c => c.id === cardId);
    if (!survivor || !card) return;
    if (survivor.playerId !== this.localPlayerId) return;
    openDiscardConfirm(survivor, card);
  }

  /**
   * Eat-food click flow. Always prompts before consuming so the player can
   * back out, and surfaces a stronger warning when the consume would leave
   * a pending COLLECT_ITEMS objective unsatisfied.
   */
  private requestFoodConsume(cardId: EntityId): void {
    if (!this.state || !this.selectedSurvivorId) return;
    const survivor = this.state.survivors[this.selectedSurvivorId];
    if (!survivor) return;
    const card = survivor.inventory.find(c => c.id === cardId);
    if (!card) return;

    const wouldBreak = this.foodConsumptionWouldBreakObjective(card);
    this.openFoodConsumeConfirm(card, wouldBreak);
  }

  /**
   * Returns the objective description that consuming `card` would un-satisfy,
   * or null if no objective would be broken. Mirrors the server CollectItems
   * evaluator (living-survivors × inventory, match by equipmentId).
   */
  private foodConsumptionWouldBreakObjective(card: EquipmentCard): string | null {
    if (!this.state) return null;
    const objectives = this.state.objectives ?? [];
    const livingSurvivors = Object.values(this.state.survivors).filter(s => s.wounds < s.maxHealth);

    for (const obj of objectives) {
      if (obj.type !== ObjectiveType.CollectItems || obj.completed) continue;
      for (const req of obj.itemRequirements) {
        if (req.equipmentId !== card.equipmentId) continue;
        let total = 0;
        for (const s of livingSurvivors) {
          for (const c of s.inventory) {
            if (c.equipmentId === req.equipmentId) total += 1;
          }
        }
        // After consume the count drops by 1 — would the requirement still hold?
        if (total - 1 < req.quantity) {
          return obj.description || es.modals.food.collectFallback(req.quantity, equipmentName({ equipmentId: req.equipmentId, name: req.equipmentId }));
        }
      }
    }
    return null;
  }

  private openFoodConsumeConfirm(card: EquipmentCard, objectiveDescription: string | null): void {
    if (this.foodConfirmModalId && modalManager.isOpen(this.foodConfirmModalId)) return;

    const safeName = `<strong>${escapeHtml(equipmentName(card))}</strong>`;
    const body = objectiveDescription
      ? `
        <div class="stack stack--sm">
          <p class="text-secondary">${es.modals.food.breaksObjective(safeName)}</p>
          <p><em>${escapeHtml(objectiveDescription)}</em></p>
          <p class="text-secondary">${es.modals.food.findAnother}</p>
        </div>`
      : `
        <div class="stack stack--sm">
          <p class="text-secondary">${es.modals.food.consume(safeName, `<strong>${es.modals.food.bonus}</strong>`)}</p>
          <p class="text-secondary">${es.modals.food.discarded}</p>
        </div>`;

    const confirmLabel = objectiveDescription ? es.modals.food.confirmAnyway : es.modals.food.confirm;
    const confirmVariant: 'destructive' | 'primary' = objectiveDescription ? 'destructive' : 'primary';

    this.foodConfirmModalId = modalManager.open({
      title: es.modals.food.title,
      size: 'sm',
      renderBody: () => body,
      renderFooter: () => `
        ${renderButton({ label: es.common.cancel, variant: 'secondary', dataAction: 'modal-close' })}
        ${renderButton({ label: confirmLabel, variant: confirmVariant, dataAction: 'confirm-eat-food' })}
      `,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const t = (e.target as HTMLElement).closest('[data-action="confirm-eat-food"]');
          if (t) {
            modalManager.close(this.foodConfirmModalId!);
            this.dispatchFoodConsume(card);
          }
        });
      },
      onClose: () => { this.foodConfirmModalId = null; },
    });
  }

  private dispatchFoodConsume(card: EquipmentCard): void {
    // No optimistic toast — server's `lastAction.description` populates the
    // action feed on success, and the standard ERROR pipeline surfaces a red
    // alert on rejection. An optimistic toast would lie if the server says no.
    networkManager.sendAction({
      playerId: this.localPlayerId,
      survivorId: this.selectedSurvivorId!,
      type: ActionType.USE_ITEM,
      payload: { itemId: card.id },
    });
  }

  private openEndGameConfirm(): void {
    if (this.endGameModalId && modalManager.isOpen(this.endGameModalId)) return;

    this.endGameModalId = modalManager.open({
      title: es.modals.endGame.title,
      size: 'sm',
      renderBody: () => `<p class="text-secondary">${es.modals.endGame.body}</p>`,
      renderFooter: () => `
        ${renderButton({ label: es.common.cancel, variant: 'secondary', dataAction: 'modal-close' })}
        ${renderButton({ label: es.modals.endGame.confirm, variant: 'destructive', dataAction: 'confirm-end-game' })}
      `,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const t = (e.target as HTMLElement).closest('[data-action="confirm-end-game"]');
          if (t) {
            modalManager.close(this.endGameModalId!);
            networkManager.sendAction({ playerId: this.localPlayerId, type: ActionType.END_GAME });
          }
        });
      },
      onClose: () => { this.endGameModalId = null; },
    });
  }

  private openPauseMenu(): void {
    const isHost = this.isHost();
    const muteLabel = audioManager.muted ? es.modals.pause.unmute : es.modals.pause.mute;
    const muteIcon = audioManager.muted ? 'VolumeX' : 'Volume2';

    modalManager.open({
      size: 'sm',
      title: es.modals.pause.title,
      renderBody: () => `
        <div class="stack stack--sm">
          ${renderButton({ label: es.modals.pause.resume, icon: 'Play', variant: 'ghost', fullWidth: true, dataAction: 'modal-close' })}
          ${renderButton({ label: muteLabel, icon: muteIcon, variant: 'ghost', fullWidth: true, dataAction: 'toggle-mute' })}
          ${isHost ? renderButton({ label: es.modals.pause.endGame, icon: 'Power', variant: 'destructive', fullWidth: true, dataAction: 'pause-end-game' }) : ''}
          ${renderButton({ label: es.modals.pause.leave, icon: 'LogOut', variant: 'ghost', fullWidth: true, dataAction: 'pause-leave' })}
        </div>`,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
          if (!t) return;
          if (t.dataset.action === 'toggle-mute') {
            audioManager.toggleMute();
            modalManager.closeAll();
            this.render();
          }
          if (t.dataset.action === 'pause-end-game') {
            modalManager.closeAll();
            this.openEndGameConfirm();
          }
          if (t.dataset.action === 'pause-leave') {
            modalManager.closeAll();
            leaveRoom();
          }
        });
      },
    });
  }

  // ─── Event Log ───────────────────────────────────────────────

  public toggleLog(): void {
    if (this.logModalId && modalManager.isOpen(this.logModalId)) {
      modalManager.close(this.logModalId);
      this.logModalId = null;
      return;
    }
    if (!this.state) return;

    this.markLogSeen();
    this.logModalId = modalManager.open({
      title: es.modals.log.title,
      size: 'lg',
      renderBody: () => this.renderLogBody(),
      renderFooter: () => renderButton({ label: es.common.close, variant: 'secondary', dataAction: 'modal-close' }),
      onClose: () => { this.logModalId = null; },
    });
    this.render();
  }

  private markLogSeen(): void {
    const count = displayableEntries(this.state?.history).length;
    this.seenEntryCount = count;
    this.logRenderedCount = count;
  }

  /** Re-render the open log when entries arrive; the modal body keeps its scroll position. */
  private refreshLog(): void {
    if (!this.logModalId || !modalManager.isOpen(this.logModalId)) return;
    if (displayableEntries(this.state?.history).length === this.logRenderedCount) return;
    this.markLogSeen();
    modalManager.updateBody(this.logModalId, this.renderLogBody());
  }

  private renderLogBody(): string {
    const state = this.state;
    const rounds = groupByRound(displayableEntries(state?.history), state?.turn);
    if (!state || rounds.length === 0) return `<div class="text-center-muted">${es.modals.log.empty}</div>`;

    const playerName = (pid: string) => {
      const survivor = Object.values(state.survivors).find(s => s.playerId === pid);
      const cls = survivor?.characterClass;
      const lobbyName = state.lobby.players.find(p => p.id === pid)?.name;
      return displayName(lobbyName, cls) || displayName(survivor?.name, cls) || pid;
    };

    return `<div class="event-log">${rounds.map(round => `
      <div class="event-log__round">${es.modals.log.round(round.round)}${round.current ? `<span class="event-log__round-current">${es.modals.log.current}</span>` : ''}</div>
      ${round.turns.map(turn => `
        <div class="event-log__player">${escapeHtml(playerName(turn.playerId))}</div>
        ${turn.entries.map(entry => renderEventEntry(entry, state)).join('')}
      `).join('')}
    `).join('')}</div>`;
  }

  private renderLogButton(): string {
    const count = displayableEntries(this.state?.history).length;
    const unread = this.seenEntryCount !== null && count > this.seenEntryCount;
    return `<button class="hud-iconbtn hud-logbtn" data-action="open-log" title="${es.hud.logTitle}" aria-label="${unread ? es.hud.logAriaUnread : es.hud.logAria}">
      ${icon('ScrollText', 'sm')}${unread ? '<span class="hud-iconbtn__dot" aria-hidden="true"></span>' : ''}
    </button>`;
  }

  // ─── Turn signal ─────────────────────────────────────────────

  /** `Es tu turno · N acciones`, `Esperando a <nombre>` or `Fase de zombis`. */
  private renderTurnLine(isMyTurn: boolean, survivor: Survivor): string {
    const state = this.state!;
    if (state.phase === GamePhase.Zombies) {
      return `<span class="hud-turnline">${es.common.zombiePhase}</span>`;
    }
    if (isMyTurn) {
      const ap = survivor.cheatMode ? null : survivor.actionsRemaining;
      return `<span class="hud-turnline hud-turnline--mine">${es.hud.yourTurn(ap)}</span>`;
    }
    const activePid = state.players[state.activePlayerIndex];
    const active = Object.values(state.survivors).find(s => s.playerId === activePid);
    return `<span class="hud-turnline">${es.hud.waitingFor(escapeHtml(displayName(active?.name, active?.characterClass) || '…'))}</span>`;
  }

  // ─── Trade Logic ─────────────────────────────────────────────

  private handleTrade(activeSurvivor: Survivor): void {
    if (!this.state) return;
    const zoneId = activeSurvivor.position.zoneId;
    const others = Object.values(this.state.survivors).filter(
      s => s.position.zoneId === zoneId && s.id !== activeSurvivor.id && s.wounds < s.maxHealth
    );

    if (others.length === 0) {
      notificationManager.show({ variant: 'warning', message: es.hud.toast.noTradeTarget, duration: 3000 });
    } else if (others.length === 1) {
      networkManager.sendAction({
        playerId: this.localPlayerId, survivorId: activeSurvivor.id,
        type: ActionType.TRADE_START, payload: { targetSurvivorId: others[0].id },
      });
    } else {
      this.openPlayerSelectModal(activeSurvivor, others);
    }
  }

  private openPlayerSelectModal(initiator: Survivor, targets: Survivor[]): void {
    modalManager.open({
      title: es.modals.trade.title,
      size: 'sm',
      renderBody: () => `
        <div class="stack stack--sm">
          ${targets.map(t => {
            const identity = getPlayerIdentity(this.state!, t.playerId);
            const avatar = renderAvatar(displayName(t.name, t.characterClass), identity, 'md', undefined, t.characterClass);
            return `
              <button class="action-btn" data-action="select-trade-target" data-id="${t.id}" style="width:100%">
                ${avatar}
                <span class="action-btn__label">${escapeHtml(displayNameWithClass(t.name, t.characterClass))}</span>
              </button>`;
          }).join('')}
        </div>`,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const t = (e.target as HTMLElement).closest('[data-action="select-trade-target"]') as HTMLElement | null;
          if (t) {
            const targetId = t.dataset.id;
            if (targetId) {
              networkManager.sendAction({
                playerId: this.localPlayerId,
                survivorId: initiator.id,
                type: ActionType.TRADE_START,
                payload: { targetSurvivorId: targetId },
              });
              modalManager.closeAll();
            }
          }
        });
      },
    });
  }

  // ─── Trade & Pickup Sync ─────────────────────────────────────

  private syncTradeAndPickup(activeSurvivor: Survivor | null): void {
    if (!this.state) return;

    // Trade
    if (this.state.activeTrade) {
      const mySurvivors = Object.values(this.state.survivors).filter(s => s.playerId === this.localPlayerId);
      const myActive = mySurvivors.find(s =>
        s.id === this.state!.activeTrade!.activeSurvivorId ||
        s.id === this.state!.activeTrade!.targetSurvivorId
      );
      if (myActive) {
        this.tradeUI.sync(myActive, this.state.activeTrade, this.state);
      }
    } else {
      this.tradeUI.hide();
    }

    // Reorganize session
    const reorganizing = this.state.activeReorganize
      ? this.state.survivors[this.state.activeReorganize.survivorId]
      : undefined;
    if (reorganizing && reorganizing.playerId === this.localPlayerId) {
      this.reorganizeUI.sync(reorganizing);
    } else {
      this.reorganizeUI.hide();
    }

    // Pickup
    if (activeSurvivor && activeSurvivor.playerId === this.localPlayerId && activeSurvivor.drawnCard) {
      if (!this.pickupUI.isVisible() || this.pickupUI.currentSurvivorId !== activeSurvivor.id) {
        this.pickupUI.show(activeSurvivor);
      } else {
        this.pickupUI.update(activeSurvivor);
      }
    } else {
      this.pickupUI.hide();
    }
  }
}
