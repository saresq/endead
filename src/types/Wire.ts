// src/types/Wire.ts
//
// SwarmComms wire envelope (analysis/SwarmComms.md §3.1, §3.7.1).
//
// `EVENTS` is the per-action frame sent after every accepted action;
// `SNAPSHOT` is the full projected state (plus event-log tail) used on
// join, reconnect, and resync; `ERROR` surfaces action rejection.
//
// The canonical client-facing state shape is `ClientGameState` — defined
// by `projectForSocket` (the redaction choke point). Never import server
// `GameState` into client wire types.

import type { GameEvent } from './Events';
import type { ClientGameState } from '../server/projectForSocket';

export type { ClientGameState };

export interface EventsMessage {
  type: 'EVENTS';
  v: number;
  events: GameEvent[];
  /** Step 6 — present on the frame echoed back to the socket that SENT the
   *  action with a matching `actionId`. Non-acting sockets receive the same
   *  frame without this field. Used by `OptimisticStore.confirm` to drop a
   *  pending optimistic entry. */
  actionId?: string;
}

export interface SnapshotMessage {
  type: 'SNAPSHOT';
  v: number;
  state: ClientGameState;
  /** Tail of `room.eventLog` newer than the client's last-seen `v`. */
  tail: Array<{ v: number; events: GameEvent[] }>;
}

export interface ErrorMessage {
  type: 'ERROR';
  v: number;
  actionId?: string;
  reason: string;
  /** Retained for back-compat with existing server-error shape
   *  (`sendError({ code, message })`). Prefer `reason` for new callers. */
  code?: string;
  message?: string;
}

/** Client → server control messages (resync on gap detection). */
export interface SnapshotRequestMessage {
  type: 'SNAPSHOT_REQUEST';
  lastSeenVersion?: number;
}

export type ServerToClientMessage =
  | EventsMessage
  | SnapshotMessage
  | ErrorMessage;

export type ClientToServerMessage = SnapshotRequestMessage;

export type WireMessage = ServerToClientMessage;
