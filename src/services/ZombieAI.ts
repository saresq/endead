
import { GameState, Zombie, Zone, ZoneId, Survivor, Position } from '../types/GameState';
import { hasLineOfSight as hasLineOfSightUtil } from './handlers/handlerUtils';

// Direction vectors for grid movement logic
const DIRECTIONS = [
  { x: 0, y: -1 }, // North
  { x: 1, y: 0 },  // East
  { x: 0, y: 1 },  // South
  { x: -1, y: 0 }, // West
];

export type ZombieActionType = 'ATTACK' | 'MOVE' | 'BREAK_DOOR' | 'NONE';

export interface ZombieAction {
  type: ZombieActionType;
  targetId?: string; // For Attack (Survivor ID)
  toZoneId?: string; // For Move or Break Door (target zone behind the door)
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
      const nextZoneId = this.getNextStep(state, currentZone.id, targetZoneId);
      if (nextZoneId) {
        return {
          type: 'MOVE',
          toZoneId: nextZoneId
        };
      }

      // Path blocked — check if a closed door is the obstacle
      const blockedDoor = this.findBlockedDoor(state, currentZone);
      if (blockedDoor) {
        return {
          type: 'BREAK_DOOR',
          toZoneId: blockedDoor
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
    // Group survivors by zone
    const visibleSurvivorZones: ZoneId[] = [];
    
    for (const survivor of allSurvivors) {
      const survivorZoneId = survivor.position.zoneId;
      if (this.hasLineOfSight(state, currentZone.id, survivorZoneId)) {
        visibleSurvivorZones.push(survivorZoneId);
      }
    }

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
   * Returns the next zone to move to along the shortest path.
   */
  private static getNextStep(state: GameState, startZoneId: ZoneId, targetZoneId: ZoneId): ZoneId | null {
    // BFS to find path
    const queue: { id: ZoneId; path: ZoneId[] }[] = [{ id: startZoneId, path: [] }];
    const visited = new Set<string>();
    visited.add(startZoneId);

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (id === targetZoneId) {
        return path[0]; // First step
      }

      const zone = state.zones[id];
      // Shuffle connected zones to avoid bias if deterministic shuffle is seeded, 
      // but for now simple iteration.
      for (const conn of zone.connections) {
        const neighborId = conn.toZoneId;
        if (!visited.has(neighborId)) {
            // Edge-level door check: if door is closed on this edge, blocked
            if (conn.hasDoor && !conn.doorOpen) {
                continue; // Door closed, zombies can't pass
            }

            visited.add(neighborId);
            queue.push({ id: neighborId, path: [...path, neighborId] });
        }
      }
    }
    return null;
  }

  private static hasLineOfSight(state: GameState, zoneAId: string, zoneBId: string): boolean {
    return hasLineOfSightUtil(state, zoneAId, zoneBId);
  }

  /**
   * Checks if any adjacent connection has a closed door blocking the zombie.
   * Returns the target zone ID behind the first closed door found, or null.
   */
  private static findBlockedDoor(state: GameState, currentZone: Zone): ZoneId | null {
    if (!currentZone.connections) return null;
    for (const conn of currentZone.connections) {
      if (conn.hasDoor && !conn.doorOpen) {
        return conn.toZoneId;
      }
    }
    return null;
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
