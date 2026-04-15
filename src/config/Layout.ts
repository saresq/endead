// src/config/Layout.ts

/** Number of sub-cells per tile side (30x30 grid per tile, 15px each) */
export const TILE_CELLS_PER_SIDE = 30;

/** Pixel size of one sub-cell on the board */
export const TILE_SIZE = 15;

/** Pixel size of an entire tile (TILE_SIZE * TILE_CELLS_PER_SIDE) */
export const TILE_PIXEL_SIZE = TILE_SIZE * TILE_CELLS_PER_SIDE; // 450

export const ENTITY_RADIUS = 15;
export const ENTITY_SPACING = 40;
export const MIN_ENTITY_RADIUS = 8;        // Floor below which we group instead
export const GROUP_BADGE_RADIUS = 14;       // Size of the "x12" badge circle
