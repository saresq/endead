// src/client/utils/displayName.ts
//
// A lobby player who never sets a nickname keeps the generated `player-123456`
// id from main.ts as its name, and that id then leaks into the sheet header,
// the turn line, the log and the chip labels. Everywhere a name is shown to a
// player, run it through here first.

const GENERATED_ID = /^player-\d+$/i;

/** The name to show for a survivor or lobby player: the character class when
 *  the name is still a generated id, otherwise the name itself. */
export function displayName(name?: string | null, characterClass?: string | null): string {
  const trimmed = (name ?? '').trim();
  if (characterClass && (trimmed === '' || GENERATED_ID.test(trimmed))) return characterClass;
  return trimmed;
}

/** `Nombre (Clase)` for target pickers, collapsed to just the class when the
 *  name is a generated id (so it never reads `Wanda (Wanda)`). */
export function displayNameWithClass(name?: string | null, characterClass?: string | null): string {
  const shown = displayName(name, characterClass);
  if (!characterClass || shown === characterClass) return shown;
  return `${shown} (${characterClass})`;
}
