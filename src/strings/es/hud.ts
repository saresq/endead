// src/strings/es/hud.ts
// Game screen: top bar, squad, operative sheet/rail, action buttons, toasts.

import { plural } from './core';

export const hud = {
  // Map window
  recenter: 'Centrar mapa',
  recenterTitle: 'Centrar mapa (F)',

  // Top bar
  round: 'Ronda',
  roundChipAria: (n: number) => `Ronda ${n}, abrir registro de eventos`,
  phaseAria: (label: string) => `Fase actual: ${label}`,
  phaseZombies: 'Zombies',
  phaseEnd: 'Fin de ronda',
  phasePlayers: (name: string) => (name ? `Turno de ${name}` : 'Jugadores'),
  danger: 'Peligro',
  dangerAria: (level: string) => `Nivel de peligro: ${level}`,
  menu: 'Menú',
  logTitle: 'Registro de eventos (L)',
  logAria: 'Registro de eventos',
  logAriaUnread: 'Registro de eventos, hay novedades',
  openLog: 'Abrir registro de eventos',

  // Turn line
  yourTurn: (actions: number | null) =>
    actions === null
      ? 'Es tu turno · ∞ acciones'
      : `Es tu turno · ${actions}\u00a0${plural(actions, 'acción', 'acciones')}`,
  waitingFor: (name: string) => `Esperando a ${name}`,

  // Squad
  squad: (n: number) => `Jugadores · ${n}`,
  callsign: (n: string) => `J-${n}`,
  chipAria: (name: string, hp: number, max: number, isTurn: boolean) =>
    `${name}, ${hp} de ${max} de vida${isTurn ? ', es su turno' : ''}`,

  // Latest-event card
  luckyReroll: 'Volver a tirar',
  luckyRerollTitle: 'Suertudo: volvé a tirar los dados. El nuevo resultado queda aunque sea peor.',

  // Operative sheet / rail
  sheetLabel: 'Superviviente',
  actionsToolbar: 'Acciones',
  healthAria: (hp: number, max: number) => `Vida ${hp} de ${max}`,
  actionsAria: (n: number | null, max: number) =>
    n === null ? 'Acciones ilimitadas' : `Acciones ${n} de ${max}`,
  vitals: 'Vida',
  actions: 'Acciones',
  xp: 'XP',
  xpMax: 'Máx',
  xpAria: 'Experiencia',
  pendingWounds: (n: number) =>
    `${n} ${plural(n, 'herida pendiente', 'heridas pendientes')}: tocá para resolver`,

  // Action buttons
  search: 'Buscar',
  noise: 'Ruido',
  door: 'Puerta',
  reload: 'Recargar',
  objective: 'Objetivo',
  // Soft hyphen lets the 56px strip buttons break it as INTER- / CAMBIAR.
  trade: 'Inter\u00adcambiar',
  // Soft hyphen: ORGA- / NIZAR in the 56px strip buttons.
  organize: 'Orga\u00adnizar',
  sprint: 'Esprintar',
  charge: 'Carga',
  bornLeader: 'Líder nato',
  bloodlust: 'Sed de sangre',
  lifesaver: 'Salvavidas',
  jump: 'Salto',
  shove: 'Empujón',

  // Free action pips
  freeMove: 'Acción gratuita: Moverse',
  freeCombat: 'Acción gratuita: combate',
  freeMelee: 'Acción gratuita: cuerpo a cuerpo',
  freeRanged: 'Acción gratuita: a distancia',

  // Loadout
  loadout: 'Equipo',
  rightHand: 'Mano derecha',
  leftHand: 'Mano izquierda',
  emptySlotAria: (slot: string) => `${slot}: vacía`,
  bag: 'Mochila',
  openBag: 'Abrir mochila',
  openBagAria: (n: number) => `Abrir mochila (${n} ${plural(n, 'objeto', 'objetos')})`,
  discardItem: (item: string) => `Descartar ${item} (gratis)`,

  // Toasts
  toast: {
    notYourTurn: 'No es tu turno.',
    noActions: 'No te quedan acciones.',
    pickAttackZone: 'Elegí una zona para atacar.',
    pickDoor: 'Elegí una zona con una puerta cerrada para abrirla.',
    pickAttackOrDoor: 'Elegí una zona para atacar, o una puerta marcada para abrirla.',
    pickSprint: 'Elegí una zona para esprintar (hasta 3 zonas).',
    pickCharge: 'Elegí una zona con zombies para cargar (hasta 2 zonas).',
    pickBloodlust: 'Elegí una zona con zombies (hasta 2 zonas).',
    pickLifesaver: 'Elegí una zona a alcance 1 con zombies y supervivientes.',
    pickJump: 'Elegí una zona a 2 de distancia: saltás por encima de lo que haya en el medio.',
    pickShove: 'Elegí la zona contigua a la que empujás a los zombies.',
    noBornLeaderTarget: 'No hay nadie más acá para darle una acción.',
    noTradeTarget: 'No hay nadie más acá para intercambiar.',
  },
} as const;
