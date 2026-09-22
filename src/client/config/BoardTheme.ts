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
 * Palette anchors (dark first):
 *   --page          0x110d0b   --page-2   0x221b16   --ink      0x070504
 *   --paper         0x28211c   --paper-2  0x322b24   --paper-3  0x3e362e
 *   --text          0xe4ddce   --accent   0xbc392a   --highlight 0xf8cc3a
 *   --danger-orange 0xe07937   --text-inverse 0xf1ebdc
 *   --success-lift  0x499b56   --info-lift 0x4883c6
 *   --accent-lift   0xe67060   --info-pale 0xafcef1
 *
 * Light marks on the board (labels, counts, crosswalks, the selection glow)
 * use --text, the cream: the "paper" tokens are charcoal surfaces now.
 *
 * The SVG icons in /images/icons are single-colour and baked from the same
 * anchors: skull-cream (--text-inverse, on the red spawn plate), swords-lift
 * (--accent-lift, over the red attack wash), noise-yellow (--highlight),
 * sport-shoe-pale (--info-pale, over the sprint wash), search-ink and
 * door-open-ink (--ink). Re-bake them when an anchor moves.
 *
 * The board is dark, so green and blue fills use the lifted variants: the
 * deep --success / --info inks sank to ~2:1 against the floors. Marks drawn
 * on a lifted fill are --ink.
 *
 * Two deliberate departures from the change's design note (D6):
 *   - `exit` uses --success-lift rather than --highlight, so the exit reads
 *     as "go" and not as "selected". Its icon is the ink asset.
 *   - `searchable.iconColor` is ink, readable on yellow.
 */

/** Font stacks for PIXI text. Mirrors --font-display / --font-body. */
const FONT_DISPLAY = '"Bangers", Impact, "Arial Narrow", sans-serif';
const FONT_BODY = '"Geist", system-ui, "Helvetica Neue", sans-serif';

export const BOARD_THEME = {
  // ─── Type ──────────────────────────────────────────
  font: {
    display: FONT_DISPLAY,        // matches --font-display (cues, big numbers)
    body: FONT_BODY,              // matches --font-body (labels, counts)
  },

  // ─── Background ────────────────────────────────────
  background: 0x110d0b,           // matches --page

  // ─── Zone fills ────────────────────────────────────
  zone: {
    street: 0x221b16,             // matches --page-2
    building: 0x322b24,           // matches --paper-2
    validMove: 0xf8cc3a,          // matches --highlight
    validMoveAlpha: 0.35,
    pendingMove: 0xf8cc3a,        // matches --highlight
    pendingMoveAlpha: 0.2,
    validMoveHighlight: 0x070504, // matches --ink (outline on the wash)
    pendingMoveHighlight: 0x070504, // matches --ink
    pendingMoveStroke: 0x070504,    // matches --ink
    sprintFill: 0x4883c6,         // matches --info-lift
    sprintAlpha: 0.3,
  },

  // ─── Edges / walls ────────────────────────────────
  wall: {
    color: 0x070504,             // matches --ink
    alpha: 1,
    width: 3,
  },
  door: {
    open: 0x499b56,              // matches --success-lift
    openAlpha: 1,
    closed: 0xe07937,            // matches --danger-orange
    closedAlpha: 1,
    strokeColor: 0x070504,       // matches --ink
    strokeWidth: 0,
    barWidth: 6,
    plankGap: 0,
    plankBorder: 0x070504,       // matches --ink
    plankBorderAlpha: 1,
    highlightColor: 0xf8cc3a,    // matches --highlight
    highlightAlpha: 0.4,
    openableBorder: 0xf8cc3a,    // matches --highlight
    openableBorderAlpha: 1,
    openableBorderWidth: 2,
  },
  attack: {
    fillColor: 0xbc392a,         // matches --accent
    fillAlpha: 0.35,
  },
  doorway: {
    color: 0x499b56,             // matches --success-lift
    alpha: 0.6,
  },
  crosswalk: {
    color: 0xe4ddce,             // matches --text
    alpha: 0.7,
  },

  // ─── Zone indicators ─────────────────────────────
  noise: {
    triangleFill: 0xf8cc3a,     // matches --highlight
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 2,
    markColor: 0x070504,        // matches --ink
  },
  searchable: {
    circleColor: 0xf8cc3a,      // matches --highlight
    strokeColor: 0x070504,      // matches --ink
    iconColor: 0x070504,        // matches --ink (readable on yellow)
  },
  spawn: {
    bgColor: 0xbc392a,          // matches --accent
    bgAlpha: 0.9,
    bgWidth: 40,
    bgHeight: 36,
    bgRadius: 4,
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 2,
    skullSize: 28,
    numberColor: 0xe4ddce,      // matches --text
    numberStroke: 0x070504,     // matches --ink
    numberFontSize: 14,
    // Objective-colour variants for coloured spawn zones
    blueBg: 0x4883c6,           // matches --info-lift
    blueStroke: 0x070504,       // matches --ink
    greenBg: 0x499b56,          // matches --success-lift
    greenStroke: 0x070504,      // matches --ink
  },
  exit: {
    fillColor: 0x499b56,        // matches --success-lift
    fillAlpha: 0.85,
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 2,
    arrowColor: 0x070504,       // matches --ink (paper was 2.3:1 on the lifted green)
    arrowWidth: 3,
  },
  objective: {
    fillColor: 0xf8cc3a,        // matches --highlight
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 2,
    dotColor: 0x070504,         // matches --ink
    // Marker variants
    blueFill: 0x4883c6,         // matches --info-lift
    blueDot: 0x070504,          // matches --ink
    greenFill: 0x499b56,        // matches --success-lift
    greenDot: 0x070504,         // matches --ink
  },
  epicCrate: {
    fillColor: 0xbc392a,        // matches --accent
    fillAlpha: 0.95,
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 2,
    glyphColor: 0xf8cc3a,       // matches --highlight
  },

  // ─── Entities ─────────────────────────────────────
  entity: {
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 3,
    selectionGlow: 0xe4ddce,    // matches --text
    selectionAlpha: 0.5,
    activeTurnRing: 0xf8cc3a,   // matches --highlight
    activeTurnWidth: 3,
    woundStroke: 0xbc392a,      // matches --accent
    woundStrokeWidth: 3,
    maskFill: 0xffffff,         // sprite mask only — never painted
  },

  // ─── Zombie fallback colors (when no texture) ────
  zombie: {
    walker: 0x7f9f53,           // matches --zombie-walker
    runner: 0xe07937,           // matches --zombie-runner
    brute: 0xab7ed2,            // matches --zombie-brute
    abomination: 0xe06062,      // matches --zombie-abom
    initialColor: 0xe4ddce,     // matches --text
    initialFontSize: 14,
  },

  // ─── Group badge (zombie overflow) ────────────────
  groupBadge: {
    bgColor: 0xe4ddce,          // matches --text
    bgAlpha: 1,
    textColor: 0x070504,        // matches --ink
    fontSize: 12,
    strokeColor: 0x070504,      // matches --ink
    strokeWidth: 2,
  },

  // ─── Board-overlay labels (move cost, counts) ────
  label: {
    fill: 0xe4ddce,             // matches --text
    stroke: 0x070504,           // matches --ink
    strokeWidth: 3,
    fontSize: 14,
  },

  // ─── Editor grid ──────────────────────────────────
  editorGrid: {
    lineColor: 0xbc392a,        // matches --accent
    lineAlpha: 0.5,
    lineWidth: 2,
  },

  // ─── Empty-state placeholder (HUD-D1) ────────────
  // Stylized blueprint shown when no real map is loaded.
  placeholder: {
    backdrop: 0x110d0b,         // matches --page
    backdropAlpha: 0.55,
    tileFill: 0x3e362e,         // matches --paper-3
    tileFillAlpha: 0.85,
    tileBuilding: 0x322b24,     // matches --paper-2
    tileStroke: 0x070504,       // matches --ink
    tileStrokeAlpha: 0.9,
    tileStrokeWidth: 2,
    gridLine: 0x070504,         // matches --ink
    gridLineAlpha: 0.12,
    gridStep: 24,
    operativeBlue: 0x6295d4,    // matches --player-2 (PlayerIdentities[1])
    operativeYellow: 0xd9a850,  // matches --player-4 (PlayerIdentities[3])
    operativeStroke: 0x070504,  // matches --ink
    operativeStrokeWidth: 2,
    hostile: 0xbc392a,          // matches --accent
    hostileStrokeWidth: 2,
    label: 0xf8cc3a,            // matches --highlight
    labelAlpha: 0.9,
    compass: 0xf8cc3a,          // matches --highlight
    compassAlpha: 0.6,
  },

  // ─── Floating board cues (attack results, wounds, spawns) ─
  cue: {
    hit: 0x499b56,              // matches --success-lift
    miss: 0xe4ddce,             // matches --text
    wound: 0xbc392a,            // matches --accent
    spawn: 0xe07937,            // matches --danger-orange
    rush: 0xbc392a,             // matches --accent (Rush cards: spawn, then move)
    info: 0xf8cc3a,             // matches --highlight
    stroke: 0x070504,           // matches --ink
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
