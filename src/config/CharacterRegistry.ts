// src/config/CharacterRegistry.ts
// Defines the 6 base game Zombicide v2 characters with starting equipment and display info.

import { EquipmentCard, EquipmentType } from '../types/GameState';
import { EQUIPMENT_CARDS } from './EquipmentRegistry';

export interface CharacterDefinition {
  name: string;
  /** Key into EQUIPMENT_CARDS for starting weapon */
  startingEquipmentKey: string;
  /** Display color (CSS-compatible) */
  color: string;
}

export const CHARACTER_DEFINITIONS: Record<string, CharacterDefinition> = {
  'Wanda': {
    name: 'Wanda',
    startingEquipmentKey: 'katana',
    color: '#e6194b', // red
  },
  'Doug': {
    name: 'Doug',
    startingEquipmentKey: 'pistol',
    color: '#3cb44b', // green
  },
  'Amy': {
    name: 'Amy',
    startingEquipmentKey: 'katana',
    color: '#ffe119', // yellow
  },
  'Ned': {
    name: 'Ned',
    startingEquipmentKey: 'crowbar',
    color: '#4363d8', // blue
  },
  'Elle': {
    name: 'Elle',
    startingEquipmentKey: 'machete',
    color: '#f58231', // orange
  },
  'Josh': {
    name: 'Josh',
    startingEquipmentKey: 'fire_axe',
    color: '#911eb4', // purple
  },
  // 'H4x0r': {
  //   name: 'H4x0r',
  //   startingEquipmentKey: 'fire_axe',
  //   color: '#00ff00', // hacker green
  // },
};

/**
 * Build the starting EquipmentCard for a character.
 * @param characterClass Character name (key into CHARACTER_DEFINITIONS)
 * @param index Unique index for card ID deduplication
 */
export function buildStartingEquipment(characterClass: string, index: number): EquipmentCard | null {
  const charDef = CHARACTER_DEFINITIONS[characterClass];
  if (!charDef) return null;

  const template = EQUIPMENT_CARDS[charDef.startingEquipmentKey];
  if (!template) return null;

  return {
    id: `card-start-${charDef.startingEquipmentKey}-${index}`,
    ...template,
    inHand: true,
    slot: 'HAND_1',
  };
}
