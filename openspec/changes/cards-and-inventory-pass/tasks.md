## 1. One draw resolution (S1, S2)

- [ ] 1.1 `resolveDrawnCard(state, survivorId, card)` returning kept / offered-on-overflow / aaahh-stop, spawning the Walker and discarding on Aaahh!!
- [ ] 1.2 Move `ItemHandlers.handleSearch` onto it; delete the overflow `break` at `:131-135`
- [ ] 1.3 Move `EpicCrateHandlers:58-64` onto it, so `aaahh_epic` can no longer enter an inventory
- [ ] 1.4 Move Hold your nose (`CombatHandlers.ts:414-432`) onto it
- [ ] 1.5 S6: re-read `newState.survivors[id]` after `addXP` in Hold your nose, as Hit & Run does
- [ ] 1.6 Tests: two-card search with one free slot loses nothing; Aaahh!! from search stops the second draw; Aaahh!! from Epic crate and from Hold your nose each spawn a Walker and enter no inventory; card totals conserved across every path; Hold your nose on a levelling kill keeps the XP

## 2. One discard routing (S3)

- [ ] 2.1 Discard helper routing by card id prefix: `epic-` to the Epic discard, `card-start-` out of play, everything else to the Equipment discard
- [ ] 2.2 Route every caller through it: `EquipmentManager.discardCard:91`, `EquipmentManager.swapDrawnCard:120`, `ItemHandlers.handleResolveSearch:162`, `handlerUtils.ts:39`, `ZombiePhaseManager.ts:186`
- [ ] 2.3 Confirm `DeckService.drawCard:94` reshuffle can no longer pull starting or Epic cards into the Equipment deck
- [ ] 2.4 Tests: each prefix routes correctly; a reshuffled Equipment deck contains no `card-start-` or `epic-` card

## 3. Action costs (S8)

- [ ] 3.1 Replace the if/else chain at `ActionProcessor.ts:212-222` with an action cost table; absorb the empty `TRADE_*` branch
- [ ] 3.2 Discard costs nothing and is allowed off-turn and at zero action points
- [ ] 3.3 Reorganise opens a free session for one action, reusing the trade session pattern; moves inside it cost nothing
- [ ] 3.4 Client: free discard and the reorganise session in the inventory UI; Spanish strings in `src/strings/es/`
- [ ] 3.5 Delete the now-dead `moveCardToSlot` DISCARD branch
- [ ] 3.6 Tests: three moves plus a swap in one reorganise cost one action total; discard at zero AP succeeds

## 4. Trade validation (S7)

- [ ] 4.1 Call `validateLoadout` on both resulting inventories in `TradeHandlers.ts:107`
- [ ] 4.2 Reject a trade whose partner is not alive
- [ ] 4.3 Reject a payload that does not say where a card goes, instead of defaulting to `BACKPACK_0`
- [ ] 4.4 Rejection message names the rule that failed; Spanish string added
- [ ] 4.5 Tests: overfull hand rejected; more than five cards rejected; two cards in one slot rejected; dead partner rejected; legal unequal trade still succeeds

## 5. Verification

- [ ] 5.1 `npm test` passes; `npm run build` type-checks
- [ ] 5.2 Two-player playtest: multi-card search at a full inventory, Epic crate Aaahh!!, a trade that would overfill a hand, reorganise with several moves, discard on another player's turn
- [ ] 5.3 Confirm cards and inventory code is smaller than before this change
- [ ] 5.4 Update `RULES-REVIEW.md`: remove `S1`, `S2`, `S3`, `S6`, `S7`, `S8`, refresh line numbers, note the change that fixed them
