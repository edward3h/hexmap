import {
    AbstractMesh,
  Color3,
  Curve3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import { color as colorMat, diameter, tileCoordsTo3d } from './hexUtil';
import { MapData, teamColor } from './mapData';

const _drawArrow = (scene: Scene) => {
  const d = diameter / 2;
  const head = 2;
  const from = new Vector3(-d, 0, 0);
  const top = new Vector3(0, d / 2, 0);
  const to = new Vector3(d, 0, 0);
  const baseCurve: Vector3[] = Curve3.ArcThru3Points(from, top, to, 12).getPoints();
  const p = Math.floor(baseCurve.length / 5);
  const x = baseCurve.length - p;
  const moo = baseCurve[x - 1];
  baseCurve.splice(x - 1, 0, moo.add(new Vector3(-0.01, 0.01, 0)));
  const side1: Vector3[] = [];
  const side2: Vector3[] = [];
  for (let i = 0; i < baseCurve.length; i++) {
    if (i < x) {
      side1.push(baseCurve[i].add(new Vector3(0, 0, (i + 1) / x)));
      side2.push(baseCurve[i].add(new Vector3(0, 0, -(i + 1) / x)));
    } else {
      side1.push(
        baseCurve[i].add(new Vector3(0, 0, ((baseCurve.length - i - 1) / p) * head)),
      );
      side2.push(
        baseCurve[i].add(new Vector3(0, 0, ((baseCurve.length - i - 1) / p) * -head)),
      );
    }
  }
  const DOWN = new Vector3(0, -0.4, 0);
  const side1l = side1.map((x) => x.add(DOWN));
  const side2l = side2.map((x) => x.add(DOWN));
  const paths = [side1l, side1, baseCurve, side2, side2l];
  const color3 = Color3.FromHexString('#FF3333');
  const mat = new StandardMaterial('mat', scene);
  mat.diffuseColor = color3;

  const ribbon = MeshBuilder.CreateRibbon(
    'rib',
    { pathArray: paths, closeArray: true },
    scene,
  );
  ribbon.visibility = 0;
  return ribbon;
};

const arrows: AbstractMesh[] = [];

const _arrow = (
  baseMesh: Mesh,
  color: StandardMaterial,
  from: Vector3 | undefined,
  to: Vector3 | undefined,
) => {
  if (!(from && to)) return;
  const centre = Vector3.Center(from, to);
  const axis = to.subtract(from);
  const length = axis.length();
  const rotation = Vector3.RotationFromAxis(axis, Vector3.Up(), axis.cross(Vector3.Up()));
  const m = baseMesh.clone();
  m.visibility = 1;
  m.scaling = new Vector3(length / diameter, 1, 1);
  m.position = centre.add(Vector3.Up());
  m.rotation = rotation;
  const mat = color;
  m.material = mat;
  arrows.push(m);
};

const rate = 240;
let counter = 0;
const _animate = () => {
  arrows.forEach((a) => {
    a.visibility = Math.sin((counter * Math.PI) / rate);
  });
  counter = (counter + 1) % rate;
};

const showAttackArrows = (scene: Scene, mapData: MapData) => {
  const lookupCoords = new Map<string, Vector3>(
    mapData.map.map((t) => [t.coord, tileCoordsTo3d(t.col, t.row, t.planet)]),
  );
  const baseArrow = _drawArrow(scene);
  mapData.attacks.forEach(({ team, from, to }) => {
    _arrow(
      baseArrow,
      colorMat(teamColor[team])(scene),
      lookupCoords.get(from),
      lookupCoords.get(to),
    );
  });
  scene.registerBeforeRender(_animate);
};

export { showAttackArrows };
