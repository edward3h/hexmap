interface Team {
  name: string;
  spriteUrl: string;
  spriteWidth: number;
  spriteHeight: number;
}

interface TileData {
  col: number;
  row: number;
  colorOverride?: string;
  team?: string;
  resourceName?: string;
  planet: string;
  coord: string;
  terrainRules?: { name: string; url: string };
  locationName?: string;
}

interface Planet {
  code: string;
  display: string;
}

interface Attack {
  team: string;
  from: string;
  to: string;
}

interface MapData {
  teams: Team[];
  map: TileData[];
  planets: Planet[];
  attacks: Attack[];
}

const teamColor: Record<string, string> = {
  red: '#FF3333',
  yellow: '#FFFF33',
  blue: '#3333FF',
  green: '#33FF33',
};

const fetchMapData = (): Promise<MapData> => {
  return fetch('data.json').then((response) => response.json() as Promise<MapData>);
};

export { fetchMapData, MapData, Planet, Team, teamColor, TileData };
