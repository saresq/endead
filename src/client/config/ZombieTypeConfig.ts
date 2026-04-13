/**
 * ZombieTypeConfig — Display properties for each zombie type.
 *
 * Maps ZombieType enum values to visual identity: color token, icon, shape, scale.
 * Used by ZombieBadge component, board renderer, event log, and spawn notifications.
 */

import { ZombieType } from '../../types/GameState';

export interface ZombieTypeDisplay {
  label: string;
  initial: string;        // Single-letter abbreviation for compact UI (e.g. 'Z', 'R', 'B', 'A')
  color: string;          // CSS custom property name (e.g. '--zombie-walker')
  colorHex: string;       // Raw hex for contexts needing a direct value
  colorNumeric: number;   // For PIXI renderer
  iconName: string;       // Lucide icon name
  boardSides: number;     // Polygon sides for board shape (6=hex, 7=heptagon, etc.)
  boardScale: number;     // Relative to base entity radius
}

const ZOMBIE_CONFIG: Record<ZombieType, ZombieTypeDisplay> = {
  [ZombieType.Walker]: {
    label: 'Walker',
    initial: 'Z',
    color: 'var(--zombie-walker)',
    colorHex: '#4a6b4f',
    colorNumeric: 0x4a6b4f,
    iconName: 'Users',
    boardSides: 6,
    boardScale: 1,
  },
  [ZombieType.Runner]: {
    label: 'Runner',
    initial: 'R',
    color: 'var(--zombie-runner)',
    colorHex: '#b87a1e',
    colorNumeric: 0xb87a1e,
    iconName: 'Zap',
    boardSides: 7,
    boardScale: 0.9,
  },
  [ZombieType.Brute]: {
    label: 'Brute',
    initial: 'B',
    color: 'var(--zombie-brute)',
    colorHex: '#6a3d7d',
    colorNumeric: 0x6a3d7d,
    iconName: 'Shield',
    boardSides: 8,
    boardScale: 1.3,
  },
  [ZombieType.Abomination]: {
    label: 'Abomination',
    initial: 'A',
    color: 'var(--zombie-abom)',
    colorHex: '#8b2020',
    colorNumeric: 0x8b2020,
    iconName: 'Flame',
    boardSides: 9,
    boardScale: 1.6,
  },
};

export function getZombieTypeDisplay(type: ZombieType): ZombieTypeDisplay {
  return ZOMBIE_CONFIG[type];
}

export function getZombieLabel(type: ZombieType): string {
  return ZOMBIE_CONFIG[type].label;
}

export function getZombieColorHex(type: ZombieType): string {
  return ZOMBIE_CONFIG[type].colorHex;
}

export function getZombieColorNumeric(type: ZombieType): number {
  return ZOMBIE_CONFIG[type].colorNumeric;
}
