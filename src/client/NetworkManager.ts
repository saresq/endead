// src/client/NetworkManager.ts
//
// SwarmComms §3.1 / §3.8 / Step 6: the client WebSocket adapter.
//   - `SNAPSHOT` — full projected state + eventLog tail. Overwrites the
//     store. Used on JOIN / reconnect / explicit resync.
//   - `EVENTS`   — per-action batched events. Mutates the store in place;
//                  triggers `onNeedsSnapshot` on a version gap. When the
//                  frame carries an `actionId` that matches a pending
//                  optimistic entry, the entry is confirmed (snapshot
//                  discarded, no rollback).
//   - `ERROR`    — shaped `{v, actionId?, reason, code?, message?}`. `code`
//                  + `message` retained for legacy UI branches. When
//                  `actionId` matches a pending optimistic entry, the
//                  reversal snapshot is applied (D20 snapshot-only rollback).
//
// Optimistic send path (Step 6 / §3.3.2 narrowed whitelist):
//   1. If the intent is whitelisted AND no optimistic action is pending AND
//      no pending CHOOSE_SKILL (D10) when this is a skill-sensitive action,
//      generate an `actionId`, capture a path-targeted snapshot, run the
//      predictor (which reuses the server handler verbatim → parity by
//      construction), fan the emitted events out to `subscribeEvents`
//      listeners, and send `{type: 'ACTION', payload: { ...action, actionId }}`.
//   2. On EVENTS echo: confirm (drop pending).
//   3. On ERROR echo: rollback via snapshot; surface reason via
//      `onServerError`.

import { ActionRequest } from '../types/Action';
import { gameStore } from './GameStore';
import type { GameState } from '../types/GameState';
import type { GameEvent } from '../types/Events';
import {
  optimisticStore,
  captureSnapshot,
  generateActionId,
  OPTIMISTIC_WHITELIST,
} from './OptimisticStore';
import { getPredictor } from './predictors';
import { ActionType } from '../types/Action';

export class NetworkManager {
  private ws: WebSocket | null = null;
  private url: string;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxReconnectAttempts = 10;
  private intentionalClose = false;
  private pendingJoin: { playerId: string; roomId: string; name?: string } | null = null;

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8080' : window.location.host;
      this.url = `${protocol}//${host}`;
    }

    // Route store-detected version gaps back to the server.
    gameStore.onNeedsSnapshot = () => this.requestSnapshot();
  }

  public onConnected?: () => void;
  public onDisconnected?: () => void;
  public onServerError?: (error: { code: string; message: string }) => void;
  public onReconnecting?: (attempt: number, maxAttempts: number) => void;

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.intentionalClose = false;

      if (this.pendingJoin) {
        this.ws!.send(JSON.stringify({ type: 'JOIN', payload: this.pendingJoin }));
      }

      if (this.onConnected) this.onConnected();
    };
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleServerMessage(message);
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

  private handleServerMessage(message: any): void {
    switch (message?.type) {
      case 'SNAPSHOT': {
        // A SNAPSHOT is authoritative and supersedes any optimistic state.
        // Clear all pending optimism — their snapshots are meaningless
        // against the replaced state, and the server already rolled back
        // anything it rejected.
        optimisticStore.clear();
        // The projected client state AT message.v IS authoritative — any
        // tail events the server includes have v ≤ message.v and have
        // already been applied to the server state that produced `state`.
        // We MUST NOT re-apply them through `applyEvents` (it would:
        //   - double-mutate state, and
        //   - trigger the gap-detection loop because each tail event's v
        //     is ≤ the store's already-bumped version).
        // Fan the tail events out to `subscribeEvents` listeners only —
        // renderers/animations that want a replay scrubber can opt in.
        const state: GameState = message.state;
        state.version = message.v ?? state.version ?? 0;
        gameStore.update(state);
        const tail: Array<{ v: number; events: GameEvent[] }> = message.tail ?? [];
        if (tail.length > 0) {
          gameStore.replayEventsForListenersOnly(tail);
        }
        break;
      }
      case 'EVENTS': {
        // If the server confirmed an optimistic action, drop its pending tag
        // BEFORE applying the events (so subsequent predictions, if queued,
        // see an empty optimistic store). No rollback is needed — the
        // predictor reuses the server handler so the pre-applied mutation
        // matches the confirming events' shape; `applyEvents` below is
        // idempotent for the overlapping subset.
        if (typeof message.actionId === 'string') {
          optimisticStore.confirm(message.actionId);
        }
        gameStore.applyEvents(message.v, message.events ?? []);
        break;
      }
      case 'ERROR': {
        // D20 — snapshot-only rollback. Only triggers if the error carries
        // the actionId of a still-pending optimistic entry. If no match
        // (server-side validation that didn't originate from an optimistic
        // send, or the entry was already resolved), just surface the error.
        if (typeof message.actionId === 'string') {
          const entry = optimisticStore.take(message.actionId);
          if (entry) {
            gameStore.rollbackOptimistic(entry.snapshot);
          }
        }
        const legacyPayload = {
          code: message.code ?? 'ERROR',
          message: message.message ?? message.reason ?? 'Unknown error',
        };
        console.error('Server Error:', legacyPayload);
        if (this.onServerError) this.onServerError(legacyPayload);
        break;
      }
      // Back-compat: STATE_UPDATE path was removed in Step 4. Log loudly if
      // a legacy frame slips through — it means a server path skipped
      // `projectForSocket` / `broadcastEvents`.
      case 'STATE_UPDATE':
      case 'STATE_PATCH': {
        console.error('NetworkManager: received legacy wire frame', message.type);
        break;
      }
      default:
        console.warn('NetworkManager: unknown message type', message?.type);
    }
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

    this.ws.send(JSON.stringify({ type: 'JOIN', payload: { playerId, roomId, name } }));
  }

  public sendAction(action: ActionRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('NetworkManager: Not connected, cannot send action.');
      return;
    }

    const actionId = this.tryOptimisticApply(action);
    const payload = actionId ? { ...action, actionId } : action;
    this.ws.send(JSON.stringify({ type: 'ACTION', payload }));
  }

  /** Attempt optimistic prediction. On success returns the generated
   *  `actionId` so the caller can tag the outgoing `ACTION` payload.
   *  Returns `null` when the action is not whitelisted, not depth-1 MOVE,
   *  another optimistic action is pending, the skill-sensitive gate (D10)
   *  fires, or the predictor throws (pre-validation failure — the action
   *  will still be sent to the server which returns the canonical ERROR). */
  private tryOptimisticApply(action: ActionRequest): string | null {
    if (!optimisticStore.shouldApplyOptimistically(action)) return null;

    const predictor = getPredictor(action.type);
    if (!predictor) return null;

    const actionId = generateActionId();
    // Snapshot BEFORE the predictor runs — reviewer #5 requires path-targeted,
    // no full-state clone.
    const snapshot = captureSnapshot(action, gameStore.state);

    let events: GameEvent[] | null = null;
    try {
      events = gameStore.applyOptimistic((state) => predictor(state, action));
    } catch (e) {
      // Predictor threw during validation (e.g. precondition failure). Nothing
      // was mutated before the throw under §3.10 rule 1 (validate-first),
      // but we still have to make sure no partial state sticks — pass the
      // snapshot through rollback defensively.
      gameStore.rollbackOptimistic(snapshot);
      return null;
    }

    optimisticStore.record({
      actionId,
      type: action.type,
      survivorId: action.survivorId,
      snapshot,
      events,
      skillEffectBearing: action.type === ActionType.CHOOSE_SKILL,
    });
    return actionId;
  }

  /** Ask the server for a full SNAPSHOT — triggered when GameStore detects
   *  a version gap or after a connection drop. */
  public requestSnapshot(lastSeenVersion?: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'SNAPSHOT_REQUEST',
        payload: { lastSeenVersion: lastSeenVersion ?? gameStore.state.version ?? 0 },
      }),
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('NetworkManager: Max reconnect attempts reached.');
      if (this.onDisconnected) this.onDisconnected();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      + Math.random() * 1000;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      if (this.onReconnecting) this.onReconnecting(this.reconnectAttempts, this.maxReconnectAttempts);
      this.connect();
    }, delay);
  }
}

// Re-export so external callers can inspect the whitelist (e.g., tests).
export { OPTIMISTIC_WHITELIST };

export const networkManager = new NetworkManager();
