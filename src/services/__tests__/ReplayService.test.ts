// src/services/__tests__/ReplayService.test.ts
//
// SwarmComms §3.5 / §5 / §3.5.1 invariant: `replayGame(initial, room.actionLog)`
// converges to the same final state as live mutation-in-place dispatch
// (modulo the D9/D22 allowlist — version + timestamps).

import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { replayGame, compareStates } from '../ReplayService';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

function makeMeleeWeapon(id: string): EquipmentCard {
  return {
    id, name: 'Crowbar',
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
    inHand: true, slot: 'HAND_1',
  };
}

function makeSurvivor(): Survivor {
  return {
    id: 's1',
    playerId: 'p1',
    name: 'Tester',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId: 'z1' },
    actionsPerTurn: 3,
    maxHealth: 3,
    wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: [],
    inventory: [makeMeleeWeapon('w1')],
    actionsRemaining: 3,
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

function makeZone(id: string, conns: { toZoneId: string; hasDoor: boolean; doorOpen: boolean }[] = []): Zone {
  return {
    id,
    connections: conns,
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

function baseState(): GameState {
  const survivor = makeSurvivor();
  return {
    id: 'replay-test',
    seed: seedFromString('replay-test'),
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [{ id: 'p1', name: 'Tester', ready: true, characterClass: 'Waitress', starterEquipmentKey: 'pistol' }] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: ['p1'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: { s1: survivor },
    zombies: { z1_1: makeWalker('z1_1', 'z1') },
    zones: {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: true }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: true }]),
    },
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

describe('ReplayService round-trip (§3.5.1, D22)', () => {
  it('replaying a recorded action log produces a state equal to live (per D22 allowlist)', () => {
    // Live run: capture intent log + final state.
    const live = baseState();
    const actionLog: ActionRequest[] = [];

    const intents: ActionRequest[] = [
      { playerId: 'p1', survivorId: 's1', type: ActionType.ATTACK,
        payload: { targetZoneId: 'z1', weaponId: 'w1' } },
      { playerId: 'p1', survivorId: 's1', type: ActionType.END_TURN },
    ];

    for (const intent of intents) {
      actionLog.push(intent);
      const res = processAction(live, intent);
      expect(res.success, `live ${intent.type} failed: ${res.error?.message}`).toBe(true);
    }

    // Replay run from a pristine copy of the same initial state + log.
    const initial = baseState();
    const replayed = replayGame(initial, actionLog);

    // compareStates strips the D22 allowlist (version, lastAction.timestamp, etc.).
    const cmp = compareStates(live, replayed);
    expect(cmp.equal, `replay diverged: ${cmp.diff}`).toBe(true);
  });

  it('compareStates ignores version differences', () => {
    const a = baseState();
    const b = baseState();
    a.version = 5;
    b.version = 12;
    expect(compareStates(a, b).equal).toBe(true);
  });

  it('compareStates ignores lastAction.timestamp differences', () => {
    const a = baseState();
    const b = baseState();
    a.lastAction = { type: 'X', playerId: 'p1', timestamp: 1000 };
    b.lastAction = { type: 'X', playerId: 'p1', timestamp: 9999 };
    expect(compareStates(a, b).equal).toBe(true);
  });
});
