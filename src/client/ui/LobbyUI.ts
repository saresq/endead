
import { GameState, PlayerId, DangerLevel } from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { networkManager } from '../NetworkManager';
import { CHARACTER_DEFINITIONS } from '../../config/CharacterRegistry';
import { SURVIVOR_CLASSES, SKILL_DEFINITIONS } from '../../config/SkillRegistry';
import { EQUIPMENT_CARDS } from '../../config/EquipmentRegistry';
import { renderButton } from './components/Button';
import { renderPhotoSlot } from './components/PhotoSlot';
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

function characterImageUrl(charClass: string): string {
  return `/images/characters/${charClass.toLowerCase()}.webp`;
}

// Rank labels + XP thresholds for the progression track.
interface RankRow {
  level: DangerLevel;
  label: string;
  xp: string;
  colorVar: string;
  pillClass: string;
}

const RANK_ROWS: RankRow[] = [
  { level: DangerLevel.Blue,   label: 'BLUE',   xp: '0 XP',  colorVar: '--rank-blue',   pillClass: 'lobby-rank-pill--blue' },
  { level: DangerLevel.Yellow, label: 'YELLOW', xp: '7 XP',  colorVar: '--rank-yellow', pillClass: 'lobby-rank-pill--yellow' },
  { level: DangerLevel.Orange, label: 'ORANGE', xp: '19 XP', colorVar: '--rank-orange', pillClass: 'lobby-rank-pill--orange' },
  { level: DangerLevel.Red,    label: 'RED',    xp: '43 XP', colorVar: '--rank-red',    pillClass: 'lobby-rank-pill--red' },
];

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
    panels.push({ key: 'briefing', html: this.renderBriefingPanel() });
    panels.push({ key: 'squad', html: this.renderSquadPanel(this.state.lobby.players, hostId) });
    if (myPlayer) panels.push({ key: 'callsign', html: this.renderCallsignPanel(myPlayer) });
    panels.push({ key: 'roster', html: this.renderRosterPanel(myChar, takenClasses) });
    if (myChar) panels.push({ key: 'operative', html: this.renderOperativePanel(myChar) });
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

    if (hadFocus && rerendered.has('callsign')) {
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
  }

  // ─── Panel renderers ─────────────────────────────────────────

  private renderBriefingPanel(): string {
    const copyGlyph = this.roomPillCopied ? icon('Check', 'sm') : icon('Copy', 'sm');
    const copiedClass = this.roomPillCopied ? ' lobby-room-chip--copied' : '';
    return `
      <section class="fm-panel lobby-panel lobby-panel--briefing">
        <span class="fm-panel-dot fm-panel-dot--tl"></span>
        <span class="fm-panel-dot fm-panel-dot--br"></span>
        <div class="fm-brackets fm-brackets--amber lobby-briefing__body">
          <span class="fm-bracket-tr"></span>
          <span class="fm-bracket-bl"></span>
          <div class="fm-kicker">// MISSION BRIEFING</div>
          <h1 class="fm-stencil lobby-briefing__title">LOBBY</h1>
          <button
            type="button"
            id="room-pill"
            class="lobby-room-chip${copiedClass}"
            title="Copy room URL"
            aria-label="Copy room URL to clipboard"
          >
            <span class="lobby-room-chip__label">ROOM</span>
            <span class="lobby-room-chip__id">${this.escHtml(this.roomId)}</span>
            <span class="lobby-room-chip__glyph">${copyGlyph}</span>
          </button>
        </div>
      </section>
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
          <div class="fm-kicker">// SQUAD</div>
          <div class="lobby-squad__count fm-mono">${players.length}/${MAX_SQUAD}</div>
        </div>
        <ul class="lobby-squad">${rows}</ul>
      </section>
    `;
  }

  private renderCallsignPanel(
    myPlayer: { id: PlayerId; name: string; ready: boolean; characterClass: string },
  ): string {
    return `
      <section class="fm-panel lobby-panel lobby-panel--callsign">
        <label class="fm-input__label" for="lobby-nickname">CALL SIGN</label>
        <input
          id="lobby-nickname"
          class="fm-input lobby-callsign-input"
          type="text"
          value="${this.escHtml(myPlayer.name)}"
          placeholder="ENTER CALL SIGN"
          maxlength="24"
          aria-label="Your call sign"
          autocomplete="off"
        />
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
        <div class="fm-kicker">// OPERATIVE ROSTER</div>
        <div class="lobby-roster" role="radiogroup" aria-label="Select operative">
          ${cells}
        </div>
      </section>
    `;
  }

  private renderOperativePanel(charClass: string): string {
    const dossier = this.renderDossierSection(charClass);
    const loadout = this.renderLoadoutSection(charClass);
    const progression = this.renderProgressionSection(charClass);

    const parts = [dossier, loadout, progression].filter(Boolean);
    const body = parts.join('<div class="lobby-operative__divider" aria-hidden="true"></div>');

    return `
      <section class="fm-panel lobby-panel lobby-panel--operative">
        ${body}
      </section>
    `;
  }

  private renderDossierSection(charClass: string): string {
    const charDef = CHARACTER_DEFINITIONS[charClass];
    if (!charDef) return '';
    const role = CHARACTER_ROLES[charClass] ?? 'OPERATIVE';

    return `
      <div class="lobby-operative__section">
        <div class="fm-kicker">// DOSSIER</div>
        <div class="lobby-dossier__body">
          <div class="fm-stencil lobby-dossier__name">${this.escHtml(charClass.toUpperCase())}</div>
          <div class="lobby-dossier__sub fm-mono">${role}</div>
        </div>
      </div>
    `;
  }

  private renderLoadoutSection(charClass: string): string {
    const charDef = CHARACTER_DEFINITIONS[charClass];
    if (!charDef) return '';
    const template = EQUIPMENT_CARDS[charDef.startingEquipmentKey];
    if (!template) return '';

    const stats = template.stats;
    const statLine = stats
      ? `${stats.accuracy}+ · ${stats.dice}d6 · ${stats.damage}`
      : '—';
    const weaponName = template.name.toUpperCase();

    return `
      <div class="lobby-operative__section">
        <div class="lobby-loadout">
          <div class="lobby-loadout__icon-slot">
            <span class="lobby-loadout__icon">${icon('Swords', 'md')}</span>
          </div>
          <div class="lobby-loadout__text">
            <div class="fm-kicker">R. HAND · EQUIPPED</div>
            <div class="fm-stencil lobby-loadout__name">${this.escHtml(weaponName)}</div>
            <div class="lobby-loadout__stats fm-mono">${statLine}</div>
          </div>
        </div>
      </div>
    `;
  }

  private renderProgressionSection(charClass: string): string {
    const progression = SURVIVOR_CLASSES[charClass];
    if (!progression) return '';

    const rows = RANK_ROWS.map(row => {
      const skillIds = progression[row.level] || [];
      const skills = skillIds.map(id => SKILL_DEFINITIONS[id]).filter(Boolean);
      const pills = skills.map(s =>
        `<span class="lobby-rank-pill ${row.pillClass}" title="${this.escHtml(s.description)}">${this.escHtml(s.name)}</span>`
      ).join('');

      return `
        <div class="lobby-rank-row">
          <span class="lobby-rank-chip" style="--rank-color: var(${row.colorVar});"></span>
          <div class="lobby-rank-head">
            <span class="fm-stencil lobby-rank-label">${row.label}</span>
            <span class="lobby-rank-xp fm-mono">${row.xp}</span>
          </div>
          <div class="lobby-rank-pills">${pills || '<span class="lobby-rank-empty fm-mono">—</span>'}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="lobby-operative__section">
        <div class="fm-kicker">// PROGRESSION TRACK</div>
        <div class="lobby-progression">${rows}</div>
      </div>
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
            <div class="fm-kicker">// AREA OF OPERATION</div>
            <div class="fm-stencil lobby-area__name">${this.escHtml(name.toUpperCase())} · ${size}</div>
            <div class="lobby-area__sub fm-mono">HOSTILE DENSITY: MEDIUM</div>
          </div>
          <div class="lobby-area__select-wrap">
            ${selectHtml}
            <span class="lobby-area__caret" aria-hidden="true">▾</span>
          </div>
        </div>
      </section>
    `;
  }

  private renderRoePanel(abomFest: boolean, isHost: boolean): string {
    const disabledAttr = isHost ? '' : 'disabled';
    const readonlyClass = isHost ? '' : ' lobby-roe--readonly';
    return `
      <section class="fm-panel lobby-panel lobby-panel--roe${readonlyClass}">
        <div class="fm-kicker">// RULES OF ENGAGEMENT</div>
        <label class="lobby-roe">
          <input
            type="checkbox"
            id="lobby-abom-fest"
            class="lobby-roe__check"
            ${abomFest ? 'checked' : ''}
            ${disabledAttr}
          />
          <div class="lobby-roe__text">
            <div class="fm-stencil lobby-roe__title">ENDLESS HORDE MODE</div>
            <div class="lobby-roe__desc fm-mono">UNLIMITED ABOMINATIONS MAY SPAWN. EXPECT CASUALTIES.</div>
          </div>
          <span class="lobby-chip lobby-chip--rust lobby-roe__tag">HIGH RISK</span>
        </label>
      </section>
    `;
  }

  private renderFooterPanel(isHost: boolean, allReady: boolean): string {
    const playerCount = this.state?.lobby.players.length ?? 0;

    const primaryBtn = isHost
      ? renderButton({
          label: `BEGIN OPERATION (${playerCount})`,
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

  private attachListeners(): void {
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
