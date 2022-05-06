import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';

const diameter = 12;
const planetSpreadRadius = 48;
const planetCenters: Vector3[] = [];
const planetCount = 3;
for (let index = 0; index < planetCount; index++) {
  const angle = (-1 * index * Math.PI) / 1.5;
  planetCenters.push(
    new Vector3(
      planetSpreadRadius * Math.sin(angle),
      0,
      planetSpreadRadius * Math.cos(angle),
    ),
  );
}

const planetCodes: string[] = [];

const _planetIndex = (planetCode: string): number => {
  let i = planetCodes.indexOf(planetCode);
  if (i < 0) {
    i = planetCodes.push(planetCode) - 1;
  }
  return i;
};

const tileCoordsTo3d = (
  col: number,
  row: number,
  planet: number | string | undefined,
): Vector3 => {
  let planetIndex = 0;
  if (typeof planet === 'number') {
    planetIndex = planet;
  } else if (typeof planet === 'string') {
    planetIndex = _planetIndex(planet);
  }
  return new Vector3(
    col * diameter * Math.sin(Math.PI / 3),
    0,
    row * diameter - col * diameter * Math.cos(Math.PI / 3),
  ).add(planetCenters[planetIndex]);
};

const uniformScale = (scale: number): Vector3 => {
  return Vector3.One().scale(scale);
};

const color = (color: Color3 | string) => (scene: Scene) => {
  let color3: Color3;
  if (typeof color === 'string') {
    color3 = Color3.FromHexString(color);
  } else {
    color3 = color;
  }
  const mat = new StandardMaterial('mat', scene);
  mat.diffuseColor = color3;
  return mat;
};

export { color, diameter, tileCoordsTo3d, uniformScale };
