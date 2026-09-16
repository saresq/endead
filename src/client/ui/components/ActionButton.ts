/**
 * ActionButton — Game action button with icon, label, keyboard hint, and states.
 *
 * Usage:
 *   renderActionButton({ id: 'btn-search', icon: 'Search', label: es.actions.SEARCH, kbd: 'S', cost: es.common.free, disabled: true })
 */

import { icon as renderIcon } from './icons';
import { es } from '../../../strings/es';

export interface ActionButtonOptions {
  id: string;
  icon: string;         // Lucide icon name
  label: string;
  kbd?: string;         // Keyboard shortcut hint (desktop only)
  cost?: string;        // es.common.actions(n) or es.common.free — es.common.actions(1) is hidden (default)
  disabled?: boolean;
  selected?: boolean;   // Active targeting mode
  highlight?: boolean;  // Special highlight (e.g. objective available)
  dataAction?: string;
}

export function renderActionButton(opts: ActionButtonOptions): string {
  const classes = [
    'action-btn',
    opts.disabled ? 'action-btn--disabled' : '',
    opts.selected ? 'action-btn--selected' : '',
    opts.highlight ? 'action-btn--highlight' : '',
  ].filter(Boolean).join(' ');

  const kbdHtml = opts.kbd ? `<span class="action-btn__kbd">${opts.kbd}</span>` : '';

  // Only show cost if it's free or something other than the default 1 action
  const showCost = opts.cost && opts.cost !== es.common.actions(1);
  const costHtml = showCost ? `<span class="action-btn__cost${opts.cost === es.common.free ? ' action-btn__cost--free' : ''}">${opts.cost}</span>` : '';

  const ariaAttrs = [
    `role="button"`,
    `aria-label="${opts.label}${opts.cost ? ` (${opts.cost})` : ''}${opts.kbd ? ` — ${es.board.keyHint(opts.kbd)}` : ''}"`,
    // aria-pressed is a toggle state, not a styling hook: only `selected`
    // (targeting mode active) is pressed. `highlight` means merely available.
    opts.selected ? `aria-pressed="true"` : '',
  ].filter(Boolean).join(' ');

  return `
    <button id="${opts.id}" class="${classes}" ${opts.disabled ? 'disabled' : ''} ${opts.dataAction ? `data-action="${opts.dataAction}"` : ''} ${ariaAttrs}>
      <span class="action-btn__icon">${renderIcon(opts.icon, 'sm')}</span>
      <span class="action-btn__label">${opts.label}</span>
      <span class="action-btn__spacer"></span>
      ${costHtml}
      ${kbdHtml}
    </button>`;
}
