import { renderButton } from './components/Button';

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
        ${options.infoMessage ? `<div class="menu-message">${escapeHtml(options.infoMessage)}</div>` : ''}

        <div class="form-group">
          <label class="form-label" for="menu-nickname">Nickname</label>
          <input id="menu-nickname" class="input" type="text" maxlength="24" value="${escapeHtml(options.nickname)}" placeholder="Enter nickname" />
        </div>

        ${renderButton({ label: 'Create Room', icon: 'Play', variant: 'primary', size: 'lg', fullWidth: true, dataAction: 'create-room' })}

        <div class="menu-divider">or join by room id</div>

        <div class="menu-join-row">
          <input id="menu-room-id" class="input" type="text" value="${escapeHtml(options.roomIdPrefill || '')}" placeholder="room id" />
          ${renderButton({ label: 'Join', variant: 'secondary', dataAction: 'join-room' })}
        </div>

        ${options.infoMessage ? renderButton({ label: 'Go Back', icon: 'ArrowLeft', variant: 'ghost', fullWidth: true, dataAction: 'go-back' }) : ''}
      </div>
    `;

    const nicknameInput = this.container.querySelector('#menu-nickname') as HTMLInputElement;
    const roomInput = this.container.querySelector('#menu-room-id') as HTMLInputElement;

    nicknameInput?.addEventListener('input', () => {
      options.onNicknameChange(nicknameInput.value);
    });

    const submitJoin = () => {
      const roomId = (roomInput?.value || '').trim();
      const nickname = (nicknameInput?.value || '').trim();
      if (!roomId) return;
      this.onJoinRoom(roomId, nickname);
    };

    // Delegated clicks
    this.container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'create-room') {
        const nickname = (nicknameInput?.value || '').trim();
        this.onCreateRoom(nickname);
      } else if (action === 'join-room') {
        submitJoin();
      } else if (action === 'go-back') {
        this.onBack();
      }
    });

    roomInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitJoin();
    });
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
