import { GameState, GamePhase } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';

const CHEAT_NAME = 'H4x0r';
const CHEAT_ACTIONS_PER_TURN = 999;

export function handleActivateCheat(state: GameState, intent: ActionRequest): GameState {
  if (state.phase === GamePhase.Lobby || state.phase === GamePhase.GameOver) {
    throw new Error('Cheats can only be activated during a live game');
  }

  const newState = structuredClone(state) as GameState;

  const lobbyEntry = newState.lobby.players.find((p) => p.id === intent.playerId);
  const previousName = lobbyEntry?.name ?? intent.playerId;
  if (lobbyEntry) {
    lobbyEntry.name = CHEAT_NAME;
  }

  let touchedSurvivor = false;
  for (const survivor of Object.values(newState.survivors)) {
    if (survivor.playerId !== intent.playerId) continue;
    survivor.name = CHEAT_NAME;
    survivor.cheatMode = true;
    survivor.actionsPerTurn = CHEAT_ACTIONS_PER_TURN;
    survivor.actionsRemaining = CHEAT_ACTIONS_PER_TURN;
    touchedSurvivor = true;
  }

  if (!touchedSurvivor) {
    throw new Error('No survivor found for player');
  }

  newState.lastAction = {
    type: 'ACTIVATE_CHEAT',
    playerId: intent.playerId,
    description: `${previousName} unleashed a cheat code — now playing as ${CHEAT_NAME} with unlimited actions.`,
    timestamp: Date.now(),
  };

  return newState;
}
