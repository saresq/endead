// Shared fixtures for Phase B win-condition / spawn-dormancy specs.
// Inlined helpers were getting copy-pasted across nine new test files; one
// shared module keeps the surface narrow and the tests readable.

import {
  GameState,
  GamePhase,
  DangerLevel,
  Survivor,
  Zone,
  ZombieType,
  ObjectiveColor,
  Objective,
  ObjectiveType,
  EquipmentCard,
  EquipmentType,
} from '../../types/GameState';
import { seedFromString } from '../Rng';

export function makeZone(overrides: Partial<Zone> & { id: string }): Zone {
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

export interface SurvivorOverrides {
  id?: string;
  playerId?: string;
  zoneId?: string;
  inventory?: EquipmentCard[];
  drawnCard?: EquipmentCard;
  experience?: number;
  dangerLevel?: DangerLevel;
  wounds?: number;
  maxHealth?: number;
  actionsRemaining?: number;
}

export function makeSurvivor(over: SurvivorOverrides = {}): Survivor {
  const id = over.id ?? 's1';
  const playerId = over.playerId ?? 'p1';
  return {
    id,
    playerId,
    name: id,
    characterClass: 'Wanda',
    position: { x: 0, y: 0, zoneId: over.zoneId ?? 'z1' },
    actionsPerTurn: 3,
    maxHealth: over.maxHealth ?? 3,
    wounds: over.wounds ?? 0,
    experience: over.experience ?? 0,
    dangerLevel: over.dangerLevel ?? DangerLevel.Blue,
    skills: [],
    inventory: over.inventory ?? [],
    actionsRemaining: over.actionsRemaining ?? 3,
    hasMoved: false,
    hasSearched: false,
    drawnCard: over.drawnCard,
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
    bloodlustUsedThisTurn: false,
    lifesaverUsedThisTurn: false,
    hitAndRunFreeMove: false,
    luckyUsedThisTurn: false,
  } as Survivor;
}

export interface StateOverrides {
  zones?: Record<string, Zone>;
  survivors?: Record<string, Survivor>;
  objectives?: Objective[];
  turn?: number;
  phase?: GamePhase;
  spawnZoneIds?: string[];
  epicDeck?: EquipmentCard[];
  epicDiscard?: EquipmentCard[];
  spawnColorActivation?: GameState['spawnColorActivation'];
  zombies?: GameState['zombies'];
  currentDangerLevel?: DangerLevel;
  seedString?: string;
}

export function makeState(over: StateOverrides = {}): GameState {
  const survivor = makeSurvivor();
  const survivors = over.survivors ?? { [survivor.id]: survivor };
  const players = Object.values(survivors).map(s => s.playerId);
  return {
    id: 'test',
    seed: seedFromString(over.seedString ?? 'win-conditions-test'),
    turn: over.turn ?? 1,
    phase: over.phase ?? GamePhase.Players,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: over.currentDangerLevel ?? DangerLevel.Blue,
    players,
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors,
    zombies: over.zombies ?? {},
    nextZombieId: 1,
    zones: over.zones ?? { z1: makeZone({ id: 'z1' }) },
    objectives: over.objectives ?? [],
    spawnColorActivation: over.spawnColorActivation ?? {
      [ObjectiveColor.Blue]: { activated: false, activatedOnTurn: 0 },
      [ObjectiveColor.Green]: { activated: false, activatedOnTurn: 0 },
    },
    equipmentDeck: [],
    equipmentDiscard: [],
    epicDeck: over.epicDeck ?? [],
    epicDiscard: over.epicDiscard ?? [],
    spawnDeck: [],
    spawnDiscard: [],
    spawnZoneIds: over.spawnZoneIds,
    noiseTokens: 0,
    config: {
      maxSurvivors: 6,
      friendlyFire: false,
      zombiePool: {
        [ZombieType.Walker]: 40,
        [ZombieType.Runner]: 16,
        [ZombieType.Brute]: 16,
        [ZombieType.Abomination]: 4,
      },
    },
    history: [],
  } as unknown as GameState;
}

let cardCounter = 0;
export function makeCard(over: Partial<EquipmentCard> & { equipmentId: string }): EquipmentCard {
  cardCounter += 1;
  return {
    id: `${over.equipmentId}-${cardCounter}`,
    name: over.equipmentId,
    type: EquipmentType.Item,
    inHand: false,
    slot: 'BACKPACK',
    ...over,
  };
}

export function takeObjectiveObj(opts: {
  id?: string;
  color: ObjectiveColor.Blue | ObjectiveColor.Green;
  amountRequired?: number;
  amountCurrent?: number;
}): Objective {
  return {
    id: opts.id ?? `obj-color-${opts.color.toLowerCase()}`,
    type: ObjectiveType.TakeColorObjective,
    description: `take ${opts.color}`,
    objectiveColor: opts.color,
    amountRequired: opts.amountRequired ?? 1,
    amountCurrent: opts.amountCurrent ?? 0,
    completed: false,
  };
}

export function reachExitObj(zoneId: string, id = 'obj-reach-exit'): Objective {
  return {
    id,
    type: ObjectiveType.ReachExit,
    description: 'reach exit',
    exitZoneId: zoneId,
    completed: false,
  };
}

export function takeYellowObj(amountRequired = 1): Objective {
  return {
    id: 'obj-yellow',
    type: ObjectiveType.TakeObjective,
    description: 'take yellow',
    amountRequired,
    amountCurrent: 0,
    completed: false,
  };
}

export function takeEpicObj(amountRequired = 1): Objective {
  return {
    id: 'obj-epic',
    type: ObjectiveType.TakeEpicCrate,
    description: 'take epic',
    amountRequired,
    amountCurrent: 0,
    completed: false,
  };
}

export function collectItemsObj(reqs: { equipmentId: string; quantity: number }[]): Objective {
  return {
    id: 'obj-collect',
    type: ObjectiveType.CollectItems,
    description: 'collect',
    itemRequirements: reqs,
    completed: false,
  };
}

export function reachDangerObj(threshold: DangerLevel): Objective {
  return {
    id: 'obj-danger',
    type: ObjectiveType.ReachDangerLevel,
    description: `reach ${threshold}`,
    dangerThreshold: threshold,
    completed: false,
  };
}
