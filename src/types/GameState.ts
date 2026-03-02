
import { TileInstance } from './Map';

export type EntityId = string;
export type ZoneId = string;
export type PlayerId = string;

export enum Direction {
  North = 'NORTH',
  East = 'EAST',
  South = 'SOUTH',
  West = 'WEST',
}

export interface Position {
  x: number;
  y: number;
  zoneId: ZoneId; // Logical zone reference for movement/visibility
}

// --- Cards & Decks ---

export enum EquipmentType {
  Weapon = 'WEAPON',
  Armor = 'ARMOR',
  Item = 'ITEM',
}

export enum AttackType {
  Melee = 'MELEE',
  Ranged = 'RANGED',
}

export interface WeaponStats {
  range: [number, number]; // min, max
  dice: number;
  accuracy: number; // e.g. 4+
  damage: number;
  noise: boolean;
  dualWield: boolean;
}

export interface EquipmentCard {
  id: EntityId;
  name: string;
  type: EquipmentType;
  stats?: WeaponStats; // Only for weapons
  inHand: boolean; // true if equipped in hand, false if in backpack
  slot?: 'BODY' | 'HAND_1' | 'HAND_2' | 'BACKPACK' | 'DISCARD';
  canOpenDoor?: boolean;
  openDoorNoise?: boolean;
}

export enum ZombieType {
  Walker = 'WALKER',
  Runner = 'RUNNER',
  Fatty = 'FATTY',
  Abomination = 'ABOMINATION',
}

export interface SpawnDetail {
  zombies?: {
    [key in ZombieType]?: number;
  };
  extraActivation?: ZombieType; // e.g. "All Walkers move"
  doubleSpawn?: boolean;
}

export interface SpawnCard {
  id: EntityId;
  [DangerLevel.Blue]: SpawnDetail;
  [DangerLevel.Yellow]: SpawnDetail;
  [DangerLevel.Orange]: SpawnDetail;
  [DangerLevel.Red]: SpawnDetail;
}

// --- Entities ---

export interface Entity {
  id: EntityId;
  position: Position;
}

export enum WoundLevel {
  Healthy = 0,
  Wounded = 1,
  Dead = 2, // Depending on survivor max health
}

export interface Survivor extends Entity {
  playerId: PlayerId;
  name: string;
  characterClass: string; // e.g. "Standard", "Promotional"
  
  // Stats
  actionsPerTurn: number;
  maxHealth: number;
  wounds: number;
  
  // Experience & Level
  experience: number;
  dangerLevel: DangerLevel;
  skills: string[]; // Unlocked skills
  
  // Inventory
  inventory: EquipmentCard[];
  
  // State
  actionsRemaining: number;
  hasMoved: boolean;
  hasSearched: boolean;
  drawnCard?: EquipmentCard; // Temporary holding slot for Search/Draw
}

export interface Zombie extends Entity {
  type: ZombieType;
  wounds: number; // For multi-wound zombies like Abominations/Fatties (if house rules or specific types)
  activated: boolean; // Track if acted this turn
}

// --- World ---

/**
 * Describes a connection from this zone to an adjacent zone.
 * Replaces the old flat connectedZones + zone-level doorOpen model.
 */
export interface ZoneConnection {
  toZoneId: ZoneId;
  hasDoor: boolean;    // true if a door exists on this edge
  doorOpen: boolean;   // only meaningful if hasDoor=true
}

export interface Zone {
  id: ZoneId;
  connections: ZoneConnection[];  // Edge-level connectivity with door state
  connectedZones: ZoneId[];       // Convenience: derived list of connected zone IDs (kept for backward compat)
  isBuilding: boolean;
  hasNoise: boolean;
  noiseTokens: number;
  spawnPoint?: boolean;
  exitPoint?: boolean;
  isExit?: boolean;
  hasObjective?: boolean;
  searchable: boolean;
  doorOpen: boolean;  // DEPRECATED: kept for legacy map compat, use connections[].doorOpen instead
}

// --- Game State ---

export enum DangerLevel {
  Blue = 'BLUE',
  Yellow = 'YELLOW',
  Orange = 'ORANGE',
  Red = 'RED',
}

export enum GamePhase {
  Lobby = 'LOBBY', // New Phase
  Players = 'PLAYERS',
  Zombies = 'ZOMBIES',
  Spawn = 'SPAWN',
  End = 'END',
  GameOver = 'GAME_OVER',
}

export enum GameResult {
  Victory = 'VICTORY',
  Defeat = 'DEFEAT'
}

export enum ObjectiveType {
  ReachExit = 'REACH_EXIT', // All survivors must reach this zone (no zombies allowed)
  TakeObjective = 'TAKE_OBJECTIVE', // Take X objectives
  KillZombie = 'KILL_ZOMBIE', // Kill X zombies of a specific type (or any)
  CollectItem = 'COLLECT_ITEM', // Have X specific items in inventory
}

export interface Objective {
  id: string;
  type: ObjectiveType;
  description: string;
  targetId?: string; // ZoneId (for ReachExit), ZombieType (for Kill), ItemName (for Collect)
  amountRequired: number;
  amountCurrent: number;
  completed: boolean;
  xpValue?: number; // XP given when this objective is completed/taken (usually 5)
}

// New Interface for Lobby Data
export interface LobbyState {
  players: {
    id: PlayerId;
    name: string; // Display name
    ready: boolean;
    characterClass: string; // Selected character
  }[];
}

export interface TradeSession {
  activeSurvivorId: EntityId;
  targetSurvivorId: EntityId;
  
  // Track each side's offer
  offers: {
    [survivorId: string]: EntityId[]; // List of card IDs offered
  };
  
  // Track desired slot for received items (CardId -> SlotName)
  receiveLayouts: {
    [survivorId: string]: Record<EntityId, string>; 
  };

  // Acceptance status
  status: {
    [survivorId: string]: boolean;
  };
}

export interface GameState {
  id: string; // Game Session ID
  seed: string; // RNG Seed for deterministic replay
  turn: number;
  phase: GamePhase;
  gameResult?: GameResult;
  
  // Lobby Data (Only active during LOBBY phase, but kept for reference)
  lobby: LobbyState;

  // Active Trade Session (if any)
  activeTrade?: TradeSession;

  // Danger Level (highest survivor XP determines this usually)
  currentDangerLevel: DangerLevel;
  
  // Players & Turn Order
  players: PlayerId[];
  activePlayerIndex: number;
  firstPlayerTokenIndex: number; // Who has the "First Player" token
  
  // Entities
  survivors: Record<EntityId, Survivor>;
  zombies: Record<EntityId, Zombie>;
  
  // Map
  zones: Record<ZoneId, Zone>;
  tiles?: TileInstance[]; // Visual Background Layer


  // Objectives
  objectives: Objective[]; // Dynamic Objectives List
  
  // Decks
  equipmentDeck: EquipmentCard[];
  equipmentDiscard: EquipmentCard[];
  spawnDeck: SpawnCard[];
  spawnDiscard: SpawnCard[];
  
  // Global State
  noiseTokens: number; // Total noise on board (if limited) or just logic handling
  
  // Meta
  config: {
    maxSurvivors: number;
    friendlyFire: boolean;
  };
  
  // History
  history: Array<{
    playerId: string;
    survivorId: string;
    actionType: string;
    timestamp: number;
    payload?: any;
  }>;

  // UI / Feedback State
  lastAction?: {
    type: string;
    playerId: string;
    survivorId?: string;
    dice?: number[];
    hits?: number;
    description?: string;
    timestamp: number;
  };
  
  spawnContext?: {
      cards: {
          zoneId: string;
          cardId: string;
          detail: SpawnDetail; // The detail that was applied
          dangerLevel: DangerLevel;
      }[];
      timestamp: number;
  };
}

// --- Example Initial State ---

export const initialGameState: GameState = {
  id: 'session-12345',
  seed: 'seed-987654321',
  turn: 0, // 0 means not started
  phase: GamePhase.Lobby, // Start in Lobby
  currentDangerLevel: DangerLevel.Blue,
  
  lobby: {
    players: [] // Empty initially, populated on connection
  },

  players: [], // Populated from Lobby on Start
  activePlayerIndex: 0,
  firstPlayerTokenIndex: 0,
  
  survivors: {}, // Empty initially
  zombies: {},
  
  zones: {
    // --- Streets ---
    'street-start': {
      id: 'street-start',
      connections: [
        { toZoneId: 'street-intersection', hasDoor: false, doorOpen: true },
        { toZoneId: 'police-reception', hasDoor: true, doorOpen: false },
      ],
      connectedZones: ['street-intersection', 'police-reception'],
      isBuilding: false,
      hasNoise: false,
      noiseTokens: 0,
      searchable: false,
      doorOpen: true,
      spawnPoint: false,
    },
    'street-intersection': {
      id: 'street-intersection',
      connections: [
        { toZoneId: 'street-start', hasDoor: false, doorOpen: true },
        { toZoneId: 'street-east', hasDoor: false, doorOpen: true },
        { toZoneId: 'street-north', hasDoor: false, doorOpen: true },
        { toZoneId: 'street-south', hasDoor: false, doorOpen: true },
      ],
      connectedZones: ['street-start', 'street-east', 'street-north', 'street-south'],
      isBuilding: false,
      hasNoise: false,
      noiseTokens: 0,
      searchable: false,
      doorOpen: true,
      spawnPoint: false,
    },
    'street-east': {
      id: 'street-east',
      connections: [
        { toZoneId: 'street-intersection', hasDoor: false, doorOpen: true },
      ],
      connectedZones: ['street-intersection'],
      isBuilding: false,
      hasNoise: false,
      noiseTokens: 0,
      searchable: false,
      doorOpen: true,
      spawnPoint: true,
    },
    'street-north': {
      id: 'street-north',
      connections: [
        { toZoneId: 'street-intersection', hasDoor: false, doorOpen: true },
      ],
      connectedZones: ['street-intersection'],
      isBuilding: false,
      hasNoise: false,
      noiseTokens: 0,
      searchable: false,
      doorOpen: true,
      spawnPoint: false,
    },
    'street-south': {
      id: 'street-south',
      connections: [
        { toZoneId: 'street-intersection', hasDoor: false, doorOpen: true },
        { toZoneId: 'zone-exit', hasDoor: false, doorOpen: true },
        { toZoneId: 'diner-front', hasDoor: true, doorOpen: false },
      ],
      connectedZones: ['street-intersection', 'zone-exit', 'diner-front'],
      isBuilding: false,
      hasNoise: false,
      noiseTokens: 0,
      searchable: false,
      doorOpen: true,
      spawnPoint: true,
    },
    'zone-exit': {
      id: 'zone-exit',
      connections: [
        { toZoneId: 'street-south', hasDoor: false, doorOpen: true },
      ],
      connectedZones: ['street-south'],
      isBuilding: false,
      hasNoise: false,
      noiseTokens: 0,
      searchable: false,
      doorOpen: true,
      spawnPoint: false,
      isExit: true,
    },

    // --- Building 1: Police Station ---
    'police-reception': {
      id: 'police-reception',
      connections: [
        { toZoneId: 'police-armory', hasDoor: false, doorOpen: true },
        { toZoneId: 'street-start', hasDoor: true, doorOpen: false },
      ],
      connectedZones: ['police-armory', 'street-start'],
      isBuilding: true,
      hasNoise: false,
      noiseTokens: 0,
      searchable: true,
      doorOpen: false,
      spawnPoint: false,
      hasObjective: true,
    },
    'police-armory': {
      id: 'police-armory',
      connections: [
        { toZoneId: 'police-reception', hasDoor: false, doorOpen: true },
      ],
      connectedZones: ['police-reception'],
      isBuilding: true,
      hasNoise: false,
      noiseTokens: 0,
      searchable: true,
      doorOpen: true,
      spawnPoint: false,
    },

    // --- Building 2: Diner ---
    'diner-front': {
      id: 'diner-front',
      connections: [
        { toZoneId: 'diner-kitchen', hasDoor: false, doorOpen: true },
        { toZoneId: 'street-south', hasDoor: true, doorOpen: false },
      ],
      connectedZones: ['diner-kitchen', 'street-south'],
      isBuilding: true,
      hasNoise: false,
      noiseTokens: 0,
      searchable: true,
      doorOpen: false,
      spawnPoint: false,
    },
    'diner-kitchen': {
      id: 'diner-kitchen',
      connections: [
        { toZoneId: 'diner-front', hasDoor: false, doorOpen: true },
      ],
      connectedZones: ['diner-front'],
      isBuilding: true,
      hasNoise: false,
      noiseTokens: 0,
      searchable: true,
      doorOpen: true,
      spawnPoint: false,
    }
  },
  
  objectives: [], // Populated on Start Game
  tiles: [], // Populated later

  equipmentDeck: [], // Populated with card objects
  equipmentDiscard: [],
  spawnDeck: [], // Populated with spawn cards
  spawnDiscard: [],
  
  noiseTokens: 0,
  
  config: {
    maxSurvivors: 6,
    friendlyFire: true,
  },

  history: []
};
