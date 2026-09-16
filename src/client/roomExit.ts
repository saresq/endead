
// src/client/roomExit.ts
//
// Leaving a room is the same act from the lobby, the pause menu and the
// game-over screen: drop the socket, drop the room from the URL, and start
// over at the entry screen. One definition so the three surfaces cannot drift.

import { networkManager } from './NetworkManager';

export function leaveRoom(): void {
  networkManager.disconnect();
  window.history.pushState({}, '', '/');
  window.location.reload();
}
