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
import { Campaign } from './campaignTypes';
import { tileCoordsTo3d } from './hexUtil';
import { overlay, PositionFn } from './infoOverlay';
import { createKeyScene } from './keyScene';
import { campaignId, fetchMapData } from './mapData';
import { showScores } from './scores';
import { showMapIcons } from './teamSprites';
import { clearHighlight, loadTileFactory } from './tileDefs';

const createScene = function (
  engine: Engine,
): Promise<{ scene: Scene; camera: ArcRotateCamera }> {
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
    '/textures/Space/space_left.jpg',
    '/textures/Space/space_up.jpg',
    '/textures/Space/space_front.jpg',
    '/textures/Space/space_right.jpg',
    '/textures/Space/space_down.jpg',
    '/textures/Space/space_back.jpg',
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

  const ready = Promise.all([loadTileFactory(scene, ol), fetchMapData()]).then(
    async ([createTile, mapData]) => {
      mapData.map.forEach(createTile);
      await showMapIcons(scene, mapData);
      showAttackArrows(scene, mapData);
      showScores(mapData);
      return { scene, camera };
    },
  );

  return ready;
};

const canvas = document.getElementById('app') as HTMLCanvasElement;
DefaultLoadingScreen.DefaultLogoUrl = '/ardboyz.png';
const engine = new Engine(canvas, true, { stencil: true });

// One-time campaign title fetch (not part of poll cycle)
void fetch(`/api/campaigns/${campaignId}`)
  .then((res) => (res.ok ? (res.json() as Promise<Campaign>) : null))
  .then((c) => {
    if (c) document.title = c.name;
  });

const backNav = document.getElementById('back-nav');
if (backNav) {
  const adminLink = document.createElement('a');
  adminLink.href = `/admin/campaigns/${campaignId}`;
  adminLink.textContent = 'Edit campaign →';
  adminLink.style.marginLeft = '1rem';
  backNav.appendChild(adminLink);
}

async function buildMap(): Promise<{
  scene: Scene;
  camera: ArcRotateCamera;
  keyScenes: Scene[];
}> {
  const { scene, camera } = await createScene(engine);
  const keyScenes: Scene[] = [
    createKeyScene(engine, camera, 'HQ', { scale: 0.7 }),
    createKeyScene(engine, camera, 'CommandBastion', { row: 1 }),
    createKeyScene(engine, camera, 'ShieldGenerator', { row: 2, scale: 0.8 }),
    createKeyScene(engine, camera, 'PowerStation', { row: 3 }),
    createKeyScene(engine, camera, 'Manufactorum', { row: 4, scale: 0.8 }),
    createKeyScene(engine, camera, 'SpacePort', { row: 5, scale: 0.7 }),
    createKeyScene(engine, camera, 'HiveCity', { row: 6, scale: 0.5 }),
  ];
  return { scene, camera, keyScenes };
}

function showToast(): void {
  const existing = document.getElementById('map-refresh-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'map-refresh-toast';
  toast.textContent = 'Map refreshed';
  document.body.appendChild(toast);
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

engine.displayLoadingUI();

buildMap()
  .then(({ scene, camera, keyScenes }) => {
    engine.hideLoadingUI();

    let currentScene = scene;
    let currentCamera = camera;
    let currentKeyScenes = keyScenes;

    engine.runRenderLoop(() => {
      currentScene.render();
      currentKeyScenes.forEach((x) => x.render());
    });

    let refreshing = false;

    function pollRefresh(): void {
      if (refreshing) return;
      refreshing = true;
      clearHighlight();
      buildMap()
        .then(({ scene: newScene, camera: newCamera, keyScenes: newKeyScenes }) => {
          currentCamera.onViewMatrixChangedObservable.clear();
          currentScene.dispose();
          currentKeyScenes.forEach((s) => s.dispose());
          currentScene = newScene;
          currentCamera = newCamera;
          currentKeyScenes = newKeyScenes;
          showToast();
        })
        .catch(() => {
          // silent — next poll will retry
        })
        .finally(() => {
          refreshing = false;
        });
    }

    setInterval(pollRefresh, 30 * 60 * 1000);
  })
  .catch(() => {
    engine.hideLoadingUI();
    const err = document.createElement('p');
    err.textContent = 'Failed to load map. Please refresh the page.';
    err.style.cssText = 'color:white;text-align:center;padding:2rem;';
    document.body.appendChild(err);
  });
