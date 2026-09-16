/**
 * Pure helpers for the latest-event card, the event log and board cues.
 * Everything reads `GameState.history`, the single record of what happened.
 */

import type { GameState } from '../../types/GameState';
import { es } from '../../strings/es';

export type HistoryEntry = GameState['history'][number];

/** Lobby and bookkeeping actions that never show in the card or the log. */
const HIDDEN_ACTIONS = new Set([
  'JOIN_LOBBY', 'START_GAME', 'SELECT_CHARACTER', 'UPDATE_NICKNAME', 'KICK_PLAYER',
  'DISCONNECT', 'RESOLVE_SEARCH', 'CHOOSE_SKILL', 'END_GAME', 'ABANDON',
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

export type CueTone = 'hit' | 'miss' | 'wound' | 'spawn' | 'info';

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
      if (entry.actionType === 'OPEN_DOOR' && entry.payload?.targetZoneId) {
        cues.push({ zoneId: entry.payload.targetZoneId, text: es.cues.doorOpen, tone: 'info' });
      }
      const perZone = new Map<string, number>();
      for (const card of entry.spawnContext?.cards ?? []) {
        const count = Object.values(card.detail?.zombies ?? {}).reduce((s, n) => s + (n ?? 0), 0);
        if (count > 0) perZone.set(card.zoneId, (perZone.get(card.zoneId) ?? 0) + count);
      }
      for (const [zoneId, count] of perZone) {
        cues.push({ zoneId, text: `+${count}`, tone: 'spawn' });
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
