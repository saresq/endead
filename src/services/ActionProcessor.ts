
import { GameState, GamePhase, GameResult, ObjectiveType, Objective, Survivor, ZombieType, DangerLevel } from '../types/GameState';
import { ActionRequest, ActionResponse, ActionType, ActionError } from '../types/Action';
import { validateTurn, advanceTurnState, checkEndTurn } from './TurnManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { deductAPWithFreeCheck, ActionHandler } from './handlers/handlerUtils';

// --- Handler imports ---
import { handleJoinLobby, handleUpdateNickname, handleSelectCharacter, handleStartGame, handleEndGame } from './handlers/LobbyHandlers';
import { handleMove, handleSprint } from './handlers/MovementHandlers';
import { handleAttack, handleResolveWounds, handleDistributeZombieWounds, handleRerollLucky } from './handlers/CombatHandlers';
import { handleCharge, handleBornLeader, handleBloodlustMelee, handleLifesaver, handleChooseSkill } from './handlers/SkillHandlers';
import { handleUseItem, handleSearch, handleResolveSearch, handleOrganize } from './handlers/ItemHandlers';
import { handleOpenDoor, handleMakeNoise } from './handlers/DoorHandlers';
import { handleTradeStart, handleTradeOffer, handleTradeAccept, handleTradeCancel } from './handlers/TradeHandlers';
import { handleTakeObjective } from './handlers/ObjectiveHandlers';
import { handleTakeEpicCrate } from './handlers/EpicCrateHandlers';
import { handleNothing, handleEndTurn } from './handlers/TurnHandlers';
import { handleActivateCheat } from './handlers/CheatHandlers';

const handlers: Partial<Record<ActionType, ActionHandler>> = {
  [ActionType.JOIN_LOBBY]: handleJoinLobby,
  [ActionType.UPDATE_NICKNAME]: handleUpdateNickname,
  [ActionType.SELECT_CHARACTER]: handleSelectCharacter,
  [ActionType.START_GAME]: handleStartGame,
  [ActionType.END_GAME]: handleEndGame,
  [ActionType.MOVE]: handleMove,
  [ActionType.ATTACK]: handleAttack,
  [ActionType.MAKE_NOISE]: handleMakeNoise,
  [ActionType.CHOOSE_SKILL]: handleChooseSkill,
  [ActionType.SEARCH]: handleSearch,
  [ActionType.RESOLVE_SEARCH]: handleResolveSearch,
  [ActionType.ORGANIZE]: handleOrganize,
  [ActionType.OPEN_DOOR]: handleOpenDoor,
  [ActionType.TAKE_OBJECTIVE]: handleTakeObjective,
  [ActionType.TAKE_EPIC_CRATE]: handleTakeEpicCrate,
  [ActionType.TRADE_START]: handleTradeStart,
  [ActionType.TRADE_OFFER]: handleTradeOffer,
  [ActionType.TRADE_ACCEPT]: handleTradeAccept,
  [ActionType.TRADE_CANCEL]: handleTradeCancel,
  [ActionType.SPRINT]: handleSprint,
  [ActionType.USE_ITEM]: handleUseItem,
  [ActionType.NOTHING]: handleNothing,
  [ActionType.END_TURN]: handleEndTurn,
  [ActionType.CHARGE]: handleCharge,
  [ActionType.BORN_LEADER]: handleBornLeader,
  [ActionType.BLOODLUST_MELEE]: handleBloodlustMelee,
  [ActionType.LIFESAVER]: handleLifesaver,
  [ActionType.RESOLVE_WOUNDS]: handleResolveWounds,
  [ActionType.DISTRIBUTE_ZOMBIE_WOUNDS]: handleDistributeZombieWounds,
  [ActionType.REROLL_LUCKY]: handleRerollLucky,
  [ActionType.ACTIVATE_CHEAT]: handleActivateCheat,
};

// --- Game End Logic ---

const DANGER_VALUES: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 1,
  [DangerLevel.Orange]: 2,
  [DangerLevel.Red]: 3,
};

export function checkGameEndConditions(state: GameState): GameResult | undefined {
  const survivors = Object.values(state.survivors);
  const zombies = Object.values(state.zombies);

  if (survivors.length === 0) return undefined;

  // Per Zombicide rules: the game is lost when ANY single survivor dies
  const anyDead = survivors.some(s => s.wounds >= s.maxHealth);
  if (anyDead) return GameResult.Defeat;

  if (!state.objectives || state.objectives.length === 0) return undefined;

  const livingSurvivors = survivors.filter(s => s.wounds < s.maxHealth);

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

export function processAction(state: GameState, intent: ActionRequest): ActionResponse {
  // 0. Pre-check: Lobby Actions don't check Turns
  if (
    intent.type === ActionType.UPDATE_NICKNAME ||
    intent.type === ActionType.SELECT_CHARACTER ||
    intent.type === ActionType.START_GAME ||
    intent.type === ActionType.END_GAME ||
    intent.type === ActionType.DISTRIBUTE_ZOMBIE_WOUNDS ||
    intent.type === ActionType.ACTIVATE_CHEAT
  ) {
      // Allow through (lobby actions + cooperative wound distribution)
  } else {
      // 1. Validate Turn Ownership
      let turnError: ActionError | null = validateTurn(state, intent);

      // Special Cases
      if ((intent.type === ActionType.CHOOSE_SKILL || intent.type === ActionType.RESOLVE_SEARCH
          || intent.type === ActionType.CHARGE || intent.type === ActionType.BORN_LEADER
          || intent.type === ActionType.LIFESAVER || intent.type === ActionType.RESOLVE_WOUNDS
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

    // 4. Advance Turn State (Deduct AP) - ONLY for Game Actions
    const gameActions = [
        ActionType.MOVE, ActionType.ATTACK, ActionType.SEARCH, ActionType.SPRINT, ActionType.USE_ITEM,
        ActionType.OPEN_DOOR, ActionType.MAKE_NOISE, ActionType.ORGANIZE,
        ActionType.TAKE_OBJECTIVE, ActionType.TAKE_EPIC_CRATE,
        ActionType.TRADE_START, ActionType.TRADE_OFFER,
        ActionType.TRADE_ACCEPT, ActionType.TRADE_CANCEL, ActionType.END_TURN,
        ActionType.CHARGE, ActionType.BORN_LEADER, ActionType.BLOODLUST_MELEE, ActionType.LIFESAVER
    ];

    // Food consumption is free per Zombicide 2E (cards can be discarded any
    // time). Currently the only USE_ITEM case is food.
    const freeActions = [
        ActionType.CHARGE, ActionType.BORN_LEADER, ActionType.LIFESAVER, ActionType.USE_ITEM,
    ];

    if (gameActions.includes(intent.type)) {
       // Filter out Trade Session Sub-Actions from AP Cost
       if (intent.type === ActionType.TRADE_START ||
           intent.type === ActionType.TRADE_OFFER ||
           intent.type === ActionType.TRADE_ACCEPT ||
           intent.type === ActionType.TRADE_CANCEL) {
           // No AP cost yet
       }
       else if (intent.type === ActionType.ORGANIZE && newState.activeTrade) {
           const trade = newState.activeTrade;
           if (intent.survivorId === trade.activeSurvivorId || intent.survivorId === trade.targetSurvivorId) {
               // Free Organize during trade
           } else {
               newState = deductAPWithFreeCheck(newState, intent.survivorId!, intent.type);
           }
       }
       else if (intent.type === ActionType.ORGANIZE && newState.survivors[intent.survivorId!]?.drawnCard) {
           // Free Organize during Pickup/Search Resolution
       }
       else if (freeActions.includes(intent.type)) {
           // Charge, Born Leader, Lifesaver, and food consumption — no AP cost
           newState = checkEndTurn(newState);
       }
       else if (intent.type === ActionType.END_TURN) {
           // END_TURN is unconditional: handleEndTurn already cleared every blocker
           // (actions, free counters, drawn cards, active trade) for the active
           // player, so go straight to checkEndTurn without AP deduction or
           // cheat-mode replenishment.
           delete (newState as any)._extraAPCost;
           delete (newState as any)._attackIsMelee;
           newState = checkEndTurn(newState);
       }
       else {
           // Consume transient extra AP cost (e.g. zombie zone control penalty on MOVE)
           const extraCost = newState._extraAPCost || 0;
           delete newState._extraAPCost;
           delete (newState as any)._attackIsMelee;
           newState = deductAPWithFreeCheck(newState, intent.survivorId!, intent.type, extraCost);
       }
    } else if (intent.type === ActionType.RESOLVE_SEARCH) {
        // Since RESOLVE_SEARCH doesn't cost AP (cost was paid in SEARCH),
        // we only need to check if the turn should end now that the blocking condition (drawnCard) is cleared.
        newState = checkEndTurn(newState);
    } else if (intent.type === ActionType.RESOLVE_WOUNDS) {
        // No AP cost — resolving pending wounds from ITAYG skill
        newState = checkEndTurn(newState);
    } else if (intent.type === ActionType.DISTRIBUTE_ZOMBIE_WOUNDS) {
        // No AP cost — distributing zombie wounds among survivors
        newState = checkEndTurn(newState);
    }

    // 5. Check for Zombie Phase Transition
    if (newState.phase === GamePhase.Zombies) {
      newState = ZombiePhaseManager.executeZombiePhase(newState);
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

        // Capture rich combat/action feedback from lastAction
        if (newState.lastAction) {
            historyEntry.description = newState.lastAction.description;
            historyEntry.dice = newState.lastAction.dice;
            historyEntry.hits = newState.lastAction.hits;
            historyEntry.damagePerHit = newState.lastAction.damagePerHit;
            historyEntry.bonusDice = newState.lastAction.bonusDice;
            historyEntry.bonusDamage = newState.lastAction.bonusDamage;
            historyEntry.rerolledFrom = newState.lastAction.rerolledFrom;
            historyEntry.rerollSource = newState.lastAction.rerollSource;
            historyEntry.usedFreeAction = newState.lastAction.usedFreeAction;
            historyEntry.freeActionType = newState.lastAction.freeActionType;
        }

        // Capture spawn context for zombie phase entries
        if (newState.spawnContext?.cards?.length) {
            historyEntry.spawnContext = newState.spawnContext;
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
