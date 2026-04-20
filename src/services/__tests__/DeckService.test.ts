import { describe, it, expect } from 'vitest';
import { DeckService } from '../DeckService';
import {
  GameState, EquipmentCard, EquipmentType,
} from '../../types/GameState';
import { seedFromString } from '../Rng';

function baseState(): GameState {
  return {
    id: 'deck-test',
    seed: seedFromString('deck-test'),
    equipmentDeck: [],
    equipmentDiscard: [],
  } as unknown as GameState;
}

function makeReloadable(id: string, reloaded: boolean): EquipmentCard {
  return {
    id, name: 'Sawed-Off',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 2, accuracy: 2, damage: 2, noise: true, dualWield: true, ammo: 'shells' },
    inHand: false, slot: 'BACKPACK',
    keywords: ['reload'],
    reloaded,
  };
}

function makeConsumable(id: string, name = 'Canned Food'): EquipmentCard {
  return {
    id, name,
    type: EquipmentType.Item,
    inHand: false, slot: 'BACKPACK',
  };
}

describe('DeckService.drawCard — B5: reshuffle resets reloadable cards', () => {
  it('spent reloadable in discard re-enters the deck reloaded=true', () => {
    const state = baseState();
    state.equipmentDiscard = [makeReloadable('sawed-1', false)];

    const result = DeckService.drawCard(state);

    expect(result.card).not.toBeNull();
    expect(result.card!.id).toBe('sawed-1');
    expect(result.card!.reloaded).toBe(true);
    expect(result.newState.equipmentDiscard).toEqual([]);
  });

  it('still-loaded reloadable in discard comes back reloaded=true', () => {
    const state = baseState();
    state.equipmentDiscard = [makeReloadable('sawed-2', true)];
    const result = DeckService.drawCard(state);
    expect(result.card!.reloaded).toBe(true);
  });

  it('non-reloadable cards are untouched by the reshuffle reset', () => {
    const state = baseState();
    state.equipmentDiscard = [makeConsumable('food-1')];
    const result = DeckService.drawCard(state);
    expect(result.card).not.toBeNull();
    expect(result.card!.id).toBe('food-1');
    expect(result.card!.reloaded).toBeUndefined();
  });

  it('multiple reloadables in discard all come back reloaded=true', () => {
    const state = baseState();
    const spent1 = makeReloadable('sawed-a', false);
    const spent2 = makeReloadable('sawed-b', false);
    const food = makeConsumable('food-1');
    state.equipmentDiscard = [spent1, spent2, food];

    // Draw the first card — reshuffle happens, all reloadables in the new deck
    // (including the ones we don't draw yet) must be reset.
    const firstDraw = DeckService.drawCard(state);
    expect(firstDraw.card).not.toBeNull();
    if (firstDraw.card!.keywords?.includes('reload')) {
      expect(firstDraw.card!.reloaded).toBe(true);
    }
    for (const c of firstDraw.newState.equipmentDeck) {
      if (c.keywords?.includes('reload')) {
        expect(c.reloaded).toBe(true);
      }
    }
  });

  it('no reshuffle when deck has cards — discard is not drained', () => {
    const state = baseState();
    const inDeck = makeReloadable('sawed-deck', true);
    const inDiscard = makeReloadable('sawed-discard', false);
    state.equipmentDeck = [inDeck];
    state.equipmentDiscard = [inDiscard];

    const result = DeckService.drawCard(state);

    expect(result.card!.id).toBe('sawed-deck');
    // Discard untouched because the deck still had cards.
    expect(result.newState.equipmentDiscard).toHaveLength(1);
    expect(result.newState.equipmentDiscard[0].id).toBe('sawed-discard');
    // The spent card in discard must NOT be reset prematurely — B5 resets at reshuffle, not on every draw.
    expect(result.newState.equipmentDiscard[0].reloaded).toBe(false);
  });
});
