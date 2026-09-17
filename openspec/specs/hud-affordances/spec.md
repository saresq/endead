# Hud Affordances Specification

## Purpose

The in-game affordances a player relies on to act — move highlighting, disabled and available states, failure messages, touch and pointer target sizes, and the tap threshold.

## Requirements

### Requirement: Reachable zones are visible
When a survivor is selected on its owner's turn, the board SHALL wash every zone the survivor can reach in the highlight colour with an ink outline, and SHALL wash the pending move zone in the same colour at a distinct alpha.

#### Scenario: Turn starts
- **WHEN** it becomes the local player's turn with a survivor selected
- **THEN** every reachable zone is visibly tinted against the board art

#### Scenario: Move pending
- **WHEN** the player taps a reachable zone
- **THEN** that zone is distinguishable from the other reachable zones

### Requirement: Every tap gets a response
When a tap resolves to no legal action, the client SHALL tell the player why instead of failing silently.

#### Scenario: Unreachable zone
- **WHEN** the player taps a zone that is not reachable this turn
- **THEN** a short message says so and the pending move is cleared

#### Scenario: Tap outside the board
- **WHEN** the player taps outside any zone
- **THEN** the selection is kept or restored without a silent no-op

### Requirement: Control appearance matches availability
A control that cannot be used SHALL render in the disabled treatment, whether it carries the `disabled` attribute or the disabled class, and that treatment SHALL keep its label at a contrast ratio of at least 4.5:1. An action that is merely available SHALL NOT render as pressed, and SHALL NOT report `aria-pressed`.

#### Scenario: End Turn during another player's turn
- **WHEN** it is not the local player's turn
- **THEN** End Turn renders as disabled and its label stays legible

#### Scenario: Objective available in this zone
- **WHEN** the survivor's zone has an objective
- **THEN** the Objective button is highlighted but is not announced as pressed

### Requirement: Keyboard shortcuts match the buttons
An action key SHALL be accepted whenever the equivalent button is enabled, including when the survivor has no action points left but has a free action of that kind.

#### Scenario: Free search with no AP
- **WHEN** a survivor has 0 AP and 1 free search remaining
- **THEN** pressing `S` performs the search, as the Search button does

### Requirement: Controls stay reachable
No in-game control SHALL be clipped out of the viewport without a scrollable container, and toasts SHALL NOT cover the top bar controls.

#### Scenario: Short laptop window
- **WHEN** the game is shown at 1366x660
- **THEN** End Turn is reachable, by scrolling its container if necessary

#### Scenario: Toast during play
- **WHEN** a toast is shown on the desktop layout
- **THEN** the room code, log and menu buttons stay clickable

### Requirement: Pointer target sizes
On coarse pointers every interactive in-game control SHALL have a hit area of at least 44x44px, and on fine pointers at least 24x24px.

#### Scenario: Squad chip on a phone
- **WHEN** a squad chip is tapped 4px from its centre
- **THEN** the chip receives the tap

#### Scenario: Wound alert in the sheet
- **WHEN** the wound alert is shown on a phone
- **THEN** its tappable area is at least 44px tall

### Requirement: Tap threshold
A touch SHALL be treated as a tap when it is released within 500ms and has moved less than 12px in total.

#### Scenario: Deliberate slow tap
- **WHEN** the player rests a thumb on a zone for 400ms without moving and lifts
- **THEN** the zone is selected

### Requirement: No raw player ids in player-facing text
When a survivor's name is still a generated player id, the client SHALL display its character class instead, everywhere the name is shown.

#### Scenario: Player never set a nickname
- **WHEN** a player joins without a nickname and the game starts
- **THEN** the sheet header, turn line, log entries and chip labels show the character name, not `player-123456`

### Requirement: Spanish copy is complete and single-sourced
Player-facing text SHALL be Spanish everywhere, including document metadata, each term SHALL have one translation, and no string SHALL be defined twice.

#### Scenario: Invite link preview
- **WHEN** a room link is shared and a preview is generated
- **THEN** the title and description are the Spanish ones

#### Scenario: Kick a player
- **WHEN** the kick action is named in the lobby and in a server error
- **THEN** both use the same verb

### Requirement: Non-text indicators are visible
An indicator that carries meaning through fill alone SHALL be distinguishable from its own background, by an outline where the palette does not provide 3:1.

#### Scenario: XP bar just after a level
- **WHEN** the XP bar is nearly empty
- **THEN** the fill is distinguishable from the track
