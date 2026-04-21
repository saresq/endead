// src/server/__tests__/broadcastEvents.test.ts
//
// SwarmComms §3.7 — per-socket EVENTS routing regression gate. Ensures
// that private events (CARD_DRAWN, TRADE_OFFER_UPDATED) reach only their
// owners; non-owners and spectators see the hidden variant.
//
// Reviewer invariant #13: "Per-socket routing — private events go ONLY to
// their recipient(s); public observers receive the redacted variant."

import { describe, it, expect } from 'vitest';
import {
  projectEventsForPlayer,
  publicProjection,
  publicVariantOf,
} from '../broadcastEvents';
import type { CollectedEvent } from '../../services/EventCollector';
import type { GameState, Survivor } from '../../types/GameState';
import {
  EquipmentType,
  DangerLevel,
  GamePhase,
  ZombieType,
} from '../../types/GameState';

function makeSurvivor(id: string, playerId: string): Survivor {
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
  };
}

function makeState(): GameState {
  return {
    id: 'room-x',
    seed: [1, 2, 3, 4],
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
    currentDangerLevel: DangerLevel.Blue,
    lobby: { players: [] },
    spectators: ['spec1'],
    players: ['p_alice', 'p_bob', 'p_carol'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: {
      s_alice: makeSurvivor('s_alice', 'p_alice'),
      s_bob: makeSurvivor('s_bob', 'p_bob'),
      s_carol: makeSurvivor('s_carol', 'p_carol'),
    },
    zombies: {},
    zones: {},
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
  };
}

describe('projectEventsForPlayer — private-channel routing (§3.7)', () => {
  it('CARD_DRAWN: drawer sees full card; bystander sees CARD_DRAWN_HIDDEN; spectator sees CARD_DRAWN_HIDDEN', () => {
    const state = makeState();
    const cardId = 'secret-uzi';
    const tagged: CollectedEvent[] = [
      {
        event: {
          type: 'CARD_DRAWN',
          survivorId: 's_bob',
          card: {
            id: cardId,
            name: 'Uzi',
            type: EquipmentType.Weapon,
            inHand: false,
          },
        },
        recipients: ['s_bob'],
      },
    ];

    // Bob (owner)
    const forBob = projectEventsForPlayer(tagged, 'p_bob', state);
    expect(forBob).toHaveLength(1);
    expect(forBob[0].type).toBe('CARD_DRAWN');
    expect(JSON.stringify(forBob)).toContain(cardId);

    // Alice (bystander player) — hidden only
    const forAlice = projectEventsForPlayer(tagged, 'p_alice', state);
    expect(forAlice).toHaveLength(1);
    expect(forAlice[0].type).toBe('CARD_DRAWN_HIDDEN');
    expect((forAlice[0] as { survivorId: string }).survivorId).toBe('s_bob');
    expect(JSON.stringify(forAlice)).not.toContain(cardId);

    // Carol (third player — the reviewer's explicit "3-player game" case)
    const forCarol = projectEventsForPlayer(tagged, 'p_carol', state);
    expect(forCarol).toHaveLength(1);
    expect(forCarol[0].type).toBe('CARD_DRAWN_HIDDEN');
    expect(JSON.stringify(forCarol)).not.toContain(cardId);

    // Spectator (owns no survivor) — hidden only
    const forSpec = projectEventsForPlayer(tagged, 'spec1', state);
    expect(forSpec[0].type).toBe('CARD_DRAWN_HIDDEN');
    expect(JSON.stringify(forSpec)).not.toContain(cardId);
  });

  it('TRADE_OFFER_UPDATED: participants see full card IDs; non-participant sees count only', () => {
    const state = makeState();
    const tagged: CollectedEvent[] = [
      {
        event: {
          type: 'TRADE_OFFER_UPDATED',
          offererSurvivorId: 's_alice',
          offerCardIds: ['trade-a1', 'trade-a2'],
        },
        recipients: ['s_alice', 's_bob'],
      },
    ];

    const forAlice = projectEventsForPlayer(tagged, 'p_alice', state);
    expect(forAlice[0].type).toBe('TRADE_OFFER_UPDATED');
    expect(JSON.stringify(forAlice)).toContain('trade-a1');

    const forBob = projectEventsForPlayer(tagged, 'p_bob', state);
    expect(forBob[0].type).toBe('TRADE_OFFER_UPDATED');
    expect(JSON.stringify(forBob)).toContain('trade-a1');

    const forCarol = projectEventsForPlayer(tagged, 'p_carol', state);
    expect(forCarol[0].type).toBe('TRADE_OFFER_UPDATED_HIDDEN');
    expect((forCarol[0] as { count: number }).count).toBe(2);
    expect(JSON.stringify(forCarol)).not.toContain('trade-a1');

    const forSpec = projectEventsForPlayer(tagged, 'spec1', state);
    expect(forSpec[0].type).toBe('TRADE_OFFER_UPDATED_HIDDEN');
    expect(JSON.stringify(forSpec)).not.toContain('trade-a1');
  });

  it('Public events pass through to every viewer (no duplication, no redaction)', () => {
    const state = makeState();
    const tagged: CollectedEvent[] = [
      {
        event: { type: 'SURVIVOR_MOVED', survivorId: 's_alice', fromZoneId: 'z1', toZoneId: 'z2' },
        recipients: 'public',
      },
    ];
    for (const pid of ['p_alice', 'p_bob', 'p_carol', 'spec1']) {
      const out = projectEventsForPlayer(tagged, pid, state);
      expect(out).toHaveLength(1);
      expect(out[0].type).toBe('SURVIVOR_MOVED');
    }
  });

  it('Mixed batch preserves event order (public + private + public)', () => {
    const state = makeState();
    const tagged: CollectedEvent[] = [
      {
        event: { type: 'SURVIVOR_MOVED', survivorId: 's_bob', fromZoneId: 'z1', toZoneId: 'z2' },
        recipients: 'public',
      },
      {
        event: {
          type: 'CARD_DRAWN',
          survivorId: 's_bob',
          card: { id: 'x', name: 'x', type: EquipmentType.Item, inHand: false },
        },
        recipients: ['s_bob'],
      },
      {
        event: { type: 'NOISE_GENERATED', zoneId: 'z2', amount: 1, newTotal: 1 },
        recipients: 'public',
      },
    ];

    const forAlice = projectEventsForPlayer(tagged, 'p_alice', state);
    expect(forAlice.map((e) => e.type)).toEqual([
      'SURVIVOR_MOVED',
      'CARD_DRAWN_HIDDEN',
      'NOISE_GENERATED',
    ]);

    const forBob = projectEventsForPlayer(tagged, 'p_bob', state);
    expect(forBob.map((e) => e.type)).toEqual([
      'SURVIVOR_MOVED',
      'CARD_DRAWN',
      'NOISE_GENERATED',
    ]);
  });
});

describe('publicProjection — log-tail redaction (§3.5)', () => {
  it('strips private events to their hidden variants', () => {
    const tagged: CollectedEvent[] = [
      {
        event: {
          type: 'CARD_DRAWN',
          survivorId: 's_bob',
          card: { id: 'secret', name: 'secret', type: EquipmentType.Item, inHand: false },
        },
        recipients: ['s_bob'],
      },
      {
        event: { type: 'SURVIVOR_MOVED', survivorId: 's_bob', fromZoneId: 'z1', toZoneId: 'z2' },
        recipients: 'public',
      },
    ];
    const out = publicProjection(tagged);
    expect(out.map((e) => e.type)).toEqual(['CARD_DRAWN_HIDDEN', 'SURVIVOR_MOVED']);
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});

describe('publicVariantOf — hardened failure mode', () => {
  it('throws (in dev) when a private event has no registered public variant', () => {
    // SURVIVOR_MOVED is a public event; emitting it privately is a bug.
    // publicVariantOf should fail loudly rather than silently drop.
    const event = {
      type: 'SURVIVOR_MOVED' as const,
      survivorId: 'x',
      fromZoneId: 'z1',
      toZoneId: 'z2',
    };
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect(() => publicVariantOf(event)).toThrow(/No public variant/);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });
});
