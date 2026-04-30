import { GameState, PlayerId } from '../../types/GameState';

export interface PlayerIdentity {
  primary: string;        // CSS hex
  primaryNumeric: number; // For PIXI
  muted: string;          // rgba for backgrounds
  onColor: string;        // Text color on primary bg
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon';
}

const PLAYER_IDENTITIES: PlayerIdentity[] = [
  { primary: '#d94444', primaryNumeric: 0xd94444, muted: 'rgba(217,68,68,0.15)', onColor: '#fff', shape: 'circle' },
  { primary: '#4a82c8', primaryNumeric: 0x4a82c8, muted: 'rgba(74,130,200,0.15)', onColor: '#fff', shape: 'square' },
  { primary: '#4a9e50', primaryNumeric: 0x4a9e50, muted: 'rgba(74,158,80,0.15)', onColor: '#fff', shape: 'triangle' },
  { primary: '#c8a830', primaryNumeric: 0xc8a830, muted: 'rgba(200,168,48,0.15)', onColor: '#000', shape: 'diamond' },
  { primary: '#9060c0', primaryNumeric: 0x9060c0, muted: 'rgba(144,96,192,0.15)', onColor: '#fff', shape: 'pentagon' },
  { primary: '#3a9aaa', primaryNumeric: 0x3a9aaa, muted: 'rgba(58,154,170,0.15)', onColor: '#fff', shape: 'hexagon' },
];

const CHEAT_IDENTITY: PlayerIdentity = {
  primary: '#87CEFA',
  primaryNumeric: 0x87CEFA,
  muted: 'rgba(135,206,250,0.18)',
  onColor: '#000',
  shape: 'circle',
};

function isCheatPlayer(state: GameState, playerId: PlayerId): boolean {
  if (!state.survivors) return false;
  for (const survivor of Object.values(state.survivors)) {
    if (survivor.playerId === playerId && survivor.cheatMode) return true;
  }
  return false;
}

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
  if (isCheatPlayer(state, playerId)) {
    return CHEAT_IDENTITY;
  }
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
