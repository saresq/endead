// src/config/EquipmentRegistry.ts

import { EquipmentCard, EquipmentType } from '../types/GameState';

export const EQUIPMENT_CARDS: Record<string, Omit<EquipmentCard, 'id' | 'inHand' | 'slot'>> = {
  'fire_axe': {
    name: 'Fire Axe',
    type: EquipmentType.Weapon,
    canOpenDoor: true,
    openDoorNoise: true,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 2,
      noise: false,
      dualWield: false,
    }
  },
  'crowbar': {
    name: 'Crowbar',
    type: EquipmentType.Weapon,
    canOpenDoor: true,
    openDoorNoise: true,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: false,
      dualWield: false,
    }
  },
  'pistol': {
    name: 'Pistol',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 1],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: true,
      dualWield: true,
      ammo: 'bullets',
    }
  },
  'shotgun': {
    name: 'Shotgun',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 1],
      dice: 2,
      accuracy: 4,
      damage: 2,
      noise: true,
      dualWield: false,
      ammo: 'shells',
    }
  },
  'rifle': {
    name: 'Rifle',
    type: EquipmentType.Weapon,
    keywords: ['sniper'],
    stats: {
      range: [1, 3],
      dice: 1,
      accuracy: 2,
      damage: 2,
      noise: true,
      dualWield: false,
      ammo: 'bullets',
    }
  },
  'canned_food': {
    name: 'Canned Food',
    type: EquipmentType.Item,
  },
  'water': {
    name: 'Water',
    type: EquipmentType.Item,
  },
  'flashlight': {
    name: 'Flashlight',
    type: EquipmentType.Item,
  },
  'molotov': {
    name: 'Molotov',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 1],
      dice: 0, // Special rules
      accuracy: 0,
      damage: 3, // Kills everything
      noise: true,
      dualWield: false,
      special: 'molotov'
    }
  },
  'baseball_bat': {
    name: 'Baseball Bat',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 2,
      accuracy: 4,
      damage: 1,
      noise: false,
      dualWield: false
    }
  },
  'katana': {
    name: 'Katana',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 2,
      noise: false,
      dualWield: true
    }
  },
  'machete': {
    name: 'Machete',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: false,
      dualWield: true
    }
  },
  'chainsaw': {
    name: 'Chainsaw',
    type: EquipmentType.Weapon,
    canOpenDoor: true,
    openDoorNoise: true,
    stats: {
      range: [0, 0],
      dice: 5,
      accuracy: 5,
      damage: 2,
      noise: true,
      dualWield: false
    }
  },
  'sawed_off': {
    name: 'Sawed-Off',
    type: EquipmentType.Weapon,
    keywords: ['reload'],
    stats: {
      range: [0, 1],
      dice: 2,
      accuracy: 4,
      damage: 1,
      noise: true,
      dualWield: false,
      ammo: 'shells',
    }
  },
  'sub_mg': {
    name: 'Sub MG',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 1],
      dice: 3,
      accuracy: 5,
      damage: 1,
      noise: true,
      dualWield: true,
      ammo: 'bullets',
    }
  },
  'plenty_of_bullets': {
    name: 'Plenty of Bullets',
    type: EquipmentType.Item,
  },
  'kukri': {
    name: 'Kukri',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: false,
      dualWield: true
    }
  },
  'bag_of_rice': {
    name: 'Bag of Rice',
    type: EquipmentType.Item,
  },
  'plenty_of_shells': {
    name: 'Plenty of Shells',
    type: EquipmentType.Item,
  },
  'aaahh': {
    name: 'Aaahh!!',
    type: EquipmentType.Item,
    keywords: ['aaahh'],
  }
};

// --- Epic Weapons (red-back deck, granted by Epic Weapon Crate objectives) ---

export const EPIC_EQUIPMENT_CARDS: Record<string, Omit<EquipmentCard, 'id' | 'inHand' | 'slot'>> = {
  'epic_golden_kukri': {
    name: 'Golden Kukri',
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 2, accuracy: 3, damage: 2, noise: false, dualWield: true }
  },
  'epic_mas_shotgun': {
    name: "Ma's Shotgun",
    type: EquipmentType.Weapon,
    keywords: ['reload'],
    stats: { range: [0, 1], dice: 3, accuracy: 4, damage: 2, noise: true, dualWield: false, ammo: 'shells' }
  },
  'epic_zantetsuken': {
    name: 'Zantetsuken',
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 2, accuracy: 4, damage: 3, noise: false, dualWield: false }
  },
  'epic_gunblade': {
    name: 'Gunblade',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 2, accuracy: 4, damage: 2, noise: true, dualWield: false, ammo: 'bullets', hybrid: true }
  },
  'epic_evil_twins': {
    name: 'Evil Twins',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 2, accuracy: 3, damage: 1, noise: true, dualWield: true, ammo: 'bullets' }
  },
  'epic_golden_ak47': {
    name: 'Golden AK-47',
    type: EquipmentType.Weapon,
    stats: { range: [0, 2], dice: 3, accuracy: 4, damage: 1, noise: true, dualWield: false, ammo: 'bullets' }
  },
  'epic_army_sniper_rifle': {
    name: 'Army Sniper Rifle',
    type: EquipmentType.Weapon,
    keywords: ['sniper'],
    stats: { range: [1, 3], dice: 1, accuracy: 2, damage: 3, noise: true, dualWield: false, ammo: 'bullets' }
  },
  'epic_automatic_shotgun': {
    name: 'Automatic Shotgun',
    type: EquipmentType.Weapon,
    stats: { range: [0, 1], dice: 3, accuracy: 4, damage: 2, noise: true, dualWield: false, ammo: 'shells' }
  },
  'epic_nailbat': {
    name: 'Nailbat',
    type: EquipmentType.Weapon,
    stats: { range: [0, 0], dice: 2, accuracy: 3, damage: 2, noise: false, dualWield: false }
  },
  'epic_aaahh': {
    name: 'Aaahh!!',
    type: EquipmentType.Item,
    keywords: ['aaahh'],
  },
};

export const INITIAL_EPIC_DECK_CONFIG = [
  'epic_golden_kukri',
  'epic_mas_shotgun',
  'epic_zantetsuken',
  'epic_gunblade',
  'epic_evil_twins',
  'epic_golden_ak47',
  'epic_army_sniper_rifle',
  'epic_automatic_shotgun',
  'epic_nailbat',
  'epic_aaahh', 'epic_aaahh',
];

/** Upper bound on Epic Crate objectives an authored map may contain. Each
 *  crate consumes one Epic draw; placing more than the deck holds would
 *  force an `EPIC_DECK_EXHAUSTED` event during play. Enforced at save time
 *  by the `/api/maps` endpoint (see src/server/server.ts). */
export const EPIC_DECK_SIZE = INITIAL_EPIC_DECK_CONFIG.length;

// Grey-back starter deck (RULEBOOK §Setup). Each seat claims one card at
// lobby time via the starter-pick flow. Total 6 cards — max 6 players.
export const STARTER_DECK_POOL: Record<string, number> = {
  baseball_bat: 1,
  crowbar: 1,
  fire_axe: 1,
  pistol: 3,
};

// Zombicide 2nd Edition — Standard Equipment deck (45 cards, blue backs).
// Starting Equipment (Baseball Bat, Crowbar, Fire Axe, Pistol x3) is dealt
// at setup from a separate grey-back deck and is NOT part of this deck.
export const INITIAL_DECK_CONFIG = [
  // Melee weapons
  'fire_axe',
  'crowbar',
  'chainsaw', 'chainsaw',
  'katana', 'katana',
  'kukri', 'kukri',
  'machete', 'machete', 'machete', 'machete',

  // Ranged weapons
  'pistol',
  'sawed_off', 'sawed_off', 'sawed_off', 'sawed_off',
  'shotgun', 'shotgun',
  'sub_mg', 'sub_mg',
  'rifle', 'rifle',

  // Throwables
  'molotov', 'molotov', 'molotov', 'molotov',

  // Utility
  'flashlight', 'flashlight',
  'plenty_of_bullets', 'plenty_of_bullets', 'plenty_of_bullets',
  'plenty_of_shells', 'plenty_of_shells', 'plenty_of_shells',

  // Food
  'bag_of_rice', 'bag_of_rice',
  'canned_food', 'canned_food',
  'water', 'water',

  // Trap cards
  'aaahh', 'aaahh', 'aaahh', 'aaahh',
];
