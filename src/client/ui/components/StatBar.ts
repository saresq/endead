/**
 * StatBar — Compact progress bar with icon and value label.
 *
 * Usage:
 *   renderStatBar({ icon: 'Heart', current: 2, max: 3, color: 'var(--danger)' })
 */

import { icon as renderIcon } from './icons';

export interface StatBarOptions {
  icon: string;        // Lucide icon name
  current: number;
  max: number;
  color: string;       // CSS color value or variable
  label?: string;      // Override label (defaults to "current/max")
}

export function renderStatBar(opts: StatBarOptions): string {
  const pct = opts.max > 0 ? Math.min(100, Math.round((opts.current / opts.max) * 100)) : 0;
  const label = opts.label ?? `${opts.current}/${opts.max}`;

  return `
    <div class="stat-bar">
      <div class="stat-bar__header">
        <span class="stat-bar__icon" style="color:${opts.color}">${renderIcon(opts.icon, 'sm')}</span>
        <span class="stat-bar__value">${label}</span>
      </div>
      <div class="stat-bar__track">
        <div class="stat-bar__fill" style="width:${pct}%;background:${opts.color}"></div>
      </div>
    </div>`;
}
