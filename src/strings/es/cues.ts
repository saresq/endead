// src/strings/es/cues.ts
// Short floating texts over the board (eventLog.boardCuesFor).

import { plural } from './core';

export const cues = {
  hits: (n: number) => `${n} ${plural(n, 'impacto', 'impactos')}`,
  miss: 'Fallo',
  doorOpen: 'Abierta',
  /** Rush card: the zombies just placed here activate at once. */
  rush: '¡Rush!',
  /** What a Zombie card placed in this zone, e.g. "+2 Brutos". */
  spawned: (n: number, label: string) => `+${n} ${label}`,
  /** Extra Activation card: every Zombie of that type acts again. */
  extraActivation: (label: string) => `Extra: ${label}`,
} as const;
