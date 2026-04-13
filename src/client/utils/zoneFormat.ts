// src/client/utils/zoneFormat.ts
//
// Converts raw zone IDs (z_x_y, sz_x_y, bz_x_y) into human-readable labels.

import { ZoneId } from '../../types/GameState';

/**
 * Format a zone ID into a human-readable label.
 *
 * Examples:
 *   z_3_5   -> "Cell (3, 5)"
 *   sz_1_2  -> "Street Zone (1, 2)"
 *   bz_4_0  -> "Building Zone (4, 0)"
 *   unknown -> returned as-is
 */
export function formatZoneId(zoneId: ZoneId): string {
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
