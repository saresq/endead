
import { GameState, EquipmentCard, DangerLevel, ZoneId, ZombieType, SpawnDetail } from '../../types/GameState';
import { ActionRequest, ActionType } from '../../types/Action';
import { DeckService } from '../DeckService';
import { ZombiePhaseManager } from '../ZombiePhaseManager';
import { XPManager } from '../XPManager';
import { getConnection, openDoorEdge } from './handlerUtils';

export function handleOpenDoor(state: GameState, intent: ActionRequest): GameState {
  const newState = structuredClone(state);
  const survivor = newState.survivors[intent.survivorId!];
  const targetZoneId = intent.payload?.targetZoneId;

  if (!targetZoneId) throw new Error('Target zone required');

  const currentZone = newState.zones[survivor.position.zoneId];
  const targetZone = newState.zones[targetZoneId];

  if (!targetZone) throw new Error('Target zone invalid');
  const conn = getConnection(currentZone, targetZoneId);
  if (!conn) throw new Error('Target zone not connected');
  if (!conn.hasDoor) throw new Error('No door on this edge');
  if (conn.doorOpen) throw new Error('Door is already open');

  const hasOpener = survivor.inventory.some((c: EquipmentCard) => c.inHand && c.canOpenDoor);
  if (!hasOpener) throw new Error('Requires equipment to open doors (in hand)');

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

    // Use the live Danger Level at spawn time (rule: highest among living survivors).
    const currentLevel: DangerLevel = ZombiePhaseManager.getCurrentDangerLevel(newState);
    newState.currentDangerLevel = currentLevel;

    const drawAndApply = (zid: ZoneId) => {
      if (newState.spawnDeck.length === 0 && newState.spawnDiscard.length === 0) {
        const deckResult = DeckService.initializeSpawnDeck(newState.seed);
        newState.spawnDeck = deckResult.deck;
        newState.seed = deckResult.newSeed;
      }
      const drawResult = DeckService.drawSpawnCard(newState);
      newState.spawnDeck = drawResult.newState.spawnDeck;
      newState.spawnDiscard = drawResult.newState.spawnDiscard;
      newState.seed = drawResult.newState.seed;
      const card = drawResult.card;
      if (!card) return null;
      const detail = card[currentLevel] as SpawnDetail;
      if (!detail) return null;
      ZombiePhaseManager.applySpawnDetail(newState, zid, detail);
      return detail;
    };

    for (const zid of zonesToSpawn) {
      const detail = drawAndApply(zid);
      if (detail?.doubleSpawn) drawAndApply(zid);
    }
  }

  const spawned = zonesToSpawn.length > 0;
  newState.lastAction = {
    type: ActionType.OPEN_DOOR,
    playerId: intent.playerId,
    survivorId: intent.survivorId,
    timestamp: Date.now(),
    description: `Opened door to ${targetZoneId}${spawned ? ' — zombies spawned!' : ''}`,
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
