import { describe, expect, it } from 'vitest';

import { pluralize, resourceCompare, Row, total } from './scores.helpers';

describe('pluralize', () => {
  it('returns description unchanged when count is 1', () => {
    const row: Row = { description: 'Hive City', count: 1, svp: 3 };
    expect(pluralize(row)).toBe('Hive City');
  });

  it('prepends count and appends "s" when count > 1', () => {
    const row: Row = { description: 'Shield Generator', count: 2, svp: 1 };
    expect(pluralize(row)).toBe('2 Shield Generators');
  });

  it('handles count of 3', () => {
    const row: Row = { description: 'Power Station', count: 3, svp: 1 };
    expect(pluralize(row)).toBe('3 Power Stations');
  });
});

describe('total', () => {
  it('sums count * svp across all rows', () => {
    const rows: Row[] = [
      { description: 'HQ', count: 1, svp: 3 },
      { description: 'Power Station', count: 2, svp: 1 },
    ];
    expect(total(rows)).toBe(5);
  });

  it('returns 0 for an empty array', () => {
    expect(total([])).toBe(0);
  });

  it('handles a single row', () => {
    expect(total([{ description: 'HQ', count: 1, svp: 3 }])).toBe(3);
  });
});

describe('resourceCompare', () => {
  it('sorts HQ (order 1) after Manufactorum (order 5) — descending sort', () => {
    const hq: Row = { description: 'HQ', count: 1, svp: 3 };
    const manu: Row = { description: 'Manufactorum', count: 1, svp: 1 };
    // resourceCompare returns scoreB - scoreA; positive means a should come after b
    expect(resourceCompare(hq, manu)).toBeGreaterThan(0);
  });

  it('sorts Hive City (order 7) before HQ (order 1)', () => {
    const hive: Row = { description: 'Hive City', count: 1, svp: 1 };
    const hq: Row = { description: 'HQ', count: 1, svp: 3 };
    expect(resourceCompare(hive, hq)).toBeLessThan(0);
  });

  it('treats unknown resources as order 10 (last)', () => {
    const unknown: Row = { description: 'Unknown Relic', count: 1, svp: 0 };
    const manu: Row = { description: 'Manufactorum', count: 1, svp: 1 };
    expect(resourceCompare(unknown, manu)).toBeLessThan(0);
  });

  it('returns 0 for two resources with the same order', () => {
    const a: Row = { description: 'Unknown A', count: 1, svp: 0 };
    const b: Row = { description: 'Unknown B', count: 1, svp: 0 };
    expect(resourceCompare(a, b)).toBe(0);
  });
});
