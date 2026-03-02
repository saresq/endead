export class MenuUI {
  private container: HTMLElement;
  private onCreateRoom: (nickname: string) => void;
  private onJoinRoom: (roomId: string, nickname: string) => void;
  private onBack: () => void;

  constructor(options: {
    nickname: string;
    roomIdPrefill?: string;
    onNicknameChange: (nickname: string) => void;
    onCreateRoom: (nickname: string) => void;
    onJoinRoom: (roomId: string, nickname: string) => void;
    onBack: () => void;
    infoMessage?: string;
  }) {
    this.onCreateRoom = options.onCreateRoom;
    this.onJoinRoom = options.onJoinRoom;
    this.onBack = options.onBack;

    this.container = document.getElementById('menu-ui') || document.createElement('div');
    if (!this.container.id) {
      this.container.id = 'menu-ui';
      document.body.appendChild(this.container);
    }

    this.container.innerHTML = `
      <div class="menu-card">
        <h1>Endead</h1>
        ${options.infoMessage ? `<div class="menu-message">${options.infoMessage}</div>` : ''}

        <div class="menu-field">
          <label for="menu-nickname">Nickname</label>
          <input id="menu-nickname" type="text" maxlength="24" value="${escapeHtml(options.nickname)}" placeholder="Enter nickname" />
        </div>

        <div class="menu-actions">
          <button id="menu-create-room" class="menu-primary">Create Room</button>
        </div>

        <div class="menu-divider">or join by room id</div>

        <div class="menu-join-row">
          <input id="menu-room-id" type="text" value="${escapeHtml(options.roomIdPrefill || '')}" placeholder="room id" />
          <button id="menu-join-room">Join Game</button>
        </div>

        ${options.infoMessage ? '<button id="menu-back" class="menu-secondary">Go Back</button>' : ''}
      </div>
    `;

    const nicknameInput = this.container.querySelector('#menu-nickname') as HTMLInputElement;
    const roomInput = this.container.querySelector('#menu-room-id') as HTMLInputElement;
    const createButton = this.container.querySelector('#menu-create-room');
    const joinButton = this.container.querySelector('#menu-join-room');
    const backButton = this.container.querySelector('#menu-back');

    nicknameInput?.addEventListener('input', () => {
      options.onNicknameChange(nicknameInput.value);
    });

    const submitJoin = () => {
      const roomId = (roomInput?.value || '').trim();
      const nickname = (nicknameInput?.value || '').trim();
      if (!roomId) return;
      this.onJoinRoom(roomId, nickname);
    };

    createButton?.addEventListener('click', () => {
      const nickname = (nicknameInput?.value || '').trim();
      this.onCreateRoom(nickname);
    });

    joinButton?.addEventListener('click', submitJoin);
    roomInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitJoin();
    });

    backButton?.addEventListener('click', () => this.onBack());
  }

  public destroy(): void {
    this.container.remove();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
