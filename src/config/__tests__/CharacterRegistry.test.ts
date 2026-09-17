import { describe, it, expect } from 'vitest';
import { processAction } from '../../services/ActionProcessor';
import { ActionType } from '../../types/Action';
import { GameState, GamePhase, initialGameState } from '../../types/GameState';
import { CHARACTER_DEFINITIONS, STARTING_EQUIPMENT_DECK } from '../CharacterRegistry';
import { SURVIVOR_CLASSES, SKILL_DEFINITIONS } from '../SkillRegistry';
import { EQUIPMENT_CARDS } from '../EquipmentRegistry';
import { es } from '../../strings/es';

function lobbyWithOnePlayer(): GameState {
  const state = structuredClone(initialGameState) as GameState;
  state.phase = GamePhase.Lobby;
  state.lobby.players = [{ id: 'p1', name: 'P1', ready: false }] as never;
  return state;
}

describe('Character roster', () => {
  it('has all twelve core-box survivors: six Classic and six Kids', () => {
    expect(Object.keys(CHARACTER_DEFINITIONS)).toHaveLength(12);

    const kids = Object.entries(CHARACTER_DEFINITIONS)
      .filter(([, d]) => d.type === 'Kid')
      .map(([id]) => id)
      .sort();
    expect(kids).toEqual(['Bunny G', 'Lili', 'Lou', 'Odin', 'Ostara', 'Tiger Sam']);
  });

  it('every skill a tree offers exists in the registry', () => {
    for (const [id, progression] of Object.entries(SURVIVOR_CLASSES)) {
      for (const skillId of Object.values(progression).flat()) {
        expect(SKILL_DEFINITIONS[skillId], `${id} offers unknown skill ${skillId}`).toBeDefined();
      }
    }
  });

  it('every character has a skill tree of the shape the rulebook gives', () => {
    for (const [id, definition] of Object.entries(CHARACTER_DEFINITIONS)) {
      const progression = SURVIVOR_CLASSES[id];
      expect(progression, `${id} has no skill tree`).toBeDefined();
      expect(progression.BLUE).toHaveLength(1);
      expect(progression.YELLOW).toEqual(['plus_1_action']);
      expect(progression.ORANGE).toHaveLength(2);
      expect(progression.RED).toHaveLength(3);
      expect(definition.maxHealth).toBe(definition.type === 'Kid' ? 2 : 3);
    }
  });

  it('the Starting Equipment deck is the rulebook set', () => {
    expect([...STARTING_EQUIPMENT_DECK].sort()).toEqual(
      ['baseball_bat', 'crowbar', 'fire_axe', 'pistol', 'pistol', 'pistol'],
    );
    for (const key of STARTING_EQUIPMENT_DECK) {
      expect(EQUIPMENT_CARDS[key], `${key} is not in the equipment registry`).toBeDefined();
    }
  });
});

describe('An unknown character is an error, not a substitution (D1)', () => {
  it('rejects a character id the server does not know', () => {
    const res = processAction(lobbyWithOnePlayer(), {
      playerId: 'p1', type: ActionType.SELECT_CHARACTER, payload: { characterClass: 'Nobody' },
    });

    expect(res.success).toBe(false);
    expect(res.error?.message).toBe(es.errors.unknownCharacter);
  });

  it('accepts one it does know', () => {
    const res = processAction(lobbyWithOnePlayer(), {
      playerId: 'p1', type: ActionType.SELECT_CHARACTER, payload: { characterClass: 'Wanda' },
    });

    expect(res.success).toBe(true);
    expect(res.newState!.lobby.players[0].characterClass).toBe('Wanda');
  });
});
