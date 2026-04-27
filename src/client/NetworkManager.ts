// src/client/NetworkManager.ts

import { ActionRequest } from '../types/Action';
import { gameStore } from './GameStore';
import { applyPatch, StatePatch } from '../utils/StateDiff';

export class NetworkManager {
  private ws: WebSocket | null = null;
  private url: string;

  // Reconnection state
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxReconnectAttempts: number = 10;
  private intentionalClose: boolean = false;
  private pendingJoin: { playerId: string; roomId: string; name?: string } | null = null;

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else {
      // Auto-detect environment
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
      this.url = `${protocol}//${host}`;
    }
  }

  public onConnected?: () => void;
  public onDisconnected?: () => void;
  public onServerError?: (error: { code: string; message: string }) => void;
  /**
   * Fired just BEFORE each reconnect attempt is scheduled. The
   * optional third arg is the upcoming setTimeout delay in ms — used
   * by the connection-lost scrim to render a "next retry in Xs"
   * countdown. Existing 2-arg consumers continue to work.
   */
  public onReconnecting?: (attempt: number, maxAttempts: number, nextRetryDelayMs?: number) => void;

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.intentionalClose = false;

      // Re-send JOIN if reconnecting after a drop
      if (this.pendingJoin) {
        const msg = {
          type: 'JOIN',
          payload: this.pendingJoin,
        };
        this.ws!.send(JSON.stringify(msg));
      }

      if (this.onConnected) this.onConnected();
    };
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'STATE_UPDATE') {
          gameStore.update(message.payload);
        } else if (message.type === 'STATE_PATCH') {
          const patched = applyPatch(gameStore.state, message.payload as StatePatch);
          gameStore.update(patched);
        } else if (message.type === 'ERROR') {
          console.error('Server Error:', message.payload);
          if (this.onServerError) this.onServerError(message.payload);
        }
      } catch (e) {
        console.error('NetworkManager: Failed to parse message', e);
      }
    };
    this.ws.onerror = (e) => console.error('NetworkManager: WebSocket error', e);
    this.ws.onclose = () => {
      this.ws = null;
      if (this.intentionalClose) {
        if (this.onDisconnected) this.onDisconnected();
      } else {
        this.scheduleReconnect();
      }
    };
  }

  public disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    if (!this.ws) return;
    this.ws.close(1000, 'Client disconnect');
    this.ws = null;
  }

  public joinGame(playerId: string, roomId: string, name?: string): void {
    this.pendingJoin = { playerId, roomId, name };

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('NetworkManager: Not connected, cannot join game.');
      return;
    }

    const message = {
      type: 'JOIN',
      payload: { playerId, roomId, name },
    };
    this.ws.send(JSON.stringify(message));
  }

  public sendAction(action: ActionRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('NetworkManager: Not connected, cannot send action.');
      return;
    }

    const message = {
      type: 'ACTION',
      payload: action,
    };
    this.ws.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('NetworkManager: Max reconnect attempts reached.');
      if (this.onDisconnected) this.onDisconnected();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      + Math.random() * 1000;

    // Fire the callback with the UPCOMING attempt number and delay
    // BEFORE the setTimeout so the UI can start a countdown to the
    // retry. The first call (when reconnectAttempts=0) is the right
    // moment for the scrim to capture disconnectedAt.
    const nextAttempt = this.reconnectAttempts + 1;
    if (this.onReconnecting) {
      this.onReconnecting(nextAttempt, this.maxReconnectAttempts, delay);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}

export const networkManager = new NetworkManager();
