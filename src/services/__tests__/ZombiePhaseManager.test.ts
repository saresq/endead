import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import {
  GameState, GamePhase, DangerLevel,
  Survivor, Zone, ZoneConnection, Zombie, ZombieType,
  SpawnCard,
} from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

// --- Fixture helpers ---------------------------------------------------------

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
  skills?: string[];
  maxHealth?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: 'S',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: opts.maxHealth ?? 3,
    wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: opts.skills ?? [],
    inventory: [],
    actionsRemaining: 3,
    hasMoved: false,
    hasSearched: false,
    freeMovesRemaining: 0,
    freeSearchesRemaining: 0,
    freeCombatsRemaining: 0,
    freeMeleeRemaining: 0,
    freeRangedRemaining: 0,
    toughUsedZombieAttack: false,
    toughUsedFriendlyFire: false,
    sprintUsedThisTurn: false,
    chargeUsedThisTurn: false,
    bornLeaderUsedThisTurn: false,
  };
}

function makeZone(id: string, connections: ZoneConnection[] = []): Zone {
  return {
    id,
    connections,
    isBuilding: true,
    hasNoise: false,
    noiseTokens: 0,
    searchable: false,
    isDark: false,
    hasBeenSpawned: false,
  };
}

function makeZombie(id: string, type: ZombieType, zoneId: string): Zombie {
  return {
    id,
    type,
    position: { x: 0, y: 0, zoneId },
    wounds: 0,
    activated: false,
  };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'test',
    seed: seedFromString('zpm'),
    version: 0,
    turn: 1,
    phase: GamePhase.Zombies,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: ['p1'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: {},
    zombies: {},
    zones: {},
    objectives: [],
    equipmentDeck: [],
    equipmentDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    noiseTokens: 0,
    nextZombieId: 99,
    config: {
      maxSurvivors: 6,
      zombiePool: {
        [ZombieType.Walker]: 40,
        [ZombieType.Runner]: 16,
        [ZombieType.Brute]: 16,
        [ZombieType.Abomination]: 4,
      },
    },
    ...overrides,
  } as GameState;
}

/** 3×1 street fixture with a fork at z2: z1 -- z2 -- z3 / z4. */
function threeByOneWithFork(): Record<string, Zone> {
  return {
    z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
    z2: makeZone('z2', [
      { toZoneId: 'z1', hasDoor: false, doorOpen: false },
      { toZoneId: 'z3', hasDoor: false, doorOpen: false },
      { toZoneId: 'z4', hasDoor: false, doorOpen: false },
    ]),
    z3: makeZone('z3', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
    z4: makeZone('z4', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
  };
}

/**
 * Split-test fixture: zombies at z2 with two tied fork zones z3/z4 and an
 * *isolated* survivor zone z1. z1 is unreachable from z2 (no LoS, no path),
 * so the AI falls to the "global noisiest" path and z3/z4 are tied targets.
 */
function forkFixtureWithIsolatedSurvivorZone(): Record<string, Zone> {
  return {
    z1: makeZone('z1'), // isolated
    z2: makeZone('z2', [
      { toZoneId: 'z3', hasDoor: false, doorOpen: false },
      { toZoneId: 'z4', hasDoor: false, doorOpen: false },
    ]),
    z3: { ...makeZone('z3', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]), noiseTokens: 2 },
    z4: { ...makeZone('z4', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]), noiseTokens: 2 },
  };
}

// A no-op spawn deck so phase end isn't blocked. Each card has all danger levels
// set to empty zombie maps.
function noopSpawnDeck(count = 4): SpawnCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sc-${i}`,
    [DangerLevel.Blue]: { zombies: {} },
    [DangerLevel.Yellow]: { zombies: {} },
    [DangerLevel.Orange]: { zombies: {} },
    [DangerLevel.Red]: { zombies: {} },
  } as SpawnCard));
}

// ---------------------------------------------------------------------------
// m9 — three-pass activation order (attack → move → runner-2nd)
// ---------------------------------------------------------------------------

describe('ZombiePhaseManager — three-pass activation order', () => {
  it('pass 1 attacks resolve BEFORE pass 2 moves (attackers stay; non-attackers advance)', () => {
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const state = baseState({
      phase: GamePhase.Zombies,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', maxHealth: 5 }) },
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z1'), // in zone with survivor → attacks
        w2: makeZombie('w2', ZombieType.Walker, 'z2'), // in adjacent zone → moves toward survivor
      },
      zones,
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);

    // w1 attacked (still in z1), w2 moved into z1
    expect(state.zombies.w1.position.zoneId).toBe('z1');
    expect(state.zombies.w2.position.zoneId).toBe('z1');
    expect(state.survivors.s1.wounds).toBe(1); // only w1 attacked in pass 1 (w2 hadn't moved yet)
  });

  it('Runner 2nd activation attacks AFTER all zombies complete first action', () => {
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const state = baseState({
      phase: GamePhase.Zombies,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', maxHealth: 5 }) },
      zombies: {
        r1: makeZombie('r1', ZombieType.Runner, 'z1'), // attacks pass 1, attacks again pass 3
      },
      zones,
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);

    // Runner attacks twice (pass 1 + pass 3)
    expect(state.survivors.s1.wounds).toBe(2);
    expect(state.zombies.r1.position.zoneId).toBe('z1');
  });

  it('Non-runners do NOT get a second activation in pass 3', () => {
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const state = baseState({
      phase: GamePhase.Zombies,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', maxHealth: 5 }) },
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z1'),
      },
      zones,
      spawnDeck: noopSpawnDeck(),
    });
    ZombiePhaseManager.executeZombiePhase(state);
    expect(state.survivors.s1.wounds).toBe(1); // Walker attacks once
  });
});

// ---------------------------------------------------------------------------
// m9 — End Phase reset of tough flags (B7: zombie-attack reset; FF persists)
// ---------------------------------------------------------------------------

describe('ZombiePhaseManager — end phase resets toughUsedZombieAttack but NOT toughUsedFriendlyFire (B7)', () => {
  it('toughUsedZombieAttack flips false at end of zombie phase; toughUsedFriendlyFire persists', () => {
    const zones = { z1: makeZone('z1') };
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['tough'], maxHealth: 5 });
    survivor.toughUsedZombieAttack = true;
    survivor.toughUsedFriendlyFire = true;

    const state = baseState({
      phase: GamePhase.Zombies,
      survivors: { s1: survivor },
      zones,
      spawnDeck: noopSpawnDeck(),
    });
    ZombiePhaseManager.executeZombiePhase(state);

    expect(state.survivors.s1.toughUsedZombieAttack).toBe(false);
    expect(state.survivors.s1.toughUsedFriendlyFire).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// m9 — Extra Activation suppression at Blue Danger Level
// ---------------------------------------------------------------------------

describe('ZombiePhaseManager.applySpawnDetail — extra activation has no effect at Blue Danger Level', () => {
  it('extraActivation of Walkers at Blue danger → no additional attacks or movement', () => {
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const state = baseState({
      phase: GamePhase.Zombies,
      currentDangerLevel: DangerLevel.Blue,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', maxHealth: 5 }) },
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z1'), // same zone as survivor
      },
      zones,
    });

    const woundsBefore = state.survivors.s1.wounds;
    // Trigger extra activation directly (outside the main phase flow)
    ZombiePhaseManager.applySpawnDetail(state, 'z1', { extraActivation: ZombieType.Walker });

    expect(state.survivors.s1.wounds).toBe(woundsBefore);
  });

  it('extraActivation of Walkers at Yellow danger → zombies attack (wounds +1)', () => {
    const zones = { z1: makeZone('z1') };
    const state = baseState({
      phase: GamePhase.Zombies,
      currentDangerLevel: DangerLevel.Yellow,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', maxHealth: 5 }) },
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z1'),
      },
      zones,
    });

    ZombiePhaseManager.applySpawnDetail(state, 'z1', { extraActivation: ZombieType.Walker });
    expect(state.survivors.s1.wounds).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// m9 — Pool exhaustion → extra activation of existing zombies
// ---------------------------------------------------------------------------

describe('ZombiePhaseManager.applySpawnDetail — pool exhaustion triggers extra activation', () => {
  it('spawn Walkers but pool is exhausted → existing Walkers get extra activation instead', () => {
    const zones = { z1: makeZone('z1'), z2: makeZone('z2', []) };
    const state = baseState({
      phase: GamePhase.Zombies,
      currentDangerLevel: DangerLevel.Yellow,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', maxHealth: 5 }) },
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z1'), // 1 walker, pool = 1 (exhausted)
      },
      zones,
      config: {
        maxSurvivors: 6,
        zombiePool: {
          [ZombieType.Walker]: 1,
          [ZombieType.Runner]: 16,
          [ZombieType.Brute]: 16,
          [ZombieType.Abomination]: 4,
        },
      },
    });

    // Spawn detail would normally add 2 new Walkers; pool is exhausted (at limit 1).
    ZombiePhaseManager.applySpawnDetail(state, 'z2', { zombies: { [ZombieType.Walker]: 2 } });

    // No new walkers spawned (pool limit was 1 already)
    const walkerCount = Object.values(state.zombies).filter(z => z.type === ZombieType.Walker).length;
    expect(walkerCount).toBe(1);
    // Existing Walker was extra-activated → attacked the survivor
    expect(state.survivors.s1.wounds).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// C1 — Zombies never open or break doors
// ---------------------------------------------------------------------------

describe('ZombiePhaseManager — zombies never open or break doors (C1)', () => {
  it('zombie adjacent to noise through a closed door stays put; door remains closed', () => {
    const state = baseState({
      phase: GamePhase.Zombies,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z2' }) },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
      zones: {
        z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: true, doorOpen: false }]),
        z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: true, doorOpen: false }]),
      },
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);

    expect(state.zombies.w1.position.zoneId).toBe('z1'); // stayed put
    const conn = state.zones.z1.connections[0];
    expect(conn.hasDoor).toBe(true);
    expect(conn.doorOpen).toBe(false); // still closed
    expect(state.survivors.s1.wounds).toBe(0);
  });

  it('same setup but door open → zombie moves through', () => {
    const state = baseState({
      phase: GamePhase.Zombies,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z2' }) },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
      zones: {
        z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: true, doorOpen: true }]),
        z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: true, doorOpen: true }]),
      },
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);
    expect(state.zombies.w1.position.zoneId).toBe('z2');
  });
});

// ---------------------------------------------------------------------------
// M4 — tied-route split + remainder prompts
// ---------------------------------------------------------------------------

describe('ZombiePhaseManager — tied-route split and RESOLVE_ZOMBIE_SPLIT (M4)', () => {
  it('4 Walkers with 2 tied routes → evenly placed (2 and 2), no pause', () => {
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 1 };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      phase: GamePhase.Zombies,
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
        w4: makeZombie('w4', ZombieType.Walker, 'z2'),
      },
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);

    expect(state.pendingZombieSplit).toBeUndefined();
    const dests = [
      state.zombies.w1.position.zoneId,
      state.zombies.w2.position.zoneId,
      state.zombies.w3.position.zoneId,
      state.zombies.w4.position.zoneId,
    ];
    expect(dests.filter(z => z === 'z3').length).toBe(2);
    expect(dests.filter(z => z === 'z4').length).toBe(2);
  });

  it('5 Walkers with 2 tied routes → 2+2 placed, phase pauses on 1 remainder prompt', () => {
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 1 };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      phase: GamePhase.Zombies,
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
        w4: makeZombie('w4', ZombieType.Walker, 'z2'),
        w5: makeZombie('w5', ZombieType.Walker, 'z2'),
      },
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);

    expect(state.pendingZombieSplit).toBeDefined();
    expect(state.pendingZombieSplit!.stage).toBe('pass2');
    expect(state.pendingZombieSplit!.prompts).toHaveLength(1);
    expect(state.phase).toBe(GamePhase.Zombies); // NOT flipped to Players
    // Remainder zombie has not moved yet
    const pending = state.pendingZombieSplit!;
    expect(state.zombies[pending.prompts[0].zombieId].position.zoneId).toBe('z2');
  });

  it('RESOLVE_ZOMBIE_SPLIT resumes the phase once all prompts are resolved', () => {
    const state = baseState({
      phase: GamePhase.Zombies,
      players: ['p1'],
      activePlayerIndex: 0,
      firstPlayerTokenIndex: 0,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' }) },
      zones: forkFixtureWithIsolatedSurvivorZone(),
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
      },
      spawnDeck: noopSpawnDeck(),
    });

    // Drive the zombie phase directly — it will pause on the remainder prompt.
    ZombiePhaseManager.executeZombiePhase(state);
    expect(state.phase).toBe(GamePhase.Zombies);
    expect(state.pendingZombieSplit).toBeDefined();
    expect(state.pendingZombieSplit!.prompts).toHaveLength(1);

    const prompt = state.pendingZombieSplit!.prompts[0];
    const choice = prompt.options[0];

    const r = processAction(state, {
      playerId: 'p1', type: ActionType.RESOLVE_ZOMBIE_SPLIT,
      payload: { zombieId: prompt.zombieId, toZoneId: choice },
    });
    expect(r.success).toBe(true);
    const s2 = r.newState!;
    // All prompts resolved; zombie phase completed and flipped to Players
    expect(s2.pendingZombieSplit).toBeUndefined();
    expect(s2.phase).toBe(GamePhase.Players);
    expect(s2.zombies[prompt.zombieId].position.zoneId).toBe(choice);
  });

  it('RESOLVE_ZOMBIE_SPLIT rejects zones outside the prompt options', () => {
    const state = baseState({
      phase: GamePhase.Zombies,
      players: ['p1'],
      activePlayerIndex: 0,
      firstPlayerTokenIndex: 0,
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' }) },
      zones: forkFixtureWithIsolatedSurvivorZone(),
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
      },
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);
    expect(state.pendingZombieSplit).toBeDefined();
    const prompt = state.pendingZombieSplit!.prompts[0];

    const r = processAction(state, {
      playerId: 'p1', type: ActionType.RESOLVE_ZOMBIE_SPLIT,
      payload: { zombieId: prompt.zombieId, toZoneId: 'z1' }, // NOT in options (z3, z4)
    });
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/Invalid zone/);
    expect(state.pendingZombieSplit).toBeDefined();
  });

  it('RESOLVE_ZOMBIE_SPLIT rejects a non-active player', () => {
    const state = baseState({
      phase: GamePhase.Zombies,
      players: ['p1', 'p2'],
      activePlayerIndex: 0,
      firstPlayerTokenIndex: 0,
      survivors: {
        s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' }),
        s2: makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1' }),
      },
      zones: forkFixtureWithIsolatedSurvivorZone(),
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
      },
      spawnDeck: noopSpawnDeck(),
    });

    ZombiePhaseManager.executeZombiePhase(state);
    expect(state.pendingZombieSplit).toBeDefined();
    const prompt = state.pendingZombieSplit!.prompts[0];

    // p1 is the active player; have p2 try to resolve.
    const r = processAction(state, {
      playerId: 'p2', type: ActionType.RESOLVE_ZOMBIE_SPLIT,
      payload: { zombieId: prompt.zombieId, toZoneId: prompt.options[0] },
    });
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/active player/i);
  });
});
