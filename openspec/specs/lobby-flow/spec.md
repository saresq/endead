# Lobby Flow Specification

## Purpose

Make the menu, lobby, character select and game-over screens usable on phone portrait, phone landscape and desktop, with room invite and join made obvious.

## Requirements

### Requirement: Menu fits every viewport without horizontal scroll
The menu SHALL show, in this order: the Endead wordmark, a name field, a primary `Crear sala` button, and a join section with a room code field and an `Unirme` button. On a 360x640 portrait phone, a 844x390 landscape phone and a 1440x900 desktop, all of these SHALL be reachable with no horizontal scroll, and on the portrait phone the name field and `Crear sala` SHALL be visible without scrolling. Inline messages (room not found, room full, kicked, game in progress, create failed) SHALL appear above the name field and SHALL NOT push `Crear sala` off a portrait phone screen when the keyboard is closed.

#### Scenario: Portrait phone first load
- **WHEN** a player opens `/` on a 360x640 phone
- **THEN** the name field and `Crear sala` are visible without scrolling and nothing overflows horizontally

#### Scenario: Landscape phone
- **WHEN** a player opens `/` on a 844x390 phone
- **THEN** every control is reachable by vertical scroll only and the join field and button stay on one row

#### Scenario: Room not found message
- **WHEN** a player is sent back to the menu because the room code was not found
- **THEN** a message naming the code shows above the name field, the code field keeps the code and is marked invalid

### Requirement: Joining a room by code or link
The join field SHALL show a placeholder matching the real code format (6 characters). It SHALL accept either a room code or a pasted invite link; when the value contains `/room/<code>`, the client SHALL join `<code>`. Surrounding whitespace SHALL be ignored. The field SHALL submit on Enter. An empty field SHALL NOT submit.

#### Scenario: Paste a link
- **WHEN** a player pastes `https://endead.endea.ar/room/k3j9x2` into the join field and taps `Unirme`
- **THEN** the client navigates to `/room/k3j9x2` and joins that room

#### Scenario: Type a code
- **WHEN** a player types ` k3j9x2 ` and presses Enter
- **THEN** the client joins room `k3j9x2`

#### Scenario: Empty field
- **WHEN** the join field is empty and the player taps `Unirme`
- **THEN** nothing happens

### Requirement: Invite block in the lobby
The lobby SHALL open with an invite block showing the room code in large text, a `Copiar enlace` button that copies `<origin>/room/<code>`, and a one-line hint telling the player to send the link or code to friends. After a successful copy the button SHALL read `¡Copiado!` for about 1.2 seconds. If copying fails, a toast SHALL show the link so it can be copied by hand. While the local player is alone in the room the invite block SHALL be visually emphasised (existing pulse).

#### Scenario: Copy link
- **WHEN** the host taps `Copiar enlace` in room `k3j9x2`
- **THEN** the clipboard holds `https://endead.endea.ar/room/k3j9x2` and the button reads `¡Copiado!` briefly

#### Scenario: Alone in the room
- **WHEN** the host is the only player in the lobby
- **THEN** the invite block is emphasised and the players list shows `1/6`

#### Scenario: Clipboard unavailable
- **WHEN** both clipboard methods fail
- **THEN** a warning toast shows the full join link

### Requirement: Lobby layout per viewport
The lobby SHALL present these sections: invite, your name and character grid, players list, map and options, and a bottom bar with the start action (host) or waiting line (others) and `Salir de la sala`. The bottom bar SHALL stay pinned to the bottom of the viewport (respecting the safe-area inset) while the rest scrolls. On portrait viewports the sections SHALL stack in one column in the order listed. On landscape viewports at least 700px wide the character grid SHALL sit in one column and invite, players, map and options in the other. No lobby viewport from 360px wide up SHALL scroll horizontally. Invented copy with no game meaning (`HOSTILE DENSITY: MEDIUM`) SHALL be removed.

#### Scenario: Host on portrait phone
- **WHEN** the host is in the lobby on a 390x844 phone with the page scrolled to the top
- **THEN** the invite block is at the top and the start button is visible at the bottom without scrolling

#### Scenario: Landscape phone
- **WHEN** a player is in the lobby on a 844x390 phone
- **THEN** the character grid and the other sections are side by side and the bottom bar is visible

#### Scenario: Desktop
- **WHEN** a player is in the lobby on a 1440x900 window
- **THEN** the two columns are centred with a bounded total width and the bottom bar spans those columns

### Requirement: Start button states
For the host the start button SHALL read `Empezar partida` with the ready count (`2/3 listos`) and SHALL be disabled until every player has chosen a character. When disabled, the bottom bar SHALL name the players without a character (`Falta elegir: Ana, Ben`). Non-hosts SHALL see `Esperando a que <host> empiece`. Starting behaviour is unchanged.

#### Scenario: Someone not ready
- **WHEN** Ana (host) and Ben are in the lobby and Ben has no character
- **THEN** the start button is disabled and the bar names Ben as missing a character

#### Scenario: Non-host
- **WHEN** Ben is in Ana's room
- **THEN** Ben sees `Esperando a que Ana empiece` instead of a start button

### Requirement: Character grid usable by thumb
The character grid SHALL show 3 columns on viewports under 480px wide and on the landscape layout's character column, with every cell at least 44px in both dimensions and showing the character portrait and name. A character taken by another player SHALL be disabled and show that player's name. The local player's selection SHALL be marked. Tapping an available character SHALL select it and open its dossier as today. The dossier modal SHALL fit a 844x390 landscape phone with its body scrolling and its close control visible.

#### Scenario: Portrait phone grid
- **WHEN** the lobby is shown on a 360x640 phone
- **THEN** the six characters appear in two rows of three with names readable

#### Scenario: Taken character
- **WHEN** Ben has chosen Wanda and Ana views the grid
- **THEN** Wanda's cell is disabled and shows `Ben`

#### Scenario: Dossier on landscape phone
- **WHEN** Ana taps Doug on a 844x390 phone
- **THEN** the dossier opens with the close button visible and its content scrollable

### Requirement: Game-over screen fits phones
The game-over card SHALL fit within a 360x640 portrait and a 844x390 landscape viewport without clipping its title, message or actions. It SHALL show `¡Victoria!`, `Derrota` or `Partida abandonada` with the matching message, the host SHALL see `Jugar de nuevo`, and other players SHALL see `Esperando al anfitrión…`. Behaviour of the actions is unchanged.

#### Scenario: Defeat on landscape phone
- **WHEN** the survivors lose on a 844x390 phone
- **THEN** the full card including its message is visible without scrolling

#### Scenario: Abandoned game
- **WHEN** a player named Ben leaves and the game ends as abandoned
- **THEN** the card reads `Partida abandonada` and `Ben abandonó la partida.`
