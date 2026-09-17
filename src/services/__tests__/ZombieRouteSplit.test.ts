import { describe, it, expect } from 'vitest';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { GamePhase, GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeZombie } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';

/**
 *   z — a
 *   |   |
 *   b — t
 *
 * From `z`, both `a` and `b` reach the survivor in `t` in two moves.
 */
function diamond(zombies: GameState['zombies']): GameState {
  return makeGridState(
    { rows: ['z a', 'b t'] },
    {
      phase: GamePhase.Zombies,
      survivors: { s1: makeSurvivor({ id: 's1', zoneId: 't' }) },
      zombies,
    },
  );
}

describe('A zombie group splits between equally short routes (D4)', () => {
  it('four Walkers with two equal routes go two and two', () => {
    const state = diamond({
      w1: makeZombie('w1', ZombieType.Walker, 'z'),
      w2: makeZombie('w2', ZombieType.Walker, 'z'),
      w3: makeZombie('w3', ZombieType.Walker, 'z'),
      w4: makeZombie('w4', ZombieType.Walker, 'z'),
    });

    const after = ZombiePhaseManager.executeZombiePhase(state);

    const zones = Object.values(after.zombies).map(z => z.position.zoneId);
    expect(zones.filter(id => id === 'a')).toHaveLength(2);
    expect(zones.filter(id => id === 'b')).toHaveLength(2);
  });

  it('splits per type, so a Runner in the group does not shift the Walkers', () => {
    // Dealt as one list the Runner would take `a` and push w1 onto `b`.
    const state = diamond({
      r1: makeZombie('r1', ZombieType.Runner, 'z'),
      w1: makeZombie('w1', ZombieType.Walker, 'z'),
      w2: makeZombie('w2', ZombieType.Walker, 'z'),
    });

    const after = ZombiePhaseManager.executeZombiePhase(state);

    expect(after.zombies.w1.position.zoneId).toBe('a');
    expect(after.zombies.w2.position.zoneId).toBe('b');
  });

  it('one shortest route still moves the whole group', () => {
    const state = makeGridState(
      { rows: ['z a t'] },
      {
        phase: GamePhase.Zombies,
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 't' }) },
        zombies: {
          w1: makeZombie('w1', ZombieType.Walker, 'z'),
          w2: makeZombie('w2', ZombieType.Walker, 'z'),
          w3: makeZombie('w3', ZombieType.Walker, 'z'),
        },
      },
    );

    const after = ZombiePhaseManager.executeZombiePhase(state);

    for (const zombie of Object.values(after.zombies)) {
      expect(zombie.position.zoneId).toBe('a');
    }
  });
});
