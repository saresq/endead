## ADDED Requirements

### Requirement: A drawn card is always accounted for
Every card drawn SHALL end in the survivor's inventory, in a discard pile, or resolved by its own rule. A draw that overflows the inventory SHALL NOT leave the remaining drawn cards in neither place.

#### Scenario: Multi-card draw overflows
- **WHEN** a survivor with one free slot draws two cards
- **THEN** every drawn card is either taken into the inventory, offered to the player, or discarded — none disappears

#### Scenario: Card counts stay consistent
- **WHEN** any draw completes
- **THEN** the total number of cards across inventories, decks and discard piles is unchanged

### Requirement: Aaahh!! resolves the same wherever it is drawn
An Aaahh!! card SHALL spawn a Walker in the survivor's zone, be discarded rather than kept, and stop the draw that produced it. This SHALL hold for a search, an Epic crate, and a Hold your nose draw alike.

#### Scenario: Aaahh!! during a two-card search
- **WHEN** the first of two searched cards is an Aaahh!!
- **THEN** a Walker spawns, the search stops, and the second card is not drawn

#### Scenario: Aaahh!! from an Epic crate
- **WHEN** an Epic crate draw produces an Aaahh!!
- **THEN** a Walker spawns and nothing named `aaahh` enters the survivor's inventory

#### Scenario: Aaahh!! from Hold your nose
- **WHEN** a Hold your nose draw produces an Aaahh!!
- **THEN** a Walker spawns and nothing named `aaahh` enters the survivor's inventory

### Requirement: A skill that grants XP and a card applies both
When a skill grants experience and then draws a card, both SHALL take effect; the draw SHALL NOT overwrite the experience.

#### Scenario: Hold your nose on a kill that levels the survivor
- **WHEN** Hold your nose draws a card on a kill that also grants experience
- **THEN** the survivor keeps the experience and the drawn card is handled normally
