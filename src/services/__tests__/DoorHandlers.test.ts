import { describe, it, expect } from 'vitest';
import { handleOpenDoor } from '../handlers/DoorHandlers';
import { GameState, DangerLevel, GamePhase, Zone, Survivor, EquipmentCard, EquipmentType } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

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
