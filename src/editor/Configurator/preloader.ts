// 에디터 진입 전 무거운 자원 프리로드
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

// 자주 사용되는 GLB 파일들 (레그라박스 서랍 부품)
const GLB_FILES = [
  '/models/Legra_L400.glb',
  '/models/Legra_L500.glb',
  '/models/Legra_SL400.glb',
  '/models/Legra_SL500.glb',
  '/models/rail 295.glb',
];

// 자주 사용되는 텍스처
const TEXTURE_FILES = [
  '/materials/countertop/luna_shadow_hanwha.png',
  '/materials/countertop/luna_white_hanwha.png',
];

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// 캐시: 한 번 로드되면 다시 로드 안 함
const glbCache = new Map<string, any>();
const textureCache = new Map<string, THREE.Texture>();

export function preloadGLB(url: string): Promise<any> {
  if (glbCache.has(url)) return Promise.resolve(glbCache.get(url));
  return new Promise((resolve) => {
    gltfLoader.load(
      url,
      (gltf: any) => { glbCache.set(url, gltf); resolve(gltf); },
      undefined,
      () => resolve(null) // 에러도 무시 (선택적 프리로드)
    );
  });
}

export function preloadTexture(url: string): Promise<THREE.Texture | null> {
  if (textureCache.has(url)) return Promise.resolve(textureCache.get(url)!);
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (tex) => { textureCache.set(url, tex); resolve(tex); },
      undefined,
      () => resolve(null)
    );
  });
}

/** 에디터 진입 전 모든 자원 병렬 프리로드 (on progress callback) */
export async function preloadEditorAssets(
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const tasks: Promise<any>[] = [];
  const total = GLB_FILES.length + TEXTURE_FILES.length;
  let loaded = 0;

  const tick = () => {
    loaded++;
    onProgress?.(loaded, total);
  };

  for (const url of GLB_FILES) {
    tasks.push(preloadGLB(url).finally(tick));
  }
  for (const url of TEXTURE_FILES) {
    tasks.push(preloadTexture(url).finally(tick));
  }

  await Promise.all(tasks);
}

/** Configurator 청크 프리로드 (dynamic import 캐시 워밍) */
export function preloadConfiguratorChunk(): Promise<any> {
  return import('@/editor/Configurator');
}
