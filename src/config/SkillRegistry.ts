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
  'plus_1_max_range': {
    id: 'plus_1_max_range',
    name: '+1 Max Range',
    description: 'The Survivor gets +1 to the maximum Range of all Ranged weapons.',
    type: 'STAT_MOD'
  },
  'plus_1_to_dice_roll_ranged': {
    id: 'plus_1_to_dice_roll_ranged',
    name: '+1 to Dice Roll: Ranged',
    description: 'The Survivor adds +1 to each die result when performing a Ranged Action. Max result is always 6.',
    type: 'STAT_MOD'
  },
  'plus_1_to_dice_roll_melee': {
    id: 'plus_1_to_dice_roll_melee',
    name: '+1 to Dice Roll: Melee',
    description: 'The Survivor adds +1 to each die result when performing a Melee Action. Max result is always 6.',
    type: 'STAT_MOD'
  },
  'plus_1_to_dice_roll_combat': {
    id: 'plus_1_to_dice_roll_combat',
    name: '+1 to Dice Roll: Combat',
    description: 'The Survivor adds +1 to each die result when performing a Combat Action. Max result is always 6.',
    type: 'STAT_MOD'
  },
  'steady_hand': {
    id: 'steady_hand',
    name: 'Steady Hand',
    description: 'When resolving Friendly Fire, the Survivor may choose which survivors are safe.',
    type: 'PASSIVE'
  },
  'search_anywhere': {
    id: 'search_anywhere',
    name: 'Search: Anywhere',
    description: 'The Survivor may Search in any Zone (Street or Building).',
    type: 'PASSIVE'
  },

  // Movement Skills
  'plus_1_zone_per_move': {
    id: 'plus_1_zone_per_move',
    name: '+1 Zone per Move',
    description: 'The Survivor may move 1 or 2 Zones with a single Move Action. Entering a Zone with Zombies still ends the Move.',
    type: 'PASSIVE'
  },
  'charge': {
    id: 'charge',
    name: 'Charge',
    description: 'Once per Turn, for free: Move up to 2 Zones to a Zone with at least 1 Zombie.',
    type: 'ACTION'
  },
  'hit_and_run': {
    id: 'hit_and_run',
    name: 'Hit & Run',
    description: 'After resolving a Melee or Ranged Action that kills at least 1 Zombie: free Move Action. No extra Actions for Zombies in Zone.',
    type: 'PASSIVE'
  },

  // Combat Skills
  'plus_1_die_combat': {
    id: 'plus_1_die_combat',
    name: '+1 Die: Combat',
    description: 'The Survivor rolls an extra die with all Combat weapons.',
    type: 'STAT_MOD'
  },
  'plus_1_damage_combat': {
    id: 'plus_1_damage_combat',
    name: '+1 Damage: Combat',
    description: 'The Survivor gets a +1 Damage bonus with all Combat weapons.',
    type: 'STAT_MOD'
  },
  'plus_1_free_melee': {
    id: 'plus_1_free_melee',
    name: '+1 Free Melee Action',
    description: 'The Survivor has one free Melee Action per turn.',
    type: 'PASSIVE'
  },
  'plus_1_free_ranged': {
    id: 'plus_1_free_ranged',
    name: '+1 Free Ranged Action',
    description: 'The Survivor has one free Ranged Action per turn.',
    type: 'PASSIVE'
  },
  'ambidextrous': {
    id: 'ambidextrous',
    name: 'Ambidextrous',
    description: 'Treats all weapons as having the Dual symbol.',
    type: 'PASSIVE'
  },
  'barbarian': {
    id: 'barbarian',
    name: 'Barbarian',
    description: 'When resolving a Melee Action, may substitute the weapon Dice number with the number of Zombies in the Zone.',
    type: 'ACTION'
  },
  'swordmaster': {
    id: 'swordmaster',
    name: 'Swordmaster',
    description: 'Treats all Melee weapons as having the Dual symbol.',
    type: 'PASSIVE'
  },
  'super_strength': {
    id: 'super_strength',
    name: 'Super Strength',
    description: 'Melee weapons used by this Survivor have Damage 3.',
    type: 'STAT_MOD'
  },
  'point_blank': {
    id: 'point_blank',
    name: 'Point-Blank',
    description: 'Can perform Ranged Actions at Range 0 regardless of minimum Range. At Range 0, freely choose targets and Friendly Fire is ignored.',
    type: 'PASSIVE'
  },

  // Utility Skills
  'born_leader': {
    id: 'born_leader',
    name: 'Born Leader',
    description: 'During this Survivor\'s Turn: give 1 free Action to another Survivor in the same Zone (used immediately).',
    type: 'ACTION'
  },
  'bloodlust_melee': {
    id: 'bloodlust_melee',
    name: 'Bloodlust: Melee',
    description: 'Once per Turn: spend 1 Action to Move up to 2 Zones to a Zone with at least 1 Zombie, then gain 1 free Melee Action.',
    type: 'ACTION'
  },
  'is_that_all_youve_got': {
    id: 'is_that_all_youve_got',
    name: 'Is That All You\'ve Got?',
    description: 'When about to endure Wounds: negate 1 Wound per Equipment card discarded.',
    type: 'PASSIVE'
  },
  'lifesaver': {
    id: 'lifesaver',
    name: 'Lifesaver',
    description: 'Once per Turn, free: Select a Zone at Range 1 with Zombie(s) and Survivor(s). Drag chosen Survivors to your Zone.',
    type: 'ACTION'
  },
  'hold_your_nose': {
    id: 'hold_your_nose',
    name: 'Hold Your Nose',
    description: 'Draw an Equipment card whenever the last Zombie in the Survivor\'s Zone is eliminated. Not a Search Action.',
    type: 'PASSIVE'
  },
  'medic': {
    id: 'medic',
    name: 'Medic',
    description: 'Free during each End Phase: this Survivor and all Survivors in same Zone may heal 1 Wound.',
    type: 'PASSIVE'
  },
  'matching_set': {
    id: 'matching_set',
    name: 'Matching Set',
    description: 'When Search draws a Dual weapon: immediately take a second copy from the Equipment deck.',
    type: 'PASSIVE'
  },
  'search_plus_1': {
    id: 'search_plus_1',
    name: 'Search: +1 Card',
    description: 'Draw 2 cards when Searching instead of 1.',
    type: 'PASSIVE'
  },
  'can_search_more_than_once': {
    id: 'can_search_more_than_once',
    name: 'Can Search More Than Once',
    description: 'Can Search multiple times per Turn (1 Action per Search).',
    type: 'PASSIVE'
  },
  'low_profile': {
    id: 'low_profile',
    name: 'Low Profile',
    description: 'Can\'t be hit by Friendly Fire (Molotov still applies).',
    type: 'PASSIVE'
  },
  'starts_with_equipment': {
    id: 'starts_with_equipment',
    name: 'Starts with Equipment',
    description: 'Begins the game with a specific piece of equipment.',
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
  // --- Zombicide 2nd Edition Base Game Characters ---

  'Wanda': {
    [DangerLevel.Blue]: ['plus_1_zone_per_move'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['slippery', 'plus_1_free_combat'],
    [DangerLevel.Red]: ['plus_1_damage_melee', 'plus_1_damage_ranged', 'sprint'],
  },
  'Ned': {
    [DangerLevel.Blue]: ['search_plus_1'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['hold_your_nose', 'plus_1_free_search'],
    [DangerLevel.Red]: ['sniper', 'lucky', 'tough'],
  },
  'Elle': {
    [DangerLevel.Blue]: ['sniper'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['plus_1_die_combat', 'plus_1_free_ranged'],
    [DangerLevel.Red]: ['plus_1_die_ranged', 'plus_1_free_combat', 'plus_1_to_dice_roll_ranged'],
  },
  'Amy': {
    [DangerLevel.Blue]: ['plus_1_free_move'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['medic', 'slippery'],
    [DangerLevel.Red]: ['plus_1_damage_melee', 'plus_1_free_combat', 'lucky'],
  },
  'Josh': {
    [DangerLevel.Blue]: ['slippery'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['charge', 'plus_1_free_move'],
    [DangerLevel.Red]: ['plus_1_damage_melee', 'plus_1_damage_ranged', 'tough'],
  },
  'Doug': {
    [DangerLevel.Blue]: ['matching_set'],
    [DangerLevel.Yellow]: ['plus_1_action'],
    [DangerLevel.Orange]: ['ambidextrous', 'born_leader'],
    [DangerLevel.Red]: ['plus_1_die_ranged', 'plus_1_die_melee', 'lucky'],
  },
  // // Test character — all skills unlocked at Blue level
  // 'H4x0r': {
  //   [DangerLevel.Blue]: [
  //     'plus_1_action', 'slippery', 'sprint', 'charge',
  //     'hit_and_run', 'plus_1_free_move', 'plus_1_free_search', 'plus_1_free_combat',
  //     'plus_1_free_melee', 'plus_1_free_ranged',
  //     'plus_1_damage_melee', 'plus_1_damage_ranged', 'plus_1_damage_combat',
  //     'plus_1_die_melee', 'plus_1_die_ranged', 'plus_1_die_combat',
  //     'plus_1_max_range', 'lucky', 'sniper', 'tough', 'steady_hand',
  //     'search_anywhere', 'super_strength',
  //     'point_blank', 'born_leader', 'bloodlust_melee', 'lifesaver',
  //     'ambidextrous', 'swordmaster', 'barbarian', 'medic',
  //     'hold_your_nose', 'matching_set', 'search_plus_1',
  //     'can_search_more_than_once', 'low_profile', 'is_that_all_youve_got',
  //   ],
  //   [DangerLevel.Yellow]: [],
  //   [DangerLevel.Orange]: [],
  //   [DangerLevel.Red]: [],
  // },
};
