import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
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
    bloodlustUsedThisTurn: false,
    lifesaverUsedThisTurn: false,
    hitAndRunFreeMove: false,
    luckyUsedThisTurn: false,
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
  friendlyFire?: boolean;
}): GameState {
  const zoneId = opts.survivor.position.zoneId;
  return {
    id: 'test',
    seed: seedFromString('combat-test'),
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
      friendlyFire: opts.friendlyFire ?? false,
      zombiePool: {
        [ZombieType.Walker]: 35,
        [ZombieType.Runner]: 12,
        [ZombieType.Brute]: 8,
        [ZombieType.Abomination]: 1,
      },
    },
    history: [],
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
    // Free melee covered the cost — actionsRemaining should be unchanged.
    expect(s.actionsRemaining).toBe(3);
    // Transient scratch must not leak onto post-processing state.
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

    // First attack — consumes one free melee
    const afterAttack = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'w1', preferredFreePool: 'melee' },
    });
    expect(afterAttack.success).toBe(true);
    expect(afterAttack.newState!.survivors.s1.freeMeleeRemaining).toBe(1);
    expect(afterAttack.newState!.lastAction?.rollbackSnapshot).toBeDefined();

    // Reroll — snapshot restores freeMeleeRemaining back to 2, then reroll spends one → 1
    const afterReroll = processAction(afterAttack.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.REROLL_LUCKY,
    });
    expect(afterReroll.success).toBe(true);
    const s = afterReroll.newState!.survivors.s1;
    expect(s.luckyUsedThisTurn).toBe(true);
    expect(s.freeMeleeRemaining).toBe(1);
    expect(s.actionsRemaining).toBe(3);
    expect((afterReroll.newState as unknown as { _attackIsMelee?: boolean })._attackIsMelee).toBeUndefined();
  });
});

describe('B4 — dual-wield reload flags BOTH weapon slots spent', () => {
  it('firing two identical reloadables marks both reloaded=false', () => {
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
    const a = inv.find(c => c.id === 'sawed-a')!;
    const b = inv.find(c => c.id === 'sawed-b')!;
    expect(a.reloaded).toBe(false);
    expect(b.reloaded).toBe(false);
  });

  it('single-weapon reload (no dual wield) only flips the fired weapon', () => {
    const hand1 = makeSawedOff('sawed-a', 'HAND_1');
    // Different-named weapon in HAND_2: dual-wield predicate fails
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
    // Crowbar is not reloadable — reloaded should remain undefined.
    expect(inv.find(c => c.id === 'crowbar')!.reloaded).toBeUndefined();
  });
});
