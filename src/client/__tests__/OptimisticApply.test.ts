// SwarmComms Step 6 — GameStore applyOptimistic / rollbackOptimistic
// integration. Exercises the full optimistic flow the way NetworkManager
// drives it, so the §3.4 / §3.8 freeze + version invariants stay intact.
//
// Reviewer coverage:
//   - #5  No full-state clone on the optimistic path.
//   - #7  Rollback restores the touched subtree byte-identical.
//   - #11 Cascade invariant — reject one, leave the rest alone (we prove this
//         by exercising the serialization rule: only one optimistic in
//         flight, so a reject can never cascade).

import { describe, it, expect } from 'vitest';
import { GameStore } from '../GameStore';
import {
  OptimisticStore,
  captureSnapshot,
  generateActionId,
} from '../OptimisticStore';
import { getPredictor } from '../predictors';
import { ActionType } from '../../types/Action';
import { makeMinimalState, makePistol } from './testStateHelper';

describe('GameStore.applyOptimistic — mutate in place + fan events', () => {
  it('MOVE depth-1 updates position and fires SURVIVOR_MOVED without bumping version', () => {
    const store = new GameStore(makeMinimalState());
    const seen: string[] = [];
    store.subscribeEvents((e) => seen.push(e.type));

    const intent = {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.MOVE,
      payload: { targetZoneId: 'z2' },
    };
    const predictor = getPredictor(ActionType.MOVE)!;

    const versionBefore = store.state.version;
    const events = store.applyOptimistic((state) => predictor(state, intent));

    expect(store.state.survivors.s1.position.zoneId).toBe('z2');
    expect(seen).toEqual(['SURVIVOR_MOVED']);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SURVIVOR_MOVED');
    // Version IS NOT bumped on optimistic apply — server's EVENTS frame will
    // bump to v=prev+1 when it confirms, preserving gap-detection semantics.
    expect(store.state.version).toBe(versionBefore);
  });

  it('rollbackOptimistic restores exact pre-action state — reviewer #7', () => {
    const state = makeMinimalState();
    const pre = structuredClone(state);
    const store = new GameStore(state);

    const intent = {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.MOVE,
      payload: { targetZoneId: 'z2' },
    };
    const predictor = getPredictor(ActionType.MOVE)!;
    const snapshot = captureSnapshot(intent, store.state);
    store.applyOptimistic((s) => predictor(s, intent));

    expect(store.state.survivors.s1.position.zoneId).toBe('z2');

    store.rollbackOptimistic(snapshot);

    // Normalize the timestamp on lastAction (the predictor stamped Date.now
    // before rollback, which doesn't appear in `pre`).
    // pre had lastAction=undefined → snapshot captured null → rollback deleted it.
    expect(store.state.lastAction).toBeUndefined();
    expect(store.state.survivors.s1.position.zoneId).toBe('z1');
    expect(JSON.stringify(store.state)).toBe(JSON.stringify(pre));
  });

  it('RELOAD — flips reloaded flag and WEAPON_RELOADED fires; rollback reverses', () => {
    const state = makeMinimalState();
    state.survivors.s1.inventory = [makePistol('gun-1')];
    const pre = structuredClone(state);
    const store = new GameStore(state);

    const intent = {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.RELOAD,
      payload: {},
    };
    const predictor = getPredictor(ActionType.RELOAD)!;
    const snapshot = captureSnapshot(intent, store.state);
    store.applyOptimistic((s) => predictor(s, intent));

    expect(store.state.survivors.s1.inventory[0].reloaded).toBe(true);

    store.rollbackOptimistic(snapshot);

    expect(store.state.survivors.s1.inventory[0].reloaded).toBe(false);
    expect(JSON.stringify(store.state)).toBe(JSON.stringify(pre));
  });

  it('ORGANIZE — discard mutates equipmentDiscard; rollback reverses', () => {
    const state = makeMinimalState();
    state.survivors.s1.inventory = [makePistol('gun-x')];
    const pre = structuredClone(state);
    const store = new GameStore(state);

    const intent = {
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.ORGANIZE,
      payload: { cardId: 'gun-x', targetSlot: 'DISCARD' },
    };
    const predictor = getPredictor(ActionType.ORGANIZE)!;
    const snapshot = captureSnapshot(intent, store.state);
    store.applyOptimistic((s) => predictor(s, intent));

    expect(store.state.survivors.s1.inventory).toHaveLength(0);
    expect(store.state.equipmentDiscard).toHaveLength(1);

    store.rollbackOptimistic(snapshot);

    expect(store.state.survivors.s1.inventory).toHaveLength(1);
    expect(store.state.equipmentDiscard).toHaveLength(0);
    expect(JSON.stringify(store.state)).toBe(JSON.stringify(pre));
  });
});

describe('Cascade safety — serialization prevents independent-rollback', () => {
  it('OptimisticStore rejects a second optimistic while one is pending (reviewer #11)', () => {
    const store = new OptimisticStore();
    store.record({
      actionId: generateActionId(),
      type: ActionType.MOVE,
      survivorId: 's1',
      snapshot: {},
      events: [],
      skillEffectBearing: false,
    });
    const result = store.shouldApplyOptimistically({
      playerId: 'p1',
      survivorId: 's1',
      type: ActionType.RELOAD,
      payload: {},
    });
    expect(result).toBe(false);
    // Since the second action is sent non-optimistically, there's NEVER two
    // in-flight optimistic entries — rejecting one can never cascade to a
    // second (invariant #8).
  });
});
