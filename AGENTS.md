# Endead — Project Directives

## Git & commits

- **Do not commit or push.** Only create commits when the user explicitly asks ("commit this", "make a commit", etc.). Finishing a task, passing tests, or wrapping up a phase does NOT authorize a commit.
- Do not run `git push`, `git push --force`, `git reset --hard`, `git commit --amend`, or `git rebase` without an explicit request for that specific action.
- Develop → report → wait for the user to ask for a commit.

## Testing

- Unit tests live under `src/**/__tests__/` and run via `npm test` (Vitest).
- Standalone scripts under `src/tests/` are legacy — do not convert them to Vitest unless asked.

## RNG

- Use `src/services/Rng.ts` (xoshiro128**) for every random draw. Never import `Math.random` into gameplay code.
- `GameState.seed` is a 4×uint32 tuple (`RngState`). Serialize as JSON; never parse/format as a string.
- Attack dice go through `src/services/CombatDice.ts` (`rollAttack`, `applyLuckyReroll`). Do not call `Rng.rollD6` directly from combat code — the pipeline enforces the accuracy clamp and reroll ordering.
