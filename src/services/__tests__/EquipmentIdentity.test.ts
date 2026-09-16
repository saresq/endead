// Game logic must key off `equipmentId`, never the English display name that
// EquipmentRegistry happens to still store. These cards carry translated —
// and deliberately mismatched — `name` values, so any surviving name
// comparison breaks here instead of silently in production the day the
// registry is translated.

import { describe, it, expect } from 'vitest';
import { EquipmentType, ZombieType, GameState } from '../../types/GameState';
import { ActionType, ActionRequest } from '../../types/Action';
import { handleAttack } from '../handlers/CombatHandlers';
import { handleSearch } from '../handlers/ItemHandlers';
import { makeState, makeZone, makeSurvivor, makeCard } from './winConditionHelpers';

function pistol(slot: 'HAND_1' | 'HAND_2', name: string) {
  return makeCard({
    equipmentId: 'pistol',
    name,
    type: EquipmentType.Weapon,
    inHand: true,
    slot,
    stats: { range: [0, 1], dice: 1, accuracy: 4, damage: 1, noise: true, dualWield: true, ammo: 'bullets' },
  });
}

function attackIntent(weaponId: string): ActionRequest {
  return {
    type: ActionType.ATTACK,
    playerId: 'p1',
    survivorId: 's1',
    payload: { targetZoneId: 'z1', weaponId },
  } as ActionRequest;
}

function stateWithHands(inventory: ReturnType<typeof makeCard>[]): GameState {
  const state = makeState({
    zones: { z1: makeZone({ id: 'z1', searchable: true }) },
    survivors: { s1: makeSurvivor({ zoneId: 'z1', inventory }) },
    zombies: {
      zed1: { id: 'zed1', type: ZombieType.Walker, position: { x: 0, y: 0, zoneId: 'z1' }, wounds: 0 },
      zed2: { id: 'zed2', type: ZombieType.Walker, position: { x: 0, y: 0, zoneId: 'z1' }, wounds: 0 },
    },
    seedString: 'equipment-identity',
  });
  return state;
}

describe('equipment logic keys off equipmentId, not display name', () => {
  it('dual-wields two copies of the same weapon whose display names differ', () => {
    const pairedState = stateWithHands([pistol('HAND_1', 'Pistola'), pistol('HAND_2', 'Pistol')]);
    const singleState = stateWithHands([pistol('HAND_1', 'Pistola')]);

    const paired = handleAttack(pairedState, attackIntent(pairedState.survivors.s1.inventory[0].id));
    const single = handleAttack(singleState, attackIntent(singleState.survivors.s1.inventory[0].id));

    // Dual wield resolves two separate attacks, so twice the dice are rolled.
    expect(paired.lastAction!.dice!.length).toBe(single.lastAction!.dice!.length * 2);
  });

  it('rerolls misses from a translated Plenty of Bullets', () => {
    const state = stateWithHands([
      pistol('HAND_1', 'Pistola'),
      makeCard({ equipmentId: 'plenty_of_bullets', name: 'Munición de sobra' }),
    ]);
    // Six dice on a fixed seed guarantee at least one miss to reroll.
    state.survivors.s1.inventory[0].stats!.dice = 6;
    const after = handleAttack(state, attackIntent(state.survivors.s1.inventory[0].id));
    expect(after.lastAction!.rerolledFrom).toBeDefined();
  });

  it('draws two cards on a search with a translated Flashlight', () => {
    const withLight = stateWithHands([makeCard({ equipmentId: 'flashlight', name: 'Linterna' })]);
    withLight.zombies = {};
    const plain = stateWithHands([]);
    plain.zombies = {};

    const searchIntent = { type: ActionType.SEARCH, playerId: 'p1', survivorId: 's1' } as ActionRequest;
    const lit = handleSearch(withLight, searchIntent);
    const dark = handleSearch(plain, searchIntent);

    // Same seed, so the two decks are identical: the extra draw is the only
    // difference between them.
    expect(dark.equipmentDeck.length - lit.equipmentDeck.length).toBe(1);
  });
});
