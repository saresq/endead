
import { GameState, Zombie, Zone, ZoneId, Survivor, Position } from '../types/GameState';
import { ZONE_LAYOUT } from '../config/Layout';

// Direction vectors for grid movement logic
const DIRECTIONS = [
  { x: 0, y: -1 }, // North
  { x: 1, y: 0 },  // East
  { x: 0, y: 1 },  // South
  { x: -1, y: 0 }, // West
];

export type ZombieActionType = 'ATTACK' | 'MOVE' | 'NONE';

export interface ZombieAction {
  type: ZombieActionType;
  targetId?: string; // For Attack (Survivor ID)
  toZoneId?: string; // For Move
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
      // Find the closest visible zone with survivors
      // If multiple at same distance, pick one with most survivors (Zombicide rule)
      // For now, just closest.
      return this.findClosestZone(state, currentZone.id, visibleSurvivorZones);
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
      for (const neighborId of zone.connectedZones) {
        // Check if door is open (if logic requires door check for movement)
        // In the type definition, 'doorOpen' is a property of the ZONE, not the connection.
        // Assuming if door is closed, you can't enter? Or is it an attribute of the connection?
        // GameState definition says: Zone has 'doorOpen'. 
        // Usually implies the zone itself is accessible.
        // Let's assume if 'doorOpen' is false, you can't enter/leave?
        // Or maybe it represents the door TO the building?
        // Let's assume standard graph traversal on connectedZones is valid movement
        // unless a specific barrier exists.
        // For 'doorOpen', let's assume if a zone is a building and door is closed, it's locked.
        // But zombies might break it? For now, assume open paths.

        // Refined Logic:
        // A Zone might represent a room. 'doorOpen' might be the state of the door *to the street*.
        // Detailed check: If moving between Building and Street, check door.
        // If moving Room to Room, assumed open unless specific logic.
        // For MVP, we use connectedZones as the graph edges.
        
        if (!visited.has(neighborId)) {
            // Edge-level door check: if door is closed on this edge, blocked
            const conn = zone.connections?.find(c => c.toZoneId === neighborId);
            if (conn && conn.hasDoor && !conn.doorOpen) {
                continue; // Door closed, zombies can't pass
            }
            
            visited.add(neighborId);
            queue.push({ id: neighborId, path: [...path, neighborId] });
        }
      }
    }
    return null;
  }

  /**
   * Checks Line of Sight between two zones.
   * Simplified: Same Zone OR Connected in a straight line (based on Layout).
   */
  private static hasLineOfSight(state: GameState, zoneAId: string, zoneBId: string): boolean {
    if (zoneAId === zoneBId) return true;
    
    // Need geometric data from Layout or inference
    // Since we don't have the full layout imported here easily without coupling,
    // we can use a simplified heuristic:
    // If zones are connected, they have LOS? No, that's too generous (corners).
    // Let's try to trace a ray if we have coordinates.
    // The Layout file has {col, row, w, h}.
    
    const posA = ZONE_LAYOUT[zoneAId];
    const posB = ZONE_LAYOUT[zoneBId];

    if (!posA || !posB) return false; // Unknown layout

    // Check if they are in the same row or column (orthogonality)
    const sameRow = posA.row === posB.row;
    const sameCol = posA.col === posB.col;

    if (!sameRow && !sameCol) return false; // Diagonal or unrelated

    // Trace the path to ensure no walls/closed doors block view
    // This requires a grid traversal or checking all zones between A and B.
    // For MVP: Check if they are directly connected or if we can traverse connected zones
    // strictly maintaining the row/col alignment.
    
    return this.checkRaycast(state, zoneAId, zoneBId, sameRow ? 'row' : 'col');
  }

  private static checkRaycast(state: GameState, startId: string, endId: string, axis: 'row' | 'col'): boolean {
     // BFS/DFS but constrained to the axis
     // Finds if there is a path of connected zones from Start to End
     // where all zones share the same Row (or Col).
     
     const startPos = ZONE_LAYOUT[startId];
     
     const queue = [startId];
     const visited = new Set<string>();
     visited.add(startId);

     while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (currentId === endId) return true;

        const currentZone = state.zones[currentId];
        for (const neighborId of currentZone.connectedZones) {
             if (visited.has(neighborId)) continue;
             
             const neighborPos = ZONE_LAYOUT[neighborId];
             if (!neighborPos) continue;

             // Constraint Check
             if (axis === 'row' && neighborPos.row !== startPos.row) continue;
             if (axis === 'col' && neighborPos.col !== startPos.col) continue;

              // Edge-level door/wall check for LOS
              const conn = currentZone.connections?.find(c => c.toZoneId === neighborId);
              if (conn && conn.hasDoor && !conn.doorOpen) {
                  continue; // Closed door blocks LOS
              }

             visited.add(neighborId);
             queue.push(neighborId);
        }
     }
     return false;
  }

  private static findClosestZone(state: GameState, startId: string, targetIds: string[]): ZoneId {
      // BFS to find distance to all targets, return closest
      // Optimized: BFS from start, first target found is closest.
      const targetSet = new Set(targetIds);
      const queue = [startId];
      const visited = new Set<string>();
      visited.add(startId);

      while (queue.length > 0) {
          const id = queue.shift()!;
          if (targetSet.has(id)) return id;

          const zone = state.zones[id];
          for (const neighborId of zone.connectedZones) {
              if (!visited.has(neighborId)) {
                  visited.add(neighborId);
                  queue.push(neighborId);
              }
          }
      }
      return targetIds[0]; // Fallback (unreachable)
  }
}
