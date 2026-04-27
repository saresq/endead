/**
 * SquadPlate — Compact squad roster card for HUD rails and lobby lists.
 *
 * Left stripe is tinted with the player's board-piece color. Rank is
 * established in the dossier and progression track; the squad rail does
 * not duplicate it inline (per follow-up #05).
 */

import { icon } from './icons';

export type SquadPlateRank = 'blue' | 'yellow' | 'orange' | 'red';

export interface SquadPlateOptions {
  name: string;
  rank: SquadPlateRank;
  /** Hex color of the player's board piece — drives the left stripe. */
  playerColor: string;
  hp: number;
  hpMax: number;
  actions: number;
  actionsMax: number;
  active?: boolean;
  /** Compact rail variant — omits the HP/Actions pills row. */
  compact?: boolean;
  /** Optional callsign (e.g. "P-01") rendered as a small mono tag. */
  callsign?: string;
  /** Optional click target — emits `data-action="select-survivor"` with this id. */
  selectId?: string;
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPills(current: number, max: number, variant: 'hp' | 'actions'): string {
  const filled = clamp(current, 0, max);
  const total = Math.max(0, max);
  const pills: string[] = [];
  for (let i = 0; i < total; i++) {
    const isFilled = i < filled;
    const cls = [
      'fm-squadplate__pill',
      `fm-squadplate__pill--${variant}`,
      isFilled ? 'fm-squadplate__pill--on' : 'fm-squadplate__pill--off',
    ].join(' ');
    pills.push(`<span class="${cls}"></span>`);
  }
  return pills.join('');
}

export function renderSquadPlate(opts: SquadPlateOptions): string {
  const hp = clamp(opts.hp, 0, opts.hpMax);
  const actions = clamp(opts.actions, 0, opts.actionsMax);

  const rootClass = [
    'fm-squadplate',
    `fm-squadplate--rank-${opts.rank}`,
    opts.active ? 'fm-squadplate--active' : '',
    opts.compact ? 'fm-squadplate--compact' : '',
    opts.selectId ? 'fm-squadplate--clickable' : '',
  ].filter(Boolean).join(' ');

  const stripeStyle = `background:${escapeHtml(opts.playerColor)};`;

  const callsignTag = opts.callsign
    ? `<span class="fm-squadplate__callsign">${escapeHtml(opts.callsign)}</span>`
    : '';

  const activeTag = opts.active
    ? `<span class="fm-squadplate__activetag" aria-label="Active operative">${icon('Play', 'xs')} ACTIVE</span>`
    : '';

  const stats = opts.compact ? '' : `
        <div class="fm-squadplate__stats">
          <div class="fm-squadplate__stat fm-squadplate__stat--hp" role="progressbar"
               aria-label="HP" aria-valuenow="${hp}" aria-valuemin="0" aria-valuemax="${opts.hpMax}">
            <div class="fm-squadplate__pills">${renderPills(hp, opts.hpMax, 'hp')}</div>
            <span class="fm-squadplate__qty">${hp}/${opts.hpMax}</span>
          </div>
          <div class="fm-squadplate__stat fm-squadplate__stat--actions" role="progressbar"
               aria-label="Actions" aria-valuenow="${actions}" aria-valuemin="0" aria-valuemax="${opts.actionsMax}">
            <div class="fm-squadplate__pills">${renderPills(actions, opts.actionsMax, 'actions')}</div>
            <span class="fm-squadplate__qty">${actions}/${opts.actionsMax}</span>
          </div>
        </div>`;

  const body = `
      <div class="fm-squadplate__stripe" style="${stripeStyle}"></div>
      <div class="fm-squadplate__body">
        <div class="fm-squadplate__head">
          <span class="fm-squadplate__name">${escapeHtml(opts.name)}</span>
          ${callsignTag}
          ${activeTag}
        </div>${stats}
      </div>`;

  if (opts.selectId) {
    return `
      <button type="button" class="${rootClass}"
              data-action="select-survivor"
              data-survivor-id="${escapeHtml(opts.selectId)}"
              aria-pressed="${opts.active ? 'true' : 'false'}">
        ${body}
      </button>
    `;
  }

  return `
    <div class="${rootClass}">
      ${body}
    </div>
  `;
}
