import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { GamePhase, EquipmentCard, EquipmentType } from '../../types/GameState';
import { makeCard, makeState, makeSurvivor, makeZone } from './winConditionHelpers';

function twoPlayerState() {
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
  return state;
}

describe('END_TURN — unconditional turn end', () => {
  it('advances to the next player when actions remain', () => {
    const state = twoPlayerState();
    state.survivors['s1'].actionsRemaining = 3;

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    expect(res.newState!.activePlayerIndex).toBe(1);
    expect(res.newState!.survivors['s1'].actionsRemaining).toBe(0);
  });

  it('ends the turn for a H4x0r-mode survivor with 999 actions', () => {
    const state = twoPlayerState();
    state.survivors['s1'].cheatMode = true;
    state.survivors['s1'].actionsPerTurn = 999;
    state.survivors['s1'].actionsRemaining = 999;

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    expect(res.newState!.activePlayerIndex).toBe(1);
    expect(res.newState!.survivors['s1'].actionsRemaining).toBe(0);
  });

  it('discards a pending drawnCard on the active player and advances', () => {
    const state = twoPlayerState();
    const card = makeCard({ equipmentId: 'pistol' });
    state.survivors['s1'].drawnCard = card;
    state.survivors['s1'].actionsRemaining = 1;

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    expect(res.newState!.activePlayerIndex).toBe(1);
    expect(res.newState!.survivors['s1'].drawnCard).toBeUndefined();
    expect(res.newState!.equipmentDiscard.map(c => c.id)).toContain(card.id);
  });

  it('cancels an active trade and advances', () => {
    const state = twoPlayerState();
    state.activeTrade = {
      activeSurvivorId: 's1',
      targetSurvivorId: 's2',
      offers: { s1: [], s2: [] },
      receiveLayouts: { s1: {}, s2: {} },
      status: { s1: false, s2: false },
    };

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    expect(res.newState!.activeTrade).toBeUndefined();
    expect(res.newState!.activePlayerIndex).toBe(1);
  });

  it('zeroes all of the active player\'s survivors, not just the one in intent', () => {
    const s1a = makeSurvivor({ id: 's1a', playerId: 'p1' });
    const s1b = makeSurvivor({ id: 's1b', playerId: 'p1' });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2' });
    const state = makeState({ survivors: { s1a, s1b, s2 } });
    state.players = ['p1', 'p2'];
    state.activePlayerIndex = 0;
    state.firstPlayerTokenIndex = 0;
    state.survivors['s1a'].actionsRemaining = 3;
    state.survivors['s1b'].actionsRemaining = 3;
    state.survivors['s1b'].freeMovesRemaining = 2;

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1a',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors['s1a'].actionsRemaining).toBe(0);
    expect(res.newState!.survivors['s1b'].actionsRemaining).toBe(0);
    expect(res.newState!.survivors['s1b'].freeMovesRemaining).toBe(0);
    expect(res.newState!.activePlayerIndex).toBe(1);
  });

  it('is not blocked by a stale drawnCard on a non-active player\'s survivor', () => {
    const state = twoPlayerState();
    state.survivors['s2'].drawnCard = makeCard({ equipmentId: 'crowbar' });

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    expect(res.newState!.activePlayerIndex).toBe(1);
    // Non-active player's drawnCard must be left alone for them to resolve later.
    expect(res.newState!.survivors['s2'].drawnCard).toBeDefined();
  });

  it('rejects END_TURN from a non-active player', () => {
    const state = twoPlayerState();

    const res = processAction(state, {
      playerId: 'p2',
      survivorId: 's2',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('NOT_YOUR_TURN');
  });

  it('clears all free counters and the hitAndRunFreeMove flag', () => {
    const state = twoPlayerState();
    const s = state.survivors['s1'];
    s.actionsRemaining = 3;
    s.freeMovesRemaining = 2;
    s.freeSearchesRemaining = 1;
    s.freeCombatsRemaining = 1;
    s.freeMeleeRemaining = 1;
    s.freeRangedRemaining = 1;
    s.hitAndRunFreeMove = true;

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    const after = res.newState!.survivors['s1'];
    expect(after.freeMovesRemaining).toBe(0);
    expect(after.freeSearchesRemaining).toBe(0);
    expect(after.freeCombatsRemaining).toBe(0);
    expect(after.freeMeleeRemaining).toBe(0);
    expect(after.freeRangedRemaining).toBe(0);
    expect(after.hitAndRunFreeMove).toBe(false);
  });

  it('triggers Zombie phase when the last player ends their turn', () => {
    const state = twoPlayerState();
    state.activePlayerIndex = 1;
    state.firstPlayerTokenIndex = 0;
    state.survivors['s2'].actionsRemaining = 3;
    // Empty spawn deck so the zombie phase doesn't crash on draws.
    state.spawnDeck = [];
    state.spawnZoneIds = [];

    const res = processAction(state, {
      playerId: 'p2',
      survivorId: 's2',
      type: ActionType.END_TURN,
    });

    expect(res.success).toBe(true);
    // Last player ends turn → wraps to firstPlayerTokenIndex → Zombie phase
    // runs → endRound rotates firstPlayerTokenIndex from 0 → 1 → Players phase.
    expect(res.newState!.phase).toBe(GamePhase.Players);
    expect(res.newState!.firstPlayerTokenIndex).toBe(1);
    expect(res.newState!.activePlayerIndex).toBe(1);
    expect(res.newState!.turn).toBe(2);
  });
});
