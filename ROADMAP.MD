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
- [x] **State Management**: robust `GameState` definitions for Survivors, Zombies, Zones, and Cards.
- [x] **Action Processing**: Server-side validation and execution of player actions.
- [x] **Multiplayer Networking**: WebSocket server supporting up to 6 players with real-time state synchronization.

### Player Actions
- [x] **Move**: Grid-based movement logic with connectivity checks.
- [x] **Search**: Drawing from equipment deck, inventory limit checks, and discard logic.
- [x] **Make Noise**: Placing noise tokens to attract zombies.
- [x] **Organize**: Moving items between inventory slots (Body, Hand, Backpack).
- [x] **Choose Skill**: XP-based skill unlocking system.
- [x] **Resolve Search**: Logic for keeping or discarding drawn cards.

### Zombie AI & Logic
- [x] **Spawning**: Danger-level based spawning logic (Blue, Yellow, Orange, Red).
- [x] **Activation**: Automated zombie turn handling (Move/Attack).
- [x] **Pathfinding**: BFS-based movement towards visible survivors or noise.
- [x] **Targeting**: Priority logic for attacking survivors in the same zone.

### Rendering (Client)
- [x] **Grid Rendering**: Procedural rendering of zones and connections based on configuration.
- [x] **Entity Rendering**: distinct visual representation for Survivors and Zombie types using geometric shapes.
- [x] **State Sync**: Client automatically reconciles state updates from the server.

## 3. MVP Roadmap (To-Do)

### Critical Gameplay Mechanics
- [x] **Combat System**
    - [x] Implement `ATTACK` action in `ActionProcessor`.
    - [x] Integrate `DiceService` for hit calculation (Accuracy check).
    - [x] Apply weapon stats (Range, Damage, Dual Wielding).
    - [x] Implement Friendly Fire logic (misses with ranged weapons hit survivors).
- [x] **Map Interaction**
    - [x] Implement `OPEN_DOOR` action (requires specific equipment like Fire Axe/Crowbar).
    - [ ] Implement `TRADE` action to swap items between survivors in the same zone.
- [ ] **Win/Loss Conditions**
    - Define specific scenario goals (e.g., "Reach Zone X", "Collect Objective Y").
    - Trigger "Game Over" when all survivors are dead.
    - Trigger "Victory" when objectives are met.

### UI/UX (Frontend)
- [x] **Lobby/Menu**: Simple screen to select a room and assign characters. (Single Session MVP implemented)
- [x] **In-Game HUD**:
    - [x] Action Bar: Buttons for Attack, Move, Open Door, Search.
    - [x] Inventory UI: Drag-and-drop interface for organizing equipment.
    - [x] Survivor Dashboard: Display Health, XP, Skills, and Danger Level.
    - [x] Dice Log: Visual feedback for combat results.
- [ ] **Interactive Map**: Click-to-move and Click-to-target functionality (InputController update).

### Content & Balancing
- [x] **Equipment Registry**: Populated with standard Zombicide weapons (Pan, Pistol, Fire Axe, Crowbar, Shotgun, Chainsaw, etc.).
- [x] **Spawn Registry**: Refactored for Danger Level scaling (Blue/Yellow/Orange/Red per card).
- [x] **Scenarios**: "City Blocks" scenario implemented with full map layout, buildings, and objectives.

## 4. Future Polish (Post-MVP)
- [ ] **Assets**: Replace geometric shapes with actual sprites (Survivors, Zombies, Tiles).
- [ ] **Sound**: Add SFX for gunshots, zombie groans, and background music.
- [ ] **Map Editor**: A tool to create and export custom map layouts.
- [ ] **Persistence**: Database integration (Redis/Postgres) to save active game sessions.
- [ ] **Animations**: Smooth movement tweens and attack animations.
