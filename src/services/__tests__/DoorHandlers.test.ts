import { describe, it, expect } from 'vitest';
import { handleOpenDoor } from '../handlers/DoorHandlers';
import { processAction } from '../ActionProcessor';
import { GameState, DangerLevel, GamePhase, Zone, Survivor, EquipmentCard, EquipmentType, SpawnCard, SpawnDetail, ZombieType } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';
import { makeGridState, makeZombie, edgeKey } from './gridFixture';
import { makeSurvivor } from './winConditionHelpers';

function makeZone(overrides: Partial<Zone> & { id: string }): Zone {
  return {
    connections: [],
    isBuilding: false,
    hasNoise: false,
    noiseTokens: 0,
    searchable: false,
    isDark: false,
    hasBeenSpawned: false,
    ...overrides,
  };
}

function makeOpener(): EquipmentCard {
  return {
    id: 'crowbar-1',
    equipmentId: 'crowbar',
    name: 'Crowbar',
    type: EquipmentType.Weapon,
    canOpenDoor: true,
    openDoorNoise: false,
    inHand: true,
  };
}

function makeState(zones: Record<string, Zone>, survivorZoneId: string): GameState {
  const survivor: Survivor = {
    id: 's1',
    playerId: 'p1',
    name: 'Tester',
    characterClass: 'Waitress',
    position: { zoneId: survivorZoneId },
    actionsRemaining: 3,
    freeMovesRemaining: 0,
    freeSearchesRemaining: 0,
    freeCombatsRemaining: 0,
    freeMeleeRemaining: 0,
    freeRangedRemaining: 0,
    inventory: [makeOpener()],
    xp: 0,
    dangerLevel: DangerLevel.Blue,
    unlockedSkills: [],
    availableSkills: { BLUE: [], YELLOW: [], ORANGE: [], RED: [] },
    skillPending: false,
    woundCount: 0,
    isAlive: true,
  } as unknown as Survivor;

  return {
    id: 'test',
    seed: seedFromString('door-test'),
    turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: ['p1'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: { s1: survivor },
    zombies: {},
    zones,
    objectives: [],
    equipmentDeck: [],
    equipmentDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    noiseTokens: 0,
    config: {
      maxSurvivors: 6,
      friendlyFire: false,
      zombiePool: { Walker: 35, Runner: 12, Brute: 8, Abomination: 1 } as never,
    },
    history: [],
  } as unknown as GameState;
}

function openDoor(state: GameState, targetZoneId: string): GameState {
  const req: ActionRequest = {
    playerId: 'p1',
    survivorId: 's1',
    type: ActionType.OPEN_DOOR,
    payload: { targetZoneId },
  };
  return handleOpenDoor(state, req);
}

describe('handleOpenDoor — building spawn (Rule 302)', () => {
  it('spawns in all dark zones of a fully-dark building on first door open', () => {
    const zones: Record<string, Zone> = {
      street: makeZone({ id: 'street', connections: [{ toZoneId: 'roomA', hasDoor: true, doorOpen: false }] }),
      roomA: makeZone({ id: 'roomA', isBuilding: true, isDark: true, connections: [
        { toZoneId: 'street', hasDoor: true, doorOpen: false },
        { toZoneId: 'roomB', hasDoor: false, doorOpen: true },
      ] }),
      roomB: makeZone({ id: 'roomB', isBuilding: true, isDark: true, connections: [
        { toZoneId: 'roomA', hasDoor: false, doorOpen: true },
      ] }),
    };
    const state = makeState(zones, 'street');
    const next = openDoor(state, 'roomA');
    expect(next.zones.roomA.hasBeenSpawned).toBe(true);
    expect(next.zones.roomB.hasBeenSpawned).toBe(true);
    expect(next.lastAction?.description).toContain('zombies spawned');
  });

  it('spawns only in dark zones of a mixed lit/dark closed building (Rule 294)', () => {
    // Closed-entry building: lit front room + dark back room. Only dark zone spawns.
    const zones: Record<string, Zone> = {
      street: makeZone({ id: 'street', connections: [{ toZoneId: 'roomA', hasDoor: true, doorOpen: false }] }),
      roomA: makeZone({ id: 'roomA', isBuilding: true, isDark: false, connections: [
        { toZoneId: 'street', hasDoor: true, doorOpen: false },
        { toZoneId: 'roomB', hasDoor: false, doorOpen: true },
      ] }),
      roomB: makeZone({ id: 'roomB', isBuilding: true, isDark: true, connections: [
        { toZoneId: 'roomA', hasDoor: false, doorOpen: true },
      ] }),
    };
    const state = makeState(zones, 'street');
    const next = openDoor(state, 'roomA');
    expect(next.zones.roomA.hasBeenSpawned).toBe(true);
    expect(next.zones.roomB.hasBeenSpawned).toBe(true);
    // Every zombie must be in the dark zone only.
    const zombies = Object.values(next.zombies);
    expect(zombies.length).toBeGreaterThan(0);
    for (const z of zombies) {
      expect(z.position.zoneId).toBe('roomB');
    }
  });

  it('never spawns when the building is structurally open at start (Rule 302)', () => {
    // Building has a doorway (non-door) to the street — pre-revealed.
    const zones: Record<string, Zone> = {
      street: makeZone({ id: 'street', connections: [
        { toZoneId: 'roomA', hasDoor: false, doorOpen: true },
        { toZoneId: 'roomB', hasDoor: true, doorOpen: false },
      ] }),
      roomA: makeZone({ id: 'roomA', isBuilding: true, isDark: false, connections: [
        { toZoneId: 'street', hasDoor: false, doorOpen: true },
        { toZoneId: 'roomB', hasDoor: false, doorOpen: true },
      ] }),
      roomB: makeZone({ id: 'roomB', isBuilding: true, isDark: true, connections: [
        { toZoneId: 'roomA', hasDoor: false, doorOpen: true },
        { toZoneId: 'street', hasDoor: true, doorOpen: false },
      ] }),
    };
    const state = makeState(zones, 'street');
    const next = openDoor(state, 'roomB');
    expect(next.zones.roomA.hasBeenSpawned).toBe(true);
    expect(next.zones.roomB.hasBeenSpawned).toBe(true);
    expect(Object.keys(next.zombies)).toHaveLength(0);
  });

  it('does not re-spawn when a second door to the same building is opened later', () => {
    const zones: Record<string, Zone> = {
      streetW: makeZone({ id: 'streetW', connections: [{ toZoneId: 'roomA', hasDoor: true, doorOpen: false }] }),
      streetS: makeZone({ id: 'streetS', connections: [{ toZoneId: 'roomB', hasDoor: true, doorOpen: false }] }),
      roomA: makeZone({ id: 'roomA', isBuilding: true, isDark: true, connections: [
        { toZoneId: 'streetW', hasDoor: true, doorOpen: false },
        { toZoneId: 'roomB', hasDoor: false, doorOpen: true },
      ] }),
      roomB: makeZone({ id: 'roomB', isBuilding: true, isDark: true, connections: [
        { toZoneId: 'streetS', hasDoor: true, doorOpen: false },
        { toZoneId: 'roomA', hasDoor: false, doorOpen: true },
      ] }),
    };
    let state = makeState(zones, 'streetW');
    state = openDoor(state, 'roomA');
    expect(state.zones.roomA.hasBeenSpawned).toBe(true);
    expect(state.zones.roomB.hasBeenSpawned).toBe(true);

    // Move the survivor to streetS so they can open the other door.
    state.survivors.s1.position.zoneId = 'streetS';
    // Reset AP so the handler doesn't reject due to turn state.
    state.survivors.s1.actionsRemaining = 3;

    const next = openDoor(state, 'roomB');
    expect(next.lastAction?.description).not.toContain('zombies spawned');
  });
});

describe('handleOpenDoor — standard spawn rules (C6)', () => {
  const card = (detail: SpawnDetail): SpawnCard => ({
    id: 'test-card',
    [DangerLevel.Blue]: detail,
    [DangerLevel.Yellow]: detail,
    [DangerLevel.Orange]: detail,
    [DangerLevel.Red]: detail,
  });

  // x — w — street |door| roomA (dark building)
  function board(detail: SpawnDetail, zombies: GameState['zombies'], level = DangerLevel.Yellow): GameState {
    const survivor = makeSurvivor({ id: 's1', zoneId: 'street', dangerLevel: level, experience: level === DangerLevel.Yellow ? 7 : 0 });
    survivor.inventory = [makeOpener()];
    const state = makeGridState(
      { rows: ['x w street roomA'], buildings: ['roomA'], edges: { [edgeKey(2, 0, 3, 0)]: 'door' } },
      { survivors: { s1: survivor }, zombies, currentDangerLevel: level },
    );
    state.zones.roomA.isDark = true;
    state.lobby.players = [{ id: 'p1', name: 'P1', ready: true } as any];
    state.spawnDeck = [card(detail)];
    return state;
  }

  it('resolves Extra Activation cards: all Walkers activate', () => {
    const state = board({ extraActivation: ZombieType.Walker }, { w1: makeZombie('w1', ZombieType.Walker, 'w') });
    const next = openDoor(state, 'roomA');
    expect(next.zombies.w1.position.zoneId).toBe('street');
  });

  it('Extra Activation has no effect at Blue', () => {
    const state = board({ extraActivation: ZombieType.Walker }, { w1: makeZombie('w1', ZombieType.Walker, 'w') }, DangerLevel.Blue);
    const next = openDoor(state, 'roomA');
    expect(next.zombies.w1.position.zoneId).toBe('w');
  });

  it('activates Walkers instead of placing them when the pool is exhausted', () => {
    const state = board({ zombies: { [ZombieType.Walker]: 2 } }, { w1: makeZombie('w1', ZombieType.Walker, 'w') });
    state.config.zombiePool = { [ZombieType.Walker]: 1 } as never;
    const next = openDoor(state, 'roomA');
    expect(Object.keys(next.zombies)).toEqual(['w1']);
    expect(next.zombies.w1.position.zoneId).toBe('street');
  });

  it('uses the Danger Level refreshed by the previous action', () => {
    const state = board({ extraActivation: ZombieType.Walker }, { w1: makeZombie('w1', ZombieType.Walker, 'w') });
    state.currentDangerLevel = DangerLevel.Blue; // stale: survivor is already Yellow

    const noise = processAction(state, { playerId: 'p1', survivorId: 's1', type: ActionType.MAKE_NOISE });
    expect(noise.success).toBe(true);
    expect(noise.newState!.currentDangerLevel).toBe(DangerLevel.Yellow);

    const res = processAction(noise.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: { targetZoneId: 'roomA' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.zombies.w1.position.zoneId).toBe('street');
  });

  it('Abomination Fest activates existing Abominations only once when the pool is full', () => {
    const state = board({ zombies: { [ZombieType.Abomination]: 1 } }, { a1: makeZombie('a1', ZombieType.Abomination, 'x') });
    state.config.abominationFest = true;
    state.config.zombiePool = { [ZombieType.Abomination]: 1 } as never;
    const next = openDoor(state, 'roomA');
    expect(Object.keys(next.zombies)).toEqual(['a1']);
    expect(next.zombies.a1.position.zoneId).toBe('w');
  });

  it('queues wounds from a door-open activation and blocks play until resolved', () => {
    const state = board({ extraActivation: ZombieType.Walker }, { w1: makeZombie('w1', ZombieType.Walker, 'street') });
    state.survivors.s2 = makeSurvivor({ id: 's2', playerId: 'p1', zoneId: 'street' });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: { targetZoneId: 'roomA' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.pendingZombieWounds).toEqual([{ zoneId: 'street', totalWounds: 1, survivorIds: ['s1', 's2'] }]);

    const blocked = processAction(res.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'w' },
    });
    expect(blocked.success).toBe(false);
    expect(blocked.error?.message).toContain('Resolve pending wounds');
  });
});
