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
import { calculateFrameThickness, calculateInternalSpace, calculateBaseFrameHeight } from '../viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import type { SectionConfig } from '@/data/modules/shelving';
// calculateFrameThickness 제거됨 - 탑뷰 프레임은 씬에서 직접 추출

const DEFAULT_BASIC_THICKNESS_MM = 18;

type SectionWithCalc = SectionConfig & { calculatedHeight?: number };

interface SectionHeightsInfo {
  sections: SectionWithCalc[];
  heightsMm: number[];
  basicThicknessMm: number;
}

/**
 * 가구 섹션 높이 계산 - CADDimensions2D의 computeSectionHeightsInfo와 동일 로직
 */
const computeSectionHeightsInfo = (
  module: PlacedModule,
  moduleData: ReturnType<typeof getModuleById> | null,
  internalHeightMm: number,
  viewDirection?: 'left' | 'right'
): SectionHeightsInfo => {
  // 듀얼 가구의 경우 leftSections/rightSections 확인
  let rawSections: SectionWithCalc[] | undefined;

  if (module.customSections && module.customSections.length > 0) {
    rawSections = module.customSections as SectionWithCalc[];
  } else if (moduleData?.modelConfig?.leftSections || moduleData?.modelConfig?.rightSections) {
    // 듀얼 가구 (스타일러장 등): 좌측뷰는 leftSections, 우측뷰는 rightSections 사용
    rawSections = (viewDirection === 'right' && moduleData?.modelConfig?.rightSections)
      ? moduleData.modelConfig.rightSections as SectionWithCalc[]
      : (moduleData?.modelConfig?.leftSections as SectionWithCalc[] || moduleData?.modelConfig?.rightSections as SectionWithCalc[]);
  } else {
    rawSections = moduleData?.modelConfig?.sections as SectionWithCalc[] | undefined;
  }

  const basicThicknessMm = moduleData?.modelConfig?.basicThickness ?? DEFAULT_BASIC_THICKNESS_MM;

  if (!rawSections || rawSections.length === 0) {
    return {
      sections: [],
      heightsMm: [],
      basicThicknessMm
    };
  }

  const availableHeightMm = Math.max(internalHeightMm - basicThicknessMm * 2, 0);
  const hasCalculatedHeights = rawSections.every(section => typeof (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight === 'number');

  let heightsMm: number[];

  if (hasCalculatedHeights) {
    heightsMm = rawSections.map(section => {
      const calc = (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight;
      return Math.max(calc ?? 0, 0);
    });
  } else {
    const absoluteSections = rawSections.filter(section => section.heightType === 'absolute');
    const totalFixedMm = absoluteSections.reduce((sum, section) => {
      const value = typeof section.height === 'number' ? section.height : 0;
      return sum + Math.min(value, availableHeightMm);
    }, 0);

    const remainingMm = Math.max(availableHeightMm - totalFixedMm, 0);
    const percentageSections = rawSections.filter(section => section.heightType !== 'absolute');
    const totalPercentage = percentageSections.reduce((sum, section) => sum + (section.height ?? 0), 0);
    const percentageCount = percentageSections.length;

    heightsMm = rawSections.map(section => {
      if (section.heightType === 'absolute') {
        return Math.min(section.height ?? 0, availableHeightMm);
      }

      if (totalPercentage > 0) {
        return remainingMm * ((section.height ?? 0) / totalPercentage);
      }

      return percentageCount > 0 ? remainingMm / percentageCount : remainingMm;
    });

    const assignedMm = heightsMm.reduce((sum, value) => sum + value, 0);
    const diffMm = availableHeightMm - assignedMm;
    if (Math.abs(diffMm) > 0.01 && heightsMm.length > 0) {
      heightsMm[heightsMm.length - 1] = Math.max(heightsMm[heightsMm.length - 1] + diffMm, 0);
    }
  }

  return {
    sections: rawSections,
    heightsMm,
    basicThicknessMm
  };
};

export type ViewDirection = 'front' | 'left' | 'top' | 'door';

// 측면뷰 필터링 타입: 좌측뷰는 leftmost 가구만, 우측뷰는 rightmost 가구만
export type SideViewFilter = 'all' | 'leftmost' | 'rightmost';

export interface DxfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: string;
  color: number; // DXF ACI color code
}

export interface DxfText {
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

// 측면뷰에서 사용할 공간 깊이 (DXF 원점 보정용)
let currentSpaceDepthMm = 600;

const projectTo2D = (p: THREE.Vector3, scale: number): { x: number; y: number } => {
  switch (currentViewDirection) {
    case 'front':
      return { x: p.x * scale, y: p.y * scale };
    case 'top':
      return { x: p.x * scale, y: -p.z * scale }; // z축을 y로, 뒤집어서
    case 'left':
      // 좌측뷰: 카메라가 -X 방향에서 +X 방향을 봄
      // 3D에서: 백패널(Z-)은 뒤쪽, 앞판/서랍(Z+)은 앞쪽
      // 왼쪽에서 볼 때: 백패널(Z-)이 오른쪽에 보임, 앞판(Z+)이 왼쪽에 보임
      // DXF X = (depth/2 - Z) * scale → Z-가 큰 X (오른쪽), Z+가 작은 X (왼쪽)
      return { x: (currentSpaceDepthMm / 200 - p.z) * scale, y: p.y * scale };
    case 'right':
      // 우측뷰: 카메라가 +X 방향에서 -X 방향을 봄
      // 오른쪽에서 볼 때: 백패널(Z-)이 왼쪽에 보임, 앞판(Z+)이 오른쪽에 보임
      // DXF X = (Z + depth/2) * scale → Z-가 작은 X (왼쪽), Z+가 큰 X (오른쪽)
      return { x: (p.z + currentSpaceDepthMm / 200) * scale, y: p.y * scale };
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
      // 좌측뷰: 카메라가 -X에서 봄 → X값이 작은(음수/좌측) 엣지가 앞쪽
      // 좌측면뷰이므로 가구의 좌측 측판이 보임
      // 모든 엣지 포함 (측면뷰에서는 깊이 필터링 불필요)
      return true;

    case 'right':
      // 우측뷰: 카메라가 +X에서 봄 → X값이 큰(양수/우측) 엣지가 앞쪽
      // 우측면뷰이므로 가구의 우측 측판이 보임
      // 모든 엣지 포함 (측면뷰에서는 깊이 필터링 불필요)
      return true;

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
/**
 * 부모 계층에서 이름을 모두 수집하는 헬퍼 함수
 */
const getParentNamesChain = (obj: THREE.Object3D): string => {
  let names = '';
  let current: THREE.Object3D | null = obj.parent;
  while (current) {
    if (current.name) {
      names += ' ' + current.name.toLowerCase();
    }
    current = current.parent;
  }
  return names;
};

/**
 * 레이어 결정 함수 - 자신의 이름과 부모 계층 이름을 모두 확인
 */
const determineLayerWithParent = (obj: THREE.Object3D): string => {
  const name = obj.name || '';
  const lowerName = name.toLowerCase();
  const parentNames = getParentNamesChain(obj);
  const combinedNames = lowerName + parentNames;

  // 도어 치수선 (일반 치수선보다 먼저 체크)
  if (combinedNames.includes('door-dimension') || combinedNames.includes('door_dimension')) {
    return 'DOOR_DIMENSIONS';
  }

  // 치수선
  if (combinedNames.includes('dimension')) {
    return 'DIMENSIONS';
  }

  // 서랍 (앞판, 마이다 등) - DOOR보다 먼저 체크해서 별도 레이어로 분류
  if (combinedNames.includes('마이다') || combinedNames.includes('drawer-front') ||
      combinedNames.includes('서랍') || combinedNames.includes('drawer')) {
    return 'DRAWER';
  }

  // 도어 (대각선, 엣지 등) - 서랍 제외
  if (combinedNames.includes('door-diagonal') || combinedNames.includes('door-edge') ||
      combinedNames.includes('door_diagonal') || combinedNames.includes('door_edge') ||
      (lowerName.includes('door') && !combinedNames.includes('dimension'))) {
    return 'DOOR';
  }

  // 공간 프레임 (Room.tsx의 space-frame만 - 가구 프레임과 구분)
  if (combinedNames.includes('space-frame') || combinedNames.includes('space_frame')) {
    return 'SPACE_FRAME';
  }

  // 백패널
  if (combinedNames.includes('back-panel') || combinedNames.includes('backpanel') || combinedNames.includes('백패널')) {
    return 'BACK_PANEL';
  }

  // 옷봉 (브라켓 포함) - 부모가 clothing-rod면 옷봉 레이어
  if (combinedNames.includes('clothing-rod') || combinedNames.includes('clothingrod') || combinedNames.includes('옷봉')) {
    return 'CLOTHING_ROD';
  }

  // 환기캡 - 마젠타 (ACI 6) - 조절발보다 먼저 체크
  if (combinedNames.includes('ventilation') || combinedNames.includes('환기')) {
    return 'VENTILATION';
  }

  // 조절발 (상단 플레이트 포함) - 부모가 adjustable-foot면 악세서리 레이어
  if (combinedNames.includes('adjustable-foot') || combinedNames.includes('조절발')) {
    return 'ACCESSORIES';
  }

  // 엔드패널
  if (combinedNames.includes('end-panel') || combinedNames.includes('endpanel') || combinedNames.includes('엔드패널')) {
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

const determineLayer = (name: string): string => {
  const lowerName = name.toLowerCase();

  // 도어 치수선 (일반 치수선보다 먼저 체크)
  if (lowerName.includes('door-dimension') || lowerName.includes('door_dimension')) {
    return 'DOOR_DIMENSIONS';
  }

  // 치수선
  if (lowerName.includes('dimension')) {
    return 'DIMENSIONS';
  }

  // 서랍 (앞판, 마이다 등) - DOOR보다 먼저 체크해서 별도 레이어로 분류
  if (lowerName.includes('마이다') || lowerName.includes('drawer-front') ||
      lowerName.includes('서랍') || lowerName.includes('drawer')) {
    return 'DRAWER';
  }

  // 도어 (대각선, 엣지 등) - 서랍 제외
  if (lowerName.includes('door-diagonal') || lowerName.includes('door-edge') ||
      lowerName.includes('door_diagonal') || lowerName.includes('door_edge') ||
      (lowerName.includes('door') && !lowerName.includes('dimension'))) {
    return 'DOOR';
  }

  // 공간 프레임 (Room.tsx의 space-frame만 - 가구 프레임과 구분)
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
 * @param excludeDoor 도어 관련 객체 제외 여부 (front-no-door용)
 */
export const extractFromScene = (
  scene: THREE.Scene,
  viewDirection: ViewDirection,
  allowedXRange: { min: number; max: number } | null = null,
  excludeDoor: boolean = false
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

    // 정면뷰가 아닌 경우: 도어 대각선 제외
    if (viewDirection !== 'front' && name.toLowerCase().includes('door-diagonal')) {
      skippedByFilter++;
      return;
    }

    // excludeDoor 옵션이 true이면 도어 관련 객체 모두 제외 (front-no-door용)
    // 자신의 이름뿐만 아니라 부모 계층의 이름도 확인해서 door 관련 객체의 자식도 모두 제외
    // 단, 서랍(drawer)은 제외하지 않음 - 서랍은 별도 DRAWER 레이어로 처리
    if (excludeDoor) {
      const lowerNameForDoor = name.toLowerCase();
      // 서랍 관련은 제외하지 않음 (drawer, 서랍, 마이다)
      const isDrawerRelated = lowerNameForDoor.includes('drawer') ||
                              lowerNameForDoor.includes('서랍') ||
                              lowerNameForDoor.includes('마이다');
      if (!isDrawerRelated) {
        // 자신의 이름 확인 (door만)
        if (lowerNameForDoor.includes('door')) {
          console.log(`🚫 excludeDoor: 자신의 이름으로 제외 - ${name}`);
          skippedByFilter++;
          return;
        }
        // 부모 계층에서 door 관련 이름 확인 (door-diagonal, door-dimension 등의 자식 요소)
        let currentParent: THREE.Object3D | null = object.parent;
        while (currentParent) {
          if (currentParent.name) {
            const parentName = currentParent.name.toLowerCase();
            // 부모가 door이면서 drawer가 아닌 경우만 제외
            if (parentName.includes('door') && !parentName.includes('drawer')) {
              console.log(`🚫 excludeDoor: 부모 이름으로 제외 - ${name} (부모: ${currentParent.name})`);
              skippedByFilter++;
              return;
            }
          }
          currentParent = currentParent.parent;
        }
      }
    }

    // 탑뷰에서만 치수선 제외 (정면뷰, 측면뷰는 치수선 표시)
    if (viewDirection === 'top' && name.toLowerCase().includes('dimension')) {
      skippedByFilter++;
      return;
    }

    // 정면뷰에서 보강대 제외 (정면에서는 보이지 않음)
    if (viewDirection === 'front') {
      const lowerNameCheck = name.toLowerCase();
      if (lowerNameCheck.includes('보강대') ||
          lowerNameCheck.includes('reinforcement')) {
        skippedByFilter++;
        return;
      }
    }

    const lowerNameForFilter = name.toLowerCase();

    // 부모 계층에서 이름 확인하는 헬퍼 함수
    const getParentNamesForFilter = (obj: THREE.Object3D): string => {
      let names = '';
      let current: THREE.Object3D | null = obj.parent;
      while (current) {
        if (current.name) {
          names += ' ' + current.name.toLowerCase();
        }
        current = current.parent;
      }
      return names;
    };

    // 탑뷰에서 조절발, 옷봉, 환기캡 제외 (탑뷰에서 보이면 안되는 요소들)
    if (viewDirection === 'top') {
      const parentNames = getParentNamesForFilter(object);
      const combinedNames = lowerNameForFilter + parentNames;

      // 조절발 제외 (자신 또는 부모 계층에서 체크)
      if (combinedNames.includes('adjustable-foot') ||
          combinedNames.includes('조절발') ||
          combinedNames.includes('leveler')) {
        skippedByFilter++;
        return;
      }
      // 옷봉 제외 (자신 또는 부모 계층에서 체크)
      if (combinedNames.includes('clothing-rod') ||
          combinedNames.includes('옷봉')) {
        skippedByFilter++;
        return;
      }
      // 환기캡 제외 (탑뷰에서는 보이지 않음)
      if (combinedNames.includes('ventilation') ||
          combinedNames.includes('환기')) {
        skippedByFilter++;
        return;
      }
    }

    // Update world matrix
    object.updateMatrixWorld(true);
    const matrix = object.matrixWorld;
    // 부모 계층까지 확인하여 레이어 결정 (옷봉 브라켓, 조절발 플레이트 등)
    const layer = determineLayerWithParent(object);

    // 측면뷰에서 가구 및 치수선 X 위치 필터링 (allowedXRange가 있으면 해당 범위만 포함)
    // 공간 프레임만 필터링 제외 (항상 포함)
    // 조절발은 X 위치 필터링에서 제외 (가구와 함께 항상 표시)
    const isAdjustableFoot = lowerNameForFilter.includes('adjustable-foot') ||
                             lowerNameForFilter.includes('조절발') ||
                             lowerNameForFilter.includes('leveler');

    if (allowedXRange &&
        (viewDirection === 'left' || viewDirection === 'right') &&
        layer !== 'SPACE_FRAME' &&
        !isAdjustableFoot) {

      // 가구 관련 객체인 경우 X 위치 필터링 적용
      const isFurnitureObject = lowerNameForFilter.includes('furniture') ||
                                lowerNameForFilter.includes('shelf') ||
                                lowerNameForFilter.includes('panel') ||
                                lowerNameForFilter.includes('back-panel') ||
                                lowerNameForFilter.includes('clothing-rod') ||
                                lowerNameForFilter.includes('ventilation') ||
                                lowerNameForFilter.includes('door') ||
                                lowerNameForFilter.includes('drawer') ||
                                lowerNameForFilter.includes('보강대') ||
                                lowerNameForFilter.includes('선반') ||
                                lowerNameForFilter.includes('패널') ||
                                lowerNameForFilter.includes('옷봉') ||
                                lowerNameForFilter.includes('환기') ||
                                lowerNameForFilter.includes('서랍') ||
                                lowerNameForFilter.includes('도어');

      // 가구 내부 치수선만 X 위치 필터링 적용
      // CADDimensions2D 치수선(dimension_line)은 X=0에 있으므로 필터링 제외
      // 가구 내부 치수(DrawerRenderer, DoorModule 등)만 필터링
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

      // 디버그: 모든 Line2 객체 이름 출력 (door 관련 찾기용)
      if (lowerName.includes('door') || lowerName.includes('diagonal') || name === '') {
        console.log(`🔍 Line2 객체: name="${name}", color=${color}, 부모=${object.parent?.name || '없음'}`);
      }

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
      } else if (lowerName.includes('door-diagonal') || lowerName.includes('door-edge') || lowerName.includes('door')) {
        // 도어 관련 Line2 (대각선 열림방향 표시 포함)
        line2Color = 3; // ACI 3 = 연두색
        line2Layer = 'DOOR';
        if (lowerName.includes('door-diagonal')) {
          console.log(`📐 도어 대각선(Line2): ${name}, 색상 ACI=3, 레이어=DOOR`);
        } else {
          console.log(`📐 도어(Line2): ${name}, 색상 ACI=3으로 강제 설정`);
        }
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

        // 부모 계층에서도 이름 확인 (BoxWithEdges 내부 lineSegments가 부모의 컨텍스트를 상속받지 못할 수 있음)
        const getParentNames = (obj: THREE.Object3D): string => {
          let names = '';
          let current: THREE.Object3D | null = obj.parent;
          while (current) {
            if (current.name) {
              names += ' ' + current.name.toLowerCase();
            }
            current = current.parent;
          }
          return names;
        };
        const parentNames = getParentNames(lineSegObj);
        const combinedNames = lowerName + parentNames;

        const isBackPanelEdge = combinedNames.includes('back-panel') || combinedNames.includes('백패널');
        const isReinforcementEdge = combinedNames.includes('보강대') || combinedNames.includes('reinforcement');
        const isClothingRodEdge = combinedNames.includes('clothing-rod') || combinedNames.includes('옷봉');
        const isAdjustableFootEdge = combinedNames.includes('adjustable-foot') || combinedNames.includes('조절발');
        const isVentilationEdge = combinedNames.includes('ventilation') || combinedNames.includes('환기');

        // 가구 패널 엣지 감지 (furniture-edge-* 형태 이름)
        const isFurniturePanelEdge = lowerName.includes('furniture-edge');

        // 도어 엣지 감지: DoorModule.tsx에서 name="door-edge"로 설정됨
        const isDoorEdge = lowerName.includes('door-edge') || lowerName.includes('door');

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
        } else if (isReinforcementEdge) {
          console.log(`📐 보강대 엣지: ${name}, 추출된 색상 ACI=${lsColor}`);
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

        // 가구 패널/공간 프레임/도어 엣지는 뒤쪽 필터링 건너뜀 (좌측판, 우측판, 상판, 하판, 좌우상하 프레임 등 모두 보임)
        // 보강대(reinforcement)도 탑뷰에서 보여야 하므로 필터링 제외
        const skipBackFilter = isFurniturePanelEdge || isBackPanelEdge || isReinforcementEdge || isClothingRodEdge || isAdjustableFootEdge || isSpaceFrame || isDoorEdge;

        // 레이어 및 색상 결정 이유 로깅
        let lsLayer = layer; // 기본값은 determineLayer에서 결정된 값
        let colorReason = '기본';

        if (isBackPanelEdge) {
          lsLayer = 'BACK_PANEL';
          lsColor = 30; // ACI 30 = 오렌지 (2D에서 가구패널과 동일한 색상, 투명도 10%는 CAD에서 별도 설정)
          colorReason = '백패널';
        } else if (isReinforcementEdge) {
          lsLayer = 'BACK_PANEL'; // 보강대도 BACK_PANEL 레이어 사용
          lsColor = 30; // ACI 30 = 오렌지 (백패널과 동일)
          colorReason = '보강대';
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
        } else if (isDoorEdge) {
          lsLayer = 'DOOR';
          lsColor = 3; // ACI 3 = 연두색 (2D와 동일)
          colorReason = '도어';
          console.log(`📐 도어 엣지: ${name}, 색상 ACI=3 (연두색)`);
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
        if (isFurniturePanelEdge || isSpaceFrame || isBackPanelEdge || isReinforcementEdge) {
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
        } else if (lineLowerName.includes('door-diagonal') || lineLowerName.includes('door-edge') || lineLowerName.includes('door')) {
          // 도어 관련 Line (대각선 열림방향 표시 포함)
          lineColor = 3; // ACI 3 = 연두색
          lineLayer = 'DOOR';
          console.log(`📐 도어(Line): ${name}, 색상 ACI=3으로 강제 설정`);
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
    // 탑뷰에서만 치수 텍스트 제외 (정면뷰, 측면뷰는 치수 표시)
    // 도어 치수 텍스트(door-dimension-text)는 DOOR 레이어로 분류
    if (mesh.geometry && (mesh as any).text !== undefined) {
      // 탑뷰에서만 치수 텍스트 제외
      if (viewDirection === 'top') {
        console.log(`📝 ${viewDirection}뷰: 치수 텍스트 제외`);
        return;
      }

      const textContent = (mesh as any).text;
      if (textContent && typeof textContent === 'string') {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);

        const projPos = projectTo2D(worldPos, scale);

        // 자신 또는 부모 계층에서 door-dimension 확인
        let textLayer = 'DIMENSIONS';
        const textName = name.toLowerCase();
        if (textName.includes('door-dimension')) {
          textLayer = 'DOOR';
        } else {
          // 부모 계층에서 door-dimension 확인
          let current: THREE.Object3D | null = mesh.parent;
          while (current) {
            if (current.name && current.name.toLowerCase().includes('door-dimension')) {
              textLayer = 'DOOR';
              break;
            }
            current = current.parent;
          }
        }

        texts.push({
          x: projPos.x,
          y: projPos.y,
          text: textContent,
          height: 25, // 2.5mm text height
          color: 7, // 치수 텍스트는 흰색/검정 (ACI 7)
          layer: textLayer
        });
        textObjects++;
        console.log(`📝 텍스트 추출: "${textContent}" → ${textLayer} 레이어 (Z=${worldPos.z.toFixed(3)})`);
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
  const adjustableFootMeshes: typeof meshesForEdges = []; // 조절발
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
    // 옷봉 체크 먼저 (clothing-rod-mesh 패턴)
    if (name.includes('clothing-rod') || name.includes('옷봉')) {
      clothingRodMeshes.push(item);
    } else if (name.includes('adjustable-foot') || name.includes('조절발')) {
      adjustableFootMeshes.push(item);
    } else if (name.includes('백패널') || name.includes('back-panel') || name.includes('backpanel')) {
      backPanelMeshes.push(item);
    } else if (name.includes('선반') || name.includes('shelf')) {
      shelfMeshes.push(item);
    } else if (geometryType === 'BoxGeometry' || geometryType === 'BoxBufferGeometry') {
      // BoxGeometry는 가구 패널 또는 공간 프레임일 수 있음
      // material에서 추출한 원래 색상 사용
      otherFurnitureMeshes.push(item);
    }
  });

  console.log(`  선반: ${shelfMeshes.length}개, 백패널: ${backPanelMeshes.length}개, 옷봉: ${clothingRodMeshes.length}개, 조절발: ${adjustableFootMeshes.length}개, 기타: ${otherFurnitureMeshes.length}개`);

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

  // 조절발 - ACCESSORIES 레이어, 회색 (ACI 8)
  adjustableFootMeshes.forEach(({ mesh, matrix }) => {
    const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, 'ACCESSORIES', 8);
    if (extractedEdges.length > 0) {
      lines.push(...extractedEdges);
      meshEdgeCount += extractedEdges.length;
      console.log(`  ⚪ 조절발: ${mesh.name || '(무명)'}, ${extractedEdges.length}개, ACCESSORIES`);
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
 * PDF 내보내기에서도 재사용
 */
export const generateExternalDimensions = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection,
  sideViewFilter: SideViewFilter = 'all',
  dimensionsOnly: boolean = false, // true: 치수선만 생성, false: 가구형상 + 치수선
  actualFurnitureDepth?: number, // 측면뷰에서 씬에서 추출한 실제 가구 깊이 (mm)
  actualFurnitureMinX?: number, // 측면뷰에서 실제 가구 형상의 X 최소값
  actualFurnitureMaxX?: number // 측면뷰에서 실제 가구 형상의 X 최대값
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
    // 노서라운드일 경우 프레임이 없으므로 치수선 생략
    // ========================================
    const baseH = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;

    // Room.tsx와 동일하게 calculateFrameThickness 사용
    const hasLeftFurnitureFront = placedModules && placedModules.length > 0 &&
      placedModules.some(m => {
        const moduleX = m.position?.x || 0;
        const moduleWidth = (m.customWidth || 600) / 1000; // customWidth 사용 (PlacedModule 타입)
        const moduleLeftEdge = moduleX - moduleWidth / 2;
        return moduleLeftEdge < -halfWidth / 100 / 3;
      });
    const hasRightFurnitureFront = placedModules && placedModules.length > 0 &&
      placedModules.some(m => {
        const moduleX = m.position?.x || 0;
        const moduleWidth = (m.customWidth || 600) / 1000; // customWidth 사용 (PlacedModule 타입)
        const moduleRightEdge = moduleX + moduleWidth / 2;
        return moduleRightEdge > halfWidth / 100 / 3;
      });

    const frameThicknessFront = calculateFrameThickness(spaceInfo, hasLeftFurnitureFront, hasRightFurnitureFront);
    const leftFrameWidth = frameThicknessFront.leftMm;
    const rightFrameWidth = frameThicknessFront.rightMm;

    // 2단계 치수선 Y 위치 (전체 너비 치수선 아래, 120mm 간격)
    const dim2Y = topY - 120;

    // 노서라운드가 아닐 때만 프레임 치수선 표시
    if (spaceInfo.surroundType !== 'no-surround') {
      // 좌측 프레임 너비 치수선 (프레임이 있을 때만)
      if (leftFrameWidth > 0) {
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
      }

      // 우측 프레임 너비 치수선 (프레임이 있을 때만)
      if (rightFrameWidth > 0) {
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
      }

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
    }

    // ========================================
    // 3단계: 개별 슬롯/가구 너비 치수선 (2단계 아래)
    // ========================================
    const dim3Y = dim2Y - 120;

    // placedModules가 있으면 개별 가구 폭 치수선
    if (placedModules && placedModules.length > 0) {
      placedModules.forEach((module) => {
        // 실제 가구 폭 계산 (CleanCAD2D.tsx와 동일한 우선순위)
        // 1. customWidth (사용자 지정)
        // 2. adjustedWidth (기둥에 의한 조정)
        // 3. moduleId에서 폭 추출 (듀얼 가구: dual-xxx-1200 형태)
        // 4. 원본 모듈 dimensions.width
        const originalModuleData = getModuleById(module.moduleId);

        // moduleId에서 폭 추출 시도 (예: dual-lower-cabinet-2tier-1200 -> 1200)
        let widthFromId: number | undefined;
        if (module.moduleId) {
          const match = module.moduleId.match(/-(\d+)$/);
          if (match) {
            widthFromId = parseInt(match[1], 10);
          }
        }

        const originalWidth = originalModuleData?.dimensions?.width || widthFromId || 600;
        const moduleWidth = module.customWidth || module.adjustedWidth || originalWidth;
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
          text: `${Math.round(moduleWidth)}`, height: 20, color: dimensionColor, layer: 'DIMENSIONS'
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
    const frameSize = spaceInfo.frameSize || { left: 18, right: 18, top: 30 };
    const topFrameThick = frameSize.top || 30;
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
    // leftFrameWidth, rightFrameWidth는 위에서 이미 선언됨

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
    // ========================================
    // 탑뷰 치수선 (위에서 내려다본 뷰)
    // ========================================
    // CleanCAD2D.tsx의 좌표계를 정확히 따름:
    // - Three.js: spaceZOffset = -spaceDepth / 2 (음수)
    // - projectTo2D 변환: y = -p.z * scale
    // - Three.js Z가 음수 → DXF Y가 양수 (도면 상단)
    // ========================================
    console.log('📏 상부뷰: 치수선 생성 (CleanCAD2D 좌표계 적용)');

    const halfWidth = width / 2;

    // Room.tsx와 동일하게 calculateFrameThickness 사용
    // hasLeftFurniture, hasRightFurniture 계산
    const hasLeftFurniture = placedModules && placedModules.length > 0 &&
      placedModules.some(m => {
        const moduleX = m.position?.x || 0;
        const moduleWidth = (m.customWidth || 600) / 1000; // customWidth 사용 (PlacedModule 타입)
        const moduleLeftEdge = moduleX - moduleWidth / 2;
        // 가구 왼쪽 끝이 공간 왼쪽 1/3 안에 있으면 왼쪽에 가구 있음
        return moduleLeftEdge < -halfWidth / 100 / 3;
      });
    const hasRightFurniture = placedModules && placedModules.length > 0 &&
      placedModules.some(m => {
        const moduleX = m.position?.x || 0;
        const moduleWidth = (m.customWidth || 600) / 1000; // customWidth 사용 (PlacedModule 타입)
        const moduleRightEdge = moduleX + moduleWidth / 2;
        // 가구 오른쪽 끝이 공간 오른쪽 1/3 안에 있으면 오른쪽에 가구 있음
        return moduleRightEdge > halfWidth / 100 / 3;
      });

    // calculateFrameThickness로 정확한 프레임 두께 계산
    const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
    const leftFrameWidth = frameThickness.leftMm;
    const rightFrameWidth = frameThickness.rightMm;

    // 가구 깊이 계산 (actualFurnitureDepth 우선, 없으면 placedModules에서 추출)
    let furnitureDepthMm = 600; // 기본값 600mm
    if (actualFurnitureDepth && actualFurnitureDepth > 0) {
      // 측면뷰에서 씬에서 추출한 실제 가구 깊이 사용
      furnitureDepthMm = actualFurnitureDepth;
    } else if (placedModules && placedModules.length > 0) {
      const moduleDepths = placedModules.map(m => m.customDepth || 600);
      furnitureDepthMm = Math.max(...moduleDepths);
    }

    // 실제 가구 형상 X 범위 (상/하단 깊이 치수선 위치에 사용)
    const furnitureXMin = actualFurnitureMinX !== undefined ? actualFurnitureMinX : 0;
    const furnitureXMax = actualFurnitureMaxX !== undefined ? actualFurnitureMaxX : furnitureDepthMm;

    // ========================================
    // CleanCAD2D.tsx와 동일한 좌표 계산
    // ========================================
    // CleanCAD2D.tsx (line 4921-4965):
    // const panelDepthMm = spaceInfo.depth || 600;
    // const furnitureDepthMm = Math.min(panelDepthMm, 600);
    // const panelDepth = mmToThreeUnits(panelDepthMm);
    // const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    // const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
    // const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
    // furnitureBackZ = furnitureZ - depth/2;
    // furnitureFrontZ = furnitureZ + depth/2;

    const panelDepthMm = depth; // spaceInfo.depth
    const maxFurnitureDepthMm = Math.min(panelDepthMm, 600);
    const doorThicknessMm = 20;

    // Three.js 좌표 (meter 단위, 1 Three.js unit = 0.01m = 10mm)
    // spaceZOffset = -spaceDepth / 2 (Three.js)
    const spaceZOffsetThree = -panelDepthMm / 2 * 0.01; // Three.js meter 단위
    const furnitureDepthThree = maxFurnitureDepthMm * 0.01;
    const panelDepthThree = panelDepthMm * 0.01;
    const doorThicknessThree = doorThicknessMm * 0.01;
    const moduleDepthThree = furnitureDepthMm * 0.01;

    // CleanCAD2D와 동일한 계산
    const furnitureZOffset = spaceZOffsetThree + (panelDepthThree - furnitureDepthThree) / 2;
    const furnitureZ = furnitureZOffset + furnitureDepthThree/2 - doorThicknessThree - moduleDepthThree/2;
    const furnitureBackZ = furnitureZ - moduleDepthThree/2;   // 가구 뒷면 (Three.js Z, 음수)
    const furnitureFrontZ = furnitureZ + moduleDepthThree/2;  // 가구 앞면 (Three.js Z, 음수~0 근처)

    // projectTo2D 변환 적용: DXF Y = -Z * 100 (scale)
    const furnitureBackY = -furnitureBackZ * 100;   // 가구 뒷면 → DXF Y (양수, 도면 상단)
    const furnitureFrontY = -furnitureFrontZ * 100; // 가구 앞면 → DXF Y (양수 또는 0)

    // 프레임 영역 좌표 계산 (Room.tsx의 frameEndZ 로직과 동일)
    // Room.tsx: const frameEndZ = furnitureZOffset + furnitureDepth / 2; // 좌우 프레임의 앞쪽 끝
    // 프레임은 공간 뒷벽(roomBackZ)부터 가구 영역 앞면(frameEndZ)까지
    const roomBackZ = -panelDepthThree / 2;  // 공간 뒷벽 Z
    const frameEndZ = furnitureZOffset + furnitureDepthThree / 2;  // 프레임 앞쪽 끝 (가구 영역 앞면)
    const frameBackY = -roomBackZ * 100;    // 프레임 뒷면 → DXF Y (도면 상단)
    const frameFrontY = -frameEndZ * 100;   // 프레임 앞면 → DXF Y (도면 하단)

    console.log(`📐 탑뷰 좌표 계산:`);
    console.log(`  - spaceZOffset(Three.js): ${spaceZOffsetThree.toFixed(4)}m`);
    console.log(`  - furnitureBackZ(Three.js): ${furnitureBackZ.toFixed(4)}m → DXF Y: ${furnitureBackY.toFixed(1)}mm`);
    console.log(`  - furnitureFrontZ(Three.js): ${furnitureFrontZ.toFixed(4)}m → DXF Y: ${furnitureFrontY.toFixed(1)}mm`);
    console.log(`  - 프레임 영역: frameBackY=${frameBackY.toFixed(1)}mm, frameFrontY=${frameFrontY.toFixed(1)}mm`);

    // 치수선 설정
    const dimOffset = 200;  // 치수선 오프셋 (가구 뒤쪽 위 200mm)
    const extLength = 50;   // 연장선 길이
    const dimColor = 7;     // 흰색 (ACI 7)

    // ========================================
    // 1. 좌측에 가구 깊이 치수선
    // ========================================
    const leftDimX = -halfWidth - dimOffset;

    // 가구 깊이 치수선 (세로선) - 가구 앞면에서 뒷면까지
    lines.push({
      x1: leftDimX, y1: furnitureFrontY, x2: leftDimX, y2: furnitureBackY,
      layer: 'DIMENSIONS', color: dimColor
    });
    // 상단(뒷면 방향) 연장선 - 가구 뒷면에서 치수선까지
    lines.push({
      x1: -halfWidth + leftFrameWidth, y1: furnitureBackY, x2: leftDimX - extLength, y2: furnitureBackY,
      layer: 'DIMENSIONS', color: dimColor
    });
    // 하단(앞면 방향) 연장선 - 가구 앞면에서 치수선까지
    lines.push({
      x1: -halfWidth + leftFrameWidth, y1: furnitureFrontY, x2: leftDimX - extLength, y2: furnitureFrontY,
      layer: 'DIMENSIONS', color: dimColor
    });
    // 가구 깊이 텍스트
    texts.push({
      x: leftDimX - 30, y: (furnitureFrontY + furnitureBackY) / 2,
      text: `${furnitureDepthMm}`, height: 20, color: dimColor, layer: 'DIMENSIONS'
    });

    // ========================================
    // 2. 상단에 공간 전체 너비 치수선 (가구 뒤쪽 위에)
    // ========================================
    const topDimY = furnitureBackY + dimOffset;  // 가구 뒤쪽 위에 배치

    // 전체 너비 치수선 (가로선)
    lines.push({
      x1: -halfWidth, y1: topDimY, x2: halfWidth, y2: topDimY,
      layer: 'DIMENSIONS', color: dimColor
    });
    // 좌측 연장선 - 가구 뒤쪽에서 치수선까지
    lines.push({
      x1: -halfWidth, y1: furnitureBackY, x2: -halfWidth, y2: topDimY + extLength,
      layer: 'DIMENSIONS', color: dimColor
    });
    // 우측 연장선 - 가구 뒤쪽에서 치수선까지
    lines.push({
      x1: halfWidth, y1: furnitureBackY, x2: halfWidth, y2: topDimY + extLength,
      layer: 'DIMENSIONS', color: dimColor
    });
    // 전체 너비 텍스트
    texts.push({
      x: 0, y: topDimY + 20,
      text: `${width}`, height: 25, color: dimColor, layer: 'DIMENSIONS'
    });

    // ========================================
    // 3. 공간 너비 아래에 개별 가구 너비 치수선
    // ========================================
    const dim2Y = topDimY - 100;  // 전체 너비 치수선 아래 100mm

    if (placedModules && placedModules.length > 0) {
      placedModules.forEach((module) => {
        // 실제 가구 폭 계산 (정면도와 동일한 로직)
        const originalModuleData = getModuleById(module.moduleId);

        // moduleId에서 폭 추출 시도 (예: dual-lower-cabinet-2tier-1200 -> 1200)
        let widthFromId: number | undefined;
        if (module.moduleId) {
          const match = module.moduleId.match(/-(\d+)$/);
          if (match) {
            widthFromId = parseInt(match[1], 10);
          }
        }

        const originalWidth = originalModuleData?.dimensions?.width || widthFromId || 600;
        const moduleWidth = module.customWidth || module.adjustedWidth || originalWidth;
        const moduleX = module.position?.x || 0;
        const moduleLeftX = (moduleX * 100) - moduleWidth / 2;  // position.x는 meter 단위
        const moduleRightX = (moduleX * 100) + moduleWidth / 2;

        // 개별 가구 너비 치수선
        lines.push({
          x1: moduleLeftX, y1: dim2Y, x2: moduleRightX, y2: dim2Y,
          layer: 'DIMENSIONS', color: dimColor
        });
        // 좌측 연장선 - 가구 뒤쪽에서 치수선까지
        lines.push({
          x1: moduleLeftX, y1: furnitureBackY, x2: moduleLeftX, y2: dim2Y + extLength,
          layer: 'DIMENSIONS', color: dimColor
        });
        // 우측 연장선 - 가구 뒤쪽에서 치수선까지
        lines.push({
          x1: moduleRightX, y1: furnitureBackY, x2: moduleRightX, y2: dim2Y + extLength,
          layer: 'DIMENSIONS', color: dimColor
        });
        // 가구 너비 텍스트
        texts.push({
          x: (moduleLeftX + moduleRightX) / 2, y: dim2Y + 20,
          text: `${Math.round(moduleWidth)}`, height: 20, color: dimColor, layer: 'DIMENSIONS'
        });
      });
    }

    // ========================================
    // 4. 탑뷰 좌/우 프레임/엔드패널 - 데이터 기반 계산
    // ========================================
    // Room.tsx 로직:
    // - 벽 있음 (프레임): 18mm 깊이, 가구 앞면 근처에 위치
    // - 벽 없음 (엔드패널): 뒷벽부터 가구 앞면-20mm까지 (전체 깊이)
    const wallConfig = spaceInfo.wallConfig || { left: true, right: true };
    const hasLeftWall = wallConfig.left !== false;
    const hasRightWall = wallConfig.right !== false;

    const frameDepthMm = 18; // END_PANEL_THICKNESS (프레임일 때)
    // 프레임 Z 위치 계산 (Room.tsx와 동일)
    const frameZThree = furnitureZOffset + furnitureDepthThree / 2 - 0.18 / 2 + 0.03; // Three.js 좌표
    const frameFrontEdgeY = -frameZThree * 100 - frameDepthMm / 2; // 프레임 앞면 (DXF Y)
    const frameBackEdgeY = -frameZThree * 100 + frameDepthMm / 2;  // 프레임 뒷면 (DXF Y)

    // 엔드패널 깊이 계산 (Room.tsx의 noSurroundEndPanelDepth 로직)
    // Room.tsx: const slotFloorDepth = frameEndZ - roomBackZ - mmToThreeUnits(20);
    // Room.tsx: const noSurroundEndPanelDepth = slotFloorDepth;
    // Room.tsx: const noSurroundEndPanelZ = roomBackZ + noSurroundEndPanelDepth / 2;
    const slotFloorDepthThree = frameEndZ - roomBackZ - 0.20; // 0.20 = 20mm in Three.js units
    const endPanelFrontY = frameFrontY; // 가구 영역 앞면 (frameEndZ와 동일)
    const endPanelBackY = frameBackY;   // 뒷벽

    console.log(`📐 탑뷰 좌/우 프레임/엔드패널 데이터 기반 생성:`);
    console.log(`  - leftFrameWidth: ${leftFrameWidth}mm, hasLeftWall: ${hasLeftWall}`);
    console.log(`  - rightFrameWidth: ${rightFrameWidth}mm, hasRightWall: ${hasRightWall}`);
    console.log(`  - 프레임(벽있음) 깊이: ${frameDepthMm}mm, Y: ${frameFrontEdgeY.toFixed(1)}~${frameBackEdgeY.toFixed(1)}`);
    console.log(`  - 엔드패널(벽없음) 깊이: ${(endPanelBackY - endPanelFrontY).toFixed(1)}mm, Y: ${endPanelFrontY.toFixed(1)}~${endPanelBackY.toFixed(1)}`);

    const frameColor = 3; // ACI 3 = 연두색 (2D 프레임 색상과 동일)
    const endPanelColor = 3; // 엔드패널도 같은 색상

    // 좌측 프레임/엔드패널 외곽선
    if (leftFrameWidth > 0) {
      const leftFrameLeftX = -halfWidth;
      const leftFrameRightX = -halfWidth + leftFrameWidth;

      // 벽 유무에 따라 깊이 결정
      const leftFrontY = hasLeftWall ? frameFrontEdgeY : endPanelFrontY;
      const leftBackY = hasLeftWall ? frameBackEdgeY : endPanelBackY;
      const leftLayer = hasLeftWall ? 'SPACE_FRAME' : 'END_PANEL';
      const leftColor = hasLeftWall ? frameColor : endPanelColor;

      // 4개 변: 앞쪽, 뒤쪽, 좌측, 우측
      // 앞쪽 (X 방향)
      lines.push({
        x1: leftFrameLeftX, y1: leftFrontY,
        x2: leftFrameRightX, y2: leftFrontY,
        layer: leftLayer, color: leftColor
      });
      // 뒤쪽 (X 방향)
      lines.push({
        x1: leftFrameLeftX, y1: leftBackY,
        x2: leftFrameRightX, y2: leftBackY,
        layer: leftLayer, color: leftColor
      });
      // 좌측 (Y 방향)
      lines.push({
        x1: leftFrameLeftX, y1: leftFrontY,
        x2: leftFrameLeftX, y2: leftBackY,
        layer: leftLayer, color: leftColor
      });
      // 우측 (Y 방향)
      lines.push({
        x1: leftFrameRightX, y1: leftFrontY,
        x2: leftFrameRightX, y2: leftBackY,
        layer: leftLayer, color: leftColor
      });
      console.log(`  ✅ 좌측 ${hasLeftWall ? '프레임' : '엔드패널'} 추가: X ${leftFrameLeftX}~${leftFrameRightX}, Y ${leftFrontY.toFixed(1)}~${leftBackY.toFixed(1)}`);
    }

    // 우측 프레임/엔드패널 외곽선
    if (rightFrameWidth > 0) {
      const rightFrameLeftX = halfWidth - rightFrameWidth;
      const rightFrameRightX = halfWidth;

      // 벽 유무에 따라 깊이 결정
      const rightFrontY = hasRightWall ? frameFrontEdgeY : endPanelFrontY;
      const rightBackY = hasRightWall ? frameBackEdgeY : endPanelBackY;
      const rightLayer = hasRightWall ? 'SPACE_FRAME' : 'END_PANEL';
      const rightColor = hasRightWall ? frameColor : endPanelColor;

      // 4개 변: 앞쪽, 뒤쪽, 좌측, 우측
      // 앞쪽 (X 방향)
      lines.push({
        x1: rightFrameLeftX, y1: rightFrontY,
        x2: rightFrameRightX, y2: rightFrontY,
        layer: rightLayer, color: rightColor
      });
      // 뒤쪽 (X 방향)
      lines.push({
        x1: rightFrameLeftX, y1: rightBackY,
        x2: rightFrameRightX, y2: rightBackY,
        layer: rightLayer, color: rightColor
      });
      // 좌측 (Y 방향)
      lines.push({
        x1: rightFrameLeftX, y1: rightFrontY,
        x2: rightFrameLeftX, y2: rightBackY,
        layer: rightLayer, color: rightColor
      });
      // 우측 (Y 방향)
      lines.push({
        x1: rightFrameRightX, y1: rightFrontY,
        x2: rightFrameRightX, y2: rightBackY,
        layer: rightLayer, color: rightColor
      });
      console.log(`  ✅ 우측 ${hasRightWall ? '프레임' : '엔드패널'} 추가: X ${rightFrameLeftX}~${rightFrameRightX}, Y ${rightFrontY.toFixed(1)}~${rightBackY.toFixed(1)}`);
    }

    // ========================================
    // 5. 탑뷰 좌/우 서브프레임 - 가구 옆면에 붙어 Y방향(깊이방향)으로 44mm 뻗어있음
    // ========================================
    // Room.tsx 기준:
    // - position.z = furnitureZOffset + furnitureDepth/2 - 9mm - 28mm (가구 앞면에서 37mm 안쪽이 중심)
    // - args = [44mm, height, 18mm], rotation = [0, π/2, 0]
    // - 회전 후: Z방향(깊이)으로 44mm, X방향으로 18mm
    //
    // 탑뷰에서:
    // - 서브프레임은 가구 앞면 근처에서 시작하여 안쪽으로 44mm 뻗어있음
    // - 중심이 가구 앞면에서 37mm 안쪽이므로, 시작=앞면+15mm, 끝=앞면+15mm+44mm
    const subFrameThickX = 18; // X방향 두께 18mm (END_PANEL_THICKNESS)
    const subFrameLengthY = 44; // Y방향 길이 44mm

    // 서브프레임 Z 위치 계산 (Room.tsx와 동일)
    // 중심 Z = furnitureZOffset + furnitureDepth/2 - 9mm - 28mm = 가구 앞면에서 37mm 안쪽
    // 서브프레임은 이 중심을 기준으로 ±22mm (총 44mm)
    const subFrameCenterZ = furnitureZOffset + furnitureDepthThree / 2 - 0.09 - 0.28;
    const subFrameCenterY = -subFrameCenterZ * 100; // DXF Y 좌표
    const subFrameStartY = subFrameCenterY - subFrameLengthY / 2;  // 앞쪽
    const subFrameEndY = subFrameCenterY + subFrameLengthY / 2;    // 뒤쪽

    console.log(`📐 서브프레임 위치 (가구 옆면에 붙음):`);
    console.log(`  - 중심Y: ${subFrameCenterY.toFixed(1)}, Y범위: ${subFrameStartY.toFixed(1)} ~ ${subFrameEndY.toFixed(1)} (44mm)`);
    console.log(`  - 가구 Y범위: ${furnitureFrontY.toFixed(1)} ~ ${furnitureBackY.toFixed(1)}`);

    // 좌측 서브프레임 (가구 측면에 겹쳐서 위치, 메인 프레임과는 떨어져 있음)
    // Room.tsx 조건과 동일: surroundType !== 'no-surround' && (builtin || (semistanding && wallConfig.left))
    // wallConfig는 이미 위에서 선언됨
    const showLeftSubFrame = spaceInfo.surroundType !== 'no-surround' && leftFrameWidth > 0 &&
      (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
        (spaceInfo.installType === 'semistanding' && wallConfig?.left));
    const showRightSubFrame = spaceInfo.surroundType !== 'no-surround' && rightFrameWidth > 0 &&
      (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in' ||
        (spaceInfo.installType === 'semistanding' && wallConfig?.right));

    if (showLeftSubFrame) {
      // Room.tsx 기준:
      // - position.x = xOffset + frameThickness.left - 9mm (중심 위치)
      // - rotation 후 X 두께 = 18mm
      // - 따라서 왼쪽 끝 = 중심 - 9mm, 오른쪽 끝 = 중심 + 9mm
      // DXF에서 xOffset = 0 이므로:
      // - 중심X = -halfWidth + leftFrameWidth - 9
      // - 왼쪽X = 중심X - 9 = -halfWidth + leftFrameWidth - 18
      // - 오른쪽X = 중심X + 9 = -halfWidth + leftFrameWidth
      const subFrameCenterX = -halfWidth + leftFrameWidth - 9;
      const subFrameLeftX = subFrameCenterX - 9;  // 중심에서 -9mm
      const subFrameRightX = subFrameCenterX + 9; // 중심에서 +9mm (가구 측면과 겹침)

      // 4개 변 (X방향 18mm, Y방향 44mm 직사각형)
      // 앞쪽 변 (X방향) - 가구 앞면
      lines.push({
        x1: subFrameLeftX, y1: subFrameStartY,
        x2: subFrameRightX, y2: subFrameStartY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      // 뒤쪽 변 (X방향) - 가구 안쪽
      lines.push({
        x1: subFrameLeftX, y1: subFrameEndY,
        x2: subFrameRightX, y2: subFrameEndY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      // 왼쪽 변 (Y방향)
      lines.push({
        x1: subFrameLeftX, y1: subFrameStartY,
        x2: subFrameLeftX, y2: subFrameEndY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      // 오른쪽 변 (Y방향)
      lines.push({
        x1: subFrameRightX, y1: subFrameStartY,
        x2: subFrameRightX, y2: subFrameEndY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      console.log(`  ✅ 좌측 서브프레임: X ${subFrameLeftX.toFixed(1)}~${subFrameRightX.toFixed(1)} (18mm), Y ${subFrameStartY.toFixed(1)}~${subFrameEndY.toFixed(1)} (44mm)`);
    }

    // 우측 서브프레임 (가구 측면에 겹쳐서 위치, 메인 프레임과는 떨어져 있음)
    if (showRightSubFrame) {
      // Room.tsx 기준:
      // - position.x = xOffset + width - frameThickness.right + 9mm (중심 위치)
      // - rotation 후 X 두께 = 18mm
      // DXF에서 xOffset = 0 이므로:
      // - 중심X = halfWidth - rightFrameWidth + 9
      // - 왼쪽X = 중심X - 9 = halfWidth - rightFrameWidth (가구 측면과 겹침)
      // - 오른쪽X = 중심X + 9 = halfWidth - rightFrameWidth + 18
      const subFrameCenterX = halfWidth - rightFrameWidth + 9;
      const subFrameLeftX = subFrameCenterX - 9;  // 중심에서 -9mm (가구 측면과 겹침)
      const subFrameRightX = subFrameCenterX + 9; // 중심에서 +9mm

      // 4개 변 (X방향 18mm, Y방향 44mm 직사각형)
      // 앞쪽 변 (X방향) - 가구 앞면
      lines.push({
        x1: subFrameLeftX, y1: subFrameStartY,
        x2: subFrameRightX, y2: subFrameStartY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      // 뒤쪽 변 (X방향) - 가구 안쪽
      lines.push({
        x1: subFrameLeftX, y1: subFrameEndY,
        x2: subFrameRightX, y2: subFrameEndY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      // 왼쪽 변 (Y방향)
      lines.push({
        x1: subFrameLeftX, y1: subFrameStartY,
        x2: subFrameLeftX, y2: subFrameEndY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      // 오른쪽 변 (Y방향)
      lines.push({
        x1: subFrameRightX, y1: subFrameStartY,
        x2: subFrameRightX, y2: subFrameEndY,
        layer: 'SPACE_FRAME', color: frameColor
      });
      console.log(`  ✅ 우측 서브프레임: X ${subFrameLeftX.toFixed(1)}~${subFrameRightX.toFixed(1)} (18mm), Y ${subFrameStartY.toFixed(1)}~${subFrameEndY.toFixed(1)} (44mm)`);
    }

    // ========================================
    // 6. 탑뷰 백패널 보강대 - 씬에서 추출
    // 데이터 기반 생성 제거 - 3D 씬에서 보강대가 이미 렌더링되어 있으므로 씬 추출에 의존
    // ========================================
    // 보강대는 씬 추출 라인에서 표시됨

  } else if (viewDirection === 'left' || viewDirection === 'right') {
    // ========================================
    // 측면뷰 DXF - 가구 형상을 데이터 기반으로 직접 생성
    // 2D 뷰어(CleanCAD2D)와 동일한 형상 생성
    // 치수선은 생성하지 않음 (2D 뷰어와 동일)
    //
    // 좌측뷰(left): 카메라가 -X에서 봄 → DXF X=0이 앞면(Z+), X=깊이가 뒷면/백패널(Z-)
    // 우측뷰(right): 카메라가 +X에서 봄 → DXF X=0이 뒷면/백패널(Z-), X=깊이가 앞면(Z+)
    // ========================================
    console.log(`📏 ${viewDirection}뷰: 측면도 가구 형상 생성 (데이터 기반)`);

    // ========================================
    // 1. spaceInfo에서 실제 값 가져오기
    // ========================================
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 30 };
    const topFrameHeightMm = frameSize.top || 0;

    // 띄워서 배치 확인
    const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const floatHeightMm = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;

    // 바닥레일/받침대 높이 계산
    const isStandType = spaceInfo.baseConfig?.type === 'stand';
    const railOrBaseHeightMm = isStandType
      ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))
      : (spaceInfo.baseConfig?.height || 65);

    // 받침대 깊이
    const baseDepthMm = spaceInfo.baseConfig?.depth || 0;

    // 하부 프레임 높이 (받침대 또는 바닥레일)
    const baseFrameHeightMm = isFloating ? 0 : railOrBaseHeightMm;

    // 가구 시작 Y 위치
    const furnitureBaseY = isFloating ? floatHeightMm : baseFrameHeightMm;

    // 가구 깊이 계산 (sideViewFilter에 따라 올바른 가구 선택)
    let furnitureDepthMm = 600; // 기본값
    let furnitureHeightMm = height - topFrameHeightMm - baseFrameHeightMm;

    if (placedModules.length > 0) {
      // sideViewFilter에 따라 올바른 가구 선택
      let targetModule: PlacedModule;

      if (sideViewFilter === 'leftmost') {
        // 좌측뷰: 맨 왼쪽 가구 (X 좌표가 가장 작은 가구)
        targetModule = placedModules.reduce((prev, curr) => {
          const prevX = prev.position?.x || 0;
          const currX = curr.position?.x || 0;
          return currX < prevX ? curr : prev;
        });
        console.log(`📐 좌측뷰: 맨 왼쪽 가구 선택 (X=${targetModule.position?.x || 0})`);
      } else if (sideViewFilter === 'rightmost') {
        // 우측뷰: 맨 오른쪽 가구 (X 좌표가 가장 큰 가구)
        targetModule = placedModules.reduce((prev, curr) => {
          const prevX = prev.position?.x || 0;
          const currX = curr.position?.x || 0;
          return currX > prevX ? curr : prev;
        });
        console.log(`📐 우측뷰: 맨 오른쪽 가구 선택 (X=${targetModule.position?.x || 0})`);
      } else {
        // 기본: 첫 번째 가구
        targetModule = placedModules[0];
      }

      const moduleDepth = targetModule.upperSectionDepth || targetModule.customDepth;
      if (moduleDepth) {
        furnitureDepthMm = moduleDepth;
      }
      if (targetModule.customHeight) {
        furnitureHeightMm = targetModule.customHeight;
      }
    }

    // 색상 정의 (흰색으로 통일 - 2D 뷰어처럼 깔끔하게)
    const lineColor = 7;  // ACI 7 = 흰색

    console.log(`📐 ${viewDirection}뷰 가구 형상 (데이터 기반):`);
    console.log(`  - 전체 높이: ${height}mm`);
    console.log(`  - 가구 깊이: ${furnitureDepthMm}mm`);
    console.log(`  - 가구 높이: ${furnitureHeightMm}mm`);
    console.log(`  - 상부 프레임 높이: ${topFrameHeightMm}mm`);
    console.log(`  - 하부 프레임/받침대 높이: ${baseFrameHeightMm}mm`);
    console.log(`  - 받침대 깊이: ${baseDepthMm}mm`);
    console.log(`  - 띄움 배치: ${isFloating}, 띄움 높이: ${floatHeightMm}mm`);

    // ========================================
    // 좌표 변환 함수 - 좌측뷰/우측뷰에 따라 X축 방향 결정
    // projectTo2D와 일치하도록:
    // 좌측뷰: X=0이 앞면(Z+), X=깊이가 뒷면(Z-)
    // 우측뷰: X=0이 뒷면(Z-), X=깊이가 앞면(Z+)
    // ========================================
    const transformX = (x: number): number => {
      if (viewDirection === 'right') {
        // 우측뷰: X축 뒤집기 (0 ↔ 깊이)
        return furnitureDepthMm - x;
      }
      return x; // 좌측뷰: 그대로
    };

    // ========================================
    // 2~5. 가구 형상 (dimensionsOnly가 false일 때만)
    // 씬에서 추출한 데이터를 사용할 때는 치수선만 생성
    // ========================================
    if (!dimensionsOnly) {
      // ========================================
      // 2. 가구 측판 외곽선 (사각형)
      // ========================================
      const panelLeft = transformX(0);
      const panelRight = transformX(furnitureDepthMm);
      const panelBottom = furnitureBaseY;
      const panelTop = furnitureBaseY + furnitureHeightMm;

      // 측판 외곽선 (사각형) - 좌우가 뒤바뀔 수 있으므로 min/max 사용
      const minX = Math.min(panelLeft, panelRight);
      const maxX = Math.max(panelLeft, panelRight);

      lines.push({ x1: minX, y1: panelBottom, x2: maxX, y2: panelBottom, layer: 'FURNITURE_PANEL', color: lineColor });
      lines.push({ x1: maxX, y1: panelBottom, x2: maxX, y2: panelTop, layer: 'FURNITURE_PANEL', color: lineColor });
      lines.push({ x1: maxX, y1: panelTop, x2: minX, y2: panelTop, layer: 'FURNITURE_PANEL', color: lineColor });
      lines.push({ x1: minX, y1: panelTop, x2: minX, y2: panelBottom, layer: 'FURNITURE_PANEL', color: lineColor });

      // ========================================
      // 3. 상부 프레임 (있는 경우)
      // ========================================
      if (topFrameHeightMm > 0) {
        const topFrameBottom = height - topFrameHeightMm;
        const topFrameTop = height;

        // 상부 프레임 사각형
        lines.push({ x1: minX, y1: topFrameBottom, x2: maxX, y2: topFrameBottom, layer: 'SPACE_FRAME', color: lineColor });
        lines.push({ x1: maxX, y1: topFrameBottom, x2: maxX, y2: topFrameTop, layer: 'SPACE_FRAME', color: lineColor });
        lines.push({ x1: maxX, y1: topFrameTop, x2: minX, y2: topFrameTop, layer: 'SPACE_FRAME', color: lineColor });
        lines.push({ x1: minX, y1: topFrameTop, x2: minX, y2: topFrameBottom, layer: 'SPACE_FRAME', color: lineColor });
      }

      // ========================================
      // 4. 하부 프레임/받침대 (있는 경우)
      // ========================================
      if (baseFrameHeightMm > 0) {
        const baseBottom = 0;
        const baseTop = baseFrameHeightMm;
        // 받침대 깊이가 있으면 사용, 없으면 가구 깊이 사용
        const actualBaseDepth = baseDepthMm > 0 ? baseDepthMm : furnitureDepthMm;
        const baseLeft = transformX(0);
        const baseRight = transformX(actualBaseDepth);
        const baseMinX = Math.min(baseLeft, baseRight);
        const baseMaxX = Math.max(baseLeft, baseRight);

        // 하부 프레임/받침대 사각형
        lines.push({ x1: baseMinX, y1: baseBottom, x2: baseMaxX, y2: baseBottom, layer: 'SPACE_FRAME', color: lineColor });
        lines.push({ x1: baseMaxX, y1: baseBottom, x2: baseMaxX, y2: baseTop, layer: 'SPACE_FRAME', color: lineColor });
        lines.push({ x1: baseMaxX, y1: baseTop, x2: baseMinX, y2: baseTop, layer: 'SPACE_FRAME', color: lineColor });
        lines.push({ x1: baseMinX, y1: baseTop, x2: baseMinX, y2: baseBottom, layer: 'SPACE_FRAME', color: lineColor });
      }

      // ========================================
      // 5. 조절발 (floor 타입이고 받침대가 있는 경우)
      // AdjustableFootsRenderer와 동일한 위치에 2개 (앞쪽, 뒤쪽)
      // 조절발: 플레이트 64x7mm, 원통 지름 56mm
      // ========================================
      if (!isStandType && baseFrameHeightMm > 0) {
        const footPlateSize = 64; // 조절발 플레이트 크기 (mm)
        const footPlateThickness = 7; // 조절발 플레이트 두께 (mm)
        const footDiameter = 56; // 조절발 지름 (mm)
        const footCylinderHeight = Math.max(baseFrameHeightMm - footPlateThickness, 0); // 원통 높이

        // AdjustableFootsRenderer와 동일한 Z축 위치 계산
        // 앞쪽: 앞면에서 20mm 안쪽 + 받침대 깊이
        // 뒤쪽: 뒷면에서 plateHalf(32mm) 안쪽
        const plateHalfMm = footPlateSize / 2; // 32mm
        const actualBaseDepthForFoot = baseDepthMm > 0 ? baseDepthMm : 0;

        // 측면뷰에서 Z 위치를 DXF X 좌표로 변환
        // furnitureDepthMm = 600mm 기준
        // Z+ = 앞면, Z- = 뒷면
        // DXF에서: 좌측뷰 X=0이 앞면, X=깊이가 뒷면

        // 앞쪽 조절발: Z = furnitureDepth/2 - plateHalf - 20 - baseDepthOffset
        // DXF X = (가구깊이/2 - Z) = plateHalf + 20 + baseDepthOffset (좌측뷰)
        const frontFootDepth = plateHalfMm + 20 + actualBaseDepthForFoot;

        // 뒤쪽 조절발: Z = -furnitureDepth/2 + plateHalf
        // DXF X = (가구깊이/2 - Z) = furnitureDepthMm - plateHalf (좌측뷰)
        const backFootDepth = furnitureDepthMm - plateHalfMm;

        // 조절발 그리기 함수
        // 조절발은 받침대 내부에 위치: Y=baseFrameHeightMm(상단)에서 Y=0(바닥)까지
        const drawFoot = (footCenterDepth: number) => {
          // 조절발 플레이트 (상단 사각형) - 받침대 상단(=가구 하단)에서 아래로
          const plateLeft = transformX(footCenterDepth - footPlateSize / 2);
          const plateRight = transformX(footCenterDepth + footPlateSize / 2);
          const plateMinX = Math.min(plateLeft, plateRight);
          const plateMaxX = Math.max(plateLeft, plateRight);
          const plateTop = baseFrameHeightMm; // 받침대 상단
          const plateBottom = baseFrameHeightMm - footPlateThickness;

          lines.push({ x1: plateMinX, y1: plateBottom, x2: plateMaxX, y2: plateBottom, layer: 'ACCESSORIES', color: lineColor });
          lines.push({ x1: plateMaxX, y1: plateBottom, x2: plateMaxX, y2: plateTop, layer: 'ACCESSORIES', color: lineColor });
          lines.push({ x1: plateMaxX, y1: plateTop, x2: plateMinX, y2: plateTop, layer: 'ACCESSORIES', color: lineColor });
          lines.push({ x1: plateMinX, y1: plateTop, x2: plateMinX, y2: plateBottom, layer: 'ACCESSORIES', color: lineColor });

          // 조절발 원통 (플레이트 아래)
          const cylLeft = transformX(footCenterDepth - footDiameter / 2);
          const cylRight = transformX(footCenterDepth + footDiameter / 2);
          const cylMinX = Math.min(cylLeft, cylRight);
          const cylMaxX = Math.max(cylLeft, cylRight);
          const cylTop = plateBottom;
          const cylBottom = Math.max(plateBottom - footCylinderHeight, 0);

          lines.push({ x1: cylMinX, y1: cylTop, x2: cylMinX, y2: cylBottom, layer: 'ACCESSORIES', color: lineColor });
          lines.push({ x1: cylMaxX, y1: cylTop, x2: cylMaxX, y2: cylBottom, layer: 'ACCESSORIES', color: lineColor });
          lines.push({ x1: cylMinX, y1: cylBottom, x2: cylMaxX, y2: cylBottom, layer: 'ACCESSORIES', color: lineColor });
        };

        // 앞쪽 조절발 그리기
        drawFoot(frontFootDepth);
        // 뒤쪽 조절발 그리기
        drawFoot(backFootDepth);

        console.log(`🦶 조절발 위치 (${viewDirection}뷰): 앞쪽=${frontFootDepth}mm, 뒤쪽=${backFootDepth}mm`);
      }

      console.log(`✅ ${viewDirection}뷰 가구 형상 생성 완료: ${lines.length}개 라인`);
    }

    // ========================================
    // 측면뷰 치수선 생성 (CADDimensions2D와 동일)
    // ========================================
    const dimColor = 7; // 흰색/검정
    const dimOffset = 200; // 치수선 오프셋 (mm) - 가구와 충분히 떨어지게
    const extLength = 50; // 연장선 길이 (mm)

    // CADDimensions2D와 동일하게 calculateInternalSpace 사용
    const internalSpace = calculateInternalSpace(spaceInfo);

    // 띄워서 배치
    const isFloatingDim = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const floatHeightMmDim = isFloatingDim ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;

    // 바닥레일/받침대 높이 계산 (CADDimensions2D와 동일)
    const isStandTypeDim = spaceInfo.baseConfig?.type === 'stand';
    const railOrBaseHeightMmDim = isStandTypeDim
      ? (isFloatingDim ? 0 : (spaceInfo.baseConfig?.height || 0))
      : calculateBaseFrameHeight(spaceInfo);

    // 내경 높이 조정 (CADDimensions2D와 동일)
    const floatHeightMmForCalcDim = isFloatingDim ? floatHeightMmDim : 0;
    const adjustedInternalHeightMm = isStandTypeDim
      ? internalSpace.height - railOrBaseHeightMmDim - floatHeightMmForCalcDim
      : internalSpace.height;

    // 하위 호환성을 위한 변수 (CADDimensions2D와 동일)
    const baseFrameHeightMmDim = isFloatingDim ? floatHeightMmDim : railOrBaseHeightMmDim;

    console.log(`📐 ${viewDirection}뷰 치수 계산 (CADDimensions2D 동일 로직):`);
    console.log(`  - internalSpace.height: ${internalSpace.height}mm`);
    console.log(`  - adjustedInternalHeightMm: ${adjustedInternalHeightMm}mm`);
    console.log(`  - baseFrameHeightMmDim: ${baseFrameHeightMmDim}mm`);
    console.log(`  - topFrameHeightMm: ${topFrameHeightMm}mm`);

    // placedModules에서 섹션 높이 정보 가져오기 (sideViewFilter에 따라 올바른 가구 선택)
    let sectionHeights: number[] = [];
    let lowerSectionDepthMm: number | undefined = undefined; // 하부섹션 깊이 (2섹션 가구인 경우)

    // sideViewFilter에 따라 올바른 가구 선택
    let targetModuleForSection: PlacedModule | undefined = undefined;

    if (placedModules.length > 0) {
      if (sideViewFilter === 'leftmost') {
        targetModuleForSection = placedModules.reduce((prev, curr) => {
          const prevX = prev.position?.x || 0;
          const currX = curr.position?.x || 0;
          return currX < prevX ? curr : prev;
        });
      } else if (sideViewFilter === 'rightmost') {
        targetModuleForSection = placedModules.reduce((prev, curr) => {
          const prevX = prev.position?.x || 0;
          const currX = curr.position?.x || 0;
          return currX > prevX ? curr : prev;
        });
      } else {
        targetModuleForSection = placedModules[0];
      }

      const module = targetModuleForSection;
      // CADDimensions2D와 동일하게 moduleId 사용하여 모듈 데이터 가져오기
      const moduleData = getModuleById(
        module.moduleId,
        { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
        spaceInfo
      );

      // CADDimensions2D와 동일하게 internalSpace.height 사용
      const sectionInfo = computeSectionHeightsInfo(module, moduleData, internalSpace.height, viewDirection);
      console.log(`  - sectionInfo.heightsMm: ${JSON.stringify(sectionInfo.heightsMm)}`);

      if (sectionInfo.heightsMm.length > 0) {
        // CADDimensions2D와 동일하게: 첫 번째는 하부섹션, 나머지는 상부섹션으로 합산
        const lowerSectionHeightMmCalc = Math.round(sectionInfo.heightsMm[0] || 0);
        const upperSectionHeightMmCalc = Math.round(sectionInfo.heightsMm.slice(1).reduce((sum, h) => sum + h, 0));
        sectionHeights = [lowerSectionHeightMmCalc, upperSectionHeightMmCalc];
        console.log(`📐 ${viewDirection}뷰 섹션 높이 (computeSectionHeightsInfo): 하부=${lowerSectionHeightMmCalc}mm, 상부=${upperSectionHeightMmCalc}mm`);
      }

      // 하부섹션 깊이 가져오기 (CADDimensions2D.tsx와 동일)
      if (module.lowerSectionDepth !== undefined) {
        lowerSectionDepthMm = module.lowerSectionDepth;
        console.log(`📐 ${viewDirection}뷰 하부섹션 깊이: ${lowerSectionDepthMm}mm`);
      } else {
        // 1섹션 가구인 경우에도 하부에 깊이 표시 (상부 깊이와 동일)
        lowerSectionDepthMm = module.upperSectionDepth || module.customDepth || furnitureDepthMm;
        console.log(`📐 ${viewDirection}뷰 하부섹션 깊이 (1섹션 가구): ${lowerSectionDepthMm}mm`);
      }
    }

    // 섹션 높이가 없으면 50:50으로 기본값
    if (sectionHeights.length === 0) {
      const halfHeight = Math.round(adjustedInternalHeightMm / 2);
      sectionHeights = [halfHeight, adjustedInternalHeightMm - halfHeight];
      console.log(`📐 ${viewDirection}뷰 섹션 높이 (기본값 50:50): 하부=${sectionHeights[0]}mm, 상부=${sectionHeights[1]}mm`);
    }

    const lowerSectionHeightMmVal = sectionHeights[0];
    const upperSectionHeightMmVal = sectionHeights[1];

    // CADDimensions2D와 동일한 Y 좌표 계산
    const cabinetBottomY = baseFrameHeightMmDim; // 가구 내부 시작점 (받침대 위)
    const cabinetTopY = height - topFrameHeightMm; // 가구 내부 끝점 (상부프레임 아래)

    // 실제 가구 형상 X 범위 (상/하단 깊이 치수선 위치에 사용)
    const furnitureXMin = actualFurnitureMinX !== undefined ? actualFurnitureMinX : 0;
    const furnitureXMax = actualFurnitureMaxX !== undefined ? actualFurnitureMaxX : furnitureDepthMm;

    // 실제 가구 형상의 폭 (씬 추출 후 정규화된 좌표 기준)
    // furnitureDepthMm: 모듈 데이터 기반 깊이 (치수 텍스트 값에 사용)
    // actualFurnitureWidth: 씬에서 추출한 실제 가구 형상 폭 (치수선 위치에 사용)
    const actualWidth = (actualFurnitureDepth && actualFurnitureDepth > 0) ? actualFurnitureDepth : furnitureDepthMm;

    if (viewDirection === 'left') {
      // ===== 좌측뷰: 왼쪽=전체높이, 오른쪽=섹션치수 =====

      // ===== 왼쪽 (X=furnitureXMin 근처): 전체 높이 치수 =====
      const leftX = furnitureXMin - dimOffset;

      lines.push({ x1: leftX, y1: 0, x2: leftX, y2: height, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMin, y1: 0, x2: leftX - extLength, y2: 0, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMin, y1: height, x2: leftX - extLength, y2: height, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: leftX - 60, y: height / 2, text: `${height}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // ===== 오른쪽 (X=furnitureXMax 근처): 섹션별 치수 =====
      const rightX = furnitureXMax + dimOffset;

      // 상부 프레임 치수 (있는 경우)
      if (topFrameHeightMm > 0) {
        const topFrameBottomY = height - topFrameHeightMm;
        lines.push({ x1: rightX, y1: topFrameBottomY, x2: rightX, y2: height, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMax, y1: topFrameBottomY, x2: rightX + extLength, y2: topFrameBottomY, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMax, y1: height, x2: rightX + extLength, y2: height, layer: 'DIMENSIONS', color: dimColor });
        texts.push({ x: rightX + 60, y: height - topFrameHeightMm / 2, text: `${topFrameHeightMm}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });
      }

      // 상부섹션 치수
      const lowerSectionEndY = cabinetBottomY + lowerSectionHeightMmVal;
      const upperSectionTopY_L = cabinetTopY;
      const upperSectionBottomY_L = lowerSectionEndY;
      lines.push({ x1: rightX, y1: upperSectionBottomY_L, x2: rightX, y2: upperSectionTopY_L, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMax, y1: upperSectionBottomY_L, x2: rightX + extLength, y2: upperSectionBottomY_L, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: rightX + 60, y: (upperSectionTopY_L + upperSectionBottomY_L) / 2, text: `${upperSectionHeightMmVal}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // 하부섹션 치수
      const lowerSectionTopY_L = lowerSectionEndY;
      const lowerSectionBottomY_L = cabinetBottomY;
      lines.push({ x1: rightX, y1: lowerSectionBottomY_L, x2: rightX, y2: lowerSectionTopY_L, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMax, y1: lowerSectionBottomY_L, x2: rightX + extLength, y2: lowerSectionBottomY_L, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: rightX + 60, y: (lowerSectionTopY_L + lowerSectionBottomY_L) / 2, text: `${lowerSectionHeightMmVal}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // 하부 프레임/받침대 치수 (있는 경우)
      if (baseFrameHeightMmDim > 0) {
        lines.push({ x1: rightX, y1: 0, x2: rightX, y2: baseFrameHeightMmDim, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMax, y1: 0, x2: rightX + extLength, y2: 0, layer: 'DIMENSIONS', color: dimColor });
        texts.push({ x: rightX + 60, y: baseFrameHeightMmDim / 2, text: `${baseFrameHeightMm}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });
      }

      // ===== 상단: 상부섹션 깊이 치수 =====
      const topDimY = height + dimOffset;
      // 실제 가구 형상 X 범위 사용 (furnitureXMin ~ furnitureXMax)
      lines.push({ x1: furnitureXMin, y1: topDimY, x2: furnitureXMax, y2: topDimY, layer: 'DIMENSIONS', color: dimColor });
      // 연장선 - Y축 길이 최소화
      lines.push({ x1: furnitureXMin, y1: height, x2: furnitureXMin, y2: topDimY, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMax, y1: height, x2: furnitureXMax, y2: topDimY, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: (furnitureXMin + furnitureXMax) / 2, y: topDimY + 15, text: `${Math.round(furnitureDepthMm)}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // ===== 하단: 하부섹션 깊이 치수 (2섹션 가구인 경우) =====
      if (lowerSectionDepthMm !== undefined && lowerSectionDepthMm > 0) {
        const bottomDimY = -dimOffset;
        // 하부섹션은 같은 시작점에서 lowerSectionDepthMm 비율만큼
        const lowerRatio = lowerSectionDepthMm / furnitureDepthMm;
        const lowerEndX = furnitureXMin + actualWidth * lowerRatio;
        lines.push({ x1: furnitureXMin, y1: bottomDimY, x2: lowerEndX, y2: bottomDimY, layer: 'DIMENSIONS', color: dimColor });
        // 연장선 - Y축 길이 최소화
        lines.push({ x1: furnitureXMin, y1: 0, x2: furnitureXMin, y2: bottomDimY, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: lowerEndX, y1: 0, x2: lowerEndX, y2: bottomDimY, layer: 'DIMENSIONS', color: dimColor });
        texts.push({ x: (furnitureXMin + lowerEndX) / 2, y: bottomDimY - 40, text: `${lowerSectionDepthMm}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });
        console.log(`📐 좌측뷰 하단 하부섹션 깊이 치수 추가: ${lowerSectionDepthMm}mm`);
      }

    } else if (viewDirection === 'right') {
      // ===== 우측뷰: 오른쪽=전체높이, 왼쪽=섹션치수 =====
      // 실제 가구 형상 범위 (furnitureXMin ~ furnitureXMax) 기준으로 배치

      // ===== 왼쪽 (furnitureXMin 근처): 섹션별 치수 =====
      const leftX = furnitureXMin - dimOffset;

      // 상부 프레임 치수 (있는 경우)
      if (topFrameHeightMm > 0) {
        const topFrameBottomY = height - topFrameHeightMm;
        lines.push({ x1: leftX, y1: topFrameBottomY, x2: leftX, y2: height, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMin, y1: topFrameBottomY, x2: leftX - extLength, y2: topFrameBottomY, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMin, y1: height, x2: leftX - extLength, y2: height, layer: 'DIMENSIONS', color: dimColor });
        texts.push({ x: leftX - 60, y: height - topFrameHeightMm / 2, text: `${topFrameHeightMm}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });
      }

      // 상부섹션 치수
      const lowerSectionEndY_R = cabinetBottomY + lowerSectionHeightMmVal;
      const upperSectionTopY_R = cabinetTopY;
      const upperSectionBottomY_R = lowerSectionEndY_R;
      lines.push({ x1: leftX, y1: upperSectionBottomY_R, x2: leftX, y2: upperSectionTopY_R, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMin, y1: upperSectionBottomY_R, x2: leftX - extLength, y2: upperSectionBottomY_R, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: leftX - 60, y: (upperSectionTopY_R + upperSectionBottomY_R) / 2, text: `${upperSectionHeightMmVal}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // 하부섹션 치수
      const lowerSectionTopY_R = lowerSectionEndY_R;
      const lowerSectionBottomY_R = cabinetBottomY;
      lines.push({ x1: leftX, y1: lowerSectionBottomY_R, x2: leftX, y2: lowerSectionTopY_R, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMin, y1: lowerSectionBottomY_R, x2: leftX - extLength, y2: lowerSectionBottomY_R, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: leftX - 60, y: (lowerSectionTopY_R + lowerSectionBottomY_R) / 2, text: `${lowerSectionHeightMmVal}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // 하부 프레임/받침대 치수 (있는 경우)
      if (baseFrameHeightMmDim > 0) {
        lines.push({ x1: leftX, y1: 0, x2: leftX, y2: baseFrameHeightMmDim, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMin, y1: 0, x2: leftX - extLength, y2: 0, layer: 'DIMENSIONS', color: dimColor });
        texts.push({ x: leftX - 60, y: baseFrameHeightMmDim / 2, text: `${baseFrameHeightMmDim}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });
      }

      // ===== 오른쪽 (furnitureXMax 근처): 전체 높이 치수 =====
      const rightX = furnitureXMax + dimOffset;

      lines.push({ x1: rightX, y1: 0, x2: rightX, y2: height, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMax, y1: 0, x2: rightX + extLength, y2: 0, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMax, y1: height, x2: rightX + extLength, y2: height, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: rightX + 60, y: height / 2, text: `${height}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // ===== 상단: 상부섹션 깊이 치수 =====
      // 실제 가구 형상 범위 (furnitureXMin ~ furnitureXMax) 사용
      const topDimY = height + dimOffset;
      lines.push({ x1: furnitureXMin, y1: topDimY, x2: furnitureXMax, y2: topDimY, layer: 'DIMENSIONS', color: dimColor });
      // 연장선 - Y축 길이 최소화
      lines.push({ x1: furnitureXMin, y1: height, x2: furnitureXMin, y2: topDimY, layer: 'DIMENSIONS', color: dimColor });
      lines.push({ x1: furnitureXMax, y1: height, x2: furnitureXMax, y2: topDimY, layer: 'DIMENSIONS', color: dimColor });
      texts.push({ x: (furnitureXMin + furnitureXMax) / 2, y: topDimY + 15, text: `${Math.round(furnitureDepthMm)}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });

      // ===== 하단: 하부섹션 깊이 치수 (2섹션 가구인 경우) =====
      if (lowerSectionDepthMm !== undefined && lowerSectionDepthMm > 0) {
        const bottomDimY = -dimOffset;
        // 하부섹션은 같은 끝점에서 lowerSectionDepthMm 비율만큼
        const lowerRatio = lowerSectionDepthMm / furnitureDepthMm;
        const lowerStartX = furnitureXMax - actualWidth * lowerRatio;
        lines.push({ x1: lowerStartX, y1: bottomDimY, x2: furnitureXMax, y2: bottomDimY, layer: 'DIMENSIONS', color: dimColor });
        // 연장선 - Y축 길이 최소화
        lines.push({ x1: lowerStartX, y1: 0, x2: lowerStartX, y2: bottomDimY, layer: 'DIMENSIONS', color: dimColor });
        lines.push({ x1: furnitureXMax, y1: 0, x2: furnitureXMax, y2: bottomDimY, layer: 'DIMENSIONS', color: dimColor });
        texts.push({ x: (lowerStartX + furnitureXMax) / 2, y: bottomDimY - 40, text: `${lowerSectionDepthMm}`, height: 25, color: dimColor, layer: 'DIMENSIONS' });
        console.log(`📐 우측뷰 하단 하부섹션 깊이 치수 추가: ${lowerSectionDepthMm}mm`);
      }
    }

    console.log(`✅ ${viewDirection}뷰 치수선 생성 완료`);
  }

  console.log(`📏 외부 치수선 생성: ${lines.length}개 라인, ${texts.length}개 텍스트`);
  return { lines, texts };
};

/**
 * DXF 생성 - 색상과 텍스트 포함
 * @param sideViewFilter 측면뷰 필터링 타입 (leftmost: 좌측 가구만, rightmost: 우측 가구만, all: 모두)
 * @param excludeDoor 도어 관련 객체 제외 여부 (front-no-door용)
 */
export const generateDxfFromData = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection,
  sideViewFilter: SideViewFilter = 'all',
  excludeDoor: boolean = false
): string => {
  const scene = sceneHolder.getScene();

  if (!scene) {
    console.error('❌ 씬을 찾을 수 없습니다');
    throw new Error('씬을 찾을 수 없습니다');
  }

  console.log(`📐 DXF 생성 시작 (${viewDirection}, 필터: ${sideViewFilter})`);
  console.log(`📊 공간 정보: ${spaceInfo.width}mm x ${spaceInfo.height}mm x ${spaceInfo.depth}mm`);
  console.log(`📊 배치된 가구 수: ${placedModules.length}`);

  // spaceInfo에서 width, height, depth 추출 (프레임 생성에 필요)
  const { width, height, depth } = spaceInfo;

  // 측면뷰용 공간 깊이 설정 (projectTo2D에서 사용)
  currentSpaceDepthMm = spaceInfo.depth || 600;

  // 측면뷰 필터링: X 위치 범위 계산
  // 가구 측판(side panel)은 가구 중심에서 너비/2 위치에 있으므로,
  // allowedXRange는 가구 전체 너비를 포함해야 함
  let allowedXRange: { min: number; max: number } | null = null;

  if ((viewDirection === 'left' || viewDirection === 'right') &&
      sideViewFilter !== 'all' &&
      placedModules.length > 0) {

    // placedModules에서 X 위치와 너비 추출 (Three.js 단위: meter)
    const modulesWithBounds = placedModules.map(m => {
      const x = m.position?.x || 0;
      // moduleWidth는 mm 단위, Three.js는 1unit = 100mm이므로 /100 변환
      // 기본값 600mm (일반적인 가구 너비)
      const widthInUnits = ((m.moduleWidth || m.customWidth || 600) / 100) / 2;
      return {
        x,
        minX: x - widthInUnits,
        maxX: x + widthInUnits
      };
    });

    if (sideViewFilter === 'leftmost') {
      // 좌측뷰: leftmost X 위치의 가구만
      const leftmostModule = modulesWithBounds.reduce((prev, curr) =>
        curr.x < prev.x ? curr : prev
      );
      // 가구 전체 범위를 포함 (측판 포함)
      allowedXRange = {
        min: leftmostModule.minX - 0.01,
        max: leftmostModule.maxX + 0.01
      };
      console.log(`📐 좌측뷰 필터: X=${leftmostModule.x.toFixed(3)} 가구 (범위: ${allowedXRange.min.toFixed(3)}~${allowedXRange.max.toFixed(3)})`);
    } else if (sideViewFilter === 'rightmost') {
      // 우측뷰: rightmost X 위치의 가구만
      const rightmostModule = modulesWithBounds.reduce((prev, curr) =>
        curr.x > prev.x ? curr : prev
      );
      // 가구 전체 범위를 포함 (측판 포함)
      allowedXRange = {
        min: rightmostModule.minX - 0.01,
        max: rightmostModule.maxX + 0.01
      };
      console.log(`📐 우측뷰 필터: X=${rightmostModule.x.toFixed(3)} 가구 (범위: ${allowedXRange.min.toFixed(3)}~${allowedXRange.max.toFixed(3)})`);
    }
  }

  // 씬에서 Line과 Text 객체 추출 (X 필터링 범위 전달, excludeDoor 옵션 전달)
  const extracted = extractFromScene(scene, viewDirection, allowedXRange, excludeDoor);

  // 측면뷰(left/right): 완전히 데이터 기반으로 생성
  // generateExternalDimensions(dimensionsOnly=false)가 가구 형상 + 프레임 + 조절발 + 치수선을 모두 생성
  // 씬 추출은 측면뷰에서 X 범위가 불안정하므로 사용하지 않음
  let lines: DxfLine[];
  let texts: DxfText[];

  if (viewDirection === 'left' || viewDirection === 'right') {
    console.log(`📐 측면뷰 (${viewDirection}): 완전 데이터 기반 생성 (씬 추출 미사용)`);

    // generateExternalDimensions에서 가구 형상 + 프레임 + 조절발 + 치수선 모두 생성
    const externalDimensions = generateExternalDimensions(
      spaceInfo,
      placedModules,
      viewDirection,
      sideViewFilter,
      false // dimensionsOnly=false: 가구 형상 + 치수선 모두 생성
    );

    lines = [...externalDimensions.lines];
    texts = [...externalDimensions.texts];
    console.log(`📐 측면뷰 (${viewDirection}): 데이터 기반 ${lines.length}개 라인, ${texts.length}개 텍스트`);
  } else {
    // 정면뷰/탑뷰: 씬에서 추출한 치수선(DIMENSIONS 레이어)을 제외하고
    // generateExternalDimensions()에서 생성한 치수선만 사용 (중복 방지)
    const externalDimensions = generateExternalDimensions(spaceInfo, placedModules, viewDirection, sideViewFilter);

    // 씬 추출 라인/텍스트에서 DIMENSIONS 레이어 제외 (외부 치수선으로 대체)
    const filteredExtractedLines = extracted.lines.filter(line => line.layer !== 'DIMENSIONS');
    const filteredExtractedTexts = extracted.texts.filter(text => text.layer !== 'DIMENSIONS');
    console.log(`📐 ${viewDirection}뷰: 씬 치수선 필터링 - 라인 ${extracted.lines.length}→${filteredExtractedLines.length}개, 텍스트 ${extracted.texts.length}→${filteredExtractedTexts.length}개`);

    lines = [...filteredExtractedLines, ...externalDimensions.lines];
    texts = [...filteredExtractedTexts, ...externalDimensions.texts];
    console.log(`📐 ${viewDirection}뷰: 씬 추출 + 외부 치수선 (라인 ${lines.length}개, 텍스트 ${texts.length}개)`);
  }

  if (lines.length === 0) {
    console.warn('⚠️ 추출된 라인이 없습니다.');
  }

  // DXF 원점 이동 (왼쪽 하단을 원점으로)
  // 정면뷰/탑뷰: X = -width/2 ~ +width/2 범위를 0 ~ width로 이동
  // 측면뷰: 이미 0 ~ depth 범위로 좌표 생성됨, 오프셋 불필요
  const offsetX = (viewDirection === 'left' || viewDirection === 'right') ? 0 : spaceInfo.width / 2;
  const offsetY = 0;

  // DXF 생성
  const dxf = new DxfWriter();

  // 요소 타입별 레이어 생성 (각 타입에 적절한 기본 색상 지정)
  // 레이어 색상: ACI 3=연두(공간), ACI 30=주황(가구), ACI 7=흰색(치수/기타)
  dxf.addLayer('0', 7, 'CONTINUOUS');
  dxf.addLayer('SPACE_FRAME', 3, 'CONTINUOUS');      // 공간 프레임 - 연두색
  dxf.addLayer('FURNITURE_PANEL', 30, 'CONTINUOUS'); // 가구 패널 - 주황색
  dxf.addLayer('DOOR', 3, 'CONTINUOUS');             // 도어 - 연두색 (2D와 동일)
  dxf.addLayer('DOOR_DIMENSIONS', 7, 'CONTINUOUS');  // 도어 치수선 - 흰색
  dxf.addLayer('DRAWER', 30, 'CONTINUOUS');           // 서랍 - 주황색
  dxf.addLayer('BACK_PANEL', 254, 'CONTINUOUS');     // 백패널 - 매우 연한 회색 (투명도 효과)
  dxf.addLayer('CLOTHING_ROD', 7, 'CONTINUOUS');     // 옷봉 - 흰색
  dxf.addLayer('ACCESSORIES', 8, 'CONTINUOUS');      // 조절발 - 회색 (2D와 동일)
  dxf.addLayer('VENTILATION', 6, 'CONTINUOUS');      // 환기캡 - 마젠타 (2D와 동일)
  dxf.addLayer('END_PANEL', 3, 'CONTINUOUS');        // 엔드패널 - 연두색
  dxf.addLayer('DIMENSIONS', 7, 'CONTINUOUS');       // 치수선 - 흰색

  console.log('📦 레이어 생성 완료: SPACE_FRAME, FURNITURE_PANEL, DOOR, BACK_PANEL, CLOTHING_ROD, ACCESSORIES, END_PANEL, DIMENSIONS');

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
