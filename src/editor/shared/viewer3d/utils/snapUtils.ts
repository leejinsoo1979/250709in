import * as THREE from 'three';
import { MeasurePoint } from '@/store/uiStore';

/**
 * 스냅 거리 (three.js 단위)
 * 0.2 = 20mm
 */
export const SNAP_DISTANCE = 0.2;

/**
 * 객체의 모든 꼭지점을 추출
 */
export function extractVertices(object: THREE.Object3D): MeasurePoint[] {
  const vertices: MeasurePoint[] = [];
  const worldMatrix = new THREE.Matrix4();

  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geometry = child.geometry;

      // 월드 매트릭스 계산
      child.updateMatrixWorld(true);
      worldMatrix.copy(child.matrixWorld);

      // 위치 속성 가져오기
      const positions = geometry.attributes.position;
      if (!positions) return;

      const vertex = new THREE.Vector3();
      const processedVertices = new Set<string>();

      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(worldMatrix);

        // 중복 제거 (소수점 2자리까지 반올림)
        const key = `${vertex.x.toFixed(2)},${vertex.y.toFixed(2)},${vertex.z.toFixed(2)}`;
        if (!processedVertices.has(key)) {
          processedVertices.add(key);
          vertices.push([vertex.x, vertex.y, vertex.z]);
        }
      }
    }
  });

  return vertices;
}

/**
 * 가장 가까운 꼭지점 찾기
 */
export function findNearestVertex(
  point: MeasurePoint,
  vertices: MeasurePoint[]
): { vertex: MeasurePoint; distance: number } | null {
  let nearest: MeasurePoint | null = null;
  let minDistance = SNAP_DISTANCE;

  for (const vertex of vertices) {
    const dx = vertex[0] - point[0];
    const dy = vertex[1] - point[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      nearest = vertex;
    }
  }

  return nearest ? { vertex: nearest, distance: minDistance } : null;
}

/**
 * 두 점 사이의 거리 계산 (mm)
 */
export function calculateDistance(start: MeasurePoint, end: MeasurePoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return Math.sqrt(dx * dx + dy * dy) * 100; // three.js 단위를 mm로 변환
}

/**
 * 가이드선의 오프셋 계산
 * 두 점을 기준으로 수직/수평 오프셋을 계산
 */
export function calculateGuideOffset(
  start: MeasurePoint,
  end: MeasurePoint,
  mousePos: MeasurePoint
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  // 수평선에 가까운 경우 (각도가 45도 미만)
  if (Math.abs(dx) > Math.abs(dy)) {
    // Y 오프셋 계산
    return mousePos[1] - start[1];
  } else {
    // 수직선에 가까운 경우
    // X 오프셋 계산
    return mousePos[0] - start[0];
  }
}

/**
 * 가이드선 점들 계산
 */
export function calculateGuidePoints(
  start: MeasurePoint,
  end: MeasurePoint,
  offset: number
): { start: MeasurePoint; end: MeasurePoint } {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  // 수평선에 가까운 경우
  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      start: [start[0], start[1] + offset, 0],
      end: [end[0], end[1] + offset, 0]
    };
  } else {
    // 수직선에 가까운 경우
    return {
      start: [start[0] + offset, start[1], 0],
      end: [end[0] + offset, end[1], 0]
    };
  }
}
