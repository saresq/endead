// src/config/CharacterRegistry.ts
// The base game's survivors (rules/15-characters.md#core-box-survivors) and the Starting Equipment
// deck they are dealt from at setup.

import { EquipmentCard } from '../types/GameState';
import { EQUIPMENT_CARDS } from './EquipmentRegistry';
import { Rng, RngState } from '../services/Rng';

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
 * Starting Equipment deck (rules/16-card-registry.md#starting-equipment-6-cards-grey-backs) — 6 grey-back cards, one dealt
 * per survivor at setup. Not part of the Equipment deck, and it never returns
 * to one: `DeckService.discard` drops `card-start-` ids out of play.
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

function buildEquipment(equipmentKey: string, index: number): EquipmentCard | null {
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

/**
 * Deals one starting weapon per survivor from the shuffled Starting Equipment
 * deck. Seeded, so a game is reproducible from `GameState.seed`.
 */
export function dealStartingEquipment(
  count: number,
  seed: RngState,
): { cards: EquipmentCard[]; newSeed: RngState } {
  const rng = Rng.from(seed);
  const deck = [...STARTING_EQUIPMENT_DECK];
  for (let m = deck.length - 1; m > 0; m--) {
    const i = rng.nextInt(m + 1);
    const t = deck[m];
    deck[m] = deck[i];
    deck[i] = t;
  }

  const cards: EquipmentCard[] = [];
  for (let i = 0; i < count; i++) {
    const card = buildEquipment(deck[i % deck.length], i);
    if (card) cards.push(card);
  }

  return { cards, newSeed: rng.snapshot() };
}
