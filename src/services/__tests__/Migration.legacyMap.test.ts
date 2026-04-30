import { describe, it, expect } from 'vitest';
import {
  isLegacyScenarioMap,
  migrateImportedMap,
  buildV2ScenarioMap,
} from '../MapMigration';
import { compileScenario } from '../ScenarioCompiler';
import { ScenarioMap, MarkerType } from '../../types/Map';
import { ObjectiveType } from '../../types/GameState';
import {
  validateInFlightGameStateSchema,
} from '../GameStateSchema';

describe('isLegacyScenarioMap', () => {
  it('treats undefined schemaVersion as legacy', () => {
    expect(isLegacyScenarioMap({ tiles: [], markers: [] })).toBe(true);
  });

  it('treats schemaVersion: 1 as legacy', () => {
    expect(isLegacyScenarioMap({ schemaVersion: 1 })).toBe(true);
  });

  it('treats schemaVersion: 2 as current', () => {
    expect(isLegacyScenarioMap({ schemaVersion: 2 })).toBe(false);
  });

  it('treats non-objects as legacy (defensive)', () => {
    expect(isLegacyScenarioMap(null)).toBe(true);
    expect(isLegacyScenarioMap(undefined)).toBe(true);
    expect(isLegacyScenarioMap('hi')).toBe(true);
  });
});

describe('migrateImportedMap', () => {
  it('returns empty winConditions and isLegacy=true for v1 maps', () => {
    const v1 = {
      name: 'old map',
      tiles: [{ id: 't1' }],
      markers: [{ type: MarkerType.Exit, x: 0, y: 0 }],
    };
    const result = migrateImportedMap(v1);
    expect(result.isLegacy).toBe(true);
    expect(result.winConditions).toEqual([]);
    expect(result.tiles).toEqual(v1.tiles);
    expect(result.markers).toEqual(v1.markers);
    expect(result.name).toBe('old map');
  });

  it('preserves authored winConditions for v2 maps', () => {
    const v2 = {
      schemaVersion: 2,
      name: 'new map',
      tiles: [],
      markers: [],
      winConditions: [
        { type: 'REACH_EXIT' },
        { type: 'TAKE_OBJECTIVE', amount: 3 },
      ],
    };
    const result = migrateImportedMap(v2);
    expect(result.isLegacy).toBe(false);
    expect(result.winConditions).toEqual(v2.winConditions);
  });

  it('deep-clones winConditions so editor edits do not mutate the import payload', () => {
    const v2 = {
      schemaVersion: 2,
      tiles: [],
      markers: [],
      winConditions: [{ type: 'TAKE_OBJECTIVE', amount: 1 }],
    };
    const result = migrateImportedMap(v2);
    (result.winConditions[0] as any).amount = 99;
    expect((v2.winConditions[0] as any).amount).toBe(1);
  });

  it('falls back to empty array when v2 map omits the winConditions block', () => {
    const v2NoWc = { schemaVersion: 2, tiles: [], markers: [] };
    const result = migrateImportedMap(v2NoWc);
    expect(result.isLegacy).toBe(false);
    // Editor decides whether to seed a default; helper returns [] so the
    // caller is in control.
    expect(result.winConditions).toEqual([]);
  });
});

describe('buildV2ScenarioMap', () => {
  it('emits schemaVersion 2 and round-trips winConditions', () => {
    const out = buildV2ScenarioMap({
      id: 'm1',
      name: 'n',
      width: 1,
      height: 1,
      gridSize: 30,
      tiles: [],
      markers: [],
      winConditions: [{ type: 'REACH_EXIT' }],
    });
    expect(out.schemaVersion).toBe(2);
    expect(out.winConditions).toEqual([{ type: 'REACH_EXIT' }]);
  });

  it('throws if winConditions is empty (save gate)', () => {
    expect(() =>
      buildV2ScenarioMap({
        id: 'm1', name: 'n', width: 1, height: 1, gridSize: 30,
        tiles: [], markers: [], winConditions: [],
      })
    ).toThrow(/at least one/i);
  });
});

describe('Migration legacy-map round-trip via ScenarioCompiler', () => {
  it('a v1 map with no winConditions still compiles via legacy fallback (does not crash)', () => {
    // Sanity check: even before the editor migration UX runs, the compiler
    // does not crash on a v1 fixture. Empty markers → empty objectives is
    // fine — the importer flow is what surfaces the missing-conditions
    // banner, not the compiler.
    const v1: ScenarioMap = {
      id: 'legacy',
      name: 'legacy',
      width: 1,
      height: 1,
      tiles: [],
      markers: [],
    } as ScenarioMap;
    expect(() => compileScenario(v1)).not.toThrow();
    const compiled = compileScenario(v1);
    expect(Array.isArray(compiled.objectives)).toBe(true);
  });

  it('a migrated v2 map only emits objectives it authored', () => {
    const migrated: ScenarioMap = {
      id: 'migrated',
      name: 'migrated',
      width: 1,
      height: 1,
      schemaVersion: 2,
      tiles: [],
      markers: [],
      winConditions: [{ type: 'KILL_ZOMBIE', zombieType: 'ANY', amount: 3 }],
    };
    const compiled = compileScenario(migrated);
    expect(compiled.objectives).toHaveLength(1);
    expect(compiled.objectives[0].type).toBe(ObjectiveType.KillZombie);
  });
});

describe('validateInFlightGameStateSchema (Phase F gate)', () => {
  it('passes a Lobby-phase save regardless of new fields', () => {
    const lobbySave = { phase: 'LOBBY', survivors: {}, zones: {} };
    expect(validateInFlightGameStateSchema(lobbySave)).toEqual({ ok: true });
  });

  it('rejects an in-flight save missing spawnColorActivation', () => {
    const oldSave = {
      phase: 'PLAYERS',
      epicDeck: [],
      epicDiscard: [],
      objectives: [],
    };
    const r = validateInFlightGameStateSchema(oldSave);
    expect(r.ok).toBe(false);
  });

  it('rejects an in-flight save missing epicDeck/epicDiscard', () => {
    const oldSave = {
      phase: 'PLAYERS',
      spawnColorActivation: {},
      objectives: [],
    };
    expect(validateInFlightGameStateSchema(oldSave).ok).toBe(false);
  });

  it('rejects an in-flight save with the legacy `targetId` objective shape', () => {
    const oldSave = {
      phase: 'PLAYERS',
      spawnColorActivation: {},
      epicDeck: [],
      epicDiscard: [],
      objectives: [{ type: 'TAKE_OBJECTIVE', targetId: 'some-zone', completed: false }],
    };
    expect(validateInFlightGameStateSchema(oldSave).ok).toBe(false);
  });

  it('passes a current in-flight save', () => {
    const newSave = {
      phase: 'PLAYERS',
      spawnColorActivation: { BLUE: { activated: false, activatedOnTurn: 0 } },
      epicDeck: [],
      epicDiscard: [],
      objectives: [{ id: 'o1', type: 'REACH_EXIT', completed: false, exitZoneId: 'z1' }],
    };
    expect(validateInFlightGameStateSchema(newSave)).toEqual({ ok: true });
  });

  it('rejects malformed input defensively', () => {
    expect(validateInFlightGameStateSchema(null).ok).toBe(false);
    expect(validateInFlightGameStateSchema('hello' as any).ok).toBe(false);
  });

  it('rejects an in-flight save whose deck cards lack equipmentId', () => {
    // Pre-equipmentId saves have cards like { id: "card-water-30", name: "Water" }
    // — no registry key. Food consumption / CollectItems can't function.
    const legacy = {
      phase: 'PLAYERS',
      spawnColorActivation: {},
      epicDeck: [],
      epicDiscard: [],
      equipmentDeck: [{ id: 'card-water-30', name: 'Water', type: 'ITEM', inHand: false }],
      equipmentDiscard: [],
      survivors: {},
      objectives: [],
    };
    const r = validateInFlightGameStateSchema(legacy);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/equipmentId/);
  });

  it('rejects an in-flight save whose survivor inventory cards lack equipmentId', () => {
    const legacy = {
      phase: 'PLAYERS',
      spawnColorActivation: {},
      epicDeck: [],
      epicDiscard: [],
      equipmentDeck: [],
      equipmentDiscard: [],
      survivors: {
        s1: {
          inventory: [{ id: 'card-rice-1', name: 'Bag of Rice', type: 'ITEM', inHand: false }],
        },
      },
      objectives: [],
    };
    expect(validateInFlightGameStateSchema(legacy).ok).toBe(false);
  });

  it('passes a current save where all cards carry equipmentId', () => {
    const ok = {
      phase: 'PLAYERS',
      spawnColorActivation: {},
      epicDeck: [],
      epicDiscard: [],
      equipmentDeck: [{ id: 'card-water-1', equipmentId: 'water', name: 'Water', type: 'ITEM', inHand: false }],
      equipmentDiscard: [],
      survivors: {
        s1: {
          inventory: [{ id: 'card-rice-1', equipmentId: 'bag_of_rice', name: 'Bag of Rice', type: 'ITEM', inHand: false }],
        },
      },
      objectives: [],
    };
    expect(validateInFlightGameStateSchema(ok)).toEqual({ ok: true });
  });
});
