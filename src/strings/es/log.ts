// src/strings/es/log.ts
// History descriptions (server handlers) and event entry text (EventEntry).

import { plural, equipment, skills } from './core';
import { colorWord } from './objectives';

export const log = {
  // --- Server-authored descriptions ---
  molotov: (killed: number, burned: number) =>
    `Tiró una Molotov: eliminó ${killed} ${plural(killed, 'zombie', 'zombies')} y quemó a ${burned} ${plural(burned, 'superviviente', 'supervivientes')}`,
  attack: (weapon: string, dual: boolean, threshold: number) =>
    `Atacó con ${weapon}${dual ? ' (ambidiestro)' : ''} (necesita ${threshold}+)`,
  doorOpened: (spawned: boolean) => (spawned ? 'Abrió una puerta: ¡aparecieron zombies!' : 'Abrió una puerta'),
  doorOpenedShort: 'Abrió una puerta',
  moved: 'Se movió',
  shoved: (count: number) => `Empujó a ${count} ${plural(count, 'zombie', 'zombies')} a la zona de al lado`,
  consumed: (item: string) => `Consumió ${item} (+1 XP)`,
  found: (items: string[], traps: number) => `Encontró: ${items.join(', ')}${traps > 0 ? ` (${traps} Aaahh!!)` : ''}`,
  searchTrap: 'Aaahh!!: ¡apareció un zombie!',
  epicWeapon: (weapon: string) => `Sacó un arma épica: ${weapon}`,
  tookObjective: (color: string, xp: number) => `Tomó un objetivo ${colorWord(color, 1)} (+${xp} XP)`,
  cheat: (previousName: string, cheatName: string) =>
    `${previousName} activó un truco: ahora juega como ${cheatName} con acciones ilimitadas.`,
  /** Stored in `lastAction.freeActionType` and shown as a chip. */
  freeMove: 'Moverse gratis',
  freeSearch: 'Buscar gratis',
  freeMelee: 'Cuerpo a cuerpo gratis',
  freeRanged: 'A distancia gratis',
  freeCombat: 'Combate gratis',
  reloaded: (weapon: string) => `Recargó ${weapon}`,
  reloadedFree: (count: number) =>
    `Recargó ${count} ${plural(count, 'arma', 'armas')} en la Fase Final`,

  // --- Event entry (client) ---
  dieLabel: (value: number, state: 'hit' | 'miss' | 'discarded') =>
    `${value}, ${state === 'discarded' ? 'descartado' : state === 'hit' ? 'impacto' : 'fallo'}`,
  rerollSources: {
    lucky: skills.lucky?.name ?? 'Suertudo',
    plenty_of_bullets: equipment.plenty_of_bullets ?? 'Munición de sobra',
    plenty_of_shells: equipment.plenty_of_shells ?? 'Cartuchos de sobra',
  } as Record<string, string>,
  rerolledFallback: 'Nueva tirada',
  rerolled: (source: string) => `${source}, volvió a tirar:`,
  luckyReroll: 'Suertudo, volvió a tirar:',
  bonusDice: (n: number) => `+${n} ${plural(n, 'dado', 'dados')}`,
  bonusDamage: (n: number) => `+${n} daño`,
  miss: 'Fallo',
  hits: (n: number) => `${n} ${plural(n, 'impacto', 'impactos')}`,
  damageEach: (n: number) => ` · ${n} de daño cada uno`,
  /** `label` is the plural zombie name. */
  extraActivation: (label: string) => `Activación extra: ${label}`,
  /** Rush card marker on a spawn line: placed, then activated on the spot. */
  rush: '¡Rush!',
  rushHint: 'aparecen y activan al instante',
  zombieWounds: 'Heridas de zombies',
  inZone: (zone: string) => `en ${zone}`,
  tradeWith: (name: string) => `con ${name}`,
} as const;
