import { describe, it, expect } from 'vitest';
import {
  fitScale, computeFit, clampPose, coverPose, shouldFallThrough, isWorldRectVisible, isTap, isDoubleTap,
  type Bounds, type Rect,
} from '../camera';

// Default map: 3x2 tiles starting at column 1 → world x 450..1800, y 0..900.
const board: Bounds = { minX: 450, minY: 0, maxX: 1800, maxY: 900 };

describe('fitScale', () => {
  it('fits the limiting axis with 8% padding', () => {
    const vp: Rect = { x: 0, y: 95, w: 1140, h: 805 };
    // min(1140/1350, 805/900) = 0.8444 * 0.92
    expect(fitScale(board, vp)).toBeCloseTo((1140 / 1350) * 0.92, 5);
  });

  it('has no upper cap, so a large viewport gets a larger board', () => {
    // min(4000/1350, 3000/900) = 2.963 * 0.92; the old 1.0 cap made `F` a
    // zoom-out key on a big screen.
    expect(fitScale(board, { x: 0, y: 0, w: 4000, h: 3000 })).toBeCloseTo((4000 / 1350) * 0.92, 5);
  });

  it('frames the same share of the viewport at 2560 and 3440', () => {
    const at2560 = fitScale(board, { x: 0, y: 44, w: 2560, h: 1300 });
    const at3440 = fitScale(board, { x: 0, y: 44, w: 3440, h: 1300 });
    // Both are height-limited on a 16:9 screen, so the fit is identical.
    expect(at3440).toBeCloseTo(at2560, 5);
    expect((900 * at2560) / 1300).toBeGreaterThan(0.85);
  });

  it('never goes below 0.2', () => {
    expect(fitScale(board, { x: 0, y: 0, w: 100, h: 100 })).toBe(0.2);
  });
});

describe('computeFit', () => {
  it('centres the board inside the viewport rect', () => {
    const vp: Rect = { x: 0, y: 95, w: 1140, h: 805 };
    const pose = computeFit(board, vp);
    const left = pose.x + board.minX * pose.scale;
    const right = pose.x + board.maxX * pose.scale;
    const top = pose.y + board.minY * pose.scale;
    const bottom = pose.y + board.maxY * pose.scale;
    expect((left + right) / 2).toBeCloseTo(vp.x + vp.w / 2, 5);
    expect((top + bottom) / 2).toBeCloseTo(vp.y + vp.h / 2, 5);
    expect(left).toBeGreaterThanOrEqual(vp.x);
    expect(right).toBeLessThanOrEqual(vp.x + vp.w);
    expect(top).toBeGreaterThanOrEqual(vp.y);
    expect(bottom).toBeLessThanOrEqual(vp.y + vp.h);
  });
});

describe('shouldFallThrough', () => {
  it('falls through below 0.55', () => {
    expect(shouldFallThrough(0.54)).toBe(true);
    expect(shouldFallThrough(0.55)).toBe(false);
  });

  it('a 390px-wide phone viewport falls through on the default map', () => {
    expect(shouldFallThrough(fitScale(board, { x: 0, y: 44, w: 390, h: 540 }))).toBe(true);
  });
});

describe('clampPose', () => {
  const vp: Rect = { x: 0, y: 0, w: 1000, h: 800 };

  it('leaves an in-range pose untouched', () => {
    const pose = { x: -300, y: 0, scale: 1 };
    expect(clampPose(pose, board, vp)).toEqual(pose);
  });

  it('stops a drag to the left once 35% of the board width remains', () => {
    const clamped = clampPose({ x: -5000, y: 0, scale: 1 }, board, vp);
    const right = clamped.x + board.maxX;
    expect(right).toBeCloseTo(1350 * 0.35, 5);
  });

  it('stops a drag down once 35% of the board height remains', () => {
    const clamped = clampPose({ x: 0, y: 5000, scale: 1 }, board, vp);
    const top = clamped.y + board.minY;
    expect(top).toBeCloseTo(800 - 900 * 0.35, 5);
  });

  it('respects scale and viewport offset', () => {
    const offset: Rect = { x: 100, y: 50, w: 400, h: 300 };
    const clamped = clampPose({ x: 5000, y: 0, scale: 0.5 }, board, offset);
    const left = clamped.x + board.minX * 0.5;
    expect(left).toBeCloseTo(100 + 400 - 1350 * 0.5 * 0.35, 5);
  });

  it('keeps a board that already fits fully inside the viewport', () => {
    // 2560x1440-ish map area: the board fits on both axes, so a hard drag
    // must not park it in a corner the way the 35% rule allowed.
    const big: Rect = { x: 0, y: 44, w: 2560, h: 1250 };
    for (const pose of [{ x: -9000, y: -9000, scale: 1 }, { x: 9000, y: 9000, scale: 1 }]) {
      const c = clampPose(pose, board, big);
      expect(c.x + board.minX).toBeGreaterThanOrEqual(big.x - 1e-6);
      expect(c.x + board.maxX).toBeLessThanOrEqual(big.x + big.w + 1e-6);
      expect(c.y + board.minY).toBeGreaterThanOrEqual(big.y - 1e-6);
      expect(c.y + board.maxY).toBeLessThanOrEqual(big.y + big.h + 1e-6);
    }
  });

  it('clamps per axis: fully inside where it fits, 35% where it does not', () => {
    // 1350 wide board in a 1000-wide, 1200-tall viewport: wide axis uses 35%,
    // tall axis must stay fully inside.
    const mixed: Rect = { x: 0, y: 0, w: 1000, h: 1200 };
    const c = clampPose({ x: -5000, y: 5000, scale: 1 }, board, mixed);
    expect(c.x + board.maxX).toBeCloseTo(1350 * 0.35, 5);
    expect(c.y + board.maxY).toBeCloseTo(1200, 5);
  });
});

describe('coverPose', () => {
  it('keeps a larger-than-viewport board edge-to-edge when focusing near its top', () => {
    const vp: Rect = { x: 0, y: 52, w: 390, h: 540 };
    // Centre a point at the board's top edge at 0.75 → board top would sit mid-screen.
    const pose = { x: 195 - 1125 * 0.75, y: 52 + 270 - 20 * 0.75, scale: 0.75 };
    const covered = coverPose(pose, board, vp);
    expect(covered.y + board.minY * 0.75).toBeCloseTo(52, 5);
    expect(covered.x).toBeCloseTo(pose.x, 5);
  });

  it('leaves a smaller-than-viewport axis to the 35% clamp', () => {
    const vp: Rect = { x: 0, y: 0, w: 4000, h: 3000 };
    const pose = { x: 100, y: 100, scale: 1 };
    expect(coverPose(pose, board, vp)).toEqual(clampPose(pose, board, vp));
  });
});

describe('isWorldRectVisible', () => {
  it('detects a zone outside the viewport', () => {
    const vp: Rect = { x: 0, y: 0, w: 500, h: 500 };
    const pose = { x: 0, y: 0, scale: 1 };
    expect(isWorldRectVisible({ x: 10, y: 10, w: 45, h: 45 }, pose, vp)).toBe(true);
    expect(isWorldRectVisible({ x: 480, y: 10, w: 45, h: 45 }, pose, vp)).toBe(false);
  });
});

describe('touch gestures', () => {
  it('treats a 9px, 150ms touch as a tap', () => {
    expect(isTap(150, 9, 0)).toBe(true);
  });

  it('treats a 30px move as a pan', () => {
    expect(isTap(150, 30, 0)).toBe(false);
  });

  it('uses total distance, not per-axis', () => {
    expect(isTap(100, 9, 9)).toBe(false);
  });

  it('treats a deliberate 400ms rest-and-lift as a tap', () => {
    expect(isTap(400, 2, 2)).toBe(true);
  });

  it('treats a touch held past 500ms as a pan', () => {
    expect(isTap(501, 0, 0)).toBe(false);
  });

  it('detects double taps within 300ms and 24px', () => {
    const first = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(first, 1250, 110, 110)).toBe(true);
    expect(isDoubleTap(first, 1400, 100, 100)).toBe(false);
    expect(isDoubleTap(first, 1100, 140, 100)).toBe(false);
    expect(isDoubleTap(null, 1100, 100, 100)).toBe(false);
  });
});
