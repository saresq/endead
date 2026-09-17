## ADDED Requirements

### Requirement: Discarding is free
Discarding a card SHALL cost no action and SHALL be allowed at any time, including outside the survivor's own turn.

#### Scenario: Discard with no action points
- **WHEN** a survivor with zero action points discards a card
- **THEN** the discard succeeds and no action is spent

### Requirement: Reorganising costs one action for any number of moves
Rearranging a survivor's own inventory SHALL cost one action in total, however many cards are moved, rather than one action per move.

#### Scenario: Several moves in one reorganise
- **WHEN** a survivor reorganises and moves three cards, including a swap
- **THEN** one action is spent in total

#### Scenario: Swap costs one action
- **WHEN** a survivor swaps two cards between hands
- **THEN** one action is spent, not two

### Requirement: A trade leaves both inventories legal
A trade SHALL be rejected unless both resulting inventories are legal — at most two cards in hand, at most five cards in total, and no two cards occupying the same slot — and unless the trade partner is alive.

#### Scenario: Trade would overfill a hand
- **WHEN** a proposed trade would leave a survivor with three cards in hand
- **THEN** the trade is rejected and neither inventory changes

#### Scenario: Trade with a dead partner
- **WHEN** a trade is proposed with a survivor who is no longer alive
- **THEN** the trade is rejected

#### Scenario: Cards never default into a slot silently
- **WHEN** a trade payload does not say where a card goes
- **THEN** the trade is rejected rather than placing the card in a default slot
