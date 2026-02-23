# Endead

A tactical turn-based zombie survival game built with PixiJS, TypeScript, and WebSockets.

## Features
- **Multiplayer**: Supports up to 6 players in a single game room.
- **Turn-Based**: Strict turn enforcement with action points (AP).
- **Tactical**: Grid-based movement, search, and combat.
- **Server Authoritative**: All game logic runs on the server; client is a dumb renderer.
- **Deterministic**: Replay system ensures consistent state across clients.

## Project Structure
- `src/client`: Frontend logic (PixiJS renderer, input controller, game store).
- `src/server`: Backend logic (WebSocket server, state management).
- `src/services`: Shared game logic (ActionProcessor, TurnManager, ReplayService).
- `src/types`: Shared TypeScript interfaces.

## Local Development

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Running Locally
To develop, you need to run the backend and frontend separately.

1. **Start the Backend Server**
   ```bash
   npm run server
   ```
   Server runs on `ws://localhost:8080`.

2. **Start the Frontend Client** (in a new terminal)
   ```bash
   npm run dev
   ```
   Client runs on `http://localhost:5173`.

The client will automatically connect to `ws://localhost:8080`.

## Deployment

### Deploying to Render (Free Tier)

This project is configured for a single-service deployment on Render's Free Web Service tier. The server handles both the WebSocket connections and serving the static frontend files.

1. **Create a New Web Service**
   - Connect your GitHub repository.
   - Choose **Node** as the environment.

2. **Configuration**
   - **Build Command:** `npm install && npm run build`
     - This installs dependencies and builds the Vite frontend to the `dist` folder.
   - **Start Command:** `npm start`
     - This starts the Express/WebSocket server in production mode.

3. **Environment Variables**
   - Render automatically sets the `PORT` variable. The server listens on this port.
   - No other environment variables are strictly required for the base game.

4. **Accessing the Game**
   - Once deployed, navigate to your Render URL (e.g., `https://your-app.onrender.com`).
   - The client will automatically connect to the WebSocket server on the same host (using `wss://` protocol).

### Important Notes for Free Tier
- **Spin Down:** The free instance spins down after 15 minutes of inactivity. The first request may take ~30 seconds to wake up.
- **Persistence:** In-memory game state is lost when the instance restarts or spins down. For persistence, a database (Redis/Postgres) would be needed (not included in this MVP).
