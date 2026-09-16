// src/client/ui/layoutQueries.ts
//
// Single source for the in-game layout breakpoints. GameHUD resolves these
// with matchMedia and stamps `data-layout` on #game-hud; hud.css styles by
// that attribute instead of repeating the media queries.

/**
 * Deck layout: anything at least 744px wide and 600px tall — desktop, laptop
 * and both iPad orientations. Orientation is deliberately not part of this
 * test, so iPad portrait (744x1133) gets the deck rather than the phone sheet.
 */
export const DECK_LAYOUT_QUERY = '(min-width: 744px) and (min-height: 600px)';
export const LANDSCAPE_QUERY = '(orientation: landscape)';

/** deck = desktop/tablet bottom deck, sheet = phone portrait bottom sheet, side = phone landscape side panel. */
export type HudLayout = 'deck' | 'sheet' | 'side';

export function resolveHudLayout(deck: boolean, landscape: boolean): HudLayout {
  if (deck) return 'deck';
  return landscape ? 'side' : 'sheet';
}
