import { describe, it, expect } from 'vitest';
import {
  DangerLevel,
  GameResult,
  ObjectiveColor,
  Objective,
  ObjectiveType,
} from '../../types/GameState';
import { checkGameEndConditions } from '../ActionProcessor';
import {
  makeState,
  makeZone,
  makeSurvivor,
  makeCard,
  takeObjectiveObj,
  takeEpicObj,
  reachExitObj,
  reachDangerObj,
  collectItemsObj,
} from './winConditionHelpers';

describe('Win condition composition (AND-only)', () => {
  it('victory only when ALL conditions are met', () => {
    const blueObj = takeObjectiveObj({ color: ObjectiveColor.Blue, amountRequired: 1, amountCurrent: 1 });
    (blueObj as Extract<Objective, { type: ObjectiveType.TakeColorObjective }>).completed = true;

    const epicObj = takeEpicObj(2);
    (epicObj as Extract<Objective, { type: ObjectiveType.TakeEpicCrate }>).amountCurrent = 2;
    (epicObj as Extract<Objective, { type: ObjectiveType.TakeEpicCrate }>).completed = true;

    const water = makeCard({ equipmentId: 'water' });
    const survivor = makeSurvivor({
      zoneId: 'exit',
      dangerLevel: DangerLevel.Orange,
      inventory: [water],
    });

    const state = makeState({
      zones: {
        exit: makeZone({ id: 'exit', isExit: true }),
      },
      survivors: { s1: survivor },
      objectives: [
        reachExitObj('exit'),
        blueObj,
        epicObj,
        collectItemsObj([{ equipmentId: 'water', quantity: 1 }]),
        reachDangerObj(DangerLevel.Orange),
      ],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Victory);
  });

  it('one missing condition (low danger) blocks victory even when all others are met', () => {
    const blueObj = takeObjectiveObj({ color: ObjectiveColor.Blue, amountRequired: 1, amountCurrent: 1 });
    (blueObj as Extract<Objective, { type: ObjectiveType.TakeColorObjective }>).completed = true;

    const epicObj = takeEpicObj(1);
    (epicObj as Extract<Objective, { type: ObjectiveType.TakeEpicCrate }>).amountCurrent = 1;
    (epicObj as Extract<Objective, { type: ObjectiveType.TakeEpicCrate }>).completed = true;

    const water = makeCard({ equipmentId: 'water' });
    const survivor = makeSurvivor({
      zoneId: 'exit',
      dangerLevel: DangerLevel.Yellow, // below the Orange threshold
      inventory: [water],
    });

    const state = makeState({
      zones: { exit: makeZone({ id: 'exit', isExit: true }) },
      survivors: { s1: survivor },
      objectives: [
        reachExitObj('exit'),
        blueObj,
        epicObj,
        collectItemsObj([{ equipmentId: 'water', quantity: 1 }]),
        reachDangerObj(DangerLevel.Orange),
      ],
    });

    expect(checkGameEndConditions(state)).toBeUndefined();
  });

  it('one missing condition (not in exit) blocks victory', () => {
    const survivor = makeSurvivor({ zoneId: 'street', dangerLevel: DangerLevel.Red });
    const state = makeState({
      zones: {
        street: makeZone({ id: 'street' }),
        exit: makeZone({ id: 'exit', isExit: true }),
      },
      survivors: { s1: survivor },
      objectives: [reachExitObj('exit'), reachDangerObj(DangerLevel.Orange)],
    });

    expect(checkGameEndConditions(state)).toBeUndefined();
  });
});
