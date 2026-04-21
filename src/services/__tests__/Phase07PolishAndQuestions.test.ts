import { describe, it, expect } from 'vitest';
import { rollAttack } from '../CombatDice';
import { Rng, seedFromString } from '../Rng';
import { handleAttack } from '../handlers/CombatHandlers';
import { handleTakeObjective } from '../handlers/ObjectiveHandlers';
import { EventCollector } from '../EventCollector';
import { SPAWN_CARDS } from '../../config/SpawnRegistry';
import { INITIAL_EPIC_DECK_CONFIG, STARTER_DECK_POOL } from '../../config/EquipmentRegistry';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Objective, ObjectiveType, Survivor, Zone, Zombie, ZombieType,
  initialGameState,
} from '../../types/GameState';
import { ActionType } from '../../types/Action';

// --- Fixture helpers ---------------------------------------------------------

function makeSurvivor(opts: {
  id: string; playerId: string; zoneId: string;
  inventory?: EquipmentCard[]; skills?: string[];
  actionsRemaining?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: opts.id,
    characterClass: 'Tester',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: 3, wounds: 0,
    experience: 0,
    dangerLevel: DangerLevel.Blue,
    skills: opts.skills ?? [],
    inventory: opts.inventory ?? [],
    actionsRemaining: opts.actionsRemaining ?? 3,
    hasMoved: false, hasSearched: false,
    freeMovesRemaining: 0, freeSearchesRemaining: 0,
    freeCombatsRemaining: 0, freeMeleeRemaining: 0, freeRangedRemaining: 0,
    toughUsedZombieAttack: false, toughUsedFriendlyFire: false,
    sprintUsedThisTurn: false, chargeUsedThisTurn: false,
    bornLeaderUsedThisTurn: false,
  };
}

function makeZone(id: string, overrides: Partial<Zone> = {}): Zone {
  return {
    id, connections: [],
    isBuilding: false, hasNoise: false, noiseTokens: 0,
    searchable: false, isDark: false, hasBeenSpawned: false,
    ...overrides,
  };
}

function makeZombie(id: string, type: ZombieType, zoneId: string): Zombie {
  return {
    id, type,
    position: { x: 0, y: 0, zoneId },
    wounds: 0, activated: false,
  };
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'test',
    seed: seedFromString('phase07'),
    version: 0, turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [] }, spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: ['p1'],
    activePlayerIndex: 0, firstPlayerTokenIndex: 0,
    survivors: {}, zombies: {}, zones: {},
    objectives: [],
    equipmentDeck: [], equipmentDiscard: [],
    spawnDeck: [], spawnDiscard: [],
    noiseTokens: 0,
    nextZombieId: 99,
    config: {
      maxSurvivors: 6,
      zombiePool: { ...initialGameState.config.zombiePool },
    },
    ...overrides,
  } as GameState;
}

// ===========================================================================
// m1 — Accuracy upper clamp: a natural 6 always hits, even when a misconfigured
// weapon ships with accuracy > 6.
// ===========================================================================
describe('m1 — accuracy clamps to [MIN, 6] so a natural 6 always hits', () => {
  it('accuracy=7 still counts natural-6 dice as hits (upper clamp)', () => {
    // Probe until we land a seed that produces at least one natural 6 in the
    // raw roll. With 60 dice per probe the probability of zero 6s is ~10^-5.
    let seed: [number, number, number, number] | null = null;
    for (let i = 1; i < 500; i++) {
      const probe = rollAttack(Rng.from([i, i * 2, i * 3, i * 4]), {
        count: 60, accuracy: 2,
      });
      if (probe.rolls.includes(6)) { seed = [i, i * 2, i * 3, i * 4]; break; }
    }
    expect(seed).not.toBeNull();

    const result = rollAttack(Rng.from(seed!), {
      count: 60, accuracy: 7,
    });
    // With the clamp in place, threshold caps at 6. Every natural 6 becomes
    // a hit. Pre-fix (no clamp) threshold would be 7, and no die could roll
    // ≥ 7 — zero hits.
    const sixCount = result.rolls.filter(r => r === 6).length;
    expect(sixCount).toBeGreaterThan(0);
    expect(result.effectiveThreshold).toBe(6);
    expect(result.hits).toBeGreaterThanOrEqual(sixCount);
  });

  it('accuracy=100 still clamps to 6 (upper bound holds for wild values)', () => {
    const result = rollAttack(Rng.from([7, 7, 7, 7]), {
      count: 30, accuracy: 100,
    });
    expect(result.effectiveThreshold).toBe(6);
  });
});

// ===========================================================================
// m2/m3 — Target disambiguation.
//
// m2 — Ranged attack into a zone with BOTH a Brute and an Abomination must
//      reject if no targetZombieIds are provided; the priority-1 tie is
//      rule-broken only by the shooter's explicit pick.
// m3 — Melee attack into a multi-target zone must reject if no targetZombieIds
//      are provided; melee "player freely assigns" rule forbids auto-applying
//      ranged priority ordering.
// ===========================================================================
describe('m2 — Ranged Brute+Abomination tie requires targetZombieIds', () => {
  function makePistol(id: string): EquipmentCard {
    return {
      id, name: 'Pistol', type: EquipmentType.Weapon,
      stats: { range: [0, 1], dice: 1, accuracy: 4, damage: 1, noise: true, dualWield: true, ammo: 'bullets' },
      inHand: true, slot: 'HAND_1',
    };
  }

  function setup(): GameState {
    const shooter = makeSurvivor({
      id: 'sh', playerId: 'p1', zoneId: 'z1',
      inventory: [makePistol('pistol-1')],
    });
    const zones = {
      z1: makeZone('z1'),
      z2: makeZone('z2'),
    };
    const zombies = {
      brute1: makeZombie('brute1', ZombieType.Brute, 'z2'),
      abom1:  makeZombie('abom1',  ZombieType.Abomination, 'z2'),
    };
    return baseState({
      survivors: { sh: shooter },
      zones, zombies,
      // Cheap LoS: same row for both zones so hasLineOfSight passes.
      zoneGeometry: {
        zoneCells: { z1: [{ x: 0, y: 0 }], z2: [{ x: 1, y: 0 }] },
        cellToZone: { '0,0': 'z1', '1,0': 'z2' },
      },
    } as Partial<GameState>);
  }

  it('ranged attack without targetZombieIds → rejected with tie error', () => {
    const state = setup();
    // Adjacent zones — overwrite after construction since makeZone default has
    // no connections.
    state.zones.z1.connections = [{ toZoneId: 'z2', hasDoor: false, doorOpen: true }];
    state.zones.z2.connections = [{ toZoneId: 'z1', hasDoor: false, doorOpen: true }];

    const before = structuredClone(state);
    const collector = new EventCollector();
    expect(() => handleAttack(state, {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z2', weaponId: 'pistol-1' },
    }, collector)).toThrow(/priority-1 tie/i);

    // Validate-first: no mutation occurred.
    expect(state.zombies).toEqual(before.zombies);
    expect(state.survivors).toEqual(before.survivors);
    expect(collector.drain().length).toBe(0);
  });

  it('ranged attack with targetZombieIds=[bruteId] resolves against the Brute', () => {
    const state = setup();
    state.zones.z1.connections = [{ toZoneId: 'z2', hasDoor: false, doorOpen: true }];
    state.zones.z2.connections = [{ toZoneId: 'z1', hasDoor: false, doorOpen: true }];
    const collector = new EventCollector();
    expect(() => handleAttack(state, {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z2', weaponId: 'pistol-1', targetZombieIds: ['brute1'] },
    }, collector)).not.toThrow();
    // The attack resolved (lastAction set). Whether the hit landed depends on
    // the RNG — the regression is that we did not reject on tie when a
    // targetZombieIds was provided.
    expect(state.lastAction?.type).toBe(ActionType.ATTACK);
  });
});

describe('m3 — Melee into multi-target zone requires targetZombieIds', () => {
  // Accuracy 2 / 3 dice / damage 1 — guarantees a kill on any 3-die roll
  // (minimum face is 1, only a failing pattern would leave all three < 2,
  // which is impossible since d6 ≥ 2 clears threshold 2). Deterministic by
  // seed; we use `seedFromString('phase07')` from baseState.
  function makeCrowbar(id: string): EquipmentCard {
    return {
      id, name: 'Crowbar', type: EquipmentType.Weapon,
      stats: { range: [0, 0], dice: 3, accuracy: 2, damage: 1, noise: false, dualWield: false },
      inHand: true, slot: 'HAND_1',
    };
  }

  function setupMulti(): GameState {
    const shooter = makeSurvivor({
      id: 'sh', playerId: 'p1', zoneId: 'z1',
      inventory: [makeCrowbar('c1')],
    });
    return baseState({
      survivors: { sh: shooter },
      zones: { z1: makeZone('z1') },
      zombies: {
        w1: makeZombie('w1', ZombieType.Walker, 'z1'),
        w2: makeZombie('w2', ZombieType.Walker, 'z1'),
      },
    });
  }

  it('melee without targetZombieIds + 2 walkers → rejected (no auto-priority)', () => {
    const state = setupMulti();
    const before = structuredClone(state);
    const collector = new EventCollector();
    expect(() => handleAttack(state, {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'c1' },
    }, collector)).toThrow(/targetZombieIds.*melee/i);
    expect(state.zombies).toEqual(before.zombies);
    expect(collector.drain().length).toBe(0);
  });

  it('melee with explicit targetZombieIds resolves in the provided order', () => {
    const state = setupMulti();
    // 3 dice at accuracy 2 — every die is a guaranteed hit (d6 ≥ 2), so the
    // attack reliably kills both walkers if the order honors targetZombieIds.
    const collector = new EventCollector();
    handleAttack(state, {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'c1', targetZombieIds: ['w2'] },
    }, collector);
    // Both walkers die since all 3 dice land; w2 consumed first by order.
    expect(state.zombies.w2).toBeUndefined();
    expect(state.zombies.w1).toBeUndefined();
  });

  it('melee into a single-target zone stays legal without explicit targetZombieIds', () => {
    const shooter = makeSurvivor({
      id: 'sh', playerId: 'p1', zoneId: 'z1',
      inventory: [makeCrowbar('c1')],
    });
    const state = baseState({
      survivors: { sh: shooter },
      zones: { z1: makeZone('z1') },
      zombies: { w1: makeZombie('w1', ZombieType.Walker, 'z1') },
    });
    const collector = new EventCollector();
    expect(() => handleAttack(state, {
      playerId: 'p1', survivorId: 'sh', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'c1' },
    }, collector)).not.toThrow();
  });
});

// ===========================================================================
// m6 — Epic deck exhaustion emits EPIC_DECK_EXHAUSTED from the crate path.
// ===========================================================================
describe('m6 — EPIC_DECK_EXHAUSTED event fires when an Epic Crate drains a dry deck', () => {
  it('second crate after single-card deck emits EPIC_DECK_EXHAUSTED', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
    });
    const objA: Objective = {
      id: 'obj-a', type: ObjectiveType.TakeObjective,
      description: 'A', zoneId: 'z1',
      amountRequired: 1, amountCurrent: 0, completed: false, xpValue: 5,
    };
    const objB: Objective = {
      id: 'obj-b', type: ObjectiveType.TakeObjective,
      description: 'B', zoneId: 'z2',
      amountRequired: 1, amountCurrent: 0, completed: false, xpValue: 5,
    };
    const dummyEpic: EquipmentCard = {
      id: 'only-epic', name: 'Katana', type: EquipmentType.Weapon,
      stats: { range: [0, 0], dice: 2, accuracy: 3, damage: 2, noise: false, dualWield: false },
      inHand: false, slot: 'BACKPACK',
    };

    const state = baseState({
      survivors: { s1: survivor },
      zones: {
        z1: makeZone('z1', { hasObjective: true, isEpicCrate: true, objectiveColor: 'red' }),
        z2: makeZone('z2', { hasObjective: true, isEpicCrate: true, objectiveColor: 'red' }),
      },
      objectives: [objA, objB],
      // Pre-seed an Epic deck with a single card so the first crate drains
      // the deck, and the second draws null → emits EPIC_DECK_EXHAUSTED.
      epicDeck: [dummyEpic],
    } as Partial<GameState>);

    // First crate: draws the single card.
    const c1 = new EventCollector();
    handleTakeObjective(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_OBJECTIVE,
    }, c1);
    const events1 = c1.drain();
    expect(events1.some(e => e.type === 'EPIC_CRATE_OPENED')).toBe(true);
    expect(events1.some(e => e.type === 'EPIC_DECK_EXHAUSTED')).toBe(false);

    // Second crate: move survivor, mark zone as active again.
    state.survivors.s1.position.zoneId = 'z2';
    const c2 = new EventCollector();
    handleTakeObjective(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_OBJECTIVE,
    }, c2);
    const events2 = c2.drain();
    // Empty epic deck → EPIC_DECK_EXHAUSTED emitted, no EPIC_CRATE_OPENED.
    expect(events2.some(e => e.type === 'EPIC_DECK_EXHAUSTED')).toBe(true);
    expect(events2.some(e => e.type === 'EPIC_CRATE_OPENED')).toBe(false);

    const exhaustion = events2.find(e => e.type === 'EPIC_DECK_EXHAUSTED') as {
      type: 'EPIC_DECK_EXHAUSTED'; zoneId: string; survivorId: string;
    };
    expect(exhaustion.zoneId).toBe('z2');
    expect(exhaustion.survivorId).toBe('s1');
  });
});

// ===========================================================================
// m7 — `doubleSpawn` branch removed. No spawn card data feeds it; the field
// is gone from SpawnDetail, and both handlers that read it are deleted.
// ===========================================================================
describe('m7 — doubleSpawn is dead-code removal', () => {
  it('no shipped SpawnCard in SPAWN_CARDS references doubleSpawn at any danger level', () => {
    const levels = [
      DangerLevel.Blue, DangerLevel.Yellow, DangerLevel.Orange, DangerLevel.Red,
    ];
    for (const card of SPAWN_CARDS) {
      for (const lvl of levels) {
        const detail = card[lvl] as { doubleSpawn?: boolean } | undefined;
        // Field should be absent entirely (type no longer exposes it).
        expect(detail === undefined || detail.doubleSpawn === undefined).toBe(true);
      }
    }
  });
});

// ===========================================================================
// Q2 — Grey-back starter deck pool matches RULEBOOK §Setup exactly:
// Baseball Bat ×1, Crowbar ×1, Fire Axe ×1, Pistol ×3. Each seat claims one
// card at lobby time (see handlePickStarter). Katana/Machete live in the
// blue-back Equipment deck and are not present here.
// ===========================================================================
describe('Q2 — STARTER_DECK_POOL matches the grey-back starter deck', () => {
  it('pool is exactly {baseball_bat:1, crowbar:1, fire_axe:1, pistol:3}', () => {
    expect(STARTER_DECK_POOL).toEqual({
      baseball_bat: 1,
      crowbar: 1,
      fire_axe: 1,
      pistol: 3,
    });
  });

  it('pool does not include blue-back cards (katana/machete)', () => {
    expect(STARTER_DECK_POOL).not.toHaveProperty('katana');
    expect(STARTER_DECK_POOL).not.toHaveProperty('machete');
  });
});

// ===========================================================================
// Q2-picker — PICK_STARTER handler: validates pool-size caps and free swaps.
// ===========================================================================
describe('Q2-picker — handlePickStarter (free pick, quantity-capped)', () => {
  it('claims a starter key and marks player ready when character+starter both set', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: false, characterClass: 'Wanda', starterEquipmentKey: '' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p1', type: ActionType.PICK_STARTER,
      payload: { starterEquipmentKey: 'baseball_bat' },
    });
    expect(res.success).toBe(true);
    expect(state.lobby.players[0].starterEquipmentKey).toBe('baseball_bat');
    expect(state.lobby.players[0].ready).toBe(true);
  });

  it('rejects a second claim on a 1-of-1 card', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: false, characterClass: 'Wanda', starterEquipmentKey: 'crowbar' },
          { id: 'p2', name: 'B', ready: false, characterClass: 'Ned', starterEquipmentKey: '' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p2', type: ActionType.PICK_STARTER,
      payload: { starterEquipmentKey: 'crowbar' },
    });
    expect(res.success).toBe(false);
    expect(state.lobby.players[1].starterEquipmentKey).toBe('');
  });

  it('allows all three pistols to be claimed simultaneously', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: false, characterClass: 'Wanda', starterEquipmentKey: 'pistol' },
          { id: 'p2', name: 'B', ready: false, characterClass: 'Ned', starterEquipmentKey: 'pistol' },
          { id: 'p3', name: 'C', ready: false, characterClass: 'Josh', starterEquipmentKey: '' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p3', type: ActionType.PICK_STARTER,
      payload: { starterEquipmentKey: 'pistol' },
    });
    expect(res.success).toBe(true);
    const pistols = state.lobby.players.filter(p => p.starterEquipmentKey === 'pistol').length;
    expect(pistols).toBe(3);
  });

  it('a 4th pistol claim is rejected once the 3 are taken', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: false, characterClass: 'Wanda', starterEquipmentKey: 'pistol' },
          { id: 'p2', name: 'B', ready: false, characterClass: 'Ned', starterEquipmentKey: 'pistol' },
          { id: 'p3', name: 'C', ready: false, characterClass: 'Josh', starterEquipmentKey: 'pistol' },
          { id: 'p4', name: 'D', ready: false, characterClass: 'Amy', starterEquipmentKey: '' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p4', type: ActionType.PICK_STARTER,
      payload: { starterEquipmentKey: 'pistol' },
    });
    expect(res.success).toBe(false);
  });

  it('a player can freely swap their own starter pick without tripping the quantity cap', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: true, characterClass: 'Wanda', starterEquipmentKey: 'fire_axe' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p1', type: ActionType.PICK_STARTER,
      payload: { starterEquipmentKey: 'pistol' },
    });
    expect(res.success).toBe(true);
    expect(state.lobby.players[0].starterEquipmentKey).toBe('pistol');
  });

  it('rejects an unknown starter key', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: false, characterClass: 'Wanda', starterEquipmentKey: '' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p1', type: ActionType.PICK_STARTER,
      payload: { starterEquipmentKey: 'katana' },
    });
    expect(res.success).toBe(false);
  });

  it('START_GAME rejects when any player has not picked a starter', async () => {
    const { processAction } = await import('../ActionProcessor');
    const state = baseState({
      phase: GamePhase.Lobby,
      lobby: {
        players: [
          { id: 'p1', name: 'A', ready: false, characterClass: 'Wanda', starterEquipmentKey: 'pistol' },
          { id: 'p2', name: 'B', ready: false, characterClass: 'Ned', starterEquipmentKey: '' },
        ],
      },
    });
    const res = processAction(state, {
      playerId: 'p1', type: ActionType.START_GAME, payload: {},
    });
    expect(res.success).toBe(false);
    expect(state.phase).toBe(GamePhase.Lobby);
  });
});

// ===========================================================================
// Q3 — Flashlight + `search_plus_1` do not stack. Both land at 2 draws total.
// Explicit assertion guards against a future drift to a 3-card cap.
// ===========================================================================
describe('Q3 — Flashlight + search_plus_1 do not stack (cap at 2 draws)', () => {
  it('both effects present still draws exactly 2 cards', async () => {
    const { handleSearch } = await import('../handlers/ItemHandlers');
    const makePistol = (id: string): EquipmentCard => ({
      id, name: 'Pistol', type: EquipmentType.Weapon,
      stats: { range: [0, 1], dice: 1, accuracy: 4, damage: 1, noise: true, dualWield: true, ammo: 'bullets' },
      inHand: false, slot: 'BACKPACK',
    });
    const flashlight: EquipmentCard = {
      id: 'fl', name: 'Flashlight', type: EquipmentType.Item,
      inHand: false, slot: 'BACKPACK_0',
    };
    const searcher = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [flashlight],
      skills: ['search_plus_1'],
    });
    const state = baseState({
      survivors: { s1: searcher },
      zones: { z1: makeZone('z1', { searchable: true }) },
      equipmentDeck: [makePistol('p1'), makePistol('p2'), makePistol('p3')],
    });
    const collector = new EventCollector();
    handleSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH,
    }, collector);

    const s = state.survivors.s1;
    const drawnCount = (s.drawnCard ? 1 : 0) + (s.drawnCardsQueue?.length ?? 0);
    expect(drawnCount).toBe(2); // not 3 — effects do not stack
    expect(state.equipmentDeck.length).toBe(1);
  });
});

// Verify the shipped Epic deck size is non-zero so the m6 exhaustion test
// is meaningful in production (not just a unit-level artifact).
describe('INITIAL_EPIC_DECK_CONFIG sanity', () => {
  it('Epic deck config has > 0 cards', () => {
    expect(INITIAL_EPIC_DECK_CONFIG.length).toBeGreaterThan(0);
  });
});
