// src/strings/es/modals.ts
// Game screen modals and waiting banners.
// Functions that take a `count`/`name` string receive it already escaped or
// wrapped by the caller (e.g. `<strong>3</strong>`); strings here are plain text.

import { plural } from './core';

export const modals = {
  waiting: {
    hostAssigning: (host: string, n: number, zone: string) =>
      `${host} está repartiendo ${n} ${plural(n, 'herida', 'heridas')} de zombi en ${zone}`,
    playerAssigning: (name: string, n: number, zone: string) =>
      `${name} está repartiendo ${n} ${plural(n, 'fallo', 'fallos')} de fuego amigo en ${zone}`,
    resolvingWounds: (name: string) => `${name} está resolviendo sus heridas`,
    choosingSkill: (name: string) => `${name} está eligiendo una habilidad`,
  },

  skillChoice: {
    title: (name: string, level: string) => `${name} llegó al nivel ${level}: elegí una habilidad`,
  },

  woundPicker: {
    incoming: (count: string, n: number) =>
      `Vas a recibir ${count} ${plural(n, 'herida', 'heridas')}. Descartá equipo para evitarlas (1 carta = 1 herida menos).`,
    negated: 'Evitadas:',
    taken: 'Heridas recibidas:',
    confirm: (n: number) => `Recibir ${n} ${plural(n, 'herida', 'heridas')}`,
  },

  woundDist: {
    title: 'Repartir heridas de zombis',
    titleFriendlyFire: 'Repartir el fuego amigo',
    desc: (count: string, n: number, zone: string) =>
      `${count} ${plural(n, 'herida', 'heridas')} de zombi en ${zone}. Repartilas entre los supervivientes.`,
    descFriendlyFire: (count: string, n: number, zone: string, damage: number) =>
      `${count} ${plural(n, 'fallo', 'fallos')} en ${zone}. Cada uno hace ${damage} ${plural(damage, 'herida', 'heridas')}: repartilos entre los supervivientes.`,
    assigned: 'Asignadas:',
    remaining: 'Faltan:',
    hp: (n: number) => `${n} de vida`,
    confirm: 'Confirmar reparto',
  },

  bornLeader: {
    title: 'Líder nato: dar una acción gratuita',
  },

  trade: {
    title: 'Elegí con quién intercambiar',
  },

  food: {
    title: '¿Comer esto?',
    eatTitle: (name: string) => `Comer ${name}: +1 acción`,
    eatLabel: '+1 acc.',
    breaksObjective: (name: string) => `Si comés ${name}, se rompe tu objetivo:`,
    findAnother: 'Vas a tener que encontrar otra copia para cumplirlo.',
    consume: (name: string, bonus: string) => `¿Comer ${name} para ganar ${bonus} este turno?`,
    bonus: '+1 acción',
    discarded: 'La carta se descarta.',
    confirm: 'Comer (+1 acción)',
    confirmAnyway: 'Comer igual (+1 acción)',
    collectFallback: (n: number, item: string) => `Juntar ${n}× ${item}`,
  },

  backpack: {
    title: (n: number, cap: number) => `Mochila (${n}/${cap})`,
  },

  endGame: {
    title: '¿Terminar la partida?',
    body: 'Todos vuelven a la sala.',
    confirm: 'Sí, terminar',
  },

  pause: {
    title: 'Pausa',
    resume: 'Seguir jugando',
    mute: 'Silenciar',
    unmute: 'Activar sonido',
    endGame: 'Terminar partida',
    leave: 'Salir de la partida',
  },

  log: {
    title: 'Registro de eventos',
    empty: 'Todavía no hay acciones.',
    round: (n: number) => `Ronda ${n}`,
    current: 'actual',
  },
} as const;
