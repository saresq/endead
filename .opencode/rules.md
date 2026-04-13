# OpenCode Session Primer: Endead

Use this document as the default context for every OpenCode session in this repo.

## Project Identity
- Project name: **Endead**
- Purpose: **Zombicide 2nd Edition inspired web clone**
- Genre: Tactical, turn-based, cooperative zombie survival
- Platform: Browser-based multiplayer game
- Rule baseline: Preserve core Zombicide v2 gameplay feel unless explicitly told to change mechanics

## Tech Stack
- Frontend: `TypeScript`, `Vite`, `PixiJS`
- Backend: `Node.js`, `Express`, `ws` (WebSocket)
- Architecture: Server-authoritative game logic with deterministic state updates
- Build output: `dist/`

## Core Gameplay Model
- Multiplayer supports up to 6 players in one room
- Strict turn structure with Player Phase then Zombie Phase
- Action Point economy drives survivor turns
- Grid/zone tactical movement and zone-based combat interactions
- Zombie behavior includes spawn, movement, and attack automation
- XP and skills progression exists and should remain compatible with current data models

## Implementation Principles
- Server is source of truth for validation and state mutation
- Client should focus on rendering, input, and UI only
- Keep systems deterministic so replay/state sync remains reliable
- Prefer extending existing services before creating duplicate logic paths
- Maintain compatibility with current maps, action types, and save/state formats

## Current Core Systems (Expected to Work)
- Turn management and action processing
- Movement, search, noise, organize inventory, combat, open door, trade
- Zombie AI (pathing, target selection, danger-based spawning)
- HUD and tactical board rendering
- Win/loss framework and scenario support

## Important Paths
- `src/server/` - WebSocket server and room/state orchestration
- `src/services/` - Core gameplay logic (turns, actions, AI, combat, persistence)
- `src/client/` - Renderer, input, UI panels, game store
- `src/types/` - Shared contracts for actions, map, and game state
- `data/` - Local state/history/map data used by runtime tooling
- `ROADMAP.MD` - High-level progress and planned priorities

## Run and Verify
- Install: `npm install`
- Backend dev: `npm run server`
- Frontend dev: `npm run dev`
- Production build: `npm run build`
- Tests: `npm test`

## Session Defaults for OpenCode
- Assume requests should align with Zombicide v2 style mechanics and terminology
- Keep edits minimal, targeted, and consistent with existing architecture
- Do not rewrite stable systems when a localized fix is possible
- If a request is ambiguous, choose the option that preserves current gameplay contracts

## Editing Rule
When modifying an existing file, use the edit workflow (do not overwrite entire files with a blind write).
