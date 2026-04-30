// src/services/MapMigration.ts
//
// Phase F — importer migration helpers.
//
// A v1 map (no `schemaVersion`, or any value other than `2`) is loadable in
// the editor for layout continuity, but the mapper is REQUIRED to author
// `winConditions` before saving. v2 maps round-trip without prompting.

import { ScenarioMap, WinConditionConfig } from '../types/Map';

/**
 * Returns true iff the supplied object is a legacy (pre-v2) scenario map.
 * Anything that is not a plain object with `schemaVersion === 2` is treated
 * as legacy — including completely malformed inputs (callers handle the
 * surrounding "is this even a map?" check separately).
 */
export function isLegacyScenarioMap(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true;
  const sv = (data as { schemaVersion?: unknown }).schemaVersion;
  return sv !== 2;
}

/**
 * Pure migration extraction used by the editor importer. Takes parsed JSON
 * and returns the tiles/markers/winConditions to seed editor state from,
 * plus a flag that the UI surfaces as a non-dismissable banner until the
 * user authors win conditions.
 *
 * Legacy maps deliberately get `winConditions: []` (NOT a default). This
 * makes the editor's existing save-validation block save until at least
 * one condition is configured — that's the migration gate.
 */
export interface MigratedMap {
  tiles: unknown[];
  markers: unknown[];
  winConditions: WinConditionConfig[];
  isLegacy: boolean;
  name: string;
  gridSize?: number;
}

export function migrateImportedMap(data: any): MigratedMap {
  const legacy = isLegacyScenarioMap(data);
  const tiles = Array.isArray(data?.tiles) ? data.tiles : [];
  const markers = Array.isArray(data?.markers) ? data.markers : [];
  const name = typeof data?.name === 'string' ? data.name : '';
  const gridSize = typeof data?.gridSize === 'number' ? data.gridSize : undefined;

  const winConditions: WinConditionConfig[] = legacy
    ? []
    : Array.isArray(data?.winConditions) && data.winConditions.length > 0
      ? JSON.parse(JSON.stringify(data.winConditions))
      : [];

  return { tiles, markers, winConditions, isLegacy: legacy, name, gridSize };
}

/**
 * Caller contract: only invoke when `winConditions.length >= 1`. Returns
 * a fresh v2 ScenarioMap shape ready to write to disk.
 */
export function buildV2ScenarioMap(input: {
  id: string;
  name: string;
  width: number;
  height: number;
  gridSize: number;
  tiles: ScenarioMap['tiles'];
  markers: ScenarioMap['markers'];
  winConditions: WinConditionConfig[];
  crosswalkOverrides?: ScenarioMap['crosswalkOverrides'];
}): ScenarioMap {
  if (input.winConditions.length === 0) {
    throw new Error('buildV2ScenarioMap: winConditions must contain at least one entry');
  }
  return {
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    gridSize: input.gridSize,
    schemaVersion: 2,
    tiles: input.tiles,
    markers: input.markers,
    winConditions: JSON.parse(JSON.stringify(input.winConditions)),
    ...(input.crosswalkOverrides ? { crosswalkOverrides: input.crosswalkOverrides } : {}),
  };
}
