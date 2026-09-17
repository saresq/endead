## ADDED Requirements

### Requirement: The browser suite is committed and runnable
The project SHALL carry a browser test suite as a declared dependency with a single command to run it, so it re-runs on a fresh clone rather than existing as throwaway scripts.

#### Scenario: Fresh clone
- **WHEN** someone clones the repository, installs dependencies and runs the end-to-end command
- **THEN** the suite runs without installing anything by hand

#### Scenario: Suite is part of the repository
- **WHEN** the test files are inspected
- **THEN** they live in the repository under version control, not in a temporary directory

### Requirement: Phone shell behaviour is covered
The suite SHALL cover the phone shell on an emulated touch device: the bottom sheet's drag and snap, double-tap zoom, pinch zoom, a tap-to-move confirming on the second tap, and End Turn staying reachable when the visual viewport shrinks.

#### Scenario: Sheet snaps
- **WHEN** the sheet is dragged on a touch viewport
- **THEN** it settles at one of its snap positions

#### Scenario: Second tap confirms a move
- **WHEN** a reachable zone is tapped twice
- **THEN** the survivor moves, rather than the second tap zooming

#### Scenario: Shrunken viewport
- **WHEN** the visible height is reduced the way an expanded browser chrome would reduce it
- **THEN** End Turn is still reachable

### Requirement: Inputs do not invite a zoom on focus
Every text input, select and textarea SHALL compute to at least 16px on a coarse pointer, which is the size below which mobile browsers zoom the page on focus.

#### Scenario: Focusing a field on a phone viewport
- **WHEN** each input in the menu and the lobby is measured on a coarse-pointer viewport
- **THEN** its computed font size is at least 16px

### Requirement: The rules fixes are covered end to end
The suite SHALL drive a real two-player game against the real server and cover line of sight on a shot, zombies not passing a closed door, the move-cost prompt, a door-open spawn, wound pause and resume, and the skill choice at Orange.

#### Scenario: Line of sight
- **WHEN** a survivor shoots at a zone it has no line of sight to
- **THEN** the server refuses and the client says so

#### Scenario: Wound decision blocks play
- **WHEN** a wound decision is owed
- **THEN** play is blocked until it is answered, and resumes afterwards

### Requirement: A game can be seeded outside production
Room creation SHALL accept an optional seed so a test can reproduce a game exactly, and SHALL ignore it in production.

#### Scenario: Same seed, same game
- **WHEN** two rooms are created with the same seed and the same actions are taken
- **THEN** the same cards are drawn and the same zombies spawn

#### Scenario: Production ignores the seed
- **WHEN** a room is created with a seed while running in production
- **THEN** the seed is ignored and the game is seeded unpredictably

### Requirement: A test says when it is a substitute
Where an emulated check stands in for something only physical hardware can prove, the test SHALL say so in its name, and the source task it satisfies SHALL record that it was met by substitution rather than by the physical check.

#### Scenario: Emulated stands in for physical
- **WHEN** a check cannot reproduce real-device behaviour and asserts a proxy instead
- **THEN** its name marks it as a substitute and the resolved task names the test and the limit
