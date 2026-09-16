## ADDED Requirements

### Requirement: Board-dominant phone portrait layout
Below the desktop breakpoint in portrait orientation the game screen SHALL consist of a top bar, the board filling the remaining height, squad avatar chips overlaid on the board, and a bottom sheet. The visible board area (top of board area to the sheet's snapped top edge) SHALL be at least 55% of the viewport height when the sheet is at peek.

#### Scenario: Phone portrait at peek
- **WHEN** a 390x664 phone shows the game with the sheet at peek
- **THEN** the board area is at least 365px tall and shows tiles

#### Scenario: Squad chips
- **WHEN** two players are in the game on a phone
- **THEN** two 36px avatar chips appear over the board's top-left with the player colour ring, and the current-turn survivor's chip has an amber ring

### Requirement: Bottom sheet with three snap points
The bottom sheet SHALL have three snap points: peek (header only: avatar, name, HP and AP pips, End Turn), half (header plus action row plus loadout), and full (85svh with a scrolling body that adds the XP bar and skill tags). The sheet SHALL snap to the nearest point on release of a drag on its handle or header, SHALL toggle between peek and half on header tap, and SHALL preserve its snap state across HUD re-renders.

#### Scenario: Drag to half
- **WHEN** the user drags the handle up past the midpoint between peek and half and releases
- **THEN** the sheet snaps to half

#### Scenario: Flick down
- **WHEN** the user flicks the handle downward with a velocity above the threshold from full
- **THEN** the sheet snaps to peek

#### Scenario: Re-render keeps position
- **WHEN** the sheet is at half and a state update re-renders the HUD
- **THEN** the sheet remains at half

#### Scenario: Reduced motion
- **WHEN** `prefers-reduced-motion: reduce` is set
- **THEN** snapping happens without a transition

### Requirement: Viewport rectangle follows the sheet
The HUD SHALL report the visible map area to the renderer whenever the map window or the sheet's snapped height changes, so that the board is fitted above the sheet at peek and half.

#### Scenario: Snap from peek to half
- **WHEN** the sheet snaps from peek to half and the camera is in fitted mode
- **THEN** the board is re-fitted into the smaller area above the sheet

### Requirement: Single action row and pinned End Turn
Below the desktop breakpoint the actions SHALL render as one horizontally scrollable row of 56x56 icon-and-label buttons (Search, Noise, Door, Trade, skill actions, and Objective only when the current zone has an objective), and End Turn SHALL be a separate, wider button pinned at the right of the sheet header, visible at every snap point. There SHALL be no "More" overflow tray.

#### Scenario: Objective not available
- **WHEN** the selected survivor's zone has no objective
- **THEN** no Objective button is rendered in the row

#### Scenario: End Turn at peek
- **WHEN** the sheet is at peek on the local player's turn
- **THEN** End Turn is visible and tappable without opening the sheet

### Requirement: Landscape phone layout
Below the desktop breakpoint in landscape orientation the game SHALL use two columns: the board on the left filling the remaining width, and a 300px scrollable panel on the right containing the same content as the sheet (header, action row, loadout, skills) without snap behaviour. Squad chips stay overlaid on the board.

#### Scenario: iPhone landscape
- **WHEN** the game is shown at 844x390
- **THEN** the board is visible on the left and the operative panel with End Turn is visible on the right without scrolling the page

### Requirement: Tablet uses the desktop rail
Viewports at least 744px wide and at least 500px tall in landscape orientation SHALL use the desktop rail layout. Portrait tablets SHALL use the phone sheet layout, and landscape phones shorter than 500px SHALL use the landscape phone layout.

#### Scenario: iPad Mini landscape
- **WHEN** the game is shown at 1024x744 or 1133x744
- **THEN** the right rail layout is used and the board is fitted into the centre column

#### Scenario: Wide landscape phone
- **WHEN** the game is shown at 844x390
- **THEN** the landscape phone layout with the right side panel is used, not the rail

### Requirement: Viewport units and safe areas
In-game root and sheet heights SHALL use dynamic viewport units (`dvh`, with `svh` for the peek anchor). The sheet and action row SHALL add `env(safe-area-inset-bottom)`, the toast stack SHALL add `env(safe-area-inset-top)`, and in landscape the top bar and side panel SHALL add the left and right insets.

#### Scenario: iOS URL bar expanded
- **WHEN** Safari's toolbar is expanded on a phone
- **THEN** the End Turn button in the sheet header remains fully visible above the toolbar

### Requirement: Touch targets and input sizing
On coarse pointers every interactive control in the game HUD SHALL have a hit area of at least 44x44px, and text inputs SHALL have a font size of at least 16px.

#### Scenario: Menu button hit area
- **WHEN** the top bar menu button is measured on a phone
- **THEN** its tappable area is at least 44x44px even if the glyph is 28px

#### Scenario: Nickname input on iOS
- **WHEN** the lobby nickname input is focused on an iPhone
- **THEN** the page does not zoom

### Requirement: Dead layout code removed
`src/styles/components/game-layout.css`, its import, the `.hud-fab-slot` element and the mobile actions tray code SHALL be removed.

#### Scenario: No references remain
- **WHEN** the codebase is searched for `game-layout`, `hud-fab-slot` and `hud-actions__tray`
- **THEN** no matches are found in `src/`
