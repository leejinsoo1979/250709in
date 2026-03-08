/**
 * 3D 가구 단독 섬네일 캡처
 * scene에서 해당 가구 group을 찾아 clone → offscreen renderer로 단독 렌더링
 */

import * as THREE from 'three';
import { sceneHolder } from '@/editor/shared/viewer3d/sceneHolder';

/**
 * scene에서 furnitureId로 가구 group 찾기
 */
function findFurnitureGroup(scene: THREE.Scene, furnitureId: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    if (obj.userData?.furnitureId === furnitureId) {
      found = obj;
    }
  });
  return found;
}

/**
 * 가구 group을 offscreen renderer에서 단독 렌더링하여 dataURL 반환
 */
export function captureFurnitureThumbnail(
  furnitureId: string,
  options: { width?: number; height?: number } = {},
): string | null {
  const scene = sceneHolder.getScene();
  if (!scene) {
    console.warn('[furnitureThumbnailCapture] scene 없음');
    return null;
  }

  const furnitureObj = findFurnitureGroup(scene, furnitureId);
  if (!furnitureObj) {
    console.warn('[furnitureThumbnailCapture] 가구를 찾을 수 없음:', furnitureId);
    return null;
  }

  const width = options.width || 300;
  const height = options.height || 400;

  // offscreen canvas + renderer
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0); // 투명 배경
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 별도 scene
    const thumbScene = new THREE.Scene();

    // 가구 clone
    const cloned = furnitureObj.clone(true);

    // 원래 world transform 제거 → 원점 중심으로
    cloned.position.set(0, 0, 0);
    cloned.rotation.set(0, 0, 0);
    cloned.updateMatrixWorld(true);

    thumbScene.add(cloned);

    // bounding box로 카메라 자동 맞춤
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim === 0) {
      console.warn('[furnitureThumbnailCapture] 가구 크기 0');
      return null;
    }

    // 가구를 중앙으로
    cloned.position.sub(center);

    // 카메라: 정면에서 약간 위에서 내려다보는 각도
    const fov = 35;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.01, 1000);
    const dist = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.3;
    camera.position.set(0, maxDim * 0.15, dist);
    camera.lookAt(0, 0, 0);

    // 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    thumbScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(dist * 0.5, dist * 0.8, dist);
    thumbScene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-dist * 0.3, dist * 0.2, -dist * 0.5);
    thumbScene.add(fillLight);

    // 렌더
    renderer.render(thumbScene, camera);

    const dataUrl = canvas.toDataURL('image/png');

    // 정리
    thumbScene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) {
        // clone된 geometry는 dispose하지 않음 (원본 공유)
      }
    });

    return dataUrl.length > 500 ? dataUrl : null;
  } catch (err) {
    console.error('[furnitureThumbnailCapture] 캡처 실패:', err);
    return null;
  } finally {
    if (renderer) {
      renderer.dispose();
    }
  }
}
