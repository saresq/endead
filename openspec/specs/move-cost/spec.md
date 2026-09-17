# Move Cost Specification

## Purpose

Charge the correct action cost for leaving a zombie-occupied zone, honor Slippery and Hit & Run waivers, and consume free actions in the rules-correct order, rejecting moves and attacks the survivor cannot pay for instead of silently clamping.

## Requirements

### Requirement: Leaving a zombie zone costs one action per zombie
A Move or Sprint SHALL cost its base cost plus 1 action per zombie in the zone being left. The base cost SHALL be 0 when a free Move covers it. Slippery SHALL waive the zombie cost. The action SHALL be rejected, with no state change, when the survivor cannot pay the full cost; actions SHALL never be clamped at 0 to make an action affordable.

#### Scenario: Not enough actions
- **WHEN** a survivor with 3 actions tries to leave a zone with 3 zombies
- **THEN** the move is rejected (cost 4)

#### Scenario: Exactly enough
- **WHEN** a survivor with 4 actions leaves a zone with 3 zombies
- **THEN** the move succeeds and the survivor has 0 actions

#### Scenario: Free move
- **WHEN** a survivor with a free Move and 2 actions leaves a zone with 2 zombies
- **THEN** the move succeeds using the free Move and 2 actions

#### Scenario: Slippery
- **WHEN** a Slippery survivor with 1 action leaves a zone with 3 zombies
- **THEN** the move succeeds and costs 1 action

### Requirement: Hit & Run waives the zombie cost
After a Melee or Ranged Action that kills at least one zombie, a survivor with Hit & Run SHALL receive a free Move whose zombie-leave cost is waived.

#### Scenario: Move after a kill
- **WHEN** a Hit & Run survivor kills a zombie and then moves out of a zone with 2 remaining zombies
- **THEN** the move uses the free Move and costs no actions

### Requirement: Specific free actions are used first
For an attack, a free Melee (melee attack) or free Ranged (ranged attack) action SHALL be consumed before a free Combat action.

#### Scenario: Both free melee and free combat
- **WHEN** a survivor with 1 free Melee and 1 free Combat performs a melee attack
- **THEN** the free Melee is consumed and the free Combat remains
