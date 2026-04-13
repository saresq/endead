/**
 * ZombieBadge — Stateless render functions for zombie type indicators.
 *
 * Usage:
 *   renderZombieBadge('WALKER', 3)   → inline badge: [green dot] Walker x3
 *   renderZombieChip('RUNNER')       → compact pill with left-border accent
 */

import { ZombieType } from '../../../types/GameState';
import { getZombieTypeDisplay } from '../../config/ZombieTypeConfig';
import { icon } from './icons';

/**
 * Inline badge — colored dot + type name + optional count.
 * Used in event log, kill feed, spawn summaries.
 */
export function renderZombieBadge(type: ZombieType, count?: number): string {
  const display = getZombieTypeDisplay(type);
  const countHtml = count && count > 1
    ? `<span class="zombie-badge__count">x${count}</span>`
    : '';

  return `<span class="zombie-badge zombie-badge--${type.toLowerCase()}"><span class="zombie-badge__dot" style="background:${display.color}"></span><span class="zombie-badge__label">${display.label}</span>${countHtml}</span>`;
}

/**
 * Compact pill — used in tight spaces like spawn cards and tooltips.
 */
export function renderZombieChip(type: ZombieType): string {
  const display = getZombieTypeDisplay(type);

  return `<span class="zombie-chip zombie-chip--${type.toLowerCase()}" style="border-left-color:${display.color}"><span class="zombie-chip__icon">${icon(display.iconName, 'sm')}</span><span class="zombie-chip__label">${display.label}</span></span>`;
}

/**
 * Renders a spawn event summary — list of zombie badges per zone.
 */
export function renderSpawnSummary(
  spawns: { type: ZombieType; count: number }[],
): string {
  if (spawns.length === 0) return '';

  const badges = spawns
    .map(({ type, count }) => renderZombieBadge(type, count))
    .join('');

  return `<span class="zombie-spawn-summary">${badges}</span>`;
}
