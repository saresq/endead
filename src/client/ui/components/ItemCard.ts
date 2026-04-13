/**
 * ItemCard — Universal item rendering used everywhere:
 * HUD weapon slots, backpack modal, pickup slots, trade slots, featured items.
 *
 * Layout:
 *   [Icon 32px] [ Name ··· Stats ]    ← single line, no wrapping
 *               [ Type · Slot    ]    ← secondary line (optional)
 *
 * Variants controlled via options, not separate components.
 */

import { EquipmentCard } from '../../../types/GameState';
import { icon } from './icons';

export type ItemCardVariant = 'default' | 'ghost' | 'featured' | 'weapon';

export interface ItemCardOptions {
  variant?: ItemCardVariant;
  badge?: string;           // "NEW", "GET", "PLACED" — floats top-right
  draggable?: boolean;
  showSlot?: boolean;       // Show "WEAPON · Hand 1" line (default true)
  showStats?: boolean;      // Show stats inline with name (default true)
  placed?: boolean;         // Grayed-out state for featured items that have been placed
  discarded?: boolean;      // Subtle red tint for items in the discard zone
}

function getTypeIconName(card: EquipmentCard): string {
  if (card.type === 'WEAPON') return card.stats && card.stats.range[0] === 0 ? 'Swords' : 'Crosshair';
  if (card.type === 'ARMOR') return 'Shield';
  return 'Package';
}

export function renderItemCard(card: EquipmentCard | null | undefined, opts?: ItemCardOptions): string {
  if (!card) return '';

  const {
    variant = 'default',
    badge,
    draggable = false,
    showSlot = true,
    showStats = true,
    placed = false,
    discarded = false,
  } = opts ?? {};

  const variantClass = variant !== 'default' ? ` item-card--${variant}` : '';
  const placedClass = placed ? ' item-card--placed' : '';
  const discardedClass = discarded ? ' item-card--discarded' : '';
  const typeIcon = icon(getTypeIconName(card), 'sm');

  // Stats inline with name: "Shotgun 4+ · 2d6 · 2 dmg"
  const statsInline = showStats && card.stats
    ? `<span class="item-card__stats">${card.stats.accuracy}+ · ${card.stats.dice}d6 · ${card.stats.damage} dmg</span>`
    : '';

  // Secondary line: "WEAPON · Hand 1"
  const slotLabel = card.slot || 'Backpack';
  const metaLine = showSlot
    ? `<div class="item-card__meta">${card.type} · ${slotLabel}</div>`
    : '';

  const badgeHtml = badge
    ? `<span class="item-card__badge">${badge}</span>`
    : '';

  return `
    <div class="item-card${variantClass}${placedClass}${discardedClass}"
         ${draggable ? 'draggable="true"' : ''}
         data-id="${card.id}"
         data-ghost="${variant === 'ghost' || variant === 'featured'}">
      ${badgeHtml}
      <span class="item-card__icon">${typeIcon}</span>
      <div class="item-card__body">
        <span class="item-card__name">${card.name}</span>
        ${statsInline}
        ${metaLine}
      </div>
    </div>`;
}

/**
 * Renders an empty slot placeholder.
 */
export function renderEmptySlot(): string {
  return '<span class="item-card__empty">Empty</span>';
}
