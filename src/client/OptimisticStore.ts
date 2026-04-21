// src/client/OptimisticStore.ts
//
// SwarmComms §3.3.2, §3.8, Step 6, D10, D20 — client-side optimistic apply.
//
// Responsibilities:
//   - Whitelist the narrow Tier-1 action set that is safe to predict locally
//     (see `OPTIMISTIC_WHITELIST`).
//   - Capture a path-targeted reversal snapshot BEFORE the predictor runs. Only
//     the touched subtree is cloned (≤200 B typical). Full-state clones are
//     forbidden on this path (reviewer #5).
//   - On server confirmation (EVENTS frame carrying a matching `actionId`),
//     drop the pending tag and discard the snapshot — the optimistic mutation
//     and the server-authoritative mutation are the same shape by construction
//     (predictors reuse server handlers; see `src/client/predictors.ts`), so
//     no rewind is needed when the server agrees.
//   - On server rejection (ERROR frame with the `actionId`), reverse-apply the
//     snapshot — restoring the touched subtree to its pre-action shape. This
//     is the ONLY rollback mechanism per D20: snapshot-only, no inverse events.
//   - D10 — suppress NEW optimism on Tier-1 actions that read `survivor.skills`
//     (today: MOVE) while any pending CHOOSE_SKILL is in flight, so predictors
//     never consult a speculative skill set.
//   - Cascade safety — while any optimistic action is pending, subsequent
//     whitelisted actions send NON-optimistically until the first resolves.
//     This serialization guarantees invariant #8: rejecting one action never
//     rolls back an independent one (there is never more than one in flight).

import type { EquipmentCard, GameState, Survivor } from '../types/GameState';
import type { GameEvent } from '../types/Events';
import { ActionRequest, ActionType } from '../types/Action';

/** The seven action types that may be optimistically predicted (§3.3.2). Any
 *  wider set is an immediate FAIL under the reviewer's scope check. */
export const OPTIMISTIC_WHITELIST: ReadonlySet<ActionType> = new Set<ActionType>([
  ActionType.MOVE,
  ActionType.RELOAD,
  ActionType.ORGANIZE,
  ActionType.END_TURN,
  ActionType.CHOOSE_SKILL,
  ActionType.TRADE_START,       // PROPOSE_TRADE in §3.3.2 nomenclature
  ActionType.TRADE_OFFER,       // UPDATE_TRADE_OFFER in §3.3.2 nomenclature
]);

/** Tier-1 actions whose predictor reads `survivor.skills` and therefore must
 *  not run while a CHOOSE_SKILL is pending (D10). Keep this in sync with the
 *  skills consulted in `predictors.ts`. */
export const SKILL_SENSITIVE_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  ActionType.MOVE,
]);

/** Path-targeted reversal snapshot. Each field is a deep clone of ONLY the
 *  subtree the predictor mutates. Absent fields were not touched. */
export interface OptimisticSnapshot {
  survivors?: Record<string, Survivor>;
  /** `null` marker means the field was absent pre-action and must be deleted
   *  on rollback. A present object means restore to this value. */
  lastAction?: GameState['lastAction'] | null;
  activeTrade?: GameState['activeTrade'] | null;
  equipmentDiscard?: EquipmentCard[];
}

export interface OptimisticEntry {
  actionId: string;
  type: ActionType;
  survivorId?: string;
  snapshot: OptimisticSnapshot;
  events: GameEvent[];
  /** True iff confirming this action would change a survivor's skill set — i.e.
   *  it is a CHOOSE_SKILL. Used by D10 suppression. */
  skillEffectBearing: boolean;
}

let idCounter = 0;

/** Monotonic + random-suffix id. Uniqueness is required per §3.8 (`pending:
 *  actionId` tags) but cryptographic strength is not — local counter + random
 *  suffix is collision-free in practice across a single client session. */
export function generateActionId(): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `opt-${Date.now().toString(36)}-${idCounter}-${rand}`;
}

export class OptimisticStore {
  private pending: Map<string, OptimisticEntry> = new Map();

  /** Is any optimistic action currently pending server confirmation? */
  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /** D10 — any pending action that would mutate a survivor's skill set.
   *  Today that is exactly CHOOSE_SKILL; if the whitelist ever widens to
   *  another skill-mutating action, flag it at `record()` time. */
  hasPendingSkillEffect(): boolean {
    for (const entry of this.pending.values()) {
      if (entry.skillEffectBearing) return true;
    }
    return false;
  }

  /** Whitelist membership. MOVE is further filtered by `isMoveDepthOne`. */
  isWhitelisted(actionType: ActionType): boolean {
    return OPTIMISTIC_WHITELIST.has(actionType);
  }

  /** MOVE depth-2 (`plus_1_zone_per_move`) is explicitly non-optimistic per
   *  §3.3.2 — the intermediate-zombie stop logic differs enough from server
   *  that a reject would snap back across two tiles. A depth-2 move arrives
   *  with `payload.path.length > 1` (see `InputController.sendMoveAction`).
   *  Depth-1 uses `payload.targetZoneId`. */
  isMoveDepthOne(intent: ActionRequest): boolean {
    if (intent.type !== ActionType.MOVE) return true;
    const path = intent.payload?.path as string[] | undefined;
    if (Array.isArray(path) && path.length > 1) return false;
    return true;
  }

  /** Top-level decision: should this action be predicted optimistically?
   *  Combines whitelist + MOVE depth-1 + serialization + D10 skill gate. */
  shouldApplyOptimistically(intent: ActionRequest): boolean {
    if (!this.isWhitelisted(intent.type)) return false;
    if (!this.isMoveDepthOne(intent)) return false;
    // Serialize: no cascades. One pending at a time.
    if (this.hasPending()) return false;
    // D10: if a CHOOSE_SKILL is pending and this action reads survivor.skills,
    // force a server round-trip so the predictor doesn't read a speculative
    // skill set.
    if (SKILL_SENSITIVE_ACTIONS.has(intent.type) && this.hasPendingSkillEffect()) {
      return false;
    }
    return true;
  }

  record(entry: OptimisticEntry): void {
    this.pending.set(entry.actionId, entry);
  }

  get(actionId: string): OptimisticEntry | undefined {
    return this.pending.get(actionId);
  }

  /** Drop a pending entry on server confirmation. The snapshot is discarded;
   *  NO rollback is applied — the optimistic state is accepted. Subsequent
   *  EVENTS from the server apply on top and are idempotent for the subset
   *  of mutations the predictor already performed. */
  confirm(actionId: string): OptimisticEntry | undefined {
    const entry = this.pending.get(actionId);
    this.pending.delete(actionId);
    return entry;
  }

  /** Consume an entry for rollback on ERROR. The caller restores the snapshot
   *  via `GameStore.rollbackOptimistic`. */
  take(actionId: string): OptimisticEntry | undefined {
    const entry = this.pending.get(actionId);
    this.pending.delete(actionId);
    return entry;
  }

  size(): number {
    return this.pending.size;
  }

  clear(): void {
    this.pending.clear();
  }
}

/** Build a path-targeted snapshot of the subtrees each whitelisted action's
 *  predictor mutates. Called BEFORE the predictor runs. Uses `structuredClone`
 *  on narrow fields only — never on `state` itself. */
export function captureSnapshot(intent: ActionRequest, state: GameState): OptimisticSnapshot {
  const snapshot: OptimisticSnapshot = {};
  const survivorId = intent.survivorId;

  if (survivorId && state.survivors[survivorId]) {
    snapshot.survivors = { [survivorId]: structuredClone(state.survivors[survivorId]) };
  }

  // `lastAction` is rewritten by MOVE / RELOAD predictors. `null` marker means
  // "was absent pre-action; delete on rollback".
  snapshot.lastAction = state.lastAction ? structuredClone(state.lastAction) : null;

  // ORGANIZE with targetSlot === 'DISCARD' (and trade acceptance) move cards
  // into state.equipmentDiscard — snapshot it so rollback restores the pile.
  if (intent.type === ActionType.ORGANIZE) {
    snapshot.equipmentDiscard = structuredClone(state.equipmentDiscard);
  }

  // TRADE_START creates state.activeTrade; TRADE_OFFER mutates its offers.
  if (intent.type === ActionType.TRADE_START || intent.type === ActionType.TRADE_OFFER) {
    snapshot.activeTrade = state.activeTrade ? structuredClone(state.activeTrade) : null;
  }

  return snapshot;
}

/** Reverse-apply a snapshot to `state`. Mutates in place. Ordering is fixed:
 *  restore survivors first, then top-level fields. Delete-markers (`null`) are
 *  honored for fields that were absent pre-action. */
export function applySnapshot(state: GameState, snapshot: OptimisticSnapshot): void {
  if (snapshot.survivors) {
    for (const [id, survivor] of Object.entries(snapshot.survivors)) {
      state.survivors[id] = survivor;
    }
  }
  if ('lastAction' in snapshot) {
    if (snapshot.lastAction === null) delete state.lastAction;
    else state.lastAction = snapshot.lastAction;
  }
  if ('activeTrade' in snapshot) {
    if (snapshot.activeTrade === null) delete state.activeTrade;
    else state.activeTrade = snapshot.activeTrade;
  }
  if (snapshot.equipmentDiscard) {
    state.equipmentDiscard = snapshot.equipmentDiscard;
  }
}

/** Shared singleton; NetworkManager + tests both consult it. */
export const optimisticStore = new OptimisticStore();
