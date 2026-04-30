// Food consumption rules per Zombicide 2nd Ed (RULEBOOK.md:604-621):
// Bag of Rice / Canned Food / Water — "Consume for 1 AP". Free action; cards
// can be discarded any time (SKILL.md:227). Match by equipmentId so renames
// or display tweaks don't break game logic. Reaching 7 AP promotes Yellow
// (XPManager) which auto-grants +1 Action.
//
// Regression-locks the snapshot semantics of COLLECT_ITEMS: consumed food
// stops counting (live inventory only — see WinConditions.collectItems.test).

import { describe, it, expect } from 'vitest';
import { GameResult, EquipmentType, DangerLevel } from '../../types/GameState';
import { ActionType, ActionRequest } from '../../types/Action';
import { handleUseItem } from '../handlers/ItemHandlers';
import { processAction, checkGameEndConditions } from '../ActionProcessor';
import {
  makeState,
  makeZone,
  makeSurvivor,
  makeCard,
  collectItemsObj,
} from './winConditionHelpers';

function useItemIntent(survivorId: string, itemId: string): ActionRequest {
  return {
    type: ActionType.USE_ITEM,
    playerId: 'p1',
    survivorId,
    payload: { itemId },
  } as ActionRequest;
}

describe('Food consumption (Bag of Rice / Canned Food / Water)', () => {
  for (const equipmentId of ['bag_of_rice', 'canned_food', 'water'] as const) {
    it(`${equipmentId}: grants 1 AP, removes from inventory, pushes to discard`, () => {
      const card = makeCard({ equipmentId, type: EquipmentType.Item });
      const survivor = makeSurvivor({ inventory: [card], experience: 0 });
      const state = makeState({ survivors: { s1: survivor } });

      const next = handleUseItem(state, useItemIntent('s1', card.id));

      expect(next.survivors.s1.experience).toBe(1);
      expect(next.survivors.s1.inventory).toHaveLength(0);
      expect(next.equipmentDiscard.map(c => c.id)).toContain(card.id);
    });
  }

  it('reaching 7 AP via consumption auto-promotes to Yellow and grants +1 Action', () => {
    const rice = makeCard({ equipmentId: 'bag_of_rice', type: EquipmentType.Item });
    // Survivor sitting at 6 AP, Blue, 3 actions/turn — eating Rice → 7 AP → Yellow.
    const survivor = makeSurvivor({
      inventory: [rice],
      experience: 6,
      dangerLevel: DangerLevel.Blue,
    });
    const state = makeState({ survivors: { s1: survivor } });

    const next = handleUseItem(state, useItemIntent('s1', rice.id));

    expect(next.survivors.s1.experience).toBe(7);
    expect(next.survivors.s1.dangerLevel).toBe(DangerLevel.Yellow);
    expect(next.survivors.s1.actionsPerTurn).toBe(4);
    expect(next.survivors.s1.skills).toContain('plus_1_action');
  });

  it('matches by equipmentId — name-only "Water" without correct id is rejected', () => {
    // A weapon-by-mistake card whose name happens to be 'Water' must NOT be
    // treated as food. equipmentId is the source of truth.
    const decoy = makeCard({
      equipmentId: 'pistol',
      name: 'Water', // misleading display name
      type: EquipmentType.Weapon,
    });
    const survivor = makeSurvivor({ inventory: [decoy] });
    const state = makeState({ survivors: { s1: survivor } });

    expect(() => handleUseItem(state, useItemIntent('s1', decoy.id))).toThrow();
  });

  it('throws for unknown / non-consumable items', () => {
    const flashlight = makeCard({ equipmentId: 'flashlight', type: EquipmentType.Item });
    const survivor = makeSurvivor({ inventory: [flashlight] });
    const state = makeState({ survivors: { s1: survivor } });

    expect(() => handleUseItem(state, useItemIntent('s1', flashlight.id)))
      .toThrow(/cannot be used/i);
  });

  it('does not require survivor to be wounded (rules: no item heals wounds)', () => {
    const water = makeCard({ equipmentId: 'water', type: EquipmentType.Item });
    const survivor = makeSurvivor({ inventory: [water], wounds: 0 });
    const state = makeState({ survivors: { s1: survivor } });

    expect(() => handleUseItem(state, useItemIntent('s1', water.id))).not.toThrow();
  });

  it('is a free action — actionsRemaining is unchanged after processAction', () => {
    const rice = makeCard({ equipmentId: 'bag_of_rice', type: EquipmentType.Item });
    const survivor = makeSurvivor({ inventory: [rice], actionsRemaining: 3 });
    const state = makeState({ survivors: { s1: survivor } });

    const result = processAction(state, useItemIntent('s1', rice.id));
    expect(result.success).toBe(true);
    expect(result.newState!.survivors.s1.actionsRemaining).toBe(3);
  });
});

describe('Food consumption × COLLECT_ITEMS interaction', () => {
  it('consuming the last required item leaves COLLECT_ITEMS unsatisfied (snapshot semantics)', () => {
    const water = makeCard({ equipmentId: 'water', type: EquipmentType.Item });
    const survivor = makeSurvivor({
      zoneId: 'exit',
      inventory: [water],
    });
    const state = makeState({
      zones: { exit: makeZone({ id: 'exit', isExit: true }) },
      survivors: { s1: survivor },
      objectives: [collectItemsObj([{ equipmentId: 'water', quantity: 1 }])],
    });

    // Pre-condition: water in inventory satisfies the objective.
    expect(checkGameEndConditions(state)).toBe(GameResult.Victory);

    // Eat the water — objective is no longer satisfied.
    const next = handleUseItem(state, useItemIntent('s1', water.id));
    expect(next.survivors.s1.inventory).toHaveLength(0);
    expect(checkGameEndConditions(next)).toBeUndefined();
  });
});
