// src/services/__tests__/assertValidationIsPure.ts
//
// SwarmComms §3.10 rule 1 enforcement (work item G).
// Runs each `failingInputs[]` against the handler and asserts the resulting
// state is structurally identical to the pre-throw snapshot. If a handler
// performs any state mutation OR collector emit before the throw, this
// helper fails — that's a §3.10 violation under mutation-in-place.

import { expect } from 'vitest';
import type { GameState } from '../../types/GameState';
import type { ActionRequest } from '../../types/Action';
import { EventCollector } from '../EventCollector';

export function assertValidationIsPure(
  handler: (state: GameState, intent: ActionRequest, collector: EventCollector) => void,
  baseState: GameState,
  failingInputs: ActionRequest[],
): void {
  for (const input of failingInputs) {
    // Deep-clone the base state per case so a successful throw from one input
    // doesn't pollute later cases.
    const before = JSON.parse(JSON.stringify(baseState)) as GameState;
    const subject = JSON.parse(JSON.stringify(baseState)) as GameState;
    const collector = new EventCollector();

    expect(
      () => handler(subject, input, collector),
      `expected handler to throw for input ${JSON.stringify(input)}`,
    ).toThrow();

    // 1. State must be structurally identical to before — no mid-handler mutation leaked.
    expect(subject, `state mutated before throw for input ${JSON.stringify(input)}`).toStrictEqual(before);

    // 2. Collector must be empty — no event emitted before throw.
    expect(collector.drain(), `events emitted before throw for input ${JSON.stringify(input)}`).toEqual([]);

    // 3. Scratch (collector.attackIsMelee / extraAPCost) must be unset —
    //    they're a "mutation" in spirit (handler→dispatcher channel).
    expect(collector.attackIsMelee, `attackIsMelee scratch leaked before throw for input ${JSON.stringify(input)}`).toBeUndefined();
    expect(collector.extraAPCost, `extraAPCost scratch leaked before throw for input ${JSON.stringify(input)}`).toBeUndefined();
  }
}
