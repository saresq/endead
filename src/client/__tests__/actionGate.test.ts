import { describe, it, expect } from 'vitest';
import { canTakeAction } from '../utils/actionGate';

const base = {
  actionsRemaining: 0,
  freeMovesRemaining: 0,
  freeSearchesRemaining: 0,
  freeCombatsRemaining: 0,
  freeMeleeRemaining: 0,
  freeRangedRemaining: 0,
};

describe('canTakeAction — the action-key gate matches the buttons', () => {
  it('accepts a survivor with action points', () => {
    expect(canTakeAction({ ...base, actionsRemaining: 1 })).toBe(true);
  });

  it('accepts 0 AP with a free search remaining', () => {
    expect(canTakeAction({ ...base, freeSearchesRemaining: 1 })).toBe(true);
  });

  it.each([
    'freeMovesRemaining',
    'freeSearchesRemaining',
    'freeCombatsRemaining',
    'freeMeleeRemaining',
    'freeRangedRemaining',
  ] as const)('accepts 0 AP with %s remaining', key => {
    expect(canTakeAction({ ...base, [key]: 1 })).toBe(true);
  });

  it('rejects 0 AP with no free action of any kind', () => {
    expect(canTakeAction(base)).toBe(false);
  });
});
