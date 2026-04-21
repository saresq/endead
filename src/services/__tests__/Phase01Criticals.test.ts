import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

function makeMeleeWeapon(id: string, name = 'Crowbar'): EquipmentCard {
  return {
    id, name,
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
    inHand: true, slot: 'HAND_1',
  };
}

function makeSawedOff(id: string, slot: 'HAND_1' | 'HAND_2' = 'HAND_1'): EquipmentCard {
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
  actionsRemaining?: number;
  actionsPerTurn?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: 'Tester',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: opts.actionsPerTurn ?? 3,
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

function makeZone(id: string, connections: Zone['connections'] = []): Zone {
  return {
    id,
    connections,
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
  zones: Record<string, Zone>;
  zombies?: Record<string, Zombie>;
  seed?: string;
}): GameState {
  return {
    id: 'test',
    seed: seedFromString(opts.seed ?? 'phase01'),
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
    zones: opts.zones,
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

// ===========================================================================
// C5 — Movement extra-AP is flat +1 when zombies are present, not per-zombie.
// Validator (TurnManager) already charges flat +1; handler must agree.
// ===========================================================================
describe('C5 — MOVE leaving a zone with zombies costs flat +1 AP, not per-zombie', () => {
  it('3 walkers in origin → WALK deducts exactly 2 AP (1 base + 1 penalty)', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [],
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const zombies = {
      w1: makeWalker('w1', 'z1'),
      w2: makeWalker('w2', 'z1'),
      w3: makeWalker('w3', 'z1'),
    };
    const state = makeState({ survivor, zones, zombies });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE,
      payload: { targetZoneId: 'z2' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(1);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('z2');
  });

  it('0 walkers in origin → WALK deducts exactly 1 AP (no penalty)', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [],
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const state = makeState({ survivor, zones });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE,
      payload: { targetZoneId: 'z2' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(2);
  });

  it('SPRINT through 3 walkers in origin deducts exactly 2 AP (1 base + 1 flat penalty)', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [], skills: ['sprint'],
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [
        { toZoneId: 'z1', hasDoor: false, doorOpen: false },
        { toZoneId: 'z3', hasDoor: false, doorOpen: false },
      ]),
      z3: makeZone('z3', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
    };
    const zombies = {
      w1: makeWalker('w1', 'z1'),
      w2: makeWalker('w2', 'z1'),
      w3: makeWalker('w3', 'z1'),
    };
    const state = makeState({ survivor, zones, zombies });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SPRINT,
      payload: { path: ['z2', 'z3'] },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(1);
    expect(res.newState!.survivors.s1.position.zoneId).toBe('z3');
  });

  it('validator rejects MOVE with 1 AP remaining when zombies are in origin (needs 2 AP)', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', inventory: [], actionsRemaining: 1,
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }]),
    };
    const zombies = { w1: makeWalker('w1', 'z1') };
    const state = makeState({ survivor, zones, zombies });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.MOVE,
      payload: { targetZoneId: 'z2' },
    });
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('NOT_ENOUGH_AP');
    // Validator rejected — no mutation from the handler.
    expect(state.survivors.s1.position.zoneId).toBe('z1');
    expect(state.survivors.s1.actionsRemaining).toBe(1);
  });
});

// ===========================================================================
// C2 — Reload weapons do NOT auto-reload at end of round. Only an explicit
// Reload Action (handleReload) may flip `reloaded = true`.
// ===========================================================================
describe('C2 — end-of-round does not auto-reload spent reload weapons', () => {
  it('fire Sawed-Off → executeZombiePhase → card.reloaded stays false and next ATTACK is rejected', () => {
    const sawed = makeSawedOff('sawed-a', 'HAND_1');
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [sawed],
    });
    const zones = { z1: makeZone('z1') };
    const zombies = { w1: makeWalker('w1', 'z1') };
    const state = makeState({ survivor, zones, zombies });

    const afterAttack = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'sawed-a' },
    });
    expect(afterAttack.success).toBe(true);
    expect(afterAttack.newState!.survivors.s1.inventory.find(c => c.id === 'sawed-a')!.reloaded).toBe(false);

    // Force the zombie phase boundary (normally ActionProcessor runs it when
    // phase flips; here we drive it directly so the test is phase-agnostic).
    afterAttack.newState!.phase = GamePhase.Zombies;
    ZombiePhaseManager.executeZombiePhase(afterAttack.newState!);

    // Card stays spent — auto-reload loop has been removed.
    expect(afterAttack.newState!.survivors.s1.inventory.find(c => c.id === 'sawed-a')!.reloaded).toBe(false);

    // Next turn: firing without an explicit Reload Action is rejected.
    const nextAttack = processAction(afterAttack.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'sawed-a' },
    });
    expect(nextAttack.success).toBe(false);
    expect(nextAttack.error?.message).toMatch(/reloaded/i);
  });

  it('explicit RELOAD action remains the only path that flips reloaded=true', () => {
    const sawed = makeSawedOff('sawed-a', 'HAND_1');
    sawed.reloaded = false;
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [sawed],
    });
    const zones = { z1: makeZone('z1') };
    const state = makeState({ survivor, zones });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RELOAD,
      payload: { weaponId: 'sawed-a' },
    });
    expect(res.success).toBe(true);
    expect(res.newState!.survivors.s1.inventory.find(c => c.id === 'sawed-a')!.reloaded).toBe(true);
  });
});

// ===========================================================================
// C3 — Lucky is once per Action, not once per Turn. Each fresh ATTACK may
// burn a Lucky reroll. Second reroll within the SAME ATTACK is rejected.
// ===========================================================================
describe('C3 — Lucky triggers per-Action (fresh ATTACK each time), not per-turn', () => {
  it('multi-ATTACK turn: every fresh ATTACK restores Lucky (3 attacks, 3 rerolls all succeed)', () => {
    // actionsPerTurn=4 so the last attack doesn't trip the auto-advance-turn
    // path (separate from C3 scope — we just need enough AP for 3 attacks
    // plus slack to keep the turn active during the final reroll).
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMeleeWeapon('w1')],
      skills: ['lucky'],
      actionsPerTurn: 4,
      actionsRemaining: 4,
    });
    const zones = { z1: makeZone('z1') };
    const zombies = {
      w1: makeWalker('w1', 'z1'),
      w2: makeWalker('w2', 'z1'),
      w3: makeWalker('w3', 'z1'),
    };
    let state = makeState({ survivor, zones, zombies });

    for (let i = 0; i < 3; i++) {
      // Melee into a multi-target zone requires explicit targetZombieIds (m3) —
      // always aim at the first zombie remaining so the test exercises the
      // per-Action Lucky reset, not target selection.
      const remaining = Object.values(state.zombies);
      const targetId = remaining.length > 0 ? [remaining[0].id] : [];
      const attack = processAction(state, {
        playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
        payload: { targetZoneId: 'z1', weaponId: 'w1', targetZombieIds: targetId },
      });
      expect(attack.success).toBe(true);
      // Fresh ATTACK lastAction must have rollbackSnapshot + no luckyUsed.
      expect(attack.newState!.lastAction?.rollbackSnapshot).toBeDefined();
      expect(attack.newState!.lastAction?.luckyUsed).toBeFalsy();
      state = attack.newState!;

      const reroll = processAction(state, {
        playerId: 'p1', survivorId: 's1', type: ActionType.REROLL_LUCKY,
      });
      expect(reroll.success).toBe(true);
      expect(reroll.newState!.lastAction?.luckyUsed).toBe(true);
      state = reroll.newState!;
    }
    expect(state.survivors.s1.actionsRemaining).toBe(1);
  });

  it('second REROLL_LUCKY within the SAME ATTACK is rejected', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMeleeWeapon('w1')],
      skills: ['lucky'],
    });
    const zones = { z1: makeZone('z1') };
    const zombies = { w1: makeWalker('w1', 'z1') };
    const state = makeState({ survivor, zones, zombies });

    const attack = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'w1' },
    });
    expect(attack.success).toBe(true);

    const reroll1 = processAction(attack.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.REROLL_LUCKY,
    });
    expect(reroll1.success).toBe(true);
    expect(reroll1.newState!.lastAction?.luckyUsed).toBe(true);

    const reroll2 = processAction(reroll1.newState!, {
      playerId: 'p1', survivorId: 's1', type: ActionType.REROLL_LUCKY,
    });
    expect(reroll2.success).toBe(false);
    expect(reroll2.error?.message).toMatch(/Lucky/i);
  });
});
