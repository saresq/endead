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

  // Attack picker: targets, mode, Steady Hand and Barbarian
  pickerTitle: 'Elegí objetivos',
  pickerTitleOptions: 'Preparar el ataque',
  pickerSubtitle: (weapon: string) => `${weapon} (cuerpo a cuerpo) · elegí el orden`,
  pickerSubtitleRanged: (weapon: string) => `${weapon} (a distancia) · elegí el orden`,
  pickerBody: 'Tocá los zombis en el orden en que querés eliminarlos. El primero que toques cae primero.',
  pickerTieBody: 'Prioridad empatada: elegí a cuál golpear primero.',
  pickerNone: 'Elegí un objetivo',
  pickerAttack: (n: number) => `Atacar (${n} ${plural(n, 'objetivo', 'objetivos')})`,
  pickerAttackPlain: 'Atacar',
  pickerMode: 'Cómo atacar',
  pickerModeMelee: 'Cuerpo a cuerpo',
  pickerModeRanged: 'A distancia',
  pickerSteadyHand: 'Pulso firme',
  pickerSteadyHandBody: 'Elegí a quién protegés del fuego amigo.',
  pickerBarbarian: 'Bárbaro',
  pickerBarbarianBody: 'Tirá un dado por zombi en la zona en vez de los dados del arma.',

  // Molotov confirmation
  molotovTitle: 'La Molotov mata a todos',
  molotovBodyOthers: (names: string) =>
    `${names} está en la zona. La Molotov mata a todo lo que hay adentro, zombis y supervivientes por igual.`,
  molotovBodySelf: 'Estás parado en esa zona. La Molotov te mata a vos también.',
  molotovDefeat: 'Si muere un superviviente, la partida se pierde para todo el equipo.',
  molotovConfirm: 'Tirarla igual',
  molotovCancel: 'Mejor no',

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
