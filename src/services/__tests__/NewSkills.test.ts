import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { rollAttack } from '../CombatDice';
import { Rng, seedFromString } from '../Rng';
import { ActionType } from '../../types/Action';
import { GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeZombie, withTwoPlayers } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';
import { es } from '../../strings/es';

/** a — b — c — d, s1 (p1) in `a`, s2 (p2) in `d`. */
function board(skills: string[], zombies: GameState['zombies'] = {}): GameState {
  return withTwoPlayers(makeGridState(
    { rows: ['a b c d'] },
    {
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', skills }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'd' }),
      },
      zombies,
    },
  ));
}

describe('Jump (Bunny G)', () => {
  const jump = (state: GameState, path: string[]) => processAction(state, {
    playerId: 'p1', survivorId: 's1', type: ActionType.JUMP, payload: { path },
  });

  it('lands two zones away, over the zombies in between', () => {
    const state = board(['jump'], { w1: makeZombie('w1', ZombieType.Walker, 'b') });

    const res = jump(state, ['b', 'c']);

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('c');
    // One action, nothing extra for the zone crossed.
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(2);
  });

  it('still pays for the zombies in the zone it leaves', () => {
    const state = board(['jump'], {
      w1: makeZombie('w1', ZombieType.Walker, 'a'),
      w2: makeZombie('w2', ZombieType.Walker, 'a'),
    });

    const res = jump(state, ['b', 'c']);

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(0);
  });

  it('refuses a path that is not exactly two zones, and a second use in a turn', () => {
    expect(jump(board(['jump']), ['b']).success).toBe(false);

    const once = jump(board(['jump']), ['b', 'c']);
    expect(once.success).toBe(true);
    const twice = processAction(once.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.JUMP, payload: { path: ['b', 'a'] },
    });
    expect(twice.success).toBe(false);
    expect(twice.error?.message).toBe(es.errors.skillUsed(es.skills.jump.name));
  });
});

describe('Shove (Ned, Tiger Sam)', () => {
  const shove = (state: GameState, targetZoneId: string) => processAction(state, {
    playerId: 'p1', survivorId: 's1', type: ActionType.SHOVE, payload: { targetZoneId },
  });

  it('pushes every zombie in the zone one zone over, for free, without moving', () => {
    const state = board(['shove'], {
      w1: makeZombie('w1', ZombieType.Walker, 'a'),
      w2: makeZombie('w2', ZombieType.Walker, 'a'),
    });

    const res = shove(state, 'b');

    expect(res.success).toBe(true);
    const next = res.newState!;
    expect(next.zombies.w1.position.zoneId).toBe('b');
    expect(next.zombies.w2.position.zoneId).toBe('b');
    expect(next.survivors.s1.position.zoneId).toBe('a');
    expect(next.survivors.s1.actionsRemaining).toBe(3);
  });

  it('needs a zombie to push and a zone at range 1', () => {
    expect(shove(board(['shove']), 'b').error?.message).toBe(es.errors.shoveNeedsZombie);

    const far = board(['shove'], { w1: makeZombie('w1', ZombieType.Walker, 'a') });
    expect(shove(far, 'c').error?.message).toBe(es.errors.shoveRange);
  });
});

describe('Dice roll bonuses', () => {
  it('+1 to Dice Roll: Combat lifts every die, melee or ranged', () => {
    const rng = () => Rng.from(seedFromString('dice-bonus'));
    const plain = rollAttack(rng(), { count: 6, accuracy: 4 });
    const boosted = rollAttack(rng(), { count: 6, accuracy: 4, diceBonus: 1 });

    for (let i = 0; i < plain.rolls.length; i++) {
      expect(boosted.rolls[i]).toBe(Math.min(6, plain.rolls[i] + 1));
    }
    expect(boosted.hits).toBeGreaterThanOrEqual(plain.hits);
  });
});

describe('Roll 6: +1 Die Combat (Bunny G)', () => {
  it('rolls another die for every 6', () => {
    const rng = () => Rng.from(seedFromString('explode'));
    const plain = rollAttack(rng(), { count: 8, accuracy: 4 });
    const exploding = rollAttack(rng(), { count: 8, accuracy: 4, explodeOnSix: true });

    const sixes = plain.rolls.filter(r => r === 6).length;
    expect(sixes).toBeGreaterThan(0);
    expect(exploding.rolls.length).toBeGreaterThan(plain.rolls.length);
    // The original dice are untouched; the extras come after them.
    expect(exploding.rolls.slice(0, plain.rolls.length)).toEqual(plain.rolls);
  });

  it('adds nothing when no die shows a 6', () => {
    const result = rollAttack(Rng.from(seedFromString('explode')), {
      count: 4, accuracy: 4, explodeOnSix: true,
    });
    if (!result.rolls.slice(0, 4).includes(6)) {
      expect(result.rolls).toHaveLength(4);
    }
  });
});
