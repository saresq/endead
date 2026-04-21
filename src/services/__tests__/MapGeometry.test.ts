import { describe, it, expect } from 'vitest';
import { compileScenario, assertZoneGeometryComplete } from '../ScenarioCompiler';
import { DEFAULT_MAP } from '../../config/DefaultMap';
import { getZoneCells, hasLineOfSight } from '../handlers/handlerUtils';
import { GameState, Zone, ObjectiveType } from '../../types/GameState';
import { MarkerType, ScenarioMap } from '../../types/Map';

function makeMinimalZone(id: string, connections: Zone['connections'] = []): Zone {
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

describe('B3 — map geometry is required', () => {
  it('compileScenario emits non-empty zoneCells for every compiled zone', () => {
    const compiled = compileScenario(DEFAULT_MAP);
    expect(Object.keys(compiled.zones).length).toBeGreaterThan(0);
    for (const zoneId of Object.keys(compiled.zones)) {
      const cells = compiled.zoneGeometry.zoneCells[zoneId];
      expect(cells, `expected zoneCells[${zoneId}]`).toBeDefined();
      expect(cells.length).toBeGreaterThan(0);
    }
  });

  it('assertZoneGeometryComplete throws with a clear message when a zone lacks cells', () => {
    const zones: Record<string, Zone> = { z1: makeMinimalZone('z1') };
    expect(() => assertZoneGeometryComplete(zones, {})).toThrow(
      /zone "z1" has no cells in zoneGeometry/,
    );
    expect(() => assertZoneGeometryComplete(zones, { z1: [] })).toThrow(
      /zone "z1" has no cells in zoneGeometry/,
    );
  });

  it('getZoneCells throws when zoneGeometry is missing entirely', () => {
    const state = {
      zones: { z1: makeMinimalZone('z1') },
      zoneGeometry: undefined,
    } as unknown as GameState;
    expect(() => getZoneCells(state, 'z1')).toThrow(/no cells in zoneGeometry/);
  });

  it('getZoneCells throws when a zone has no cells instead of returning []', () => {
    const state = {
      zones: { z1: makeMinimalZone('z1') },
      zoneGeometry: { zoneCells: { z1: [] }, cellToZone: {} },
    } as unknown as GameState;
    expect(() => getZoneCells(state, 'z1')).toThrow(/no cells in zoneGeometry/);
  });

  it('hasLineOfSight surfaces the error instead of silently returning false when geometry is missing', () => {
    const state = {
      zones: {
        a: makeMinimalZone('a'),
        b: makeMinimalZone('b'),
      },
      zoneGeometry: undefined,
    } as unknown as GameState;
    expect(() => hasLineOfSight(state, 'a', 'b')).toThrow(/no cells in zoneGeometry/);
  });

  it('hasLineOfSight still works on a valid same-row street layout with real geometry', () => {
    const state = {
      zones: {
        a: makeMinimalZone('a', [{ toZoneId: 'b', hasDoor: false, doorOpen: true }]),
        b: makeMinimalZone('b', [{ toZoneId: 'a', hasDoor: false, doorOpen: true }]),
      },
      zoneGeometry: {
        zoneCells: {
          a: [{ x: 0, y: 0 }],
          b: [{ x: 1, y: 0 }],
        },
        cellToZone: { '0,0': 'a', '1,0': 'b' },
      },
    } as unknown as GameState;
    expect(hasLineOfSight(state, 'a', 'b')).toBe(true);
  });

  it('MarkerType.EpicCrate marker compiles to an Epic Crate zone with a TakeObjective', () => {
    // Swap DEFAULT_MAP's Objective marker for an EpicCrate at the same cell.
    const map: ScenarioMap = {
      ...DEFAULT_MAP,
      markers: DEFAULT_MAP.markers.map(m =>
        m.type === MarkerType.Objective ? { ...m, type: MarkerType.EpicCrate } : m,
      ),
    };
    const compiled = compileScenario(map);

    const epicZones = Object.values(compiled.zones).filter(z => z.isEpicCrate);
    expect(epicZones.length).toBe(1);
    expect(epicZones[0].hasObjective).toBe(true);

    // Compiler emits one TakeObjective per objective zone — the EpicCrate
    // marker participates in that list, so the objective is playable.
    const takeObjs = compiled.objectives.filter(o => o.type === ObjectiveType.TakeObjective);
    expect(takeObjs.length).toBe(1);
    expect(takeObjs[0].zoneId).toBe(epicZones[0].id);
  });

  it('hasLineOfSight blocks through walls on a valid map (no silent no-LOS fallback)', () => {
    const state = {
      zones: {
        a: makeMinimalZone('a'),
        b: makeMinimalZone('b'),
      },
      zoneGeometry: {
        zoneCells: {
          a: [{ x: 0, y: 0 }],
          b: [{ x: 2, y: 0 }],
        },
        cellToZone: { '0,0': 'a', '2,0': 'b' },
      },
    } as unknown as GameState;
    expect(hasLineOfSight(state, 'a', 'b')).toBe(false);
  });
});
