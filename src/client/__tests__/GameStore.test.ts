// src/client/__tests__/GameStore.test.ts
//
// SwarmComms §3.4, §3.8 — client store invariants:
//   - Dev-mode freeze catches unauthorized between-batch mutations.
//   - `applyEvents` bumps version once per batch (not per event).
//   - Version gap detection fires `onNeedsSnapshot`.

import { describe, it, expect, vi } from 'vitest';
import { GameStore } from '../GameStore';
import type { GameState } from '../../types/GameState';
import { DangerLevel, GamePhase, ZombieType } from '../../types/GameState';
import type { GameEvent } from '../../types/Events';

function makeMinimalState(): GameState {
  return {
    id: 'r',
    seed: [1, 2, 3, 4],
    version: 0,
    turn: 0,
    phase: GamePhase.Players,
    currentDangerLevel: DangerLevel.Blue,
    lobby: { players: [] },
    spectators: [],
    players: ['p1'],
    activePlayerIndex: 0,
    firstPlayerTokenIndex: 0,
    survivors: {
      s1: {
        id: 's1',
        playerId: 'p1',
        name: 's1',
        characterClass: 'Wanda',
        actionsPerTurn: 3,
        maxHealth: 2,
        wounds: 0,
        experience: 0,
        dangerLevel: DangerLevel.Blue,
        skills: [],
        inventory: [],
        actionsRemaining: 3,
        hasMoved: false,
        hasSearched: false,
        freeMovesRemaining: 0,
        freeSearchesRemaining: 0,
        freeCombatsRemaining: 0,
        toughUsedZombieAttack: false,
        toughUsedFriendlyFire: false,
        freeMeleeRemaining: 0,
        freeRangedRemaining: 0,
        sprintUsedThisTurn: false,
        chargeUsedThisTurn: false,
        bornLeaderUsedThisTurn: false,
        position: { x: 0, y: 0, zoneId: 'z1' },
      },
    },
    zombies: {},
    zones: {},
    objectives: [],
    equipmentDeck: [],
    equipmentDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    noiseTokens: 0,
    config: {
      maxSurvivors: 6,
      abominationFest: false,
      zombiePool: {
        [ZombieType.Walker]: 40,
        [ZombieType.Runner]: 16,
        [ZombieType.Brute]: 16,
        [ZombieType.Abomination]: 4,
      },
    },
    nextZombieId: 1,
  };
}

describe('GameStore — version & freeze discipline (§3.4, §3.8)', () => {
  it('applyEvents bumps version once per batch, not per event', () => {
    const store = new GameStore(makeMinimalState());
    // Seed to v=0, next accepted frame is v=1. Apply a batch of THREE
    // events with v=1 — version must end at 1, not 3.
    const events: GameEvent[] = [
      { type: 'SURVIVOR_MOVED', survivorId: 's1', fromZoneId: 'z1', toZoneId: 'z2' },
      { type: 'SURVIVOR_WOUNDED', survivorId: 's1', amount: 0, source: 'zombie' },
      { type: 'NOISE_GENERATED', zoneId: 'z1', amount: 1, newTotal: 1 },
    ];
    store.applyEvents(1, events);
    expect(store.state.version).toBe(1);
  });

  it('detects version gaps and fires onNeedsSnapshot', () => {
    const initial = makeMinimalState();
    initial.version = 5;
    const store = new GameStore(initial);
    const spy = vi.fn();
    store.onNeedsSnapshot = spy;

    // Next accepted frame should be v=6; ship v=8 instead (gap).
    store.applyEvents(8, [
      { type: 'SURVIVOR_MOVED', survivorId: 's1', fromZoneId: 'z1', toZoneId: 'z2' },
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    // State should NOT have moved on gap — the snapshot will reconcile.
    expect(store.state.survivors.s1.position.zoneId).toBe('z1');
    expect(store.state.version).toBe(5);
  });

  it('replayEventsForListenersOnly fans events to subscribers without mutating state', () => {
    const initial = makeMinimalState();
    initial.version = 10;
    const store = new GameStore(initial);
    const eventsSeen: GameEvent[] = [];
    store.subscribeEvents((e) => eventsSeen.push(e));

    store.replayEventsForListenersOnly([
      {
        v: 9,
        events: [
          { type: 'SURVIVOR_MOVED', survivorId: 's1', fromZoneId: 'z1', toZoneId: 'z99' },
        ],
      },
    ]);

    // Version unchanged, position unchanged — state-mutating dispatch NOT run.
    expect(store.state.version).toBe(10);
    expect(store.state.survivors.s1.position.zoneId).toBe('z1');
    // Listener still saw the event (for animation replay).
    expect(eventsSeen).toHaveLength(1);
    expect(eventsSeen[0].type).toBe('SURVIVOR_MOVED');
  });

  it('SNAPSHOT → tail replay does NOT infinite-loop via onNeedsSnapshot', () => {
    // Reviewer concern #1: the old path called `applyEvents(tail.v, ...)`
    // AFTER setting state.version to the snapshot's (later) v. Each tail
    // event with v ≤ prevVersion would fire the gap check → snapshot spam.
    // `replayEventsForListenersOnly` is the fix — state is authoritative,
    // tail fans out only. This test confirms no snapshot request occurs.
    const initial = makeMinimalState();
    initial.version = 20;
    const store = new GameStore(initial);
    const spy = vi.fn();
    store.onNeedsSnapshot = spy;
    store.replayEventsForListenersOnly([
      {
        v: 15,
        events: [{ type: 'SURVIVOR_MOVED', survivorId: 's1', fromZoneId: 'z1', toZoneId: 'z2' }],
      },
      {
        v: 18,
        events: [{ type: 'SURVIVOR_MOVED', survivorId: 's1', fromZoneId: 'z1', toZoneId: 'z2' }],
      },
    ]);
    expect(spy).not.toHaveBeenCalled();
  });
});
