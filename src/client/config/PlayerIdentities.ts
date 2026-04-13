import { GameState, PlayerId } from '../../types/GameState';

export interface PlayerIdentity {
  primary: string;        // CSS hex
  primaryNumeric: number; // For PIXI
  muted: string;          // rgba for backgrounds
  onColor: string;        // Text color on primary bg
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon';
}

const PLAYER_IDENTITIES: PlayerIdentity[] = [
  { primary: '#ef4444', primaryNumeric: 0xef4444, muted: 'rgba(239,68,68,0.15)', onColor: '#fff', shape: 'circle' },
  { primary: '#3b82f6', primaryNumeric: 0x3b82f6, muted: 'rgba(59,130,246,0.15)', onColor: '#fff', shape: 'square' },
  { primary: '#22c55e', primaryNumeric: 0x22c55e, muted: 'rgba(34,197,94,0.15)', onColor: '#fff', shape: 'triangle' },
  { primary: '#eab308', primaryNumeric: 0xeab308, muted: 'rgba(234,179,8,0.15)', onColor: '#000', shape: 'diamond' },
  { primary: '#a855f7', primaryNumeric: 0xa855f7, muted: 'rgba(168,85,247,0.15)', onColor: '#fff', shape: 'pentagon' },
  { primary: '#06b6d4', primaryNumeric: 0x06b6d4, muted: 'rgba(6,182,212,0.15)', onColor: '#fff', shape: 'hexagon' },
];

function getStablePlayerOrder(state: GameState): PlayerId[] {
  if (state.lobby?.players?.length) {
    return state.lobby.players.map((player) => player.id);
  }
  return state.players;
}

function getStablePlayerIndex(state: GameState, playerId: PlayerId): number {
  return getStablePlayerOrder(state).indexOf(playerId);
}

export function getPlayerIdentity(state: GameState, playerId: PlayerId): PlayerIdentity {
  const index = getStablePlayerIndex(state, playerId);
  if (index === -1) {
    return { primary: '#CCCCCC', primaryNumeric: 0xCCCCCC, muted: 'rgba(204,204,204,0.15)', onColor: '#000', shape: 'circle' };
  }
  return PLAYER_IDENTITIES[index % PLAYER_IDENTITIES.length];
}

export function getPlayerColorHex(state: GameState, playerId: PlayerId): string {
  return getPlayerIdentity(state, playerId).primary;
}

export function getPlayerColorNumeric(state: GameState, playerId: PlayerId): number {
  return getPlayerIdentity(state, playerId).primaryNumeric;
}
