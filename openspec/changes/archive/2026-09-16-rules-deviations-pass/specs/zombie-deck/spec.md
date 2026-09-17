## ADDED Requirements

### Requirement: The spawn deck matches the rulebook
The spawn deck SHALL contain the cards the rulebook lists, with the per-danger-level details each card specifies, including the Rush cards and the Blue-level Abominations.

#### Scenario: Rush cards present
- **WHEN** the spawn deck is built
- **THEN** it contains cards that trigger a Rush, and drawing one activates the matching zombies

#### Scenario: Blue-level Abominations
- **WHEN** spawn cards are inspected at the Blue danger level
- **THEN** the cards the rulebook gives a Blue Abomination have one
