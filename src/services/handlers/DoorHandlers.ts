
import { GameState, EquipmentCard, ZoneId } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { getConnection, openDoorEdge } from './handlerUtils';
import { es } from '../../strings/es';

export function handleOpenDoor(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;

  if (!targetZoneId) throw new Error('Target zone required');

  const currentZone = newState.zones[survivor.position.zoneId];
  const targetZone = newState.zones[targetZoneId];

  if (!targetZone) throw new Error('Target zone invalid');
  const conn = getConnection(currentZone, targetZoneId);
  if (!conn) throw new Error(es.errors.zonesNotConnected);
  if (!conn.hasDoor) throw new Error(es.errors.noDoor);
  if (conn.doorOpen) throw new Error(es.errors.doorAlreadyOpen);

  const hasOpener = survivor.inventory.some((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (!hasOpener) throw new Error(es.errors.needDoorOpener);

  // Open door on both sides of the edge
  openDoorEdge(newState, survivor.position.zoneId, targetZoneId);

  const opener = survivor.inventory.find((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (opener && opener.openDoorNoise) {
    const zone = newState.zones[survivor.position.zoneId];
    zone.noiseTokens = (zone.noiseTokens || 0) + 1;
    newState.noiseTokens = (newState.noiseTokens || 0) + 1;
  }

  // Spawn-on-door-open (RULEBOOK §9):
  //   - Rule 294: opening a building for the first time draws one Zombie card
  //     per Dark Zone of that building.
  //   - Rule 302: buildings open at start (any zone has a doorway to the outside)
  //     are never spawned in.
  //   - A building = all rooms connected by openings (doorways), not by physical doors.
  const behindDoor = newState.zones[targetZoneId];
  const zonesToSpawn: ZoneId[] = [];
  if (behindDoor && behindDoor.isBuilding && !behindDoor.hasBeenSpawned) {
    // BFS the whole building through doorways (non-door connections).
    const buildingZones: ZoneId[] = [targetZoneId];
    const visited = new Set<ZoneId>([targetZoneId]);
    const queue = [targetZoneId];
    let openAtStart = false;
    while (queue.length > 0) {
      const zid = queue.shift()!;
      const z = newState.zones[zid];
      if (!z) continue;
      for (const c of z.connections) {
        const neighbor = newState.zones[c.toZoneId];
        if (!neighbor) continue;
        // A doorway (non-door) connection to a non-building zone means the
        // building is structurally open at start — Rule 302 applies.
        if (!c.hasDoor && !neighbor.isBuilding) {
          openAtStart = true;
          continue;
        }
        if (visited.has(c.toZoneId)) continue;
        if (!neighbor.isBuilding) continue;
        if (c.hasDoor) continue;
        visited.add(c.toZoneId);
        buildingZones.push(c.toZoneId);
        queue.push(c.toZoneId);
      }
    }

    // Mark every zone in the building so later door-opens don't re-trigger spawns.
    for (const zid of buildingZones) {
      newState.zones[zid].hasBeenSpawned = true;
    }

    // Rule 294: one spawn per Dark Zone. Rule 302: skip entirely if open at start.
    if (!openAtStart) {
      for (const zid of buildingZones) {
        if (newState.zones[zid].isDark) zonesToSpawn.push(zid);
      }
    }

    // Same card resolution as the Spawn Step (Extra Activation, Rush, pool
    // limits, Abomination rules). Wounds from activations queue as pending.
    for (const zid of zonesToSpawn) {
      const detail = ZombiePhaseManager.drawSpawnCard(newState)?.[newState.currentDangerLevel];
      if (detail) ZombiePhaseManager.applySpawnDetail(newState, zid, detail);
    }
  }

  const spawned = zonesToSpawn.length > 0;
  newState.lastAction = {
    type: ActionType.OPEN_DOOR,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: es.log.doorOpened(spawned),
  };

  return newState;
}

export function handleMakeNoise(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const zone = newState.zones[survivor.position.zoneId];

  zone.noiseTokens = (zone.noiseTokens || 0) + 1;
  newState.noiseTokens = (newState.noiseTokens || 0) + 1;

  return newState;
}
