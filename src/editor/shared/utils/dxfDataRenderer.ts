/**
 * 씬에서 렌더링된 모든 Line 객체를 추출하여 DXF 생성
 * Line, LineSegments, Line2 (drei), Mesh 엣지 등 모두 지원
 * 실제 색상과 텍스트도 추출
 */

import { DxfWriter, point3d } from '@tarikjabiri/dxf';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { sceneHolder } from '../viewer3d/sceneHolder';

export type ViewDirection = 'front' | 'left' | 'right' | 'top';

// 측면뷰 필터링 타입: 좌측뷰는 leftmost 가구만, 우측뷰는 rightmost 가구만
export type SideViewFilter = 'all' | 'leftmost' | 'rightmost';

interface DxfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  color: number; // DXF ACI color code
}

interface DxfText {
  x: number;
  y: number;
  text: string;
  height: number;
  color: number;
  layer: string;
}

/**
 * RGB 색상을 DXF ACI 색상 코드로 변환
 * DXF ACI: 1=빨강, 2=노랑, 3=초록, 4=시안, 5=파랑, 6=마젠타, 7=흰색/검정, 8=회색 등
 * 30=주황색 (2D 다크모드 가구 엣지)
 */
const rgbToAci = (r: number, g: number, b: number): number => {
  // 검정에 가까운 색 (2D 라이트 모드 치수선)
  if (r < 30 && g < 30 && b < 30) {
    return 7; // 흰색/검정 (배경에 따라 자동 조절)
  }

  // 흰색에 가까운 색 (2D 다크 모드 치수선)
  if (r > 225 && g > 225 && b > 225) {
    return 7; // 흰색/검정
  }

  // #FF4500 주황색 (2D 다크모드 가구 프레임) - RGB(255, 69, 0)
  if (r > 240 && g > 50 && g < 90 && b < 20) {
    return 30; // ACI 30 = 주황색
  }

  // #444444 어두운 회색 (2D 라이트모드 가구 프레임) - RGB(68, 68, 68)
  if (r > 60 && r < 80 && g > 60 && g < 80 && b > 60 && b < 80) {
    return 8; // ACI 8 = 회색
  }

  // #808080 회색 (조절발 2D 라이트모드) - RGB(128, 128, 128)
  if (r > 120 && r < 140 && g > 120 && g < 140 && b > 120 && b < 140) {
    return 9; // ACI 9 = 밝은 회색
  }

  // 회색 계열
  if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20) {
    if (r < 80) return 250; // 어두운 회색
    if (r < 130) return 8; // 중간 회색
    if (r < 180) return 9; // 밝은 회색
    return 7;
  }

  // 빨강 계열
  if (r > 150 && g < 100 && b < 100) return 1;

  // 노랑 계열
  if (r > 200 && g > 200 && b < 100) return 2;

  // 초록 계열 (형광 녹색 #18CF23 포함)
  if (g > 150 && r < 100 && b < 100) return 3;
  if (r < 50 && g > 180 && b < 80) return 3; // #18CF23

  // 시안 계열
  if (g > 150 && b > 150 && r < 100) return 4;

  // 파랑 계열
  if (b > 150 && r < 100 && g < 100) return 5;

  // 마젠타 계열 (#FF00FF)
  if (r > 200 && b > 200 && g < 50) return 6;
  if (r > 150 && b > 150 && g < 100) return 6;

  // 기본값
  return 7;
};

/**
 * Three.js 색상에서 DXF ACI 코드 추출
 * LineMaterial (drei Line), LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial 등 모든 타입 지원
 */
const getColorFromMaterial = (material: THREE.Material | THREE.Material[] | undefined): number => {
  if (!material) return 7;

  const mat = Array.isArray(material) ? material[0] : material;
  if (!mat) return 7;

  // 1. LineMaterial (drei의 Line 컴포넌트에서 사용) - ShaderMaterial 기반
  if ((mat as any).isLineMaterial) {
    const lineMat = mat as any;
    if (lineMat.color) {
      const color = lineMat.color as THREE.Color;
      return rgbToAci(
        Math.round(color.r * 255),
        Math.round(color.g * 255),
        Math.round(color.b * 255)
      );
    }
  }

  // 2. ShaderMaterial - uniforms에서 색상 추출
  if ((mat as THREE.ShaderMaterial).uniforms) {
    const uniforms = (mat as THREE.ShaderMaterial).uniforms;
    if (uniforms.diffuse?.value) {
      const color = uniforms.diffuse.value as THREE.Color;
      return rgbToAci(
        Math.round(color.r * 255),
        Math.round(color.g * 255),
        Math.round(color.b * 255)
      );
    }
    if (uniforms.color?.value) {
      const color = uniforms.color.value as THREE.Color;
      return rgbToAci(
        Math.round(color.r * 255),
        Math.round(color.g * 255),
        Math.round(color.b * 255)
      );
    }
  }

  // 3. LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial 등 - color 속성
  if ('color' in mat) {
    const color = (mat as THREE.LineBasicMaterial | THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).color;
    if (color) {
      return rgbToAci(
        Math.round(color.r * 255),
        Math.round(color.g * 255),
        Math.round(color.b * 255)
      );
    }
  }

  return 7;
};

/**
 * 뷰 방향에 따라 3D 좌표를 2D DXF 좌표로 변환
 * - front: (x, y) 사용 (정면에서 볼 때)
 * - top: (x, z) 사용 (위에서 볼 때, z를 y로)
 * - left/right: (z, y) 사용 (측면에서 볼 때, z를 x로)
 */
let currentViewDirection: ViewDirection = 'front';

const projectTo2D = (p: THREE.Vector3, scale: number): { x: number; y: number } => {
  switch (currentViewDirection) {
    case 'front':
      return { x: p.x * scale, y: p.y * scale };
    case 'top':
      return { x: p.x * scale, y: -p.z * scale }; // z축을 y로, 뒤집어서
    case 'left':
      return { x: -p.z * scale, y: p.y * scale }; // z축을 x로 (왼쪽에서 보면 z가 오른쪽)
    case 'right':
      return { x: p.z * scale, y: p.y * scale }; // z축을 x로
    default:
      return { x: p.x * scale, y: p.y * scale };
  }
};

/**
 * 뷰 방향에 따라 라인이 보이는지 확인
 * 뷰 평면에 수직인 엣지는 점으로 투영되므로 제외
 * 또한 뷰 방향 축을 따라 멀리 있는 엣지는 가려지므로 일부 제외
 */
const isLineVisibleInView = (p1: THREE.Vector3, p2: THREE.Vector3): boolean => {
  const threshold = 0.001; // 1mm / 1000 = 0.001 Three.js units

  switch (currentViewDirection) {
    case 'front':
      // 정면뷰: z축 방향 엣지 제외 (점으로 투영됨)
      // x, y 좌표가 거의 같으면 z방향 엣지
      if (Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.y - p2.y) < threshold) {
        return false;
      }
      return true;

    case 'top':
      // 탑뷰: y축 방향 엣지 제외
      if (Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.z - p2.z) < threshold) {
        return false;
      }
      return true;

    case 'left':
    case 'right':
      // 측면뷰: x축 방향 엣지 제외
      if (Math.abs(p1.z - p2.z) < threshold && Math.abs(p1.y - p2.y) < threshold) {
        return false;
      }
      return true;

    default:
      return true;
  }
};

/**
 * 뷰 방향에 따라 엣지가 "앞쪽"에 있는지 확인
 * 가려진 뒷면 엣지를 제외하기 위해 사용
 */
const isEdgeInFrontHalf = (p1: THREE.Vector3, p2: THREE.Vector3, threshold: number): boolean => {
  switch (currentViewDirection) {
    case 'front':
      // 정면뷰: z값이 양수(앞쪽)인 엣지만 포함
      // threshold 이내면 포함 (평면에 있는 엣지도 포함)
      return p1.z >= -threshold || p2.z >= -threshold;

    case 'top':
      // 탑뷰: y값이 양수(위쪽)인 엣지
      return p1.y >= -threshold || p2.y >= -threshold;

    case 'left':
      // 왼쪽뷰: x값이 음수(왼쪽)인 엣지
      return p1.x <= threshold || p2.x <= threshold;

    case 'right':
      // 오른쪽뷰: x값이 양수(오른쪽)인 엣지
      return p1.x >= -threshold || p2.x >= -threshold;

    default:
      return true;
  }
};

/**
 * Line2/LineSegments2 (drei의 Line 컴포넌트)에서 좌표 추출
 * Line2는 instanceStart, instanceEnd 속성을 사용 (InterleavedBufferAttribute)
 * 뷰 방향에 따라 보이지 않는 엣지는 필터링
 */
const extractFromLine2 = (
  object: THREE.Object3D,
  matrix: THREE.Matrix4,
  scale: number,
  layer: string,
  color: number
): DxfLine[] => {
  const lines: DxfLine[] = [];
  const geometry = (object as THREE.Mesh).geometry;

  if (!geometry) {
    return lines;
  }

  // Line2/LineSegments2 geometry uses instanceStart and instanceEnd attributes
  const instanceStart = geometry.getAttribute('instanceStart');
  const instanceEnd = geometry.getAttribute('instanceEnd');

  if (instanceStart && instanceEnd) {
    let filteredCount = 0;

    // Line2 with instance attributes (InterleavedBufferAttribute)
    for (let i = 0; i < instanceStart.count; i++) {
      const p1 = new THREE.Vector3(
        instanceStart.getX(i),
        instanceStart.getY(i),
        instanceStart.getZ(i)
      ).applyMatrix4(matrix);

      const p2 = new THREE.Vector3(
        instanceEnd.getX(i),
        instanceEnd.getY(i),
        instanceEnd.getZ(i)
      ).applyMatrix4(matrix);

      // 뷰 방향에 수직인 엣지 필터링 (점으로 투영됨)
      if (!isLineVisibleInView(p1, p2)) {
        filteredCount++;
        continue;
      }

      const proj1 = projectTo2D(p1, scale);
      const proj2 = projectTo2D(p2, scale);

      // 투영 후 너무 짧은 라인 필터링 (1mm 미만)
      const length = Math.sqrt(
        Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
      );
      if (length < 1) {
        filteredCount++;
        continue;
      }

      lines.push({
        x1: proj1.x,
        y1: proj1.y,
        x2: proj2.x,
        y2: proj2.y,
        layer,
        color
      });
    }

    if (filteredCount > 0) {
      console.log(`  ↳ Line2 ${filteredCount}개 엣지 필터링됨 (뷰 방향 또는 길이)`);
    }
  } else {
    // Fallback: drei Line이 instanceStart 없이 position 속성만 가진 경우
    const positionAttr = geometry.getAttribute('position');
    if (positionAttr && positionAttr.count >= 2) {
      let filteredCount = 0;

      // 연결된 라인으로 처리 (Line)
      for (let i = 0; i < positionAttr.count - 1; i++) {
        const p1 = new THREE.Vector3(
          positionAttr.getX(i),
          positionAttr.getY(i),
          positionAttr.getZ(i)
        ).applyMatrix4(matrix);

        const p2 = new THREE.Vector3(
          positionAttr.getX(i + 1),
          positionAttr.getY(i + 1),
          positionAttr.getZ(i + 1)
        ).applyMatrix4(matrix);

        if (!isLineVisibleInView(p1, p2)) {
          filteredCount++;
          continue;
        }

        const proj1 = projectTo2D(p1, scale);
        const proj2 = projectTo2D(p2, scale);

        const length = Math.sqrt(
          Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
        );
        if (length < 1) {
          filteredCount++;
          continue;
        }

        lines.push({
          x1: proj1.x,
          y1: proj1.y,
          x2: proj2.x,
          y2: proj2.y,
          layer,
          color
        });
      }

      if (filteredCount > 0) {
        console.log(`  ↳ Line2 (position fallback) ${filteredCount}개 엣지 필터링됨`);
      }
    }
  }

  return lines;
};

/**
 * LineSegments에서 좌표 추출 (EdgesGeometry 포함)
 * 뷰 방향에 따라 보이지 않는 엣지는 필터링
 * 뒤쪽 엣지도 필터링하여 2D CAD 스타일 유지
 *
 * @param skipBackFiltering - true면 뒤쪽 엣지 필터링 건너뜀 (프레임 엣지용)
 */
const extractFromLineSegments = (
  object: THREE.LineSegments,
  matrix: THREE.Matrix4,
  scale: number,
  layer: string,
  color: number,
  skipBackFiltering: boolean = false
): DxfLine[] => {
  const lines: DxfLine[] = [];
  const geometry = object.geometry;

  if (!geometry) return lines;

  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return lines;

  let filteredCount = 0;

  // 먼저 모든 엣지의 z값 범위를 계산해서 앞쪽/뒤쪽 판단 기준 설정
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positionAttr.count; i++) {
    const p = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    ).applyMatrix4(matrix);

    if (currentViewDirection === 'front') {
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    } else if (currentViewDirection === 'top') {
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    } else if (currentViewDirection === 'left' || currentViewDirection === 'right') {
      minZ = Math.min(minZ, p.x);
      maxZ = Math.max(maxZ, p.x);
    }
  }

  // 앞쪽 판단 기준 - 앞쪽 10%만 필터링 (뒤쪽 90% 제외)
  // 프레임 엣지가 누락되지 않도록 threshold를 더 낮춤
  const frontThreshold = minZ + (maxZ - minZ) * 0.1;

  // LineSegments: pairs of vertices
  for (let i = 0; i < positionAttr.count; i += 2) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    ).applyMatrix4(matrix);

    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    ).applyMatrix4(matrix);

    // 뷰 방향에 수직인 엣지 필터링 (점으로 투영됨)
    if (!isLineVisibleInView(p1, p2)) {
      filteredCount++;
      continue;
    }

    // 뒤쪽 엣지 필터링 (앞쪽 면의 엣지만 포함)
    // 주의: 범위가 너무 작은 경우 (평면 객체 등) 필터링 안함
    // skipBackFiltering이 true면 이 필터링을 건너뜀 (프레임 엣지용)
    if (!skipBackFiltering) {
      const range = maxZ - minZ;
      if (range > 0.01) { // 1mm 이상 깊이가 있는 경우에만 필터링
        let edgeZ: number;
        if (currentViewDirection === 'front') {
          edgeZ = Math.max(p1.z, p2.z);
        } else if (currentViewDirection === 'top') {
          edgeZ = Math.max(p1.y, p2.y);
        } else {
          edgeZ = currentViewDirection === 'right' ? Math.max(p1.x, p2.x) : Math.min(p1.x, p2.x);
        }

        if (edgeZ < frontThreshold) {
          filteredCount++;
          continue;
        }
      }
    }

    const proj1 = projectTo2D(p1, scale);
    const proj2 = projectTo2D(p2, scale);

    // 투영 후 너무 짧은 라인 필터링 (1mm 미만)
    const length = Math.sqrt(
      Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
    );
    if (length < 1) {
      filteredCount++;
      continue;
    }

    lines.push({
      x1: proj1.x,
      y1: proj1.y,
      x2: proj2.x,
      y2: proj2.y,
      layer,
      color
    });
  }

  if (filteredCount > 0) {
    console.log(`  ↳ ${filteredCount}개 엣지 필터링됨 (뷰 방향/뒤쪽/길이)`);
  }

  return lines;
};

/**
 * 일반 Line에서 좌표 추출
 * 뷰 방향에 따라 보이지 않는 엣지는 필터링
 */
const extractFromLine = (
  object: THREE.Line,
  matrix: THREE.Matrix4,
  scale: number,
  layer: string,
  color: number
): DxfLine[] => {
  const lines: DxfLine[] = [];
  const geometry = object.geometry;

  if (!geometry) return lines;

  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return lines;

  let filteredCount = 0;

  // Line: connected vertices
  for (let i = 0; i < positionAttr.count - 1; i++) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    ).applyMatrix4(matrix);

    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    ).applyMatrix4(matrix);

    // 뷰 방향에 수직인 엣지 필터링 (점으로 투영됨)
    if (!isLineVisibleInView(p1, p2)) {
      filteredCount++;
      continue;
    }

    const proj1 = projectTo2D(p1, scale);
    const proj2 = projectTo2D(p2, scale);

    // 투영 후 너무 짧은 라인 필터링 (1mm 미만)
    const length = Math.sqrt(
      Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
    );
    if (length < 1) {
      filteredCount++;
      continue;
    }

    lines.push({
      x1: proj1.x,
      y1: proj1.y,
      x2: proj2.x,
      y2: proj2.y,
      layer,
      color
    });
  }

  if (filteredCount > 0) {
    console.log(`  ↳ Line ${filteredCount}개 엣지 필터링됨 (뷰 방향 또는 길이)`);
  }

  return lines;
};

/**
 * 객체 이름으로 제외 여부 판단
 * 그리드, 슬롯 드롭존, 캔버스 외곽선 등 DXF에 포함되지 않아야 할 요소 필터링
 */
const shouldExclude = (name: string): boolean => {
  const lowerName = name.toLowerCase();
  return (
    // 기본 헬퍼/디버그 요소
    lowerName.includes('grid') ||
    lowerName.includes('helper') ||
    lowerName.includes('axes') ||
    lowerName.includes('gizmo') ||
    lowerName.includes('debug') ||
    lowerName.includes('camera') ||
    lowerName.includes('light') ||
    // 슬롯 드롭존 및 마커
    lowerName.includes('slot') ||
    lowerName.includes('drop') ||
    lowerName.includes('marker') ||
    lowerName.includes('zone') ||
    // 캔버스/외곽선 관련
    lowerName.includes('canvas') ||
    lowerName.includes('outline') ||
    lowerName.includes('boundary') ||
    lowerName.includes('border') ||
    // 배경/바닥 관련 (프레임과 혼동 방지)
    lowerName.includes('floor') ||
    lowerName.includes('background')
    // 치수선은 씬에서 추출함 (dimension_line)
  );
};

/**
 * 객체 이름으로 레이어 결정
 * DXF 레이어 분리:
 * - DIMENSIONS: 치수선
 * - SPACE_FRAME: 공간 프레임 (좌우상하 프레임)
 * - FURNITURE_PANEL: 가구 패널 (좌측판, 우측판, 상판, 하판, 선반 등)
 * - BACK_PANEL: 백패널
 * - CLOTHING_ROD: 옷봉
 * - ACCESSORIES: 조절발, 환기탭 등
 * - END_PANEL: 엔드패널
 */
const determineLayer = (name: string): string => {
  const lowerName = name.toLowerCase();

  // 치수선
  if (lowerName.includes('dimension')) {
    return 'DIMENSIONS';
  }

  // 공간 프레임 (Room.tsx의 space-frame)
  if (lowerName.includes('space-frame') || lowerName.includes('space_frame')) {
    return 'SPACE_FRAME';
  }

  // 백패널
  if (lowerName.includes('back-panel') || lowerName.includes('backpanel') || lowerName.includes('백패널')) {
    return 'BACK_PANEL';
  }

  // 옷봉
  if (lowerName.includes('clothing-rod') || lowerName.includes('clothingrod') || lowerName.includes('옷봉')) {
    return 'CLOTHING_ROD';
  }

  // 환기캡 - 마젠타 (ACI 6) - 조절발보다 먼저 체크
  if (lowerName.includes('ventilation') || lowerName.includes('환기')) {
    return 'VENTILATION';
  }

  // 조절발 - 회색 (ACI 8)
  if (lowerName.includes('adjustable-foot') || lowerName.includes('조절발')) {
    return 'ACCESSORIES';
  }

  // 엔드패널
  if (lowerName.includes('end-panel') || lowerName.includes('endpanel') || lowerName.includes('엔드패널')) {
    return 'END_PANEL';
  }

  // 가구 패널 (furniture-edge 이름을 가진 것들)
  if (lowerName.includes('furniture-edge') || lowerName.includes('furniture_edge')) {
    return 'FURNITURE_PANEL';
  }

  // 기타 가구 관련
  if (lowerName.includes('furniture') || lowerName.includes('shelf') || lowerName.includes('선반') ||
      lowerName.includes('panel') || lowerName.includes('패널')) {
    return 'FURNITURE_PANEL';
  }

  // 공간/방 관련 (space-frame 이외)
  if (lowerName.includes('space') || lowerName.includes('room') || lowerName.includes('wall')) {
    return 'SPACE_FRAME';
  }

  // 기본값
  return 'FURNITURE_PANEL';
};

/**
 * 씬에서 모든 Line 객체와 텍스트 추출
 */
interface ExtractedData {
  lines: DxfLine[];
  texts: DxfText[];
}

/**
 * 객체 또는 부모로부터 색상 추출 (userData에서 색상 정보 확인)
 */
const getColorFromObjectHierarchy = (object: THREE.Object3D): number | null => {
  let current: THREE.Object3D | null = object;
  while (current) {
    // userData에서 색상 확인 (drei 등 일부 라이브러리에서 사용)
    if ((current as any).userData?.color) {
      const colorVal = (current as any).userData.color;
      if (typeof colorVal === 'string') {
        const parsed = new THREE.Color(colorVal);
        return rgbToAci(
          Math.round(parsed.r * 255),
          Math.round(parsed.g * 255),
          Math.round(parsed.b * 255)
        );
      }
    }
    current = current.parent;
  }
  return null;
};

/**
 * 씬에서 모든 Line 객체와 텍스트 추출
 * @param allowedXRange 측면뷰에서 허용되는 X 위치 범위 (null이면 필터링 안함)
 */
const extractFromScene = (
  scene: THREE.Scene,
  viewDirection: ViewDirection,
  allowedXRange: { min: number; max: number } | null = null
): ExtractedData => {
  const lines: DxfLine[] = [];
  const texts: DxfText[] = [];
  const scale = 100; // 1 Three.js unit = 100mm

  // 뷰 방향 설정 (projectTo2D에서 사용)
  currentViewDirection = viewDirection;

  console.log(`🔍 씬에서 Line/Text 객체 추출 시작 (뷰 방향: ${viewDirection})...`);
  if (allowedXRange) {
    console.log(`📐 X 위치 필터링 활성화: ${allowedXRange.min.toFixed(3)} ~ ${allowedXRange.max.toFixed(3)}`);
  }

  let lineObjects = 0;
  let line2Objects = 0;
  let lineSegmentsObjects = 0;
  let textObjects = 0;
  let meshObjects = 0;
  let skippedByVisibility = 0;
  let skippedByFilter = 0;

  // 디버그: scene의 모든 객체 타입 수집
  const objectTypeCount: Record<string, number> = {};
  const edgeObjectNames: string[] = [];
  const dimensionObjectNames: string[] = [];

  // Store meshes for potential edge extraction if no lines are found
  const meshesForEdges: { mesh: THREE.Mesh; matrix: THREE.Matrix4; layer: string; color: number }[] = [];

  // 첫 번째 pass: 디버그 정보 수집
  scene.traverse((object) => {
    const typeName = object.type || object.constructor.name;
    objectTypeCount[typeName] = (objectTypeCount[typeName] || 0) + 1;

    const name = object.name || '';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('edge') || lowerName.includes('furniture') || lowerName.includes('frame')) {
      edgeObjectNames.push(`${typeName}: ${name}`);
    }
    if (lowerName.includes('dimension')) {
      dimensionObjectNames.push(`${typeName}: ${name}`);
    }
  });

  console.log('📊 씬 객체 타입 통계:', objectTypeCount);
  console.log('📊 씬 총 객체 수:', Object.values(objectTypeCount).reduce((a, b) => a + b, 0));
  if (edgeObjectNames.length > 0) {
    console.log('🔍 엣지/프레임/가구 관련 객체 총', edgeObjectNames.length, '개:', edgeObjectNames.slice(0, 30));
  } else {
    console.warn('⚠️ 엣지/프레임/가구 관련 객체가 없습니다! 씬에 LineSegments가 렌더링되지 않았을 수 있습니다.');
  }
  if (dimensionObjectNames.length > 0) {
    console.log('📏 치수선 관련 객체:', dimensionObjectNames);
  }

  // 두 번째 pass: 실제 추출
  scene.traverse((object) => {
    // Skip invisible objects
    if (!object.visible) {
      skippedByVisibility++;
      return;
    }

    const name = object.name || '';
    if (shouldExclude(name)) {
      skippedByFilter++;
      return;
    }

    const lowerNameForFilter = name.toLowerCase();

    // 탑뷰에서 조절발 제외 (조절발은 바닥 아래에 있어서 탑뷰에서 보이면 안됨)
    if (viewDirection === 'top') {
      if (lowerNameForFilter.includes('adjustable-foot') || lowerNameForFilter.includes('조절발')) {
        console.log(`📐 탑뷰: 조절발 제외 - ${name}`);
        return;
      }
    }

    // Update world matrix
    object.updateMatrixWorld(true);
    const matrix = object.matrixWorld;
    const layer = determineLayer(name);

    // 측면뷰에서 가구 X 위치 필터링 (allowedXRange가 있으면 해당 범위의 가구만 포함)
    // 공간 프레임, 치수선은 필터링 제외 (항상 포함)
    if (allowedXRange &&
        (viewDirection === 'left' || viewDirection === 'right') &&
        layer !== 'SPACE_FRAME' &&
        layer !== 'DIMENSIONS') {

      // 가구 관련 객체인 경우에만 X 위치 필터링 적용
      const isFurnitureObject = lowerNameForFilter.includes('furniture') ||
                                lowerNameForFilter.includes('shelf') ||
                                lowerNameForFilter.includes('panel') ||
                                lowerNameForFilter.includes('back-panel') ||
                                lowerNameForFilter.includes('clothing-rod') ||
                                lowerNameForFilter.includes('adjustable-foot') ||
                                lowerNameForFilter.includes('ventilation') ||
                                lowerNameForFilter.includes('선반') ||
                                lowerNameForFilter.includes('패널') ||
                                lowerNameForFilter.includes('옷봉') ||
                                lowerNameForFilter.includes('조절발') ||
                                lowerNameForFilter.includes('환기');

      if (isFurnitureObject) {
        // 객체의 월드 X 위치 확인
        const worldPos = new THREE.Vector3();
        object.getWorldPosition(worldPos);

        // 허용된 X 범위 밖이면 제외
        if (worldPos.x < allowedXRange.min || worldPos.x > allowedXRange.max) {
          // console.log(`📐 측면뷰 X 필터: ${name} 제외 (X=${worldPos.x.toFixed(3)}, 허용범위: ${allowedXRange.min.toFixed(3)}~${allowedXRange.max.toFixed(3)})`);
          return;
        }
      }
    }

    // 디버그: 레이어 분류 로깅
    if (name && (name.includes('furniture') || name.includes('adjustable') || name.includes('ventilation'))) {
      console.log(`🏷️ 레이어 분류: "${name}" → ${layer}`);
    }

    // Check for Group - skip but continue traversing children
    if (object instanceof THREE.Group) {
      return;
    }

    // Extract color from material (improved to handle LineMaterial)
    const material = (object as THREE.Line | THREE.LineSegments | THREE.Mesh).material;
    let color = getColorFromMaterial(material);

    // 색상이 기본값(7)이면 부모 계층에서 색상 찾기 시도
    if (color === 7) {
      const hierarchyColor = getColorFromObjectHierarchy(object);
      if (hierarchyColor !== null) {
        color = hierarchyColor;
      }
    }

    // Check for Line2 (from drei)
    const mesh = object as THREE.Mesh;
    const isLine2 = (object as any).isLine2 || (object as any).isLineSegments2;
    const hasLineGeometry = mesh.geometry && (
      (mesh.geometry as any).isLineGeometry ||
      (mesh.geometry as any).isLineSegmentsGeometry ||
      mesh.geometry.getAttribute('instanceStart') !== undefined
    );

    if (isLine2 || hasLineGeometry) {
      // 씬에서 추출한 색상을 그대로 사용 (임의로 정하지 않음)
      // 2D 화면에 렌더링된 색상을 그대로 DXF에 적용
      let line2Color = color;
      let line2Layer = layer;
      const lowerName = name.toLowerCase();

      // 특수 객체에 대한 색상 및 레이어 강제 할당
      if (lowerName.includes('clothing-rod') || lowerName.includes('옷봉')) {
        line2Color = 7; // ACI 7 = 흰색/검정
        line2Layer = 'CLOTHING_ROD';
        console.log(`📐 옷봉(Line2): ${name}, 색상 ACI=7로 강제 설정`);
      } else if (lowerName.includes('adjustable-foot') || lowerName.includes('조절발')) {
        line2Color = 8; // ACI 8 = 회색
        line2Layer = 'ACCESSORIES';
        console.log(`📐 조절발(Line2): ${name}, 색상 ACI=8로 강제 설정`);
      } else if (lowerName.includes('ventilation') || lowerName.includes('환기')) {
        line2Color = 6; // ACI 6 = 마젠타
        line2Layer = 'VENTILATION';
        console.log(`📐 환기캡(Line2): ${name}, 색상 ACI=6로 강제 설정`);
      } else if (lowerName.includes('back-panel') || lowerName.includes('백패널')) {
        line2Color = 30; // ACI 30 = 오렌지 (가구패널과 동일, 투명도 10%는 CAD에서 별도 설정)
        line2Layer = 'BACK_PANEL';
        console.log(`📐 백패널(Line2): ${name}, 색상 ACI=30으로 강제 설정`);
      } else if (lowerName.includes('dimension')) {
        console.log(`📏 치수선(Line2): ${name}, 추출된 색상 ACI=${line2Color}`);
      }

      const extractedLines = extractFromLine2(object, matrix, scale, line2Layer, line2Color);
      if (extractedLines.length > 0) {
        lines.push(...extractedLines);
        line2Objects++;

        // 치수선 전용 로깅
        const isDimensionLine = lowerName.includes('dimension');
        const isClothingRodLine = lowerName.includes('clothing-rod') || lowerName.includes('옷봉');
        const isAdjustableFootLine = lowerName.includes('adjustable-foot') || lowerName.includes('조절발');
        if (isDimensionLine) {
          console.log(`📏 치수선(Line2) 발견: ${name}, 라인 ${extractedLines.length}개, 색상 ACI=${line2Color}`);
        } else if (!isClothingRodLine && !isAdjustableFootLine) {
          console.log(`📐 Line2 발견: ${name || '(이름없음)'}, 라인 ${extractedLines.length}개, 색상 ACI=${line2Color}`);
        }
      } else if (lowerName.includes('dimension')) {
        // 치수선인데 추출 실패한 경우 경고
        console.log(`⚠️ 치수선(Line2) 추출 실패: ${name}, isLine2=${isLine2}, hasLineGeometry=${hasLineGeometry}`);
      }
      return;
    }

    // Check for LineSegments (EdgesGeometry)
    // THREE.LineSegments 또는 type이 'LineSegments'인 객체 모두 체크
    // 주의: LineSegments는 Line을 상속하므로 Line 체크 전에 먼저 확인해야 함
    // R3F의 <lineSegments>도 감지
    const isLineSegments = object instanceof THREE.LineSegments ||
                           object.type === 'LineSegments' ||
                           (object as any).isLineSegments ||
                           object.constructor.name === 'LineSegments';

    // 추가 디버그: furniture-edge, back-panel-edge, space-frame 이름 확인
    const lowerName = name.toLowerCase();
    if (lowerName.includes('furniture-edge') || lowerName.includes('back-panel-edge') || lowerName.includes('clothing-rod-edge') || lowerName.includes('space-frame')) {
      console.log(`🔎 엣지 객체 발견: ${name}, type=${object.type}, isLineSegments=${isLineSegments}, isLine=${object instanceof THREE.Line}, constructor=${object.constructor.name}`);
    }

    // 모든 객체 이름 디버깅 (furniture 포함된 것만)
    if (lowerName.includes('furniture') || lowerName.includes('frame')) {
      console.log(`🏷️ 객체 이름: ${name}, type=${object.type}`);
    }

    if (isLineSegments) {
      const lineSegObj = object as THREE.LineSegments;
      const geometry = lineSegObj.geometry;

      if (!geometry) {
        console.log(`⚠️ LineSegments geometry 없음: ${name || '(이름없음)'}`);
        return;
      }

      const positionAttr = geometry.getAttribute('position');
      const posCount = positionAttr?.count || 0;

      if (posCount > 0) {
        // 엣지 타입 감지 (색상 추출 전에 먼저 감지)
        const lowerName = name.toLowerCase();
        const isBackPanelEdge = lowerName.includes('back-panel') || lowerName.includes('백패널');
        const isClothingRodEdge = lowerName.includes('clothing-rod') || lowerName.includes('옷봉');
        const isAdjustableFootEdge = lowerName.includes('adjustable-foot') || lowerName.includes('조절발');
        const isVentilationEdge = lowerName.includes('ventilation') || lowerName.includes('환기');

        // 가구 패널 엣지 감지 (furniture-edge-* 형태 이름)
        const isFurniturePanelEdge = lowerName.includes('furniture-edge');

        // 공간 프레임 감지: Room.tsx에서 name="space-frame"으로 설정됨
        const isSpaceFrame = lowerName.includes('space-frame');

        // 색상 설정 (이름 기반으로 먼저 결정, 그 다음 material에서 추출)
        // - 공간 프레임 (Room.tsx 좌우상하): ACI 3 (연두색)
        // - 가구 패널 (furniture-edge-*): ACI 30 (주황색)
        // 씬에서 추출한 색상을 그대로 사용 (임의로 정하지 않음)
        // 2D 화면에 렌더링된 색상을 material에서 추출하여 DXF에 동일하게 적용
        let lsColor = color; // 기본값은 위에서 추출한 색상

        // material에서 정확한 색상 추출
        const lsMaterial = lineSegObj.material;
        if (lsMaterial && !Array.isArray(lsMaterial) && 'color' in lsMaterial) {
          const matColor = (lsMaterial as THREE.LineBasicMaterial).color;
          if (matColor) {
            lsColor = rgbToAci(
              Math.round(matColor.r * 255),
              Math.round(matColor.g * 255),
              Math.round(matColor.b * 255)
            );
          }
        }

        // 디버그 로깅
        if (isBackPanelEdge) {
          console.log(`📐 백패널 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
        } else if (isVentilationEdge) {
          console.log(`📐 환기캡 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
        } else if (isAdjustableFootEdge) {
          console.log(`📐 조절발 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
        } else if (isClothingRodEdge) {
          console.log(`📐 옷봉 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
        } else if (isSpaceFrame) {
          console.log(`📐 공간 프레임 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
        } else if (isFurniturePanelEdge) {
          console.log(`📐 가구 패널 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
        }

        // 가구 패널/공간 프레임 엣지는 뒤쪽 필터링 건너뜀 (좌측판, 우측판, 상판, 하판, 좌우상하 프레임 등 모두 보임)
        const skipBackFilter = isFurniturePanelEdge || isBackPanelEdge || isClothingRodEdge || isAdjustableFootEdge || isSpaceFrame;

        // 레이어 및 색상 결정 이유 로깅
        let lsLayer = layer; // 기본값은 determineLayer에서 결정된 값
        let colorReason = '기본';

        if (isBackPanelEdge) {
          lsLayer = 'BACK_PANEL';
          lsColor = 30; // ACI 30 = 오렌지 (2D에서 가구패널과 동일한 색상, 투명도 10%는 CAD에서 별도 설정)
          colorReason = '백패널';
        } else if (isClothingRodEdge) {
          lsLayer = 'CLOTHING_ROD';
          lsColor = 7; // ACI 7 = 흰색/검정 (레이어 색상과 동일)
          colorReason = '옷봉';
        } else if (isAdjustableFootEdge) {
          lsLayer = 'ACCESSORIES';
          lsColor = 8; // ACI 8 = 회색 (레이어 색상과 동일)
          colorReason = '조절발';
        } else if (isVentilationEdge) {
          lsLayer = 'VENTILATION';
          lsColor = 6; // ACI 6 = 마젠타 (레이어 색상과 동일)
          colorReason = '환기캡';
        } else if (isSpaceFrame) {
          lsLayer = 'SPACE_FRAME';
          colorReason = '공간프레임';
        } else if (isFurniturePanelEdge) {
          lsLayer = 'FURNITURE_PANEL';
          colorReason = '가구패널';
        }

        const extractedLines = extractFromLineSegments(lineSegObj, matrix, scale, lsLayer, lsColor, skipBackFilter);
        lines.push(...extractedLines);
        lineSegmentsObjects++;

        // 가구/프레임 관련 객체는 항상 로깅
        if (isFurniturePanelEdge || isSpaceFrame || isBackPanelEdge) {
          console.log(`📐 [${colorReason}] LineSegments: ${name || '(이름없음)'}, 버텍스 ${posCount}개, 라인 ${extractedLines.length}개, 색상 ACI=${lsColor}${skipBackFilter ? ' (뒤쪽 필터링 스킵)' : ''}`);
        }
      } else {
        console.log(`⚠️ LineSegments position 없음: ${name || '(이름없음)'}, geometry type: ${geometry.type}`);
      }
      return;
    }

    // Check for Line (NativeLine, drei Line 등)
    // R3F의 <line>은 THREE.Line을 생성함
    // 주의: LineSegments는 Line을 상속하므로 위에서 이미 처리됨
    const isLineType = (object instanceof THREE.Line && !(object instanceof THREE.LineSegments)) ||
                       object.type === 'Line' ||
                       object.constructor.name === 'Line';

    // 추가 디버그: dimension_line 이름 확인
    if (name.toLowerCase().includes('dimension')) {
      console.log(`🔎 치수선 객체 발견: ${name}, type=${object.type}, isLine=${isLineType}, constructor=${object.constructor.name}`);
    }

    if (isLineType) {
      const lineObj = object as THREE.Line;
      const posCount = lineObj.geometry?.getAttribute('position')?.count || 0;
      if (posCount > 0) {
        // Line material에서 색상 추출
        const lineMaterial = lineObj.material;
        let lineColor = color;
        if (lineMaterial && !Array.isArray(lineMaterial) && 'color' in lineMaterial) {
          const matColor = (lineMaterial as THREE.LineBasicMaterial).color;
          if (matColor) {
            lineColor = rgbToAci(
              Math.round(matColor.r * 255),
              Math.round(matColor.g * 255),
              Math.round(matColor.b * 255)
            );
          }
        }

        // 엣지 타입 감지 (개별 Line 요소용)
        // 특수 객체에 대한 색상 및 레이어 강제 할당
        const lineLowerName = name.toLowerCase();
        let lineLayer = layer;

        if (lineLowerName.includes('clothing-rod') || lineLowerName.includes('옷봉')) {
          lineColor = 7; // ACI 7 = 흰색/검정
          lineLayer = 'CLOTHING_ROD';
          console.log(`📐 옷봉(Line): ${name}, 색상 ACI=7로 강제 설정`);
        } else if (lineLowerName.includes('adjustable-foot') || lineLowerName.includes('조절발')) {
          lineColor = 8; // ACI 8 = 회색
          lineLayer = 'ACCESSORIES';
          console.log(`📐 조절발(Line): ${name}, 색상 ACI=8로 강제 설정`);
        } else if (lineLowerName.includes('ventilation') || lineLowerName.includes('환기')) {
          lineColor = 6; // ACI 6 = 마젠타
          lineLayer = 'VENTILATION';
          console.log(`📐 환기캡(Line): ${name}, 색상 ACI=6로 강제 설정`);
        } else if (lineLowerName.includes('back-panel') || lineLowerName.includes('백패널')) {
          lineColor = 30; // ACI 30 = 오렌지 (가구패널과 동일, 투명도 10%는 CAD에서 별도 설정)
          lineLayer = 'BACK_PANEL';
          console.log(`📐 백패널(Line): ${name}, 색상 ACI=30으로 강제 설정`);
        } else if (lineLowerName.includes('dimension')) {
          console.log(`📏 치수선(Line): ${name}, 추출된 색상 ACI=${lineColor}`);
        }

        const extractedLines = extractFromLine(lineObj, matrix, scale, lineLayer, lineColor);
        lines.push(...extractedLines);
        lineObjects++;
      }
      return;
    }

    // Check for Text (drei Text component) - it's a Mesh with troika text data
    // 모든 텍스트는 DIMENSIONS 레이어로 강제 (치수 텍스트이므로)
    // DIMENSIONS 레이어를 끄면 모든 숫자가 함께 사라짐
    if (mesh.geometry && (mesh as any).text !== undefined) {
      const textContent = (mesh as any).text;
      if (textContent && typeof textContent === 'string') {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        const projPos = projectTo2D(worldPos, scale);

        texts.push({
          x: projPos.x,
          y: projPos.y,
          text: textContent,
          height: 25, // 2.5mm text height
          color: 7, // 치수 텍스트는 흰색/검정 (ACI 7)
          layer: 'DIMENSIONS' // 모든 텍스트는 DIMENSIONS 레이어로 강제
        });
        textObjects++;
        console.log(`📝 텍스트 추출: "${textContent}" → DIMENSIONS 레이어`);
      }
      return;
    }

    // Check for Mesh (potential for edge extraction)
    if (object instanceof THREE.Mesh) {
      meshObjects++;
      meshesForEdges.push({ mesh: object, matrix, layer, color });
    }
  });

  // 상세 로그
  console.log('📊 객체 통계:', {
    line2Objects,
    lineSegmentsObjects,
    lineObjects,
    textObjects,
    meshObjects,
    skippedByVisibility,
    skippedByFilter,
    totalLinesExtracted: lines.length
  });

  // 색상별 라인 수 계산
  const colorCounts: Record<number, number> = {};
  lines.forEach(line => {
    colorCounts[line.color] = (colorCounts[line.color] || 0) + 1;
  });
  console.log('🎨 색상별 라인 수:', colorCounts);
  console.log('🎨 색상 해석: ACI 3=공간프레임(연두), ACI 7=옷봉/조절발(흰색), ACI 30=가구패널(주황), ACI 252=백패널(회색)');
  if (!colorCounts[30] && !colorCounts[3]) {
    console.error('❌ 가구 패널(ACI 30)과 공간 프레임(ACI 3) 라인이 없습니다! LineSegments가 씬에 없거나 이름이 다릅니다.');
  }

  // ============================================================
  // Mesh 기반 엣지 추출 (LineSegments fallback)
  // 주의: 공간 프레임(좌우상하)과 가구 패널은 LineSegments에서 이름으로 구분됨
  // - 공간 프레임 (Room.tsx): lineSegments 이름 없음 → 연두색 (ACI 3)
  // - 가구 패널: lineSegments 이름 "furniture-edge-*" → 원래 색상 유지
  // Mesh는 fallback으로만 사용, material 색상 유지
  // ============================================================

  console.log(`📦 Mesh 기반 엣지 추출 시작... (총 ${meshesForEdges.length}개 Mesh)`);

  // Mesh 분류 (LineSegments에서 구분되지 않는 경우 fallback으로 사용)
  // 공간 프레임과 가구 패널은 LineSegments 이름으로 구분됨 (공간 프레임: 이름없음 → 연두색, 가구 패널: furniture-edge-* → 원래 색상)
  const shelfMeshes: typeof meshesForEdges = []; // 선반
  const backPanelMeshes: typeof meshesForEdges = []; // 백패널
  const clothingRodMeshes: typeof meshesForEdges = []; // 옷봉
  const otherFurnitureMeshes: typeof meshesForEdges = []; // 기타 (material 색상 사용)

  meshesForEdges.forEach((item) => {
    const { mesh } = item;
    const name = (mesh.name || '').toLowerCase();

    // 제외할 항목들
    if (name.includes('floor') || name.includes('wall') || name.includes('background') ||
        name.includes('slot') || name.includes('drop')) {
      return;
    }

    // troika text mesh 제외
    if ((mesh as any).text !== undefined || (mesh as any).isTroikaText) {
      return;
    }

    // geometry 타입 확인
    if (!mesh.geometry) return;
    const geometryType = mesh.geometry.type;

    // Sphere, Circle, Plane 제외
    if (geometryType.includes('Sphere') || geometryType.includes('Circle') || geometryType.includes('Plane')) {
      return;
    }

    // 이름 기반 분류
    // 주의: 가구 패널(좌측판, 우측판, 상판, 하판)과 공간 프레임은 LineSegments에서 구분됨
    // Mesh는 이름이 없거나 부정확할 수 있으므로, material 색상을 기반으로 처리
    if (name.includes('백패널') || name.includes('back-panel') || name.includes('backpanel')) {
      backPanelMeshes.push(item);
    } else if (name.includes('옷봉') || name.includes('clothing') || name.includes('rod')) {
      clothingRodMeshes.push(item);
    } else if (name.includes('선반') || name.includes('shelf')) {
      shelfMeshes.push(item);
    } else if (geometryType === 'BoxGeometry' || geometryType === 'BoxBufferGeometry') {
      // BoxGeometry는 가구 패널 또는 공간 프레임일 수 있음
      // material에서 추출한 원래 색상 사용
      otherFurnitureMeshes.push(item);
    }
  });

  console.log(`  선반: ${shelfMeshes.length}개, 백패널: ${backPanelMeshes.length}개, 옷봉: ${clothingRodMeshes.length}개, 기타: ${otherFurnitureMeshes.length}개`);

  let meshEdgeCount = 0;

  // 선반 - FURNITURE_PANEL 레이어, 주황색 (ACI 30)
  shelfMeshes.forEach(({ mesh, matrix }) => {
    const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, 'FURNITURE_PANEL', 30);
    if (extractedEdges.length > 0) {
      lines.push(...extractedEdges);
      meshEdgeCount += extractedEdges.length;
      console.log(`  📦 선반: ${mesh.name || '(무명)'}, ${extractedEdges.length}개, FURNITURE_PANEL`);
    }
  });

  // 백패널 - BACK_PANEL 레이어, 연한 회색 (ACI 252)
  backPanelMeshes.forEach(({ mesh, matrix }) => {
    const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, 'BACK_PANEL', 252);
    if (extractedEdges.length > 0) {
      lines.push(...extractedEdges);
      meshEdgeCount += extractedEdges.length;
      console.log(`  ⚪ 백패널: ${mesh.name || '(무명)'}, ${extractedEdges.length}개, BACK_PANEL`);
    }
  });

  // 옷봉 - CLOTHING_ROD 레이어, 흰색 (ACI 7)
  clothingRodMeshes.forEach(({ mesh, matrix }) => {
    const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, 'CLOTHING_ROD', 7);
    if (extractedEdges.length > 0) {
      lines.push(...extractedEdges);
      meshEdgeCount += extractedEdges.length;
      console.log(`  ⚪ 옷봉: ${mesh.name || '(무명)'}, ${extractedEdges.length}개, CLOTHING_ROD`);
    }
  });

  // 기타 가구 - FURNITURE_PANEL 레이어, 주황색 (ACI 30)
  otherFurnitureMeshes.forEach(({ mesh, matrix }) => {
    // 크기 체크: 너무 작은 것은 제외
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);

    // 최소 5mm 두께, 50mm 이상 크기
    if (dims[0] < 0.05 || dims[2] < 0.5) {
      return;
    }

    const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, 'FURNITURE_PANEL', 30);
    if (extractedEdges.length > 0) {
      lines.push(...extractedEdges);
      meshEdgeCount += extractedEdges.length;
      console.log(`  📦 기타: ${mesh.name || '(무명)'}, ${extractedEdges.length}개, FURNITURE_PANEL`);
    }
  });

  console.log(`✅ Mesh에서 총 ${meshEdgeCount}개 엣지 추출 완료`);

  console.log(`✅ 추출 완료: 라인 ${lines.length}개, 텍스트 ${texts.length}개`);

  return { lines, texts };
};

/**
 * Mesh에서 엣지 추출 (필요시 사용)
 * 뷰 방향에 따라 보이지 않는 엣지는 필터링
 */
const extractEdgesFromMesh = (
  mesh: THREE.Mesh,
  matrix: THREE.Matrix4,
  scale: number,
  layer: string,
  color: number
): DxfLine[] => {
  const lines: DxfLine[] = [];

  if (!mesh.geometry) return lines;

  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const positionAttr = edges.getAttribute('position');

  if (!positionAttr) return lines;

  let filteredCount = 0;

  for (let i = 0; i < positionAttr.count; i += 2) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    ).applyMatrix4(matrix);

    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    ).applyMatrix4(matrix);

    // 뷰 방향에 수직인 엣지 필터링 (점으로 투영됨)
    if (!isLineVisibleInView(p1, p2)) {
      filteredCount++;
      continue;
    }

    const proj1 = projectTo2D(p1, scale);
    const proj2 = projectTo2D(p2, scale);

    // 투영 후 너무 짧은 라인 필터링 (1mm 미만)
    const length = Math.sqrt(
      Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
    );
    if (length < 1) {
      filteredCount++;
      continue;
    }

    lines.push({
      x1: proj1.x,
      y1: proj1.y,
      x2: proj2.x,
      y2: proj2.y,
      layer,
      color
    });
  }

  if (filteredCount > 0) {
    console.log(`  ↳ Mesh 엣지 ${filteredCount}개 필터링됨 (뷰 방향 또는 길이)`);
  }

  edges.dispose();
  return lines;
};

/**
 * ACI 색상 코드를 레이어 이름으로 변환
 */
const aciToLayerName = (aciColor: number): string => {
  switch (aciColor) {
    case 1: return 'COLOR_RED';
    case 2: return 'COLOR_YELLOW';
    case 3: return 'COLOR_GREEN'; // 연두색 (가구 프레임)
    case 4: return 'COLOR_CYAN';
    case 5: return 'COLOR_BLUE';
    case 6: return 'COLOR_MAGENTA';
    case 7: return 'COLOR_WHITE'; // 흰색 (옷봉/조절발)
    case 8: return 'COLOR_GRAY';
    case 9: return 'COLOR_LIGHTGRAY';
    case 30: return 'COLOR_ORANGE';
    case 40: return 'COLOR_LIGHT_ORANGE';
    case 250: return 'COLOR_DARKGRAY';
    case 252: return 'COLOR_VERY_LIGHT_GRAY'; // 백패널용 매우 연한 회색
    case 253: return 'COLOR_ULTRA_LIGHT_GRAY';
    case 254: return 'COLOR_NEAR_WHITE';
    default: return `COLOR_${aciColor}`;
  }
};

/**
 * 외부 치수선 생성 (spaceInfo + placedModules 기반)
 * 2D 화면에 표시되는 모든 치수선을 DXF에 직접 생성
 */
const generateExternalDimensions = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection
): { lines: DxfLine[]; texts: DxfText[] } => {
  const lines: DxfLine[] = [];
  const texts: DxfText[] = [];

  const { width, height, depth } = spaceInfo;
  const dimensionColor = 7; // 흰색/검정 (치수선)
  const extensionLength = 50; // 연장선 길이 (mm)
  const dimensionOffset = 400; // 치수선 오프셋 (mm) - 가구와 충분히 떨어지게 (2D 뷰와 동일)

  // 프레임 두께
  const frameThickness = spaceInfo.frameThickness || 50;
  // 받침대 높이
  const baseHeight = spaceInfo.baseHeight || 65;
  // 상부 프레임 높이
  const topFrameHeight = spaceInfo.topFrameHeight || frameThickness;
  // 가구 높이 (전체 높이 - 받침대 - 상부프레임)
  const furnitureHeight = height - baseHeight - topFrameHeight;

  const halfWidth = width / 2;

  if (viewDirection === 'front') {
    // ========================================
    // 정면도 치수선
    // ========================================

    // 상단 가로 치수선 (전체 너비)
    const topY = height + dimensionOffset;

    // 치수선 본체
    lines.push({
      x1: -halfWidth,
      y1: topY,
      x2: halfWidth,
      y2: topY,
      layer: 'DIMENSIONS',
      color: dimensionColor
    });

    // 좌측 연장선
    lines.push({
      x1: -halfWidth,
      y1: height,
      x2: -halfWidth,
      y2: topY + extensionLength,
      layer: 'DIMENSIONS',
      color: dimensionColor
    });

    // 우측 연장선
    lines.push({
      x1: halfWidth,
      y1: height,
      x2: halfWidth,
      y2: topY + extensionLength,
      layer: 'DIMENSIONS',
      color: dimensionColor
    });

    // 치수 텍스트
    texts.push({
      x: 0,
      y: topY + 15,
      text: `${width}`,
      height: 25,
      color: dimensionColor,
      layer: 'DIMENSIONS'
    });

    // 좌측 세로 치수선 (전체 높이)
    const leftX = -halfWidth - dimensionOffset;

    // 치수선 본체
    lines.push({
      x1: leftX,
      y1: 0,
      x2: leftX,
      y2: height,
      layer: 'DIMENSIONS',
      color: dimensionColor
    });

    // 하단 연장선
    lines.push({
      x1: -halfWidth,
      y1: 0,
      x2: leftX - extensionLength,
      y2: 0,
      layer: 'DIMENSIONS',
      color: dimensionColor
    });

    // 상단 연장선
    lines.push({
      x1: -halfWidth,
      y1: height,
      x2: leftX - extensionLength,
      y2: height,
      layer: 'DIMENSIONS',
      color: dimensionColor
    });

    // 치수 텍스트
    texts.push({
      x: leftX - 15,
      y: height / 2,
      text: `${height}`,
      height: 25,
      color: dimensionColor,
      layer: 'DIMENSIONS'
    });

    // ========================================
    // 2단계: 좌우 프레임 + 내부너비 치수선 (전체 너비 아래)
    // 2D 뷰와 동일하게 상단에 배치
    // ========================================
    const frameSize = spaceInfo.frameSize || { left: 42, right: 42, top: 10 };
    const leftFrameWidth = frameSize.left || 42;
    const rightFrameWidth = frameSize.right || 42;
    const baseH = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;

    // 2단계 치수선 Y 위치 (전체 너비 치수선 아래, 120mm 간격)
    const dim2Y = topY - 120;

    // 좌측 프레임 너비 치수선
    lines.push({
      x1: -halfWidth, y1: dim2Y, x2: -halfWidth + leftFrameWidth, y2: dim2Y,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    // 좌측 프레임 연장선 (위로)
    lines.push({
      x1: -halfWidth, y1: height, x2: -halfWidth, y2: dim2Y + extensionLength,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    lines.push({
      x1: -halfWidth + leftFrameWidth, y1: height, x2: -halfWidth + leftFrameWidth, y2: dim2Y + extensionLength,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    texts.push({
      x: -halfWidth + leftFrameWidth / 2, y: dim2Y + 15,
      text: `${leftFrameWidth}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
    });

    // 우측 프레임 너비 치수선
    lines.push({
      x1: halfWidth - rightFrameWidth, y1: dim2Y, x2: halfWidth, y2: dim2Y,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    // 우측 프레임 연장선 (위로)
    lines.push({
      x1: halfWidth, y1: height, x2: halfWidth, y2: dim2Y + extensionLength,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    lines.push({
      x1: halfWidth - rightFrameWidth, y1: height, x2: halfWidth - rightFrameWidth, y2: dim2Y + extensionLength,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    texts.push({
      x: halfWidth - rightFrameWidth / 2, y: dim2Y + 15,
      text: `${rightFrameWidth}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
    });

    // 내부 너비 (슬롯 영역) 치수선
    const innerWidth = width - leftFrameWidth - rightFrameWidth;
    lines.push({
      x1: -halfWidth + leftFrameWidth, y1: dim2Y, x2: halfWidth - rightFrameWidth, y2: dim2Y,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    texts.push({
      x: 0, y: dim2Y + 15,
      text: `${innerWidth}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
    });

    // ========================================
    // 3단계: 개별 슬롯/가구 너비 치수선 (2단계 아래)
    // ========================================
    const dim3Y = dim2Y - 120;

    // placedModules가 있으면 개별 가구 폭 치수선
    if (placedModules && placedModules.length > 0) {
      placedModules.forEach((module) => {
        const moduleWidth = module.customWidth || 600; // 기본 600mm
        const moduleX = module.position?.x || 0;
        const moduleLeftX = (moduleX * 100) - moduleWidth / 2; // position.x는 meter 단위이므로 mm로 변환
        const moduleRightX = (moduleX * 100) + moduleWidth / 2;

        lines.push({
          x1: moduleLeftX, y1: dim3Y, x2: moduleRightX, y2: dim3Y,
          layer: 'DIMENSIONS', color: dimensionColor
        });
        // 연장선 (위로)
        lines.push({
          x1: moduleLeftX, y1: height, x2: moduleLeftX, y2: dim3Y + extensionLength,
          layer: 'DIMENSIONS', color: dimensionColor
        });
        lines.push({
          x1: moduleRightX, y1: height, x2: moduleRightX, y2: dim3Y + extensionLength,
          layer: 'DIMENSIONS', color: dimensionColor
        });
        texts.push({
          x: (moduleLeftX + moduleRightX) / 2, y: dim3Y + 15,
          text: `${moduleWidth}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
        });
      });
    } else if (spaceInfo.columns && spaceInfo.columns.length > 0) {
      // 가구가 없으면 슬롯 너비 표시
      spaceInfo.columns.forEach((column) => {
        const colWidth = column.width;
        const colX = column.position[0] * 100; // meter -> mm
        const colLeftX = colX - colWidth / 2;
        const colRightX = colX + colWidth / 2;

        lines.push({
          x1: colLeftX, y1: dim3Y, x2: colRightX, y2: dim3Y,
          layer: 'DIMENSIONS', color: dimensionColor
        });
        // 연장선 (위로)
        lines.push({
          x1: colLeftX, y1: height, x2: colLeftX, y2: dim3Y + extensionLength,
          layer: 'DIMENSIONS', color: dimensionColor
        });
        lines.push({
          x1: colRightX, y1: height, x2: colRightX, y2: dim3Y + extensionLength,
          layer: 'DIMENSIONS', color: dimensionColor
        });
        texts.push({
          x: colX, y: dim3Y + 15,
          text: `${colWidth}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
        });
      });
    }

    // 우측 치수선: 상부프레임 | 가구영역 | 받침대
    const topFrameThick = frameSize.top || 10;
    const rightDimX = halfWidth + dimensionOffset;
    const rightDimX2 = rightDimX + 40;

    // 상부 프레임 높이 치수선
    lines.push({
      x1: rightDimX, y1: height - topFrameThick, x2: rightDimX, y2: height,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    lines.push({
      x1: halfWidth, y1: height, x2: rightDimX + extensionLength, y2: height,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    lines.push({
      x1: halfWidth, y1: height - topFrameThick, x2: rightDimX + extensionLength, y2: height - topFrameThick,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    texts.push({
      x: rightDimX + 15, y: height - topFrameThick / 2,
      text: `${topFrameThick}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
    });

    // 가구 영역 높이 (전체 - 상부프레임 - 받침대)
    const furnitureAreaHeight = height - topFrameThick - baseH;
    lines.push({
      x1: rightDimX2, y1: baseH, x2: rightDimX2, y2: height - topFrameThick,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    lines.push({
      x1: halfWidth, y1: baseH, x2: rightDimX2 + extensionLength, y2: baseH,
      layer: 'DIMENSIONS', color: dimensionColor
    });
    texts.push({
      x: rightDimX2 + 15, y: baseH + furnitureAreaHeight / 2,
      text: `${furnitureAreaHeight}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
    });

    // 받침대 높이 치수선 (받침대가 있는 경우만)
    if (baseH > 0) {
      lines.push({
        x1: rightDimX, y1: 0, x2: rightDimX, y2: baseH,
        layer: 'DIMENSIONS', color: dimensionColor
      });
      lines.push({
        x1: halfWidth, y1: 0, x2: rightDimX + extensionLength, y2: 0,
        layer: 'DIMENSIONS', color: dimensionColor
      });
      texts.push({
        x: rightDimX + 15, y: baseH / 2,
        text: `${baseH}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
      });
    }

    // === 정면뷰 프레임 박스 (연두색 ACI 3) ===
    const frameColor = 3; // 연두색
    const leftFrameWidth = frameSize.left || 18;
    const rightFrameWidth = frameSize.right || 18;

    // 좌측 프레임 박스 (바닥 0 ~ 전체높이 height)
    const leftFrameX1 = -halfWidth;
    const leftFrameX2 = -halfWidth + leftFrameWidth;
    lines.push({ x1: leftFrameX1, y1: 0, x2: leftFrameX2, y2: 0, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: leftFrameX2, y1: 0, x2: leftFrameX2, y2: height, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: leftFrameX2, y1: height, x2: leftFrameX1, y2: height, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: leftFrameX1, y1: height, x2: leftFrameX1, y2: 0, layer: 'SPACE_FRAME', color: frameColor });

    // 우측 프레임 박스 (바닥 0 ~ 전체높이 height)
    const rightFrameX1 = halfWidth - rightFrameWidth;
    const rightFrameX2 = halfWidth;
    lines.push({ x1: rightFrameX1, y1: 0, x2: rightFrameX2, y2: 0, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: rightFrameX2, y1: 0, x2: rightFrameX2, y2: height, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: rightFrameX2, y1: height, x2: rightFrameX1, y2: height, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: rightFrameX1, y1: height, x2: rightFrameX1, y2: 0, layer: 'SPACE_FRAME', color: frameColor });

    // 상부 프레임 박스 (좌우 프레임 사이, 상단)
    const topFrameY1 = height - topFrameThick;
    const topFrameY2 = height;
    lines.push({ x1: leftFrameX2, y1: topFrameY1, x2: rightFrameX1, y2: topFrameY1, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: rightFrameX1, y1: topFrameY1, x2: rightFrameX1, y2: topFrameY2, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: rightFrameX1, y1: topFrameY2, x2: leftFrameX2, y2: topFrameY2, layer: 'SPACE_FRAME', color: frameColor });
    lines.push({ x1: leftFrameX2, y1: topFrameY2, x2: leftFrameX2, y2: topFrameY1, layer: 'SPACE_FRAME', color: frameColor });

    // 받침대 박스 (좌우 프레임 사이, 하단) - 받침대가 있는 경우만
    if (baseH > 0) {
      lines.push({ x1: leftFrameX2, y1: 0, x2: rightFrameX1, y2: 0, layer: 'SPACE_FRAME', color: frameColor });
      lines.push({ x1: rightFrameX1, y1: 0, x2: rightFrameX1, y2: baseH, layer: 'SPACE_FRAME', color: frameColor });
      lines.push({ x1: rightFrameX1, y1: baseH, x2: leftFrameX2, y2: baseH, layer: 'SPACE_FRAME', color: frameColor });
      lines.push({ x1: leftFrameX2, y1: baseH, x2: leftFrameX2, y2: 0, layer: 'SPACE_FRAME', color: frameColor });
    }

  } else if (viewDirection === 'top') {
    // 상부뷰: 씬에서 추출한 치수선만 사용 (자체 생성 안함)
    // 2D 도면과 동일하게 표시하기 위해 generateExternalDimensions에서 생성하지 않음
    console.log('📏 상부뷰: 씬에서 추출한 치수선만 사용');

  } else if (viewDirection === 'left' || viewDirection === 'right') {
    // 측면뷰: 씬에서 추출한 치수선만 사용 (자체 생성 안함)
    // 2D 도면과 동일하게 표시하기 위해 generateExternalDimensions에서 생성하지 않음
    console.log(`📏 ${viewDirection}뷰: 씬에서 추출한 치수선만 사용`);
  }

  console.log(`📏 외부 치수선 생성: ${lines.length}개 라인, ${texts.length}개 텍스트`);
  return { lines, texts };
};

/**
 * DXF 생성 - 색상과 텍스트 포함
 * @param sideViewFilter 측면뷰 필터링 타입 (leftmost: 좌측 가구만, rightmost: 우측 가구만, all: 모두)
 */
export const generateDxfFromData = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection,
  sideViewFilter: SideViewFilter = 'all'
): string => {
  const scene = sceneHolder.getScene();

  if (!scene) {
    console.error('❌ 씬을 찾을 수 없습니다');
    throw new Error('씬을 찾을 수 없습니다');
  }

  console.log(`📐 DXF 생성 시작 (${viewDirection}, 필터: ${sideViewFilter})`);
  console.log(`📊 공간 정보: ${spaceInfo.width}mm x ${spaceInfo.height}mm x ${spaceInfo.depth}mm`);
  console.log(`📊 배치된 가구 수: ${placedModules.length}`);

  // 측면뷰 필터링: X 위치 범위 계산
  let allowedXRange: { min: number; max: number } | null = null;

  if ((viewDirection === 'left' || viewDirection === 'right') &&
      sideViewFilter !== 'all' &&
      placedModules.length > 0) {

    // placedModules에서 X 위치 추출 (Three.js 단위: meter)
    const xPositions = placedModules.map(m => m.position?.x || 0);

    if (sideViewFilter === 'leftmost') {
      // 좌측뷰: leftmost X 위치의 가구만
      const leftmostX = Math.min(...xPositions);
      allowedXRange = { min: leftmostX - 0.01, max: leftmostX + 0.01 };
      console.log(`📐 좌측뷰 필터: X=${leftmostX.toFixed(3)} 위치 가구만 포함`);
    } else if (sideViewFilter === 'rightmost') {
      // 우측뷰: rightmost X 위치의 가구만
      const rightmostX = Math.max(...xPositions);
      allowedXRange = { min: rightmostX - 0.01, max: rightmostX + 0.01 };
      console.log(`📐 우측뷰 필터: X=${rightmostX.toFixed(3)} 위치 가구만 포함`);
    }
  }

  // 씬에서 Line과 Text 객체 추출 (X 필터링 범위 전달)
  const extracted = extractFromScene(scene, viewDirection, allowedXRange);

  // 외부 치수선 생성 (spaceInfo + placedModules 기반)
  const externalDimensions = generateExternalDimensions(spaceInfo, placedModules, viewDirection);

  // 씬에서 추출한 데이터 + 외부 치수선 합치기
  const lines = [...extracted.lines, ...externalDimensions.lines];
  const texts = [...extracted.texts, ...externalDimensions.texts];

  if (lines.length === 0) {
    console.warn('⚠️ 추출된 라인이 없습니다.');
  }

  // DXF 원점 이동 (왼쪽 하단을 원점으로)
  const offsetX = spaceInfo.width / 2;
  const offsetY = 0;

  // DXF 생성
  const dxf = new DxfWriter();

  // 요소 타입별 레이어 생성 (각 타입에 적절한 기본 색상 지정)
  // 레이어 색상: ACI 3=연두(공간), ACI 30=주황(가구), ACI 7=흰색(치수/기타)
  dxf.addLayer('0', 7, 'CONTINUOUS');
  dxf.addLayer('SPACE_FRAME', 3, 'CONTINUOUS');      // 공간 프레임 - 연두색
  dxf.addLayer('FURNITURE_PANEL', 30, 'CONTINUOUS'); // 가구 패널 - 주황색
  dxf.addLayer('BACK_PANEL', 254, 'CONTINUOUS');     // 백패널 - 매우 연한 회색 (투명도 효과)
  dxf.addLayer('CLOTHING_ROD', 7, 'CONTINUOUS');     // 옷봉 - 흰색
  dxf.addLayer('ACCESSORIES', 8, 'CONTINUOUS');      // 조절발 - 회색 (2D와 동일)
  dxf.addLayer('VENTILATION', 6, 'CONTINUOUS');      // 환기캡 - 마젠타 (2D와 동일)
  dxf.addLayer('END_PANEL', 3, 'CONTINUOUS');        // 엔드패널 - 연두색
  dxf.addLayer('DIMENSIONS', 7, 'CONTINUOUS');       // 치수선 - 흰색

  console.log('📦 레이어 생성 완료: SPACE_FRAME, FURNITURE_PANEL, BACK_PANEL, CLOTHING_ROD, ACCESSORIES, END_PANEL, DIMENSIONS');

  // 레이어별 라인 통계
  const layerStats: Record<string, number> = {};
  const colorStats: Record<number, number> = {};
  lines.forEach(line => {
    layerStats[line.layer] = (layerStats[line.layer] || 0) + 1;
    colorStats[line.color] = (colorStats[line.color] || 0) + 1;
  });
  console.log('📊 레이어별 라인 통계:', layerStats);
  console.log('📊 색상별 라인 통계:', colorStats);

  // 라인 추가 - 요소 타입별 레이어에 배치 (layer 속성 사용)
  // 색상은 씬에서 추출한 원래 색상을 그대로 사용 (임의로 정하지 않음)
  // 레이어는 분리하되 색상은 2D 화면과 동일하게 유지
  lines.forEach(line => {
    try {
      // line.layer 속성을 사용하여 레이어 설정
      dxf.setCurrentLayerName(line.layer);
    } catch {
      dxf.setCurrentLayerName('0');
    }

    // 씬에서 추출한 색상을 그대로 사용 (임의로 강제하지 않음)
    // 백패널, 가구 패널, 조절발 등 모두 2D 화면에서 보이는 색상 그대로
    const finalColor = line.color;

    // colorNumber 옵션으로 개별 라인에 색상 적용
    dxf.addLine(
      point3d(line.x1 + offsetX, line.y1 + offsetY),
      point3d(line.x2 + offsetX, line.y2 + offsetY),
      { colorNumber: finalColor }
    );
  });

  // 텍스트 추가 - DIMENSIONS 레이어에 배치
  texts.forEach(text => {
    try {
      // 텍스트는 주로 치수선이므로 text.layer 사용 (없으면 DIMENSIONS)
      dxf.setCurrentLayerName(text.layer || 'DIMENSIONS');
    } catch {
      dxf.setCurrentLayerName('DIMENSIONS');
    }

    // DXF TEXT 엔티티 추가 - colorNumber 옵션으로 개별 텍스트에 색상 적용
    dxf.addText(
      point3d(text.x + offsetX, text.y + offsetY),
      text.height,
      text.text,
      { colorNumber: text.color }
    );
  });

  console.log(`✅ DXF 생성 완료 - 라인 ${lines.length}개, 텍스트 ${texts.length}개`);
  return dxf.stringify();
};

export const downloadDxf = (dxfContent: string, filename: string): void => {
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
