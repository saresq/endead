/**
 * EventEntry — one renderer for history entries, used by the latest-event
 * card and the event log.
 */

import type { GameState, ZombieType } from '../../../types/GameState';
import type { HistoryEntry } from '../eventLog';
import { formatZoneId, formatActionType } from '../../utils/zoneFormat';
import { displayName } from '../../utils/displayName';
import { es, zombieLabel } from '../../../strings/es';

/** Hit threshold for entries recorded before `threshold` was stored. */
const DEFAULT_THRESHOLD = 4;

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface DieOptions {
  hit?: boolean;
  discarded?: boolean;
  /** Play the roll-in keyframe, staggered by `index`. */
  roll?: boolean;
  index?: number;
}

/** A d6 face: nine pip slots, `data-face` selects which ones show. */
export function renderDie(value: number, opts: DieOptions = {}): string {
  const classes = [
    'die',
    opts.hit ? 'die--hit' : 'die--miss',
    opts.discarded ? 'die--discarded' : '',
    opts.roll ? 'die--roll' : '',
  ].filter(Boolean).join(' ');
  const label = es.log.dieLabel(value, opts.discarded ? 'discarded' : opts.hit ? 'hit' : 'miss');
  const style = opts.roll ? ` style="--i:${opts.index ?? 0}"` : '';
  return `<span class="${classes}" data-face="${value}" role="img" aria-label="${label}"${style}>${'<i></i>'.repeat(9)}</span>`;
}

function actorName(entry: HistoryEntry, state: GameState): string {
  const survivor = entry.survivorId ? state.survivors[entry.survivorId] : undefined;
  if (survivor) return displayName(survivor.name, survivor.characterClass);
  const player = state.lobby?.players.find(p => p.id === entry.playerId);
  return displayName(player?.name, player?.characterClass);
}

function survivorName(state: GameState, id: string): string {
  const survivor = state.survivors[id];
  return survivor ? displayName(survivor.name, survivor.characterClass) || id : id;
}

function renderAttackBody(entry: HistoryEntry, roll: boolean): string {
  const threshold = entry.threshold ?? DEFAULT_THRESHOLD;
  const parts: string[] = [];

  const boosts: string[] = [];
  if (entry.bonusDice) boosts.push(es.log.bonusDice(entry.bonusDice));
  if (entry.bonusDamage) boosts.push(es.log.bonusDamage(entry.bonusDamage));
  if (boosts.length) {
    parts.push(`<div class="event-entry__boosts">${boosts.map(b => `<span class="event-entry__boost">${b}</span>`).join('')}</div>`);
  }

  if (entry.rerolledFrom?.length) {
    const source = es.log.rerollSources[entry.rerollSource ?? ''] ?? es.log.rerolledFallback;
    parts.push(`<div class="event-entry__reroll">
      <span class="event-entry__reroll-label">${es.log.rerolled(source)}</span>
      ${entry.rerolledFrom.map(d => renderDie(d, { hit: d >= threshold, discarded: true })).join('')}
    </div>`);
  }

  if (entry.dice?.length) {
    const hits = entry.hits ?? entry.dice.filter(d => d >= threshold).length;
    const dmg = entry.damagePerHit && entry.damagePerHit > 1 && hits > 0 ? es.log.damageEach(entry.damagePerHit) : '';
    const result = hits === 0
      ? `<span class="event-entry__miss">${es.log.miss}</span>`
      : `<span class="event-entry__hits">${es.log.hits(hits)}${dmg}</span>`;
    const dice = entry.dice.map((d, i) => renderDie(d, { hit: d >= threshold, roll, index: i })).join('');
    parts.push(`<div class="event-entry__dice">${dice}${result}</div>`);
  }

  return parts.join('');
}

function renderZombiePhase(entry: HistoryEntry, state: GameState): string {
  const ctx = entry.spawnContext;
  if (!ctx) return '';
  const lines: string[] = [];

  for (const card of ctx.cards ?? []) {
    const zone = escapeHtml(formatZoneId(card.zoneId, state));
    if (card.detail?.extraActivation) {
      lines.push(`<div class="event-entry__line"><span class="event-entry__zone">${zone}</span> ${escapeHtml(es.log.extraActivation(zombieLabel(card.detail.extraActivation, 2)))}</div>`);
      continue;
    }
    const zombies = Object.entries(card.detail?.zombies ?? {})
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([type, n]) => `${n} ${escapeHtml(zombieLabel(type as ZombieType, n ?? 0))}`);
    if (zombies.length) {
      lines.push(`<div class="event-entry__line"><span class="event-entry__zone">${zone}:</span> ${zombies.join(', ')}</div>`);
    }
  }

  const wounds = (ctx.zombieWounds ?? []).map(w =>
    `<span class="event-entry__wound">${escapeHtml(survivorName(state, w.survivorId))} -${w.amount}</span>`);
  if (wounds.length) lines.push(`<div class="event-entry__line event-entry__wounds">${wounds.join(' ')}</div>`);

  if (!lines.length) return '';
  return `<div class="event-entry__zombies"><div class="event-entry__subtitle">${es.common.zombiePhase}</div>${lines.join('')}</div>`;
}

function zoneTarget(entry: HistoryEntry, state: GameState): string {
  const p = entry.payload;
  if (p?.targetZoneId) return `→ ${escapeHtml(formatZoneId(p.targetZoneId, state))}`;
  if (Array.isArray(p?.path)) return `→ ${(p.path as string[]).map(id => escapeHtml(formatZoneId(id, state))).join(' → ')}`;
  return '';
}

export interface EventEntryOptions {
  /** Play the dice roll-in (latest-event card, first render of the entry). */
  roll?: boolean;
}

export function renderEventEntry(entry: HistoryEntry, state: GameState, opts: EventEntryOptions = {}): string {
  const name = escapeHtml(actorName(entry, state));
  // Handler descriptions are full sentences, so they replace the action label.
  let label = entry.description ? '' : formatActionType(entry.actionType);
  let detail = entry.description ? escapeHtml(entry.description) : zoneTarget(entry, state);
  let body = '';
  let kind = 'action';

  switch (entry.actionType) {
    case 'ATTACK':
    case 'REROLL_LUCKY':
      if (entry.actionType === 'REROLL_LUCKY') label = es.log.luckyReroll;
      body = renderAttackBody(entry, !!opts.roll);
      break;
    case 'MOVE':
    case 'SPRINT':
    case 'CHARGE':
      // Move descriptions don't name the zones; the payload does.
      label = formatActionType(entry.actionType);
      detail = zoneTarget(entry, state);
      break;
    case 'OPEN_DOOR': {
      label = escapeHtml(entry.description || es.log.doorOpenedShort);
      detail = zoneTarget(entry, state);
      break;
    }
    case 'TRADE_START': {
      const target = entry.payload?.targetSurvivorId ? state.survivors[entry.payload.targetSurvivorId] : undefined;
      detail = target ? es.log.tradeWith(escapeHtml(displayName(target.name, target.characterClass))) : '';
      break;
    }
    case 'DISTRIBUTE_ZOMBIE_WOUNDS': {
      const zone = entry.payload?.zoneId ? escapeHtml(formatZoneId(entry.payload.zoneId, state)) : '';
      label = es.log.zombieWounds;
      detail = zone ? es.log.inZone(zone) : '';
      const parts = Object.entries((entry.payload?.assignments ?? {}) as Record<string, number>)
        .filter(([, n]) => n > 0)
        .map(([sid, n]) => `<span class="event-entry__wound">${escapeHtml(survivorName(state, sid))} -${n}</span>`);
      if (parts.length) body = `<div class="event-entry__line event-entry__wounds">${parts.join(' ')}</div>`;
      kind = 'spawn';
      break;
    }
  }

  // The zombie phase rides on whichever action ended the round: END_TURN, or
  // the last action of a turn that ran out of AP.
  const zombiePhase = renderZombiePhase(entry, state);
  if (zombiePhase) {
    body += zombiePhase;
    kind = 'spawn';
  }

  const free = entry.usedFreeAction
    ? `<span class="event-entry__free">${escapeHtml(entry.freeActionType || es.common.free)}</span>`
    : '';

  return `<div class="event-entry event-entry--${kind}">
      <div class="event-entry__desc">${name ? `<span class="event-entry__actor">${name}</span> ` : ''}${free}${label ? `<span class="event-entry__label">${label}</span>` : ''}${label && detail ? ' ' : ''}${detail}</div>
      ${body}
    </div>`;
}
