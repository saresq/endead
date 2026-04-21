import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initialGameState, GameState, PlayerId, GamePhase } from '../types/GameState';
import { processAction } from '../services/ActionProcessor';
import { ActionRequest, ActionResponse, ActionType } from '../types/Action';
import { seedFromString } from '../services/Rng';
import { EventCollector, type CollectedEvent } from '../services/EventCollector';
import type { GameEvent } from '../types/Events';
import { projectForSocket, type SocketContext } from './projectForSocket';
import {
  projectEventsForPlayer,
  publicProjection,
} from './broadcastEvents';
import path from 'path';
import { fileURLToPath } from 'url';
import { HeartbeatManager } from './HeartbeatManager';
import { persistenceService } from '../services/PersistenceService';
import { PersistenceScheduler } from '../services/PersistenceScheduler';
import { TILE_DEFINITIONS, registerTileDefinitions } from '../config/TileDefinitions';
import { EPIC_DECK_SIZE } from '../config/EquipmentRegistry';
import { MarkerType } from '../types/Map';
import { repairExternalEdges } from '../services/TileDefinitionService';
import { TileDefinition } from '../types/TileDefinition';

const ACTION_LOG_MAX = 500;
const EVENT_LOG_MAX = 500;

function appendActionLog(room: RoomContext, intent: ActionRequest): void {
  room.actionLog.push(intent);
  if (room.actionLog.length > ACTION_LOG_MAX) {
    room.actionLog.splice(0, room.actionLog.length - ACTION_LOG_MAX);
  }
}

/** The event log stores only the PUBLIC projection of each event — never
 *  the raw private variant. Reconnecting clients receive the log tail via
 *  SNAPSHOT and must not learn another player's past card draws or trade
 *  contents from it. Private events collapse to their hidden variants
 *  (see `publicVariantOf` in `broadcastEvents.ts`). */
function appendEventLog(room: RoomContext, tagged: CollectedEvent[]): void {
  if (tagged.length === 0) return;
  const publicEvents = publicProjection(tagged);
  if (publicEvents.length === 0) return;
  room.eventLog.push({ v: room.gameState.version, events: publicEvents });
  if (room.eventLog.length > EVENT_LOG_MAX) {
    room.eventLog.splice(0, room.eventLog.length - EVENT_LOG_MAX);
  }
}

/** Send the post-action EVENTS frame per socket, routing private events to
 *  owners and redacted variants to everyone else (§3.7). Socket frames are
 *  memoized by visibility signature so each unique projection is only
 *  `JSON.stringify`-ed once per broadcast.
 *
 *  When `actingCtx` is provided (Step 6), the frame sent to the acting socket
 *  carries an additional `actionId` field so the client can confirm its
 *  pending optimistic entry. The other sockets receive the same events
 *  without the tag — `actionId` is purely a client/server round-trip marker
 *  and leaking it wouldn't break privacy, but keeping it off non-acting
 *  sockets preserves the "shared frame" fast path for the common case. */
function broadcastEvents(
  room: RoomContext,
  tagged: CollectedEvent[],
  actingCtx?: { ws: WebSocket; actionId: string },
): void {
  const v = room.gameState.version;

  // Empty batch but an acting context with actionId: still send a zero-events
  // EVENTS frame to the acting socket so its pending optimistic entry can
  // confirm (e.g., END_TURN emits no events under the current handler).
  if (tagged.length === 0) {
    if (actingCtx && actingCtx.ws.readyState === WebSocket.OPEN) {
      actingCtx.ws.send(
        JSON.stringify({ type: 'EVENTS', v, actionId: actingCtx.actionId, events: [] }),
      );
    }
    return;
  }

  // Build a visibility signature per tagged event: which recipients see the
  // raw vs redacted variant. Sockets with identical signatures share a frame.
  const anyPrivate = tagged.some((t) => t.recipients !== 'public');
  if (!anyPrivate) {
    // Fast path — single public frame for the whole room. Acting socket gets
    // a separate frame that includes `actionId`.
    const events = tagged.map((t) => t.event);
    const publicFrame = JSON.stringify({ type: 'EVENTS', v, events });
    const actingFrame = actingCtx
      ? JSON.stringify({ type: 'EVENTS', v, actionId: actingCtx.actionId, events })
      : null;
    room.clients.forEach((_playerId, ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (actingCtx && actingFrame && ws === actingCtx.ws) {
        ws.send(actingFrame);
      } else {
        ws.send(publicFrame);
      }
    });
    return;
  }

  // Slow path — per-player projection, memoized by playerId. Acting socket
  // gets its own cache slot so its frame alone carries `actionId`.
  const cache = new Map<string, string>();
  room.clients.forEach((playerId, ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const isActing = actingCtx?.ws === ws;
    const cacheKey = isActing ? `${playerId}|ACT:${actingCtx!.actionId}` : playerId;
    let frame = cache.get(cacheKey);
    if (!frame) {
      const events = projectEventsForPlayer(tagged, playerId, room.gameState);
      const payload: Record<string, unknown> = { type: 'EVENTS', v, events };
      if (isActing) payload.actionId = actingCtx!.actionId;
      frame = JSON.stringify(payload);
      cache.set(cacheKey, frame);
    }
    ws.send(frame);
  });
}

/** Send a per-socket SNAPSHOT: projected state + any eventLog entries newer
 *  than `lastSeenVersion`. Used for JOIN, reconnect, spectator join, and
 *  client-requested resync. */
function sendSnapshot(
  room: RoomContext,
  ws: WebSocket,
  playerId: PlayerId,
  lastSeenVersion?: number,
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const socket: SocketContext = { playerId };
  const state = projectForSocket(room.gameState, socket);
  const tail =
    typeof lastSeenVersion === 'number'
      ? room.eventLog.filter((e) => e.v > lastSeenVersion)
      : [];
  ws.send(
    JSON.stringify({
      type: 'SNAPSHOT',
      v: room.gameState.version,
      state,
      tail,
    }),
  );
}

// ENDEAD_PERF=1 probe (SwarmComms §5 Verification #1-2). Tracks per-action
// server time and wire-payload size. Disabled by default; set the env var
// to opt in. Emits one-line stderr logs so the dev can tail them:
//   ENDEAD_PERF=1 npm run dev
const PERF_ENABLED = process.env.ENDEAD_PERF === '1';

function logPerf(
  actionType: string,
  eventCount: number,
  start: number,
  beforeSend: number,
  room: RoomContext,
): void {
  const handlerMs = +(beforeSend - start).toFixed(2);
  const totalMs = +(performance.now() - start).toFixed(2);
  // Estimate wire size using the public projection (what every socket sees
  // in the common case) — private frames are a superset but bounded.
  const tail = room.eventLog[room.eventLog.length - 1];
  const publicSize = tail
    ? Buffer.byteLength(
        JSON.stringify({ type: 'EVENTS', v: tail.v, events: tail.events }),
      )
    : 0;
  const tag = publicSize > 1024 ? 'OVER' : 'ok';
  // eslint-disable-next-line no-console
  console.error(
    `[perf] action=${actionType} events=${eventCount} bytes=${publicSize} handler=${handlerMs}ms total=${totalMs}ms ${tag}`,
  );
}

const app = express();
app.use(express.json({ limit: '50mb' }));
const server = createServer(app);
const PORT = process.env.PORT || 8080;
// permessage-deflate (§3.7 / §6) — compresses SNAPSHOT payloads ~5× on the
// wire. EVENTS frames are typically under the deflate threshold so they're
// unaffected.
const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 6 },
    threshold: 1024,
  },
});
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

    // Epic Crate objectives consume draws from the Epic deck. Placing more
    // than the deck holds would force an EPIC_DECK_EXHAUSTED event in play,
    // so reject the save outright rather than ship a broken scenario.
    const markers = Array.isArray(mapData.markers) ? mapData.markers : [];
    const epicCount = markers.filter(
      (m: { type?: string }) => m && m.type === MarkerType.EpicCrate,
    ).length;
    if (epicCount > EPIC_DECK_SIZE) {
      res.status(400).json({
        error: `Too many Epic Crates (${epicCount}); max ${EPIC_DECK_SIZE} (Epic deck size)`,
      });
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

// Seed hardcoded defaults into DB if table is empty
if (persistenceService.tileDefinitionCount() === 0) {
  for (const [id, def] of Object.entries(TILE_DEFINITIONS)) {
    persistenceService.saveTileDefinition(id, def);
  }
  console.log(`Seeded ${Object.keys(TILE_DEFINITIONS).length} tile definitions into DB`);
}

// Load user-edited tile definitions from DB into the in-memory registry
// so that compileScenario uses the correct data (not just hardcoded defaults)
{
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
  /** SwarmComms §3.5: bounded ring of accepted intents — `ReplayService` source. */
  actionLog: ActionRequest[];
  /** SwarmComms §3.5/§3.8: bounded ring of `{ v, publicEvents[] }` batches. Private
   *  events collapse to their hidden variants before landing here, so
   *  SNAPSHOT-tail replay never leaks another player's card draws. */
  eventLog: Array<{ v: number; events: GameEvent[] }>;
  clients: Map<WebSocket, PlayerId>;
  connections: Map<PlayerId, WebSocket>;
  cleanupTimer: NodeJS.Timeout | null;
  dirty: boolean;
}

interface SocketSession {
  roomId: string;
  playerId: PlayerId;
}

const rooms = new Map<string, RoomContext>();
const socketSessions = new Map<WebSocket, SocketSession>();

const persistenceScheduler = new PersistenceScheduler(
  (id) => rooms.get(id) ?? null,
  () => rooms.values(),
);

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
  // D21 entry #1: createRoom's structuredClone is the only intentionally-kept
  // module-singleton bootstrap clone. Without it, every room would share the
  // nested object references on `initialGameState`.
  const gameState = structuredClone(initialGameState) as GameState;
  gameState.id = roomId;
  gameState.seed = seedFromString(`${roomId}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);

  return {
    id: roomId,
    gameState,
    actionLog: [],
    eventLog: [],
    clients: new Map(),
    connections: new Map(),
    cleanupTimer: null,
    dirty: false,
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
      actionLog: [],
      eventLog: [],
      clients: new Map(),
      connections: new Map(),
      cleanupTimer: null,
      dirty: false,
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
    persistenceScheduler.onRoomRemoved(room.id);
    persistenceService.deleteRoom(room.id);
    log(`Room ${room.id} deleted after 5 minutes idle.`);
  }, ROOM_IDLE_CLEANUP_MS);

  log(`Room ${room.id} scheduled for cleanup in 5 minutes.`);
}

function sendError(
  ws: WebSocket,
  error: { code: string; message: string },
  roomVersion = 0,
  actionId?: string,
) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: 'ERROR',
      v: roomVersion,
      actionId,
      reason: error.message,
      // Kept for existing client branches that key off `code`.
      code: error.code,
      message: error.message,
    }),
  );
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
  payload: ActionRequest & { actionId?: string };
}

interface SnapshotRequestMessage {
  type: 'SNAPSHOT_REQUEST';
  payload?: { lastSeenVersion?: number };
}

type ClientMessage = JoinMessage | ActionMessage | SnapshotRequestMessage;

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
    case 'SNAPSHOT_REQUEST':
      handleSnapshotRequest(ws, message.payload);
      break;
    default:
      sendError(ws, { code: 'UNKNOWN_TYPE', message: `Unknown message type: ${(message as any).type}` });
  }
}

function handleSnapshotRequest(ws: WebSocket, payload?: { lastSeenVersion?: number }): void {
  const session = socketSessions.get(ws);
  if (!session) {
    sendError(ws, { code: 'UNAUTHORIZED', message: 'You must JOIN before requesting a snapshot.' });
    return;
  }
  const room = rooms.get(session.roomId);
  if (!room) {
    sendError(ws, { code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' });
    return;
  }
  sendSnapshot(room, ws, session.playerId, payload?.lastSeenVersion);
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
      sendError(
        existingSocket,
        { code: 'SESSION_REPLACED', message: 'You have connected from another location.' },
        room.gameState.version,
      );
      existingSocket.close(1000, 'New session connected');
    }
  }

  const knownPlayer = room.gameState.lobby.players.some((p) => p.id === playerId) || room.gameState.players.includes(playerId);
  const isLobby = room.gameState.phase === GamePhase.Lobby;

  if (!isLobby && !knownPlayer) {
    // Allow joining as spectator mid-game (mutation-in-place; no clone).
    socketSessions.set(ws, { roomId, playerId });
    room.clients.set(ws, playerId);
    room.connections.set(playerId, ws);

    if (!room.gameState.spectators.includes(playerId)) {
      room.gameState.spectators.push(playerId);
      persistenceScheduler.markDirty(room.id);
    }

    log(`Player ${playerId} joined room ${roomId} as spectator.`);
    sendSnapshot(room, ws, playerId);
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
      const collector = new EventCollector();
      room.gameState.lobby.players.push({
        id: playerId,
        name: sanitizeNickname(name, playerId),
        ready: false,
        characterClass: '',
        starterEquipmentKey: '',
      });
      room.gameState.version = (room.gameState.version ?? 0) + 1;
      collector.emit({
        type: 'LOBBY_PLAYER_JOINED',
        playerId,
        name: sanitizeNickname(name, playerId),
      });
      const drained = collector.drainTagged();
      appendEventLog(room, drained);
      // Full snapshot to the joining socket; incremental event to the rest.
      sendSnapshot(room, ws, playerId);
      broadcastEventsExcept(room, drained, ws);
      return;
    }

    const nextName = sanitizeNickname(name, '');
    if (nextName && lobbyPlayer.name !== nextName) {
      const collector = new EventCollector();
      lobbyPlayer.name = nextName;
      room.gameState.version = (room.gameState.version ?? 0) + 1;
      collector.emit({
        type: 'LOBBY_NICKNAME_UPDATED',
        playerId,
        name: nextName,
      });
      const drained = collector.drainTagged();
      appendEventLog(room, drained);
      sendSnapshot(room, ws, playerId);
      broadcastEventsExcept(room, drained, ws);
      return;
    }
  }

  // Reconnect (known player): full SNAPSHOT so the client can re-sync from
  // their last known version by requesting SNAPSHOT_REQUEST separately if
  // they need a tail.
  sendSnapshot(room, ws, playerId);
}

/** Variant of `broadcastEvents` that skips a specific socket (used when the
 *  originator already received a full SNAPSHOT). */
function broadcastEventsExcept(
  room: RoomContext,
  tagged: CollectedEvent[],
  excludeSocket: WebSocket,
): void {
  if (tagged.length === 0) return;
  const v = room.gameState.version;
  const anyPrivate = tagged.some((t) => t.recipients !== 'public');
  if (!anyPrivate) {
    const events = tagged.map((t) => t.event);
    const message = JSON.stringify({ type: 'EVENTS', v, events });
    room.clients.forEach((_playerId, ws) => {
      if (ws === excludeSocket) return;
      if (ws.readyState === WebSocket.OPEN) ws.send(message);
    });
    return;
  }
  const cache = new Map<string, string>();
  room.clients.forEach((playerId, ws) => {
    if (ws === excludeSocket) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    let frame = cache.get(playerId);
    if (!frame) {
      const events = projectEventsForPlayer(tagged, playerId, room.gameState);
      frame = JSON.stringify({ type: 'EVENTS', v, events });
      cache.set(playerId, frame);
    }
    ws.send(frame);
  });
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

    // §3.10 rule 5: out-of-band paths mutate in place + emit events.
    if (room.gameState.phase === GamePhase.Lobby) {
      const collector = new EventCollector();
      room.gameState.lobby.players = room.gameState.lobby.players.filter(p => p.id !== playerId);
      room.gameState.version = (room.gameState.version ?? 0) + 1;
      collector.emit({ type: 'LOBBY_PLAYER_LEFT', playerId });
      const drained = collector.drainTagged();
      appendEventLog(room, drained);
      broadcastEvents(room, drained);
    }
    // Gameplay phase: no-op + spectator toggle (no event), per task §E.
  }

  if (room.connections.size === 0) {
    persistenceScheduler.triggerLastDisconnect(room.id);
    scheduleRoomCleanup(room);
  }
}

const VALID_ACTION_TYPES = new Set<string>(Object.values(ActionType));

function handleAction(ws: WebSocket, request: ActionRequest & { actionId?: string }) {
  const session = socketSessions.get(ws);

  if (!session) {
    sendError(ws, { code: 'UNAUTHORIZED', message: 'You must JOIN before sending actions.' }, 0, request.actionId);
    return;
  }

  if (typeof request.playerId !== 'string' || !request.playerId) {
    sendError(ws, { code: 'INVALID_PAYLOAD', message: 'ACTION payload requires a playerId string.' }, 0, request.actionId);
    return;
  }

  if (typeof request.type !== 'string' || !VALID_ACTION_TYPES.has(request.type)) {
    sendError(ws, { code: 'INVALID_ACTION_TYPE', message: `Unknown action type: ${request.type}` }, 0, request.actionId);
    return;
  }

  const room = rooms.get(session.roomId);
  if (!room) {
    sendError(ws, { code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' }, 0, request.actionId);
    return;
  }

  if (request.playerId !== session.playerId) {
    sendError(
      ws,
      {
        code: 'IDENTITY_MISMATCH',
        message: `You are connected as ${session.playerId} but tried to act as ${request.playerId}.`,
      },
      room.gameState.version,
      request.actionId,
    );
    return;
  }

  // Block spectators from sending game actions
  if (room.gameState.spectators.includes(session.playerId)) {
    sendError(ws, { code: 'SPECTATOR', message: 'Spectators cannot perform actions.' }, room.gameState.version, request.actionId);
    return;
  }

  // Handle KICK_PLAYER at server level (requires socket management)
  if (request.type === ActionType.KICK_PLAYER) {
    if (room.gameState.phase !== GamePhase.Lobby) {
      sendError(ws, { code: 'INVALID_PHASE', message: 'Can only kick during lobby.' }, room.gameState.version, request.actionId);
      return;
    }
    // Only host (first player) can kick
    if (room.gameState.lobby.players.length === 0 || room.gameState.lobby.players[0].id !== session.playerId) {
      sendError(ws, { code: 'NOT_HOST', message: 'Only the host can kick players.' }, room.gameState.version, request.actionId);
      return;
    }
    const targetPlayerId = request.payload?.targetPlayerId as string;
    if (!targetPlayerId || targetPlayerId === session.playerId) {
      sendError(ws, { code: 'INVALID_TARGET', message: 'Invalid kick target.' }, room.gameState.version, request.actionId);
      return;
    }
    // §3.10 rule 5: mutate in place + emit LOBBY_PLAYER_KICKED.
    const kickCollector = new EventCollector();
    room.gameState.lobby.players = room.gameState.lobby.players.filter(p => p.id !== targetPlayerId);
    room.gameState.version = (room.gameState.version ?? 0) + 1;
    kickCollector.emit({ type: 'LOBBY_PLAYER_KICKED', playerId: targetPlayerId });
    const kickEvents = kickCollector.drainTagged();
    appendEventLog(room, kickEvents);
    // Disconnect their socket
    const targetWs = room.connections.get(targetPlayerId);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      sendError(targetWs, { code: 'KICKED', message: 'You were kicked by the host.' }, room.gameState.version);
      targetWs.close(1000, 'Kicked by host');
    }
    if (targetWs) {
      room.clients.delete(targetWs);
      socketSessions.delete(targetWs);
    }
    room.connections.delete(targetPlayerId);
    broadcastEvents(room, kickEvents);
    log(`Player ${targetPlayerId} was kicked from room ${session.roomId} by ${session.playerId}.`);
    return;
  }

  log(`Processing action: ${request.type} from ${session.playerId} in room ${session.roomId}`);

  const prevTurn = room.gameState.turn;
  const prevPhase = room.gameState.phase;
  // Append to action log BEFORE dispatch so a corrupt handler still logs the
  // intent that caused the crash (§3.5 ReplayService source of truth).
  appendActionLog(room, request);
  const perfStart = PERF_ENABLED ? performance.now() : 0;
  const response: ActionResponse = processAction(room.gameState, request);

  if (response.success && response.newState) {
    // Mutation-in-place: response.newState === room.gameState (§3.4). Retain
    // the assignment for clarity.
    room.gameState = response.newState;
    const tagged = response.taggedEvents ?? [];
    appendEventLog(room, tagged);
    const perfBeforeSend = PERF_ENABLED ? performance.now() : 0;
    // Step 6 — if the client tagged the ACTION with an `actionId`, echo it
    // back on the EVENTS frame to the acting socket so its pending optimistic
    // entry can confirm.
    const actingCtx = typeof request.actionId === 'string'
      ? { ws, actionId: request.actionId }
      : undefined;
    // Wholesale phase transitions in/out of Lobby bootstrap or tear down huge
    // swaths of state (tiles, zones, zoneGeometry, survivors) that can't be
    // replayed through the minimal GAME_STARTED / GAME_RESET events. Push a
    // fresh SNAPSHOT to every client so they pick up the new state instead
    // of the stale lobby view.
    const phaseCrossedLobby =
      (prevPhase === GamePhase.Lobby) !== (room.gameState.phase === GamePhase.Lobby);
    if (phaseCrossedLobby) {
      room.clients.forEach((playerId, clientWs) => {
        sendSnapshot(room, clientWs, playerId);
      });
      if (actingCtx && actingCtx.ws.readyState === WebSocket.OPEN) {
        // Acting socket still needs an actionId echo (zero-events EVENTS frame)
        // in case it sent an optimistic ACTION — the SNAPSHOT alone carries no
        // actionId. START_GAME / END_GAME aren't whitelisted today, but keep
        // the echo for forward-compat.
        actingCtx.ws.send(
          JSON.stringify({
            type: 'EVENTS',
            v: room.gameState.version,
            actionId: actingCtx.actionId,
            events: [],
          }),
        );
      }
    } else {
      broadcastEvents(room, tagged, actingCtx);
    }
    if (PERF_ENABLED) {
      logPerf(request.type, tagged.length, perfStart, perfBeforeSend, room);
    }
    // Quiescence triggers (post-broadcast; scheduler uses setImmediate so writes
    // happen after ws.send). Zombie-phase completion is detected by turn increment —
    // ZombiePhaseManager.endRound increments turn exactly once per zombie phase.
    if (response.newState.turn > prevTurn) {
      persistenceScheduler.triggerZombiePhaseComplete(room.id);
    }
    if (request.type === ActionType.END_TURN) {
      persistenceScheduler.triggerEndTurn(room.id);
    }
    persistenceScheduler.markDirty(room.id);
    return;
  }

  const error = response.error || { code: 'UNKNOWN_ERROR', message: 'Action failed unexpectedly.' };
  sendError(ws, error, room.gameState.version, request.actionId);
  // Resync client state after rejection to prevent drift
  if (ws.readyState === WebSocket.OPEN) {
    sendSnapshot(room, ws, session.playerId);
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

runStaleRoomCleanup();
setInterval(runStaleRoomCleanup, STALE_ROOM_CLEANUP_INTERVAL_MS);

let shuttingDown = false;
function gracefulShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}; flushing dirty rooms to DB.`);
  try {
    const written = persistenceScheduler.flushAllSync();
    log(`Flushed ${written} room(s) to DB on shutdown.`);
  } catch (e) {
    console.error('Error during shutdown flush:', e);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  log(`Server started on port ${PORT}`);
});
