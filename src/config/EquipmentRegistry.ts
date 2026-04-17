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
    stats: undefined
  },
  'water': {
    name: 'Water',
    type: EquipmentType.Item,
    stats: undefined
  },
  'flashlight': {
    name: 'Flashlight',
    type: EquipmentType.Item,
    stats: undefined
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
    stats: undefined
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
    stats: undefined
  },
  'plenty_of_shells': {
    name: 'Plenty of Shells',
    type: EquipmentType.Item,
    stats: undefined
  },
  'aaahh': {
    name: 'Aaahh!!',
    type: EquipmentType.Item,
    keywords: ['aaahh'],
    stats: undefined
  }
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
