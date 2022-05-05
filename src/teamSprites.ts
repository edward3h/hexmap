import { SpriteManager, Sprite } from "@babylonjs/core/Sprites";
import { Scene } from "@babylonjs/core/scene";
import { tileCoordsTo3d } from "./hexUtil";
import { MapData } from "./mapData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const baseSize = 5;
const rate = 120;
let counter = 0;
const sprites:Sprite[] = [];

const showMapIcons = (scene:Scene, mapData: MapData): void => {
    const spriteManagers = Object.fromEntries(
        mapData.teams.map(team => [team.name, 
            new SpriteManager(
                `${team.name}Manager`,
                team.spriteUrl,
                100,
                {width: team.spriteWidth, height: team.spriteHeight},
                scene
            )]
        )
    );

    console.log(spriteManagers);

    mapData.map.forEach(arr => {
        const {col, row, team: teamName, planet} = arr;
        if (!teamName) {
            // console.log(arr);
            return;
        }
        const spriteManager = spriteManagers[teamName];
        if (!spriteManager) {
            throw `Missing sprite manager for ${teamName}`;
        }
        spriteManager.renderingGroupId = 1;
        const sprite = new Sprite("", spriteManager);
        sprite.width = baseSize;
        sprite.height = baseSize * spriteManager.cellHeight / spriteManager.cellWidth;
        sprite.position = new Vector3(0, sprite.height / 2 + 1, 0).add(tileCoordsTo3d(col, row, planet));
        sprites.push(sprite);
        // console.log(sprite);
    });

    scene.registerBeforeRender(() => {
        sprites.forEach(sprite => {
            if (counter === 0) {
                sprite.invertU = !sprite.invertU;
            }
            sprite.width = baseSize * Math.sin(counter * Math.PI / rate);
        });
        counter = (counter + 1) % rate;
      });
};

export {
    showMapIcons
}