import * as THREE from 'three';
import { MeasurePoint } from '@/store/uiStore';

/**
 * 스냅 거리 (three.js 단위)
 * 0.1 = 10mm (모서리 스냅에 적당한 값)
 */
export const SNAP_DISTANCE = 0.1;

/**
 * 객체의 모든 꼭지점을 추출
 * visible=false인 노드 및 그 하위는 건너뜀 (보이지 않는 드롭존/충돌 메시 제외)
 */
export function extractVertices(object: THREE.Object3D): MeasurePoint[] {
  const vertices: MeasurePoint[] = [];
  const worldMatrix = new THREE.Matrix4();
  const processedVertices = new Set<string>();
  let meshCount = 0;

  // traverse 대신 재귀 순회: visible=false인 노드의 하위 전체를 건너뜀
  function visitNode(node: THREE.Object3D) {
    if (!node.visible) return; // 숨겨진 노드 및 하위 전체 스킵

    if ((node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.LineSegments) && node.geometry) {
      meshCount++;
      const geometry = node.geometry;

      // 월드 매트릭스 계산
      node.updateMatrixWorld(true);
      worldMatrix.copy(node.matrixWorld);

      // 위치 속성 가져오기
      const positions = geometry.attributes.position;
      if (!positions) {
        return;
      }

      const vertex = new THREE.Vector3();

      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        vertex.applyMatrix4(worldMatrix);

        // 부동소수점 오차 제거: 소수점 4자리로 반올림 (0.01mm 정밀도)
        // Float32 행렬 변환 후 발생하는 미세 오차를 제거하여 정확한 스냅 보장
        const rx = Math.round(vertex.x * 10000) / 10000;
        const ry = Math.round(vertex.y * 10000) / 10000;
        const rz = Math.round(vertex.z * 10000) / 10000;

        const key = `${rx},${ry},${rz}`;
        if (!processedVertices.has(key)) {
          processedVertices.add(key);
          vertices.push([rx, ry, rz]);
        }
      }
    }

    for (const child of node.children) {
      visitNode(child);
    }
  }

  visitNode(object);

  console.log(`📐 꼭지점 추출 완료: ${meshCount}개 객체에서 ${vertices.length}개 꼭지점 발견`);

  return vertices;
}

/**
 * 2D 뷰에서 보이는 엣지 선분들의 교차점을 계산하여 추가 스냅 포인트 생성
 * 서로 다른 패널의 엣지가 2D 투영에서 교차하는 점을 찾음
 */
export function extractEdgeIntersections(
  object: THREE.Object3D,
  viewDirection: 'front' | 'left' | 'right' | 'top'
): MeasurePoint[] {
  type Seg2D = { a: [number, number]; b: [number, number]; z: number };
  const segments: Seg2D[] = [];
  const worldMatrix = new THREE.Matrix4();

  // 1) 모든 visible Line/LineSegments에서 선분 추출 (2D 투영)
  function visitNode(node: THREE.Object3D) {
    if (!node.visible) return;

    if ((node instanceof THREE.Line || node instanceof THREE.LineSegments) && node.geometry) {
      const positions = node.geometry.attributes.position;
      if (!positions) { visitChildren(); return; }

      node.updateMatrixWorld(true);
      worldMatrix.copy(node.matrixWorld);

      const v = new THREE.Vector3();
      const verts: [number, number, number][] = [];
      for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);
        v.applyMatrix4(worldMatrix);
        verts.push([v.x, v.y, v.z]);
      }

      // Line: 연속 선분, LineSegments: 쌍별 선분
      if (node instanceof THREE.LineSegments) {
        for (let i = 0; i + 1 < verts.length; i += 2) {
          addSegment(verts[i], verts[i + 1]);
        }
      } else {
        for (let i = 0; i + 1 < verts.length; i++) {
          addSegment(verts[i], verts[i + 1]);
        }
      }
    }

    visitChildren();

    function visitChildren() {
      for (const child of node.children) visitNode(child);
    }
  }

  function addSegment(p1: [number, number, number], p2: [number, number, number]) {
    let a: [number, number], b: [number, number], z: number;
    switch (viewDirection) {
      case 'front':
        a = [p1[0], p1[1]]; b = [p2[0], p2[1]]; z = 0; break;
      case 'left': case 'right':
        a = [p1[2], p1[1]]; b = [p2[2], p2[1]]; z = 0; break;
      case 'top':
        a = [p1[0], p1[2]]; b = [p2[0], p2[2]]; z = 0; break;
      default:
        a = [p1[0], p1[1]]; b = [p2[0], p2[1]]; z = 0;
    }
    // 길이 0인 선분 무시
    if (Math.abs(a[0] - b[0]) < 0.0001 && Math.abs(a[1] - b[1]) < 0.0001) return;
    segments.push({ a, b, z });
  }

  visitNode(object);

  // 2) 수직/수평 선분만 필터 (대각선 교차는 무시 — 가구는 직교 구조)
  const EPS = 0.001;
  const hSegs: Seg2D[] = []; // 수평 (y 동일)
  const vSegs: Seg2D[] = []; // 수직 (x 동일)
  for (const s of segments) {
    if (Math.abs(s.a[1] - s.b[1]) < EPS) hSegs.push(s);
    else if (Math.abs(s.a[0] - s.b[0]) < EPS) vSegs.push(s);
  }

  // 3) 수평×수직 교차점 계산 (성능 보호: 선분이 너무 많으면 스킵)
  if (hSegs.length * vSegs.length > 50000) {
    return [];
  }

  const intersections: MeasurePoint[] = [];
  const seen = new Set<string>();

  for (const h of hSegs) {
    const y = (h.a[1] + h.b[1]) / 2;
    const hMinX = Math.min(h.a[0], h.b[0]);
    const hMaxX = Math.max(h.a[0], h.b[0]);

    for (const vv of vSegs) {
      const x = (vv.a[0] + vv.b[0]) / 2;
      const vMinY = Math.min(vv.a[1], vv.b[1]);
      const vMaxY = Math.max(vv.a[1], vv.b[1]);

      // 교차 조건: x가 수평 범위 안, y가 수직 범위 안
      if (x >= hMinX - EPS && x <= hMaxX + EPS && y >= vMinY - EPS && y <= vMaxY + EPS) {
        const rx = Math.round(x * 10000) / 10000;
        const ry = Math.round(y * 10000) / 10000;
        const key = `${rx},${ry}`;
        if (!seen.has(key)) {
          seen.add(key);
          // 뷰 방향에 맞게 3D 좌표 복원
          switch (viewDirection) {
            case 'front': intersections.push([rx, ry, 0]); break;
            case 'left': case 'right': intersections.push([0, ry, rx]); break;
            case 'top': intersections.push([rx, 0, ry]); break;
          }
        }
      }
    }
  }

  return intersections;
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
 * 가이드 포인트를 기반으로 실제 측정 축의 거리 계산
 */
export function calculateDistance(
  start: MeasurePoint,
  end: MeasurePoint,
  viewDirection?: 'front' | 'left' | 'right' | 'top',
  guideStart?: MeasurePoint,
  guideEnd?: MeasurePoint
): number {
  // guidePoints가 제공된 경우, 가이드 방향을 기준으로 거리 계산
  if (guideStart && guideEnd) {
    const guideDx = Math.abs(guideEnd[0] - guideStart[0]);
    const guideDy = Math.abs(guideEnd[1] - guideStart[1]);
    const guideDz = Math.abs(guideEnd[2] - guideStart[2]);

    // 가이드가 어느 축 방향인지 판단하여 해당 축의 거리 반환
    const maxGuideDistance = Math.max(guideDx, guideDy, guideDz);
    return maxGuideDistance * 100; // three.js 단위를 mm로 변환
  }

  // guidePoints가 없는 경우 기존 로직 (하위 호환성)
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
 * 마우스 위치를 그대로 반환 (전체 3D 좌표)
 * calculateGuidePoints에서 측정 방향에 수직인 평면상의 점으로 투영
 */
export function calculateGuideOffset(
  start: MeasurePoint,
  end: MeasurePoint,
  mousePos: MeasurePoint,
  viewDirection?: 'front' | 'left' | 'right' | 'top'
): MeasurePoint {
  // 마우스 위치를 그대로 반환
  return mousePos;
}

/**
 * 가이드선 점들 계산
 * 수직/수평 측정만 지원 (대각선 측정 시 수직 또는 수평으로 투영)
 * offsetPoint는 마우스 위치 (3D 좌표)
 * 측정선과 평행하게 가이드선을 그리되, offsetPoint를 지나도록 투영
 * 가이드 방향은 마우스 오프셋 방향으로 결정 (상하 이동 → 가로선, 좌우 이동 → 세로선)
 *
 * 실시간으로 가이드 방향이 바뀌도록, 측정선에서 마우스까지의 수직 거리를 기준으로 방향 결정
 */
export function calculateGuidePoints(
  start: MeasurePoint,
  end: MeasurePoint,
  offsetPoint: MeasurePoint,
  viewDirection?: 'front' | 'left' | 'right' | 'top'
): { start: MeasurePoint; end: MeasurePoint } {
  // 뷰 방향에 따라 측정 축 결정
  switch (viewDirection) {
    case 'front': {
      // 정면: XY 평면만 측정 (Z=0 강제)
      // 측정선을 X축 가로선과 Y축 세로선으로 가정하고 각각 마우스까지 거리 계산

      // X축 가로선 (start/end의 Y 평균값에 수평선) 기준으로 마우스까지 Y 거리
      const horizontalLineY = (start[1] + end[1]) / 2;
      const distanceToHorizontal = Math.abs(offsetPoint[1] - horizontalLineY);

      // Y축 세로선 (start/end의 X 평균값에 수직선) 기준으로 마우스까지 X 거리
      const verticalLineX = (start[0] + end[0]) / 2;
      const distanceToVertical = Math.abs(offsetPoint[0] - verticalLineX);

      if (distanceToHorizontal >= distanceToVertical) {
        // Y 방향으로 더 멀리 떨어져 있음 → X축 측정 (가로)
        return {
          start: [start[0], offsetPoint[1], 0],
          end: [end[0], offsetPoint[1], 0]
        };
      } else {
        // X 방향으로 더 멀리 떨어져 있음 → Y축 측정 (세로)
        return {
          start: [offsetPoint[0], start[1], 0],
          end: [offsetPoint[0], end[1], 0]
        };
      }
    }
    case 'top': {
      // 상단: XZ 평면만 측정 (Y=0 강제)
      const horizontalLineZ = (start[2] + end[2]) / 2;
      const distanceToHorizontal = Math.abs(offsetPoint[2] - horizontalLineZ);

      const verticalLineX = (start[0] + end[0]) / 2;
      const distanceToVertical = Math.abs(offsetPoint[0] - verticalLineX);

      if (distanceToHorizontal >= distanceToVertical) {
        // Z 방향으로 더 멀리 → X축 측정 (가로)
        return {
          start: [start[0], 0, offsetPoint[2]],
          end: [end[0], 0, offsetPoint[2]]
        };
      } else {
        // X 방향으로 더 멀리 → Z축 측정 (깊이)
        return {
          start: [offsetPoint[0], 0, start[2]],
          end: [offsetPoint[0], 0, end[2]]
        };
      }
    }
    case 'left':
    case 'right': {
      // 측면: YZ 평면만 측정 (X=0 강제)
      const horizontalLineZ = (start[2] + end[2]) / 2;
      const distanceToHorizontal = Math.abs(offsetPoint[2] - horizontalLineZ);

      const verticalLineY = (start[1] + end[1]) / 2;
      const distanceToVertical = Math.abs(offsetPoint[1] - verticalLineY);

      if (distanceToHorizontal >= distanceToVertical) {
        // Z 방향으로 더 멀리 → Y축 측정 (세로)
        return {
          start: [0, start[1], offsetPoint[2]],
          end: [0, end[1], offsetPoint[2]]
        };
      } else {
        // Y 방향으로 더 멀리 → Z축 측정 (깊이)
        return {
          start: [0, offsetPoint[1], start[2]],
          end: [0, offsetPoint[1], end[2]]
        };
      }
    }
    default: {
      // 기본: 3D 공간에서 거리 기준
      const midX = (start[0] + end[0]) / 2;
      const midY = (start[1] + end[1]) / 2;
      const midZ = (start[2] + end[2]) / 2;

      const offsetX = Math.abs(offsetPoint[0] - midX);
      const offsetY = Math.abs(offsetPoint[1] - midY);
      const offsetZ = Math.abs(offsetPoint[2] - midZ);

      if (offsetX >= offsetY && offsetX >= offsetZ) {
        // X 방향 오프셋 → Y 또는 Z축 측정
        if (offsetY >= offsetZ) {
          return {
            start: [offsetPoint[0], start[1], start[2]],
            end: [offsetPoint[0], end[1], end[2]]
          };
        } else {
          return {
            start: [offsetPoint[0], start[1], start[2]],
            end: [offsetPoint[0], start[1], end[2]]
          };
        }
      } else if (offsetY >= offsetX && offsetY >= offsetZ) {
        // Y 방향 오프셋 → X 또는 Z축 측정
        if (offsetX >= offsetZ) {
          return {
            start: [start[0], offsetPoint[1], start[2]],
            end: [end[0], offsetPoint[1], end[2]]
          };
        } else {
          return {
            start: [offsetPoint[0], offsetPoint[1], start[2]],
            end: [offsetPoint[0], offsetPoint[1], end[2]]
          };
        }
      } else {
        // Z 방향 오프셋 → X 또는 Y축 측정
        if (offsetX >= offsetY) {
          return {
            start: [start[0], offsetPoint[1], offsetPoint[2]],
            end: [end[0], offsetPoint[1], offsetPoint[2]]
          };
        } else {
          return {
            start: [offsetPoint[0], start[1], offsetPoint[2]],
            end: [offsetPoint[0], end[1], offsetPoint[2]]
          };
        }
      }
    }
  }
}
