# Turn Signal Specification

## Purpose

Make whose turn it is unmissable, even glancing at a phone with the sheet at peek: a turn line in the operative panel, plus a toast and tab-title marker when the local player's turn starts.

## Requirements

### Requirement: Turn line in the operative panel
The sheet header (sheet and side layouts) and the rail operative card SHALL show a turn line. It SHALL read `ZOMBIE PHASE` during the zombie phase (including while paused on a wound decision), otherwise `YOUR TURN` with the remaining actions (`∞` in cheat mode) when the active player is the local player, otherwise `WAITING FOR <name>` naming the active player's survivor. On the sheet layout the line SHALL be visible at peek. `YOUR TURN` SHALL be visually emphasised using existing tokens.

#### Scenario: Phone at peek, my turn
- **WHEN** it is the local player's turn and the sheet is at peek on a phone
- **THEN** the header shows `YOUR TURN` and the action count

#### Scenario: Waiting
- **WHEN** Ben's survivor Wanda is active and the local player is Ana
- **THEN** Ana's header shows `WAITING FOR Wanda`

#### Scenario: Zombie phase
- **WHEN** the game is in the zombie phase waiting for a wound decision
- **THEN** the header shows `ZOMBIE PHASE`

### Requirement: Turn start notice
When the local player's turn starts during the player phase, either because the active player changes to the local player or because a new round starts with the local player active, the client SHALL show a short `Your turn` toast. It SHALL NOT fire on the initial state after join or reconnect, nor once the game has a result. If the document is hidden at that moment, the document title SHALL be prefixed with `● ` until the document becomes visible again.

#### Scenario: Turn passes to me
- **WHEN** Ben ends his turn and it becomes Ana's turn
- **THEN** Ana sees a `Your turn` toast

#### Scenario: New round, same first player
- **WHEN** the zombie phase ends and the first player token leaves Ana active again
- **THEN** Ana sees a `Your turn` toast

#### Scenario: Background tab
- **WHEN** Ana's tab is hidden when her turn starts
- **THEN** the tab title starts with `● ` and the prefix is removed when she returns to the tab

#### Scenario: Reconnect on my turn
- **WHEN** Ana reconnects while it is already her turn
- **THEN** no toast is shown
