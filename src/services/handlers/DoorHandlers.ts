
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

  // Spawn-on-door-open: only dark rooms spawn zombies when first opened
  const behindDoor = newState.zones[targetZoneId];
  if (behindDoor && behindDoor.isBuilding && behindDoor.isDark && !behindDoor.hasBeenSpawned) {
    behindDoor.hasBeenSpawned = true;

    // Collect all connected interior zones (doorless connections within the building)
    const zonesToSpawn: ZoneId[] = [targetZoneId];
    const visited = new Set<ZoneId>([targetZoneId]);
    const queue = [targetZoneId];
    while (queue.length > 0) {
      const zid = queue.shift()!;
      const z = newState.zones[zid];
      if (!z) continue;
      for (const c of z.connections) {
        if (visited.has(c.toZoneId)) continue;
        const neighbor = newState.zones[c.toZoneId];
        if (!neighbor || !neighbor.isBuilding) continue;
        // Only traverse doorless internal connections
        if (c.hasDoor) continue;
        visited.add(c.toZoneId);
        neighbor.hasBeenSpawned = true;
        zonesToSpawn.push(c.toZoneId);
        queue.push(c.toZoneId);
      }
    }

    // Draw a spawn card for each zone and spawn zombies
    const currentLevel: DangerLevel = newState.currentDangerLevel;
    for (const zid of zonesToSpawn) {
      // Self-healing: initialize spawn deck if empty
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
      if (!card) continue;

      const detail = card[currentLevel] as SpawnDetail;
      if (!detail || detail.extraActivation) continue; // Skip extra activation cards for door spawns

      if (detail.zombies) {
        for (const [type, count] of Object.entries(detail.zombies)) {
          for (let i = 0; i < (count as number); i++) {
            ZombiePhaseManager.spawnZombie(newState, zid, type as ZombieType);
          }
        }
      }
    }
  }

  const spawned = behindDoor && behindDoor.isBuilding && behindDoor.isDark;
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
