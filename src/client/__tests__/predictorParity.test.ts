// SwarmComms Step 6 — client predictor / server handler parity tests
// (reviewer #9, Work item E).
//
// The client predictor REUSES the server handler verbatim (see
// `src/client/predictors.ts`), so parity is guaranteed by construction for
// the whitelisted subset. These tests demonstrate that invariant empirically
// over 50 randomly generated states × each whitelisted action type, by
// running the SERVER handler on one clone of each state and the CLIENT
// predictor on another clone and asserting structural equality of the
// resulting states + event batches.
//
// If a future refactor introduces a parallel client predictor that diverges
// from the server handler, these tests will catch it before the whitelist
// can ship a misprediction.

import { describe, it, expect } from 'vitest';
import { ActionType, ActionRequest } from '../../types/Action';
import { EventCollector } from '../../services/EventCollector';
import { handleMove } from '../../services/handlers/MovementHandlers';
import { handleReload } from '../../services/handlers/CombatHandlers';
import { handleOrganize } from '../../services/handlers/ItemHandlers';
import { handleEndTurn } from '../../services/handlers/TurnHandlers';
import { handleChooseSkill } from '../../services/handlers/SkillHandlers';
import { handleTradeStart, handleTradeOffer } from '../../services/handlers/TradeHandlers';
import { getPredictor } from '../predictors';
import { makeMinimalState, makePistol, makeBaseballBat } from './testStateHelper';
import type { GameState } from '../../types/GameState';

// --- Deterministic PRNG for reproducibility ---
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type IntentFactory = (state: GameState, rand: () => number) => ActionRequest;
type HandlerFn = (state: GameState, intent: ActionRequest, collector: EventCollector) => void;

function runServer(handler: HandlerFn, state: GameState, intent: ActionRequest) {
  const collector = new EventCollector();
  handler(state, intent, collector);
  return collector.drain();
}

function runClient(intent: ActionRequest, state: GameState) {
  const predictor = getPredictor(intent.type);
  if (!predictor) throw new Error(`no predictor for ${intent.type}`);
  return predictor(state, intent);
}

function randomizeState(rand: () => number): GameState {
  const state = makeMinimalState();
  // Wiggle some irrelevant fields so each run is distinct.
  state.turn = Math.floor(rand() * 15) + 1;
  state.survivors.s1.actionsRemaining = 1 + Math.floor(rand() * 3);
  state.survivors.s1.experience = Math.floor(rand() * 30);
  state.noiseTokens = Math.floor(rand() * 4);
  return state;
}

/** Run N random state × handler pairs, asserting server vs predictor
 *  agreement on (final state shape, emitted events). */
function parityCase(label: string, handler: HandlerFn, intentFactory: IntentFactory, iterations = 50) {
  it(`${label} — server/predictor parity over ${iterations} random states`, () => {
    const rand = mulberry32(0x5EED + label.charCodeAt(0));
    let ran = 0;
    let skipped = 0;
    for (let i = 0; i < iterations; i++) {
      const base = randomizeState(rand);
      const intent = intentFactory(base, rand);

      const serverState = structuredClone(base);
      const clientState = structuredClone(base);

      let serverEvents: ReturnType<typeof runServer> | null = null;
      let clientEvents: ReturnType<typeof runClient> | null = null;
      let serverErr: Error | null = null;
      let clientErr: Error | null = null;

      try { serverEvents = runServer(handler, serverState, intent); } catch (e) { serverErr = e as Error; }
      try { clientEvents = runClient(intent, clientState); } catch (e) { clientErr = e as Error; }

      // Both paths must throw-or-succeed identically.
      expect(!!serverErr).toBe(!!clientErr);
      if (serverErr) {
        expect(clientErr!.message).toBe(serverErr.message);
        skipped++;
        continue;
      }

      // Events match byte-for-byte.
      expect(JSON.stringify(clientEvents)).toBe(JSON.stringify(serverEvents));
      // Resulting state matches byte-for-byte. `lastAction.timestamp` is
      // populated by Date.now() and will differ between calls — zero it out
      // before comparing so the test is deterministic.
      if (serverState.lastAction) serverState.lastAction.timestamp = 0;
      if (clientState.lastAction) clientState.lastAction.timestamp = 0;
      expect(JSON.stringify(clientState)).toBe(JSON.stringify(serverState));
      ran++;
    }
    // Require at least a handful of successful (non-throwing) iterations —
    // otherwise the intent factory is pathological and the test is vacuous.
    expect(ran).toBeGreaterThanOrEqual(1);
    expect(skipped + ran).toBe(iterations);
  });
}

describe('Whitelisted predictor parity (reviewer #9)', () => {
  parityCase('MOVE depth-1', handleMove, (state) => ({
    playerId: 'p1',
    survivorId: 's1',
    type: ActionType.MOVE,
    payload: { targetZoneId: 'z2' }, // z1 ↔ z2 is a direct adjacency in the fixture
  }));

  parityCase('RELOAD', handleReload, (state, rand) => {
    // Put a reload-able pistol in-hand that's fired (reloaded=false) so
    // the handler's validate-first gate passes.
    state.survivors.s1.inventory = [makePistol('pistol-a')];
    return {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.RELOAD,
      payload: {},
    };
  });

  parityCase('ORGANIZE move to hand', handleOrganize, (state) => {
    state.survivors.s1.inventory = [makeBaseballBat('bat-a')];
    return {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.ORGANIZE,
      payload: { cardId: 'bat-a', targetSlot: 'HAND_1' },
    };
  });

  parityCase('ORGANIZE discard', handleOrganize, (state) => {
    state.survivors.s1.inventory = [makeBaseballBat('bat-b')];
    return {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.ORGANIZE,
      payload: { cardId: 'bat-b', targetSlot: 'DISCARD' },
    };
  });

  parityCase('END_TURN', handleEndTurn, (state) => ({
    playerId: 'p1',
    survivorId: 's1',
    type: ActionType.END_TURN,
  }));

  parityCase('CHOOSE_SKILL — valid skill at Orange', handleChooseSkill, (state) => {
    // canChooseSkill only returns true at Orange/Red level (Blue/Yellow
    // skills auto-unlock). Pick one of Wanda's Orange options.
    state.survivors.s1.experience = 19; // Orange threshold is 18
    state.survivors.s1.dangerLevel = 'ORANGE' as any;
    return {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.CHOOSE_SKILL,
      payload: { skillId: 'slippery' },
    };
  });

  parityCase('TRADE_START', handleTradeStart, (state) => {
    // Place a second survivor in the same zone as s1 so start validates.
    state.survivors.s2 = structuredClone(state.survivors.s1);
    state.survivors.s2.id = 's2';
    state.survivors.s2.playerId = 'p2';
    state.survivors.s2.name = 's2';
    if (!state.players.includes('p2')) state.players.push('p2');
    return {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.TRADE_START,
      payload: { targetSurvivorId: 's2' },
    };
  });

  parityCase('TRADE_OFFER', handleTradeOffer, (state) => {
    state.survivors.s1.inventory = [makeBaseballBat('bat-to-offer')];
    state.survivors.s2 = structuredClone(state.survivors.s1);
    state.survivors.s2.id = 's2';
    state.survivors.s2.playerId = 'p2';
    state.activeTrade = {
      activeSurvivorId: 's1',
      targetSurvivorId: 's2',
      offers: { s1: [], s2: [] },
      receiveLayouts: { s1: {}, s2: {} },
      status: { s1: false, s2: false },
    };
    return {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.TRADE_OFFER,
      payload: { offerCardIds: ['bat-to-offer'] },
    };
  });
});
