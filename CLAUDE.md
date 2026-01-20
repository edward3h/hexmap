# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hexmap is an interactive 3D campaign map visualization for tabletop gaming. It displays a hexagonal grid with team territories, resources, attack arrows, and scores using Babylon.js for 3D rendering.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # TypeScript check + Vite production build
npm run preview      # Preview production build locally
npm run lint         # Format (Prettier) + lint fix (ESLint)
```

For GitHub Pages deployment, build with base path:
```bash
npm exec -- vite build --base=/hexmap
```

## Architecture

### Data Flow
- Game state is defined in `src/data.yml` (teams, tiles, attacks)
- `mapData.ts` loads YAML and exports typed data structures (`MapData`, `Team`, `TileData`, `Attack`)
- `main.ts` initializes Babylon.js scene and orchestrates loading

### Hex Grid System
- Uses axial hex coordinates with odd-q offset
- `hexUtil.ts` converts hex coords to 3D world positions
- Tile diameter is 12 units

### Key Modules
- `tileDefs.ts` - Hex tile mesh creation and click interaction
- `attackArrows.ts` - 3D curved arrows showing attacks between tiles
- `resourceMeshes.ts` - 3D models for strategic objectives (HQ, bases, etc.)
- `teamSprites.ts` - Team faction icons on map
- `scores.ts` - Scoreboard calculation and display
- `keyScene.ts` - Mini-scenes showing detailed objective views
- `infoOverlay.ts` - Click-triggered info popover UI

### Babylon.js Setup
- ArcRotateCamera with constrained rotation/zoom
- Multiple scenes: main map + separate key scenes for objectives
- Scene action manager handles Escape key to clear selection

## Code Style

- Strict TypeScript (no implicit any)
- Prettier + ESLint enforced via pre-commit hook
- Single quotes, semicolons, trailing commas
- Imports sorted via `eslint-plugin-simple-import-sort`
