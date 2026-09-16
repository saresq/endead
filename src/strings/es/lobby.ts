// src/strings/es/lobby.ts
// Lobby screen (LobbyUI) and character dossier (LobbyDossier).

export const lobby = {
  connecting: 'Conectando a la sala',

  // Invite block
  inviteTitle: 'Invitá a tus amigos',
  roomCode: 'Código de sala',
  copyLink: 'Copiar enlace',
  copied: '¡Copiado!',
  copyLinkAria: 'Copiar enlace de invitación',
  inviteHint: 'Mandales el enlace o el código.',
  copyFailed: (url: string) => `No se pudo copiar. Enlace: ${url}`,

  // You: name + character grid
  nameLabel: 'Tu nombre',
  namePlaceholder: 'Escribí tu nombre',
  pickSurvivor: 'Elegí tu superviviente',
  pickAria: (name: string) => `Elegir a ${name}`,
  takenBy: (character: string, player: string) => `${character} (lo eligió ${player})`,

  // Players list
  players: 'Jugadores',
  playerFallback: 'Jugador',
  you: '(vos)',
  host: 'Anfitrión',
  choosing: 'Eligiendo…',
  ready: 'Listo',

  // Map
  map: 'Mapa',
  mapSelectAria: 'Elegir mapa',
  loadingMaps: 'Cargando mapas…',
  noPlayableMaps: 'Ningún mapa guardado es jugable. No se puede empezar.',
  mapHostPicks: 'Lo elige el anfitrión',

  // Options
  options: {
    title: 'Opciones',
    abominationFest: 'Horda de abominaciones',
    abominationFestDesc: 'Las abominaciones no se agotan: siguen apareciendo.',
    hard: 'Difícil',
  },

  // Footer
  startGame: (ready: number, total: number) => `Empezar partida · ${ready}/${total} listos`,
  missing: (names: string) => `Falta elegir: ${names}`,
  waitingFor: (host: string) => `Esperando a que ${host} empiece`,
  leave: 'Salir de la sala',

  // Host-left banner
  hostLeftTitle: 'El anfitrión se fue',
  hostLeftBody: 'Otro jugador pasa a ser el anfitrión.',
  secondsLeft: (n: number) => `Quedan ${n} segundos`,

  // Kick
  kickTitle: '¿Sacar al jugador?',
  kickBody: 'Este jugador va a salir de la sala.',
  kick: 'Sacar',

  // Dossier
  dossierTitle: (name: string) => `Superviviente · ${name}`,
  survivor: 'Superviviente',
  startingWeapon: 'Arma inicial',
  weaponStats: (accuracy: number, dice: number, damage: number) =>
    `Precisión ${accuracy}+ · ${dice} ${dice === 1 ? 'dado' : 'dados'} · Daño ${damage}`,
  xp: (n: number) => `${n} PX`,
  progression: 'Habilidades por nivel',
  pickOne: (n: number) => `Elegí 1 de ${n}`,
} as const;
