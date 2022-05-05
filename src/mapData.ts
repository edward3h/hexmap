interface Team {
    name:string
    spriteUrl:string
    spriteWidth: number;
    spriteHeight: number;
}

interface TileData {
    col:number
    row:number
    colorOverride?:string
    team?:string
    resourceName?:string
    planet:string
    coord:string
    terrainRules?: {name:string, url:string}
    locationName?:string
}

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