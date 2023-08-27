import '@babylonjs/loaders';
import '@babylonjs/core/Rendering/edgesRenderer';

import { MeshBuilder, PolygonMeshBuilder } from '@babylonjs/core';
import { ActionManager } from '@babylonjs/core/Actions/actionManager';
import { ExecuteCodeAction } from '@babylonjs/core/Actions/directActions';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui';
import earcut from 'earcut';

import { color, diameter, tileCoordsTo3d } from './hexUtil';
import { Overlay } from './infoOverlay';
import { teamRef, TileData } from './mapData';
import { quotation } from './quotations';
import { displayResource, resources } from './resourceMeshes';

interface Tile {
  baseMesh: AbstractMesh;
  centre: Vector3;
  content: string;
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
};

const _clearHighlight = () => {
  if (highlighted) {
    highlighted.disableEdgesRendering();
    highlighted = null;
  }
  if (overlay) overlay.hide();
};

const _content = (data: TileData) => {
  const lines = [`<h2>${data.locationName || data.coord || 'Unknown'}</h2>`];
  if (data.resourceName)
    lines.push(`<div>Resource: ${displayResource(data.resourceName)}</div>`);
  if (data.team) {
    let displayName = data.team;
    if (teamRef[data.team] && teamRef[data.team].displayName) {
      displayName = teamRef[data.team].displayName;
    }
    lines.push(
      `<div>Controlled by <span class="${data.team}">${displayName}</span></div>`,
    );
  }
  if (data.terrainRules)
    lines.push(
      `<div>Terrain: <a target="_blank" href="${data.terrainRules.url}">${data.terrainRules.name}</a></div>`,
    );

  if (lines.length == 1) lines.push(`<blockquote>${quotation()}</blockquote>`);
  return lines.join('');
};

type TileFactory = (d: TileData) => Tile;

const codexGrey = color(Color3.Gray());

const _simpleTile = (scene: Scene, colorOverride?: string, teamColor?: string) => {
  const hexcorners = [];
  const inner = [];
  const d = diameter / 2 / Math.cos(Math.PI / 6) - 0.2;
  for (let i = 5; i >= 0; i--) {
    const angle = (i * Math.PI) / 3 + Math.PI / 6;
    hexcorners.push(new Vector2(d * Math.sin(angle), d * Math.cos(angle)));
    inner.push(new Vector2((d - 1) * Math.sin(angle), (d - 1) * Math.cos(angle)));
  }
  const builder = new PolygonMeshBuilder('simple', hexcorners, scene, earcut);
  builder.addHole(inner);
  const rim = builder.build(false, 1);
  rim.material = teamColor ? color(teamColor)(scene) : codexGrey(scene);
  const innerBuilder = new PolygonMeshBuilder('inner', inner, scene, earcut);
  const innerTile = innerBuilder.build(false, 0.5);
  innerTile.parent = rim;
  innerTile.position = new Vector3(0, -0.5, 0);
  innerTile.material = color(colorOverride || '#cccc99')(scene);
  return rim;
};

const _teamColor = (teamName: string | undefined) =>
  teamName && teamRef[teamName] && teamRef[teamName].color;

const _createTile =
  (scene: Scene, resourceFactory: (name: string) => Mesh | undefined) =>
  (data: TileData): Tile => {
    const { col, row, colorOverride, team, resourceName, coord } = data;

    const m = _simpleTile(scene, colorOverride, _teamColor(team));
    scene.addMesh(m);
    m.position = tileCoordsTo3d(col, row);
    const p = MeshBuilder.CreatePlane('label', { width: 3, height: 2 }, scene);
    p.position = m.position.add(new Vector3(3, 0.1, -3));
    p.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const t = AdvancedDynamicTexture.CreateForMesh(p, 180, 70, false);
    const label = new TextBlock();
    label.text = coord ? `${coord}` : `${col},${row}`;
    label.color = '#a3e635';
    label.fontSize = 48;
    label.fontWeight = 'bold';
    label.outlineWidth = 5;
    label.outlineColor = 'black';
    t.addControl(label);

    if (resourceName) {
      const rm = resourceFactory(resourceName);
      if (rm) {
        rm.parent = m;
        rm.material = color('#44403c')(scene);
      }
    }

    const tile = { baseMesh: m, centre: m.position, content: _content(data) };

    m.actionManager = new ActionManager(scene);
    m.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, _tileClick(tile)),
    );
    m.getChildMeshes().forEach((c) => {
      c.actionManager = new ActionManager(scene);
      c.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, _tileClick(tile)),
      );
    });
    return tile;
  };

const loadTileFactory = (scene: Scene, overlayIn: Overlay): Promise<TileFactory> => {
  overlay = overlayIn;
  return Promise.resolve(_createTile(scene, resources(scene)));
};

export { _clearHighlight as clearHighlight, loadTileFactory, Tile };
