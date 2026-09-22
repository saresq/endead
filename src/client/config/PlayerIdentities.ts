import { GameState, PlayerId } from '../../types/GameState';

export interface PlayerIdentity {
  primary: string;        // CSS hex
  primaryNumeric: number; // For PIXI
  muted: string;          // rgba for backgrounds
  onColor: string;        // Text color on primary bg
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon' | 'hexagon';
}

// Mirrors --player-1..6 in tokens.css (the rationale lives there). Every
// colour carries --ink text, so onColor is ink for all of them.
const INK = '#070504';

const PLAYER_IDENTITIES: PlayerIdentity[] = [
  { primary: '#d67069', primaryNumeric: 0xd67069, muted: 'rgba(214,112,105,0.15)', onColor: INK, shape: 'circle' },
  { primary: '#6295d4', primaryNumeric: 0x6295d4, muted: 'rgba(98,149,212,0.15)', onColor: INK, shape: 'square' },
  { primary: '#7fc581', primaryNumeric: 0x7fc581, muted: 'rgba(127,197,129,0.15)', onColor: INK, shape: 'triangle' },
  { primary: '#d9a850', primaryNumeric: 0xd9a850, muted: 'rgba(217,168,80,0.15)', onColor: INK, shape: 'diamond' },
  { primary: '#b97fc6', primaryNumeric: 0xb97fc6, muted: 'rgba(185,127,198,0.15)', onColor: INK, shape: 'pentagon' },
  { primary: '#48b7bd', primaryNumeric: 0x48b7bd, muted: 'rgba(72,183,189,0.15)', onColor: INK, shape: 'hexagon' },
];

// Cheat-mode survivors: pale ice, outside the player family on purpose.
const CHEAT_IDENTITY: PlayerIdentity = {
  primary: '#a9d3ec',
  primaryNumeric: 0xa9d3ec,
  muted: 'rgba(169,211,236,0.18)',
  onColor: INK,
  shape: 'circle',
};

// Unknown player: --text-muted.
const UNKNOWN_IDENTITY: PlayerIdentity = {
  primary: '#aba397',
  primaryNumeric: 0xaba397,
  muted: 'rgba(171,163,151,0.15)',
  onColor: INK,
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
    return UNKNOWN_IDENTITY;
  }
  return PLAYER_IDENTITIES[index % PLAYER_IDENTITIES.length];
}

export function getPlayerColorHex(state: GameState, playerId: PlayerId): string {
  return getPlayerIdentity(state, playerId).primary;
}

export function getPlayerColorNumeric(state: GameState, playerId: PlayerId): number {
  return getPlayerIdentity(state, playerId).primaryNumeric;
}
