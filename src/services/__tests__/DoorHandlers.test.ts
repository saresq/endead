import { describe, it, expect } from 'vitest';
import { handleOpenDoor } from '../handlers/DoorHandlers';
import { EventCollector } from '../EventCollector';
import { assertValidationIsPure } from './assertValidationIsPure';
import {
  GameState,
  DangerLevel,
  GamePhase,
  Zone,
  Survivor,
  EquipmentCard,
  EquipmentType,
  SpawnCard,
  ZombieType,
} from '../../types/GameState';
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
    version: 0,
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
      zombiePool: { Walker: 35, Runner: 12, Brute: 8, Abomination: 1 } as never,
    },
  } as unknown as GameState;
}

function openDoor(state: GameState, targetZoneId: string, collector?: EventCollector): EventCollector {
  const c = collector ?? new EventCollector();
  const req: ActionRequest = {
    playerId: 'p1',
    survivorId: 's1',
    type: ActionType.OPEN_DOOR,
    payload: { targetZoneId },
  };
  handleOpenDoor(state, req, c);
  return c;
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
    const collector = openDoor(state, 'roomA');
    expect(state.zones.roomA.hasBeenSpawned).toBe(true);
    expect(state.zones.roomB.hasBeenSpawned).toBe(true);
    expect(state.lastAction?.description).toContain('zombies spawned');
    // DOOR_OPENED emitted with both endpoints + opener.
    const events = collector.drain();
    expect(events[0]).toEqual({
      type: 'DOOR_OPENED',
      zoneAId: 'street',
      zoneBId: 'roomA',
      openerSurvivorId: 's1',
    });
  });

  it('spawns only in dark zones of a mixed lit/dark closed building (Rule 294)', () => {
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
    openDoor(state, 'roomA');
    expect(state.zones.roomA.hasBeenSpawned).toBe(true);
    expect(state.zones.roomB.hasBeenSpawned).toBe(true);
    const zombies = Object.values(state.zombies);
    expect(zombies.length).toBeGreaterThan(0);
    for (const z of zombies) {
      expect(z.position.zoneId).toBe('roomB');
    }
  });

  it('never spawns when the building is structurally open at start (Rule 302)', () => {
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
    openDoor(state, 'roomB');
    expect(state.zones.roomA.hasBeenSpawned).toBe(true);
    expect(state.zones.roomB.hasBeenSpawned).toBe(true);
    expect(Object.keys(state.zombies)).toHaveLength(0);
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
    const state = makeState(zones, 'streetW');
    openDoor(state, 'roomA');
    expect(state.zones.roomA.hasBeenSpawned).toBe(true);
    expect(state.zones.roomB.hasBeenSpawned).toBe(true);

    state.survivors.s1.position.zoneId = 'streetS';
    state.survivors.s1.actionsRemaining = 3;

    openDoor(state, 'roomB');
    expect(state.lastAction?.description).not.toContain('zombies spawned');
  });
});

describe('handleOpenDoor — §3.10 validate-first contract', () => {
  it('rejects every failure path without mutating state or emitting events', () => {
    const zones: Record<string, Zone> = {
      street: makeZone({ id: 'street', connections: [
        { toZoneId: 'roomA', hasDoor: true, doorOpen: false },
        { toZoneId: 'roomB', hasDoor: false, doorOpen: true }, // no door at all
        { toZoneId: 'roomOpen', hasDoor: true, doorOpen: true }, // already open
      ] }),
      roomA: makeZone({ id: 'roomA', isBuilding: true, isDark: false, connections: [
        { toZoneId: 'street', hasDoor: true, doorOpen: false },
      ] }),
      roomB: makeZone({ id: 'roomB', isBuilding: true, isDark: false, connections: [
        { toZoneId: 'street', hasDoor: false, doorOpen: true },
      ] }),
      roomOpen: makeZone({ id: 'roomOpen', isBuilding: true, isDark: false, connections: [
        { toZoneId: 'street', hasDoor: true, doorOpen: true },
      ] }),
    };
    const state = makeState(zones, 'street');

    const failingInputs: ActionRequest[] = [
      { playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: {} }, // missing target
      { playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: { targetZoneId: 'nope' } }, // unknown
      { playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: { targetZoneId: 'roomB' } }, // no door
      { playerId: 'p1', survivorId: 's1', type: ActionType.OPEN_DOOR, payload: { targetZoneId: 'roomOpen' } }, // already open
    ];

    assertValidationIsPure(handleOpenDoor, state, failingInputs);
  });
});
