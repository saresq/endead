
// src/services/MapPlayability.ts
//
// One definition of "playable", shared by the server (POST /api/maps and the
// `playable` flag on GET /api/maps) and the editor's validation panel.
//
// It works on compileScenario output, not on the raw marker list: markers that
// sit in the same compiled zone collapse together, so a plain spawn marker a
// few cells from a coloured one yields a single *coloured* zone that never
// spawns on turn 1. Reading the markers alone misses that.

import { ScenarioMap, MarkerType } from '../types/Map';
import { compileScenario, CompiledScenario } from './ScenarioCompiler';

/**
 * `compiled` defaults to compiling the map, which is what the server wants.
 * A caller that already holds a fresh compilation of this same map — the
 * editor, which compiles for its preview on every edit — passes it in rather
 * than paying for a second pass.
 */
export function validateMapPlayability(
  map: ScenarioMap,
  compiled: CompiledScenario = compileScenario(map),
): string[] {
  const reasons: string[] = [];

  // compileScenario falls back to an arbitrary zone when no PlayerStart marker
  // exists, so the marker itself is the honest check.
  const start = (map.markers || []).find(m => m.type === MarkerType.PlayerStart);
  if (!start || !compiled.zoneGeometry.cellToZone[`${start.x},${start.y}`]) {
    reasons.push('No player start');
  }

  const hasActiveSpawn = compiled.spawnZoneIds.some(
    id => compiled.zones[id] && !compiled.zones[id].spawnColor,
  );
  if (!hasActiveSpawn) {
    reasons.push('No spawn zone active on turn 1 — every spawn zone is colour-dormant');
  }

  if (compiled.objectives.length === 0) {
    reasons.push('No win condition');
  }

  return reasons;
}
