// src/config/EquipmentRegistry.ts

import { EquipmentCard, EquipmentType } from '../types/GameState';

export const EQUIPMENT_CARDS: Record<string, Omit<EquipmentCard, 'id' | 'inHand' | 'slot'>> = {
  'fire_axe': {
    name: 'Fire Axe',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 2,
      noise: true,
      dualWield: false,
    }
  },
  'crowbar': {
    name: 'Crowbar',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 4,
      damage: 1,
      noise: true,
      dualWield: false,
    }
  },
  'pistol': {
    name: 'Pistol',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 1],
      dice: 1,
      accuracy: 3,
      damage: 1,
      noise: true,
      dualWield: true,
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
    }
  },
  'rifle': {
    name: 'Rifle',
    type: EquipmentType.Weapon,
    stats: {
      range: [1, 3],
      dice: 1,
      accuracy: 3,
      damage: 1,
      noise: true,
      dualWield: false,
    }
  },
  'pan': {
    name: 'Frying Pan',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 1,
      accuracy: 6,
      damage: 1,
      noise: true,
      dualWield: false,
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
      dualWield: false
    }
  },
  'baseball_bat': {
    name: 'Baseball Bat',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 2,
      accuracy: 3,
      damage: 1,
      noise: true,
      dualWield: false
    }
  },
  'katana': {
    name: 'Katana',
    type: EquipmentType.Weapon,
    stats: {
      range: [0, 0],
      dice: 2,
      accuracy: 4,
      damage: 1,
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
      accuracy: 3,
      damage: 2,
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
    stats: {
      range: [0, 1],
      dice: 2,
      accuracy: 3,
      damage: 1,
      noise: true,
      dualWield: true
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
      dualWield: true
    }
  },
  'plenty_of_ammo': {
    name: 'Plenty of Ammo',
    type: EquipmentType.Item,
    stats: undefined
  },
  'go_hockeys': {
    name: 'Goalie Mask',
    type: EquipmentType.Armor,
    stats: undefined
  }
};

export const INITIAL_DECK_CONFIG = [
  // Melee
  'fire_axe', 'fire_axe', 
  'crowbar', 'crowbar',
  'pan', 'pan', 'pan',
  'baseball_bat', 'baseball_bat',
  'katana', 'katana',
  'machete', 'machete',
  'chainsaw',

  // Ranged
  'pistol', 'pistol', 'pistol',
  'sawed_off', 'sawed_off',
  'sub_mg', 'sub_mg',
  'shotgun', 'shotgun',
  'rifle', 'rifle',
  
  // Items
  'canned_food', 'canned_food', 'canned_food',
  'water', 'water', 'water',
  'flashlight', 'flashlight',
  'molotov', 'molotov', 'molotov',
  'plenty_of_ammo', 'plenty_of_ammo', 'plenty_of_ammo',
  'go_hockeys'
];
