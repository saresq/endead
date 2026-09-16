// src/strings/es/serverErrors.ts
// server.ts error messages the client shows via `error.message`.

export const serverErrors = {
  spectator: 'Los espectadores no pueden jugar.',
  notHost: 'Solo el anfitrión puede sacar jugadores.',
  kickOnlyInLobby: 'Solo se puede sacar jugadores en la sala.',
  invalidKickTarget: 'A ese jugador no se lo puede sacar.',
  identityMismatch: 'Tu sesión no coincide con ese jugador. Recargá la página.',
  unauthorized: 'Primero tenés que entrar a la sala.',
  unknownError: 'La acción falló. Probá de nuevo.',
} as const;
