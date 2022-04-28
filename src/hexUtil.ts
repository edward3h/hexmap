import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const diameter = 12;

const tileCoordsTo3d = (col: number, row: number): Vector3 => {
    return new Vector3(
        col * diameter * Math.sin(Math.PI/3),
        0,
        row * diameter - col * diameter * Math.cos(Math.PI/3)
    );
};

const uniformScale = (scale:number): Vector3 => {
    return Vector3.One().scale(scale);
}

export { diameter, tileCoordsTo3d, uniformScale }