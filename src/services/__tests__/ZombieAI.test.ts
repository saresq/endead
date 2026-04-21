import { describe, it, expect } from 'vitest';
import { ZombieAI } from '../ZombieAI';
import {
  GameState, GamePhase, DangerLevel,
  Survivor, Zone, ZoneConnection, Zombie, ZombieType,
} from '../../types/GameState';
import { seedFromString } from '../Rng';

// --- Fixture helpers ---------------------------------------------------------

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: 'S',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: 3,
    wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: [],
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
    isBuilding: true, // Building zones so hasLineOfSight works without zoneGeometry
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

function connect(a: string, b: string, hasDoor = false, doorOpen = false): [ZoneConnection, ZoneConnection] {
  return [
    { toZoneId: b, hasDoor, doorOpen },
    { toZoneId: a, hasDoor, doorOpen },
  ];
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'test',
    seed: seedFromString('zai'),
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

// ---------------------------------------------------------------------------
// m9 — getAction attack / move / NONE semantics (post C1)
// ---------------------------------------------------------------------------

describe('ZombieAI.getAction — attack selection', () => {
  it('zombie in same zone as living survivor → ATTACK', () => {
    const state = baseState({
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' }) },
      zones: { z1: makeZone('z1') },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const action = ZombieAI.getAction(state, state.zombies.w1);
    expect(action.type).toBe('ATTACK');
    expect(action.targetId).toBe('s1');
  });

  it('zombie in same zone as dead survivor → NONE (no ATTACK)', () => {
    const deadSurv = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    deadSurv.wounds = deadSurv.maxHealth;
    const state = baseState({
      survivors: { s1: deadSurv },
      zones: { z1: makeZone('z1') },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const action = ZombieAI.getAction(state, state.zombies.w1);
    expect(action.type).toBe('NONE');
  });
});

describe('ZombieAI.getAction — closed-door behavior (C1)', () => {
  it('adjacent zone has survivor but the door is closed → NONE (no BREAK_DOOR)', () => {
    const [c12, c21] = connect('z1', 'z2', true, false);
    const state = baseState({
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z2' }) },
      zones: {
        z1: makeZone('z1', [c12]),
        z2: makeZone('z2', [c21]),
      },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const action = ZombieAI.getAction(state, state.zombies.w1);
    expect(action.type).toBe('NONE');
    // Type union no longer contains BREAK_DOOR — compile-time + runtime check.
    expect(action.type).not.toBe('BREAK_DOOR' as unknown as typeof action.type);
  });

  it('adjacent zone has survivor and the door is open → MOVE into that zone', () => {
    const [c12, c21] = connect('z1', 'z2', true, true);
    const state = baseState({
      survivors: { s1: makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z2' }) },
      zones: {
        z1: makeZone('z1', [c12]),
        z2: makeZone('z2', [c21]),
      },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const action = ZombieAI.getAction(state, state.zombies.w1);
    expect(action.type).toBe('MOVE');
    expect(action.toZoneId).toBe('z2');
  });
});

describe('ZombieAI.getAction — no target / no path', () => {
  it('no survivors on the board and no noise → NONE', () => {
    const [c12, c21] = connect('z1', 'z2');
    const state = baseState({
      zones: {
        z1: makeZone('z1', [c12]),
        z2: makeZone('z2', [c21]),
      },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const action = ZombieAI.getAction(state, state.zombies.w1);
    expect(action.type).toBe('NONE');
  });

  it('noise exists but fully walled off → NONE', () => {
    const state = baseState({
      zones: {
        z1: makeZone('z1'),
        z2: { ...makeZone('z2'), noiseTokens: 5 },
      },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const action = ZombieAI.getAction(state, state.zombies.w1);
    expect(action.type).toBe('NONE');
  });
});

// ---------------------------------------------------------------------------
// m9 — planMoves distribution (M4)
// ---------------------------------------------------------------------------

/**
 * 3×1 street fixture:
 *   [z1] -- [z2] -- [z3]
 *   plus [z4] attached to z2 as a second-noise zone for tie-breaking.
 */
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

describe('ZombieAI.planMoves — tied noise routes split evenly by type', () => {
  it('4 Walkers with 2 tied target zones → 2 and 2, no prompts', () => {
    // Zombies at z2; targets z3 and z4 are both adjacent with equal noise (no survivors visible; 1 noise token each).
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 1 };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
        w4: makeZombie('w4', ZombieType.Walker, 'z2'),
      },
    });

    const plan = ZombieAI.planMoves(state, Object.values(state.zombies));
    expect(plan.prompts).toHaveLength(0);
    const dest = Object.values(plan.plannedMoves);
    const z3Count = dest.filter(z => z === 'z3').length;
    const z4Count = dest.filter(z => z === 'z4').length;
    expect(z3Count).toBe(2);
    expect(z4Count).toBe(2);
  });

  it('5 Walkers with 2 tied target zones → 2 + 2 placed, 1 remainder prompt', () => {
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 1 };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
        w4: makeZombie('w4', ZombieType.Walker, 'z2'),
        w5: makeZombie('w5', ZombieType.Walker, 'z2'),
      },
    });

    const plan = ZombieAI.planMoves(state, Object.values(state.zombies));
    expect(plan.prompts).toHaveLength(1);
    const prompt = plan.prompts[0];
    expect(prompt.type).toBe(ZombieType.Walker);
    expect(prompt.sourceZoneId).toBe('z2');
    expect([...prompt.options].sort()).toEqual(['z3', 'z4']);

    const placed = Object.entries(plan.plannedMoves);
    expect(placed).toHaveLength(4); // 5 total − 1 remainder
    const dest = placed.map(([, z]) => z);
    expect(dest.filter(z => z === 'z3').length).toBe(2);
    expect(dest.filter(z => z === 'z4').length).toBe(2);
    // Remainder zombie is NOT in plannedMoves yet
    expect(plan.plannedMoves[prompt.zombieId]).toBeUndefined();
  });

  it('mixed types: 3 Walkers + 1 Runner across 2 tied routes → per-type apportioning', () => {
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 1 };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
        w3: makeZombie('w3', ZombieType.Walker, 'z2'),
        r1: makeZombie('r1', ZombieType.Runner, 'z2'),
      },
    });

    const plan = ZombieAI.planMoves(state, Object.values(state.zombies));
    // Walkers: 3 into 2 buckets → 1 forced per bucket + 1 prompt (type=Walker)
    const walkerPrompts = plan.prompts.filter(p => p.type === ZombieType.Walker);
    expect(walkerPrompts).toHaveLength(1);
    // Runner: 1 into 2 buckets → 0 forced + 1 prompt (type=Runner)
    const runnerPrompts = plan.prompts.filter(p => p.type === ZombieType.Runner);
    expect(runnerPrompts).toHaveLength(1);

    // Forced placements: exactly one Walker to z3 and one to z4.
    const walkerDest: string[] = [];
    for (const zid of ['w1', 'w2', 'w3']) {
      if (plan.plannedMoves[zid]) walkerDest.push(plan.plannedMoves[zid]);
    }
    expect(walkerDest).toHaveLength(2);
    expect(walkerDest.sort()).toEqual(['z3', 'z4']);
  });

  it('no-tie single next step → all zombies go there, no prompts', () => {
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 5 }; // only z3 is noisy

    const state = baseState({
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
      },
    });

    const plan = ZombieAI.planMoves(state, Object.values(state.zombies));
    expect(plan.prompts).toHaveLength(0);
    expect(plan.plannedMoves.w1).toBe('z3');
    expect(plan.plannedMoves.w2).toBe('z3');
  });

  it('closed door on one of two tied routes → only the open route is used (no BREAK_DOOR)', () => {
    const zones = threeByOneWithFork();
    // Close the door between z2 and z3
    zones.z2 = {
      ...zones.z2,
      connections: [
        { toZoneId: 'z1', hasDoor: false, doorOpen: false },
        { toZoneId: 'z3', hasDoor: true, doorOpen: false },
        { toZoneId: 'z4', hasDoor: false, doorOpen: false },
      ],
    };
    zones.z3 = {
      ...makeZone('z3', [{ toZoneId: 'z2', hasDoor: true, doorOpen: false }]),
      noiseTokens: 1,
    };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
        w2: makeZombie('w2', ZombieType.Walker, 'z2'),
      },
    });

    const plan = ZombieAI.planMoves(state, Object.values(state.zombies));
    expect(plan.prompts).toHaveLength(0);
    expect(plan.plannedMoves.w1).toBe('z4');
    expect(plan.plannedMoves.w2).toBe('z4');
  });

  it('prompt options are the tied next-step zones (e.g. [z3, z4])', () => {
    const zones = threeByOneWithFork();
    zones.z3 = { ...zones.z3, noiseTokens: 1 };
    zones.z4 = { ...zones.z4, noiseTokens: 1 };

    const state = baseState({
      zones,
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z2'),
      },
    });

    const plan = ZombieAI.planMoves(state, Object.values(state.zombies));
    expect(plan.prompts).toHaveLength(1);
    expect([...plan.prompts[0].options].sort()).toEqual(['z3', 'z4']);
  });
});
