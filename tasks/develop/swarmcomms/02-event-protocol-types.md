# 02 — Define the Event Wire Protocol (Types Only)

Source: `analysis/SwarmComms.md` §3.1, §3.2, §3.3.1, §A + Step 2 (§4).

## Scope

Define the event wire types. **Types only — no runtime usage yet.** This task ends with `tsc` green and the types imported nowhere. Step 3 will start actually emitting these.

Non-goals: any handler changes; any broadcast changes; any client changes beyond importing types if needed.

## Preconditions

`01-strip-persistence.md` reviewed, deleted, and checkbox flipped.

## Work items

1. **New file: `src/types/Events.ts`** — discriminated union of all event kinds per analysis §3.2. The union must cover:
   - **SURVIVOR**: `SURVIVOR_MOVED`, `SURVIVOR_SPRINTED`, `SURVIVOR_WOUNDED`, `SURVIVOR_HEALED`, `SURVIVOR_DIED`, `SURVIVOR_XP_GAINED`, `SURVIVOR_DANGER_LEVEL_CHANGED`, `SURVIVOR_SKILL_ELIGIBLE`, `SURVIVOR_SKILL_CHOSEN`, `SURVIVOR_FREE_ACTION_CONSUMED`, `SURVIVOR_ACTIONS_REMAINING_CHANGED`.
   - **COMBAT**: `ATTACK_ROLLED`, `ATTACK_REROLLED` (with scoped `PARTIAL_SNAPSHOT` — see §3.3.1), `MOLOTOV_DETONATED`, `FRIENDLY_FIRE_PENDING`, `FRIENDLY_FIRE_ASSIGNED`, `WEAPON_RELOADED`, `WEAPON_FIRED_NOISE`.
   - **ZOMBIE**: `ZOMBIE_SPAWNED`, `ZOMBIE_MOVED`, `ZOMBIE_BATCH_MOVED` (§A — zombie-phase batching), `ZOMBIE_ATTACKED_ZONE`, `ZOMBIE_WOUNDS_PENDING`, `ZOMBIE_WOUNDS_DISTRIBUTED`, `ZOMBIE_DOOR_BROKEN`, `ZOMBIE_KILLED`, `ZOMBIE_ACTIVATED`, `ZOMBIE_EXTRA_ACTIVATION_TRIGGERED`.
   - **BOARD**: `DOOR_OPENED`, `ZONE_SPAWNED`, `ZONE_SPAWN_POINT_ACTIVATED`, `NOISE_GENERATED`, `NOISE_CLEARED`.
   - **OBJECTIVE**: `OBJECTIVE_TAKEN`, `OBJECTIVE_PROGRESS_UPDATED`, `OBJECTIVE_COMPLETED`, `EPIC_CRATE_OPENED`.
   - **DECK**: `CARD_DRAWN` (private), `CARD_DRAWN_HIDDEN` (public redaction), `CARD_EQUIPMENT_RESOLVED`, `EQUIPMENT_EQUIPPED`, `EQUIPMENT_REORGANIZED`, `EQUIPMENT_DISCARDED`, `DECK_SHUFFLED` (payload: `{ deckSize, discardSize }` ONLY), `SPAWN_CARDS_DRAWN`, `SPAWN_DECK_REINITIALIZED`.
   - **TURN**: `TURN_STARTED`, `ACTIVE_PLAYER_CHANGED`, `ZOMBIE_PHASE_STARTED`, `ROUND_ENDED`.
   - **TRADE**: `TRADE_SESSION_STARTED`, `TRADE_OFFER_UPDATED` (private), `TRADE_OFFER_UPDATED_HIDDEN` (public), `TRADE_ACCEPTED`, `TRADE_CANCELLED`.
   - **GAME**: `GAME_STARTED`, `GAME_ENDED`, `GAME_RESET`, `DANGER_LEVEL_GLOBAL_CHANGED`.
   - **LOBBY**: `LOBBY_PLAYER_JOINED`, `LOBBY_PLAYER_LEFT`, `LOBBY_CHARACTER_SELECTED`, `LOBBY_NICKNAME_UPDATED`, `LOBBY_PLAYER_KICKED`.

   Each event is an object literal with a `type: '<NAME>'` discriminator and typed payload. Payloads reference existing types (`EntityId`, `ZoneId`, `SurvivorId`, etc.) from `GameState.ts`.

2. **`ATTACK_REROLLED` payload shape** — define explicitly per §3.3.1:
   ```ts
   {
     type: 'ATTACK_REROLLED';
     shooterId: SurvivorId;
     originalDice: number[];
     newDice: number[];
     patch: {
       zombies: Record<EntityId, Zombie>;         // FULL map, overwrite semantics
       survivors: Record<SurvivorId, Survivor>;   // FULL map
       objectives: Objective[];
       noiseTokens: number;
       zoneNoise: Record<ZoneId, number>;
       equipmentDeckCount: number;   // count only — NEVER contents
       equipmentDiscardCount: number;
     };
     followupEvents: GameEvent[];   // ATTACK_ROLLED for reroll + kill chain
   }
   ```

3. **`DECK_SHUFFLED` payload** — `{ deckSize: number; discardSize: number }` only. Comment inline: "Never include the shuffled order — `projectForSocket` keeps the seed server-side, so the client couldn't reproduce the order anyway; this is the payload-level corollary of that invariant (§D13)."

4. **New file: `src/types/Wire.ts`** — envelope union:
   ```ts
   type WireMessage =
     | { type: 'EVENTS'; v: number; events: GameEvent[] }
     | { type: 'SNAPSHOT'; v: number; state: ClientGameState; tail: Array<{ v: number; events: GameEvent[] }> }
     | { type: 'ERROR'; v: number; actionId: string; reason: string };
   ```
   `ClientGameState` is also declared here as an exported type alias (fleshed out in Step 4 — for now, type it as `Omit<GameState, 'seed' | '_attackIsMelee' | '_extraAPCost' | 'history'> & { version: number }` with a TODO).

5. **`GameState.version: number`** — add to `GameState` interface in `src/types/GameState.ts`; initialize to `0` in `initialGameState` (`src/services/...` wherever the factory is).

6. **Do NOT wire any of these into the runtime yet.** The types compile; no emit, no broadcast, no client consumer. That's Step 3+.

## Gameplay invariants that MUST hold

1. **Zero behavior change** — game plays identically after this task; the types are dormant.
2. **TS compile clean** — `tsc` (or equivalent) reports zero errors.
3. **`version: 0`** in every new game; no code reads it yet.
4. **Existing tests green** — no handler or test touches events.

## Verification

- `npm test` — green.
- `tsc --noEmit` (or the project's typecheck command) — zero errors.
- Grep for `from '.*/types/Events'` — should match zero runtime files (only `Wire.ts`, possibly a test).
- Manual: start a game, play a turn, confirm identical behavior to pre-task.

## Review protocol

Spawn a **skeptical gameplay-integrity reviewer** subagent with this brief:

> You are a skeptical gameplay-integrity reviewer for Endead SwarmComms Step 2. Do NOT rubber-stamp.
>
> Required checks:
> 1. `src/types/Events.ts` exists and the discriminated union covers every event kind from analysis §3.2. Count the kinds; cross-reference §3.2's enumeration. If any listed event is missing, FAIL.
> 2. `ATTACK_REROLLED.patch.equipmentDeck` — is it `equipmentDeckCount: number`, NOT `EquipmentCard[]`? Leaking the deck order is a cheat surface.
> 3. `DECK_SHUFFLED` payload — `{ deckSize, discardSize }` ONLY. No card arrays.
> 4. `CARD_DRAWN_HIDDEN` exists alongside `CARD_DRAWN` — public redaction variant is defined.
> 5. `TRADE_OFFER_UPDATED_HIDDEN` exists alongside `TRADE_OFFER_UPDATED`.
> 6. `src/types/Wire.ts` exists with the three-message envelope.
> 7. `GameState.version: number` added; initialized to 0 in the factory.
> 8. Grep: types are NOT imported into any runtime file yet (handlers, server, client logic). If any import exists, FAIL.
> 9. `npm test` green; typecheck green.
>
> Output format:
> - `VERDICT: PASS` or `VERDICT: FAIL`
> - `CONCERNS:` numbered; `file:line` + concern + invariant
> - `DID NOT VERIFY:` unreachable items

On PASS: delete this file; flip the checkbox; append Progress Log entry.
On FAIL: loop until PASS.
