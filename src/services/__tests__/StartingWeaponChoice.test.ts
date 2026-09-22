// Starting weapons are picked in the lobby, not dealt.
//
// House rule: the rulebook deals the six grey-back cards at random
// (rules/03-setup.md#first-player). Here each player claims one from the same
// six-card supply, so a squad can never start without a door opener.
import { describe, it, expect } from 'vitest';
import { processAction } from '../ActionProcessor';
import { handleStartGame, handleEndGame } from '../handlers/LobbyHandlers';
import { ActionType } from '../../types/Action';
import { GameState, GamePhase, initialGameState } from '../../types/GameState';
import { seedFromString } from '../Rng';
import { DEFAULT_MAP } from '../../config/DefaultMap';
import { es } from '../../strings/es';

const CHARACTERS = ['Wanda', 'Doug', 'Amy', 'Ned'];

interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  characterClass: string;
  startingWeapon?: string;
}

function lobby(playerCount: number, weapons: (string | undefined)[] = []): GameState {
  const state = structuredClone(initialGameState) as GameState;
  state.seed = seedFromString('weapons');
  state.phase = GamePhase.Lobby;
  state.lobby.players = Array.from({ length: playerCount }, (_, i) => {
    const player: LobbyPlayer = {
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      ready: false,
      characterClass: CHARACTERS[i],
    };
    if (weapons[i]) {
      player.startingWeapon = weapons[i];
      player.ready = true;
    }
    return player;
  }) as never;
  return state;
}

function pick(state: GameState, playerId: string, equipmentId: string) {
  return processAction(state, {
    playerId, type: ActionType.SELECT_WEAPON, payload: { equipmentId },
  });
}

function start(state: GameState): GameState {
  return handleStartGame(state, {
    playerId: 'p1', type: ActionType.START_GAME, payload: { map: DEFAULT_MAP },
  });
}

const weaponOf = (state: GameState, playerId: string) =>
  state.survivors[`survivor-${playerId}`].inventory[0]?.equipmentId;

describe('Claiming a starting weapon in the lobby', () => {
  it('stores the pick on the lobby player', () => {
    const res = pick(lobby(1), 'p1', 'crowbar');

    expect(res.success).toBe(true);
    expect(res.newState!.lobby.players[0].startingWeapon).toBe('crowbar');
  });

  it('rejects a weapon that is not in the starting supply', () => {
    const res = pick(lobby(1), 'p1', 'shotgun');

    expect(res.success).toBe(false);
    expect(res.error?.message).toBe(es.errors.unknownWeapon);
  });

  it('lets three players take a Pistol — the supply holds three', () => {
    let state = lobby(4);
    for (const id of ['p1', 'p2', 'p3']) {
      const res = pick(state, id, 'pistol');
      expect(res.success, `${id} could not take a pistol`).toBe(true);
      state = res.newState!;
    }

    expect(state.lobby.players.slice(0, 3).map(p => p.startingWeapon))
      .toEqual(['pistol', 'pistol', 'pistol']);
  });

  it('blocks a fourth Pistol once the supply is spent', () => {
    let state = lobby(4);
    for (const id of ['p1', 'p2', 'p3']) state = pick(state, id, 'pistol').newState!;

    const res = pick(state, 'p4', 'pistol');
    expect(res.success).toBe(false);
    expect(res.error?.message).toBe(es.errors.weaponTaken);
  });

  it('blocks a second Fire Axe — the supply holds one', () => {
    const state = pick(lobby(2), 'p1', 'fire_axe').newState!;

    const res = pick(state, 'p2', 'fire_axe');
    expect(res.success).toBe(false);
    expect(res.error?.message).toBe(es.errors.weaponTaken);
  });

  it('re-picking the weapon you already hold is allowed', () => {
    const state = pick(lobby(1), 'p1', 'fire_axe').newState!;

    const res = pick(state, 'p1', 'fire_axe');
    expect(res.success).toBe(true);
    expect(res.newState!.lobby.players[0].startingWeapon).toBe('fire_axe');
  });

  it('switching weapons returns the old one to the supply', () => {
    let state = pick(lobby(2), 'p1', 'fire_axe').newState!;
    state = pick(state, 'p1', 'crowbar').newState!;

    const res = pick(state, 'p2', 'fire_axe');
    expect(res.success).toBe(true);
    expect(res.newState!.lobby.players[1].startingWeapon).toBe('fire_axe');
  });

  it('rejects a player who is not in the lobby', () => {
    const res = pick(lobby(1), 'ghost', 'crowbar');

    expect(res.success).toBe(false);
    expect(res.error?.message).toBe(es.errors.notInLobby);
  });
});

describe('Ready needs both a survivor and a weapon', () => {
  it('a character alone does not make a player ready', () => {
    const state = structuredClone(initialGameState) as GameState;
    state.phase = GamePhase.Lobby;
    state.lobby.players = [{ id: 'p1', name: 'P1', ready: false }] as never;

    const res = processAction(state, {
      playerId: 'p1', type: ActionType.SELECT_CHARACTER, payload: { characterClass: 'Wanda' },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.lobby.players[0].ready).toBe(false);
  });

  it('a weapon alone does not make a player ready', () => {
    const state = structuredClone(initialGameState) as GameState;
    state.phase = GamePhase.Lobby;
    state.lobby.players = [{ id: 'p1', name: 'P1', ready: false }] as never;

    const res = pick(state, 'p1', 'crowbar');

    expect(res.success).toBe(true);
    expect(res.newState!.lobby.players[0].ready).toBe(false);
  });

  it('both together make the player ready', () => {
    const state = structuredClone(initialGameState) as GameState;
    state.phase = GamePhase.Lobby;
    state.lobby.players = [{ id: 'p1', name: 'P1', ready: false }] as never;

    const withChar = processAction(state, {
      playerId: 'p1', type: ActionType.SELECT_CHARACTER, payload: { characterClass: 'Wanda' },
    }).newState!;
    const res = pick(withChar, 'p1', 'crowbar');

    expect(res.newState!.lobby.players[0].ready).toBe(true);
  });
});

describe('Starting the game with chosen weapons', () => {
  it('gives each survivor the weapon its player picked', () => {
    const next = start(lobby(4, ['fire_axe', 'crowbar', 'pistol', 'baseball_bat']));

    expect(weaponOf(next, 'p1')).toBe('fire_axe');
    expect(weaponOf(next, 'p2')).toBe('crowbar');
    expect(weaponOf(next, 'p3')).toBe('pistol');
    expect(weaponOf(next, 'p4')).toBe('baseball_bat');
  });

  it('puts the weapon in hand', () => {
    const next = start(lobby(1, ['pistol']));
    const card = next.survivors['survivor-p1'].inventory[0];

    expect(card.inHand).toBe(true);
    expect(card.slot).toBe('HAND_1');
  });

  it('refuses to start when a player has no weapon', () => {
    expect(() => start(lobby(2, ['fire_axe', undefined])))
      .toThrow(es.errors.weaponRequired);
  });

  it('refuses to start when a player has no survivor', () => {
    const state = lobby(2, ['fire_axe', 'crowbar']);
    (state.lobby.players[1] as LobbyPlayer).characterClass = '';

    expect(() => start(state)).toThrow(es.errors.characterRequired);
  });
});

describe('The first player token follows the Fire Axe (house rule fallback)', () => {
  it('gives it to whoever picked the axe', () => {
    const next = start(lobby(3, ['pistol', 'fire_axe', 'crowbar']));

    expect(next.players[next.firstPlayerTokenIndex]).toBe('p2');
    expect(next.activePlayerIndex).toBe(next.firstPlayerTokenIndex);
  });

  it('falls back to the host when nobody took the axe', () => {
    const next = start(lobby(3, ['pistol', 'crowbar', 'baseball_bat']));

    expect(next.firstPlayerTokenIndex).toBe(0);
    expect(next.activePlayerIndex).toBe(0);
  });
});

describe('Returning to the lobby keeps the loadout', () => {
  it('keeps each claim and the ready flag that follows from it', () => {
    const started = start(lobby(2, ['fire_axe', 'pistol']));

    const back = handleEndGame(started, { playerId: 'p1', type: ActionType.END_GAME });

    expect(back.lobby.players.map((p: LobbyPlayer) => p.startingWeapon)).toEqual(['fire_axe', 'pistol']);
    expect(back.lobby.players.every((p: LobbyPlayer) => p.ready)).toBe(true);
  });

  it('leaves a player without a weapon not ready', () => {
    const state = lobby(1, ['fire_axe']);
    delete (state.lobby.players[0] as LobbyPlayer).startingWeapon;

    const back = handleEndGame(state, { playerId: 'p1', type: ActionType.END_GAME });

    expect(back.lobby.players[0].ready).toBe(false);
  });
});
