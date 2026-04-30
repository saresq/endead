import { describe, it, expect } from 'vitest';
import { handleTakeEpicCrate } from '../handlers/EpicCrateHandlers';
import { ActionRequest, ActionType } from '../../types/Action';
import { Objective, ObjectiveType, EquipmentType } from '../../types/GameState';
import { checkGameEndConditions } from '../ActionProcessor';
import {
  makeState,
  makeZone,
  makeSurvivor,
  makeCard,
  takeEpicObj,
} from './winConditionHelpers';

function takeReq(): ActionRequest {
  return { playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_EPIC_CRATE };
}

describe('handleTakeEpicCrate — Epic Weapon Crate (red)', () => {
  it('increments TakeEpicCrate counter and stages the drawn weapon in survivor.drawnCard', () => {
    const card = makeCard({ equipmentId: 'golden_ak47', name: 'Golden AK47', type: EquipmentType.Weapon });
    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: survivor },
      objectives: [takeEpicObj(2)],
      epicDeck: [card],
    });

    const next = handleTakeEpicCrate(state, takeReq());

    const obj = next.objectives.find(o => o.id === 'obj-epic') as Extract<Objective, { type: ObjectiveType.TakeEpicCrate }>;
    expect(obj.amountCurrent).toBe(1);
    expect(obj.completed).toBe(false);

    expect(next.survivors.s1.drawnCard?.equipmentId).toBe('golden_ak47');
    expect(next.zones.z1.hasEpicCrate).toBe(false);

    expect(next.lastAction?.epicWeaponDrawn).toBe('golden_ak47');
    expect(next.epicDeck.length).toBe(0);
  });

  it('does NOT award 5 XP — Epic Crates grant the weapon, not standard objective AP', () => {
    const card = makeCard({ equipmentId: 'nailbat', type: EquipmentType.Weapon });
    const survivor = makeSurvivor({ zoneId: 'z1', experience: 7 });
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: survivor },
      objectives: [takeEpicObj(1)],
      epicDeck: [card],
    });

    const next = handleTakeEpicCrate(state, takeReq());
    expect(next.survivors.s1.experience).toBe(7);
  });

  it('N takes satisfy the win condition and produce victory', () => {
    const cards = [
      makeCard({ equipmentId: 'golden_ak47', type: EquipmentType.Weapon }),
      makeCard({ equipmentId: 'nailbat', type: EquipmentType.Weapon }),
    ];
    const survivor = makeSurvivor({ zoneId: 'z1' });
    let state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: survivor },
      objectives: [takeEpicObj(2)],
      epicDeck: cards,
    });

    state = handleTakeEpicCrate(state, takeReq());
    // Clear drawnCard to simulate the player slotting it (so a second take is allowed).
    state.survivors.s1.inventory = [state.survivors.s1.drawnCard!];
    state.survivors.s1.drawnCard = undefined;
    // Re-arm the zone for a second take.
    state.zones.z1.hasEpicCrate = true;
    state = handleTakeEpicCrate(state, takeReq());

    const obj = state.objectives.find(o => o.id === 'obj-epic') as Extract<Objective, { type: ObjectiveType.TakeEpicCrate }>;
    expect(obj.amountCurrent).toBe(2);
    expect(obj.completed).toBe(true);

    // checkGameEndConditions reports Victory once met.
    expect(checkGameEndConditions(state)).toBe('VICTORY');
  });

  it('refuses to draw when survivor.drawnCard is already populated', () => {
    const card = makeCard({ equipmentId: 'golden_ak47', type: EquipmentType.Weapon });
    const pending = makeCard({ equipmentId: 'pistol', type: EquipmentType.Weapon });
    const survivor = makeSurvivor({ zoneId: 'z1', drawnCard: pending });
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: survivor },
      objectives: [takeEpicObj(1)],
      epicDeck: [card],
    });

    expect(() => handleTakeEpicCrate(state, takeReq())).toThrow(/pending card/i);
  });

  it('reshuffles epicDiscard back into epicDeck when the deck runs dry', () => {
    const discardCard = makeCard({ equipmentId: 'mas_shotgun', type: EquipmentType.Weapon });
    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      zones: { z1: makeZone({ id: 'z1', hasEpicCrate: true }) },
      survivors: { s1: survivor },
      objectives: [takeEpicObj(1)],
      epicDeck: [],
      epicDiscard: [discardCard],
    });

    const next = handleTakeEpicCrate(state, takeReq());
    expect(next.survivors.s1.drawnCard?.equipmentId).toBe('mas_shotgun');
    expect(next.epicDiscard.length).toBe(0);
  });
});
