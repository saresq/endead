## ADDED Requirements

### Requirement: A playable map is defined
A map SHALL be considered playable only when, after compilation, it has a player start zone, at least one spawn zone that is active on turn 1 (a spawn zone with no colour), and at least one win condition.

#### Scenario: Only a colour-dormant spawn
- **WHEN** a map's every spawn zone carries a colour
- **THEN** the map is not playable, because no zombie spawns until a matching coloured objective is taken

#### Scenario: A plain spawn zone
- **WHEN** a map has at least one spawn zone with no colour, plus a player start and a win condition
- **THEN** the map is playable

#### Scenario: No player start
- **WHEN** a map has no player start zone
- **THEN** the map is not playable

### Requirement: An unplayable map cannot be saved
`POST /api/maps` SHALL reject a map that is not playable, and SHALL name the reasons in its response.

#### Scenario: Saving a map with no active spawn
- **WHEN** the editor posts a map whose only spawn zone is colour-dormant
- **THEN** the server responds with a client error naming the missing active spawn, and stores nothing

#### Scenario: Saving a playable map
- **WHEN** the editor posts a map that satisfies every playability rule
- **THEN** the map is stored

### Requirement: The editor reports playability before saving
The editor SHALL show a map's playability problems while editing, so the author sees them before the server refuses the save.

#### Scenario: Author removes the last active spawn
- **WHEN** the map author leaves only colour-dormant spawn zones on the map
- **THEN** the editor reports that the map has no spawn active on turn 1

### Requirement: The lobby offers only playable maps
The lobby SHALL list only playable maps and SHALL preselect a playable one. It SHALL NOT preselect a map merely because it is the newest.

#### Scenario: An unplayable map exists
- **WHEN** the stored maps include one that is not playable
- **THEN** it does not appear in the lobby's map list and cannot be selected

#### Scenario: Preselection
- **WHEN** the host opens the lobby
- **THEN** the preselected map is playable

#### Scenario: No playable map stored
- **WHEN** no stored map is playable
- **THEN** the lobby says so and the host cannot start a game, rather than starting one that never spawns zombies

### Requirement: Stored maps are playable
The maps shipped in the repository database SHALL all be playable.

#### Scenario: Shipped map set
- **WHEN** the committed database is inspected
- **THEN** every map in it satisfies the playability rules
