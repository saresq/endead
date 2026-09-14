import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { __test__ } from '../server';
import { GamePhase, GameResult } from '../../types/GameState';
import { processAction } from '../../services/ActionProcessor';
import { ActionType } from '../../types/Action';

const { handleDisconnect, handleJoin, createRoom, rooms, socketSessions, scheduleRoomCleanup, ABANDON_TIMEOUT_MS } = __test__;

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
  return { readyState: 1, send: () => {} } as unknown as WebSocket;
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
    for (const timer of room.abandonTimers.values()) clearTimeout(timer);
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

describe('handleDisconnect — abandoned game', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function seedGameRoom(roomId: string) {
    const seeded = seedLobbyRoom(roomId, ['host-1', 'survivor-2']);
    seeded.room.gameState.phase = GamePhase.Players;
    seeded.room.gameState.players = ['host-1', 'survivor-2'];
    return seeded;
  }

  it('ends the game when a player stays away past the timeout; next player becomes host', () => {
    const { sockets } = seedGameRoom('room-abandon');

    handleDisconnect(sockets.get('host-1')!);
    vi.advanceTimersByTime(ABANDON_TIMEOUT_MS - 1);
    expect(rooms.get('room-abandon')!.gameState.phase).toBe(GamePhase.Players);

    vi.advanceTimersByTime(1);
    const state = rooms.get('room-abandon')!.gameState;
    expect(state.phase).toBe(GamePhase.GameOver);
    expect(state.gameResult).toBe(GameResult.Defeat);
    expect(state.abandonedBy).toBe('host-1');
    expect(state.lobby.players.map((p) => p.id)).toEqual(['survivor-2']);

    const reset = processAction(state, { playerId: 'survivor-2', type: ActionType.END_GAME });
    expect(reset.success).toBe(true);
    expect(reset.newState!.phase).toBe(GamePhase.Lobby);
  });

  it('keeps the game when the player reconnects in time', () => {
    const { sockets } = seedGameRoom('room-return');

    handleDisconnect(sockets.get('survivor-2')!);
    vi.advanceTimersByTime(ABANDON_TIMEOUT_MS / 2);
    handleJoin(makeStubSocket(), { roomId: 'room-return', playerId: 'survivor-2' });
    vi.advanceTimersByTime(ABANDON_TIMEOUT_MS);

    const state = rooms.get('room-return')!.gameState;
    expect(state.phase).toBe(GamePhase.Players);
    expect(state.abandonedBy).toBeUndefined();
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
