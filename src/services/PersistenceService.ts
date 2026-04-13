import Database from 'better-sqlite3';
import path from 'path';
import { GameState } from '../types/GameState';
import { ScenarioMap } from '../types/Map';

const DB_PATH = path.resolve(process.cwd(), 'data/endead.db');

class PersistenceService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS tile_definitions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `);
  }

  // --- Room State ---

  saveRoom(roomId: string, state: GameState): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO rooms (id, state, updated_at) VALUES (?, ?, ?)`
    );
    stmt.run(roomId, JSON.stringify(state), Date.now());
  }

  loadRoom(roomId: string): GameState | null {
    const row = this.db.prepare('SELECT state FROM rooms WHERE id = ?').get(roomId) as
      | { state: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.state) as GameState;
    } catch {
      return null;
    }
  }

  deleteRoom(roomId: string): void {
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
  }

  /**
   * Delete rooms that haven't been updated in the given interval (ms).
   */
  cleanupStaleRooms(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const result = this.db.prepare('DELETE FROM rooms WHERE updated_at < ?').run(cutoff);
    return result.changes;
  }

  // --- Maps ---

  saveMap(map: ScenarioMap): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO maps (id, name, data, created_at) VALUES (?, ?, ?, ?)`
    );
    stmt.run(map.id, map.name, JSON.stringify(map), Date.now());
  }

  loadMap(mapId: string): ScenarioMap | null {
    const row = this.db.prepare('SELECT data FROM maps WHERE id = ?').get(mapId) as
      | { data: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.data) as ScenarioMap;
    } catch {
      return null;
    }
  }

  loadAllMaps(): ScenarioMap[] {
    const rows = this.db.prepare('SELECT data FROM maps ORDER BY created_at DESC').all() as {
      data: string;
    }[];
    const maps: ScenarioMap[] = [];
    for (const row of rows) {
      try {
        maps.push(JSON.parse(row.data));
      } catch {
        // skip corrupt entries
      }
    }
    return maps;
  }

  deleteMap(mapId: string): void {
    this.db.prepare('DELETE FROM maps WHERE id = ?').run(mapId);
  }

  // --- Tile Definitions ---

  saveTileDefinition(id: string, def: object): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO tile_definitions (id, data, updated_at) VALUES (?, ?, ?)`
    );
    stmt.run(id, JSON.stringify(def), Date.now());
  }

  deleteAllTileDefinitions(): void {
    this.db.prepare('DELETE FROM tile_definitions').run();
  }

  loadAllTileDefinitions(): object[] {
    const rows = this.db.prepare('SELECT data FROM tile_definitions ORDER BY id').all() as {
      data: string;
    }[];
    const defs: object[] = [];
    for (const row of rows) {
      try {
        defs.push(JSON.parse(row.data));
      } catch { /* skip corrupt */ }
    }
    return defs;
  }

  tileDefinitionCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM tile_definitions').get() as { cnt: number };
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }
}

export const persistenceService = new PersistenceService();
