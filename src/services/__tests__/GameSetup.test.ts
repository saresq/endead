import { describe, it, expect } from 'vitest';
import { handleStartGame } from '../handlers/LobbyHandlers';
import { ActionType } from '../../types/Action';
import { GameState, GamePhase, initialGameState } from '../../types/GameState';
import { seedFromString } from '../Rng';
import { CHARACTER_DEFINITIONS, STARTING_EQUIPMENT_DECK } from '../../config/CharacterRegistry';
import { DEFAULT_MAP } from '../../config/DefaultMap';

const CHARACTERS = Object.keys(CHARACTER_DEFINITIONS);

// Weapons are claimed in the lobby (see StartingWeaponChoice.test.ts); these
// setup tests only need a squad that finished claiming.
const CLAIMS = ['fire_axe', 'crowbar', 'pistol', 'baseball_bat'];

function lobby(playerCount: number, seedString: string): GameState {
  const state = structuredClone(initialGameState) as GameState;
  state.seed = seedFromString(seedString);
  state.phase = GamePhase.Lobby;
  state.lobby.players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    ready: true,
    characterClass: CHARACTERS[i],
    startingWeapon: CLAIMS[i],
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

describe('Starting equipment comes from the lobby claims (D2)', () => {
  it('gives each survivor a card from the Starting Equipment supply', () => {
    const next = start(lobby(4, 'claims'));

    const held = ['p1', 'p2', 'p3', 'p4'].map(id => weaponOf(next, id));
    expect(held).toEqual(CLAIMS);
    for (const equipmentId of held) {
      expect(STARTING_EQUIPMENT_DECK).toContain(equipmentId as never);
    }
  });

  it('stamps ids that the discard pile drops out of play', () => {
    const next = start(lobby(4, 'claims'));

    for (const playerId of next.players) {
      expect(next.survivors[`survivor-${playerId}`].inventory[0].id).toMatch(/^card-start-/);
    }
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
