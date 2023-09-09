/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { MapData, Team, teamRef } from './mapData';
import { displayResource } from './resourceMeshes';

interface Row {
  description: string;
  count: number;
  svp: number;
}

const resourceOrder: Record<string, number> = {
  'HQ':1,
  'Command Bastion':2,
  'Shield Generator':3,
  'Power Station':4,
  'Manufactorum':5,
  'Space Port':6,
  'Hive City':7
}

function resourceCompare(a: Row, b:Row) {
  const scoreA = resourceOrder[a.description] || 10;  
  const scoreB = resourceOrder[b.description] || 10;
  return scoreB - scoreA;
}

function prepareRows(team: Team, mapData: MapData): Row[] {
  const r: Row[] = [];
  const assetRows: Row[] = [];

  if (team.assets) {
  Object.keys(team.assets).forEach((asset) =>
    assetRows.push({ description: asset, count: 1, svp: team.assets[asset] }),
  );
  }
  assetRows.sort((a,b) => a.description.localeCompare(b.description));

  const resourceCounts: Record<string, number> = {};
  mapData.map.forEach((tile) => {
    if (tile.team === team.name && tile.resourceName) {
      if (resourceCounts[tile.resourceName]) {
        resourceCounts[tile.resourceName] += 1;
      } else {
        resourceCounts[tile.resourceName] = 1;
      }
    }
  });

  Object.keys(resourceCounts)
    .sort()
    .forEach((resourceName) => {
      r.push({
        description: displayResource(resourceName),
        count: resourceCounts[resourceName],
        svp: resourceName === 'HQ' ? 3 : 1,
      });
    });

    r.sort(resourceCompare)
    r.unshift(...assetRows);
  return r;
}

function pluralize(row: Row): string {
  if (row.count == 1) {
    return row.description;
  }
  return `${row.count} ${row.description}s`;
}

function total(rows: Row[]): number {
  return rows.reduce((acc, r) => acc + (r.count * r.svp), 0);
}

export function showScores(mapData: MapData) {
  const data = mapData.teams.reduce(
    (acc: Record<string, Row[]>, t) => ((acc[t.name] = prepareRows(t, mapData)), acc),
    {},
  );
  const totals = Object.keys(data).reduce(
    (acc: Record<string, number>, t) => ((acc[t] = total(data[t])),acc), {}
  );
  const maxRows = Object.values(data)
  .map((rs) => rs.length)
  .reduce((a, b) => Math.max(a,b), 0);
  const headings = Object.keys(data)
    .map((t) =>`<th class="${t}" colspan="2"><img src="${teamRef[t].spriteUrl}"><span>${teamRef[t].displayName}</span></th>`)
    .join('');
  const dataRows = [];
  for (let i = 0; i < maxRows; i++) {
    dataRows.push(
      Object.keys(data)
      .map((t) => {
        if (data[t].length > 0) {
          const row = data[t].pop() as Row;
          return `<td>${pluralize(row)}</td><td>${row.svp * row.count}</td>`;
        }
        return `<td></td><td></td>`;
      })
      .join('')
    );
  }
  const totalRow = Object.keys(data)
  .map((t) => `<td>Total</td><td>${totals[t]}</td>`)
  .join('');
  const html = `
  <table>
    <tr>${headings}</tr>
    ${dataRows.map(it => `<tr>${it}</tr>`).join("\n")}
    <tr class="total">${totalRow}</tr>
  </table>
  `;
  const element = document.getElementById('scores') as HTMLDivElement;
  element.innerHTML = html;
}
