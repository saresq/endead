// src/config/SkillRegistry.ts

import { DangerLevel } from '../types/GameState';

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  type: 'PASSIVE' | 'ACTION' | 'STAT_MOD';
}

// Registry of ALL possible skills in the game
export const SKILL_DEFINITIONS: Record<string, SkillDefinition> = {
  // Blue / Yellow (Often Fixed)
  'start_move': {
    id: 'start_move',
    name: 'Start: Move',
    description: 'Begin the game with a free Move Action.',
    type: 'PASSIVE'
  },
  'plus_1_action': {
    id: 'plus_1_action',
    name: '+1 Action',
    description: 'The Survivor has one extra Action per Turn.',
    type: 'PASSIVE'
  },

  // Combat Stats
  'plus_1_damage_melee': {
    id: 'plus_1_damage_melee',
    name: '+1 Damage: Melee',
    description: 'The Survivor gets a +1 Damage bonus with Melee Weapons.',
    type: 'STAT_MOD'
  },
  'plus_1_damage_ranged': {
    id: 'plus_1_damage_ranged',
    name: '+1 Damage: Ranged',
    description: 'The Survivor gets a +1 Damage bonus with Ranged Weapons.',
    type: 'STAT_MOD'
  },
  'plus_1_die_melee': {
    id: 'plus_1_die_melee',
    name: '+1 Die: Melee',
    description: 'The Survivor rolls an extra die with Melee Weapons.',
    type: 'STAT_MOD'
  },
  'plus_1_die_ranged': {
    id: 'plus_1_die_ranged',
    name: '+1 Die: Ranged',
    description: 'The Survivor rolls an extra die with Ranged Weapons.',
    type: 'STAT_MOD'
  },

  // Free Actions
  'plus_1_free_move': {
    id: 'plus_1_free_move',
    name: '+1 Free Move Action',
    description: 'The Survivor has one free Move Action per turn.',
    type: 'PASSIVE'
  },
  'plus_1_free_search': {
    id: 'plus_1_free_search',
    name: '+1 Free Search Action',
    description: 'The Survivor has one free Search Action per turn.',
    type: 'PASSIVE'
  },
  'plus_1_free_combat': {
    id: 'plus_1_free_combat',
    name: '+1 Free Combat Action',
    description: 'The Survivor has one free Combat Action (Melee or Ranged) per turn.',
    type: 'PASSIVE'
  },

  // Tactical / Utility
  'lucky': {
    id: 'lucky',
    name: 'Lucky',
    description: 'For each Action, the Survivor can re-roll all dice once.',
    type: 'STAT_MOD'
  },
  'sniper': {
    id: 'sniper',
    name: 'Sniper',
    description: 'The Survivor may freely choose the target of their Ranged Actions.',
    type: 'STAT_MOD'
  },
  'tough': {
    id: 'tough',
    name: 'Tough',
    description: 'The Survivor ignores the first Wound received every Turn.',
    type: 'PASSIVE'
  },
  'sprint': {
    id: 'sprint',
    name: 'Sprint',
    description: 'The Survivor can move up to 3 Zones for 1 Action.',
    type: 'ACTION'
  },
  'slippery': {
    id: 'slippery',
    name: 'Slippery',
    description: 'The Survivor does not spend extra Actions to move out of a Zone with Zombies.',
    type: 'PASSIVE'
  },
  'search_anywhere': {
    id: 'search_anywhere',
    name: 'Search: Anywhere',
    description: 'The Survivor may Search in any Zone (Street or Building).',
    type: 'PASSIVE'
  },
};

// Class Progression Tree Definition
export interface ClassProgression {
  [DangerLevel.Blue]: string[];   // 1 Skill (Fixed)
  [DangerLevel.Yellow]: string[]; // 1 Skill (Fixed)
  [DangerLevel.Orange]: string[]; // 2 Skills (Choose 1)
  [DangerLevel.Red]: string[];    // 3 Skills (Choose 1)
}

export const SURVIVOR_CLASSES: Record<string, ClassProgression> = {
  'Goth Girl': {
    [DangerLevel.Blue]: ['lucky'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['plus_1_free_move', 'plus_1_free_search'],
    [DangerLevel.Red]: ['plus_1_damage_melee', 'plus_1_damage_ranged', 'tough'],
  },
  'Standard': {
    [DangerLevel.Blue]: ['start_move'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['plus_1_die_melee', 'plus_1_die_ranged'],
    [DangerLevel.Red]: ['plus_1_free_combat', 'sniper', 'lucky'],
  },
  'Promotional': {
    [DangerLevel.Blue]: ['slippery'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['sprint', 'search_anywhere'],
    [DangerLevel.Red]: ['plus_1_damage_melee', 'plus_1_damage_ranged', 'plus_1_free_combat'],
  }
};
