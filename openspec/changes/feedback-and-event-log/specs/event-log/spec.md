## ADDED Requirements

### Requirement: Log reachable on every layout
The top bar SHALL contain a Log button on the rail, sheet and side layouts, with a 44px hit area on coarse pointers and `L` as its keyboard shortcut (ignored while a text input is focused, listed in the `?` shortcut help). Pressing it SHALL toggle the event log. The Turn chip SHALL keep opening the log.

#### Scenario: Phone portrait
- **WHEN** a player on a 390x664 phone taps the Log button with the sheet at peek
- **THEN** the event log opens

#### Scenario: Keyboard
- **WHEN** a desktop player presses `L` with no text input focused
- **THEN** the event log toggles

### Requirement: Log ordering and grouping
The log SHALL list displayable history entries newest first, grouped by round (`Round N`, with the round equal to the game's current turn marked current), with a separator line naming the player at the start of each player turn. A player turn SHALL be considered to end at an End Turn entry or when the next entry belongs to a different player (a turn can end by running out of actions). An entry SHALL belong to the round that was in progress when its action started, so the action that ends a round stays in that round. Lobby and bookkeeping actions (join, start, character select, nickname, kick, disconnect, resolve search, choose skill, end game, abandon) SHALL NOT be displayed. The log SHALL re-render while open when new entries arrive, keeping its scroll position.

#### Scenario: Two players in one round
- **WHEN** Ana and Ben each take a turn in round 3
- **THEN** the log shows one `Round 3` group containing an Ana separator with her entries and a Ben separator with his entries, Ben's first

#### Scenario: Turn ended by running out of actions
- **WHEN** Ana spends her last action on an attack (no End Turn) and Ben then moves
- **THEN** Ben's move appears under a Ben separator, not under Ana's

#### Scenario: Live update
- **WHEN** the log is open and another player attacks
- **THEN** the attack appears at the top of the log without reopening it

### Requirement: Unread indicator
The Log button SHALL show a dot when displayable entries were added since the local player last opened the log, including the local player's own actions. Entries already present when the player joins or reloads SHALL count as read. Opening the log SHALL clear the dot, and no dot SHALL appear while the log stays open. The count SHALL be kept in client memory only.

#### Scenario: New entries
- **WHEN** the log was closed and another player moves
- **THEN** the Log button shows the dot

#### Scenario: Cleared
- **WHEN** the player opens the log
- **THEN** the dot is gone

#### Scenario: Join with history
- **WHEN** a player reconnects into a game with 40 history entries
- **THEN** the Log button shows no dot until a new entry arrives

### Requirement: History entry integrity
A history entry SHALL carry action feedback (description, dice, hits, threshold, rerolls, boosts, free-action use) and spawn context only when the action that produced the entry set them. Entries for actions that do not set feedback SHALL NOT copy it from an earlier action.

#### Scenario: Noise after attack
- **WHEN** a survivor attacks and then makes noise
- **THEN** the Make Noise history entry has no dice and no attack description

#### Scenario: Spawn context not repeated
- **WHEN** a zombie phase spawns zombies and the next player then moves
- **THEN** the Move history entry has no spawn context
