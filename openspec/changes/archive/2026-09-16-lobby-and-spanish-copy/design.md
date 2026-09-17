## Context

- Stages 1–2 are done: the game screen has `rail | sheet | side` layouts (`layoutQueries.ts`), a latest-event card, an event log and a turn line. Their labels were placeholders for this stage.
- Copy today is English, a lot of it military jargon, and lives inline in about 25 files:
  - Client: `GameHUD.ts` (~120 strings), `LobbyUI.ts` (~60), `TradeUI.ts`, `PickupUI.ts`, `MenuUI.ts`, `KeyboardManager.ts` (help), `InputController.ts` (melee target picker), `main.ts` (toasts, connection banners, menu messages), `components/*` (`EventEntry`, `ItemCard`, `LobbyDossier`, `SquadPlate`, `StatCell`, `PhotoSlot`, `ActionButton`), `NotificationManager`, `ModalManager`, `eventLog.ts` (board cues), `PixiBoardRenderer.ts` (tooltips, canvas text), `utils/zoneFormat.ts` (`formatActionType`, `formatZoneId`), `config/ZombieTypeConfig.ts`.
  - Server/shared: ~55 player-reachable `throw new Error` messages in `src/services/handlers/*` and `TurnManager.ts` (surfaced as `ACTION_FAILED` toasts via `ActionProcessor.ts:324` → `main.ts:372`), ~45 more that guard malformed payloads, 10 `lastAction.description`s copied into history, `ScenarioCompiler.describeWinCondition`, and `server.ts` error messages shown by `main.ts` (`SPECTATOR`, `NOT_HOST`, `IDENTITY_MISMATCH`, …).
  - Data: 29 equipment names, 43 skill names and descriptions, zombie type labels, danger level enum values rendered raw (`reached ORANGE`), `card.type · slot` rendered raw (`WEAPON · HAND_1`).
- Logic reads English copy in five places: `CombatHandlers.ts:186` (`hand1.name === hand2.name`), `:195` (`'Plenty of Bullets'`), `ItemHandlers.ts:74` (`'Flashlight'`), `:110` (`d.name === card.name`), and `EventEntry.ts:155` (`description.includes('spawned')`).
- `index.html` meta and OG text is already Spanish; `<html lang="en">`, `<title>endead</title>`.
- Menu placeholder `XXXX-XXXX` does not match real room ids (`Math.random().toString(36).slice(2, 8)`, 6 lowercase alphanumerics). Pasting a full invite link into the join field fails today.
- Lobby is one column (`max-width: 420px`, 520px from 960px) of eight panels: briefing (title `LOBBY` + small room chip), player plate (name input), squad, roster (2 columns under 480px), area (map select + fake `HOSTILE DENSITY: MEDIUM`), rules of engagement (one toggle), footer (already `position: sticky`). The host scrolls through all of it to reach Start. The room chip is the only invite affordance.
- Server is run from source with `tsx` (Dockerfile), so a module under `src/` is importable by both client (Vite) and server with no build changes.
- User decisions: rioplatense `vos`; one shared strings module used by client and server; id-based display names so registry `name`s stay.

## Goals / Non-Goals

**Goals:**
- A Spanish-speaking player on a phone never sees English and never has to decode jargon.
- One file to find and edit any text.
- Host can invite and start from a phone without hunting; guest can join from a pasted link.

**Non-Goals:**
- i18n framework, language switcher, runtime locale loading, pluralisation library.
- Colours, fonts, skin, iconography (stage 4).
- Rules, server behaviour, error codes, state shape.
- Share sheet, QR code, room discovery.
- Translating the dev-only map editor (`/editor`) or console logs.
- Removing unused components unrelated to menu/lobby (`StatBar.ts`, `ZombieBadge.ts`); note only.

## Decisions

### D1. `src/strings/es.ts`: plain nested object, functions for values
One module exports `const es = { … } as const` (imported as `import { es } from '../strings/es'`), grouped by area: `common`, `menu`, `lobby`, `connection`, `hud`, `actions`, `modals`, `trade`, `pickup`, `log`, `cues`, `keys`, `gameOver`, `errors` (server rejections), `serverErrors` (server.ts codes), `objectives`, `equipment`, `skills`, `zombies`, `danger`, `itemTypes`, `slots`, `roles`. Fixed text is a string; text with values is an arrow function (`notEnoughActions: (n: number) => \`Te faltan acciones (necesitás ${n})\``). A tiny `plural(n, one, many)` helper lives in the same file; English `s`-suffix ternaries become calls to it.

If the file passes ~800 lines it may split into `src/strings/es/*.ts` re-exported by `src/strings/es.ts`; import sites do not change.

Why: greppable, typed (a typo in a key fails `tsc`), no runtime cost, no dependency. Rejected: JSON files (lose typed functions for interpolation), a `t('key')` lookup (stringly typed, needs a framework-like layer the user ruled out), keeping strings inline and just translating (fails "one place").

Escaping stays where it is today: module functions return plain text; UI code escapes player-provided values before or after, exactly as now (`escapeHtml(name)` passed in). Module functions never return HTML.

### D2. Display names by id, registries untouched
`es.equipment: Record<string, string>` keyed by `equipmentId` (registry key), `es.skills: Record<string, { name: string; description: string }>` keyed by skill id, `es.zombies: Record<ZombieType, { one: string; many: string }>`, `es.danger: Record<DangerLevel, string>`, `es.itemTypes`, `es.slots`. Accessors `equipmentName(card)` (falls back to `card.name` when `equipmentId` is missing), `skillName(id)`, `skillDescription(id)`, `zombieLabel(type, n)`.

Server descriptions that embed an item name use `equipmentName(card)` too, so state still holds English `name` while every visible string is Spanish.

A Vitest test (`src/strings/__tests__/es.test.ts`) iterates `EQUIPMENT_CARDS`, `EPIC_EQUIPMENT_CARDS`, `SKILL_DEFINITIONS`, `ZombieType`, `DangerLevel`, `EquipmentType` and slot values and fails naming any id without an entry.

Why: the five logic sites that compare names keep working with zero logic edits, CollectItems win conditions keep matching, and tests like `EquipmentDeck.audit` stay valid. Rejected: renaming registry `name`s to Spanish and switching comparisons to `equipmentId` (touches combat and item logic this stage must not change; can be done later on its own).

### D3. Server messages: swap literals, keep structure
Each player-reachable `throw new Error('…')` / `message: '…'` becomes `throw new Error(es.errors.xxx)` or `es.errors.xxx(args)`; `code`s and conditions are untouched. Messages that leak ids get friendlier text without the id (`It is currently player-123's turn…` → `No es tu turno.`; `Zones not connected: a -> b` → `Esas zonas no están conectadas.`). Internal-invariant throws (missing payload, not found, wrong owner, `EquipmentManager`, `LineOfSight`, `MapMigration`, `Rng`, `ReplayService`) stay English: the spec allows it and they only surface on client bugs. Rule of thumb for the implementer: if a normal player tap can trigger it, translate it.

`server.ts` messages the client displays via `error.message` (`SPECTATOR`, `NOT_HOST`, `INVALID_PHASE`, `INVALID_TARGET`, `IDENTITY_MISMATCH`, `UNAUTHORIZED`, `UNKNOWN_ERROR`) use `es.serverErrors`. Codes where `main.ts` uses its own text (`ROOM_NOT_FOUND`, `SERVER_FULL`, `SESSION_REPLACED`, `KICKED`) take their client text from `es.menu` and leave the server message as is. Protocol codes (`INVALID_JSON`, `UNKNOWN_TYPE`, …) stay English.

`main.ts` dead branches for `GAME_IN_PROGRESS` and `ROOM_FULL` (never sent by the server) are deleted rather than translated.

Tests that match English messages (`MoveCost` `need 4`, `DoorHandlers` `Resolve pending wounds`, `WinConditions.takeEpicCrate` /pending card/, `FoodConsumption` /cannot be used/, `PendingDecisions` `host`) assert against the module value (`toThrow(es.errors.notEnoughActions(4))`), not a duplicated Spanish literal. Internal-message tests (`LineOfSight`, `Migration.legacyMap`) are untouched.

### D4. History descriptions and the door parse
Handler descriptions come from `es.log.*` functions. `EventEntry.ts:155` stops parsing the description: the door handler description becomes `es.log.doorOpened(spawned)` (`Abrió una puerta` / `Abrió una puerta: ¡aparecieron zombis!`, no zone id), and `EventEntry` for `OPEN_DOOR` renders that description as the label with the zone from the payload as detail. Entries without a description (none expected after deploy; history is in-memory only) fall back to `es.log.doorOpenedShort`. `MOVE`/`SPRINT`/`CHARGE` keep ignoring the description. `formatActionType` becomes a lookup in `es.actions` keyed by `ActionType` with the current title-case transform as fallback for unmapped types. `formatZoneId` labels (`Zona de calle (x, y)`, `Zona de edificio`, `Aparición n`) move to `es.zones`.

Raw enum renders are fixed on the way: `ItemCard` shows `es.itemTypes[type] · es.slots[slot]`, skill choice shows `es.danger[level]`, `EventEntry` free action type uses `es.actions`.

Rejected: sending structured keys from the server and composing text on the client (right long-term, but a history format change is out of scope).

### D5. Register, tone, casing
- `vos` imperative and present: `Elegí`, `Copiá`, `Tocá`, `Esperá`, `Tenés`, `Necesitás`.
- Plain words. Replacements: Operative/Call sign → `Superviviente`/`Nombre`; Squad → `Jugadores`; Operative roster → `Elegí tu superviviente`; Area of operation → `Mapa`; Rules of engagement → `Opciones`; Begin operation → `Empezar partida`; Mission briefing / Lobby title → `Sala`; Standby/Ready → `Eligiendo`/`Listo`; Host → `Anfitrión`; Retrying handshake → `Reintentando`; AP → `acciones` in sentences, `Acc.` only where space is critical.
- Kickers with `//` decorations (`// ROOM NOT FOUND`, `SURVIVOR OPS // ENTRY`) become plain headings or disappear; stage 4 owns decorative treatment.
- Strings are sentence case; existing `text-transform: uppercase` rules keep the look. Strings currently hard-coded in caps in TS (`BEGIN OPERATION`, `LOADOUT`) become sentence case in the module; where the look must stay caps, the CSS already transforms or gets the transform added in the same selector (no new visual style).
- Character roles (`POINT · SCOUT`) become short Spanish roles in `es.roles` keyed by character name (`Wanda: 'Exploradora'`, `Doug: 'Líder'`, `Amy: 'Escurridiza'`, `Ned: 'Buscador'`, `Elle: 'Tiradora'`, `Josh: 'Peleador'`), aligned with each character's starting skill.
- Keyboard key names: `Espacio`, `Esc`, `Inicio`.

### D6. Glossary (Zombicide 2E, Spanish edition)
Used for UI, server messages, skills and items. Where the implementer cannot confirm the edition term, pick the plain literal translation and keep it consistent; record doubts in the task PR summary.

| English | Español |
|---|---|
| Survivor | Superviviente |
| Walker / Runner / Brute / Abomination | Caminante / Corredor / Bruto / Abominación |
| Zombie(s) | Zombi(s) |
| Danger level Blue/Yellow/Orange/Red | Nivel de peligro Azul/Amarillo/Naranja/Rojo |
| XP | PX |
| Action(s) / Free action | Acción(es) / Acción gratuita |
| Move / Sprint / Charge | Moverse / Esprintar / Carga |
| Search | Buscar |
| Open door | Abrir puerta |
| Make noise / Noise | Hacer ruido / Ruido |
| Melee / Ranged attack | Ataque cuerpo a cuerpo / a distancia |
| Accuracy / Dice / Damage / Range | Precisión / Dados / Daño / Alcance |
| Dual wield | Ambidiestro |
| Wound(s) | Herida(s) |
| Hand / Backpack / Inventory | Mano / Mochila / Inventario |
| Trade | Intercambiar |
| Objective / Exit / Epic weapon crate | Objetivo / Salida / Caja de armas épicas |
| Spawn / Spawn zone | Aparición / Zona de aparición |
| Player phase / Zombie phase / Round / Turn | Fase de jugadores / Fase de zombis / Ronda / Turno |
| End turn | Terminar turno |
| Lucky / Plenty of Bullets / Plenty of Shells | Suertudo / Munición de sobra / Cartuchos de sobra |
| Born Leader / Bloodlust / Lifesaver / Slippery / Sniper / Hit & Run | Líder nato / Sed de sangre / Salvavidas / Escurridizo / Francotirador / Golpear y correr |
| Is That All You've Got? | ¿Eso es todo lo que tenés? |
| Fire Axe / Crowbar / Pistol / Shotgun / Sniper Rifle / Baseball Bat / Chainsaw / Sawed-Off / Sub-MG | Hacha de bombero / Palanca / Pistola / Escopeta / Rifle de francotirador / Bate de béisbol / Motosierra / Recortada / Subfusil |
| Canned Food / Water / Bag of Rice / Flashlight | Comida en lata / Agua / Bolsa de arroz / Linterna |
| Katana / Machete / Kukri / Molotov / Aaahh!! | unchanged (proper or loan words) |
| Epic weapons with proper names (Zantetsuken, Gunblade, Golden AK-47, Evil Twins, Ma's Shotgun, Nailbat, …) | Keep proper names; translate descriptive ones (`AK-47 dorado`, `Kukri dorado`, `Escopeta de mamá`, `Bate con clavos`, `Rifle de francotirador militar`, `Escopeta automática`, `Gemelas malvadas`) |

### D7. Menu layout
One column, `max-width: 420px`, centred:
1. Wordmark `Endead` + subline `Apoka zombi · supervivencia cooperativa` (matches OG description).
2. Inline message (if any), above the form, `role=alert` for errors.
3. `Tu nombre` input.
4. `Crear sala` primary button.
5. Divider `o unite a una sala`.
6. `Código o enlace` input + `Unirme` button on one row (stacks under 360px only), placeholder `ej. k3j9x2`.
7. `Volver` ghost button when a message is shown (existing behaviour).

The two separate cards (`menu-card--id`, `menu-card--join`) merge into one card, so the standalone action/divider wrappers and their CSS go away. Landscape phones (height < 500px): reduce wordmark size and vertical padding so the card fits in ~1.5 screens; no side-by-side variant.

`parseRoomInput(value)` in `MenuUI.ts` (exported, unit tested): trim; if it matches `/\/room\/([a-zA-Z0-9_-]+)/` return the group; else return the trimmed value if it matches `^[a-zA-Z0-9_-]+$`; else return it anyway (server replies `ROOM_NOT_FOUND`, existing path). `main.ts` still validates via `parseRoomFromPath` rules on navigation.

### D8. Lobby layout
Panels keep the existing keyed in-place morph in `LobbyUI.render()`; only keys, order and markup change:

| key | content |
|---|---|
| `hostLeftBanner` | unchanged, Spanish |
| `invite` | heading `Invitá a tus amigos`, code in large mono text, `Copiar enlace` button (icon Copy → Check, label `¡Copiado!`), hint `Mandales el enlace o el código.`, pulse while alone. Replaces `briefing` (the `LOBBY` title and small chip go). |
| `you` | name input (`Tu nombre`) + character grid (`Elegí tu superviviente`). Merges `playerPlate` and `roster`; the separate avatar/status plate is dropped because the grid's selected cell and the players list already show it. |
| `players` | `Jugadores 2/6`, rows: name, `(vos)`, `Anfitrión` pill, character or `Eligiendo…`, `Listo` status |
| `map` | `Mapa` + select (host) or map name (others). Drops the fake density line. |
| `options` | `Opciones`: `Horda de abominaciones` toggle with a plain one-line description and `Difícil` chip; read-only for non-hosts. |
| `footer` | host: `Empezar partida · 2/3 listos` + missing line `Falta elegir: Ben`; others: `Esperando a que Ana empiece`; both: `Salir de la sala` |

CSS (`lobby.css`):
- `.lobby` becomes a column flex container; `.lobby__stack` scrolls; `.lobby-panel--footer` stays sticky with `padding-bottom: env(safe-area-inset-bottom)`.
- Portrait / narrow: one column, `max-width: 520px`, order as the table.
- `@media (orientation: landscape) and (min-width: 700px)`: `.lobby__stack` becomes a 2-column grid (`minmax(0, 1fr) minmax(0, 1fr)`, `max-width: 1040px`); `you` spans the left column rows; `invite`, `players`, `map`, `options` stack on the right; `hostLeftBanner` and `footer` span both columns. Done with `grid-area`s per `data-panel` so DOM order stays the portrait order (keyboard/screen reader order unchanged).
- Landscape phones (height < 500px): tighter panel padding, grid cells capped (`max-height` on portraits) so two rows of three fit.
- Roster: `repeat(3, minmax(0, 1fr))` at all widths (drops the 2-column `max-width: 480px` rule).
- Dossier modal: keep bottom-sheet style under 480px; add `max-height: 100svh` with scrolling body so it fits 844x390.

Rejected: a multi-step wizard (name → character → wait). More state and screens for the same information; the two-column/one-column page is simpler.

### D9. Game-over card
Copy only plus fit: `.hud-game-over__card` gets `max-height: calc(100svh - 32px)`, `overflow-y: auto`, and smaller padding/title under `(max-height: 500px)`. Title uses `es.gameOver.victory|defeat|abandoned`; messages `Todos los supervivientes escaparon.`, `Los zombis los superaron.`, `${name} abandonó la partida.`. Host: `Jugar de nuevo`; others: `Esperando al anfitrión…`. No new buttons.

### D10. Dead CSS removal
Delete in the files touched: `.lobby-briefing*`, `.lobby-room-chip*` (replaced by invite block classes), `.lobby-player*` (plate removed), `.lobby-area__sub`, `.lobby-dossier__chips`, `.lobby-dossier__quote`, `.lobby-panel--briefing`, the `nth-child(9|10)` stagger lines, the 2-column roster media query, `menu-card--join`, `menu-action--standalone`, `menu-divider--standalone` and any `menu-card__stripe`/header rules the merged card no longer renders. Before deleting, grep each class across `src/` (`rg -n "class-name"`) to confirm no other user. `zombie.css` `.zombie-spawn-entry` and unused `StatBar.ts`/`ZombieBadge.ts` are not menu/lobby and stay (noted for stage 4). `trade.css` `content: 'DISCARD'` moves to a real text node in TradeUI/PickupUI from `es.trade.discard`.

## Risks / Trade-offs

- [Spanish runs ~20–30% longer; buttons, chips, the sheet header and rail labels may overflow] → Check every layout at 360px wide and 844x390 after the copy pass; prefer shorter wording (`Terminar turno` over `Finalizar el turno`), allow wrapping in modal bodies, `text-overflow: ellipsis` only on single-line chips. No font-size changes (stage 4).
- [Uppercase transform on accented text in Oswald / Barlow Condensed] → Both include Latin Extended accents; verify `Á É Í Ó Ú Ñ ¿ ¡` render in a caps heading during the visual check.
- [Missed strings (≈350 sites)] → Task list is per file; final grep for common English words in `src/client` and handler messages (`rg -n "'[A-Z][a-z]+ [a-z]+" src/client src/services/handlers`) and a manual play-through on phone portrait.
- [Glossary terms differ from the printed Spanish edition] → Glossary in one table and all names in one module, so corrections are one-line edits.
- [Server and client must deploy together (server descriptions/rejections)] → Same repo, same `deploy.sh endead`; old history entries are not persisted, so there is no mixed-language log after restart.
- [Tests coupled to English messages] → Assert via `es.*` values so future copy edits don't break tests.
- [`EventEntry` door description change] → Covered by updated `EventEntry.test.ts` and `DoorHandlers.test.ts` (both spawned and not spawned).

## Migration Plan

Single deploy (`vps deploy endead`). No data migration: game state is in memory, registry names unchanged, maps unaffected. Rollback: redeploy previous commit.

## Open Questions

- Game-over has no way out for non-hosts other than the pause menu under the overlay or closing the tab. Adding `Salir` is a behaviour change; left for a follow-up if players ask.

## Findings for next steps (out of scope for this change)

Found while planning this stage. Not part of the tasks here. Each needs its own change or an explicit decision.

1. **Map editor and its write APIs are unprotected (security, highest priority).** `main.ts:413` opens `MapEditor` on `/editor` or `?editor`, and the server's catch-all (`server.ts:166`) serves `index.html` for any path, so anyone who knows the URL gets the editor on production. The endpoints behind it have no authentication: `POST /api/maps` (`server.ts:38`), `DELETE /api/maps/:id` (`:59`), `DELETE /api/tile-definitions` (`:102`), `POST /api/tile-definitions` (`:112`), `POST /api/tile-definitions/import` (`:127`). Anyone can overwrite or delete maps and tile definitions in the live SQLite volume, and `express.json({ limit: '50mb' })` (`:18`) accepts large bodies. Options to weigh: disable the write routes and the editor entry in production (`NODE_ENV=production`) and edit maps only locally, or put them behind a shared secret / Caddy basic auth. Back up the `endea_endead-data` volume before changing anything.
2. **Game-over screen traps non-hosts.** Only the host gets an action (`Jugar de nuevo`); others see `Esperando al anfitrión…` with no leave button on the overlay (`GameHUD.renderGameOver`). If the host is gone they must close the tab. Candidate: add `Salir de la sala` for everyone, reusing the lobby's leave-room behaviour.
3. **Unused components.** `src/client/ui/components/StatBar.ts` and `ZombieBadge.ts` are never imported (only a stale comment in `config/ZombieTypeConfig.ts:5` mentions `ZombieBadge`). CSS with no user: `zombie.css:213` `.zombie-spawn-entry` (with `content: 'SPAWN'`). Delete in stage 4 (skin) or a cleanup change, and fix the comment.
4. **Dead client branches.** `main.ts` handles `GAME_IN_PROGRESS` and `ROOM_FULL`, which the server never sends. This change deletes them (task 4.7). If late joining is ever blocked server-side, the menu message must come back.
5. **Server events carry English-shaped text, not structured data.** History `description`s are built on the server as sentences; this change translates them in place (D4). Long-term, sending structured fields (spawned, item ids, counts) and composing text on the client would remove description parsing entirely.
6. **Registry names used as logic keys.** `CombatHandlers.ts:186`, `:195` and `ItemHandlers.ts:74`, `:110` compare English `card.name`. This change works around it with id-based display names (D2). A later cleanup should compare `equipmentId` instead, after which registry names could be dropped or made Spanish.
