import { describe, it, expect } from 'vitest';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { GamePhase, ZombieType } from '../../types/GameState';
import { makeGridState, edgeKey, makeZombie as zombie } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';

describe('Zombie activation', () => {
  it('does not move or open a closed door when the target is behind it', () => {
    const state = makeGridState(
      { rows: ['a b'], edges: { [edgeKey(0, 0, 1, 0)]: 'door' } },
      {
        phase: GamePhase.Zombies,
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'b' }) },
        zombies: { w1: zombie('w1', ZombieType.Walker, 'a') },
      },
    );

    const after = ZombiePhaseManager.executeZombiePhase(state);

    expect(after.zombies.w1.position.zoneId).toBe('a');
    expect(after.zones.a.connections[0].doorOpen).toBe(false);
    expect(after.zones.b.connections[0].doorOpen).toBe(false);
  });

  it('Runner moves into the survivor zone and then attacks', () => {
    const state = makeGridState(
      { rows: ['a b'] },
      {
        phase: GamePhase.Zombies,
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'b' }) },
        zombies: { r1: zombie('r1', ZombieType.Runner, 'a') },
      },
    );

    const after = ZombiePhaseManager.executeZombiePhase(state);

    expect(after.zombies.r1.position.zoneId).toBe('b');
    expect(after.survivors.s1.wounds).toBe(1);
  });

  it('Walker moves one zone and does not attack in the same activation', () => {
    const state = makeGridState(
      { rows: ['a b'] },
      {
        phase: GamePhase.Zombies,
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'b' }) },
        zombies: { w1: zombie('w1', ZombieType.Walker, 'a') },
      },
    );

    const after = ZombiePhaseManager.executeZombiePhase(state);

    expect(after.zombies.w1.position.zoneId).toBe('b');
    expect(after.survivors.s1.wounds).toBe(0);
  });
});
