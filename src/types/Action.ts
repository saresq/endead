
// src/types/Action.ts
import type { GameState } from './GameState';

export enum ActionType {
  // Lobby Actions
  JOIN_LOBBY = 'JOIN_LOBBY',
  SELECT_CHARACTER = 'SELECT_CHARACTER',
  START_GAME = 'START_GAME',

  // Game Actions
  MOVE = 'MOVE',
  ATTACK = 'ATTACK',
  SEARCH = 'SEARCH',
  OPEN_DOOR = 'OPEN_DOOR',
  MAKE_NOISE = 'MAKE_NOISE',
  TRADE = 'TRADE',
  TRADE_START = 'TRADE_START',
  TRADE_OFFER = 'TRADE_OFFER',
  TRADE_ACCEPT = 'TRADE_ACCEPT',
  TRADE_CANCEL = 'TRADE_CANCEL',
  ORGANIZE = 'ORGANIZE',
  CHOOSE_SKILL = 'CHOOSE_SKILL',
  RESOLVE_SEARCH = 'RESOLVE_SEARCH', // New action for full inventory
  TAKE_OBJECTIVE = 'TAKE_OBJECTIVE', // Take objective token
  NOTHING = 'NOTHING', // Keep alive
  END_TURN = 'END_TURN', // Pass turn / End activation
}

export interface ActionRequest {
  playerId: string;
  survivorId?: string; // Optional during lobby phase
  type: ActionType;
  payload?: any; // Flexible payload for specific action details (target, zone, etc.)
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
