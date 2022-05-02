interface Team {
    name:string
    spriteUrl:string
    spriteWidth: number;
    spriteHeight: number;
}

type TileData = [number, number, string, string?, string?, string?, string?];
interface Planet {
    code:string
    display:string
}
interface MapData {
    teams: Team[]
    map: TileData[]
    planets: Planet[]
}

const fetchMapData = (): Promise<MapData> => {
    return fetch("data.json")
    .then(response => response.json());
}

export {
    fetchMapData,
    TileData,
    Team,
    MapData,
    Planet,
}