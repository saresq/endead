## Why

Endead is played by friends in Argentina, mostly on phones, but every screen is in English written as military jargon (`CALL SIGN`, `OPERATIVE ROSTER`, `BEGIN OPERATION`, `RULES OF ENGAGEMENT`), and the lobby is a narrow stack of seven panels where the host scrolls past the map and options to reach Start, and the way to invite a friend is a small `ROOM` chip. This is stage 3 of 4 of the UI rework (stage 1 `board-camera-and-mobile-shell` and stage 2 `feedback-and-event-log` are done); stage 4 handles the visual skin.

## What Changes

- **Spanish copy everywhere a player reads it**: menu, lobby, character dossier, HUD, sheet, rails, modals (backpack, trade, pickup, search, skills, wounds, log), toasts, connection banners, game-over screen, keyboard help, `aria-label`/`title` text, `<html lang>` and the page title. Rioplatense register (`vos`: `Elegí tu superviviente`, `Es tu turno`), plain words instead of military jargon, game terms from the Spanish Zombicide edition (Superviviente, Caminante, Corredor, Bruto, Abominación, Nivel de peligro, PX, Ruido, Mochila).
- **One strings module** `src/strings/es.ts`, shared by client and server: plain `const` objects and small functions for text with values (`notEnoughActions(2)`). No i18n framework, no locale switch.
- **Server-authored text uses the module**: action rejection messages (shown as toasts), history `description`s shown in the event card and log, objective descriptions, and server error messages the client displays. Only the strings change; codes, conditions and state shape stay the same.
- **Display names by id**: equipment, skills, zombie types and danger levels get Spanish names looked up by their existing ids (`equipmentId`, skill id, enum values). Registry `name` fields stay as they are, because server logic compares them (`c.name === 'Flashlight'`).
- **Menu**: one card with name, `Crear sala`, and `Unirme a una sala` with a 6-character code field that also accepts a pasted invite link. Placeholder matches the real code format (currently shows `XXXX-XXXX`).
- **Lobby layout**: invite block first (big room code, `Copiar enlace` button, one-line hint), then name + character grid, players list, map and options; Start/Leave pinned to the bottom of the viewport so the host never scrolls to start. Two columns on landscape phones and desktop, one column on portrait phones. Remove invented copy that means nothing (`HOSTILE DENSITY: MEDIUM`).
- **Character select**: roster grid sized for thumbs on portrait phones (3 per row), taken characters show the player's name; dossier modal fits phone landscape.
- **Game-over screen**: Spanish copy, card fits phone portrait and landscape.
- **Dead CSS**: lobby/menu selectors no longer rendered after the rework are deleted from `lobby.css` and `menu.css`.

Out of scope: colours, fonts and skin (stage 4); gameplay, rules and server logic; new invite features (share sheet, QR); language switching; translating the dev-only map editor.

## Capabilities

### New Capabilities
- `spanish-copy`: all player-facing text in Spanish (rioplatense, Zombicide edition terms), sourced from one shared strings module, including server-authored messages and id-based display names.
- `lobby-flow`: menu, lobby, character select and game-over screens usable on phone portrait, phone landscape and desktop; room invite and join made obvious.

### Modified Capabilities

(none; stage 1–2 specs quote English literals such as `YOUR TURN` and `Your turn`. Their behaviour is unchanged, the text now comes from the strings module in Spanish.)

## Impact

- New: `src/strings/es.ts` (plus unit test for id coverage and formatting helpers).
- Client: `src/client/ui/MenuUI.ts`, `LobbyUI.ts`, `GameHUD.ts`, `TradeUI.ts`, `PickupUI.ts`, `NotificationManager.ts`, `overlays/ModalManager.ts`, `components/*` (LobbyDossier, EventEntry, ItemCard, SquadPlate, PlayerAvatar, …), `src/client/KeyboardManager.ts`, `src/client/InputController.ts`, `src/main.ts`, `index.html`.
- Server/shared (strings only): `src/services/handlers/*`, `src/services/ActionProcessor.ts`, `src/services/ScenarioCompiler.ts`, other `src/services/*` throw sites reachable in play, `src/server/server.ts` error messages.
- CSS: `src/styles/components/lobby.css`, `menu.css` (layout, dead selectors removed), `hud.css` only where Spanish text is longer and overflows (game-over card, buttons).
- Tests asserting English copy are updated to the Spanish strings (via the module, not duplicated literals).
- No new dependencies, no API or state shape changes. Client and server deploy together (`deploy.sh endead`).
