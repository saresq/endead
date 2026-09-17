// A trade has to leave both inventories legal (rules/07-inventory.md: two hands, five
// cards, one card per slot) and the partner has to be alive.
//
// `validateLoadout` existed but was called from nowhere, and a traded card with
// no slot in the payload silently defaulted to BACKPACK_0 — which is how an
// inventory with two cards in one slot got built. Both are rejections now, and
// the message names the rule, because a rejection that doesn't reads as a bug.

import { describe, it, expect } from 'vitest';
import { GameState, EquipmentCard } from '../../types/GameState';
import { ActionType, ActionRequest } from '../../types/Action';
import { executeTrade, handleTradeStart } from '../handlers/TradeHandlers';
import { makeState, makeZone, makeSurvivor, makeCard } from './winConditionHelpers';
import { es } from '../../strings/es';

function held(id: string, slot: EquipmentCard['slot']): EquipmentCard {
  return makeCard({ id, equipmentId: 'pistol', slot, inHand: slot === 'HAND_1' || slot === 'HAND_2' });
}

/** s1 (p1) offers `offer`, s2 (p2) receives it into `layout`. */
function tradeState(opts: {
  s1Inventory: EquipmentCard[];
  s2Inventory?: EquipmentCard[];
  offer: string[];
  layout?: Record<string, string>;
}): GameState {
  const state = makeState({
    zones: { z1: makeZone({ id: 'z1' }) },
    survivors: {
      s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', inventory: opts.s1Inventory }),
      s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1', inventory: opts.s2Inventory ?? [] }),
    },
  });
  state.activeTrade = {
    activeSurvivorId: 's1',
    targetSurvivorId: 's2',
    offers: { s1: opts.offer, s2: [] },
    receiveLayouts: { s1: {}, s2: opts.layout ?? {} },
    status: { s1: true, s2: true },
  };
  return state;
}

describe('a trade leaves both inventories legal', () => {
  it('accepts an unequal trade: one side gives two cards, the other none', () => {
    const state = tradeState({
      s1Inventory: [held('card-a-1', 'HAND_1'), held('card-b-2', 'BACKPACK_0')],
      offer: ['card-a-1', 'card-b-2'],
      layout: { 'card-a-1': 'HAND_1', 'card-b-2': 'BACKPACK_0' },
    });

    const next = executeTrade(state);

    expect(next.survivors.s1.inventory).toHaveLength(0);
    expect(next.survivors.s2.inventory.map(c => c.id).sort()).toEqual(['card-a-1', 'card-b-2']);
    expect(next.activeTrade).toBeUndefined();
  });

  it('rejects a trade that would put two cards in one slot', () => {
    const state = tradeState({
      s1Inventory: [held('card-a-1', 'HAND_1')],
      s2Inventory: [held('card-x-1', 'BACKPACK_0'), held('card-y-2', 'BACKPACK_1'), held('card-z-3', 'HAND_1')],
      offer: ['card-a-1'],
      layout: { 'card-a-1': 'BACKPACK_0' }, // already taken
    });

    expect(() => executeTrade(state)).toThrow(es.errors.loadoutSlotTaken);
    expect(state.survivors.s1.inventory).toHaveLength(1);
    expect(state.survivors.s2.inventory).toHaveLength(3);
  });

  it('rejects a trade that would leave a survivor with more than five cards', () => {
    const state = tradeState({
      s1Inventory: [held('card-a-1', 'HAND_1')],
      s2Inventory: [
        held('card-v-1', 'HAND_1'), held('card-w-2', 'HAND_2'),
        held('card-x-3', 'BACKPACK_0'), held('card-y-4', 'BACKPACK_1'), held('card-z-5', 'BACKPACK_2'),
      ],
      offer: ['card-a-1'],
      layout: { 'card-a-1': 'BACKPACK_0' },
    });

    expect(() => executeTrade(state)).toThrow(es.errors.loadoutTooManyCards);
  });

  it('rejects a payload that does not say where a card goes', () => {
    const state = tradeState({
      s1Inventory: [held('card-a-1', 'HAND_1')],
      offer: ['card-a-1'],
      layout: {}, // used to silently default to BACKPACK_0
    });

    expect(() => executeTrade(state)).toThrow(es.errors.tradeNoSlot);
  });
});

describe('a trade partner has to be alive', () => {
  it('refuses to open a trade with a dead survivor', () => {
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1' }) },
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1', wounds: 3, maxHealth: 3 }),
      },
    });

    expect(() => handleTradeStart(state, {
      type: ActionType.TRADE_START, playerId: 'p1', survivorId: 's1',
      payload: { targetSurvivorId: 's2' },
    } as ActionRequest)).toThrow(es.errors.tradePartnerDead);
  });

  it('refuses to complete a trade whose partner died while it was open', () => {
    const state = tradeState({
      s1Inventory: [held('card-a-1', 'HAND_1')],
      offer: ['card-a-1'],
      layout: { 'card-a-1': 'HAND_1' },
    });
    state.survivors.s2.wounds = state.survivors.s2.maxHealth;

    expect(() => executeTrade(state)).toThrow(es.errors.tradePartnerDead);
  });
});
