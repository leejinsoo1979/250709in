import * as THREE from 'three';
import { MeasurePoint } from '@/store/uiStore';

/**
 * 스냅 거리 (three.js 단위)
 * 0.4 = 40mm (적당한 값)
 */
export const SNAP_DISTANCE = 0.4;

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
 * 시점별로 관련 있는 축만 사용하여 2D 거리 계산
 */
export function findNearestVertex(
  point: MeasurePoint,
  vertices: MeasurePoint[],
  viewDirection?: 'front' | 'left' | 'right' | 'top'
): { vertex: MeasurePoint; distance: number } | null {
  let nearest: MeasurePoint | null = null;
  let minDistance = SNAP_DISTANCE;

  for (const vertex of vertices) {
    let distance: number;

    // 시점별로 관련 있는 축만 사용하여 거리 계산
    switch (viewDirection) {
      case 'front':
        // 정면: XY 평면 (Z 무시)
        const dxFront = vertex[0] - point[0];
        const dyFront = vertex[1] - point[1];
        distance = Math.sqrt(dxFront * dxFront + dyFront * dyFront);
        break;
      case 'left':
      case 'right':
        // 측면: YZ 평면 (X 무시)
        const dySide = vertex[1] - point[1];
        const dzSide = vertex[2] - point[2];
        distance = Math.sqrt(dySide * dySide + dzSide * dzSide);
        break;
      case 'top':
        // 상단: XZ 평면 (Y 무시)
        const dxTop = vertex[0] - point[0];
        const dzTop = vertex[2] - point[2];
        distance = Math.sqrt(dxTop * dxTop + dzTop * dzTop);
        break;
      default:
        // 기본: 3D 거리
        const dx = vertex[0] - point[0];
        const dy = vertex[1] - point[1];
        const dz = vertex[2] - point[2];
        distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    if (distance < minDistance) {
      minDistance = distance;
      nearest = vertex;
    }
  }

  return nearest ? { vertex: nearest, distance: minDistance } : null;
}

/**
 * 두 점 사이의 거리 계산 (mm)
 * 3D 거리 계산 지원
 */
export function calculateDistance(start: MeasurePoint, end: MeasurePoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * 100; // three.js 단위를 mm로 변환
}

/**
 * 가이드선의 오프셋 계산
 * 두 점을 기준으로 수직/수평 오프셋을 계산
 * 3D 좌표를 지원 (X, Y, Z 중 가장 큰 변화량 기준)
 */
export function calculateGuideOffset(
  start: MeasurePoint,
  end: MeasurePoint,
  mousePos: MeasurePoint
): number {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const dz = Math.abs(end[2] - start[2]);

  // 가장 큰 변화량을 찾아서 해당 축의 수직 방향으로 오프셋 계산
  if (dx >= dy && dx >= dz) {
    // X축이 주 방향 -> Y 또는 Z 오프셋
    if (dy > dz) {
      return mousePos[1] - start[1]; // Y 오프셋
    } else {
      return mousePos[2] - start[2]; // Z 오프셋
    }
  } else if (dy >= dx && dy >= dz) {
    // Y축이 주 방향 -> X 또는 Z 오프셋
    if (dx > dz) {
      return mousePos[0] - start[0]; // X 오프셋
    } else {
      return mousePos[2] - start[2]; // Z 오프셋
    }
  } else {
    // Z축이 주 방향 -> X 또는 Y 오프셋
    if (dx > dy) {
      return mousePos[0] - start[0]; // X 오프셋
    } else {
      return mousePos[1] - start[1]; // Y 오프셋
    }
  }
}

/**
 * 가이드선 점들 계산
 * 3D 좌표를 지원 (X, Y, Z 중 가장 큰 변화량 기준)
 */
export function calculateGuidePoints(
  start: MeasurePoint,
  end: MeasurePoint,
  offset: number
): { start: MeasurePoint; end: MeasurePoint } {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const dz = Math.abs(end[2] - start[2]);

  // 가장 큰 변화량을 찾아서 해당 축의 수직 방향으로 오프셋 적용
  if (dx >= dy && dx >= dz) {
    // X축이 주 방향 -> Y 또는 Z 오프셋
    if (dy > dz) {
      return {
        start: [start[0], start[1] + offset, start[2]],
        end: [end[0], end[1] + offset, end[2]]
      };
    } else {
      return {
        start: [start[0], start[1], start[2] + offset],
        end: [end[0], end[1], end[2] + offset]
      };
    }
  } else if (dy >= dx && dy >= dz) {
    // Y축이 주 방향 -> X 또는 Z 오프셋
    if (dx > dz) {
      return {
        start: [start[0] + offset, start[1], start[2]],
        end: [end[0] + offset, end[1], end[2]]
      };
    } else {
      return {
        start: [start[0], start[1], start[2] + offset],
        end: [end[0], end[1], end[2] + offset]
      };
    }
  } else {
    // Z축이 주 방향 -> X 또는 Y 오프셋
    if (dx > dy) {
      return {
        start: [start[0] + offset, start[1], start[2]],
        end: [end[0] + offset, end[1], end[2]]
      };
    } else {
      return {
        start: [start[0], start[1] + offset, start[2]],
        end: [end[0], end[1] + offset, end[2]]
      };
    }
  }
}
