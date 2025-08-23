declare module '*.glb';
declare module '*.gltf';
declare module '*.dxf';
declare module '*.obj';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.mp4';
declare module '*.webm';
declare module '*.css';
declare module 'dxf-writer';
declare module 'three-stdlib';
declare module 'three/examples/jsm/*';

// React JSX 속성 확장
declare namespace React {
  interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
    jsx?: boolean | string;
  }
}