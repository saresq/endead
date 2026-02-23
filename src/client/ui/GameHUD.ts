
import { GameState, PlayerId, EntityId, Survivor, EquipmentCard, GameResult } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { InputController } from '../InputController';

export class GameHUD {
  private container: HTMLElement;
  private messageOverlay: HTMLElement; // New overlay
  private inputController: InputController;
  private localPlayerId: PlayerId;
  private state: GameState | null = null;
  private selectedSurvivorId: EntityId | null = null;
  private currentMessageTimer: number | null = null;
  private isBackpackOpen: boolean = false;

  constructor(inputController: InputController, playerId: PlayerId) {
    this.inputController = inputController;
    this.localPlayerId = playerId;
    
    // Create UI Container
    this.container = document.getElementById('game-hud') || document.createElement('div');
    if (!this.container.id) {
        this.container.id = 'game-hud';
        document.body.appendChild(this.container);
    }

    // Create Message Overlay
    this.messageOverlay = document.createElement('div');
    this.messageOverlay.id = 'message-overlay';
    document.body.appendChild(this.messageOverlay);

    // Initial Render
    this.render();
  }

  public showMessage(text: string, duration: number = 3000): void {
    this.messageOverlay.textContent = text;
    this.messageOverlay.classList.add('visible');
    
    if (this.currentMessageTimer) clearTimeout(this.currentMessageTimer);
    
    if (duration > 0) {
      this.currentMessageTimer = window.setTimeout(() => {
        this.hideMessage();
      }, duration);
    }
  }

  public hideMessage(): void {
    this.messageOverlay.classList.remove('visible');
  }

  public update(state: GameState, selectedSurvivorId: EntityId | null): void {
    this.state = state;
    this.selectedSurvivorId = selectedSurvivorId;
    this.render();
  }

  public updateMode(mode: string): void {
    // Just re-render to update button states
    this.render();
  }

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = '<div class="loading">Waiting for server...</div>';
      return;
    }

    if (this.state.gameResult) {
      this.renderGameOver();
      return;
    }

    const isMyTurn = this.state.players[this.state.activePlayerIndex] === this.localPlayerId;
    const activeSurvivor = this.selectedSurvivorId ? this.state.survivors[this.selectedSurvivorId] : null;

    this.container.innerHTML = `
      <div class="top-bar">
        <div class="stat">Turn: ${this.state.turn}</div>
        <div class="stat">Phase: ${this.state.phase}</div>
        <div class="stat danger-${this.state.currentDangerLevel.toLowerCase()}">Danger: ${this.state.currentDangerLevel}</div>
        <div class="stat ${isMyTurn ? 'turn-active' : ''}">${isMyTurn ? 'YOUR TURN' : `Waiting for Player ${this.state.activePlayerIndex + 1}`}</div>
      </div>

      ${this.renderLastAction()}
      ${this.renderSpawnInfo()}

      ${activeSurvivor ? this.renderSurvivorDashboard(activeSurvivor, isMyTurn) : ''}
    `;

    // Attach Event Listeners
    if (activeSurvivor && isMyTurn) {
      this.attachActionListeners(activeSurvivor);
    }
  }

  private renderGameOver(): void {
    const isVictory = this.state?.gameResult === GameResult.Victory;
    this.container.innerHTML = `
      <div class="game-over ${isVictory ? 'victory' : 'defeat'}">
        <h1>${isVictory ? 'VICTORY!' : 'DEFEAT'}</h1>
        <p>${isVictory ? 'All survivors have escaped!' : 'The zombies have overwhelmed you...'}</p>
        <button onclick="location.reload()">Play Again</button>
      </div>
    `;
  }

  private renderLastAction(): string {
    if (!this.state?.lastAction) return '';
    const action = this.state.lastAction;
    
    let details = '';
    if (action.dice && action.dice.length > 0) {
        details = `<div class="dice-rolls">
          Rolled: [${action.dice.join(', ')}] <br>
          Hits: ${action.hits}
        </div>`;
    }

    return `
      <div class="last-action-panel">
          <div class="action-desc">${action.description || action.type}</div>
          ${details}
      </div>
    `;
  }

  private renderSpawnInfo(): string {
    if (!this.state?.spawnContext) return '';
    
    return `
      <div class="spawn-info-panel">
         <h3>Zombie Spawn Phase</h3>
         <div class="spawn-cards">
           ${this.state.spawnContext.cards.map(c => `
              <div class="spawn-card-log">
                 Zone ${c.zoneId}: 
                 ${c.detail.doubleSpawn ? 'DOUBLE SPAWN!' : ''}
                 ${c.detail.extraActivation ? `EXTRA ACTIVATION: ${c.detail.extraActivation}` : ''}
                 ${c.detail.zombies ? Object.entries(c.detail.zombies).map(([t, n]) => `${n} ${t}`).join(', ') : ''}
              </div>
           `).join('')}
         </div>
      </div>
    `;
  }

  private toggleBackpack(): void {
    this.isBackpackOpen = !this.isBackpackOpen;
    this.render();
  }

  private renderBackpackModal(survivor: Survivor): string {
    return `
      <div class="modal-overlay">
        <div class="modal backpack-modal">
          <h2>Backpack</h2>
          <div class="inventory-list">
            ${survivor.inventory.map(item => `
              <div class="item-card ${item.inHand ? 'equipped' : ''}">
                <strong>${item.name}</strong>
                <small>${item.type} - ${item.slot || 'Backpack'}</small>
                ${item.stats ? `<div class="stats">Range: ${item.stats.range.join('-')}, Dice: ${item.stats.dice}, Acc: ${item.stats.accuracy}+, Dmg: ${item.stats.damage}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <button id="btn-close-backpack">Close</button>
        </div>
      </div>
    `;
  }

  private renderSurvivorDashboard(survivor: Survivor, isMyTurn: boolean): string {
    const isOwner = survivor.playerId === this.localPlayerId;
    if (!isOwner) return ''; // Only show dashboard for own survivors

    const weapons = survivor.inventory.filter(c => c.type === 'WEAPON' && c.inHand);
    const canOpenDoor = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
    
    return `
      <div class="dashboard">
        <div class="survivor-info">
          <h3>${survivor.name} (${survivor.characterClass})</h3>
          <div class="bars">
            <div class="bar hp-bar">HP: ${survivor.maxHealth - survivor.wounds}/${survivor.maxHealth}</div>
            <div class="bar xp-bar">XP: ${survivor.experience}</div>
            <div class="bar ap-bar">AP: ${survivor.actionsRemaining}/${survivor.actionsPerTurn}</div>
          </div>
        </div>

        <div class="actions-panel">
          <button id="btn-search" ${survivor.hasSearched || survivor.actionsRemaining < 1 ? 'disabled' : ''}>Search (1 AP)</button>
          <button id="btn-noise" ${survivor.actionsRemaining < 1 ? 'disabled' : ''}>Make Noise (1 AP)</button>
          <button id="btn-door" ${survivor.actionsRemaining < 1 || !canOpenDoor ? 'disabled' : ''}>Open Door (1 AP)</button>
          <button id="btn-end-turn" ${survivor.actionsRemaining < 1 ? 'disabled' : ''}>End Turn</button>
          <button id="btn-backpack">Backpack (${survivor.inventory.length})</button>
        </div>

        <div class="combat-panel">
          <h4>Equipped Weapons</h4>
          ${weapons.map(w => `
            <button class="weapon-btn" data-id="${w.id}" ${survivor.actionsRemaining < 1 ? 'disabled' : ''}>
              Attack with ${w.name} (${w.stats?.dice}d6 / ${w.stats?.accuracy}+)
            </button>
          `).join('')}
          ${weapons.length === 0 ? '<div class="warning">No Weapon Equipped</div>' : ''}
        </div>
        
        <div class="inventory-preview">
           <small>Inventory: ${survivor.inventory.length} items</small>
        </div>
        ${this.isBackpackOpen ? this.renderBackpackModal(survivor) : ''}
      </div>
    `;
  }

  private attachActionListeners(survivor: Survivor): void {
    const btnSearch = document.getElementById('btn-search');
    const btnNoise = document.getElementById('btn-noise');
    const btnDoor = document.getElementById('btn-door');
    const btnEndTurn = document.getElementById('btn-end-turn');
    const btnBackpack = document.getElementById('btn-backpack');
    const btnCloseBackpack = document.getElementById('btn-close-backpack');
    const weaponBtns = document.querySelectorAll('.weapon-btn');

    btnSearch?.addEventListener('click', () => {
      networkManager.sendAction({
        playerId: this.localPlayerId,
        survivorId: survivor.id,
        type: ActionType.SEARCH
      });
    });

    btnNoise?.addEventListener('click', () => {
      networkManager.sendAction({
        playerId: this.localPlayerId,
        survivorId: survivor.id,
        type: ActionType.MAKE_NOISE
      });
    });

    btnDoor?.addEventListener('click', () => {
        // Toggle Input Mode for Door
        this.inputController.setMode('OPEN_DOOR');
        this.showMessage('Select a CLOSED DOOR zone (or building zone) to open it.', 5000);
    });

    btnEndTurn?.addEventListener('click', () => {
        networkManager.sendAction({
          playerId: this.localPlayerId,
          survivorId: survivor.id,
          type: ActionType.END_TURN
        });
    });

    btnBackpack?.addEventListener('click', () => this.toggleBackpack());
    btnCloseBackpack?.addEventListener('click', () => this.toggleBackpack());

    weaponBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const weaponId = (e.target as HTMLElement).dataset.id;
        if (weaponId) {
          // Toggle Attack Mode
          // Visual feedback would be nice here (button active state)
          this.inputController.setMode('ATTACK', weaponId);
          this.showMessage(`Select a Zone to Attack with weapon!`, 5000);
        }
      });
    });
  }
}
