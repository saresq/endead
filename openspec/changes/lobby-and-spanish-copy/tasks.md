## 1. Strings module

- [x] 1.1 Create `src/strings/es.ts` with the area groups from design D1, `plural(n, one, many)`, and accessors `equipmentName(card)`, `skillName(id)`, `skillDescription(id)`, `zombieLabel(type, n)` (design D2)
- [x] 1.2 Fill `equipment` (all `EQUIPMENT_CARDS` + `EPIC_EQUIPMENT_CARDS` ids), `skills` (all 43 ids, name + description), `zombies`, `danger`, `itemTypes`, `slots`, `roles`, `actions` (every `ActionType`), `zones` using the D6 glossary
- [x] 1.3 Add `src/strings/__tests__/es.test.ts`: every registry/enum id has an entry (failure names the id); `plural` and a few value functions format as expected

## 2. Server and shared messages

- [x] 2.1 `TurnManager.ts`, `ActionProcessor.ts` (`PENDING_WOUNDS`), `handlerUtils.ts`: player-reachable messages from `es.errors` (no player ids in text)
- [x] 2.2 Handlers — Combat, Movement, Door, Item, EpicCrate, Objective, Lobby, Trade, Skill, Cheat: player-reachable throws from `es.errors`; internal-invariant throws left as is (design D3)
- [x] 2.3 Handler `description`s from `es.log.*`, item names via `equipmentName`; door description `es.log.doorOpened(spawned)` without zone id (design D4)
- [x] 2.4 `ScenarioCompiler.describeWinCondition` and default objective descriptions from `es.objectives` (items via `equipmentName`, danger via `es.danger`)
- [x] 2.5 `server.ts`: client-displayed error messages (`SPECTATOR`, `NOT_HOST`, `INVALID_PHASE`, `INVALID_TARGET`, `IDENTITY_MISMATCH`, `UNAUTHORIZED`, `UNKNOWN_ERROR`) from `es.serverErrors`
- [x] 2.6 Update service tests that match English messages (`MoveCost`, `DoorHandlers`, `WinConditions.takeEpicCrate`, `FoodConsumption`, `PendingDecisions`) to assert against `es.*` values; run `npm test`

## 3. Shared client helpers and components

- [x] 3.1 `utils/zoneFormat.ts`: `formatActionType` looks up `es.actions` (title-case fallback), `formatZoneId` labels from `es.zones`
- [x] 3.2 `config/ZombieTypeConfig.ts` labels via `zombieLabel`; `eventLog.ts` board cues from `es.cues`
- [x] 3.3 `EventEntry.ts`: all labels, dice aria, reroll names, zombie-phase block from `es.log`; `OPEN_DOOR` uses description + payload zone, no `includes('spawned')`; update `EventEntry.test.ts` and `eventLog.test.ts` to `es.*` values
- [x] 3.4 `ItemCard.ts` (`es.itemTypes`/`es.slots`, slots free via `plural`, names via `equipmentName`), `SquadPlate.ts`, `StatCell.ts`, `PhotoSlot.ts`, `ActionButton.ts`, `LobbyDossier.ts` (danger labels, skills via `skillName`, weapon via `equipmentName`)
- [x] 3.5 `NotificationManager.ts` and `overlays/ModalManager.ts` aria/title text

## 4. Game screen copy

- [x] 4.1 `GameHUD.ts` top bar, turn line (`Es tu turno · N acciones`, `Esperando a <nombre>`, `Fase de zombis`), squad chips, action buttons and costs, loadout, vitals, aria/titles
- [x] 4.2 `GameHUD.ts` modals: wounds picker, wound distribution, skill choice (`es.danger`), Born Leader, food, pause menu, end game confirm, backpack, event log, trade partner, waiting banners, food-break objective warning
- [x] 4.3 `GameHUD.ts` toasts and game-over copy (design D9); raw `characterClass`/enum renders replaced
- [x] 4.4 `TradeUI.ts` and `PickupUI.ts`; move `trade.css` `content: 'DISCARD'` into a text node from `es.trade.discard`
- [x] 4.5 `InputController.ts` melee target picker; `PixiBoardRenderer.ts` tooltips and canvas text
- [x] 4.6 `KeyboardManager.ts` help modal and toasts (key names `Espacio`, `Esc`, `Inicio`)
- [x] 4.7 `main.ts`: create-room failure, cheat toast, `Es tu turno`, connection banners, menu messages for `ROOM_NOT_FOUND`/`SERVER_FULL`/`SESSION_REPLACED`/`KICKED`, action-failed fallback; delete dead `GAME_IN_PROGRESS` and `ROOM_FULL` branches
- [x] 4.8 `index.html`: `lang="es"`, `<title>Endead</title>`

## 5. Menu

- [x] 5.1 `MenuUI.ts`: merge into one card per design D7 with `es.menu` copy; placeholder `ej. k3j9x2`; kicker/`//` decorations removed; error state keeps invalid border and shake
- [x] 5.2 Export `parseRoomInput(value)` (code or `/room/<code>` link, trimmed) and use it in `submitJoin`; unit test in `src/client/__tests__/parseRoomInput.test.ts`
- [x] 5.3 `menu.css`: styles for the merged card, landscape-phone (`max-height: 500px`) compaction, join row stacks only under 360px; delete selectors no longer rendered (grep each first)

## 6. Lobby

- [x] 6.1 `LobbyUI.ts`: panel keys `invite`, `you`, `players`, `map`, `options`, `footer` per design D8, all copy from `es.lobby`/`es.connection`; remove `HOSTILE DENSITY` line, `CHARACTER_ROLES` → `es.roles`, `ROE_RULES` copy → `es.lobby.options`
- [x] 6.2 Invite block: large code, `Copiar enlace` button with `¡Copiado!` state reusing `handleRoomPillCopy`, hint line, pulse while alone; copy-failed toast in Spanish
- [x] 6.3 Footer: `Empezar partida · N/M listos`, `Falta elegir: …` line when disabled, `Esperando a que <anfitrión> empiece` for non-hosts, `Salir de la sala`
- [x] 6.4 Host-left banner, connection-lost scrim and meta line, kick modal, dossier modal title/subtitle in Spanish
- [x] 6.5 `lobby.css`: one-column portrait layout, two-column grid at `(orientation: landscape) and (min-width: 700px)` via `grid-area` per `data-panel`, sticky footer with safe-area padding, landscape-phone compaction, roster 3 columns everywhere, dossier modal `max-height: 100svh` with scrolling body
- [x] 6.6 Delete dead lobby CSS listed in design D10 (grep each class across `src/` before removing)

## 7. Game-over fit

- [x] 7.1 `hud.css` `.hud-game-over__card`: `max-height: calc(100svh - 32px)`, scrollable, reduced padding and title size under `(max-height: 500px)`

## 8. Verification

- [x] 8.1 `npm test` and `npm run build` pass
- [x] 8.2 Grep for leftover English in `src/client` (excluding `editor/`), `src/main.ts`, handlers and `server.ts` displayed messages; fix or justify each hit
- [x] 8.3 Browser check at 360x640, 390x844, 844x390 and 1440x900: menu (incl. room-not-found state), lobby as host alone, host with a second player not ready, guest joining by pasted link, dossier modal, a few game actions (attack, door with spawn, rejected action toast), keyboard help, event log, game over (victory, defeat). No horizontal scroll, no clipped Spanish labels, accents render in uppercase headings
