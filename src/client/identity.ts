// src/client/identity.ts
//
// Which player a browser tab is. Normally one browser is one player, kept in
// localStorage so an accidental close can be undone: reopening the room URL
// returns the same playerId and the server hands the survivor back. A tab that
// wants to be someone else — a second player driven from the same browser —
// loads any URL with a `tab` parameter and keeps its identity in
// sessionStorage instead, which is scoped to one top-level browsing context.
//
// The store choice is its own latch: a tab whose id already sits in
// sessionStorage is, by that fact alone, a tab that uses sessionStorage. No
// second flag, because the parameter does not survive — pushState rewrites the
// location to /room/<id> or / at six call sites in main.ts, and roomExit
// reloads on top of that. The invariant that makes the latch work is that the
// id must be claimed while `tab` is still readable in the URL, so init() mints
// it at load rather than leaving it to whichever accessor happens to run first.

const PLAYER_ID_KEY = 'endead_player_id';
const NICKNAME_KEY = 'endead_nickname';

/** Pure seam: does this tab use its own identity? `tabHasId` is the latch. */
export function usesTabIdentity(search: string, tabHasId: boolean): boolean {
  return tabHasId || new URLSearchParams(search).has('tab');
}

let warned = false;

/** The store this tab's identity lives in. A blocked sessionStorage degrades to
 *  the shared identity rather than a new crash — loudly, because the symptom is
 *  then the very one this module exists to remove. */
function store(): Storage {
  let tabHasId: boolean;
  try {
    tabHasId = sessionStorage.getItem(PLAYER_ID_KEY) !== null;
  } catch {
    if (!warned) {
      warned = true;
      console.warn(
        'sessionStorage is unavailable: this tab shares the stored identity and ' +
        'may be replaced by another tab of the same browser.'
      );
    }
    return localStorage;
  }
  return usesTabIdentity(window.location.search, tabHasId) ? sessionStorage : localStorage;
}

export function getOrCreatePlayerId(): string {
  const s = store();
  let playerId = s.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = `player-${Math.floor(Math.random() * 1000000)}`;
    s.setItem(PLAYER_ID_KEY, playerId);
  }
  return playerId;
}

export function getNickname(): string {
  const stored = store().getItem(NICKNAME_KEY)?.trim();
  if (stored) return stored;
  return getOrCreatePlayerId();
}

export function setNickname(value: string): void {
  const trimmed = value.trim().slice(0, 24);
  store().setItem(NICKNAME_KEY, trimmed || getOrCreatePlayerId());
}
