// src/client/utils/characterAsset.ts
//
// One spelling for a character's asset files. Character ids are display names
// ("Tiger Sam", "Bunny G"), so lowercasing alone leaves a space in the path.

/** Asset id for a character: lowercase, spaces become hyphens. */
export function characterSlug(characterClass: string): string {
  return characterClass.toLowerCase().replace(/\s+/g, '-');
}

/** Portrait path for a character. The file may not exist — callers fall back. */
export function characterImageUrl(characterClass: string): string {
  return `/images/characters/${characterSlug(characterClass)}.webp`;
}
