
import { GameState, GamePhase, GameResult, ObjectiveType, Objective, Survivor, ZombieType, DangerLevel } from '../types/GameState';
import { ActionRequest, ActionResponse, ActionType, ActionError } from '../types/Action';
import { validateTurn, checkEndTurn } from './TurnManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { deductAPWithFreeCheck, ActionHandler } from './handlers/handlerUtils';
import { XPManager } from './XPManager';
import { DANGER_VALUES } from '../config/DangerValues';

// --- Handler imports ---
import { handleJoinLobby, handleUpdateNickname, handleSelectCharacter, handleStartGame, handleEndGame } from './handlers/LobbyHandlers';
import { handleMove, handleSprint } from './handlers/MovementHandlers';
import { handleAttack, handleReload, handleResolveWounds, handleDistributeZombieWounds, handleRerollLucky } from './handlers/CombatHandlers';
import { handleCharge, handleBornLeader, handleBloodlustMelee, handleLifesaver, handleChooseSkill, handleJump, handleShove } from './handlers/SkillHandlers';
import {
  handleUseItem, handleSearch, handleResolveSearch, handleOrganize,
  handleOrganizeStart, handleOrganizeEnd, handleDiscardCard,
} from './handlers/ItemHandlers';
import { handleOpenDoor, handleMakeNoise } from './handlers/DoorHandlers';
import { handleTradeStart, handleTradeOffer, handleTradeAccept, handleTradeCancel } from './handlers/TradeHandlers';
import { handleTakeObjective } from './handlers/ObjectiveHandlers';
import { handleTakeEpicCrate } from './handlers/EpicCrateHandlers';
import { handleEndTurn } from './handlers/TurnHandlers';
import { handleActivateCheat } from './handlers/CheatHandlers';
import { es } from '../strings/es';

const handlers: Partial<Record<ActionType, ActionHandler>> = {
  [ActionType.JOIN_LOBBY]: handleJoinLobby,
  [ActionType.UPDATE_NICKNAME]: handleUpdateNickname,
  [ActionType.SELECT_CHARACTER]: handleSelectCharacter,
  [ActionType.START_GAME]: handleStartGame,
  [ActionType.END_GAME]: handleEndGame,
  [ActionType.MOVE]: handleMove,
  [ActionType.ATTACK]: handleAttack,
  [ActionType.RELOAD]: handleReload,
  [ActionType.MAKE_NOISE]: handleMakeNoise,
  [ActionType.CHOOSE_SKILL]: handleChooseSkill,
  [ActionType.SEARCH]: handleSearch,
  [ActionType.RESOLVE_SEARCH]: handleResolveSearch,
  [ActionType.ORGANIZE]: handleOrganize,
  [ActionType.ORGANIZE_START]: handleOrganizeStart,
  [ActionType.ORGANIZE_END]: handleOrganizeEnd,
  [ActionType.DISCARD_CARD]: handleDiscardCard,
  [ActionType.OPEN_DOOR]: handleOpenDoor,
  [ActionType.TAKE_OBJECTIVE]: handleTakeObjective,
  [ActionType.TAKE_EPIC_CRATE]: handleTakeEpicCrate,
  [ActionType.TRADE_START]: handleTradeStart,
  [ActionType.TRADE_OFFER]: handleTradeOffer,
  [ActionType.TRADE_ACCEPT]: handleTradeAccept,
  [ActionType.TRADE_CANCEL]: handleTradeCancel,
  [ActionType.SPRINT]: handleSprint,
  [ActionType.USE_ITEM]: handleUseItem,
  [ActionType.END_TURN]: handleEndTurn,
  [ActionType.CHARGE]: handleCharge,
  [ActionType.BORN_LEADER]: handleBornLeader,
  [ActionType.BLOODLUST_MELEE]: handleBloodlustMelee,
  [ActionType.JUMP]: handleJump,
  [ActionType.SHOVE]: handleShove,
  [ActionType.LIFESAVER]: handleLifesaver,
  [ActionType.RESOLVE_WOUNDS]: handleResolveWounds,
  [ActionType.DISTRIBUTE_ZOMBIE_WOUNDS]: handleDistributeZombieWounds,
  [ActionType.REROLL_LUCKY]: handleRerollLucky,
  [ActionType.ACTIVATE_CHEAT]: handleActivateCheat,
};

// --- Game End Logic ---

export function checkGameEndConditions(state: GameState): GameResult | undefined {
  const survivors = Object.values(state.survivors);
  const zombies = Object.values(state.zombies);

  if (survivors.length === 0) return undefined;

  // Per Zombicide rules: the game is lost when ANY single survivor dies
  const anyDead = survivors.some(s => s.wounds >= s.maxHealth);
  if (anyDead) return GameResult.Defeat;

  if (!state.objectives || state.objectives.length === 0) return undefined;

  // Every survivor is alive past the check above, so this is all of them; the
  // name is what the win conditions below are written against.
  const livingSurvivors = survivors;

  const allObjectivesMet = state.objectives.every(obj => {
      if (obj.completed) return true;

      switch (obj.type) {
          case ObjectiveType.ReachExit: {
              const exitZoneId = obj.exitZoneId;
              if (!exitZoneId) return false;

              const allInExit = livingSurvivors.every(s => s.position.zoneId === exitZoneId);
              if (!allInExit) return false;

              const zombiesInExit = zombies.some(z => z.position.zoneId === exitZoneId);
              if (zombiesInExit) return false;

              return true;
          }
          case ObjectiveType.TakeObjective:
          case ObjectiveType.TakeColorObjective:
          case ObjectiveType.TakeEpicCrate:
          case ObjectiveType.KillZombie:
              return obj.amountCurrent >= obj.amountRequired;
          case ObjectiveType.CollectItems: {
              // Sum committed inventory only (drawnCard is transient mid-search
              // staging). Match by equipmentId — exact, not name substring.
              return obj.itemRequirements.every(req => {
                  let total = 0;
                  for (const s of livingSurvivors) {
                      for (const card of s.inventory) {
                          if (card.equipmentId === req.equipmentId) total += 1;
                      }
                  }
                  return total >= req.quantity;
              });
          }
          case ObjectiveType.ReachDangerLevel: {
              // Team-shared: highest XP-derived danger among living survivors.
              const teamMax = livingSurvivors.reduce(
                  (acc, s) => Math.max(acc, DANGER_VALUES[s.dangerLevel]),
                  0,
              );
              return teamMax >= DANGER_VALUES[obj.dangerThreshold];
          }
          default: {
              const _exhaustive: never = obj;
              return _exhaustive;
          }
      }
  });

  if (allObjectivesMet) {
      return GameResult.Victory;
  }

  return undefined;
}

// Wound / skill decisions: accepted out of turn, handlers check authority
// (host distributes, owner resolves and chooses).
const DECISION_ACTIONS = [
  ActionType.DISTRIBUTE_ZOMBIE_WOUNDS, ActionType.RESOLVE_WOUNDS, ActionType.CHOOSE_SKILL,
];

// Not subject to turn checks nor blocked by pending wounds.
const UNBLOCKED_ACTIONS = [
  ...DECISION_ACTIONS,
  ActionType.JOIN_LOBBY, ActionType.UPDATE_NICKNAME, ActionType.SELECT_CHARACTER,
  ActionType.START_GAME, ActionType.END_GAME, ActionType.ACTIVATE_CHEAT,
];

// --- Action costs ---
//
// What a handled action costs its survivor. Two sets instead of a chain of
// special cases: spending an action is the rule, and everything else is one of
// two kinds of free.

/** Spends 1 action point, plus any transient `_extraAPCost`. */
const AP_ACTIONS = new Set<ActionType>([
  ActionType.MOVE, ActionType.ATTACK, ActionType.RELOAD, ActionType.SEARCH, ActionType.SPRINT,
  ActionType.OPEN_DOOR, ActionType.MAKE_NOISE, ActionType.BLOODLUST_MELEE, ActionType.JUMP,
  ActionType.TAKE_OBJECTIVE, ActionType.TAKE_EPIC_CRATE,
  // The reorganize session: one action buys every move until ORGANIZE_END.
  ActionType.ORGANIZE_START,
]);

/**
 * Costs nothing, but may have been the last thing keeping the turn open, so
 * `checkEndTurn` still runs. Discarding and rearranging are free by rule
 * (rules/07-inventory.md#discarding); RESOLVE_SEARCH and ORGANIZE were paid for by the search
 * or the session that staged the card; END_TURN cleared every blocker itself.
 */
const FREE_ACTIONS = new Set<ActionType>([
  ActionType.CHARGE, ActionType.BORN_LEADER, ActionType.LIFESAVER, ActionType.SHOVE, ActionType.USE_ITEM,
  ActionType.DISCARD_CARD, ActionType.ORGANIZE, ActionType.ORGANIZE_END,
  ActionType.RESOLVE_SEARCH, ActionType.END_TURN,
]);

// Anything in neither set costs nothing and cannot end a turn: lobby and meta
// actions, and the trade sub-actions whose action `executeTrade` charges.

export function processAction(state: GameState, intent: ActionRequest): ActionResponse {
  // 0. Pending decisions block everything except decisions and lobby/meta actions
  if (!UNBLOCKED_ACTIONS.includes(intent.type)) {
    if (ZombiePhaseManager.hasPendingWounds(state)) {
      return {
        success: false,
        error: { code: 'PENDING_WOUNDS', message: es.errors.pendingWounds },
      };
    }

    // The skill is chosen on reaching the level, so the survivor who owes one
    // stops there. Per survivor: the other players keep playing.
    const actor = intent.survivorId ? state.survivors[intent.survivorId] : undefined;
    if (actor && XPManager.getPendingSkillChoice(actor)) {
      return {
        success: false,
        error: { code: 'PENDING_SKILL_CHOICE', message: es.errors.pendingSkillChoice },
      };
    }
  }

  if (UNBLOCKED_ACTIONS.includes(intent.type) || intent.type === ActionType.DISCARD_CARD) {
      // Allow through without turn checks — discarding is free at any time,
      // so handleDiscardCard checks ownership itself.
  } else {
      // 1. Validate Turn Ownership
      let turnError: ActionError | null = validateTurn(state, intent);

      // Special Cases
      if ((intent.type === ActionType.RESOLVE_SEARCH
          || intent.type === ActionType.CHARGE || intent.type === ActionType.BORN_LEADER
          || intent.type === ActionType.LIFESAVER || intent.type === ActionType.SHOVE
          || intent.type === ActionType.END_TURN || intent.type === ActionType.REROLL_LUCKY)
          && turnError && turnError.code === 'NO_ACTIONS') {
        turnError = null;
      }

      if (turnError) {
        return { success: false, error: turnError };
      }
  }

  // 2. Dispatch Handler
  const handler = handlers[intent.type];
  if (!handler) {
    return {
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: `Action ${intent.type} not implemented.` }
    };
  }

  try {
    let newState = handler(state, intent);

    // 4. Charge the action (see AP_ACTIONS / FREE_ACTIONS above)
    if (AP_ACTIONS.has(intent.type)) {
        // Consume transient extra AP cost (e.g. zombie zone control penalty on MOVE)
        const extraCost = newState._extraAPCost || 0;
        delete newState._extraAPCost;
        const attackIsMelee = newState.lastAction?.type === ActionType.ATTACK
          ? newState.lastAction.isMelee
          : undefined;
        newState = deductAPWithFreeCheck(newState, intent.survivorId!, intent.type, extraCost, attackIsMelee);
    } else if (FREE_ACTIONS.has(intent.type)) {
        delete (newState as any)._extraAPCost;
        delete (newState as any)._attackIsMelee;
        newState = checkEndTurn(newState);
    } else if (
        (intent.type === ActionType.RESOLVE_WOUNDS || intent.type === ActionType.DISTRIBUTE_ZOMBIE_WOUNDS)
        && newState.phase === GamePhase.Players
    ) {
        // No AP cost. Mid-turn wounds (door-open activations) may have been the
        // last thing keeping the turn open. While paused in the Zombies phase,
        // survivors have 0 actions, so checkEndTurn would wrongly advance players.
        newState = checkEndTurn(newState);
    }

    // 4b. Danger Level follows the highest living survivor after every action
    if (newState.phase === GamePhase.Players || newState.phase === GamePhase.Zombies) {
      newState.currentDangerLevel = ZombiePhaseManager.getCurrentDangerLevel(newState);
    }

    // 5. Zombie Phase: run on Players → Zombies; End Phase waits for pending wounds
    if (state.phase === GamePhase.Players && newState.phase === GamePhase.Zombies) {
      newState = ZombiePhaseManager.executeZombiePhase(newState);
    } else if (newState.phase === GamePhase.Zombies && !ZombiePhaseManager.hasPendingWounds(newState)) {
      newState = ZombiePhaseManager.endRound(newState);
    }

    // 5b. Check Game End Conditions
    if (newState.phase === GamePhase.Players || newState.phase === GamePhase.Zombies) {
        const result = checkGameEndConditions(newState);
        if (result) {
          newState.gameResult = result;
          newState.phase = GamePhase.GameOver; // Lock game
        }
    }

    // 6. Log History — merge lastAction feedback into history entry for rich display
    if (intent.type !== ActionType.SELECT_CHARACTER && intent.type !== ActionType.UPDATE_NICKNAME) {
        const historyEntry: any = {
            playerId: intent.playerId,
            survivorId: intent.survivorId || 'system',
            actionType: intent.type,
            timestamp: Date.now(),
            payload: intent.payload,
            turn: newState.turn,
        };

        // Capture feedback only when this action produced it (handlers stamp
        // lastAction / spawnContext with a fresh timestamp); never copy stale ones.
        const la = newState.lastAction;
        if (la && la.timestamp !== state.lastAction?.timestamp) {
            historyEntry.description = la.description;
            historyEntry.dice = la.dice;
            historyEntry.hits = la.hits;
            historyEntry.threshold = la.threshold;
            historyEntry.damagePerHit = la.damagePerHit;
            historyEntry.bonusDice = la.bonusDice;
            historyEntry.bonusDamage = la.bonusDamage;
            historyEntry.rerolledFrom = la.rerolledFrom;
            historyEntry.rerollSource = la.rerollSource;
            historyEntry.usedFreeAction = la.usedFreeAction;
            historyEntry.freeActionType = la.freeActionType;
        }

        // Capture spawn context (spawns + zombie wounds) for zombie phase entries
        const sc = newState.spawnContext;
        if (sc && sc.timestamp !== state.spawnContext?.timestamp
            && (sc.cards?.length || sc.zombieWounds?.length)) {
            historyEntry.spawnContext = sc;
        }

        newState.history = [
          ...(newState.history || []),
          historyEntry,
        ];
    }

    return { success: true, newState };

  } catch (e: any) {
    return {
      success: false,
      error: { code: 'ACTION_FAILED', message: e.message }
    };
  }
}
