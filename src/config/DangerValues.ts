// src/config/DangerValues.ts

import { DangerLevel } from '../types/GameState';

/** Danger levels as an ordered scale, so "higher than" is a comparison. */
export const DANGER_VALUES: Record<DangerLevel, number> = {
  [DangerLevel.Blue]: 0,
  [DangerLevel.Yellow]: 1,
  [DangerLevel.Orange]: 2,
  [DangerLevel.Red]: 3,
};
