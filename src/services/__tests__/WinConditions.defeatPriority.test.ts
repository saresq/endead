import { describe, it, expect } from 'vitest';
import { DangerLevel, GameResult, ObjectiveColor } from '../../types/GameState';
import { checkGameEndConditions } from '../ActionProcessor';
import {
  makeState,
  makeZone,
  makeSurvivor,
  takeObjectiveObj,
  reachExitObj,
  reachDangerObj,
} from './winConditionHelpers';

describe('Defeat-vs-victory ordering', () => {
  it('survivor dying in the exit zone the same tick produces Defeat, not Victory', () => {
    const dead = makeSurvivor({
      id: 's1',
      playerId: 'p1',
      zoneId: 'exit',
      wounds: 3,
      maxHealth: 3,
    });
    const alive = makeSurvivor({
      id: 's2',
      playerId: 'p2',
      zoneId: 'exit',
    });

    const state = makeState({
      zones: { exit: makeZone({ id: 'exit', isExit: true }) },
      survivors: { s1: dead, s2: alive },
      objectives: [reachExitObj('exit')],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Defeat);
  });

  it('survivor dying at Red the same tick ReachDangerLevel is met still produces Defeat', () => {
    const dead = makeSurvivor({
      id: 's1',
      playerId: 'p1',
      zoneId: 'z1',
      wounds: 3,
      maxHealth: 3,
      dangerLevel: DangerLevel.Red,
    });

    const state = makeState({
      survivors: { s1: dead },
      objectives: [reachDangerObj(DangerLevel.Red)],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Defeat);
  });

  it('defeat fires even when every objective is independently met', () => {
    const blueDone = takeObjectiveObj({
      color: ObjectiveColor.Blue,
      amountRequired: 1,
      amountCurrent: 1,
    });
    blueDone.completed = true;

    const dead = makeSurvivor({
      id: 's1',
      playerId: 'p1',
      zoneId: 'exit',
      wounds: 3,
      maxHealth: 3,
    });
    const alive = makeSurvivor({
      id: 's2',
      playerId: 'p2',
      zoneId: 'exit',
    });

    const state = makeState({
      zones: { exit: makeZone({ id: 'exit', isExit: true }) },
      survivors: { s1: dead, s2: alive },
      objectives: [reachExitObj('exit'), blueDone],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Defeat);
  });
});
