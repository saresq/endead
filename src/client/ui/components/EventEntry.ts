/**
 * EventEntry — Renders a single event log entry (last action, spawn info).
 */

import { ZombieType } from '../../../types/GameState';
import { renderZombieBadge } from './ZombieBadge';

export interface LastActionData {
  type: string;
  description?: string;
  dice?: number[];
  hits?: number;
}

export function renderLastActionEntry(action: LastActionData): string {
  let diceHtml = '';
  if (action.dice && action.dice.length > 0) {
    const diceValues = action.dice.map(d =>
      `<span class="event-die ${d >= 4 ? 'event-die--hit' : ''}">${d}</span>`
    ).join('');
    diceHtml = `<div class="event-entry__dice">${diceValues} <span class="event-entry__hits">${action.hits} hit${action.hits !== 1 ? 's' : ''}</span></div>`;
  }

  return `
    <div class="event-entry event-entry--action">
      <div class="event-entry__desc">${action.description || action.type}</div>
      ${diceHtml}
    </div>`;
}

export interface SpawnCardData {
  zoneId: string;
  detail: {
    zombies?: { [key in ZombieType]?: number };
    extraActivation?: ZombieType;
    doubleSpawn?: boolean;
  };
}

export function renderSpawnEntry(cards: SpawnCardData[]): string {
  if (cards.length === 0) return '';

  const entries = cards.map(c => {
    const zombieBadges = c.detail.zombies
      ? Object.entries(c.detail.zombies)
          .filter(([, n]) => n && n > 0)
          .map(([type, count]) => renderZombieBadge(type as ZombieType, count))
          .join(' ')
      : '';

    const extra = c.detail.extraActivation
      ? `<span class="event-entry__extra">Extra: All ${c.detail.extraActivation} activate!</span>`
      : '';

    const double = c.detail.doubleSpawn
      ? '<span class="event-entry__double">DOUBLE SPAWN</span>'
      : '';

    return `
      <div class="event-entry event-entry--spawn">
        <span class="event-entry__zone">Zone ${c.zoneId}</span>
        ${double}${extra}
        <div class="event-entry__badges">${zombieBadges}</div>
      </div>`;
  }).join('');

  return `<div class="event-log__section">
    <div class="event-log__title">Spawn</div>
    ${entries}
  </div>`;
}
