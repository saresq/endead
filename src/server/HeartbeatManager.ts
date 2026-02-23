// src/server/HeartbeatManager.ts

import { WebSocket, WebSocketServer } from 'ws';

const PING_INTERVAL = 20000; // 20 seconds

export class HeartbeatManager {
  private aliveStatus = new WeakMap<WebSocket, boolean>();
  private intervalId: NodeJS.Timeout | null = null;
  private wss: WebSocketServer;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
  }

  public start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        // If not alive, terminate
        if (this.aliveStatus.get(ws) === false) {
          console.log('[Heartbeat] Client unresponsive, terminating connection.');
          return ws.terminate();
        }

        // Mark as dead until pong received
        this.aliveStatus.set(ws, false);
        
        // Send ping
        ws.ping();
      });
    }, PING_INTERVAL);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public markAlive(ws: WebSocket): void {
    this.aliveStatus.set(ws, true);
  }

  public handleConnection(ws: WebSocket): void {
    this.markAlive(ws);
    
    // Register pong handler
    ws.on('pong', () => {
      this.markAlive(ws);
    });
  }
}
