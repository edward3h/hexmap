import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { Sprite, SpriteManager } from '@babylonjs/core/Sprites';

import { tileCoordsTo3d } from './hexUtil';
import { MapData } from './mapData';

const baseSize = 5;
const rate = 120;
let counter = 0;
const sprites: Sprite[] = [];

const showMapIcons = (scene: Scene, mapData: MapData): void => {
  const spriteManagers = Object.fromEntries(
    mapData.teams.map((team) => [
      team.name,
      new SpriteManager(
        `${team.name}Manager`,
        team.spriteUrl,
        100,
        { width: team.spriteWidth, height: team.spriteHeight },
        scene,
      ),
    ]),
  );

  const shieldManagers = Object.fromEntries(
    mapData.teams.map((team) => [
      team.name,
      new SpriteManager(
        `${team.name}SM`,
        `shield_${team.name}.png`,
        100,
        { width: 72, height: 72 },
        scene,
      ),
    ]),
  );
  // console.log(spriteManagers);

  mapData.map.forEach((arr) => {
    const { col, row, team: teamName, defence } = arr;
    if (!teamName) {
      // console.log(arr);
      return;
    }
    if (defence) {
      addShields(shieldManagers, teamName, col, row, defence);
    } else {
      addSprite(spriteManagers, teamName, col, row);
    }
    // console.log(sprite);
  });

  scene.registerBeforeRender(() => {
    sprites.forEach((sprite) => {
      if (counter === 0) {
        sprite.invertU = !sprite.invertU;
      }
      sprite.width = baseSize * Math.sin((counter * Math.PI) / rate);
    });
    counter = (counter + 1) % rate;
  });
};

function addShields(
  shieldManagers: { [x: string]: SpriteManager },
  teamName: string,
  col: number,
  row: number,
  defence: number,
) {
  const shieldManager = shieldManagers[teamName];
  if (!shieldManager) {
    return;
  }
  shieldManager.renderingGroupId = 1;
  for (let i = 0; i < defence; i++) {
    const sprite = new Sprite('', shieldManager);
    sprite.width = 4;
    sprite.height = (sprite.width * shieldManager.cellHeight) / shieldManager.cellWidth;
    const w = 8;
    const spread = (w / (defence + 1)) * (i + 1) - w / 2;
    sprite.position = new Vector3(-spread, sprite.height / 2 + spread, 0).add(
      tileCoordsTo3d(col, row),
    );
  }
}

function addSprite(
  spriteManagers: { [k: string]: SpriteManager },
  teamName: string,
  col: number,
  row: number,
) {
  const spriteManager = spriteManagers[teamName];
  if (!spriteManager) {
    throw `Missing sprite manager for ${teamName}`;
  }
  spriteManager.renderingGroupId = 1;
  const sprite = new Sprite('', spriteManager);
  sprite.width = baseSize;
  sprite.height = (baseSize * spriteManager.cellHeight) / spriteManager.cellWidth;
  sprite.position = new Vector3(0, sprite.height / 2 + 1, 0).add(
    tileCoordsTo3d(col, row),
  );
  sprites.push(sprite);
}

export { showMapIcons };
