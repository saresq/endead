// src/strings/es/board.ts
// Board canvas and tooltips, melee target picker, and shared UI components
// (item card, squad plate, stat cell, photo slot, action button, notifications).

import { plural } from './core';

export const board = {
  // Canvas
  moveCost: (n: number) => `${n} acc.`,
  preview: 'Vista previa · sin mapa',

  // Tooltips
  health: 'Vida',

  // Melee target picker
  pickerTitle: 'Elegí objetivos',
  pickerSubtitle: (weapon: string) => `${weapon} (cuerpo a cuerpo) · elegí el orden`,
  pickerBody: 'Tocá los zombis en el orden en que querés eliminarlos. El primero que toques cae primero.',
  pickerNone: 'Elegí un objetivo',
  pickerAttack: (n: number) => `Atacar (${n} ${plural(n, 'objetivo', 'objetivos')})`,

  // Item card
  damageUnit: 'daño',
  slotsFree: (n: number) => `${n} ${plural(n, 'espacio libre', 'espacios libres')}`,

  // Squad plate
  turnAria: 'Es su turno',
  turn: 'Su turno',
  hp: 'Vida',
  actions: 'Acciones',

  // Stat cell
  unlimited: 'Ilimitado',

  // Photo slot
  selected: 'Elegido',

  // Action button
  keyHint: (key: string) => `tecla: ${key}`,

  // Tap feedback
  zoneUnreachable: 'No llegás a esa zona',
} as const;
