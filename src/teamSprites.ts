import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { Sprite, SpriteManager } from '@babylonjs/core/Sprites';

import { tileCoordsTo3d } from './hexUtil';
import { MapData } from './mapData';

const baseSize = 5;
const rate = 120;
let counter = 0;
const sprites: Sprite[] = [];

async function createColoredShieldUrl(hexColor: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const pr = data[i],
          pg = data[i + 1],
          pb = data[i + 2];
        const max = Math.max(pr, pg, pb);
        const min = Math.min(pr, pg, pb);
        // Blend proportionally by saturation: grey pixels keep their colour,
        // fully-saturated pixels are fully recoloured, anti-aliased edge pixels
        // get a smooth mix — avoiding jagged edges at the border.
        const saturation = max === 0 ? 0 : (max - min) / max;
        const t = Math.min(1, saturation / 0.3);
        if (t === 0) continue;
        const lum = max / 255;
        data[i] = Math.round(pr + (r * lum - pr) * t);
        data[i + 1] = Math.round(pg + (g * lum - pg) * t);
        data[i + 2] = Math.round(pb + (b * lum - pb) * t);
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL());
    };
    img.onerror = reject;
    img.src = '/shield.png';
  });
}

const showMapIcons = async (scene: Scene, mapData: MapData): Promise<void> => {
  const spriteManagers = Object.fromEntries(
    mapData.teams.map((team) => [
      team.name,
      new SpriteManager(
        `${team.name}Manager`,
        `/${team.spriteUrl}`,
        100,
        { width: team.spriteWidth, height: team.spriteHeight },
        scene,
      ),
    ]),
  );

  const shieldUrls = await Promise.all(
    mapData.teams.map((team) => createColoredShieldUrl(team.color)),
  );
  const shieldManagers = Object.fromEntries(
    mapData.teams.map((team, i) => [
      team.name,
      new SpriteManager(
        `${team.name}SM`,
        shieldUrls[i],
        100,
        { width: 72, height: 72 },
        scene,
      ),
    ]),
  );
  // console.log(spriteManagers);

  mapData.map.forEach((arr) => {
    const { col, row, team: teamName, defence, resourceName } = arr;
    if (!teamName) {
      // console.log(arr);
      return;
    }
    if (defence) {
      addShields(shieldManagers, teamName, col, row, defence);
    } else {
      addSprite(spriteManagers, teamName, col, row, resourceName === 'HQ');
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
  isHQ: boolean,
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
  if (isHQ) {
    sprites.push(sprite);
  }
}

export { showMapIcons };
