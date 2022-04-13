interface Team {
    name:string
    spriteUrl:string
    spriteWidth: number;
    spriteHeight: number;
}

type TileData = [number, number, string, string?];

interface MapData {
    teams: Team[]
    map: TileData[]
}

const fetchMapData = (): Promise<MapData> => {
    return fetch("/data.json")
    .then(response => response.json());
}

export {
    fetchMapData,
    TileData,
    Team,
    MapData,
}