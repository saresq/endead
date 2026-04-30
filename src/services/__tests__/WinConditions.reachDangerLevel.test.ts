import { describe, it, expect } from 'vitest';
import { DangerLevel, GameResult } from '../../types/GameState';
import { checkGameEndConditions } from '../ActionProcessor';
import {
  makeState,
  makeSurvivor,
  reachDangerObj,
  reachExitObj,
  makeZone,
} from './winConditionHelpers';

describe('ReachDangerLevel win condition', () => {
  it('met when team-max danger reaches the threshold (atomic — no exit required)', () => {
    const s = makeSurvivor({ zoneId: 'z1', dangerLevel: DangerLevel.Orange });
    const state = makeState({
      survivors: { s1: s },
      objectives: [reachDangerObj(DangerLevel.Orange)],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Victory);
  });

  it('not met when no living survivor has reached the threshold', () => {
    const s = makeSurvivor({ zoneId: 'z1', dangerLevel: DangerLevel.Yellow });
    const state = makeState({
      survivors: { s1: s },
      objectives: [reachDangerObj(DangerLevel.Orange)],
    });

    expect(checkGameEndConditions(state)).toBeUndefined();
  });

  it('above-threshold counts (Red satisfies Orange threshold)', () => {
    const s = makeSurvivor({ zoneId: 'z1', dangerLevel: DangerLevel.Red });
    const state = makeState({
      survivors: { s1: s },
      objectives: [reachDangerObj(DangerLevel.Orange)],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Victory);
  });

  it('uses team-MAX danger across living survivors', () => {
    const lowS = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', dangerLevel: DangerLevel.Blue });
    const highS = makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1', dangerLevel: DangerLevel.Red });
    const state = makeState({
      survivors: { s1: lowS, s2: highS },
      objectives: [reachDangerObj(DangerLevel.Orange)],
    });

    expect(checkGameEndConditions(state)).toBe(GameResult.Victory);
  });

  it('AND-composes with ReachExit: danger met but not all in exit zone → no victory', () => {
    const s = makeSurvivor({ zoneId: 'street', dangerLevel: DangerLevel.Red });
    const state = makeState({
      zones: {
        street: makeZone({ id: 'street' }),
        exit: makeZone({ id: 'exit', isExit: true }),
      },
      survivors: { s1: s },
      objectives: [reachDangerObj(DangerLevel.Orange), reachExitObj('exit')],
    });

    expect(checkGameEndConditions(state)).toBeUndefined();

    // Move into the exit — both conditions now hold.
    state.survivors.s1.position.zoneId = 'exit';
    expect(checkGameEndConditions(state)).toBe(GameResult.Victory);
  });
});
