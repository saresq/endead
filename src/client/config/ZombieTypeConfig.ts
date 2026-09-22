/**
 * ZombieTypeConfig — Display properties for each zombie type.
 *
 * Maps ZombieType enum values to visual identity: color token, icon, shape, scale.
 * Used by the board renderer, event log, and spawn notifications.
 */

import { ZombieType } from '../../types/GameState';
import { zombieLabel } from '../../strings/es';

export interface ZombieTypeDisplay {
  label: string;
  initial: string;        // Spanish abbreviation for the board token — two letters only
                          // where one would collide (Caminante / Corredor)
  color: string;          // CSS custom property name (e.g. '--zombie-walker')
  colorHex: string;       // Raw hex for contexts needing a direct value
  colorNumeric: number;   // For PIXI renderer
  iconName: string;       // Lucide icon name
  boardSides: number;     // Polygon sides for board shape (6=hex, 7=heptagon, etc.)
  boardScale: number;     // Relative to base entity radius
}

const ZOMBIE_CONFIG: Record<ZombieType, ZombieTypeDisplay> = {
  [ZombieType.Walker]: {
    label: zombieLabel(ZombieType.Walker),
    initial: 'CA',
    color: 'var(--zombie-walker)',
    colorHex: '#7f9f53',
    colorNumeric: 0x7f9f53,
    iconName: 'Users',
    boardSides: 6,
    boardScale: 1,
  },
  [ZombieType.Runner]: {
    label: zombieLabel(ZombieType.Runner),
    initial: 'CO',
    color: 'var(--zombie-runner)',
    colorHex: '#e07937',
    colorNumeric: 0xe07937,
    iconName: 'Zap',
    boardSides: 7,
    boardScale: 0.9,
  },
  [ZombieType.Brute]: {
    label: zombieLabel(ZombieType.Brute),
    initial: 'B',
    color: 'var(--zombie-brute)',
    colorHex: '#ab7ed2',
    colorNumeric: 0xab7ed2,
    iconName: 'Shield',
    boardSides: 8,
    boardScale: 1.3,
  },
  [ZombieType.Abomination]: {
    label: zombieLabel(ZombieType.Abomination),
    initial: 'A',
    color: 'var(--zombie-abom)',
    colorHex: '#e06062',
    colorNumeric: 0xe06062,
    iconName: 'Flame',
    boardSides: 9,
    boardScale: 1.6,
  },
};

export function getZombieTypeDisplay(type: ZombieType): ZombieTypeDisplay {
  return ZOMBIE_CONFIG[type];
}

export function getZombieLabel(type: ZombieType, n = 1): string {
  return zombieLabel(type, n);
}

export function getZombieColorHex(type: ZombieType): string {
  return ZOMBIE_CONFIG[type].colorHex;
}

export function getZombieColorNumeric(type: ZombieType): number {
  return ZOMBIE_CONFIG[type].colorNumeric;
}
