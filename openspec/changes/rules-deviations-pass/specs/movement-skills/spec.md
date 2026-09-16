## ADDED Requirements

### Requirement: Sprint follows movement rules
Sprint SHALL stop in the first zone containing zombies rather than failing, SHALL honour Slippery when leaving a zone with zombies, and SHALL be usable with a free Move.

#### Scenario: Zombies in the first zone
- **WHEN** a survivor sprints and the first zone of the path holds zombies
- **THEN** the survivor stops in that zone and the action completes

#### Scenario: Sprinting with a free Move
- **WHEN** a survivor has a free Move remaining and sprints
- **THEN** the free Move is spent rather than an action point

### Requirement: Charge respects zombies along the path
Charge SHALL apply normal movement rules to every zone it passes through, including the middle zone of a two-zone path.

#### Scenario: Zombies in the middle zone
- **WHEN** a survivor charges along a two-zone path whose middle zone holds zombies
- **THEN** the survivor stops in that middle zone

### Requirement: Born Leader follows its card
Born Leader SHALL NOT require the target to be in the same zone, and SHALL NOT grant an action to a survivor who cannot use it.

#### Scenario: Target in another zone
- **WHEN** a survivor uses Born Leader on a teammate in a different zone
- **THEN** the action is granted

#### Scenario: Target has already finished their turn
- **WHEN** Born Leader would target a survivor who cannot act again this round
- **THEN** the grant is refused rather than silently lost
