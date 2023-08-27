interface Team {
  name: string;
  spriteUrl: string;
  spriteWidth: number;
  spriteHeight: number;
  color: string;
  displayName: string;
}

interface TileData {
  col: number;
  row: number;
  colorOverride?: string;
  team?: string;
  resourceName?: string;
  coord: string;
  terrainRules?: { name: string; url: string };
  locationName?: string;
}

interface Attack {
  team: string;
  from: string;
  to: string;
}

interface MapData {
  teams: Team[];
  map: TileData[];
  attacks: Attack[];
}

const teamRef: Record<string, Team> = {};

const fetchMapData = (): Promise<MapData> => {
  return fetch('data.json')
    .then((response) => response.json() as Promise<MapData>)
    .then((mapData) => {
      for (const team of mapData.teams) {
        teamRef[team.name] = team;
      }
      return mapData;
    });
};

export { fetchMapData, MapData, Team, teamRef, TileData };
