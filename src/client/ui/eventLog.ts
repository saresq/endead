/**
 * Pure helpers for the latest-event card, the event log and board cues.
 * Everything reads `GameState.history`, the single record of what happened.
 */

import type { GameState } from '../../types/GameState';
import { DangerLevel, ZombieType } from '../../types/GameState';
import { es, zombieLabel } from '../../strings/es';

export type HistoryEntry = GameState['history'][number];

/**
 * Lobby and bookkeeping actions that never show in the card or the log.
 * A reorganize is one action, so only `ORGANIZE_START` is worth a line: the
 * moves inside the session and closing it are bookkeeping.
 */
const HIDDEN_ACTIONS = new Set([
  'JOIN_LOBBY', 'START_GAME', 'SELECT_CHARACTER', 'SELECT_WEAPON', 'UPDATE_NICKNAME', 'KICK_PLAYER',
  'DISCONNECT', 'RESOLVE_SEARCH', 'CHOOSE_SKILL', 'END_GAME', 'ABANDON',
  'ORGANIZE', 'ORGANIZE_END',
]);

export function displayableEntries(history: readonly HistoryEntry[] | undefined): HistoryEntry[] {
  return (history ?? []).filter(e => !HIDDEN_ACTIONS.has(e.actionType));
}

export interface PlayerTurnGroup {
  playerId: string;
  /** Newest first. */
  entries: HistoryEntry[];
}

export interface RoundGroup {
  round: number;
  current: boolean;
  /** Newest player turn first. */
  turns: PlayerTurnGroup[];
}

/**
 * Groups displayable entries (chronological input) by round, then by player
 * turn, both newest first. `entry.turn` is recorded after the action ran, so
 * the action that ends a round already carries the next number; an entry's
 * round is therefore the turn recorded on the entry before it. `currentRound`
 * (state.turn) marks the current group; without it the newest group is current.
 */
export function groupByRound(entries: readonly HistoryEntry[], currentRound?: number): RoundGroup[] {
  const rounds: { round: number; turns: PlayerTurnGroup[] }[] = [];
  let prevTurn: number | undefined;
  let turnClosed = true;

  for (const entry of entries) {
    const round = prevTurn ?? entry.turn ?? 1;
    prevTurn = entry.turn ?? round;

    let group = rounds[rounds.length - 1];
    if (!group || group.round !== round) {
      group = { round, turns: [] };
      rounds.push(group);
      turnClosed = true;
    }
    // A turn also ends without END_TURN when the player runs out of actions.
    const currentTurn = group.turns[group.turns.length - 1];
    if (turnClosed || currentTurn.playerId !== entry.playerId) {
      group.turns.push({ playerId: entry.playerId, entries: [] });
      turnClosed = false;
    }
    group.turns[group.turns.length - 1].entries.push(entry);
    if (entry.actionType === 'END_TURN') turnClosed = true;
  }

  return rounds.reverse().map((g, i) => ({
    round: g.round,
    current: currentRound === undefined ? i === 0 : g.round === currentRound,
    turns: g.turns.reverse().map(t => ({ playerId: t.playerId, entries: t.entries.reverse() })),
  }));
}

export type CueTone = 'hit' | 'miss' | 'wound' | 'spawn' | 'rush' | 'info';

export interface BoardCue {
  zoneId: string;
  text: string;
  tone: CueTone;
}

/** Target zone of an attack entry; a Lucky reroll reuses its attack's target. */
function attackZone(entry: HistoryEntry, history: readonly HistoryEntry[], index: number): string | undefined {
  if (entry.payload?.targetZoneId) return entry.payload.targetZoneId;
  for (let i = index - 1; i >= 0; i--) {
    const e = history[i];
    if (e.actionType === 'ATTACK' && e.survivorId === entry.survivorId) return e.payload?.targetZoneId;
  }
  return undefined;
}

/**
 * Zombie id → the zone a Rush card placed it in. The card activates them right
 * after placing (rules/08-zombies.md#zombie-rush), so the state that reaches the
 * client already has them a zone away; the board animates them leaving instead
 * of popping them in beside the survivor they walked up to.
 */
export function rushOriginsFrom(ctx: GameState['spawnContext']): Map<string, string> {
  const origins = new Map<string, string>();
  for (const card of ctx?.cards ?? []) {
    if (!card.detail?.rush) continue;
    for (const id of card.spawnedIds ?? []) origins.set(id, card.zoneId);
  }
  return origins;
}

/** Short floating texts for what changed between two states. */
export function boardCuesFor(prev: GameState, next: GameState): BoardCue[] {
  const cues: BoardCue[] = [];
  const prevLen = prev.history?.length ?? 0;
  const history = next.history ?? [];

  if (history.length > prevLen) {
    for (let i = prevLen; i < history.length; i++) {
      const entry = history[i];
      if ((entry.actionType === 'ATTACK' || entry.actionType === 'REROLL_LUCKY') && entry.hits !== undefined) {
        const zoneId = attackZone(entry, history, i);
        if (zoneId) {
          cues.push(entry.hits > 0
            ? { zoneId, text: es.cues.hits(entry.hits), tone: 'hit' }
            : { zoneId, text: es.cues.miss, tone: 'miss' });
        }
      }
      // Cues stack upwards in the order they are pushed, so the door line goes
      // last: on a building spawn it shares the zone with the card's cues and
      // reads as the heading above them.
      const doorZoneId = entry.actionType === 'OPEN_DOOR' ? entry.payload?.targetZoneId : undefined;

      for (const card of entry.spawnContext?.cards ?? []) {
        // Extra Activation places nothing and does nothing at Blue
        // (rules/10-zombie-phase.md#extra-activation-cards) — name the type that moves.
        if (card.detail?.extraActivation) {
          if (card.dangerLevel === DangerLevel.Blue) continue;
          cues.push({
            zoneId: card.zoneId,
            text: es.cues.extraActivation(zombieLabel(card.detail.extraActivation, 2)),
            tone: 'rush',
          });
          continue;
        }
        for (const [type, count] of Object.entries(card.detail?.zombies ?? {})) {
          if (!count) continue;
          cues.push({
            zoneId: card.zoneId,
            text: es.cues.spawned(count, zombieLabel(type as ZombieType, count)),
            tone: 'spawn',
          });
        }
        // A Rush card places its zombies here and activates them at once
        // (rules/08-zombies.md#zombie-rush), so they are already a zone away.
        if (card.detail?.rush && (card.spawnedIds?.length ?? 0) > 0) {
          cues.push({ zoneId: card.zoneId, text: es.cues.rush, tone: 'rush' });
        }
      }

      if (doorZoneId) {
        cues.push({ zoneId: doorZoneId, text: es.cues.doorOpen, tone: 'info' });
      }
    }
  }

  for (const survivor of Object.values(next.survivors ?? {})) {
    const before = prev.survivors?.[survivor.id];
    if (!before) continue;
    const delta = survivor.wounds - before.wounds;
    if (delta > 0) cues.push({ zoneId: survivor.position.zoneId, text: `-${delta}`, tone: 'wound' });
  }

  return cues;
}
