
import './style.css';
import * as PIXI from 'pixi.js';
import { gameStore } from './client/GameStore';
import { PixiBoardRenderer } from './client/PixiBoardRenderer';
import { InputController } from './client/InputController';
import { networkManager } from './client/NetworkManager';
import { AnimationController } from './client/AnimationController';
import { GameHUD } from './client/ui/GameHUD';
import { LobbyUI } from './client/ui/LobbyUI';
import { generateDiff } from './utils/StateDiff';
import { GamePhase } from './types/GameState';

// --- Initialization ---

async function init() {
  console.log('Initializing Game Client...');

  // 1. Generate/Get Player ID
  // For MVP, simple random ID or prompt. 
  // Ideally stored in localStorage.
  let playerId = localStorage.getItem('endead_player_id');
  if (!playerId) {
      playerId = `player-${Math.floor(Math.random() * 10000)}`;
      localStorage.setItem('endead_player_id', playerId);
  }
  console.log(`Playing as: ${playerId}`);

  // 2. Setup PixiJS
  const app = new PIXI.Application();
  await app.init({ 
    background: '#333333', 
    resizeTo: window,
    antialias: true 
  });
  
  const container = document.getElementById('app');
  if (container) {
    container.appendChild(app.canvas);
  } else {
    document.body.appendChild(app.canvas);
  }

  // 3. Setup Game Systems
  const renderer = new PixiBoardRenderer(app);
  const animationController = new AnimationController(app, (id) => renderer.getSprite(id));

  // UI Components
  let gameHud: GameHUD | null = null;
  let lobbyUi: LobbyUI | null = null;

  const inputController = new InputController(
    app, 
    renderer, // Pass renderer
    playerId, 
    (selectedId) => {
      // On Selection Change
      if (gameStore.state) {
        // Only render highlight if in game phase
        if (gameStore.state.phase !== GamePhase.Lobby) {
            renderer.render(gameStore.state, { 
              activeSurvivorId: selectedId || undefined 
            });
        }
        gameHud?.update(gameStore.state, selectedId);
      }
    },
    (mode) => {
      // On Mode Change
      gameHud?.updateMode(mode);
    }
  );

  // Initialize UIs
  lobbyUi = new LobbyUI(playerId);
  lobbyUi.hide(); // Hide initially until state confirms

  // 4. Subscribe to Store Updates (Server State)
  gameStore.subscribe((newState, prevState) => {
    // Phase Management
    if (newState.phase === GamePhase.Lobby) {
        if (!lobbyUi) lobbyUi = new LobbyUI(playerId!);
        lobbyUi.update(newState);
        lobbyUi.show();
        
        if (gameHud) {
            // Remove Game HUD if we went back to lobby (rare)
        }
        
    } else {
        // Game Phase (Players, Zombies, etc.)
        if (lobbyUi) lobbyUi.hide();
        
        if (!gameHud) {
            gameHud = new GameHUD(inputController, playerId!);
        }
        
        // Ensure my survivor is selected if none is (Auto-Selection Fix)
        if (!inputController.selection) {
            inputController.selectMySurvivor(newState);
        } else {
            // Check if selection is still valid (survivor exists)
            const selected = newState.survivors[inputController.selection];
            if (!selected) {
                 inputController.selectMySurvivor(newState);
            }
        }
        
        // Check Diffs for Animations (Only in game)
        if (prevState && prevState.phase !== GamePhase.Lobby) {
          const diffs = generateDiff(prevState.zombies, newState.zombies);
          for (const op of diffs) {
            if (op.op === 'add' && op.path.length === 1) {
               // Spawn anim logic
            }
          }
        }

        // Render State
        renderer.render(newState, { 
          activeSurvivorId: inputController.selection || undefined 
        });
        
        // Update HUD
        gameHud.update(newState, inputController.selection);

        // Post-Render Animation Triggers
        if (prevState && prevState.phase !== GamePhase.Lobby) {
          const diffs = generateDiff(prevState.zombies, newState.zombies);
          for (const op of diffs) {
            if (op.op === 'add' && op.path.length === 1) {
              animationController.handleEvent({
                type: 'SPAWN',
                entityId: op.path[0] as string
              });
            }
          }
        }
    }
  });

  // 5. Connect Network
  networkManager.onConnected = () => {
    console.log('Connected! Joining game...');
    networkManager.joinGame(playerId!);
  };
  
  networkManager.connect();
}

init().catch(console.error);
