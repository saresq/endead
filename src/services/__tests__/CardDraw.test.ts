// One resolution for a drawn card (src/services/CardDraw.ts), exercised
// through its three callers: search, Epic crate, and Hold your nose.
//
// Locks the two ways cards used to go missing or turn into equipment they
// aren't: a multi-card search dropped every card after the first overflow
// (`break`), and only the search knew what an Aaahh!! is — the Epic crate and
// Hold your nose filed `aaahh_epic` as a normal card and put it in a hand.
// Every case also asserts card conservation: no path may create or lose one.

import { describe, it, expect } from 'vitest';
import { GameState, EquipmentCard, EquipmentType, DangerLevel } from '../../types/GameState';
import { ActionType, ActionRequest } from '../../types/Action';
import { handleSearch } from '../handlers/ItemHandlers';
import { handleTakeEpicCrate } from '../handlers/EpicCrateHandlers';
import { handleAttack } from '../handlers/CombatHandlers';
import { makeState, makeZone, makeSurvivor, makeCard } from './winConditionHelpers';

/** Every card in play, wherever it lives. Must never change across a draw. */
function countCards(state: GameState): number {
  const held = Object.values(state.survivors).reduce(
    (n, s) => n + s.inventory.length + (s.drawnCard ? 1 : 0),
    0,
  );
  return held
    + state.equipmentDeck.length + state.equipmentDiscard.length
    + state.epicDeck.length + state.epicDiscard.length;
}

function equipment(id: string, equipmentId = 'pistol'): EquipmentCard {
  return makeCard({ id, equipmentId, type: EquipmentType.Weapon });
}

function aaahh(id: string, equipmentId: 'aaahh' | 'aaahh_epic' = 'aaahh'): EquipmentCard {
  return makeCard({ id, equipmentId, keywords: ['aaahh'] });
}

const searchIntent = { type: ActionType.SEARCH, playerId: 'p1', survivorId: 's1' } as ActionRequest;

function searchState(deck: EquipmentCard[], inventory: EquipmentCard[] = []): GameState {
  const state = makeState({
    zones: { z1: makeZone({ id: 'z1', searchable: true }) },
    survivors: { s1: makeSurvivor({ zoneId: 'z1', inventory }) },
    seedString: 'card-draw',
  });
  state.equipmentDeck = deck;
  // Draw two cards per search, without spending an inventory slot on a Flashlight.
  state.survivors.s1.skills = ['search_plus_1'];
  return state;
}

describe('search: a drawn card is always accounted for', () => {
  it('a two-card search with one free slot keeps one and offers the other', () => {
    const state = searchState(
      [equipment('card-pistol-1'), equipment('card-pistol-2')],
      [
        makeCard({ id: 'card-held-1', equipmentId: 'bag_of_rice', slot: 'HAND_1', inHand: true }),
        makeCard({ id: 'card-held-2', equipmentId: 'bag_of_rice', slot: 'BACKPACK_0' }),
        makeCard({ id: 'card-held-3', equipmentId: 'bag_of_rice', slot: 'BACKPACK_1' }),
        makeCard({ id: 'card-held-4', equipmentId: 'bag_of_rice', slot: 'BACKPACK_2' }),
      ],
    );
    const before = countCards(state);

    const next = handleSearch(state, searchIntent);
    const survivor = next.survivors.s1;

    expect(survivor.inventory).toHaveLength(5);
    expect(survivor.drawnCard).toBeDefined();
    expect(countCards(next)).toBe(before);
  });

  it('a two-card search at a full inventory offers one and discards the other', () => {
    const full = (['HAND_1', 'HAND_2', 'BACKPACK_0', 'BACKPACK_1', 'BACKPACK_2'] as const).map((slot, i) =>
      makeCard({ id: `card-held-${i}`, equipmentId: 'bag_of_rice', slot, inHand: slot.startsWith('HAND') }),
    );
    const state = searchState([equipment('card-pistol-1'), equipment('card-pistol-2')], full);
    const before = countCards(state);

    const next = handleSearch(state, searchIntent);

    expect(next.survivors.s1.inventory).toHaveLength(5);
    expect(next.survivors.s1.drawnCard!.id).toBe('card-pistol-1');
    expect(next.equipmentDiscard.map(c => c.id)).toEqual(['card-pistol-2']);
    expect(countCards(next)).toBe(before);
  });

  it('an Aaahh!! spawns a Walker, stops the search and leaves the second card in the deck', () => {
    const state = searchState([aaahh('card-aaahh-1'), equipment('card-pistol-2')]);
    const before = countCards(state);

    const next = handleSearch(state, searchIntent);

    expect(Object.values(next.zombies)).toHaveLength(1);
    expect(next.equipmentDeck.map(c => c.id)).toEqual(['card-pistol-2']);
    expect(next.equipmentDiscard.map(c => c.id)).toEqual(['card-aaahh-1']);
    expect(next.survivors.s1.inventory).toHaveLength(0);
    expect(next.survivors.s1.drawnCard).toBeUndefined();
    expect(countCards(next)).toBe(before);
  });
});

describe('Epic crate: Aaahh!! resolves as an Aaahh!!', () => {
  it('spawns a Walker and puts nothing named aaahh into the inventory', () => {
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: makeSurvivor({ zoneId: 'z1' }) },
      epicDeck: [aaahh('epic-aaahh_epic-0', 'aaahh_epic')],
    });
    const before = countCards(state);

    const next = handleTakeEpicCrate(state, {
      type: ActionType.TAKE_EPIC_CRATE, playerId: 'p1', survivorId: 's1',
    } as ActionRequest);

    expect(Object.values(next.zombies)).toHaveLength(1);
    expect(next.survivors.s1.inventory).toHaveLength(0);
    expect(next.survivors.s1.drawnCard).toBeUndefined();
    expect(next.epicDiscard.map(c => c.id)).toEqual(['epic-aaahh_epic-0']);
    expect(countCards(next)).toBe(before);
  });

  it('still stages an ordinary Epic weapon for the player to slot', () => {
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: makeSurvivor({ zoneId: 'z1' }) },
      epicDeck: [equipment('epic-ma_deuce-0', 'ma_deuce')],
    });

    const next = handleTakeEpicCrate(state, {
      type: ActionType.TAKE_EPIC_CRATE, playerId: 'p1', survivorId: 's1',
    } as ActionRequest);

    expect(next.survivors.s1.drawnCard!.id).toBe('epic-ma_deuce-0');
    expect(next.survivors.s1.inventory).toHaveLength(0);
  });
});

describe('Hold your nose', () => {
  /** s1 clears a zone of its last Walker with an always-hitting weapon. */
  function killState(deck: EquipmentCard[], experience = 0): GameState {
    const weapon = makeCard({
      id: 'card-axe-0',
      equipmentId: 'fire_axe',
      type: EquipmentType.Weapon,
      slot: 'HAND_1',
      inHand: true,
      stats: { range: [0, 0], dice: 6, accuracy: 2, damage: 1, noise: false, dualWield: false },
    });
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1' }) },
      survivors: { s1: makeSurvivor({ zoneId: 'z1', inventory: [weapon], experience }) },
      zombies: { zed1: { id: 'zed1', type: 'WALKER', position: { x: 0, y: 0, zoneId: 'z1' }, wounds: 0 } as any },
      seedString: 'hold-your-nose',
    });
    state.survivors.s1.skills = ['hold_your_nose'];
    state.equipmentDeck = deck;
    return state;
  }

  const attackIntent = {
    type: ActionType.ATTACK, playerId: 'p1', survivorId: 's1',
    payload: { targetZoneId: 'z1', weaponId: 'card-axe-0' },
  } as ActionRequest;

  it('an Aaahh!! spawns a Walker and enters no inventory', () => {
    const state = killState([aaahh('card-aaahh-1')]);
    const before = countCards(state);

    const next = handleAttack(state, attackIntent);

    expect(next.zombies.zed1).toBeUndefined();
    expect(Object.values(next.zombies)).toHaveLength(1); // the Aaahh!! Walker
    expect(next.survivors.s1.inventory.map(c => c.id)).toEqual(['card-axe-0']);
    expect(next.survivors.s1.drawnCard).toBeUndefined();
    expect(next.equipmentDiscard.map(c => c.id)).toEqual(['card-aaahh-1']);
    expect(countCards(next)).toBe(before);
  });

  it('keeps the experience the kill just granted (the draw used to overwrite it)', () => {
    // 6 XP + 1 for the Walker = 7, which promotes to Yellow. The draw that
    // follows must not write back the pre-XP survivor object.
    const state = killState([equipment('card-pistol-1')], 6);
    const before = countCards(state);

    const next = handleAttack(state, attackIntent);

    expect(next.survivors.s1.experience).toBe(7);
    expect(next.survivors.s1.dangerLevel).toBe(DangerLevel.Yellow);
    expect(next.survivors.s1.inventory.map(c => c.id)).toContain('card-pistol-1');
    expect(countCards(next)).toBe(before);
  });
});
