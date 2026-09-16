// src/strings/es/cues.ts
// Short floating texts over the board (eventLog.boardCuesFor).

import { plural } from './core';

export const cues = {
  hits: (n: number) => `${n} ${plural(n, 'impacto', 'impactos')}`,
  miss: 'Fallo',
  doorOpen: 'Abierta',
} as const;
