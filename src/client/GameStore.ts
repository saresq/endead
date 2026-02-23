// src/client/GameStore.ts

import { GameState, initialGameState } from '../types/GameState';

type StateListener = (state: GameState, prevState: GameState | null) => void;
type Unsubscribe = () => void;

/**
 * A simple, immutable store for the client-side game state.
 * It holds the authoritative server state and emits updates.
 * It strictly prevents local mutation by freezing the state object.
 */
export class GameStore {
  private _state: GameState;
  private listeners: Set<StateListener> = new Set();

  constructor(initialState: GameState = initialGameState) {
    this._state = this.freezeDeep(initialState);
  }

  /**
   * Returns the current immutable state.
   */
  get state(): GameState {
    return this._state;
  }

  /**
   * Replaces the current state with a new state from the server.
   * This triggers all subscription callbacks.
   * 
   * @param newState The new authoritative state.
   */
  public update(newState: GameState): void {
    if (newState === this._state) return;

    const prevState = this._state;
    // Freeze the new state before storing to prevent accidental mutation by UI
    this._state = this.freezeDeep(newState);
    
    this.notify(prevState);
  }

  /**
   * Subscribe to state changes.
   * 
   * @param listener Callback function receiving (newState, prevState)
   * @returns Unsubscribe function
   */
  public subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener);
    // Return unsubscribe closure
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clears all listeners.
   */
  public destroy(): void {
    this.listeners.clear();
  }

  // --- Internal Helpers ---

  private notify(prevState: GameState | null): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this._state, prevState);
      } catch (e) {
        console.error('Error in GameStore subscription:', e);
      }
    });
  }

  /**
   * Deeply freezes an object to enforce immutability.
   * In production, this might be disabled for performance, 
   * but it's critical for development correctness.
   */
  private freezeDeep<T>(obj: T): T {
    // Basic types don't need freezing
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // If already frozen, return
    if (Object.isFrozen(obj)) {
      return obj;
    }

    // Freeze properties first
    Object.keys(obj).forEach((prop) => {
      const val = (obj as any)[prop];
      if (typeof val === 'object' && val !== null) {
        this.freezeDeep(val);
      }
    });

    // Freeze self
    return Object.freeze(obj);
  }
}

// Singleton instance (optional, depending on architecture)
export const gameStore = new GameStore();
