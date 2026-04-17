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
  tappable?: boolean;       // Adds pointer cursor for tap-to-select UIs
  showSlot?: boolean;       // Show "WEAPON · Hand 1" line (default true)
  showStats?: boolean;      // Show stats inline with name (default true)
  placed?: boolean;         // Grayed-out state for featured items that have been placed
  discarded?: boolean;      // Subtle red tint for items in the discard zone
  // Skill-boosted stat modifiers (shown in green)
  bonusDice?: number;
  bonusDamage?: number;
}

function getTypeIconName(card: EquipmentCard): string {
  if (card.type === 'WEAPON') return card.stats && card.stats.range[0] === 0 ? 'Swords' : 'Crosshair';
  return 'Package';
}

export function renderItemCard(card: EquipmentCard | null | undefined, opts?: ItemCardOptions): string {
  if (!card) return '';

  const {
    variant = 'default',
    badge,
    tappable = false,
    showSlot = true,
    showStats = true,
    placed = false,
    discarded = false,
    bonusDice = 0,
    bonusDamage = 0,
  } = opts ?? {};

  const variantClass = variant !== 'default' ? ` item-card--${variant}` : '';
  const placedClass = placed ? ' item-card--placed' : '';
  const discardedClass = discarded ? ' item-card--discarded' : '';
  const tappableClass = tappable ? ' item-card--tappable' : '';
  const typeIcon = icon(getTypeIconName(card), 'sm');

  // Stats inline with name: "Shotgun 4+ · 2d6 · 2 dmg" with optional green boosts
  let statsInline = '';
  if (showStats && card.stats) {
    const diceStr = bonusDice > 0
      ? `${card.stats.dice}<span class="item-card__boosted">+${bonusDice}</span>d6`
      : `${card.stats.dice}d6`;
    const dmgStr = bonusDamage > 0
      ? `${card.stats.damage}<span class="item-card__boosted">+${bonusDamage}</span> dmg`
      : `${card.stats.damage} dmg`;
    statsInline = `<span class="item-card__stats">${card.stats.accuracy}+ · ${diceStr} · ${dmgStr}</span>`;
  }

  // Secondary line: "WEAPON · Hand 1"
  const slotLabel = card.slot || 'Backpack';
  const metaLine = showSlot
    ? `<div class="item-card__meta">${card.type} · ${slotLabel}</div>`
    : '';

  const badgeHtml = badge
    ? `<span class="item-card__badge">${badge}</span>`
    : '';

  return `
    <div class="item-card${variantClass}${placedClass}${discardedClass}${tappableClass}"
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
