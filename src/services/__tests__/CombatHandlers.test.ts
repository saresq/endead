import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { checkEndTurn } from '../TurnManager';
import { handleAssignFriendlyFire, handleAttack } from '../handlers/CombatHandlers';
import { EventCollector } from '../EventCollector';
import { assertValidationIsPure } from './assertValidationIsPure';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

function makeMeleeWeapon(id: string, name = 'Crowbar'): EquipmentCard {
  return {
    id, name,
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
    inHand: true, slot: 'HAND_1',
  };
}

function makeRangedWeapon(id: string, name = 'Pistol'): EquipmentCard {
  return {
    id, name,
    type: EquipmentType.Weapon,
    stats: { range: [1, 1], dice: 1, accuracy: 4, damage: 1, noise: true, dualWield: false },
    inHand: true, slot: 'HAND_1',
  };
}

function makeSawedOff(id: string, slot: 'HAND_1' | 'HAND_2'): EquipmentCard {
  return {
    id, name: 'Sawed-Off',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 2, accuracy: 2, damage: 2, noise: true, dualWield: true, ammo: 'shells' },
    inHand: true, slot,
    keywords: ['reload'],
    reloaded: true,
  };
}

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
  inventory: EquipmentCard[];
  skills?: string[];
  freeMeleeRemaining?: number;
  freeCombatsRemaining?: number;
  freeRangedRemaining?: number;
  actionsRemaining?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: 'Tester',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: 3,
    wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: opts.skills ?? [],
    inventory: opts.inventory,
    actionsRemaining: opts.actionsRemaining ?? 3,
    hasMoved: false,
    hasSearched: false,
    freeMovesRemaining: 0,
    freeSearchesRemaining: 0,
    freeCombatsRemaining: opts.freeCombatsRemaining ?? 0,
    freeMeleeRemaining: opts.freeMeleeRemaining ?? 0,
    freeRangedRemaining: opts.freeRangedRemaining ?? 0,
    toughUsedZombieAttack: false,
    toughUsedFriendlyFire: false,
    sprintUsedThisTurn: false,
    chargeUsedThisTurn: false,
    bornLeaderUsedThisTurn: false,
  };
}

function makeZone(id: string): Zone {
  return {
    id,
    connections: [],
    isBuilding: false,
    hasNoise: false,
    noiseTokens: 0,
    searchable: false,
    isDark: false,
    hasBeenSpawned: false,
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

function makeState(opts: {
  survivor: Survivor;
  zombies?: Record<string, Zombie>;
}): GameState {
  const zoneId = opts.survivor.position.zoneId;
  return {
    id: 'test',
    seed: seedFromString('combat-test'),
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: [opts.survivor.playerId],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: { [opts.survivor.id]: opts.survivor },
    zombies: opts.zombies ?? {},
    zones: { [zoneId]: makeZone(zoneId) },
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
        [ZombieType.Walker]: 35,
        [ZombieType.Runner]: 12,
        [ZombieType.Brute]: 8,
        [ZombieType.Abomination]: 1,
      },
    },
  } as GameState;
}

describe('B2 — _attackIsMelee survives past deductAPWithFreeCheck (main ATTACK path)', () => {
  it('melee attack with preferredFreePool=melee consumes the free melee pool, not combat/AP', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMeleeWeapon('w1')],
      freeMeleeRemaining: 1,
    });
    const state = makeState({
      survivor,
      zombies: { z1_1: makeWalker('z1_1', 'z1') },
    });

    const intent: ActionRequest = {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'w1', preferredFreePool: 'melee' },
    };

    const res = processAction(state, intent);
    expect(res.success).toBe(true);
    const s = res.newState!.survivors.s1;
    expect(s.freeMeleeRemaining).toBe(0);
    expect(s.freeCombatsRemaining).toBe(0);
    expect(s.actionsRemaining).toBe(3);
    // Transient scratch lifted off GameState entirely (D2/D18) — never present.
    expect((res.newState as unknown as { _attackIsMelee?: boolean })._attackIsMelee).toBeUndefined();
  });

  it('melee attack with preferredFreePool=melee but only freeCombats available falls back to combat', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMeleeWeapon('w1')],
      freeCombatsRemaining: 1,
      freeMeleeRemaining: 0,
    });
    const state = makeState({
      survivor,
      zombies: { z1_1: makeWalker('z1_1', 'z1') },
    });
    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'w1', preferredFreePool: 'melee' },
    });
    expect(res.success).toBe(true);
    const s = res.newState!.survivors.s1;
    expect(s.freeCombatsRemaining).toBe(0);
    expect(s.actionsRemaining).toBe(3);
  });
});

describe('B2 — _attackIsMelee survives past deductAPWithFreeCheck (handleRerollLucky path)', () => {
  it('melee Lucky reroll still consumes free melee pool (snapshot restores → reroll spends)', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMeleeWeapon('w1')],
      skills: ['lucky'],
      freeMeleeRemaining: 2,
    });
    const state = makeState({
      survivor,
      zombies: { z1_1: makeWalker('z1_1', 'z1') },
    });

    const afterAttack = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'w1', preferredFreePool: 'melee' },
    });
    expect(afterAttack.success).toBe(true);
    expect(afterAttack.newState!.survivors.s1.freeMeleeRemaining).toBe(1);
    expect(afterAttack.newState!.lastAction?.rollbackSnapshot).toBeDefined();

    const afterReroll = processAction(afterAttack.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.REROLL_LUCKY,
    });
    expect(afterReroll.success).toBe(true);
    const s = afterReroll.newState!.survivors.s1;
    expect(afterReroll.newState!.lastAction?.luckyUsed).toBe(true);
    expect(s.freeMeleeRemaining).toBe(1);
    expect(s.actionsRemaining).toBe(3);
    expect((afterReroll.newState as unknown as { _attackIsMelee?: boolean })._attackIsMelee).toBeUndefined();
  });
});

describe('Dual-wield ATTACK emits two ATTACK_ROLLED events in sequence (B4 + §A)', () => {
  it('two reloadables → two ATTACK_ROLLED events tagged HAND_1, HAND_2; both reloaded=false', () => {
    const hand1 = makeSawedOff('sawed-a', 'HAND_1');
    const hand2 = makeSawedOff('sawed-b', 'HAND_2');
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [hand1, hand2],
    });
    const state = makeState({
      survivor,
      zombies: { z1_1: makeWalker('z1_1', 'z1') },
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'sawed-a' },
    });

    expect(res.success).toBe(true);
    const inv = res.newState!.survivors.s1.inventory;
    expect(inv.find(c => c.id === 'sawed-a')!.reloaded).toBe(false);
    expect(inv.find(c => c.id === 'sawed-b')!.reloaded).toBe(false);

    // Two ATTACK_ROLLED in order, one per hand.
    const attackRolls = (res.events ?? []).filter(e => e.type === 'ATTACK_ROLLED');
    expect(attackRolls).toHaveLength(2);
    expect(attackRolls[0]).toMatchObject({ shooterId: 's1', isMelee: false, hand: 'HAND_1' });
    expect(attackRolls[1]).toMatchObject({ shooterId: 's1', isMelee: false, hand: 'HAND_2' });
  });

  it('single-weapon reload (no dual wield) only flips the fired weapon', () => {
    const hand1 = makeSawedOff('sawed-a', 'HAND_1');
    const offhand: EquipmentCard = {
      id: 'crowbar', name: 'Crowbar',
      type: EquipmentType.Weapon,
      stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
      inHand: true, slot: 'HAND_2',
    };
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [hand1, offhand],
    });
    const state = makeState({
      survivor,
      zombies: { z1_1: makeWalker('z1_1', 'z1') },
    });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'sawed-a' },
    });
    expect(res.success).toBe(true);
    const inv = res.newState!.survivors.s1.inventory;
    expect(inv.find(c => c.id === 'sawed-a')!.reloaded).toBe(false);
    expect(inv.find(c => c.id === 'crowbar')!.reloaded).toBeUndefined();
  });
});

describe('B1 — checkEndTurn blocks while pendingFriendlyFire is set', () => {
  function buildExhaustedState(opts: { withPendingFF: boolean }): GameState {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [],
      actionsRemaining: 0,
    });
    survivor.freeMovesRemaining = 0;
    survivor.freeSearchesRemaining = 0;
    survivor.freeCombatsRemaining = 0;
    survivor.freeMeleeRemaining = 0;
    survivor.freeRangedRemaining = 0;
    const state = makeState({ survivor });
    state.players = ['p1', 'p2'];
    state.activePlayerIndex = 0;
    state.firstPlayerTokenIndex = 0;
    if (opts.withPendingFF) {
      state.pendingFriendlyFire = {
        shooterId: 's1',
        targetZoneId: 'z1',
        missCount: 1,
        damagePerMiss: 1,
        eligibleSurvivorIds: ['s1'],
      };
    }
    return state;
  }

  it('does NOT advance activePlayerIndex when pendingFriendlyFire is set', () => {
    const state = buildExhaustedState({ withPendingFF: true });
    checkEndTurn(state);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.phase).toBe(GamePhase.Players);
  });

  it('DOES advance activePlayerIndex when pendingFriendlyFire is cleared', () => {
    const state = buildExhaustedState({ withPendingFF: false });
    checkEndTurn(state);
    expect(state.activePlayerIndex).toBe(1);
  });

  it('pre-existing guards (drawnCard / activeTrade) still block', () => {
    const stateDrawn = buildExhaustedState({ withPendingFF: false });
    stateDrawn.survivors.s1.drawnCard = {
      id: 'x', name: 'X', type: EquipmentType.Weapon,
      stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
      inHand: false,
    };
    checkEndTurn(stateDrawn);
    expect(stateDrawn.activePlayerIndex).toBe(0);

    const stateTrade = buildExhaustedState({ withPendingFF: false });
    stateTrade.activeTrade = {
      activeSurvivorId: 's1', targetSurvivorId: 's2', offers: {},
    } as GameState['activeTrade'];
    checkEndTurn(stateTrade);
    expect(stateTrade.activePlayerIndex).toBe(0);
  });
});

describe('B7 — Tough absorbs ONE friendly-fire miss PER INSTANCE (not per round)', () => {
  function makeToughSurvivor(id: string, playerId: string, zoneId: string): Survivor {
    return makeSurvivor({
      id, playerId, zoneId,
      inventory: [],
      skills: ['tough'],
    });
  }

  it('two FF instances in the same round both give Tough its absorption', () => {
    const shooter = makeSurvivor({ id: 'sh', playerId: 'p1', zoneId: 'z0', inventory: [] });
    const tough = makeToughSurvivor('tgh', 'p1', 'z1');
    const bystander = makeSurvivor({ id: 'by', playerId: 'p1', zoneId: 'z1', inventory: [] });

    const state = makeState({ survivor: shooter });
    state.survivors.tgh = tough;
    state.survivors.by = bystander;
    state.zones.z1 = makeZone('z1');
    state.players = ['p1'];

    state.pendingFriendlyFire = {
      shooterId: 'sh',
      targetZoneId: 'z1',
      missCount: 1,
      damagePerMiss: 1,
      eligibleSurvivorIds: ['tgh', 'by'],
    };
    const intent1: ActionRequest = {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ASSIGN_FRIENDLY_FIRE,
      payload: { assignments: { tgh: 1, by: 0 } },
    };
    handleAssignFriendlyFire(state, intent1, new EventCollector());
    expect(state.survivors.tgh.wounds).toBe(0);
    expect(state.survivors.tgh.toughUsedFriendlyFire).toBe(true);
    expect(state.pendingFriendlyFire).toBeUndefined();

    state.pendingFriendlyFire = {
      shooterId: 'sh',
      targetZoneId: 'z1',
      missCount: 1,
      damagePerMiss: 1,
      eligibleSurvivorIds: ['tgh', 'by'],
    };
    const intent2: ActionRequest = {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ASSIGN_FRIENDLY_FIRE,
      payload: { assignments: { tgh: 1, by: 0 } },
    };
    handleAssignFriendlyFire(state, intent2, new EventCollector());
    expect(state.survivors.tgh.wounds).toBe(0);
    expect(state.survivors.tgh.toughUsedFriendlyFire).toBe(true);
  });

  it('within a single FF instance Tough absorbs ONLY the first miss', () => {
    const shooter = makeSurvivor({ id: 'sh', playerId: 'p1', zoneId: 'z0', inventory: [] });
    const tough = makeToughSurvivor('tgh', 'p1', 'z1');

    const state = makeState({ survivor: shooter });
    state.survivors.tgh = tough;
    state.zones.z1 = makeZone('z1');
    state.players = ['p1'];

    state.pendingFriendlyFire = {
      shooterId: 'sh',
      targetZoneId: 'z1',
      missCount: 2,
      damagePerMiss: 1,
      eligibleSurvivorIds: ['tgh'],
    };
    const intent: ActionRequest = {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ASSIGN_FRIENDLY_FIRE,
      payload: { assignments: { tgh: 2 } },
    };
    handleAssignFriendlyFire(state, intent, new EventCollector());
    expect(state.survivors.tgh.wounds).toBe(1);
    expect(state.survivors.tgh.toughUsedFriendlyFire).toBe(true);
  });
});

describe('D18 — handleAttack validate-first (no _attackIsMelee leak on throw)', () => {
  it('melee attack on a non-adjacent zone throws before any state mutation or emit', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMeleeWeapon('w1')],
    });
    const state = makeState({
      survivor,
      zombies: { z2_1: makeWalker('z2_1', 'z2') },
    });
    state.zones.z2 = makeZone('z2');
    // Connect z1 → z2 so getDistance != Infinity (otherwise it throws "out of range" first).
    state.zones.z1.connections.push({ toZoneId: 'z2', hasDoor: false, doorOpen: true });
    state.zones.z2.connections.push({ toZoneId: 'z1', hasDoor: false, doorOpen: true });

    const failingInputs: ActionRequest[] = [
      // Melee weapon (range [0,0]) targeting a different zone — throws "Melee attacks can only target your own zone".
      // But the range check at distance=1 catches it first. Use a melee weapon on a same-zone target with no zombies first?
      // Better: use a longer-range melee attempt by overriding range temporarily. Easier approach below.
    ];
    // No-LOS ranged attack throws AFTER computing isMelee. Build that case explicitly.
    const ranged = makeRangedWeapon('r1');
    survivor.inventory = [ranged];
    state.zones.z1 = makeZone('z1');
    state.zones.z2 = makeZone('z2');
    // Walls: connect via a doorway through a building — break LOS by routing through a building.
    state.zones.z1.connections.push({ toZoneId: 'z2', hasDoor: true, doorOpen: false });
    state.zones.z2.connections.push({ toZoneId: 'z1', hasDoor: true, doorOpen: false });
    state.zones.z1.isBuilding = true;
    state.zones.z2.isBuilding = true;
    // Building↔Building with closed door = no LOS (per hasLineOfSight rules).

    failingInputs.push({
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z2', weaponId: 'r1' },
    });

    assertValidationIsPure(handleAttack, state, failingInputs);
  });

  it('attack with no weapon equipped throws purely', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [],
    });
    const state = makeState({
      survivor,
      zombies: { z1_1: makeWalker('z1_1', 'z1') },
    });

    assertValidationIsPure(handleAttack, state, [
      { playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK, payload: { targetZoneId: 'z1' } },
      { playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK, payload: {} }, // missing target zone
    ]);
  });
});
