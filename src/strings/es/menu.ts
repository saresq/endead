// src/strings/es/menu.ts
// Entry screen (MenuUI) and the messages main.ts sends back to it.

export const menu = {
  subline: 'Apoka zombi · supervivencia cooperativa',
  nameLabel: 'Tu nombre',
  namePlaceholder: 'Cómo te ven los demás',
  createRoom: 'Crear sala',
  joinDivider: 'o unite a una sala',
  joinLabel: 'Código o enlace',
  joinPlaceholder: 'ej. k3j9x2',
  join: 'Unirme',
  back: 'Volver',
  createFailed: 'No se pudo crear la sala. Probá de nuevo.',
  roomNotFound: (code: string) =>
    `No encontramos la sala ${code}. Revisá el código con quien te invitó.`,
  serverFull: 'El servidor está lleno. Probá de nuevo en un rato.',
  sessionReplaced: 'Abriste esta partida en otra pestaña o dispositivo.',
  kicked: 'El anfitrión te sacó de la sala.',
} as const;
