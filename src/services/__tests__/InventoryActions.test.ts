// What inventory actions cost (rules/07-inventory.md#discarding — cards can be discarded at any
// time; rearranging your own inventory is 1 Action, however many cards move).
//
// Before this, every ORGANIZE charged 1 AP — so a swap cost 2 — and a discard
// cost an action and demanded it be your own turn. The cost now lives in
// ActionProcessor's AP_ACTIONS / FREE_ACTIONS sets: one action opens a
// reorganize session, everything inside it is free, and discarding is free
// always.

import { describe, it, expect } from 'vitest';
import { GameState, EquipmentCard } from '../../types/GameState';
import { ActionType, ActionRequest } from '../../types/Action';
import { processAction } from '../ActionProcessor';
import { makeState, makeZone, makeSurvivor, makeCard } from './winConditionHelpers';

function act(state: GameState, type: ActionType, payload?: Record<string, unknown>, playerId = 'p1', survivorId = 's1'): GameState {
  const result = processAction(state, { type, playerId, survivorId, payload } as ActionRequest);
  expect(result.error?.message ?? null).toBeNull();
  return result.newState!;
}

function held(id: string, slot: EquipmentCard['slot']): EquipmentCard {
  return makeCard({ id, equipmentId: 'pistol', slot, inHand: slot === 'HAND_1' || slot === 'HAND_2' });
}

describe('reorganizing costs one action for any number of moves', () => {
  function stateWithLoadout(): GameState {
    return makeState({
      zones: { z1: makeZone({ id: 'z1' }) },
      survivors: {
        s1: makeSurvivor({
          zoneId: 'z1',
          actionsRemaining: 3,
          inventory: [
            held('card-a-1', 'HAND_1'),
            held('card-b-2', 'HAND_2'),
            held('card-c-3', 'BACKPACK_0'),
          ],
        }),
      },
    });
  }

  it('charges the session once, then three moves and a swap are free', () => {
    let state = stateWithLoadout();

    state = act(state, ActionType.ORGANIZE_START);
    expect(state.survivors.s1.actionsRemaining).toBe(2);

    state = act(state, ActionType.ORGANIZE, { cardId: 'card-c-3', targetSlot: 'BACKPACK_1' });
    state = act(state, ActionType.ORGANIZE, { cardId: 'card-c-3', targetSlot: 'BACKPACK_2' });
    state = act(state, ActionType.ORGANIZE, { cardId: 'card-a-1', targetSlot: 'BACKPACK_0' });
    // A swap: HAND_2 is occupied, so the two cards exchange slots.
    state = act(state, ActionType.ORGANIZE, { cardId: 'card-a-1', targetSlot: 'HAND_2' });

    expect(state.survivors.s1.actionsRemaining).toBe(2);
    const slots = Object.fromEntries(state.survivors.s1.inventory.map(c => [c.id, c.slot]));
    expect(slots['card-a-1']).toBe('HAND_2');
    expect(slots['card-b-2']).toBe('BACKPACK_0');
    expect(slots['card-c-3']).toBe('BACKPACK_2');

    state = act(state, ActionType.ORGANIZE_END);
    expect(state.survivors.s1.actionsRemaining).toBe(2);
    expect(state.activeReorganize).toBeUndefined();
  });

  it('closing the session still works with no actions left', () => {
    let state = stateWithLoadout();
    state.survivors.s1.actionsRemaining = 1;

    state = act(state, ActionType.ORGANIZE_START);
    expect(state.survivors.s1.actionsRemaining).toBe(0);

    state = act(state, ActionType.ORGANIZE, { cardId: 'card-c-3', targetSlot: 'BACKPACK_1' });
    state = act(state, ActionType.ORGANIZE_END);
    expect(state.activeReorganize).toBeUndefined();
  });

  it('refuses a move with nothing to charge it to', () => {
    const state = stateWithLoadout();
    const result = processAction(state, {
      type: ActionType.ORGANIZE, playerId: 'p1', survivorId: 's1',
      payload: { cardId: 'card-c-3', targetSlot: 'BACKPACK_1' },
    } as ActionRequest);

    expect(result.success).toBe(false);
    expect(state.survivors.s1.actionsRemaining).toBe(3);
  });
});

describe('discarding is free', () => {
  it('succeeds at zero action points, on another player\'s turn', () => {
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1' }) },
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', actionsRemaining: 3 }),
        s2: makeSurvivor({
          id: 's2', playerId: 'p2', zoneId: 'z1', actionsRemaining: 0,
          inventory: [held('card-a-1', 'HAND_1')],
        }),
      },
    });
    // p1 is the active player; p2 discards anyway.
    expect(state.players[state.activePlayerIndex]).toBe('p1');

    const next = act(state, ActionType.DISCARD_CARD, { cardId: 'card-a-1' }, 'p2', 's2');

    expect(next.survivors.s2.inventory).toHaveLength(0);
    expect(next.equipmentDiscard.map(c => c.id)).toEqual(['card-a-1']);
    expect(next.survivors.s2.actionsRemaining).toBe(0);
    expect(next.survivors.s1.actionsRemaining).toBe(3);
    expect(next.players[next.activePlayerIndex]).toBe('p1');
  });

  it('refuses to discard a card the requesting player does not own', () => {
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1' }) },
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [held('card-a-1', 'HAND_1')] }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1' }),
      },
    });

    const result = processAction(state, {
      type: ActionType.DISCARD_CARD, playerId: 'p2', survivorId: 's1',
      payload: { cardId: 'card-a-1' },
    } as ActionRequest);

    expect(result.success).toBe(false);
  });
});
