## ADDED Requirements

### Requirement: Every player can leave a finished game
When a game has ended, every player SHALL have a way to leave the room from the game-over screen, whether or not they are the host, and without depending on another player acting first.

#### Scenario: Non-host on the game-over screen
- **WHEN** the game ends and a player who is not the host sees the game-over screen
- **THEN** a leave control is available to them alongside whatever they are told about the host

#### Scenario: Host has already left
- **WHEN** the game has ended and the host has closed their tab
- **THEN** the remaining players can still leave the room without closing their own tab

#### Scenario: Leaving returns to the entry screen
- **WHEN** a player uses the leave control on the game-over screen
- **THEN** they land back where leaving the lobby takes them, and are no longer a member of the room
