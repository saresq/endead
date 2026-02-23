
import { GameState, PlayerId, GamePhase } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';

export class LobbyUI {
  private container: HTMLElement;
  private localPlayerId: PlayerId;
  private state: GameState | null = null;

  constructor(playerId: PlayerId) {
    this.localPlayerId = playerId;
    
    this.container = document.createElement('div');
    this.container.id = 'lobby-ui';
    document.body.appendChild(this.container);

    this.render();
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

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = '<div class="loading">Connecting to Lobby...</div>';
      return;
    }

    const isHost = this.state.lobby.players.length > 0 && this.state.lobby.players[0].id === this.localPlayerId;
    const myPlayer = this.state.lobby.players.find(p => p.id === this.localPlayerId);

    const availableClasses = ['Goth Girl', 'Cop', 'Waitress', 'Punk'];

    this.container.innerHTML = `
      <div class="lobby-container">
        <h1>Lobby</h1>
        <div class="player-list">
          ${this.state.lobby.players.map(p => `
            <div class="player-card ${p.id === this.localPlayerId ? 'me' : ''}">
              <div class="player-name">${p.name} ${p.id === this.state?.lobby.players[0].id ? '(Host)' : ''}</div>
              <div class="player-class">${p.characterClass}</div>
              <div class="player-status ${p.ready ? 'ready' : ''}">${p.ready ? 'Ready' : 'Selecting...'}</div>
            </div>
          `).join('')}
        </div>

        <div class="controls">
          ${myPlayer ? `
            <div class="class-selector">
              <h3>Choose Character</h3>
              <div class="class-buttons">
                ${availableClasses.map(c => `
                  <button class="class-btn ${myPlayer.characterClass === c ? 'selected' : ''}" data-class="${c}">
                    ${c}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : '<div class="error">Not in Lobby</div>'}

          ${isHost ? `
            <button id="btn-start-game" class="start-btn" ${this.state.lobby.players.length > 0 ? '' : 'disabled'}>
              Start Game
            </button>
          ` : '<div class="waiting-host">Waiting for Host to start...</div>'}
        </div>
      </div>
    `;

    this.attachListeners();
  }

  private attachListeners(): void {
    const classBtns = this.container.querySelectorAll('.class-btn');
    classBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const charClass = (e.target as HTMLElement).dataset.class;
        if (charClass) {
          networkManager.sendAction({
            playerId: this.localPlayerId,
            type: ActionType.SELECT_CHARACTER,
            payload: { characterClass: charClass }
          });
        }
      });
    });

    const startBtn = this.container.querySelector('#btn-start-game');
    startBtn?.addEventListener('click', () => {
      networkManager.sendAction({
        playerId: this.localPlayerId,
        type: ActionType.START_GAME
      });
    });
  }
}
