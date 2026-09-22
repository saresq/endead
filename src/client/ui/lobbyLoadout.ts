/**
 * Lobby loadout helpers: what starting weapons are still on the table and
 * whether a player finished picking.
 *
 * The supply is the rulebook's six grey-back cards
 * (rules/16-card-registry.md#starting-equipment-6-cards-grey-backs), claimed in
 * the lobby instead of dealt, so the Pistol can be claimed three times and
 * everything else once. `LobbyHandlers.handleSelectWeapon` enforces the same
 * counts server-side; this only decides what the picker draws.
 */

import { EquipmentCard } from '../../types/GameState';
import {
  STARTING_EQUIPMENT_DECK,
  STARTING_WEAPON_SUPPLY,
  buildStartingCard,
} from '../../config/CharacterRegistry';

export interface LobbyLoadoutPlayer {
  id: string;
  characterClass?: string;
  startingWeapon?: string;
}

export interface WeaponOption {
  equipmentId: string;
  /** Copies the supply holds. */
  total: number;
  /** Copies the local player could still claim — their own claim doesn't count against them. */
  remaining: number;
  /** The local player holds this weapon. */
  mine: boolean;
  /** A preview card, for `renderItemCard`. */
  card: EquipmentCard;
}

/** Distinct weapons in supply order, with what is left for `localPlayerId`. */
export function weaponOptions(
  players: readonly LobbyLoadoutPlayer[],
  localPlayerId: string,
): WeaponOption[] {
  const distinct = [...new Set(STARTING_EQUIPMENT_DECK)];

  return distinct.flatMap((equipmentId, index) => {
    const card = buildStartingCard(equipmentId, index);
    if (!card) return [];

    const claimedByOthers = players.filter(
      p => p.startingWeapon === equipmentId && p.id !== localPlayerId,
    ).length;
    const total = STARTING_WEAPON_SUPPLY[equipmentId] ?? 0;

    return [{
      equipmentId,
      total,
      remaining: total - claimedByOthers,
      mine: players.some(p => p.id === localPlayerId && p.startingWeapon === equipmentId),
      card,
    }];
  });
}

/** A player is ready once they hold both a survivor and a weapon. */
export function isLoadoutComplete(player: LobbyLoadoutPlayer | null | undefined): boolean {
  return !!player?.characterClass && !!player?.startingWeapon;
}
