/**
 * StatCell — Field Manual stat readout primitive.
 *
 * Labeled cell showing a value / max pair with pip track. Used for vitals,
 * action counters, ammo, etc. on the HUD.
 *
 * Usage:
 *   renderStatCell({ label: 'VITALS', value: 3, max: 3, color: 'danger' })
 */

export type StatCellColor = 'danger' | 'amber' | 'blue' | 'ready';
export type StatCellSize = 'sm' | 'md';

export interface StatCellOptions {
  icon?: string;             // SVG string or glyph character
  label: string;             // e.g. 'VITALS'
  value: number;
  max: number;
  color?: StatCellColor;     // default 'amber'
  showPips?: boolean;        // default true
  size?: StatCellSize;       // default 'md'
  infinite?: boolean;        // when true, render ∞ instead of value/max and skip pips
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function renderStatCell(opts: StatCellOptions): string {
  const color = opts.color ?? 'amber';
  const size = opts.size ?? 'md';
  const showPips = opts.showPips ?? true;
  const safeMax = Math.max(0, Math.floor(opts.max));
  const safeValue = clamp(Math.floor(opts.value), 0, safeMax);

  const rootClass = [
    'fm-statcell',
    `fm-statcell--${color}`,
    `fm-statcell--${size}`,
  ].join(' ');

  const iconHtml = opts.icon
    ? `<span class="fm-statcell__icon">${opts.icon}</span>`
    : '';

  const labelHtml = `<span class="fm-statcell__label">${opts.label}</span>`;

  const valueHtml = opts.infinite
    ? `
    <div class="fm-statcell__value fm-statcell__value--infinite" aria-label="Unlimited">
      <span class="fm-statcell__num">&infin;</span>
    </div>
  `
    : `
    <div class="fm-statcell__value">
      <span class="fm-statcell__num">${safeValue}</span>
      <span class="fm-statcell__sep">/</span>
      <span class="fm-statcell__max">${safeMax}</span>
    </div>
  `;

  let pipsHtml = '';
  if (!opts.infinite && showPips && safeMax > 0) {
    const pips: string[] = [];
    for (let i = 0; i < safeMax; i += 1) {
      const filled = i < safeValue ? ' fm-statcell__pip--filled' : '';
      pips.push(`<span class="fm-statcell__pip${filled}"></span>`);
    }
    pipsHtml = `<div class="fm-statcell__pips">${pips.join('')}</div>`;
  }

  return `
    <div class="${rootClass}">
      <div class="fm-statcell__head">
        ${iconHtml}
        ${labelHtml}
      </div>
      ${valueHtml}
      ${pipsHtml}
    </div>
  `;
}
