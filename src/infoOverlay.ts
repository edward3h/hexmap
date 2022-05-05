import { Vector2, Vector3 } from "@babylonjs/core";

type PositionFn = (position: Vector3) => Vector2;

interface Overlay {
    show: (position:Vector3, content:string) => void
    hide: () => void
    tick: () => void
}

let screenPosition: PositionFn;
const el = document.getElementById("overlay");
let parent: Vector3;
let last: Vector2 | null;
const show = (position:Vector3, content:string) => {
    if (el) {
        el.hidden = false;
        el.innerHTML = content;
        parent = position;
        last = null;
        tick();
    }
};

const hide = () => {
    if (el) el.hidden = true;
};

const tick = () => {
    if (el && !el.hidden && parent) {
        const origin = screenPosition(parent);
        if (!last || !origin.equalsWithEpsilon(last, 1)) {
            last = origin;
            el.style.top = `${last.y}px`;
            el.style.left = `${last.x}px`;
        }
    }
};

const overlay = (fn: PositionFn): Overlay => {
    screenPosition = fn;
    return {show, hide, tick};
}
export {
    overlay,
    Overlay,
    PositionFn,
}