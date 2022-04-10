
import './style.css';
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
import '@babylonjs/loaders';

const rate = 60;
let counter = 0;

var createScene = function (engine: BABYLON.Engine) {
  const scene = new BABYLON.Scene(engine);

  const camera = new BABYLON.ArcRotateCamera("Camera", -3 * Math.PI / 4, Math.PI / 3, 50, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  
  const light = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(0, -1, 1), scene);
  light.position = new BABYLON.Vector3(0, 15, -30);
  light.diffuse = new BABYLON.Color3(1, 1, 1);
  light.specular = new BABYLON.Color3(0, 0, 0);

  const r = 12;
  const tr: BABYLON.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    tr.push(new BABYLON.Vector3(r * Math.sin(i * Math.PI / 3), 0, r * Math.cos(i * Math.PI / 3)));
  }
    
  const redmat = new BABYLON.StandardMaterial("redmat", scene);
  redmat.diffuseColor = new BABYLON.Color3(0.7, 0, 0.3);
  const greenmat = new BABYLON.StandardMaterial("greenmat", scene);
  // greenmat.diffuseColor = new BABYLON.Color3.Green();
  greenmat.diffuseTexture = new BABYLON.Texture("textures/grass.png", scene);
  const dirt = new BABYLON.StandardMaterial("dirt", scene);
  const ground = new BABYLON.Texture("textures/ground.jpg", scene);
  dirt.diffuseTexture = ground;

  const graymat = new BABYLON.StandardMaterial("graymat", scene);
  graymat.diffuseColor = BABYLON.Color3.Gray();


	// Skybox
	var skybox = BABYLON.MeshBuilder.CreateBox("skyBox", {size:150}, scene);
	var skyboxMaterial = new BABYLON.StandardMaterial("skyBox", scene);
	skyboxMaterial.backFaceCulling = false;
    var files = [
        "textures/Space/space_left.jpg",
        "textures/Space/space_up.jpg",
        "textures/Space/space_front.jpg",
        "textures/Space/space_right.jpg",
        "textures/Space/space_down.jpg",
        "textures/Space/space_back.jpg",
    ];
	skyboxMaterial.reflectionTexture = BABYLON.CubeTexture.CreateFromImages(files, scene);
	skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
	skyboxMaterial.disableLighting = true;
	skybox.material = skyboxMaterial;			

  const spriteManagerFist = new BABYLON.SpriteManager("fistManager", "yellow_fist.png", 40, {width: 450, height: 612}, scene);
  const fist = new BABYLON.Sprite("fist", spriteManagerFist);
  fist.width = 5;
  fist.height = 5 * 612 / 450;
  fist.position = new BABYLON.Vector3(0,fist.height/2+1,0);
  console.log(fist);

  scene.registerBeforeRender(() => {
    if (counter === 0) {
      fist.invertU = !fist.invertU;
    }
    fist.width = 5 * Math.sin(counter * Math.PI / rate);
    counter = (counter + 1) % rate;
  });

  const tileDefs = {
    plain: 'Plains01.obj',
    hills: 'Foothills01.obj',
    alien: 'Alien_Creep01.obj',
    mountain1: 'Mountains02.obj',
    mountain2: 'Mountains03.obj',
    mountain3: 'Mountains04.obj'
  };
  const tileP = [];
  interface TileMeshes {
    [index: string]: Array<BABYLON.Mesh>;
  }
  const tiles: TileMeshes = {};

  for (const [name, filename] of Object.entries(tileDefs)) {
    tileP.push(
      BABYLON.SceneLoader.ImportMeshAsync(null, "objects/", filename, scene)
      .then(({meshes}) => {
        tiles[name] = <Array<BABYLON.Mesh>>meshes;//I know best
        meshes.forEach(m => {
          m.rotation.x = -Math.PI / 2;
          m.scaling = new BABYLON.Vector3(0.2, 0.2, 0.2);
        });
        meshes[meshes.length -1].material = graymat;
      })
    );
  } 

  Promise.all(tileP)
  .then(() => {
    const hl = new BABYLON.HighlightLayer("hl", scene);
    tiles.hills.forEach(m => {
      m.position = tr[0];
    });
    tiles.hills[0].material = greenmat;
    tiles.alien.forEach(m => {
      m.position = tr[1];
    });
    tiles.alien[0].material = redmat;
    tiles.mountain1.forEach(m => {
      m.position = tr[2];
    });
    tiles.mountain2.forEach(m => {
      m.position = tr[3];
    });
    tiles.mountain3.forEach(m => {
      m.position = tr[4];
    });
    hl.addMesh(tiles.mountain3[2], BABYLON.Color3.Green());
    tiles.plain[0].material = dirt;
    tiles.plain.forEach(m => {
      const n = m.clone();
      n.position = tr[5];
    });

    engine.hideLoadingUI();
  });



  return scene;
};

const canvas = document.getElementById('app');
BABYLON.DefaultLoadingScreen.DefaultLogoUrl = "ardboyz.png";
const engine = new BABYLON.Engine(<HTMLCanvasElement>canvas, true, {stencil: true});
engine.displayLoadingUI();

const scene = createScene(engine);

engine.runRenderLoop(() => {
  scene.render();
});