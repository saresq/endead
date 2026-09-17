import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeZombie, withTwoPlayers } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';
import { es } from '../../strings/es';

/** a — b — c — d, s1 (p1) in `a`, s2 (p2) in `d`. */
function board(over: {
  skills?: string[];
  zombies?: GameState['zombies'];
  actionsRemaining?: number;
} = {}): GameState {
  const state = makeGridState(
    { rows: ['a b c d'] },
    {
      survivors: {
        s1: makeSurvivor({
          id: 's1', playerId: 'p1', zoneId: 'a',
          skills: over.skills, actionsRemaining: over.actionsRemaining,
        }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'd' }),
      },
      zombies: over.zombies ?? {},
    },
  );
  return withTwoPlayers(state);
}

describe('Sprint follows movement rules (D8)', () => {
  it('stops in the first zone holding zombies instead of failing', () => {
    const state = board({
      skills: ['sprint'],
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'b') },
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['b', 'c'] },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('b');
  });

  it('honours Slippery and runs the whole path', () => {
    const state = board({
      skills: ['sprint', 'slippery'],
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'b') },
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['b', 'c'] },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('c');
  });

  it('spends a free Move rather than an action point', () => {
    const state = board({ skills: ['sprint'] });
    state.survivors.s1.freeMovesRemaining = 1;

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['b', 'c'] },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.freeMovesRemaining).toBe(0);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(3);
  });

  it('a free Move alone is enough to sprint with no actions left', () => {
    const state = board({ skills: ['sprint'], actionsRemaining: 0 });
    state.survivors.s1.freeMovesRemaining = 1;

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['b', 'c'] },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('c');
  });
});

describe('Charge respects zombies along the path (D8)', () => {
  it('stops in the middle zone when that zone holds zombies', () => {
    const state = board({
      skills: ['charge'],
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'b'),
        w2: makeZombie('w2', ZombieType.Walker, 'c'),
      },
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.CHARGE, payload: { path: ['b', 'c'] },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('b');
  });

  it('crosses an empty middle zone to reach the zombies', () => {
    const state = board({
      skills: ['charge'],
      zombies: { w2: makeZombie('w2', ZombieType.Walker, 'c') },
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.CHARGE, payload: { path: ['b', 'c'] },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('c');
  });
});

describe('Born Leader follows its card (D8)', () => {
  it('grants the action to a teammate in another zone', () => {
    const state = board({ skills: ['born_leader'] });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.BORN_LEADER,
      payload: { targetSurvivorId: 's2' },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s2.actionsRemaining).toBe(4);
  });

  it('refuses a grant to a player whose turn is already over', () => {
    const state = board({ skills: ['born_leader'] });
    // p2 holds the first player token, so p1 plays last: p2 can never spend it.
    state.firstPlayerTokenIndex = 1;
    state.activePlayerIndex = 0;

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.BORN_LEADER,
      payload: { targetSurvivorId: 's2' },
    });

    expect(res.success).toBe(false);
    expect(res.error?.message).toBe(es.errors.targetTurnOver);
    expect(state.survivors.s2.actionsRemaining).toBe(3);
  });
});

describe('Kid Slippery (D1)', () => {
  const kidLeavingOneZombie = () => {
    const state = board({ zombies: { w1: makeZombie('w1', ZombieType.Walker, 'a') } });
    state.survivors.s1.survivorType = 'Kid';
    return state;
  };

  const moveToB = (state: GameState) => processAction(state, {
    playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'b' },
  });

  it('waives the zombie cost on the first Move of the turn', () => {
    const res = moveToB(kidLeavingOneZombie());

    expect(res.success).toBe(true);
    // Base cost only — the zombie left behind was free.
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(2);
    expect(res.newState!.survivors.s1.kidSlipperyUsedThisTurn).toBe(true);
  });

  it('pays the zombie cost on the second Move of the turn', () => {
    const state = kidLeavingOneZombie();
    state.zombies.w2 = makeZombie('w2', ZombieType.Walker, 'b');
    state.survivors.s1.kidSlipperyUsedThisTurn = true;

    const res = moveToB(state);

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(1);
  });

  it('a Classic survivor pays it every time', () => {
    const state = kidLeavingOneZombie();
    state.survivors.s1.survivorType = 'Classic';

    const res = moveToB(state);

    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(1);
  });
});
