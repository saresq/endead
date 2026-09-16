## ADDED Requirements

### Requirement: The full roster is available
All twelve survivors from the base game SHALL be selectable in the lobby, including Lili, Tiger Sam, Odin, Bunny G, Lou and Ostara.

#### Scenario: Lobby character list
- **WHEN** a player opens the character picker
- **THEN** all twelve survivors are offered

### Requirement: A survivor's health comes from its definition
A survivor's maximum health SHALL be read from its character definition rather than assumed, so a type with health other than 3 is created correctly.

#### Scenario: Kid survivor
- **WHEN** a Kid-type survivor enters a game
- **THEN** their maximum health is 2, per the roster table in the rulebook

### Requirement: The Kid type has its own movement rule
Tiger Sam and Bunny G SHALL be Kid-type survivors, with Slippery usable once per Turn applying to a single Move.

#### Scenario: Kid leaves a zombie zone
- **WHEN** a Kid makes their first Move of the turn out of a zone holding zombies
- **THEN** the extra move cost is waived once that turn

#### Scenario: Both Kids exist
- **WHEN** the roster is inspected
- **THEN** exactly two survivors are Kid type: Tiger Sam and Bunny G

### Requirement: An unknown character is an error, not a substitution
Selecting a character the server does not know SHALL be rejected rather than silently replaced with a default.

#### Scenario: Unknown character id
- **WHEN** a client sends a character id that is not in the registry
- **THEN** the request is rejected and no survivor is created
