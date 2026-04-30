import { describe, it, expect } from 'vitest';
import { handleTakeObjective } from '../handlers/ObjectiveHandlers';
import { ActionRequest, ActionType } from '../../types/Action';
import { ObjectiveColor, ObjectiveType, Objective } from '../../types/GameState';
import {
  makeState,
  makeZone,
  makeSurvivor,
  takeObjectiveObj,
  takeYellowObj,
} from './winConditionHelpers';

function takeReq(survivorId = 's1'): ActionRequest {
  return {
    playerId: 'p1',
    survivorId,
    type: ActionType.TAKE_OBJECTIVE,
  };
}

describe('handleTakeObjective — colored Objective tokens', () => {
  it('blue Objective increments only the blue counter and leaves green untouched', () => {
    const blueObj = takeObjectiveObj({ color: ObjectiveColor.Blue, amountRequired: 2 });
    const greenObj = takeObjectiveObj({
      id: 'obj-color-green',
      color: ObjectiveColor.Green,
      amountRequired: 1,
    });
    const yellowObj = takeYellowObj(1);

    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      zones: {
        z1: makeZone({ id: 'z1', hasObjective: true, objectiveColor: ObjectiveColor.Blue }),
      },
      survivors: { s1: survivor },
      objectives: [blueObj, greenObj, yellowObj],
    });

    const next = handleTakeObjective(state, takeReq());

    const next_blue = next.objectives.find(o => o.id === 'obj-color-blue') as Extract<Objective, { type: ObjectiveType.TakeColorObjective }>;
    const next_green = next.objectives.find(o => o.id === 'obj-color-green') as Extract<Objective, { type: ObjectiveType.TakeColorObjective }>;
    const next_yellow = next.objectives.find(o => o.id === 'obj-yellow') as Extract<Objective, { type: ObjectiveType.TakeObjective }>;

    expect(next_blue.amountCurrent).toBe(1);
    expect(next_green.amountCurrent).toBe(0);
    expect(next_yellow.amountCurrent).toBe(0);

    // Token removed from zone.
    expect(next.zones.z1.hasObjective).toBe(false);
    expect(next.zones.z1.objectiveColor).toBeUndefined();
  });

  it('blue Objective awards 5 XP per RULEBOOK §11', () => {
    const survivor = makeSurvivor({ zoneId: 'z1', experience: 0 });
    const state = makeState({
      zones: {
        z1: makeZone({ id: 'z1', hasObjective: true, objectiveColor: ObjectiveColor.Blue }),
      },
      survivors: { s1: survivor },
      objectives: [takeObjectiveObj({ color: ObjectiveColor.Blue })],
    });

    const next = handleTakeObjective(state, takeReq());
    expect(next.survivors.s1.experience).toBe(5);
  });

  it('blue Objective activates blue dormant spawns and stamps the activation turn', () => {
    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      turn: 4,
      zones: {
        z1: makeZone({ id: 'z1', hasObjective: true, objectiveColor: ObjectiveColor.Blue }),
      },
      survivors: { s1: survivor },
      objectives: [takeObjectiveObj({ color: ObjectiveColor.Blue })],
    });

    const next = handleTakeObjective(state, takeReq());

    expect(next.spawnColorActivation[ObjectiveColor.Blue]).toEqual({
      activated: true,
      activatedOnTurn: 4,
    });
    // Green untouched.
    expect(next.spawnColorActivation[ObjectiveColor.Green]).toEqual({
      activated: false,
      activatedOnTurn: 0,
    });

    expect(next.lastAction?.colorActivated).toBe(ObjectiveColor.Blue);
    const lastHistory = next.history[next.history.length - 1];
    expect(lastHistory.payload?.colorActivated).toBe(ObjectiveColor.Blue);
  });

  it('re-taking a same-color Objective is idempotent on activatedOnTurn', () => {
    // First take on turn 4, second take (different zone) on turn 7.
    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      turn: 4,
      zones: {
        z1: makeZone({ id: 'z1', hasObjective: true, objectiveColor: ObjectiveColor.Blue }),
        z2: makeZone({ id: 'z2', hasObjective: true, objectiveColor: ObjectiveColor.Blue }),
      },
      survivors: { s1: survivor },
      objectives: [takeObjectiveObj({ color: ObjectiveColor.Blue, amountRequired: 2 })],
    });

    const afterFirst = handleTakeObjective(state, takeReq());
    expect(afterFirst.spawnColorActivation[ObjectiveColor.Blue].activatedOnTurn).toBe(4);

    afterFirst.turn = 7;
    afterFirst.survivors.s1.position.zoneId = 'z2';
    const afterSecond = handleTakeObjective(afterFirst, takeReq());

    // Activation turn does not reset on subsequent same-color takes.
    expect(afterSecond.spawnColorActivation[ObjectiveColor.Blue].activatedOnTurn).toBe(4);
    expect(afterSecond.spawnColorActivation[ObjectiveColor.Blue].activated).toBe(true);
    // Subsequent takes do not re-emit colorActivated on lastAction.
    expect(afterSecond.lastAction?.colorActivated).toBeUndefined();
  });

  it('green Objective increments green counter only and activates green spawns', () => {
    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      turn: 2,
      zones: {
        z1: makeZone({ id: 'z1', hasObjective: true, objectiveColor: ObjectiveColor.Green }),
      },
      survivors: { s1: survivor },
      objectives: [
        takeObjectiveObj({ color: ObjectiveColor.Blue }),
        takeObjectiveObj({ id: 'obj-color-green', color: ObjectiveColor.Green }),
      ],
    });

    const next = handleTakeObjective(state, takeReq());
    const blue = next.objectives.find(o => o.id === 'obj-color-blue') as Extract<Objective, { type: ObjectiveType.TakeColorObjective }>;
    const green = next.objectives.find(o => o.id === 'obj-color-green') as Extract<Objective, { type: ObjectiveType.TakeColorObjective }>;
    expect(blue.amountCurrent).toBe(0);
    expect(green.amountCurrent).toBe(1);
    expect(next.spawnColorActivation[ObjectiveColor.Green].activated).toBe(true);
    expect(next.spawnColorActivation[ObjectiveColor.Blue].activated).toBe(false);
  });

  it('yellow Objective does not activate any colored spawns', () => {
    const survivor = makeSurvivor({ zoneId: 'z1' });
    const state = makeState({
      turn: 3,
      zones: {
        z1: makeZone({ id: 'z1', hasObjective: true, objectiveColor: ObjectiveColor.Yellow }),
      },
      survivors: { s1: survivor },
      objectives: [takeYellowObj(1)],
    });

    const next = handleTakeObjective(state, takeReq());
    expect(next.spawnColorActivation[ObjectiveColor.Blue].activated).toBe(false);
    expect(next.spawnColorActivation[ObjectiveColor.Green].activated).toBe(false);
    expect(next.lastAction?.colorActivated).toBeUndefined();
  });
});
