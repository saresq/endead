## ADDED Requirements

### Requirement: Starting equipment is dealt at random
Each survivor SHALL receive one starting weapon dealt at random from the starting set — Baseball Bat, Crowbar, Fire Axe and three Pistols — rather than a fixed loadout tied to the character.

#### Scenario: Two games with the same characters
- **WHEN** two games start with the same characters but different seeds
- **THEN** the starting weapons may differ

#### Scenario: The deal is reproducible
- **WHEN** a game is set up twice from the same seed
- **THEN** the same survivors receive the same starting weapons

### Requirement: The Fire Axe holder goes first
The first player token SHALL go to the survivor dealt the Fire Axe, not to the host by position.

#### Scenario: Host is not the axe holder
- **WHEN** the Fire Axe is dealt to a player who is not the host
- **THEN** that player takes the first turn
