// src/strings/es/errors.ts
// Server rejections a player can trigger with a normal tap (ACTION_FAILED toasts
// and TurnManager codes). Internal-invariant throws stay English in code.

import { plural } from './core';

export const errors = {
  // Turn / economy
  notPlayersPhase: 'Ahora no se puede actuar: esperá la fase de jugadores.',
  notYourTurn: 'No es tu turno.',
  notYourSurvivor: 'Ese superviviente no es tuyo.',
  survivorDead: (name: string) => `${name} murió y no puede actuar.`,
  noActionsLeft: (name: string) => `${name} no tiene más acciones.`,
  noActions: 'No te quedan acciones.',
  notEnoughActions: (required: number) => `Te faltan acciones (necesitás ${required}).`,
  pendingWounds: 'Primero hay que resolver las heridas pendientes.',
  pendingSkillChoice: 'Primero elegí la habilidad que te ganaste.',

  // Skills
  noSkill: (skill: string) => `No tenés la habilidad ${skill}.`,
  skillUsed: (skill: string) => `Ya usaste ${skill} este turno.`,
  cannotChooseSkill: 'No podés elegir esa habilidad.',
  pathLength: (skill: string, min: number, max: number) =>
    `${skill}: elegí un camino de ${min} a ${max} zonas.`,
  needZombieAtDestination: (skill: string) => `${skill}: en el destino tiene que haber al menos 1 zombi.`,
  chooseSurvivor: 'Elegí a un superviviente.',
  targetDead: 'Ese superviviente murió.',
  sameZone: 'Tiene que estar en tu zona.',
  giveActionSelf: 'No podés darte una acción a vos mismo.',
  targetTurnOver: 'Ese superviviente ya jugó su turno y no podría usar la acción.',
  lifesaverRange: 'La zona tiene que estar a la vista y a alcance 1.',
  shoveRange: 'Empujalos a una zona contigua con camino despejado.',
  shoveNeedsZombie: 'En tu zona no hay zombis para empujar.',
  lifesaverNeedsZombie: 'En esa zona tiene que haber al menos 1 zombi.',
  lifesaverChooseSurvivor: 'Elegí al menos 1 superviviente para rescatar.',
  lifesaverNeedsSurvivor: 'En esa zona tiene que haber otro superviviente.',

  // Movement / doors
  tooManyZones: 'No podés moverte más de 2 zonas.',
  oneZoneOnly: 'Solo podés moverte 1 zona.',
  zonesNotConnected: 'Esas zonas no están conectadas.',
  doorClosed: 'La puerta está cerrada: abrila primero.',
  doorClosedOnPath: 'Hay una puerta cerrada en el camino.',
  noDoor: 'Ahí no hay puerta.',
  doorAlreadyOpen: 'La puerta ya está abierta.',
  needDoorOpener: 'Necesitás en la mano algo para abrir puertas.',

  // Combat
  weaponNotInHand: 'Esa arma no está en tu mano.',
  noWeaponInHand: 'No tenés un arma en la mano.',
  chooseWeapon: 'Tenés más de un arma: elegí con cuál atacar.',
  notAWeapon: 'Eso no es un arma.',
  noLineOfSight: 'No tenés línea de visión hacia esa zona.',
  outOfRange: (distance: number, range: string) =>
    `Fuera de alcance (distancia ${distance}, alcance del arma ${range}).`,
  meleeOwnZone: 'El cuerpo a cuerpo solo ataca en tu zona.',
  weaponNeedsReload: (weapon: string) => `${weapon} está descargada: recargá antes de volver a disparar.`,
  weaponNotReloadable: (weapon: string) => `${weapon} no necesita recargarse.`,
  weaponAlreadyLoaded: (weapon: string) => `${weapon} ya está cargada.`,
  noPendingWounds: 'No hay heridas pendientes.',
  hostOnlyWounds: 'No te toca a vos repartir estas heridas.',
  noPendingZombieWounds: 'No hay heridas de zombis pendientes.',
  assignExactWounds: (total: number, assigned: number) =>
    `Tenés que repartir exactamente ${total} ${plural(total, 'herida', 'heridas')} (repartiste ${assigned}).`,
  noAttackToReroll: 'No hay un ataque reciente para volver a tirar.',
  rerollUnavailable: 'No se puede volver a tirar este ataque.',

  // Items / search
  notConsumable: (item: string) => `${item} no se puede consumir.`,
  alreadySearched: 'Ya buscaste este turno.',
  searchOnlyInBuildings: 'Solo podés buscar dentro de edificios.',
  searchWithZombies: 'No podés buscar con zombis en la zona.',
  deckEmpty: 'No quedan cartas en el mazo.',
  noDrawnCard: 'No hay una carta para resolver.',
  slotOccupied: 'Ese espacio está ocupado: mové primero lo que hay.',
  chooseCardToReplace: 'Elegí qué carta reemplazar.',
  noEpicCrate: 'No hay una caja de armas épicas en esta zona.',
  resolvePendingCard: 'Primero resolvé la carta pendiente.',
  epicDeckEmpty: 'No quedan armas épicas.',
  noObjective: 'No hay un objetivo en esta zona.',

  // Inventory
  organizeNeedsSession: 'Abrí "Organizar" antes de mover el equipo.',
  reorganizeActive: 'Ya estás organizando el equipo.',
  noReorganize: 'No estás organizando el equipo.',

  // Trade
  tradeActive: 'Ya hay un intercambio en curso.',
  noTrade: 'No hay un intercambio en curso.',
  notInTrade: 'No participás de este intercambio.',
  offerOwnItems: 'Solo podés ofrecer cosas tuyas.',
  tradePartnerDead: 'No podés intercambiar con un superviviente muerto.',
  tradeNoSlot: 'Falta decir dónde va cada carta que recibís.',

  // Inventory rules (a rejection has to name the rule it broke)
  loadoutTooManyHands: 'No podés llevar más de dos cartas en las manos.',
  loadoutTooManyCards: 'No podés llevar más de cinco cartas.',
  loadoutSlotTaken: 'No podés poner dos cartas en el mismo espacio.',

  // Lobby / meta
  gameStarted: 'La partida ya empezó.',
  nameRequired: 'Escribí un nombre.',
  notInLobby: 'No estás en la sala.',
  characterTaken: 'Ese superviviente ya lo eligió otro jugador.',
  unknownCharacter: 'Ese superviviente no existe.',
  hostOnlyStart: 'Solo el anfitrión puede empezar la partida.',
  hostOnlyEnd: 'Solo el anfitrión puede terminar la partida.',
  cheatsOnlyInGame: 'Los trucos solo funcionan durante la partida.',
  noSurvivor: 'No tenés un superviviente.',
} as const;
