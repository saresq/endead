
import { GameState, PlayerId, EntityId, Survivor, GameResult } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { InputController } from '../InputController';
import { TradeUI } from './TradeUI';
import { PickupUI } from './PickupUI';
import { getPlayerIdentity } from '../config/PlayerIdentities';
import { audioManager } from '../AudioManager';
import { icon } from './components/icons';
import { renderAvatar } from './components/PlayerAvatar';
import { renderActionButton } from './components/ActionButton';
import { renderLastActionEntry, renderSpawnEntry, type SpawnCardData } from './components/EventEntry';
import { renderButton } from './components/Button';
import { renderItemCard, renderEmptySlotsCounter } from './components/ItemCard';
import { renderStatCell } from './components/StatCell';
import { renderSquadPlate, type SquadPlateRank } from './components/SquadPlate';
import { renderPhotoSlot } from './components/PhotoSlot';
import { modalManager } from './overlays/ModalManager';
import { notificationManager } from './NotificationManager';
import { formatZoneId, formatActionType } from '../utils/zoneFormat';
import { SKILL_DEFINITIONS } from '../../config/SkillRegistry';

/** Map Zombicide danger level → SquadPlate rank color. */
function dangerToRank(level: string): SquadPlateRank {
  switch ((level || '').toLowerCase()) {
    case 'yellow': return 'yellow';
    case 'orange': return 'orange';
    case 'red':    return 'red';
    default:       return 'blue';
  }
}

/** Color of the rank a survivor is progressing toward; max-rank survivors stay on their current color. */
function nextRankColor(level: string): SquadPlateRank {
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

/** Short OP callsign for squad plates (e.g. "P-01"). */
function callsignFor(_survivor: Survivor, idx: number): string {
  const n = String(idx + 1).padStart(2, '0');
  return `P-${n}`;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FEED_TTL_MS = 3000;

export class GameHUD {
  private container: HTMLElement;
  private inputController: InputController;
  private tradeUI: TradeUI;
  private pickupUI: PickupUI;
  private localPlayerId: PlayerId;
  private state: GameState | null = null;
  private selectedSurvivorId: EntityId | null = null;
  private backpackModalId: string | null = null;
  private endGameModalId: string | null = null;
  private historyModalId: string | null = null;
  private woundPickerModalId: string | null = null;
  private woundPickerSelected: Set<string> = new Set();
  private woundDistModalId: string | null = null;
  private woundDistAssignments: Record<string, number> = {};
  private dismissedFeedTimestamp: number | null = null;
  private feedAutoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private feedAutoDismissScheduledFor: number | null = null;
  private boundDelegateHandler: (e: Event) => void;
  private mobileActionsTrayOpen = false;
  // Stable shell elements — created once, updated per-section
  private elTopBar: HTMLDivElement | null = null;
  private elRailLeft: HTMLElement | null = null;
  private elRailRight: HTMLElement | null = null;
  private elFeed: HTMLDivElement | null = null;
  private elFab: HTMLDivElement | null = null;
  private shellBuilt = false;

  constructor(inputController: InputController, playerId: PlayerId) {
    this.inputController = inputController;
    this.localPlayerId = playerId;

    this.container = document.getElementById('game-hud') || document.createElement('div');
    if (!this.container.id) {
      this.container.id = 'game-hud';
      document.body.appendChild(this.container);
    }

    this.tradeUI = new TradeUI();
    this.pickupUI = new PickupUI();

    this.boundDelegateHandler = (e: Event) => this.handleDelegatedClick(e);
    this.container.addEventListener('click', this.boundDelegateHandler);

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
    this.scheduleFeedAutoDismiss();
    this.render();
  }

  public updateMode(_mode: string): void {
    this.render();
  }

  public destroy(): void {
    document.documentElement.removeAttribute('data-danger');
    this.container.removeEventListener('click', this.boundDelegateHandler);
    if (this.feedAutoDismissTimer) {
      clearTimeout(this.feedAutoDismissTimer);
      this.feedAutoDismissTimer = null;
    }
    this.container.innerHTML = '';
    this.shellBuilt = false;
  }

  /**
   * Event feed is short-lived — after ~6s the latest entry auto-dismisses so
   * the map stays unobstructed. Players can reopen full history via the Turn
   * chip.
   */
  private scheduleFeedAutoDismiss(): void {
    const latest = Math.max(
      this.state?.lastAction?.timestamp ?? 0,
      this.state?.spawnContext?.timestamp ?? 0,
    );
    if (latest <= 0) return;
    if (this.dismissedFeedTimestamp && latest <= this.dismissedFeedTimestamp) return;
    if (this.feedAutoDismissScheduledFor === latest) return;

    if (this.feedAutoDismissTimer) clearTimeout(this.feedAutoDismissTimer);
    this.feedAutoDismissScheduledFor = latest;

    const elapsed = Math.max(0, Date.now() - latest);
    const delay = Math.max(0, FEED_TTL_MS - elapsed);

    this.feedAutoDismissTimer = setTimeout(() => {
      this.dismissedFeedTimestamp = latest;
      this.feedAutoDismissTimer = null;
      this.feedAutoDismissScheduledFor = null;
      this.render();
    }, delay);
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

    // --- Mobile actions tray toggle / dismiss ---
    if (action === 'toggle-actions-tray') {
      this.setMobileActionsTrayOpen(!this.mobileActionsTrayOpen);
      return;
    }
    if (this.mobileActionsTrayOpen) {
      const insideTray = !!target.closest('.hud-actions__tray');
      const onMore = !!target.closest('.hud-actions__more');
      if (!onMore) {
        // Close after any other click — selection inside the tray closes it,
        // taps outside also close it. Action handlers below still run.
        this.setMobileActionsTrayOpen(false);
        if (!insideTray && !closestButton) return;
      }
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
    if (action === 'open-history') {
      this.openHistoryModal();
      return;
    }

    // --- Feed dismiss ---
    if (action === 'dismiss-feed') {
      const ts = this.state?.lastAction?.timestamp || this.state?.spawnContext?.timestamp || Date.now();
      this.dismissedFeedTimestamp = ts;
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
        notificationManager.show({ variant: 'warning', message: 'Not your turn.', duration: 2500 });
        return;
      }
      if (noAPNow && !freeCombatAvailNow) {
        notificationManager.show({ variant: 'warning', message: 'No actions remaining.', duration: 2500 });
        return;
      }
      this.inputController.setMode('ATTACK', weaponId);
      notificationManager.show({ variant: 'info', message: 'Select a Zone to Attack!', duration: 5000 });
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
    if (id === 'btn-door') {
      audioManager.playSFX('button_click');
      this.inputController.setMode('OPEN_DOOR');
      notificationManager.show({ variant: 'info', message: 'Select a CLOSED DOOR zone to open it.', duration: 5000 });
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
    if (id === 'btn-end-turn') {
      networkManager.sendAction({ playerId: this.localPlayerId, survivorId: activeSurvivor.id, type: ActionType.END_TURN });
      return;
    }

    // --- Skill action buttons ---
    if (id === 'btn-sprint') {
      this.inputController.setMode('SPRINT');
      notificationManager.show({ variant: 'info', message: 'Select a zone to Sprint to (up to 3 zones).', duration: 5000 });
      return;
    }
    if (id === 'btn-charge') {
      this.inputController.setMode('CHARGE');
      notificationManager.show({ variant: 'info', message: 'Select a zone with zombies to Charge into (up to 2 zones).', duration: 5000 });
      return;
    }
    if (id === 'btn-born-leader') {
      this.openBornLeaderPicker(activeSurvivor);
      return;
    }
    if (id === 'btn-bloodlust') {
      this.inputController.setMode('BLOODLUST_MELEE');
      notificationManager.show({ variant: 'info', message: 'Select a zone with zombies (up to 2 zones away).', duration: 5000 });
      return;
    }
    if (id === 'btn-lifesaver') {
      this.inputController.setMode('LIFESAVER');
      notificationManager.show({ variant: 'info', message: 'Select a zone at Range 1 with zombies and survivors.', duration: 5000 });
      return;
    }

  }

  // ─── Rendering shell — Field Manual three-column grid ───────

  private buildShell(): void {
    if (this.shellBuilt) return;
    this.container.innerHTML = '';

    this.elTopBar = document.createElement('div');
    this.elTopBar.className = 'hud-topbar';

    this.elRailLeft = document.createElement('aside');
    this.elRailLeft.className = 'hud-rail hud-rail--left';

    // Center column holds: feed overlay + action row at the bottom.
    // The map "window" inside it is transparent so the PIXI canvas (mounted in #app) shows through.
    const center = document.createElement('div');
    center.className = 'hud-center';

    this.elFeed = document.createElement('div');
    this.elFeed.className = 'hud-feed-slot';

    const mapWindow = document.createElement('div');
    mapWindow.className = 'hud-map-window fm-brackets';
    mapWindow.innerHTML = '<span class="fm-bracket-tr"></span><span class="fm-bracket-bl"></span>';

    center.append(this.elFeed, mapWindow);

    this.elRailRight = document.createElement('aside');
    this.elRailRight.className = 'hud-rail hud-rail--right fm-brackets fm-brackets--amber';

    this.elFab = document.createElement('div');
    this.elFab.className = 'hud-fab-slot';

    this.container.append(
      this.elTopBar,
      this.elRailLeft,
      center,
      this.elRailRight,
      this.elFab,
    );
    this.shellBuilt = true;
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

    this.elTopBar!.innerHTML = this.renderTopBar(isMyTurn);
    this.elRailLeft!.innerHTML = this.renderSquadRail();
    this.elRailRight!.innerHTML = activeSurvivor && activeSurvivor.playerId === this.localPlayerId
      ? this.renderRightPanel(activeSurvivor, isMyTurn)
      : '<span class="fm-bracket-tr"></span><span class="fm-bracket-bl"></span>';

    this.elFeed!.innerHTML = this.renderFeed();
    this.elFab!.innerHTML = '';

    this.syncTradeAndPickup(activeSurvivor);

    // Auto-open wound distribution modal if there are pending zombie wounds (host only)
    const isHost = this.state?.players[0] === this.localPlayerId;
    if (isHost && this.state?.pendingZombieWounds && this.state.pendingZombieWounds.length > 0
        && !this.woundDistModalId) {
      this.openWoundDistribution(this.state.pendingZombieWounds[0]);
    }

    // Auto-open wound picker if survivor has pending wounds
    if (activeSurvivor && activeSurvivor.pendingWounds && activeSurvivor.pendingWounds > 0
        && activeSurvivor.playerId === this.localPlayerId
        && !this.woundPickerModalId && !this.woundDistModalId) {
      this.openWoundPicker(activeSurvivor);
    }
  }

  // ─── Top phase bar ──────────────────────────────────────────

  private renderTopBar(isMyTurn: boolean): string {
    const state = this.state!;
    const activePid = state.players[state.activePlayerIndex];
    const activeSurvivor = Object.values(state.survivors).find(s => s.playerId === activePid);
    const activeName = activeSurvivor?.name ?? '';

    const phaseRaw = (state.phase || '').toUpperCase();
    const isPlayerPhase = phaseRaw.includes('PLAYER') || phaseRaw === 'SURVIVOR';
    const isZombiePhase = phaseRaw.includes('ZOMBIE');
    const isEndPhase    = phaseRaw.includes('END');

    const channel = this.channelTag(state);
    const myTurnClass = isMyTurn ? ' hud-topbar--my-turn' : '';
    const dangerClass = ` hud-topbar--danger-${state.currentDangerLevel.toLowerCase()}`;

    const currentPhaseLabel = isZombiePhase
      ? 'ZOMBIE'
      : isEndPhase
        ? 'END'
        : `PLAYER${activeName ? ' · ' + escapeHtml(activeName.toUpperCase()) : ''}`;

    const tick = (active: boolean) =>
      `<span class="hud-phasetick${active ? ' hud-phasetick--current' : ''}" aria-hidden="true"></span>`;

    return `
      <div class="hud-topbar__inner${myTurnClass}${dangerClass}">
        <div class="hud-topbar__left">
          <button class="hud-turnchip" data-action="open-history" title="View turn history" aria-label="Turn ${state.turn} — click to view history">
            <span class="hud-turnchip__label">TURN</span>
            <span class="hud-turnchip__value">${String(state.turn).padStart(2, '0')}</span>
          </button>
          <div class="hud-phaseindicator" role="status" aria-live="polite" aria-label="Current phase: ${currentPhaseLabel}">
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
          <span class="hud-channel">CH ${channel}</span>
          <button id="btn-menu" class="hud-iconbtn" data-action="open-menu" title="Menu" aria-label="Menu">${icon('Menu', 'sm')}</button>
        </div>
        <div class="hud-topbar__bar"></div>
      </div>`;
  }

  private channelTag(state: GameState): string {
    // Stable 6-char alphanumeric channel derived from turn + active player.
    const seed = `${state.turn}-${state.players[state.activePlayerIndex] || ''}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += alphabet[h % alphabet.length];
      h = Math.floor(h / alphabet.length) + (i * 7);
    }
    return out;
  }

  // ─── Squad rail ─────────────────────────────────────────────

  private renderSquadRail(): string {
    if (!this.state) return '';
    const players = this.state.players;
    const survivorsByPlayer: Survivor[] = [];
    for (const pid of players) {
      const s = Object.values(this.state.survivors).find(sv => sv.playerId === pid);
      if (s) survivorsByPlayer.push(s);
    }

    const focusedId = this.selectedSurvivorId;
    const plates = survivorsByPlayer.map((s, idx) => {
      const active = s.id === focusedId;
      const playerColor = getPlayerIdentity(this.state!, s.playerId).primary;
      const isLocal = s.playerId === this.localPlayerId;
      return renderSquadPlate({
        name: s.name,
        rank: dangerToRank(s.dangerLevel),
        playerColor,
        hp: Math.max(0, s.maxHealth - s.wounds),
        hpMax: s.maxHealth,
        actions: s.actionsRemaining,
        actionsMax: s.actionsPerTurn,
        active,
        compact: true,
        callsign: callsignFor(s, idx),
        selectId: isLocal ? s.id : undefined,
      });
    }).join('');

    const kicker = `<div class="fm-kicker fm-kicker--secondary hud-rail__kicker">SQUAD · ${survivorsByPlayer.length}</div>`;
    return `${kicker}<div class="hud-rail__list">${plates}</div>`;
  }

  // ─── Feed (center overlay) ──────────────────────────────────

  private renderFeed(): string {
    if (!this.state) return '';

    const lastActionTs = this.state.lastAction?.timestamp ?? 0;
    const spawnTs = this.state.spawnContext?.timestamp ?? 0;
    const feedTimestamp = Math.max(lastActionTs, spawnTs);
    if (feedTimestamp <= 0) return '';
    if (this.dismissedFeedTimestamp && feedTimestamp <= this.dismissedFeedTimestamp) {
      return '';
    }

    // Only the most recent event renders — once a player acts after a zombie
    // spawn, the older spawnContext must not re-display alongside the new action.
    const showLastAction = !!this.state.lastAction && lastActionTs >= spawnTs;
    const showSpawn = !!this.state.spawnContext?.cards?.length && spawnTs > lastActionTs;

    const lastAction = showLastAction ? renderLastActionEntry(this.state.lastAction!) : '';
    const spawnInfo = showSpawn
      ? renderSpawnEntry(this.state.spawnContext!.cards as SpawnCardData[])
      : '';

    if (!lastAction && !spawnInfo) return '';

    const dismissBtn = `<button class="btn btn--icon btn--sm hud-feed__dismiss" data-action="dismiss-feed" title="Dismiss">${icon('X', 'sm')}</button>`;
    const luckyBtn = this.renderLuckyRerollButton();

    // Countdown bar — uses negative animation-delay so the visual is in sync
    // with actual elapsed time across re-renders (state updates re-create the
    // DOM, which would otherwise restart the animation).
    const elapsed = Math.max(0, Date.now() - feedTimestamp);
    const timerStyle = `animation-duration:${FEED_TTL_MS}ms;animation-delay:-${elapsed}ms;`;
    const timerBar = `<div class="hud-feed__timer" aria-hidden="true"><div class="hud-feed__timer-bar" style="${timerStyle}"></div></div>`;

    return `<div class="hud-feed"><div class="hud-feed__section">${dismissBtn}${lastAction}${luckyBtn}${spawnInfo}${timerBar}</div></div>`;
  }

  /**
   * Lucky reroll affordance — surfaces a button in the feed when:
   * - local survivor owns the last ATTACK action,
   * - Lucky skill is unspent this turn,
   * - the attack carried a rollback snapshot.
   */
  private renderLuckyRerollButton(): string {
    const state = this.state;
    if (!state || !state.lastAction) return '';
    const last = state.lastAction;
    if (last.type !== ActionType.ATTACK) return '';
    if (last.playerId !== this.localPlayerId) return '';
    if (!last.survivorId) return '';
    const survivor = state.survivors[last.survivorId];
    if (!survivor) return '';
    if (!survivor.skills.includes('lucky')) return '';
    if (survivor.luckyUsedThisTurn) return '';
    if (!last.rollbackSnapshot) return '';
    return `<button class="action-btn action-btn--lucky" data-action="reroll-lucky" title="Reroll dice (Lucky — commits to new result even if worse)">
      ${icon('Dices', 'sm')} Reroll (Lucky)
    </button>`;
  }

  // ─── Center action row ──────────────────────────────────────

  private setMobileActionsTrayOpen(open: boolean): void {
    this.mobileActionsTrayOpen = open;
    const tray = this.container.querySelector('.hud-actions__tray') as HTMLElement | null;
    const moreBtn = this.container.querySelector('.hud-actions__more') as HTMLElement | null;
    if (tray) tray.dataset.open = open ? 'true' : 'false';
    if (moreBtn) {
      moreBtn.classList.toggle('hud-actions__more--open', open);
      moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  private renderActionRow(survivor: Survivor, isMyTurn: boolean): string {
    const canOpenDoor = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
    const currentZone = this.state?.zones[survivor.position.zoneId];
    const canTakeObjective = currentZone?.hasObjective === true;
    const noAP = survivor.actionsRemaining < 1;
    const skillActions = this.renderSkillActionButtons(survivor, isMyTurn, noAP);

    const objectiveBtn = (idSuffix: string) => renderActionButton({
      id: `btn-objective${idSuffix}`,
      icon: 'Target', label: 'Objective', kbd: 'O', cost: '1 AP',
      disabled: !isMyTurn || noAP || !canTakeObjective,
      highlight: canTakeObjective && isMyTurn && !noAP,
    });
    const tradeBtn = (idSuffix: string) => renderActionButton({
      id: `btn-trade${idSuffix}`,
      icon: 'Handshake', label: 'Trade', kbd: 'T', cost: '1 AP',
      disabled: !isMyTurn || noAP,
    });

    const trayOpen = this.mobileActionsTrayOpen;

    const moreButton = `
      <button class="action-btn hud-actions__more${trayOpen ? ' hud-actions__more--open' : ''}"
        data-action="toggle-actions-tray"
        aria-haspopup="menu"
        aria-expanded="${trayOpen ? 'true' : 'false'}"
        aria-label="More actions">
        <span class="action-btn__icon">${icon('MoreHorizontal', 'sm')}</span>
        <span class="action-btn__label">More</span>
        <span class="action-btn__spacer"></span>
      </button>`;

    const tray = `
      <div class="hud-actions__tray" data-open="${trayOpen ? 'true' : 'false'}" role="menu" aria-label="More actions">
        ${objectiveBtn('-mobile')}
        ${tradeBtn('-mobile')}
      </div>`;

    return `
      <div class="hud-actions">
        <div class="hud-actions__grid">
          ${renderActionButton({ id: 'btn-search', icon: 'Search', label: 'Search', kbd: 'S', cost: survivor.freeSearchesRemaining > 0 ? 'FREE' : '1 AP', disabled: !isMyTurn || survivor.hasSearched || (noAP && survivor.freeSearchesRemaining <= 0) })}
          ${renderActionButton({ id: 'btn-noise', icon: 'Volume2', label: 'Noise', kbd: 'N', cost: '1 AP', disabled: !isMyTurn || noAP })}
          ${renderActionButton({ id: 'btn-door', icon: 'DoorOpen', label: 'Door', kbd: 'D', cost: '1 AP', disabled: !isMyTurn || noAP || !canOpenDoor })}
          ${objectiveBtn('')}
          ${tradeBtn('')}
          ${renderActionButton({ id: 'btn-end-turn', icon: 'SkipForward', label: 'End Turn', kbd: 'E', disabled: !isMyTurn })}
        </div>
        ${moreButton}
        ${skillActions}
        ${tray}
      </div>`;
  }

  // ─── Right panel — active op readout + loadout + field log ──

  private renderRightPanel(survivor: Survivor, isMyTurn: boolean): string {
    const identity = getPlayerIdentity(this.state!, survivor.playerId);
    const idx = Math.max(0, this.state!.players.indexOf(survivor.playerId));

    const hp = Math.max(0, survivor.maxHealth - survivor.wounds);
    const weapons = survivor.inventory.filter(c => c.type === 'WEAPON' && c.inHand);
    const noAP = survivor.actionsRemaining < 1;
    const weaponBoosts = this.getWeaponBoosts(survivor);

    // Active Op card — photo slot + name + rank chip + callsign
    const rankLabel = this.rankLabel(survivor.dangerLevel);
    const avatarUrl = (identity as { avatarUrl?: string } | undefined)?.avatarUrl
      ?? (survivor.characterClass ? `/images/characters/${survivor.characterClass.toLowerCase()}.webp` : undefined);
    const photo = renderPhotoSlot({ size: 'sm', imageUrl: avatarUrl });

    const xpBar = this.renderXpBar(survivor);
    const skillBadges = this.renderSkillBadges(survivor);
    const freeActionIndicators = this.renderFreeActionIndicators(survivor);
    const tagRow = (skillBadges || freeActionIndicators)
      ? `<div class="hud-op__tags">${freeActionIndicators}${skillBadges}</div>`
      : '';

    // Compact op card — single row header (photo + identity left, callsign
    // right) then a horizontal stats row (VITALS · ACTIONS · XP) underneath.
    const opCard = `
      <div class="hud-op">
        <div class="hud-op__head">
          <div class="hud-op__head-left">
            ${photo}
            <div class="hud-op__ident">
              <div class="hud-op__nameline">
                <span class="hud-op__name">${escapeHtml(survivor.name)}</span>
                <span class="hud-op__rankchip hud-op__rankchip--${dangerToRank(survivor.dangerLevel)}">${rankLabel}</span>
              </div>
              ${tagRow}
            </div>
          </div>
          <div class="hud-op__head-right">
            <span class="hud-op__sub">POINT · ${escapeHtml(callsignFor(survivor, idx))}</span>
          </div>
        </div>
        <div class="hud-op__stats">
          ${renderStatCell({ icon: icon('Heart', 'sm'), label: 'VITALS', value: hp, max: survivor.maxHealth, color: 'danger', size: 'sm' })}
          ${renderStatCell({ icon: icon('Zap', 'sm'), label: 'ACTIONS', value: survivor.actionsRemaining, max: survivor.actionsPerTurn, color: 'amber', size: 'sm' })}
          ${xpBar}
        </div>
      </div>`;

    // Loadout — weapons + backpack
    const rHand = weapons[0];
    const lHand = weapons[1];
    const freeCombatAvail = survivor.freeCombatsRemaining > 0 || survivor.freeMeleeRemaining > 0 || survivor.freeRangedRemaining > 0;
    const attackDisabled = !isMyTurn || (noAP && !freeCombatAvail);

    const weaponSlot = (w: typeof rHand, slotLabel: string) => {
      if (!w) {
        return `<div class="hud-slot hud-slot--empty" aria-label="${slotLabel} empty">
          <div class="hud-slot__empty">— EMPTY —</div>
        </div>`;
      }
      const boosts = weaponBoosts.get(w.id) || { dice: 0, damage: 0 };
      const isActive = this.inputController.mode === 'ATTACK' && this.inputController.weaponId === w.id;
      const classes = [
        'hud-weapon-btn',
        isActive ? 'hud-weapon-btn--active' : '',
        attackDisabled ? 'hud-weapon-btn--locked' : '',
      ].filter(Boolean).join(' ');
      return `<div class="hud-slot hud-slot--weapon" aria-label="${slotLabel}">
        <button class="${classes}" data-id="${escapeHtml(w.id)}"${attackDisabled ? ' aria-disabled="true"' : ''}>
          ${renderItemCard(w, { variant: 'weapon', showSlot: false, bonusDice: boosts.dice, bonusDamage: boosts.damage })}
        </button>
      </div>`;
    };

    const bagItems = survivor.inventory.filter(c => !c.inHand);
    const bagSlot = `
      <div class="hud-slot hud-slot--bag">
        <button class="hud-bag-button" data-action="open-backpack" title="Open backpack" aria-label="Open backpack (${bagItems.length} item${bagItems.length === 1 ? '' : 's'})">
          <span class="hud-bag-button__icon">${icon('Backpack', 'md')}</span>
          <span class="hud-bag-button__label">BAG</span>
          ${bagItems.length > 0 ? `<span class="hud-bag-button__badge">${bagItems.length}</span>` : ''}
        </button>
      </div>`;

    const loadout = `
      <section class="hud-loadout">
        <div class="fm-kicker fm-kicker--secondary hud-loadout__kicker">LOADOUT</div>
        <div class="hud-loadout__grid">
          ${weaponSlot(rHand, 'R.HAND')}
          ${weaponSlot(lHand, 'L.HAND')}
          ${bagSlot}
        </div>
      </section>`;

    // Skills/free actions kept as inline row above field log.
    const woundAlert = survivor.pendingWounds && survivor.pendingWounds > 0
      ? `<button class="hud-wound-alert" data-action="resolve-wounds">
          ${icon('AlertTriangle', 'sm')}
          <span>${survivor.pendingWounds} pending wound${survivor.pendingWounds > 1 ? 's' : ''} — tap to resolve</span>
        </button>`
      : '';

    const fieldLog = this.renderFieldLog();

    const actionRow = this.renderActionRow(survivor, isMyTurn);

    return `
      <span class="fm-bracket-tr"></span><span class="fm-bracket-bl"></span>
      <div class="hud-rail__body">
        ${opCard}
        ${actionRow}
        ${loadout}
        ${woundAlert}
        ${fieldLog}
      </div>`;
  }

  private rankLabel(dangerLevel: string): string {
    const rank = dangerToRank(dangerLevel);
    return ({ blue: 'ROOKIE', yellow: 'VETERAN', orange: 'ELITE', red: 'HERO' } as const)[rank];
  }

  // ─── Field Log — condensed turn history for right panel ─────

  private renderFieldLog(): string {
    if (!this.state) return '';
    const entries = [...this.state.history]
      .filter(e =>
        e.actionType !== 'JOIN_LOBBY' && e.actionType !== 'START_GAME'
        && e.actionType !== 'RESOLVE_SEARCH' && e.actionType !== 'CHOOSE_SKILL'
        && e.actionType !== 'KICK_PLAYER' && e.actionType !== 'DISCONNECT'
      )
      .slice(-14)
      .reverse();

    const lines = entries.map(e => {
      const ts = this.formatTs(e.timestamp || 0);
      const survivor = e.survivorId && e.survivorId !== 'system' ? this.state!.survivors[e.survivorId] : null;
      const name = survivor?.name ?? 'SYSTEM';
      const label = formatActionType(e.actionType);
      let detail = '';
      if (e.description) detail = e.description;
      else if (e.payload?.targetZoneId) detail = `→ ${formatZoneId(e.payload.targetZoneId, this.state!)}`;
      return `<div class="hud-log__line">
        <span class="hud-log__ts">${escapeHtml(ts)}</span>
        <span class="hud-log__actor">${escapeHtml(name)}</span>
        <span class="hud-log__action">${escapeHtml(label)}</span>
        ${detail ? `<span class="hud-log__detail">${escapeHtml(detail)}</span>` : ''}
      </div>`;
    }).join('');

    const body = lines || `<div class="hud-log__empty">// AWAITING CONTACT</div>`;

    return `
      <section class="hud-log">
        <div class="fm-kicker fm-kicker--secondary hud-log__kicker">FIELD LOG</div>
        <div class="hud-log__body">${body}</div>
      </section>`;
  }

  private formatTs(ts: number): string {
    if (!ts) return '--:--';
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
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
      else if (skillId === 'tough') used = survivor.toughUsedZombieAttack && survivor.toughUsedFriendlyFire;

      const typeClass = def.type === 'PASSIVE' ? 'passive' : def.type === 'ACTION' ? 'action' : 'stat-mod';
      const usedClass = used ? ' skill-badge--used' : '';
      const skillIcon = icon(iconForSkill(skillId), 'sm');

      return `<span class="skill-badge skill-badge--${typeClass}${usedClass}" title="${escapeHtml(def.description)}">${skillIcon}<span>${escapeHtml(def.name)}</span></span>`;
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
            <span class="hud-op__xp-label">XP</span>
            <span class="hud-op__xp-value">${xp} · MAX</span>
          </div>
          <div class="hud-op__xp-track" role="progressbar" aria-valuenow="${xp}" aria-valuemin="0" aria-valuemax="${xp}">
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
          <span class="hud-op__xp-label">XP</span>
          <span class="hud-op__xp-value">${xp} → ${next}</span>
        </div>
        <div class="hud-op__xp-track" role="progressbar" aria-label="Experience" aria-valuenow="${xp}" aria-valuemin="${current}" aria-valuemax="${next}">
          <div class="hud-op__xp-fill hud-op__xp-fill--${fillRank}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  private renderFreeActionIndicators(survivor: Survivor): string {
    const indicators: string[] = [];

    if (survivor.freeMovesRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="Free Move">${icon('Footprints', 'sm')}<span class="free-action-pip__count">${survivor.freeMovesRemaining}</span></span>`);
    }
    if (survivor.freeCombatsRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="Free Combat">${icon('Crosshair', 'sm')}<span class="free-action-pip__count">${survivor.freeCombatsRemaining}</span></span>`);
    }
    if (survivor.freeMeleeRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="Free Melee">${icon('Swords', 'sm')}<span class="free-action-pip__count">${survivor.freeMeleeRemaining}</span></span>`);
    }
    if (survivor.freeRangedRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="Free Ranged">${icon('Crosshair', 'sm')}<span class="free-action-pip__count">${survivor.freeRangedRemaining}</span></span>`);
    }
    if (survivor.freeSearchesRemaining > 0) {
      indicators.push(`<span class="free-action-pip" title="Free Search">${icon('Search', 'sm')}<span class="free-action-pip__count">${survivor.freeSearchesRemaining}</span></span>`);
    }

    if (indicators.length === 0) return '';
    return `<div class="hud-free-actions">${indicators.join('')}</div>`;
  }

  private renderSkillActionButtons(survivor: Survivor, isMyTurn: boolean, noAP: boolean): string {
    const buttons: string[] = [];

    if (survivor.skills.includes('sprint')) {
      buttons.push(renderActionButton({
        id: 'btn-sprint', icon: 'Zap', label: 'Sprint',
        cost: '1 AP', disabled: !isMyTurn || noAP || survivor.sprintUsedThisTurn,
      }));
    }
    if (survivor.skills.includes('charge')) {
      buttons.push(renderActionButton({
        id: 'btn-charge', icon: 'Swords', label: 'Charge',
        cost: 'FREE', disabled: !isMyTurn || survivor.chargeUsedThisTurn,
      }));
    }
    if (survivor.skills.includes('born_leader')) {
      buttons.push(renderActionButton({
        id: 'btn-born-leader', icon: 'Crown', label: 'Born Leader',
        cost: 'FREE', disabled: !isMyTurn || survivor.bornLeaderUsedThisTurn,
      }));
    }
    if (survivor.skills.includes('bloodlust_melee')) {
      buttons.push(renderActionButton({
        id: 'btn-bloodlust', icon: 'Flame', label: 'Bloodlust',
        cost: '1 AP', disabled: !isMyTurn || noAP || survivor.bloodlustUsedThisTurn,
      }));
    }
    if (survivor.skills.includes('lifesaver')) {
      buttons.push(renderActionButton({
        id: 'btn-lifesaver', icon: 'HeartHandshake', label: 'Lifesaver',
        cost: 'FREE', disabled: !isMyTurn || survivor.lifesaverUsedThisTurn,
      }));
    }

    if (buttons.length === 0) return '';
    return `<div class="hud-actions__skills">${buttons.join('')}</div>`;
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

      if (isMelee && survivor.skills.includes('plus_1_die_melee')) bonusDice++;
      if (isRanged && survivor.skills.includes('plus_1_die_ranged')) bonusDice++;
      if (survivor.skills.includes('plus_1_die_combat')) bonusDice++;
      if (isMelee && survivor.skills.includes('plus_1_damage_melee')) bonusDamage++;
      if (isRanged && survivor.skills.includes('plus_1_damage_ranged')) bonusDamage++;
      if (survivor.skills.includes('plus_1_damage_combat')) bonusDamage++;
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
      title: `Is That All You've Got?`,
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
    const desc = `<p class="text-secondary mb-3">You have <strong>${pendingCount}</strong> incoming wound${pendingCount > 1 ? 's' : ''}. Discard equipment to negate wounds (1 card = 1 wound negated).</p>`;
    const summary = `<div class="wound-picker__summary">
      <span>Negated: <strong class="text-success">${negated}</strong></span>
      <span>Wounds taken: <strong class="${remaining > 0 ? 'text-danger' : 'text-success'}">${remaining}</strong></span>
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
    return renderButton({ label: `Take ${remaining} Wound${remaining !== 1 ? 's' : ''}`, variant: remaining > 0 ? 'destructive' : 'primary', dataAction: 'confirm-wounds' });
  }

  // ─── Wound Distribution Modal ─────────────────────────────────

  private openWoundDistribution(entry: { zoneId: string; totalWounds: number; survivorIds: string[] }): void {
    if (this.woundDistModalId && modalManager.isOpen(this.woundDistModalId)) return;
    if (!this.state) return;

    this.woundDistAssignments = {};
    for (const sid of entry.survivorIds) {
      this.woundDistAssignments[sid] = 0;
    }
    this.woundDistAssignments[entry.survivorIds[0]] = entry.totalWounds;

    this.woundDistModalId = modalManager.open({
      title: 'Distribute Zombie Wounds',
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
              payload: { zoneId: entry.zoneId, assignments: { ...this.woundDistAssignments } },
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

  private renderWoundDistBody(entry: { zoneId: string; totalWounds: number; survivorIds: string[] }): string {
    if (!this.state) return '';
    const assigned = Object.values(this.woundDistAssignments).reduce((s, n) => s + n, 0);
    const remaining = entry.totalWounds - assigned;

    const desc = `<p class="text-secondary mb-3"><strong>${entry.totalWounds}</strong> zombie wound${entry.totalWounds > 1 ? 's' : ''} in ${formatZoneId(entry.zoneId, this.state!)}. Distribute among survivors.</p>`;
    const summary = `<div class="wound-picker__summary mb-3">
      <span>Assigned: <strong>${assigned}</strong> / ${entry.totalWounds}</span>
      <span>Remaining: <strong class="${remaining > 0 ? 'text-warning' : 'text-success'}">${remaining}</strong></span>
    </div>`;

    const rows = entry.survivorIds.map(sid => {
      const survivor = this.state!.survivors[sid];
      if (!survivor) return '';
      const count = this.woundDistAssignments[sid] || 0;
      const hp = survivor.maxHealth - survivor.wounds;
      const identity = getPlayerIdentity(this.state!, survivor.playerId);
      const avatar = renderAvatar(survivor.name, identity, 'sm', undefined, survivor.characterClass);

      return `<div class="wound-dist__row">
        ${avatar}
        <div class="wound-dist__info">
          <span class="wound-dist__name">${survivor.name}</span>
          <span class="wound-dist__hp">${hp} HP</span>
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

  private renderWoundDistFooter(entry: { zoneId: string; totalWounds: number; survivorIds: string[] }): string {
    const assigned = Object.values(this.woundDistAssignments).reduce((s, n) => s + n, 0);
    const isValid = assigned === entry.totalWounds;
    return renderButton({
      label: `Confirm Distribution`,
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
      notificationManager.show({ variant: 'warning', message: 'No one else here to give an action to.', duration: 3000 });
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
      title: 'Born Leader — Give Free Action',
      size: 'sm',
      renderBody: () => `
        <div class="stack stack--sm">
          ${others.map(t => {
            const identity = getPlayerIdentity(this.state!, t.playerId);
            const avatar = renderAvatar(t.name, identity, 'md', undefined, t.characterClass);
            return `
              <button class="action-btn" data-action="select-bl-target" data-id="${t.id}" style="width:100%">
                ${avatar}
                <span class="action-btn__label">${t.name} (${t.characterClass})</span>
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
    const isHost = this.state?.players[0] === this.localPlayerId;

    const resultIcon = isVictory ? 'Trophy' : 'Skull';
    const resultClass = isVictory ? 'victory' : 'defeat';
    const resultText = isVictory ? 'Victory!' : 'Defeat';
    const desc = isVictory ? 'All survivors have escaped!' : 'The zombies have overwhelmed you...';

    const actions = isHost
      ? renderButton({ label: 'Play Again', icon: 'Play', variant: 'primary', size: 'lg', dataAction: 'play-again' })
      : '<span class="text-secondary-sm">Waiting for host...</span>';

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
    const survivor = this.selectedSurvivorId && this.state ? this.state.survivors[this.selectedSurvivorId] : null;
    if (!survivor) return;

    if (this.backpackModalId && modalManager.isOpen(this.backpackModalId)) {
      modalManager.close(this.backpackModalId);
      this.backpackModalId = null;
      return;
    }

    const BAG_CAPACITY = 3;

    this.backpackModalId = modalManager.open({
      title: `Backpack (${survivor.inventory.filter(c => !c.inHand).length}/${BAG_CAPACITY})`,
      size: 'md',
      renderBody: () => {
        const bagItems = survivor.inventory.filter(c => !c.inHand);
        const emptyCount = Math.max(0, BAG_CAPACITY - bagItems.length);

        return `<div class="grid grid--2 gap-2">
          ${bagItems.map(item => renderItemCard(item)).join('')}
          ${renderEmptySlotsCounter(emptyCount)}
        </div>`;
      },
      renderFooter: () => renderButton({ label: 'Close', variant: 'secondary', dataAction: 'modal-close' }),
      onClose: () => { this.backpackModalId = null; },
    });
  }

  private openEndGameConfirm(): void {
    if (this.endGameModalId && modalManager.isOpen(this.endGameModalId)) return;

    this.endGameModalId = modalManager.open({
      title: 'End current game?',
      size: 'sm',
      renderBody: () => '<p class="text-secondary">This will return everyone to the lobby.</p>',
      renderFooter: () => `
        ${renderButton({ label: 'Cancel', variant: 'secondary', dataAction: 'modal-close' })}
        ${renderButton({ label: 'Yes, End Game', variant: 'destructive', dataAction: 'confirm-end-game' })}
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
    const isHost = this.state?.players[0] === this.localPlayerId;
    const muteLabel = audioManager.muted ? 'Unmute' : 'Mute';
    const muteIcon = audioManager.muted ? 'VolumeX' : 'Volume2';

    modalManager.open({
      size: 'sm',
      title: 'Paused',
      renderBody: () => `
        <div class="stack stack--sm">
          ${renderButton({ label: 'Resume Game', icon: 'Play', variant: 'ghost', fullWidth: true, dataAction: 'modal-close' })}
          ${renderButton({ label: muteLabel, icon: muteIcon, variant: 'ghost', fullWidth: true, dataAction: 'toggle-mute' })}
          ${isHost ? renderButton({ label: 'End Game', icon: 'Power', variant: 'destructive', fullWidth: true, dataAction: 'pause-end-game' }) : ''}
          ${renderButton({ label: 'Leave Game', icon: 'LogOut', variant: 'ghost', fullWidth: true, dataAction: 'pause-leave' })}
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
            networkManager.disconnect();
            window.history.pushState({}, '', '/');
            window.location.reload();
          }
        });
      },
    });
  }

  // ─── History Modal ───────────────────────────────────────────

  private openHistoryModal(): void {
    if (this.historyModalId && modalManager.isOpen(this.historyModalId)) {
      modalManager.close(this.historyModalId);
      this.historyModalId = null;
      return;
    }

    this.historyModalId = modalManager.open({
      title: 'Turn History',
      size: 'md',
      renderBody: () => {
        if (!this.state || this.state.history.length === 0) {
          return '<div class="text-center-muted">No actions yet.</div>';
        }

        const entries = [...this.state.history];

        const displayEntries = entries.filter(e =>
          e.actionType !== 'JOIN_LOBBY' && e.actionType !== 'START_GAME'
          && e.actionType !== 'RESOLVE_SEARCH' && e.actionType !== 'CHOOSE_SKILL'
          && e.actionType !== 'KICK_PLAYER' && e.actionType !== 'DISCONNECT'
        );

        const turnGroups: { turn: number; actions: typeof displayEntries }[] = [];
        let currentTurn = 1;
        let currentGroup: typeof displayEntries = [];

        for (const entry of displayEntries) {
          currentGroup.push(entry);
          if (entry.actionType === 'END_TURN') {
            turnGroups.push({ turn: entry.turn || currentTurn, actions: currentGroup });
            currentGroup = [];
            currentTurn = (entry.turn || currentTurn) + 1;
          }
        }
        if (currentGroup.length > 0) {
          turnGroups.push({ turn: currentGroup[0]?.turn || currentTurn, actions: currentGroup });
        }

        const reversed = [...turnGroups].reverse();

        return `<div class="history-list">${reversed.map(group => {
          const isCurrentTurn = group === reversed[0];
          const header = isCurrentTurn
            ? `<div class="history-turn-header">Turn ${group.turn} (current)</div>`
            : `<div class="history-turn-header">Turn ${group.turn}</div>`;

          const actionRows = group.actions.map(entry => {
            return this.renderHistoryEntry(entry);
          }).join('');

          return `${header}${actionRows}`;
        }).join('')}</div>`;
      },
      renderFooter: () => renderButton({ label: 'Close', variant: 'secondary', dataAction: 'modal-close' }),
      onClose: () => { this.historyModalId = null; },
    });
  }

  private renderHistoryEntry(entry: GameState['history'][0]): string {
    const survivor = entry.survivorId && entry.survivorId !== 'system' && this.state
      ? this.state.survivors[entry.survivorId]
      : null;
    const survivorName = survivor?.name ?? '';
    const actionLabel = formatActionType(entry.actionType);

    const freeLabel = entry.usedFreeAction
      ? `<span class="history-entry__free">${entry.freeActionType || 'FREE'}</span> `
      : '';

    let detail = '';
    let subDetail = '';

    switch (entry.actionType) {
      case 'ATTACK': {
        const targetZone = entry.payload?.targetZoneId
          ? formatZoneId(entry.payload.targetZoneId, this.state!)
          : '';
        detail = entry.description || (targetZone ? `→ ${targetZone}` : '');

        if (entry.dice && entry.dice.length > 0) {
          const diceStr = entry.dice.map(d =>
            `<span class="history-die ${d >= 4 ? 'history-die--hit' : ''}">${d}</span>`
          ).join('');
          const hitsStr = entry.hits !== undefined ? `${entry.hits} hit${entry.hits !== 1 ? 's' : ''}` : '';
          const dmgStr = entry.damagePerHit && entry.damagePerHit > 1 ? ` (${entry.damagePerHit} dmg each)` : '';
          subDetail = `<div class="history-entry__dice">${diceStr} <span class="history-entry__hits">${hitsStr}${dmgStr}</span></div>`;
        }

        if (entry.rerolledFrom && entry.rerolledFrom.length > 0) {
          const origDice = entry.rerolledFrom.map(d =>
            `<span class="history-die history-die--discarded">${d}</span>`
          ).join('');
          const label = entry.rerollSource === 'lucky'
            ? 'Lucky rerolled'
            : entry.rerollSource === 'plenty_of_bullets'
              ? 'Plenty of Bullets rerolled'
              : entry.rerollSource === 'plenty_of_shells'
                ? 'Plenty of Shells rerolled'
                : 'Rerolled';
          subDetail = `<div class="history-entry__lucky">${label}: ${origDice}</div>${subDetail}`;
        }

        const boosts: string[] = [];
        if (entry.bonusDice && entry.bonusDice > 0) boosts.push(`+${entry.bonusDice} dice`);
        if (entry.bonusDamage && entry.bonusDamage > 0) boosts.push(`+${entry.bonusDamage} dmg`);
        if (boosts.length > 0) {
          subDetail = `<div class="history-entry__boosts">${boosts.join(', ')}</div>${subDetail}`;
        }
        break;
      }
      case 'MOVE':
      case 'SPRINT':
      case 'CHARGE': {
        if (entry.description) {
          detail = entry.description;
        } else if (entry.payload?.targetZoneId) {
          detail = `→ ${formatZoneId(entry.payload.targetZoneId, this.state!)}`;
        } else if (entry.payload?.path) {
          const path = entry.payload.path as string[];
          detail = `→ ${path.map(id => formatZoneId(id, this.state!)).join(' → ')}`;
        }
        break;
      }
      case 'SEARCH': {
        detail = entry.description || '';
        break;
      }
      case 'OPEN_DOOR': {
        if (entry.description) {
          detail = entry.description;
        } else if (entry.payload?.targetZoneId) {
          detail = `→ ${formatZoneId(entry.payload.targetZoneId, this.state!)}`;
        }
        break;
      }
      case 'TRADE_START': {
        if (entry.payload?.targetSurvivorId && this.state) {
          const target = this.state.survivors[entry.payload.targetSurvivorId];
          detail = target ? `with ${target.name}` : '';
        }
        break;
      }
      case 'END_TURN': {
        detail = '';
        if (entry.spawnContext?.cards?.length) {
          const spawnSummary = entry.spawnContext.cards.map((c: any) => {
            if (c.detail.extraActivation) return `Extra ${c.detail.extraActivation} activation`;
            if (c.detail.zombies) {
              const zombieList = Object.entries(c.detail.zombies)
                .filter(([, n]) => n && (n as number) > 0)
                .map(([type, n]) => `${n} ${type}`)
                .join(', ');
              return `${formatZoneId(c.zoneId, this.state!)}: ${zombieList}`;
            }
            return '';
          }).filter(Boolean);
          if (spawnSummary.length > 0) {
            subDetail = `<div class="history-entry__spawn">${spawnSummary.map(s => `<div>${s}</div>`).join('')}</div>`;
          }
        }
        break;
      }
      case 'DISTRIBUTE_ZOMBIE_WOUNDS': {
        if (entry.payload?.zoneId) {
          const assignments = entry.payload.assignments as Record<string, number>;
          const parts = Object.entries(assignments || {})
            .filter(([, n]) => n > 0)
            .map(([sid, n]) => {
              const s = this.state?.survivors[sid];
              return s ? `${s.name}: ${n}` : `${n}`;
            });
          detail = `${formatZoneId(entry.payload.zoneId, this.state!)}`;
          if (parts.length > 0) {
            subDetail = `<div class="history-entry__detail">${parts.join(', ')}</div>`;
          }
        }
        break;
      }
      default: {
        if (entry.description) {
          detail = entry.description;
        } else if (entry.payload?.targetZoneId) {
          detail = `→ ${formatZoneId(entry.payload.targetZoneId, this.state!)}`;
        }
      }
    }

    return `<div class="history-entry">
      <span class="history-entry__actor">${survivorName}</span>
      <div class="history-entry__content">
        <span class="history-entry__action">${freeLabel}${actionLabel}${detail ? ` ${detail}` : ''}</span>
        ${subDetail}
      </div>
    </div>`;
  }

  // ─── Trade Logic ─────────────────────────────────────────────

  private handleTrade(activeSurvivor: Survivor): void {
    if (!this.state) return;
    const zoneId = activeSurvivor.position.zoneId;
    const others = Object.values(this.state.survivors).filter(
      s => s.position.zoneId === zoneId && s.id !== activeSurvivor.id && s.wounds < s.maxHealth
    );

    if (others.length === 0) {
      notificationManager.show({ variant: 'warning', message: 'No one else here to trade with.', duration: 3000 });
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
      title: 'Select Trade Partner',
      size: 'sm',
      renderBody: () => `
        <div class="stack stack--sm">
          ${targets.map(t => {
            const identity = getPlayerIdentity(this.state!, t.playerId);
            const avatar = renderAvatar(t.name, identity, 'md', undefined, t.characterClass);
            return `
              <button class="action-btn" data-action="select-trade-target" data-id="${t.id}" style="width:100%">
                ${avatar}
                <span class="action-btn__label">${t.name} (${t.characterClass})</span>
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
