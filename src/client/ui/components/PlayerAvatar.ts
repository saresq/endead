/**
 * PlayerAvatar — Stateless render function for player identity badges.
 *
 * Usage:
 *   renderAvatar('Alice', identity, 'md')                        → 36px colored circle with "A"
 *   renderAvatar('Bob', identity, 'sm', 'active')                → 24px with glow ring
 *   renderAvatar('Wanda', identity, 'md', undefined, 'Wanda')    → portrait image
 */

import { PlayerIdentity } from '../../config/PlayerIdentities';

export type AvatarSize = 'sm' | 'md';
export type AvatarState = 'active' | 'dead' | 'disconnected' | undefined;

/**
 * Clip-path values for the colorblind-accessible shape indicator.
 */
const SHAPE_CLIP_PATHS: Record<PlayerIdentity['shape'], string> = {
  circle: 'circle(50% at 50% 50%)',
  square: 'inset(1px round 2px)',
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  pentagon: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
};

const CHARACTER_AVATARS: Record<string, string> = {
  wanda: '/images/characters/wanda.webp',
  doug: '/images/characters/doug.webp',
  amy: '/images/characters/amy.webp',
  ned: '/images/characters/ned.webp',
  elle: '/images/characters/elle.webp',
  josh: '/images/characters/josh.webp',
};

function characterAvatarUrl(characterClass?: string): string | null {
  if (!characterClass) return null;
  return CHARACTER_AVATARS[characterClass.toLowerCase()] ?? null;
}

export function renderAvatar(
  name: string,
  identity: PlayerIdentity,
  size: AvatarSize = 'md',
  state?: AvatarState,
  characterClass?: string,
): string {
  const initial = name.charAt(0).toUpperCase() || '?';

  const stateClass = state ? ` player-avatar--${state}` : '';
  const imgUrl = characterAvatarUrl(characterClass);
  const portraitClass = imgUrl ? ' player-avatar--portrait' : '';
  const classes = `player-avatar player-avatar--${size}${stateClass}${portraitClass}`;

  const glowStyle = state === 'active'
    ? `box-shadow: 0 0 0 3px ${identity.muted}, 0 0 12px ${identity.primary};`
    : '';

  const face = imgUrl
    ? `<img class="player-avatar__img" src="${imgUrl}" alt="" draggable="false"><span class="player-avatar__initial player-avatar__initial--fallback">${initial}</span>`
    : `<span class="player-avatar__initial">${initial}</span>`;

  return `<span class="${classes}" style="background:${identity.primary};color:${identity.onColor};${glowStyle}" title="${name}">${face}<span class="player-avatar__shape" style="background:${identity.primary};clip-path:${SHAPE_CLIP_PATHS[identity.shape]}"></span></span>`;
}

/**
 * Renders a player name tag: avatar + name + optional badges.
 */
export function renderPlayerTag(
  name: string,
  identity: PlayerIdentity,
  opts?: {
    size?: AvatarSize;
    state?: AvatarState;
    isHost?: boolean;
    className?: string;
    suffix?: string;
    characterClass?: string;
  },
): string {
  const { size = 'md', state, isHost, className = '', suffix = '', characterClass } = opts ?? {};
  const avatar = renderAvatar(name, identity, size, state, characterClass);

  const hostBadge = isHost
    ? '<span class="player-tag__host" title="Host"><svg class="icon icon--sm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5.09 20h13.82"/></svg></span>'
    : '';

  return `<span class="player-tag ${className}">${avatar}<span class="player-tag__name truncate">${name}</span>${hostBadge}${suffix}</span>`;
}
