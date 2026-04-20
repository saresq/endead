# 05 — Optimistic Client for Tier-1 Actions (Step 6)

Source: `analysis/SwarmComms.md` §3.3, §3.3.2, §3.8, Step 6, D10, D20.

## Scope

Add client-side optimistic prediction for a narrow Tier-1 whitelist. Predict → snapshot touched subtree → apply → send → confirm-or-rollback. Snapshot-only rollback (D20 — strike "inverse events" language from §3.8).

Non-goals: Tier 2/3 actions (ATTACK, SEARCH, SPRINT, OPEN_DOOR, everything during zombie phase); animation carve-outs for ATTACK (separate follow-up).

## Preconditions

`04-broadcast-events-and-redaction.md` reviewed, deleted, checkbox flipped.

## Work items

### A. Whitelist (§3.3.2 narrowed)

Only these action types are optimistic:
- `MOVE` (depth-1 adjacent only; depth-2 via plus-1-zone-per-move skill is NOT optimistic pending parity review)
- `RELOAD`
- `ORGANIZE`
- `END_TURN`
- `CHOOSE_SKILL` — BUT suppress while any pending event exists (D10)
- `PROPOSE_TRADE` / `UPDATE_TRADE_OFFER` — UI-only offers; confirmation requires both players

Explicit non-optimistic: `ATTACK`, `SEARCH`, `RESOLVE_SEARCH`, `SPRINT`, `OPEN_DOOR`, `CONFIRM_TRADE`, `ASSIGN_FRIENDLY_FIRE`, `DISTRIBUTE_ZOMBIE_WOUNDS`, `REROLL_LUCKY`, MOVE depth-2, anything during Zombie phase.

### B. `NetworkManager.sendAction` augmentation

1. `sendAction(intent)` gains an `optimisticApply(intent)` call BEFORE the WS send if the intent type is whitelisted.
2. `optimisticApply`:
   - Generate predicted events locally using existing `InputController` helpers:
     - `getValidMoveZones` (`InputController.ts:277`) for MOVE
     - `getValidAttackZones` (`:411`) — NOT used here (attacks non-optimistic)
     - `getMoveCostForZone` (`:259`) — AP cost
   - Tag each event with `pending: actionId` (new optional field on event).
   - Push through `gameStore.applyEvent` so UI updates this frame.
   - Save a reversal snapshot — path-targeted clone of ONLY the touched subtree (e.g. `{ survivorId: clone(state.survivors[sid]) }`). Not full state.
3. On server confirmation (`EVENTS` with matching `actionId`): drop the pending tag; discard the snapshot.
4. On `ERROR`: reverse-apply the snapshot (restore the touched subtree); surface the reason inline (toast / banner).

### C. D10 — pending-skill suppression

- `CHOOSE_SKILL` optimistic? Yes by whitelist. BUT: while ANY skill-effect-bearing pending action exists (including another pending `CHOOSE_SKILL`), suppress NEW optimism on Tier-1 actions that read `survivor.skills` (MOVE, SPRINT validators, etc.).
- Implementation: `OptimisticStore.hasPendingSkillEffect(): boolean` — true while any queued optimistic event could change skill set. When true, `sendAction` sends non-optimistically (awaits server).
- Test: pick a Tier-1 skill (e.g., `plus_1_zone_per_move`) → immediately attempt a MOVE → MOVE is NOT optimistic until CHOOSE_SKILL confirms.

### D. D20 — snapshot-only rollback

§3.8 and Step 6 must agree on a single rollback mechanism. Strike "inverse events" from §3.8 language in code comments; use snapshot-only everywhere. Rationale: whitelist is narrow enough that touched subtrees are ≤ 200 bytes each; snapshot is trivially cheap.

### E. Client-side validator parity check

Before shipping each whitelisted action's optimism, run a one-time parity test comparing client predictor to server handler output on a suite of states:
- 50 randomly generated states × each whitelisted action type × expected server result → client predictor must match.
- If a divergence exists, REMOVE that action from the whitelist and document why.

## Gameplay invariants that MUST hold

1. **All gameplay identical** when the network is fast — optimism is invisible to a low-latency user.
2. **High-latency feel**: whitelisted actions show 1-frame response regardless of RTT.
3. **Server authority**: on any reject, the UI snaps back to server-true state within 2 frames.
4. **Non-whitelisted actions still wait for the server** — an ATTACK still shows a spinner / "rolling..." tactile feedback but no outcome until the server responds.
5. **Optimistic MOVE depth-2 never happens** — validator must check adjacency first, refuse to optimistically predict depth-2.
6. **`CHOOSE_SKILL` followed by MOVE** — MOVE waits for server confirmation of the skill choice (D10).
7. **Rollback correctness**: after snapshot restore, state is byte-identical to pre-action state. Test: predict → reject → compareStates.
8. **No cascade**: one reject doesn't roll back independent actions. Actions have distinct `actionId`s.

## Verification

- `npm test` — green. New tests for optimistic apply + rollback + D10 suppression + parity.
- Manual: simulate latency (Chrome DevTools throttle → 200 ms RTT). Whitelisted actions feel instant. ATTACK has the expected spinner.
- Manual: force a server reject (e.g., move to invalid zone by race condition, or engineer a test hook) → UI snaps back, error toast shows.
- Manual: pick a Tier-1 skill + immediately move — MOVE waits for skill confirmation (D10).
- Manual: full round with all features enabled — no divergence.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms Step 6 optimism. Do NOT rubber-stamp. Optimism corrupts UI when wrong — assume there's a divergence case you haven't hit yet.
>
> Required checks:
> 1. **Whitelist scope**: read `sendAction` / `optimisticApply`. Only the 7 whitelisted action types trigger optimism. Any wider set is a FAIL.
> 2. **Non-whitelist rejections**: for every non-whitelisted action in the list (ATTACK, SEARCH, SPRINT, OPEN_DOOR, CONFIRM_TRADE, ASSIGN_FRIENDLY_FIRE, DISTRIBUTE_ZOMBIE_WOUNDS, REROLL_LUCKY, MOVE depth-2), trace the path — is the code explicitly dispatching to server-wait?
> 3. **Depth-1 enforcement for MOVE**: read the predictor. If the target zone is adjacent (depth 1), predict. If depth 2 (plus_1_zone_per_move skill), do NOT predict. Is there a test for each case?
> 4. **`actionId` tagging**: every optimistic event carries `pending: actionId`. Confirmation by the server includes the same `actionId`. Is there a collision-free ID generator (UUID or monotonic)?
> 5. **Snapshot scope**: on optimistic apply, a path-targeted snapshot is saved. Grep `structuredClone(state)` — full-state clones are FORBIDDEN on the optimistic path. Only the touched subtree.
> 6. **D10 — pending-skill suppression**: trace `OptimisticStore.hasPendingSkillEffect`. Is it checked by every Tier-1 action that reads `survivor.skills`? Test: pick `plus_1_zone_per_move` optimistically, immediately attempt MOVE — is the MOVE sent non-optimistically until the skill confirms?
> 7. **D20 — snapshot-only**: grep client for "inverse event" language or any inverse-apply path. Should be zero.
> 8. **Rollback correctness**: run the reversal test. After snapshot restore, `compareStates(pre, post)` equal.
> 9. **Validator parity**: is there a test suite comparing client predictor vs server handler on N states? If not, the whitelist is untested — FAIL.
> 10. **UI on reject**: does the error toast show the server's `reason`? Is the snap-back animation decent or jarring? If no UI, mark "DID NOT VERIFY".
> 11. **Optimistic cascade**: two in-flight optimistic actions with distinct `actionId`s. Reject one. The other must NOT roll back.
> 12. `npm test` green.
> 13. Gameplay invariants #1-8: name the code path for each.
>
> Output format:
> - `VERDICT: PASS` or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant
> - `DID NOT VERIFY:` unreachable items (browser-only UX)

On PASS: delete this file; flip the checkbox; append Progress Log entry; note the SwarmComms rollout is complete in `README.md`.
On FAIL: loop until PASS.
