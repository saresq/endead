import { describe, it, expect } from 'vitest';
import { renderEventEntry, renderDie } from '../ui/components/EventEntry';
import type { HistoryEntry } from '../ui/eventLog';
import { ZombieType, type GameState } from '../../types/GameState';
import { es, zombieLabel } from '../../strings/es';

const state = {
  survivors: {
    wanda: { id: 'wanda', name: 'Wanda', playerId: 'ana' },
    doug: { id: 'doug', name: 'Doug', playerId: 'ben' },
  },
  lobby: { players: [{ id: 'ana', name: 'Ana' }, { id: 'ben', name: 'Ben' }] },
  zones: {},
  spawnZoneIds: [],
} as unknown as GameState;

const attack = (extra: Partial<HistoryEntry>): HistoryEntry => ({
  actionType: 'ATTACK', playerId: 'ana', survivorId: 'wanda', timestamp: 1, turn: 1,
  description: es.log.attack('Pistola', false, 5), ...extra,
});

const dieLabels = (html: string) => [...html.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]);

describe('renderEventEntry', () => {
  it('marks hits against the recorded threshold', () => {
    const html = renderEventEntry(attack({ dice: [4, 5, 6], hits: 2, threshold: 5 }), state);
    expect(dieLabels(html)).toEqual([es.log.dieLabel(4, 'miss'), es.log.dieLabel(5, 'hit'), es.log.dieLabel(6, 'hit')]);
    expect(html).toContain(es.log.hits(2));
  });

  it('falls back to 4+ for entries without a threshold', () => {
    const html = renderEventEntry(attack({ dice: [3, 4], hits: 1 }), state);
    expect(dieLabels(html)).toEqual([es.log.dieLabel(3, 'miss'), es.log.dieLabel(4, 'hit')]);
  });

  it('shows a miss when nothing hits', () => {
    const html = renderEventEntry(attack({ dice: [1, 2], hits: 0, threshold: 4 }), state);
    expect(html).toContain(es.log.miss);
    expect(html).not.toContain(es.log.hits(0));
  });

  it('shows dice discarded by a Lucky reroll', () => {
    const html = renderEventEntry(attack({
      actionType: 'REROLL_LUCKY', dice: [6], hits: 1, threshold: 4, rerolledFrom: [2], rerollSource: 'lucky',
    }), state);
    expect(html).toContain(es.log.rerolled(es.log.rerollSources.lucky));
    expect(dieLabels(html)).toEqual([es.log.dieLabel(2, 'discarded'), es.log.dieLabel(6, 'hit')]);
  });

  it('lists zombie-phase spawns per zone and wounds per survivor', () => {
    const html = renderEventEntry({
      actionType: 'END_TURN', playerId: 'ben', survivorId: 'doug', timestamp: 2, turn: 2,
      spawnContext: {
        timestamp: 2,
        cards: [{ zoneId: 'Z3', cardId: 'c', detail: { zombies: { WALKER: 2, RUNNER: 1 } }, dangerLevel: 'BLUE' }],
        zombieWounds: [{ survivorId: 'wanda', zoneId: 'Z2', amount: 2 }],
      } as any,
    }, state);
    expect(html).toContain(`Z3:</span> 2 ${zombieLabel(ZombieType.Walker, 2)}, 1 ${zombieLabel(ZombieType.Runner, 1)}`);
    expect(html).toContain('Wanda -2');
  });

  it('marks a Rush card on its spawn line', () => {
    const html = renderEventEntry({
      actionType: 'OPEN_DOOR', playerId: 'ben', survivorId: 'doug', timestamp: 3, turn: 2,
      payload: { targetZoneId: 'Z3' },
      spawnContext: {
        timestamp: 3,
        cards: [{
          zoneId: 'Z3', cardId: 'c', dangerLevel: 'YELLOW',
          detail: { zombies: { BRUTE: 2 }, rush: true }, spawnedIds: ['zombie-1', 'zombie-2'],
        }],
      } as any,
    }, state);
    expect(html).toContain(`Z3:</span> 2 ${zombieLabel(ZombieType.Brute, 2)}`);
    expect(html).toContain(es.log.rush);
  });

  it('shows the zombie phase on a non-END_TURN entry that ended the round', () => {
    const html = renderEventEntry({
      actionType: 'MOVE', playerId: 'ana', survivorId: 'wanda', timestamp: 4, turn: 3,
      payload: { targetZoneId: 'Z1' },
      spawnContext: {
        timestamp: 4,
        cards: [{ zoneId: 'Z3', cardId: 'c', detail: { zombies: { RUNNER: 1 } }, dangerLevel: 'BLUE' }],
      } as any,
    }, state);
    expect(html).toContain(es.common.zombiePhase);
    expect(html).toContain(`Z3:</span> 1 ${zombieLabel(ZombieType.Runner, 1)}`);
    expect(html).toContain(es.actions.MOVE);
  });

  it('uses the door description as the label and the payload zone as detail', () => {
    const door = (description?: string): HistoryEntry => ({
      actionType: 'OPEN_DOOR', playerId: 'ana', survivorId: 'wanda', timestamp: 5, turn: 1,
      payload: { targetZoneId: 'Z4' }, description,
    });
    const spawned = renderEventEntry(door(es.log.doorOpened(true)), state);
    expect(spawned).toContain(`<span class="event-entry__label">${es.log.doorOpened(true)}</span> → Z4`);
    const quiet = renderEventEntry(door(es.log.doorOpened(false)), state);
    expect(quiet).toContain(`<span class="event-entry__label">${es.log.doorOpened(false)}</span> → Z4`);
    const legacy = renderEventEntry(door(), state);
    expect(legacy).toContain(`<span class="event-entry__label">${es.log.doorOpenedShort}</span>`);
  });

  it('shows the stored free action chip', () => {
    const html = renderEventEntry({
      actionType: 'MOVE', playerId: 'ana', survivorId: 'wanda', timestamp: 6, turn: 1,
      payload: { targetZoneId: 'Z1' }, usedFreeAction: true, freeActionType: es.log.freeMove,
    }, state);
    expect(html).toContain(`<span class="event-entry__free">${es.log.freeMove}</span>`);
  });

  it('escapes player-provided text', () => {
    const html = renderEventEntry({
      actionType: 'DISTRIBUTE_ZOMBIE_WOUNDS', playerId: 'ana', survivorId: 'system', timestamp: 3,
      payload: { zoneId: 'Z1', assignments: { wanda: 1 } },
    }, { ...state, lobby: { players: [{ id: 'ana', name: '<b>Ana</b>' }] } } as unknown as GameState);
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(html).toContain('Wanda -1');
  });
});

describe('renderDie', () => {
  it('renders a pip face with an accessible label', () => {
    const html = renderDie(5, { hit: true });
    expect(html).toContain('data-face="5"');
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${es.log.dieLabel(5, 'hit')}"`);
    expect(html.match(/<i><\/i>/g)).toHaveLength(9);
  });
});
