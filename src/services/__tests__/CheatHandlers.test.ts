import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { GamePhase } from '../../types/GameState';
import { makeState, makeSurvivor, makeZone } from './winConditionHelpers';

function withCheatableState() {
  const survivor = makeSurvivor({ id: 's1', playerId: 'p1', actionsRemaining: 0 });
  const state = makeState({ survivors: { [survivor.id]: survivor } });
  state.players = ['p1'];
  state.lobby.players = [{ id: 'p1', name: 'Original', ready: true, characterClass: 'Wanda' }];
  return state;
}

describe('ACTIVATE_CHEAT', () => {
  it('renames the player, flips cheatMode, and refills actions', () => {
    const state = withCheatableState();
    const res = processAction(state, { playerId: 'p1', type: ActionType.ACTIVATE_CHEAT });

    expect(res.success).toBe(true);
    const next = res.newState!;
    const s = next.survivors['s1'];
    expect(s.cheatMode).toBe(true);
    expect(s.name).toBe('H4x0r');
    expect(s.actionsRemaining).toBeGreaterThan(0);
    expect(next.lobby.players[0].name).toBe('H4x0r');
    expect(next.lastAction?.type).toBe('ACTIVATE_CHEAT');
  });

  it('lets the cheat survivor act with zero starting actions', () => {
    const state = withCheatableState();
    const cheated = processAction(state, { playerId: 'p1', type: ActionType.ACTIVATE_CHEAT });
    expect(cheated.success).toBe(true);

    // Without cheat: NO_ACTIONS would block.
    const moveRes = processAction(cheated.newState!, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.MAKE_NOISE,
    });
    expect(moveRes.success).toBe(true);
    const after = moveRes.newState!;
    expect(after.survivors['s1'].cheatMode).toBe(true);
    expect(after.survivors['s1'].actionsRemaining).toBeGreaterThan(0);
  });

  it('lets the cheat survivor search repeatedly in the same turn', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1' });
    survivor.hasSearched = true;
    survivor.cheatMode = true;
    const zone = makeZone({ id: 'z1', searchable: true, isBuilding: true });
    const state = makeState({ survivors: { [survivor.id]: survivor }, zones: { z1: zone } });
    state.players = ['p1'];
    state.lobby.players = [{ id: 'p1', name: 'H4x0r', ready: true, characterClass: 'Wanda' }];
    // Seed a fake equipment deck so SEARCH can draw without crashing.
    state.equipmentDeck = [
      { id: 'card-1', equipmentId: 'pistol', name: 'Pistol', type: 'WEAPON', inHand: false, slot: 'BACKPACK' } as any,
    ];

    const res = processAction(state, {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.SEARCH,
    });
    expect(res.success).toBe(true);
  });

  it('rejects activation in lobby phase', () => {
    const state = withCheatableState();
    state.phase = GamePhase.Lobby;
    const res = processAction(state, { playerId: 'p1', type: ActionType.ACTIVATE_CHEAT });
    expect(res.success).toBe(false);
  });
});
