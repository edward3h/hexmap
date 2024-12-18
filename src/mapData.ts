type Resource =
  | 'HiveCity'
  | 'SpacePort'
  | 'CommandBastion'
  | 'ShieldGenerator'
  | 'PowerStation'
  | 'Manufactorum'
  | 'HQ';

interface Team {
  name: string;
  spriteUrl: string;
  spriteWidth: number;
  spriteHeight: number;
  color: string;
  displayName: string;
  assets: Record<string, number>; // asset name, score
}

interface TileData {
  col: number;
  row: number;
  colorOverride?: string;
  team?: string;
  resourceName?: Resource;
  coord: string;
  terrainRules?: { name: string; url: string };
  locationName?: string;
  defence?: number;
}

interface Attack {
  team: string;
  from: { col: number; row: number };
  to: { col: number; row: number };
}

interface MapData {
  teams: Team[];
  map: TileData[];
  attacks: Attack[];
}

const teamRef: Record<string, Team> = {};

import data from './data.yml';
const fetchMapData = (): Promise<MapData> => {
  const mapData = data as MapData;
  for (const team of mapData.teams) {
    teamRef[team.name] = team;
  }
  return Promise.resolve(mapData);
  // return fetch('data.json')
  //   .then((response) => response.json() as Promise<MapData>)
  //   .then((mapData) => {
  //     for (const team of mapData.teams) {
  //       teamRef[team.name] = team;
  //     }
  //     return mapData;
  //   });
};

export { fetchMapData, MapData, Resource, Team, teamRef, TileData };
