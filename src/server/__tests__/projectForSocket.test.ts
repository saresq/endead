// src/server/__tests__/projectForSocket.test.ts
//
// SwarmComms Step 4 / §3.7.1 redaction matrix — the security-critical
// regression gate. B12 says leaks are cheat surfaces; this suite ensures
// every sensitive field × role combination is asserted explicitly.
//
// Roles:
//   - owner        — the viewing socket owns the private info.
//   - non-owner    — a different player in the same game.
//   - spectator    — a player in the `spectators` list, not owning any
//                    survivor. Same wire projection as non-owner per §3.7.
//   - null (server-local) — persistence path; keeps seed + deck contents.
//
// Fields:
//   1. seed
//   2. lastAction.rollbackSnapshot
//   3. lastAction.canLucky  (present iff viewer owns shooter + reroll valid)
//   4. _attackIsMelee / _extraAPCost  (lifted off GameState in Step 3)
//   5. survivors[other].drawnCard / drawnCardsQueue
//   6. activeTrade.offers
//   7. equipmentDeck / spawnDeck / epicDeck contents

import { describe, it, expect } from 'vitest';
import { projectForSocket } from '../projectForSocket';
import type { GameState, Survivor, EquipmentCard } from '../../types/GameState';
import { EquipmentType, DangerLevel, GamePhase, ZombieType } from '../../types/GameState';

function makeSurvivor(
  id: string,
  playerId: string,
  overrides: Partial<Survivor> = {},
): Survivor {
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

function makeCard(id: string, name = id): EquipmentCard {
  return { id, name, type: EquipmentType.Item, inHand: false };
}

function makeState(): GameState {
  const s1 = makeSurvivor('s1', 'p1');
  const s2 = makeSurvivor('s2', 'p2');
  s1.drawnCard = makeCard('private-card-1', 'Pistol');
  s1.drawnCardsQueue = [makeCard('private-card-2', 'Sniper')];

  const state: GameState = {
    id: 'room-x',
    seed: [0xdeadbeef, 0xcafef00d, 0x12345678, 0x9abcdef0],
    version: 7,
    turn: 2,
    phase: GamePhase.Players,
    currentDangerLevel: DangerLevel.Blue,
    lobby: { players: [] },
    spectators: ['p_spec'],
    players: ['p1', 'p2'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: { s1, s2 },
    zombies: {},
    zones: {},
    objectives: [],
    equipmentDeck: [makeCard('deck-a'), makeCard('deck-b'), makeCard('deck-c')],
    equipmentDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    epicDeck: [makeCard('epic-a'), makeCard('epic-b')],
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
    activeTrade: {
      activeSurvivorId: 's1',
      targetSurvivorId: 's2',
      offers: {
        s1: ['trade-card-1', 'trade-card-2'],
        s2: ['trade-card-3'],
      },
      receiveLayouts: { s1: {}, s2: {} },
      status: { s1: false, s2: false },
    },
    lastAction: {
      type: 'ATTACK',
      playerId: 'p1',
      survivorId: 's1',
      timestamp: Date.now(),
      dice: [3, 5, 6],
      hits: 2,
      rollbackSnapshot: {
        seedAfterRoll: [1, 2, 3, 4],
        zombies: {},
        survivors: {},
        equipmentDeck: [makeCard('sniff-future')],
        equipmentDiscard: [],
        objectives: [],
        noiseTokens: 0,
        zoneNoise: {},
        attackPayload: { targetZoneId: 'z2' },
        originalDice: [1, 1, 1],
      },
    },
    nextZombieId: 1,
  };

  // Arm Lucky for s1 so `canLucky` becomes true for the owning socket.
  (state.survivors.s1 as Survivor).skills = ['lucky'];

  // Belt-and-braces: stash transient scratch that Step 3 lifted off the
  // type, so the projection's defensive drop is exercised.
  (state as unknown as Record<string, unknown>)._attackIsMelee = true;
  (state as unknown as Record<string, unknown>)._extraAPCost = 1;
  (state as unknown as Record<string, unknown>).history = [{ stale: true }];
  return state;
}

const OWNER = { playerId: 'p1' };
const OTHER = { playerId: 'p2' };
const SPECTATOR = { playerId: 'p_spec' };

// ---------------------------------------------------------------------------

describe('projectForSocket — redaction matrix (B12, §3.7.1)', () => {
  // ---------- Field 1: seed ----------

  describe('seed (field 1)', () => {
    it('owner: omitted', () => {
      const out = projectForSocket(makeState(), OWNER);
      expect((out as Record<string, unknown>).seed).toBeUndefined();
    });
    it('non-owner: omitted', () => {
      const out = projectForSocket(makeState(), OTHER);
      expect((out as Record<string, unknown>).seed).toBeUndefined();
    });
    it('spectator: omitted', () => {
      const out = projectForSocket(makeState(), SPECTATOR);
      expect((out as Record<string, unknown>).seed).toBeUndefined();
    });
    it('server-local (null): RETAINED', () => {
      const out = projectForSocket(makeState(), null);
      expect(out.seed).toEqual([0xdeadbeef, 0xcafef00d, 0x12345678, 0x9abcdef0]);
    });
  });

  // ---------- Field 2: lastAction.rollbackSnapshot ----------

  describe('lastAction.rollbackSnapshot (field 2)', () => {
    it('owner: omitted', () => {
      const out = projectForSocket(makeState(), OWNER);
      const la = out.lastAction as Record<string, unknown> | undefined;
      expect(la?.rollbackSnapshot).toBeUndefined();
    });
    it('non-owner: omitted', () => {
      const out = projectForSocket(makeState(), OTHER);
      const la = out.lastAction as Record<string, unknown> | undefined;
      expect(la?.rollbackSnapshot).toBeUndefined();
    });
    it('spectator: omitted', () => {
      const out = projectForSocket(makeState(), SPECTATOR);
      const la = out.lastAction as Record<string, unknown> | undefined;
      expect(la?.rollbackSnapshot).toBeUndefined();
    });
  });

  // ---------- Field 3: lastAction.canLucky ----------

  describe('lastAction.canLucky (field 3)', () => {
    it('owner (shooter, Lucky unspent): true', () => {
      const out = projectForSocket(makeState(), OWNER);
      expect(out.lastAction?.canLucky).toBe(true);
    });
    it('non-owner (different player): absent/false', () => {
      const out = projectForSocket(makeState(), OTHER);
      expect(out.lastAction?.canLucky).toBeFalsy();
    });
    it('spectator: absent/false', () => {
      const out = projectForSocket(makeState(), SPECTATOR);
      expect(out.lastAction?.canLucky).toBeFalsy();
    });
    it('owner but lastAction.luckyUsed=true: absent/false', () => {
      const state = makeState();
      state.lastAction!.luckyUsed = true;
      const out = projectForSocket(state, OWNER);
      expect(out.lastAction?.canLucky).toBeFalsy();
    });
  });

  // ---------- Field 4: _attackIsMelee / _extraAPCost ----------

  describe('_attackIsMelee / _extraAPCost (field 4, belt-and-braces)', () => {
    it('owner: both omitted even when state carries them', () => {
      const out = projectForSocket(makeState(), OWNER) as Record<string, unknown>;
      expect(out._attackIsMelee).toBeUndefined();
      expect(out._extraAPCost).toBeUndefined();
    });
    it('non-owner: both omitted', () => {
      const out = projectForSocket(makeState(), OTHER) as Record<string, unknown>;
      expect(out._attackIsMelee).toBeUndefined();
      expect(out._extraAPCost).toBeUndefined();
    });
    it('spectator: both omitted', () => {
      const out = projectForSocket(makeState(), SPECTATOR) as Record<string, unknown>;
      expect(out._attackIsMelee).toBeUndefined();
      expect(out._extraAPCost).toBeUndefined();
    });
    it('server-local (null): also omitted (transient scratch)', () => {
      const out = projectForSocket(makeState(), null) as unknown as Record<string, unknown>;
      expect(out._attackIsMelee).toBeUndefined();
      expect(out._extraAPCost).toBeUndefined();
    });
  });

  // ---------- Field 5: other-player drawnCard / drawnCardsQueue ----------

  describe('survivors[other].drawnCard / drawnCardsQueue (field 5)', () => {
    it('owner: sees the real drawnCard + drawnCardsQueue on own survivor', () => {
      const out = projectForSocket(makeState(), OWNER);
      const s = out.survivors.s1;
      expect(s.drawnCard?.id).toBe('private-card-1');
      expect(s.drawnCardsQueue?.[0]?.id).toBe('private-card-2');
    });
    it('non-owner (different player): drawnCard stripped; hasDrawnCard + queueLength exposed', () => {
      const out = projectForSocket(makeState(), OTHER);
      const s = out.survivors.s1 as Record<string, unknown>;
      expect(s.drawnCard).toBeUndefined();
      expect(s.drawnCardsQueue).toBeUndefined();
      expect(s.hasDrawnCard).toBe(true);
      expect(s.queueLength).toBe(1);
    });
    it('spectator: drawnCard stripped', () => {
      const out = projectForSocket(makeState(), SPECTATOR);
      const s = out.survivors.s1 as Record<string, unknown>;
      expect(s.drawnCard).toBeUndefined();
      expect(s.drawnCardsQueue).toBeUndefined();
    });
  });

  // ---------- Field 6: activeTrade.offers ----------

  describe('activeTrade.offers (field 6)', () => {
    it('owner (trade participant): sees offers with card IDs', () => {
      const out = projectForSocket(makeState(), OWNER);
      const trade = out.activeTrade as { offers?: Record<string, string[]> };
      expect(trade.offers?.s1).toEqual(['trade-card-1', 'trade-card-2']);
      expect(trade.offers?.s2).toEqual(['trade-card-3']);
    });
    it('non-owner (non-participant): offers stripped; offerCounts exposed', () => {
      const state = makeState();
      // p2 IS the target participant in the base fixture, so for this cell
      // we need a fresh player who is NOT in the trade.
      state.survivors.s3 = makeSurvivor('s3', 'p3');
      state.players.push('p3');
      const out = projectForSocket(state, { playerId: 'p3' });
      const trade = out.activeTrade as Record<string, unknown>;
      expect(trade.offers).toBeUndefined();
      expect(trade.offerCounts).toEqual({ s1: 2, s2: 1 });
    });
    it('spectator (non-participant): offers stripped; offerCounts exposed', () => {
      const out = projectForSocket(makeState(), SPECTATOR);
      const trade = out.activeTrade as Record<string, unknown>;
      expect(trade.offers).toBeUndefined();
      expect(trade.offerCounts).toEqual({ s1: 2, s2: 1 });
    });
  });

  // ---------- Field 7: deck contents ----------

  describe('equipmentDeck / spawnDeck / epicDeck (field 7)', () => {
    it('owner: deck contents stripped; counts exposed', () => {
      const out = projectForSocket(makeState(), OWNER) as Record<string, unknown>;
      expect(out.equipmentDeck).toBeUndefined();
      expect(out.spawnDeck).toBeUndefined();
      expect(out.epicDeck).toBeUndefined();
      expect(out.equipmentDeckCount).toBe(3);
      expect(out.spawnDeckCount).toBe(0);
      expect(out.epicDeckCount).toBe(2);
    });
    it('non-owner: deck contents stripped; counts exposed', () => {
      const out = projectForSocket(makeState(), OTHER) as Record<string, unknown>;
      expect(out.equipmentDeck).toBeUndefined();
      expect(out.spawnDeck).toBeUndefined();
      expect(out.epicDeck).toBeUndefined();
      expect(out.equipmentDeckCount).toBe(3);
    });
    it('spectator: deck contents stripped; counts exposed', () => {
      const out = projectForSocket(makeState(), SPECTATOR) as Record<string, unknown>;
      expect(out.equipmentDeck).toBeUndefined();
      expect(out.spawnDeck).toBeUndefined();
      expect(out.epicDeck).toBeUndefined();
      expect(out.equipmentDeckCount).toBe(3);
    });
    it('server-local (null): deck contents RETAINED (persistence needs full state)', () => {
      const out = projectForSocket(makeState(), null);
      expect(out.equipmentDeck?.length).toBe(3);
      expect(out.epicDeck?.length).toBe(2);
    });
  });

  // ---------- Sanity: toJSON round-trip never produces stripped fields ----------

  it('no seed / rollbackSnapshot string appears in the serialized client JSON', () => {
    for (const socket of [OWNER, OTHER, SPECTATOR]) {
      const out = projectForSocket(makeState(), socket);
      const json = JSON.stringify(out);
      expect(json).not.toContain('seedAfterRoll');
      expect(json).not.toContain('rollbackSnapshot');
      // `"seed"` as a key should not appear in the payload. Guard the
      // literal substring check against incidental substrings like
      // "seeded" by anchoring on the JSON key form.
      expect(json).not.toMatch(/"seed"\s*:/);
      // Deck contents are keyed by full card arrays — counts only.
      expect(json).not.toMatch(/"equipmentDeck"\s*:/);
      expect(json).not.toMatch(/"spawnDeck"\s*:/);
      expect(json).not.toMatch(/"epicDeck"\s*:/);
    }
  });

  it('private card IDs and trade card IDs do not appear in non-owner JSON', () => {
    // `OTHER` (p2) is a trade participant, so trade card IDs ARE visible —
    // that's correct per §3.7. We check private CARDS (drawnCard) leak only.
    const json = JSON.stringify(projectForSocket(makeState(), OTHER));
    expect(json).not.toContain('private-card-1');
    expect(json).not.toContain('private-card-2');
  });

  it('trade card IDs do not appear in non-participant JSON', () => {
    const state = makeState();
    state.survivors.s3 = makeSurvivor('s3', 'p3');
    state.players.push('p3');
    const json = JSON.stringify(projectForSocket(state, { playerId: 'p3' }));
    expect(json).not.toContain('trade-card-1');
    expect(json).not.toContain('trade-card-2');
    expect(json).not.toContain('trade-card-3');
  });

  it('private card IDs and trade card IDs do not appear in spectator JSON', () => {
    const json = JSON.stringify(projectForSocket(makeState(), SPECTATOR));
    expect(json).not.toContain('private-card-1');
    expect(json).not.toContain('private-card-2');
    expect(json).not.toContain('trade-card-1');
    expect(json).not.toContain('trade-card-2');
  });
});
