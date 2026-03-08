/**
 * 3D 가구 단독 섬네일 캡처
 * 메인 renderer의 RenderTarget을 사용하여 가구만 별도 scene에서 렌더링
 * (동일 WebGL context이므로 텍스처/material 공유 가능)
 */

import * as THREE from 'three';
import { sceneHolder } from '@/editor/shared/viewer3d/sceneHolder';

/**
 * scene에서 furnitureId로 가구 body group 찾기
 */
function findFurnitureBody(scene: THREE.Scene, furnitureId: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    // furniture-body (실제 가구 본체)를 우선 탐색
    if (obj.userData?.furnitureId === furnitureId && obj.userData?.type === 'furniture-body') {
      found = obj;
    }
  });
  // furniture-body 못 찾으면 최상위 group이라도
  if (!found) {
    scene.traverse((obj) => {
      if (found) return;
      if (obj.userData?.furnitureId === furnitureId) {
        found = obj;
      }
    });
  }
  return found;
}

/**
 * 메인 renderer의 RenderTarget으로 가구만 단독 렌더링하여 dataURL 반환
 */
export function captureFurnitureThumbnail(
  furnitureId: string,
  options: { width?: number; height?: number } = {},
): string | null {
  const scene = sceneHolder.getScene();
  const gl = sceneHolder.getRenderer();
  if (!scene || !gl) {
    console.warn('[furnitureThumbnail] scene 또는 renderer 없음');
    return null;
  }

  const furnitureObj = findFurnitureBody(scene, furnitureId);
  if (!furnitureObj) {
    console.warn('[furnitureThumbnail] 가구를 찾을 수 없음:', furnitureId);
    return null;
  }

  const width = options.width || 300;
  const height = options.height || 400;

  // RenderTarget 생성
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  try {
    // 가구의 world position/rotation 계산
    furnitureObj.updateWorldMatrix(true, true);
    const worldPos = new THREE.Vector3();
    furnitureObj.getWorldPosition(worldPos);

    // 별도 scene에 가구 clone 배치
    const thumbScene = new THREE.Scene();
    thumbScene.background = null; // 투명

    const cloned = furnitureObj.clone(true);
    // world transform을 원점 기준으로 재배치
    cloned.position.set(0, 0, 0);
    cloned.rotation.set(0, 0, 0);
    cloned.scale.copy(furnitureObj.scale);
    cloned.updateMatrixWorld(true);

    thumbScene.add(cloned);

    // bounding box 계산
    const box = new THREE.Box3().setFromObject(cloned);
    if (box.isEmpty()) {
      console.warn('[furnitureThumbnail] 가구 bounding box 비어있음');
      return null;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim < 0.001) {
      console.warn('[furnitureThumbnail] 가구 크기 너무 작음');
      return null;
    }

    // 가구를 중앙으로 이동
    cloned.position.sub(center);

    // 카메라: 정면에서 약간 위에서 내려다보는 앵글
    const fov = 30;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.01, 1000);
    const dist = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.4;
    camera.position.set(0, size.y * 0.1, dist);
    camera.lookAt(0, 0, 0);

    // 조명
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    thumbScene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(dist * 0.5, dist * 0.8, dist);
    thumbScene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-dist * 0.5, dist * 0.3, -dist * 0.3);
    thumbScene.add(fillLight);

    // 현재 renderer 상태 백업
    const prevRenderTarget = gl.getRenderTarget();
    const prevClearColor = new THREE.Color();
    gl.getClearColor(prevClearColor);
    const prevClearAlpha = gl.getClearAlpha();
    const prevAutoClear = gl.autoClear;

    // RenderTarget에 렌더링
    gl.setRenderTarget(renderTarget);
    gl.setClearColor(0xf5f5f5, 1); // 밝은 회색 배경
    gl.autoClear = true;
    gl.clear();
    gl.render(thumbScene, camera);

    // 픽셀 데이터 읽기
    const pixels = new Uint8Array(width * height * 4);
    gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

    // renderer 상태 복원
    gl.setRenderTarget(prevRenderTarget);
    gl.setClearColor(prevClearColor, prevClearAlpha);
    gl.autoClear = prevAutoClear;

    // 픽셀 데이터를 Canvas에 그려서 dataURL 생성
    // (WebGL은 Y축이 뒤집혀 있으므로 flip 필요)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(width, height);
    // Y축 뒤집기
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = ((height - 1 - y) * width + x) * 4;
        const dstIdx = (y * width + x) * 4;
        imageData.data[dstIdx] = pixels[srcIdx];
        imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
        imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
        imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    console.log('[furnitureThumbnail] 3D 캡처 성공, 크기:', (dataUrl.length / 1024).toFixed(1), 'KB');

    return dataUrl.length > 500 ? dataUrl : null;
  } catch (err) {
    console.error('[furnitureThumbnail] 캡처 실패:', err);
    return null;
  } finally {
    renderTarget.dispose();
  }
}
