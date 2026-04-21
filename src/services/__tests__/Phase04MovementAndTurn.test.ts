import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { handleSprint } from '../handlers/MovementHandlers';
import { EventCollector } from '../EventCollector';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
  inventory?: EquipmentCard[];
  skills?: string[];
  actionsRemaining?: number;
  actionsPerTurn?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: opts.id,
    characterClass: 'Tester',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: opts.actionsPerTurn ?? 3,
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

function makeZone(id: string, connections: Zone['connections'] = [], overrides: Partial<Zone> = {}): Zone {
  return {
    id,
    connections,
    isBuilding: false,
    hasNoise: false,
    noiseTokens: 0,
    searchable: false,
    isDark: false,
    hasBeenSpawned: false,
    ...overrides,
  };
}

function makeWalker(id: string, zoneId: string): Zombie {
  return {
    id,
    type: ZombieType.Walker,
    position: { x: 0, y: 0, zoneId },
    wounds: 0,
    activated: false,
  };
}

function makeBat(id: string): EquipmentCard {
  return {
    id, name: 'Baseball Bat',
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 2, accuracy: 4, damage: 1, noise: false, dualWield: false },
    inHand: false, slot: 'BACKPACK_0',
  };
}

function makeState(opts: {
  survivors: Survivor[];
  zones: Record<string, Zone>;
  zombies?: Record<string, Zombie>;
  equipmentDeck?: EquipmentCard[];
  equipmentDiscard?: EquipmentCard[];
  seed?: string;
}): GameState {
  const survivorsMap: Record<string, Survivor> = {};
  for (const s of opts.survivors) survivorsMap[s.id] = s;
  const playerIds = Array.from(new Set(opts.survivors.map(s => s.playerId)));
  return {
    id: 'test',
    seed: seedFromString(opts.seed ?? 'phase04'),
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: playerIds,
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: survivorsMap,
    zombies: opts.zombies ?? {},
    zones: opts.zones,
    objectives: [],
    equipmentDeck: opts.equipmentDeck ?? [],
    equipmentDiscard: opts.equipmentDiscard ?? [],
    spawnDeck: [],
    spawnDiscard: [],
    noiseTokens: 0,
    nextZombieId: 99,
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

// ===========================================================================
// M1 — Sprint: zombie stop is legal at ANY point in the path, including the
// first step. Survivor ends in the zombie zone; sprint is consumed; no throw.
// ===========================================================================
describe('M1 — Sprint partial completion stopped by zombies is legal', () => {
  it('zombies in step-1 zone → survivor ends in that zone, sprint consumed', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['sprint'],
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [
        { toZoneId: 'z1', hasDoor: false, doorOpen: false },
        { toZoneId: 'z3', hasDoor: false, doorOpen: false },
      ]),
      z3: makeZone('z3', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
    };
    const zombies = { w1: makeWalker('w1', 'z2') };
    const state = makeState({ survivors: [survivor], zones, zombies });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT,
      payload: { path: ['z2', 'z3'] },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('z2');
    expect(res.newState!.survivors.s1.sprintUsedThisTurn).toBe(true);
    // 3 AP - 1 (SPRINT) = 2 AP remaining.
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(2);
  });

  it('no zombies on path → full 3-zone sprint still works', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['sprint'],
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [
        { toZoneId: 'z1', hasDoor: false, doorOpen: false },
        { toZoneId: 'z3', hasDoor: false, doorOpen: false },
      ]),
      z3: makeZone('z3', [
        { toZoneId: 'z2', hasDoor: false, doorOpen: false },
        { toZoneId: 'z4', hasDoor: false, doorOpen: false },
      ]),
      z4: makeZone('z4', [{ toZoneId: 'z3', hasDoor: false, doorOpen: false }]),
    };
    const state = makeState({ survivors: [survivor], zones });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT,
      payload: { path: ['z2', 'z3', 'z4'] },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('z4');
  });

  it('pre-fix: the old "less than 2 zones" throw is gone — handler no longer rejects the 1-zone stop', () => {
    // Direct handler call to bypass AP accounting and inspect the bare
    // control-flow: the old code threw "Sprint requires moving at least 2
    // zones" when the first step zone had zombies. The new code sets
    // stoppedByZombies and falls through to mutations.
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['sprint'],
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [
        { toZoneId: 'z1', hasDoor: false, doorOpen: false },
        { toZoneId: 'z3', hasDoor: false, doorOpen: false },
      ]),
      z3: makeZone('z3', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
    };
    const zombies = { w1: makeWalker('w1', 'z2') };
    const state = makeState({ survivors: [survivor], zones, zombies });

    const collector = new EventCollector();
    expect(() => handleSprint(
      state,
      { playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT, payload: { path: ['z2', 'z3'] } },
      collector,
    )).not.toThrow();
    expect(state.survivors.s1.position.zoneId).toBe('z2');
  });
});

// ===========================================================================
// M2 — Reorganize/Organize AP accounting.
// Free iff survivor has drawnCard OR is a participant in an active Trade.
// Standalone Reorganize costs 1 AP; rejected at 0 AP.
// ===========================================================================
describe('M2 — Reorganize AP accounting', () => {
  it('ORGANIZE during Search pickup (drawnCard set) costs 0 AP', () => {
    const bat = makeBat('bat-a');
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [bat],
    });
    survivor.drawnCard = {
      id: 'drawn-1', name: 'Crowbar',
      type: EquipmentType.Weapon, inHand: false, slot: 'BACKPACK_0',
      stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
    };
    const state = makeState({ survivors: [survivor], zones: { z1: makeZone('z1') } });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE,
      payload: { cardId: 'bat-a', targetSlot: 'HAND_1' },
    });
    expect(res.success).toBe(true);
    // Still 3 AP — drawnCard made the Reorganize free.
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(3);
  });

  it('ORGANIZE during an active Trade (participant) costs 0 AP', () => {
    const bat = makeBat('bat-a');
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [bat] });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1' });
    const state = makeState({ survivors: [s1, s2], zones: { z1: makeZone('z1') } });
    state.activeTrade = {
      activeSurvivorId: 's1',
      targetSurvivorId: 's2',
      offers: { s1: [], s2: [] },
      receiveLayouts: { s1: {}, s2: {} },
      status: { s1: false, s2: false },
    };
    const apBefore = state.survivors.s1.actionsRemaining;

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE,
      payload: { cardId: 'bat-a', targetSlot: 'HAND_1' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(apBefore);
  });

  it('standalone ORGANIZE (no drawnCard, no active Trade) costs exactly 1 AP', () => {
    const bat = makeBat('bat-a');
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [bat],
    });
    const state = makeState({ survivors: [survivor], zones: { z1: makeZone('z1') } });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE,
      payload: { cardId: 'bat-a', targetSlot: 'HAND_1' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(2);
  });

  it('standalone ORGANIZE rejected at 0 AP remaining', () => {
    const bat = makeBat('bat-a');
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [bat],
      actionsRemaining: 0,
    });
    const state = makeState({ survivors: [survivor], zones: { z1: makeZone('z1') } });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE,
      payload: { cardId: 'bat-a', targetSlot: 'HAND_1' },
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('NO_ACTIONS');
  });

  it('ORGANIZE DISCARD of drawnCard stays free (drawnCard snapshot captured pre-mutation)', () => {
    // Regression: earlier code checked `state.survivors.drawnCard` AFTER the
    // handler ran. Discarding the drawnCard cleared it, so the "free
    // Reorganize during Pickup" exception missed and 1 AP was deducted
    // wrongly. Snapshot the free-path predicate before mutation.
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    survivor.drawnCard = {
      id: 'drawn-1', name: 'Aaahh!!',
      type: EquipmentType.Item, inHand: false, slot: 'BACKPACK_0',
    };
    const state = makeState({ survivors: [survivor], zones: { z1: makeZone('z1') } });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE,
      payload: { cardId: 'drawn-1', targetSlot: 'DISCARD' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(3);
    expect(res.newState!.survivors.s1.drawnCard).toBeUndefined();
  });
});

// ===========================================================================
// M3 — Trade spends 1 AP up front at TRADE_START; Accept / Cancel are free
// sub-actions that do not re-deduct AP or refund.
// ===========================================================================
describe('M3 — Trade Start charges 1 AP up front; Cancel/Accept do not re-deduct', () => {
  function twoSurvivorsInZone(): GameState {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1' });
    return makeState({ survivors: [s1, s2], zones: { z1: makeZone('z1') } });
  }

  it('TRADE_START deducts exactly 1 AP from the initiator; partner unaffected', () => {
    const state = twoSurvivorsInZone();

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START,
      payload: { targetSurvivorId: 's2' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.activeTrade).toBeDefined();
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(2);
    expect(res.newState!.survivors.s2.actionsRemaining).toBe(3);
  });

  it('TRADE_START → TRADE_CANCEL: total AP spent stays at 1 (no refund, no extra deduct)', () => {
    const state = twoSurvivorsInZone();

    const startRes = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START,
      payload: { targetSurvivorId: 's2' },
    });
    expect(startRes.success).toBe(true);
    expect(startRes.newState!.survivors.s1.actionsRemaining).toBe(2);

    const cancelRes = processAction(startRes.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_CANCEL,
    });
    expect(cancelRes.success).toBe(true);
    expect(cancelRes.newState!.activeTrade).toBeUndefined();
    // Exactly 1 AP spent across start+cancel.
    expect(cancelRes.newState!.survivors.s1.actionsRemaining).toBe(2);
  });

  it('TRADE_START → both accept (executeTrade): total AP spent stays at 1; partner unaffected', () => {
    const state = twoSurvivorsInZone();

    const startRes = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START,
      payload: { targetSurvivorId: 's2' },
    });
    expect(startRes.success).toBe(true);

    const acceptA = processAction(startRes.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_ACCEPT,
    });
    expect(acceptA.success).toBe(true);
    const acceptB = processAction(acceptA.newState!, {
      playerId: 'p2', survivorId: 's2', type: ActionType.TRADE_ACCEPT,
    });
    expect(acceptB.success).toBe(true);
    expect(acceptB.newState!.activeTrade).toBeUndefined();
    // Exactly 1 AP on initiator; partner untouched.
    expect(acceptB.newState!.survivors.s1.actionsRemaining).toBe(2);
    expect(acceptB.newState!.survivors.s2.actionsRemaining).toBe(3);
  });

  it('TRADE_START rejected at 0 AP (validator NO_ACTIONS)', () => {
    const s1 = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', actionsRemaining: 0 });
    const s2 = makeSurvivor({ id: 's2', playerId: 'p2', zoneId: 'z1' });
    const state = makeState({ survivors: [s1, s2], zones: { z1: makeZone('z1') } });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START,
      payload: { targetSurvivorId: 's2' },
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('NO_ACTIONS');
  });
});

// ===========================================================================
// m10 — Validator rejects a second SEARCH on the same turn regardless of the
// free-search pool. Aligns with the handler's "Already searched" gate.
// ===========================================================================
describe('m10 — Search 1/turn is enforced by the validator even with freeSearchesRemaining', () => {
  it('second SEARCH rejected by validator when hasSearched && freeSearchesRemaining > 0', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
    });
    survivor.hasSearched = true;
    survivor.freeSearchesRemaining = 1;
    const zones = { z1: makeZone('z1', [], { searchable: true }) };
    // Stock the deck so the handler has something to draw — but we expect the
    // validator to reject before the handler ever runs.
    const state = makeState({
      survivors: [survivor], zones,
      equipmentDeck: [{
        id: 'c-1', name: 'Crowbar', type: EquipmentType.Weapon,
        inHand: false, slot: 'BACKPACK_0',
        stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
      }],
    });
    const seedBefore = JSON.stringify(state.seed);

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH, payload: {},
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('ALREADY_SEARCHED');
    // Validator short-circuit — handler did not run, so the deck and seed are
    // untouched and freeSearchesRemaining was not consumed.
    expect(state.equipmentDeck.length).toBe(1);
    expect(JSON.stringify(state.seed)).toBe(seedBefore);
    expect(state.survivors.s1.freeSearchesRemaining).toBe(1);
  });

  it('can_search_more_than_once skill bypasses the per-turn limit', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      skills: ['can_search_more_than_once'],
    });
    survivor.hasSearched = true;
    const zones = { z1: makeZone('z1', [], { searchable: true }) };
    const state = makeState({
      survivors: [survivor], zones,
      equipmentDeck: [{
        id: 'c-1', name: 'Crowbar', type: EquipmentType.Weapon,
        inHand: false, slot: 'BACKPACK_0',
        stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
      }],
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH, payload: {},
    });
    expect(res.success).toBe(true);
  });
});

// ===========================================================================
// m11 — Born Leader grants a free Action to the target: target.actionsRemaining
// += 1. Donor pays nothing (Born Leader is itself a free skill Action, gated
// once-per-turn). AP == action slot in this engine, so `+= 1` is the free
// Action.
// ===========================================================================
describe('m11 — Born Leader transfers a free Action to the target (target += 1, donor unchanged)', () => {
  it('donor uses Born Leader → target actionsRemaining += 1, donor bornLeaderUsedThisTurn', () => {
    const donor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      skills: ['born_leader'],
    });
    const target = makeSurvivor({ id: 's2', playerId: 'p1', zoneId: 'z1' });
    target.actionsRemaining = 2; // arbitrary starting AP
    const state = makeState({ survivors: [donor, target], zones: { z1: makeZone('z1') } });

    const donorAPBefore = state.survivors.s1.actionsRemaining;
    const targetAPBefore = state.survivors.s2.actionsRemaining;

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.BORN_LEADER,
      payload: { targetSurvivorId: 's2' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s2.actionsRemaining).toBe(targetAPBefore + 1);
    // Born Leader is a free skill Action — donor's AP pool is unchanged.
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(donorAPBefore);
    expect(res.newState!.survivors.s1.bornLeaderUsedThisTurn).toBe(true);
  });

  it('Born Leader is once-per-Turn: second invocation rejected', () => {
    const donor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      skills: ['born_leader'],
    });
    const target = makeSurvivor({ id: 's2', playerId: 'p1', zoneId: 'z1' });
    const state = makeState({ survivors: [donor, target], zones: { z1: makeZone('z1') } });

    const first = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.BORN_LEADER,
      payload: { targetSurvivorId: 's2' },
    });
    expect(first.success).toBe(true);

    const second = processAction(first.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.BORN_LEADER,
      payload: { targetSurvivorId: 's2' },
    });
    expect(second.success).toBe(false);
    expect(second.error?.message).toMatch(/already used/i);
  });
});
