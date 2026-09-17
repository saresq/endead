import { describe, it, expect } from 'vitest';
import { compileScenario } from '../ScenarioCompiler';
import { loadShippedMaps, registerShippedTileDefinitions } from './shippedDataFixture';

// Guards the fixture itself. Without the shipped tile definitions registered,
// `compileScenario` classifies every unknown tile id as street, so a map made of
// 8V/4V/6R/... compiles to one featureless open field: no buildings, no doors,
// no interior walls. A test written against that board asserts almost nothing.
describe('compiling a shipped map', () => {
  const map = loadShippedMaps()[0];

  it('is blank street until the shipped tile definitions are registered', () => {
    expect(map).toBeDefined();
    expect(map.tiles.some(t => t.tileId !== '1R')).toBe(true);

    const blank = compileScenario(map);
    expect(Object.values(blank.cellTypes).every(t => t === 'street')).toBe(true);
    expect(Object.keys(blank.doorPositions)).toHaveLength(0);

    // ...and then the same map with the real registry in place.
    registerShippedTileDefinitions();
    const real = compileScenario(map);

    expect(Object.values(real.cellTypes).some(t => t === 'building')).toBe(true);
    expect(Object.keys(real.doorPositions).length).toBeGreaterThan(0);
    expect(Object.values(real.zones).some(z => z.isBuilding)).toBe(true);
    expect(Object.keys(real.zones).length).toBeGreaterThan(Object.keys(blank.zones).length);
  });
});
