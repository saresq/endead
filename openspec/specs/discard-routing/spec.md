# discard-routing Specification

## Purpose
Route every discard to the pile its deck owns, by card id prefix, so starting equipment leaves play, Epic cards return to the Epic discard, and a reshuffled Equipment deck can only contain cards that belong to it.

## Requirements

### Requirement: Discarded cards go to the pile their deck owns
A discarded card SHALL be routed by what kind of card it is: Epic cards to the Epic discard, ordinary equipment to the Equipment discard, and starting equipment to neither.

#### Scenario: Epic card discarded
- **WHEN** an Epic card is discarded
- **THEN** it goes to the Epic discard and never to the Equipment discard

#### Scenario: Starting equipment discarded
- **WHEN** a starting equipment card is discarded
- **THEN** it leaves play entirely and does not enter any discard pile

### Requirement: A reshuffle only returns cards that belong to the deck
When a deck is exhausted and its discard is reshuffled back in, the deck SHALL contain only cards that belong to it.

#### Scenario: Equipment deck reshuffle
- **WHEN** the Equipment deck runs out and its discard is reshuffled
- **THEN** no starting equipment and no Epic card appears in the Equipment deck

### Requirement: One helper routes every discard
All discards SHALL go through one shared routing helper, so the rule cannot differ between the places a card can be discarded.

#### Scenario: Discard from different sources
- **WHEN** a card is discarded by a search resolution, by a swap, by a zombie phase effect, or by the player
- **THEN** it is routed to the same pile in every case

