/**
 * LobbyDossier — pure presentational renderer for a survivor's dossier
 * (name + role, type and health, skills per danger level). Produces an
 * HTML string suitable for mounting inside a modal body.
 */

import { CHARACTER_DEFINITIONS } from '../../../config/CharacterRegistry';
import { SURVIVOR_CLASSES, SKILL_DEFINITIONS } from '../../../config/SkillRegistry';
import { DangerLevel } from '../../../types/GameState';
import { es, skillName, skillDescription } from '../../../strings/es';
import { icon } from './icons';

interface RankRow {
  level: DangerLevel;
  xp: number;
  colorVar: string;
  pillClass: string;
}

const RANK_ROWS: RankRow[] = [
  { level: DangerLevel.Blue,   xp: 0,  colorVar: '--rank-blue',   pillClass: 'lobby-rank-pill--blue' },
  { level: DangerLevel.Yellow, xp: 7,  colorVar: '--rank-yellow', pillClass: 'lobby-rank-pill--yellow' },
  { level: DangerLevel.Orange, xp: 19, colorVar: '--rank-orange', pillClass: 'lobby-rank-pill--orange' },
  { level: DangerLevel.Red,    xp: 43, colorVar: '--rank-red',    pillClass: 'lobby-rank-pill--red' },
];

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDossierSection(charClass: string, role: string): string {
  return `
    <div class="lobby-operative__section">
      <div class="fm-kicker fm-kicker--secondary">${escHtml(es.lobby.survivor)}</div>
      <div class="lobby-dossier__body">
        <div class="fm-stencil lobby-dossier__name">${escHtml(charClass)}</div>
        <div class="lobby-dossier__sub fm-mono">${escHtml(role)}</div>
      </div>
    </div>
  `;
}

function renderProfileSection(charClass: string): string {
  const charDef = CHARACTER_DEFINITIONS[charClass];
  if (!charDef) return '';

  const typeLabel = es.lobby.survivorType[charDef.type] ?? charDef.type;
  const note = charDef.type === 'Kid'
    ? `<div class="lobby-loadout__stats fm-mono">${escHtml(es.lobby.kidNote)}</div>`
    : '';

  return `
    <div class="lobby-operative__section">
      <div class="lobby-loadout">
        <div class="lobby-loadout__icon-slot">
          <span class="lobby-loadout__icon">${icon('Heart', 'md')}</span>
        </div>
        <div class="lobby-loadout__text">
          <div class="fm-kicker fm-kicker--secondary">${escHtml(es.lobby.profile)}</div>
          <div class="fm-stencil lobby-loadout__name">${escHtml(typeLabel)}</div>
          <div class="lobby-loadout__stats fm-mono">${escHtml(es.lobby.health(charDef.maxHealth))}</div>
          ${note}
        </div>
      </div>
    </div>
  `;
}

function renderProgressionSection(charClass: string): string {
  const progression = SURVIVOR_CLASSES[charClass];
  if (!progression) return '';

  const rows = RANK_ROWS.map(row => {
    const skillIds = (progression[row.level] || []).filter(id => SKILL_DEFINITIONS[id]);
    const pills = skillIds.map(id =>
      `<span class="lobby-rank-pill ${row.pillClass}" title="${escHtml(skillDescription(id))}">${escHtml(skillName(id))}</span>`
    ).join('');
    const hint = skillIds.length > 1
      ? `<div class="lobby-rank-hint fm-mono">${escHtml(es.lobby.pickOne(skillIds.length))}</div>`
      : '';

    return `
      <div class="lobby-rank-row">
        <span class="lobby-rank-chip" style="--rank-color: var(${row.colorVar});"></span>
        <div class="lobby-rank-head">
          <span class="fm-stencil lobby-rank-label">${escHtml(es.danger[row.level])}</span>
          <span class="lobby-rank-xp fm-mono">${escHtml(es.lobby.xp(row.xp))}</span>
        </div>
        <div class="lobby-rank-pills">${pills || '<span class="lobby-rank-empty fm-mono">—</span>'}</div>
        ${hint}
      </div>
    `;
  }).join('');

  return `
    <div class="lobby-operative__section">
      <div class="fm-kicker fm-kicker--secondary">${escHtml(es.lobby.progression)}</div>
      <div class="lobby-progression">${rows}</div>
    </div>
  `;
}

export function renderLobbyDossier(charClass: string, role: string): string {
  const charDef = CHARACTER_DEFINITIONS[charClass];
  if (!charDef) return '';

  const parts = [
    renderDossierSection(charClass, role),
    renderProfileSection(charClass),
    renderProgressionSection(charClass),
  ].filter(Boolean);

  return parts.join('<div class="lobby-operative__divider" aria-hidden="true"></div>');
}
