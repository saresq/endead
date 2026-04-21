// src/server/broadcastEvents.ts
//
// SwarmComms §3.7: routing helpers for per-socket EVENTS frames.
// Extracted from `server.ts` so they can be unit-tested without spinning up
// a WebSocketServer. `broadcastEvents` itself still lives in `server.ts`
// (it touches `room.clients` + `ws.send`), but the payload-shaping logic
// here is what determines privacy correctness.

import type { GameEvent } from '../types/Events';
import type { GameState } from '../types/GameState';
import type { CollectedEvent } from '../services/EventCollector';

/** Map a private event to its public redaction variant. Throws when a
 *  handler emits `emitPrivate` for an event type that has no registered
 *  public variant — silently dropping events for non-recipients would
 *  desync their state. Register the public form here as soon as a new
 *  private event kind lands. */
export function publicVariantOf(event: GameEvent): GameEvent | null {
  switch (event.type) {
    case 'CARD_DRAWN':
      return { type: 'CARD_DRAWN_HIDDEN', survivorId: event.survivorId };
    case 'TRADE_OFFER_UPDATED':
      return {
        type: 'TRADE_OFFER_UPDATED_HIDDEN',
        offererSurvivorId: event.offererSurvivorId,
        count: event.offerCardIds.length,
      };
    default:
      // Non-private events have no hidden variant; dropping them for
      // non-recipients is the wrong shape (they should have been emitted
      // as public). Fail loudly in dev; in prod fall back to `null` so the
      // event disappears from the public log rather than leaking raw.
      const msg = `[broadcastEvents] No public variant for private event ${(event as GameEvent).type}`;
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(msg + ' — add it to publicVariantOf or emit as public.');
      }
      // eslint-disable-next-line no-console
      console.error(msg);
      return null;
  }
}

/** Build the ordered event list that `viewerPlayerId` should receive for a
 *  single broadcast. Public events pass through unchanged; private events
 *  pass through iff the viewer owns one of the listed survivors, otherwise
 *  they collapse to their public variant.
 *
 *  `state.survivors` is consulted for ownership (survivor.playerId →
 *  viewerPlayerId). Spectators never own a survivor so they always get the
 *  redacted variant. */
export function projectEventsForPlayer(
  tagged: CollectedEvent[],
  viewerPlayerId: string,
  state: GameState,
): GameEvent[] {
  const out: GameEvent[] = [];
  for (const { event, recipients } of tagged) {
    if (recipients === 'public') {
      out.push(event);
      continue;
    }
    const isRecipient = recipients.some((sid) => {
      const s = state.survivors[sid];
      return s && s.playerId === viewerPlayerId;
    });
    if (isRecipient) {
      out.push(event);
    } else {
      const pub = publicVariantOf(event);
      if (pub) out.push(pub);
    }
  }
  return out;
}

/** Reduce a tagged batch to its public-only projection. `appendEventLog`
 *  uses this so reconnecting clients replaying the log tail can never
 *  learn another player's past card draws — every private event has
 *  collapsed to its hidden variant before landing on disk. */
export function publicProjection(tagged: CollectedEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (const { event, recipients } of tagged) {
    if (recipients === 'public') {
      out.push(event);
    } else {
      const pub = publicVariantOf(event);
      if (pub) out.push(pub);
    }
  }
  return out;
}
