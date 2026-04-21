// src/config/CharacterRegistry.ts
// Defines display metadata (name + color) for the 6 base-game Zombicide v2
// characters. Starting equipment is claimed per-seat at lobby time from the
// grey-back starter deck (see STARTER_DECK_POOL in EquipmentRegistry.ts).

export interface CharacterDefinition {
  name: string;
  /** Display color (CSS-compatible) */
  color: string;
}

export const CHARACTER_DEFINITIONS: Record<string, CharacterDefinition> = {
  'Wanda': { name: 'Wanda', color: '#e6194b' }, // red
  'Doug':  { name: 'Doug',  color: '#3cb44b' }, // green
  'Amy':   { name: 'Amy',   color: '#ffe119' }, // yellow
  'Ned':   { name: 'Ned',   color: '#4363d8' }, // blue
  'Elle':  { name: 'Elle',  color: '#f58231' }, // orange
  'Josh':  { name: 'Josh',  color: '#911eb4' }, // purple
};
