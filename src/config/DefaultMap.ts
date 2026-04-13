// src/config/DefaultMap.ts
//
// Default "City Blocks" scenario map — the built-in map used when no
// custom map is selected.  Passed through compileScenario() which uses
// tile definitions for zone classification and street zone merging.

import { ScenarioMap, MarkerType } from '../types/Map';
import { TILE_CELLS_PER_SIDE } from './Layout';

/**
 * 2x2 tile grid (4 tiles). Zone sub-cells use 30x30 grid per tile.
 *
 * Coordinates scaled from original 3x3 by factor of 10.
 */
export const DEFAULT_MAP: ScenarioMap = {
  id: 'city-blocks',
  name: 'City Blocks',
  width: 2,
  height: 2,
  gridSize: TILE_CELLS_PER_SIDE,
  tiles: [
    { id: 'tile-0-0', tileId: '1V', x: 0, y: 0, rotation: 0 },
    { id: 'tile-1-0', tileId: '2V', x: 1, y: 0, rotation: 0 },
    { id: 'tile-0-1', tileId: '3V', x: 0, y: 1, rotation: 0 },
    { id: 'tile-1-1', tileId: '4V', x: 1, y: 1, rotation: 0 },
  ],
  markers: [
    { type: MarkerType.PlayerStart, x: 0, y: 20 },
    { type: MarkerType.ZombieSpawn, x: 40, y: 20 },
    { type: MarkerType.ZombieSpawn, x: 20, y: 30 },
    { type: MarkerType.Exit, x: 20, y: 40 },
    { type: MarkerType.Objective, x: 0, y: 0 },
  ],
};
