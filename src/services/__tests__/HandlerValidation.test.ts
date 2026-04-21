// src/services/__tests__/HandlerValidation.test.ts
//
// Cross-handler coverage of the §3.10 validate-first contract via the
// `assertValidationIsPure` helper. One scenario per handler file (work item G).
// CombatHandlers + DoorHandlers have richer dedicated D18/D19 cases in their
// own test files — this file fills the long tail.

import { describe, it } from 'vitest';
import { assertValidationIsPure } from './assertValidationIsPure';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

import { handleMove, handleSprint } from '../handlers/MovementHandlers';
import { handleSearch, handleResolveSearch, handleUseItem, handleOrganize } from '../handlers/ItemHandlers';
import { handleCharge, handleBornLeader, handleChooseSkill } from '../handlers/SkillHandlers';
import { handleTradeStart, handleTradeOffer, handleTradeAccept } from '../handlers/TradeHandlers';
import { handleTakeObjective } from '../handlers/ObjectiveHandlers';

function makeZone(id: string, overrides: Partial<Zone> = {}): Zone {
  return {
    id,
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

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
  inventory?: EquipmentCard[];
  skills?: string[];
  actionsRemaining?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: opts.id,
    characterClass: 'Tester',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: 3,
    wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: opts.skills ?? [],
    inventory: opts.inventory ?? [],
    actionsRemaining: opts.actionsRemaining ?? 3,
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

function baseState(survivors: Survivor[], zones: Record<string, Zone>, zombies: Record<string, Zombie> = {}): GameState {
  const survivorsMap: Record<string, Survivor> = {};
  for (const s of survivors) survivorsMap[s.id] = s;
  return {
    id: 'test',
    seed: seedFromString('handler-validation'),
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: survivors.map(s => s.playerId),
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: survivorsMap,
    zombies,
    zones,
    objectives: [],
    equipmentDeck: [],
    equipmentDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    noiseTokens: 0,
    nextZombieId: 1,
    config: {
      maxSurvivors: 6,
      zombiePool: {
        [ZombieType.Walker]: 35,
        [ZombieType.Runner]: 12,
        [ZombieType.Brute]: 8,
        [ZombieType.Abomination]: 1,
      },
    },
  } as GameState;
}

describe('MovementHandlers — validate-first', () => {
  it('handleMove rejects bad targets purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const zones = { z1: makeZone('z1'), z2: makeZone('z2') };
    // No connection between z1 and z2 — getConnection fails.
    const state = baseState([survivor], zones);

    assertValidationIsPure(handleMove, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: {} }, // missing target
      { playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'z2' } }, // not connected
      { playerId: 'p1', survivorId: 's1', type: ActionType.MOVE, payload: { targetZoneId: 'unknown' } }, // bad zone
    ]);
  });

  it('handleSprint rejects without skill / bad path purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' }); // no `sprint` skill
    const state = baseState([survivor], { z1: makeZone('z1') });

    assertValidationIsPure(handleSprint, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['z1', 'z2'] } }, // no skill
      // Even with skill the path-length-1 case throws before mutation:
    ]);

    survivor.skills = ['sprint'];
    assertValidationIsPure(handleSprint, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['z2'] } }, // path too short
      { playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: {} },               // missing path
    ]);
  });
});

describe('ItemHandlers — validate-first', () => {
  it('handleSearch rejects empty deck BEFORE drawing (D19) — seed unchanged', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const zones = { z1: makeZone('z1', { searchable: true }) };
    const state = baseState([survivor], zones);
    state.equipmentDeck = [];
    state.equipmentDiscard = [];

    assertValidationIsPure(handleSearch, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH, payload: {} },
    ]);
  });

  it('handleSearch rejects non-searchable zone / already searched / zombie zone purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const zones = { z1: makeZone('z1') }; // not searchable
    const state = baseState([survivor], zones);

    assertValidationIsPure(handleSearch, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH, payload: {} },
    ]);

    // Now make searchable but already searched.
    zones.z1.searchable = true;
    survivor.hasSearched = true;
    const state2 = baseState([survivor], zones);
    assertValidationIsPure(handleSearch, state2, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH, payload: {} },
    ]);
  });

  it('handleResolveSearch rejects without drawn card / bad action purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([survivor], { z1: makeZone('z1') });

    // No drawn card → throws.
    assertValidationIsPure(handleResolveSearch, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH, payload: { action: 'DISCARD' } },
    ]);

    survivor.drawnCard = {
      id: 'c1', name: 'Crowbar',
      type: EquipmentType.Weapon, inHand: false,
      stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
    };
    const state2 = baseState([survivor], { z1: makeZone('z1') });
    assertValidationIsPure(handleResolveSearch, state2, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH, payload: { action: 'BAD' } as never },
      { playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH, payload: { action: 'EQUIP' } }, // missing slot
      { playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH, payload: { action: 'KEEP' } },  // missing discardCardId
    ]);
  });

  it('handleUseItem rejects bad item / wrong type purely', () => {
    const food: EquipmentCard = {
      id: 'food-1', name: 'Canned Food', type: EquipmentType.Item,
      inHand: false, slot: 'BACKPACK',
    };
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [food] });
    survivor.wounds = 0; // No wounds → useItem throws "no wounds to heal"
    const state = baseState([survivor], { z1: makeZone('z1') });

    assertValidationIsPure(handleUseItem, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.USE_ITEM, payload: {} }, // missing itemId
      { playerId: 'p1', survivorId: 's1', type: ActionType.USE_ITEM, payload: { itemId: 'nope' } }, // not in inv
      { playerId: 'p1', survivorId: 's1', type: ActionType.USE_ITEM, payload: { itemId: 'food-1' } }, // no wounds
    ]);
  });

  it('handleOrganize rejects missing args / unknown card purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([survivor], { z1: makeZone('z1') });

    assertValidationIsPure(handleOrganize, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE, payload: {} },
      { playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE, payload: { cardId: 'x' } },
      { playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE, payload: { cardId: 'nope', targetSlot: 'HAND_1' } },
    ]);
  });
});

describe('SkillHandlers — validate-first', () => {
  it('handleChooseSkill rejects without skillId / unavailable skill purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([survivor], { z1: makeZone('z1') });
    assertValidationIsPure(handleChooseSkill, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.CHOOSE_SKILL, payload: {} },
      { playerId: 'p1', survivorId: 's1', type: ActionType.CHOOSE_SKILL, payload: { skillId: 'nonexistent_skill' } },
    ]);
  });

  it('handleCharge rejects without skill / bad path purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([survivor], { z1: makeZone('z1') });
    assertValidationIsPure(handleCharge, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.CHARGE, payload: { path: ['z2'] } },
      { playerId: 'p1', survivorId: 's1', type: ActionType.CHARGE, payload: {} },
    ]);
  });

  it('handleBornLeader rejects without skill / no target purely', () => {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([survivor], { z1: makeZone('z1') });
    assertValidationIsPure(handleBornLeader, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.BORN_LEADER, payload: {} },
    ]);
  });

});

describe('TradeHandlers — validate-first', () => {
  it('handleTradeStart rejects without target / when trade exists purely', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z2' }); // different zone
    const state = baseState([s1, s2], { z1: makeZone('z1'), z2: makeZone('z2') });

    assertValidationIsPure(handleTradeStart, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START, payload: {} },                         // no target
      { playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START, payload: { targetSurvivorId: 'nope' } }, // bad target
      { playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START, payload: { targetSurvivorId: 's2' } }, // different zone
    ]);
  });

  it('handleTradeOffer rejects without active trade / non-participant purely', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([s1], { z1: makeZone('z1') });
    assertValidationIsPure(handleTradeOffer, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_OFFER, payload: { offerCardIds: [] } },
    ]);
  });

  it('handleTradeAccept rejects without active trade purely', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const state = baseState([s1], { z1: makeZone('z1') });
    assertValidationIsPure(handleTradeAccept, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_ACCEPT, payload: {} },
    ]);
  });
});

describe('ObjectiveHandlers — validate-first', () => {
  it('handleTakeObjective rejects when zone has no objective purely', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const zones = { z1: makeZone('z1') }; // no hasObjective
    const state = baseState([s1], zones);
    assertValidationIsPure(handleTakeObjective, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_OBJECTIVE, payload: {} },
    ]);
  });

  it('handleTakeObjective rejects when zone has no matching TakeObjective — purely', () => {
    // Epic Crate zone with `hasObjective: true` but no entry in state.objectives
    // for that zoneId. Must throw BEFORE any mutation (no walker spawn, no
    // discard, no zone.hasObjective flip).
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const zones = {
      z1: makeZone('z1', { hasObjective: true, isEpicCrate: true }),
    };
    const state = baseState([s1], zones);
    assertValidationIsPure(handleTakeObjective, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_OBJECTIVE, payload: {} },
    ]);
  });
});
