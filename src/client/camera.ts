// src/client/camera.ts
//
// Pure camera math for PixiBoardRenderer. World units are board pixels,
// screen units are CSS pixels of the canvas.

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
export interface CameraPose { x: number; y: number; scale: number; }

export const FIT_PADDING = 0.92;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.0;
/** Below this fitted scale the board is too small to read; focus the local survivor instead. */
export const FIT_FALLTHROUGH_SCALE = 0.55;
export const FALLTHROUGH_FOCUS_SCALE = 0.75;
/** Fraction of the board's width and height that must stay inside the viewport. */
export const MIN_VISIBLE_FRACTION = 0.35;

/**
 * Scale that frames the whole board in the viewport. Bound below by MIN_ZOOM
 * and above only by the viewport: an upper cap made `F` a zoom-out key on a
 * large screen and left the board at ~900px on a 2560px one. Upscaling the
 * 450px tile art is accepted. Manual zoom still stops at MAX_ZOOM.
 */
export function fitScale(bounds: Bounds, viewport: Rect): number {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  if (bw <= 0 || bh <= 0 || viewport.w <= 0 || viewport.h <= 0) return 1;
  const raw = Math.min(viewport.w / bw, viewport.h / bh) * FIT_PADDING;
  return Math.max(MIN_ZOOM, raw);
}

/** Pose that places world point (wx, wy) at the centre of the viewport. */
export function centerOn(wx: number, wy: number, scale: number, viewport: Rect): CameraPose {
  return {
    x: viewport.x + viewport.w / 2 - wx * scale,
    y: viewport.y + viewport.h / 2 - wy * scale,
    scale,
  };
}

/** Whole board centred in the viewport at the fitted scale. */
export function computeFit(bounds: Bounds, viewport: Rect): CameraPose {
  const scale = fitScale(bounds, viewport);
  return centerOn((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, scale, viewport);
}

export function shouldFallThrough(scale: number): boolean {
  return scale < FIT_FALLTHROUGH_SCALE;
}

function clampAxis(pos: number, scale: number, min: number, max: number, vStart: number, vSize: number): number {
  const need = Math.min((max - min) * scale * MIN_VISIBLE_FRACTION, vSize);
  const lower = vStart + need - max * scale;         // board's right/bottom edge at least `need` inside
  const upper = vStart + vSize - need - min * scale; // board's left/top edge at least `need` inside
  return Math.max(lower, Math.min(upper, pos));
}

/**
 * Keep at least 35% of the board's width and height inside the viewport, so
 * the player can pan freely even when the whole board already fits.
 */
export function clampPose(pose: CameraPose, bounds: Bounds, viewport: Rect): CameraPose {
  return {
    x: clampAxis(pose.x, pose.scale, bounds.minX, bounds.maxX, viewport.x, viewport.w),
    y: clampAxis(pose.y, pose.scale, bounds.minY, bounds.maxY, viewport.y, viewport.h),
    scale: pose.scale,
  };
}

/**
 * Camera-driven moves (focus, fall-through fit): on each axis where the
 * board is larger than the viewport, keep its edges outside the viewport so
 * no empty ground shows; otherwise fall back to the 35% clamp.
 */
export function coverPose(pose: CameraPose, bounds: Bounds, viewport: Rect): CameraPose {
  const clamped = clampPose(pose, bounds, viewport);
  const cover = (pos: number, min: number, max: number, vStart: number, vSize: number) =>
    (max - min) * pose.scale >= vSize
      ? Math.max(vStart + vSize - max * pose.scale, Math.min(vStart - min * pose.scale, pos))
      : pos;
  return {
    x: cover(clamped.x, bounds.minX, bounds.maxX, viewport.x, viewport.w),
    y: cover(clamped.y, bounds.minY, bounds.maxY, viewport.y, viewport.h),
    scale: pose.scale,
  };
}

/** True when the world rect is entirely inside the viewport under the given pose. */
export function isWorldRectVisible(rect: Rect, pose: CameraPose, viewport: Rect): boolean {
  const left = pose.x + rect.x * pose.scale;
  const top = pose.y + rect.y * pose.scale;
  const right = left + rect.w * pose.scale;
  const bottom = top + rect.h * pose.scale;
  return left >= viewport.x && top >= viewport.y
    && right <= viewport.x + viewport.w && bottom <= viewport.y + viewport.h;
}

/** Touch tap vs pan: released within 500ms and moved under 12px in total.
 *  No gesture in the game uses long-press, so the ceiling matches the platform
 *  convention rather than reserving 300-500ms for nothing. The 12px distance
 *  check is what actually separates a tap from a pan. */
export function isTap(durationMs: number, dx: number, dy: number): boolean {
  return durationMs <= 500 && Math.hypot(dx, dy) < 12;
}

export function isDoubleTap(prev: { t: number; x: number; y: number } | null, t: number, x: number, y: number): boolean {
  return !!prev && t - prev.t <= 300 && Math.hypot(x - prev.x, y - prev.y) <= 24;
}
