import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { handleAttack } from '../handlers/CombatHandlers';
import { handleTakeObjective } from '../handlers/ObjectiveHandlers';
import { handleSearch } from '../handlers/ItemHandlers';
import { EventCollector } from '../EventCollector';
import {
  GameState, GamePhase, DangerLevel, EquipmentType, EquipmentCard,
  ObjectiveType,
  Survivor, Zone, Zombie, ZombieType,
} from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { seedFromString } from '../Rng';

function makeMolotov(id = 'molo-1'): EquipmentCard {
  return {
    id, name: 'Molotov',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 0, accuracy: 0, damage: 3, noise: true, dualWield: false, special: 'molotov' },
    inHand: true, slot: 'HAND_1',
  };
}

function makeSurvivor(opts: {
  id: string;
  playerId: string;
  zoneId: string;
  inventory: EquipmentCard[];
  skills?: string[];
  wounds?: number;
  maxHealth?: number;
  actionsRemaining?: number;
}): Survivor {
  return {
    id: opts.id,
    playerId: opts.playerId,
    name: 'Tester',
    characterClass: 'Waitress',
    position: { x: 0, y: 0, zoneId: opts.zoneId },
    actionsPerTurn: 3,
    maxHealth: opts.maxHealth ?? 3,
    wounds: opts.wounds ?? 0,
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

function makeZombie(id: string, zoneId: string, type: ZombieType = ZombieType.Walker): Zombie {
  return {
    id,
    type,
    position: { x: 0, y: 0, zoneId },
    wounds: 0,
    activated: false,
  };
}

function makeState(opts: {
  survivors: Survivor[];
  zones: Record<string, Zone>;
  zombies?: Record<string, Zombie>;
  seed?: string;
}): GameState {
  const survivorMap: Record<string, Survivor> = {};
  for (const s of opts.survivors) survivorMap[s.id] = s;
  // Minimal geometry: each zone gets a single cell on a distinct row so LOS
  // checks (getZoneCells) pass for ranged attacks across adjacent zones.
  const zoneCells: Record<string, { x: number; y: number }[]> = {};
  const cellToZone: Record<string, string> = {};
  let row = 0;
  for (const zid of Object.keys(opts.zones)) {
    zoneCells[zid] = [{ x: 0, y: row }];
    cellToZone[`0,${row}`] = zid;
    row++;
  }
  return {
    id: 'test',
    seed: seedFromString(opts.seed ?? 'phase02'),
    version: 0,
    turn: 1,
    phase: GamePhase.Players,
    lobby: { players: [] },
    spectators: [],
    currentDangerLevel: DangerLevel.Blue,
    players: Array.from(new Set(opts.survivors.map(s => s.playerId))),
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: survivorMap,
    zombies: opts.zombies ?? {},
    zones: opts.zones,
    zoneGeometry: { zoneCells, cellToZone },
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
  } as unknown as GameState;
}

// ===========================================================================
// C4 — Molotov kills everything in the target zone (all actor types, lethal
// damage). The prior buggy behavior dealt 1 wound to survivors and relied on
// standard damage-vs-toughness to remove zombies, leaving Abominations alive.
// ===========================================================================
describe('C4 — Molotov auto-hits every actor in the target zone', () => {
  it('zone with 1 survivor + 1 Abomination + 2 Walkers → Molotov kills all', () => {
    const thrower = makeSurvivor({
      id: 'th', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMolotov('molo-a')],
    });
    const bystander = makeSurvivor({
      id: 'by', playerId: 'p2', zoneId: 'z2',
      inventory: [],
      maxHealth: 3,
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: true }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: true }]),
    };
    const zombies = {
      w1: makeZombie('w1', 'z2', ZombieType.Walker),
      w2: makeZombie('w2', 'z2', ZombieType.Walker),
      abo: makeZombie('abo', 'z2', ZombieType.Abomination),
    };
    const state = makeState({ survivors: [thrower, bystander], zones, zombies });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 'th', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z2', weaponId: 'molo-a' },
    });

    expect(res.success).toBe(true);
    // Every zombie in the zone is removed — Walkers and Abomination alike.
    expect(res.newState!.zombies.w1).toBeUndefined();
    expect(res.newState!.zombies.w2).toBeUndefined();
    expect(res.newState!.zombies.abo).toBeUndefined();
    // Bystander killed — lethal damage, handleSurvivorDeath cleared inventory.
    const by = res.newState!.survivors.by;
    expect(by.wounds).toBe(by.maxHealth);
    expect(by.actionsRemaining).toBe(0);

    // A SURVIVOR_DIED event fired for the bystander.
    const deaths = (res.events ?? []).filter(e => e.type === 'SURVIVOR_DIED');
    expect(deaths.some(e => (e as { survivorId: string }).survivorId === 'by')).toBe(true);

    // All three zombies kill events fired.
    const zombieKills = (res.events ?? []).filter(e => e.type === 'ZOMBIE_KILLED');
    expect(zombieKills.length).toBe(3);
    const killedIds = zombieKills.map(e => (e as { zombieId: string }).zombieId).sort();
    expect(killedIds).toEqual(['abo', 'w1', 'w2']);
  });

  it('bystander survivor at full health in target zone dies from Molotov (pre-fix only applied 1 wound)', () => {
    const thrower = makeSurvivor({
      id: 'th', playerId: 'p1', zoneId: 'z1',
      inventory: [makeMolotov('molo-a')],
    });
    // Healthy bystander with full 3 HP, no pre-existing wounds, no cancel skills.
    // Pre-fix: +=1 wound → survives with 1/3 HP. Post-fix: lethal → dead.
    const bystander = makeSurvivor({
      id: 'by', playerId: 'p2', zoneId: 'z2',
      inventory: [],
      wounds: 0,
      maxHealth: 3,
    });
    const zones = {
      z1: makeZone('z1', [{ toZoneId: 'z2', hasDoor: false, doorOpen: true }]),
      z2: makeZone('z2', [{ toZoneId: 'z1', hasDoor: false, doorOpen: true }]),
    };
    const state = makeState({ survivors: [thrower, bystander], zones });

    const res = processAction(state, {
      playerId: 'p1', survivorId: 'th', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z2', weaponId: 'molo-a' },
    });

    expect(res.success).toBe(true);
    const by = res.newState!.survivors.by;
    expect(by.wounds).toBe(by.maxHealth);
    expect(by.actionsRemaining).toBe(0);
    // SURVIVOR_WOUNDED event carries the lethal amount (2+), not 1.
    const wounded = (res.events ?? []).filter(
      e => e.type === 'SURVIVOR_WOUNDED' && (e as { survivorId: string }).survivorId === 'by',
    );
    expect(wounded.length).toBe(1);
    expect((wounded[0] as { amount: number }).amount).toBe(3);
  });

});

// ===========================================================================
// C6 — Aaahh! trap handling lives in a single helper.
// Both Search and Epic Crate route through handleAaahhTrap; the trap card
// never reaches drawnCard / drawnCardsQueue in either path.
// ===========================================================================
describe('C6 — Aaahh!! trap routing', () => {
  it('Search path: drawing an Aaahh! card spawns a Walker and never enters the picker', () => {
    const searcher = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [],
    });
    const zones = {
      z1: { ...makeZone('z1'), isBuilding: true, searchable: true },
    };
    const state = makeState({ survivors: [searcher], zones });

    const aaahhCard: EquipmentCard = {
      id: 'aaahh-1', name: 'Aaahh!!',
      type: EquipmentType.Item,
      keywords: ['aaahh'],
      inHand: false, slot: 'BACKPACK',
    };
    state.equipmentDeck = [aaahhCard];

    const collector = new EventCollector();
    handleSearch(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.SEARCH,
    }, collector);

    expect(state.survivors.s1.drawnCard).toBeUndefined();
    expect(state.survivors.s1.drawnCardsQueue).toBeUndefined();
    // Card is in equipment discard.
    expect(state.equipmentDiscard.some(c => c.id === 'aaahh-1')).toBe(true);
    // A Walker was spawned in the searcher's zone.
    const spawnedWalkers = Object.values(state.zombies).filter(
      z => z.type === ZombieType.Walker && z.position.zoneId === 'z1',
    );
    expect(spawnedWalkers.length).toBe(1);
    // ZOMBIE_SPAWNED was emitted.
    const events = collector.drain();
    expect(events.some(e => e.type === 'ZOMBIE_SPAWNED')).toBe(true);
    // Nothing CARD_DRAWN for the trap.
    expect(events.some(e => e.type === 'CARD_DRAWN')).toBe(false);
  });

  it('Epic Crate path: drawing epic_aaahh spawns a Walker, no drawnCard, no CARD_DRAWN', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [],
    });
    const zones = {
      z1: { ...makeZone('z1'), hasObjective: true, isEpicCrate: true, objectiveColor: 'red' as const },
    };
    const state = makeState({ survivors: [survivor], zones });
    state.objectives = [{
      id: 'obj-take-z1', type: ObjectiveType.TakeObjective,
      description: 'Take the objective in z1',
      zoneId: 'z1', amountRequired: 1, amountCurrent: 0,
      completed: false, xpValue: 5,
    }];

    const epicAaahh: EquipmentCard = {
      id: 'epic-epic_aaahh-0', name: 'Aaahh!!',
      type: EquipmentType.Item,
      keywords: ['aaahh'],
      inHand: false, slot: 'BACKPACK',
    };
    state.epicDeck = [epicAaahh];

    const collector = new EventCollector();
    handleTakeObjective(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_OBJECTIVE,
    }, collector);

    const s = state.survivors.s1;
    expect(s.drawnCard).toBeUndefined();
    expect(s.drawnCardsQueue).toBeUndefined();
    expect(state.equipmentDiscard.some(c => c.id === 'epic-epic_aaahh-0')).toBe(true);
    // Walker spawned in survivor's zone.
    const spawnedWalkers = Object.values(state.zombies).filter(
      z => z.type === ZombieType.Walker && z.position.zoneId === 'z1',
    );
    expect(spawnedWalkers.length).toBe(1);

    const events = collector.drain();
    // Crate still "opened" — rules-wise the trap is the reward for this crate.
    expect(events.some(e => e.type === 'EPIC_CRATE_OPENED')).toBe(true);
    expect(events.some(e => e.type === 'ZOMBIE_SPAWNED')).toBe(true);
    // CARD_DRAWN MUST NOT fire for a trap.
    expect(events.some(e => e.type === 'CARD_DRAWN')).toBe(false);
  });

  it('Epic Crate path: normal epic card still lands in drawnCard and emits CARD_DRAWN', () => {
    const survivor = makeSurvivor({
      id: 's1', playerId: 'p1', zoneId: 'z1',
      inventory: [],
    });
    const zones = {
      z1: { ...makeZone('z1'), hasObjective: true, isEpicCrate: true, objectiveColor: 'red' as const },
    };
    const state = makeState({ survivors: [survivor], zones });
    state.objectives = [{
      id: 'obj-take-z1', type: ObjectiveType.TakeObjective,
      description: 'Take the objective in z1',
      zoneId: 'z1', amountRequired: 1, amountCurrent: 0,
      completed: false, xpValue: 5,
    }];

    const normalEpic: EquipmentCard = {
      id: 'epic-epic_nailbat-0', name: 'Nailbat',
      type: EquipmentType.Weapon,
      stats: { range: [0, 0], dice: 2, accuracy: 3, damage: 2, noise: false, dualWield: false },
      inHand: false, slot: 'BACKPACK',
    };
    state.epicDeck = [normalEpic];

    const collector = new EventCollector();
    handleTakeObjective(state, {
      playerId: 'p1', survivorId: 's1', type: ActionType.TAKE_OBJECTIVE,
    }, collector);

    expect(state.survivors.s1.drawnCard?.id).toBe('epic-epic_nailbat-0');
    const events = collector.drain();
    expect(events.some(e => e.type === 'EPIC_CRATE_OPENED')).toBe(true);
    expect(events.some(e => e.type === 'CARD_DRAWN')).toBe(true);
    // No walker spawned for non-trap epic.
    expect(Object.values(state.zombies).length).toBe(0);
  });

  it('Hold Your Nose: drawing an Aaahh! on a clear-zone bonus routes through the trap helper, not the picker', () => {
    // Attacker has Hold Your Nose, kills the last zombie in the target zone,
    // and the ensuing equipment draw surfaces an Aaahh!! card. The card must
    // trigger the trap (spawn Walker + discard) and never land in drawnCard.
    const attacker = makeSurvivor({
      id: 'att', playerId: 'p1', zoneId: 'z1',
      inventory: [{
        id: 'crowbar-1', name: 'Crowbar',
        type: EquipmentType.Weapon,
        stats: { range: [0, 0], dice: 1, accuracy: 2, damage: 1, noise: false, dualWield: false },
        inHand: true, slot: 'HAND_1',
      }],
      skills: ['hold_your_nose'],
    });
    const zones = { z1: makeZone('z1') };
    const zombies = { w1: makeZombie('w1', 'z1', ZombieType.Walker) };
    const state = makeState({ survivors: [attacker], zones, zombies });

    // Single Aaahh! trap queued as the next card the deck will deal.
    const aaahhCard: EquipmentCard = {
      id: 'aaahh-hyn', name: 'Aaahh!!',
      type: EquipmentType.Item,
      keywords: ['aaahh'],
      inHand: false, slot: 'BACKPACK',
    };
    state.equipmentDeck = [aaahhCard];

    const res = processAction(state, {
      playerId: 'p1', survivorId: 'att', type: ActionType.ATTACK,
      payload: { targetZoneId: 'z1', weaponId: 'crowbar-1' },
    });
    expect(res.success).toBe(true);

    const att = res.newState!.survivors.att;
    expect(att.drawnCard).toBeUndefined();
    expect(att.drawnCardsQueue).toBeUndefined();
    // Trap card is in the equipment discard pile.
    expect(res.newState!.equipmentDiscard.some(c => c.id === 'aaahh-hyn')).toBe(true);
    // A new Walker exists in the attacker's zone (the original kill plus the trap spawn).
    const walkers = Object.values(res.newState!.zombies).filter(
      z => z.type === ZombieType.Walker && z.position.zoneId === 'z1',
    );
    expect(walkers.length).toBe(1);
    // ZOMBIE_SPAWNED fired; CARD_DRAWN did NOT fire for the trap.
    const events = res.events ?? [];
    expect(events.some(e => e.type === 'ZOMBIE_SPAWNED')).toBe(true);
    expect(events.some(e => e.type === 'CARD_DRAWN')).toBe(false);
  });
});
