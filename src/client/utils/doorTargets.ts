import { GameState, EntityId, PlayerId, ZoneId } from '../../types/GameState';

/**
 * Zones the survivor could reach right now by opening a closed door
 * (rules/09-player-phase.md#doors): it must be their controller's turn, the
 * survivor must have an action left and a door opener in hand.
 *
 * `openerCardId` narrows the check to one card — used when a specific weapon is
 * armed, so a knife in the other hand does not light doors up.
 */
export function openableDoorZones(
  state: GameState,
  survivorId: EntityId | null,
  localPlayerId: PlayerId,
  openerCardId?: EntityId | null,
): ZoneId[] {
  if (!survivorId) return [];

  if (state.players[state.activePlayerIndex] !== localPlayerId) return [];

  const survivor = state.survivors[survivorId];
  if (!survivor || survivor.playerId !== localPlayerId) return [];
  if (survivor.actionsRemaining < 1) return [];

  const hasOpener = openerCardId
    ? survivor.inventory.some(c => c.id === openerCardId && c.inHand && c.canOpenDoor)
    : survivor.inventory.some(c => c.inHand && c.canOpenDoor);
  if (!hasOpener) return [];

  const currentZone = state.zones[survivor.position.zoneId];
  if (!currentZone) return [];

  return currentZone.connections
    .filter(c => c.hasDoor && !c.doorOpen)
    .map(c => c.toZoneId);
}

/** Order-independent key for the door edge between two zones. */
export function doorEdgeKey(a: ZoneId, b: ZoneId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Edge keys for every door `openableDoorZones` found, for the board outline. */
export function openableDoorEdges(
  state: GameState,
  survivorId: EntityId | null,
  localPlayerId: PlayerId,
  openerCardId?: EntityId | null,
): string[] {
  const zones = openableDoorZones(state, survivorId, localPlayerId, openerCardId);
  if (zones.length === 0) return [];
  const fromZoneId = state.survivors[survivorId!].position.zoneId;
  return zones.map(z => doorEdgeKey(fromZoneId, z));
}
