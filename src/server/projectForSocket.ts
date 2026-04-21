// src/server/projectForSocket.ts
//
// SwarmComms §3.7 / §3.7.1 — the single redaction choke point for every
// client-bound payload. All SNAPSHOT sends and any per-socket EVENTS frame
// with private info MUST route through this function. Never `ws.send` raw
// `GameState` directly.
//
// Redactions (see task 04 §A and SwarmComms.md §3.7.1):
//   - `seed`                                  → omitted for socket payloads
//                                               (always). `socket === null`
//                                               is the server-local view
//                                               (persistence) and retains
//                                               seed.
//   - `_attackIsMelee`, `_extraAPCost`        → lifted off `GameState` in
//                                               Step 3, but defensively
//                                               dropped here in case any
//                                               stray shim reintroduces
//                                               them.
//   - `lastAction.rollbackSnapshot`           → replaced by a single boolean
//                                               `lastAction.canLucky` gated
//                                               on shooter ownership +
//                                               reroll validity.
//                                               `originalDice` is surfaced
//                                               so the UI keeps the
//                                               "Original: [3,5,1]" render.
//   - `survivors[sid].drawnCard` /
//     `drawnCardsQueue`                       → hidden from non-owners;
//                                               owners see the real card.
//                                               Non-owners see
//                                               `hasDrawnCard` +
//                                               `queueLength`.
//   - `activeTrade.offers`                    → full offers only to the two
//                                               participants; non-
//                                               participants see
//                                               `{ offerCounts }` only.
//   - `equipmentDeck`/`spawnDeck`/`epicDeck`  → contents stripped on the
//                                               client path; counts
//                                               surfaced as
//                                               `equipmentDeckCount`, etc.
//                                               Discards remain public.

import type {
  GameState,
  Survivor,
  EquipmentCard,
  TradeSession,
} from '../types/GameState';

/**
 * Per-socket context used to drive private-channel redaction. Only the
 * viewing player's id is needed — survivor ownership is derived via
 * `state.survivors[id].playerId`.
 */
export interface SocketContext {
  playerId: string;
}

/** Client-facing survivor — `drawnCard` / `drawnCardsQueue` stripped unless
 *  the viewing socket owns the survivor. */
export type ClientSurvivor = Omit<Survivor, 'drawnCard' | 'drawnCardsQueue'> & {
  drawnCard?: EquipmentCard;
  drawnCardsQueue?: EquipmentCard[];
  hasDrawnCard?: boolean;
  queueLength?: number;
};

export type ClientTradeSession =
  | TradeSession
  | {
      activeSurvivorId: string;
      targetSurvivorId: string;
      /** Card counts per participant — leaks no IDs. */
      offerCounts: Record<string, number>;
      status: TradeSession['status'];
    };

export interface ClientLastAction {
  type: string;
  playerId: string;
  survivorId?: string;
  dice?: number[];
  hits?: number;
  description?: string;
  timestamp: number;
  rerolledFrom?: number[];
  rerollSource?: 'lucky' | 'plenty_of_bullets' | 'plenty_of_shells';
  bonusDice?: number;
  bonusDamage?: number;
  damagePerHit?: number;
  usedFreeAction?: boolean;
  freeActionType?: string;
  /** Set when the viewing socket owns the shooter AND the shooter still has
   *  an unspent Lucky AND a valid rollback snapshot exists on the server.
   *  Replaces `rollbackSnapshot` on the wire. */
  canLucky?: boolean;
  /** Surfaced from `rollbackSnapshot.originalDice` for UI rendering. Never
   *  includes seed or deck contents. */
  originalDice?: number[];
}

/** Client-facing game state shape. `seed` is stripped;
 *  `equipmentDeck`/`spawnDeck`/`epicDeck` replaced by counts. */
export type ClientGameState = Omit<
  GameState,
  | 'seed'
  | 'equipmentDeck'
  | 'spawnDeck'
  | 'epicDeck'
  | 'survivors'
  | 'activeTrade'
  | 'lastAction'
> & {
  equipmentDeckCount: number;
  spawnDeckCount: number;
  epicDeckCount: number;
  survivors: Record<string, ClientSurvivor>;
  activeTrade?: ClientTradeSession;
  lastAction?: ClientLastAction;
};

/** Server-local view (persistence). Retains seed + deck contents + private
 *  fields; only transient handler scratch is dropped. */
export type ServerLocalState = GameState;

// Overloads
export function projectForSocket(state: GameState, socket: null): ServerLocalState;
export function projectForSocket(state: GameState, socket: SocketContext): ClientGameState;
export function projectForSocket(
  state: GameState,
  socket: SocketContext | null,
): ServerLocalState | ClientGameState;
export function projectForSocket(
  state: GameState,
  socket: SocketContext | null,
): ServerLocalState | ClientGameState {
  if (socket === null) {
    return serverLocalView(state);
  }
  return clientView(state, socket);
}

function serverLocalView(state: GameState): ServerLocalState {
  // Defensive drop of transient scratch only. Seed / decks / private fields
  // stay — persistence needs them to restore the room.
  const bare = { ...state } as Record<string, unknown>;
  delete bare._attackIsMelee;
  delete bare._extraAPCost;
  delete bare.history;
  return bare as unknown as ServerLocalState;
}

function clientView(state: GameState, socket: SocketContext): ClientGameState {
  // 1. Shallow copy + drop server-only scalars. Nested subtrees that we
  //    rewrite (survivors, lastAction, activeTrade) are reassigned below;
  //    everything else keeps reference identity with the authoritative
  //    state — the payload is serialized immediately by the caller, so
  //    aliasing is safe.
  const {
    seed: _seed,
    equipmentDeck,
    spawnDeck,
    epicDeck,
    survivors,
    activeTrade,
    lastAction,
    ...rest
  } = state;

  const bareRest = rest as Record<string, unknown>;
  // Defensive drops for fields lifted off `GameState` in Step 3 — a
  // regression that re-adds them cannot silently leak via this choke point.
  delete bareRest._attackIsMelee;
  delete bareRest._extraAPCost;
  delete bareRest.history;

  void _seed;

  // 2. Survivors — owner gets full drawnCard / drawnCardsQueue; non-owners
  //    see counts only.
  const redactedSurvivors: Record<string, ClientSurvivor> = {};
  for (const [sid, survivor] of Object.entries(survivors)) {
    redactedSurvivors[sid] = projectSurvivor(survivor, socket);
  }

  // 3. Trade — participants see offers; others see offerCounts.
  const projectedTrade = activeTrade
    ? projectTrade(activeTrade, state, socket)
    : undefined;

  // 4. lastAction — rollbackSnapshot → canLucky boolean + originalDice pass-through.
  const projectedLast = lastAction
    ? projectLastAction(lastAction, state, socket)
    : undefined;

  return {
    ...(bareRest as Omit<
      GameState,
      | 'seed'
      | 'equipmentDeck'
      | 'spawnDeck'
      | 'epicDeck'
      | 'survivors'
      | 'activeTrade'
      | 'lastAction'
    >),
    equipmentDeckCount: equipmentDeck ? equipmentDeck.length : 0,
    spawnDeckCount: spawnDeck ? spawnDeck.length : 0,
    epicDeckCount: epicDeck ? epicDeck.length : 0,
    survivors: redactedSurvivors,
    activeTrade: projectedTrade,
    lastAction: projectedLast,
  };
}

function projectSurvivor(
  survivor: Survivor,
  socket: SocketContext,
): ClientSurvivor {
  const isOwner = survivor.playerId === socket.playerId;
  if (isOwner) {
    return { ...survivor };
  }

  const { drawnCard, drawnCardsQueue, ...rest } = survivor;
  const redacted: ClientSurvivor = { ...rest };
  if (drawnCard) {
    redacted.hasDrawnCard = true;
  }
  if (drawnCardsQueue && drawnCardsQueue.length > 0) {
    redacted.queueLength = drawnCardsQueue.length;
  }
  return redacted;
}

function projectTrade(
  trade: TradeSession,
  state: GameState,
  socket: SocketContext,
): ClientTradeSession {
  const activeSurvivor = state.survivors[trade.activeSurvivorId];
  const targetSurvivor = state.survivors[trade.targetSurvivorId];
  const isParticipant =
    (!!activeSurvivor && activeSurvivor.playerId === socket.playerId) ||
    (!!targetSurvivor && targetSurvivor.playerId === socket.playerId);

  if (isParticipant) return trade;

  const offerCounts: Record<string, number> = {};
  for (const [sid, cardIds] of Object.entries(trade.offers || {})) {
    offerCounts[sid] = Array.isArray(cardIds) ? cardIds.length : 0;
  }
  return {
    activeSurvivorId: trade.activeSurvivorId,
    targetSurvivorId: trade.targetSurvivorId,
    offerCounts,
    status: trade.status,
  };
}

function projectLastAction(
  lastAction: NonNullable<GameState['lastAction']>,
  state: GameState,
  socket: SocketContext,
): ClientLastAction {
  const { rollbackSnapshot, ...rest } = lastAction;
  const canLucky = computeCanLucky(lastAction, state, socket);
  const out: ClientLastAction = { ...rest };
  if (canLucky) out.canLucky = true;
  if (rollbackSnapshot?.originalDice) {
    out.originalDice = rollbackSnapshot.originalDice;
  }
  return out;
}

function computeCanLucky(
  lastAction: NonNullable<GameState['lastAction']>,
  state: GameState,
  socket: SocketContext,
): boolean {
  if (!lastAction.rollbackSnapshot) return false;
  if (!lastAction.survivorId) return false;
  const shooter = state.survivors[lastAction.survivorId];
  if (!shooter) return false;
  if (!shooter.skills?.includes('lucky')) return false;
  if (lastAction.luckyUsed) return false;
  return shooter.playerId === socket.playerId;
}
