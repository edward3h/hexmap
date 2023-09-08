/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { MapData, Team, teamRef } from './mapData';
import { displayResource } from './resourceMeshes';

interface Row {
  description: string;
  count: number;
  svp: number;
}

function prepareRows(team: Team, mapData: MapData): Row[] {
  const r: Row[] = [];

  Object.keys(team.assets).forEach((asset) =>
    r.push({ description: asset, count: 1, svp: team.assets[asset] }),
  );

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

  return r;
}

export function showScores(mapData: MapData) {
  // TODO
  // const data = mapData.teams.reduce(
  //   (acc: Record<string, Row[]>, t) => ((acc[t.name] = prepareRows(t, mapData)), acc),
  //   {},
  // );

  // const maxRows = Object.values(data)
  // .map((rs) => rs.length)
  // .reduce(Math.max, 0);
  
  // const headings = Object.keys(data)
  //   .map((t) =>`<th class="${t}>${teamRef[t].displayName}</th>`)
  //   .join();

  // const element = document.getElementById('scores') as HTMLDivElement;
}
