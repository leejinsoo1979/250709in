declare module 'three/examples/jsm/renderers/SVGRenderer' {
  import { Camera, Scene } from 'three';

  export class SVGRenderer {
    constructor();
    domElement: SVGElement;
    setSize(width: number, height: number): void;
    render(scene: Scene, camera: Camera): void;
    setClearColor(color: number, alpha?: number): void;
    setPixelRatio(value: number): void;
    clear(): void;
  }
}