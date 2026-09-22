import { describe, it, expect } from 'vitest';
import { openableDoorZones, openableDoorEdges, doorEdgeKey } from '../utils/doorTargets';
import { GameState } from '../../types/GameState';

/**
 * Minimal state: the selectors only read players/activePlayerIndex/survivors/zones.
 */
function makeState(opts: {
  activePlayerIndex?: number;
  actionsRemaining?: number;
  inventory?: Array<{ id: string; inHand: boolean; canOpenDoor?: boolean }>;
  connections?: Array<{ toZoneId: string; hasDoor: boolean; doorOpen: boolean }>;
} = {}): GameState {
  const {
    activePlayerIndex = 0,
    actionsRemaining = 3,
    inventory = [{ id: 'crowbar-1', inHand: true, canOpenDoor: true }],
    connections = [{ toZoneId: 'B', hasDoor: true, doorOpen: false }],
  } = opts;

  return {
    players: ['p1', 'p2'],
    activePlayerIndex,
    survivors: {
      s1: {
        id: 's1',
        playerId: 'p1',
        position: { zoneId: 'A' },
        actionsRemaining,
        inventory,
      },
    },
    zones: {
      A: { id: 'A', connections },
      B: { id: 'B', connections: [{ toZoneId: 'A', hasDoor: true, doorOpen: false }] },
    },
  } as unknown as GameState;
}

describe('openableDoorZones', () => {
  it('lists zones behind a closed door when an opener is in hand', () => {
    expect(openableDoorZones(makeState(), 's1', 'p1')).toEqual(['B']);
  });

  it('is empty without a survivor selected', () => {
    expect(openableDoorZones(makeState(), null, 'p1')).toEqual([]);
  });

  it('is empty when it is not the local player turn', () => {
    expect(openableDoorZones(makeState({ activePlayerIndex: 1 }), 's1', 'p1')).toEqual([]);
  });

  it('is empty for a survivor the local player does not control', () => {
    expect(openableDoorZones(makeState(), 's1', 'p2')).toEqual([]);
  });

  it('is empty with no actions left', () => {
    expect(openableDoorZones(makeState({ actionsRemaining: 0 }), 's1', 'p1')).toEqual([]);
  });

  it('is empty when the opener is in the backpack', () => {
    const state = makeState({ inventory: [{ id: 'crowbar-1', inHand: false, canOpenDoor: true }] });
    expect(openableDoorZones(state, 's1', 'p1')).toEqual([]);
  });

  it('is empty when the card in hand cannot open doors', () => {
    const state = makeState({ inventory: [{ id: 'pistol-1', inHand: true }] });
    expect(openableDoorZones(state, 's1', 'p1')).toEqual([]);
  });

  it('skips doors already open and plain connections', () => {
    const state = makeState({
      connections: [
        { toZoneId: 'B', hasDoor: true, doorOpen: true },
        { toZoneId: 'C', hasDoor: false, doorOpen: false },
      ],
    });
    expect(openableDoorZones(state, 's1', 'p1')).toEqual([]);
  });

  it('narrows to the armed card when one is given', () => {
    const state = makeState({
      inventory: [
        { id: 'crowbar-1', inHand: true, canOpenDoor: true },
        { id: 'pistol-1', inHand: true },
      ],
    });
    expect(openableDoorZones(state, 's1', 'p1', 'crowbar-1')).toEqual(['B']);
    expect(openableDoorZones(state, 's1', 'p1', 'pistol-1')).toEqual([]);
  });
});

describe('openableDoorEdges', () => {
  it('keys each door by its two zones, order-independent', () => {
    expect(openableDoorEdges(makeState(), 's1', 'p1')).toEqual([doorEdgeKey('A', 'B')]);
    expect(doorEdgeKey('B', 'A')).toBe(doorEdgeKey('A', 'B'));
  });

  it('is empty when no door is openable', () => {
    expect(openableDoorEdges(makeState({ actionsRemaining: 0 }), 's1', 'p1')).toEqual([]);
  });
});
