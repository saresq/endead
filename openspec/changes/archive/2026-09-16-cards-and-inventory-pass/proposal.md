## Why

`RULES-REVIEW.md` §3 lists six open bugs in cards, skills and inventory: `S1`, `S2`, `S3`, `S6`, `S7`, `S8`. Three of them lose or corrupt game state rather than merely deviating from a rule — a multi-card search silently drops cards into nowhere, starting equipment and Epic cards get reshuffled into the Equipment deck they should never enter, and Hold your nose writes to a stale survivor object, overwriting XP the player just earned.

The review's §5 table shows why these belong in one change: a single `resolveDrawnCard` fixes `S1` and `S2` together, and a single discard helper fixes `S3`. Doing them separately means writing the same logic three times, which is how they diverged in the first place.

## What Changes

- **A multi-card search no longer loses cards.** When a draw overflows the inventory, the remaining drawn cards go somewhere real instead of vanishing on a `break`. (`S1`)
- **Aaahh!! behaves the same everywhere it can be drawn.** It spawns a Walker and stops the search, whether it came from a search, an Epic crate, or Hold your nose — today the last two put `aaahh_epic` into the player's inventory as if it were equipment. (`S2`)
- **Discard piles stop mixing.** Starting equipment never re-enters the Equipment deck, and Epic cards go to the Epic discard. (`S3`)
- **Hold your nose stops eating the XP it just granted.** The survivor object is re-read after `addXP` replaces it, the way Hit & Run already does. (`S6`)
- **Trades are validated.** Both resulting inventories must be legal — at most two hands, at most five cards, no two cards in one slot — and the partner must be alive. `validateLoadout` exists and is called from nowhere. (`S7`)
- **Discarding is free and reorganising costs one action for any number of moves**, instead of one action per card moved, two for a swap, and an action plus your own turn to discard. (`S8`)
- **One `resolveDrawnCard`** used by search, Epic crate and Hold your nose; **one discard helper** routing by card id prefix; **an action cost table** in `ActionProcessor` replacing the if/else chain, which is what makes `S8` a data change rather than new branches.
- **Dead code goes**: the `moveCardToSlot` DISCARD branch and the empty `TRADE_*` branch the cost table replaces.

Not in this change: combat (`B1`–`B10`), which lands first, and the rule deviations (`D1`–`D11`), which follow.

## Capabilities

### New Capabilities
- `card-draw-resolution`: what happens to a drawn card — kept, overflowed, or an Aaahh!! — wherever it is drawn.
- `discard-routing`: which pile a discarded card goes to, and which piles feed which deck on reshuffle.
- `inventory-actions`: what discarding, reorganising and trading cost, and what makes a resulting inventory legal.

### Modified Capabilities

(none; `openspec/specs/` holds no archived specs.)

## Impact

- `src/services/handlers/ItemHandlers.ts`: search draw and overflow (`:131-135`), Aaahh!! (`:93-100`), `handleResolveSearch` (`:162`).
- `src/services/handlers/EpicCrateHandlers.ts:58-64`, `src/services/handlers/CombatHandlers.ts:414-432`: both route through the shared draw resolution.
- `src/services/EquipmentManager.ts`: `swapDrawnCard` (`:120`), `discardCard` (`:91`) fold into the discard helper.
- `src/services/handlers/handlerUtils.ts:39`, `src/services/ZombiePhaseManager.ts:186`, `src/services/DeckService.ts:94`: discard and reshuffle honour the routing.
- `src/services/handlers/TradeHandlers.ts:107`: call `validateLoadout` and check partner liveness.
- `src/services/ActionProcessor.ts:212-222`: action cost table; discard free; reorganise as a free session for one action, like trade.
- `src/client/`: reorganise session and free discard in the inventory UI; Spanish strings for any new message.
- Vitest per capability. Net code should shrink.
- No new dependencies. No change to combat or the zombie phase.
