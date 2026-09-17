# Combat Skills Specification

## Purpose

Define when the combat skills apply and how often: Tough per attack instance rather than per round, Lucky per action, and Reaper per killing hit.

## Requirements

### Requirement: Tough ignores one wound per attack step
Tough SHALL ignore the first wound of each zombie attack step and of each Friendly Fire instance, and SHALL reduce that instance by exactly one wound rather than cancelling it entirely. It SHALL NOT be limited to once per round.

#### Scenario: Two attack steps in one round
- **WHEN** a survivor with Tough is attacked in the spawn step's extra activation and again in the normal attack step
- **THEN** Tough applies in both

#### Scenario: Friendly Fire for two damage
- **WHEN** a survivor with Tough takes a Friendly Fire miss dealing two wounds
- **THEN** they take one wound, not zero

### Requirement: Lucky applies once per action
Lucky SHALL allow a reroll once per attack action rather than once per turn.

#### Scenario: Two attacks in one turn
- **WHEN** a survivor with Lucky attacks twice in the same turn
- **THEN** each attack may be rerolled once

### Requirement: Reaper applies once per killing hit
Reaper SHALL grant one extra kill per killing hit, not once per action.

#### Scenario: Two killing hits in one attack
- **WHEN** a survivor with Reaper lands two killing hits in one attack
- **THEN** two extra zombies of the same priority are killed
