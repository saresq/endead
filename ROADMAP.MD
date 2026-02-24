# Endead Project Roadmap

This document outlines the current status of the **Endead** project (a Zombicide 2nd Edition web clone) and details the remaining steps required to reach a playable MVP.

## 1. Project Overview
**Endead** is a turn-based, tactical survival game built with:
- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: Vite, PixiJS, TypeScript
- **Architecture**: Server-Authoritative state, deterministic replay support.

## 2. Current Status (Implemented)

### Core Systems
- [x] **Game Loop**: Strict turn-based system with `Player Phase` and `Zombie Phase`.
- [x] **State Management**: Robust `GameState` definitions for Survivors, Zombies, Zones, and Cards.
- [x] **Action Processing**: Server-side validation and execution of player actions.
- [x] **Multiplayer Networking**: WebSocket server supporting up to 6 players with real-time state synchronization.

### Player Actions
- [x] **Move**: Grid-based movement logic with connectivity checks.
- [x] **Search**: Drawing from equipment deck, inventory limit checks, and discard logic.
- [x] **Make Noise**: Placing noise tokens to attract zombies.
- [x] **Organize**: Moving items between inventory slots (Body, Hand, Backpack).
- [x] **Choose Skill**: XP-based skill unlocking system.
- [x] **Resolve Search**: Logic for keeping or discarding drawn cards.
- [x] **Combat**: Attack action, dice rolling, weapon stats, damage application, friendly fire.
- [x] **Open Door**: Mechanics for opening doors, requiring equipment, and spawning noise.

### Zombie AI & Logic
- [x] **Spawning**: Danger-level based spawning logic (Blue, Yellow, Orange, Red).
- [x] **Activation**: Automated zombie turn handling (Move/Attack), including Runner double actions.
- [x] **Pathfinding**: BFS-based movement towards visible survivors or noise.
- [x] **Targeting**: Priority logic for attacking survivors in the same zone.

### Rendering (Client)
- [x] **Grid Rendering**: Procedural rendering of zones, connections, walls, and doors.
- [x] **Entity Rendering**: Distinct visual representation for Survivors and Zombies (Shapes).
- [x] **Interactive Map**: Click-to-move, Click-to-attack, Click-to-open-door.
- [x] **HUD**: Action bar, inventory, survivor dashboard, dice log, win/loss screens.

### Game Logic
- [x] **Win/Loss Conditions**: Logic for Victory (Reach Exit) and Defeat (All Dead).
- [x] **Scenarios**: "City Blocks" scenario implemented.

## 3. Missing for Complete (Prioritized)

To consider this project truly "Complete" and polished beyond the current MVP status, the following are required:

### High Priority (Gameplay)
1.  **Trade Action**: Implement the ability for survivors in the same zone to swap equipment. This is a core mechanic for Zombicide tactical play.
2.  **Scenario Objectives**: Expand the `Win/Loss` logic to support varied objectives (e.g., "Take Objective X", "Kill Abomination", "Collect Food") rather than just "Reach Exit".

### Medium Priority (Polish & Content)
3.  **Visual Assets**: Replace current geometric shape placeholders with sprites (Survivors, Zombies, Item Icons, Map Tiles).
4.  **Audio**: Add sound effects (Walk, Shoot, Groan, Door Open) and background music.
5.  **Animations**: Implement smooth tweens for movement and attack actions instead of instant teleportation/updates.

### Low Priority (Tooling & Infrastructure)
6.  **Map Editor**: Create a user-friendly tool to design and export custom scenarios/maps.
7.  **Persistence Layer**: Integrate a database (Redis/Postgres) to save active game sessions and player stats, replacing the current file-based system.
8.  **Lobby Robustness**: Handle player disconnects/reconnects more gracefully and allow dynamic joining.
