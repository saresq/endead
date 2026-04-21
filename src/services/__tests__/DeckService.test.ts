import { describe, it, expect } from 'vitest';
import { DeckService } from '../DeckService';
import { EventCollector } from '../EventCollector';
import {
  GameState, EquipmentCard, EquipmentType,
} from '../../types/GameState';
import { seedFromString } from '../Rng';
import { EPIC_EQUIPMENT_CARDS } from '../../config/EquipmentRegistry';

function baseState(): GameState {
  return {
    id: 'deck-test',
    seed: seedFromString('deck-test'),
    version: 0,
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

describe('DeckService.drawCard — mutation-in-place + B5 reshuffle resets reloadables', () => {
  it('spent reloadable in discard re-enters the deck reloaded=true and emits DECK_SHUFFLED', () => {
    const state = baseState();
    state.equipmentDiscard = [makeReloadable('sawed-1', false)];
    const collector = new EventCollector();

    const card = DeckService.drawCard(state, collector);

    expect(card).not.toBeNull();
    expect(card!.id).toBe('sawed-1');
    expect(card!.reloaded).toBe(true);
    expect(state.equipmentDiscard).toEqual([]);

    // Reshuffle path: DECK_SHUFFLED emitted with count-only payload (§3.2 /
    // §A — never the order, only the new deck size at reshuffle time).
    const events = collector.drain();
    expect(events).toContainEqual({
      type: 'DECK_SHUFFLED',
      deckSize: 1,        // new deck size right after the reshuffle (before the pop)
      discardSize: 0,
    });
  });

  it('still-loaded reloadable in discard comes back reloaded=true', () => {
    const state = baseState();
    state.equipmentDiscard = [makeReloadable('sawed-2', true)];
    const card = DeckService.drawCard(state);
    expect(card!.reloaded).toBe(true);
  });

  it('non-reloadable cards are untouched by the reshuffle reset', () => {
    const state = baseState();
    state.equipmentDiscard = [makeConsumable('food-1')];
    const card = DeckService.drawCard(state);
    expect(card).not.toBeNull();
    expect(card!.id).toBe('food-1');
    expect(card!.reloaded).toBeUndefined();
  });

  it('multiple reloadables in discard all come back reloaded=true', () => {
    const state = baseState();
    state.equipmentDiscard = [
      makeReloadable('sawed-a', false),
      makeReloadable('sawed-b', false),
      makeConsumable('food-1'),
    ];

    const firstDraw = DeckService.drawCard(state);
    expect(firstDraw).not.toBeNull();
    if (firstDraw!.keywords?.includes('reload')) {
      expect(firstDraw!.reloaded).toBe(true);
    }
    for (const c of state.equipmentDeck) {
      if (c.keywords?.includes('reload')) {
        expect(c.reloaded).toBe(true);
      }
    }
  });

  it('no reshuffle when deck has cards — discard is not drained', () => {
    const state = baseState();
    state.equipmentDeck = [makeReloadable('sawed-deck', true)];
    state.equipmentDiscard = [makeReloadable('sawed-discard', false)];
    const collector = new EventCollector();

    const card = DeckService.drawCard(state, collector);

    expect(card!.id).toBe('sawed-deck');
    expect(state.equipmentDiscard).toHaveLength(1);
    expect(state.equipmentDiscard[0].id).toBe('sawed-discard');
    expect(state.equipmentDiscard[0].reloaded).toBe(false);

    // No reshuffle = no DECK_SHUFFLED event.
    expect(collector.drain()).toEqual([]);
  });

  it('returns null and does not mutate when both deck and discard are empty', () => {
    const state = baseState();
    const seedBefore = JSON.parse(JSON.stringify(state.seed));
    const card = DeckService.drawCard(state);
    expect(card).toBeNull();
    expect(state.seed).toEqual(seedBefore);
    expect(state.equipmentDeck).toEqual([]);
    expect(state.equipmentDiscard).toEqual([]);
  });
});

describe('B10 — EquipmentCard.stats is optional (epic_aaahh)', () => {
  it('epic_aaahh registry entry has no stats property at all', () => {
    const def = EPIC_EQUIPMENT_CARDS['epic_aaahh'];
    expect(def).toBeDefined();
    expect('stats' in def).toBe(false);
    expect(def.type).toBe(EquipmentType.Item);
    expect(def.keywords).toContain('aaahh');
  });

  it('initializeEpicDeck produces stat-less epic_aaahh cards without crashing', () => {
    const { deck } = DeckService.initializeEpicDeck(seedFromString('b10'));
    const aaahhCards = deck.filter(c => c.name === 'Aaahh!!');
    expect(aaahhCards.length).toBeGreaterThan(0);
    for (const c of aaahhCards) {
      expect(c.stats).toBeUndefined();
      expect(c.keywords).toContain('aaahh');
    }
  });

  it('stat-less aaahh card survives drawCard including reshuffle', () => {
    const state = baseState();
    const aaahh: EquipmentCard = {
      id: 'epic-epic_aaahh-0',
      name: 'Aaahh!!',
      type: EquipmentType.Item,
      keywords: ['aaahh'],
      inHand: false,
      slot: 'DISCARD',
    };
    state.equipmentDiscard = [aaahh];

    const card = DeckService.drawCard(state);

    expect(card).not.toBeNull();
    expect(card!.id).toBe('epic-epic_aaahh-0');
    expect(card!.stats).toBeUndefined();
    expect(state.equipmentDiscard).toEqual([]);
  });
});
