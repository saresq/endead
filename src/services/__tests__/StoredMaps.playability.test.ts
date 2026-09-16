import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import { validateMapPlayability } from '../MapPlayability';
import { registerTileDefinitions } from '../../config/TileDefinitions';
import { repairExternalEdges } from '../TileDefinitionService';
import { ScenarioMap } from '../../types/Map';
import { TileDefinition } from '../../types/TileDefinition';

// The shipped database seeds a fresh install and the Docker volume's first run,
// so an unplayable map in it reaches players. Read-only: never touch the WAL.
const DB_PATH = path.resolve(process.cwd(), 'data/endead.db');

describe('shipped map set', () => {
  it('every map in data/endead.db is playable', () => {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
      // Mirror the server's boot: the registry the maps compile against is the
      // one stored in the database, not the hardcoded defaults.
      const defs = (db.prepare('SELECT data FROM tile_definitions').all() as { data: string }[])
        .map(r => JSON.parse(r.data) as TileDefinition);
      for (const def of defs) repairExternalEdges(def);
      if (defs.length > 0) registerTileDefinitions(defs);

      const maps = (db.prepare('SELECT data FROM maps').all() as { data: string }[])
        .map(r => JSON.parse(r.data) as ScenarioMap);

      expect(maps.length).toBeGreaterThan(0);
      const unplayable = maps
        .map(m => ({ name: m.name, reasons: validateMapPlayability(m) }))
        .filter(r => r.reasons.length > 0);
      expect(unplayable).toEqual([]);
    } finally {
      db.close();
    }
  });
});
