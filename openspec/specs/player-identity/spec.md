# Player Identity Specification

## Purpose

Define which `playerId` and nickname a client uses, which store holds them, and how a single browser can hold more than one player identity at a time.

## Requirements

### Requirement: Persistent identity by default
A client that has never been given a `tab` parameter SHALL keep its `playerId` and nickname in `localStorage` under the keys `endead_player_id` and `endead_nickname`. The identity SHALL survive closing the tab, closing the browser, and reopening a room URL, so that a player who closes a tab by accident rejoins as the same player and reclaims their survivor rather than being admitted as a spectator.

#### Scenario: Accidental close mid-game
- **WHEN** a player in a running game closes the tab and reopens the room URL
- **THEN** the client JOINs with the same `playerId` and the server restores them to their survivor

#### Scenario: Reload
- **WHEN** a player reloads the page, or leaves the room through the pause menu (which reloads)
- **THEN** the client keeps the same `playerId` and nickname

#### Scenario: Unchanged for ordinary players
- **WHEN** no `tab` parameter has ever been present in the tab
- **THEN** the client reads and writes exactly the `localStorage` keys it used before this change, with no added entries in either store

### Requirement: A tab can claim its own identity
Loading any URL carrying a `tab` query parameter SHALL make that tab use `sessionStorage` for its `playerId` and nickname instead of `localStorage`. The parameter SHALL need no value: its presence is the whole signal. Because `sessionStorage` is scoped to one top-level browsing context, two such tabs in the same browser SHALL hold two distinct `playerId` values and SHALL therefore be able to sit in the same room as two players without either terminating the other's socket.

#### Scenario: Two tabs, two players
- **WHEN** one tab opens `/room/<id>` and another tab in the same browser opens `/room/<id>?tab`
- **THEN** both tabs stay connected, the lobby lists two players, and neither receives `SESSION_REPLACED`

#### Scenario: The parameter needs no value
- **WHEN** a tab loads `/?tab`
- **THEN** it claims its own identity, exactly as `/?tab=2` would

#### Scenario: Blocked storage degrades instead of crashing
- **WHEN** a tab loads `/?tab` in a context that blocks `sessionStorage` (private mode, blocked site data, an embedded webview)
- **THEN** the tab falls back to the stored `localStorage` identity and the page still loads, and one console warning states that the tab shares the stored identity and may be replaced

#### Scenario: A claiming tab does not disturb the stored identity
- **WHEN** a tab loads `/?tab`, mints an identity, types a nickname into the menu field (which writes on every keystroke) and renames itself again in the lobby
- **THEN** the `localStorage` values of `endead_player_id` and `endead_nickname` are never written, and an ordinary tab opened afterwards is still the original player under the original name

### Requirement: The claim outlives the URL
Once a tab holds a `playerId` in `sessionStorage`, that tab SHALL keep using `sessionStorage` for the rest of its life, whether or not `tab` is still in the URL. This SHALL hold across the `pushState` calls that rewrite the location to `/room/<id>` or `/` without a query string, and across a full page reload.

#### Scenario: Entering a room drops the parameter
- **WHEN** a tab loads `/?tab`, creates a room, and the location becomes `/room/<id>` with no query string
- **THEN** the tab keeps the identity it minted and does not fall back to the stored one

#### Scenario: Leaving a room reloads the page
- **WHEN** that tab leaves the room, which rewrites the location to `/` and reloads
- **THEN** the tab still holds its own identity on the entry screen

#### Scenario: An independently opened tab does not inherit the claim
- **WHEN** a tab is opened on its own — not duplicated from and not opened by another tab — on a URL with no `tab` parameter
- **THEN** it uses the stored `localStorage` identity, whatever other tabs are doing

#### Scenario: The claim is taken while the parameter is still readable
- **WHEN** a tab loads `/?tab`, types a nickname on the entry screen, and only then creates or joins a room
- **THEN** it plays under its own identity, because the identity was claimed at load and not at the first moment something happened to need it

### Requirement: Nickname follows the identity
Every read and write of the nickname SHALL use the same store as the `playerId` of that tab, including the fallback that shows the `playerId` when no nickname is set.

#### Scenario: Renaming in the lobby
- **WHEN** a tab holding its own identity changes its name in the lobby
- **THEN** the new name is stored for that tab only, and the ordinary player's stored nickname is unchanged

#### Scenario: Default name
- **WHEN** a tab that has claimed its own identity has set no nickname
- **THEN** its stored name is its generated `playerId`, which differs from every other tab's
