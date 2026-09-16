// src/strings/es/gameOver.ts

export const gameOver = {
  victory: '¡Victoria!',
  defeat: 'Derrota',
  abandoned: 'Partida abandonada',
  victoryDesc: 'Todos los supervivientes escaparon.',
  defeatDesc: 'Los zombis los superaron.',
  abandonedDesc: (name: string) => `${name} abandonó la partida.`,
  playAgain: 'Jugar de nuevo',
  waitingHost: 'Esperando al anfitrión…',
  leave: 'Salir de la partida',
} as const;
