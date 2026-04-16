
// src/types/Action.ts
import type { GameState, EntityId, ZoneId } from './GameState';
import type { ScenarioMap } from './Map';

export enum ActionType {
  // Lobby Actions
  JOIN_LOBBY = 'JOIN_LOBBY',
  UPDATE_NICKNAME = 'UPDATE_NICKNAME',
  SELECT_CHARACTER = 'SELECT_CHARACTER',
  START_GAME = 'START_GAME',
  END_GAME = 'END_GAME',

  // Game Actions
  MOVE = 'MOVE',
  ATTACK = 'ATTACK',
  SEARCH = 'SEARCH',
  OPEN_DOOR = 'OPEN_DOOR',
  MAKE_NOISE = 'MAKE_NOISE',
  TRADE_START = 'TRADE_START',
  TRADE_OFFER = 'TRADE_OFFER',
  TRADE_ACCEPT = 'TRADE_ACCEPT',
  TRADE_CANCEL = 'TRADE_CANCEL',
  ORGANIZE = 'ORGANIZE',
  CHOOSE_SKILL = 'CHOOSE_SKILL',
  RESOLVE_SEARCH = 'RESOLVE_SEARCH',
  TAKE_OBJECTIVE = 'TAKE_OBJECTIVE',
  SPRINT = 'SPRINT',
  USE_ITEM = 'USE_ITEM',
  NOTHING = 'NOTHING',
  END_TURN = 'END_TURN',
  CHARGE = 'CHARGE',
  BORN_LEADER = 'BORN_LEADER',
  BLOODLUST_MELEE = 'BLOODLUST_MELEE',
  LIFESAVER = 'LIFESAVER',
  RESOLVE_WOUNDS = 'RESOLVE_WOUNDS',
  DISTRIBUTE_ZOMBIE_WOUNDS = 'DISTRIBUTE_ZOMBIE_WOUNDS',
  KICK_PLAYER = 'KICK_PLAYER',
}

// --- Action Payload Types ---

export interface JoinLobbyPayload {
  name?: string;
}

export interface UpdateNicknamePayload {
  name: string;
}

export interface SelectCharacterPayload {
  characterClass: string;
  name?: string;
}

export interface StartGamePayload {
  map?: ScenarioMap;
}

export interface MovePayload {
  targetZoneId: ZoneId;
}

export interface AttackPayload {
  targetZoneId: ZoneId;
  weaponId?: EntityId;
  /** Player-specified kill priority (melee: free choice per 2E rules; ranged: Sniper/Point-Blank). */
  targetZombieIds?: EntityId[];
}

export interface OpenDoorPayload {
  targetZoneId: ZoneId;
}

export interface SprintPayload {
  path: ZoneId[];
}

export interface UseItemPayload {
  itemId: EntityId;
}

export interface ChooseSkillPayload {
  skillId: string;
}

export interface ResolveSearchPayload {
  action: 'DISCARD' | 'EQUIP' | 'KEEP';
  targetSlot?: string;
  discardCardId?: EntityId;
}

export interface OrganizePayload {
  cardId: EntityId;
  targetSlot: string;
}

export interface TradeStartPayload {
  targetSurvivorId: EntityId;
}

export interface TradeOfferPayload {
  offerCardIds: string[];
}

export interface TradeAcceptPayload {
  receiveLayout?: Record<EntityId, string>;
}

export interface ResolveWoundsPayload {
  discardCardIds: string[];  // Equipment card IDs to discard (each negates 1 wound)
}

export interface DistributeZombieWoundsPayload {
  zoneId: string;
  assignments: Record<string, number>;  // survivorId -> number of wounds assigned
}

export interface KickPlayerPayload {
  targetPlayerId: string;
}

/** Map from ActionType to its payload type. Actions with no payload map to undefined. */
export interface ActionPayloadMap {
  [ActionType.JOIN_LOBBY]: JoinLobbyPayload;
  [ActionType.UPDATE_NICKNAME]: UpdateNicknamePayload;
  [ActionType.SELECT_CHARACTER]: SelectCharacterPayload;
  [ActionType.START_GAME]: StartGamePayload;
  [ActionType.END_GAME]: undefined;
  [ActionType.MOVE]: MovePayload;
  [ActionType.ATTACK]: AttackPayload;
  [ActionType.SEARCH]: undefined;
  [ActionType.OPEN_DOOR]: OpenDoorPayload;
  [ActionType.MAKE_NOISE]: undefined;
  [ActionType.TRADE_START]: TradeStartPayload;
  [ActionType.TRADE_OFFER]: TradeOfferPayload;
  [ActionType.TRADE_ACCEPT]: TradeAcceptPayload;
  [ActionType.TRADE_CANCEL]: undefined;
  [ActionType.ORGANIZE]: OrganizePayload;
  [ActionType.CHOOSE_SKILL]: ChooseSkillPayload;
  [ActionType.RESOLVE_SEARCH]: ResolveSearchPayload;
  [ActionType.TAKE_OBJECTIVE]: undefined;
  [ActionType.SPRINT]: SprintPayload;
  [ActionType.USE_ITEM]: UseItemPayload;
  [ActionType.NOTHING]: undefined;
  [ActionType.END_TURN]: undefined;
  [ActionType.CHARGE]: undefined;
  [ActionType.BORN_LEADER]: undefined;
  [ActionType.BLOODLUST_MELEE]: undefined;
  [ActionType.LIFESAVER]: undefined;
  [ActionType.RESOLVE_WOUNDS]: ResolveWoundsPayload;
  [ActionType.DISTRIBUTE_ZOMBIE_WOUNDS]: DistributeZombieWoundsPayload;
  [ActionType.KICK_PLAYER]: KickPlayerPayload;
}

export type ActionPayload = ActionPayloadMap[ActionType];

/**
 * Extract the payload type for a specific action type.
 * Use in handlers: `const p = intent.payload as ActionPayloadMap[ActionType.MOVE]`
 */
export type PayloadFor<T extends ActionType> = ActionPayloadMap[T];

export interface ActionRequest {
  playerId: string;
  survivorId?: string;
  type: ActionType;
  // Typed as a record to allow field access in handlers without narrowing.
  // Callers should construct payloads matching the ActionPayloadMap for their ActionType.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>;
}

export interface ActionError {
  code: string;
  message: string;
}

export interface ActionResponse {
  success: boolean;
  newState?: GameState;
  error?: ActionError;
}
