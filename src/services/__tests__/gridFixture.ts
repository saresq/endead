// Hand-built grid boards for LOS / zombie movement tests. Mirrors the
// compiler's rules: street-street edges are open, anything else is a wall
// unless overridden with 'door' or 'doorway'.

import { EquipmentCard, EquipmentType, GameState, WeaponStats, Zombie, ZombieType, Zone } from '../../types/GameState';
import { makeZone, makeState, StateOverrides } from './winConditionHelpers';
import { assignBuildings } from '../ScenarioCompiler';

type EdgeClass = 'open' | 'wall' | 'crosswalk' | 'door' | 'doorway';

export function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1},${y1}`;
  const b = `${x2},${y2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface GridSpec {
  /** Rows of space-separated zone ids; `.` = no cell. */
  rows: string[];
  buildings?: string[];
  /** Edge overrides keyed by `edgeKey`. */
  edges?: Record<string, EdgeClass>;
  /** Zone pairs "a|b" whose door starts open. Doors default closed. */
  openDoors?: string[];
}

export function makeGrid(spec: GridSpec): Pick<GameState, 'zones' | 'zoneGeometry' | 'edgeClassMap'> {
  const buildings = new Set(spec.buildings ?? []);
  const zones: Record<string, Zone> = {};
  const zoneCells: Record<string, { x: number; y: number }[]> = {};
  const cellToZone: Record<string, string> = {};
  const edgeClassMap: Record<string, string> = {};

  spec.rows.forEach((row, y) => {
    row.trim().split(/\s+/).forEach((zoneId, x) => {
      if (zoneId === '.') return;
      zones[zoneId] ??= makeZone({ id: zoneId, isBuilding: buildings.has(zoneId) });
      (zoneCells[zoneId] ??= []).push({ x, y });
      cellToZone[`${x},${y}`] = zoneId;
    });
  });

  const connect = (a: string, b: string, cls: EdgeClass) => {
    const existing = zones[a].connections.find(c => c.toZoneId === b);
    if (existing) return;
    const hasDoor = cls === 'door';
    const doorOpen = !hasDoor || (spec.openDoors ?? []).some(p => p === `${a}|${b}` || p === `${b}|${a}`);
    zones[a].connections.push({ toZoneId: b, hasDoor, doorOpen });
    zones[b].connections.push({ toZoneId: a, hasDoor, doorOpen });
  };

  for (const [cell, zoneId] of Object.entries(cellToZone)) {
    const [x, y] = cell.split(',').map(Number);
    for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
      const other = cellToZone[`${nx},${ny}`];
      if (!other || other === zoneId) continue;
      const ek = edgeKey(x, y, nx, ny);
      const bothStreet = !buildings.has(zoneId) && !buildings.has(other);
      const cls = spec.edges?.[ek] ?? (bothStreet ? 'open' : 'wall');
      edgeClassMap[ek] = cls;
      if (cls === 'wall') continue;
      if (cls !== 'door' && cls !== 'doorway' && !bothStreet) continue;
      connect(zoneId, other, cls);
    }
  }

  // Same building grouping the compiler does, so zone-level building rules
  // (spawn eligibility) behave in fixtures as they do in a real scenario.
  assignBuildings(zones, '');

  return { zones, zoneGeometry: { zoneCells, cellToZone }, edgeClassMap };
}

export function makeGridState(spec: GridSpec, over: StateOverrides = {}): GameState {
  const grid = makeGrid(spec);
  const state = makeState({ ...over, zones: grid.zones });
  state.zoneGeometry = grid.zoneGeometry;
  state.edgeClassMap = grid.edgeClassMap;
  return state;
}

export function makeZombie(id: string, type: ZombieType, zoneId: string): Zombie {
  return { id, type, position: { x: 0, y: 0, zoneId }, wounds: 0 };
}

export function makeWeapon(id: string, stats: Partial<WeaponStats> = {}): EquipmentCard {
  return {
    id,
    equipmentId: id,
    name: id,
    type: EquipmentType.Weapon,
    inHand: true,
    slot: 'HAND_1',
    stats: { range: [0, 0], dice: 1, accuracy: 4, damage: 1, noise: false, dualWield: false, ...stats },
  };
}

/** Host p1 (active, survivor s1) and p2 (survivor s2). */
export function withTwoPlayers(state: GameState): GameState {
  state.players = ['p1', 'p2'];
  state.activePlayerIndex = 0;
  state.firstPlayerTokenIndex = 0;
  state.lobby.players = [
    { id: 'p1', name: 'P1', ready: true, characterClass: 'Wanda' } as any,
    { id: 'p2', name: 'P2', ready: true, characterClass: 'Wanda' } as any,
  ];
  return state;
}
