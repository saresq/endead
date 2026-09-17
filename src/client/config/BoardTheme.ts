/**
 * BoardTheme — Centralized color & style tokens for the PIXI board renderer.
 *
 * All hex color literals that were previously scattered through
 * PixiBoardRenderer.ts and AnimationController.ts are consolidated here. To
 * re-theme the board, edit this file only.
 *
 * Colors mirror the CSS design tokens (`src/styles/tokens.css`) — Pulp Comic
 * palette. PIXI cannot read CSS variables, so this file is the canvas-side
 * mirror; when a palette anchor in `tokens.css` moves, update the matching
 * entry below. The "matches --foo" comments are the contract.
 *
 * Palette anchors:
 *   --page / --ink  0x1a1614   --paper    0xdcd2b9   --paper-2 0xcdc1a1
 *   --paper-3       0xbdb08d   --accent   0xc7241c   --highlight 0xffcc1a
 *   --success       0x1f5a29   --info     0x1a5490   --danger-orange 0xd8661c
 *
 * Two deliberate departures from the change's design note (D6):
 *   - `exit` uses --success rather than --highlight; its icon asset is white
 *     and would be unreadable on yellow.
 *   - `searchable.iconColor` is ink, for the same reason.
 */

/** Font stacks for PIXI text. Mirrors --font-display / --font-body. */
const FONT_DISPLAY = '"Bangers", Impact, "Arial Narrow", sans-serif';
const FONT_BODY = '"Barlow Condensed", Arial, sans-serif';

export const BOARD_THEME = {
  // ─── Type ──────────────────────────────────────────
  font: {
    display: FONT_DISPLAY,        // matches --font-display (cues, big numbers)
    body: FONT_BODY,              // matches --font-body (labels, counts)
  },

  // ─── Background ────────────────────────────────────
  background: 0x1a1614,           // matches --page

  // ─── Zone fills ────────────────────────────────────
  zone: {
    street: 0x2a2320,             // matches --page-2
    building: 0x3d342d,           // matches --text-2 (warmer ink step)
    validMove: 0xffcc1a,          // matches --highlight
    validMoveAlpha: 0.35,
    pendingMove: 0xffcc1a,        // matches --highlight
    pendingMoveAlpha: 0.2,
    validMoveHighlight: 0x1a1614, // matches --ink (outline on the wash)
    pendingMoveHighlight: 0x1a1614,
    pendingMoveStroke: 0x1a1614,
    sprintFill: 0x1a5490,         // matches --info
    sprintAlpha: 0.3,
  },

  // ─── Edges / walls ────────────────────────────────
  wall: {
    color: 0x1a1614,             // matches --ink
    alpha: 1,
    width: 3,
  },
  door: {
    open: 0x1f5a29,              // matches --success
    openAlpha: 1,
    closed: 0xd8661c,            // matches --danger-orange
    closedAlpha: 1,
    strokeColor: 0x1a1614,       // matches --ink
    strokeWidth: 0,
    barWidth: 6,
    plankGap: 0,
    plankBorder: 0x1a1614,       // matches --ink
    plankBorderAlpha: 1,
    highlightColor: 0xffcc1a,    // matches --highlight
    highlightAlpha: 0.4,
  },
  attack: {
    fillColor: 0xc7241c,         // matches --accent
    fillAlpha: 0.35,
  },
  doorway: {
    color: 0x1f5a29,             // matches --success
    alpha: 0.6,
  },
  crosswalk: {
    color: 0xdcd2b9,             // matches --paper
    alpha: 0.7,
  },

  // ─── Zone indicators ─────────────────────────────
  noise: {
    triangleFill: 0xffcc1a,     // matches --highlight
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 2,
    markColor: 0x1a1614,        // matches --ink
  },
  searchable: {
    circleColor: 0xffcc1a,      // matches --highlight
    strokeColor: 0x1a1614,      // matches --ink
    iconColor: 0x1a1614,        // matches --ink (readable on yellow)
  },
  spawn: {
    bgColor: 0xc7241c,          // matches --accent
    bgAlpha: 0.9,
    bgWidth: 40,
    bgHeight: 36,
    bgRadius: 4,
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 2,
    skullSize: 28,
    numberColor: 0xdcd2b9,      // matches --paper
    numberStroke: 0x1a1614,     // matches --ink
    numberFontSize: 14,
    // Objective-colour variants for coloured spawn zones
    blueBg: 0x1a5490,           // matches --info
    blueStroke: 0x1a1614,       // matches --ink
    greenBg: 0x1f5a29,          // matches --success
    greenStroke: 0x1a1614,      // matches --ink
  },
  exit: {
    fillColor: 0x1f5a29,        // matches --success
    fillAlpha: 0.85,
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 2,
    arrowColor: 0xdcd2b9,       // matches --paper
    arrowWidth: 3,
  },
  objective: {
    fillColor: 0xffcc1a,        // matches --highlight
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 2,
    dotColor: 0x1a1614,         // matches --ink
    // Marker variants
    blueFill: 0x1a5490,         // matches --info
    blueDot: 0xdcd2b9,          // matches --paper
    greenFill: 0x1f5a29,        // matches --success
    greenDot: 0xdcd2b9,         // matches --paper
  },
  epicCrate: {
    fillColor: 0xc7241c,        // matches --accent
    fillAlpha: 0.95,
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 2,
    glyphColor: 0xffcc1a,       // matches --highlight
  },

  // ─── Entities ─────────────────────────────────────
  entity: {
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 3,
    selectionGlow: 0xdcd2b9,    // matches --paper
    selectionAlpha: 0.5,
    activeTurnRing: 0xffcc1a,   // matches --highlight
    activeTurnWidth: 3,
    woundStroke: 0xc7241c,      // matches --accent
    woundStrokeWidth: 3,
    maskFill: 0xffffff,         // sprite mask only — never painted
  },

  // ─── Zombie fallback colors (when no texture) ────
  zombie: {
    walker: 0x5f7a3a,           // matches --zombie-walker
    runner: 0xd8661c,           // matches --zombie-runner
    brute: 0x6b3d8f,            // matches --zombie-brute
    abomination: 0x8f1611,      // matches --zombie-abom
    initialColor: 0xdcd2b9,     // matches --paper
    initialFontSize: 14,
  },

  // ─── Group badge (zombie overflow) ────────────────
  groupBadge: {
    bgColor: 0xdcd2b9,          // matches --paper
    bgAlpha: 1,
    textColor: 0x1a1614,        // matches --ink
    fontSize: 12,
    strokeColor: 0x1a1614,      // matches --ink
    strokeWidth: 2,
  },

  // ─── Board-overlay labels (move cost, counts) ────
  label: {
    fill: 0xdcd2b9,             // matches --paper
    stroke: 0x1a1614,           // matches --ink
    strokeWidth: 3,
    fontSize: 14,
  },

  // ─── Editor grid ──────────────────────────────────
  editorGrid: {
    lineColor: 0xc7241c,        // matches --accent
    lineAlpha: 0.5,
    lineWidth: 2,
  },

  // ─── Empty-state placeholder (HUD-D1) ────────────
  // Stylized blueprint shown when no real map is loaded.
  placeholder: {
    backdrop: 0x1a1614,         // matches --page
    backdropAlpha: 0.55,
    tileFill: 0xbdb08d,         // matches --paper-3
    tileFillAlpha: 0.85,
    tileBuilding: 0xcdc1a1,     // matches --paper-2
    tileStroke: 0x1a1614,       // matches --ink
    tileStrokeAlpha: 0.9,
    tileStrokeWidth: 2,
    gridLine: 0x1a1614,         // matches --ink
    gridLineAlpha: 0.12,
    gridStep: 24,
    operativeBlue: 0x4a82c8,    // BLUE rank (matches PlayerIdentities[1])
    operativeYellow: 0xc8a830,  // YELLOW rank (matches PlayerIdentities[3])
    operativeStroke: 0x1a1614,  // matches --ink
    operativeStrokeWidth: 2,
    hostile: 0xc7241c,          // matches --accent
    hostileStrokeWidth: 2,
    label: 0xffcc1a,            // matches --highlight
    labelAlpha: 0.9,
    compass: 0xffcc1a,          // matches --highlight
    compassAlpha: 0.6,
  },

  // ─── Floating board cues (attack results, wounds, spawns) ─
  cue: {
    hit: 0x1f5a29,              // matches --success
    miss: 0xdcd2b9,             // matches --paper
    wound: 0xc7241c,            // matches --accent
    spawn: 0xd8661c,            // matches --danger-orange
    info: 0xffcc1a,             // matches --highlight
    stroke: 0x1a1614,           // matches --ink
  },
} as const;

/**
 * Kicker tiers — typographic hierarchy for section labels (SYS-02).
 *
 * Reference for HTML/CSS surfaces. The actual styling lives in
 * `src/styles/utilities.css` under `.fm-kicker` (primary) and
 * `.fm-kicker--secondary`, which set `--font-display` on `--text-2` /
 * `--text-muted`. Use primary sparingly: at most 1–2 screen-level section
 * headers per screen. Use secondary for sub-panel labels (rosters, dossier
 * sections, loadout, field log).
 */
export const KICKER = {
  primary:   { fontSize: 10, tracking: 0.06, prefix: '', dot: true,  rule: true  },
  secondary: { fontSize: 9,  tracking: 0.04, prefix: '', dot: false, rule: false },
} as const;
