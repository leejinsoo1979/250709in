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

  // 초록 계열
  if (g > 150 && r < 100 && b < 100) return 3;

  // 시안 계열
  if (g > 150 && b > 150 && r < 100) return 4;

  // 파랑 계열
  if (b > 150 && r < 100 && g < 100) return 5;

  // 마젠타 계열
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
 * Line2/LineSegments2 (drei의 Line 컴포넌트)에서 좌표 추출
 * Line2는 instanceStart, instanceEnd 속성을 사용 (InterleavedBufferAttribute)
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

      const proj1 = projectTo2D(p1, scale);
      const proj2 = projectTo2D(p2, scale);

      lines.push({
        x1: proj1.x,
        y1: proj1.y,
        x2: proj2.x,
        y2: proj2.y,
        layer,
        color
      });
    }
  }

  return lines;
};

/**
 * LineSegments에서 좌표 추출 (EdgesGeometry 포함)
 */
const extractFromLineSegments = (
  object: THREE.LineSegments,
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

    const proj1 = projectTo2D(p1, scale);
    const proj2 = projectTo2D(p2, scale);

    lines.push({
      x1: proj1.x,
      y1: proj1.y,
      x2: proj2.x,
      y2: proj2.y,
      layer,
      color
    });
  }

  return lines;
};

/**
 * 일반 Line에서 좌표 추출
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

    const proj1 = projectTo2D(p1, scale);
    const proj2 = projectTo2D(p2, scale);

    lines.push({
      x1: proj1.x,
      y1: proj1.y,
      x2: proj2.x,
      y2: proj2.y,
      layer,
      color
    });
  }

  return lines;
};

/**
 * 객체 이름으로 제외 여부 판단
 */
const shouldExclude = (name: string): boolean => {
  const lowerName = name.toLowerCase();
  return (
    lowerName.includes('grid') ||
    lowerName.includes('helper') ||
    lowerName.includes('axes') ||
    lowerName.includes('gizmo') ||
    lowerName.includes('debug') ||
    lowerName.includes('camera') ||
    lowerName.includes('light')
  );
};

/**
 * 객체 이름으로 레이어 결정
 */
const determineLayer = (name: string): string => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('dimension')) {
    return 'DIMENSIONS';
  } else if (lowerName.includes('space') || lowerName.includes('room') || lowerName.includes('wall') || lowerName.includes('boundary')) {
    return 'SPACE';
  }
  return 'FURNITURE';
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

const extractFromScene = (scene: THREE.Scene, viewDirection: ViewDirection): ExtractedData => {
  const lines: DxfLine[] = [];
  const texts: DxfText[] = [];
  const scale = 100; // 1 Three.js unit = 100mm

  // 뷰 방향 설정 (projectTo2D에서 사용)
  currentViewDirection = viewDirection;

  console.log(`🔍 씬에서 Line/Text 객체 추출 시작 (뷰 방향: ${viewDirection})...`);

  let lineObjects = 0;
  let line2Objects = 0;
  let lineSegmentsObjects = 0;
  let textObjects = 0;
  let meshObjects = 0;
  let skippedByVisibility = 0;
  let skippedByFilter = 0;

  // Store meshes for potential edge extraction if no lines are found
  const meshesForEdges: { mesh: THREE.Mesh; matrix: THREE.Matrix4; layer: string; color: number }[] = [];

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

    // Update world matrix
    object.updateMatrixWorld(true);
    const matrix = object.matrixWorld;
    const layer = determineLayer(name);

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
      const extractedLines = extractFromLine2(object, matrix, scale, layer, color);
      if (extractedLines.length > 0) {
        lines.push(...extractedLines);
        line2Objects++;
        console.log(`📐 Line2 발견: ${name || '(이름없음)'}, 라인 ${extractedLines.length}개, 색상 ACI=${color}`);
      }
      return;
    }

    // Check for LineSegments (EdgesGeometry)
    if (object instanceof THREE.LineSegments) {
      const posCount = object.geometry?.getAttribute('position')?.count || 0;
      if (posCount > 0) {
        const extractedLines = extractFromLineSegments(object, matrix, scale, layer, color);
        lines.push(...extractedLines);
        lineSegmentsObjects++;
        console.log(`📐 LineSegments 발견: ${name || '(이름없음)'}, 라인 ${extractedLines.length}개, 색상 ACI=${color}`);
      }
      return;
    }

    // Check for Line (NativeLine)
    if (object instanceof THREE.Line) {
      const posCount = object.geometry?.getAttribute('position')?.count || 0;
      if (posCount > 0) {
        const extractedLines = extractFromLine(object, matrix, scale, layer, color);
        lines.push(...extractedLines);
        lineObjects++;
      }
      return;
    }

    // Check for Text (drei Text component) - it's a Mesh with troika text data
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
          color: color,
          layer
        });
        textObjects++;
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
    skippedByFilter
  });

  // If no lines were found, try extracting edges from meshes
  if (lines.length === 0 && meshesForEdges.length > 0) {
    console.log(`⚠️ 라인이 없어서 Mesh에서 엣지 추출 시도...`);

    const furnitureMeshes = meshesForEdges.filter(({ mesh }) => {
      const name = (mesh.name || '').toLowerCase();
      if (name.includes('floor') || name.includes('wall') || name.includes('background') || name.includes('slot')) {
        return false;
      }
      if (mesh.geometry) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        if (size.x < 0.01 && size.y < 0.01 && size.z < 0.01) {
          return false;
        }
        return true;
      }
      return false;
    });

    console.log(`📦 Mesh에서 엣지 추출 대상: ${furnitureMeshes.length}개`);

    furnitureMeshes.forEach(({ mesh, matrix, layer, color }) => {
      const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, layer, color);
      lines.push(...extractedEdges);
    });
  }

  console.log(`✅ 추출 완료: 라인 ${lines.length}개, 텍스트 ${texts.length}개`);

  return { lines, texts };
};

/**
 * Mesh에서 엣지 추출 (필요시 사용)
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

    const proj1 = projectTo2D(p1, scale);
    const proj2 = projectTo2D(p2, scale);

    lines.push({
      x1: proj1.x,
      y1: proj1.y,
      x2: proj2.x,
      y2: proj2.y,
      layer,
      color
    });
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
    case 3: return 'COLOR_GREEN';
    case 4: return 'COLOR_CYAN';
    case 5: return 'COLOR_BLUE';
    case 6: return 'COLOR_MAGENTA';
    case 7: return 'COLOR_WHITE';
    case 8: return 'COLOR_GRAY';
    case 9: return 'COLOR_LIGHTGRAY';
    case 250: return 'COLOR_DARKGRAY';
    default: return `COLOR_${aciColor}`;
  }
};

/**
 * DXF 생성 - 색상과 텍스트 포함
 */
export const generateDxfFromData = (
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
  viewDirection: ViewDirection
): string => {
  const scene = sceneHolder.getScene();

  if (!scene) {
    console.error('❌ 씬을 찾을 수 없습니다');
    throw new Error('씬을 찾을 수 없습니다');
  }

  console.log(`📐 DXF 생성 시작 (${viewDirection})`);
  console.log(`📊 공간 정보: ${spaceInfo.width}mm x ${spaceInfo.height}mm x ${spaceInfo.depth}mm`);
  console.log(`📊 배치된 가구 수: ${placedModules.length}`);

  // 씬에서 Line과 Text 객체 추출
  const { lines, texts } = extractFromScene(scene, viewDirection);

  if (lines.length === 0) {
    console.warn('⚠️ 추출된 라인이 없습니다.');
  }

  // DXF 원점 이동 (왼쪽 하단을 원점으로)
  const offsetX = spaceInfo.width / 2;
  const offsetY = 0;

  // DXF 생성
  const dxf = new DxfWriter();

  // 기본 레이어 생성
  dxf.addLayer('0', 7, 'CONTINUOUS');
  dxf.addLayer('SPACE', 7, 'CONTINUOUS');
  dxf.addLayer('FURNITURE', 7, 'CONTINUOUS');
  dxf.addLayer('DIMENSIONS', 7, 'CONTINUOUS');

  // 사용된 색상 수집하여 색상별 레이어 생성
  const usedColors = new Set<number>();
  lines.forEach(line => usedColors.add(line.color));
  texts.forEach(text => usedColors.add(text.color));

  // 색상별 레이어 생성 (색상을 레이어 색상으로 적용)
  usedColors.forEach(aciColor => {
    const layerName = aciToLayerName(aciColor);
    try {
      dxf.addLayer(layerName, aciColor, 'CONTINUOUS');
      console.log(`📦 레이어 생성: ${layerName} (ACI ${aciColor})`);
    } catch (e) {
      // 이미 존재하는 레이어는 무시
    }
  });

  // 색상 통계
  const colorStats: Record<number, number> = {};
  lines.forEach(line => {
    colorStats[line.color] = (colorStats[line.color] || 0) + 1;
  });
  console.log('📊 색상별 라인 통계:', colorStats);

  // 라인 추가 - 색상별 레이어에 배치
  lines.forEach(line => {
    try {
      // 색상에 해당하는 레이어 사용
      const colorLayerName = aciToLayerName(line.color);
      dxf.setCurrentLayerName(colorLayerName);
    } catch {
      dxf.setCurrentLayerName('0');
    }

    dxf.addLine(
      point3d(line.x1 + offsetX, line.y1 + offsetY),
      point3d(line.x2 + offsetX, line.y2 + offsetY)
    );
  });

  // 텍스트 추가 - 색상별 레이어에 배치
  texts.forEach(text => {
    try {
      // 색상에 해당하는 레이어 사용
      const colorLayerName = aciToLayerName(text.color);
      dxf.setCurrentLayerName(colorLayerName);
    } catch {
      dxf.setCurrentLayerName('DIMENSIONS');
    }

    // DXF TEXT 엔티티 추가
    dxf.addText(
      point3d(text.x + offsetX, text.y + offsetY),
      text.height,
      text.text
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
