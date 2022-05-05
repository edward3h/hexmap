
import '@babylonjs/loaders';
import '@babylonjs/core/Rendering/edgesRenderer';
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { TileData } from './mapData';
import { diameter, tileCoordsTo3d } from './hexUtil';
import { ActionManager } from '@babylonjs/core/Actions/actionManager';
import { ExecuteCodeAction } from '@babylonjs/core/Actions/directActions';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import earcut from 'earcut';
import { MeshBuilder, PolygonMeshBuilder } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui';
import { resources } from './resourceMeshes';
import { Overlay } from './infoOverlay';
import { quotation } from './quotations';

interface Tile {
  baseMesh: AbstractMesh
  centre: Vector3
  content: string
}

let overlay: Overlay;

let highlighted: AbstractMesh | null;
const _tileClick = (tile: Tile) => {
  const baseMesh = tile.baseMesh;
    return () => {
        if (highlighted === baseMesh) {
            baseMesh.disableEdgesRendering();
            highlighted = null;
            if (overlay) overlay.hide();
            return;
        }
      highlighted && highlighted.disableEdgesRendering();
      if (highlighted !== baseMesh) {
        highlighted = baseMesh;
        highlighted.enableEdgesRendering();
        highlighted.edgesColor = new Color4(0, 1, 0, 1);
        highlighted.edgesWidth = 10;
        if (overlay) {
          overlay.show(tile.centre, tile.content);
        }
      }

    };
  }

  const _clearHighlight = () => {
    if (highlighted) {
      highlighted.disableEdgesRendering();
      highlighted = null;
    }
    if (overlay) overlay.hide();
  };

  const _content = (data:TileData) => {
    let lines = [
      `<h2>${data.locationName || data.coord}</h2>`
    ];
    if (data.resourceName) lines.push(`<div>Resource: ${data.resourceName}</div>`);
    if (data.team) lines.push(`<div>Controlled by <span class="${data.team}">${data.team}</span></div>`);
    if (data.terrainRules) lines.push(`<div>Terrain: <a target="_blank" href="${data.terrainRules.url}">${data.terrainRules.name}</a></div>`);

    if (lines.length == 1) lines.push(`<blockquote>${quotation(data.coord)}</blockquote>`)
    return lines.join("");
  };

type TileFactory = (d:TileData) => Tile

const color = (color:Color3|string) => (scene:Scene) => {
  let color3:Color3;
  if (typeof color === "string") {
    color3 = Color3.FromHexString(color);
  } else {
    color3 = color;
  }
    const mat = new StandardMaterial("mat", scene);
    mat.diffuseColor = color3;
    return mat;
};
const codexGrey = color(Color3.Gray());


const _simpleTile = (scene:Scene, colorOverride?:string, teamColor?:string) => {
const hexcorners = [];
const inner = [];
const d = (diameter / 2) / Math.cos(Math.PI / 6) - 0.2;
for (let i = 5; i >= 0; i--) {
    let angle = i * Math.PI / 3 + Math.PI / 6;
    hexcorners.push(new Vector2(d * Math.sin(angle), d * Math.cos(angle)));
    inner.push(new Vector2((d-1) * Math.sin(angle), (d-1) * Math.cos(angle)));
}
const builder = new PolygonMeshBuilder("simple", hexcorners, scene, earcut);
builder.addHole(inner);
const rim =  builder.build(false, 1);
rim.material = teamColor ? color(teamColor)(scene) : codexGrey(scene);
const innerBuilder = new PolygonMeshBuilder("inner", inner, scene, earcut);
const innerTile = innerBuilder.build(false, 0.5);
innerTile.parent = rim;
innerTile.position = new Vector3(0, -0.5, 0);
innerTile.material = color(colorOverride || "#cccc99")(scene);
return rim;
}

const _teamColor: Record<string, string> = {
  red: "#FF3333",
  yellow: "#FFFF33",
  blue: "#3333FF",
  green: "#33FF33",
};

const _createTile = (scene:Scene, resourceFactory:(name:string) => Mesh | undefined) => (data:TileData):Tile => {
    const {col, row, colorOverride, team, resourceName, planet, coord} = data;
    const m = _simpleTile(scene, colorOverride, team && _teamColor[team]);
    scene.addMesh(m);
    m.position = tileCoordsTo3d(col, row, planet);
    const p = MeshBuilder.CreatePlane("label", {width:3, height:2}, scene);
    p.position = m.position.add(new Vector3(3,0.1,-3));
    p.billboardMode = Mesh.BILLBOARDMODE_ALL;
    var t = AdvancedDynamicTexture.CreateForMesh(p, 180,70,false);
    var label = new TextBlock();
    label.text = coord ? `${coord}` : `${col},${row}`;
    label.color = "#a3e635";
    label.fontSize = 48;
    label.fontWeight = "bold";
    label.outlineWidth = 5;
    label.outlineColor = "black";
    t.addControl(label);

    if (resourceName) {
      const rm = resourceFactory(resourceName);
      if (rm) {
        rm.parent = m;
        rm.material = color("#44403c")(scene);
      }
    }

    const tile = {baseMesh: m, centre: m.position, content: _content(data) };

    m.actionManager = new ActionManager(scene);
    m.actionManager.registerAction(
        new ExecuteCodeAction(
        ActionManager.OnPickTrigger,
        _tileClick(tile)
        )
    );
    m.getChildMeshes().forEach(c => {
            c.actionManager = new ActionManager(scene);
                    c.actionManager.registerAction(
                      new ExecuteCodeAction(
                        ActionManager.OnPickTrigger,
                        _tileClick(tile)
                      )
                    );
                      });
    return tile;
}

const loadTileFactory = (scene: Scene, overlayIn: Overlay): Promise<TileFactory> => {
    overlay = overlayIn;
    return Promise.resolve(_createTile(scene, resources(scene)));
};

export {
    loadTileFactory,
    Tile,
    _clearHighlight as clearHighlight,
};
