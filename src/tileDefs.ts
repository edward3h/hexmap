
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
    options?: TileOptions
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
type TileOptions = {
    offset?: Vector3
    rotation?: Vector3
}

const color = (color:Color3) => (scene:Scene) => {
    const mat = new StandardMaterial("mat", scene);
    mat.diffuseColor = color;
    return mat;
};
const codexGrey = color(Color3.Gray());
const alienRed = color(new Color3(0.7, 0, 0.3));
const desertYellow = color(Color3.FromHexString('#cccc99'));
const verdantGreen = color(Color3.FromHexString('#339933'));
const lightGrey = color(Color3.White());


const _defineTile = (scene: Scene) => (name:string, filename:string, detailMaterial:(s:Scene) => Material, options?: TileOptions): Promise<TileDef> => {
    return SceneLoader.LoadAssetContainerAsync("objects/", filename, scene)
    .then(container => {
        const root = container.createRootMesh();
            root.rotation.x = -Math.PI / 2;
            if (options?.rotation) {
                const r = options.rotation;
                root.addRotation(r.x, r.y, r.z);
            }
            root.scaling = new Vector3(0.2, 0.2, 0.2);
        const ms = container.meshes;
        ms.forEach(m => m.material = detailMaterial(scene));
        ms[ms.length - 1].material = codexGrey(scene);
        return {name, root, options};
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
    if (tileDef.options?.offset) {
        m.position = m.position.add(tileDef.options.offset);
    }
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
        dt('alien', 'Alien_Creep01.obj', alienRed),
        // dt('astartes_base', 'Astartes_Base_v1.obj', codexGrey),
        dt('craggy1', 'Craggy_Lava01.obj', codexGrey),
        dt('craggy2', 'Craggy_Lava02.obj', codexGrey),
        dt('desert', 'Dessert01.obj', desertYellow),
        dt('hills', 'Foothills01.obj', verdantGreen),
        dt('guard_base', 'Imperial_Guard_Base.obj', codexGrey),
        dt('mountains1', 'Mountains02.obj', lightGrey),
        dt('mountains2', 'Mountains03.obj', lightGrey),
        dt('mountains3', 'Mountains04.obj', lightGrey),
        dt('plain', 'Plains01.obj', desertYellow),
        dt('plateau', 'Plateaus01.obj', desertYellow),
        dt('hive', 'hive.obj', codexGrey, {offset: new Vector3(-1,0,-0.1), rotation: new Vector3(0,0,Math.PI*21/128)}),
        dt('missile_silo', 'missile_silo.obj', codexGrey),
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