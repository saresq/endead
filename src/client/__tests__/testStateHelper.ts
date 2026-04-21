// Shared state fixture for optimistic-client tests. Builds a minimal game
// state with connected zones, one survivor, and a simple inventory — enough
// to exercise MOVE / RELOAD / ORGANIZE / END_TURN / CHOOSE_SKILL predictors
// without dragging in the map compiler.

import {
  GameState,
  DangerLevel,
  GamePhase,
  ZombieType,
  EquipmentType,
  Zone,
  Survivor,
  EquipmentCard,
} from '../../types/GameState';

export function makeZone(id: string, neighborIds: string[] = [], opts: { isBuilding?: boolean; hasDoor?: boolean } = {}): Zone {
  return {
    id,
    connections: neighborIds.map((to) => ({
      toZoneId: to,
      hasDoor: !!opts.hasDoor,
      doorOpen: !opts.hasDoor,
    })),
    isBuilding: !!opts.isBuilding,
    hasNoise: false,
    noiseTokens: 0,
    searchable: false,
    isDark: false,
    hasBeenSpawned: false,
  } as Zone;
}

export function makeSurvivor(overrides: Partial<Survivor> = {}): Survivor {
  return {
    id: 's1',
    playerId: 'p1',
    name: 'Wanda',
    characterClass: 'Wanda',
    actionsPerTurn: 3,
    maxHealth: 2,
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
    toughUsedZombieAttack: false,
    toughUsedFriendlyFire: false,
    freeMeleeRemaining: 0,
    freeRangedRemaining: 0,
    sprintUsedThisTurn: false,
    chargeUsedThisTurn: false,
    bornLeaderUsedThisTurn: false,
    position: { x: 0, y: 0, zoneId: 'z1' },
    ...overrides,
  } as Survivor;
}

export function makePistol(id = 'pistol-1'): EquipmentCard {
  return {
    id,
    name: 'Pistol',
    type: EquipmentType.Weapon,
    inHand: true,
    slot: 'HAND_1',
    keywords: ['reload'],
    reloaded: false,
    stats: {
      range: [0, 1],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: true,
      dualWield: false,
    },
  };
}

export function makeBaseballBat(id = 'bat-1'): EquipmentCard {
  return {
    id,
    name: 'Baseball Bat',
    type: EquipmentType.Weapon,
    inHand: false,
    slot: 'BACKPACK_0',
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: false,
      dualWield: false,
    },
  };
}

export function makeMinimalState(overrides: Partial<GameState> = {}): GameState {
  const survivor = makeSurvivor();
  return {
    id: 'r',
    seed: [1, 2, 3, 4],
    version: 0,
    turn: 0,
    phase: GamePhase.Players,
    currentDangerLevel: DangerLevel.Blue,
    lobby: { players: [] },
    spectators: [],
    players: ['p1'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: { s1: survivor },
    zombies: {},
    zones: {
      z1: makeZone('z1', ['z2']),
      z2: makeZone('z2', ['z1', 'z3']),
      z3: makeZone('z3', ['z2']),
    },
    objectives: [],
    equipmentDeck: [],
    equipmentDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    noiseTokens: 0,
    config: {
      maxSurvivors: 6,
      abominationFest: false,
      zombiePool: {
        [ZombieType.Walker]: 40,
        [ZombieType.Runner]: 16,
        [ZombieType.Brute]: 16,
        [ZombieType.Abomination]: 4,
      },
    },
    nextZombieId: 1,
    ...overrides,
  } as GameState;
}
