
import { GameState, PlayerId, DangerLevel } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { getPlayerIdentity } from '../config/PlayerIdentities';
import { CHARACTER_DEFINITIONS } from '../../config/CharacterRegistry';
import { SURVIVOR_CLASSES, SKILL_DEFINITIONS } from '../../config/SkillRegistry';
import { EQUIPMENT_CARDS, STARTER_DECK_POOL } from '../../config/EquipmentRegistry';
import { renderAvatar } from './components/PlayerAvatar';
import { renderButton } from './components/Button';
import { icon } from './components/icons';
import { notificationManager } from './NotificationManager';
import { modalManager } from './overlays/ModalManager';

export class LobbyUI {
  private container: HTMLElement;
  private localPlayerId: PlayerId;
  private roomId: string;
  private state: GameState | null = null;
  private availableMaps: { id: string; name: string; width: number; height: number }[] = [];
  private selectedMapId: string | null = null;
  private abominationFest = false;
  private nameDebounceTimer: number | null = null;
  private roomPillCopied = false;
  // Stable shell elements
  private elCard: HTMLDivElement | null = null;
  private elRoomPill: HTMLDivElement | null = null;
  private elPlayers: HTMLDivElement | null = null;
  private elControls: HTMLDivElement | null = null;
  private elFooter: HTMLDivElement | null = null;
  private shellBuilt = false;

  constructor(playerId: PlayerId, roomId: string) {
    this.localPlayerId = playerId;
    this.roomId = roomId;

    this.container = document.createElement('div');
    this.container.id = 'lobby-ui';
    this.container.className = 'lobby';
    document.body.appendChild(this.container);

    this.attachListeners();
    this.fetchMaps();
    this.render();
  }

  private async fetchMaps(): Promise<void> {
    try {
      const res = await fetch('/api/maps');
      if (res.ok) {
        this.availableMaps = await res.json();
        if (this.availableMaps.length > 0) {
          this.selectedMapId = this.availableMaps[0].id;
        }
        this.render();
      }
    } catch (e) {
      console.error('Failed to load maps', e);
    }
  }

  public update(state: GameState): void {
    this.state = state;
    this.render();
  }

  public show(): void {
    this.container.style.display = 'flex';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  // ─── Rendering ───────────────────────────────────────────────

  private buildShell(): void {
    if (this.shellBuilt) return;
    this.container.innerHTML = '';

    this.elCard = document.createElement('div');
    this.elCard.className = 'lobby__card';

    const header = document.createElement('div');
    header.className = 'lobby__header';

    const title = document.createElement('h1');
    title.className = 'lobby__title';
    title.textContent = 'Lobby';

    this.elRoomPill = document.createElement('div');

    header.append(title, this.elRoomPill);

    this.elPlayers = document.createElement('div');
    this.elPlayers.className = 'lobby__players';

    // Use display:contents so this wrapper is invisible to the flex layout
    this.elControls = document.createElement('div');
    this.elControls.style.display = 'contents';

    this.elFooter = document.createElement('div');
    this.elFooter.className = 'lobby__footer';

    this.elCard.append(header, this.elPlayers, this.elControls, this.elFooter);
    this.container.appendChild(this.elCard);
    this.shellBuilt = true;
  }

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = `
        <div class="lobby__card">
          <div class="lobby__waiting">Connecting to lobby...</div>
        </div>`;
      this.shellBuilt = false;
      return;
    }

    this.buildShell();

    const isHost = this.state.lobby.players.length > 0 && this.state.lobby.players[0].id === this.localPlayerId;
    const myPlayer = this.state.lobby.players.find(p => p.id === this.localPlayerId);

    const takenClasses = new Map<string, string>();
    this.state.lobby.players.forEach(p => {
      if (p.characterClass) takenClasses.set(p.characterClass, p.name);
    });

    const availableClasses = Object.keys(CHARACTER_DEFINITIONS);

    this.elRoomPill!.innerHTML = this.renderRoomPill();

    this.elPlayers!.innerHTML = this.state.lobby.players.length === 0
      ? '<div class="lobby__players-empty">No players yet...</div>'
      : this.state.lobby.players.map((p, idx) => this.renderPlayerCard(p, idx, isHost)).join('');

    // Preserve nickname input focus/cursor position across renders
    const activeEl = document.activeElement;
    const nicknameInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
    const hadFocus = activeEl === nicknameInput;
    const prevCursor = nicknameInput?.selectionStart ?? null;

    this.elControls!.innerHTML = myPlayer ? `
      <div class="lobby__controls">
        <div class="form-group">
          <label class="form-label">Your Name</label>
          <input type="text" class="input" id="lobby-nickname" value="${this.escHtml(myPlayer.name)}" placeholder="Enter name" maxlength="24" aria-label="Your display name">
        </div>

        <div>
          <div class="lobby__class-title">Choose Character</div>
          <div class="lobby__class-grid" role="radiogroup" aria-label="Character selection">
            ${availableClasses.map(c => this.renderClassButton(c, myPlayer.characterClass, takenClasses)).join('')}
          </div>
          ${myPlayer.characterClass ? this.renderCharacterPanel(myPlayer.characterClass) : ''}
        </div>

        <div>
          <div class="lobby__class-title">Claim Starter Card</div>
          <div class="lobby__class-grid" role="radiogroup" aria-label="Starter card selection">
            ${this.renderStarterGrid(myPlayer.starterEquipmentKey)}
          </div>
        </div>

        ${isHost ? this.renderHostControls() : '<div class="lobby__waiting">Waiting for host to start...</div>'}
      </div>
    ` : '';

    // Restore focus if the nickname input was focused before render
    if (hadFocus) {
      const newInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
      if (newInput) {
        newInput.focus();
        if (prevCursor !== null) {
          newInput.setSelectionRange(prevCursor, prevCursor);
        }
      }
    }

    // Restore map select and abomination fest values
    const mapSelect = this.container.querySelector('#lobby-map-select') as HTMLSelectElement | null;
    if (mapSelect && this.selectedMapId) mapSelect.value = this.selectedMapId;
    const abomCheck = this.container.querySelector('#lobby-abom-fest') as HTMLInputElement | null;
    if (abomCheck) abomCheck.checked = this.abominationFest;

    this.elFooter!.innerHTML = renderButton({ label: 'Leave Room', icon: 'ArrowLeft', variant: 'ghost', dataAction: 'leave-room' });
  }

  private renderRoomPill(): string {
    const copyIcon = this.roomPillCopied ? icon('Check', 'sm') : icon('Copy', 'sm');
    const copiedClass = this.roomPillCopied ? ' lobby__room-pill--copied' : '';
    return `<span class="lobby__room-pill${copiedClass}" id="room-pill" title="Copy room URL" role="button" aria-label="Copy room URL to clipboard">Room: ${this.roomId} ${copyIcon}</span>`;
  }

  private renderPlayerCard(
    player: { id: PlayerId; name: string; ready: boolean; characterClass: string },
    index: number,
    isHost: boolean,
  ): string {
    const identity = this.state ? getPlayerIdentity(this.state, player.id) : null;
    const isMe = player.id === this.localPlayerId;
    const isPlayerHost = index === 0;
    const meClass = isMe ? ' lobby__player--me' : '';

    const avatar = identity
      ? renderAvatar(player.name, identity, 'md', undefined, player.characterClass)
      : '';

    const hostBadge = isPlayerHost
      ? `<span class="text-warning inline-flex" title="Host">${icon('Crown', 'sm')}</span>`
      : '';

    const readyStatus = player.ready
      ? `<span class="lobby__player-status lobby__player-status--ready">${icon('Check', 'sm')} Ready</span>`
      : `<span class="lobby__player-status">Not Ready</span>`;

    const kickBtn = isHost && !isMe
      ? renderButton({ icon: 'X', variant: 'icon', size: 'sm', dataAction: 'kick-player', dataId: player.id, title: 'Kick player', className: 'lobby__player-kick' })
      : '';

    return `
      <div class="lobby__player${meClass}">
        ${avatar}
        <div class="lobby__player-info">
          <div class="lobby__player-name">${this.escHtml(player.name)} ${hostBadge}</div>
          <div class="lobby__player-class">${player.characterClass || 'Selecting...'}</div>
        </div>
        ${readyStatus}
        ${kickBtn}
      </div>`;
  }

  private renderClassButton(
    className: string,
    myClass: string,
    takenClasses: Map<string, string>,
  ): string {
    const isTaken = takenClasses.has(className);
    const isSelected = myClass === className;
    const takenByOther = isTaken && !isSelected;
    const takenByName = takenClasses.get(className);

    let btnClass = 'lobby__class-btn';
    if (isSelected) btnClass += ' lobby__class-btn--selected';
    if (takenByOther) btnClass += ' lobby__class-btn--taken';

    const takenLabel = takenByOther
      ? `<span class="lobby__class-taken-label">${takenByName}</span>`
      : '';

    return `
      <button class="${btnClass}" data-action="select-class" data-id="${className}" ${takenByOther ? 'disabled' : ''} role="radio" aria-checked="${isSelected}" aria-label="${className}${takenByOther ? ` (taken by ${takenByName})` : ''}">
        ${className}
        ${takenLabel}
      </button>`;
  }

  private renderStarterGrid(myStarter: string): string {
    const players = this.state?.lobby.players ?? [];
    return Object.entries(STARTER_DECK_POOL).map(([key, poolQty]) => {
      const template = EQUIPMENT_CARDS[key];
      if (!template) return '';
      const takenByOthers = players.filter(p => p.starterEquipmentKey === key && p.id !== this.localPlayerId).length;
      const remaining = poolQty - takenByOthers;
      const isSelected = myStarter === key;
      const isSoldOut = !isSelected && remaining <= 0;

      let btnClass = 'lobby__class-btn';
      if (isSelected) btnClass += ' lobby__class-btn--selected';
      if (isSoldOut) btnClass += ' lobby__class-btn--taken';

      const qtyLabel = `<span class="lobby__class-taken-label">${remaining}/${poolQty}</span>`;

      return `
        <button class="${btnClass}" data-action="pick-starter" data-id="${key}" ${isSoldOut ? 'disabled' : ''} role="radio" aria-checked="${isSelected}" aria-label="${template.name} (${remaining} of ${poolQty} left)">
          ${template.name}
          ${qtyLabel}
        </button>`;
    }).join('');
  }

  private renderHostControls(): string {
    const mapOptions = this.availableMaps.length > 0
      ? this.availableMaps.map(m =>
          `<option value="${m.id}" ${m.id === this.selectedMapId ? 'selected' : ''}>${m.name} (${m.width}x${m.height})</option>`
        ).join('')
      : '<option>Loading maps...</option>';

    const players = this.state?.lobby.players ?? [];
    const playerCount = players.length;
    const allPicked = playerCount > 0 && players.every(p => !!p.characterClass && !!p.starterEquipmentKey);

    return `
      <div class="form-group">
        <label class="form-label">Map</label>
        <select class="select" id="lobby-map-select" aria-label="Select map">${mapOptions}</select>
      </div>

      <div class="lobby__config">
        <div class="lobby__config-title">Game Settings</div>
        <label class="lobby__toggle">
          <input type="checkbox" id="lobby-abom-fest" ${this.abominationFest ? 'checked' : ''}>
          <span class="lobby__toggle-label">Abomination Fest</span>
          <span class="lobby__toggle-hint">Allow unlimited Abominations on the board</span>
        </label>
      </div>

      ${renderButton({
        label: `Start Game (${playerCount} player${playerCount !== 1 ? 's' : ''})`,
        icon: 'Play',
        variant: 'primary',
        size: 'lg',
        fullWidth: true,
        disabled: !allPicked,
        dataAction: 'start-game',
      })}
    `;
  }

  // ─── Character Info Panel ─────────────────────────────────────

  private renderCharacterPanel(charClass: string): string {
    const charDef = CHARACTER_DEFINITIONS[charClass];
    const progression = SURVIVOR_CLASSES[charClass];
    if (!charDef || !progression) return '';

    const dangerLevels: { level: DangerLevel; color: string; title: string; choiceNote: string }[] = [
      { level: DangerLevel.Blue, color: '#4a9eff', title: 'Blue', choiceNote: '' },
      { level: DangerLevel.Yellow, color: '#ffe119', title: 'Yellow', choiceNote: '' },
      { level: DangerLevel.Orange, color: '#f58231', title: 'Orange', choiceNote: 'pick 1' },
      { level: DangerLevel.Red, color: '#e6194b', title: 'Red', choiceNote: 'pick 1' },
    ];

    const skillsHtml = dangerLevels.map(({ level, color, title, choiceNote }) => {
      const skillIds = progression[level] || [];
      const skills = skillIds.map(id => SKILL_DEFINITIONS[id]).filter(Boolean);
      if (skills.length === 0) return '';

      return `
        <div class="char-panel__skill-row">
          <span class="char-panel__danger-dot" style="background:${color}" title="${title}"></span>
          <div class="char-panel__skill-list">
            ${skills.map(s => `<span class="char-panel__skill" title="${this.escHtml(s.description)}">${s.name}</span>`).join('')}
            ${choiceNote ? `<span class="char-panel__choice-note">${choiceNote}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="char-panel" style="border-left-color:${charDef.color}">
        <div class="char-panel__header">${charClass}</div>
        <div class="char-panel__section">
          <div class="char-panel__section-title">Skill Tree</div>
          <div class="char-panel__skills">${skillsHtml}</div>
        </div>
      </div>`;
  }

  // ─── Event Handling (attached once in constructor, delegates via container) ──

  private pushNicknameUpdate(): void {
    const nameInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
    const nextName = nameInput?.value.trim();
    if (!nextName) return;
    localStorage.setItem('endead_nickname', nextName.slice(0, 24));
    networkManager.sendAction({
      playerId: this.localPlayerId,
      type: ActionType.UPDATE_NICKNAME,
      payload: { name: nextName },
    });
  }

  private attachListeners(): void {
    // Click delegation
    this.container.addEventListener('click', (e) => {
      const actionEl = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      const clickedEl = e.target as HTMLElement;

      // Room pill copy (check by id since it's not a data-action)
      if (clickedEl.closest('#room-pill')) {
        this.handleRoomPillCopy();
        return;
      }

      if (!actionEl) return;
      const action = actionEl.dataset.action;

      if (action === 'select-class') {
        const charClass = actionEl.dataset.id;
        const nameInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
        if (charClass) {
          networkManager.sendAction({
            playerId: this.localPlayerId,
            type: ActionType.SELECT_CHARACTER,
            payload: { characterClass: charClass, name: nameInput?.value },
          });
        }
        return;
      }

      if (action === 'pick-starter') {
        const starterKey = actionEl.dataset.id;
        if (starterKey) {
          networkManager.sendAction({
            playerId: this.localPlayerId,
            type: ActionType.PICK_STARTER,
            payload: { starterEquipmentKey: starterKey },
          });
        }
        return;
      }

      if (action === 'kick-player') {
        const targetId = actionEl.dataset.id;
        if (targetId) {
          modalManager.open({
            title: 'Kick Player?',
            size: 'sm',
            renderBody: () => '<p class="text-secondary">This player will be removed from the lobby.</p>',
            renderFooter: () => `
              ${renderButton({ label: 'Cancel', variant: 'secondary', dataAction: 'modal-close' })}
              ${renderButton({ label: 'Kick', variant: 'destructive', dataAction: 'confirm-kick' })}
            `,
            onOpen: (el) => {
              el.addEventListener('click', (ev) => {
                if ((ev.target as HTMLElement).closest('[data-action="confirm-kick"]')) {
                  modalManager.close();
                  networkManager.sendAction({
                    playerId: this.localPlayerId,
                    type: ActionType.KICK_PLAYER,
                    payload: { targetPlayerId: targetId },
                  });
                }
              });
            },
          });
        }
        return;
      }

      if (action === 'start-game') {
        const map = this.availableMaps.find(m => m.id === this.selectedMapId);
        networkManager.sendAction({
          playerId: this.localPlayerId,
          type: ActionType.START_GAME,
          payload: { map, abominationFest: this.abominationFest },
        });
        return;
      }

      if (action === 'leave-room') {
        networkManager.disconnect();
        window.history.pushState({}, '', '/');
        window.location.reload();
        return;
      }
    });

    // Nickname input — debounced (delegated since input is re-created on render)
    this.container.addEventListener('input', (e) => {
      if ((e.target as HTMLElement).id === 'lobby-nickname') {
        if (this.nameDebounceTimer) clearTimeout(this.nameDebounceTimer);
        this.nameDebounceTimer = window.setTimeout(() => this.pushNicknameUpdate(), 500);
      }
    });

    this.container.addEventListener('blur', (e) => {
      if ((e.target as HTMLElement).id === 'lobby-nickname') {
        if (this.nameDebounceTimer) {
          clearTimeout(this.nameDebounceTimer);
          this.nameDebounceTimer = null;
        }
        this.pushNicknameUpdate();
      }
    }, true); // capture phase for blur

    // Map select + Abomination Fest toggle (delegated)
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'lobby-map-select') {
        this.selectedMapId = (target as HTMLSelectElement).value;
      } else if (target.id === 'lobby-abom-fest') {
        this.abominationFest = (target as HTMLInputElement).checked;
      }
    });
  }

  private async handleRoomPillCopy(): Promise<void> {
    const roomUrl = `${window.location.origin}/room/${this.roomId}`;
    try {
      await navigator.clipboard.writeText(roomUrl);
      this.roomPillCopied = true;
      this.render();
      notificationManager.show({ variant: 'success', message: 'Room URL copied!', priority: 'low' });
      setTimeout(() => {
        this.roomPillCopied = false;
        this.render();
      }, 2000);
    } catch {
      notificationManager.show({ variant: 'warning', message: 'Could not copy URL. Room code: ' + this.roomId });
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
