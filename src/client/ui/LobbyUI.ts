
import { GameState, PlayerId } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { leaveRoom } from '../roomExit';
import { CHARACTER_DEFINITIONS } from '../../config/CharacterRegistry';
import { characterImageUrl } from '../utils/characterAsset';
import { renderButton } from './components/Button';
import { renderPhotoSlot } from './components/PhotoSlot';
import { renderLobbyDossier, renderLobbyDossierStrip } from './components/LobbyDossier';
import { renderItemCard } from './components/ItemCard';
import { weaponOptions, isLoadoutComplete } from './lobbyLoadout';
import { icon } from './components/icons';
import { notificationManager } from './NotificationManager';
import { modalManager } from './overlays/ModalManager';
import { es, equipmentName } from '../../strings/es';
import { displayName } from '../utils/displayName';
import { setNickname } from '../identity';

// Max players per room — mirrors `MAX_PLAYERS` in server.ts.
const MAX_SQUAD = 6;

// Options shown in the Opciones panel. Each entry must be wired to
// actual game config (presentation-only mocks mislead hosts).
type RoeRule = {
  id: string;
  title: string;
  description: string;
  defaultOn: boolean;
  riskLabel: string;
  riskVariant: 'rust' | 'olive';
};

const ROE_RULES: RoeRule[] = [
  {
    id: 'endless-horde',
    title: es.lobby.options.abominationFest,
    description: es.lobby.options.abominationFestDesc,
    defaultOn: false,
    riskLabel: es.lobby.options.hard,
    riskVariant: 'rust',
  },
];

function roleFor(charClass: string): string {
  return es.roles[charClass] ?? es.common.survivor;
}

type TakenBy = { name: string; seat: number };

// Where a panel mounts. `top`/`main`/`side` sit inside the scrolling stack;
// `dock` is pinned under it so the start button never scrolls away.
type LobbySlot = 'top' | 'main' | 'side' | 'dock';
const LOBBY_SLOTS: LobbySlot[] = ['top', 'main', 'side', 'dock'];

// Host-left banner countdown duration (ms). Drives the rust banner's
// 3 → 2 → 1 chip while the next operative is promoted to host.
const HOST_LEFT_COUNTDOWN_SECONDS = 3;

export class LobbyUI {
  private container: HTMLElement;
  private localPlayerId: PlayerId;
  private roomId: string;
  private state: GameState | null = null;
  // Only playable maps ever land here — the server computes the flag.
  private availableMaps: { id: string; name: string; width: number; height: number }[] = [];
  /** True once /api/maps has answered, so "no maps" isn't confused with "still loading". */
  private mapsLoaded = false;
  private selectedMapId: string | null = null;
  private mapMenuOpen = false;
  private abominationFest = false;
  private nameDebounceTimer: number | null = null;
  private roomPillCopied = false;
  private panelCache: Record<string, string> = {};
  private selectedSurvivorId: string | null = null;
  private dossierModalId: string | null = null;
  private roeRuleStates: Record<string, boolean> = (() => {
    const initial: Record<string, boolean> = {};
    for (const rule of ROE_RULES) initial[rule.id] = rule.defaultOn;
    return initial;
  })();

  // ─── Degraded-state plumbing ────────────────────────────────
  // Host-left banner. Wired to STATE_UPDATE via update() — server
  // stamps `lobby.hostLeftAt` when the host disconnects in lobby
  // phase and survivors remain. We debounce on the timestamp so a
  // re-render of the same state doesn't refire.
  private hostLeftActive = false;
  private hostLeftSecondsRemaining = HOST_LEFT_COUNTDOWN_SECONDS;
  private hostLeftTimer: number | null = null;
  private lastSeenHostLeftAt: number | null = null;

  // Connection-lost scrim. Driven by NetworkManager's existing
  // reconnect/drop callbacks (see installConnectionListeners).
  private connectionLost = false;
  private reconnectMeta: string | null = null;
  private prevOnReconnecting:
    | ((attempt: number, maxAttempts: number, nextRetryDelayMs?: number) => void)
    | null = null;
  private prevOnConnected: (() => void) | null = null;
  private prevOnDisconnected: (() => void) | null = null;

  // Live scrim meta state.
  private disconnectedAt: number | null = null;
  private nextRetryAt: number | null = null;
  private currentAttempt: number = 0;
  private maxAttempts: number = 0;
  private connectionMetaTimer: number | null = null;

  constructor(playerId: PlayerId, roomId: string) {
    this.localPlayerId = playerId;
    this.roomId = roomId;

    this.container = document.createElement('div');
    this.container.id = 'lobby-ui';
    this.container.className = 'lobby';
    document.body.appendChild(this.container);

    this.attachListeners();
    this.installConnectionListeners();
    this.fetchMaps();
    this.render();
  }

  /**
   * Tear-down hook. Clears the host-left timer and restores any
   * NetworkManager callbacks we wrapped during construction.
   */
  public destroy(): void {
    if (this.hostLeftTimer !== null) {
      clearInterval(this.hostLeftTimer);
      this.hostLeftTimer = null;
    }
    if (this.connectionMetaTimer !== null) {
      clearInterval(this.connectionMetaTimer);
      this.connectionMetaTimer = null;
    }
    if (this.nameDebounceTimer !== null) {
      clearTimeout(this.nameDebounceTimer);
      this.nameDebounceTimer = null;
    }
    document.removeEventListener('click', this.handleScrimClick);
    networkManager.onReconnecting = this.prevOnReconnecting ?? undefined;
    networkManager.onConnected = this.prevOnConnected ?? undefined;
    networkManager.onDisconnected = this.prevOnDisconnected ?? undefined;
    const scrimEl = document.body.querySelector(
      ':scope > [data-scrim="connection-lost"]',
    );
    if (scrimEl) scrimEl.remove();
    this.container.remove();
  }

  /**
   * Production trigger AND debug hook. Wired to STATE_UPDATE via
   * update() — fires when `lobby.hostLeftAt` changes from the last
   * seen value. The leading `__` is preserved as an "internal" marker
   * (and so `lobbyUi.__triggerHostLeftBanner()` still works from the
   * devtools console for manual verification). Idempotent: a duplicate
   * call while the banner is already active is a no-op.
   */
  public __triggerHostLeftBanner(): void {
    if (this.hostLeftActive) return;
    this.hostLeftActive = true;
    this.hostLeftSecondsRemaining = HOST_LEFT_COUNTDOWN_SECONDS;
    if (this.hostLeftTimer !== null) clearInterval(this.hostLeftTimer);
    this.hostLeftTimer = window.setInterval(() => {
      this.hostLeftSecondsRemaining -= 1;
      if (this.hostLeftSecondsRemaining <= 0) {
        if (this.hostLeftTimer !== null) {
          clearInterval(this.hostLeftTimer);
          this.hostLeftTimer = null;
        }
        this.hostLeftActive = false;
      }
      this.render();
    }, 1000);
    this.render();
  }

  /**
   * Wraps NetworkManager's existing reconnect callbacks so the
   * connection-lost scrim renders in-lobby instead of (or alongside)
   * the toast. Original callbacks are still invoked.
   */
  private installConnectionListeners(): void {
    this.prevOnReconnecting = networkManager.onReconnecting ?? null;
    this.prevOnConnected = networkManager.onConnected ?? null;
    this.prevOnDisconnected = networkManager.onDisconnected ?? null;

    networkManager.onReconnecting = (attempt, maxAttempts, nextRetryDelayMs) => {
      const wasConnected = !this.connectionLost;
      this.connectionLost = true;
      // Capture the disconnect-baseline on the first onReconnecting
      // tick after a previously-connected state. NetworkManager calls
      // this just before each setTimeout, so the very first call is
      // the right anchor for the "offline for mm:ss" timer.
      if (wasConnected || this.disconnectedAt === null) {
        this.disconnectedAt = Date.now();
      }
      this.currentAttempt = attempt;
      this.maxAttempts = maxAttempts;
      this.nextRetryAt =
        typeof nextRetryDelayMs === 'number' ? Date.now() + nextRetryDelayMs : null;
      this.startConnectionMetaTimer();
      this.refreshConnectionMeta();
      this.render();
      if (this.prevOnReconnecting) {
        this.prevOnReconnecting(attempt, maxAttempts, nextRetryDelayMs);
      }
    };

    networkManager.onConnected = () => {
      this.connectionLost = false;
      this.reconnectMeta = null;
      this.disconnectedAt = null;
      this.nextRetryAt = null;
      this.currentAttempt = 0;
      this.stopConnectionMetaTimer();
      this.render();
      if (this.prevOnConnected) this.prevOnConnected();
    };

    networkManager.onDisconnected = () => {
      // Hard disconnect (max retries hit). Keep the scrim up so the
      // reconnect button stays available.
      this.connectionLost = true;
      this.nextRetryAt = null;
      if (this.disconnectedAt === null) this.disconnectedAt = Date.now();
      this.startConnectionMetaTimer();
      this.refreshConnectionMeta(es.connection.dropped);
      this.render();
      if (this.prevOnDisconnected) this.prevOnDisconnected();
    };
  }

  /** Start the 1Hz scrim-meta ticker. Idempotent. */
  private startConnectionMetaTimer(): void {
    if (this.connectionMetaTimer !== null) return;
    this.connectionMetaTimer = window.setInterval(() => {
      this.refreshConnectionMeta();
    }, 1000);
  }

  private stopConnectionMetaTimer(): void {
    if (this.connectionMetaTimer !== null) {
      clearInterval(this.connectionMetaTimer);
      this.connectionMetaTimer = null;
    }
  }

  /**
   * Compose the scrim meta line and patch it in place (no full
   * re-render). Pieces: attempt count · time-since-disconnect mm:ss ·
   * next-retry countdown. Falls back to a status-only line when
   * `headlineOverride` is provided (hard drop).
   */
  private refreshConnectionMeta(headlineOverride?: string): void {
    const parts: string[] = [];

    if (headlineOverride) {
      parts.push(headlineOverride);
    } else if (this.maxAttempts > 0) {
      parts.push(es.connection.retryingAttempt(this.currentAttempt, this.maxAttempts));
    } else {
      parts.push(es.connection.retrying);
    }

    if (this.disconnectedAt !== null) {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - this.disconnectedAt) / 1000));
      const mm = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const ss = (elapsedSec % 60).toString().padStart(2, '0');
      parts.push(es.connection.offlineFor(`${mm}:${ss}`));
    }

    if (this.nextRetryAt !== null) {
      const remaining = Math.max(0, Math.ceil((this.nextRetryAt - Date.now()) / 1000));
      parts.push(remaining > 0 ? es.connection.nextRetry(remaining) : es.connection.reconnectingNow);
    }

    this.reconnectMeta = parts.join(' · ');

    // Patch the scrim meta text in place so the entry animation
    // doesn't replay every tick.
    const scrimEl = document.body.querySelector(
      ':scope > [data-scrim="connection-lost"]',
    );
    const metaEl = scrimEl?.querySelector('.lobby-scrim__meta') as HTMLElement | null;
    if (metaEl) metaEl.textContent = this.reconnectMeta;
  }

  private async fetchMaps(): Promise<void> {
    try {
      const res = await fetch('/api/maps');
      if (res.ok) {
        const maps = await res.json() as ({ playable?: boolean } & typeof this.availableMaps[number])[];
        // An unplayable map never spawns zombies, so it is not offered at all.
        this.availableMaps = maps.filter(m => m.playable !== false);
        this.mapsLoaded = true;
        if (this.availableMaps.length > 0 && !this.selectedMapId) {
          this.selectedMapId = this.availableMaps[0].id;
        }
        this.render();
      }
    } catch (e) {
      console.error('Failed to load maps', e);
    }
  }

  public update(state: GameState): void {
    const isFirstUpdate = this.state === null;
    const incomingHostLeftAt = state.lobby.hostLeftAt ?? null;

    if (isFirstUpdate) {
      // Seed from the very first state so a player joining a room
      // post-event doesn't see a stale banner.
      this.lastSeenHostLeftAt = incomingHostLeftAt;
    } else if (
      incomingHostLeftAt !== null &&
      incomingHostLeftAt !== this.lastSeenHostLeftAt
    ) {
      this.lastSeenHostLeftAt = incomingHostLeftAt;
      this.__triggerHostLeftBanner();
    }

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

  private render(): void {
    if (!this.state) {
      this.container.innerHTML = `
        <div class="lobby__stack">
          <div class="fm-panel lobby-panel lobby-panel--waiting">
            <div class="lobby__waiting">${this.escHtml(es.lobby.connecting)}</div>
          </div>
        </div>`;
      this.panelCache = {};
      return;
    }

    const players = this.state.lobby.players;
    const isHost = players.length > 0 && players[0].id === this.localPlayerId;
    const myPlayer = players.find(p => p.id === this.localPlayerId);

    // Who holds each character, and their seat (lobby order = player colour).
    const takenClasses = new Map<string, TakenBy>();
    players.forEach((p, seat) => {
      if (!p.characterClass) return;
      // A generated id resolves to the class itself, which would just repeat
      // the portrait's own name; fall back to "Jugador N".
      const shown = displayName(p.name, p.characterClass);
      const name = shown === p.characterClass ? `${es.lobby.playerFallback} ${seat + 1}` : shown;
      takenClasses.set(p.characterClass, { name, seat });
    });

    const abomFest = !!(this.state.config?.abominationFest ?? this.abominationFest);
    this.abominationFest = abomFest;

    const selectedMap = this.availableMaps.find(m => m.id === this.selectedMapId) ?? null;
    const myChar = myPlayer?.characterClass || null;
    const allReady = players.length > 0 && players.every(p => isLoadoutComplete(p));

    // Build the list of panels for this render pass. Each entry is a
    // stable key, the slot it lives in, and its HTML output; we only swap
    // DOM for keys whose HTML actually changed since the last render.
    // Slot order below is the multi-column reading order; the portrait
    // order comes from CSS `order` (the slots are `display: contents`).
    const panels: Array<{ key: string; slot: LobbySlot; html: string }> = [];
    const hostId = players[0]?.id ?? null;
    if (this.hostLeftActive) panels.push({ key: 'hostLeftBanner', slot: 'top', html: this.renderHostLeftBanner() });
    panels.push({ key: 'you', slot: 'main', html: this.renderYouPanel(myPlayer ?? null, myChar, takenClasses) });
    if (myPlayer) panels.push({ key: 'loadout', slot: 'main', html: this.renderLoadoutPanel(myPlayer.id, myChar, players) });
    panels.push({ key: 'invite', slot: 'side', html: this.renderInvitePanel() });
    panels.push({ key: 'players', slot: 'side', html: this.renderPlayersPanel(players, hostId) });
    panels.push({ key: 'map', slot: 'side', html: this.renderMapPanel(selectedMap, isHost) });
    panels.push({ key: 'options', slot: 'side', html: this.renderOptionsPanel(abomFest, isHost) });
    panels.push({ key: 'footer', slot: 'dock', html: this.renderFooterPanel(isHost, allReady) });

    const slots = this.ensureSlots();

    // Capture focus + typed value on the name input so we can restore
    // them if (and only if) the `you` panel is actually replaced.
    const activeEl = document.activeElement;
    const nicknameBefore = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
    const hadFocus = !!nicknameBefore && activeEl === nicknameBefore;
    const prevCursor = nicknameBefore?.selectionStart ?? null;
    const prevValue = nicknameBefore?.value ?? null;

    const liveKeys = new Set(panels.map(p => `${p.slot}:${p.key}`));
    for (const [slotName, slotEl] of Object.entries(slots)) {
      Array.from(slotEl.children).forEach(child => {
        const k = (child as HTMLElement).dataset.panel;
        if (!k || !liveKeys.has(`${slotName}:${k}`)) {
          if (k) delete this.panelCache[k];
          child.remove();
        }
      });
    }

    const rerendered = new Set<string>();
    const prevBySlot: Partial<Record<LobbySlot, Element>> = {};
    for (const p of panels) {
      const slotEl = slots[p.slot];
      const prevEl = prevBySlot[p.slot] ?? null;
      let existing = slotEl.querySelector(`:scope > [data-panel="${p.key}"]`) as HTMLElement | null;
      const cached = this.panelCache[p.key];

      if (!existing) {
        // First time this panel is mounted — let the fm-panel fade-in play.
        const tmp = document.createElement('div');
        tmp.innerHTML = p.html.trim();
        const fresh = tmp.firstElementChild as HTMLElement | null;
        if (!fresh) continue;
        fresh.setAttribute('data-panel', p.key);

        if (prevEl) prevEl.after(fresh);
        else slotEl.prepend(fresh);
        existing = fresh;
        this.panelCache[p.key] = p.html;
        rerendered.add(p.key);
      } else if (cached !== p.html) {
        // In-place morph so the panel's entry animation doesn't replay.
        // Copy attributes off the freshly rendered section, then swap
        // only its children.
        const tmp = document.createElement('div');
        tmp.innerHTML = p.html.trim();
        const fresh = tmp.firstElementChild as HTMLElement | null;
        if (!fresh) continue;
        fresh.setAttribute('data-panel', p.key);

        Array.from(existing.attributes).forEach(a => {
          if (!fresh.hasAttribute(a.name)) existing!.removeAttribute(a.name);
        });
        Array.from(fresh.attributes).forEach(a => {
          if (existing!.getAttribute(a.name) !== a.value) existing!.setAttribute(a.name, a.value);
        });
        existing.innerHTML = fresh.innerHTML;
        this.panelCache[p.key] = p.html;
        rerendered.add(p.key);
      } else if (prevEl ? existing.previousElementSibling !== prevEl : existing !== slotEl.firstElementChild) {
        if (prevEl) prevEl.after(existing);
        else slotEl.prepend(existing);
      }
      prevBySlot[p.slot] = existing;
    }

    if (hadFocus && rerendered.has('you')) {
      const nextInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
      if (nextInput) {
        // The panel may re-render because someone picked a character
        // while this player is typing; keep what they typed.
        if (prevValue !== null) nextInput.value = prevValue;
        nextInput.focus();
        if (prevCursor !== null) nextInput.setSelectionRange(prevCursor, prevCursor);
      }
    }

    if (rerendered.has('options')) {
      const abomCheck = this.container.querySelector('#lobby-abom-fest') as HTMLInputElement | null;
      if (abomCheck) abomCheck.checked = this.abominationFest;
    }

    // ─── Connection-lost scrim + dimmed lobby ──────────────────
    // The scrim is appended to document.body (sibling of #lobby-ui)
    // so the .lobby--dimmed filter doesn't blur or grayscale it too.
    this.container.classList.toggle('lobby--dimmed', this.connectionLost);
    if (this.connectionLost) {
      this.container.setAttribute('aria-hidden', 'true');
    } else {
      this.container.removeAttribute('aria-hidden');
    }

    let scrimEl = document.body.querySelector(
      ':scope > [data-scrim="connection-lost"]',
    ) as HTMLElement | null;
    if (this.connectionLost) {
      if (!scrimEl) {
        const tmp = document.createElement('div');
        tmp.innerHTML = this.renderConnectionLostScrim().trim();
        scrimEl = tmp.firstElementChild as HTMLElement | null;
        if (scrimEl) document.body.appendChild(scrimEl);
      } else {
        // Refresh the meta line in place so the scrim's entry
        // animation doesn't replay every reconnect attempt.
        const metaEl = scrimEl.querySelector('.lobby-scrim__meta') as HTMLElement | null;
        if (metaEl) metaEl.textContent = this.reconnectMeta ?? es.connection.retrying;
      }
    } else if (scrimEl) {
      scrimEl.remove();
    }
  }

  /**
   * Mounts the stack (top, main and side columns) and the footer dock once,
   * replacing the "connecting" placeholder, and returns the slot elements.
   */
  private ensureSlots(): Record<LobbySlot, HTMLElement> {
    const find = (slot: LobbySlot) =>
      this.container.querySelector(`[data-slot="${slot}"]`) as HTMLElement | null;
    if (LOBBY_SLOTS.every(find)) {
      return Object.fromEntries(LOBBY_SLOTS.map(slot => [slot, find(slot)!])) as Record<LobbySlot, HTMLElement>;
    }

    this.container.innerHTML = `
      <div class="lobby__stack">
        <div class="lobby__slot lobby__slot--top" data-slot="top"></div>
        <div class="lobby__slot lobby__slot--main" data-slot="main"></div>
        <div class="lobby__slot lobby__slot--side" data-slot="side"></div>
      </div>
      <div class="lobby__dock" data-slot="dock"></div>
    `;
    this.panelCache = {};
    return Object.fromEntries(LOBBY_SLOTS.map(slot => [slot, find(slot)!])) as Record<LobbySlot, HTMLElement>;
  }

  // ─── Panel renderers ─────────────────────────────────────────

  /**
   * Invite block: room code in large text, `Copiar enlace` button and a
   * one-line hint. Pulses while the local player is alone in the room.
   */
  private renderInvitePanel(): string {
    const t = es.lobby;
    const copied = this.roomPillCopied;
    const isSolo = (this.state?.lobby.players.length ?? 0) === 1;

    const btnClass = [
      'fm-btn',
      'fm-btn--secondary',
      'btn',
      'btn--secondary',
      'lobby-invite__copy',
      copied ? 'lobby-invite__copy--copied' : '',
    ].filter(Boolean).join(' ');

    return `
      <section class="fm-panel lobby-panel lobby-panel--invite${isSolo ? ' lobby-invite--pulse' : ''}">
        <h2 class="fm-kicker lobby-invite__title">${this.escHtml(t.inviteTitle)}</h2>
        <div class="lobby-invite__row">
          <div class="lobby-invite__code fm-mono" aria-label="${this.escHtml(`${t.roomCode}: ${this.roomId}`)}">${this.escHtml(this.roomId)}</div>
          <button
            type="button"
            class="${btnClass}"
            data-action="copy-link"
            aria-label="${this.escHtml(copied ? t.copied : t.copyLinkAria)}"
          >
            <span class="btn__icon fm-btn__icon" aria-hidden="true">${icon(copied ? 'Check' : 'Copy', 'sm')}</span>
            <span class="btn__label fm-btn__label" aria-live="polite">${this.escHtml(copied ? t.copied : t.copyLink)}</span>
          </button>
        </div>
        <p class="lobby-invite__hint">${this.escHtml(t.inviteHint)}</p>
      </section>
    `;
  }

  /**
   * Host-left banner. Sits at the very top of .lobby__stack while the
   * server promotes a new host. role=status + aria-live=polite.
   */
  private renderHostLeftBanner(): string {
    const seconds = Math.max(0, this.hostLeftSecondsRemaining);
    return `
      <div class="lobby-banner" role="status" aria-live="polite">
        <span class="lobby-banner__icon" aria-hidden="true"></span>
        <div class="lobby-banner__text">
          <span class="lobby-banner__title">${this.escHtml(es.lobby.hostLeftTitle)}</span>
          <span class="lobby-banner__sub">${this.escHtml(es.lobby.hostLeftBody)}</span>
        </div>
        <span class="lobby-banner__countdown" aria-label="${this.escHtml(es.lobby.secondsLeft(seconds))}">
          <span class="lobby-banner__countdown-num">${seconds}</span>
          <span aria-hidden="true">s</span>
        </span>
      </div>
    `;
  }

  /**
   * Connection-lost scrim. Full-viewport alertdialog over the dimmed
   * lobby. The reconnect button drives NetworkManager.connect().
   */
  private renderConnectionLostScrim(): string {
    const t = es.connection;
    const meta = this.escHtml(this.reconnectMeta ?? t.retrying);
    return `
      <div
        class="lobby-scrim"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lobby-scrim-title"
        data-scrim="connection-lost"
      >
        <div class="fm-panel lobby-scrim__card">
          <span class="fm-panel-dot fm-panel-dot--tl" aria-hidden="true"></span>
          <span class="fm-panel-dot fm-panel-dot--br" aria-hidden="true"></span>

          <h2 id="lobby-scrim-title" class="lobby-scrim__title">${this.escHtml(t.lostTitle)}</h2>
          <p class="lobby-scrim__sub">${this.escHtml(t.lostBody)}</p>
          <div class="lobby-scrim__meta">${meta}</div>

          <div class="lobby-scrim__actions">
            <button type="button" class="fm-btn fm-btn--reconnect" data-action="reconnect">
              <span class="fm-btn__label">${this.escHtml(t.reconnect)}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderPlayersPanel(
    players: { id: PlayerId; name: string; ready: boolean; characterClass: string; startingWeapon?: string }[],
    hostId: PlayerId | null,
  ): string {
    const t = es.lobby;
    const rows = players.map(p => {
      const ready = isLoadoutComplete(p);
      const weaponLabel = p.startingWeapon
        ? equipmentName({ equipmentId: p.startingWeapon, name: p.startingWeapon })
        : '';
      const isMe = p.id === this.localPlayerId;
      const isHost = p.id === hostId;
      const claims = [p.characterClass, weaponLabel].filter(Boolean).map(label =>
        `<span class="lobby-squad__class fm-mono">${this.escHtml(label)}</span>`,
      ).join('<span class="lobby-squad__dot" aria-hidden="true">·</span>');
      const badge = ready
        ? `<span class="lobby-status lobby-status--ready">● ${this.escHtml(t.ready)}</span>`
        : `<span class="lobby-status lobby-status--standby">● ${this.escHtml(t.choosing)}</span>`;
      const status = claims
        ? `${claims}<span class="lobby-squad__dot" aria-hidden="true">·</span>${badge}`
        : badge;

      return `
        <li class="lobby-squad__row">
          <div class="lobby-squad__head">
            <span class="fm-stencil lobby-squad__name">${this.escHtml(displayName(p.name, p.characterClass) || t.playerFallback)}</span>
            ${isMe ? `<span class="lobby-squad__you">${this.escHtml(t.you)}</span>` : ''}
            ${isHost ? `<span class="lobby-pill lobby-pill--amber">${this.escHtml(t.host)}</span>` : ''}
          </div>
          <div class="lobby-squad__sub">${status}</div>
        </li>
      `;
    }).join('');

    return `
      <section class="fm-panel lobby-panel lobby-panel--players">
        <div class="lobby-squad__header">
          <h2 class="fm-kicker fm-kicker--secondary" id="lobby-players-title">${this.escHtml(t.players)}</h2>
          <div class="lobby-squad__count fm-mono">${players.length}/${MAX_SQUAD}</div>
        </div>
        <ul class="lobby-squad" aria-labelledby="lobby-players-title">${rows}</ul>
      </section>
    `;
  }

  /** Name input + character grid. */
  private renderYouPanel(
    myPlayer: { id: PlayerId; name: string } | null,
    myChar: string | null,
    takenClasses: Map<string, TakenBy>,
  ): string {
    const t = es.lobby;
    const characterKeys = Object.keys(CHARACTER_DEFINITIONS);

    const cells = characterKeys.map(name => {
      const isSelected = myChar === name;
      const taken = takenClasses.get(name);
      const takenByOther = !!taken && !isSelected;
      const takenByName = taken?.name ?? '';

      const cellClass = [
        'lobby-roster__cell',
        isSelected ? 'lobby-roster__cell--selected' : '',
        takenByOther ? 'lobby-roster__cell--taken' : '',
      ].filter(Boolean).join(' ');

      // A taken portrait wears its picker's player colour (player-avatar.css
      // uses the same seat → --player-N mapping).
      const takerStyle = takenByOther
        ? ` style="--taker: var(--player-${(taken!.seat % MAX_SQUAD) + 1})"`
        : '';
      const takenOverlay = takenByOther
        ? `<div class="lobby-roster__taken-label" aria-hidden="true">${this.escHtml(takenByName)}</div>`
        : '';
      const aria = takenByOther ? t.takenBy(name, takenByName) : t.pickAria(name);

      return `
        <button
          type="button"
          class="${cellClass}"${takerStyle}
          data-action="select-class"
          data-id="${this.escHtml(name)}"
          ${takenByOther ? 'disabled' : ''}
          role="radio"
          aria-checked="${isSelected}"
          aria-label="${this.escHtml(aria)}"
        >
          ${renderPhotoSlot({
            size: 'md',
            name,
            role: roleFor(name),
            selected: isSelected,
            imageUrl: characterImageUrl(name),
            captionPlacement: 'band',
          })}
          ${takenOverlay}
        </button>
      `;
    }).join('');

    const nameField = myPlayer
      ? `
        <div class="lobby-you__field">
          <label class="fm-kicker fm-kicker--secondary" for="lobby-nickname">${this.escHtml(t.nameLabel)}</label>
          <input
            id="lobby-nickname"
            class="fm-input lobby-you__name"
            type="text"
            value="${this.escHtml(myPlayer.name)}"
            placeholder="${this.escHtml(t.namePlaceholder)}"
            maxlength="24"
            autocomplete="off"
          />
        </div>
      `
      : '';

    return `
      <section class="fm-panel lobby-panel lobby-panel--you">
        ${nameField}
        <h2 class="fm-kicker fm-kicker--secondary lobby-you__pick" id="lobby-pick-title">${this.escHtml(t.pickSurvivor)}</h2>
        <div class="lobby-roster" role="radiogroup" aria-labelledby="lobby-pick-title">
          ${cells}
        </div>
      </section>
    `;
  }

  /** Picked survivor's dossier strip + starting weapon grid. */
  private renderLoadoutPanel(
    myPlayerId: PlayerId,
    myChar: string | null,
    players: { id: PlayerId; startingWeapon?: string }[],
  ): string {
    return `
      <section class="fm-panel lobby-panel lobby-panel--loadout">
        ${myChar ? renderLobbyDossierStrip(myChar, roleFor(myChar)) : ''}
        ${this.renderArmory(myPlayerId, players)}
      </section>
    `;
  }

  /**
   * Starting weapon grid. The six grey-back cards are claimed here rather than
   * dealt, so a squad can see — and guarantee — a door opener before starting
   * (rules/16-card-registry.md#starting-equipment-6-cards-grey-backs).
   */
  private renderArmory(
    myPlayerId: PlayerId,
    players: { id: PlayerId; startingWeapon?: string }[],
  ): string {
    const t = es.lobby;

    // Door-opening weapons carry an extra line, so group them: in the
    // two-column grid they then share a row and the plain cards stay short.
    const options = weaponOptions(players, myPlayerId);
    const ordered = [
      ...options.filter(o => !o.card.canOpenDoor),
      ...options.filter(o => o.card.canOpenDoor),
    ];

    const cells = ordered.map(option => {
      const name = equipmentName(option.card);
      const gone = option.remaining <= 0;
      const cellClass = [
        'lobby-armory__cell',
        option.mine ? 'lobby-armory__cell--selected' : '',
        gone ? 'lobby-armory__cell--taken' : '',
      ].filter(Boolean).join(' ');

      let supply: string;
      if (option.mine) supply = t.weaponMine;
      else if (gone) supply = t.weaponGone;
      else supply = t.weaponLeft(option.remaining);

      const opensDoor = !!option.card.canOpenDoor;
      const noisyDoor = opensDoor && !!option.card.openDoorNoise;
      const doorTrait = opensDoor
        ? { icon: 'DoorOpen', label: t.opensDoors, note: noisyDoor ? t.opensDoorsNoisy : undefined }
        : undefined;
      const doorAria = opensDoor ? `, ${t.opensDoorsAria(noisyDoor)}` : '';

      return `
        <button
          type="button"
          class="${cellClass}"
          data-action="select-weapon"
          data-id="${this.escHtml(option.equipmentId)}"
          ${gone ? 'disabled' : ''}
          role="radio"
          aria-checked="${option.mine}"
          aria-label="${this.escHtml((gone ? t.weaponGoneAria(name) : t.pickWeaponAria(name)) + doorAria)}"
        >
          ${renderItemCard(option.card, { variant: 'weapon', showSlot: false, trait: doorTrait })}
          <div class="lobby-armory__meta">
            <span class="lobby-armory__supply">${this.escHtml(supply)}</span>
          </div>
        </button>
      `;
    }).join('');

    return `
      <h2 class="fm-kicker fm-kicker--secondary lobby-you__pick" id="lobby-armory-title">${this.escHtml(t.pickWeapon)}</h2>
      <div class="lobby-armory" role="radiogroup" aria-labelledby="lobby-armory-title">
        ${cells}
      </div>
    `;
  }

  private renderMapPanel(
    selectedMap: { id: string; name: string; width: number; height: number } | null,
    isHost: boolean,
  ): string {
    const t = es.lobby;
    const maps = this.availableMaps;
    const size = (m: { width: number; height: number }) => `${m.width}×${m.height}`;
    const canChoose = isHost && maps.length > 1;
    if (!canChoose) this.mapMenuOpen = false;

    // The picked map as a name + size line; shared by the trigger and the
    // static readout.
    const current = selectedMap
      ? `<span class="lobby-map__name" id="lobby-map-current">${this.escHtml(selectedMap.name)}</span>
         <span class="lobby-map__size">${size(selectedMap)}</span>`
      : `<span class="lobby-map__name" id="lobby-map-current">${this.escHtml(this.mapsLoaded ? t.noPlayableMaps : t.loadingMaps)}</span>`;

    let body: string;
    if (canChoose) {
      // Custom list that opens below the trigger. A native <select> on macOS
      // pops its menu over itself, so with the current map on top it looked
      // like nothing opened.
      const list = this.mapMenuOpen
        ? `<div class="lobby-map__list" role="listbox" aria-labelledby="lobby-map-title">
            ${maps.map(m => `
              <button type="button" class="lobby-map__option" role="option"
                data-action="pick-map" data-id="${this.escHtml(m.id)}"
                aria-selected="${m.id === this.selectedMapId}">
                <span class="lobby-map__name">${this.escHtml(m.name)}</span>
                <span class="lobby-map__size">${size(m)}</span>
                ${m.id === this.selectedMapId ? `<span class="lobby-map__check" aria-hidden="true">${icon('Check', 'xs')}</span>` : ''}
              </button>`).join('')}
          </div>`
        : '';
      body = `
        <div class="lobby-map">
          <button type="button" class="lobby-map__trigger" data-action="toggle-map-menu"
            aria-haspopup="listbox" aria-expanded="${this.mapMenuOpen}"
            aria-labelledby="lobby-map-title lobby-map-current">
            ${current}
            <span class="lobby-map__caret" aria-hidden="true">${icon('ChevronDown', 'sm')}</span>
          </button>
          ${list}
        </div>
      `;
    } else {
      const note = !isHost
        ? t.mapHostPicks
        : maps.length === 1 ? t.mapOnlyOne : '';
      body = `
        <div class="lobby-map lobby-map--static">
          <div class="lobby-map__readout">${current}</div>
          ${note ? `<div class="lobby-map__note">${this.escHtml(note)}</div>` : ''}
        </div>
      `;
    }

    return `
      <section class="fm-panel lobby-panel lobby-panel--map">
        <h2 class="fm-kicker fm-kicker--secondary" id="lobby-map-title">${this.escHtml(t.map)}</h2>
        ${body}
      </section>
    `;
  }

  private renderOptionsPanel(abomFest: boolean, isHost: boolean): string {
    const disabledAttr = isHost ? '' : 'disabled';
    const readonlyClass = isHost ? '' : ' lobby-roe--readonly';

    // Keep `endless-horde` synced to the canonical abominationFest flag
    // before rendering so the row reflects host-driven config.
    this.roeRuleStates['endless-horde'] = abomFest;

    const rows = ROE_RULES.map(rule => {
      const on = !!this.roeRuleStates[rule.id];
      const checkboxId = `lobby-roe-${rule.id}`;
      const inputId = rule.id === 'endless-horde' ? 'lobby-abom-fest' : checkboxId;
      const chipVariant = rule.riskVariant === 'rust' ? 'lobby-chip lobby-chip--rust' : 'lobby-chip';
      return `
        <label class="lobby-roe">
          <input
            type="checkbox"
            id="${inputId}"
            class="lobby-roe__check"
            data-roe-id="${rule.id}"
            ${on ? 'checked' : ''}
            ${disabledAttr}
          />
          <div class="lobby-roe__text">
            <div class="fm-stencil lobby-roe__title"><span>${this.escHtml(rule.title)}</span><span class="${chipVariant} lobby-roe__tag">${this.escHtml(rule.riskLabel)}</span></div>
            <div class="lobby-roe__desc">${this.escHtml(rule.description)}</div>
          </div>
        </label>
      `;
    }).join('');

    return `
      <section class="fm-panel lobby-panel lobby-panel--options${readonlyClass}">
        <h2 class="fm-kicker fm-kicker--secondary" id="lobby-options-title">${this.escHtml(es.lobby.options.title)}</h2>
        <div class="lobby-roe-list" role="group" aria-labelledby="lobby-options-title">
          ${rows}
        </div>
      </section>
    `;
  }

  private renderFooterPanel(isHost: boolean, allReady: boolean): string {
    const t = es.lobby;
    const players = this.state?.lobby.players ?? [];
    const totalCount = players.length;
    const readyCount = players.filter(p => isLoadoutComplete(p)).length;
    const missingNames = players
      .filter(p => !isLoadoutComplete(p))
      .map(p => displayName(p.name, p.characterClass) || t.playerFallback)
      .join(', ');

    let primary: string;
    if (isHost) {
      const noPlayableMap = this.mapsLoaded && this.availableMaps.length === 0;
      const btn = renderButton({
        label: this.escHtml(t.startGame(readyCount, totalCount)),
        icon: 'Play',
        variant: 'primary',
        size: 'lg',
        fullWidth: true,
        disabled: !allReady || noPlayableMap,
        dataAction: 'start-game',
      });
      const missing = !allReady && missingNames
        ? `<div class="lobby-footer__missing" role="status">${this.escHtml(t.missing(missingNames))}</div>`
        : '';
      const noMap = noPlayableMap
        ? `<div class="lobby-footer__missing" role="status">${this.escHtml(t.noPlayableMaps)}</div>`
        : '';
      primary = `${noMap}${missing}${btn}`;
    } else {
      const hostName = displayName(players[0]?.name, players[0]?.characterClass) || t.host;
      primary = `<div class="lobby__waiting">${this.escHtml(t.waitingFor(hostName))}</div>`;
    }

    const leaveBtn = renderButton({
      label: this.escHtml(t.leave),
      icon: 'ArrowLeft',
      variant: 'ghost',
      fullWidth: true,
      dataAction: 'leave-room',
    });

    return `
      <section class="fm-panel lobby-panel lobby-panel--footer">
        <div class="lobby-footer${isHost ? ' lobby-footer--host' : ''}">
          ${primary}
          ${leaveBtn}
        </div>
      </section>
    `;
  }

  // ─── Event Handling ──────────────────────────────────────────

  private pushNicknameUpdate(): void {
    const nameInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
    const nextName = nameInput?.value.trim();
    if (!nextName) return;
    setNickname(nextName);
    networkManager.sendAction({
      playerId: this.localPlayerId,
      type: ActionType.UPDATE_NICKNAME,
      payload: { name: nextName },
    });
  }

  /** Document-level reconnect handler — the scrim lives outside
   *  the lobby container so .lobby--dimmed doesn't blur it. */
  private handleScrimClick = (e: Event): void => {
    const target = e.target as HTMLElement;
    // Any click outside the open map menu closes it.
    if (this.mapMenuOpen && !target.closest('.lobby-map')) {
      this.mapMenuOpen = false;
      this.render();
    }
    const reconnectBtn = target.closest('[data-action="reconnect"]') as HTMLElement | null;
    if (!reconnectBtn) return;
    networkManager.connect();
  };

  private attachListeners(): void {
    document.addEventListener('click', this.handleScrimClick);

    // Click delegation.
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actionEl = target.closest('[data-action]') as HTMLElement | null;

      if (!actionEl) return;
      const action = actionEl.dataset.action;

      if (action === 'copy-link') {
        this.handleRoomPillCopy();
        return;
      }

      if (action === 'select-class') {
        const charClass = actionEl.dataset.id;
        const nameInput = this.container.querySelector('#lobby-nickname') as HTMLInputElement | null;
        if (charClass) {
          networkManager.sendAction({
            playerId: this.localPlayerId,
            type: ActionType.SELECT_CHARACTER,
            payload: { characterClass: charClass, name: nameInput?.value },
          });
          // Only follow the pick if the full tree is already open — picking
          // itself no longer opens anything.
          if (this.dossierModalId && modalManager.isOpen(this.dossierModalId)) {
            this.openDossier(charClass);
          }
        }
        return;
      }

      // The strip shows the opening skill; the full tree is still a modal,
      // now only when asked for.
      if (action === 'open-dossier') {
        const charClass = actionEl.dataset.id;
        if (charClass) this.openDossier(charClass);
        return;
      }

      if (action === 'toggle-map-menu') {
        this.mapMenuOpen = !this.mapMenuOpen;
        this.render();
        if (this.mapMenuOpen) {
          (this.container.querySelector('.lobby-map__option[aria-selected="true"]') as HTMLElement | null)?.focus();
        }
        return;
      }

      if (action === 'pick-map') {
        const mapId = actionEl.dataset.id;
        if (mapId) this.selectedMapId = mapId;
        this.closeMapMenu();
        return;
      }

      if (action === 'select-weapon') {
        const equipmentId = actionEl.dataset.id;
        if (equipmentId) {
          networkManager.sendAction({
            playerId: this.localPlayerId,
            type: ActionType.SELECT_WEAPON,
            payload: { equipmentId },
          });
        }
        return;
      }

      if (action === 'kick-player') {
        const targetId = actionEl.dataset.id;
        if (targetId) {
          modalManager.open({
            title: es.lobby.kickTitle,
            size: 'sm',
            renderBody: () => `<p class="text-secondary">${this.escHtml(es.lobby.kickBody)}</p>`,
            renderFooter: () => `
              ${renderButton({ label: this.escHtml(es.common.cancel), variant: 'secondary', dataAction: 'modal-close' })}
              ${renderButton({ label: this.escHtml(es.lobby.kick), variant: 'destructive', dataAction: 'confirm-kick' })}
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
        if (!map) return;
        networkManager.sendAction({
          playerId: this.localPlayerId,
          type: ActionType.START_GAME,
          payload: { map, abominationFest: this.abominationFest },
        });
        return;
      }

      if (action === 'leave-room') {
        leaveRoom();
        return;
      }
    });

    // Nickname input (debounced).
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
    }, true);

    // Map menu: Escape closes, arrows move between options.
    this.container.addEventListener('keydown', (e) => {
      if (!this.mapMenuOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeMapMenu();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const opts = Array.from(this.container.querySelectorAll<HTMLElement>('.lobby-map__option'));
        if (opts.length === 0) return;
        e.preventDefault();
        const i = opts.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % opts.length : (i - 1 + opts.length) % opts.length;
        opts[next].focus();
      }
    });

    // ROE toggle.
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement && target.classList.contains('lobby-roe__check')) {
        const ruleId = target.dataset.roeId ?? (target.id === 'lobby-abom-fest' ? 'endless-horde' : null);
        if (!ruleId) return;
        const next = target.checked;
        this.roeRuleStates[ruleId] = next;
        if (ruleId === 'endless-horde') this.abominationFest = next;
      }
    });
  }

  private closeMapMenu(): void {
    this.mapMenuOpen = false;
    this.render();
    (this.container.querySelector('.lobby-map__trigger') as HTMLElement | null)?.focus();
  }

  private async handleRoomPillCopy(): Promise<void> {
    const setCopied = () => {
      this.roomPillCopied = true;
      this.render();
      setTimeout(() => {
        this.roomPillCopied = false;
        this.render();
      }, 1200);
    };

    const joinUrl = `${window.location.origin}/room/${encodeURIComponent(this.roomId)}`;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(joinUrl);
        setCopied();
        return;
      } catch {
        // fall through to legacy path
      }
    }

    // Legacy fallback for non-secure contexts / older browsers.
    try {
      const ta = document.createElement('textarea');
      ta.value = joinUrl;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        setCopied();
        return;
      }
    } catch {
      // fall through to notification
    }

    notificationManager.show({ variant: 'warning', message: es.lobby.copyFailed(joinUrl), duration: 10000 });
  }

  // ─── Dossier drawer ──────────────────────────────────────────

  private openDossier(charClass: string): void {
    if (!CHARACTER_DEFINITIONS[charClass]) return;
    const role = roleFor(charClass);
    const title = es.lobby.dossierTitle(charClass);
    const body = renderLobbyDossier(charClass, role);

    if (this.dossierModalId && modalManager.isOpen(this.dossierModalId)) {
      this.selectedSurvivorId = charClass;
      modalManager.updateBody(this.dossierModalId, body);
      const el = modalManager.getElement(this.dossierModalId);
      const titleEl = el?.querySelector('.modal__title') as HTMLElement | null;
      if (titleEl) titleEl.textContent = title;
      const subEl = el?.querySelector('.modal__subtitle') as HTMLElement | null;
      if (subEl) subEl.textContent = role;
      else if (this.dossierModalId) modalManager.updateSubtitle(this.dossierModalId, role);
      return;
    }

    this.selectedSurvivorId = charClass;
    this.dossierModalId = modalManager.open({
      title,
      subtitle: role,
      size: 'sm',
      className: 'lobby-dossier-modal',
      bodyClassName: 'lobby-dossier-modal__body',
      renderBody: () => body,
      onClose: () => {
        this.selectedSurvivorId = null;
        this.dossierModalId = null;
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
