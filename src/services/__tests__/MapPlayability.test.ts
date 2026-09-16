import { describe, it, expect } from 'vitest';
import { validateMapPlayability } from '../MapPlayability';
import { ScenarioMap, MapMarker, MarkerType, WinConditionConfig } from '../../types/Map';
import { TILE_CELLS_PER_SIDE } from '../../config/Layout';
import { makeScenarioMap } from './winConditionHelpers';

// '2R' is an all-street tile, so every cell of it merges into one street zone —
// which is exactly the shape that makes markers collapse together.
function buildMap(markers: MapMarker[], winConditions: WinConditionConfig[] = [{ type: 'TAKE_OBJECTIVE', amount: 1 }]): ScenarioMap {
  return makeScenarioMap({
    gridSize: TILE_CELLS_PER_SIDE,
    tiles: [{ id: 't1', tileId: '2R', x: 0, y: 0, rotation: 0 }],
    markers,
    winConditions,
  });
}

const at = (type: MarkerType, x: number, y: number): MapMarker => ({ type, x, y });

const NO_ACTIVE_SPAWN = 'No spawn zone active on turn 1 — every spawn zone is colour-dormant';

describe('validateMapPlayability', () => {
  it('accepts a map with a player start, a plain spawn and a win condition', () => {
    const map = buildMap([
      at(MarkerType.PlayerStart, 0, 0),
      at(MarkerType.ZombieSpawn, 5, 5),
    ]);
    expect(validateMapPlayability(map)).toEqual([]);
  });

  it('rejects a map with no player start', () => {
    const map = buildMap([at(MarkerType.ZombieSpawn, 5, 5)]);
    expect(validateMapPlayability(map)).toContain('No player start');
  });

  it('rejects a map whose only spawn is colour-dormant (the `123` shape)', () => {
    const map = buildMap([
      at(MarkerType.PlayerStart, 0, 0),
      at(MarkerType.ZombieSpawnGreen, 5, 5),
    ]);
    expect(validateMapPlayability(map)).toEqual([NO_ACTIVE_SPAWN]);
  });

  it('rejects a plain spawn that collapses into a coloured zone (the `Wasd` shape)', () => {
    const markers = [
      at(MarkerType.PlayerStart, 0, 0),
      at(MarkerType.ZombieSpawn, 5, 5),
      at(MarkerType.ZombieSpawnBlue, 8, 5),
    ];
    // Marker-level reading sees a plain ZOMBIE_SPAWN and would pass the map.
    expect(markers.some(m => m.type === MarkerType.ZombieSpawn)).toBe(true);
    // Compiled, both markers sit in one zone and that zone inherits the colour.
    expect(validateMapPlayability(buildMap(markers))).toEqual([NO_ACTIVE_SPAWN]);
  });

  it('rejects a map with no win condition', () => {
    const map = buildMap([
      at(MarkerType.PlayerStart, 0, 0),
      at(MarkerType.ZombieSpawn, 5, 5),
    ], []);
    expect(validateMapPlayability(map)).toEqual(['No win condition']);
  });

  it('reports every failing rule at once', () => {
    expect(validateMapPlayability(buildMap([], []))).toHaveLength(3);
  });
});
