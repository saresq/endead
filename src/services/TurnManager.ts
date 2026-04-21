
import { GamePhase, type GameState } from '../types/GameState';
import { ActionType, type ActionRequest, type ActionError } from '../types/Action';
import type { EventCollector } from './EventCollector';

/**
 * Validates if an action request is permissible under the current game state.
 * Returns null if valid, or an ActionError if invalid.
 */
export function validateTurn(state: GameState, request: ActionRequest): ActionError | null {
  // 1. Check Game Phase
  if (state.phase !== GamePhase.Players) {
    return {
      code: 'INVALID_PHASE',
      message: `Cannot perform actions during ${state.phase} phase. Wait for Players phase.`,
    };
  }

  // 1b. If a friendly-fire assignment is pending, only allow ASSIGN_FRIENDLY_FIRE
  //     or REROLL_LUCKY (Lucky re-derives the attack, including miss count).
  if (state.pendingFriendlyFire
      && request.type !== 'ASSIGN_FRIENDLY_FIRE'
      && request.type !== 'REROLL_LUCKY') {
    return {
      code: 'PENDING_FRIENDLY_FIRE',
      message: 'Assign friendly-fire misses before taking another action.',
    };
  }

  // 2. Check Active Player (Turn Lock)
  const activePlayerId = state.players[state.activePlayerIndex];
  
  // Exception: Allow Player in Trade to Act (Active or Passive)
  let isTradeException = false;
  if (state.activeTrade) {
     const allowedActions = ['TRADE_OFFER', 'TRADE_ACCEPT', 'TRADE_CANCEL', 'ORGANIZE'];
     if (allowedActions.includes(request.type)) {
         // Check if player is a participant
         const activeSurvivor = state.survivors[state.activeTrade.activeSurvivorId];
         const targetSurvivor = state.survivors[state.activeTrade.targetSurvivorId];
         
         if ((activeSurvivor && request.playerId === activeSurvivor.playerId) || 
             (targetSurvivor && request.playerId === targetSurvivor.playerId)) {
             isTradeException = true;
         }
     }
  }

  if (request.playerId !== activePlayerId && !isTradeException) {
    return {
      code: 'NOT_YOUR_TURN',
      message: `It is currently ${activePlayerId}'s turn. You are ${request.playerId}.`,
    };
  }

  // 3. Check Survivor Ownership
  if (request.survivorId) {
      const survivor = state.survivors[request.survivorId];
      if (!survivor) {
        return {
          code: 'SURVIVOR_NOT_FOUND',
          message: `Survivor ${request.survivorId} not found.`,
        };
      }
      
      if (survivor.playerId !== request.playerId) {
        return {
          code: 'NOT_OWNER',
          message: `You do not control survivor ${survivor.name}.`,
        };
      }

      // 3b. Check if Survivor is Dead
      if (survivor.wounds >= survivor.maxHealth) {
        return {
          code: 'SURVIVOR_DEAD',
          message: `Survivor ${survivor.name} is dead and cannot perform actions.`,
        };
      }

      // 1 Search per Turn — free Searches count toward the limit (rulebook:
      // Search). Free search pool only waives the AP cost; it does NOT grant
      // a second Search. Enforce in the validator so the error matches the
      // handler's gate before any state churn.
      if (request.type === ActionType.SEARCH
          && survivor.hasSearched
          && !survivor.skills.includes('can_search_more_than_once')) {
        return {
          code: 'ALREADY_SEARCHED',
          message: 'Already searched this turn',
        };
      }

      // 4. Check Action Economy
      // Exception: Passive player in a trade does not need actions
      // Exception: Resolve Search/Pickup or Organize during Pickup is allowed with 0 actions
      const isPickupException = survivor.drawnCard && (request.type === 'RESOLVE_SEARCH' || request.type === 'ORGANIZE');

      // Check if survivor has a free action that covers this request
      const hasFreeAction = (
        (request.type === 'MOVE' && survivor.freeMovesRemaining > 0) ||
        (request.type === 'SEARCH' && survivor.freeSearchesRemaining > 0) ||
        (request.type === 'ATTACK' && (survivor.freeCombatsRemaining > 0 || survivor.freeMeleeRemaining > 0 || survivor.freeRangedRemaining > 0))
      );

      if (survivor.actionsRemaining <= 0 && !isTradeException && !isPickupException && !hasFreeAction) {
        return {
          code: 'NO_ACTIONS',
          message: `Survivor ${survivor.name} has no actions remaining.`,
        };
      }

      // Zombie zone control: moving out of a zone with zombies costs +1 AP penalty
      // Slippery skill waives the penalty entirely
      if (request.type === 'MOVE' && !survivor.skills.includes('slippery')) {
        const currentZone = state.zones[survivor.position.zoneId];
        const hasZombies = currentZone && Object.values(state.zombies).some(
          (z: any) => z.position.zoneId === currentZone.id
        );
        if (hasZombies) {
          // With free move: free covers base cost, need 1 AP for penalty
          // Without free move: need 2 AP total (1 base + 1 penalty)
          const hasFreeMove = survivor.freeMovesRemaining > 0;
          const apNeeded = hasFreeMove ? 1 : 2;
          if (survivor.actionsRemaining < apNeeded) {
            return {
              code: 'NOT_ENOUGH_AP',
              message: `Moving out of a zone with zombies requires ${apNeeded} action(s).`,
            };
          }
        }
      }
  }

  return null;
}

/**
 * Checks if the turn should automatically end (pass to next player) based on
 * remaining actions of the active player. Mutates `state` in place.
 *
 * When passed a `collector`, emits ACTIVE_PLAYER_CHANGED (and
 * ZOMBIE_PHASE_STARTED when the rotation wraps into the zombie phase) so
 * client UIs learn the turn transitioned. See analysis/SwarmComms.md §3.2.
 */
export function checkEndTurn(state: GameState, collector?: EventCollector): void {
  // CRITICAL: Do NOT auto-pass if ANY survivor has a pending drawn card,
  // if a Trade is active, or if a friendly-fire assignment is outstanding.
  const anyDrawnCard = Object.values(state.survivors).some(
    s => s.drawnCard || (s.drawnCardsQueue && s.drawnCardsQueue.length > 0),
  );

  if (anyDrawnCard || state.activeTrade || state.pendingFriendlyFire) {
    return;
  }

  const activePlayerId = state.players[state.activePlayerIndex];

  const playerSurvivors = Object.values(state.survivors).filter(
    (s) => s.playerId === activePlayerId && s.wounds < s.maxHealth
  );

  const hasActionsLeft = playerSurvivors.some((s) =>
    s.actionsRemaining > 0 ||
    s.freeMovesRemaining > 0 ||
    s.freeSearchesRemaining > 0 ||
    s.freeCombatsRemaining > 0 ||
    s.freeMeleeRemaining > 0 ||
    s.freeRangedRemaining > 0
  );

  if (!hasActionsLeft) {
    const oldIndex = state.activePlayerIndex;
    const nextIndex = (state.activePlayerIndex + 1) % state.players.length;
    state.activePlayerIndex = nextIndex;
    collector?.emit({
      type: 'ACTIVE_PLAYER_CHANGED',
      oldPlayerIndex: oldIndex,
      newPlayerIndex: nextIndex,
      newActivePlayerId: state.players[nextIndex],
    });
    if (nextIndex === state.firstPlayerTokenIndex) {
      state.phase = GamePhase.Zombies;
      collector?.emit({
        type: 'ZOMBIE_PHASE_STARTED',
        turnNumber: state.turn,
      });
    }
  }
}

/**
 * Advances the turn state after a successful action. Mutates `state` in place.
 */
export function advanceTurnState(
  state: GameState,
  survivorId: string,
  collector?: EventCollector,
): void {
  const survivor = state.survivors[survivorId];
  const prev = survivor.actionsRemaining;
  survivor.actionsRemaining = Math.max(0, survivor.actionsRemaining - 1);
  if (survivor.actionsRemaining !== prev) {
    collector?.emit({
      type: 'SURVIVOR_ACTIONS_REMAINING_CHANGED',
      survivorId,
      newCount: survivor.actionsRemaining,
    });
  }
  checkEndTurn(state, collector);
}

/**
 * Helper to check if the current phase allows player actions
 */
export function canAct(state: GameState, playerId: string): boolean {
  return (
    state.phase === GamePhase.Players &&
    state.players[state.activePlayerIndex] === playerId
  );
}
