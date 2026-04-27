import { describe, it, expect, beforeEach } from 'vitest';
import type { WebSocket } from 'ws';
import { __test__ } from '../server';
import { GamePhase } from '../../types/GameState';

const { handleDisconnect, createRoom, rooms, socketSessions, scheduleRoomCleanup } = __test__;

/**
 * handleDisconnect's host-left logic (server.ts:476–501) should only stamp
 * `lobby.hostLeftAt` when:
 *   - the disconnecting socket belongs to the host (lobby.players[0]), AND
 *   - the lobby is still in Lobby phase, AND
 *   - at least one survivor remains in the lobby after filtering.
 *
 * Anything else must leave hostLeftAt untouched. These tests exercise the
 * function directly via the `__test__` namespace — no real websocket round
 * trip — and use a minimal WebSocket stub since handleDisconnect only reads
 * the session map (keyed by socket identity) and clears the room maps.
 */

function makeStubSocket(): WebSocket {
  // handleDisconnect treats the WebSocket purely as a Map key. None of its
  // methods are invoked, so a typed stub object is sufficient.
  return {} as unknown as WebSocket;
}

function seedLobbyRoom(roomId: string, playerIds: string[]) {
  const room = createRoom(roomId);
  room.gameState.lobby.players = playerIds.map((id) => ({
    id,
    name: id,
    ready: false,
    characterClass: '',
  }));
  rooms.set(roomId, room);

  const sockets = new Map<string, WebSocket>();
  for (const playerId of playerIds) {
    const ws = makeStubSocket();
    sockets.set(playerId, ws);
    socketSessions.set(ws, { roomId, playerId });
    room.clients.set(ws, playerId);
    room.connections.set(playerId, ws);
  }
  return { room, sockets };
}

beforeEach(() => {
  // Fresh state per test — handleDisconnect mutates the module-level maps.
  for (const room of rooms.values()) {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  }
  rooms.clear();
  socketSessions.clear();
});

describe('handleDisconnect — host-left signaling', () => {
  it('stamps hostLeftAt when the host disconnects with survivors remaining', () => {
    const { room, sockets } = seedLobbyRoom('room-host-leaves', ['host-1', 'survivor-2', 'survivor-3']);
    expect(room.gameState.lobby.hostLeftAt).toBeUndefined();

    handleDisconnect(sockets.get('host-1')!);

    const after = rooms.get('room-host-leaves')!;
    expect(after.gameState.lobby.players.map((p) => p.id)).toEqual(['survivor-2', 'survivor-3']);
    expect(typeof after.gameState.lobby.hostLeftAt).toBe('number');
    expect(after.gameState.lobby.hostLeftAt).toBeGreaterThan(0);
  });

  it('leaves hostLeftAt unchanged when a non-host player disconnects', () => {
    const { room, sockets } = seedLobbyRoom('room-non-host-leaves', ['host-1', 'survivor-2', 'survivor-3']);
    expect(room.gameState.lobby.hostLeftAt).toBeUndefined();

    handleDisconnect(sockets.get('survivor-2')!);

    const after = rooms.get('room-non-host-leaves')!;
    expect(after.gameState.lobby.players.map((p) => p.id)).toEqual(['host-1', 'survivor-3']);
    expect(after.gameState.lobby.hostLeftAt).toBeUndefined();
  });

  it('leaves hostLeftAt untouched when the host is the only player and schedules room cleanup', () => {
    const { sockets } = seedLobbyRoom('room-solo-host', ['host-1']);

    handleDisconnect(sockets.get('host-1')!);

    const after = rooms.get('room-solo-host')!;
    // Lobby drains to empty, no surviving promotion target → no signal.
    expect(after.gameState.lobby.players).toEqual([]);
    expect(after.gameState.lobby.hostLeftAt).toBeUndefined();
    // Last connection gone → cleanup timer scheduled.
    expect(after.connections.size).toBe(0);
    expect(after.cleanupTimer).not.toBeNull();
  });

  it('leaves hostLeftAt untouched when the host disconnects mid-game (phase != Lobby)', () => {
    const { room, sockets } = seedLobbyRoom('room-mid-game', ['host-1', 'survivor-2']);
    // Promote out of Lobby — the disconnect path should now treat this as an
    // in-game drop, not a host-promotion signal.
    room.gameState.phase = GamePhase.Players;

    handleDisconnect(sockets.get('host-1')!);

    const after = rooms.get('room-mid-game')!;
    // In-game disconnect doesn't filter the lobby roster nor stamp hostLeftAt.
    expect(after.gameState.lobby.players.map((p) => p.id)).toEqual(['host-1', 'survivor-2']);
    expect(after.gameState.lobby.hostLeftAt).toBeUndefined();
  });
});

// Touch the unused export to keep the type-checker honest about the shape
// of the test surface (catches accidental removal of helpers downstream).
describe('__test__ surface', () => {
  it('exposes handleDisconnect, createRoom, rooms, socketSessions, scheduleRoomCleanup', () => {
    expect(typeof handleDisconnect).toBe('function');
    expect(typeof createRoom).toBe('function');
    expect(typeof scheduleRoomCleanup).toBe('function');
    expect(rooms).toBeInstanceOf(Map);
    expect(socketSessions).toBeInstanceOf(Map);
  });
});
