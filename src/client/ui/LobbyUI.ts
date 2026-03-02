
import { GameState, PlayerId } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';

export class LobbyUI {
  private container: HTMLElement;
  private localPlayerId: PlayerId;
  private roomId: string;
  private state: GameState | null = null;
  private availableMaps: any[] = [];
  private selectedMapId: string | null = null;
  private nameDebounceTimer: number | null = null;

  constructor(playerId: PlayerId, roomId: string) {
    this.localPlayerId = playerId;
    this.roomId = roomId;
    
    this.container = document.createElement('div');
    this.container.id = 'lobby-ui';
    document.body.appendChild(this.container);

    this.fetchMaps();
    this.render();
  }

  private async fetchMaps() {
      try {
          const res = await fetch('/api/maps');
          if (res.ok) {
              this.availableMaps = await res.json();
              if (this.availableMaps.length > 0) {
                  this.selectedMapId = this.availableMaps[0].id;
              }
              this.render(); // Re-render with maps
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

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = '<div class="loading">Connecting to Lobby...</div>';
      return;
    }

    const isHost = this.state.lobby.players.length > 0 && this.state.lobby.players[0].id === this.localPlayerId;
    const myPlayer = this.state.lobby.players.find(p => p.id === this.localPlayerId);
    
    // Map taken characters to the player who took them
    const takenClasses = new Map<string, string>(); // CharClass -> PlayerName
    this.state.lobby.players.forEach(p => {
        if (p.characterClass) {
            takenClasses.set(p.characterClass, p.name);
        }
    });

    const availableClasses = ['Goth Girl', 'Cop', 'Waitress', 'Punk'];

    // Define colors (align with map colors if possible)
    const playerColors = ['#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF'];
    const getPlayerColor = (pId: string) => {
        const index = this.state!.lobby.players.findIndex(p => p.id === pId);
        return playerColors[index % playerColors.length];
    };

    this.container.innerHTML = `
      <div class="lobby-container">
        <h1>Lobby</h1>
        <div class="room-meta">
          <span class="room-id" id="room-id-pill" title="Copy room URL">Room ID: ${this.roomId}</span>
        </div>
        <div class="player-list">
          ${this.state.lobby.players.map((p, idx) => `
            <div class="player-card ${p.id === this.localPlayerId ? 'me' : ''}" style="border-left: 5px solid ${playerColors[idx % playerColors.length]}">
              <div class="player-name">${p.name} ${p.id === this.state?.lobby.players[0].id ? '(Host)' : ''}</div>
              <div class="player-class">${p.characterClass || 'Selecting...'}</div>
              <div class="player-status ${p.ready ? 'ready' : ''}">${p.ready ? 'Ready' : 'Not Ready'}</div>
            </div>
          `).join('')}
        </div>

        <div class="controls">
          ${myPlayer ? `
            <div class="nickname-section">
               <label>Nickname:</label>
               <input type="text" id="nickname-input" value="${myPlayer.name}" placeholder="Enter Name">
            </div>

            <div class="class-selector">
              <h3>Choose Character</h3>
              <div class="class-buttons">
                ${availableClasses.map(c => {
                  const isTaken = takenClasses.has(c);
                  const takenByMe = myPlayer.characterClass === c;
                  const takenByName = takenClasses.get(c);
                  
                  // Use player color for selection highlight
                  const myColor = getPlayerColor(this.localPlayerId);
                  
                  // If taken by someone else, grey out
                  // If taken by me, highlight with my color
                  
                  let btnStyle = '';
                  let btnClass = 'class-btn';
                  
                  if (takenByMe) {
                      btnClass += ' selected';
                      btnStyle = `background-color: ${myColor}; border-color: #fff; box-shadow: 0 0 10px ${myColor};`;
                  } else if (isTaken) {
                      btnClass += ' taken';
                      // Maybe show tooltip or name?
                  }
                  
                  return `
                  <button class="${btnClass}" 
                          data-class="${c}" 
                          ${isTaken && !takenByMe ? 'disabled' : ''}
                          style="${btnStyle}"
                          title="${isTaken && !takenByMe ? 'Taken by ' + takenByName : ''}">
                    ${c}
                    ${isTaken && !takenByMe ? `<span class="taken-label">(${takenByName})</span>` : ''}
                  </button>
                `;
                }).join('')}
              </div>
            </div>
          ` : '<div class="error">Not in Lobby</div>'}

          ${isHost ? `
            <div class="map-selection" style="margin-bottom: 10px;">
                <label>Select Scenario:</label>
                <select id="map-select">
                    ${this.availableMaps.map(m => `
                        <option value="${m.id}" ${m.id === this.selectedMapId ? 'selected' : ''}>
                            ${m.name} (${m.width}x${m.height})
                        </option>
                    `).join('')}
                    ${this.availableMaps.length === 0 ? '<option>Loading maps...</option>' : ''}
                </select>
            </div>

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
    const nameInput = this.container.querySelector('#nickname-input') as HTMLInputElement;
    const roomIdPill = this.container.querySelector('#room-id-pill');

    roomIdPill?.addEventListener('click', async () => {
      const roomUrl = `${window.location.origin}/room/${this.roomId}`;
      try {
        await navigator.clipboard.writeText(roomUrl);
        roomIdPill.classList.add('copied');
        roomIdPill.textContent = `Copied: ${this.roomId}`;
        window.setTimeout(() => {
          roomIdPill.classList.remove('copied');
          roomIdPill.textContent = `Room ID: ${this.roomId}`;
        }, 1200);
      } catch {
        window.prompt('Copy this room URL:', roomUrl);
      }
    });

    const pushNicknameUpdate = () => {
      const nextName = nameInput?.value?.trim();
      if (!nextName) return;

      localStorage.setItem('endead_nickname', nextName.slice(0, 24));

      networkManager.sendAction({
        playerId: this.localPlayerId,
        type: ActionType.UPDATE_NICKNAME,
        payload: { name: nextName }
      });
    };

    if (nameInput) {
      nameInput.addEventListener('input', () => {
        if (this.nameDebounceTimer) {
          clearTimeout(this.nameDebounceTimer);
        }

        this.nameDebounceTimer = window.setTimeout(() => {
          pushNicknameUpdate();
        }, 500);
      });

      nameInput.addEventListener('blur', () => {
        if (this.nameDebounceTimer) {
          clearTimeout(this.nameDebounceTimer);
          this.nameDebounceTimer = null;
        }
        pushNicknameUpdate();
      });
    }

    classBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const charClass = (e.target as HTMLElement).dataset.class;
        const name = nameInput?.value;
        
        if (charClass) {
          networkManager.sendAction({
            playerId: this.localPlayerId,
            type: ActionType.SELECT_CHARACTER,
            payload: { 
                characterClass: charClass,
                name: name // Send name with class selection
            }
          });
        }
      });
    });

    const mapSelect = this.container.querySelector('#map-select');
    mapSelect?.addEventListener('change', (e) => {
        this.selectedMapId = (e.target as HTMLSelectElement).value;
    });

    const startBtn = this.container.querySelector('#btn-start-game');
    startBtn?.addEventListener('click', () => {
      // Find selected map
      const map = this.availableMaps.find(m => m.id === this.selectedMapId);
      
      networkManager.sendAction({
        playerId: this.localPlayerId,
        type: ActionType.START_GAME,
        payload: {
            map: map
        }
      });
    });
  }
}
