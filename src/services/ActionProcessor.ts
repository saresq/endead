
import { GameState, GamePhase, GameResult, ObjectiveType } from '../types/GameState';
import { ActionRequest, ActionResponse, ActionType, ActionError, AttackFreePool } from '../types/Action';
import { validateTurn, checkEndTurn } from './TurnManager';
import { ZombiePhaseManager } from './ZombiePhaseManager';
import { deductAPWithFreeCheck, ActionHandler } from './handlers/handlerUtils';
import { EventCollector } from './EventCollector';
import type { GameEvent } from '../types/Events';

// --- Handler imports ---
import { handleJoinLobby, handleUpdateNickname, handleSelectCharacter, handlePickStarter, handleStartGame, handleEndGame } from './handlers/LobbyHandlers';
import { handleMove, handleSprint } from './handlers/MovementHandlers';
import { handleAttack, handleDistributeZombieWounds, handleRerollLucky, handleAssignFriendlyFire, handleReload } from './handlers/CombatHandlers';
import { handleCharge, handleBornLeader, handleChooseSkill } from './handlers/SkillHandlers';
import { handleUseItem, handleSearch, handleResolveSearch, handleOrganize } from './handlers/ItemHandlers';
import { handleOpenDoor, handleMakeNoise } from './handlers/DoorHandlers';
import { handleTradeStart, handleTradeOffer, handleTradeAccept, handleTradeCancel } from './handlers/TradeHandlers';
import { handleTakeObjective } from './handlers/ObjectiveHandlers';
import { handleNothing, handleEndTurn } from './handlers/TurnHandlers';
import { handleResolveZombieSplit } from './handlers/ZombieHandlers';

const handlers: Partial<Record<ActionType, ActionHandler>> = {
  [ActionType.JOIN_LOBBY]: handleJoinLobby,
  [ActionType.UPDATE_NICKNAME]: handleUpdateNickname,
  [ActionType.SELECT_CHARACTER]: handleSelectCharacter,
  [ActionType.PICK_STARTER]: handlePickStarter,
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
  [ActionType.DISTRIBUTE_ZOMBIE_WOUNDS]: handleDistributeZombieWounds,
  [ActionType.REROLL_LUCKY]: handleRerollLucky,
  [ActionType.ASSIGN_FRIENDLY_FIRE]: handleAssignFriendlyFire,
  [ActionType.RELOAD]: handleReload,
  [ActionType.RESOLVE_ZOMBIE_SPLIT]: handleResolveZombieSplit,
};

// --- Game End Logic ---

function checkGameEndConditions(state: GameState): GameResult | undefined {
  const survivors = Object.values(state.survivors);
  const zombies = Object.values(state.zombies);

  if (survivors.length === 0) return undefined;

  const anyDead = survivors.some(s => s.wounds >= s.maxHealth);
  if (anyDead) return GameResult.Defeat;

  if (!state.objectives || state.objectives.length === 0) return undefined;

  const livingSurvivors = survivors.filter(s => s.wounds < s.maxHealth);

  const allObjectivesMet = state.objectives.every(obj => {
    if (obj.completed) return true;

    if (obj.type === ObjectiveType.ReachExit) {
      if (!obj.targetId) return false;
      const exitZoneId = obj.targetId;
      const allInExit = livingSurvivors.every(s => s.position.zoneId === exitZoneId);
      if (!allInExit) return false;
      const zombiesInExit = zombies.some(z => z.position.zoneId === exitZoneId);
      if (zombiesInExit) return false;
      return true;
    }

    if (obj.type === ObjectiveType.CollectItem) {
      const requiredAmount = obj.amountRequired;
      let foundAmount = 0;
      livingSurvivors.forEach(s => {
        s.inventory.forEach(card => {
          if (obj.targetId && card.name.includes(obj.targetId)) foundAmount++;
        });
      });
      return foundAmount >= requiredAmount;
    }

    return obj.amountCurrent >= obj.amountRequired;
  });

  return allObjectivesMet ? GameResult.Victory : undefined;
}

/**
 * Process one action against `state`. SwarmComms semantics (§3.1, §3.10):
 *   - Mutation-in-place: handlers mutate `state` directly. The returned
 *     `newState` is the SAME reference as `state` on success.
 *   - `state.version` bumps by 1 per accepted action.
 *   - Events are collected during handler dispatch and surfaced via `events`.
 *   - On thrown error, the partial `state` may be corrupt — handlers MUST
 *     validate-first to avoid this (§3.10 rule 1).
 */
export function processAction(state: GameState, intent: ActionRequest): ActionResponse {
  // 0. Pre-check: lobby/cooperative actions skip the turn lock.
  if (
    intent.type === ActionType.UPDATE_NICKNAME ||
    intent.type === ActionType.SELECT_CHARACTER ||
    intent.type === ActionType.PICK_STARTER ||
    intent.type === ActionType.START_GAME ||
    intent.type === ActionType.END_GAME ||
    intent.type === ActionType.DISTRIBUTE_ZOMBIE_WOUNDS ||
    intent.type === ActionType.RESOLVE_ZOMBIE_SPLIT
  ) {
    // pass
  } else {
    let turnError: ActionError | null = validateTurn(state, intent);

    if ((intent.type === ActionType.CHOOSE_SKILL || intent.type === ActionType.RESOLVE_SEARCH
        || intent.type === ActionType.CHARGE || intent.type === ActionType.BORN_LEADER
        || intent.type === ActionType.END_TURN || intent.type === ActionType.REROLL_LUCKY
        || intent.type === ActionType.ASSIGN_FRIENDLY_FIRE)
        && turnError && turnError.code === 'NO_ACTIONS') {
      turnError = null;
    }

    if (turnError) return { success: false, error: turnError };
  }

  const handler = handlers[intent.type];
  if (!handler) {
    return {
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: `Action ${intent.type} not implemented.` }
    };
  }

  const collector = new EventCollector();
  try {
    handler(state, intent, collector);

    // 4. Advance Turn State (Deduct AP) — ONLY for game actions
    const gameActions = [
      ActionType.MOVE, ActionType.ATTACK, ActionType.SEARCH, ActionType.SPRINT, ActionType.USE_ITEM,
      ActionType.OPEN_DOOR, ActionType.MAKE_NOISE, ActionType.ORGANIZE,
      ActionType.TAKE_OBJECTIVE, ActionType.RELOAD,
      ActionType.TRADE_START, ActionType.TRADE_OFFER,
      ActionType.TRADE_ACCEPT, ActionType.TRADE_CANCEL, ActionType.END_TURN,
      ActionType.CHARGE, ActionType.BORN_LEADER
    ];

    if (gameActions.includes(intent.type)) {
      if (intent.type === ActionType.TRADE_START ||
          intent.type === ActionType.TRADE_OFFER ||
          intent.type === ActionType.TRADE_ACCEPT ||
          intent.type === ActionType.TRADE_CANCEL ||
          intent.type === ActionType.ORGANIZE) {
        // Trade sub-actions + Reorganize own their AP accounting inside the
        // handler so pre-mutation state (drawnCard, activeTrade membership)
        // determines the free-vs-charged path.
      }
      else if (intent.type === ActionType.CHARGE || intent.type === ActionType.BORN_LEADER) {
        // Charge / Born Leader are free actions
        checkEndTurn(state, collector);
      }
      else {
        // Pull scratch off the collector (lifted off GameState per D2/D18).
        const extraCost = collector.extraAPCost ?? 0;
        const isMelee = collector.attackIsMelee;
        const rawPref = intent.payload?.preferredFreePool;
        const pref: AttackFreePool | undefined =
          rawPref === 'combat' || rawPref === 'melee' || rawPref === 'ranged'
            ? rawPref
            : undefined;
        deductAPWithFreeCheck(state, intent.survivorId!, intent.type, extraCost, pref, isMelee, collector);
      }
    } else if (intent.type === ActionType.RESOLVE_SEARCH
            || intent.type === ActionType.DISTRIBUTE_ZOMBIE_WOUNDS
            || intent.type === ActionType.ASSIGN_FRIENDLY_FIRE) {
      // No AP cost — just check if turn should end after the blocking condition cleared.
      checkEndTurn(state, collector);
    }

    // 5. Check for Zombie Phase Transition
    if (state.phase === GamePhase.Zombies) {
      ZombiePhaseManager.executeZombiePhase(state, collector);
    }

    // 5b. Check Game End Conditions
    if (state.phase === GamePhase.Players || state.phase === GamePhase.Zombies) {
      const result = checkGameEndConditions(state);
      if (result) {
        state.gameResult = result;
        state.phase = GamePhase.GameOver;
      }
    }

    // 6. Bump version exactly once per accepted action (§3.1).
    state.version = (state.version ?? 0) + 1;

    const tagged = collector.drainTagged();
    const rawEvents = tagged.map((t) => t.event);
    return { success: true, newState: state, events: rawEvents, taggedEvents: tagged };

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: { code: 'ACTION_FAILED', message }
    };
  }
}

// Re-export so consumers can introspect the event payload type.
export type { GameEvent };
