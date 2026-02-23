// src/config/Layout.ts

export const TILE_SIZE = 150;
export const ENTITY_RADIUS = 15;
export const ENTITY_SPACING = 40;

// Logical Grid Coordinates for the "City Blocks" Scenario
export const ZONE_LAYOUT: Record<string, { col: number; row: number; w: number; h: number }> = {
  // --- Streets ---
  'street-start': { col: 0, row: 2, w: 2, h: 1 }, // Starting Area
  'street-intersection': { col: 2, row: 2, w: 1, h: 1 },
  'street-east': { col: 3, row: 2, w: 2, h: 1 }, // Spawn Point East
  'street-north': { col: 2, row: 1, w: 1, h: 1 },
  'street-south': { col: 2, row: 3, w: 1, h: 1 }, // Spawn Point South / Exit path

  // --- Building 1: Police Station (Top Left) ---
  'police-reception': { col: 0, row: 0, w: 1, h: 2 },
  'police-armory': { col: 1, row: 0, w: 1, h: 2 },

  // --- Building 2: Diner (Bottom Right) ---
  'diner-front': { col: 3, row: 3, w: 1, h: 1 },
  'diner-kitchen': { col: 4, row: 3, w: 1, h: 1 },
  
  // --- Exit Zone ---
  'zone-exit': { col: 2, row: 4, w: 1, h: 1 }
};
