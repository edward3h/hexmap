
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
import { tileCoordsTo3d, uniformScale } from './hexUtil';
import { ActionManager } from '@babylonjs/core/Actions/actionManager';
import { ExecuteCodeAction } from '@babylonjs/core/Actions/directActions';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

interface Tile {

}

interface ObjectDef {
    type: 'tile' | 'resource'
    name: string
    root: Mesh
    options?: TileOptions
}

interface TileDefs {
    [index:string]: ObjectDef
}
const tileDefs: TileDefs = {
};
const resourceDefs: TileDefs = {
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
    scaling?: Vector3
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
const shiny = (scene:Scene) => {
    const mat = new StandardMaterial("mat", scene);
    mat.diffuseColor = Color3.Green();
    mat.emissiveColor = Color3.Gray();
    return mat;
};


const _defineTile = (scene: Scene) => (name:string, filename:string, detailMaterial:(s:Scene) => Material, options?: TileOptions): Promise<ObjectDef> => {
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
        return {type: 'tile', name, root, options};
    });
};

const _defineResource = (scene: Scene) => (name:string, options?: TileOptions): Promise<ObjectDef> => {
    return SceneLoader.LoadAssetContainerAsync("objects/", `${name}.glb`, scene)
    .then(container => {
        const root = container.createRootMesh();
            // root.rotation.x = -Math.PI / 2;
            if (options?.rotation) {
                const r = options.rotation;
                root.addRotation(r.x, r.y, r.z);
            }
            root.scaling = options?.scaling || uniformScale(0.2);
        // const ms = container.meshes;
        // ms.forEach(m => m.material = shiny(scene));
        return {type: 'resource', name, root, options};
    });
};

const _createTile = (scene:Scene) => (data:TileData):Tile => {
    const [col, row, typeName, _, resourceName] = data;
    const tileDef = tileDefs[typeName];
    if (!tileDef) {
        throw `Tile ${typeName} not found`;
    }
    const m = tileDef.root.clone();
    const base = m.getChildMeshes().at(-1) || m;
    scene.addMesh(m);
    m.position = tileCoordsTo3d(col, row);
    if (tileDef.options?.offset) {
        m.position = m.position.add(tileDef.options.offset);
    }
    if (resourceName) {
        const resourceDef = resourceDefs[resourceName];
        if (resourceDef) {
            const resourceMesh = resourceDef.root.clone();
            resourceMesh.position = tileCoordsTo3d(col, row);
            if (resourceDef.options?.offset) {
                resourceMesh.position = resourceMesh.position.add(resourceDef.options.offset);
            }
            m.addChild(resourceMesh);
        }
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
    const dr = _defineResource(scene);
    return Promise.all([
        dt('alien', 'Alien_Creep01.obj', alienRed),
        dt('astartes_base', 'Astartes_Base_v1.obj', codexGrey),
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
        dr('CommandBastion', {rotation: new Vector3(0,Math.PI,0), offset: new Vector3(-2.1, 1, 4.1)}),
        dr('Manufactorum', {offset: new Vector3(0,1,-2)}),
        dr('PowerStation', {scaling: uniformScale(0.08), offset: new Vector3(-1.7,1,1)}),
        dr('ShieldGenerator', {scaling: uniformScale(0.11), offset: new Vector3(0,1,0)}),
        dr('SpacePort',{scaling: uniformScale(0.1), offset: new Vector3(-1,1,-1.9)}),
    ])
    .then(values => {
        values.forEach(tileDef => {
            const defs = tileDef.type === 'resource' ? resourceDefs : tileDefs;
            defs[tileDef.name] = tileDef;
        });
        return _createTile(scene);
    }); 
};

export {
    loadTileFactory,
    Tile,
};
