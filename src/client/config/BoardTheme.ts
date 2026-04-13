/**
 * BoardTheme — Centralized color & style tokens for the PIXI board renderer.
 *
 * All hex color literals that were previously scattered through PixiBoardRenderer.ts
 * are consolidated here. To re-theme the board, edit this file only.
 */

export const BOARD_THEME = {
  // ─── Background ────────────────────────────────────
  background: 0x1a1a1a,

  // ─── Zone fills ────────────────────────────────────
  zone: {
    street: 0x333333,
    building: 0x554444,
    validMove: 0x225522,
    pendingMove: 0x224466,
    validMoveHighlight: 0x00FF00,     // overlay for tile-mode valid-move cells
    pendingMoveHighlight: 0x00FF00,   // overlay for tile-mode pending-move cells
    pendingMoveStroke: 0x00FF00,      // border around pending-move zone
  },

  // ─── Edges / walls ────────────────────────────────
  wall: {
    color: 0x000000,
    alpha: 0.9,
    width: 3,
  },
  door: {
    open: 0x00CC00,
    openAlpha: 1,
    closed: 0xB45014,
    closedAlpha: 1,
    strokeColor: 0xB45014,
    strokeWidth: 0,
    barWidth: 6,
    plankGap: 0,         // gap between planks
    plankBorder: 0xFFC864, // light border around door group (like editor)
    plankBorderAlpha: 0.6,
  },
  doorway: {
    color: 0x44AA44,
    alpha: 0.6,
  },
  crosswalk: {
    color: 0xFFFFFF,
    alpha: 0.7,
  },

  // ─── Seams (tile boundaries) ──────────────────────
  seam: {
    streetColor: 0x555555,
    alpha: 0.7,
  },

  // ─── Zone indicators ─────────────────────────────
  noise: {
    triangleFill: 0xFFAA00,
    strokeColor: 0x000000,
    strokeWidth: 1.5,
    markColor: 0x000000,
  },
  searchable: {
    circleColor: 0x4488FF,
    strokeColor: 0x000000,
    iconColor: 0xFFFFFF,
  },
  spawn: {
    skullColor: 0xFF0000,
    strokeColor: 0x000000,
    numberColor: 0xFFFFFF,
    numberStroke: 0x000000,
  },
  exit: {
    fillColor: 0x2244AA,
    fillAlpha: 0.6,
    strokeColor: 0x4488FF,
    strokeWidth: 2,
    arrowColor: 0xFFFFFF,
    arrowWidth: 3,
  },
  objective: {
    fillColor: 0xFFD700,
    strokeColor: 0x000000,
    strokeWidth: 2,
    dotColor: 0x000000,
  },

  // ─── Entities ─────────────────────────────────────
  entity: {
    strokeColor: 0x000000,
    strokeWidth: 2,
    selectionGlow: 0xFFFFFF,
    selectionAlpha: 0.5,
    activeTurnRing: 0xFFD700,
    activeTurnWidth: 3,
    woundStroke: 0xFF0000,
    woundStrokeWidth: 3,
  },

  // ─── Zombie fallback colors (when no texture) ────
  zombie: {
    walker: 0x4a6b4f,
    runner: 0xb87a1e,
    brute: 0x6a3d7d,
    abomination: 0x8b2020,
    initialColor: 0xDDDDDD,
    initialFontSize: 14,
  },

  // ─── Editor grid ──────────────────────────────────
  editorGrid: {
    lineColor: 0xFF0000,
    lineAlpha: 0.5,
    lineWidth: 2,
  },
} as const;
