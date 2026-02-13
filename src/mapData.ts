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

const getCampaignId = (): number => {
  const base = import.meta.env.BASE_URL; // e.g. "/" or "/hexmap/"
  const path = window.location.pathname;
  // Strip the base prefix to get the app-relative path
  const relative = path.startsWith(base) ? path.slice(base.length) : path;
  // Expect "map/N" or "map/N/..."
  const match = relative.match(/^map\/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // No valid campaign ID — redirect to listing
  window.location.href = base;
  // Return 0 as fallback (redirect will navigate away)
  return 0;
};

const campaignId = getCampaignId();

const fetchMapData = (): Promise<MapData> => {
  return fetch(`/api/campaigns/${campaignId}/map-data`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load map data (${response.status})`);
      }
      return response.json() as Promise<MapData>;
    })
    .then((mapData) => {
      for (const team of mapData.teams) {
        teamRef[team.name] = team;
      }
      return mapData;
    });
};

export { campaignId, fetchMapData, MapData, Resource, Team, teamRef, TileData };
