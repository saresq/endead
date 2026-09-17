# Board Camera Specification

## Purpose

Define how the board is framed, panned, zoomed and recentred: first-render fit, the small-screen fallthrough, clamping, focus on turn change, and the recentre affordances.

## Requirements

### Requirement: Board is framed on first render
The renderer SHALL keep a viewport rectangle (the on-screen area not covered by HUD chrome) and, on the first render that places tiles and whenever the viewport rectangle changes while the camera has not been moved by the user, SHALL scale and position the board so the whole board fits inside the viewport rectangle with 4% padding, centred. The fitted scale is bounded below by the minimum zoom and above only by the viewport: the upper cap of 1.0 this change originally shipped was removed by `desktop-board-deck`, because it made `F` a zoom-out key on a large screen. Manual zoom still stops at the maximum zoom.

#### Scenario: Desktop first render
- **WHEN** a game starts in a 1440x900 window with the bottom deck and a 95px top area
- **THEN** every tile of the board is visible in the area above the deck and no tile is under the deck or top bar

#### Scenario: Small phone with large map
- **WHEN** the fitted scale would be below 0.55
- **THEN** the renderer instead centres the local player's survivor zone at scale 0.75, shifted only as far as needed to keep the board's edges outside the viewport rectangle

#### Scenario: Resize after user pan
- **WHEN** the user has panned or zoomed and the window is resized
- **THEN** the board is not re-fitted; it is only re-clamped so it stays partly on screen

### Requirement: Camera focuses the active survivor on turn change
When the active player changes, the client SHALL pan the camera so the zone of the active survivor is inside the viewport rectangle, animated over 300ms, and SHALL not move the camera if the zone is already fully visible.

#### Scenario: Active survivor off-screen
- **WHEN** the turn passes to a survivor whose zone is outside the viewport rectangle
- **THEN** the camera pans until that zone is inside the viewport rectangle

#### Scenario: Zone near the board edge
- **WHEN** the turn passes to a survivor whose off-screen zone lies at the edge of a board larger than the viewport rectangle
- **THEN** the camera pans until that zone is inside the viewport rectangle without showing empty space beyond the board's edge

#### Scenario: Active survivor visible
- **WHEN** the turn passes to a survivor whose zone is already fully visible
- **THEN** the camera does not move

#### Scenario: Reduced motion
- **WHEN** the user has `prefers-reduced-motion: reduce`
- **THEN** the pan is applied instantly with no animation

### Requirement: Board cannot be lost
After any pan, pinch or zoom the renderer SHALL adjust the board position so that, on each axis, the board stays fully inside the viewport rectangle when it already fits on that axis, and otherwise keeps at least 35% of its extent on that axis inside. The fully-inside case was added by `desktop-board-deck`; the 35% rule alone let one drag park a fitting board in the corner of a large screen. Minimum zoom SHALL be the fitted scale for the current viewport and maximum zoom SHALL be 3.0.

#### Scenario: Drag past the edge
- **WHEN** the board is larger than the viewport on an axis and the user drags it so that less than 35% would remain visible on that axis
- **THEN** the board stops at the position where 35% remains visible

#### Scenario: Drag a board that already fits
- **WHEN** the board fits entirely inside the viewport on an axis and the user drags it along that axis
- **THEN** the board stops at the viewport edge and stays fully visible

#### Scenario: Zoom out below fit
- **WHEN** the user zooms out with the wheel or pinch
- **THEN** the scale does not go below the fitted scale

### Requirement: Recentre affordances
The game SHALL provide a recentre control: a 44px button inside the map window, the `F` and `Home` keys, and on touch a double-tap on a zone that zooms to that zone at scale 1.0 when the current scale is below 1.0 and otherwise fits the board.

#### Scenario: Recentre button
- **WHEN** the user presses the recentre button
- **THEN** the board is fitted as on first render

#### Scenario: Double-tap zoom in
- **WHEN** the current scale is 0.6 and the user double-taps a zone
- **THEN** the zone is centred at scale 1.0

#### Scenario: Double-tap zoom out
- **WHEN** the current scale is 1.0 or more and the user double-taps a zone
- **THEN** the board is fitted

#### Scenario: Double-tap on the pending move zone
- **WHEN** a move to a zone is pending and the user double-taps that zone
- **THEN** the move is confirmed and the camera does not zoom

### Requirement: Retina-aware rendering
The PIXI application SHALL be initialised with `resolution` equal to the device pixel ratio capped at 2 and `autoDensity` enabled, in both the game and the editor.

#### Scenario: 2x display
- **WHEN** the game runs on a display with devicePixelRatio 2
- **THEN** the canvas backing store is twice the CSS size and tile art renders without upscaling blur

### Requirement: Touch tap versus pan threshold
On touch the renderer SHALL treat a pointer down/up pair as a tap when the pointer is released within 500ms and moved less than 12px in total distance; otherwise it SHALL treat it as a pan and suppress the tap.

#### Scenario: Thumb tap with slight movement
- **WHEN** a touch moves 9px and releases after 150ms
- **THEN** it is handled as a tap on the zone

#### Scenario: Slow drag
- **WHEN** a touch moves 30px before release
- **THEN** it is handled as a pan and no zone tap fires

#### Scenario: Long press
- **WHEN** a touch is held for 500ms without moving and released
- **THEN** it is not handled as a tap and no zone tap fires
