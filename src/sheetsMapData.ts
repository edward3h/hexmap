import type { MapData } from "./mapData";

type TeamRow = [string, string, number, number];

const K = import.meta.env.VITE_API_KEY;
const I = import.meta.env.VITE_SHEET_ID;
const URL = `https://sheets.googleapis.com/v4/spreadsheets/${I}/values:batchGet?key=${K}&ranges=Teams!A1%3AD12&ranges=Territories!A1%3AD100`;
const fetchMapData = (): Promise<MapData> => {
    return fetch(URL)
    .then((response) => response.json())
    .then((data) => {
        console.log(data);
        const teams = data.valueRanges[0].values.slice(1).map((row: TeamRow) => {
            const [name, spriteUrl, spriteWidth, spriteHeight] = row;
            return {name, spriteUrl, spriteWidth, spriteHeight};
        });
        const map = data.valueRanges[1].values.slice(1);
        return {teams, map};
    });
};

export {
    fetchMapData
}