
import { GameState, Zombie, Zone, ZoneId, ZombieType } from '../types/GameState';
import { hasLineOfSight as hasLineOfSightUtil } from './handlers/handlerUtils';

export type ZombieActionType = 'ATTACK' | 'MOVE' | 'NONE';

export interface ZombieAction {
  type: ZombieActionType;
  targetId?: string; // For Attack (Survivor ID)
  toZoneId?: string; // For Move (next-step zone)
}

export interface ZombieSplitPrompt {
  zombieId: string;
  type: ZombieType;
  sourceZoneId: ZoneId;
  options: ZoneId[]; // Tied next-step zones (>= 2)
}

export interface MovePlan {
  /** zombieId -> chosen next-step zone (only for zombies that will move) */
  plannedMoves: Record<string, ZoneId>;
  /** Per-zombie remainder prompts for the active player. */
  prompts: ZombieSplitPrompt[];
}

export class ZombieAI {

  /**
   * Single-zombie decision used by extra-activation / Rush flows. Returns an
   * attack when a survivor shares the zone, a MOVE along the first tied next
   * step when there's a reachable noise target, else NONE.
   *
   * The main Zombie Phase uses `planMoves` to split ties across zombies of
   * the same type instead of calling this per-zombie for moves.
   */
  public static getAction(state: GameState, zombie: Zombie): ZombieAction {
    const currentZone = state.zones[zombie.position.zoneId];

    const survivorInZone = Object.values(state.survivors).find(
      s => s.position.zoneId === currentZone.id && s.wounds < s.maxHealth,
    );
    if (survivorInZone) {
      return { type: 'ATTACK', targetId: survivorInZone.id };
    }

    const options = this.findTiedNextSteps(state, currentZone);
    if (options.length === 0) {
      return { type: 'NONE' };
    }
    return { type: 'MOVE', toZoneId: options[0] };
  }

  /**
   * Plans movement for a set of zombies, splitting evenly across tied routes
   * (RULEBOOK §9). Zombies grouped by (sourceZone, type, tied-option-set);
   * within each group the first `floor(n / k) * k` zombies (sorted by ID) are
   * placed round-robin, and the remaining `n mod k` zombies become prompts for
   * the active player to resolve.
   */
  public static planMoves(state: GameState, zombies: Zombie[]): MovePlan {
    const plannedMoves: Record<string, ZoneId> = {};
    const prompts: ZombieSplitPrompt[] = [];

    type Group = { sourceZoneId: ZoneId; type: ZombieType; options: ZoneId[]; zombieIds: string[] };
    const groups = new Map<string, Group>();

    for (const zombie of zombies) {
      const sourceZone = state.zones[zombie.position.zoneId];
      if (!sourceZone) continue;
      const options = this.findTiedNextSteps(state, sourceZone);
      if (options.length === 0) continue; // Stay put (no path / no target)

      const sortedOptions = [...options].sort();
      const key = `${zombie.position.zoneId}|${zombie.type}|${sortedOptions.join(',')}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          sourceZoneId: zombie.position.zoneId,
          type: zombie.type,
          options: sortedOptions,
          zombieIds: [],
        };
        groups.set(key, group);
      }
      group.zombieIds.push(zombie.id);
    }

    for (const group of groups.values()) {
      const zombieIds = [...group.zombieIds].sort();
      const n = zombieIds.length;
      const k = group.options.length;

      if (k === 1) {
        for (const id of zombieIds) plannedMoves[id] = group.options[0];
        continue;
      }

      const forced = n - (n % k);
      for (let i = 0; i < forced; i++) {
        plannedMoves[zombieIds[i]] = group.options[i % k];
      }
      for (let i = forced; i < n; i++) {
        prompts.push({
          zombieId: zombieIds[i],
          type: group.type,
          sourceZoneId: group.sourceZoneId,
          options: [...group.options],
        });
      }
    }

    return { plannedMoves, prompts };
  }

  /**
   * Tied next-step zones from `sourceZone` toward the noisiest target(s).
   * Empty array = no reachable target (zombie stays put).
   */
  private static findTiedNextSteps(state: GameState, sourceZone: Zone): ZoneId[] {
    const targets = this.findTiedTargets(state, sourceZone).filter(id => id !== sourceZone.id);
    if (targets.length === 0) return [];

    const openNeighbors = sourceZone.connections
      .filter(c => !(c.hasDoor && !c.doorOpen))
      .map(c => c.toZoneId);
    if (openNeighbors.length === 0) return [];

    const targetSet = new Set(targets);
    const distances: Record<string, number> = {};
    let minDist = Infinity;
    for (const n of openNeighbors) {
      const d = this.minDistanceTo(state, n, targetSet);
      distances[n] = d;
      if (d < minDist) minDist = d;
    }
    if (minDist === Infinity) return [];

    return openNeighbors.filter(n => distances[n] === minDist);
  }

  /**
   * Candidate target zones for movement (noisiest visible survivor zones, or
   * — if no visible survivors — the globally noisiest zones).
   */
  private static findTiedTargets(state: GameState, sourceZone: Zone): ZoneId[] {
    const allSurvivors = Object.values(state.survivors).filter(s => s.wounds < s.maxHealth);

    const visibleSurvivorZones = new Set<string>();
    for (const survivor of allSurvivors) {
      if (this.hasLineOfSight(state, sourceZone.id, survivor.position.zoneId)) {
        visibleSurvivorZones.add(survivor.position.zoneId);
      }
    }

    if (visibleSurvivorZones.size > 0) {
      let maxNoise = -1;
      let noisiest: ZoneId[] = [];
      for (const zoneId of visibleSurvivorZones) {
        const zone = state.zones[zoneId];
        if (!zone) continue;
        const survivorCount = allSurvivors.filter(s => s.position.zoneId === zoneId).length;
        const totalNoise = (zone.noiseTokens || 0) + survivorCount;
        if (totalNoise > maxNoise) {
          maxNoise = totalNoise;
          noisiest = [zoneId];
        } else if (totalNoise === maxNoise) {
          noisiest.push(zoneId);
        }
      }
      return noisiest;
    }

    let maxNoise = 0;
    let noisiest: ZoneId[] = [];
    for (const zoneId in state.zones) {
      const zone = state.zones[zoneId];
      const survivorCount = allSurvivors.filter(s => s.position.zoneId === zoneId).length;
      const totalNoise = (zone.noiseTokens || 0) + survivorCount;
      if (totalNoise > maxNoise) {
        maxNoise = totalNoise;
        noisiest = [zoneId];
      } else if (totalNoise === maxNoise && totalNoise > 0) {
        noisiest.push(zoneId);
      }
    }
    return noisiest;
  }

  /**
   * BFS distance from `startZoneId` to the nearest zone in `targetSet`,
   * treating closed doors as impassable. Returns Infinity if unreachable.
   */
  private static minDistanceTo(state: GameState, startZoneId: ZoneId, targetSet: Set<ZoneId>): number {
    if (targetSet.has(startZoneId)) return 0;
    const queue: Array<{ id: ZoneId; d: number }> = [{ id: startZoneId, d: 0 }];
    const visited = new Set<string>([startZoneId]);
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (targetSet.has(id)) return d;
      const zone = state.zones[id];
      if (!zone) continue;
      for (const conn of zone.connections) {
        if (conn.hasDoor && !conn.doorOpen) continue;
        if (visited.has(conn.toZoneId)) continue;
        visited.add(conn.toZoneId);
        queue.push({ id: conn.toZoneId, d: d + 1 });
      }
    }
    return Infinity;
  }

  private static hasLineOfSight(state: GameState, zoneAId: string, zoneBId: string): boolean {
    return hasLineOfSightUtil(state, zoneAId, zoneBId);
  }
}
