/**
 * ActionButton — Game action button with icon, label, keyboard hint, and states.
 *
 * Usage:
 *   renderActionButton({ id: 'btn-search', icon: 'Search', label: 'Search', kbd: 'S', cost: '1 AP', disabled: true })
 */

import { icon as renderIcon } from './icons';

export interface ActionButtonOptions {
  id: string;
  icon: string;         // Lucide icon name
  label: string;
  kbd?: string;         // Keyboard shortcut hint (desktop only)
  cost?: string;        // e.g. "1 AP"
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
  const costHtml = opts.cost ? `<span class="action-btn__cost">${opts.cost}</span>` : '';

  const ariaAttrs = [
    `role="button"`,
    `aria-label="${opts.label}${opts.cost ? ` (${opts.cost})` : ''}${opts.kbd ? ` — key: ${opts.kbd}` : ''}"`,
    opts.selected ? `aria-pressed="true"` : '',
    opts.highlight ? `aria-pressed="true"` : '',
  ].filter(Boolean).join(' ');

  return `
    <button id="${opts.id}" class="${classes}" ${opts.disabled ? 'disabled' : ''} ${opts.dataAction ? `data-action="${opts.dataAction}"` : ''} ${ariaAttrs}>
      <span class="action-btn__icon">${renderIcon(opts.icon, 'md')}</span>
      <span class="action-btn__label">${opts.label}</span>
      ${costHtml}
      ${kbdHtml}
    </button>`;
}
