// src/client/GameStore.ts
//
// SwarmComms §3.4 / §3.8: client-side store driven by mutation-in-place +
// incremental `EVENTS` frames. SNAPSHOT overwrites state wholesale; each
// `applyEvent` batch mutates it and bumps `state.version` once (not per
// event). Dev mode freezes the state between batches so stray mutations
// outside `applyEvent` throw.
//
// Wire ordering (§3.8): a single WS delivers frames monotonically. Clients
// detect version gaps (saw `v = N + 2` without `v = N + 1`) and ask for a
// SNAPSHOT — exposed as `onNeedsSnapshot`.

import { GameState, initialGameState } from '../types/GameState';
import type { GameEvent } from '../types/Events';
import type { OptimisticSnapshot } from './OptimisticStore';
import { applySnapshot } from './OptimisticStore';

type StateListener = (state: GameState, prevState: GameState | null, prevVersion: number) => void;
type EventListener = (event: GameEvent, state: GameState) => void;
type Unsubscribe = () => void;

export class GameStore {
  private _state: GameState;
  private listeners: Set<StateListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private readonly shouldFreeze: boolean;

  /** Invoked when the store detects a version gap and needs a full
   *  snapshot to catch up. Wired from `NetworkManager`. */
  public onNeedsSnapshot: (() => void) | null = null;

  constructor(initialState: GameState = initialGameState) {
    this.shouldFreeze = !!(typeof import.meta !== 'undefined' && (import.meta as any)?.env?.DEV);
    this._state = this.shouldFreeze ? this.freezeDeep(initialState) : initialState;
  }

  get state(): GameState {
    return this._state;
  }

  /** Replace state wholesale (SNAPSHOT path). Notifies listeners with a
   *  non-null prevState so pre/post comparisons still work. */
  public update(newState: GameState): void {
    if (newState === this._state) return;
    const prevState = this._state;
    const prevVersion = prevState?.version ?? 0;
    this._state = this.shouldFreeze ? this.freezeDeep(newState) : newState;
    this.notify(prevState, prevVersion);
  }

  /** Apply an EVENTS batch. Bumps version once; thaws → mutates → refreezes
   *  (dev only) around the WHOLE batch per D14, so strict-mode writes
   *  don't trip mid-event-kind. */
  public applyEvents(v: number, events: GameEvent[]): void {
    const prevVersion = this._state.version ?? 0;
    // Gap detection (§3.8). First-ever EVENTS before SNAPSHOT is treated as
    // a gap; the NetworkManager requests SNAPSHOT and the subsequent
    // SNAPSHOT overwrites state cleanly.
    if (v !== prevVersion + 1 && prevVersion !== 0) {
      this.onNeedsSnapshot?.();
      return;
    }

    // Thaw the whole state — we need to mutate in place across every event.
    const mutable: GameState = this.shouldFreeze
      ? (structuredClone(this._state) as GameState)
      : this._state;

    for (const event of events) {
      applyEventToState(mutable, event);
      this.notifyEvent(event, mutable);
    }
    mutable.version = v;

    const prevState = this._state;
    this._state = this.shouldFreeze ? this.freezeDeep(mutable) : mutable;
    this.notify(prevState, prevVersion);
  }

  /** SwarmComms Step 6 — apply a predictor's mutations optimistically.
   *
   *  The `mutator` receives the thawed live state and MUST mutate it in place
   *  (the server handlers invoked from `predictors.ts` already satisfy this
   *  contract). The returned events are fanned out to `subscribeEvents`
   *  listeners so animations run this frame, but the state dispatch table is
   *  NOT re-applied — state is already mutated by the predictor.
   *
   *  `state.version` is INTENTIONALLY NOT bumped. The server's confirming
   *  `EVENTS` frame will bump it to v=prev+1; gap detection stays intact. */
  public applyOptimistic(mutator: (state: GameState) => GameEvent[]): GameEvent[] {
    const prevVersion = this._state.version ?? 0;
    const mutable: GameState = this.shouldFreeze
      ? (structuredClone(this._state) as GameState)
      : this._state;
    const events = mutator(mutable);
    for (const event of events) {
      this.notifyEvent(event, mutable);
    }
    const prevState = this._state;
    this._state = this.shouldFreeze ? this.freezeDeep(mutable) : mutable;
    this.notify(prevState, prevVersion);
    return events;
  }

  /** SwarmComms Step 6 / D20 — snapshot-only rollback on server rejection.
   *
   *  Reverse-applies the path-targeted snapshot captured pre-action. Version
   *  is untouched (no event was ever confirmed). No inverse events. */
  public rollbackOptimistic(snapshot: OptimisticSnapshot): void {
    const prevVersion = this._state.version ?? 0;
    const mutable: GameState = this.shouldFreeze
      ? (structuredClone(this._state) as GameState)
      : this._state;
    applySnapshot(mutable, snapshot);
    const prevState = this._state;
    this._state = this.shouldFreeze ? this.freezeDeep(mutable) : mutable;
    this.notify(prevState, prevVersion);
  }

  public subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Subscribe to individual events (renderer uses this for animations). */
  public subscribeEvents(listener: EventListener): Unsubscribe {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** Fan a batch of historical events out to `subscribeEvents` listeners
   *  WITHOUT mutating state — used after SNAPSHOT so reconnecting clients
   *  see per-event animation signals even though the state was already
   *  overwritten wholesale. NEVER invoke for live EVENTS frames; use
   *  `applyEvents` there. */
  public replayEventsForListenersOnly(tail: Array<{ v: number; events: GameEvent[] }>): void {
    for (const entry of tail) {
      for (const event of entry.events) {
        this.notifyEvent(event, this._state);
      }
    }
  }

  public destroy(): void {
    this.listeners.clear();
    this.eventListeners.clear();
  }

  private notify(prevState: GameState | null, prevVersion: number): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this._state, prevState, prevVersion);
      } catch (e) {
        console.error('Error in GameStore subscription:', e);
      }
    });
  }

  private notifyEvent(event: GameEvent, state: GameState): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event, state);
      } catch (e) {
        console.error('Error in GameStore event subscription:', e);
      }
    });
  }

  private freezeDeep<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Object.isFrozen(obj)) return obj;
    Object.keys(obj).forEach((prop) => {
      const val = (obj as any)[prop];
      if (typeof val === 'object' && val !== null) {
        this.freezeDeep(val);
      }
    });
    return Object.freeze(obj);
  }
}

// ---------------------------------------------------------------------------
// Event dispatch table
// ---------------------------------------------------------------------------

/** Mutate `state` in place for one event. Silent on events that don't
 *  touch state — animation-only signals are surfaced via
 *  `subscribeEvents`. When an event's semantics aren't fully reproducible
 *  client-side, we rely on the next SNAPSHOT request to reconcile. */
function applyEventToState(state: GameState, event: GameEvent): void {
  switch (event.type) {
    case 'SURVIVOR_MOVED': {
      const s = state.survivors[event.survivorId];
      if (s) s.position.zoneId = event.toZoneId;
      break;
    }
    case 'SURVIVOR_SPRINTED': {
      const s = state.survivors[event.survivorId];
      if (s && event.path.length > 0) {
        s.position.zoneId = event.path[event.path.length - 1];
      }
      break;
    }
    case 'SURVIVOR_WOUNDED': {
      const s = state.survivors[event.survivorId];
      if (s) s.wounds = Math.min(s.maxHealth, s.wounds + event.amount);
      break;
    }
    case 'SURVIVOR_HEALED': {
      const s = state.survivors[event.survivorId];
      if (s) s.wounds = Math.max(0, s.wounds - event.amount);
      break;
    }
    case 'SURVIVOR_DIED': {
      const s = state.survivors[event.survivorId];
      if (s) s.wounds = s.maxHealth;
      break;
    }
    case 'SURVIVOR_XP_GAINED': {
      const s = state.survivors[event.survivorId];
      if (s) s.experience = event.newTotal;
      break;
    }
    case 'SURVIVOR_DANGER_LEVEL_CHANGED': {
      const s = state.survivors[event.survivorId];
      if (s) s.dangerLevel = event.newLevel;
      break;
    }
    case 'SURVIVOR_SKILL_CHOSEN': {
      const s = state.survivors[event.survivorId];
      if (s && !s.skills.includes(event.skillId)) s.skills.push(event.skillId);
      break;
    }
    case 'SURVIVOR_ACTIONS_REMAINING_CHANGED': {
      const s = state.survivors[event.survivorId];
      if (s) s.actionsRemaining = event.newCount;
      break;
    }
    case 'SURVIVOR_FREE_ACTION_CONSUMED': {
      const s = state.survivors[event.survivorId];
      if (!s) break;
      switch (event.pool) {
        case 'move': s.freeMovesRemaining = Math.max(0, s.freeMovesRemaining - 1); break;
        case 'search': s.freeSearchesRemaining = Math.max(0, s.freeSearchesRemaining - 1); break;
        case 'combat': s.freeCombatsRemaining = Math.max(0, s.freeCombatsRemaining - 1); break;
        case 'melee': s.freeMeleeRemaining = Math.max(0, s.freeMeleeRemaining - 1); break;
        case 'ranged': s.freeRangedRemaining = Math.max(0, s.freeRangedRemaining - 1); break;
      }
      break;
    }

    case 'ATTACK_ROLLED': {
      // `lastAction` is owned by the server-projected state; client-side
      // updates go via SNAPSHOT-on-gap, since recomputing canLucky needs
      // seed/shooter context. UI read from SNAPSHOT-driven fields.
      break;
    }
    case 'ATTACK_REROLLED': {
      Object.assign(state.zombies, event.patch.zombies);
      Object.assign(state.survivors, event.patch.survivors);
      state.objectives = event.patch.objectives;
      state.noiseTokens = event.patch.noiseTokens;
      for (const [zid, n] of Object.entries(event.patch.zoneNoise)) {
        const z = state.zones[zid];
        if (z) z.noiseTokens = n;
      }
      break;
    }
    case 'FRIENDLY_FIRE_PENDING': {
      state.pendingFriendlyFire = {
        shooterId: event.shooterId,
        targetZoneId: event.targetZoneId,
        missCount: event.missCount,
        damagePerMiss: event.damagePerMiss,
        eligibleSurvivorIds: event.eligibleSurvivorIds,
      };
      break;
    }
    case 'FRIENDLY_FIRE_ASSIGNED': {
      delete state.pendingFriendlyFire;
      break;
    }
    case 'WEAPON_RELOADED': {
      const s = state.survivors[event.survivorId];
      if (s) {
        for (const card of s.inventory) {
          if (event.weaponIds.includes(card.id)) {
            (card as any).reloaded = true;
          }
        }
      }
      break;
    }

    case 'ZOMBIE_SPAWNED': {
      state.zombies[event.zombieId] = {
        id: event.zombieId,
        type: event.zombieType,
        position: { x: 0, y: 0, zoneId: event.zoneId },
        wounds: 0,
        activated: false,
      };
      break;
    }
    case 'ZOMBIE_MOVED': {
      const z = state.zombies[event.zombieId];
      if (z) z.position.zoneId = event.toZoneId;
      break;
    }
    case 'ZOMBIE_BATCH_MOVED': {
      for (const m of event.moves) {
        const z = state.zombies[m.zombieId];
        if (z) z.position.zoneId = m.toZoneId;
      }
      break;
    }
    case 'ZOMBIE_KILLED': {
      delete state.zombies[event.zombieId];
      break;
    }
    case 'ZOMBIE_ACTIVATED': {
      for (const zid of event.zombieIds) {
        const z = state.zombies[zid];
        if (z) z.activated = true;
      }
      break;
    }
    case 'ZOMBIE_WOUNDS_PENDING': {
      (state.pendingZombieWounds ||= []).push({
        zoneId: event.zoneId,
        totalWounds: event.totalWounds,
        survivorIds: event.survivorIds,
      });
      break;
    }
    case 'ZOMBIE_SPLIT_PENDING': {
      // Prompts only — `plannedMoves` lives server-side, the client just
      // needs to know which zombies need a placement choice. The next
      // SNAPSHOT (if requested) reconciles `plannedMoves` for tooling.
      state.pendingZombieSplit = {
        stage: event.stage,
        plannedMoves: state.pendingZombieSplit?.plannedMoves ?? {},
        prompts: event.prompts.map((p) => ({
          zombieId: p.zombieId,
          type: p.type,
          sourceZoneId: p.sourceZoneId,
          options: p.options,
        })),
      };
      break;
    }
    case 'ZOMBIE_SPLIT_RESOLVED': {
      const pending = state.pendingZombieSplit;
      if (pending) {
        pending.prompts = pending.prompts.filter((p) => p.zombieId !== event.zombieId);
        if (pending.prompts.length === 0) {
          delete state.pendingZombieSplit;
        }
      }
      break;
    }
    case 'ZOMBIE_WOUNDS_DISTRIBUTED': {
      if (state.pendingZombieWounds) {
        state.pendingZombieWounds = state.pendingZombieWounds.filter(
          (p) => p.zoneId !== event.zoneId,
        );
        if (state.pendingZombieWounds.length === 0) delete state.pendingZombieWounds;
      }
      break;
    }
    case 'DOOR_OPENED': {
      const a = state.zones[event.zoneAId];
      const b = state.zones[event.zoneBId];
      if (a) {
        const conn = a.connections.find((c) => c.toZoneId === event.zoneBId);
        if (conn) { conn.doorOpen = true; conn.hasDoor = true; }
      }
      if (b) {
        const conn = b.connections.find((c) => c.toZoneId === event.zoneAId);
        if (conn) { conn.doorOpen = true; conn.hasDoor = true; }
        b.hasBeenSpawned = true;
      }
      break;
    }
    case 'ZONE_SPAWNED': {
      const z = state.zones[event.zoneId];
      if (z) z.hasBeenSpawned = true;
      break;
    }
    case 'ZONE_SPAWN_POINT_ACTIVATED': {
      const z = state.zones[event.zoneId];
      if (z) z.activated = true;
      break;
    }
    case 'NOISE_GENERATED': {
      const z = state.zones[event.zoneId];
      if (z) z.noiseTokens = event.newTotal;
      break;
    }
    case 'NOISE_CLEARED': {
      const z = state.zones[event.zoneId];
      if (z) z.noiseTokens = 0;
      break;
    }

    case 'OBJECTIVE_TAKEN': {
      const z = state.zones[event.zoneId];
      if (z) z.hasObjective = false;
      break;
    }
    case 'OBJECTIVE_PROGRESS_UPDATED': {
      const obj = state.objectives?.find((o) => o.id === event.objectiveId);
      if (obj) obj.amountCurrent = event.amountCurrent;
      break;
    }
    case 'OBJECTIVE_COMPLETED': {
      const obj = state.objectives?.find((o) => o.id === event.objectiveId);
      if (obj) obj.completed = true;
      break;
    }
    case 'EPIC_CRATE_OPENED': {
      const z = state.zones[event.zoneId];
      if (z) z.isEpicCrate = false;
      break;
    }

    case 'CARD_DRAWN': {
      // Owner socket — assign drawnCard (queue as appropriate).
      const s = state.survivors[event.survivorId];
      if (!s) break;
      if (!s.drawnCard) {
        s.drawnCard = event.card;
      } else {
        (s.drawnCardsQueue ||= []).push(event.card);
      }
      break;
    }
    case 'CARD_DRAWN_HIDDEN': {
      // Non-owner: set the boolean only (ClientSurvivor field).
      const s = state.survivors[event.survivorId] as any;
      if (s) s.hasDrawnCard = true;
      break;
    }
    case 'CARD_EQUIPMENT_RESOLVED': {
      const s = state.survivors[event.survivorId] as any;
      if (!s) break;
      delete s.drawnCard;
      if (s.drawnCardsQueue && s.drawnCardsQueue.length > 0) {
        s.drawnCard = s.drawnCardsQueue.shift();
      } else {
        delete s.drawnCardsQueue;
      }
      // Non-owner hidden marker cleared too.
      s.hasDrawnCard = false;
      break;
    }
    case 'EQUIPMENT_EQUIPPED': {
      const s = state.survivors[event.survivorId];
      if (!s) break;
      const card = s.inventory.find((c) => c.id === event.cardId);
      if (card) {
        card.slot = event.slot as any;
        card.inHand = event.slot === 'HAND_1' || event.slot === 'HAND_2';
      }
      break;
    }
    case 'EQUIPMENT_REORGANIZED': {
      const s = state.survivors[event.survivorId];
      if (!s) break;
      for (const mv of event.moves) {
        const card = s.inventory.find((c) => c.id === mv.cardId);
        if (card) {
          card.slot = mv.toSlot as any;
          card.inHand = mv.toSlot === 'HAND_1' || mv.toSlot === 'HAND_2';
        }
      }
      break;
    }
    case 'EQUIPMENT_DISCARDED': {
      const s = state.survivors[event.survivorId];
      if (s) s.inventory = s.inventory.filter((c) => c.id !== event.cardId);
      break;
    }
    case 'DECK_SHUFFLED': {
      // `equipmentDeckCount` lives on ClientGameState (not raw GameState).
      (state as any).equipmentDeckCount = event.deckSize;
      break;
    }
    case 'SPAWN_CARDS_DRAWN': {
      state.spawnContext = {
        cards: event.cards,
        timestamp: Date.now(),
      };
      break;
    }
    case 'SPAWN_DECK_REINITIALIZED': {
      (state as any).spawnDeckCount = event.deckSize;
      break;
    }

    case 'TURN_STARTED': {
      state.turn = event.turnNumber;
      state.phase = 'PLAYERS' as any;
      const idx = state.players.indexOf(event.activePlayerId);
      if (idx >= 0) state.activePlayerIndex = idx;
      break;
    }
    case 'ACTIVE_PLAYER_CHANGED': {
      state.activePlayerIndex = event.newPlayerIndex;
      break;
    }
    case 'ZOMBIE_PHASE_STARTED': {
      state.phase = 'ZOMBIES' as any;
      break;
    }
    case 'ROUND_ENDED': {
      state.turn = event.turnNumber;
      break;
    }

    case 'TRADE_SESSION_STARTED': {
      state.activeTrade = {
        activeSurvivorId: event.activeSurvivorId,
        targetSurvivorId: event.targetSurvivorId,
        offers: { [event.activeSurvivorId]: [], [event.targetSurvivorId]: [] },
        receiveLayouts: { [event.activeSurvivorId]: {}, [event.targetSurvivorId]: {} },
        status: { [event.activeSurvivorId]: false, [event.targetSurvivorId]: false },
      };
      break;
    }
    case 'TRADE_OFFER_UPDATED': {
      if (state.activeTrade) {
        state.activeTrade.offers[event.offererSurvivorId] = event.offerCardIds;
      }
      break;
    }
    case 'TRADE_OFFER_UPDATED_HIDDEN': {
      const t = state.activeTrade as any;
      if (t) {
        t.offerCounts = t.offerCounts ?? {};
        t.offerCounts[event.offererSurvivorId] = event.count;
      }
      break;
    }
    case 'TRADE_ACCEPTED':
    case 'TRADE_CANCELLED': {
      delete state.activeTrade;
      break;
    }

    case 'GAME_STARTED': {
      state.phase = 'PLAYERS' as any;
      break;
    }
    case 'GAME_ENDED': {
      state.gameResult = event.result;
      state.phase = 'GAME_OVER' as any;
      break;
    }
    case 'GAME_RESET': {
      state.phase = 'LOBBY' as any;
      state.gameResult = undefined;
      break;
    }
    case 'DANGER_LEVEL_GLOBAL_CHANGED': {
      state.currentDangerLevel = event.newLevel;
      break;
    }

    case 'LOBBY_PLAYER_JOINED': {
      if (!state.lobby.players.find((p) => p.id === event.playerId)) {
        state.lobby.players.push({
          id: event.playerId,
          name: event.name,
          ready: false,
          characterClass: '',
          starterEquipmentKey: '',
        });
      }
      break;
    }
    case 'LOBBY_PLAYER_LEFT':
    case 'LOBBY_PLAYER_KICKED': {
      state.lobby.players = state.lobby.players.filter((p) => p.id !== event.playerId);
      break;
    }
    case 'LOBBY_CHARACTER_SELECTED': {
      const p = state.lobby.players.find((pl) => pl.id === event.playerId);
      if (p) {
        p.characterClass = event.characterClass;
        p.ready = !!p.characterClass && !!p.starterEquipmentKey;
      }
      break;
    }
    case 'LOBBY_STARTER_PICKED': {
      const p = state.lobby.players.find((pl) => pl.id === event.playerId);
      if (p) {
        p.starterEquipmentKey = event.starterEquipmentKey;
        p.ready = !!p.characterClass && !!p.starterEquipmentKey;
      }
      break;
    }
    case 'LOBBY_NICKNAME_UPDATED': {
      const p = state.lobby.players.find((pl) => pl.id === event.playerId);
      if (p) p.name = event.name;
      break;
    }

    // Animation-only / UI-only signals; no state mutation here.
    // (ATTACK_ROLLED intentionally handled earlier — it's both a UI signal
    // and a no-op on mutable state because `lastAction` is SNAPSHOT-
    // authored, so the earlier case above covers it.)
    case 'SURVIVOR_SKILL_ELIGIBLE':
    case 'MOLOTOV_DETONATED':
    case 'WEAPON_FIRED_NOISE':
    case 'ZOMBIE_ATTACKED_ZONE':
    case 'ZOMBIE_EXTRA_ACTIVATION_TRIGGERED':
      break;

    default: {
      // Unknown event kind — reconcile via SNAPSHOT.
      // eslint-disable-next-line no-console
      console.warn('[GameStore] Unknown event kind', (event as any).type);
    }
  }
}

export const gameStore = new GameStore();
