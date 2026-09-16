## Context

`RULES-REVIEW.md` §3 is the source. Its guiding principle — the simplest logic that delivers a fully functional game, shared helpers over parallel paths — is the whole shape of this change: three of the six bugs exist because the same operation is written in several places and the copies drifted.

**Source of truth for any rules question that comes up during implementation:** `RULEBOOK.md` first. Where the rulebook does not answer it, official Guillotine Games / CMON material for Zombicide 2nd Edition — the printed component the rulebook points to, the official FAQ, or published errata. A house ruling is a last resort and must be recorded as a decision here, never invented silently in code.

Where the duplication is today:

- **Drawing a card** happens in `ItemHandlers.handleSearch` (`:93-100`, `:131-135`), `EpicCrateHandlers` (`:58-64`) and `CombatHandlers` Hold your nose (`:414-432`). Only the first knows what an Aaahh!! is; the other two file it as equipment.
- **Discarding a card** happens in `EquipmentManager.discardCard` (`:91`), `EquipmentManager.swapDrawnCard` (`:120`), `handleResolveSearch` (`ItemHandlers.ts:162`), `handlerUtils.ts:39` and `ZombiePhaseManager.ts:186`. None of them checks what kind of card it is, so `card-start-*` and `epic-*` all land in `equipmentDiscard` and `DeckService.drawCard:94` reshuffles them into the Equipment deck.
- **Action costs** are an if/else chain in `ActionProcessor.ts:212-222`, which is why `ORGANIZE` charges per move and `DISCARD` demands an action and your own turn.

`fix-critical-rules` already fixed the Hit & Run half of `S6` by re-reading the survivor from state after `addXP`; Hold your nose was left on the stale object.

## Goals / Non-Goals

**Goals:**
- No card is ever lost or duplicated.
- One resolution for a drawn card, one routing for a discard, one table for action costs.
- Inventory rules the server actually enforces.
- Less code than before.

**Non-Goals:**
- Combat (`B1`–`B10`) and rule deviations (`D1`–`D11`); separate passes.
- Redesigning the inventory UI beyond what free discard and a reorganise session need.
- Changing deck contents — that is `D3`, in the deviations pass.
- An undo for reorganise.

## Decisions

### D1. One `resolveDrawnCard`, and `S1` and `S2` stop being two bugs
A single function takes a drawn card and the drawing survivor and returns what happened: kept, offered to the player because the inventory is full, or resolved as an Aaahh!! (spawn a Walker, discard, stop the draw). Search, Epic crate and Hold your nose all call it.

This is the review's own recommendation, and it is what makes `S1` a non-issue rather than a fix: the overflow `break` at `ItemHandlers.ts:131-135` disappears because the caller no longer loops over cards deciding their fate — it asks for each card to be resolved and stops when the resolution says stop.

### D2. Discard routes on the card id prefix
`epic-` goes to the Epic discard, `card-start-` leaves play, everything else goes to the Equipment discard. Prefix matching on the id, not on a new field, because the ids already encode it and adding a `kind` field means migrating every card instance in flight for no extra information.

Alternative considered: a `kind` field on the card definition. Rejected as more data to keep in sync for a rule the id already states. If ids ever stop encoding it, one helper changes.

### D3. An action cost table, so `S8` is data
Replacing the if/else chain at `ActionProcessor.ts:212-222` with a table mapping action type to cost turns `S8` into two table entries: `DISCARD` costs nothing and is allowed off-turn; `ORGANIZE` costs nothing per move. The "one action for any number of moves" part reuses the trade pattern — opening a reorganise session costs the action, moves inside it are free, exactly as trade already works. No new mechanism.

The table also absorbs the empty `TRADE_*` branch the review flags, and the `moveCardToSlot` DISCARD branch becomes dead.

### D4. Trade validation calls the function that already exists
`validateLoadout` is written and called from nowhere (`TradeHandlers.ts:107`). The fix is to call it on both resulting inventories and to check the partner is alive. The review notes that unmapped cards currently default to `BACKPACK_0`; the spec makes that a rejection instead, because a silent default is how an illegal inventory gets created in the first place.

### D5. `S6` is a one-line re-read
`addXP` replaces the survivor object. Hold your nose then calls `EquipmentManager.addCard` on the old reference, overwriting the XP and losing any overflow `drawnCard`. Re-read `newState.survivors[id]` after `addXP`, as Hit & Run now does. Listed separately only because it is easy to miss while restructuring the draw path around it.

## Risks / Trade-offs

- [Prefix matching is stringly-typed and breaks if id conventions change] → One helper owns it and tests cover each prefix, so a convention change is one failing test and one edit.
- [Free discard off-turn lets a player dump cards during someone else's turn] → That is the rule, and it cannot be used to gain tempo since discarding grants nothing.
- [Reorganise as a session changes the inventory UI's interaction model] → It reuses the trade session the UI already implements, so it is a second caller rather than a new pattern.
- [Rejecting trades that previously succeeded may feel like a regression] → Those trades were producing illegal inventories. The rejection message must say which rule failed, or it will read as a bug.
- [Routing changes what the Equipment deck contains on reshuffle, altering draw odds mid-game] → Games live in memory and a deploy restart clears them, so no game straddles the change.

## Migration Plan

1. `resolveDrawnCard` with the three callers moved onto it. Fixes `S1` and `S2`.
2. The discard routing helper and its callers. Fixes `S3`.
3. `S6` re-read, alongside the Hold your nose caller from step 1.
4. Action cost table, free discard, reorganise session. Fixes `S8`.
5. Trade validation. Fixes `S7`.

No persisted state to migrate; rooms are in memory.

## Open Questions

None.
