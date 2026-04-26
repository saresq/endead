/**
 * SquadPlate — Compact squad roster card for HUD rails and lobby lists.
 *
 * Left stripe is tinted with the player's board-piece color. A small dot
 * next to the name encodes the survivor's danger rank (blue/yellow/orange/red).
 * No avatar, no callsign — the squad rail stays compact.
 */

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
}

const RANK_LABEL: Record<SquadPlateRank, string> = {
  blue: 'Rookie',
  yellow: 'Veteran',
  orange: 'Elite',
  red: 'Hero',
};

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
  const rankTitle = RANK_LABEL[opts.rank];

  const rootClass = [
    'fm-squadplate',
    `fm-squadplate--rank-${opts.rank}`,
    opts.active ? 'fm-squadplate--active' : '',
  ].filter(Boolean).join(' ');

  const stripeStyle = `background:${escapeHtml(opts.playerColor)};`;

  return `
    <div class="${rootClass}">
      <div class="fm-squadplate__stripe" style="${stripeStyle}"></div>
      <div class="fm-squadplate__body">
        <div class="fm-squadplate__head">
          <span class="fm-squadplate__rank-dot fm-squadplate__rank-dot--${opts.rank}"
                title="${escapeHtml(rankTitle)}"
                aria-label="${escapeHtml(rankTitle)}"></span>
          <span class="fm-squadplate__name">${escapeHtml(opts.name)}</span>
        </div>
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
        </div>
      </div>
    </div>
  `;
}
