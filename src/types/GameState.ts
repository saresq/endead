
import { TileInstance } from './Map';
import type { RngState } from '../services/Rng';

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
  ammo?: 'bullets' | 'shells'; // Drives Plenty of Bullets / Plenty of Shells re-rolls
  special?: 'molotov'; // Special weapon handler flag
}

export interface EquipmentCard {
  id: EntityId;
  /**
   * Stable registry key (e.g. 'pistol', 'aaahh_epic'). Survives reshuffles
   * and is the matching key for `CollectItems` win conditions. Stamped at
   * card creation in `DeckService` from the `EquipmentRegistry` key.
   */
  equipmentId: string;
  name: string;
  type: EquipmentType;
  stats?: WeaponStats; // Only for weapons
  inHand: boolean; // true if equipped in hand, false if in backpack
  slot?: 'HAND_1' | 'HAND_2' | 'BACKPACK' | 'BACKPACK_0' | 'BACKPACK_1' | 'BACKPACK_2' | 'DISCARD';
  canOpenDoor?: boolean;
  openDoorNoise?: boolean;
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
  rush?: boolean; // Spawned zombies immediately activate (only the just-spawned ones)
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
  characterClass: string; // e.g. "Wanda", "Doug", "Amy", "Ned", "Elle", "Josh"
  
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

  // Tough skill tracking (per-source: zombie attacks vs friendly fire are independent)
  toughUsedZombieAttack: boolean;
  toughUsedFriendlyFire: boolean;

  // Free melee/ranged action tracking (reset each turn in endRound)
  freeMeleeRemaining: number;
  freeRangedRemaining: number;

  // Once-per-turn skill tracking (additional)
  sprintUsedThisTurn: boolean;
  chargeUsedThisTurn: boolean;
  bornLeaderUsedThisTurn: boolean;
  bloodlustUsedThisTurn: boolean;
  lifesaverUsedThisTurn: boolean;
  hitAndRunFreeMove: boolean;
  luckyUsedThisTurn: boolean;

  // Pending wounds for "Is That All You've Got?" resolution
  pendingWounds?: number;

  // Cheat mode — survivor takes unlimited actions per turn (cosmetic + gameplay).
  cheatMode?: boolean;
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
  /** Color of the Objective token (yellow/blue/green) — present iff `hasObjective` is true. */
  objectiveColor?: ObjectiveColor;
  /** Present iff this zone is a colored Spawn Zone (dormant until matching Objective is taken). */
  spawnColor?: ObjectiveColor.Blue | ObjectiveColor.Green;
  /** Present iff a red Epic Weapon Crate token sits in this zone. */
  hasEpicCrate?: boolean;
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
  ReachExit = 'REACH_EXIT',                     // All living survivors must occupy the exit zone (no zombies)
  TakeObjective = 'TAKE_OBJECTIVE',             // Count of yellow Objective tokens taken
  TakeColorObjective = 'TAKE_COLOR_OBJECTIVE',  // Count of blue OR green Objective tokens taken
  TakeEpicCrate = 'TAKE_EPIC_CRATE',            // Count of red Epic Weapon Crates taken
  KillZombie = 'KILL_ZOMBIE',                   // Kill X zombies of a specific type (or any)
  CollectItems = 'COLLECT_ITEMS',               // Inventory contains the listed equipment IDs in the listed quantities
  ReachDangerLevel = 'REACH_DANGER_LEVEL',      // Team max survivor danger level reaches threshold
}

export enum ObjectiveColor {
  Yellow = 'YELLOW', // common Objective token
  Red    = 'RED',    // Epic Weapon Crate token
  Blue   = 'BLUE',   // dormant blue spawns / blue Objective token
  Green  = 'GREEN',  // dormant green spawns / green Objective token
}

export interface ItemRequirement {
  /** Stable key from EQUIPMENT_CARDS / EPIC_EQUIPMENT_CARDS — matched against `EquipmentCard.equipmentId`. */
  equipmentId: string;
  quantity: number;
}

interface ObjectiveBase {
  id: string;
  description: string;
  completed: boolean;
  /** XP given when this objective is completed/taken (usually 5 for non-Epic). */
  xpValue?: number;
}

export type Objective =
  | (ObjectiveBase & { type: ObjectiveType.ReachExit; exitZoneId: string })
  | (ObjectiveBase & { type: ObjectiveType.TakeObjective; amountRequired: number; amountCurrent: number })
  | (ObjectiveBase & { type: ObjectiveType.TakeColorObjective; objectiveColor: ObjectiveColor.Blue | ObjectiveColor.Green; amountRequired: number; amountCurrent: number })
  | (ObjectiveBase & { type: ObjectiveType.TakeEpicCrate; amountRequired: number; amountCurrent: number })
  | (ObjectiveBase & { type: ObjectiveType.KillZombie; zombieType: ZombieType | 'ANY'; amountRequired: number; amountCurrent: number })
  | (ObjectiveBase & { type: ObjectiveType.CollectItems; itemRequirements: ItemRequirement[] })
  | (ObjectiveBase & { type: ObjectiveType.ReachDangerLevel; dangerThreshold: DangerLevel });

// New Interface for Lobby Data
export interface LobbyState {
  players: {
    id: PlayerId;
    name: string; // Display name
    ready: boolean;
    characterClass: string; // Selected character
  }[];
  /**
   * Set when the host (lobby.players[0]) drops in lobby phase and at
   * least one survivor remains. Epoch ms; client uses the value as a
   * change-detection signal to fire the host-promoted banner.
   * Optional so existing serialized states/tests don't break.
   */
  hostLeftAt?: number;
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
  seed: RngState; // xoshiro128** state — 4×uint32 tuple, serializes as JSON array
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

  /**
   * Per-color dormant-spawn activation state. Zones with `spawnColor` are
   * dormant while `activated === false`. After the matching colored
   * Objective is taken, activation flips to true and `activatedOnTurn`
   * stamps the turn number.
   *
   * Spawn gate (per RULEBOOK §9): a colored zone spawns on a Zombie Phase
   * iff `activation.activated && currentTurn > activation.activatedOnTurn`.
   * `state.turn` increments in `endRound()` AFTER spawning, so during
   * turn N's Zombie Phase `state.turn === N`, which `>` correctly skips —
   * the first dormant spawn happens on turn N+1's Zombie Phase.
   *
   * Yellow and Red are intentionally NOT represented here — they don't
   * drive dormancy. Narrowed key type prevents accidental writes.
   */
  spawnColorActivation: Record<
    ObjectiveColor.Blue | ObjectiveColor.Green,
    { activated: boolean; activatedOnTurn: number }
  >;
  
  // Decks
  equipmentDeck: EquipmentCard[];
  equipmentDiscard: EquipmentCard[];
  /** Epic Weapons deck — drawn from when a survivor takes a red Epic Crate token. */
  epicDeck: EquipmentCard[];
  epicDiscard: EquipmentCard[];
  spawnDeck: SpawnCard[];
  spawnDiscard: SpawnCard[];
  
  // Global State
  noiseTokens: number; // Total noise on board (if limited) or just logic handling
  
  // Meta
  config: {
    maxSurvivors: number;
    friendlyFire: boolean;
    abominationFest?: boolean; // Allow unlimited Abominations (default: false = max 1)
    zombiePool: { [key in ZombieType]: number }; // Miniature pool limits
  };
  
  // History
  history: Array<{
    playerId: string;
    survivorId: string;
    actionType: string;
    timestamp: number;
    turn?: number;
    payload?: any;
    // Rich action feedback (captured from lastAction)
    description?: string;
    dice?: number[];
    hits?: number;
    damagePerHit?: number;
    bonusDice?: number;
    bonusDamage?: number;
    rerolledFrom?: number[];
    rerollSource?: 'lucky' | 'plenty_of_bullets' | 'plenty_of_shells';
    usedFreeAction?: boolean;
    freeActionType?: string;
    // Spawn context for END_TURN entries
    spawnContext?: GameState['spawnContext'];
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
    // Combat feedback metadata
    rerolledFrom?: number[];         // Original dice before a reroll (Lucky or ammo)
    rerollSource?: 'lucky' | 'plenty_of_bullets' | 'plenty_of_shells';
    bonusDice?: number;              // Skill bonus dice applied
    bonusDamage?: number;            // Skill bonus damage applied
    damagePerHit?: number;           // Effective damage per hit
    usedFreeAction?: boolean;        // Whether a free action was consumed
    freeActionType?: string;         // Which free action type was used
    /** Set when a colored Objective was taken — flips dormant spawns of that color. */
    colorActivated?: ObjectiveColor;
    /** Set when an Epic Weapon Crate was taken — equipmentId of the drawn epic weapon. */
    epicWeaponDrawn?: string;
    // Captured on ATTACK when the actor has Lucky unspent — enables rollback-and-reroll.
    rollbackSnapshot?: {
      /** RNG state AFTER the dice were rolled but BEFORE any side effects consumed seed.
       *  On reroll, the fresh roll starts here → fresh rolls differ from the first attempt. */
      seedAfterRoll: RngState;
      zombies: Record<string, import('./GameState').Zombie>;
      survivors: Record<string, import('./GameState').Survivor>;
      equipmentDeck: import('./GameState').EquipmentCard[];
      equipmentDiscard: import('./GameState').EquipmentCard[];
      objectives: import('./GameState').Objective[];
      noiseTokens: number;
      zoneNoise: Record<string, number>;
      /** Original attack intent — re-dispatched verbatim on reroll. */
      attackPayload: Record<string, unknown>;
      /** Original dice, surfaced as `rerolledFrom` after the reroll completes. */
      originalDice: number[];
    };
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

  // Pending zombie wound distributions (player must assign wounds among survivors)
  pendingZombieWounds?: Array<{
    zoneId: string;
    totalWounds: number;
    survivorIds: string[];
  }>;

  // Monotonic counter for unique zombie IDs
  nextZombieId: number;

  // Transient: extra AP cost stashed by a handler for the dispatcher to consume
  _extraAPCost?: number;
  // Transient: whether current attack is melee (for free melee/ranged action deduction)
  _attackIsMelee?: boolean;
}

// --- Example Initial State ---

export const initialGameState: GameState = {
  id: 'session-12345',
  seed: [0xdeadbeef, 0xcafef00d, 0x13579bdf, 0x2468ace0],
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
  spawnColorActivation: {
    [ObjectiveColor.Blue]: { activated: false, activatedOnTurn: 0 },
    [ObjectiveColor.Green]: { activated: false, activatedOnTurn: 0 },
  },
  tiles: [], // Populated later

  equipmentDeck: [], // Populated with card objects
  equipmentDiscard: [],
  epicDeck: [], // Populated by handleStartGame via DeckService.initializeEpicDeck
  epicDiscard: [],
  spawnDeck: [], // Populated with spawn cards
  spawnDiscard: [],
  
  noiseTokens: 0,
  
  config: {
    maxSurvivors: 6,
    friendlyFire: true,
    abominationFest: false,
    zombiePool: {
      [ZombieType.Walker]: 40,
      [ZombieType.Runner]: 16,
      [ZombieType.Brute]: 16,
      [ZombieType.Abomination]: 4,
    },
  },

  history: []
};
