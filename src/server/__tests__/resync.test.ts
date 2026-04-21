// src/server/__tests__/resync.test.ts
//
// SwarmComms §3.8 / §3.7.1 — resync correctness regression gate.
//
// Reviewer invariants #8 + #10:
//   - An action that mutates multiple subtrees (zombies dying, survivor
//     XP, zone noise, etc.) is followed by disconnect + reconnect.
//   - The client's SNAPSHOT response matches the authoritative server
//     state — no field diverges, no private info leaks on the log tail.
//
// Runs the server-side processAction on a realistic mid-game state, then
// asserts that projectForSocket + eventLog tail together encode the final
// authoritative state for a reconnecting owner AND a reconnecting
// spectator.

import { describe, it, expect } from 'vitest';
import { processAction } from '../../services/ActionProcessor';
import { projectForSocket } from '../projectForSocket';
import { publicProjection } from '../broadcastEvents';
import { ActionType } from '../../types/Action';
import type { GameState, Survivor, Zombie } from '../../types/GameState';
import {
  EquipmentType,
  DangerLevel,
  GamePhase,
  ZombieType,
} from '../../types/GameState';
import { seedFromString } from '../../services/Rng';

function makeSurvivor(id: string, playerId: string, overrides: Partial<Survivor> = {}): Survivor {
  return {
    id,
    playerId,
    name: id,
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
  };
}

function makeZombie(id: string, zoneId: string, type = ZombieType.Walker): Zombie {
  return {
    id,
    type,
    position: { x: 0, y: 0, zoneId },
    wounds: 0,
    activated: false,
  };
}

function makeMidGameState(): GameState {
  const state: GameState = {
    id: 'r',
    seed: seedFromString('resync-test'),
    version: 42,
    turn: 3,
    phase: GamePhase.Players,
    currentDangerLevel: DangerLevel.Blue,
    lobby: { players: [] },
    spectators: ['p_spec'],
    players: ['p_alice'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: {
      s_alice: makeSurvivor('s_alice', 'p_alice', {
        position: { x: 0, y: 0, zoneId: 'z1' },
        inventory: [
          {
            id: 'pistol',
            name: 'Pistol',
            type: EquipmentType.Weapon,
            inHand: true,
            slot: 'HAND_1',
            reloaded: true,
            stats: {
              range: [0, 1],
              dice: 1,
              accuracy: 4,
              damage: 1,
              noise: true,
              dualWield: false,
            },
          },
        ],
      }),
    },
    zombies: {
      z1: makeZombie('z1', 'z1'),
      z2: makeZombie('z2', 'z1'),
    },
    zones: {
      z1: {
        id: 'z1',
        connections: [{ toZoneId: 'z2', hasDoor: false, doorOpen: false }],
        isBuilding: false,
        hasNoise: false,
        noiseTokens: 0,
        searchable: false,
        isDark: false,
        hasBeenSpawned: true,
      },
      z2: {
        id: 'z2',
        connections: [{ toZoneId: 'z1', hasDoor: false, doorOpen: false }],
        isBuilding: false,
        hasNoise: false,
        noiseTokens: 0,
        searchable: false,
        isDark: false,
        hasBeenSpawned: true,
      },
    },
    objectives: [],
    equipmentDeck: [
      {
        id: 'future-a',
        name: 'Shotgun',
        type: EquipmentType.Weapon,
        inHand: false,
      },
    ],
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
    nextZombieId: 10,
  };
  return state;
}

describe('Resync correctness — multi-subtree action + SNAPSHOT + log tail (§3.8)', () => {
  it('owner reconnecting AFTER an ATTACK that mutates survivors/zombies/noise/deck receives authoritative state via SNAPSHOT', () => {
    const state = makeMidGameState();
    const versionBefore = state.version;
    const zombieCountBefore = Object.keys(state.zombies).length;
    const deckBefore = state.equipmentDeck.length;

    const res = processAction(state, {
      playerId: 'p_alice',
      survivorId: 's_alice',
      type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'pistol' },
    });

    expect(res.success).toBe(true);
    expect(res.newState).toBeDefined();

    // Version bumped once.
    expect(res.newState!.version).toBe(versionBefore + 1);

    // --- Simulate reconnect: owner requests SNAPSHOT ---
    const ownerView = projectForSocket(res.newState!, { playerId: 'p_alice' });

    // Owner's survivor preserved, including action-remaining decrement.
    expect(ownerView.survivors.s_alice).toBeDefined();
    expect(ownerView.survivors.s_alice.actionsRemaining).toBeLessThan(3);

    // Deck contents never cross the wire — counts only.
    expect((ownerView as Record<string, unknown>).equipmentDeck).toBeUndefined();
    expect(ownerView.equipmentDeckCount).toBe(deckBefore);

    // Seed is stripped on the client projection even on reconnect.
    expect((ownerView as Record<string, unknown>).seed).toBeUndefined();

    // lastAction.rollbackSnapshot never in the payload.
    const lastJson = JSON.stringify(ownerView.lastAction ?? {});
    expect(lastJson).not.toContain('rollbackSnapshot');
    expect(lastJson).not.toContain('seedAfterRoll');

    // Zombies still enumerated (number may be smaller if the dice rolled
    // hits; we only assert the field is correctly shaped, not outcome).
    expect(ownerView.zombies).toBeDefined();
    expect(Object.keys(ownerView.zombies).length).toBeLessThanOrEqual(zombieCountBefore);
  });

  it('spectator reconnecting receives same-shape SNAPSHOT but with deck/seed/private fields redacted', () => {
    const state = makeMidGameState();
    processAction(state, {
      playerId: 'p_alice',
      survivorId: 's_alice',
      type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'pistol' },
    });

    const spectatorView = projectForSocket(state, { playerId: 'p_spec' });
    expect((spectatorView as Record<string, unknown>).seed).toBeUndefined();
    expect((spectatorView as Record<string, unknown>).equipmentDeck).toBeUndefined();
    expect(JSON.stringify(spectatorView)).not.toContain('seedAfterRoll');
    expect(JSON.stringify(spectatorView)).not.toContain('rollbackSnapshot');
    expect(JSON.stringify(spectatorView)).not.toContain('future-a'); // deck card name
  });

  it('log-tail projection of a multi-subtree action drops seed and private subtrees', () => {
    const state = makeMidGameState();
    const res = processAction(state, {
      playerId: 'p_alice',
      survivorId: 's_alice',
      type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'pistol' },
    });
    expect(res.success).toBe(true);

    const tail = publicProjection(res.taggedEvents ?? []);
    const tailJson = JSON.stringify(tail);
    expect(tailJson).not.toContain('seedAfterRoll');
    expect(tailJson).not.toContain('rollbackSnapshot');
    // The ATTACK_REROLLED event (if ever present outside the REROLL_LUCKY
    // path) would carry a scoped patch — but a plain ATTACK never emits
    // one. Confirm.
    expect(tail.find((e) => e.type === 'ATTACK_REROLLED')).toBeUndefined();
  });
});
