// src/admin/colorPicker.ts
import { esc } from './utils';

export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#FF3333', name: 'Red' },
  { hex: '#33FF33', name: 'Green' },
  { hex: '#3333FF', name: 'Blue' },
  { hex: '#1A8C1A', name: 'Dark Green' },
  { hex: '#AADD00', name: 'Green-Yellow' },
  { hex: '#FF8800', name: 'Orange' },
  { hex: '#FFFF00', name: 'Yellow' },
  { hex: '#00CC44', name: 'Emerald' },
  { hex: '#33FFCC', name: 'Turquoise' },
  { hex: '#00CCFF', name: 'Azure' },
  { hex: '#0066FF', name: 'Royal Blue' },
  { hex: '#9933FF', name: 'Purple' },
  { hex: '#CC33FF', name: 'Violet' },
  { hex: '#FF33CC', name: 'Hot Pink' },
  { hex: '#FF0066', name: 'Crimson' },
  { hex: '#FF6633', name: 'Coral' },
  { hex: '#D4A853', name: 'Sand' },
  { hex: '#CD853F', name: 'Brown' },
  { hex: '#8B4513', name: 'Dark Brown' },
  { hex: '#607D8B', name: 'Blue-Grey' },
];

export const TILE_PALETTE: { hex: string; name: string }[] = [
  ...PALETTE,
  { hex: '#000000', name: 'Black' },
  { hex: '#555555', name: 'Dark Grey' },
];

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .color-picker { position: relative; display: inline-block; }
    .color-picker-swatch {
      width: 48px; height: 28px; border-radius: 4px;
      cursor: pointer; border: 1px solid #555;
    }
    .color-picker-popover {
      position: absolute; z-index: 100;
      background: #1a1a1a; border: 1px solid #555;
      border-radius: 6px; padding: 8px;
      display: flex; flex-wrap: wrap; gap: 5px;
      width: 220px;
    }
    .color-picker-popover button {
      width: 28px; height: 28px; border-radius: 4px;
      border: 2px solid transparent; cursor: pointer; padding: 0;
    }
    .color-picker-popover button.selected { border-color: white; }
  `;
  document.head.appendChild(style);
}

export function colorPickerHtml(
  id: string,
  currentValue: string,
  palette: { hex: string; name: string }[] = PALETTE,
): string {
  const buttons = palette
    .map(
      ({ hex, name }) =>
        `<button data-hex="${hex}" title="${name}"
          class="${hex.toLowerCase() === currentValue.toLowerCase() ? 'selected' : ''}"
          style="background:${hex}"></button>`,
    )
    .join('');
  return `<div class="color-picker" id="${esc(id)}" data-value="${esc(currentValue)}">
    <div class="color-picker-swatch" style="background:${esc(currentValue)}"></div>
    <div class="color-picker-popover" hidden>${buttons}</div>
  </div>`;
}

let sharedListenersAdded = false;

function addSharedListeners(): void {
  if (sharedListenersAdded) return;
  sharedListenersAdded = true;

  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.color-picker')) {
      document.querySelectorAll<HTMLElement>('.color-picker-popover').forEach((p) => {
        p.hidden = true;
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll<HTMLElement>('.color-picker-popover').forEach((p) => {
        p.hidden = true;
      });
    }
  });
}

export function initColorPicker(id: string, onChange: (hex: string) => void): void {
  injectStyles();
  addSharedListeners();

  const wrapper = document.getElementById(id);
  if (!wrapper) return;

  const swatch = wrapper.querySelector<HTMLElement>('.color-picker-swatch')!;
  const popover = wrapper.querySelector<HTMLElement>('.color-picker-popover')!;

  swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close any other open popovers
    document.querySelectorAll<HTMLElement>('.color-picker-popover').forEach((p) => {
      if (p !== popover) p.hidden = true;
    });
    popover.hidden = !popover.hidden;
  });

  popover.querySelectorAll<HTMLButtonElement>('button[data-hex]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hex = btn.dataset['hex']!;
      wrapper.dataset['value'] = hex;
      swatch.style.background = hex;
      popover.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
      popover.hidden = true;
      onChange(hex);
    });
  });
}
