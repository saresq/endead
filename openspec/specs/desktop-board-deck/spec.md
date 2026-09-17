# Desktop Board Deck Specification

## Purpose

Define the desktop and tablet in-game arrangement: board-anchored chrome, the centred bottom deck and its contents, viewport-invariant control distance, size scaling without breakpoints, and the camera framing that goes with it.

## Requirements

### Requirement: Desktop and tablet use a centred bottom deck
Viewports at least 744px wide and 600px tall SHALL arrange the game as a top bar, the board filling the remaining height, squad chips overlaid on the board, and an operative deck pinned to the bottom, centred and capped at 1400px wide. Narrower or shorter viewports SHALL keep the landscape side panel or the portrait sheet.

#### Scenario: Desktop
- **WHEN** the game is shown at 1440x900
- **THEN** the board is centred above a centred deck holding the operative header, loadout and actions, and no right rail is rendered

#### Scenario: iPad portrait
- **WHEN** the game is shown at 744x1133
- **THEN** the deck arrangement is used, not the phone sheet

#### Scenario: Phone unchanged
- **WHEN** the game is shown at 390x664 or 844x390
- **THEN** the sheet and side arrangements behave exactly as before

### Requirement: Control distance does not grow with the viewport
The distance from the centre of the board to the End Turn control SHALL NOT increase by more than 15% between a 1920px-wide viewport and a 3440px-wide one.

#### Scenario: Ultrawide
- **WHEN** the game is shown at 3440x1440
- **THEN** End Turn sits within roughly 600px of the board centre, as it does at 1920x1080

### Requirement: Controls scale with the viewport without breakpoints
Action button height, action label size and deck padding SHALL scale continuously with the viewport between defined minimum and maximum values, and the stylesheet SHALL NOT gain width-based breakpoints above 744px. On viewports under 820px tall the deck SHALL collapse to a single row.

#### Scenario: Large screen
- **WHEN** the game is shown at 2560x1440
- **THEN** action labels are larger than at 1280x800 and action buttons are at least 44px tall

#### Scenario: Short laptop
- **WHEN** the game is shown at 1366x700
- **THEN** the deck renders as a single row and no control is clipped

### Requirement: One operative renderer
The operative header, loadout, action strip and tags SHALL be produced by a single code path shared by the deck, the sheet and the side panel.

#### Scenario: Long Spanish label
- **WHEN** the action strip renders on the deck
- **THEN** no label is hyphenated or wrapped to two lines

### Requirement: Squad chips show teammate state
The chip overlay SHALL show each survivor's remaining health and actions.

#### Scenario: Teammate takes a wound
- **WHEN** another player's survivor loses health
- **THEN** that change is visible on its chip without opening anything

### Requirement: The board uses the space available
The fitted board SHALL be framed to the visible map area with no upper limit on its scale, and recentring SHALL NOT reduce a board that is already framed.

#### Scenario: Large screen fit
- **WHEN** the game is fitted at 2560x1440
- **THEN** the board fills at least 85% of the height available between the top bar and the deck

#### Scenario: Ultrawide fit
- **WHEN** the game is fitted at 3440x1440
- **THEN** the board is framed to the same share of the available height as at 2560x1440

#### Scenario: Recentre after zooming
- **WHEN** the player has zoomed to a board larger than the fitted size and presses `F`
- **THEN** the board returns to the fitted size, which is not smaller than it was before the camera work of this change

### Requirement: A board that fits stays inside the viewport
When the scaled board is smaller than the visible map area on an axis, panning SHALL keep it fully inside that area on that axis.

#### Scenario: Drag on a large screen
- **WHEN** the player drags the board hard to one side at 2560x1440
- **THEN** the whole board remains inside the visible map area

### Requirement: Feedback appears near the controls
The latest-event card SHALL render centred directly above the deck with a maximum width of about 640px, and the event log modal SHALL be large enough to read on a desktop screen.

#### Scenario: After an action
- **WHEN** the player searches from the deck
- **THEN** the result appears immediately above the deck, not at the top of the board

#### Scenario: Opening the log
- **WHEN** the player presses `L` at 1920x1080
- **THEN** the log is wider than the backpack modal and its entries are at least 12px

### Requirement: Tab order follows the screen
Keyboard focus SHALL move through the in-game controls in reading order: top bar, squad, deck, then the map overlay controls.

#### Scenario: Tabbing from the top bar
- **WHEN** the player tabs from the top bar
- **THEN** focus reaches the deck controls before the recentre button
