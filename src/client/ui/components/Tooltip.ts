/**
 * Tooltip — Singleton hover tooltip positioned over the PIXI canvas.
 *
 * Usage:
 *   import { tooltip } from './ui/components/Tooltip';
 *   tooltip.show(screenX, screenY, '<b>Walker</b>');
 *   tooltip.hide();
 */

const OFFSET = 12; // px away from cursor

export class Tooltip {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'board-tooltip';
    document.body.appendChild(this.el);
  }

  show(x: number, y: number, content: string): void {
    this.el.innerHTML = content;
    this.el.classList.add('visible');

    // Measure after content is set
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: below-right of cursor
    let left = x + OFFSET;
    let top = y + OFFSET;

    // Flip horizontally if near right edge
    if (left + rect.width > vw - OFFSET) {
      left = x - rect.width - OFFSET;
    }

    // Flip vertically if near bottom edge
    if (top + rect.height > vh - OFFSET) {
      top = y - rect.height - OFFSET;
    }

    // Clamp to viewport
    left = Math.max(OFFSET, Math.min(left, vw - rect.width - OFFSET));
    top = Math.max(OFFSET, Math.min(top, vh - rect.height - OFFSET));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(): void {
    this.el.classList.remove('visible');
  }

  destroy(): void {
    this.el.remove();
  }
}

export const tooltip = new Tooltip();
