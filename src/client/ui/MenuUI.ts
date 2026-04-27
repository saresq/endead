import { renderButton } from './components/Button';

/**
 * Inline failure state surfaced on the entry card after a rejected
 * room-id submission. `null` is the nominal/non-error state.
 *  - `not-found` → `// ROOM NOT FOUND`
 *  - `full`      → `// ROOM AT CAPACITY · 6/6`
 */
export type MenuErrorState = 'not-found' | 'full' | null;

const ROOM_CAPACITY = 6;

/**
 * MenuUI — Field Manual entry screen (Phase C1).
 *
 * Single bracketed dossier panel on a dark gridded field. Hazard-tape stripes
 * top and bottom, bracketed stencil wordmark, tactical call-sign entry, then
 * a divider leading to the room-id join row.
 *
 * Preserves: element ids (#menu-ui, #menu-nickname, #menu-room-id),
 * data-action attributes (create-room, join-room, go-back), callbacks
 * (onNicknameChange, onCreateRoom, onJoinRoom, onBack) and the infoMessage
 * contract.
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
    /**
     * Inline failure-state for the entry card after a rejected
     * room-id submission. When non-null, the room-id field renders
     * with the rust .fm-input--error border, the header kicker
     * swaps to a state-specific tag, and the JOIN button plays a
     * one-shot shake on mount. See design/states/room-not-found.html.
     *
     *  - `not-found` → bad/expired code
     *  - `full`      → server returned SERVER_FULL / ROOM_FULL
     */
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

    const errorState: MenuErrorState = options.errorState ?? null;
    const isError = errorState !== null;
    const infoBlock = options.infoMessage
      ? `
        <div class="menu-message" role="${isError ? 'alert' : 'status'}">
          <span class="menu-message__marker" aria-hidden="true">!</span>
          <span class="menu-message__text">${escapeHtml(options.infoMessage)}</span>
        </div>
      `
      : '';

    // Kicker swaps based on which inline failure state was raised.
    // Default kicker remains `SURVIVOR OPS // ENTRY`.
    const headerKicker =
      errorState === 'not-found'
        ? '// ROOM NOT FOUND'
        : errorState === 'full'
          ? `// ROOM AT CAPACITY · ${ROOM_CAPACITY}/${ROOM_CAPACITY}`
          : 'SURVIVOR OPS // ENTRY';

    // Rust error border on the room-id input + one-shot shake on the
    // JOIN button. Both are scoped to the failed-submission case.
    const roomInputErrorClass = isError ? ' fm-input--error' : '';
    const roomInputAriaInvalid = isError ? 'aria-invalid="true"' : '';
    const joinShakeClass = isError ? ' fm-btn--shake' : '';

    const backButton = options.infoMessage
      ? renderButton({
          label: 'Go Back',
          icon: 'ArrowLeft',
          variant: 'ghost',
          fullWidth: true,
          dataAction: 'go-back',
        })
      : '';

    this.container.innerHTML = `
      <div class="menu-field" aria-hidden="true">
        <div class="menu-field__grid"></div>
        <div class="menu-field__vignette"></div>
      </div>

      <div class="menu-stack">
        <section
          class="menu-card menu-card--id fm-panel"
          role="dialog"
          aria-labelledby="menu-wordmark"
        >
          <span class="fm-panel-dot fm-panel-dot--tl" aria-hidden="true"></span>
          <span class="fm-panel-dot fm-panel-dot--br" aria-hidden="true"></span>

          <div class="fm-hazard-tape menu-card__stripe menu-card__stripe--top" aria-hidden="true"></div>

          <header class="menu-header">
            <div class="menu-header__kicker fm-kicker">${headerKicker}</div>

            <div class="menu-wordmark fm-brackets fm-brackets--amber fm-brackets--lg">
              <span class="fm-bracket-tr" aria-hidden="true"></span>
              <span class="fm-bracket-bl" aria-hidden="true"></span>
              <h1 id="menu-wordmark" class="menu-wordmark__text fm-stencil">Endead</h1>
            </div>

            <div class="menu-header__subline fm-mono">// FIELD MANUAL &middot; TACTICAL SURVIVAL</div>
          </header>

          ${infoBlock}

          <div class="menu-form">
            <div class="menu-field-group">
              <label class="fm-input__label fm-kicker" for="menu-nickname">CALL SIGN</label>
              <input
                id="menu-nickname"
                class="fm-input menu-input"
                type="text"
                maxlength="24"
                value="${escapeHtml(options.nickname)}"
                placeholder="designate operator"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          </div>

          <div class="menu-card__divider" aria-hidden="true"></div>
        </section>

        <div class="menu-action menu-action--standalone">
          ${renderButton({
            label: 'Create Room',
            icon: 'Play',
            variant: 'primary',
            size: 'lg',
            fullWidth: true,
            dataAction: 'create-room',
          })}
        </div>

        <div class="menu-divider menu-divider--standalone" role="separator" aria-label="or join by room id">
          <span class="menu-divider__line" aria-hidden="true"></span>
          <span class="menu-divider__label fm-kicker">// OR JOIN BY ROOM ID</span>
          <span class="menu-divider__line" aria-hidden="true"></span>
        </div>

        <section
          class="menu-card menu-card--join fm-panel"
          aria-label="Join existing room"
        >
          <span class="fm-panel-dot fm-panel-dot--tl" aria-hidden="true"></span>
          <span class="fm-panel-dot fm-panel-dot--br" aria-hidden="true"></span>

          <div class="menu-form">
            <div class="menu-field-group">
              <label class="fm-input__label fm-kicker" for="menu-room-id">ROOM ID</label>
              <div class="menu-join-row">
                <input
                  id="menu-room-id"
                  class="fm-input menu-input${roomInputErrorClass}"
                  type="text"
                  value="${escapeHtml(options.roomIdPrefill || '')}"
                  placeholder="XXXX-XXXX"
                  autocomplete="off"
                  spellcheck="false"
                  ${roomInputAriaInvalid}
                />
                ${renderButton({
                  label: 'Join',
                  variant: 'secondary',
                  dataAction: 'join-room',
                  className: joinShakeClass.trim(),
                })}
              </div>
            </div>

            ${backButton}
          </div>

          <div class="menu-card__divider" aria-hidden="true"></div>
        </section>
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

    // One-shot shake on the JOIN button. Strip the class on
    // animationend so a *second* failure (re-mount with an errorState)
    // re-applies it cleanly. Without this strip the browser would
    // skip the animation on identical class membership.
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
