
import './style.css';
import '@babylonjs/loaders';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CubeTexture, Texture } from '@babylonjs/core/Materials/Textures';
import { MeshBuilder } from '@babylonjs/core/Meshes';
import { DefaultLoadingScreen } from '@babylonjs/core/Loading';
import '@babylonjs/core/Rendering/edgesRenderer';
import { clearHighlight, loadTileFactory } from './tileDefs';
import { fetchMapData } from './sheetsMapData';
import { showMapIcons } from './teamSprites';
import earcut from 'earcut';
import { tileCoordsTo3d } from './hexUtil';
import { Animation, EasingFunction, QuadraticEase } from '@babylonjs/core/Animations';
import { Planet } from './mapData';
import { createKeyScene } from './keyScene';
import { overlay, PositionFn } from './infoOverlay';
import { ActionManager } from '@babylonjs/core/Actions/actionManager';
import { ExecuteCodeAction } from '@babylonjs/core/Actions/directActions';


var createScene = function (engine: Engine) {
  const scene = new Scene(engine);

  let cameraPlanet = 0;
  let planets: Planet[];
  const camera = new ArcRotateCamera("Camera", -5 * Math.PI / 8, Math.PI / 3, 70, tileCoordsTo3d(0,0,cameraPlanet), scene);
  camera.upperBetaLimit = Math.PI / 2 - 0.1;
  camera.upperRadiusLimit = 140;
  camera.lowerRadiusLimit = 2;
  camera.attachControl(canvas, true);
  camera.panningSensibility = 0;
  const DEFAULT_CAMERA_OFFSET = camera.position.subtract(camera.target);

  const screenPosition: PositionFn = (vector: Vector3): Vector2 => {
    var v =  Vector3.Project(vector,
    Matrix.Identity(),
    scene.getTransformMatrix(),
    camera.viewport.toGlobal(
    engine.getRenderWidth(),
    engine.getRenderHeight(),
    ));
    return new Vector2(v.x, v.y);
  };

  const light = new DirectionalLight("dir01", new Vector3(0, -1, 1), scene);
  light.position = new Vector3(0, 15, -30);
  light.diffuse = new Color3(1, 1, 1);
  light.specular = new Color3(0.1, 0.1, 0.1);

  // Skybox
  var skybox = MeshBuilder.CreateBox("skyBox", { size: 300 }, scene);
  var skyboxMaterial = new StandardMaterial("skyBox", scene);
  skyboxMaterial.backFaceCulling = false;
  var files = [
    "textures/Space/space_left.jpg",
    "textures/Space/space_up.jpg",
    "textures/Space/space_front.jpg",
    "textures/Space/space_right.jpg",
    "textures/Space/space_down.jpg",
    "textures/Space/space_back.jpg",
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
      new ExecuteCodeAction({
        trigger: ActionManager.OnKeyUpTrigger
      }, 
        function(e) {
          if (e.sourceEvent.key == "Escape" || e.sourceEvent.key == "Esc") {
            clearHighlight();
          }
        })
      );

      skybox.actionManager = new ActionManager(scene);
      skybox.actionManager.registerAction(
        new ExecuteCodeAction(
        ActionManager.OnPickTrigger,
        clearHighlight
        )
    );
  


  const planetName = (index:number) => {
    if (!planets) return;
    const p = planets[index];
    if (!p) return;
    const el = document.getElementById("label");
    if (!el) return;
    el.innerText = p.display;
  }

  const ol = overlay(screenPosition);
  scene.registerBeforeRender(() => {
    ol.tick();
  });

  Promise.all([
    loadTileFactory(scene, ol),
    fetchMapData()
  ])
    .then(v => {
      const [createTile, mapData] = v;
      mapData.map.forEach(createTile);
      showMapIcons(scene, mapData);
      engine.hideLoadingUI();
      planets = mapData.planets;
      planetName(0);
    });

  const changePlanet = (delta:number) => () => {
    clearHighlight();
    const start = camera.target;
    cameraPlanet += delta;
    if (cameraPlanet > 2) cameraPlanet = 0;
    if (cameraPlanet < 0) cameraPlanet = 2;
    const end = tileCoordsTo3d(0,0,cameraPlanet);
    const anim = new Animation("cameraMove", "target", 50, Animation.ANIMATIONTYPE_VECTOR3);
    anim.setKeys([
      {frame: 0, value: start},
      {frame: 100, value: end},
    ]);
    const easing = new QuadraticEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)
    anim.setEasingFunction(easing);
    camera.animations.push(anim);
    const animPosition = new Animation("cameraAim", "position", 50, Animation.ANIMATIONTYPE_VECTOR3);
    animPosition.setKeys([
      {frame:0, value: camera.position},
      {frame:100, value: end.add(DEFAULT_CAMERA_OFFSET)},
    ]);
    animPosition.setEasingFunction(easing);
    camera.animations.push(animPosition);
    scene.beginAnimation(camera, 0, 100);
    planetName(cameraPlanet);
  };

  return {scene, camera, next: changePlanet(1), previous: changePlanet(-1)};
};

const canvas = document.getElementById('app');
DefaultLoadingScreen.DefaultLogoUrl = "ardboyz.png";
const engine = new Engine(<HTMLCanvasElement>canvas, true, { stencil: true });
engine.displayLoadingUI();

const {scene, camera, next, previous} = createScene(engine);
const keyScenes: Scene[] = [];
keyScenes.push(createKeyScene(engine, camera, 'CommandBastion'));
keyScenes.push(createKeyScene(engine, camera, 'ShieldGenerator', {row:1, scale:0.8}));
keyScenes.push(createKeyScene(engine, camera, 'PowerStation', {row:2}));
keyScenes.push(createKeyScene(engine, camera, 'Manufactorum', {row:3, scale:0.8}));
keyScenes.push(createKeyScene(engine, camera, 'SpacePort', {row:4,scale:0.7}));
keyScenes.push(createKeyScene(engine, camera, 'hive', {row:5, scale:0.5}));


engine.runRenderLoop(() => {
  scene.render();
  keyScenes.forEach(x => x.render());
});

const nextButton = document.getElementById('next');
nextButton?.addEventListener('click', next);
const prevButton = document.getElementById('prev');
prevButton?.addEventListener('click', previous);

const bar = document.getElementById('bar');
if (bar) {
  while (bar.getBoundingClientRect().bottom > window.innerHeight) {
    canvas.height--;
  }
}