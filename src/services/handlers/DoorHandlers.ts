
import { GameState, EquipmentCard, ZoneId } from '../../types/GameState';

type SpawnContextCard = NonNullable<GameState['spawnContext']>['cards'][number];
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

  // Spawn-on-door-open (rules/09-player-phase.md#spawning-in-buildings, Rule 294): opening a building for the
  // first time draws one Zombie card per Dark Zone of that building. Which
  // buildings can spawn at all is settled at compile time — `ScenarioCompiler`
  // groups the rooms and marks the ones open at start, and the one the
  // survivors start in, as already spawned (Rule 302).
  const behindDoor = newState.zones[targetZoneId];
  const zonesToSpawn: ZoneId[] = [];
  if (behindDoor?.buildingId && !behindDoor.hasBeenSpawned) {
    const buildingZones = Object.values(newState.zones)
      .filter(z => z.buildingId === behindDoor.buildingId);

    // Mark every zone in the building so later door-opens don't re-trigger spawns.
    for (const zone of buildingZones) {
      zone.hasBeenSpawned = true;
      if (zone.isDark) zonesToSpawn.push(zone.id);
    }

    // Same card resolution as the Spawn Step (Extra Activation, Rush, pool
    // limits, Abomination rules). Wounds from activations queue as pending.
    // The cards go into a spawnContext of the Spawn Step's shape, so the event
    // feed shows what was drawn instead of a bare "zombies spawned".
    if (zonesToSpawn.length > 0) {
      newState.spawnContext = { cards: [], zombieWounds: [], timestamp: Date.now() };
    }
    for (const zid of zonesToSpawn) {
      const card = ZombiePhaseManager.drawSpawnCard(newState);
      const detail = card?.[newState.currentDangerLevel];
      if (!card || !detail) continue;
      const entry: SpawnContextCard = {
        zoneId: zid,
        cardId: card.id,
        detail,
        dangerLevel: newState.currentDangerLevel,
      };
      newState.spawnContext!.cards.push(entry);
      // Rush cards move these out of the room right away — the ids let the
      // client animate them leaving it instead of popping in beside the survivor.
      entry.spawnedIds = ZombiePhaseManager.applySpawnDetail(newState, zid, detail);
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
