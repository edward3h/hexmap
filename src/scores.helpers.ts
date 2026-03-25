export interface Row {
  description: string;
  count: number;
  svp: number;
}

export const resourceOrder: Record<string, number> = {
  HQ: 1,
  'Command Bastion': 2,
  'Shield Generator': 3,
  'Power Station': 4,
  Manufactorum: 5,
  'Space Port': 6,
  'Hive City': 7,
};

export function resourceCompare(a: Row, b: Row): number {
  const scoreA = resourceOrder[a.description] || 10;
  const scoreB = resourceOrder[b.description] || 10;
  return scoreB - scoreA;
}

export function pluralize(row: Row): string {
  if (row.count == 1) {
    return row.description;
  }
  return `${row.count} ${row.description}s`;
}

export function total(rows: Row[]): number {
  return rows.reduce((acc, r) => acc + r.count * r.svp, 0);
}
