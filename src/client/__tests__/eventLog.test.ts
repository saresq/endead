import { describe, it, expect } from 'vitest';
import { displayableEntries, groupByRound, boardCuesFor, rushOriginsFrom, type HistoryEntry } from '../ui/eventLog';
import type { GameState } from '../../types/GameState';
import { es, zombieLabel } from '../../strings/es';
import { ZombieType } from '../../types/GameState';

let ts = 0;
function entry(actionType: string, playerId: string, turn: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { actionType, playerId, survivorId: `${playerId}-s`, timestamp: ++ts, turn, ...extra };
}

function state(history: HistoryEntry[], wounds: Record<string, number> = {}): GameState {
  const survivors: Record<string, any> = {};
  for (const [id, w] of Object.entries(wounds)) {
    survivors[id] = { id, wounds: w, position: { zoneId: `zone-${id}` } };
  }
  return { history, survivors } as unknown as GameState;
}

describe('displayableEntries', () => {
  it('drops lobby and bookkeeping actions', () => {
    const history = [
      entry('JOIN_LOBBY', 'a', 1), entry('START_GAME', 'a', 1), entry('SELECT_CHARACTER', 'a', 1),
      entry('MOVE', 'a', 1), entry('RESOLVE_SEARCH', 'a', 1), entry('CHOOSE_SKILL', 'a', 1),
      entry('KICK_PLAYER', 'a', 1), entry('DISCONNECT', 'a', 1), entry('ATTACK', 'a', 1),
    ];
    expect(displayableEntries(history).map(e => e.actionType)).toEqual(['MOVE', 'ATTACK']);
  });
});

describe('groupByRound', () => {
  it('puts two player turns in one round, newest first', () => {
    const entries = [
      entry('MOVE', 'ana', 2), entry('END_TURN', 'ana', 3), // round 2 ends
      entry('MOVE', 'ana', 3), entry('ATTACK', 'ana', 3), entry('END_TURN', 'ana', 3),
      entry('SEARCH', 'ben', 3), entry('END_TURN', 'ben', 4), // zombie phase ran, turn advanced
      entry('MOVE', 'ben', 4),
    ];
    const rounds = groupByRound(entries);

    expect(rounds.map(r => r.round)).toEqual([4, 3, 2]);
    expect(rounds[0].current).toBe(true);
    expect(rounds[1].current).toBe(false);

    const round3 = rounds[1];
    expect(round3.turns.map(t => t.playerId)).toEqual(['ben', 'ana']);
    expect(round3.turns[0].entries.map(e => e.actionType)).toEqual(['END_TURN', 'SEARCH']);
    expect(round3.turns[1].entries.map(e => e.actionType)).toEqual(['END_TURN', 'ATTACK', 'MOVE']);
  });

  it('starts a new player turn when the player changes without END_TURN', () => {
    const entries = [entry('MOVE', 'ana', 1), entry('ATTACK', 'ana', 1), entry('MOVE', 'ben', 1)];
    const [round] = groupByRound(entries);
    expect(round.turns.map(t => t.playerId)).toEqual(['ben', 'ana']);
  });

  it('marks only the round matching currentRound as current', () => {
    const entries = [entry('MOVE', 'ana', 1), entry('END_TURN', 'ana', 2)];
    expect(groupByRound(entries, 2).map(r => r.current)).toEqual([false]);
    expect(groupByRound(entries, 1).map(r => r.current)).toEqual([true]);
  });

  it('returns nothing for no entries', () => {
    expect(groupByRound([])).toEqual([]);
  });
});

describe('rushOriginsFrom', () => {
  const ctx = (cards: unknown[]) => ({ timestamp: 1, cards } as never);

  it('maps every id a Rush card placed to the zone it placed them in', () => {
    const origins = rushOriginsFrom(ctx([
      { zoneId: 'room', cardId: 'c1', dangerLevel: 'YELLOW', detail: { zombies: { BRUTE: 2 }, rush: true }, spawnedIds: ['z1', 'z2'] },
      { zoneId: 'street', cardId: 'c2', dangerLevel: 'YELLOW', detail: { zombies: { WALKER: 1 } }, spawnedIds: ['z3'] },
    ]));
    expect([...origins]).toEqual([['z1', 'room'], ['z2', 'room']]);
  });

  it('is empty without a spawn context', () => {
    expect(rushOriginsFrom(undefined).size).toBe(0);
  });
});

describe('boardCuesFor', () => {
  it('cues attack hits and misses at the target zone', () => {
    const prev = state([entry('MOVE', 'a', 1)]);
    const next = state([
      ...prev.history,
      entry('ATTACK', 'a', 1, { hits: 2, dice: [5, 6], payload: { targetZoneId: 'z5' } }),
      entry('ATTACK', 'a', 1, { hits: 0, dice: [1], payload: { targetZoneId: 'z6' } }),
    ]);
    expect(boardCuesFor(prev, next)).toEqual([
      { zoneId: 'z5', text: es.cues.hits(2), tone: 'hit' },
      { zoneId: 'z6', text: es.cues.miss, tone: 'miss' },
    ]);
  });

  it('cues a Lucky reroll at the original attack zone', () => {
    const attack = entry('ATTACK', 'a', 1, { hits: 0, dice: [1], payload: { targetZoneId: 'z2' } });
    const prev = state([attack]);
    const next = state([attack, entry('REROLL_LUCKY', 'a', 1, { hits: 1, dice: [6] })]);
    expect(boardCuesFor(prev, next)).toEqual([{ zoneId: 'z2', text: es.cues.hits(1), tone: 'hit' }]);
  });

  it('cues door opens and spawns per zone', () => {
    const prev = state([]);
    const next = state([
      entry('OPEN_DOOR', 'a', 1, { payload: { targetZoneId: 'd1' } }),
      entry('END_TURN', 'a', 2, {
        spawnContext: {
          timestamp: 1,
          cards: [
            { zoneId: 's1', cardId: 'c1', detail: { zombies: { WALKER: 2, RUNNER: 1 } }, dangerLevel: 'BLUE' },
            { zoneId: 's2', cardId: 'c2', detail: { extraActivation: 'WALKER' }, dangerLevel: 'BLUE' },
          ],
        } as any,
      }),
    ]);
    expect(boardCuesFor(prev, next)).toEqual([
      { zoneId: 'd1', text: es.cues.doorOpen, tone: 'info' },
      { zoneId: 's1', text: es.cues.spawned(2, zombieLabel(ZombieType.Walker, 2)), tone: 'spawn' },
      { zoneId: 's1', text: es.cues.spawned(1, zombieLabel(ZombieType.Runner, 1)), tone: 'spawn' },
      // The 's2' card is an Extra Activation at Blue: it does nothing, so it says nothing.
    ]);
  });

  it('names the type an Extra Activation card sends at the board', () => {
    const prev = state([]);
    const next = state([
      entry('END_TURN', 'a', 2, {
        spawnContext: {
          timestamp: 1,
          cards: [{ zoneId: 's2', cardId: 'c2', detail: { extraActivation: 'WALKER' }, dangerLevel: 'ORANGE' }],
        } as any,
      }),
    ]);
    expect(boardCuesFor(prev, next)).toEqual([
      { zoneId: 's2', text: es.cues.extraActivation(zombieLabel(ZombieType.Walker, 2)), tone: 'rush' },
    ]);
  });

  it('says nothing for an Extra Activation drawn at Blue', () => {
    const prev = state([]);
    const next = state([
      entry('END_TURN', 'a', 2, {
        spawnContext: {
          timestamp: 1,
          cards: [{ zoneId: 's2', cardId: 'c2', detail: { extraActivation: 'WALKER' }, dangerLevel: 'BLUE' }],
        } as any,
      }),
    ]);
    expect(boardCuesFor(prev, next)).toEqual([]);
  });

  it('cues a Rush at the zone the card placed the zombies in', () => {
    const prev = state([]);
    const next = state([
      entry('OPEN_DOOR', 'a', 1, {
        payload: { targetZoneId: 'room' },
        spawnContext: {
          timestamp: 2,
          cards: [{
            zoneId: 'room', cardId: 'c1', dangerLevel: 'YELLOW',
            detail: { zombies: { BRUTE: 2 }, rush: true },
            spawnedIds: ['zombie-1', 'zombie-2'],
          }],
        } as any,
      }),
    ]);
    // Stacking runs bottom-up, so the door line is pushed last to sit on top.
    expect(boardCuesFor(prev, next)).toEqual([
      { zoneId: 'room', text: es.cues.spawned(2, zombieLabel(ZombieType.Brute, 2)), tone: 'spawn' },
      { zoneId: 'room', text: es.cues.rush, tone: 'rush' },
      { zoneId: 'room', text: es.cues.doorOpen, tone: 'info' },
    ]);
  });

  it('cues wounds at the survivor zone', () => {
    const prev = state([], { wanda: 0, doug: 1 });
    const next = state([], { wanda: 2, doug: 1 });
    expect(boardCuesFor(prev, next)).toEqual([{ zoneId: 'zone-wanda', text: '-2', tone: 'wound' }]);
  });

  it('returns no cues when nothing changed', () => {
    const history = [entry('ATTACK', 'a', 1, { hits: 1, payload: { targetZoneId: 'z1' } })];
    expect(boardCuesFor(state(history, { wanda: 1 }), state(history, { wanda: 1 }))).toEqual([]);
  });
});
