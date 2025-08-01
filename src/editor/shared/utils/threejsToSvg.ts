import * as THREE from 'three';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/store/core/furnitureStore';

interface ViewConfig {
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'top' | 'left' | 'right';
  renderMode: 'solid' | 'wireframe';
  showDimensions: boolean;
  showGuides: boolean;
  showAxis: boolean;
  showAll: boolean;
  spaceInfo: SpaceInfo;
  placedModules: PlacedModule[];
}

interface ViewportBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Three.js 씬을 SVG로 렌더링
 */
export const renderThreeSceneToSVG = (
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: ViewportBox
): string => {
  // SVG 렌더러 생성
  const renderer = new SVGRenderer();
  renderer.setSize(viewport.width, viewport.height);
  
  // 씬 렌더링
  renderer.render(scene, camera);
  
  // SVG 엘리먼트 가져오기
  const svgElement = renderer.domElement;
  
  // SVG 문자열로 변환
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  
  return svgString;
};

/**
 * 뷰어 캔버스에서 현재 씬을 SVG로 추출
 */
export const extractSVGFromCanvas = async (canvasElement: HTMLCanvasElement): Promise<string> => {
  try {
    // Three.js 컨텍스트 가져오기
    const gl = canvasElement.getContext('webgl2') || canvasElement.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL context not found');
    }

    // 현재 씬의 스냅샷을 SVG로 변환
    // 이 부분은 실제 구현이 매우 복잡하므로, 
    // 대신 고품질 래스터 이미지를 사용하는 것이 현실적입니다
    
    // 캔버스를 고품질로 캡처
    const dataUrl = canvasElement.toDataURL('image/png', 1.0);
    
    // SVG 이미지 엘리먼트로 래핑
    const svg = `
      <svg width="${canvasElement.width}" height="${canvasElement.height}" xmlns="http://www.w3.org/2000/svg">
        <image href="${dataUrl}" width="${canvasElement.width}" height="${canvasElement.height}"/>
      </svg>
    `;
    
    return svg;
  } catch (error) {
    console.error('Error extracting SVG from canvas:', error);
    throw error;
  }
};

/**
 * Three.js 씬을 직접 구성하여 SVG로 렌더링
 */
export const createSceneAndRenderToSVG = (config: ViewConfig, viewport: ViewportBox): string => {
  // 씬 생성
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  
  // 카메라 설정
  let camera: THREE.Camera;
  
  if (config.viewMode === '3D') {
    // 3D 뷰: 투시 카메라
    camera = new THREE.PerspectiveCamera(
      45,
      viewport.width / viewport.height,
      0.1,
      10000
    );
    camera.position.set(
      config.spaceInfo.width / 2,
      config.spaceInfo.height,
      config.spaceInfo.depth * 2
    );
    camera.lookAt(
      config.spaceInfo.width / 2,
      config.spaceInfo.height / 2,
      config.spaceInfo.depth / 2
    );
  } else {
    // 2D 뷰: 직교 카메라
    const aspect = viewport.width / viewport.height;
    const frustumSize = Math.max(config.spaceInfo.width, config.spaceInfo.height) * 1.2;
    
    camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      10000
    );
    
    // 뷰 방향에 따른 카메라 위치 설정
    switch (config.view2DDirection) {
      case 'front':
        camera.position.set(
          config.spaceInfo.width / 2,
          config.spaceInfo.height / 2,
          config.spaceInfo.depth * 2
        );
        camera.lookAt(
          config.spaceInfo.width / 2,
          config.spaceInfo.height / 2,
          0
        );
        break;
      case 'top':
        camera.position.set(
          config.spaceInfo.width / 2,
          config.spaceInfo.height * 2,
          config.spaceInfo.depth / 2
        );
        camera.lookAt(
          config.spaceInfo.width / 2,
          0,
          config.spaceInfo.depth / 2
        );
        camera.up.set(0, 0, -1);
        break;
      case 'left':
        camera.position.set(
          -config.spaceInfo.width,
          config.spaceInfo.height / 2,
          config.spaceInfo.depth / 2
        );
        camera.lookAt(
          config.spaceInfo.width / 2,
          config.spaceInfo.height / 2,
          config.spaceInfo.depth / 2
        );
        break;
      case 'right':
        camera.position.set(
          config.spaceInfo.width * 2,
          config.spaceInfo.height / 2,
          config.spaceInfo.depth / 2
        );
        camera.lookAt(
          config.spaceInfo.width / 2,
          config.spaceInfo.height / 2,
          config.spaceInfo.depth / 2
        );
        break;
    }
  }
  
  // 조명 추가
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(10, 10, 10);
  scene.add(directionalLight);
  
  // 공간 외곽선 그리기
  const spaceGeometry = new THREE.BoxGeometry(
    config.spaceInfo.width,
    config.spaceInfo.height,
    config.spaceInfo.depth
  );
  const spaceMaterial = new THREE.MeshBasicMaterial({
    color: 0xcccccc,
    wireframe: true,
    transparent: true,
    opacity: 0.3
  });
  const spaceMesh = new THREE.Mesh(spaceGeometry, spaceMaterial);
  spaceMesh.position.set(
    config.spaceInfo.width / 2,
    config.spaceInfo.height / 2,
    config.spaceInfo.depth / 2
  );
  scene.add(spaceMesh);
  
  // 가구 추가 (간단한 박스로 표현)
  config.placedModules.forEach(module => {
    const geometry = new THREE.BoxGeometry(400, 1800, 500); // 임시 크기
    const material = new THREE.MeshBasicMaterial({
      color: config.renderMode === 'wireframe' ? 0xff5500 : 0x007AFF,
      wireframe: config.renderMode === 'wireframe',
      transparent: config.renderMode === 'wireframe',
      opacity: config.renderMode === 'wireframe' ? 0.8 : 1.0
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    // 가구 위치 설정
    mesh.position.set(
      (config.spaceInfo.width / 2) + (module.position.x * 10),
      900, // 높이의 중앙
      config.spaceInfo.depth / 2
    );
    
    scene.add(mesh);
  });
  
  // SVG로 렌더링
  return renderThreeSceneToSVG(scene, camera, viewport);
};