# Spanish Copy Specification

## Purpose

Ensure all player-facing text is in Spanish (rioplatense register, Zombicide Spanish-edition terms), sourced from one shared strings module, including server-authored messages and id-based display names.

## Requirements

### Requirement: All player-facing text is Spanish
Every text a player can read or hear through assistive technology in the menu, lobby, game screen and game-over screen SHALL be in Spanish. This covers visible labels, buttons, headings, placeholders, toasts, banners, modal titles and bodies, event card and event log entries, keyboard help, tooltips (`title`), `aria-label`s, the document title, and `<html lang="es">`. Excluded: player-chosen names, character proper names (Wanda, Doug, Amy, Ned, Elle, Josh), map names authored in map files, the dev-only map editor (`/editor`), and developer console logs.

#### Scenario: Menu in Spanish
- **WHEN** a player opens `/`
- **THEN** the page has `lang="es"` and shows `Tu nombre`, `Crear sala` and `Unirme`, with no English words

#### Scenario: Keyboard help
- **WHEN** a player presses `?` during a game
- **THEN** every shortcut description in the help is in Spanish

#### Scenario: Screen reader label
- **WHEN** a screen reader focuses the log button in the top bar
- **THEN** it announces a Spanish label such as `Registro de eventos`

### Requirement: One shared strings module
All player-facing text SHALL be defined in `src/strings/es.ts`, imported by client and server code. Fixed text SHALL be plain string properties; text with values SHALL be functions taking those values (for example `notEnoughActions(required)`). UI and handler code SHALL NOT contain player-facing string literals outside this module, except markup-only glyphs (`·`, `→`, `×`, `●`) and numbers. The module SHALL have no runtime dependencies and no locale detection.

#### Scenario: Editing a label
- **WHEN** a developer wants to change the End Turn button label
- **THEN** they change one entry in `src/strings/es.ts` and every place that shows it updates

#### Scenario: Text with a value
- **WHEN** a player lacks actions for a 2-action move
- **THEN** the server rejection message is produced by a module function with `required = 2`

### Requirement: Rioplatense register and plain wording
Copy SHALL address the player with `vos` (`Elegí`, `Copiá`, `Es tu turno`) and SHALL use plain words over military jargon (`Nombre` not `Call sign`, `Superviviente` not `Operative`, `Opciones` not `Rules of engagement`). Casing SHALL be sentence case in the strings; any uppercase look SHALL come from CSS.

#### Scenario: Turn toast
- **WHEN** the local player's turn starts
- **THEN** the toast reads `Es tu turno`

#### Scenario: Waiting line
- **WHEN** Wanda's player is active and the local player is someone else
- **THEN** the turn line reads `Esperando a Wanda`

### Requirement: Zombicide Spanish edition terms
Game terms SHALL follow the Spanish edition of Zombicide 2nd Edition and be used consistently across all screens and server messages, according to the glossary in the design document. At minimum: Survivor = Superviviente, Walker = Caminante, Runner = Corredor, Brute = Bruto, Abomination = Abominación, Danger level = Nivel de peligro (Azul, Amarillo, Naranja, Rojo), XP = PX, Action = Acción, Wound = Herida, Noise = Ruido, Search = Buscar, Backpack = Mochila, Hand = Mano, Objective = Objetivo, Exit = Salida, Spawn = Aparición, Zombie phase = Fase de zombis, Round = Ronda.

#### Scenario: Spawn entry in the log
- **WHEN** the zombie phase spawns 2 walkers and 1 runner in a zone
- **THEN** the log entry lists `2 Caminantes, 1 Corredor` for that zone

#### Scenario: Danger level
- **WHEN** a survivor reaches 7 XP
- **THEN** the HUD shows danger level `Amarillo` and XP as `PX`

### Requirement: Server-authored messages in Spanish
Messages created on the server and shown to players SHALL come from the strings module: action rejection messages delivered as `ACTION_FAILED` and other error payloads the client displays, history and `lastAction` `description`s, and objective descriptions. Error `code`s, rejection conditions and state shape SHALL NOT change. Throws that guard internal invariants and are unreachable in normal play MAY stay in English.

#### Scenario: Rejected action toast
- **WHEN** a player tries to act with no actions left
- **THEN** the rejection toast is in Spanish and the error code is still `ACTION_FAILED`

#### Scenario: Attack description
- **WHEN** a survivor attacks with a pistol needing 4+
- **THEN** the event card reads a Spanish description naming `Pistola` and `4+`

### Requirement: Display names looked up by id
Equipment, skills, zombie types and danger levels SHALL be shown with Spanish names resolved from their stable ids (`equipmentId`, skill id, enum value) through the strings module. Registry `name` fields used by server logic SHALL NOT be changed. Every id in `EQUIPMENT_CARDS`, `EPIC_EQUIPMENT_CARDS`, `SKILL_DEFINITIONS`, the zombie type enum and the danger level enum SHALL have a Spanish entry; a missing entry SHALL fail a unit test.

#### Scenario: Item card
- **WHEN** a survivor holds the `fire_axe` card
- **THEN** the item card shows `Hacha de bombero` while `card.name` in state is still `Fire Axe`

#### Scenario: New item without a translation
- **WHEN** a developer adds an equipment id without a Spanish name
- **THEN** `npm test` fails naming that id
