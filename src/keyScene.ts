import {
  ArcRotateCamera,
  Color3,
  DirectionalLight,
  Vector3,
  Viewport,
} from '@babylonjs/core';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Control, TextBlock } from '@babylonjs/gui';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';

import { displayResource, resources } from './resourceMeshes';

const createKeyScene = (
  engine: Engine,
  mainCamera: ArcRotateCamera,
  resourceName: string,
  options?: { row?: number; scale?: number },
): Scene => {
  const scene = new Scene(engine);
  scene.autoClear = false;
  const camera = new ArcRotateCamera(
    'Camera',
    (-5 * Math.PI) / 8,
    Math.PI / 3,
    10,
    Vector3.Zero(),
    scene,
  );
  let viewportY = 0.88;
  if (options?.row) {
    viewportY -= options.row * 0.12;
  }
  camera.viewport = new Viewport(0.9, viewportY, 0.12, 0.12);

  mainCamera.onViewMatrixChangedObservable.add(() => {
    camera.alpha = mainCamera.alpha;
    camera.beta = mainCamera.beta;
  });

  const light = new DirectionalLight('dir01', new Vector3(0, -1, 1), scene);
  light.position = new Vector3(0, 15, -30);
  light.diffuse = new Color3(1, 1, 1);
  light.specular = new Color3(0.1, 0.1, 0.1);

  const resourceFactory = resources(scene);
  const item = resourceFactory(resourceName);
  if (item) {
    item.position = Vector3.Zero();
    if (options?.scale) {
      item.scaling = new Vector3(options.scale, options.scale, options.scale);
    }
  }
  const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('myUI');
  const label = new TextBlock('label', displayResource(resourceName));
  // label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  label.color = '#a3e635';
  label.fontSize = 100;
  label.fontWeight = 'bold';
  label.outlineWidth = 15;
  label.outlineColor = 'black';
  label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  advancedTexture.addControl(label);
  return scene;
};

export { createKeyScene };
