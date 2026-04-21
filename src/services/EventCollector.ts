// src/services/EventCollector.ts
//
// SwarmComms event collector (analysis/SwarmComms.md §3.4, §3.7, §3.10).
//
// Threaded through every handler so emissions are append-only and out-of-order
// safe. The collector is also the channel for transient handler→dispatcher
// scratch (`extraAPCost`, `attackIsMelee`) — these used to live on `GameState`
// (`_extraAPCost`, `_attackIsMelee`) but were lifted off in Step 3 (D2/D18) so
// they can no longer leak into broadcasts or persistence.

import type { GameEvent } from '../types/Events';

/** Recipients for a single event (§3.7). `'public'` (or an absent field)
 *  fans out to every socket in the room; a `SurvivorId[]` routes only to
 *  sockets whose player owns one of the listed survivors. `broadcastEvents`
 *  auto-emits redacted public variants for hidden events (CARD_DRAWN →
 *  CARD_DRAWN_HIDDEN, TRADE_OFFER_UPDATED → TRADE_OFFER_UPDATED_HIDDEN). */
export type EventRecipients = 'public' | string[];

export interface CollectedEvent {
  event: GameEvent;
  recipients: EventRecipients;
}

export class EventCollector {
  private entries: CollectedEvent[] = [];

  // Scratch — handler-to-dispatcher channel, never touches GameState.
  extraAPCost?: number;
  attackIsMelee?: boolean;

  /** Append a public event. */
  emit(event: GameEvent): void {
    this.entries.push({ event, recipients: 'public' });
  }

  /** Append a private event routed to the listed survivor-owning sockets.
   *  `broadcastEvents` handles the public redaction variant. */
  emitPrivate(event: GameEvent, survivorIds: string[]): void {
    this.entries.push({ event, recipients: survivorIds });
  }

  /** Drain with recipient tags preserved (new consumers: broadcastEvents). */
  drainTagged(): CollectedEvent[] {
    const out = this.entries;
    this.entries = [];
    return out;
  }

  /** Legacy drain — returns raw events without recipient tags.
   *  Consumers that don't care about privacy routing (eventLog tail,
   *  tests that only assert emission order) use this. */
  drain(): GameEvent[] {
    const out = this.entries.map((e) => e.event);
    this.entries = [];
    return out;
  }
}
