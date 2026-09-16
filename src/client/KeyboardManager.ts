import { GamePhase } from '../types/GameState';
import { ActionType } from '../types/Action';
import { gameStore } from './GameStore';
import { networkManager } from './NetworkManager';
import { InputController } from './InputController';
import { GameHUD } from './ui/GameHUD';
import { notificationManager } from './ui/NotificationManager';
import { modalManager } from './ui/overlays/ModalManager';
import { renderButton } from './ui/components/Button';
import type { PixiBoardRenderer } from './PixiBoardRenderer';
import { es } from '../strings/es';
import { canTakeAction } from './utils/actionGate';

const CHEAT_SEQUENCE = 'iddqd';

export class KeyboardManager {
  private localPlayerId: string;
  private inputController: InputController;
  private gameHud: () => GameHUD | null;
  private renderer: Pick<PixiBoardRenderer, 'fitBoard'> | null;
  private boundHandler: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private backspaceHeld: boolean = false;
  private cheatBuffer: string = '';

  constructor(
    playerId: string,
    inputController: InputController,
    getGameHud: () => GameHUD | null,
    renderer: Pick<PixiBoardRenderer, 'fitBoard'> | null = null,
  ) {
    this.localPlayerId = playerId;
    this.inputController = inputController;
    this.gameHud = getGameHud;
    this.renderer = renderer;

    this.boundHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.boundKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    window.addEventListener('keydown', this.boundHandler);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.boundHandler);
    window.removeEventListener('keyup', this.boundKeyUp);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Backspace') {
      this.backspaceHeld = false;
      this.cheatBuffer = '';
    }
  }

  private tryCheatCode(e: KeyboardEvent): boolean {
    // Lobby phase has no survivor; cheat only meaningful in-game.
    const state = gameStore.state;
    if (!state || state.phase === GamePhase.Lobby || state.gameResult) return false;

    if (e.key === 'Backspace') {
      // Don't preventDefault — let normal Backspace behavior continue (but no input is focused, see top of handleKeyDown).
      this.backspaceHeld = true;
      this.cheatBuffer = '';
      return false;
    }

    if (!this.backspaceHeld) return false;

    const ch = e.key.toLowerCase();
    if (ch.length !== 1 || !/^[a-z0-9]$/.test(ch)) return false;

    this.cheatBuffer = (this.cheatBuffer + ch).slice(-CHEAT_SEQUENCE.length);
    e.preventDefault();
    if (this.cheatBuffer === CHEAT_SEQUENCE) {
      this.cheatBuffer = '';
      this.backspaceHeld = false;
      networkManager.sendAction({
        playerId: this.localPlayerId,
        type: ActionType.ACTIVATE_CHEAT,
      });
    }
    // Always swallow alphanumeric keys while Backspace is held so they
    // don't trigger normal shortcuts (e.g. "d" = Open Door).
    return true;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't intercept when typing in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Cheat code — runs before any other key handling so Backspace and the
    // iddqd letters don't trigger normal shortcuts (e.g. 'd' = Open Door).
    if (this.tryCheatCode(e)) return;

    const state = gameStore.state;
    if (!state || state.phase === GamePhase.Lobby) return;

    // Escape always works — cancel current mode or close modals
    if (e.key === 'Escape') {
      this.inputController.setMode('DEFAULT');
      this.gameHud()?.hideMessage();
      return;
    }

    // "?" — show keyboard shortcuts help
    if (e.key === '?') {
      this.openShortcutHelp();
      return;
    }

    // Game-over phase — no actions
    if (state.gameResult) return;

    // L — toggle the event log
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      this.gameHud()?.toggleLog();
      return;
    }

    // F / Home — recentre the board
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Home' || e.key.toLowerCase() === 'f')) {
      e.preventDefault();
      this.renderer?.fitBoard(true);
      return;
    }

    const isMyTurn = state.players[state.activePlayerIndex] === this.localPlayerId;

    // Tab — cycle through owned survivors
    if (e.key === 'Tab') {
      e.preventDefault();
      const mySurvivors = Object.values(state.survivors)
        .filter(s => s.playerId === this.localPlayerId && s.wounds < s.maxHealth);
      if (mySurvivors.length <= 1) return;

      const currentIdx = mySurvivors.findIndex(s => s.id === this.inputController.selection);
      const nextIdx = (currentIdx + 1) % mySurvivors.length;
      // Trigger selection via the public method
      this.inputController.selectMySurvivorById(mySurvivors[nextIdx].id);
      return;
    }

    // Number keys 1-6 — select survivor by index
    const numKey = parseInt(e.key);
    if (numKey >= 1 && numKey <= 6) {
      const mySurvivors = Object.values(state.survivors)
        .filter(s => s.playerId === this.localPlayerId && s.wounds < s.maxHealth);
      const target = mySurvivors[numKey - 1];
      if (target) {
        this.inputController.selectMySurvivorById(target.id);
      }
      return;
    }

    // Everything below requires it to be my turn with a selected survivor
    if (!isMyTurn) return;

    const survivorId = this.inputController.selection;
    if (!survivorId) return;

    const survivor = state.survivors[survivorId];
    if (!survivor || survivor.playerId !== this.localPlayerId) return;
    if (!canTakeAction(survivor)) return;

    const key = e.key.toLowerCase();

    if (key === 's') {
      if (!survivor.hasSearched || survivor.cheatMode) {
        networkManager.sendAction({
          playerId: this.localPlayerId,
          survivorId: survivor.id,
          type: ActionType.SEARCH,
        });
      }
      return;
    }

    if (key === 'n') {
      networkManager.sendAction({
        playerId: this.localPlayerId,
        survivorId: survivor.id,
        type: ActionType.MAKE_NOISE,
      });
      return;
    }

    if (key === 'd') {
      const canOpenDoor = survivor.inventory.some(c => c.inHand && c.canOpenDoor);
      if (canOpenDoor) {
        this.inputController.setMode('OPEN_DOOR');
        notificationManager.show({ variant: 'info', message: es.keys.pickDoor, duration: 5000 });
      }
      return;
    }

    if (key === 'o') {
      const currentZone = state.zones[survivor.position.zoneId];
      if (currentZone?.hasObjective) {
        networkManager.sendAction({
          playerId: this.localPlayerId,
          survivorId: survivor.id,
          type: ActionType.TAKE_OBJECTIVE,
        });
      }
      return;
    }

    if (key === 't') {
      const zoneId = survivor.position.zoneId;
      const others = Object.values(state.survivors).filter(
        s => s.position.zoneId === zoneId && s.id !== survivor.id && s.wounds < s.maxHealth,
      );
      if (others.length === 1) {
        networkManager.sendAction({
          playerId: this.localPlayerId,
          survivorId: survivor.id,
          type: ActionType.TRADE_START,
          payload: { targetSurvivorId: others[0].id },
        });
      } else if (others.length > 1) {
        // Multiple targets — let the HUD handle selection via click
        const btn = document.getElementById('btn-trade');
        btn?.click();
      } else {
        notificationManager.show({ variant: 'warning', message: es.keys.noTradePartner, duration: 3000 });
      }
      return;
    }

    if (key === 'e') {
      networkManager.sendAction({
        playerId: this.localPlayerId,
        survivorId: survivor.id,
        type: ActionType.END_TURN,
      });
      return;
    }

    // Space — confirm pending move
    if (e.key === ' ') {
      e.preventDefault();
      this.inputController.confirmPendingMove();
      return;
    }
  }

  private openShortcutHelp(): void {
    const shortcuts = [
      { key: 'S', desc: es.keys.search },
      { key: 'N', desc: es.keys.noise },
      { key: 'D', desc: es.keys.door },
      { key: 'O', desc: es.keys.objective },
      { key: 'T', desc: es.keys.trade },
      { key: 'E', desc: es.keys.endTurn },
      { key: es.keys.space, desc: es.keys.confirmMove },
      { key: `F / ${es.keys.home}`, desc: es.keys.fitBoard },
      { key: 'L', desc: es.keys.log },
      { key: 'Tab', desc: es.keys.cycleSurvivors },
      { key: '1–6', desc: es.keys.selectSurvivor },
      { key: es.keys.esc, desc: es.keys.cancel },
      { key: '?', desc: es.keys.help },
    ];

    const rows = shortcuts.map(s =>
      `<div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-desc">${s.desc}</span>
      </div>`
    ).join('');

    modalManager.open({
      title: es.keys.helpTitle,
      size: 'sm',
      renderBody: () => `<div class="shortcut-list">${rows}</div>`,
      renderFooter: () => renderButton({ label: es.common.close, variant: 'secondary', dataAction: 'modal-close' }),
    });
  }
}
