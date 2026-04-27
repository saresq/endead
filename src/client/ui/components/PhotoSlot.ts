/**
 * PhotoSlot — Field Manual portrait / placeholder slot.
 *
 * Used in lobby character select and similar. Shows a diagonal-striped
 * placeholder (or an `<img>` when an imageUrl is provided), four corner
 * notches, optional amber "selected" dot, and an optional caption.
 *
 * Usage:
 *   renderPhotoSlot({ size: 'md', name: 'REVENANT', role: 'CALLSIGN P-01', selected: true })
 */

export type PhotoSlotSize = 'sm' | 'md' | 'lg';

export interface PhotoSlotOptions {
  size?: PhotoSlotSize;   // sm = 48x48, md = 1:1 fills container, lg = 96x96
  name?: string;
  role?: string;
  selected?: boolean;
  imageUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPhotoSlot(opts: PhotoSlotOptions): string {
  const size = opts.size ?? 'md';
  const selected = opts.selected ?? false;

  const rootClass = [
    'fm-photoslot',
    `fm-photoslot--${size}`,
    selected ? 'fm-photoslot--selected' : '',
  ].filter(Boolean).join(' ');

  const frameInner = opts.imageUrl
    ? `<img class="fm-photoslot__img" src="${escapeHtml(opts.imageUrl)}" alt="${escapeHtml(opts.name ?? '')}" />`
    : `<div class="fm-photoslot__placeholder fm-diagonal-stripe fm-diagonal-stripe--amber" aria-hidden="true"></div>`;

  const cornersHtml = `
    <span class="fm-photoslot__corner fm-photoslot__corner--tl" aria-hidden="true"></span>
    <span class="fm-photoslot__corner fm-photoslot__corner--tr" aria-hidden="true"></span>
    <span class="fm-photoslot__corner fm-photoslot__corner--bl" aria-hidden="true"></span>
    <span class="fm-photoslot__corner fm-photoslot__corner--br" aria-hidden="true"></span>
  `;

  const selectedDotHtml = selected
    ? `<span class="fm-photoslot__tag" aria-hidden="true">■ SELECTED</span>`
    : '';

  const hasCaption = !!(opts.name || opts.role);
  const captionHtml = hasCaption
    ? `
      <div class="fm-photoslot__caption">
        ${opts.name ? `<div class="fm-photoslot__name">${escapeHtml(opts.name)}</div>` : ''}
        ${opts.role ? `<div class="fm-photoslot__role">${escapeHtml(opts.role)}</div>` : ''}
      </div>
    `
    : '';

  return `
    <div class="${rootClass}">
      <div class="fm-photoslot__frame">
        ${frameInner}
        ${cornersHtml}
        ${selectedDotHtml}
      </div>
      ${captionHtml}
    </div>
  `;
}
