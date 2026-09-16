// src/strings/es.ts
//
// All player-facing text (Spanish, rioplatense). Shared by client and server.
// Fixed text is a string; text with values is a function returning plain text
// (never HTML — callers escape player-provided values as before).

import * as core from './es/core';
import { common } from './es/common';
import { menu } from './es/menu';
import { lobby } from './es/lobby';
import { connection } from './es/connection';
import { hud } from './es/hud';
import { modals } from './es/modals';
import { gameOver } from './es/gameOver';
import { trade } from './es/trade';
import { pickup } from './es/pickup';
import { log } from './es/log';
import { cues } from './es/cues';
import { keys } from './es/keys';
import { board } from './es/board';
import { errors } from './es/errors';
import { serverErrors } from './es/serverErrors';
import { objectives } from './es/objectives';

export const es = {
  common,
  menu,
  lobby,
  connection,
  hud,
  actions: core.actions,
  modals,
  trade,
  pickup,
  log,
  cues,
  keys,
  board,
  gameOver,
  errors,
  serverErrors,
  objectives,
  equipment: core.equipment,
  skills: core.skills,
  zombies: core.zombies,
  danger: core.danger,
  itemTypes: core.itemTypes,
  slots: core.slots,
  roles: core.roles,
  zones: core.zones,
};

export { plural, equipmentName, skillName, skillDescription, zombieLabel } from './es/core';
