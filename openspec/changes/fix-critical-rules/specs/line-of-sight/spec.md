## ADDED Requirements

### Requirement: Straight-line Line of Sight
The system SHALL compute Line of Sight from a zone by tracing straight lines from every cell of that zone in the four board directions (no diagonals). A line SHALL stop at the board edge, at an edge between two zones that has no connection or is a wall, and at a closed door. A line that enters a building zone SHALL stop after that zone. Crossing cells of the same zone SHALL not stop the line.

#### Scenario: Street to street
- **WHEN** three street zones lie in a straight row with open edges
- **THEN** each end zone sees the other

#### Scenario: No LOS around a corner
- **WHEN** the only open path between two street zones turns a corner
- **THEN** neither zone sees the other

#### Scenario: Closed door blocks
- **WHEN** a closed door lies on the straight line between two zones
- **THEN** neither zone sees the other

#### Scenario: Street into building is one zone deep
- **WHEN** a street zone faces an open doorway into room A, and room B lies beyond A in line through another opening
- **THEN** the street zone sees room A and does not see room B

#### Scenario: Building out to street
- **WHEN** a room has an open door onto a street and several street zones continue in a straight line
- **THEN** the room sees all those street zones up to a wall, closed door or board edge

### Requirement: Range is counted along the line
The range to a visible zone SHALL be the number of zone boundaries crossed along the line; the zone itself is range 0. When several lines reach the same zone, the smallest range SHALL be used.

#### Scenario: Range through two zones
- **WHEN** the target zone is the second zone along a clear straight line
- **THEN** its range is 2

### Requirement: Single LOS source for all callers
Ranged attacks (including Molotov), Lifesaver, zombie target selection and client attack-target highlighting SHALL all use the same LOS and range computation. A ranged attack SHALL be rejected when the target zone is not visible or its range is outside the weapon's effective range.

#### Scenario: Out of sight shot rejected
- **WHEN** a survivor fires a ranged weapon at a zone reachable only by a bent path
- **THEN** the attack is rejected with a "no line of sight" error

#### Scenario: Zombies and survivors agree
- **WHEN** a survivor can see a zone containing a zombie
- **THEN** that zombie sees the survivor's zone for targeting

### Requirement: Missing zone geometry is reported
If zone geometry is missing from the game state, the LOS computation SHALL throw an error naming the problem instead of silently returning a result.

#### Scenario: State without geometry
- **WHEN** LOS is requested on a state with no `zoneGeometry`
- **THEN** an error "Missing zone geometry" is raised
