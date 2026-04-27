import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initialGameState, GameState, PlayerId, GamePhase } from '../types/GameState';
import { processAction } from '../services/ActionProcessor';
import { ActionRequest, ActionResponse, ActionType } from '../types/Action';
import { seedFromString } from '../services/Rng';
import path from 'path';
import { fileURLToPath } from 'url';
import { HeartbeatManager } from './HeartbeatManager';
import { persistenceService } from '../services/PersistenceService';
import { TILE_DEFINITIONS, registerTileDefinitions } from '../config/TileDefinitions';
import { repairExternalEdges } from '../services/TileDefinitionService';
import { TileDefinition } from '../types/TileDefinition';
import { generateDiff } from '../utils/StateDiff';

const app = express();
app.use(express.json({ limit: '50mb' }));
const server = createServer(app);
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ server });
const heartbeatManager = new HeartbeatManager(wss);
const MAX_PLAYERS = 6;
const ROOM_IDLE_CLEANUP_MS = 5 * 60 * 1000;

app.get('/api/maps', async (_req, res) => {
  try {
    const maps = persistenceService.loadAllMaps();
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

    if (!mapData.id) {
      mapData.id = `map-${Date.now()}`;
    }

    persistenceService.saveMap(mapData);
    log(`Map saved: ${mapData.name} (${mapData.id})`);
    res.json({ success: true, id: mapData.id });
  } catch (error) {
    console.error('Error saving map:', error);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

app.delete('/api/maps/:id', (req, res) => {
  try {
    persistenceService.deleteMap(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting map:', error);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// --- Tile Definitions ---

// Seed hardcoded defaults into DB if table is empty. Skipped in vitest so
// importing this module from a unit test never touches sqlite.
if (process.env.VITEST !== 'true') {
  if (persistenceService.tileDefinitionCount() === 0) {
    for (const [id, def] of Object.entries(TILE_DEFINITIONS)) {
      persistenceService.saveTileDefinition(id, def);
    }
    console.log(`Seeded ${Object.keys(TILE_DEFINITIONS).length} tile definitions into DB`);
  }

  // Load user-edited tile definitions from DB into the in-memory registry
  // so that compileScenario uses the correct data (not just hardcoded defaults)
  const dbDefs = persistenceService.loadAllTileDefinitions() as TileDefinition[];
  if (dbDefs.length > 0) {
    for (const def of dbDefs) {
      repairExternalEdges(def);
    }
    registerTileDefinitions(dbDefs);
    console.log(`Loaded ${dbDefs.length} tile definitions from DB into registry (edges repaired)`);
  }
}

app.get('/api/tile-definitions', (_req, res) => {
  try {
    res.json(persistenceService.loadAllTileDefinitions());
  } catch (error) {
    console.error('Error fetching tile definitions:', error);
    res.status(500).json({ error: 'Failed to fetch tile definitions' });
  }
});

app.delete('/api/tile-definitions', (_req, res) => {
  try {
    persistenceService.deleteAllTileDefinitions();
    res.json({ success: true });
  } catch (error) {
    console.error('Error wiping tile definitions:', error);
    res.status(500).json({ error: 'Failed to wipe tile definitions' });
  }
});

app.post('/api/tile-definitions', (req, res) => {
  try {
    const def = req.body;
    if (!def || !def.id || !def.cells || !def.edges) {
      res.status(400).json({ error: 'Invalid tile definition' });
      return;
    }
    persistenceService.saveTileDefinition(def.id, def);
    res.json({ success: true, id: def.id });
  } catch (error) {
    console.error('Error saving tile definition:', error);
    res.status(500).json({ error: 'Failed to save tile definition' });
  }
});

app.post('/api/tile-definitions/import', (req, res) => {
  try {
    const defs = req.body;
    if (!Array.isArray(defs)) {
      res.status(400).json({ error: 'Expected an array of tile definitions' });
      return;
    }
    let imported = 0;
    for (const def of defs) {
      if (!def?.id || !def?.cells || !def?.edges) continue;
      repairExternalEdges(def);
      persistenceService.saveTileDefinition(def.id, def);
      imported++;
    }
    // Reload into in-memory registry
    const dbDefs = persistenceService.loadAllTileDefinitions() as TileDefinition[];
    for (const d of dbDefs) repairExternalEdges(d);
    registerTileDefinitions(dbDefs);
    res.json({ success: true, imported });
  } catch (error) {
    console.error('Error importing tile definitions:', error);
    res.status(500).json({ error: 'Failed to import tile definitions' });
  }
});

app.post('/api/rooms', (_req, res) => {
  const roomId = generateRoomId();
  const room = createRoom(roomId);
  rooms.set(roomId, room);
  log(`Room created: ${roomId}`);
  res.json({ roomId });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('/{*any}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

interface RoomContext {
  id: string;
  gameState: GameState;
  previousState: GameState | null;
  clients: Map<WebSocket, PlayerId>;
  connections: Map<PlayerId, WebSocket>;
  cleanupTimer: NodeJS.Timeout | null;
}

interface SocketSession {
  roomId: string;
  playerId: PlayerId;
}

const rooms = new Map<string, RoomContext>();
const socketSessions = new Map<WebSocket, SocketSession>();

const log = (msg: string) => console.log(`[Server] ${new Date().toISOString()} - ${msg}`);

function sanitizeNickname(raw: string | undefined, fallback: string): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const stripped = raw.replace(/<[^>]*>/g, '').trim().slice(0, 24);
  return stripped || fallback;
}

function generateRoomId(): string {
  let roomId = '';
  do {
    roomId = Math.random().toString(36).slice(2, 8);
  } while (rooms.has(roomId));
  return roomId;
}

function createRoom(roomId: string): RoomContext {
  const gameState = structuredClone(initialGameState) as GameState;
  gameState.id = roomId;
  gameState.seed = seedFromString(`${roomId}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);

  return {
    id: roomId,
    gameState,
    previousState: null,
    clients: new Map(),
    connections: new Map(),
    cleanupTimer: null,
  };
}

function ensureRoom(roomId: string): RoomContext | null {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  // Try to restore from DB
  const savedState = persistenceService.loadRoom(roomId);
  if (savedState) {
    log(`Restoring room ${roomId} from database.`);
    const room: RoomContext = {
      id: roomId,
      gameState: savedState,
      previousState: null,
      clients: new Map(),
      connections: new Map(),
      cleanupTimer: null,
    };
    rooms.set(roomId, room);
    return room;
  }

  return null;
}

function clearRoomCleanup(room: RoomContext): void {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
}

function scheduleRoomCleanup(room: RoomContext): void {
  if (room.cleanupTimer || room.connections.size > 0) return;

  room.cleanupTimer = setTimeout(() => {
    const latestRoom = rooms.get(room.id);
    if (!latestRoom) return;
    if (latestRoom.connections.size > 0) {
      latestRoom.cleanupTimer = null;
      return;
    }

    rooms.delete(room.id);
    persistenceService.deleteRoom(room.id);
    log(`Room ${room.id} deleted after 5 minutes idle.`);
  }, ROOM_IDLE_CLEANUP_MS);

  log(`Room ${room.id} scheduled for cleanup in 5 minutes.`);
}

function sendError(ws: WebSocket, error: { code: string; message: string }) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'ERROR', payload: error }));
}

function broadcastRoomState(room: RoomContext, excludeSocket?: WebSocket): void {
  let message: string;

  if (room.previousState) {
    const patch = generateDiff(room.previousState, room.gameState);
    const patchMsg = JSON.stringify({ type: 'STATE_PATCH', payload: patch });
    const fullMsg = JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState });
    // Send whichever is smaller
    message = patchMsg.length < fullMsg.length ? patchMsg : fullMsg;
  } else {
    message = JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState });
  }

  room.previousState = structuredClone(room.gameState);

  room.clients.forEach((_playerId, ws) => {
    if (ws === excludeSocket) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });

  // Persist room state to DB on every change (SQLite WAL mode makes this fast)
  try {
    persistenceService.saveRoom(room.id, room.gameState);
  } catch (e) {
    console.error(`Failed to persist room ${room.id}:`, e);
  }
}

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

interface JoinMessage {
  type: 'JOIN';
  payload: {
    roomId: string;
    playerId: PlayerId;
    name?: string;
  };
}

interface ActionMessage {
  type: 'ACTION';
  payload: ActionRequest;
}

type ClientMessage = JoinMessage | ActionMessage;

function handleMessage(ws: WebSocket, message: ClientMessage) {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    sendError(ws, { code: 'INVALID_MESSAGE', message: 'Message must be an object with a "type" string field.' });
    return;
  }

  switch (message.type) {
    case 'JOIN':
      if (!message.payload || typeof message.payload !== 'object') {
        sendError(ws, { code: 'INVALID_PAYLOAD', message: 'JOIN requires a payload with roomId and playerId.' });
        return;
      }
      handleJoin(ws, message.payload);
      break;
    case 'ACTION':
      if (!message.payload || typeof message.payload !== 'object') {
        sendError(ws, { code: 'INVALID_PAYLOAD', message: 'ACTION requires a payload.' });
        return;
      }
      handleAction(ws, message.payload);
      break;
    default:
      sendError(ws, { code: 'UNKNOWN_TYPE', message: `Unknown message type: ${(message as any).type}` });
  }
}

function handleJoin(ws: WebSocket, payload: { roomId: string; playerId: PlayerId; name?: string }) {
  const { roomId, playerId, name } = payload;

  if (!roomId) {
    sendError(ws, { code: 'MISSING_ROOM_ID', message: 'roomId is required.' });
    return;
  }

  if (!playerId) {
    sendError(ws, { code: 'MISSING_PLAYER_ID', message: 'playerId is required.' });
    return;
  }

  const room = ensureRoom(roomId);
  if (!room) {
    sendError(ws, { code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
    return;
  }

  clearRoomCleanup(room);

  const existingSocket = room.connections.get(playerId);
  if (existingSocket && existingSocket !== ws) {
    log(`Player ${playerId} re-connecting to room ${roomId}. Terminating previous session.`);
    if (existingSocket.readyState === WebSocket.OPEN) {
      existingSocket.send(JSON.stringify({
        type: 'ERROR',
        payload: { code: 'SESSION_REPLACED', message: 'You have connected from another location.' }
      }));
      existingSocket.close(1000, 'New session connected');
    }
  }

  const knownPlayer = room.gameState.lobby.players.some((p) => p.id === playerId) || room.gameState.players.includes(playerId);
  const isLobby = room.gameState.phase === GamePhase.Lobby;

  if (!isLobby && !knownPlayer) {
    // Allow joining as spectator mid-game
    socketSessions.set(ws, { roomId, playerId });
    room.clients.set(ws, playerId);
    room.connections.set(playerId, ws);

    if (!room.gameState.spectators.includes(playerId)) {
      const newState = structuredClone(room.gameState) as GameState;
      newState.spectators.push(playerId);
      room.gameState = newState;
    }

    log(`Player ${playerId} joined room ${roomId} as spectator.`);
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState }));
    return;
  }

  if (isLobby && !knownPlayer && room.gameState.lobby.players.length >= MAX_PLAYERS) {
    sendError(ws, { code: 'SERVER_FULL', message: 'Game server is full.' });
    return;
  }

  socketSessions.set(ws, { roomId, playerId });
  room.clients.set(ws, playerId);
  room.connections.set(playerId, ws);

  if (isLobby) {
    const lobbyPlayer = room.gameState.lobby.players.find((p) => p.id === playerId);
    if (!lobbyPlayer) {
      room.gameState.lobby.players.push({
        id: playerId,
        name: sanitizeNickname(name, playerId),
        ready: false,
        characterClass: '',
      });
      // New socket has no local state — send full snapshot, broadcast patch to others
      ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState }));
      broadcastRoomState(room, ws);
      return;
    }

    const nextName = sanitizeNickname(name, '');
    if (nextName && lobbyPlayer.name !== nextName) {
      lobbyPlayer.name = nextName;
      ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState }));
      broadcastRoomState(room, ws);
      return;
    }
  }

  ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState }));
}

function handleDisconnect(ws: WebSocket) {
  const session = socketSessions.get(ws);
  if (!session) {
    log('Unidentified client disconnected.');
    return;
  }

  const { roomId, playerId } = session;
  const room = rooms.get(roomId);
  socketSessions.delete(ws);

  if (!room) return;

  room.clients.delete(ws);

  if (room.connections.get(playerId) === ws) {
    room.connections.delete(playerId);
    log(`Player ${playerId} disconnected from room ${roomId}.`);

    if (room.gameState.phase === GamePhase.Lobby) {
      // Host = first player in array (matches existing convention; see
      // KICK_PLAYER guard at line 543). Detect BEFORE filtering so we
      // can stamp the promotion signal for the surviving operatives.
      const wasHost = room.gameState.lobby.players[0]?.id === playerId;

      const newState = structuredClone(room.gameState) as GameState;
      newState.lobby.players = newState.lobby.players.filter((p: any) => p.id !== playerId);
      newState.history.push({
        playerId,
        survivorId: '',
        actionType: 'DISCONNECT',
        timestamp: Date.now(),
        payload: { phase: 'lobby' }
      });

      // Surface the host-promoted signal on lobby state. Next-in-array
      // is the new host (longest-tenured surviving player) — no separate
      // selection step. Client debounces on the timestamp value.
      if (wasHost && newState.lobby.players.length > 0) {
        newState.lobby.hostLeftAt = Date.now();
      }

      room.gameState = newState;
      broadcastRoomState(room);
    }
  }

  if (room.connections.size === 0) {
    scheduleRoomCleanup(room);
  }
}

const VALID_ACTION_TYPES = new Set<string>(Object.values(ActionType));

function handleAction(ws: WebSocket, request: ActionRequest) {
  const session = socketSessions.get(ws);

  if (!session) {
    sendError(ws, { code: 'UNAUTHORIZED', message: 'You must JOIN before sending actions.' });
    return;
  }

  if (typeof request.playerId !== 'string' || !request.playerId) {
    sendError(ws, { code: 'INVALID_PAYLOAD', message: 'ACTION payload requires a playerId string.' });
    return;
  }

  if (typeof request.type !== 'string' || !VALID_ACTION_TYPES.has(request.type)) {
    sendError(ws, { code: 'INVALID_ACTION_TYPE', message: `Unknown action type: ${request.type}` });
    return;
  }

  const room = rooms.get(session.roomId);
  if (!room) {
    sendError(ws, { code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' });
    return;
  }

  if (request.playerId !== session.playerId) {
    sendError(ws, {
      code: 'IDENTITY_MISMATCH',
      message: `You are connected as ${session.playerId} but tried to act as ${request.playerId}.`
    });
    return;
  }

  // Block spectators from sending game actions
  if (room.gameState.spectators.includes(session.playerId)) {
    sendError(ws, { code: 'SPECTATOR', message: 'Spectators cannot perform actions.' });
    return;
  }

  // Handle KICK_PLAYER at server level (requires socket management)
  if (request.type === ActionType.KICK_PLAYER) {
    if (room.gameState.phase !== GamePhase.Lobby) {
      sendError(ws, { code: 'INVALID_PHASE', message: 'Can only kick during lobby.' });
      return;
    }
    // Only host (first player) can kick
    if (room.gameState.lobby.players.length === 0 || room.gameState.lobby.players[0].id !== session.playerId) {
      sendError(ws, { code: 'NOT_HOST', message: 'Only the host can kick players.' });
      return;
    }
    const targetPlayerId = request.payload?.targetPlayerId as string;
    if (!targetPlayerId || targetPlayerId === session.playerId) {
      sendError(ws, { code: 'INVALID_TARGET', message: 'Invalid kick target.' });
      return;
    }
    // Clone state before mutating
    const newState = structuredClone(room.gameState) as GameState;
    newState.lobby.players = newState.lobby.players.filter((p: any) => p.id !== targetPlayerId);
    newState.history.push({
      playerId: session.playerId,
      survivorId: '',
      actionType: 'KICK_PLAYER',
      timestamp: Date.now(),
      payload: { targetPlayerId }
    });
    room.gameState = newState;
    // Disconnect their socket
    const targetWs = room.connections.get(targetPlayerId);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(JSON.stringify({
        type: 'ERROR',
        payload: { code: 'KICKED', message: 'You were kicked by the host.' }
      }));
      targetWs.close(1000, 'Kicked by host');
    }
    room.clients.delete(targetWs!);
    room.connections.delete(targetPlayerId);
    socketSessions.delete(targetWs!);
    log(`Player ${targetPlayerId} was kicked from room ${session.roomId} by ${session.playerId}.`);
    broadcastRoomState(room);
    return;
  }

  log(`Processing action: ${request.type} from ${session.playerId} in room ${session.roomId}`);

  const response: ActionResponse = processAction(room.gameState, request);

  if (response.success && response.newState) {
    room.gameState = response.newState;
    broadcastRoomState(room);
    return;
  }

  const error = response.error || { code: 'UNKNOWN_ERROR', message: 'Action failed unexpectedly.' };
  sendError(ws, error);
  // Resync client state after rejection to prevent drift
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: room.gameState }));
  }
}

// Cleanup stale DB-persisted rooms on startup and every 30 minutes
const STALE_ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const STALE_ROOM_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function runStaleRoomCleanup() {
  try {
    const removed = persistenceService.cleanupStaleRooms(STALE_ROOM_MAX_AGE_MS);
    if (removed > 0) {
      log(`Cleaned up ${removed} stale room(s) from database.`);
    }
  } catch (e) {
    console.error('Failed to cleanup stale rooms:', e);
  }
}

if (process.env.VITEST !== 'true') {
  runStaleRoomCleanup();
  setInterval(runStaleRoomCleanup, STALE_ROOM_CLEANUP_INTERVAL_MS);
}

// Guard the listen call so vitest can import this module without binding
// a port. The test runner exposes process.env.VITEST === 'true'.
if (process.env.VITEST !== 'true') {
  server.listen(PORT, () => {
    log(`Server started on port ${PORT}`);
  });
}

// Test-only surface. Keeps the public module API clean while letting unit
// tests reach into the internals that drive disconnect/cleanup logic.
export const __test__ = {
  handleDisconnect,
  createRoom,
  rooms,
  socketSessions,
  scheduleRoomCleanup,
};
