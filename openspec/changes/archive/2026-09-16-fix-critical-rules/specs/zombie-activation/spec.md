## ADDED Requirements

### Requirement: Zombies never open doors
A zombie with no open path to its target zone SHALL not move. Zombies SHALL never open or break closed doors.

#### Scenario: Target behind closed door
- **WHEN** the noisiest zone is only reachable through a closed door
- **THEN** the zombie stays in its zone and the door stays closed

#### Scenario: Door not pointing at target
- **WHEN** a zombie's zone has a closed door and no open path leads to the target
- **THEN** the door stays closed and no building spawn is triggered

### Requirement: One activation routine
The Activation step, Extra Activation cards, Rush and pool-exhaustion activations SHALL all use the same activation routine: all attacks resolved first, then moves of zombies that did not attack, then Runners' second action.

#### Scenario: Activation step equals full-set activation
- **WHEN** the Zombie Phase activation step runs
- **THEN** the result is identical to activating the set of all living zombies with the shared routine

#### Scenario: Runners act twice
- **WHEN** a Runner is one zone away from a survivor at activation
- **THEN** it moves into the survivor's zone with its first action and attacks with its second
