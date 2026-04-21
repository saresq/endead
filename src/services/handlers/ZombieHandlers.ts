import { GameState, GamePhase } from '../../types/GameState';
import { ActionRequest } from '../../types/Action';
import type { EventCollector } from '../EventCollector';

/**
 * Player resolution of a tied-route zombie movement remainder (M4,
 * RULEBOOK §9). Exactly one prompt is consumed per call; the phase stays
 * paused until every prompt is resolved. Auto-fires the rest of the
 * Zombie Phase (apply moves → Runner 2nd → spawns → end) from
 * `ZombiePhaseManager.executeZombiePhase`, which runs from
 * `processAction` once this handler returns.
 */
export function handleResolveZombieSplit(
  state: GameState,
  intent: ActionRequest,
  collector: EventCollector,
): void {
  const pending = state.pendingZombieSplit;
  if (!pending) throw new Error('No pending zombie split to resolve');
  if (state.phase !== GamePhase.Zombies) {
    throw new Error('Zombie split can only be resolved during the Zombie Phase');
  }

  const activePlayerId = state.players[state.activePlayerIndex];
  if (intent.playerId !== activePlayerId) {
    throw new Error('Only the active player can resolve zombie splits');
  }

  const zombieId: string | undefined = intent.payload?.zombieId;
  const toZoneId: string | undefined = intent.payload?.toZoneId;
  if (!zombieId || typeof toZoneId !== 'string') {
    throw new Error('Missing zombieId or toZoneId');
  }

  const idx = pending.prompts.findIndex(p => p.zombieId === zombieId);
  if (idx < 0) throw new Error(`No pending zombie-split prompt for ${zombieId}`);
  const prompt = pending.prompts[idx];

  if (!prompt.options.includes(toZoneId)) {
    throw new Error(
      `Invalid zone ${toZoneId} — must be one of ${prompt.options.join(', ')}`,
    );
  }

  pending.plannedMoves[prompt.zombieId] = toZoneId;
  pending.prompts.splice(idx, 1);

  collector.emit({
    type: 'ZOMBIE_SPLIT_RESOLVED',
    zombieId: prompt.zombieId,
    toZoneId,
  });
}
