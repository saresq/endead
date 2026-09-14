import { describe, it, expect } from 'vitest';
import { visibleZones } from '../LineOfSight';
import { makeGridState, edgeKey } from './gridFixture';
import { makeState } from './winConditionHelpers';

describe('visibleZones', () => {
  it('sees along a straight street with range per zone crossed', () => {
    const state = makeGridState({ rows: ['a b c'] });
    const seen = visibleZones(state, 'a');
    expect(seen.get('a')).toBe(0);
    expect(seen.get('b')).toBe(1);
    expect(seen.get('c')).toBe(2);
    expect(visibleZones(state, 'c').get('a')).toBe(2);
  });

  it('does not see around a corner', () => {
    const state = makeGridState({ rows: ['a b', '. c'] });
    expect(visibleZones(state, 'a').has('c')).toBe(false);
    expect(visibleZones(state, 'c').has('a')).toBe(false);
  });

  it('is blocked by a closed door and passes an open one', () => {
    const edges = { [edgeKey(0, 0, 1, 0)]: 'door' as const };
    const closed = makeGridState({ rows: ['a b c'], edges });
    expect(visibleZones(closed, 'a').has('b')).toBe(false);
    expect(visibleZones(closed, 'c').has('a')).toBe(false);

    const open = makeGridState({ rows: ['a b c'], edges, openDoors: ['a|b'] });
    expect(visibleZones(open, 'a').get('c')).toBe(2);
  });

  it('is blocked by a wall segment even when the zones connect elsewhere', () => {
    // a and b touch on two edges; the lower one is a wall. Only the lower row
    // lines up with c.
    const state = makeGridState({
      rows: ['a b .', 'a b c'],
      edges: { [edgeKey(0, 1, 1, 1)]: 'wall' },
    });
    expect(visibleZones(state, 'a').get('b')).toBe(1);
    expect(visibleZones(state, 'a').has('c')).toBe(false);
    expect(visibleZones(state, 'b').get('c')).toBe(1);
  });

  it('sees one zone into a building from the street', () => {
    const state = makeGridState({
      rows: ['s2 s A B'],
      buildings: ['A', 'B'],
      edges: { [edgeKey(1, 0, 2, 0)]: 'doorway', [edgeKey(2, 0, 3, 0)]: 'doorway' },
    });
    const fromStreet = visibleZones(state, 's2');
    expect(fromStreet.get('A')).toBe(2);
    expect(fromStreet.has('B')).toBe(false);
  });

  it('sees one zone from building to building and unlimited out to the street', () => {
    const state = makeGridState({
      rows: ['s2 s A B'],
      buildings: ['A', 'B'],
      edges: { [edgeKey(1, 0, 2, 0)]: 'doorway', [edgeKey(2, 0, 3, 0)]: 'doorway' },
    });
    const fromA = visibleZones(state, 'A');
    expect(fromA.get('B')).toBe(1);
    expect(fromA.get('s')).toBe(1);
    expect(fromA.get('s2')).toBe(2);

    const fromB = visibleZones(state, 'B');
    expect(fromB.get('A')).toBe(1);
    expect(fromB.has('s')).toBe(false);
  });

  it('throws when zone geometry is missing', () => {
    expect(() => visibleZones(makeState(), 'z1')).toThrow('Missing zone geometry');
  });
});
