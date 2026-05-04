/**
 * Three.js Scene → 패널별 그룹 JSON 직렬화
 *
 * SketchUp 루비 플러그인이 받아 Sketchup::Group + Sketchup::Layer로
 * 직접 생성할 수 있게 만든 데이터 구조.
 *
 * 좌표계 변환: Three.js Y-up → SketchUp Z-up
 *   (Three.js Y = SketchUp Z, Three.js -Z = SketchUp Y)
 *   = X축 기준 +90도 회전
 *
 * 단위: Three.js 내부단위 (1 = 100mm) → SketchUp mm로 변환
 *   Three.js 1unit = 100mm
 */

import * as THREE from 'three';

export interface PanelMesh {
  /** 정점 좌표 (mm 단위, [x1,y1,z1, x2,y2,z2, ...]) */
  vertices: number[];
  /** 삼각형 인덱스 (3개씩) */
  indices: number[];
  /** RGB 색상 0~255 */
  color: { r: number; g: number; b: number };
  /** 투명도 0~1 (1=불투명) */
  opacity: number;
}

export interface PanelGroup {
  /** SketchUp 그룹/태그 이름 (예: "좌측판", "도어") */
  name: string;
  /** 이 패널을 구성하는 메시들 */
  meshes: PanelMesh[];
}

export interface PanelExportPayload {
  /** 가구 디자인 이름 (선택) */
  designName?: string;
  /** 패널별 그룹 */
  groups: PanelGroup[];
  /** 정보가 없는 메시들 (이름 미부여) */
  unnamed: PanelMesh[];
}

// Three.js 1 unit = 100 mm (프로젝트 컨벤션)
const THREE_UNIT_TO_MM = 100;

// Y-up → Z-up 변환 매트릭스
const Y_UP_TO_Z_UP = new THREE.Matrix4().makeRotationX(Math.PI / 2);

/**
 * mesh 이름에서 prefix 정리 → 패널 이름 추출.
 * ColladaExporter.cleanPanelName과 동일 규칙.
 */
const cleanPanelName = (rawName: string | undefined | null): string | undefined => {
  if (!rawName || rawName.trim() === '') return undefined;
  let n = rawName.trim();
  n = n.replace(/^(furniture-mesh-|back-panel-mesh-)/, '');
  n = n.replace(/^(furniture-edge-|back-panel-edge-)/, '');
  if (n.endsWith('-mesh')) n = n.slice(0, -5);
  n = n.replace(/-\d+$/, '');
  return n.trim() || undefined;
};

/**
 * Three.js Object3D 트리를 패널 그룹 JSON으로 직렬화.
 */
export const sceneToPanelJSON = (
  root: THREE.Object3D,
  designName?: string
): PanelExportPayload => {
  root.updateMatrixWorld(true);

  const groupMap = new Map<string, PanelMesh[]>();
  const unnamed: PanelMesh[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry) return;

    const panelMesh = serializeMesh(mesh);
    if (!panelMesh) return;

    // mesh.name 또는 부모 그룹의 이름에서 패널 이름 추출
    let panelName: string | undefined = cleanPanelName(mesh.name);
    if (!panelName) {
      let cur: THREE.Object3D | null = mesh.parent;
      while (cur) {
        const c = cleanPanelName(cur.name);
        if (c && c !== 'FurnitureContainer' && c !== 'Scene') {
          panelName = c;
          break;
        }
        cur = cur.parent;
      }
    }

    if (panelName) {
      let arr = groupMap.get(panelName);
      if (!arr) {
        arr = [];
        groupMap.set(panelName, arr);
      }
      arr.push(panelMesh);
    } else {
      unnamed.push(panelMesh);
    }
  });

  // === 원점 이동: 가구의 좌측 하단(min x, min y, min z)을 (0,0,0)으로 ===
  // SketchUp 좌표(Z-up): X=좌우, Y=앞뒤(깊이), Z=위아래
  // 사용자가 임포트 시 가구의 좌측 하단 모서리가 원점에 오도록 모든 정점에서 min을 뺀다.
  let minX = Infinity, minY = Infinity, minZ = Infinity;

  const collectMin = (m: PanelMesh) => {
    for (let i = 0; i < m.vertices.length; i += 3) {
      if (m.vertices[i] < minX) minX = m.vertices[i];
      if (m.vertices[i + 1] < minY) minY = m.vertices[i + 1];
      if (m.vertices[i + 2] < minZ) minZ = m.vertices[i + 2];
    }
  };
  groupMap.forEach((meshes) => meshes.forEach(collectMin));
  unnamed.forEach(collectMin);

  if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(minZ)) {
    const shift = (m: PanelMesh) => {
      for (let i = 0; i < m.vertices.length; i += 3) {
        m.vertices[i] -= minX;
        m.vertices[i + 1] -= minY;
        m.vertices[i + 2] -= minZ;
      }
    };
    groupMap.forEach((meshes) => meshes.forEach(shift));
    unnamed.forEach(shift);
  }

  const groups: PanelGroup[] = Array.from(groupMap.entries()).map(([name, meshes]) => ({
    name,
    meshes,
  }));

  return { designName, groups, unnamed };
};

/**
 * 단일 mesh를 PanelMesh로 직렬화.
 * - world 좌표 + Y-up→Z-up 변환 + Three.js→mm 단위 변환
 * - 인덱스가 없으면 0,1,2,...로 생성
 * - non-indexed 면 quad는 단순 삼각화
 */
function serializeMesh(mesh: THREE.Mesh): PanelMesh | null {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return null;

  // world matrix + Y-up → Z-up 회전 + 단위 변환을 한 번에 적용
  const worldMatrix = new THREE.Matrix4()
    .multiplyMatrices(Y_UP_TO_Z_UP, mesh.matrixWorld);

  const vertices: number[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < positionAttr.count; i++) {
    tmp.set(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    );
    tmp.applyMatrix4(worldMatrix);
    // Three.js unit → mm 변환
    vertices.push(
      tmp.x * THREE_UNIT_TO_MM,
      tmp.y * THREE_UNIT_TO_MM,
      tmp.z * THREE_UNIT_TO_MM
    );
  }

  // 인덱스
  const indexAttr = geometry.getIndex();
  const indices: number[] = [];
  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i++) {
      indices.push(indexAttr.getX(i));
    }
  } else {
    // non-indexed: 0,1,2,3,4,5...를 그대로 삼각형으로 사용
    for (let i = 0; i < positionAttr.count; i++) {
      indices.push(i);
    }
  }

  // 재질 색상/투명도 추출
  let color = { r: 200, g: 200, b: 200 };
  let opacity = 1;

  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (mat) {
    const m = mat as THREE.Material & {
      color?: THREE.Color;
      opacity?: number;
      transparent?: boolean;
    };
    if (m.color) {
      color = {
        r: Math.round(m.color.r * 255),
        g: Math.round(m.color.g * 255),
        b: Math.round(m.color.b * 255),
      };
    }
    if (typeof m.opacity === 'number') {
      opacity = m.opacity;
    }
  }

  return {
    vertices,
    indices,
    color,
    opacity,
  };
}
