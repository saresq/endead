import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initialGameState, GameState, PlayerId, GamePhase } from '../types/GameState';
import { processAction } from '../services/ActionProcessor';
import { ActionRequest, ActionResponse } from '../types/Action';
import path from 'path';
import { fileURLToPath } from 'url';
import { HeartbeatManager } from './HeartbeatManager';
import fs from 'fs/promises';

const app = express();
app.use(express.json());
const server = createServer(app);
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ server });
const heartbeatManager = new HeartbeatManager(wss);
const MAX_PLAYERS = 6;
const ROOM_IDLE_CLEANUP_MS = 5 * 60 * 1000;

app.get('/api/maps', async (_req, res) => {
  try {
    const mapsDir = path.resolve(process.cwd(), 'data/maps');
    try {
      await fs.access(mapsDir);
    } catch {
      await fs.mkdir(mapsDir, { recursive: true });
    }

    const files = await fs.readdir(mapsDir);
    const maps = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const content = await fs.readFile(path.join(mapsDir, file), 'utf-8');
      try {
        maps.push(JSON.parse(content));
      } catch (e) {
        console.error(`Failed to parse map ${file}:`, e);
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

function generateRoomId(): string {
  let roomId = '';
  do {
    roomId = Math.random().toString(36).slice(2, 8);
  } while (rooms.has(roomId));
  return roomId;
}

function createRoom(roomId: string): RoomContext {
  const gameState = JSON.parse(JSON.stringify(initialGameState)) as GameState;
  gameState.id = roomId;
  gameState.seed = `seed-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  return {
    id: roomId,
    gameState,
    clients: new Map(),
    connections: new Map(),
    cleanupTimer: null,
  };
}

function ensureRoom(roomId: string): RoomContext | null {
  return rooms.get(roomId) || null;
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
    log(`Room ${room.id} deleted after 5 minutes idle.`);
  }, ROOM_IDLE_CLEANUP_MS);

  log(`Room ${room.id} scheduled for cleanup in 5 minutes.`);
}

function sendError(ws: WebSocket, error: { code: string; message: string }) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'ERROR', payload: error }));
}

function broadcastRoomState(room: RoomContext): void {
  const message = JSON.stringify({
    type: 'STATE_UPDATE',
    payload: room.gameState,
  });

  room.clients.forEach((_playerId, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
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
  switch (message.type) {
    case 'JOIN':
      handleJoin(ws, message.payload);
      break;
    case 'ACTION':
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
    sendError(ws, { code: 'GAME_IN_PROGRESS', message: 'Game currently in progress' });
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
        name: (name || playerId).trim().slice(0, 24) || playerId,
        ready: false,
        characterClass: 'Standard',
      });
      broadcastRoomState(room);
      return;
    }

    const nextName = (name || '').trim().slice(0, 24);
    if (nextName && lobbyPlayer.name !== nextName) {
      lobbyPlayer.name = nextName;
      broadcastRoomState(room);
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
      room.gameState.lobby.players = room.gameState.lobby.players.filter((p) => p.id !== playerId);
      broadcastRoomState(room);
    }
  }

  if (room.connections.size === 0) {
    scheduleRoomCleanup(room);
  }
}

function handleAction(ws: WebSocket, request: ActionRequest) {
  const session = socketSessions.get(ws);

  if (!session) {
    sendError(ws, { code: 'UNAUTHORIZED', message: 'You must JOIN before sending actions.' });
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

  log(`Processing action: ${request.type} from ${session.playerId} in room ${session.roomId}`);

  const response: ActionResponse = processAction(room.gameState, request);

  if (response.success && response.newState) {
    room.gameState = response.newState;
    broadcastRoomState(room);
    return;
  }

  const error = response.error || { code: 'UNKNOWN_ERROR', message: 'Action failed unexpectedly.' };
  sendError(ws, error);
}

server.listen(PORT, () => {
  log(`Server started on port ${PORT}`);
});
