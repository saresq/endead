// src/strings/es/objectives.ts
// Win-condition / objective descriptions (built on the server by ScenarioCompiler).

import { plural } from './core';

/** Objective token colours as adjectives for "objetivo(s)". Keyed by ObjectiveColor value. */
export const objectiveColors: Record<string, { one: string; many: string }> = {
  YELLOW: { one: 'amarillo', many: 'amarillos' },
  RED: { one: 'rojo', many: 'rojos' },
  BLUE: { one: 'azul', many: 'azules' },
  GREEN: { one: 'verde', many: 'verdes' },
};

/** Colour adjective agreeing with "objetivo(s)". */
export function colorWord(color: string, n: number): string {
  const c = objectiveColors[color];
  return c ? plural(n, c.one, c.many) : color.toLowerCase();
}

export const objectives = {
  reachExit: 'Todos los supervivientes tienen que llegar a la salida',
  takeObjective: (n: number) => `Tomar ${n} ${plural(n, 'objetivo', 'objetivos')}`,
  takeColorObjective: (n: number, color: string) =>
    `Tomar ${n} ${plural(n, 'objetivo', 'objetivos')} ${colorWord(color, n)}`,
  takeEpicCrate: (n: number) => `Abrir ${n} ${plural(n, 'caja', 'cajas')} de armas épicas`,
  /** `label` is the already-pluralised zombie name (`zombieLabel(type, n)` or zombie/zombies). */
  killZombie: (n: number, label: string) => `Eliminar ${n} ${label}`,
  anyZombie: (n: number) => plural(n, 'zombie', 'zombies'),
  collectItems: (parts: string[]) => `Juntar objetos: ${parts.join(', ')}`,
  itemQuantity: (quantity: number, item: string) => `${quantity}× ${item}`,
  reachDangerLevel: (level: string) => `Llegar al nivel de peligro ${level}`,
  takeAllObjectives: (n: number) => `Tomar todos los objetivos (${n})`,
} as const;
