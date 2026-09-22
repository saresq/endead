// src/config/CharacterRegistry.ts
// The base game's survivors (rules/15-characters.md#core-box-survivors) and the Starting Equipment
// deck they are dealt from at setup.

import { EquipmentCard } from '../types/GameState';
import { EQUIPMENT_CARDS } from './EquipmentRegistry';

/** Classic survivors have 3 Health; Kids have 2 and Slippery once per Turn. */
export type SurvivorType = 'Classic' | 'Kid';

export interface CharacterDefinition {
  name: string;
  type: SurvivorType;
  /** Wounds that eliminate the survivor. */
  maxHealth: number;
  /** Display color (CSS-compatible) */
  color: string;
}

function classic(name: string, color: string): CharacterDefinition {
  return { name, type: 'Classic', maxHealth: 3, color };
}

function kid(name: string, color: string): CharacterDefinition {
  return { name, type: 'Kid', maxHealth: 2, color };
}

// The core box's twelve survivors: six Classic and six Kids. Types and health
// come from the official Survivor ID cards (zombicide.com), which is also where
// `SkillRegistry` takes their skill trees.
export const CHARACTER_DEFINITIONS: Record<string, CharacterDefinition> = {
  'Wanda': classic('Wanda', '#e6194b'),     // red
  'Doug': classic('Doug', '#3cb44b'),       // green
  'Amy': classic('Amy', '#ffe119'),         // yellow
  'Ned': classic('Ned', '#4363d8'),         // blue
  'Elle': classic('Elle', '#f58231'),       // orange
  'Josh': classic('Josh', '#911eb4'),       // purple
  'Lili': kid('Lili', '#42d4f4'),           // cyan
  'Odin': kid('Odin', '#808000'),           // olive
  'Lou': kid('Lou', '#f032e6'),             // magenta
  'Ostara': kid('Ostara', '#bfef45'),       // lime
  'Tiger Sam': kid('Tiger Sam', '#9a6324'), // brown
  'Bunny G': kid('Bunny G', '#469990'),     // teal
};

/**
 * Starting Equipment deck (rules/16-card-registry.md#starting-equipment-6-cards-grey-backs) — 6 grey-back cards. Not part
 * of the Equipment deck, and it never returns to one: `DeckService.discard`
 * drops `card-start-` ids out of play.
 *
 * House rule: the rulebook deals these at random. Here each player claims one
 * in the lobby, so a squad can never start without a door opener. The supply
 * is still the rulebook's six cards, so the Pistol can be claimed three times
 * and everything else once.
 */
export const STARTING_EQUIPMENT_DECK = [
  'baseball_bat',
  'crowbar',
  'fire_axe',
  'pistol',
  'pistol',
  'pistol',
] as const;

/** The card whose holder takes the first player token (rules/03-setup.md#first-player). */
export const FIRST_PLAYER_EQUIPMENT_ID = 'fire_axe';

/** How many of each starting weapon the supply holds, keyed by equipment id. */
export const STARTING_WEAPON_SUPPLY: Record<string, number> = STARTING_EQUIPMENT_DECK
  .reduce<Record<string, number>>((counts, key) => {
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

/**
 * Builds one starting weapon card, in hand. `index` only keeps ids unique
 * across the squad, since the same key can be claimed more than once.
 */
export function buildStartingCard(equipmentKey: string, index: number): EquipmentCard | null {
  const template = EQUIPMENT_CARDS[equipmentKey];
  if (!template) return null;

  return {
    id: `card-start-${equipmentKey}-${index}`,
    equipmentId: equipmentKey,
    ...template,
    inHand: true,
    slot: 'HAND_1',
  };
}
