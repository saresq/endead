// src/client/predictors.ts
//
// SwarmComms §3.3, Step 6 — client-side predictors for the optimistic Tier-1
// whitelist. Each predictor REUSES the server handler verbatim; this
// guarantees client/server parity by construction for the whitelisted subset
// (no RNG, no deck draws, no validator divergence). The parity tests under
// `src/client/__tests__/predictorParity.test.ts` pin this contract.
//
// Why not re-implement?
//   A parallel client predictor is exactly the kind of divergence §3.3.2
//   warns against ("only entertain optimism for actions whose local validator
//   already matches server's"). Calling the server handler guarantees match.
//
// What each predictor returns: the `GameEvent[]` the server handler collected.
// The predictor mutates `state` in place (same contract as server handlers);
// the caller fires event listeners on the returned list so animations/HUD run.

import type { GameState } from '../types/GameState';
import type { GameEvent } from '../types/Events';
import { ActionRequest, ActionType } from '../types/Action';

import { EventCollector } from '../services/EventCollector';
import { handleMove } from '../services/handlers/MovementHandlers';
import { handleReload } from '../services/handlers/CombatHandlers';
import { handleOrganize } from '../services/handlers/ItemHandlers';
import { handleChooseSkill } from '../services/handlers/SkillHandlers';
import { handleTradeStart, handleTradeOffer } from '../services/handlers/TradeHandlers';
import { handleEndTurn } from '../services/handlers/TurnHandlers';

export type Predictor = (state: GameState, intent: ActionRequest) => GameEvent[];

/** Dispatch table — keyed on the narrow whitelist only. An action not in this
 *  table is not optimistic, full stop. */
const PREDICTORS: Partial<Record<ActionType, Predictor>> = {
  [ActionType.MOVE]: runHandler(handleMove),
  [ActionType.RELOAD]: runHandler(handleReload),
  [ActionType.ORGANIZE]: runHandler(handleOrganize),
  [ActionType.END_TURN]: runHandler(handleEndTurn),
  [ActionType.CHOOSE_SKILL]: runHandler(handleChooseSkill),
  [ActionType.TRADE_START]: runHandler(handleTradeStart),
  [ActionType.TRADE_OFFER]: runHandler(handleTradeOffer),
};

function runHandler(
  handler: (state: GameState, intent: ActionRequest, collector: EventCollector) => void,
): Predictor {
  return (state, intent) => {
    const collector = new EventCollector();
    handler(state, intent, collector);
    return collector.drain();
  };
}

/** Returns the predictor for `intent.type`, or `null` if not whitelisted. */
export function getPredictor(type: ActionType): Predictor | null {
  return PREDICTORS[type] ?? null;
}
