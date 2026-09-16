// src/strings/es/connection.ts
// Connection banners and session toasts (main.ts), lobby connection-lost screen.

export const connection = {
  reconnecting: (attempt: number, max: number) => `Reconectando… (${attempt}/${max})`,
  reconnected: '¡Conectado de nuevo!',
  lost: 'Se perdió la conexión. Recargá la página.',
  // Lobby scrim
  lostTitle: 'Sin conexión',
  lostBody: 'Se cortó la conexión con el servidor. Tu sala sigue guardada.',
  retrying: 'Reconectando',
  retryingAttempt: (attempt: number, max: number) => `Reconectando · ${attempt}/${max}`,
  dropped: 'Conexión caída',
  offlineFor: (mmss: string) => `Sin conexión hace ${mmss}`,
  nextRetry: (seconds: number) => `Próximo intento en ${seconds} s`,
  reconnectingNow: 'Reconectando…',
  reconnect: 'Reconectar',

  // Session toasts raised by main.ts (not tied to a HUD element)
  turnToast: 'Es tu turno',
  cheatTitle: 'Truco activado',
  cheatMessage: 'Un jugador activó un truco.',
} as const;
