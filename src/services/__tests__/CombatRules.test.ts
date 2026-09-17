// Combat rules pass (RULES-REVIEW §2, B1–B9): hit assignment, friendly fire,
// Tough / Lucky / Reaper timing, weapon keywords and Molotov.

import { describe, it, expect } from 'vitest';
import {
  handleAttack,
  handleReload,
  handleDistributeZombieWounds,
  handleRerollLucky,
} from '../handlers/CombatHandlers';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { applyWound } from '../Wounds';
import { rollAttack } from '../CombatDice';
import { Rng, RngState, seedFromString } from '../Rng';
import { ActionType } from '../../types/Action';
import { DangerLevel, EquipmentCard, GamePhase, GameState, ZombieType } from '../../types/GameState';
import { makeGridState, makeWeapon, makeZombie as zombie, withTwoPlayers } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';

/**
 * Finds a seed whose first roll of `count` dice lands exactly `hits`. The
 * attack handler rolls from `state.seed` with the same options, so seeding the
 * state with the result makes the dice deterministic for the assertion.
 */
function seedForHits(count: number, accuracy: number, hits: number): RngState {
  for (let i = 0; i < 50_000; i++) {
    const seed = seedFromString(`combat-${count}-${accuracy}-${hits}-${i}`);
    if (rollAttack(Rng.from(seed), { count, accuracy }).hits === hits) return seed;
  }
  throw new Error(`no seed rolling ${hits}/${count} hits at ${accuracy}+`);
}

const attack = (state: GameState, payload: Record<string, unknown>, survivorId = 's1', playerId = 'p1') =>
  handleAttack(state, { playerId, survivorId, type: ActionType.ATTACK, payload });

describe('B1 — a hit that cannot kill does not pass to the next target', () => {
  it('a Brute shields a Walker from a ranged attack', () => {
    const state = makeGridState(
      { rows: ['a b'] },
      {
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', inventory: [makeWeapon('rifle', { range: [1, 1], dice: 2, accuracy: 4, damage: 1 })] }) },
        zombies: { br: zombie('br', ZombieType.Brute, 'b'), wk: zombie('wk', ZombieType.Walker, 'b') },
      },
    );
    state.seed = seedForHits(2, 4, 2);

    const after = attack(state, { targetZoneId: 'b', weaponId: 'rifle' });

    expect(Object.keys(after.zombies).sort()).toEqual(['br', 'wk']);
  });

  it('kills the Brute and carries the remaining hits through to the Walker', () => {
    const state = makeGridState(
      { rows: ['a b'] },
      {
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', inventory: [makeWeapon('rifle', { range: [1, 1], dice: 2, accuracy: 4, damage: 2 })] }) },
        zombies: { br: zombie('br', ZombieType.Brute, 'b'), wk: zombie('wk', ZombieType.Walker, 'b') },
      },
    );
    state.seed = seedForHits(2, 4, 2);

    const after = attack(state, { targetZoneId: 'b', weaponId: 'rifle' });

    expect(Object.keys(after.zombies)).toEqual([]);
  });

  it('melee skips the Brute and spends both hits on the Walkers', () => {
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', inventory: [makeWeapon('axe', { range: [0, 0], dice: 2, accuracy: 4, damage: 1 })] }) },
        zombies: {
          br: zombie('br', ZombieType.Brute, 'a'),
          w1: zombie('w1', ZombieType.Walker, 'a'),
          w2: zombie('w2', ZombieType.Walker, 'a'),
        },
      },
    );
    state.seed = seedForHits(2, 4, 2);

    const after = attack(state, { targetZoneId: 'a', weaponId: 'axe' });

    expect(Object.keys(after.zombies)).toEqual(['br']);
  });
});

describe('B2 — every Friendly Fire miss lands', () => {
  function threeMissState() {
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: {
          s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', inventory: [makeWeapon('smg', { range: [0, 1], dice: 3, accuracy: 6, damage: 1 })] }),
          s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'a' }),
          s3: makeSurvivor({ id: 's3', playerId: 'p2', zoneId: 'a' }),
        },
      },
    );
    withTwoPlayers(state);
    state.config.friendlyFire = true;
    state.seed = seedForHits(3, 6, 0);
    return state;
  }

  it('offers all three misses for assignment and never targets the shooter', () => {
    const after = attack(threeMissState(), { targetZoneId: 'a', weaponId: 'smg' });

    expect(after.pendingZombieWounds).toHaveLength(1);
    const entry = after.pendingZombieWounds![0];
    expect(entry.totalWounds).toBe(3);
    expect(entry.source).toBe('FRIENDLY_FIRE');
    expect(entry.survivorIds.sort()).toEqual(['s2', 's3']);
    expect(after.survivors.s1.wounds).toBe(0);
  });

  it('applies every assigned miss, more misses than survivors included', () => {
    const shot = attack(threeMissState(), { targetZoneId: 'a', weaponId: 'smg' });
    const entry = shot.pendingZombieWounds![0];

    const after = handleDistributeZombieWounds(shot, {
      playerId: 'p1',
      type: ActionType.DISTRIBUTE_ZOMBIE_WOUNDS,
      payload: { zoneId: 'a', contextId: entry.contextId, assignments: { s2: 2, s3: 1 } },
    });

    expect(after.survivors.s2.wounds).toBe(2);
    expect(after.survivors.s3.wounds).toBe(1);
    expect(after.pendingZombieWounds).toBeUndefined();
  });

  it('applies both misses directly when only one survivor can be hit', () => {
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: {
          s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', inventory: [makeWeapon('smg', { range: [0, 1], dice: 2, accuracy: 6, damage: 1 })] }),
          s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'a' }),
        },
      },
    );
    withTwoPlayers(state);
    state.config.friendlyFire = true;
    state.seed = seedForHits(2, 6, 0);

    const after = attack(state, { targetZoneId: 'a', weaponId: 'smg' });

    expect(after.survivors.s2.wounds).toBe(2);
    expect(after.pendingZombieWounds).toBeUndefined();
  });
});

describe('B3 — Tough ignores one wound per instance', () => {
  it('spends once per wound context and re-arms on the next one', () => {
    const state = makeGridState({ rows: ['a'] }, { survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a' }) } });
    state.survivors.s1.skills = ['tough'];

    applyWound(state, 's1', 1, { toughKey: 'step-1' });
    expect(state.survivors.s1.wounds).toBe(0);

    applyWound(state, 's1', 1, { toughKey: 'step-1' });
    expect(state.survivors.s1.wounds).toBe(1);

    applyWound(state, 's1', 1, { toughKey: 'step-2' });
    expect(state.survivors.s1.wounds).toBe(1);
  });

  it('applies in both of two attack steps in the same round', () => {
    const state = makeGridState(
      { rows: ['a'] },
      {
        phase: GamePhase.Zombies,
        currentDangerLevel: DangerLevel.Yellow,
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', maxHealth: 5 }) },
        zombies: { w1: zombie('w1', ZombieType.Walker, 'a'), w2: zombie('w2', ZombieType.Walker, 'a') },
      },
    );
    state.survivors.s1.skills = ['tough'];

    // Each activation is two attacks, of which Tough ignores exactly one.
    ZombiePhaseManager.applySpawnDetail(state, 'a', { extraActivation: ZombieType.Walker });
    expect(state.survivors.s1.wounds).toBe(1);

    ZombiePhaseManager.applySpawnDetail(state, 'a', { extraActivation: ZombieType.Walker });
    expect(state.survivors.s1.wounds).toBe(2);
  });

  it('takes one wound from a Damage 2 Friendly Fire miss, not zero', () => {
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: {
          s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', inventory: [makeWeapon('shotgun', { range: [0, 1], dice: 1, accuracy: 6, damage: 2 })] }),
          s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'a' }),
        },
      },
    );
    withTwoPlayers(state);
    state.config.friendlyFire = true;
    state.survivors.s2.skills = ['tough'];
    state.seed = seedForHits(1, 6, 0);

    const after = attack(state, { targetZoneId: 'a', weaponId: 'shotgun' });

    expect(after.survivors.s2.wounds).toBe(1);
  });
});

describe('B8 — Lucky is once per action', () => {
  function luckyState() {
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', inventory: [makeWeapon('axe', { dice: 1, accuracy: 4, damage: 1 })] }) },
        zombies: { w1: zombie('w1', ZombieType.Walker, 'a') },
      },
    );
    state.survivors.s1.skills = ['lucky'];
    state.seed = seedForHits(1, 4, 0);
    return state;
  }

  it('re-arms on the next attack of the same turn', () => {
    const first = attack(luckyState(), { targetZoneId: 'a', weaponId: 'axe' });
    expect(first.survivors.s1.luckyUsedThisAction).toBe(false);

    const rerolled = handleRerollLucky(first, { playerId: 'p1', survivorId: 's1', type: ActionType.REROLL_LUCKY });
    expect(rerolled.survivors.s1.luckyUsedThisAction).toBe(true);

    const second = attack(rerolled, { targetZoneId: 'a', weaponId: 'axe' });
    expect(second.survivors.s1.luckyUsedThisAction).toBe(false);
  });
});

describe('B9 — Reaper is once per killing hit', () => {
  it('two killing hits kill two extra zombies of the same type', () => {
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', inventory: [makeWeapon('axe', { dice: 2, accuracy: 4, damage: 1 })] }) },
        zombies: {
          w1: zombie('w1', ZombieType.Walker, 'a'),
          w2: zombie('w2', ZombieType.Walker, 'a'),
          w3: zombie('w3', ZombieType.Walker, 'a'),
          w4: zombie('w4', ZombieType.Walker, 'a'),
        },
      },
    );
    state.survivors.s1.skills = ['reaper_melee'];
    state.seed = seedForHits(2, 4, 2);

    const after = attack(state, { targetZoneId: 'a', weaponId: 'axe' });

    expect(Object.keys(after.zombies)).toEqual([]);
  });
});

describe('B4 — Molotov kills every actor in the zone', () => {
  it('kills the survivors standing in it', () => {
    const state = makeGridState(
      { rows: ['a b'] },
      {
        survivors: {
          s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', inventory: [makeWeapon('molotov', { range: [1, 1], dice: 1, accuracy: 4, damage: 1, special: 'molotov' })] }),
          s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'b' }),
        },
        zombies: { w1: zombie('w1', ZombieType.Walker, 'b') },
      },
    );
    withTwoPlayers(state);

    const after = attack(state, { targetZoneId: 'b', weaponId: 'molotov' });

    expect(Object.keys(after.zombies)).toEqual([]);
    expect(after.survivors.s2.wounds).toBe(after.survivors.s2.maxHealth);
  });
});

describe('B5 — the sniper keyword grants Sniper', () => {
  it('gives free targeting and no friendly fire without the skill', () => {
    const state = makeGridState(
      { rows: ['a b'] },
      {
        survivors: {
          s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', inventory: [{ ...makeWeapon('sniper_rifle', { range: [1, 2], dice: 1, accuracy: 4, damage: 1 }), keywords: ['sniper'] }] }),
          s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'b' }),
        },
        zombies: { br: zombie('br', ZombieType.Brute, 'b'), wk: zombie('wk', ZombieType.Walker, 'b') },
      },
    );
    withTwoPlayers(state);
    state.config.friendlyFire = true;
    state.seed = seedForHits(1, 4, 1);

    const after = attack(state, { targetZoneId: 'b', weaponId: 'sniper_rifle' });

    // The unkillable Brute is skipped rather than shielding the Walker…
    expect(Object.keys(after.zombies)).toEqual(['br']);
    // …and Sniper suppresses friendly fire entirely.
    expect(after.survivors.s2.wounds).toBe(0);
    expect(after.pendingZombieWounds).toBeUndefined();
  });
});

describe('B6 — the reload keyword needs reloading', () => {
  function shotgunState() {
    const shotgun: EquipmentCard = { ...makeWeapon('sawed_off', { range: [0, 1], dice: 1, accuracy: 4, damage: 1 }), keywords: ['reload'] };
    const state = makeGridState(
      { rows: ['a'] },
      { survivors: { s1: makeSurvivor({ id: 's1', zoneId: 'a', inventory: [shotgun] }) } },
    );
    state.seed = seedForHits(1, 4, 1);
    return state;
  }

  it('refuses a second shot and reloads with an action', () => {
    const fired = attack(shotgunState(), { targetZoneId: 'a', weaponId: 'sawed_off' });
    expect(fired.survivors.s1.inventory[0].loaded).toBe(false);

    expect(() => attack(fired, { targetZoneId: 'a', weaponId: 'sawed_off' }))
      .toThrow(/recarg/i);

    const reloaded = handleReload(fired, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RELOAD, payload: { weaponId: 'sawed_off' },
    });
    expect(reloaded.survivors.s1.inventory[0].loaded).toBe(true);
    expect(() => attack(reloaded, { targetZoneId: 'a', weaponId: 'sawed_off' })).not.toThrow();
  });

  it('reloads for free in the End Phase', () => {
    const fired = attack(shotgunState(), { targetZoneId: 'a', weaponId: 'sawed_off' });

    const after = ZombiePhaseManager.endRound(fired);

    expect(after.survivors.s1.inventory[0].loaded).toBe(true);
  });
});

describe('B7 — a weapon can be melee and ranged', () => {
  function gunbladeState() {
    const gunblade: EquipmentCard = makeWeapon('gunblade', { range: [0, 1], dice: 1, accuracy: 6, damage: 2, melee: true });
    const state = makeGridState(
      { rows: ['a'] },
      {
        survivors: {
          s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'a', inventory: [gunblade] }),
          s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'a' }),
        },
        zombies: { br: zombie('br', ZombieType.Brute, 'a') },
      },
    );
    withTwoPlayers(state);
    state.config.friendlyFire = true;
    return state;
  }

  it('resolves in melee in the own zone: melee skills, Super Strength, no friendly fire', () => {
    const state = gunbladeState();
    state.survivors.s1.skills = ['super_strength'];
    state.seed = seedForHits(1, 6, 0); // the one die misses

    const after = attack(state, { targetZoneId: 'a', weaponId: 'gunblade' });

    expect(after.lastAction!.isMelee).toBe(true);
    // Super Strength is a melee skill: Damage 3, enough for the Brute.
    expect(after.lastAction!.damagePerHit).toBe(3);
    // The miss cannot become friendly fire in melee.
    expect(after.survivors.s2.wounds).toBe(0);
  });

  it('resolves as ranged when the player asks for it', () => {
    const state = gunbladeState();
    state.seed = seedForHits(1, 6, 0);

    const after = attack(state, { targetZoneId: 'a', weaponId: 'gunblade', attackMode: 'RANGED' });

    expect(after.lastAction!.isMelee).toBe(false);
    expect(after.survivors.s2.wounds).toBe(2);
  });
});
