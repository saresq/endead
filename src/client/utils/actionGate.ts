// src/client/utils/actionGate.ts
//
// Own module so it can be unit-tested without importing KeyboardManager, which
// pulls NetworkManager and therefore `window`.

/** The action keys are accepted whenever the equivalent button is enabled.
 *  The buttons stay enabled at 0 AP when a free action of any kind remains,
 *  and TurnManager does not end the turn in that state, so the key gate has
 *  to agree. Per-action checks (hasSearched, weapon in hand, …) run after. */
export function canTakeAction(survivor: {
  actionsRemaining: number;
  freeMovesRemaining: number;
  freeSearchesRemaining: number;
  freeCombatsRemaining: number;
  freeMeleeRemaining: number;
  freeRangedRemaining: number;
}): boolean {
  return survivor.actionsRemaining >= 1
    || survivor.freeMovesRemaining > 0
    || survivor.freeSearchesRemaining > 0
    || survivor.freeCombatsRemaining > 0
    || survivor.freeMeleeRemaining > 0
    || survivor.freeRangedRemaining > 0;
}
