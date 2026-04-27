
import { GameState, PlayerId } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { CHARACTER_DEFINITIONS } from '../../config/CharacterRegistry';
import { renderButton } from './components/Button';
import { renderPhotoSlot } from './components/PhotoSlot';
import { renderLobbyDossier } from './components/LobbyDossier';
import { icon } from './components/icons';
import { notificationManager } from './NotificationManager';
import { modalManager } from './overlays/ModalManager';

// ─── Static design data ──────────────────────────────────────────
// Role label under each character portrait in the roster. Pure
// presentation: derived once from CHARACTER_DEFINITIONS keys to give
// each operative a deterministic field-manual sub-line.
const CHARACTER_ROLES: Record<string, string> = {
  Wanda: 'POINT · SCOUT',
  Doug: 'SUPPORT · LEADER',
  Amy: 'MEDIC · SLIPPERY',
  Ned: 'RECON · SEARCHER',
  Elle: 'MARKSMAN · SNIPER',
  Josh: 'HEAVY · BRAWLER',
};

// Max operatives per squad — mirrors `MAX_PLAYERS` in server.ts.
const MAX_SQUAD = 6;

// ROE rules shown in the Rules of Engagement panel. Only
// `endless-horde` is wired to actual game config (abominationFest);
// the rest are presentation-only toggles per task 11 (LOB-05).
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
    title: 'ENDLESS HORDE MODE',
    description: 'UNLIMITED ABOMINATIONS MAY SPAWN. EXPECT CASUALTIES.',
    defaultOn: false,
    riskLabel: 'HIGH RISK',
    riskVariant: 'rust',
  },
  {
    id: 'friendly-fire',
    title: 'FRIENDLY FIRE',
    description: 'RANGED ATTACKS CAN STRIKE OPERATIVES IN THE TARGET ZONE.',
    defaultOn: false,
    riskLabel: 'HAZARD',
    riskVariant: 'rust',
  },
  {
    id: 'shared-vitals',
    title: 'SHARED VITALS',
    description: 'WOUNDS DISTRIBUTE ACROSS THE SQUAD. NO OPERATIVE FALLS ALONE.',
    defaultOn: false,
    riskLabel: 'TACTICAL',
    riskVariant: 'olive',
  },
  {
    id: 'perma-death',
    title: 'PERMA-DEATH',
    description: 'DOWNED OPERATIVES ARE LOST. NO REVIVES PERMITTED.',
    defaultOn: false,
    riskLabel: 'HIGH RISK',
    riskVariant: 'rust',
  },
];

function characterImageUrl(charClass: string): string {
  return `/images/characters/${charClass.toLowerCase()}.webp`;
}

// Host-left banner countdown duration (ms). Drives the rust banner's
// 3 → 2 → 1 chip while the next operative is promoted to host.
const HOST_LEFT_COUNTDOWN_SECONDS = 3;

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
      // the right anchor for our "DROPPED mm:ss" timer.
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
      // RECONNECT button stays available.
      this.connectionLost = true;
      this.nextRetryAt = null;
      if (this.disconnectedAt === null) this.disconnectedAt = Date.now();
      this.startConnectionMetaTimer();
      this.refreshConnectionMeta('CONNECTION DROPPED');
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
   * `headlineOverride` is provided (e.g. hard-drop "CONNECTION DROPPED").
   */
  private refreshConnectionMeta(headlineOverride?: string): void {
    const parts: string[] = [];

    if (headlineOverride) {
      parts.push(headlineOverride);
    } else if (this.maxAttempts > 0) {
      parts.push(`RETRYING HANDSHAKE · ${this.currentAttempt}/${this.maxAttempts}`);
    } else {
      parts.push('RETRYING HANDSHAKE');
    }

    if (this.disconnectedAt !== null) {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - this.disconnectedAt) / 1000));
      const mm = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const ss = (elapsedSec % 60).toString().padStart(2, '0');
      parts.push(`DROPPED ${mm}:${ss}`);
    }

    if (this.nextRetryAt !== null) {
      const remaining = Math.max(0, Math.ceil((this.nextRetryAt - Date.now()) / 1000));
      parts.push(remaining > 0 ? `NEXT ${remaining}s` : 'RECONNECTING…');
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
        this.availableMaps = await res.json();
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
            <div class="lobby__waiting">CONNECTING TO LOBBY</div>
          </div>
        </div>`;
      this.panelCache = {};
      return;
    }

    const isHost = this.state.lobby.players.length > 0 && this.state.lobby.players[0].id === this.localPlayerId;
    const myPlayer = this.state.lobby.players.find(p => p.id === this.localPlayerId);

    const takenClasses = new Map<string, string>();
    this.state.lobby.players.forEach(p => {
      if (p.characterClass) takenClasses.set(p.characterClass, p.name);
    });

    const abomFest = !!(this.state.config?.abominationFest ?? this.abominationFest);
    this.abominationFest = abomFest;

    const selectedMap = this.availableMaps.find(m => m.id === this.selectedMapId) ?? null;
    const myChar = myPlayer?.characterClass || null;
    const allReady = this.state.lobby.players.length > 0 && this.state.lobby.players.every(p => !!p.characterClass);

    // Build the list of panels for this render pass. Each entry is a
    // stable key + its HTML output; we only swap DOM for keys whose
    // HTML actually changed since the last render.
    const panels: Array<{ key: string; html: string }> = [];
    const hostId = this.state.lobby.players[0]?.id ?? null;
    if (this.hostLeftActive) panels.push({ key: 'hostLeftBanner', html: this.renderHostLeftBanner() });
    panels.push({ key: 'briefing', html: this.renderBriefingPanel() });
    if (myPlayer) panels.push({ key: 'playerPlate', html: this.renderPlayerPlatePanel(myPlayer) });
    panels.push({ key: 'squad', html: this.renderSquadPanel(this.state.lobby.players, hostId) });
    panels.push({ key: 'roster', html: this.renderRosterPanel(myChar, takenClasses) });
    panels.push({ key: 'area', html: this.renderAreaPanel(selectedMap, isHost) });
    panels.push({ key: 'roe', html: this.renderRoePanel(abomFest, isHost) });
    panels.push({ key: 'footer', html: this.renderFooterPanel(isHost, allReady) });

    let stack = this.container.querySelector('.lobby__stack') as HTMLElement | null;
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'lobby__stack';
      this.container.innerHTML = '';
      this.container.appendChild(stack);
      this.panelCache = {};
    }

    // Capture focus on callsign input so we can restore it if (and
    // only if) the callsign panel is actually replaced.
    const activeEl = document.activeElement;
    const nicknameBefore = stack.querySelector('#lobby-nickname') as HTMLInputElement | null;
    const hadFocus = activeEl === nicknameBefore;
    const prevCursor = nicknameBefore?.selectionStart ?? null;

    const liveKeys = new Set(panels.map(p => p.key));
    Array.from(stack.children).forEach(child => {
      const k = (child as HTMLElement).dataset.panel;
      if (!k || !liveKeys.has(k)) {
        if (k) delete this.panelCache[k];
        child.remove();
      }
    });

    const rerendered = new Set<string>();
    let prevEl: Element | null = null;
    for (const p of panels) {
      let existing = stack.querySelector(`:scope > [data-panel="${p.key}"]`) as HTMLElement | null;
      const cached = this.panelCache[p.key];

      if (!existing) {
        // First time this panel is mounted — let the fm-panel fade-in play.
        const tmp = document.createElement('div');
        tmp.innerHTML = p.html.trim();
        const fresh = tmp.firstElementChild as HTMLElement | null;
        if (!fresh) continue;
        fresh.setAttribute('data-panel', p.key);

        if (prevEl) prevEl.after(fresh);
        else stack.prepend(fresh);
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
      } else if (prevEl ? existing.previousElementSibling !== prevEl : existing !== stack.firstElementChild) {
        if (prevEl) prevEl.after(existing);
        else stack.prepend(existing);
      }
      prevEl = existing;
    }

    if (hadFocus && rerendered.has('playerPlate')) {
      const nextInput = stack.querySelector('#lobby-nickname') as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        if (prevCursor !== null) nextInput.setSelectionRange(prevCursor, prevCursor);
      }
    }

    if (rerendered.has('area')) {
      const mapSelect = stack.querySelector('#lobby-map-select') as HTMLSelectElement | null;
      if (mapSelect && this.selectedMapId) mapSelect.value = this.selectedMapId;
    }
    if (rerendered.has('roe')) {
      const abomCheck = stack.querySelector('#lobby-abom-fest') as HTMLInputElement | null;
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
        if (metaEl) metaEl.textContent = this.reconnectMeta ?? 'RETRYING HANDSHAKE';
      }
    } else if (scrimEl) {
      scrimEl.remove();
    }
  }

  // ─── Panel renderers ─────────────────────────────────────────

  private renderBriefingPanel(): string {
    const copied = this.roomPillCopied;
    const copyGlyph = copied ? icon('Check', 'sm') : icon('Copy', 'sm');
    const copiedClass = copied ? ' lobby-room-chip--copied' : '';
    const label = copied ? '// COPIED' : 'ROOM';

    // Solo-waiting state — single operative in the lobby. The room
    // chip pulses rust to read as "share this code" and the kicker
    // swaps to a count-aware WAITING line.
    const squadSize = this.state?.lobby.players.length ?? 0;
    const isSolo = squadSize === 1;
    const pulseClass = isSolo ? ' lobby-room-chip--pulse' : '';
    const kicker = isSolo
      ? `// WAITING FOR OPERATIVES · ${squadSize}/${MAX_SQUAD}`
      : '// MISSION BRIEFING';

    return `
      <section class="fm-panel lobby-panel lobby-panel--briefing">
        <span class="fm-panel-dot fm-panel-dot--tl"></span>
        <span class="fm-panel-dot fm-panel-dot--br"></span>
        <div class="fm-brackets fm-brackets--amber lobby-briefing__body">
          <span class="fm-bracket-tr"></span>
          <span class="fm-bracket-bl"></span>
          <div class="fm-kicker">${kicker}</div>
          <h1 class="fm-stencil lobby-briefing__title">LOBBY</h1>
          <button
            type="button"
            id="room-pill"
            class="lobby-room-chip${copiedClass}${pulseClass}"
            title="Copy room code"
            aria-label="Copy room code to clipboard"
          >
            <span class="lobby-room-chip__label">${label}</span>
            <span class="lobby-room-chip__id">${this.escHtml(this.roomId)}</span>
            <span class="lobby-room-chip__glyph">${copyGlyph}</span>
          </button>
        </div>
      </section>
    `;
  }

  /**
   * Host-left banner. Sits at the very top of .lobby__stack while the
   * server promotes a new host. role=status + aria-live=polite per
   * design/states/host-left.html.
   */
  private renderHostLeftBanner(): string {
    const seconds = Math.max(0, this.hostLeftSecondsRemaining);
    return `
      <div class="lobby-banner" role="status" aria-live="polite">
        <span class="lobby-banner__icon" aria-hidden="true"></span>
        <div class="lobby-banner__text">
          <span class="lobby-banner__title">HOST DISCONNECTED · PROMOTING…</span>
          <span class="lobby-banner__sub">Selecting next operative as host.</span>
        </div>
        <span class="lobby-banner__countdown" aria-label="${seconds} seconds remaining">
          <span class="lobby-banner__countdown-num">${seconds}</span>
          <span aria-hidden="true">s</span>
        </span>
      </div>
    `;
  }

  /**
   * Connection-lost scrim. Full-viewport alertdialog over the dimmed
   * lobby; reuses the existing modal-backdrop + grain treatment. The
   * reconnect button drives NetworkManager.connect().
   */
  private renderConnectionLostScrim(): string {
    const meta = this.escHtml(this.reconnectMeta ?? 'RETRYING HANDSHAKE');
    return `
      <div
        class="lobby-scrim"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lobby-scrim-title"
        data-scrim="connection-lost"
      >
        <div class="fm-panel fm-brackets fm-brackets--rust fm-brackets--lg lobby-scrim__card">
          <span class="fm-panel-dot fm-panel-dot--tl" aria-hidden="true"></span>
          <span class="fm-panel-dot fm-panel-dot--br" aria-hidden="true"></span>
          <span class="fm-bracket-tr" aria-hidden="true"></span>
          <span class="fm-bracket-bl" aria-hidden="true"></span>

          <div class="fm-kicker">// SIGNAL DEGRADED</div>
          <h2 id="lobby-scrim-title" class="lobby-scrim__title">// CONNECTION LOST</h2>
          <p class="lobby-scrim__sub">
            Server contact dropped. Mission state held locally.
          </p>
          <div class="lobby-scrim__meta">${meta}</div>

          <div class="lobby-scrim__actions">
            <button type="button" class="fm-btn fm-btn--reconnect" data-action="reconnect">
              <span class="fm-btn__label">Reconnect</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderSquadPanel(
    players: { id: PlayerId; name: string; ready: boolean; characterClass: string }[],
    hostId: PlayerId | null,
  ): string {
    const rows = players.map(p => {
      const ready = !!p.characterClass;
      const statusClass = ready ? 'lobby-status--ready' : 'lobby-status--standby';
      const statusLabel = ready ? '● READY' : '● STANDBY';
      const isMe = p.id === this.localPlayerId;
      const isHost = p.id === hostId;
      const charLabel = p.characterClass ? p.characterClass.toUpperCase() : 'NO CLASS';

      return `
        <li class="lobby-squad__row">
          <div class="lobby-squad__head">
            <span class="fm-stencil lobby-squad__name">${this.escHtml(p.name || 'OPERATIVE')}</span>
            ${isMe ? '<span class="lobby-pill lobby-pill--amber">YOU</span>' : ''}
            ${isHost ? '<span class="lobby-pill lobby-pill--amber">HOST</span>' : ''}
          </div>
          <div class="lobby-squad__sub">
            <span class="lobby-squad__class fm-mono">${this.escHtml(charLabel)}</span>
            <span class="lobby-squad__dot" aria-hidden="true">·</span>
            <span class="lobby-status ${statusClass}">${statusLabel}</span>
          </div>
        </li>
      `;
    }).join('');

    return `
      <section class="fm-panel lobby-panel lobby-panel--squad">
        <div class="lobby-squad__header">
          <div class="fm-kicker fm-kicker--secondary">SQUAD</div>
          <div class="lobby-squad__count fm-mono">${players.length}/${MAX_SQUAD}</div>
        </div>
        <ul class="lobby-squad">${rows}</ul>
      </section>
    `;
  }

  private renderPlayerPlatePanel(
    myPlayer: { id: PlayerId; name: string; ready: boolean; characterClass: string },
  ): string {
    const ready = !!myPlayer.characterClass;
    const statusClass = ready ? 'lobby-status--ready' : 'lobby-status--standby';
    const statusLabel = ready ? '● READY' : '● STANDBY';
    const avatarInner = myPlayer.characterClass
      ? `<img class="lobby-player__img" src="${this.escHtml(characterImageUrl(myPlayer.characterClass))}" alt="${this.escHtml(myPlayer.characterClass)}" />`
      : `<span class="lobby-player__img lobby-player__img--empty" aria-hidden="true"></span>`;

    return `
      <section class="fm-panel lobby-panel lobby-panel--player">
        <div class="lobby-player">
          <div class="lobby-player__avatar">${avatarInner}</div>
          <input
            id="lobby-nickname"
            class="fm-input lobby-player__name"
            type="text"
            value="${this.escHtml(myPlayer.name)}"
            placeholder="ENTER CALL SIGN"
            maxlength="24"
            aria-label="Your call sign"
            autocomplete="off"
          />
          <span class="lobby-status ${statusClass} lobby-player__status">${statusLabel}</span>
        </div>
      </section>
    `;
  }

  private renderRosterPanel(myChar: string | null, takenClasses: Map<string, string>): string {
    const characterKeys = Object.keys(CHARACTER_DEFINITIONS);

    const cells = characterKeys.map(name => {
      const isSelected = myChar === name;
      const takenByOther = takenClasses.has(name) && !isSelected;
      const takenByName = takenClasses.get(name);
      const role = CHARACTER_ROLES[name] ?? 'OPERATIVE';

      const cellClass = [
        'lobby-roster__cell',
        isSelected ? 'lobby-roster__cell--selected' : '',
        takenByOther ? 'lobby-roster__cell--taken' : '',
      ].filter(Boolean).join(' ');

      const takenOverlay = takenByOther
        ? `<div class="lobby-roster__taken-label">${this.escHtml(takenByName ?? 'TAKEN')}</div>`
        : '';

      return `
        <button
          type="button"
          class="${cellClass}"
          data-action="select-class"
          data-id="${this.escHtml(name)}"
          ${takenByOther ? 'disabled' : ''}
          role="radio"
          aria-checked="${isSelected}"
          aria-label="Select ${this.escHtml(name)}${takenByOther ? ` (taken by ${this.escHtml(takenByName ?? '')})` : ''}"
        >
          ${renderPhotoSlot({
            size: 'md',
            name: name.toUpperCase(),
            role,
            selected: isSelected,
            imageUrl: characterImageUrl(name),
          })}
          ${takenOverlay}
        </button>
      `;
    }).join('');

    return `
      <section class="fm-panel lobby-panel lobby-panel--roster">
        <div class="fm-kicker fm-kicker--secondary">OPERATIVE ROSTER</div>
        <div class="lobby-roster" role="radiogroup" aria-label="Select operative">
          ${cells}
        </div>
      </section>
    `;
  }

  private renderAreaPanel(
    selectedMap: { id: string; name: string; width: number; height: number } | null,
    isHost: boolean,
  ): string {
    const name = selectedMap?.name ?? 'LOADING MAP';
    const size = selectedMap ? `${selectedMap.width}×${selectedMap.height}` : '—';

    const options = this.availableMaps.length > 0
      ? this.availableMaps.map(m =>
          `<option value="${this.escHtml(m.id)}" ${m.id === this.selectedMapId ? 'selected' : ''}>${this.escHtml(m.name)}</option>`
        ).join('')
      : '<option>Loading maps...</option>';

    const selectHtml = isHost
      ? `<select class="lobby-area__select fm-mono" id="lobby-map-select" aria-label="Select map">${options}</select>`
      : `<div class="lobby-area__readonly fm-mono">HOST SELECTS</div>`;

    return `
      <section class="fm-panel lobby-panel lobby-panel--area">
        <div class="lobby-area">
          <div class="lobby-area__bar" aria-hidden="true"></div>
          <div class="lobby-area__text">
            <div class="fm-kicker fm-kicker--secondary">AREA OF OPERATION</div>
            <div class="fm-stencil lobby-area__name">${this.escHtml(name.toUpperCase())} · ${size}</div>
            <div class="lobby-area__sub fm-mono">HOSTILE DENSITY: MEDIUM</div>
          </div>
          <div class="lobby-area__select-wrap">
            ${selectHtml}
            <span class="lobby-area__caret" aria-hidden="true">${icon('ChevronDown', 'xs')}</span>
          </div>
        </div>
      </section>
    `;
  }

  private renderRoePanel(abomFest: boolean, isHost: boolean): string {
    const disabledAttr = isHost ? '' : 'disabled';
    const readonlyClass = isHost ? '' : ' lobby-roe--readonly';

    // Keep `endless-horde` synced to the canonical abominationFest flag
    // before rendering so the row reflects host-driven config.
    this.roeRuleStates['endless-horde'] = abomFest;

    const rows = ROE_RULES.map(rule => {
      const on = !!this.roeRuleStates[rule.id];
      const checkboxId = `lobby-roe-${rule.id}`;
      const ariaInputId = rule.id === 'endless-horde' ? 'lobby-abom-fest' : checkboxId;
      const chipVariant = rule.riskVariant === 'rust' ? 'lobby-chip lobby-chip--rust' : 'lobby-chip';
      return `
        <label class="lobby-roe">
          <input
            type="checkbox"
            id="${ariaInputId}"
            class="lobby-roe__check"
            data-roe-id="${rule.id}"
            ${on ? 'checked' : ''}
            ${disabledAttr}
          />
          <div class="lobby-roe__text">
            <div class="fm-stencil lobby-roe__title">${this.escHtml(rule.title)}</div>
            <div class="lobby-roe__desc fm-mono">${this.escHtml(rule.description)}</div>
          </div>
          <span class="${chipVariant} lobby-roe__tag">${this.escHtml(rule.riskLabel)}</span>
        </label>
      `;
    }).join('');

    return `
      <section class="fm-panel lobby-panel lobby-panel--roe${readonlyClass}">
        <div class="fm-kicker fm-kicker--secondary">RULES OF ENGAGEMENT</div>
        <div class="lobby-roe-list" role="group" aria-label="Rules of engagement">
          ${rows}
        </div>
      </section>
    `;
  }

  private renderFooterPanel(isHost: boolean, allReady: boolean): string {
    const players = this.state?.lobby.players ?? [];
    const totalCount = players.length;
    const readyCount = players.filter(p => !!p.characterClass).length;

    const primaryBtn = isHost
      ? renderButton({
          label: `BEGIN OPERATION · ${readyCount}/${totalCount} READY`,
          icon: 'Play',
          variant: 'primary',
          size: 'lg',
          fullWidth: true,
          disabled: !allReady,
          dataAction: 'start-game',
        })
      : `<div class="lobby__waiting">AWAITING HOST DEPLOYMENT</div>`;

    const leaveBtn = renderButton({
      label: 'LEAVE ROOM',
      icon: 'ArrowLeft',
      variant: 'ghost',
      fullWidth: true,
      dataAction: 'leave-room',
    });

    return `
      <section class="fm-panel lobby-panel lobby-panel--footer">
        <div class="lobby-footer">
          ${primaryBtn}
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
    localStorage.setItem('endead_nickname', nextName.slice(0, 24));
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

      // Room pill (handled by id).
      if (target.closest('#room-pill')) {
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
          this.openDossier(charClass);
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

    // Map select + ROE toggle.
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'lobby-map-select') {
        this.selectedMapId = (target as HTMLSelectElement).value;
        this.render();
        return;
      }
      if (target instanceof HTMLInputElement && target.classList.contains('lobby-roe__check')) {
        const ruleId = target.dataset.roeId ?? (target.id === 'lobby-abom-fest' ? 'endless-horde' : null);
        if (!ruleId) return;
        const next = target.checked;
        this.roeRuleStates[ruleId] = next;
        if (ruleId === 'endless-horde') this.abominationFest = next;
      }
    });
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

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(this.roomId);
        setCopied();
        return;
      } catch {
        // fall through to legacy path
      }
    }

    // Legacy fallback for non-secure contexts / older browsers.
    try {
      const ta = document.createElement('textarea');
      ta.value = this.roomId;
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

    notificationManager.show({ variant: 'warning', message: 'Could not copy. Room code: ' + this.roomId });
  }

  // ─── Dossier drawer ──────────────────────────────────────────

  private openDossier(charClass: string): void {
    if (!CHARACTER_DEFINITIONS[charClass]) return;
    const role = CHARACTER_ROLES[charClass] ?? 'OPERATIVE';
    const body = renderLobbyDossier(charClass, role);

    if (this.dossierModalId && modalManager.isOpen(this.dossierModalId)) {
      this.selectedSurvivorId = charClass;
      modalManager.updateBody(this.dossierModalId, body);
      const el = modalManager.getElement(this.dossierModalId);
      const titleEl = el?.querySelector('.modal__title') as HTMLElement | null;
      if (titleEl) titleEl.textContent = `OPERATIVE · ${charClass.toUpperCase()}`;
      const subEl = el?.querySelector('.modal__subtitle') as HTMLElement | null;
      if (subEl) subEl.textContent = role;
      else if (this.dossierModalId) modalManager.updateSubtitle(this.dossierModalId, role);
      return;
    }

    this.selectedSurvivorId = charClass;
    this.dossierModalId = modalManager.open({
      title: `OPERATIVE · ${charClass.toUpperCase()}`,
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
