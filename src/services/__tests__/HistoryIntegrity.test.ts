import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { ActionType } from '../../types/Action';
import { GamePhase, GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeZombie, makeWeapon, withTwoPlayers } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';

function board(): GameState {
  const state = makeGridState(
    { rows: ['a b c'] },
    {
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'b' }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'c' }),
      },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'b') },
      seedString: 'history-integrity',
    },
  );
  state.spawnDeck = [];
  state.spawnZoneIds = [];
  return withTwoPlayers(state);
}

const lastEntry = (s: GameState) => s.history[s.history.length - 1];

describe('History entry integrity', () => {
  it('attack entry carries the threshold; noise after it has no dice or description', () => {
    const state = board();
    state.survivors.s1.inventory = [makeWeapon('axe', { accuracy: 5 })];

    const attack = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK, payload: { targetZoneId: 'b', weaponId: 'axe' },
    });
    expect(attack.success).toBe(true);
    const attackEntry = lastEntry(attack.newState!);
    expect(attackEntry.threshold).toBe(5);
    expect(attackEntry.dice?.length).toBe(1);

    const noise = processAction(attack.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MAKE_NOISE,
    });
    expect(noise.success).toBe(true);
    const noiseEntry = lastEntry(noise.newState!);
    expect(noiseEntry.actionType).toBe(ActionType.MAKE_NOISE);
    expect(noiseEntry.dice).toBeUndefined();
    expect(noiseEntry.description).toBeUndefined();
    expect(noiseEntry.threshold).toBeUndefined();
  });

  it('move after a zombie phase has no spawn context', () => {
    const state = board();
    state.zombies = {};
    state.spawnContext = {
      cards: [{ zoneId: 'a', cardId: 'c1', detail: { zombies: { [ZombieType.Walker]: 1 } } as any, dangerLevel: state.currentDangerLevel }],
      timestamp: 1,
    };
    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'a' },
    });
    expect(res.success).toBe(true);
    expect(lastEntry(res.newState!).spawnContext).toBeUndefined();
  });
});

describe('Zombie-phase wound record', () => {
  it('records wounds dealt to a lone survivor and copies them into the END_TURN entry', () => {
    const state = board();
    state.zombies.w2 = makeZombie('w2', ZombieType.Walker, 'b');
    state.activePlayerIndex = 1;

    const res = processAction(state, { playerId: 'p2', survivorId: 's2', type: ActionType.END_TURN });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.wounds).toBe(2);
    expect(lastEntry(res.newState!).spawnContext?.zombieWounds).toEqual([
      { survivorId: 's1', zoneId: 'b', amount: 2 },
    ]);
  });

  it('records no wounds for a multi-survivor zone (distribution pending)', () => {
    const state = board();
    state.phase = GamePhase.Zombies;
    state.survivors.s2.position.zoneId = 'b';

    const after = ZombiePhaseManager.executeZombiePhase(state);
    expect(after.pendingZombieWounds?.length).toBe(1);
    expect(after.spawnContext?.zombieWounds).toEqual([]);
  });

  it('does not record a wound absorbed by Tough', () => {
    const state = board();
    state.phase = GamePhase.Zombies;
    state.survivors.s1.skills = ['tough'];

    const after = ZombiePhaseManager.executeZombiePhase(state);
    expect(after.survivors.s1.wounds).toBe(0);
    expect(after.spawnContext?.zombieWounds).toEqual([]);
  });
});
