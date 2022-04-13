
import '@babylonjs/loaders';
import '@babylonjs/core/Rendering/edgesRenderer';
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { TileData } from './mapData';
import { center } from './hexUtil';
import { ActionManager } from '@babylonjs/core/Actions/actionManager';
import { ExecuteCodeAction } from '@babylonjs/core/Actions/directActions';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

interface Tile {

}

interface TileDef {
    name: string
    root: Mesh
}

interface TileDefs {
    [index:string]: TileDef
}
const tileDefs: TileDefs = {
};

let highlighted: AbstractMesh;
const _tileClick = (baseMesh: AbstractMesh) => {
    return () => {
      highlighted && highlighted.disableEdgesRendering();
      if (highlighted !== baseMesh) {
        highlighted = baseMesh;
        highlighted.enableEdgesRendering();
        highlighted.edgesColor = new Color4(0, 1, 0, 1);
        highlighted.edgesWidth = 10;
      }

    };
  }


type TileFactory = (d:TileData) => Tile

const color = (color:Color3) => (scene:Scene) => {
    const mat = new StandardMaterial("mat", scene);
    mat.diffuseColor = color;
    return mat;
};
const codexGrey = color(Color3.Gray());
const alienRed = color(new Color3(0.7, 0, 0.3));
const desertYellow = color(new Color3(0.7,0.7,0));
const verdantGreen = color(new Color3(0.1,0.7,0.1));

const _defineTile = (scene: Scene) => (name:string, filename:string, detailMaterial:(s:Scene) => Material): Promise<TileDef> => {
    return SceneLoader.LoadAssetContainerAsync("objects/", filename, scene)
    .then(container => {
        const root = container.createRootMesh();
            root.rotation.x = -Math.PI / 2;
            root.scaling = new Vector3(0.2, 0.2, 0.2);
        const ms = container.meshes;
        ms.forEach(m => m.material = detailMaterial(scene));
        ms[ms.length - 1].material = codexGrey(scene);
        return {name, root};
    });
};

const _createTile = (scene:Scene) => (data:TileData):Tile => {
    const [col, row, typeName] = data;
    const tileDef = tileDefs[typeName];
    if (!tileDef) {
        throw `Tile ${typeName} not found`;
    }
    const m = tileDef.root.clone();
    const base = m.getChildMeshes().at(-1) || m;
    scene.addMesh(m);
    m.position = center(col, row);
    m.getChildMeshes().forEach(c => {
    c.actionManager = new ActionManager(scene);
            c.actionManager.registerAction(
              new ExecuteCodeAction(
                ActionManager.OnPickTrigger,
                _tileClick(base)
              )
            );
              });
    return {};
}

const loadTileFactory = (scene: Scene): Promise<TileFactory> => {
    const dt = _defineTile(scene);
    return Promise.all([
        dt("plain", "Plains01.obj", desertYellow),
        dt("alien", "Alien_Creep01.obj", alienRed),
        dt("hills", "Foothills01.obj", verdantGreen),
        // dt("hive", "hive_full.stl", codexGrey),
        dt("plateau", "Plateaus01.obj", desertYellow),
    ])
    .then(values => {
        values.forEach(tileDef => {
            tileDefs[tileDef.name] = tileDef;
        });
        return _createTile(scene);
    }); 
};

export {
    loadTileFactory,
    Tile,
};