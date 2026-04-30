import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { GamePhase } from '../../types/GameState';
import { makeState, makeSurvivor, makeZone } from './winConditionHelpers';

describe('Cheat-mode END_TURN integration', () => {
  it('2-player cheat ends turn → P2 active', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1' });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2' });
    const state = makeState({ survivors: { s1, s2 } });
    state.players = ['p1', 'p2'];
    state.activePlayerIndex = 0;
    state.firstPlayerTokenIndex = 0;
    state.lobby.players = [
      { id: 'p1', name: 'P1', ready: true, characterClass: 'Wanda' } as any,
      { id: 'p2', name: 'P2', ready: true, characterClass: 'Doug' } as any,
    ];

    // Activate cheat through real handler
    const cheated = processAction(state, { playerId: 'p1', type: ActionType.ACTIVATE_CHEAT });
    expect(cheated.success).toBe(true);
    expect(cheated.newState!.survivors.s1.cheatMode).toBe(true);
    expect(cheated.newState!.survivors.s1.actionsRemaining).toBe(999);

    // P1 (cheat) ends turn
    const ended = processAction(cheated.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.END_TURN,
    });
    expect(ended.success).toBe(true);
    expect(ended.newState!.activePlayerIndex).toBe(1);
    expect(ended.newState!.survivors.s1.actionsRemaining).toBe(0);
  });

  it('1-player cheat ends turn → turn increments, same player active', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1' });
    const state = makeState({
      survivors: { s1: survivor },
      zones: { z1: makeZone({ id: 'z1', spawnPoint: false }) },
    });
    state.players = ['p1'];
    state.activePlayerIndex = 0;
    state.firstPlayerTokenIndex = 0;
    state.spawnDeck = [];
    state.spawnZoneIds = [];
    state.lobby.players = [{ id: 'p1', name: 'P1', ready: true, characterClass: 'Wanda' } as any];

    const cheated = processAction(state, { playerId: 'p1', type: ActionType.ACTIVATE_CHEAT });
    expect(cheated.success).toBe(true);

    const ended = processAction(cheated.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.END_TURN,
    });
    expect(ended.success).toBe(true);
    expect(ended.newState!.turn).toBe(2);
    expect(ended.newState!.phase).toBe(GamePhase.Players);
    // Same player active in 1-player game
    expect(ended.newState!.activePlayerIndex).toBe(0);
    // Actions refilled by endRound
    expect(ended.newState!.survivors.s1.actionsRemaining).toBe(999);
  });

  it('cheat ends turn after taking actions in same turn (non-end-of-round)', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1' });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2' });
    s1.cheatMode = true;
    s1.actionsPerTurn = 999;
    s1.actionsRemaining = 999;
    const state = makeState({ survivors: { s1, s2 } });
    state.players = ['p1', 'p2'];
    state.activePlayerIndex = 0;
    state.firstPlayerTokenIndex = 0;

    // Take a noise action first
    const after1 = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MAKE_NOISE,
    });
    expect(after1.success).toBe(true);
    // Cheat replenishes
    expect(after1.newState!.survivors.s1.actionsRemaining).toBe(999);

    // End turn
    const ended = processAction(after1.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.END_TURN,
    });
    expect(ended.success).toBe(true);
    expect(ended.newState!.activePlayerIndex).toBe(1);
  });

  it('cheat ends turn at end-of-round (last player) → cycles back via zombie phase', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1' });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2' });
    s1.cheatMode = true;
    s1.actionsPerTurn = 999;
    s1.actionsRemaining = 999;
    const state = makeState({ survivors: { s1, s2 } });
    state.players = ['p1', 'p2'];
    state.activePlayerIndex = 0;  // P1 active
    state.firstPlayerTokenIndex = 1;  // P2 holds first player token (so P1 is LAST)
    state.spawnDeck = [];
    state.spawnZoneIds = [];

    const ended = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.END_TURN,
    });
    expect(ended.success).toBe(true);
    // End of round: zombie phase ran, firstPlayerToken rotated 1→0, P1 active again
    expect(ended.newState!.firstPlayerTokenIndex).toBe(0);
    expect(ended.newState!.activePlayerIndex).toBe(0);
    expect(ended.newState!.turn).toBe(2);
  });
});
