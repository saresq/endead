import { GamePhase } from '../types/GameState';
import { ActionType } from '../types/Action';
import { gameStore } from './GameStore';
import { networkManager } from './NetworkManager';
import { InputController } from './InputController';
import { GameHUD } from './ui/GameHUD';
import { notificationManager } from './ui/NotificationManager';
import { modalManager } from './ui/overlays/ModalManager';
import { renderButton } from './ui/components/Button';

export class KeyboardManager {
  private localPlayerId: string;
  private inputController: InputController;
  private gameHud: () => GameHUD | null;
  private boundHandler: (e: KeyboardEvent) => void;

  constructor(
    playerId: string,
    inputController: InputController,
    getGameHud: () => GameHUD | null,
  ) {
    this.localPlayerId = playerId;
    this.inputController = inputController;
    this.gameHud = getGameHud;

    this.boundHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener('keydown', this.boundHandler);
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.boundHandler);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't intercept when typing in an input/textarea
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
    if (survivor.actionsRemaining < 1) return;

    const key = e.key.toLowerCase();

    if (key === 's') {
      if (!survivor.hasSearched) {
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
        notificationManager.show({ variant: 'info', message: 'Select a CLOSED DOOR zone to open it.', duration: 5000 });
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
        notificationManager.show({ variant: 'warning', message: 'No one else here to trade with.', duration: 3000 });
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
      { key: 'S', desc: 'Search current zone' },
      { key: 'N', desc: 'Make noise' },
      { key: 'D', desc: 'Open door' },
      { key: 'O', desc: 'Take objective' },
      { key: 'T', desc: 'Start trade' },
      { key: 'E', desc: 'End turn' },
      { key: 'Space', desc: 'Confirm pending move / Pan map' },
      { key: 'Tab', desc: 'Cycle through your survivors' },
      { key: '1–6', desc: 'Select survivor by index' },
      { key: 'Esc', desc: 'Cancel current action / Close modal' },
      { key: '?', desc: 'Show this help' },
    ];

    const rows = shortcuts.map(s =>
      `<div class="shortcut-row">
        <kbd class="shortcut-key">${s.key}</kbd>
        <span class="shortcut-desc">${s.desc}</span>
      </div>`
    ).join('');

    modalManager.open({
      title: 'Keyboard Shortcuts',
      size: 'sm',
      renderBody: () => `<div class="shortcut-list">${rows}</div>`,
      renderFooter: () => renderButton({ label: 'Close', variant: 'secondary', dataAction: 'modal-close' }),
    });
  }
}
