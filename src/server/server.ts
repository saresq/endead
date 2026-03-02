
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initialGameState, GameState, PlayerId, GamePhase } from '../types/GameState';
import { processAction } from '../services/ActionProcessor';
import { ActionRequest, ActionResponse, ActionType } from '../types/Action';
import path from 'path';
import { fileURLToPath } from 'url';
import { HeartbeatManager } from './HeartbeatManager';
import { PersistenceService } from '../services/PersistenceService';
import fs from 'fs/promises';

// --- Server Configuration ---
const app = express();
app.use(express.json()); // Enable JSON body parsing
const server = createServer(app);
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ server }); // Attach to HTTP server
const heartbeatManager = new HeartbeatManager(wss);
const MAX_PLAYERS = 6;

// --- API Routes ---

app.get('/api/maps', async (req, res) => {
  try {
    const mapsDir = path.resolve(process.cwd(), 'data/maps');
    // Ensure directory exists
    try {
        await fs.access(mapsDir);
    } catch {
        await fs.mkdir(mapsDir, { recursive: true });
    }

    const files = await fs.readdir(mapsDir);
    const maps = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(mapsDir, file), 'utf-8');
        try {
            maps.push(JSON.parse(content));
        } catch (e) {
            console.error(`Failed to parse map ${file}:`, e);
        }
      }
    }
    res.json(maps);
  } catch (error) {
    console.error('Error fetching maps:', error);
    res.status(500).json({ error: 'Failed to fetch maps' });
  }
});

app.post('/api/maps', async (req, res) => {
  try {
    const mapData = req.body;
    if (!mapData || !mapData.name || !mapData.tiles) {
      res.status(400).json({ error: 'Invalid map data' });
      return;
    }

    // Generate ID if missing
    if (!mapData.id) {
        mapData.id = `map-${Date.now()}`;
    }

    const mapsDir = path.resolve(process.cwd(), 'data/maps');
    try {
        await fs.access(mapsDir);
    } catch {
        await fs.mkdir(mapsDir, { recursive: true });
    }

    const filePath = path.join(mapsDir, `${mapData.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(mapData, null, 2));

    log(`Map saved: ${mapData.name} (${mapData.id})`);
    res.json({ success: true, id: mapData.id });
  } catch (error) {
    console.error('Error saving map:', error);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

// --- Static File Serving (Production) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  
  // SPA Fallback
  app.get('/{*any}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// --- State ---
let gameState: GameState = { ...initialGameState };
const clients = new Map<WebSocket, PlayerId>();
const connections = new Map<PlayerId, WebSocket>();

// --- Initialization ---
(async () => {
  await PersistenceService.init();
  const loadedState = await PersistenceService.loadState();
  if (loadedState) {
    gameState = loadedState;
    console.log('[Server] Game state restored from disk.');
  } else {
    console.log('[Server] No valid save found. Starting fresh.');
  }
})();

// --- Helpers ---
const log = (msg: string) => console.log(`[Server] ${new Date().toISOString()} - ${msg}`);

const broadcastState = () => {
  const message = JSON.stringify({
    type: 'STATE_UPDATE',
    payload: gameState,
  });

  clients.forEach((_, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
};

const sendError = (ws: WebSocket, error: { code: string; message: string }) => {
  ws.send(JSON.stringify({
    type: 'ERROR',
    payload: error,
  }));
};

// --- Connection Handling ---

// Start Heartbeat
heartbeatManager.start();

wss.on('connection', (ws) => {
  log('New connection established.');
  heartbeatManager.handleConnection(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (e) {
      log(`Failed to parse message: ${e}`);
      sendError(ws, { code: 'INVALID_JSON', message: 'Message must be valid JSON.' });
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
    handleDisconnect(ws);
  });
});

// --- Message Routing ---

interface JoinMessage {
  type: 'JOIN';
  payload: { playerId: PlayerId };
}

interface ActionMessage {
  type: 'ACTION';
  payload: ActionRequest;
}

type ClientMessage = JoinMessage | ActionMessage;

function handleMessage(ws: WebSocket, message: ClientMessage) {
  switch (message.type) {
    case 'JOIN':
      handleJoin(ws, message.payload);
      break;
    case 'ACTION':
      handleAction(ws, message.payload);
      break;
    default:
      log(`Unknown message type: ${(message as any).type}`);
      sendError(ws, { code: 'UNKNOWN_TYPE', message: `Unknown message type: ${(message as any).type}` });
  }
}

// --- Specific Handlers ---

function handleJoin(ws: WebSocket, payload: { playerId: PlayerId }) {
  const { playerId } = payload;

  if (!playerId) {
    sendError(ws, { code: 'MISSING_PLAYER_ID', message: 'playerId is required.' });
    return;
  }

  // 1. Check if player already connected
  const existingSocket = connections.get(playerId);
  if (existingSocket) {
    log(`Player ${playerId} re-connecting. Terminating previous session.`);
    if (existingSocket.readyState === WebSocket.OPEN) {
      existingSocket.send(JSON.stringify({
        type: 'ERROR',
        payload: { code: 'SESSION_REPLACED', message: 'You have connected from another location.' }
      }));
      existingSocket.close(1000, 'New session connected');
    }
  } else {
    // New connection check limit
    if (connections.size >= MAX_PLAYERS) {
      sendError(ws, { code: 'SERVER_FULL', message: 'Game server is full.' });
      return;
    }
    log(`Player ${playerId} joined.`);
  }

  // 2. Register Connection (Overwrite if exists)
  clients.set(ws, playerId);
  connections.set(playerId, ws);

  // 3. Auto-Add to Lobby if in Lobby Phase
  if (gameState.phase === GamePhase.Lobby) {
    // Check if player already in lobby list
    const inLobby = gameState.lobby.players.some(p => p.id === playerId);
    if (!inLobby) {
        gameState.lobby.players.push({
            id: playerId,
            name: playerId, // Default name
            ready: false,
            characterClass: 'Standard' // Default class
        });
        // We modified state directly here, should probably go through processor but JOIN is special
        // Persist logic similar to action
        PersistenceService.saveState(gameState); 
        broadcastState();
    } else {
        // Just send state
        ws.send(JSON.stringify({
            type: 'STATE_UPDATE',
            payload: gameState,
        }));
    }
  } else {
      // Game in progress, just send state
      ws.send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: gameState,
      }));
  }
}

function handleDisconnect(ws: WebSocket) {
  const playerId = clients.get(ws);
  if (playerId) {
    log(`Socket disconnected for player ${playerId}.`);
    clients.delete(ws);
    
    if (connections.get(playerId) === ws) {
      connections.delete(playerId);
      log(`Player ${playerId} fully removed from active sessions.`);
      
      // If in lobby, remove them? Or keep them as "offline"?
      // For MVP, if in Lobby, remove them to allow others.
      if (gameState.phase === GamePhase.Lobby) {
          gameState.lobby.players = gameState.lobby.players.filter(p => p.id !== playerId);
          broadcastState();
      }
    } else {
      log(`Player ${playerId} disconnected an old socket. Session preserved.`);
    }
  } else {
    log('Unidentified client disconnected.');
  }
}

function handleAction(ws: WebSocket, request: ActionRequest) {
  const playerId = clients.get(ws);

  if (!playerId) {
    sendError(ws, { code: 'UNAUTHORIZED', message: 'You must JOIN before sending actions.' });
    return;
  }

  // Enforce Identity: Request must act on behalf of the connected player
  if (request.playerId !== playerId) {
    sendError(ws, { code: 'IDENTITY_MISMATCH', message: `You are connected as ${playerId} but tried to act as ${request.playerId}.` });
    return;
  }

  log(`Processing action: ${request.type} from ${playerId}`);

  // Process Action via ActionProcessor
  const response: ActionResponse = processAction(gameState, request);

  if (response.success && response.newState) {
    log(`Action successful. Broadcasting state update.`);
    gameState = response.newState;
    
    // Persist State
    PersistenceService.saveState(gameState).catch(err => {
      console.error('[Server] Persistence failure:', err);
    });

    broadcastState();
  } else {
    const error = response.error || { code: 'UNKNOWN_ERROR', message: 'Action failed unexpectedly.' };
    log(`Action failed: ${error.code} - ${error.message}`);
    sendError(ws, error);
  }
}

server.listen(PORT, () => {
  log(`Server started on port ${PORT}`);
});
