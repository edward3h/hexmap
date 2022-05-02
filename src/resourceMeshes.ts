import { MeshBuilder, Nullable, Vector3 } from "@babylonjs/core";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";

const a150 = Math.PI * 5 / 6;
const v150 = new Vector3(Math.sin(a150), 0, Math.cos(a150));

const resources = (scene:Scene) => {

    const hive = MeshBuilder.CreateCylinder("hive", {diameterTop: 0, diameterBottom:7, height:9}, scene);
    hive.position.y += 4;
    hive.visibility = 0;

    const runway = MeshBuilder.CreateBox("runway", {depth:5, width:2, height:1}, scene);
    runway.addRotation(0,Math.PI/6,0);
    const runway2 = runway.clone();
    runway.position.addInPlace(new Vector3(2,0,0));
    runway2.position.addInPlace(new Vector3(-2,0,0));
    const port = Mesh.MergeMeshes([runway, runway2], true);
    if (port) port.visibility = 0;

    const command = MeshBuilder.CreateCylinder("command", {diameterTop:2, diameterBottom:3,tessellation:4}, scene);
    command.addRotation(0, -Math.PI/12, 0);
    command.position.addInPlace(new Vector3(0,1,0)).addInPlace(v150.scale(-2));
    command.visibility = 0;

    const shield = MeshBuilder.CreateCylinder("shield", {diameter:5, height:0.5}, scene);
    shield.position.addInPlace(new Vector3(0,0.5,0)).addInPlace(v150.scale(-2));
    shield.visibility = 0;

    const power1 = MeshBuilder.CreateCylinder("power", {height:0.6}, scene);
    power1.addRotation(Math.PI/2,0,0)
    const power2 = power1.clone();
    power2.position.addInPlace(new Vector3(0,0,1));
    const power3 = power1.clone();
    power3.position.addInPlace(new Vector3(0,0,-1));
    const power = Mesh.MergeMeshes([power1, power2, power3], true);
    power?.addRotation(0,Math.PI/6,0);
    power?.position.addInPlace(v150.scale(-2));
    if (power) power.visibility = 0;

    const manu = MeshBuilder.CreateBox("manu", {width:5,depth:3}, scene);
    manu.addRotation(0,Math.PI/2,0);
    manu.position.addInPlace(new Vector3(0,0.5,0)).addInPlace(v150.scale(-2));
    manu.visibility = 0;

    const names: Record<string,Nullable<Mesh>> = {
        hive: hive,
        SpacePort: port,
        CommandBastion: command,
        ShieldGenerator: shield,
        PowerStation: power,
        Manufactorum: manu,
    }
    const factory = (name:string): Mesh | undefined => {
        const m = names[name]?.clone();
        if (m) m.visibility = 1;
        return m;
    };
    return factory;
};


export {
    resources
}