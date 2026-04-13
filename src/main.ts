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
import { MenuUI } from './client/ui/MenuUI';
import { generateDiff } from './utils/StateDiff';
import { GamePhase } from './types/GameState';
import { MapEditor } from './client/editor/MapEditor';
import { loadTileDefinitionsFromServer } from './config/TileDefinitions';
import { KeyboardManager } from './client/KeyboardManager';
import { assetManager } from './client/AssetManager';
import { audioManager } from './client/AudioManager';

const PLAYER_ID_KEY = 'endead_player_id';
const NICKNAME_KEY = 'endead_nickname';

let menuUi: MenuUI | null = null;
let lobbyUi: LobbyUI | null = null;
let gameHud: GameHUD | null = null;
let pixiApp: PIXI.Application | null = null;
let inputController: InputController | null = null;
let keyboardManager: KeyboardManager | null = null;
let unsubscribeStore: (() => void) | null = null;
let currentRoomId: string | null = null;
let roomInitToken = 0;

function getOrCreatePlayerId(): string {
  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = `player-${Math.floor(Math.random() * 1000000)}`;
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }
  return playerId;
}

function getNickname(): string {
  const stored = localStorage.getItem(NICKNAME_KEY)?.trim();
  if (stored) return stored;
  return getOrCreatePlayerId();
}

function setNickname(value: string): void {
  const trimmed = value.trim().slice(0, 24);
  localStorage.setItem(NICKNAME_KEY, trimmed || getOrCreatePlayerId());
}

function parseRoomFromPath(): string | null {
  const match = window.location.pathname.match(/^\/room\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function showMenu(infoMessage?: string, roomIdPrefill?: string): void {
  cleanupRoomUi();

  menuUi?.destroy();
  menuUi = new MenuUI({
    nickname: getNickname(),
    roomIdPrefill,
    infoMessage,
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
        showMenu('Could not create room. Please try again.');
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
  lobbyUi?.hide();
  lobbyUi = null;

  gameHud = null;

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
  const animationController = new AnimationController(app, (id) => renderer.getSprite(id));
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

  keyboardManager = new KeyboardManager(playerId, inputController, () => gameHud);

  unsubscribeStore = gameStore.subscribe((newState, prevState) => {
    if (!inputController) return;

    if (newState.phase === GamePhase.Lobby) {
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

    if (!gameHud) {
      gameHud = new GameHUD(inputController, playerId);
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
        }
      }
    }

    renderer.render(newState, inputController.getRenderOptions(newState));
    gameHud.update(newState, inputController.selection);
  });

  networkManager.onReconnecting = (attempt, maxAttempts) => {
    showConnectionBanner(`Reconnecting... (${attempt}/${maxAttempts})`);
  };

  networkManager.onConnected = () => {
    networkManager.joinGame(playerId, roomId, nickname);
    showConnectionBanner('Reconnected!', 2000);
  };

  networkManager.onDisconnected = () => {
    showConnectionBanner('Connection lost. Please refresh the page.');
  };

  networkManager.onServerError = (error) => {
    if (error.code === 'GAME_IN_PROGRESS') {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu('Game currently in progress', roomId);
      return;
    }

    if (error.code === 'ROOM_NOT_FOUND') {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu('Room not found', roomId);
      return;
    }

    if (error.code === 'SESSION_REPLACED') {
      showMenu('Session replaced by another connection.');
    }

    if (error.code === 'KICKED') {
      networkManager.disconnect();
      window.history.pushState({}, '', '/');
      showMenu('You were kicked by the host.');
    }
  };

  networkManager.connect();
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
    });
    app.canvas.style.position = 'absolute';
    app.canvas.style.top = '0';
    app.canvas.style.left = '0';
    document.body.appendChild(app.canvas);

    await loadTileDefinitionsFromServer();
    new MapEditor(app);
    return;
  }

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
