// src/client/NetworkManager.ts

import { ActionRequest } from '../types/Action';
import { gameStore } from './GameStore';

export class NetworkManager {
  private ws: WebSocket | null = null;
  private url: string;

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

  public connect(): void {
    if (this.ws) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      console.log('NetworkManager: Connected to server.');
      if (this.onConnected) this.onConnected();
    };
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'STATE_UPDATE') {
          gameStore.update(message.payload);
        } else if (message.type === 'ERROR') {
          console.error('Server Error:', message.payload);
        }
      } catch (e) {
        console.error('NetworkManager: Failed to parse message', e);
      }
    };
    this.ws.onerror = (e) => console.error('NetworkManager: WebSocket error', e);
  }

  public joinGame(playerId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('NetworkManager: Not connected, cannot join game.');
      return;
    }

    const message = {
      type: 'JOIN',
      payload: { playerId },
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
}

export const networkManager = new NetworkManager();
