
import { GameState, EquipmentCard, DangerLevel, ZoneId } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { getConnection, openDoorEdge } from './handlerUtils';
import type { EventCollector } from '../EventCollector';

export function handleOpenDoor(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;

  // --- Validate-first ---
  if (!targetZoneId) throw new Error('Target zone required');

  const currentZone = state.zones[survivor.position.zoneId];
  const targetZone = state.zones[targetZoneId];

  if (!targetZone) throw new Error('Target zone invalid');
  const conn = getConnection(currentZone, targetZoneId);
  if (!conn) throw new Error('Target zone not connected');
  if (!conn.hasDoor) throw new Error('No door on this edge');
  if (conn.doorOpen) throw new Error('Door is already open');

  const opener = survivor.inventory.find((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (!opener) throw new Error('Requires equipment to open doors (in hand)');

  // --- Mutations + emits ---
  openDoorEdge(state, survivor.position.zoneId, targetZoneId);
  collector.emit({
    type: 'DOOR_OPENED',
    zoneAId: survivor.position.zoneId,
    zoneBId: targetZoneId,
    openerSurvivorId: intent.survivorId!,
  });

  if (opener.openDoorNoise) {
    const zone = state.zones[survivor.position.zoneId];
    zone.noiseTokens = (zone.noiseTokens || 0) + 1;
    state.noiseTokens = (state.noiseTokens || 0) + 1;
    collector.emit({
      type: 'NOISE_GENERATED',
      zoneId: survivor.position.zoneId,
      amount: 1,
      newTotal: zone.noiseTokens,
    });
  }

  // Spawn-on-door-open (RULEBOOK §9): see comments in original handler.
  const behindDoor = state.zones[targetZoneId];
  const zonesToSpawn: ZoneId[] = [];
  if (behindDoor && behindDoor.isBuilding && !behindDoor.hasBeenSpawned) {
    const buildingZones: ZoneId[] = [targetZoneId];
    const visited = new Set<ZoneId>([targetZoneId]);
    const queue = [targetZoneId];
    let openAtStart = false;
    while (queue.length > 0) {
      const zid = queue.shift()!;
      const z = state.zones[zid];
      if (!z) continue;
      for (const c of z.connections) {
        const neighbor = state.zones[c.toZoneId];
        if (!neighbor) continue;
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

    for (const zid of buildingZones) {
      if (!state.zones[zid].hasBeenSpawned) {
        state.zones[zid].hasBeenSpawned = true;
        collector.emit({ type: 'ZONE_SPAWNED', zoneId: zid });
      }
    }

    if (!openAtStart) {
      for (const zid of buildingZones) {
        if (state.zones[zid].isDark) zonesToSpawn.push(zid);
      }
    }

    const currentLevel: DangerLevel = ZombiePhaseManager.getCurrentDangerLevel(state);
    if (state.currentDangerLevel !== currentLevel) {
      state.currentDangerLevel = currentLevel;
      collector.emit({ type: 'DANGER_LEVEL_GLOBAL_CHANGED', newLevel: currentLevel });
    }

    for (const zid of zonesToSpawn) {
      ZombiePhaseManager.drawAndApplySpawnCard(state, zid, currentLevel, collector);
    }
  }

  const spawned = zonesToSpawn.length > 0;
  state.lastAction = {
    type: ActionType.OPEN_DOOR,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Opened door to ${targetZoneId}${spawned ? ' — zombies spawned!' : ''}`,
  };
}

export function handleMakeNoise(state: GameState, intent: ActionRequest, collector: EventCollector): void {
  const survivor = state.survivors[intent.survivorId!];
  const zone = state.zones[survivor.position.zoneId];

  zone.noiseTokens = (zone.noiseTokens || 0) + 1;
  state.noiseTokens = (state.noiseTokens || 0) + 1;
  collector.emit({
    type: 'NOISE_GENERATED',
    zoneId: zone.id,
    amount: 1,
    newTotal: zone.noiseTokens,
  });
}
