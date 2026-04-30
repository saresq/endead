// src/client/editor/markerClasses.ts
//
// Cell-level marker mutex: placing any class member on a cell removes any
// pre-existing class member of the SAME class on that cell. Cross-class
// markers (e.g. Spawn + Objective on the same cell) coexist.
//
// Extracted from MapEditor.ts so the rules can be unit-tested without DOM.

import { MapMarker, MarkerType } from '../../types/Map';

export const OBJECTIVE_CLASS_MARKERS: ReadonlyArray<MarkerType> = [
  MarkerType.Objective,
  MarkerType.ObjectiveBlue,
  MarkerType.ObjectiveGreen,
  MarkerType.EpicCrate,
];

export const SPAWN_CLASS_MARKERS: ReadonlyArray<MarkerType> = [
  MarkerType.ZombieSpawn,
  MarkerType.ZombieSpawnBlue,
  MarkerType.ZombieSpawnGreen,
];

export function getMarkerClass(type: MarkerType): ReadonlyArray<MarkerType> | null {
  if (OBJECTIVE_CLASS_MARKERS.includes(type)) return OBJECTIVE_CLASS_MARKERS;
  if (SPAWN_CLASS_MARKERS.includes(type)) return SPAWN_CLASS_MARKERS;
  return null;
}

/**
 * Pure: returns the new markers array after a placement at (zx, zy) of
 * `type`. Removes any same-class marker on the same cell first. Does NOT
 * append the new marker — the caller does that, after running its own
 * zone-uniqueness / unique-per-map checks.
 */
export function applyMarkerClassMutex(
  markers: ReadonlyArray<MapMarker>,
  type: MarkerType,
  zx: number,
  zy: number,
): { markers: MapMarker[]; replaced: boolean } {
  const klass = getMarkerClass(type);
  if (!klass) return { markers: [...markers], replaced: false };
  const before = markers.length;
  const next = markers.filter(
    m => !(klass.includes(m.type) && m.x === zx && m.y === zy),
  );
  return { markers: next, replaced: next.length !== before };
}

/**
 * Zone-level class mutex (superset of cell-level). Returns the markers
 * array with any pre-existing same-class member removed from anywhere in
 * the target zone, not just the target cell. Falls back to cell-only when
 * the zone is unresolved.
 *
 * Why: the ScenarioCompiler folds multiple spawn / objective markers in a
 * single zone into one zone-level entry — colored variants silently win
 * over yellow/normal. Enforcing the rule at placement time makes the
 * editor truthful about that and matches the "one Spawn Zone per zone"
 * Zombicide rule.
 */
export function applyZoneClassMutex(
  markers: ReadonlyArray<MapMarker>,
  type: MarkerType,
  zx: number,
  zy: number,
  zoneId: string | undefined,
  cellToZone: Readonly<Record<string, string>> | undefined,
): { markers: MapMarker[]; replaced: boolean } {
  const klass = getMarkerClass(type);
  if (!klass) return { markers: [...markers], replaced: false };
  const before = markers.length;
  const next = markers.filter(m => {
    if (!klass.includes(m.type)) return true;
    if (m.x === zx && m.y === zy) return false;
    if (zoneId && cellToZone) {
      const mk = `${m.x},${m.y}`;
      if (cellToZone[mk] === zoneId) return false;
    }
    return true;
  });
  return { markers: next, replaced: next.length !== before };
}
