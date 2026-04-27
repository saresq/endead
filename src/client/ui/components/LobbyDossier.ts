/**
 * LobbyDossier — pure presentational renderer for an operative's
 * dossier (DOSSIER + LOADOUT + PROGRESSION). Produces an HTML string
 * suitable for mounting inside a modal body.
 */

import { CHARACTER_DEFINITIONS } from '../../../config/CharacterRegistry';
import { SURVIVOR_CLASSES, SKILL_DEFINITIONS } from '../../../config/SkillRegistry';
import { EQUIPMENT_CARDS } from '../../../config/EquipmentRegistry';
import { DangerLevel } from '../../../types/GameState';
import { icon } from './icons';

interface RankRow {
  level: DangerLevel;
  label: string;
  xp: string;
  colorVar: string;
  pillClass: string;
}

const RANK_ROWS: RankRow[] = [
  { level: DangerLevel.Blue,   label: 'BLUE',   xp: '0 XP',  colorVar: '--rank-blue',   pillClass: 'lobby-rank-pill--blue' },
  { level: DangerLevel.Yellow, label: 'YELLOW', xp: '7 XP',  colorVar: '--rank-yellow', pillClass: 'lobby-rank-pill--yellow' },
  { level: DangerLevel.Orange, label: 'ORANGE', xp: '19 XP', colorVar: '--rank-orange', pillClass: 'lobby-rank-pill--orange' },
  { level: DangerLevel.Red,    label: 'RED',    xp: '43 XP', colorVar: '--rank-red',    pillClass: 'lobby-rank-pill--red' },
];

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDossierSection(charClass: string, role: string): string {
  return `
    <div class="lobby-operative__section">
      <div class="fm-kicker fm-kicker--secondary">DOSSIER</div>
      <div class="lobby-dossier__body">
        <div class="fm-stencil lobby-dossier__name">${escHtml(charClass.toUpperCase())}</div>
        <div class="lobby-dossier__sub fm-mono">${escHtml(role)}</div>
      </div>
    </div>
  `;
}

function renderLoadoutSection(charClass: string): string {
  const charDef = CHARACTER_DEFINITIONS[charClass];
  if (!charDef) return '';
  const template = EQUIPMENT_CARDS[charDef.startingEquipmentKey];
  if (!template) return '';

  const stats = template.stats;
  const statLine = stats
    ? `${stats.accuracy}+ · ${stats.dice}d6 · ${stats.damage}`
    : '—';
  const weaponName = template.name.toUpperCase();

  return `
    <div class="lobby-operative__section">
      <div class="lobby-loadout">
        <div class="lobby-loadout__icon-slot">
          <span class="lobby-loadout__icon">${icon('Swords', 'md')}</span>
        </div>
        <div class="lobby-loadout__text">
          <div class="fm-kicker fm-kicker--secondary">R. HAND · EQUIPPED</div>
          <div class="fm-stencil lobby-loadout__name">${escHtml(weaponName)}</div>
          <div class="lobby-loadout__stats fm-mono">${statLine}</div>
        </div>
      </div>
    </div>
  `;
}

function renderProgressionSection(charClass: string): string {
  const progression = SURVIVOR_CLASSES[charClass];
  if (!progression) return '';

  const rows = RANK_ROWS.map(row => {
    const skillIds = progression[row.level] || [];
    const skills = skillIds.map(id => SKILL_DEFINITIONS[id]).filter(Boolean);
    const pills = skills.map(s =>
      `<span class="lobby-rank-pill ${row.pillClass}" title="${escHtml(s.description)}">${escHtml(s.name)}</span>`
    ).join('');
    const hint = skills.length > 1
      ? `<div class="lobby-rank-hint fm-mono">PICK 1 OF ${skills.length}</div>`
      : '';

    return `
      <div class="lobby-rank-row">
        <span class="lobby-rank-chip" style="--rank-color: var(${row.colorVar});"></span>
        <div class="lobby-rank-head">
          <span class="fm-stencil lobby-rank-label">${row.label}</span>
          <span class="lobby-rank-xp fm-mono">${row.xp}</span>
        </div>
        <div class="lobby-rank-pills">${pills || '<span class="lobby-rank-empty fm-mono">—</span>'}</div>
        ${hint}
      </div>
    `;
  }).join('');

  return `
    <div class="lobby-operative__section">
      <div class="fm-kicker fm-kicker--secondary">PROGRESSION TRACK</div>
      <div class="lobby-progression">${rows}</div>
    </div>
  `;
}

export function renderLobbyDossier(charClass: string, role: string): string {
  const charDef = CHARACTER_DEFINITIONS[charClass];
  if (!charDef) return '';

  const parts = [
    renderDossierSection(charClass, role),
    renderLoadoutSection(charClass),
    renderProgressionSection(charClass),
  ].filter(Boolean);

  return parts.join('<div class="lobby-operative__divider" aria-hidden="true"></div>');
}
