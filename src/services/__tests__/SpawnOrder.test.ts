import { describe, it, expect } from 'vitest';
import { compileScenario } from '../ScenarioCompiler';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { MarkerType, ScenarioMap } from '../../types/Map';
import { DangerLevel, GamePhase, GameState, SpawnCard, ZombieType } from '../../types/GameState';
import { TILE_CELLS_PER_SIDE as TILE } from '../../config/Layout';
import { makeScenarioMap, makeState, makeSurvivor } from './winConditionHelpers';

// Three all-street tiles with a gap between each, so the spawn markers land in
// three separate compiled zones instead of merging into one street.
// Markers are deliberately NOT in left-to-right order: the middle tile's spawn
// is placed first. Placement order is the contract, not geometry.
const LEFT = 5;
const MIDDLE = 2 * TILE + 5;
const RIGHT = 4 * TILE + 5;

function mapWithSpawnsPlaced(order: number[]): ScenarioMap {
  return makeScenarioMap({
    gridSize: TILE,
    tiles: [
      { id: 'a', tileId: '2R', x: 0, y: 0, rotation: 0 },
      { id: 'b', tileId: '2R', x: 2, y: 0, rotation: 0 },
      { id: 'c', tileId: '2R', x: 4, y: 0, rotation: 0 },
    ] as never,
    markers: [
      { type: MarkerType.PlayerStart, x: 1, y: 1 },
      ...order.map(x => ({ type: MarkerType.ZombieSpawn, x, y: 5 })),
    ],
    winConditions: [{ type: 'TAKE_OBJECTIVE', amount: 1 }],
  });
}

/** One Walker per card, ids that say which card it is. */
function pinnedDeck(count: number): SpawnCard[] {
  const walker = { zombies: { [ZombieType.Walker]: 1 } };
  return Array.from({ length: count }, (_, i) => ({
    id: `card-${i + 1}`,
    [DangerLevel.Blue]: walker,
    [DangerLevel.Yellow]: walker,
    [DangerLevel.Orange]: walker,
    [DangerLevel.Red]: walker,
  }));
}

function gameFrom(map: ScenarioMap): GameState {
  const compiled = compileScenario(map);
  const state = makeState({
    phase: GamePhase.Zombies,
    zones: compiled.zones,
    spawnZoneIds: compiled.spawnZoneIds,
    survivors: { s1: makeSurvivor({ id: 's1', zoneId: compiled.playerStartZoneId }) },
  });
  state.zoneGeometry = compiled.zoneGeometry;
  state.edgeClassMap = compiled.edgeClassMap;
  state.spawnDeck = pinnedDeck(compiled.spawnZoneIds.length);
  return state;
}

describe('Spawn order follows marker placement order', () => {
  it('compiles spawnZoneIds in the order the markers were placed, not by position', () => {
    const compiled = compileScenario(mapWithSpawnsPlaced([MIDDLE, LEFT, RIGHT]));
    const zoneOf = (x: number) => compiled.zoneGeometry.cellToZone[`${x},5`];

    expect(compiled.spawnZoneIds).toEqual([zoneOf(MIDDLE), zoneOf(LEFT), zoneOf(RIGHT)]);
  });

  it('follows a different placement order', () => {
    const compiled = compileScenario(mapWithSpawnsPlaced([RIGHT, MIDDLE, LEFT]));
    const zoneOf = (x: number) => compiled.zoneGeometry.cellToZone[`${x},5`];

    expect(compiled.spawnZoneIds).toEqual([zoneOf(RIGHT), zoneOf(MIDDLE), zoneOf(LEFT)]);
  });

  it('draws cards in that order during the Zombie Phase', () => {
    const map = mapWithSpawnsPlaced([MIDDLE, LEFT, RIGHT]);
    const state = gameFrom(map);
    const placedOrder = [...state.spawnZoneIds!];

    const after = ZombiePhaseManager.executeZombiePhase(state);
    const drawn = after.spawnContext?.cards ?? [];

    // Zone n of the placement order receives card n off the top of the deck.
    expect(drawn.map(c => c.zoneId)).toEqual(placedOrder);
    expect(drawn.map(c => c.cardId)).toEqual(['card-1', 'card-2', 'card-3']);
  });

  it('records the ids each Spawn Step card placed', () => {
    const state = gameFrom(mapWithSpawnsPlaced([MIDDLE, LEFT, RIGHT]));
    const after = ZombiePhaseManager.executeZombiePhase(state);
    const cards = after.spawnContext?.cards ?? [];

    // One Walker per card, and the recorded id is the zombie that card placed.
    expect(cards.map(c => c.spawnedIds?.length)).toEqual([1, 1, 1]);
    for (const card of cards) {
      const id = card.spawnedIds![0];
      expect(after.zombies[id].position.zoneId).toBe(card.zoneId);
    }
  });

  it('two markers in one zone are one spawn zone, drawing one card', () => {
    // Street cells merge into a single zone, so two spawn markers on the same
    // stretch of connected street are one spawn point — one card, one spawn.
    // The editor stops an author creating this (`applyZoneClassMutex`); the
    // test pins what the compiler does if one reaches it anyway.
    //
    // NOTE: under Vitest the tile-definition registry holds only empty
    // placeholders (`TileDefinitions.ts` defines just `1R`; the real ones load
    // from SQLite at server start), so a `2R` tile is all street with no
    // crosswalks and everything on it merges. Do not read a shipped map's real
    // zone layout from a test — compile it with the DB definitions loaded.
    const map = makeScenarioMap({
      gridSize: TILE,
      tiles: [{ id: 'a', tileId: '2R', x: 0, y: 0, rotation: 0 }] as never,
      markers: [
        { type: MarkerType.PlayerStart, x: 1, y: 1 },
        { type: MarkerType.ZombieSpawn, x: 5, y: 5 },
        { type: MarkerType.ZombieSpawn, x: 20, y: 20 },
      ],
      winConditions: [{ type: 'TAKE_OBJECTIVE', amount: 1 }],
    });
    const compiled = compileScenario(map);

    expect(compiled.spawnZoneIds).toHaveLength(1);
    expect(compiled.zoneGeometry.cellToZone['5,5'])
      .toBe(compiled.zoneGeometry.cellToZone['20,20']);

    const after = ZombiePhaseManager.executeZombiePhase(gameFrom(map));
    expect(after.spawnContext?.cards).toHaveLength(1);
  });

  it('a zombie lands in every spawn zone, once each', () => {
    const state = gameFrom(mapWithSpawnsPlaced([MIDDLE, LEFT, RIGHT]));

    const after = ZombiePhaseManager.executeZombiePhase(state);

    const zones = Object.values(after.zombies).map(z => z.position.zoneId);
    expect(zones.sort()).toEqual([...state.spawnZoneIds!].sort());
  });
});
