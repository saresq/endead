/**
 * BoardTheme — Centralized color & style tokens for the PIXI board renderer.
 *
 * All hex color literals that were previously scattered through PixiBoardRenderer.ts
 * are consolidated here. To re-theme the board, edit this file only.
 *
 * Colors aligned with CSS design tokens (tokens.css) — "Scorched Earth" palette.
 */

export const BOARD_THEME = {
  // ─── Background ────────────────────────────────────
  background: 0x0c0b09,           // matches --surface-0

  // ─── Zone fills ────────────────────────────────────
  zone: {
    street: 0x2a2820,             // matches --surface-3
    building: 0x3d2e22,           // warm brown, same family
    validMove: 0x2a3d22,          // desaturated olive green
    pendingMove: 0x2a3040,        // warm steel
    validMoveHighlight: 0x5a9e5f, // matches --success
    pendingMoveHighlight: 0x5a9e5f,
    pendingMoveStroke: 0x5a9e5f,
  },

  // ─── Edges / walls ────────────────────────────────
  wall: {
    color: 0x0c0b09,             // matches --surface-0 (pure dark)
    alpha: 0.9,
    width: 3,
  },
  door: {
    open: 0x5a9e5f,              // matches --success
    openAlpha: 1,
    closed: 0xb86530,            // matches --danger-orange
    closedAlpha: 1,
    strokeColor: 0xb86530,
    strokeWidth: 0,
    barWidth: 6,
    plankGap: 0,
    plankBorder: 0xd4a84b,       // matches --accent
    plankBorderAlpha: 0.6,
    highlightColor: 0xd4a84b,    // amber highlight
    highlightAlpha: 0.4,
  },
  attack: {
    fillColor: 0xb84a3c,         // matches --danger
    fillAlpha: 0.3,
  },
  doorway: {
    color: 0x5a9e5f,             // matches --success
    alpha: 0.6,
  },
  crosswalk: {
    color: 0xe8e4d9,             // matches --text-primary (warm white)
    alpha: 0.7,
  },

  // ─── Seams (tile boundaries) ──────────────────────
  seam: {
    streetColor: 0x3d3a2f,       // matches --surface-4
    alpha: 0.7,
  },

  // ─── Zone indicators ─────────────────────────────
  noise: {
    triangleFill: 0xd4a84b,     // matches --accent
    strokeColor: 0x0c0b09,
    strokeWidth: 1.5,
    markColor: 0x0c0b09,
  },
  searchable: {
    circleColor: 0xd4a84b,      // matches --accent (was blue)
    strokeColor: 0x0c0b09,
    iconColor: 0xe8e4d9,
  },
  spawn: {
    bgColor: 0x4a1a1a,          // desaturated blood wash
    bgAlpha: 0.85,
    bgWidth: 40,
    bgHeight: 36,
    bgRadius: 4,
    strokeColor: 0x6b2222,
    strokeWidth: 2,
    skullSize: 28,
    numberColor: 0xe8e4d9,
    numberStroke: 0x0c0b09,
    numberFontSize: 14,
  },
  exit: {
    fillColor: 0xd4a84b,        // amber instead of blue
    fillAlpha: 0.5,
    strokeColor: 0xe4be6a,      // matches --accent-hover
    strokeWidth: 2,
    arrowColor: 0xe8e4d9,
    arrowWidth: 3,
  },
  objective: {
    fillColor: 0xd4a84b,        // matches --accent
    strokeColor: 0x0c0b09,
    strokeWidth: 2,
    dotColor: 0x0c0b09,
  },

  // ─── Entities ─────────────────────────────────────
  entity: {
    strokeColor: 0x0c0b09,
    strokeWidth: 2,
    selectionGlow: 0xe8e4d9,
    selectionAlpha: 0.5,
    activeTurnRing: 0xd4a84b,    // matches --accent
    activeTurnWidth: 3,
    woundStroke: 0xb84a3c,       // matches --danger
    woundStrokeWidth: 3,
  },

  // ─── Zombie fallback colors (when no texture) ────
  zombie: {
    walker: 0x5a7a50,           // matches --zombie-walker
    runner: 0xc48a2e,           // matches --zombie-runner
    brute: 0x7a4a90,            // matches --zombie-brute
    abomination: 0x992222,      // matches --zombie-abom
    initialColor: 0xe8e4d9,
    initialFontSize: 14,
  },

  // ─── Group badge (zombie overflow) ────────────────
  groupBadge: {
    bgColor: 0x2a2820,          // matches --surface-3
    bgAlpha: 0.9,
    textColor: 0xe8e4d9,
    fontSize: 12,
    strokeColor: 0x0c0b09,
    strokeWidth: 2,
  },

  // ─── Editor grid ──────────────────────────────────
  editorGrid: {
    lineColor: 0xb84a3c,        // matches --danger
    lineAlpha: 0.5,
    lineWidth: 2,
  },
} as const;
