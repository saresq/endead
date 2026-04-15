// src/client/utils/zoneFormat.ts
//
// Converts raw zone IDs (z_x_y, sz_x_y, bz_x_y) into human-readable labels.

import { ZoneId, GameState } from '../../types/GameState';

/** Cached spawn number map — rebuilt whenever game state changes. */
let _cachedSpawnMap: Map<string, number> | null = null;
let _cachedStateRef: GameState | null = null;

function getSpawnMap(state: GameState): Map<string, number> {
  if (_cachedStateRef === state && _cachedSpawnMap) return _cachedSpawnMap;
  const map = new Map<string, number>();
  if (state.spawnZoneIds) {
    state.spawnZoneIds.forEach((id, i) => map.set(id, i + 1));
  } else {
    let idx = 1;
    for (const zone of Object.values(state.zones)) {
      if (zone.spawnPoint) map.set(zone.id, idx++);
    }
  }
  _cachedSpawnMap = map;
  _cachedStateRef = state;
  return map;
}

/**
 * Format a zone ID into a human-readable label.
 *
 * When a GameState is provided, spawn zones display as "Spawner 1", etc.
 *
 * Examples:
 *   z_3_5   -> "Cell (3, 5)"
 *   sz_1_2  -> "Street Zone (1, 2)"
 *   bz_4_0  -> "Building Zone (4, 0)"
 *   spawn zone -> "Spawner 1"
 *   unknown -> returned as-is
 */
export function formatZoneId(zoneId: ZoneId, state?: GameState): string {
  // Check for spawn zone label
  if (state) {
    const spawnMap = getSpawnMap(state);
    const spawnNum = spawnMap.get(zoneId);
    if (spawnNum !== undefined) {
      return `Spawner ${spawnNum}`;
    }
  }

  const parts = zoneId.split('_');

  if (parts.length === 3) {
    const prefix = parts[0];
    const x = parts[1];
    const y = parts[2];

    switch (prefix) {
      case 'z':
        return `Cell (${x}, ${y})`;
      case 'sz':
        return `Street Zone (${x}, ${y})`;
      case 'bz':
        return `Building Zone (${x}, ${y})`;
      default:
        return zoneId;
    }
  }

  return zoneId;
}

/**
 * Format an action type enum value into readable text.
 *
 * Examples:
 *   "MOVE"          -> "Move"
 *   "OPEN_DOOR"     -> "Open Door"
 *   "TRADE_START"   -> "Trade Start"
 *   "END_TURN"      -> "End Turn"
 */
export function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
