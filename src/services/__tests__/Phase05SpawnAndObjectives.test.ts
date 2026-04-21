import { describe, it, expect } from 'vitest';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { handleTakeObjective } from '../handlers/ObjectiveHandlers';
import { EventCollector } from '../EventCollector';
import {
  GameState, GamePhase, DangerLevel, Objective, ObjectiveType,
  Survivor, Zone, Zombie, ZombieType,
  initialGameState,
} from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

// --- Fixture helpers ---------------------------------------------------------

function makeSurvivor(id: string, playerId: string, zoneId: string): Survivor {
  return {
    id, playerId, name: 'S',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId },
    actionsPerTurn: 3,
    maxHealth: 3, wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: [],
    inventory: [],
    actionsRemaining: 3,
    hasMoved: false, hasSearched: false,
    freeMovesRemaining: 0, freeSearchesRemaining: 0,
    freeCombatsRemaining: 0, freeMeleeRemaining: 0, freeRangedRemaining: 0,
    toughUsedZombieAttack: false, toughUsedFriendlyFire: false,
    sprintUsedThisTurn: false, chargeUsedThisTurn: false,
    bornLeaderUsedThisTurn: false,
  };
}

function makeZone(id: string, overrides: Partial<Zone> = {}): Zone {
  return {
    id,
    connections: [],
    isBuilding: true,
    hasNoise: false,
    noiseTokens: 0,
    searchable: false,
    isDark: false,
    hasBeenSpawned: false,
    ...overrides,
  };
}

function makeZombie(id: string, type: ZombieType, zoneId: string): Zombie {
  return {
    id, type,
    position: { x: 0, y: 0, zoneId },
    wounds: 0,
    activated: false,
  };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'test',
    seed: seedFromString('phase05'),
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
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
      // Use the *shipped default* pool so this test catches any regression
      // of `initialGameState.config.zombiePool[Abomination]`.
      zombiePool: { ...initialGameState.config.zombiePool },
    },
    ...overrides,
  } as GameState;
}

// ===========================================================================
// M6 — Standard mode caps active Abominations at 1.
// Default `config.zombiePool[Abomination]` must be 1 so a single spawn-card
// that lists `{Abomination: 2+}` (or multiple consecutive first-spawns)
// cannot place more than one Abomination on the board.
// ===========================================================================

describe('M6 — Default Abomination pool caps at 1 in Standard mode', () => {
  it('spawn detail requesting 2 Abominations only places 1', () => {
    const zones = { z1: makeZone('z1') };
    const state = baseState({ zones });

    ZombiePhaseManager.applySpawnDetail(state, 'z1', {
      zombies: { [ZombieType.Abomination]: 2 },
    });

    const aboms = Object.values(state.zombies).filter(
      z => z.type === ZombieType.Abomination
    );
    expect(aboms.length).toBe(1);
  });

  it('two back-to-back single-Abomination spawns still leave 1 on board', () => {
    const zones = {
      z1: makeZone('z1'),
      z2: makeZone('z2'),
    };
    const state = baseState({ zones });

    ZombiePhaseManager.applySpawnDetail(state, 'z1', {
      zombies: { [ZombieType.Abomination]: 1 },
    });
    ZombiePhaseManager.applySpawnDetail(state, 'z2', {
      zombies: { [ZombieType.Abomination]: 1 },
    });

    const aboms = Object.values(state.zombies).filter(
      z => z.type === ZombieType.Abomination
    );
    expect(aboms.length).toBe(1);
  });

  it('Abomination Fest mode honours a higher configured pool', () => {
    const zones = { z1: makeZone('z1') };
    const state = baseState({
      zones,
      config: {
        maxSurvivors: 6,
        abominationFest: true,
        zombiePool: { ...initialGameState.config.zombiePool, [ZombieType.Abomination]: 3 },
      },
    });

    // Spawn 3 abominations across 3 calls (fest mode = extra activation on existing
    // + still place new). Start with empty — first call places one.
    ZombiePhaseManager.applySpawnDetail(state, 'z1', {
      zombies: { [ZombieType.Abomination]: 1 },
    });
    ZombiePhaseManager.applySpawnDetail(state, 'z1', {
      zombies: { [ZombieType.Abomination]: 1 },
    });
    ZombiePhaseManager.applySpawnDetail(state, 'z1', {
      zombies: { [ZombieType.Abomination]: 1 },
    });

    const aboms = Object.values(state.zombies).filter(
      z => z.type === ZombieType.Abomination
    );
    expect(aboms.length).toBe(3);
  });
});

// ===========================================================================
// M7 — Objective XP is tied to the specific token's zone, not "first unmatched".
// Mixed-value scenarios (blue 5 XP, red 1 XP) must award the token's own
// `xpValue`, regardless of the order in which objectives appear in the list.
// ===========================================================================

function objAt(zoneId: string, xp: number): Objective {
  return {
    id: `obj-${zoneId}`,
    type: ObjectiveType.TakeObjective,
    description: `Objective in ${zoneId}`,
    zoneId,
    amountRequired: 1,
    amountCurrent: 0,
    completed: false,
    xpValue: xp,
  };
}

describe('M7 — Objective XP matches by zoneId, not list order', () => {
  it('survivor in zone B awards zone B\'s 1 XP even when zone A (5 XP) is listed first', () => {
    const zones = {
      zA: makeZone('zA', { hasObjective: true }),
      zB: makeZone('zB', { hasObjective: true }),
    };
    const state = baseState({
      survivors: { sB: makeSurvivor('sB', 'p1', 'zB') },
      zones,
      objectives: [objAt('zA', 5), objAt('zB', 1)],
    });

    const collector = new EventCollector();
    handleTakeObjective(state, {
      playerId: 'p1', survivorId: 'sB', type: ActionType.TAKE_OBJECTIVE,
    }, collector);

    expect(state.survivors.sB.experience).toBe(1);
    const zA = state.objectives!.find(o => o.zoneId === 'zA')!;
    const zB = state.objectives!.find(o => o.zoneId === 'zB')!;
    expect(zA.amountCurrent).toBe(0);
    expect(zA.completed).toBe(false);
    expect(zB.amountCurrent).toBe(1);
    expect(zB.completed).toBe(true);
  });

  it('survivor in zone A awards zone A\'s 5 XP even when zone B (1 XP) is listed first', () => {
    const zones = {
      zA: makeZone('zA', { hasObjective: true }),
      zB: makeZone('zB', { hasObjective: true }),
    };
    const state = baseState({
      survivors: { sA: makeSurvivor('sA', 'p1', 'zA') },
      zones,
      objectives: [objAt('zB', 1), objAt('zA', 5)],
    });

    const collector = new EventCollector();
    handleTakeObjective(state, {
      playerId: 'p1', survivorId: 'sA', type: ActionType.TAKE_OBJECTIVE,
    }, collector);

    expect(state.survivors.sA.experience).toBe(5);
    const zA = state.objectives!.find(o => o.zoneId === 'zA')!;
    const zB = state.objectives!.find(o => o.zoneId === 'zB')!;
    expect(zA.amountCurrent).toBe(1);
    expect(zA.completed).toBe(true);
    expect(zB.amountCurrent).toBe(0);
    expect(zB.completed).toBe(false);
  });

  it('no matching objective for the survivor\'s zone → throws (no silent fallback)', () => {
    const zones = {
      zA: makeZone('zA', { hasObjective: true }),
      zGhost: makeZone('zGhost', { hasObjective: true }),
    };
    const state = baseState({
      survivors: { sG: makeSurvivor('sG', 'p1', 'zGhost') },
      zones,
      objectives: [objAt('zA', 5)],
    });

    const collector = new EventCollector();
    expect(() =>
      handleTakeObjective(state, {
        playerId: 'p1', survivorId: 'sG', type: ActionType.TAKE_OBJECTIVE,
      }, collector)
    ).toThrow();
  });
});
