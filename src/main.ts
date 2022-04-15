
import './style.css';
import '@babylonjs/loaders';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Vector3 } from '@babylonjs/core/Maths';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CubeTexture, Texture } from '@babylonjs/core/Materials/Textures';
import { MeshBuilder } from '@babylonjs/core/Meshes';
import { DefaultLoadingScreen } from '@babylonjs/core/Loading';
import '@babylonjs/core/Rendering/edgesRenderer';
import { loadTileFactory } from './tileDefs';
import { fetchMapData } from './sheetsMapData';
import { showMapIcons } from './teamSprites';

var createScene = function (engine: Engine) {
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera("Camera", -3 * Math.PI / 4, Math.PI / 3, 50, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);

  const light = new DirectionalLight("dir01", new Vector3(0, -1, 1), scene);
  light.position = new Vector3(0, 15, -30);
  light.diffuse = new Color3(1, 1, 1);
  light.specular = new Color3(0, 0, 0);

  // Skybox
  var skybox = MeshBuilder.CreateBox("skyBox", { size: 150 }, scene);
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

  Promise.all([
    loadTileFactory(scene),
    fetchMapData()
  ])
    .then(v => {
      const [createTile, mapData] = v;
      mapData.map.forEach(createTile);
      showMapIcons(scene, mapData);
      engine.hideLoadingUI();
    });

  return scene;
};

const canvas = document.getElementById('app');
DefaultLoadingScreen.DefaultLogoUrl = "ardboyz.png";
const engine = new Engine(<HTMLCanvasElement>canvas, true, { stencil: true });
engine.displayLoadingUI();

const scene = createScene(engine);

engine.runRenderLoop(() => {
  scene.render();
});