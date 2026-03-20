// src/admin/hexGrid.ts
// Renders an SVG pointy-top hex grid for the tile editor.

import type { AdminTile } from './types';

interface HexGridTeam {
  name: string;
  color: string;
}

const HEX_H = 52; // tip-to-tip height
const R = HEX_H / 2; // tip radius = 26
const HEX_W = HEX_H * 0.866; // flat-to-flat width ≈ 45

function hexCentre(col: number, row: number): { x: number; y: number } {
  // Safe modulo: ((col % 2) + 2) % 2 ensures correct parity for negative cols
  const colParity = ((col % 2) + 2) % 2;
  return { x: col * HEX_W, y: row * HEX_H - colParity * HEX_H * 0.5 };
}

function hexPoints(cx: number, cy: number): string {
  return [
    [cx, cy - R],
    [cx + HEX_W / 2, cy - R / 2],
    [cx + HEX_W / 2, cy + R / 2],
    [cx, cy + R],
    [cx - HEX_W / 2, cy + R / 2],
    [cx - HEX_W / 2, cy - R / 2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

export function renderHexGrid(
  container: HTMLElement,
  tiles: AdminTile[],
  teams: HexGridTeam[],
  onSelect: (sel: { col: number; row: number; tile: AdminTile | null }) => void,
): { setSelected: (col: number | null, row: number | null) => void } {
  const tileMap = new Map<string, AdminTile>(tiles.map((t) => [`${t.col},${t.row}`, t]));
  const teamColor = new Map<string, string>(teams.map((t) => [t.name, t.color]));

  // Grid bounds
  let minCol: number, maxCol: number, minRow: number, maxRow: number;
  if (tiles.length === 0) {
    minCol = -2; maxCol = 2; minRow = -2; maxRow = 2;
  } else {
    minCol = Math.min(...tiles.map((t) => t.col)) - 1;
    maxCol = Math.max(...tiles.map((t) => t.col)) + 1;
    minRow = Math.min(...tiles.map((t) => t.row)) - 1;
    maxRow = Math.max(...tiles.map((t) => t.row)) + 1;
  }

  // Compute SVG pixel extents of all hex centres, then add R padding on each side
  let svgMinX = Infinity, svgMaxX = -Infinity;
  let svgMinY = Infinity, svgMaxY = -Infinity;
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const { x, y } = hexCentre(col, row);
      svgMinX = Math.min(svgMinX, x - HEX_W / 2);
      svgMaxX = Math.max(svgMaxX, x + HEX_W / 2);
      svgMinY = Math.min(svgMinY, y - R);
      svgMaxY = Math.max(svgMaxY, y + R);
    }
  }
  svgMinX -= R; svgMinY -= R;
  svgMaxX += R; svgMaxY += R;

  // Build polygon group strings
  const groups: string[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const tile = tileMap.get(`${col},${row}`) ?? null;
      const { x, y } = hexCentre(col, row);
      const pts = hexPoints(x, y);
      const cx = x.toFixed(2);
      const cy = (y + 4).toFixed(2);
      if (tile) {
        const fill = tile.team ? (teamColor.get(tile.team) ?? '#333') : '#333';
        const raw = tile.locationName ? tile.locationName.slice(0, 10) : tile.coord;
        const label = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        groups.push(
          `<g data-col="${col}" data-row="${row}" style="cursor:pointer">` +
            `<polygon points="${pts}" fill="${fill}" stroke="#888" stroke-width="1"` +
            ` data-ds="#888" data-dsw="1"/>` +
            `<text x="${cx}" y="${cy}" fill="#eee" font-size="7"` +
            ` text-anchor="middle" pointer-events="none">${label}</text>` +
          `</g>`,
        );
      } else {
        groups.push(
          `<g data-col="${col}" data-row="${row}" style="cursor:pointer">` +
            `<polygon points="${pts}" fill="#111" stroke="#555" stroke-width="1"` +
            ` stroke-dasharray="4,3" data-ds="#555" data-dsw="1"/>` +
            `<text x="${cx}" y="${cy}" fill="#444" font-size="10"` +
            ` text-anchor="middle" pointer-events="none">+</text>` +
          `</g>`,
        );
      }
    }
  }

  const vb =
    `${svgMinX.toFixed(1)} ${svgMinY.toFixed(1)} ` +
    `${(svgMaxX - svgMinX).toFixed(1)} ${(svgMaxY - svgMinY).toFixed(1)}`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', vb);
  svg.setAttribute(
    'style',
    'width:100%;max-height:400px;display:block;background:#1a1a1a;border-radius:4px',
  );
  svg.innerHTML = groups.join('');
  container.appendChild(svg);

  // Wire click handlers
  svg.querySelectorAll<SVGGElement>('g[data-col]').forEach((g) => {
    g.addEventListener('click', () => {
      const col = Number(g.dataset['col']);
      const row = Number(g.dataset['row']);
      onSelect({ col, row, tile: tileMap.get(`${col},${row}`) ?? null });
    });
  });

  // Selection highlight — mutates polygon stroke without re-rendering
  let selectedPoly: SVGPolygonElement | null = null;

  function setSelected(col: number | null, row: number | null): void {
    if (selectedPoly) {
      selectedPoly.setAttribute(
        'stroke',
        selectedPoly.getAttribute('data-ds') ?? '#888',
      );
      selectedPoly.setAttribute(
        'stroke-width',
        selectedPoly.getAttribute('data-dsw') ?? '1',
      );
      selectedPoly = null;
    }
    if (col === null || row === null) return;
    const g = svg.querySelector<SVGGElement>(`g[data-col="${col}"][data-row="${row}"]`);
    const poly = g?.querySelector<SVGPolygonElement>('polygon') ?? null;
    if (!poly) return;
    poly.setAttribute('stroke', '#fff');
    poly.setAttribute('stroke-width', '2');
    selectedPoly = poly;
  }

  return { setSelected };
}
