
// src/client/editor/editorSecret.ts
//
// The editor's half of the shared-secret gate. The secret is asked for once,
// kept in sessionStorage for the tab, and sent on every write. A 401 means the
// stored value is stale or wrong, so it is cleared and asked for again rather
// than leaving the author with silent save failures.

import { EDITOR_SECRET_HEADER as HEADER } from '../../server/editorAuth';

const STORAGE_KEY = 'endead_editor_secret';

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(secret: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, secret);
  } catch {
    /* private mode: the secret just won't survive a reload */
  }
}

export function clearEditorSecret(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Asks the server whether `secret` is the configured one. */
async function verify(secret: string): Promise<boolean> {
  try {
    const res = await fetch('/api/editor-auth', { headers: { [HEADER]: secret } });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves true once a verified secret is held for this tab. Prompts as many
 * times as the visitor is willing to retype; cancelling resolves false.
 */
export async function ensureEditorSecret(): Promise<boolean> {
  const stored = read();
  if (stored && await verify(stored)) return true;
  clearEditorSecret();

  for (;;) {
    const entered = window.prompt('Editor password');
    if (entered === null || entered === '') return false;
    if (await verify(entered)) {
      write(entered);
      return true;
    }
    window.alert('Wrong password.');
  }
}

/**
 * `fetch` for editor writes: attaches the secret, and on a 401 clears it,
 * re-prompts and retries once.
 */
export async function editorFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withSecret = (secret: string | null): RequestInit => ({
    ...init,
    headers: { ...(init.headers ?? {}), ...(secret ? { [HEADER]: secret } : {}) },
  });

  const res = await fetch(input, withSecret(read()));
  if (res.status !== 401) return res;

  clearEditorSecret();
  if (!await ensureEditorSecret()) return res;
  return fetch(input, withSecret(read()));
}
