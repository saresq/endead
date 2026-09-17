import { describe, it, expect } from 'vitest';
import { validateMapPlayability } from '../MapPlayability';
import { loadShippedMaps, registerShippedTileDefinitions } from './shippedDataFixture';

// The shipped database seeds a fresh install and the Docker volume's first run,
// so an unplayable map in it reaches players.
describe('shipped map set', () => {
  it('every map in data/endead.db is playable', () => {
    // Mirror the server's boot: the registry the maps compile against is the
    // one stored in the database, not the hardcoded defaults.
    registerShippedTileDefinitions();

    const maps = loadShippedMaps();
    expect(maps.length).toBeGreaterThan(0);

    const unplayable = maps
      .map(m => ({ name: m.name, reasons: validateMapPlayability(m) }))
      .filter(r => r.reasons.length > 0);
    expect(unplayable).toEqual([]);
  });
});
