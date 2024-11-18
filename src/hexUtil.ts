import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';

const diameter = 12;

const tileCoordsTo3d = (col: number, row: number): Vector3 => {
  let rowOffset = 0;
  if (col % 2 != 0) {
    rowOffset = diameter * Math.cos(Math.PI / 3);
  }
  return new Vector3(
    col * diameter * Math.sin(Math.PI / 3),
    0,
    row * diameter - rowOffset,
  );
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
