// SwarmComms Step 6 — OptimisticStore unit tests.
//
// Covers: whitelist scope (reviewer #1), MOVE depth enforcement (reviewer #3),
// serialization (no cascade, reviewer #11), D10 skill-pending suppression
// (reviewer #6), snapshot capture + restore correctness (reviewer #8).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OptimisticStore,
  OPTIMISTIC_WHITELIST,
  SKILL_SENSITIVE_ACTIONS,
  captureSnapshot,
  applySnapshot,
  generateActionId,
} from '../OptimisticStore';
import { ActionType } from '../../types/Action';
import { makeMinimalState, makeSurvivor } from './testStateHelper';

const MOVE_DEPTH_1 = {
  playerId: 'p1',
  survivorId: 's1',
  type: ActionType.MOVE,
  payload: { targetZoneId: 'z2' },
};

const MOVE_DEPTH_2 = {
  playerId: 'p1',
  survivorId: 's1',
  type: ActionType.MOVE,
  payload: { path: ['z2', 'z3'] },
};

describe('OPTIMISTIC_WHITELIST — reviewer #1', () => {
  it('contains exactly the 7 §3.3.2 types', () => {
    expect(OPTIMISTIC_WHITELIST.size).toBe(7);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.MOVE)).toBe(true);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.RELOAD)).toBe(true);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.ORGANIZE)).toBe(true);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.END_TURN)).toBe(true);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.CHOOSE_SKILL)).toBe(true);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.TRADE_START)).toBe(true);
    expect(OPTIMISTIC_WHITELIST.has(ActionType.TRADE_OFFER)).toBe(true);
  });

  it('excludes every non-whitelist action type the reviewer lists (reviewer #2)', () => {
    const forbidden: ActionType[] = [
      ActionType.ATTACK,
      ActionType.SEARCH,
      ActionType.RESOLVE_SEARCH,
      ActionType.SPRINT,
      ActionType.OPEN_DOOR,
      ActionType.TRADE_ACCEPT,
      ActionType.ASSIGN_FRIENDLY_FIRE,
      ActionType.DISTRIBUTE_ZOMBIE_WOUNDS,
      ActionType.REROLL_LUCKY,
      ActionType.USE_ITEM,
      ActionType.TAKE_OBJECTIVE,
      ActionType.MAKE_NOISE,
      ActionType.CHARGE,
      ActionType.BORN_LEADER,
    ];
    for (const t of forbidden) {
      expect(OPTIMISTIC_WHITELIST.has(t)).toBe(false);
    }
  });
});

describe('shouldApplyOptimistically', () => {
  let store: OptimisticStore;
  beforeEach(() => {
    store = new OptimisticStore();
  });

  it('accepts MOVE depth-1 (payload.targetZoneId) — reviewer #3', () => {
    expect(store.shouldApplyOptimistically(MOVE_DEPTH_1)).toBe(true);
  });

  it('rejects MOVE depth-2 (payload.path.length > 1) — reviewer #3', () => {
    expect(store.shouldApplyOptimistically(MOVE_DEPTH_2)).toBe(false);
  });

  it('accepts RELOAD / ORGANIZE / END_TURN / CHOOSE_SKILL / TRADE_START / TRADE_OFFER', () => {
    for (const t of [
      ActionType.RELOAD,
      ActionType.ORGANIZE,
      ActionType.END_TURN,
      ActionType.CHOOSE_SKILL,
      ActionType.TRADE_START,
      ActionType.TRADE_OFFER,
    ]) {
      expect(
        store.shouldApplyOptimistically({ playerId: 'p1', survivorId: 's1', type: t, payload: {} }),
      ).toBe(true);
    }
  });

  it('rejects non-whitelisted actions (ATTACK / SPRINT / OPEN_DOOR / ...) — reviewer #2', () => {
    for (const t of [ActionType.ATTACK, ActionType.SPRINT, ActionType.SEARCH, ActionType.OPEN_DOOR, ActionType.TRADE_ACCEPT]) {
      expect(
        store.shouldApplyOptimistically({ playerId: 'p1', survivorId: 's1', type: t, payload: {} }),
      ).toBe(false);
    }
  });

  it('serializes — any pending optimistic blocks a second one (reviewer #11 no-cascade invariant)', () => {
    store.record({
      actionId: 'first',
      type: ActionType.MOVE,
      survivorId: 's1',
      snapshot: {},
      events: [],
      skillEffectBearing: false,
    });
    expect(store.hasPending()).toBe(true);
    expect(store.shouldApplyOptimistically({ playerId: 'p1', survivorId: 's1', type: ActionType.RELOAD, payload: {} })).toBe(false);
    store.confirm('first');
    expect(store.hasPending()).toBe(false);
    expect(store.shouldApplyOptimistically({ playerId: 'p1', survivorId: 's1', type: ActionType.RELOAD, payload: {} })).toBe(true);
  });
});

describe('D10 — pending-skill suppression (reviewer #6)', () => {
  let store: OptimisticStore;
  beforeEach(() => { store = new OptimisticStore(); });

  it('hasPendingSkillEffect reflects CHOOSE_SKILL entries only', () => {
    expect(store.hasPendingSkillEffect()).toBe(false);

    store.record({
      actionId: 'skill-1',
      type: ActionType.CHOOSE_SKILL,
      survivorId: 's1',
      snapshot: {},
      events: [],
      skillEffectBearing: true,
    });
    expect(store.hasPendingSkillEffect()).toBe(true);

    store.confirm('skill-1');
    expect(store.hasPendingSkillEffect()).toBe(false);
  });

  it('a non-skill-bearing pending entry does NOT suppress skill-sensitive optimism', () => {
    // (Serialize still blocks in practice; this isolates the D10 mechanism.)
    store.record({
      actionId: 'move-1',
      type: ActionType.MOVE,
      survivorId: 's1',
      snapshot: {},
      events: [],
      skillEffectBearing: false,
    });
    // skillEffectBearing=false → hasPendingSkillEffect remains false
    expect(store.hasPendingSkillEffect()).toBe(false);
  });

  it('SKILL_SENSITIVE_ACTIONS lists MOVE (today the only skill-reading Tier-1)', () => {
    expect(SKILL_SENSITIVE_ACTIONS.has(ActionType.MOVE)).toBe(true);
  });

  it('MOVE after pending CHOOSE_SKILL does NOT go optimistic — reviewer #6', () => {
    store.record({
      actionId: 'skill-1',
      type: ActionType.CHOOSE_SKILL,
      survivorId: 's1',
      snapshot: {},
      events: [],
      skillEffectBearing: true,
    });
    expect(store.shouldApplyOptimistically(MOVE_DEPTH_1)).toBe(false);
    store.confirm('skill-1');
    expect(store.shouldApplyOptimistically(MOVE_DEPTH_1)).toBe(true);
  });
});

describe('captureSnapshot / applySnapshot — reviewer #5, #7, #8', () => {
  it('snapshot clones ONLY the touched survivor, not the whole state', () => {
    const state = makeMinimalState();
    const snapshot = captureSnapshot(MOVE_DEPTH_1, state);

    // Touched survivor is captured.
    expect(snapshot.survivors).toBeDefined();
    expect(snapshot.survivors!.s1).toBeDefined();
    // It's a CLONE — mutating the live state shouldn't change the snapshot.
    state.survivors.s1.position.zoneId = 'z9';
    expect(snapshot.survivors!.s1.position.zoneId).toBe('z1');

    // No full-state keys in snapshot.
    expect((snapshot as Record<string, unknown>).zombies).toBeUndefined();
    expect((snapshot as Record<string, unknown>).zones).toBeUndefined();
    expect((snapshot as Record<string, unknown>).equipmentDeck).toBeUndefined();
    expect((snapshot as Record<string, unknown>).config).toBeUndefined();
  });

  it('rollback restores the touched subtree byte-identical — reviewer #8', () => {
    const state = makeMinimalState();
    const pre = structuredClone(state);
    const snapshot = captureSnapshot(MOVE_DEPTH_1, state);

    // Simulate an optimistic mutation.
    state.survivors.s1.position.zoneId = 'z2';
    state.survivors.s1.hasMoved = true;
    state.lastAction = {
      type: ActionType.MOVE,
      playerId: 'p1',
      survivorId: 's1',
      timestamp: 1,
      description: 'optimistic',
    };

    applySnapshot(state, snapshot);

    expect(state.survivors.s1.position.zoneId).toBe('z1');
    expect(state.survivors.s1.hasMoved).toBe(false);
    expect(state.lastAction).toBeUndefined();
    // Whole-state diff against the pre-mutation clone: identical.
    expect(JSON.stringify(state)).toBe(JSON.stringify(pre));
  });

  it('restores lastAction to its prior value when the action DID run before', () => {
    const state = makeMinimalState();
    const prior = {
      type: ActionType.RELOAD,
      playerId: 'p1',
      survivorId: 's1',
      timestamp: 0,
      description: 'prior',
    };
    state.lastAction = prior;

    const snapshot = captureSnapshot(MOVE_DEPTH_1, state);

    state.lastAction = {
      type: ActionType.MOVE,
      playerId: 'p1',
      survivorId: 's1',
      timestamp: 5,
      description: 'optimistic',
    };

    applySnapshot(state, snapshot);

    expect(state.lastAction).toEqual(prior);
  });

  it('ORGANIZE snapshot captures equipmentDiscard', () => {
    const state = makeMinimalState();
    const snapshot = captureSnapshot(
      { playerId: 'p1', survivorId: 's1', type: ActionType.ORGANIZE, payload: { cardId: 'c', targetSlot: 'DISCARD' } },
      state,
    );
    expect(snapshot.equipmentDiscard).toBeDefined();
    expect(Array.isArray(snapshot.equipmentDiscard)).toBe(true);
  });

  it('TRADE_START/TRADE_OFFER snapshot captures activeTrade', () => {
    const state = makeMinimalState();
    const snapshot = captureSnapshot(
      { playerId: 'p1', survivorId: 's1', type: ActionType.TRADE_START, payload: {} },
      state,
    );
    expect('activeTrade' in snapshot).toBe(true);
    expect(snapshot.activeTrade).toBe(null); // absent pre-action → delete marker
  });
});

describe('generateActionId', () => {
  it('returns unique ids across rapid-fire calls — reviewer #4', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(generateActionId());
    expect(ids.size).toBe(500);
  });
});
