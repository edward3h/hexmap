import './style.css';
import '@babylonjs/loaders';
import '@babylonjs/core/Rendering/edgesRenderer';

import { ActionManager } from '@babylonjs/core/Actions/actionManager';
import { ExecuteCodeAction } from '@babylonjs/core/Actions/directActions';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { DefaultLoadingScreen } from '@babylonjs/core/Loading';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CubeTexture, Texture } from '@babylonjs/core/Materials/Textures';
import { Color3, Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths';
import { MeshBuilder } from '@babylonjs/core/Meshes';
import { Scene } from '@babylonjs/core/scene';

// import { Inspector } from '@babylonjs/inspector';
import { showAttackArrows } from './attackArrows';
import { tileCoordsTo3d } from './hexUtil';
import { overlay, PositionFn } from './infoOverlay';
import { createKeyScene } from './keyScene';
import { fetchMapData } from './mapData';
import { showMapIcons } from './teamSprites';
import { clearHighlight, loadTileFactory } from './tileDefs';

const createScene = function (engine: Engine) {
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    'Camera',
    (-5 * Math.PI) / 8,
    Math.PI / 3,
    85,
    tileCoordsTo3d(0, 0),
    scene,
  );
  camera.upperBetaLimit = Math.PI / 2 - 0.1;
  camera.upperRadiusLimit = 140;
  camera.lowerRadiusLimit = 2;
  camera.attachControl(canvas, true);
  camera.panningSensibility = 0;

  const screenPosition: PositionFn = (vector: Vector3): Vector2 => {
    const v = Vector3.Project(
      vector,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    return new Vector2(v.x, v.y);
  };

  const light = new DirectionalLight('dir01', new Vector3(0, -1, 1), scene);
  light.position = new Vector3(0, 15, -30);
  light.diffuse = new Color3(1, 1, 1);
  light.specular = new Color3(0.1, 0.1, 0.1);

  // Skybox
  const skybox = MeshBuilder.CreateBox('skyBox', { size: 300 }, scene);
  const skyboxMaterial = new StandardMaterial('skyBox', scene);
  skyboxMaterial.backFaceCulling = false;
  const files = [
    'textures/Space/space_left.jpg',
    'textures/Space/space_up.jpg',
    'textures/Space/space_front.jpg',
    'textures/Space/space_right.jpg',
    'textures/Space/space_down.jpg',
    'textures/Space/space_back.jpg',
  ];
  skyboxMaterial.reflectionTexture = CubeTexture.CreateFromImages(files, scene);
  skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
  skyboxMaterial.disableLighting = true;
  skybox.material = skyboxMaterial;

  // if (import.meta.env.DEV) {
  //   const axes = new AxesViewer(scene, diameter);
  // }

  if (!scene.actionManager) {
    scene.actionManager = new ActionManager(scene);
  }
  scene.actionManager.registerAction(
    new ExecuteCodeAction(
      {
        trigger: ActionManager.OnKeyUpTrigger,
      },
      function (e) {
        const sourceEvent = e.sourceEvent as KeyboardEvent;
        if (sourceEvent.key == 'Escape' || sourceEvent.key == 'Esc') {
          clearHighlight();
        }
      },
    ),
  );

  skybox.actionManager = new ActionManager(scene);
  skybox.actionManager.registerAction(
    new ExecuteCodeAction(ActionManager.OnPickTrigger, clearHighlight),
  );

  const ol = overlay(screenPosition);
  scene.registerBeforeRender(() => {
    ol.tick();
  });

  void Promise.all([loadTileFactory(scene, ol), fetchMapData()]).then((v) => {
    const [createTile, mapData] = v;
    mapData.map.forEach(createTile);
    showMapIcons(scene, mapData);
    engine.hideLoadingUI();
    showAttackArrows(scene, mapData);
  });

  return { scene, camera };
};

const canvas = document.getElementById('app') as HTMLCanvasElement;
DefaultLoadingScreen.DefaultLogoUrl = 'ardboyz.png';
const engine = new Engine(canvas, true, { stencil: true });
engine.displayLoadingUI();

const { scene, camera } = createScene(engine);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
// Inspector.Show(scene, {});
const keyScenes: Scene[] = [];
keyScenes.push(createKeyScene(engine, camera, 'HQ', { scale: 0.7 }));
keyScenes.push(createKeyScene(engine, camera, 'CommandBastion', { row: 1 }));
keyScenes.push(createKeyScene(engine, camera, 'ShieldGenerator', { row: 2, scale: 0.8 }));
keyScenes.push(createKeyScene(engine, camera, 'PowerStation', { row: 3 }));
keyScenes.push(createKeyScene(engine, camera, 'Manufactorum', { row: 4, scale: 0.8 }));
keyScenes.push(createKeyScene(engine, camera, 'SpacePort', { row: 5, scale: 0.7 }));
keyScenes.push(createKeyScene(engine, camera, 'HiveCity', { row: 6, scale: 0.5 }));

engine.runRenderLoop(() => {
  scene.render();
  keyScenes.forEach((x) => x.render());
});
