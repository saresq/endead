
import { GameState, PlayerId, EntityId, Survivor, GameResult, ZombieType } from '../../types/GameState';
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
  private dismissedFeedTimestamp: number | null = null;
  private boundDelegateHandler: (e: Event) => void;

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

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = '';
      return;
    }

    if (this.state.gameResult) {
      this.renderGameOver();
      return;
    }

    const isMyTurn = this.state.players[this.state.activePlayerIndex] === this.localPlayerId;
    const activeSurvivor = this.selectedSurvivorId ? this.state.survivors[this.selectedSurvivorId] : null;

    this.container.innerHTML = `
      ${this.renderTopBar(isMyTurn)}
      ${this.renderFeed()}
      ${activeSurvivor ? this.renderBottomDashboard(activeSurvivor, isMyTurn) : ''}
      ${activeSurvivor ? this.renderBackpackFab(activeSurvivor) : ''}
    `;

    this.syncTradeAndPickup(activeSurvivor);
  }

  private renderTopBar(isMyTurn: boolean): string {
    const state = this.state!;
    const dangerClass = `hud-pill--danger-${state.currentDangerLevel.toLowerCase()}`;
    const myTurnClass = isMyTurn ? ' hud-top--my-turn' : '';
    const muteIcon = audioManager.muted ? 'VolumeX' : 'Volume2';

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
          ${renderButton({ icon: muteIcon, variant: 'icon', size: 'sm', dataAction: 'toggle-mute', title: audioManager.muted ? 'Unmute' : 'Mute' })}
          ${renderButton({ icon: 'Menu', variant: 'icon', size: 'sm', dataAction: 'open-menu', title: 'Menu' })}
        </div>
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
      return renderAvatar(survivor.name, identity, 'sm', state);
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

    // Desktop: sidebar feed
    const desktopFeed = `<div class="hud-feed"><div class="hud-feed__section">${dismissBtn}${lastAction}${spawnInfo}</div></div>`;
    // Mobile: last event as floating overlay
    const mobileFeed = lastAction ? `<div class="hud-feed-mobile">${lastAction}</div>` : '';

    return `${desktopFeed}${mobileFeed}`;
  }

  private renderBottomDashboard(survivor: Survivor, isMyTurn: boolean): string {
    const isOwner = survivor.playerId === this.localPlayerId;
    if (!isOwner) return '';

    const identity = getPlayerIdentity(this.state!, survivor.playerId);
    const avatar = renderAvatar(survivor.name, identity, 'md');

    const hp = renderStatBar({ icon: 'Heart', current: survivor.maxHealth - survivor.wounds, max: survivor.maxHealth, color: 'var(--danger)' });
    const xp = renderStatBar({ icon: 'Star', current: survivor.experience, max: survivor.experience + 5, color: 'var(--accent)', label: `${survivor.experience} XP` });
    const ap = renderStatBar({ icon: 'Zap', current: survivor.actionsRemaining, max: survivor.actionsPerTurn, color: 'var(--warning)' });

    const weapons = survivor.inventory.filter(c => c.type === 'WEAPON' && c.inHand);
    const canOpenDoor = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
    const currentZone = this.state?.zones[survivor.position.zoneId];
    const canTakeObjective = currentZone?.hasObjective === true;
    const noAP = survivor.actionsRemaining < 1;

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
        </div>

        <div class="hud-actions">
          ${renderActionButton({ id: 'btn-search', icon: 'Search', label: 'Search', kbd: 'S', cost: '1 AP', disabled: !isMyTurn || survivor.hasSearched || noAP })}
          ${renderActionButton({ id: 'btn-noise', icon: 'Volume2', label: 'Noise', kbd: 'N', cost: '1 AP', disabled: !isMyTurn || noAP })}
          ${renderActionButton({ id: 'btn-door', icon: 'DoorOpen', label: 'Door', kbd: 'D', cost: '1 AP', disabled: !isMyTurn || noAP || !canOpenDoor })}
          ${renderActionButton({ id: 'btn-objective', icon: 'Target', label: 'Objective', kbd: 'O', cost: '1 AP', disabled: !isMyTurn || noAP || !canTakeObjective, highlight: canTakeObjective && isMyTurn && !noAP })}
          ${renderActionButton({ id: 'btn-trade', icon: 'Handshake', label: 'Trade', kbd: 'T', cost: '1 AP', disabled: !isMyTurn || noAP })}
          ${renderActionButton({ id: 'btn-end-turn', icon: 'SkipForward', label: 'End Turn', kbd: 'E', disabled: !isMyTurn })}
        </div>

        <div class="hud-weapons">
          ${weapons.length > 0
            ? weapons.map(w => `
                <button class="hud-weapon-btn" data-id="${w.id}" ${!isMyTurn || noAP ? 'disabled' : ''}>
                  ${renderItemCard(w, { variant: 'weapon', showSlot: false })}
                </button>`).join('')
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

    modalManager.open({
      size: 'sm',
      renderBody: () => `
        <div class="stack stack--sm py-2">
          ${renderButton({ label: 'Resume Game', icon: 'Play', variant: 'ghost', fullWidth: true, dataAction: 'modal-close' })}
          ${isHost ? renderButton({ label: 'End Game', icon: 'Power', variant: 'destructive', fullWidth: true, dataAction: 'pause-end-game' }) : ''}
          ${renderButton({ label: 'Leave Game', icon: 'LogOut', variant: 'ghost', fullWidth: true, dataAction: 'pause-leave' })}
        </div>`,
      onOpen: (el) => {
        el.addEventListener('click', (e) => {
          const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
          if (!t) return;
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

        // Group entries by turn — we infer turn from END_TURN boundaries
        // or simply group by consecutive entries. Since history doesn't store
        // turn numbers, we walk backwards and detect END_TURN to mark boundaries.
        const entries = [...this.state.history];

        // Build turn groups: walk forward, splitting on END_TURN
        const turnGroups: { turn: number; actions: typeof entries }[] = [];
        let currentTurn = 1;
        let currentGroup: typeof entries = [];

        for (const entry of entries) {
          currentGroup.push(entry);
          if (entry.actionType === 'END_TURN') {
            turnGroups.push({ turn: currentTurn, actions: currentGroup });
            currentGroup = [];
            currentTurn++;
          }
        }
        // Remaining actions (current turn, not ended yet)
        if (currentGroup.length > 0) {
          turnGroups.push({ turn: currentTurn, actions: currentGroup });
        }

        // Render most recent first
        const reversed = [...turnGroups].reverse();

        return `<div class="history-list">${reversed.map(group => {
          const isCurrentTurn = group === reversed[0];
          const header = isCurrentTurn
            ? `<div class="history-turn-header">Turn ${group.turn} (current)</div>`
            : `<div class="history-turn-header">Turn ${group.turn}</div>`;

          const actionRows = group.actions.map(entry => {
            const survivor = entry.survivorId && this.state
              ? this.state.survivors[entry.survivorId]
              : null;
            const survivorName = survivor?.name ?? '—';
            const actionLabel = formatActionType(entry.actionType);

            // Format payload details
            let detail = '';
            if (entry.payload) {
              if (entry.payload.targetZoneId) {
                detail = ` → ${formatZoneId(entry.payload.targetZoneId)}`;
              } else if (entry.payload.weaponId) {
                detail = ` (weapon)`;
              } else if (entry.payload.targetSurvivorId && this.state) {
                const target = this.state.survivors[entry.payload.targetSurvivorId];
                detail = target ? ` with ${target.name}` : '';
              }
            }

            const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return `<div class="history-entry">
              <span class="history-entry__time">${time}</span>
              <span class="history-entry__actor">${survivorName}</span>
              <span class="history-entry__action">${actionLabel}${detail}</span>
            </div>`;
          }).join('');

          return `${header}${actionRows}`;
        }).join('')}</div>`;
      },
      renderFooter: () => renderButton({ label: 'Close', variant: 'secondary', dataAction: 'modal-close' }),
      onClose: () => { this.historyModalId = null; },
    });
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
            const avatar = renderAvatar(t.name, identity, 'md');
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
