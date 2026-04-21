import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { handleResolveSearch, handleSearch } from '../handlers/ItemHandlers';
import { EventCollector } from '../EventCollector';
import { XPManager } from '../XPManager';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

// --- Fixture helpers ---------------------------------------------------------

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
  inventory?: EquipmentCard[];
  skills?: string[];
  actionsRemaining?: number;
  experience?: number;
  characterClass?: string;
  dangerLevel?: DangerLevel;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: opts.id,
    characterClass: opts.characterClass ?? 'Tester',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: 3,
    wounds: 0,
    experience: opts.experience ?? 0,
    dangerLevel: opts.dangerLevel ?? DangerLevel.Blue,
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

function makeZone(id: string, overrides: Partial<Zone> = {}): Zone {
  return {
    id,
    connections: [],
    isBuilding: true,
    hasNoise: false,
    noiseTokens: 0,
    searchable: true,
    isDark: false,
    hasBeenSpawned: false,
    ...overrides,
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
    seed: seedFromString(opts.seed ?? 'phase06'),
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

function makePistol(id: string): EquipmentCard {
  return {
    id, name: 'Pistol',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 1, accuracy: 4, damage: 1, noise: true, dualWield: true, ammo: 'bullets' },
    inHand: false, slot: 'BACKPACK',
  };
}

function makeCrowbar(id: string): EquipmentCard {
  return {
    id, name: 'Crowbar',
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 1, accuracy: 4, damage: 1, noise: false, dualWield: false },
    inHand: false, slot: 'BACKPACK',
    canOpenDoor: true, openDoorNoise: true,
  };
}

function makeAaahh(id: string): EquipmentCard {
  return {
    id, name: 'Aaahh!!',
    type: EquipmentType.Item,
    keywords: ['aaahh'],
    inHand: false, slot: 'BACKPACK',
  };
}

// ===========================================================================
// M5 — handleResolveSearch EQUIP path validates the target slot.
// ===========================================================================
describe('M5 — EQUIP slot validation on handleResolveSearch', () => {
  function setupWithDrawn(drawn: EquipmentCard): GameState {
    const survivor = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    survivor.drawnCard = drawn;
    return makeState({ survivors: [survivor], zones: { z1: makeZone('z1') } });
  }

  it('rejects an unknown hand slot (HAND_3)', () => {
    const state = setupWithDrawn(makeCrowbar('drawn-1'));
    const collector = new EventCollector();
    expect(() => handleResolveSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'HAND_3' },
    }, collector)).toThrow(/Invalid slot/);
    // Draw not consumed — card still pending.
    expect(state.survivors.s1.drawnCard?.id).toBe('drawn-1');
    expect(state.survivors.s1.inventory.length).toBe(0);
  });

  it('rejects an unknown backpack slot (BACKPACK_7)', () => {
    const state = setupWithDrawn(makeCrowbar('drawn-2'));
    const collector = new EventCollector();
    expect(() => handleResolveSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'BACKPACK_7' },
    }, collector)).toThrow(/Invalid slot/);
    expect(state.survivors.s1.drawnCard?.id).toBe('drawn-2');
  });

  it('rejects the staging sentinels BACKPACK and DISCARD', () => {
    const state1 = setupWithDrawn(makeCrowbar('d-b'));
    const collector = new EventCollector();
    expect(() => handleResolveSearch(state1, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'BACKPACK' },
    }, collector)).toThrow(/Invalid slot/);

    const state2 = setupWithDrawn(makeCrowbar('d-d'));
    expect(() => handleResolveSearch(state2, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'DISCARD' },
    }, collector)).toThrow(/Invalid slot/);
  });

  it('accepts a valid hand slot and records the card', () => {
    const state = setupWithDrawn(makeCrowbar('drawn-3'));
    const collector = new EventCollector();
    handleResolveSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'HAND_1' },
    }, collector);
    expect(state.survivors.s1.drawnCard).toBeUndefined();
    const equipped = state.survivors.s1.inventory.find(c => c.id === 'drawn-3');
    expect(equipped).toBeDefined();
    expect(equipped!.slot).toBe('HAND_1');
    expect(equipped!.inHand).toBe(true);
  });

  it('accepts a valid backpack slot (BACKPACK_0)', () => {
    const state = setupWithDrawn(makeCrowbar('drawn-4'));
    const collector = new EventCollector();
    handleResolveSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'BACKPACK_0' },
    }, collector);
    const equipped = state.survivors.s1.inventory.find(c => c.id === 'drawn-4');
    expect(equipped!.slot).toBe('BACKPACK_0');
    expect(equipped!.inHand).toBe(false);
  });

  it('rejects equipping when all 5 slots are already full (validateLoadout guard)', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [
        { ...makeCrowbar('h1'), slot: 'HAND_1', inHand: true },
        { ...makeCrowbar('h2'), slot: 'HAND_2', inHand: true },
        { ...makeCrowbar('b0'), slot: 'BACKPACK_0' },
        { ...makeCrowbar('b1'), slot: 'BACKPACK_1' },
        { ...makeCrowbar('b2'), slot: 'BACKPACK_2' },
      ],
    });
    survivor.drawnCard = makeCrowbar('drawn-full');
    const state = makeState({ survivors: [survivor], zones: { z1: makeZone('z1') } });
    const collector = new EventCollector();
    // All named slots are occupied; attempting EQUIP should throw on the
    // "slot occupied" check before the validateLoadout guard, but either way
    // nothing is added.
    expect(() => handleResolveSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.RESOLVE_SEARCH,
      payload: { action: 'EQUIP', targetSlot: 'HAND_1' },
    }, collector)).toThrow();
    expect(state.survivors.s1.inventory.length).toBe(5);
    expect(state.survivors.s1.drawnCard?.id).toBe('drawn-full');
  });
});

// ===========================================================================
// m5 — Matching Set routes its duplicate draw through DeckService.drawCardWhere.
// ===========================================================================
describe('m5 — Matching Set routes through DeckService', () => {
  it('pulls a duplicate from the deck; deck no longer contains that card; emits DECK_SHUFFLED (RULEBOOK "Shuffle deck after")', () => {
    const searcher = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['matching_set'],
    });
    const state = makeState({
      survivors: [searcher],
      zones: { z1: makeZone('z1') },
      // Deck: [pistol-1 (drawn first), pistol-2 (matched dup), decoy].
      equipmentDeck: [
        makePistol('pistol-1'),
        makePistol('pistol-2'),
        makeCrowbar('crowbar-decoy'),
      ],
    });
    const collector = new EventCollector();
    handleSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH,
    }, collector);

    // drawnCard is the first pistol; duplicate pistol-2 queued as +1.
    const s = state.survivors.s1;
    expect(s.drawnCard?.id).toBe('pistol-1');
    expect(s.drawnCardsQueue?.some(c => c.id === 'pistol-2')).toBe(true);
    // The crowbar remains in the deck (single-card shuffle is a no-op).
    expect(state.equipmentDeck.map(c => c.id)).toEqual(['crowbar-decoy']);
    // RULEBOOK.md:543 — "Shuffle deck after" must leak through as a
    // DECK_SHUFFLED event so clients re-sync and deck order stays private.
    const events = collector.drain();
    expect(events.some(e => e.type === 'DECK_SHUFFLED')).toBe(true);
  });

  it('routes a matched Aaahh! through handleAaahhTrap (walker spawn + discard)', () => {
    // Contrived: a dual-wield weapon named "Aaahh!!" to force the predicate
    // to match an aaahh-keyword card. Belt-and-braces guarantee that even in
    // this pathological case the trap helper runs, the player does not get a
    // duplicate, and no CARD_DRAWN fires for the trap.
    const trapAsDup: EquipmentCard = {
      id: 'trap-dup', name: 'Aaahh!!',
      type: EquipmentType.Item,
      keywords: ['aaahh'],
      inHand: false, slot: 'BACKPACK',
    };
    const fakeDual: EquipmentCard = {
      id: 'fake-dual', name: 'Aaahh!!',
      type: EquipmentType.Weapon,
      stats: { range: [0, 0], dice: 1, accuracy: 4, damage: 1, noise: false, dualWield: true },
      inHand: false, slot: 'BACKPACK',
    };
    const searcher = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['matching_set'],
    });
    const state = makeState({
      survivors: [searcher],
      zones: { z1: makeZone('z1') },
      equipmentDeck: [fakeDual, trapAsDup],
    });
    const collector = new EventCollector();
    handleSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH,
    }, collector);

    const s = state.survivors.s1;
    // Duplicate was NOT granted; trap card is in discard; walker spawned.
    expect(s.drawnCard?.id).toBe('fake-dual');
    expect(s.drawnCardsQueue ?? []).toEqual([]);
    expect(state.equipmentDiscard.some(c => c.id === 'trap-dup')).toBe(true);
    const spawned = Object.values(state.zombies).filter(
      z => z.type === ZombieType.Walker && z.position.zoneId === 'z1',
    );
    expect(spawned.length).toBe(1);
    const events = collector.drain();
    expect(events.some(e => e.type === 'ZOMBIE_SPAWNED')).toBe(true);
    // Exactly one CARD_DRAWN (the initial fake-dual) — none for the trap.
    expect(events.filter(e => e.type === 'CARD_DRAWN').length).toBe(1);
  });

  it('emits DECK_SHUFFLED when the duplicate can only be found after reshuffle', () => {
    // Deck contains ONLY the first pistol (drawn). Matching search for a
    // duplicate finds no match in the (now-empty) deck, so it reshuffles
    // discard into the deck, finds the second pistol, and emits DECK_SHUFFLED.
    const searcher = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['matching_set'],
    });
    const state = makeState({
      survivors: [searcher],
      zones: { z1: makeZone('z1') },
      equipmentDeck: [makePistol('pistol-top')],
      equipmentDiscard: [makePistol('pistol-discarded')],
    });
    const collector = new EventCollector();
    handleSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH,
    }, collector);

    const s = state.survivors.s1;
    expect(s.drawnCard?.id).toBe('pistol-top');
    expect(s.drawnCardsQueue?.some(c => c.id === 'pistol-discarded')).toBe(true);
    // Discard was drained into the deck for the reshuffle, and the matched
    // duplicate was spliced out of the reshuffled deck.
    expect(state.equipmentDiscard.length).toBe(0);
    expect(state.equipmentDeck.length).toBe(0);
    const events = collector.drain();
    expect(events.some(e => e.type === 'DECK_SHUFFLED')).toBe(true);
  });

  it('no duplicate found → no mutation to discard/deck beyond the original draw', () => {
    // Only the drawn pistol exists; no match anywhere for matching_set.
    const searcher = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1', skills: ['matching_set'],
    });
    const state = makeState({
      survivors: [searcher],
      zones: { z1: makeZone('z1') },
      equipmentDeck: [makePistol('pistol-solo')],
    });
    const collector = new EventCollector();
    handleSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH,
    }, collector);

    const s = state.survivors.s1;
    expect(s.drawnCard?.id).toBe('pistol-solo');
    expect(s.drawnCardsQueue ?? []).toEqual([]);
    expect(state.equipmentDeck).toEqual([]);
    expect(state.equipmentDiscard).toEqual([]);
  });
});

// ===========================================================================
// m4 — Mid-turn skill unlock seeds per-turn free pools.
// Rule: "Skills take effect immediately when acquired" (RULEBOOK §Skills).
// ===========================================================================
describe('m4 — Mid-turn free-pool skill unlock seeds the current turn', () => {
  it('unlockSkill(plus_1_free_search) bumps freeSearchesRemaining by +1', () => {
    const s = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    expect(s.freeSearchesRemaining).toBe(0);
    const next = XPManager.unlockSkill(s, 'plus_1_free_search');
    expect(next.skills).toContain('plus_1_free_search');
    expect(next.freeSearchesRemaining).toBe(1);
  });

  it('unlockSkill(plus_1_free_move) bumps freeMovesRemaining by +1', () => {
    const s = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const next = XPManager.unlockSkill(s, 'plus_1_free_move');
    expect(next.freeMovesRemaining).toBe(1);
  });

  it('unlockSkill(plus_1_free_melee) bumps freeMeleeRemaining by +1', () => {
    const s = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const next = XPManager.unlockSkill(s, 'plus_1_free_melee');
    expect(next.freeMeleeRemaining).toBe(1);
  });

  it('unlockSkill(plus_1_free_ranged) bumps freeRangedRemaining by +1', () => {
    const s = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const next = XPManager.unlockSkill(s, 'plus_1_free_ranged');
    expect(next.freeRangedRemaining).toBe(1);
  });

  it('unlockSkill(plus_1_free_combat) bumps freeCombatsRemaining by +1', () => {
    // Task spec listed four free-pool skills explicitly, but plus_1_free_combat
    // is a real Orange/Red option (SkillRegistry) reseeded by endRound and
    // bound by the same "skills take effect immediately" rule.
    const s = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1' });
    const next = XPManager.unlockSkill(s, 'plus_1_free_combat');
    expect(next.freeCombatsRemaining).toBe(1);
  });

  it('addXP auto-unlock path crossing Yellow threshold bumps actionsRemaining mid-turn', () => {
    // Wanda's Yellow skill is plus_1_action (single option → auto-unlocks on
    // threshold cross). A mid-turn kill that crosses 7 XP must grant the
    // extra Action immediately (rulebook §Skills "Skills take effect
    // immediately when acquired").
    const s = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      characterClass: 'Wanda',
      experience: 6,
      dangerLevel: DangerLevel.Blue,
      actionsRemaining: 1,
      skills: ['plus_1_zone_per_move'], // Wanda's pre-unlocked Blue skill
    });
    const next = XPManager.addXP(s, 1); // 6 → 7 → Yellow threshold
    expect(next.dangerLevel).toBe(DangerLevel.Yellow);
    expect(next.skills).toContain('plus_1_action');
    expect(next.actionsPerTurn).toBe(4);
    expect(next.actionsRemaining).toBe(2); // immediate mid-turn bump
  });

  it('unlockSkill(plus_1_action) still bumps actionsPerTurn AND actionsRemaining (unchanged)', () => {
    const s = makeSurvivor({ id: 's1', playerId: 'p1', zoneId: 'z1', actionsRemaining: 2 });
    const next = XPManager.unlockSkill(s, 'plus_1_action');
    expect(next.actionsPerTurn).toBe(4);
    expect(next.actionsRemaining).toBe(3);
  });

  it('already-known skill is a no-op (pool is not bumped twice)', () => {
    const s = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      skills: ['plus_1_free_search'],
    });
    s.freeSearchesRemaining = 1; // seeded by earlier unlock
    const next = XPManager.unlockSkill(s, 'plus_1_free_search');
    expect(next).toBe(s); // identity — early-return path
    expect(next.freeSearchesRemaining).toBe(1);
  });

  it('end-to-end: mid-turn plus_1_free_search makes the next Search cost 0 AP', () => {
    // Survivor in a searchable zone, pre-seed state simulates "just unlocked".
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      actionsRemaining: 2,
    });
    const zones = { z1: makeZone('z1', { searchable: true }) };
    const state = makeState({
      survivors: [survivor], zones,
      equipmentDeck: [makeCrowbar('c-1')],
    });

    // Mid-turn unlock (equivalent to handleChooseSkill → XPManager.unlockSkill).
    state.survivors.s1 = XPManager.unlockSkill(state.survivors.s1, 'plus_1_free_search');
    expect(state.survivors.s1.freeSearchesRemaining).toBe(1);

    const apBefore = state.survivors.s1.actionsRemaining;
    const res = processAction(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH, payload: {},
    });
    expect(res.success).toBe(true);
    // Free Search was consumed, AP unchanged.
    expect(res.newState!.survivors.s1.actionsRemaining).toBe(apBefore);
    expect(res.newState!.survivors.s1.freeSearchesRemaining).toBe(0);
    expect(res.newState!.survivors.s1.hasSearched).toBe(true);
  });
});
