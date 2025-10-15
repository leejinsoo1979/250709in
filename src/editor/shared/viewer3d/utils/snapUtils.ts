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
  viewDirection?: 'front' | 'left' | 'right' | 'top',
  snapDistance: number = SNAP_DISTANCE
): { vertex: MeasurePoint; distance: number } | null {
  let nearest: MeasurePoint | null = null;
  let minDistance = snapDistance;

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
 * 수직/수평 거리만 계산 (가장 큰 변화량의 축만 사용)
 * 정면뷰에서는 Z축 무시
 */
export function calculateDistance(
  start: MeasurePoint,
  end: MeasurePoint,
  viewDirection?: 'front' | 'left' | 'right' | 'top'
): number {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const dz = Math.abs(end[2] - start[2]);

  // 정면뷰: X, Y축만 측정 (Z축 무시)
  if (viewDirection === 'front') {
    const maxDistance = Math.max(dx, dy);
    return maxDistance * 100; // three.js 단위를 mm로 변환
  }

  // 가장 큰 변화량을 가진 축의 거리만 반환 (수직/수평만 허용)
  const maxDistance = Math.max(dx, dy, dz);
  return maxDistance * 100; // three.js 단위를 mm로 변환
}

/**
 * 가이드선의 오프셋 계산
 * 마우스 위치의 절대 좌표를 반환 (상대 거리가 아님)
 * calculateGuidePoints에서 이 값을 그대로 사용하여 가이드 위치 결정
 */
export function calculateGuideOffset(
  start: MeasurePoint,
  end: MeasurePoint,
  mousePos: MeasurePoint,
  viewDirection?: 'front' | 'left' | 'right' | 'top'
): number {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const dz = Math.abs(end[2] - start[2]);

  // 뷰 방향에 따라 측정 가능한 축 결정
  switch (viewDirection) {
    case 'front':
      // 정면: XY 평면 - X축 측정이면 Y offset, Y축 측정이면 X offset
      if (dx >= dy) {
        return mousePos[1]; // X축 측정 -> Y offset
      } else {
        return mousePos[0]; // Y축 측정 -> X offset
      }
    case 'top':
      // 상단: XZ 평면 - X축 측정이면 Z offset, Z축 측정이면 X offset
      if (dx >= dz) {
        return mousePos[2]; // X축 측정 -> Z offset
      } else {
        return mousePos[0]; // Z축 측정 -> X offset
      }
    case 'left':
    case 'right':
      // 측면: YZ 평면 - Y축 측정이면 Z offset, Z축 측정이면 Y offset
      if (dy >= dz) {
        return mousePos[2]; // Y축 측정 -> Z offset
      } else {
        return mousePos[1]; // Z축 측정 -> Y offset
      }
    default:
      // 기본: 가장 큰 변화량 기준
      if (dx >= dy && dx >= dz) {
        return mousePos[1]; // X축 -> Y offset
      } else if (dy >= dx && dy >= dz) {
        return mousePos[0]; // Y축 -> X offset
      } else {
        return mousePos[0]; // Z축 -> X offset
      }
  }
}

/**
 * 가이드선 점들 계산
 * 수직/수평 측정만 지원 (대각선 측정 시 수직 또는 수평으로 투영)
 * offset은 절대 좌표 값 (calculateGuideOffset에서 반환된 마우스 위치)
 */
export function calculateGuidePoints(
  start: MeasurePoint,
  end: MeasurePoint,
  offset: number,
  viewDirection?: 'front' | 'left' | 'right' | 'top'
): { start: MeasurePoint; end: MeasurePoint } {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);
  const dz = Math.abs(end[2] - start[2]);

  // 뷰 방향에 따라 측정 축 결정
  switch (viewDirection) {
    case 'front':
      // 정면: XY 평면만 측정
      if (dx >= dy) {
        // X축 측정 (가로)
        return {
          start: [start[0], offset, start[2]],
          end: [end[0], offset, start[2]]
        };
      } else {
        // Y축 측정 (세로)
        return {
          start: [offset, start[1], start[2]],
          end: [offset, end[1], start[2]]
        };
      }
    case 'top':
      // 상단: XZ 평면만 측정
      if (dx >= dz) {
        // X축 측정 (가로)
        return {
          start: [start[0], start[1], offset],
          end: [end[0], start[1], offset]
        };
      } else {
        // Z축 측정 (깊이)
        return {
          start: [offset, start[1], start[2]],
          end: [offset, start[1], end[2]]
        };
      }
    case 'left':
    case 'right':
      // 측면: YZ 평면만 측정
      if (dy >= dz) {
        // Y축 측정 (세로)
        return {
          start: [start[0], start[1], offset],
          end: [start[0], end[1], offset]
        };
      } else {
        // Z축 측정 (깊이)
        return {
          start: [start[0], offset, start[2]],
          end: [start[0], offset, end[2]]
        };
      }
    default:
      // 기본: 가장 큰 변화량 기준
      if (dx >= dy && dx >= dz) {
        // X축 측정
        return {
          start: [start[0], offset, start[2]],
          end: [end[0], offset, end[2]]
        };
      } else if (dy >= dx && dy >= dz) {
        // Y축 측정
        return {
          start: [offset, start[1], start[2]],
          end: [offset, end[1], end[2]]
        };
      } else {
        // Z축 측정
        return {
          start: [offset, start[1], start[2]],
          end: [offset, start[1], end[2]]
        };
      }
  }
}
