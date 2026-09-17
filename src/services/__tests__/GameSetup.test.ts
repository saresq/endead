import { describe, it, expect } from 'vitest';
import { handleStartGame } from '../handlers/LobbyHandlers';
import { ActionType } from '../../types/Action';
import { GameState, GamePhase, initialGameState } from '../../types/GameState';
import { seedFromString } from '../Rng';
import { CHARACTER_DEFINITIONS, STARTING_EQUIPMENT_DECK, FIRST_PLAYER_EQUIPMENT_ID } from '../../config/CharacterRegistry';
import { DEFAULT_MAP } from '../../config/DefaultMap';

const CHARACTERS = Object.keys(CHARACTER_DEFINITIONS);

function lobby(playerCount: number, seedString: string): GameState {
  const state = structuredClone(initialGameState) as GameState;
  state.seed = seedFromString(seedString);
  state.phase = GamePhase.Lobby;
  state.lobby.players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    ready: true,
    characterClass: CHARACTERS[i],
  })) as never;
  return state;
}

function start(state: GameState): GameState {
  return handleStartGame(state, {
    playerId: 'p1', type: ActionType.START_GAME, payload: { map: DEFAULT_MAP },
  });
}

const weaponOf = (state: GameState, playerId: string) =>
  state.survivors[`survivor-${playerId}`].inventory[0]?.equipmentId;

describe('Starting equipment is dealt at random (D2)', () => {
  it('deals one weapon per survivor from the Starting Equipment deck', () => {
    const next = start(lobby(4, 'deal-a'));

    const dealt = ['p1', 'p2', 'p3', 'p4'].map(id => weaponOf(next, id));
    expect(dealt).toHaveLength(4);
    for (const equipmentId of dealt) {
      expect(STARTING_EQUIPMENT_DECK).toContain(equipmentId as never);
    }
    // One card each: only the three Pistols may repeat.
    const nonPistols = dealt.filter(id => id !== 'pistol');
    expect(new Set(nonPistols).size).toBe(nonPistols.length);
  });

  it('is reproducible from the seed', () => {
    const a = start(lobby(4, 'deal-same'));
    const b = start(lobby(4, 'deal-same'));

    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      expect(weaponOf(a, id)).toBe(weaponOf(b, id));
    }
  });

  it('two seeds can deal differently', () => {
    const a = ['p1', 'p2', 'p3', 'p4'].map(id => weaponOf(start(lobby(4, 'deal-a')), id));
    const b = ['p1', 'p2', 'p3', 'p4'].map(id => weaponOf(start(lobby(4, 'deal-b')), id));

    // Not a guarantee for any single pair of seeds, but these two differ.
    expect(a).not.toEqual(b);
  });
});

describe('The Fire Axe holder goes first (D2)', () => {
  it('gives the first player token to whoever was dealt the axe', () => {
    const next = start(lobby(4, 'deal-a'));

    const holder = next.players.find(id => weaponOf(next, id) === FIRST_PLAYER_EQUIPMENT_ID);
    expect(holder).toBeDefined();
    expect(next.players[next.firstPlayerTokenIndex]).toBe(holder);
    expect(next.activePlayerIndex).toBe(next.firstPlayerTokenIndex);
  });
});

describe("A survivor's health comes from its definition (D1)", () => {
  it('reads maxHealth from the character rather than assuming 3', () => {
    const next = start(lobby(4, 'deal-a'));

    for (const playerId of next.players) {
      const survivor = next.survivors[`survivor-${playerId}`];
      expect(survivor.maxHealth).toBe(CHARACTER_DEFINITIONS[survivor.characterClass].maxHealth);
      expect(survivor.survivorType).toBe(CHARACTER_DEFINITIONS[survivor.characterClass].type);
    }
  });
});
