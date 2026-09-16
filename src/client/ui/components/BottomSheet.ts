/**
 * BottomSheet — drag-to-snap helper for the phone HUD sheet.
 *
 * The sheet element is fixed to the bottom with its full height set in CSS;
 * this helper only translates it down so `height` px stay visible. Dragging
 * starts on the grab area (handle + header); a tap there toggles peek/half.
 */

export type SheetSnap = 'peek' | 'half' | 'full';
export interface SheetHeights { peek: number; half: number; full: number; }

const TAP_SLOP = 6;
const FLICK_VELOCITY = 0.5; // px per ms

export class BottomSheet {
  private snapState: SheetSnap = 'peek';
  private height = 0;
  private listeners: Array<(snap: SheetSnap) => void> = [];
  private abort = new AbortController();
  private drag: { pointerId: number; startY: number; startHeight: number; lastY: number; lastT: number; velocity: number } | null = null;

  constructor(
    private sheet: HTMLElement,
    private grab: HTMLElement,
    private measure: () => SheetHeights,
  ) {
    const signal = this.abort.signal;
    grab.addEventListener('pointerdown', (e) => this.onDown(e), { signal });
    grab.addEventListener('pointermove', (e) => this.onMove(e), { signal });
    grab.addEventListener('pointerup', (e) => this.onUp(e), { signal });
    grab.addEventListener('pointercancel', () => this.cancelDrag(), { signal });
    this.apply();
  }

  public get snapPoint(): SheetSnap { return this.snapState; }

  public currentHeight(): number { return this.height; }

  public onSnap(cb: (snap: SheetSnap) => void): void {
    this.listeners.push(cb);
  }

  public snap(to: SheetSnap): void {
    this.snapState = to;
    this.apply();
    this.listeners.forEach(cb => cb(to));
  }

  /** Re-measure after content changes; notifies listeners only if the snapped height moved. */
  public refresh(): void {
    if (this.drag) return;
    const before = this.height;
    this.apply();
    if (this.height !== before) this.listeners.forEach(cb => cb(this.snapState));
  }

  public destroy(): void {
    this.abort.abort();
    this.listeners = [];
    this.sheet.style.transform = '';
    this.sheet.classList.remove('hud-sheet--dragging');
    delete this.sheet.dataset.snap;
  }

  private apply(): void {
    const heights = this.measure();
    this.height = heights[this.snapState];
    this.sheet.dataset.snap = this.snapState;
    this.setVisibleHeight(this.height, heights.full);
  }

  private setVisibleHeight(visible: number, full: number): void {
    this.sheet.style.transform = `translateY(${Math.max(0, full - visible)}px)`;
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    this.grab.setPointerCapture(e.pointerId);
    const now = performance.now();
    this.drag = { pointerId: e.pointerId, startY: e.clientY, startHeight: this.height, lastY: e.clientY, lastT: now, velocity: 0 };
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const now = performance.now();
    if (now > d.lastT) d.velocity = (e.clientY - d.lastY) / (now - d.lastT);
    d.lastY = e.clientY;
    d.lastT = now;
    if (Math.abs(e.clientY - d.startY) < TAP_SLOP && !this.sheet.classList.contains('hud-sheet--dragging')) return;

    const heights = this.measure();
    this.sheet.classList.add('hud-sheet--dragging');
    const h = Math.max(heights.peek, Math.min(heights.full, d.startHeight - (e.clientY - d.startY)));
    this.setVisibleHeight(h, heights.full);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    const wasDragging = this.sheet.classList.contains('hud-sheet--dragging');
    this.sheet.classList.remove('hud-sheet--dragging');

    if (!wasDragging) {
      this.snap(this.snapState === 'peek' ? 'half' : 'peek');
      return;
    }

    // Stale velocity (finger paused before release) does not count as a flick.
    const velocity = performance.now() - d.lastT > 80 ? 0 : d.velocity;
    if (velocity > FLICK_VELOCITY) {
      this.snap('peek');
      return;
    }
    if (velocity < -FLICK_VELOCITY) {
      this.snap('full');
      return;
    }

    const heights = this.measure();
    const h = d.startHeight - (e.clientY - d.startY);
    const nearest = (Object.keys(heights) as SheetSnap[])
      .reduce((best, key) => Math.abs(heights[key] - h) < Math.abs(heights[best] - h) ? key : best, 'peek');
    this.snap(nearest);
  }

  private cancelDrag(): void {
    this.drag = null;
    this.sheet.classList.remove('hud-sheet--dragging');
    this.apply();
  }
}
