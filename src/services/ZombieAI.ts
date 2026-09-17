
import { GameState, Zombie, Zone, ZoneId } from '../types/GameState';
import { visibleZones } from './LineOfSight';

export type ZombieActionType = 'ATTACK' | 'MOVE' | 'NONE';

export interface ZombieAction {
  type: ZombieActionType;
  targetId?: string; // For Attack (Survivor ID)
  /** For Move: every first step tied for shortest. A group splits between them. */
  toZoneIds?: ZoneId[];
}

export class ZombieAI {

  /**
   * Determines the best action for a zombie based on game state.
   */
  public static getAction(state: GameState, zombie: Zombie): ZombieAction {
    const currentZone = state.zones[zombie.position.zoneId];
    
    // 1. Check for Survivors in the same zone (Attack)
    const survivorsInZone = Object.values(state.survivors).filter(
      s => s.position.zoneId === currentZone.id && s.wounds < s.maxHealth
    );

    if (survivorsInZone.length > 0) {
      // Attack the first one (or implementing priority logic)
      return {
        type: 'ATTACK',
        targetId: survivorsInZone[0].id
      };
    }

    // 2. Find Target Zone (Move)
    const targetZoneId = this.findTargetZone(state, currentZone);

    if (targetZoneId && targetZoneId !== currentZone.id) {
      const nextZoneIds = this.getNextSteps(state, currentZone.id, targetZoneId);
      // No open path: zombies never open doors, so they stay put.
      if (nextZoneIds.length > 0) {
        return {
          type: 'MOVE',
          toZoneIds: nextZoneIds
        };
      }
    }

    return { type: 'NONE' };
  }

  /**
   * Finds the best target zone:
   * 1. Zone with visible Survivors.
   * 2. If none visible, Zone with most Noise (or Survivors acting as Noise).
   */
  private static findTargetZone(state: GameState, currentZone: Zone): ZoneId | null {
    const allSurvivors = Object.values(state.survivors).filter(s => s.wounds < s.maxHealth);
    
    // Check Visibility First
    const visible = visibleZones(state, currentZone.id);
    const visibleSurvivorZones = allSurvivors
      .map(s => s.position.zoneId)
      .filter(zoneId => visible.has(zoneId));

    if (visibleSurvivorZones.length > 0) {
      // Per rulebook §9: Among visible zones, pick the one with most Noise
      // Noise = noise tokens + number of living survivors in zone
      const uniqueZones = [...new Set(visibleSurvivorZones)];
      let maxNoise = 0;
      let noisiest: ZoneId[] = [];

      for (const zoneId of uniqueZones) {
        const zone = state.zones[zoneId];
        const survivorCount = allSurvivors.filter(s => s.position.zoneId === zoneId).length;
        const totalNoise = (zone.noiseTokens || 0) + survivorCount;

        if (totalNoise > maxNoise) {
          maxNoise = totalNoise;
          noisiest = [zoneId];
        } else if (totalNoise === maxNoise) {
          noisiest.push(zoneId);
        }
      }

      if (noisiest.length === 1) {
        return noisiest[0];
      }
      // Tie-break: use closest among equally noisy zones
      return this.findClosestZone(state, currentZone.id, noisiest);
    }

    // No visible survivors -> Use Noise
    // Calculate effective noise per zone (Noise Tokens + Living Survivors)
    // Find the max noise zone.
    let maxNoise = 0;
    let noisyZones: ZoneId[] = [];

    for (const zoneId in state.zones) {
      const zone = state.zones[zoneId];
      const survivorCount = allSurvivors.filter(s => s.position.zoneId === zoneId).length;
      const totalNoise = (zone.noiseTokens || 0) + survivorCount; // Survivors count as noise

      if (totalNoise > maxNoise) {
        maxNoise = totalNoise;
        noisyZones = [zoneId];
      } else if (totalNoise === maxNoise && totalNoise > 0) {
        noisyZones.push(zoneId);
      }
    }

    if (noisyZones.length > 0) {
      // Return closest noisy zone
      return this.findClosestZone(state, currentZone.id, noisyZones);
    }

    return null; // No targets
  }

  /**
   * Every first step that reaches `targetZoneId` as quickly as any other.
   *
   * Per rules/10-zombie-phase.md#splitting: a group facing equally short routes splits between them, so
   * the answer is the whole tie, not the first connection the search happens to
   * walk. Sorted, so the split is deterministic for a given board.
   */
  private static getNextSteps(state: GameState, startZoneId: ZoneId, targetZoneId: ZoneId): ZoneId[] {
    const distance = new Map<ZoneId, number>([[startZoneId, 0]]);
    // Per visited zone: the first steps out of `startZoneId` that reach it in `distance` moves.
    const firstSteps = new Map<ZoneId, Set<ZoneId>>();
    const queue: ZoneId[] = [startZoneId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const zone = state.zones[id];
      if (!zone) continue;
      const next = distance.get(id)! + 1;
      const stepsHere = id === startZoneId ? null : firstSteps.get(id)!;

      for (const conn of zone.connections) {
        // Edge-level door check: zombies never open doors.
        if (conn.hasDoor && !conn.doorOpen) continue;

        const neighborId = conn.toZoneId;
        const known = distance.get(neighborId);
        if (known !== undefined && known !== next) continue;

        const inbound = stepsHere ?? new Set<ZoneId>([neighborId]);
        if (known === undefined) {
          distance.set(neighborId, next);
          firstSteps.set(neighborId, new Set(inbound));
          queue.push(neighborId);
        } else {
          const merged = firstSteps.get(neighborId)!;
          for (const step of inbound) merged.add(step);
        }
      }
    }

    return [...(firstSteps.get(targetZoneId) ?? [])].sort();
  }

  private static findClosestZone(state: GameState, startId: string, targetIds: string[]): ZoneId {
      // BFS to find distance to all targets, return closest.
      // Respects closed doors (zombies can't walk through them).
      const targetSet = new Set(targetIds);
      const queue = [startId];
      const visited = new Set<string>();
      visited.add(startId);

      while (queue.length > 0) {
          const id = queue.shift()!;
          if (targetSet.has(id)) return id;

          const zone = state.zones[id];
          for (const conn of zone.connections) {
              if (!visited.has(conn.toZoneId)) {
                  // Skip closed doors - zombies can't pass through
                  if (conn.hasDoor && !conn.doorOpen) continue;
                  visited.add(conn.toZoneId);
                  queue.push(conn.toZoneId);
              }
          }
      }
      return targetIds[0]; // Fallback (unreachable)
  }
}
