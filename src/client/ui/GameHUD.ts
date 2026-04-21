
import { GameState, PlayerId, EntityId, Survivor, GameResult, ZombieType, EquipmentCard } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { InputController } from '../InputController';
import { TradeUI } from './TradeUI';
import { PickupUI } from './PickupUI';
import { getPlayerIdentity, getPlayerColorHex } from '../config/PlayerIdentities';
import { assetManager } from '../AssetManager';
import { audioManager } from '../AudioManager';
import { icon } from './components/icons';
import { renderAvatar } from './components/PlayerAvatar';
import { renderStatBar } from './components/StatBar';
import { renderActionButton } from './components/ActionButton';
import { renderLastActionEntry, renderSpawnEntry, type SpawnCardData } from './components/EventEntry';
import { renderButton } from './components/Button';
import { renderItemCard } from './components/ItemCard';
import { modalManager } from './overlays/ModalManager';
import { notificationManager } from './NotificationManager';
import { formatZoneId, formatActionType } from '../utils/zoneFormat';
import { SKILL_DEFINITIONS } from '../../config/SkillRegistry';

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
  private woundDistModalId: string | null = null;
  private woundDistAssignments: Record<string, number> = {};
  private dismissedFeedTimestamp: number | null = null;
  private boundDelegateHandler: (e: Event) => void;
  // Stable shell elements — created once, updated per-section
  private elTopBar: HTMLDivElement | null = null;
  private elFeed: HTMLDivElement | null = null;
  private elDashboard: HTMLDivElement | null = null;
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
    this.render();
  }

  public updateMode(_mode: string): void {
    this.render();
  }

  public destroy(): void {
    document.documentElement.removeAttribute('data-danger');
    this.container.removeEventListener('click', this.boundDelegateHandler);
    this.container.innerHTML = '';
    this.shellBuilt = false;
  }

  // ─── Click Delegation ────────────────────────────────────────

  private handleDelegatedClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target) return;

    const btn = target.closest('[data-action]') as HTMLElement | null;
    const closestButton = target.closest('button') as HTMLElement | null;
    const id = target.id || closestButton?.id || '';
    const action = btn?.dataset.action;

    const activeSurvivor = this.selectedSurvivorId && this.state ? this.state.survivors[this.selectedSurvivorId] : null;
    const isMyTurn = this.state ? this.state.players[this.state.activePlayerIndex] === this.localPlayerId : false;
    const isOwner = activeSurvivor ? activeSurvivor.playerId === this.localPlayerId : false;

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

    // --- Backpack FAB ---
    if (id === 'btn-backpack-fab' || action === 'open-backpack') {
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
    // --- Weapon buttons ---
    const weaponBtn = target.closest('.hud-weapon-btn') as HTMLElement;
    if (weaponBtn && !weaponBtn.hasAttribute('disabled')) {
      const weaponId = weaponBtn.dataset.id;
      if (weaponId) {
        this.inputController.setMode('ATTACK', weaponId);
        notificationManager.show({ variant: 'info', message: 'Select a Zone to Attack!', duration: 5000 });
      }
      return;
    }
  }

  // ─── Rendering ───────────────────────────────────────────────

  private buildShell(): void {
    if (this.shellBuilt) return;
    this.container.innerHTML = '';

    this.elTopBar = document.createElement('div');
    this.elTopBar.style.display = 'contents';

    this.elFeed = document.createElement('div');
    this.elFeed.style.display = 'contents';

    this.elDashboard = document.createElement('div');
    this.elDashboard.style.display = 'contents';

    this.elFab = document.createElement('div');
    this.elFab.style.display = 'contents';

    this.container.append(this.elTopBar, this.elFeed, this.elDashboard, this.elFab);
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
    this.elFeed!.innerHTML = this.renderFeed();
    this.elDashboard!.innerHTML = activeSurvivor ? this.renderBottomDashboard(activeSurvivor, isMyTurn) : '';
    this.elFab!.innerHTML = activeSurvivor ? this.renderBackpackFab(activeSurvivor) : '';

    this.syncTradeAndPickup(activeSurvivor);

    // Auto-open wound distribution modal if there are pending zombie wounds (host only)
    const isHost = this.state?.players[0] === this.localPlayerId;
    if (isHost && this.state?.pendingZombieWounds && this.state.pendingZombieWounds.length > 0
        && !this.woundDistModalId) {
      this.openWoundDistribution(this.state.pendingZombieWounds[0]);
    }
  }

  private renderTopBar(isMyTurn: boolean): string {
    const state = this.state!;
    const dangerClass = `hud-pill--danger-${state.currentDangerLevel.toLowerCase()}`;
    const myTurnClass = isMyTurn ? ' hud-top--my-turn' : '';

    const turnBadge = isMyTurn
      ? '<span class="hud-turn-badge">Your Turn</span>'
      : '';

    const playerStrip = this.renderPlayerStrip();

    return `
      <div class="hud-top${myTurnClass}">
        <div class="hud-top__left">
          <button class="hud-pill hud-pill--clickable" data-action="open-history" title="View turn history" aria-label="Turn ${state.turn} — click to view history">${icon('Clock', 'sm')} Turn ${state.turn}</button>
          <span class="hud-pill">${state.phase}</span>
          <span class="hud-pill ${dangerClass}">${state.currentDangerLevel}</span>
          ${turnBadge}
        </div>
        <div class="hud-top__center">
          ${playerStrip}
        </div>
        <div class="hud-top__right">
          ${renderButton({ icon: 'Menu', variant: 'icon', size: 'sm', dataAction: 'open-menu', title: 'Menu' })}
        </div>
        <div class="hud-danger-bar hud-danger-bar--${state.currentDangerLevel.toLowerCase()}"></div>
      </div>`;
  }

  private renderPlayerStrip(): string {
    if (!this.state) return '';
    const players = this.state.players;
    const activePlayerId = players[this.state.activePlayerIndex];

    const chips = players.map(pid => {
      const survivor = Object.values(this.state!.survivors).find(s => s.playerId === pid);
      if (!survivor) return '';
      const identity = getPlayerIdentity(this.state!, pid);
      const isDead = survivor.wounds >= survivor.maxHealth;
      const isActive = pid === activePlayerId;
      const state = isDead ? 'dead' as const : isActive ? 'active' as const : undefined;
      return renderAvatar(survivor.name, identity, 'sm', state, survivor.characterClass);
    }).join('');

    return `<div class="hud-player-strip">${chips}</div>`;
  }

  private renderFeed(): string {
    if (!this.state) return '';

    // Check if current feed content has been dismissed
    const feedTimestamp = this.state.lastAction?.timestamp || this.state.spawnContext?.timestamp || 0;
    if (this.dismissedFeedTimestamp && feedTimestamp <= this.dismissedFeedTimestamp) {
      return '';
    }

    const lastAction = this.state.lastAction ? renderLastActionEntry(this.state.lastAction) : '';
    const spawnInfo = this.state.spawnContext?.cards
      ? renderSpawnEntry(this.state.spawnContext.cards as SpawnCardData[])
      : '';

    if (!lastAction && !spawnInfo) return '';

    const dismissBtn = `<button class="btn btn--icon btn--sm hud-feed__dismiss" data-action="dismiss-feed" title="Dismiss">${icon('X', 'sm')}</button>`;
    const luckyBtn = this.renderLuckyRerollButton();

    // Desktop: sidebar feed
    const desktopFeed = `<div class="hud-feed"><div class="hud-feed__section">${dismissBtn}${lastAction}${luckyBtn}${spawnInfo}</div></div>`;
    // Mobile: last event as floating overlay
    const mobileFeed = lastAction ? `<div class="hud-feed-mobile">${lastAction}${luckyBtn}</div>` : '';

    return `${desktopFeed}${mobileFeed}`;
  }

  /**
   * Lucky reroll affordance — surfaces a button in the feed when:
   * - local survivor owns the last ATTACK action,
   * - Lucky skill is unspent this turn,
   * - the attack carried a rollback snapshot (always true for Lucky-capable attackers).
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
    if (last.luckyUsed) return '';
    // SwarmComms §3.7.1: `rollbackSnapshot` never crosses the wire — the
    // server projects a boolean `canLucky` gated on shooter ownership and
    // reroll validity. Replaces the legacy `last.rollbackSnapshot` read.
    if (!(last as { canLucky?: boolean }).canLucky) return '';
    return `<button class="action-btn action-btn--lucky" data-action="reroll-lucky" title="Reroll dice (Lucky — commits to new result even if worse)">
      ${icon('Dices', 'sm')} Reroll (Lucky)
    </button>`;
  }

  private renderBottomDashboard(survivor: Survivor, isMyTurn: boolean): string {
    const isOwner = survivor.playerId === this.localPlayerId;
    if (!isOwner) return '';

    const identity = getPlayerIdentity(this.state!, survivor.playerId);
    const avatar = renderAvatar(survivor.name, identity, 'md', undefined, survivor.characterClass);

    const hp = renderStatBar({ icon: 'Heart', current: survivor.maxHealth - survivor.wounds, max: survivor.maxHealth, color: 'var(--danger)' });
    const xp = renderStatBar({ icon: 'Star', current: survivor.experience, max: survivor.experience + 5, color: 'var(--accent)', label: `${survivor.experience} XP` });
    const ap = renderStatBar({ icon: 'Zap', current: survivor.actionsRemaining, max: survivor.actionsPerTurn, color: 'var(--warning)' });

    const weapons = survivor.inventory.filter(c => c.type === 'WEAPON' && c.inHand);
    const canOpenDoor = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
    const currentZone = this.state?.zones[survivor.position.zoneId];
    const canTakeObjective = currentZone?.hasObjective === true;
    const noAP = survivor.actionsRemaining < 1;

    // --- Skills panel ---
    const skillsHtml = this.renderSkillBadges(survivor);

    // --- Free action indicators ---
    const freeActions = this.renderFreeActionIndicators(survivor);

    // --- Once-per-turn skill action buttons ---
    const skillActions = this.renderSkillActionButtons(survivor, isMyTurn, noAP);

    // --- Weapon stat boosts from skills ---
    const weaponBoosts = this.getWeaponBoosts(survivor);

    return `
      <div class="hud-bottom">
        <div>
          <div class="hud-survivor">
            ${avatar}
            <div class="hud-survivor__info">
              <span class="hud-survivor__name">${survivor.name}</span>
              <span class="hud-survivor__class">${survivor.characterClass} &middot; ${survivor.dangerLevel}</span>
            </div>
          </div>
          <div class="hud-stats mt-2">
            ${hp}${xp}${ap}
          </div>
          ${freeActions}
          ${skillsHtml}
        </div>

        <div class="hud-actions">
          ${renderActionButton({ id: 'btn-search', icon: 'Search', label: 'Search', kbd: 'S', cost: survivor.freeSearchesRemaining > 0 ? 'FREE' : '1 AP', disabled: !isMyTurn || survivor.hasSearched || (noAP && survivor.freeSearchesRemaining <= 0) })}
          ${renderActionButton({ id: 'btn-noise', icon: 'Volume2', label: 'Noise', kbd: 'N', cost: '1 AP', disabled: !isMyTurn || noAP })}
          ${renderActionButton({ id: 'btn-door', icon: 'DoorOpen', label: 'Door', kbd: 'D', cost: '1 AP', disabled: !isMyTurn || noAP || !canOpenDoor })}
          ${renderActionButton({ id: 'btn-objective', icon: 'Target', label: 'Objective', kbd: 'O', cost: '1 AP', disabled: !isMyTurn || noAP || !canTakeObjective, highlight: canTakeObjective && isMyTurn && !noAP })}
          ${renderActionButton({ id: 'btn-trade', icon: 'Handshake', label: 'Trade', kbd: 'T', cost: '1 AP', disabled: !isMyTurn || noAP })}
          ${renderActionButton({ id: 'btn-end-turn', icon: 'SkipForward', label: 'End Turn', kbd: 'E', disabled: !isMyTurn })}
          ${skillActions}
        </div>

        <div class="hud-weapons">
          ${weapons.length > 0
            ? weapons.map(w => {
                const boosts = weaponBoosts.get(w.id) || { dice: 0, damage: 0 };
                const isActive = this.inputController.mode === 'ATTACK' && this.inputController.weaponId === w.id;
                return `
                <button class="hud-weapon-btn${isActive ? ' hud-weapon-btn--active' : ''}" data-id="${w.id}" ${!isMyTurn || (noAP && survivor.freeCombatsRemaining <= 0 && survivor.freeMeleeRemaining <= 0 && survivor.freeRangedRemaining <= 0) ? 'disabled' : ''}>
                  ${renderItemCard(w, { variant: 'weapon', showSlot: false, bonusDice: boosts.dice, bonusDamage: boosts.damage })}
                </button>`;
              }).join('')
            : `<div class="text-muted-sm">No weapon equipped</div>`}
        </div>
      </div>`;
  }

  private renderBackpackFab(survivor: Survivor): string {
    const count = survivor.inventory.length;
    return `
      <button class="hud-backpack-fab" id="btn-backpack-fab" data-action="open-backpack" title="Backpack">
        ${icon('Backpack', 'lg')}
        <span class="hud-backpack-fab__badge">${count}</span>
      </button>`;
  }

  // ─── Skill Visual Indicators ──────────────────────────────────

  private renderSkillBadges(survivor: Survivor): string {
    if (!survivor.skills || survivor.skills.length === 0) return '';

    const badges = survivor.skills.map(skillId => {
      const def = SKILL_DEFINITIONS[skillId];
      if (!def) return '';

      // Check if once-per-turn skill is used
      let used = false;
      if (skillId === 'sprint') used = survivor.sprintUsedThisTurn;
      else if (skillId === 'charge') used = survivor.chargeUsedThisTurn;
      else if (skillId === 'born_leader') used = survivor.bornLeaderUsedThisTurn;
      else if (skillId === 'tough') used = survivor.toughUsedZombieAttack && survivor.toughUsedFriendlyFire;

      const typeClass = def.type === 'PASSIVE' ? 'passive' : def.type === 'ACTION' ? 'action' : 'stat-mod';
      const usedClass = used ? ' skill-badge--used' : '';

      return `<span class="skill-badge skill-badge--${typeClass}${usedClass}" title="${def.description}">${def.name}</span>`;
    }).filter(Boolean).join('');

    return `<div class="hud-skills">${badges}</div>`;
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

    return buttons.join('');
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

  // ─── Wound Distribution Modal ─────────────────────────────────

  private openWoundDistribution(entry: { zoneId: string; totalWounds: number; survivorIds: string[] }): void {
    if (this.woundDistModalId && modalManager.isOpen(this.woundDistModalId)) return;
    if (!this.state) return;

    // Initialize assignments: all wounds to first survivor by default
    this.woundDistAssignments = {};
    for (const sid of entry.survivorIds) {
      this.woundDistAssignments[sid] = 0;
    }
    // Assign all to first survivor as starting point
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

    this.backpackModalId = modalManager.open({
      title: `Backpack (${survivor.inventory.length})`,
      size: 'md',
      renderBody: () => {
        if (survivor.inventory.length === 0) {
          return '<div class="text-center-muted">Empty</div>';
        }

        return `<div class="grid grid--2 gap-2">
          ${survivor.inventory.map(item => renderItemCard(item)).join('')}
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

    // SwarmComms Step 3: state.history was removed (§3.5 — history is no
    // longer broadcast). Step 4 wires this modal to the client-side event
    // ring buffer (§3.5 "subscribe to the incoming event stream and maintain
    // their own bounded ring buffer (last ~200)"). Placeholder until then.
    this.historyModalId = modalManager.open({
      title: 'Turn History',
      size: 'md',
      renderBody: () => '<div class="text-center-muted">Turn history is being rebuilt — coming back in the next update.</div>',
      renderFooter: () => renderButton({ label: 'Close', variant: 'secondary', dataAction: 'modal-close' }),
      onClose: () => { this.historyModalId = null; },
    });
  }

  // Kept for the SwarmComms Step-4 event-stream rewire. Argument shape matches
  // the legacy history entry; no longer reads from `state.history`.
  private renderHistoryEntry(entry: {
    actionType: string;
    survivorId?: string;
    payload?: Record<string, unknown> & { targetZoneId?: string; targetSurvivorId?: string; path?: string[]; zoneId?: string; assignments?: Record<string, number> };
    turn?: number;
    description?: string;
    dice?: number[];
    hits?: number;
    damagePerHit?: number;
    bonusDice?: number;
    bonusDamage?: number;
    rerolledFrom?: number[];
    rerollSource?: 'lucky' | 'plenty_of_bullets' | 'plenty_of_shells';
    usedFreeAction?: boolean;
    freeActionType?: string;
    spawnContext?: GameState['spawnContext'];
  }): string {
    const survivor = entry.survivorId && entry.survivorId !== 'system' && this.state
      ? this.state.survivors[entry.survivorId]
      : null;
    const survivorName = survivor?.name ?? '';
    const actionLabel = formatActionType(entry.actionType);

    // Free action label
    const freeLabel = entry.usedFreeAction
      ? `<span class="history-entry__free">${entry.freeActionType || 'FREE'}</span> `
      : '';

    // Build detail string based on action type
    let detail = '';
    let subDetail = '';

    switch (entry.actionType) {
      case 'ATTACK': {
        const targetZone = entry.payload?.targetZoneId
          ? formatZoneId(entry.payload.targetZoneId, this.state!)
          : '';
        detail = entry.description || (targetZone ? `→ ${targetZone}` : '');

        // Dice details
        if (entry.dice && entry.dice.length > 0) {
          const diceStr = entry.dice.map(d =>
            `<span class="history-die ${d >= 4 ? 'history-die--hit' : ''}">${d}</span>`
          ).join('');
          const hitsStr = entry.hits !== undefined ? `${entry.hits} hit${entry.hits !== 1 ? 's' : ''}` : '';
          const dmgStr = entry.damagePerHit && entry.damagePerHit > 1 ? ` (${entry.damagePerHit} dmg each)` : '';
          subDetail = `<div class="history-entry__dice">${diceStr} <span class="history-entry__hits">${hitsStr}${dmgStr}</span></div>`;
        }

        // Reroll indicator (Lucky / Plenty of Bullets / Plenty of Shells)
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

        // Boost info
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
        // Show zombie phase summary if spawn context available
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
