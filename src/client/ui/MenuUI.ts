import { renderButton } from './components/Button';
import { es } from '../../strings/es';

/**
 * Room code from the join field: a bare code or a pasted invite link
 * containing `/room/<code>`. Whitespace is ignored. Anything else is
 * returned trimmed (the server answers ROOM_NOT_FOUND).
 */
export function parseRoomInput(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/room\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

/**
 * Inline failure state after a rejected room submission. Marks the
 * code field invalid and shakes `Unirme` once. `null` = no error.
 *  - `not-found` → bad/expired code
 *  - `full`      → server returned SERVER_FULL
 */
export type MenuErrorState = 'not-found' | 'full' | null;

/**
 * MenuUI — entry screen. One card: wordmark, optional message, name,
 * `Crear sala`, divider, code/link join row, `Volver` when a message shows.
 *
 * Preserves: element ids (#menu-ui, #menu-nickname, #menu-room-id),
 * data-action attributes (create-room, join-room, go-back) and callbacks.
 */
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
    errorState?: MenuErrorState;
  }) {
    this.onCreateRoom = options.onCreateRoom;
    this.onJoinRoom = options.onJoinRoom;
    this.onBack = options.onBack;

    this.container = document.getElementById('menu-ui') || document.createElement('div');
    if (!this.container.id) {
      this.container.id = 'menu-ui';
      document.body.appendChild(this.container);
    }

    const t = es.menu;
    const errorState: MenuErrorState = options.errorState ?? null;
    const isError = errorState !== null;

    // Every menu message reports a problem (not found, full, kicked,
    // replaced session, create failed), so all of them are alerts.
    const infoBlock = options.infoMessage
      ? `
        <div class="menu-message" role="alert">
          <span class="menu-message__marker" aria-hidden="true">!</span>
          <span class="menu-message__text">${escapeHtml(options.infoMessage)}</span>
        </div>
      `
      : '';

    const roomInputErrorClass = isError ? ' fm-input--error' : '';
    const roomInputAriaInvalid = isError ? 'aria-invalid="true"' : '';
    const joinShakeClass = isError ? 'fm-btn--shake' : '';

    const backButton = options.infoMessage
      ? renderButton({
          label: t.back,
          icon: 'ArrowLeft',
          variant: 'ghost',
          fullWidth: true,
          dataAction: 'go-back',
        })
      : '';

    this.container.innerHTML = `
      <div class="menu-field" aria-hidden="true"></div>

      <div class="menu-stack">
        <section
          class="menu-card fm-panel"
          role="dialog"
          aria-labelledby="menu-wordmark"
        >
          <span class="fm-panel-dot fm-panel-dot--tl" aria-hidden="true"></span>
          <span class="fm-panel-dot fm-panel-dot--br" aria-hidden="true"></span>

          <header class="menu-header">
            <div class="menu-wordmark">
              <h1 id="menu-wordmark" class="menu-wordmark__text fm-stencil">Endead</h1>
            </div>
            <div class="menu-header__subline fm-mono">${escapeHtml(t.subline)}</div>
          </header>

          ${infoBlock}

          <div class="menu-form">
            <div class="menu-field-group">
              <label class="fm-input__label fm-kicker" for="menu-nickname">${escapeHtml(t.nameLabel)}</label>
              <input
                id="menu-nickname"
                class="fm-input menu-input"
                type="text"
                maxlength="24"
                value="${escapeHtml(options.nickname)}"
                placeholder="${escapeHtml(t.namePlaceholder)}"
                autocomplete="off"
                spellcheck="false"
              />
            </div>

            ${renderButton({
              label: escapeHtml(t.createRoom),
              icon: 'Play',
              variant: 'primary',
              size: 'lg',
              fullWidth: true,
              dataAction: 'create-room',
            })}

            <div class="menu-divider" role="separator">
              <span class="menu-divider__line" aria-hidden="true"></span>
              <span class="menu-divider__label fm-kicker">${escapeHtml(t.joinDivider)}</span>
              <span class="menu-divider__line" aria-hidden="true"></span>
            </div>

            <div class="menu-field-group">
              <label class="fm-input__label fm-kicker" for="menu-room-id">${escapeHtml(t.joinLabel)}</label>
              <div class="menu-join-row">
                <input
                  id="menu-room-id"
                  class="fm-input menu-input menu-input--code${roomInputErrorClass}"
                  type="text"
                  value="${escapeHtml(options.roomIdPrefill || '')}"
                  placeholder="${escapeHtml(t.joinPlaceholder)}"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  enterkeyhint="go"
                  ${roomInputAriaInvalid}
                />
                ${renderButton({
                  label: escapeHtml(t.join),
                  variant: 'secondary',
                  dataAction: 'join-room',
                  className: joinShakeClass,
                })}
              </div>
            </div>

            ${backButton}
          </div>
        </section>
      </div>
    `;

    const nicknameInput = this.container.querySelector('#menu-nickname') as HTMLInputElement;
    const roomInput = this.container.querySelector('#menu-room-id') as HTMLInputElement;

    nicknameInput?.addEventListener('input', () => {
      options.onNicknameChange(nicknameInput.value);
    });

    const submitJoin = () => {
      const roomId = parseRoomInput(roomInput?.value || '');
      const nickname = (nicknameInput?.value || '').trim();
      if (!roomId) return;
      this.onJoinRoom(roomId, nickname);
    };

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

    // One-shot shake on `Unirme`. Strip the class on animationend so a
    // second failure (re-mount with an errorState) re-applies it cleanly.
    if (isError) {
      const joinBtn = this.container.querySelector('[data-action="join-room"]') as HTMLElement | null;
      if (joinBtn) {
        const stripShake = (): void => {
          joinBtn.classList.remove('fm-btn--shake');
          joinBtn.removeEventListener('animationend', stripShake);
        };
        joinBtn.addEventListener('animationend', stripShake);
      }
    }
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
