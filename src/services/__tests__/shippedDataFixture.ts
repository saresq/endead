// Shared access to the data that actually ships: the tile definitions and maps
// stored in `data/endead.db`.
//
// Tests that compile a map need the tile registry the server boots with. The
// hardcoded defaults in `config/TileDefinitions.ts` only describe `1R`; every
// other id falls back to an all-street placeholder, so a test that compiles a
// real map without this fixture is silently compiling blank street — no
// buildings, no doors, no walls — and proves much less than it looks like.
//
// Read-only, and never opened in WAL-writing mode: the repo commits the db but
// ignores its `-wal`/`-shm` sidecars.

import Database from 'better-sqlite3';
import path from 'path';
import { registerTileDefinitions } from '../../config/TileDefinitions';
import { repairExternalEdges } from '../TileDefinitionService';
import { ScenarioMap } from '../../types/Map';
import { TileDefinition } from '../../types/TileDefinition';

const DB_PATH = path.resolve(process.cwd(), 'data/endead.db');

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function parseRows<T>(rows: { data: string }[]): T[] {
  return rows.map(r => JSON.parse(r.data) as T);
}

/** The stored tile definitions, edges repaired, exactly as `server.ts` loads them. */
export function loadShippedTileDefinitions(): TileDefinition[] {
  const defs = withDb(db =>
    parseRows<TileDefinition>(
      db.prepare('SELECT data FROM tile_definitions ORDER BY id').all() as { data: string }[],
    ),
  );
  for (const def of defs) repairExternalEdges(def);
  return defs;
}

let registered = false;

/**
 * Point the module-global tile registry at the shipped definitions, the way the
 * server does at boot. Idempotent, and scoped to the calling test file — vitest
 * gives each file its own module registry.
 *
 * A test that *wants* the all-street placeholder (compiling `2R` to get one flat
 * zone, say) must not call this.
 */
export function registerShippedTileDefinitions(): TileDefinition[] {
  const defs = loadShippedTileDefinitions();
  if (!registered) {
    registerTileDefinitions(defs);
    registered = true;
  }
  return defs;
}

/** Every map in the shipped db — what a fresh install and the Docker volume's first run get. */
export function loadShippedMaps(): ScenarioMap[] {
  return withDb(db =>
    parseRows<ScenarioMap>(db.prepare('SELECT data FROM maps').all() as { data: string }[]),
  );
}
