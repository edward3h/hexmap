import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@babylonjs/core/Maths/math.vector', () => ({
  Vector3: class Vector3 {
    constructor(public x: number, public y: number, public z: number) {}
    scale(s: number) {
      return new Vector3(this.x * s, this.y * s, this.z * s);
    }
    static One() {
      return new Vector3(1, 1, 1);
    }
  },
}));

vi.mock('@babylonjs/core/Maths/math.color', () => ({
  Color3: class {
    static FromHexString(h: string) {
      return { hex: h };
    }
  },
}));

vi.mock('@babylonjs/core/Materials/standardMaterial', () => ({
  StandardMaterial: class {
    diffuseColor: unknown;
  },
}));

vi.mock('@babylonjs/core/scene', () => ({
  Scene: class {},
}));

let diameter: number;
let tileCoordsTo3d: (col: number, row: number) => { x: number; y: number; z: number };

beforeAll(async () => {
  const mod = await import('./hexUtil');
  diameter = mod.diameter;
  tileCoordsTo3d = mod.tileCoordsTo3d as unknown as typeof tileCoordsTo3d;
});

describe('diameter', () => {
  it('is 12', () => {
    expect(diameter).toBe(12);
  });
});

describe('tileCoordsTo3d', () => {
  it('places even columns at z = row * diameter', () => {
    const v = tileCoordsTo3d(0, 2);
    expect(v.y).toBe(0);
    expect(v.z).toBeCloseTo(2 * 12);
  });

  it('offsets odd columns by cos(PI/3) * diameter in z', () => {
    const v = tileCoordsTo3d(1, 0);
    const expectedZ = 0 - 12 * Math.cos(Math.PI / 3);
    expect(v.z).toBeCloseTo(expectedZ);
  });

  it('scales x by col * diameter * sin(PI/3)', () => {
    const v = tileCoordsTo3d(2, 0);
    expect(v.x).toBeCloseTo(2 * 12 * Math.sin(Math.PI / 3));
  });

  it('y is always 0', () => {
    expect(tileCoordsTo3d(3, 5).y).toBe(0);
    expect(tileCoordsTo3d(0, 0).y).toBe(0);
  });

  it('origin (0, 0) maps to (0, 0, 0)', () => {
    const v = tileCoordsTo3d(0, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBe(0);
    expect(v.z).toBeCloseTo(0);
  });
});
