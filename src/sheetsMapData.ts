/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// import { DateTime } from "luxon";
import type { MapData } from './mapData';

type TeamRow = [string, string, number, number];
type TileRow = [
  number,
  number,
  string?,
  string?,
  string?,
  string?,
  string?,
  string?,
  string?,
  string?,
];

// let lastResponseTime:DateTime;
const K = import.meta.env.VITE_API_KEY;
const I = import.meta.env.VITE_SHEET_ID;
// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
const URL = `https://sheets.googleapis.com/v4/spreadsheets/${I}/values:batchGet?key=${K}&ranges=Teams!A1%3AD12&ranges=Territories!A1%3AJ100&ranges=Planets!A1%3AB4`;
// const timeout = 5 * 1000;

const fetchMapData = (): Promise<MapData> => {
  return fetch(URL)
    .then((response) => {
      // const dateHeader = response.headers.get("date");
      // lastResponseTime = dateHeader ? DateTime.fromHTTP(dateHeader) : DateTime.now();
      return response.json();
    })
    .then((data) => {
      // console.log(data);
      const teams = data.valueRanges[0].values.slice(1).map((row: TeamRow) => {
        const [name, spriteUrl, spriteWidth, spriteHeight] = row;
        return { name, spriteUrl, spriteWidth, spriteHeight };
      });
      const map = data.valueRanges[1].values.slice(1).map((teamRow: TileRow) => {
        const [
          col,
          row,
          colorOverride,
          team,
          resourceName,
          planet,
          coord,
          terrainRulesName,
          terrainRulesUrl,
          locationName,
        ] = teamRow;
        const terrainRules =
          terrainRulesName && terrainRulesUrl
            ? { name: terrainRulesName, url: terrainRulesUrl }
            : null;
        return {
          col,
          row,
          colorOverride,
          team,
          resourceName,
          planet,
          coord,
          terrainRules,
          locationName,
        };
      });
      const planets = data.valueRanges[2].values.slice(1).map((row: string[]) => {
        const [code, display] = row;
        return { code, display };
      });
      // setTimeout(checkForUpdate, timeout);
      return { teams, map, planets };
    });
};

// const checkForUpdate = () => {
//     fetch(URL,{
//         headers: {
//             'If-Modified-Since': lastResponseTime
//         }
//     })
//     .then((response) => {
//         lastResponseTime = response.headers.get("date") || Date();
//         console.log(response.status);
//         setTimeout(checkForUpdate, timeout);
//     });
// };

export { fetchMapData };
