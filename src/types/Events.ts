// src/types/Events.ts
//
// SwarmComms event wire protocol (analysis/SwarmComms.md §3.2, §3.3.1, §A).
//
// DO NOT import this file from any runtime module yet. Types only — Step 2
// ends with zero runtime usage. Step 3 begins emission.

import type {
  EntityId,
  ZoneId,
  PlayerId,
  Zombie,
  ZombieType,
  Survivor,
  EquipmentCard,
  Objective,
  DangerLevel,
  GameResult,
  SpawnDetail,
} from './GameState';

// ---------------------------------------------------------------------------
// SURVIVOR events
// ---------------------------------------------------------------------------

export interface SurvivorMovedEvent {
  type: 'SURVIVOR_MOVED';
  survivorId: EntityId;
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
}

export interface SurvivorSprintedEvent {
  type: 'SURVIVOR_SPRINTED';
  survivorId: EntityId;
  fromZoneId: ZoneId;
  path: ZoneId[];
}

export interface SurvivorWoundedEvent {
  type: 'SURVIVOR_WOUNDED';
  survivorId: EntityId;
  amount: number;
  source: 'zombie' | 'friendly_fire' | 'molotov';
}

export interface SurvivorHealedEvent {
  type: 'SURVIVOR_HEALED';
  survivorId: EntityId;
  amount: number;
}

export interface SurvivorDiedEvent {
  type: 'SURVIVOR_DIED';
  survivorId: EntityId;
}

export interface SurvivorXpGainedEvent {
  type: 'SURVIVOR_XP_GAINED';
  survivorId: EntityId;
  amount: number;
  newTotal: number;
}

export interface SurvivorDangerLevelChangedEvent {
  type: 'SURVIVOR_DANGER_LEVEL_CHANGED';
  survivorId: EntityId;
  newLevel: DangerLevel;
}

/** Server-side marker that this survivor is eligible to choose a new skill.
 *  NOT the player's chosen skill — see SURVIVOR_SKILL_CHOSEN. */
export interface SurvivorSkillEligibleEvent {
  type: 'SURVIVOR_SKILL_ELIGIBLE';
  survivorId: EntityId;
  atLevel: DangerLevel;
}

/** Emitted only on the CHOOSE_SKILL action — never inside an attack chain. */
export interface SurvivorSkillChosenEvent {
  type: 'SURVIVOR_SKILL_CHOSEN';
  survivorId: EntityId;
  skillId: string;
}

export interface SurvivorFreeActionConsumedEvent {
  type: 'SURVIVOR_FREE_ACTION_CONSUMED';
  survivorId: EntityId;
  pool: 'move' | 'search' | 'combat' | 'melee' | 'ranged';
}

export interface SurvivorActionsRemainingChangedEvent {
  type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED';
  survivorId: EntityId;
  newCount: number;
}

// ---------------------------------------------------------------------------
// COMBAT events
// ---------------------------------------------------------------------------

export interface AttackRolledEvent {
  type: 'ATTACK_ROLLED';
  shooterId: EntityId;
  targetZoneId: ZoneId;
  weaponId?: EntityId;
  isMelee: boolean;
  dice: number[];
  hits: number;
  damagePerHit: number;
  bonusDice?: number;
  bonusDamage?: number;
  /** Which hand is firing on this roll — used by clients to stagger dual-wield
   *  animations (analysis §A — two ATTACK_ROLLED events, one per hand). */
  hand?: 'HAND_1' | 'HAND_2';
}

/** §3.3.1 — the only event carrying a scoped PARTIAL_SNAPSHOT. `patch` is
 *  overwrite-semantics; client atomically replaces the listed subtrees.
 *  Equipment deck is reported as a count only (never contents): the server's
 *  deck order is the authoritative truth and a sniffing client must not see
 *  future draws. */
export interface AttackRerolledEvent {
  type: 'ATTACK_REROLLED';
  shooterId: EntityId;
  originalDice: number[];
  newDice: number[];
  patch: {
    zombies: Record<EntityId, Zombie>;
    survivors: Record<EntityId, Survivor>;
    objectives: Objective[];
    noiseTokens: number;
    zoneNoise: Record<ZoneId, number>;
    equipmentDeckCount: number;
    equipmentDiscardCount: number;
  };
  followupEvents: GameEvent[];
}

export interface MolotovDetonatedEvent {
  type: 'MOLOTOV_DETONATED';
  shooterId: EntityId;
  zoneId: ZoneId;
}

export interface FriendlyFirePendingEvent {
  type: 'FRIENDLY_FIRE_PENDING';
  shooterId: EntityId;
  targetZoneId: ZoneId;
  missCount: number;
  damagePerMiss: number;
  eligibleSurvivorIds: EntityId[];
}

export interface FriendlyFireAssignedEvent {
  type: 'FRIENDLY_FIRE_ASSIGNED';
  shooterId: EntityId;
  targetZoneId: ZoneId;
  assignments: Record<EntityId, number>;
}

export interface WeaponReloadedEvent {
  type: 'WEAPON_RELOADED';
  survivorId: EntityId;
  weaponIds: EntityId[];
}

export interface WeaponFiredNoiseEvent {
  type: 'WEAPON_FIRED_NOISE';
  shooterId: EntityId;
  zoneId: ZoneId;
}

// ---------------------------------------------------------------------------
// ZOMBIE events
// ---------------------------------------------------------------------------

export interface ZombieSpawnedEvent {
  type: 'ZOMBIE_SPAWNED';
  zombieId: EntityId;
  zoneId: ZoneId;
  zombieType: ZombieType;
}

export interface ZombieMovedEvent {
  type: 'ZOMBIE_MOVED';
  zombieId: EntityId;
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
}

/** §A — zombie-phase movement batches 5–50 individual moves into a single
 *  event so the wire doesn't fragment a phase. */
export interface ZombieBatchMovedEvent {
  type: 'ZOMBIE_BATCH_MOVED';
  moves: Array<{ zombieId: EntityId; fromZoneId: ZoneId; toZoneId: ZoneId }>;
}

export interface ZombieAttackedZoneEvent {
  type: 'ZOMBIE_ATTACKED_ZONE';
  zoneId: ZoneId;
  attackerZombieIds: EntityId[];
  totalWounds: number;
}

export interface ZombieWoundsPendingEvent {
  type: 'ZOMBIE_WOUNDS_PENDING';
  zoneId: ZoneId;
  totalWounds: number;
  survivorIds: EntityId[];
}

export interface ZombieWoundsDistributedEvent {
  type: 'ZOMBIE_WOUNDS_DISTRIBUTED';
  zoneId: ZoneId;
  assignments: Record<EntityId, number>;
}

export interface ZombieKilledEvent {
  type: 'ZOMBIE_KILLED';
  zombieId: EntityId;
  zoneId: ZoneId;
  killerSurvivorId?: EntityId;
  zombieType: ZombieType;
}

export interface ZombieActivatedEvent {
  type: 'ZOMBIE_ACTIVATED';
  zombieIds: EntityId[];
  zombieType?: ZombieType;
}

export interface ZombieExtraActivationTriggeredEvent {
  type: 'ZOMBIE_EXTRA_ACTIVATION_TRIGGERED';
  zombieType: ZombieType;
  triggerCardId?: EntityId;
}

export interface ZombieSplitPendingEvent {
  type: 'ZOMBIE_SPLIT_PENDING';
  stage: 'pass2' | 'pass3';
  prompts: Array<{
    zombieId: EntityId;
    type: ZombieType;
    sourceZoneId: ZoneId;
    options: ZoneId[];
  }>;
}

export interface ZombieSplitResolvedEvent {
  type: 'ZOMBIE_SPLIT_RESOLVED';
  zombieId: EntityId;
  toZoneId: ZoneId;
}

// ---------------------------------------------------------------------------
// BOARD events
// ---------------------------------------------------------------------------

export interface DoorOpenedEvent {
  type: 'DOOR_OPENED';
  zoneAId: ZoneId;
  zoneBId: ZoneId;
  openerSurvivorId: EntityId;
}

export interface ZoneSpawnedEvent {
  type: 'ZONE_SPAWNED';
  zoneId: ZoneId;
}

export interface ZoneSpawnPointActivatedEvent {
  type: 'ZONE_SPAWN_POINT_ACTIVATED';
  zoneId: ZoneId;
}

export interface NoiseGeneratedEvent {
  type: 'NOISE_GENERATED';
  zoneId: ZoneId;
  amount: number;
  newTotal: number;
}

export interface NoiseClearedEvent {
  type: 'NOISE_CLEARED';
  zoneId: ZoneId;
}

// ---------------------------------------------------------------------------
// OBJECTIVE events
// ---------------------------------------------------------------------------

export interface ObjectiveTakenEvent {
  type: 'OBJECTIVE_TAKEN';
  objectiveId: string;
  survivorId: EntityId;
  zoneId: ZoneId;
}

export interface ObjectiveProgressUpdatedEvent {
  type: 'OBJECTIVE_PROGRESS_UPDATED';
  objectiveId: string;
  amountCurrent: number;
  amountRequired: number;
}

export interface ObjectiveCompletedEvent {
  type: 'OBJECTIVE_COMPLETED';
  objectiveId: string;
}

export interface EpicCrateOpenedEvent {
  type: 'EPIC_CRATE_OPENED';
  zoneId: ZoneId;
  survivorId: EntityId;
  cardId: EntityId;
}

/** Epic deck ran dry during an Epic Crate draw — scenario designer should
 *  cap Epic Crate objectives to the Epic deck size (map editor should
 *  enforce this in the future). Carries the opener's context so the client
 *  can surface a "deck exhausted" toast without inferring from silence. */
export interface EpicDeckExhaustedEvent {
  type: 'EPIC_DECK_EXHAUSTED';
  zoneId: ZoneId;
  survivorId: EntityId;
}

// ---------------------------------------------------------------------------
// DECK events
// ---------------------------------------------------------------------------

/** Private to the searcher — routed via projectForSocket (§3.7). Public
 *  observers receive CARD_DRAWN_HIDDEN. */
export interface CardDrawnEvent {
  type: 'CARD_DRAWN';
  survivorId: EntityId;
  card: EquipmentCard;
}

/** Public redaction variant of CARD_DRAWN. */
export interface CardDrawnHiddenEvent {
  type: 'CARD_DRAWN_HIDDEN';
  survivorId: EntityId;
}

export interface CardEquipmentResolvedEvent {
  type: 'CARD_EQUIPMENT_RESOLVED';
  survivorId: EntityId;
  action: 'DISCARD' | 'EQUIP' | 'KEEP';
  cardId: EntityId;
}

export interface EquipmentEquippedEvent {
  type: 'EQUIPMENT_EQUIPPED';
  survivorId: EntityId;
  cardId: EntityId;
  slot: string;
}

export interface EquipmentReorganizedEvent {
  type: 'EQUIPMENT_REORGANIZED';
  survivorId: EntityId;
  moves: Array<{ cardId: EntityId; toSlot: string }>;
}

export interface EquipmentDiscardedEvent {
  type: 'EQUIPMENT_DISCARDED';
  survivorId: EntityId;
  cardId: EntityId;
}

/** Never include the shuffled order — projectForSocket keeps the seed
 *  server-side, so the client couldn't reproduce the order anyway; this is
 *  the payload-level corollary of that invariant (§D13). */
export interface DeckShuffledEvent {
  type: 'DECK_SHUFFLED';
  deckSize: number;
  discardSize: number;
}

export interface SpawnCardsDrawnEvent {
  type: 'SPAWN_CARDS_DRAWN';
  cards: Array<{
    zoneId: ZoneId;
    cardId: EntityId;
    detail: SpawnDetail;
    dangerLevel: DangerLevel;
  }>;
}

export interface SpawnDeckReinitializedEvent {
  type: 'SPAWN_DECK_REINITIALIZED';
  deckSize: number;
}

// ---------------------------------------------------------------------------
// TURN events
// ---------------------------------------------------------------------------

export interface TurnStartedEvent {
  type: 'TURN_STARTED';
  turnNumber: number;
  activePlayerId: PlayerId;
}

export interface ActivePlayerChangedEvent {
  type: 'ACTIVE_PLAYER_CHANGED';
  oldPlayerIndex: number;
  newPlayerIndex: number;
  newActivePlayerId: PlayerId;
}

export interface ZombiePhaseStartedEvent {
  type: 'ZOMBIE_PHASE_STARTED';
  turnNumber: number;
}

export interface RoundEndedEvent {
  type: 'ROUND_ENDED';
  turnNumber: number;
}

// ---------------------------------------------------------------------------
// TRADE events
// ---------------------------------------------------------------------------

export interface TradeSessionStartedEvent {
  type: 'TRADE_SESSION_STARTED';
  activeSurvivorId: EntityId;
  targetSurvivorId: EntityId;
}

/** Private to the two trade participants. Non-participants receive
 *  TRADE_OFFER_UPDATED_HIDDEN. */
export interface TradeOfferUpdatedEvent {
  type: 'TRADE_OFFER_UPDATED';
  offererSurvivorId: EntityId;
  offerCardIds: EntityId[];
}

/** Public redaction variant: count only, no card IDs. */
export interface TradeOfferUpdatedHiddenEvent {
  type: 'TRADE_OFFER_UPDATED_HIDDEN';
  offererSurvivorId: EntityId;
  count: number;
}

export interface TradeAcceptedEvent {
  type: 'TRADE_ACCEPTED';
  activeSurvivorId: EntityId;
  targetSurvivorId: EntityId;
}

export interface TradeCancelledEvent {
  type: 'TRADE_CANCELLED';
}

// ---------------------------------------------------------------------------
// GAME events
// ---------------------------------------------------------------------------

export interface GameStartedEvent {
  type: 'GAME_STARTED';
  gameId: string;
}

export interface GameEndedEvent {
  type: 'GAME_ENDED';
  result: GameResult;
}

export interface GameResetEvent {
  type: 'GAME_RESET';
}

export interface DangerLevelGlobalChangedEvent {
  type: 'DANGER_LEVEL_GLOBAL_CHANGED';
  newLevel: DangerLevel;
}

// ---------------------------------------------------------------------------
// LOBBY events
// ---------------------------------------------------------------------------

export interface LobbyPlayerJoinedEvent {
  type: 'LOBBY_PLAYER_JOINED';
  playerId: PlayerId;
  name: string;
}

export interface LobbyPlayerLeftEvent {
  type: 'LOBBY_PLAYER_LEFT';
  playerId: PlayerId;
}

export interface LobbyCharacterSelectedEvent {
  type: 'LOBBY_CHARACTER_SELECTED';
  playerId: PlayerId;
  characterClass: string;
}

export interface LobbyStarterPickedEvent {
  type: 'LOBBY_STARTER_PICKED';
  playerId: PlayerId;
  starterEquipmentKey: string;
}

export interface LobbyNicknameUpdatedEvent {
  type: 'LOBBY_NICKNAME_UPDATED';
  playerId: PlayerId;
  name: string;
}

export interface LobbyPlayerKickedEvent {
  type: 'LOBBY_PLAYER_KICKED';
  playerId: PlayerId;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type GameEvent =
  // SURVIVOR
  | SurvivorMovedEvent
  | SurvivorSprintedEvent
  | SurvivorWoundedEvent
  | SurvivorHealedEvent
  | SurvivorDiedEvent
  | SurvivorXpGainedEvent
  | SurvivorDangerLevelChangedEvent
  | SurvivorSkillEligibleEvent
  | SurvivorSkillChosenEvent
  | SurvivorFreeActionConsumedEvent
  | SurvivorActionsRemainingChangedEvent
  // COMBAT
  | AttackRolledEvent
  | AttackRerolledEvent
  | MolotovDetonatedEvent
  | FriendlyFirePendingEvent
  | FriendlyFireAssignedEvent
  | WeaponReloadedEvent
  | WeaponFiredNoiseEvent
  // ZOMBIE
  | ZombieSpawnedEvent
  | ZombieMovedEvent
  | ZombieBatchMovedEvent
  | ZombieAttackedZoneEvent
  | ZombieWoundsPendingEvent
  | ZombieWoundsDistributedEvent
  | ZombieKilledEvent
  | ZombieActivatedEvent
  | ZombieExtraActivationTriggeredEvent
  | ZombieSplitPendingEvent
  | ZombieSplitResolvedEvent
  // BOARD
  | DoorOpenedEvent
  | ZoneSpawnedEvent
  | ZoneSpawnPointActivatedEvent
  | NoiseGeneratedEvent
  | NoiseClearedEvent
  // OBJECTIVE
  | ObjectiveTakenEvent
  | ObjectiveProgressUpdatedEvent
  | ObjectiveCompletedEvent
  | EpicCrateOpenedEvent
  | EpicDeckExhaustedEvent
  // DECK
  | CardDrawnEvent
  | CardDrawnHiddenEvent
  | CardEquipmentResolvedEvent
  | EquipmentEquippedEvent
  | EquipmentReorganizedEvent
  | EquipmentDiscardedEvent
  | DeckShuffledEvent
  | SpawnCardsDrawnEvent
  | SpawnDeckReinitializedEvent
  // TURN
  | TurnStartedEvent
  | ActivePlayerChangedEvent
  | ZombiePhaseStartedEvent
  | RoundEndedEvent
  // TRADE
  | TradeSessionStartedEvent
  | TradeOfferUpdatedEvent
  | TradeOfferUpdatedHiddenEvent
  | TradeAcceptedEvent
  | TradeCancelledEvent
  // GAME
  | GameStartedEvent
  | GameEndedEvent
  | GameResetEvent
  | DangerLevelGlobalChangedEvent
  // LOBBY
  | LobbyPlayerJoinedEvent
  | LobbyPlayerLeftEvent
  | LobbyCharacterSelectedEvent
  | LobbyStarterPickedEvent
  | LobbyNicknameUpdatedEvent
  | LobbyPlayerKickedEvent;

/** Discriminator literal type — useful for dispatch tables. */
export type GameEventType = GameEvent['type'];
