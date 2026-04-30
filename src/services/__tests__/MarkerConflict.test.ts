import { describe, it, expect } from 'vitest';
import {
  applyMarkerClassMutex,
  applyZoneClassMutex,
  getMarkerClass,
  OBJECTIVE_CLASS_MARKERS,
  SPAWN_CLASS_MARKERS,
} from '../../client/editor/markerClasses';
import { MapMarker, MarkerType } from '../../types/Map';

const at = (type: MarkerType, x: number, y: number): MapMarker => ({ type, x, y });

describe('marker class membership', () => {
  it('classifies objective-class markers together', () => {
    expect(getMarkerClass(MarkerType.Objective)).toBe(OBJECTIVE_CLASS_MARKERS);
    expect(getMarkerClass(MarkerType.ObjectiveBlue)).toBe(OBJECTIVE_CLASS_MARKERS);
    expect(getMarkerClass(MarkerType.ObjectiveGreen)).toBe(OBJECTIVE_CLASS_MARKERS);
    expect(getMarkerClass(MarkerType.EpicCrate)).toBe(OBJECTIVE_CLASS_MARKERS);
  });

  it('classifies spawn-class markers together', () => {
    expect(getMarkerClass(MarkerType.ZombieSpawn)).toBe(SPAWN_CLASS_MARKERS);
    expect(getMarkerClass(MarkerType.ZombieSpawnBlue)).toBe(SPAWN_CLASS_MARKERS);
    expect(getMarkerClass(MarkerType.ZombieSpawnGreen)).toBe(SPAWN_CLASS_MARKERS);
  });

  it('returns null for non-class markers (PlayerStart, Exit)', () => {
    expect(getMarkerClass(MarkerType.PlayerStart)).toBeNull();
    expect(getMarkerClass(MarkerType.Exit)).toBeNull();
  });
});

describe('applyMarkerClassMutex', () => {
  it('placing ObjectiveBlue on a cell with yellow Objective replaces it', () => {
    const before: MapMarker[] = [at(MarkerType.Objective, 5, 5)];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.ObjectiveBlue, 5, 5);
    expect(replaced).toBe(true);
    expect(markers.find(m => m.type === MarkerType.Objective)).toBeUndefined();
  });

  it('placing ObjectiveBlue on a cell with EpicCrate replaces the EpicCrate', () => {
    const before: MapMarker[] = [at(MarkerType.EpicCrate, 1, 2)];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.ObjectiveBlue, 1, 2);
    expect(replaced).toBe(true);
    expect(markers).toHaveLength(0);
  });

  it('placing ZombieSpawnBlue on a cell with default ZombieSpawn replaces it', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 0, 0)];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.ZombieSpawnBlue, 0, 0);
    expect(replaced).toBe(true);
    expect(markers.find(m => m.type === MarkerType.ZombieSpawn)).toBeUndefined();
  });

  it('cross-class markers (Spawn + Objective on same cell) coexist', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 3, 3)];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.Objective, 3, 3);
    // Adding an objective-class marker doesn't touch a spawn-class marker
    // on the same cell — they coexist.
    expect(replaced).toBe(false);
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe(MarkerType.ZombieSpawn);
  });

  it('does not touch markers on other cells', () => {
    const before: MapMarker[] = [
      at(MarkerType.Objective, 0, 0),
      at(MarkerType.Objective, 1, 1),
    ];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.ObjectiveBlue, 0, 0);
    expect(replaced).toBe(true);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toEqual({ type: MarkerType.Objective, x: 1, y: 1 });
  });

  it('returns markers unchanged for non-class markers (PlayerStart, Exit)', () => {
    const before: MapMarker[] = [at(MarkerType.Objective, 0, 0)];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.PlayerStart, 0, 0);
    expect(replaced).toBe(false);
    expect(markers).toEqual(before);
    // Confirms callers using PlayerStart/Exit drop out of the mutex path.
    expect(applyMarkerClassMutex(before, MarkerType.Exit, 0, 0).replaced).toBe(false);
  });

  it('reports replaced=false when the class is empty on the target cell', () => {
    const before: MapMarker[] = [at(MarkerType.Objective, 9, 9)];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.ObjectiveBlue, 1, 1);
    expect(replaced).toBe(false);
    expect(markers).toEqual(before);
  });

  it('removes ALL same-class markers on the cell (defensive — should be at most 1, but covers fix-up edges)', () => {
    const before: MapMarker[] = [
      at(MarkerType.Objective, 5, 5),
      at(MarkerType.EpicCrate, 5, 5),
    ];
    const { markers, replaced } = applyMarkerClassMutex(before, MarkerType.ObjectiveBlue, 5, 5);
    expect(replaced).toBe(true);
    expect(markers).toHaveLength(0);
  });
});

describe('applyZoneClassMutex', () => {
  // Zone "Z1" spans cells (0,0), (1,0), (2,0). Zone "Z2" is (5,5).
  const cellToZone: Record<string, string> = {
    '0,0': 'Z1',
    '1,0': 'Z1',
    '2,0': 'Z1',
    '5,5': 'Z2',
  };

  it('replaces a normal ZombieSpawn elsewhere in the same zone when placing ZombieSpawnBlue', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 0, 0)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.ZombieSpawnBlue,
      2, 0,
      'Z1',
      cellToZone,
    );
    expect(replaced).toBe(true);
    // Caller appends the new marker — we only assert the existing one is gone.
    expect(markers.find(m => m.type === MarkerType.ZombieSpawn)).toBeUndefined();
    expect(markers).toHaveLength(0);
  });

  it('replaces a ZombieSpawnGreen elsewhere in the same zone when placing a normal ZombieSpawn', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawnGreen, 1, 0)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.ZombieSpawn,
      2, 0,
      'Z1',
      cellToZone,
    );
    expect(replaced).toBe(true);
    expect(markers).toHaveLength(0);
  });

  it('does not touch a same-class marker in a DIFFERENT zone', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 5, 5)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.ZombieSpawnBlue,
      0, 0,
      'Z1',
      cellToZone,
    );
    expect(replaced).toBe(false);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toEqual({ type: MarkerType.ZombieSpawn, x: 5, y: 5 });
  });

  it('cross-class markers in the same zone coexist (Spawn + Objective)', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 0, 0)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.Objective,
      2, 0,
      'Z1',
      cellToZone,
    );
    expect(replaced).toBe(false);
    expect(markers).toHaveLength(1);
    expect(markers[0].type).toBe(MarkerType.ZombieSpawn);
  });

  it('replaces an ObjectiveBlue elsewhere in the same zone when placing an EpicCrate', () => {
    const before: MapMarker[] = [at(MarkerType.ObjectiveBlue, 0, 0)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.EpicCrate,
      1, 0,
      'Z1',
      cellToZone,
    );
    expect(replaced).toBe(true);
    expect(markers).toHaveLength(0);
  });

  it('falls back to cell-only when the zone is unresolved', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 0, 0)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.ZombieSpawnBlue,
      0, 0,
      undefined,
      undefined,
    );
    expect(replaced).toBe(true);
    expect(markers).toHaveLength(0);
  });

  it('keeps cell-level mutex even when zoneId is unresolved but other cells have same-class markers elsewhere', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 9, 9)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.ZombieSpawnBlue,
      0, 0,
      undefined,
      undefined,
    );
    expect(replaced).toBe(false);
    expect(markers).toHaveLength(1);
  });

  it('returns markers unchanged for non-class markers (PlayerStart, Exit)', () => {
    const before: MapMarker[] = [at(MarkerType.ZombieSpawn, 0, 0)];
    const { markers, replaced } = applyZoneClassMutex(
      before,
      MarkerType.PlayerStart,
      1, 0,
      'Z1',
      cellToZone,
    );
    expect(replaced).toBe(false);
    expect(markers).toEqual(before);
  });
});
