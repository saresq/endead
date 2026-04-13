
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
  special?: 'molotov'; // Special weapon handler flag
}

export interface EquipmentCard {
  id: EntityId;
  name: string;
  type: EquipmentType;
  stats?: WeaponStats; // Only for weapons
  inHand: boolean; // true if equipped in hand, false if in backpack
  slot?: 'BODY' | 'HAND_1' | 'HAND_2' | 'BACKPACK' | 'BACKPACK_0' | 'BACKPACK_1' | 'BACKPACK_2' | 'DISCARD';
  canOpenDoor?: boolean;
  openDoorNoise?: boolean;
  armorValue?: number; // Damage reduction when equipped (e.g. Goalie Mask = 1)
  keywords?: string[]; // e.g. ['sniper'], ['reload']
}

export enum ZombieType {
  Walker = 'WALKER',
  Runner = 'RUNNER',
  Brute = 'BRUTE',
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
  characterClass: string; // e.g. "Wanda", "Doug", "Amy", "Ned", "Phil", "Josh"
  
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

  // Free action tracking (reset each turn in endRound)
  freeMovesRemaining: number;
  freeSearchesRemaining: number;
  freeCombatsRemaining: number;

  // Tough skill tracking
  toughUsedThisTurn: boolean;
}

export interface Zombie extends Entity {
  type: ZombieType;
  wounds: number; // For multi-wound zombies like Abominations/Fatties (if house rules or specific types)
  activated: boolean; // Track if acted this turn
}

// --- World ---

/**
 * Describes a connection from this zone to an adjacent zone.
 */
export interface ZoneConnection {
  toZoneId: ZoneId;
  hasDoor: boolean;    // true if a door exists on this edge
  doorOpen: boolean;   // only meaningful if hasDoor=true
}

export interface Zone {
  id: ZoneId;
  connections: ZoneConnection[];  // Edge-level connectivity with door state
  isBuilding: boolean;
  hasNoise: boolean;
  noiseTokens: number;
  spawnPoint?: boolean;
  exitPoint?: boolean;
  isExit?: boolean;
  hasObjective?: boolean;
  searchable: boolean;
  isDark: boolean;
  hasBeenSpawned: boolean;
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

  // Spectators — players who joined mid-game as read-only observers
  spectators: PlayerId[];

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

  // Zone geometry: maps between zone IDs and their constituent grid cells.
  // Static after compilation — does not change during gameplay.
  zoneGeometry?: {
    /** Zone ID → list of grid cells that make up this zone */
    zoneCells: Record<ZoneId, { x: number; y: number }[]>;
    /** Cell key "x,y" → zone ID that contains this cell */
    cellToZone: Record<string, ZoneId>;
  };

  /** Edge classifications between adjacent cells. Key: "x1,y1|x2,y2" (normalized). */
  edgeClassMap?: Record<string, string>;
  /** Door positions. Key: same edge key format. */
  doorPositions?: Record<string, { x1: number; y1: number; x2: number; y2: number; open: boolean }>;
  /** Cell type info. Key: "x,y". */
  cellTypes?: Record<string, 'street' | 'building'>;

  /** Ordered spawn zone IDs — placement order from the map editor determines spawn order. */
  spawnZoneIds?: string[];

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

  // Monotonic counter for unique zombie IDs
  nextZombieId: number;

  // Transient: extra AP cost stashed by a handler for the dispatcher to consume
  _extraAPCost?: number;
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

  spectators: [],

  players: [], // Populated from Lobby on Start
  activePlayerIndex: 0,
  firstPlayerTokenIndex: 0,
  
  survivors: {}, // Empty initially
  zombies: {},
  nextZombieId: 1,

  zones: {}, // Populated by handleStartGame via ScenarioCompiler
  
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
