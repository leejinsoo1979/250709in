/**
 * 씬에서 렌더링된 모든 Line 객체를 추출하여 DXF 생성
 * Line, LineSegments, Line2 (drei), Mesh 엣지 등 모두 지원
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
}

/**
 * Line2/LineSegments2 (drei의 Line 컴포넌트)에서 좌표 추출
 * Line2는 instanceStart, instanceEnd 속성을 사용 (InterleavedBufferAttribute)
 */
const extractFromLine2 = (
  object: THREE.Object3D,
  matrix: THREE.Matrix4,
  scale: number,
  layer: string
): DxfLine[] => {
  const lines: DxfLine[] = [];
  const geometry = (object as THREE.Mesh).geometry;

  if (!geometry) {
    console.log('  ⚠️ Line2에 geometry가 없음');
    return lines;
  }

  // Line2/LineSegments2 geometry uses instanceStart and instanceEnd attributes
  const instanceStart = geometry.getAttribute('instanceStart');
  const instanceEnd = geometry.getAttribute('instanceEnd');

  if (instanceStart && instanceEnd) {
    console.log(`  📊 Line2 instanceStart/End 발견, count: ${instanceStart.count}`);

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

      lines.push({
        x1: p1.x * scale,
        y1: p1.y * scale,
        x2: p2.x * scale,
        y2: p2.y * scale,
        layer
      });
    }
  } else {
    console.log('  ⚠️ Line2에 instanceStart/instanceEnd가 없음, 다른 방식 시도');

    // Some Line2 might store positions differently - check all attributes
    const attributes = Object.keys((geometry.attributes || {}));
    console.log('  📊 Line2 geometry attributes:', attributes);
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
  layer: string
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

    lines.push({
      x1: p1.x * scale,
      y1: p1.y * scale,
      x2: p2.x * scale,
      y2: p2.y * scale,
      layer
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
  layer: string
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

    lines.push({
      x1: p1.x * scale,
      y1: p1.y * scale,
      x2: p2.x * scale,
      y2: p2.y * scale,
      layer
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
 * 씬에서 모든 Line 객체 추출
 * Line, LineSegments, Line2 등 실제 라인 객체만 추출
 */
const extractLinesFromScene = (scene: THREE.Scene, viewDirection: ViewDirection): DxfLine[] => {
  const lines: DxfLine[] = [];
  const scale = 100; // 1 Three.js unit = 100mm

  console.log('🔍 씬에서 Line 객체 추출 시작...');
  console.log('📊 씬 구조 분석 중...');

  let totalObjects = 0;
  let lineObjects = 0;
  let meshObjects = 0;
  let groupObjects = 0;
  let invisibleObjects = 0;

  // Store meshes for potential edge extraction if no lines are found
  const meshesForEdges: { mesh: THREE.Mesh; matrix: THREE.Matrix4; layer: string }[] = [];

  // Detailed object type tracking
  const objectTypes: Record<string, number> = {};

  scene.traverse((object) => {
    totalObjects++;

    // Track object types
    const typeName = object.type || object.constructor.name;
    objectTypes[typeName] = (objectTypes[typeName] || 0) + 1;

    // Skip invisible objects but count them
    if (!object.visible) {
      invisibleObjects++;
      return;
    }

    const name = object.name || '';
    if (shouldExclude(name)) return;

    // Update world matrix
    object.updateMatrixWorld(true);
    const matrix = object.matrixWorld;
    const layer = determineLayer(name);

    // Check for Group
    if (object instanceof THREE.Group) {
      groupObjects++;
      return;
    }

    // Check for Line2 (from drei) - has isLine2/isLineSegments2 property OR LineGeometry/LineSegmentsGeometry
    const mesh = object as THREE.Mesh;
    const isLine2 = (object as any).isLine2 || (object as any).isLineSegments2;
    const hasLineGeometry = mesh.geometry && (
      (mesh.geometry as any).isLineGeometry ||
      (mesh.geometry as any).isLineSegmentsGeometry ||
      mesh.geometry.getAttribute('instanceStart') !== undefined
    );

    if (isLine2 || hasLineGeometry) {
      console.log(`📍 Line2/LineSegments2 발견: ${name || '(이름없음)'}, type: ${(object as any).type}, isLine2: ${isLine2}, hasLineGeometry: ${hasLineGeometry}`);
      const extractedLines = extractFromLine2(object, matrix, scale, layer);
      console.log(`   → 추출된 라인 수: ${extractedLines.length}`);
      lines.push(...extractedLines);
      lineObjects++;
      return;
    }

    // Check for LineSegments (EdgesGeometry)
    if (object instanceof THREE.LineSegments) {
      const posCount = object.geometry?.getAttribute('position')?.count || 0;
      console.log(`📍 LineSegments 발견: ${name || '(이름없음)'}, 버텍스: ${posCount}, 가시성: ${object.visible}`);
      if (posCount > 0) {
        const extractedLines = extractFromLineSegments(object, matrix, scale, layer);
        console.log(`   → 추출된 라인 수: ${extractedLines.length}`);
        lines.push(...extractedLines);
      }
      lineObjects++;
      return;
    }

    // Check for Line (NativeLine)
    if (object instanceof THREE.Line) {
      const posCount = object.geometry?.getAttribute('position')?.count || 0;
      console.log(`📍 Line 발견: ${name || '(이름없음)'}, 버텍스: ${posCount}, 가시성: ${object.visible}`);
      if (posCount > 0) {
        const extractedLines = extractFromLine(object, matrix, scale, layer);
        console.log(`   → 추출된 라인 수: ${extractedLines.length}`);
        lines.push(...extractedLines);
      }
      lineObjects++;
      return;
    }

    // Check for Mesh (potential for edge extraction)
    if (object instanceof THREE.Mesh) {
      meshObjects++;
      // Store mesh for potential edge extraction if no lines are found
      meshesForEdges.push({ mesh: object, matrix, layer });
    }
  });

  // If no lines were found, try extracting edges from meshes
  if (lines.length === 0 && meshesForEdges.length > 0) {
    console.log(`⚠️ 라인이 없어서 Mesh에서 엣지 추출 시도 (${meshesForEdges.length}개 메쉬)...`);

    // Only extract from visible panel/furniture meshes
    const furnitureMeshes = meshesForEdges.filter(({ mesh }) => {
      const name = (mesh.name || '').toLowerCase();
      // Skip floor, walls, background meshes
      if (name.includes('floor') || name.includes('wall') || name.includes('background') || name.includes('slot')) {
        return false;
      }
      // Only include visible geometry with reasonable size
      if (mesh.geometry) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        // Skip very small objects (likely UI elements)
        if (size.x < 0.01 && size.y < 0.01 && size.z < 0.01) {
          return false;
        }
        return true;
      }
      return false;
    });

    console.log(`📦 엣지 추출 대상 메쉬: ${furnitureMeshes.length}개`);

    furnitureMeshes.forEach(({ mesh, matrix, layer }) => {
      const extractedEdges = extractEdgesFromMesh(mesh, matrix, scale, layer);
      console.log(`   → ${mesh.name || '(이름없음)'}: ${extractedEdges.length}개 엣지`);
      lines.push(...extractedEdges);
    });
  }

  console.log(`📊 씬 분석 완료:
    - 총 객체 수: ${totalObjects}
    - 비가시 객체 수: ${invisibleObjects}
    - Group 객체 수: ${groupObjects}
    - Line 객체 수: ${lineObjects}
    - Mesh 객체 수: ${meshObjects}
    - 추출된 라인 수: ${lines.length}
  `);

  console.log('📊 객체 타입별 카운트:', objectTypes);

  return lines;
};

/**
 * Mesh에서 엣지 추출 (필요시 사용)
 */
const extractEdgesFromMesh = (
  mesh: THREE.Mesh,
  matrix: THREE.Matrix4,
  scale: number,
  layer: string
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

    lines.push({
      x1: p1.x * scale,
      y1: p1.y * scale,
      x2: p2.x * scale,
      y2: p2.y * scale,
      layer
    });
  }

  edges.dispose();
  return lines;
};

/**
 * DXF 생성
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

  // 씬에서 Line 객체 추출
  const lines = extractLinesFromScene(scene, viewDirection);

  if (lines.length === 0) {
    console.warn('⚠️ 추출된 라인이 없습니다. 씬에 렌더링된 Line 객체가 없거나 가시성이 꺼져 있을 수 있습니다.');
  }

  // DXF 원점 이동 (왼쪽 하단을 원점으로)
  const offsetX = spaceInfo.width / 2;
  const offsetY = 0;

  // DXF 생성
  const dxf = new DxfWriter();

  dxf.addLayer('SPACE', 8, 'CONTINUOUS');
  dxf.addLayer('FURNITURE', 7, 'CONTINUOUS');
  dxf.addLayer('DIMENSIONS', 1, 'CONTINUOUS');

  lines.forEach(line => {
    try {
      dxf.setCurrentLayerName(line.layer);
    } catch {
      dxf.setCurrentLayerName('FURNITURE');
    }

    dxf.addLine(
      point3d(line.x1 + offsetX, line.y1 + offsetY),
      point3d(line.x2 + offsetX, line.y2 + offsetY)
    );
  });

  console.log(`✅ DXF 생성 완료 - 라인 ${lines.length}개`);
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
