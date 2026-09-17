## 1. One draw resolution (S1, S2)

- [x] 1.1 `resolveDrawnCard(state, survivorId, card)` returning kept / offered-on-overflow / aaahh-stop, spawning the Walker and discarding on Aaahh!!
- [x] 1.2 Move `ItemHandlers.handleSearch` onto it; delete the overflow `break` at `:131-135`
- [x] 1.3 Move `EpicCrateHandlers:58-64` onto it, so `aaahh_epic` can no longer enter an inventory
- [x] 1.4 Move Hold your nose (`CombatHandlers.ts:414-432`) onto it
- [x] 1.5 S6: re-read `newState.survivors[id]` after `addXP` in Hold your nose, as Hit & Run does
- [x] 1.6 Tests: two-card search with one free slot loses nothing; Aaahh!! from search stops the second draw; Aaahh!! from Epic crate and from Hold your nose each spawn a Walker and enter no inventory; card totals conserved across every path; Hold your nose on a levelling kill keeps the XP

## 2. One discard routing (S3)

- [x] 2.1 Discard helper routing by card id prefix: `epic-` to the Epic discard, `card-start-` out of play, everything else to the Equipment discard
- [x] 2.2 Route every caller through it: `EquipmentManager.discardCard:91`, `EquipmentManager.swapDrawnCard:120`, `ItemHandlers.handleResolveSearch:162`, `handlerUtils.ts:39`, `ZombiePhaseManager.ts:186`
- [x] 2.3 Confirm `DeckService.drawCard:94` reshuffle can no longer pull starting or Epic cards into the Equipment deck
- [x] 2.4 Tests: each prefix routes correctly; a reshuffled Equipment deck contains no `card-start-` or `epic-` card

## 3. Action costs (S8)

- [x] 3.1 Replace the if/else chain at `ActionProcessor.ts:212-222` with an action cost table; absorb the empty `TRADE_*` branch
- [x] 3.2 Discard costs nothing and is allowed off-turn and at zero action points
- [x] 3.3 Reorganise opens a free session for one action, reusing the trade session pattern; moves inside it cost nothing
- [x] 3.4 Client: free discard and the reorganise session in the inventory UI; Spanish strings in `src/strings/es/`
- [x] 3.5 Delete the now-dead `moveCardToSlot` DISCARD branch
- [x] 3.6 Tests: three moves plus a swap in one reorganise cost one action total; discard at zero AP succeeds

## 4. Trade validation (S7)

- [x] 4.1 Call `validateLoadout` on both resulting inventories in `TradeHandlers.ts:107`
- [x] 4.2 Reject a trade whose partner is not alive
- [x] 4.3 Reject a payload that does not say where a card goes, instead of defaulting to `BACKPACK_0`
- [x] 4.4 Rejection message names the rule that failed; Spanish string added
- [x] 4.5 Tests: overfull hand rejected; more than five cards rejected; two cards in one slot rejected; dead partner rejected; legal unequal trade still succeeds

## 5. Verification

- [x] 5.1 `npm test` passes; `npm run build` type-checks
- [x] 5.2 Two-player playtest (Playwright, two clients in one room via the `?tab` identity flag) — every scenario the map allows, run through the real UI:
  - **Multi-card search at a full inventory** — a Flashlight search with five cards held drew two: the deck went 16 to 14, one card was offered in the pickup modal and the other went straight to the Equipment discard. Card totals stayed at 57 across the whole session (~25 searches). Before the fix the second card was lost.
  - **Aaahh!!** — twice from a search: a Walker spawned, the card went to the discard, nothing named `aaahh` entered the inventory, and the log read "Aaahh!!: ¡apareció un zombi!".
  - **Discard routing** — the pickup modal displaced a starting Fire Axe (`card-start-fire_axe-0`) into the discard zone; it left play, and `equipmentDiscard` stayed empty. The client sends `DISCARD_CARD` for a displaced card now, not `ORGANIZE`.
  - **Trade that would overfill a hand** — a payload putting two received cards in `HAND_1` was rejected with "No podés llevar más de dos cartas en las manos.", and neither inventory changed. The legal unequal trade that followed (two cards for none) completed and cost the one action. The client's auto-assign can only build legal layouts, so the rejection was sent as a crafted payload.
  - **Reorganise with several moves** — one action opened the session; three moves and closing it were free.
  - **Discard on another player's turn** — free, off-turn, with its confirm dialog.
  - Fixed during the playtest: the event log printed every `ORGANIZE` and `ORGANIZE_END`, so one action produced five lines — only `ORGANIZE_START` shows now. Also, the squad chip drew one AP pip per action, so cheat mode's 999 actions rendered a strip of pills across the whole board; cheat mode is a single green bar.
  - Not testable on this map: the Epic crate Aaahh!! — `ENDEAD 4×3` places no Epic crate. Covered by `CardDraw.test.ts`.
- [x] 5.3 Confirm cards and inventory code is smaller than before this change — **not met, accepted.** Net +474 non-test lines. The dedup shrank what it touched (`ActionProcessor` −11, `EquipmentManager` −9, three fixes in `CombatHandlers` at ±0), but the reorganise session this change's own §3.3/§3.4 requires did not exist before: `ReorganizeUI.ts` (224) plus action types, session state and strings ≈ 280 lines. `CardDraw.ts` is 70 lines (25 comments) replacing ~45 triplicated ones. Simplicity was the goal, not line count.
- [x] 5.4 Update `RULES-REVIEW.md`: remove `S1`, `S2`, `S3`, `S6`, `S7`, `S8`, refresh line numbers, note the change that fixed them
