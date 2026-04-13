/**
 * Button — Stateless render function for all button variants.
 *
 * Usage:
 *   renderButton({ label: 'Start', icon: 'Play', variant: 'primary', size: 'lg' })
 */

import { icon } from './icons';

export interface ButtonOptions {
  label?: string;
  icon?: string;                // Lucide icon name
  iconPosition?: 'left' | 'right';
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  dataAction?: string;          // data-action for event delegation
  dataId?: string;              // data-id for identifying target
  className?: string;
  title?: string;               // tooltip / aria-label for icon-only
}

export function renderButton(opts: ButtonOptions): string {
  const variant = opts.variant ?? 'secondary';
  const size = opts.size ?? 'md';
  const iconPos = opts.iconPosition ?? 'left';

  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    opts.disabled ? 'btn--disabled' : '',
    opts.loading ? 'btn--loading' : '',
    opts.fullWidth ? 'btn--full' : '',
    opts.className ?? '',
  ].filter(Boolean).join(' ');

  const attrs = [
    `class="${classes}"`,
    opts.disabled ? 'disabled' : '',
    opts.dataAction ? `data-action="${opts.dataAction}"` : '',
    opts.dataId ? `data-id="${opts.dataId}"` : '',
    opts.title ? `title="${opts.title}" aria-label="${opts.title}"` : '',
  ].filter(Boolean).join(' ');

  const iconSize = size === 'sm' ? 'sm' : 'md';
  const iconHtml = opts.icon ? `<span class="btn__icon">${icon(opts.icon, iconSize)}</span>` : '';
  const labelHtml = opts.label ? `<span class="btn__label">${opts.label}</span>` : '';

  const content = iconPos === 'right'
    ? `${labelHtml}${iconHtml}`
    : `${iconHtml}${labelHtml}`;

  return `<button ${attrs}>${content}</button>`;
}
