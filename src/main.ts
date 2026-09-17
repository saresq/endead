import './styles/index.css';
import { notificationManager } from './client/ui/NotificationManager';
import * as PIXI from 'pixi.js';
import { gameStore } from './client/GameStore';
import { PixiBoardRenderer } from './client/PixiBoardRenderer';
import { InputController } from './client/InputController';
import { networkManager } from './client/NetworkManager';
import { AnimationController } from './client/AnimationController';
import { GameHUD } from './client/ui/GameHUD';
import { LobbyUI } from './client/ui/LobbyUI';
import { MenuUI, type MenuErrorState } from './client/ui/MenuUI';
import { generateDiff } from './utils/StateDiff';
import { GamePhase } from './types/GameState';
import { MapEditor } from './client/editor/MapEditor';
import { ensureEditorSecret } from './client/editor/editorSecret';
import { loadTileDefinitionsFromServer } from './config/TileDefinitions';
import { KeyboardManager } from './client/KeyboardManager';
import { assetManager } from './client/AssetManager';
import { audioManager } from './client/AudioManager';
import { boardCuesFor } from './client/ui/eventLog';
import { getNickname, getOrCreatePlayerId, setNickname } from './client/identity';
import { es } from './strings/es';

let menuUi: MenuUI | null = null;
let lobbyUi: LobbyUI | null = null;
let gameHud: GameHUD | null = null;
let pixiApp: PIXI.Application | null = null;
let inputController: InputController | null = null;
let keyboardManager: KeyboardManager | null = null;
let unsubscribeStore: (() => void) | null = null;
let currentRoomId: string | null = null;
let roomInitToken = 0;

function parseRoomFromPath(): string | null {
  const match = window.location.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function showMenu(
  infoMessage?: string,
  roomIdPrefill?: string,
  errorState?: MenuErrorState
): void {
  cleanupRoomUi();

  menuUi?.destroy();
  menuUi = new MenuUI({
    nickname: getNickname(),
    roomIdPrefill,
    infoMessage,
    errorState: errorState ?? null,
    onNicknameChange: (nickname) => setNickname(nickname),
    onCreateRoom: async (nickname) => {
      setNickname(nickname);
      try {
        const response = await fetch('/api/rooms', { method: 'POST' });
        if (!response.ok) throw new Error('Failed to create room');
        const data = await response.json();
        const roomId = data.roomId;
        window.history.pushState({}, '', `/room/${roomId}`);
        menuUi?.destroy();
        menuUi = null;
        startRoom(roomId);
      } catch (error) {
        console.error(error);
        showMenu(es.menu.createFailed);
      }
    },
    onJoinRoom: (roomId, nickname) => {
      setNickname(nickname);
      const normalizedRoomId = roomId.trim();
      if (!normalizedRoomId) return;
      window.history.pushState({}, '', `/room/${normalizedRoomId}`);
      menuUi?.destroy();
      menuUi = null;
      startRoom(normalizedRoomId);
    },
    onBack: () => {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu(undefined, roomIdPrefill);
    }
  });
}

function cleanupRoomUi(): void {
  lobbyUi?.destroy();
  lobbyUi = null;

  gameHud?.destroy();
  gameHud = null;
  document.documentElement.removeAttribute('data-danger');

  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }

  inputController = null;

  if (keyboardManager) {
    keyboardManager.destroy();
    keyboardManager = null;
  }

  if (pixiApp) {
    pixiApp.destroy(true);
    pixiApp = null;
  }

  const hud = document.getElementById('game-hud');
  if (hud) hud.remove();

  const lobby = document.getElementById('lobby-ui');
  if (lobby) lobby.remove();

  const messageOverlay = document.getElementById('message-overlay');
  if (messageOverlay) messageOverlay.remove();

  const appContainer = document.getElementById('app');
  if (appContainer) appContainer.innerHTML = '';

  currentRoomId = null;
}

async function startRoom(roomId: string): Promise<void> {
  const token = ++roomInitToken;
  networkManager.disconnect();
  currentRoomId = roomId;
  cleanupRoomUi();
  currentRoomId = roomId;

  const playerId = getOrCreatePlayerId();
  const nickname = getNickname();

  const app = new PIXI.Application();
  await app.init({
    background: '#333333',
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    roundPixels: true,
  });

  if (token !== roomInitToken) {
    app.destroy(true);
    return;
  }

  pixiApp = app;

  const container = document.getElementById('app');
  if (container) {
    container.innerHTML = '';
    container.appendChild(app.canvas);
  } else {
    document.body.appendChild(app.canvas);
  }

  // Load assets in background (non-blocking — rendering/audio use fallbacks)
  assetManager.loadAssets();

  // Initialize audio on first click (browser requires user gesture)
  const initAudio = () => {
    audioManager.ensureContext();
    audioManager.loadAssets();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  const renderer = new PixiBoardRenderer(app);
  const animationController = new AnimationController(app, (id) => renderer.getSprite(id), renderer);
  renderer.setAnimationController(animationController);
  renderer.setAssetManager(assetManager);

  lobbyUi = new LobbyUI(playerId, roomId);
  lobbyUi.show();

  inputController = new InputController(
    app,
    renderer,
    playerId,
    (selectedId) => {
      if (gameStore.state && gameStore.state.phase !== GamePhase.Lobby) {
        renderer.render(gameStore.state, inputController!.getRenderOptions(gameStore.state));
      }
      gameHud?.update(gameStore.state, selectedId);
    },
    (mode) => {
      gameHud?.updateMode(mode);
    }
  );

  keyboardManager = new KeyboardManager(playerId, inputController, () => gameHud, renderer);

  // Dev-only handle for driving the board from a browser test: a zone id is
  // worthless to a test without the screen point it sits at. Stripped from the
  // production bundle by the `import.meta.env.DEV` guard.
  if (import.meta.env.DEV) {
    (window as unknown as { __endead?: unknown }).__endead = {
      app, renderer, inputController, gameHud: () => gameHud, playerId,
    };
  }

  unsubscribeStore = gameStore.subscribe((newState, prevState) => {
    if (!inputController) return;

    if (newState.phase === GamePhase.Lobby) {
      if (gameHud) {
        gameHud.destroy();
        gameHud = null;
      }
      if (!lobbyUi) lobbyUi = new LobbyUI(playerId, roomId);
      lobbyUi.update(newState);
      lobbyUi.show();
      return;
    }

    if (lobbyUi) lobbyUi.hide();

    // Music: start gameplay track on first non-lobby state
    if (!prevState || prevState.phase === GamePhase.Lobby) {
      audioManager.playMusic('gameplay_low');
    }

    // Music: switch on danger level change
    if (prevState && prevState.currentDangerLevel !== newState.currentDangerLevel) {
      const high = newState.currentDangerLevel === 'ORANGE' || newState.currentDangerLevel === 'RED';
      audioManager.playMusic(high ? 'gameplay_high' : 'gameplay_low');
    }

    // Music: game over stings
    if (newState.gameResult && (!prevState || !prevState.gameResult)) {
      audioManager.stopMusic();
      audioManager.playSFX(newState.gameResult === 'VICTORY' ? 'victory' : 'defeat');
    }

    // Cheat code activation — broadcast a notification to every connected client.
    if (
      newState.lastAction?.type === 'ACTIVATE_CHEAT' &&
      newState.lastAction.timestamp !== prevState?.lastAction?.timestamp
    ) {
      notificationManager.show({
        type: 'alert',
        variant: 'warning',
        title: es.connection.cheatTitle,
        message: newState.lastAction.description ?? es.connection.cheatMessage,
        priority: 'high',
        duration: 6000,
      });
    }

    if (!gameHud) {
      gameHud = new GameHUD(inputController, playerId, { renderer });
    }

    if (!inputController.selection) {
      inputController.selectMySurvivor(newState);
    } else {
      const selected = newState.survivors[inputController.selection];
      if (!selected) inputController.selectMySurvivor(newState);
    }

    if (prevState && prevState.phase !== GamePhase.Lobby) {
      const diffs = generateDiff(prevState.zombies, newState.zombies);
      for (const op of diffs) {
        if (op.op === 'add' && op.path.length === 1) {
          animationController.handleEvent({
            type: 'SPAWN',
            entityId: op.path[0] as string,
          });
          audioManager.playSFX('zombie_spawn');
        } else if (op.op === 'remove' && op.path.length === 1) {
          animationController.handleEvent({
            type: 'DEATH',
            entityId: op.path[0] as string,
          });
        }
      }

      for (const cue of boardCuesFor(prevState, newState)) {
        animationController.floatText(cue.zoneId, cue.text, cue.tone);
      }
    }

    renderer.render(newState, inputController.getRenderOptions(newState));
    gameHud.update(newState, inputController.selection);

    // Turn start notice: toast, plus a title marker while the tab is hidden.
    if (prevState && prevState.phase !== GamePhase.Lobby && !newState.gameResult) {
      const wasMine = prevState.players[prevState.activePlayerIndex] === playerId;
      const isMine = newState.players[newState.activePlayerIndex] === playerId;
      const newRound = newState.turn !== prevState.turn;
      if (isMine && (!wasMine || newRound) && newState.phase === GamePhase.Players) {
        notificationManager.show({ variant: 'info', message: es.connection.turnToast, duration: 2000 });
        markTitleWhileHidden();
      }
    }

    // Camera: frame the new active survivor when the turn passes, only if it is off-screen.
    if (prevState && prevState.phase !== GamePhase.Lobby && prevState.activePlayerIndex !== newState.activePlayerIndex) {
      const activePid = newState.players[newState.activePlayerIndex];
      const activeSurvivor = Object.values(newState.survivors).find(s => s.playerId === activePid);
      if (activeSurvivor) {
        renderer.focusZone(activeSurvivor.position.zoneId, { onlyIfOffscreen: true, animate: true });
      }
    }
  });

  networkManager.onReconnecting = (attempt, maxAttempts) => {
    showConnectionBanner(es.connection.reconnecting(attempt, maxAttempts));
  };

  let hasConnected = false;
  networkManager.onConnected = () => {
    networkManager.joinGame(playerId, roomId, nickname);
    // Only a real reconnect gets the banner, not the first connection.
    if (hasConnected) {
      showConnectionBanner(es.connection.reconnected, 2000);
    } else if (connectionBannerId) {
      notificationManager.dismiss(connectionBannerId);
      connectionBannerId = null;
    }
    hasConnected = true;
  };

  networkManager.onDisconnected = () => {
    showConnectionBanner(es.connection.lost);
  };

  networkManager.onServerError = (error) => {
    if (error.code === 'ROOM_NOT_FOUND') {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu(es.menu.roomNotFound(roomId), roomId, 'not-found');
      return;
    }

    if (error.code === 'SERVER_FULL') {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu(es.menu.serverFull, roomId, 'full');
      return;
    }

    if (error.code === 'SESSION_REPLACED') {
      showMenu(es.menu.sessionReplaced);
      return;
    }

    if (error.code === 'KICKED') {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu(es.menu.kicked);
      return;
    }

    // Action rejection — show notification so player knows what went wrong
    notificationManager.show({
      variant: 'danger',
      message: error.message || es.serverErrors.unknownError,
      duration: 3000,
    });
  };

  networkManager.connect();
}

const TITLE_MARK = '● ';

/** Prefix the tab title until the player comes back to the tab. */
function markTitleWhileHidden(): void {
  if (!document.hidden || document.title.startsWith(TITLE_MARK)) return;
  document.title = TITLE_MARK + document.title;
  const restore = () => {
    if (document.hidden) return;
    if (document.title.startsWith(TITLE_MARK)) document.title = document.title.slice(TITLE_MARK.length);
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);
}

let connectionBannerId: string | null = null;

function showConnectionBanner(message: string, autoDismissMs?: number): void {
  if (connectionBannerId) {
    notificationManager.dismiss(connectionBannerId);
  }
  connectionBannerId = notificationManager.show({
    type: 'alert',
    variant: autoDismissMs ? 'success' : 'warning',
    message,
    duration: autoDismissMs ?? 0,
    priority: autoDismissMs ? 'normal' : 'high',
  });
}

async function init(): Promise<void> {
  const editorParams = new URLSearchParams(window.location.search);
  if (window.location.pathname === '/editor' || editorParams.has('editor')) {
    const appDiv = document.getElementById('app');
    if (appDiv) appDiv.style.display = 'none';

    const app = new PIXI.Application();
    await app.init({
      background: '#111111',
      resizeTo: window,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      roundPixels: true,
    });
    app.canvas.style.position = 'absolute';
    app.canvas.style.top = '0';
    app.canvas.style.left = '0';
    document.body.appendChild(app.canvas);

    if (!await ensureEditorSecret()) {
      app.destroy(true);
      document.body.innerHTML = '<p style="color:#ccc;font:14px monospace;padding:24px">Editor locked.</p>';
      return;
    }

    await loadTileDefinitionsFromServer();
    new MapEditor(app);
    return;
  }

  // Claim this tab's identity while `tab` is still readable in the URL: every
  // pushState below drops the query, and identity.ts latches on the store.
  getOrCreatePlayerId();

  window.onpopstate = () => {
    networkManager.disconnect();
    const roomId = parseRoomFromPath();
    if (roomId) {
      menuUi?.destroy();
      menuUi = null;
      startRoom(roomId);
    } else {
      showMenu();
    }
  };

  const roomId = parseRoomFromPath();
  if (roomId) {
    startRoom(roomId);
    return;
  }

  showMenu();
}

init().catch((error) => {
  console.error('Fatal init error:', error);
});
