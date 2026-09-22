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

  // You: starting weapon grid
  pickWeapon: 'Elegí tu arma inicial',
  pickWeaponAria: (weapon: string) => `Elegir ${weapon}`,
  weaponGoneAria: (weapon: string) => `${weapon} (no quedan)`,
  weaponLeft: (n: number) => `Quedan ${n}`,
  weaponGone: 'Agotada',
  weaponMine: 'Tuya',
  opensDoors: 'Abre puertas',
  opensDoorsNoisy: 'Hace ruido al abrir',
  opensDoorsAria: (noisy: boolean) => (noisy ? 'abre puertas, hace ruido' : 'abre puertas'),

  // Players list
  players: 'Jugadores',
  playerFallback: 'Jugador',
  you: '(vos)',
  host: 'Anfitrión',
  choosing: 'Eligiendo…',
  ready: 'Listo',

  // Map
  map: 'Mapa',
  loadingMaps: 'Cargando mapas…',
  noPlayableMaps: 'Ningún mapa guardado es jugable. No se puede empezar.',
  mapHostPicks: 'Lo elige el anfitrión',
  mapOnlyOne: 'Es el único mapa disponible',

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
  dossierMore: 'Ver árbol completo',
  dossierMoreAria: (name: string) => `Ver el árbol de habilidades de ${name}`,
  survivor: 'Superviviente',
  profile: 'Ficha',
  health: (n: number) => `${n} ${n === 1 ? 'herida' : 'heridas'} para caer`,
  survivorType: { Classic: 'Clásico', Kid: 'Niño' } as Record<string, string>,
  kidNote: 'Escurridizo una vez por turno en un movimiento.',
  xp: (n: number) => `${n} XP`,
  progression: 'Habilidades por nivel',
  pickOne: (n: number) => `Elegí 1 de ${n}`,
} as const;
