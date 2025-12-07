/**
 * 씬에서 렌더링된 Line 객체를 직접 추출하여 DXF 생성
 * 3D 메쉬 Edge 추출 아님 - 실제 그려진 Line만 추출
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
 * 씬에서 모든 Line 객체 추출
 * Line, LineSegments, Line2 등 실제 라인 객체만 추출
 */
const extractLinesFromScene = (scene: THREE.Scene): DxfLine[] => {
  const lines: DxfLine[] = [];
  const scale = 100; // 1 Three.js unit = 100mm

  console.log('🔍 씬에서 Line 객체 추출 시작...');

  scene.traverse((object) => {
    // Line 또는 LineSegments 객체만 처리
    if (!(object instanceof THREE.Line) && !(object instanceof THREE.LineSegments)) {
      return;
    }

    const name = (object.name || '').toLowerCase();

    // 제외할 객체
    if (name.includes('grid') ||
        name.includes('helper') ||
        name.includes('axes') ||
        name.includes('gizmo') ||
        name.includes('debug')) {
      return;
    }

    const geometry = object.geometry;
    if (!geometry) return;

    // position attribute 가져오기
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr) return;

    // 월드 매트릭스 업데이트
    object.updateMatrixWorld(true);
    const matrix = object.matrixWorld;

    const positions = positionAttr.array;
    const itemSize = positionAttr.itemSize;

    // 레이어 결정
    let layer = 'FURNITURE';
    if (name.includes('dimension')) {
      layer = 'DIMENSIONS';
    } else if (name.includes('space') || name.includes('room') || name.includes('wall')) {
      layer = 'SPACE';
    }

    console.log(`📍 Line 발견: ${object.name || '(이름없음)'}, 포인트 수: ${positions.length / itemSize}`);

    // LineSegments: 2개씩 쌍으로 선분
    if (object instanceof THREE.LineSegments) {
      for (let i = 0; i < positions.length; i += itemSize * 2) {
        const p1 = new THREE.Vector3(
          positions[i],
          positions[i + 1],
          positions[i + 2] || 0
        ).applyMatrix4(matrix);

        const p2 = new THREE.Vector3(
          positions[i + itemSize],
          positions[i + itemSize + 1],
          positions[i + itemSize + 2] || 0
        ).applyMatrix4(matrix);

        // 정면뷰: X, Y 사용 (Z 무시)
        lines.push({
          x1: p1.x * scale,
          y1: p1.y * scale,
          x2: p2.x * scale,
          y2: p2.y * scale,
          layer
        });
      }
    }
    // Line: 연속된 점들
    else if (object instanceof THREE.Line) {
      for (let i = 0; i < positions.length - itemSize; i += itemSize) {
        const p1 = new THREE.Vector3(
          positions[i],
          positions[i + 1],
          positions[i + 2] || 0
        ).applyMatrix4(matrix);

        const p2 = new THREE.Vector3(
          positions[i + itemSize],
          positions[i + itemSize + 1],
          positions[i + itemSize + 2] || 0
        ).applyMatrix4(matrix);

        lines.push({
          x1: p1.x * scale,
          y1: p1.y * scale,
          x2: p2.x * scale,
          y2: p2.y * scale,
          layer
        });
      }
    }
  });

  console.log(`✅ 추출된 Line 수: ${lines.length}`);
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

  // 씬에서 Line 객체 추출
  const lines = extractLinesFromScene(scene);

  if (lines.length === 0) {
    console.warn('⚠️ 추출된 라인이 없습니다');
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
