import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ActionType } from '../../types/Action';
import { GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeZombie, makeWeapon, withTwoPlayers } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';

function boardWithZombies(count: number, actions: number, seedString = 'move-cost'): GameState {
  const zombies: GameState['zombies'] = {};
  for (let i = 1; i <= count; i++) zombies[`w${i}`] = makeZombie(`w${i}`, ZombieType.Walker, 'a');
  const state = makeGridState(
    { rows: ['a b c d'] },
    {
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', actionsRemaining: actions }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'd' }),
      },
      zombies,
      seedString,
    },
  );
  return withTwoPlayers(state);
}

const move = (state: GameState, targetZoneId = 'b') =>
  processAction(state, { playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId } });

describe('Move cost when leaving zombies', () => {
  it('rejects a move the survivor cannot pay (3 actions, 3 zombies)', () => {
    const state = boardWithZombies(3, 3);
    const res = move(state);
    expect(res.success).toBe(false);
    expect(res.error?.message).toContain('need 4');
  });

  it('allows a move with exactly enough actions (4 actions, 3 zombies)', () => {
    const res = move(boardWithZombies(3, 4));
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('b');
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(0);
  });

  it('a free Move covers only the base cost', () => {
    const state = boardWithZombies(2, 2);
    state.survivors.s1.freeMovesRemaining = 1;
    const res = move(state);
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.freeMovesRemaining).toBe(0);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(0);
  });

  it('Slippery waives the zombie cost', () => {
    const state = boardWithZombies(3, 1);
    state.survivors.s1.skills = ['slippery'];
    const res = move(state);
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(0);
  });

  it('Sprint pays base cost plus zombies left', () => {
    const state = boardWithZombies(1, 3);
    state.survivors.s1.skills = ['sprint'];
    const sprint = (s: GameState) => processAction(s, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['b', 'c'] },
    });
    const res = sprint(state);
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('c');
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(1);

    const poor = boardWithZombies(1, 1);
    poor.survivors.s1.skills = ['sprint'];
    expect(sprint(poor).success).toBe(false);
  });
});

describe('Free attack consumption order (B11)', () => {
  it('uses free Melee before free Combat on a melee attack', () => {
    const state = boardWithZombies(1, 3);
    state.survivors.s1.inventory = [makeWeapon('axe')];
    state.survivors.s1.freeMeleeRemaining = 1;
    state.survivors.s1.freeCombatsRemaining = 1;
    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK, payload: { targetZoneId: 'a', weaponId: 'axe' },
    });
    expect(res.success).toBe(true);
    const s1 = res.newState!.survivors.s1;
    expect(s1.freeMeleeRemaining).toBe(0);
    expect(s1.freeCombatsRemaining).toBe(1);
    expect(s1.actionsRemaining).toBe(3);
  });
});

describe('Hit & Run', () => {
  it('grants a free Move that ignores the zombies left behind', () => {
    const state = boardWithZombies(5, 3);
    state.survivors.s1.skills = ['hit_and_run'];
    state.survivors.s1.inventory = [makeWeapon('axe', { dice: 2, accuracy: 2 })];

    const attack = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK, payload: { targetZoneId: 'a', weaponId: 'axe' },
    });
    expect(attack.success).toBe(true);
    const afterAttack = attack.newState!;
    expect(afterAttack.survivors.s1.experience).toBeGreaterThan(0);
    expect(afterAttack.survivors.s1.freeMovesRemaining).toBe(1);
    expect(afterAttack.survivors.s1.hitAndRunFreeMove).toBe(true);
    expect(Object.keys(afterAttack.zombies).length).toBeGreaterThanOrEqual(3);

    const res = move(afterAttack);
    expect(res.success).toBe(true);
    const s1 = res.newState!.survivors.s1;
    expect(s1.position.zoneId).toBe('b');
    expect(s1.actionsRemaining).toBe(2);
    expect(s1.freeMovesRemaining).toBe(0);
  });
});
