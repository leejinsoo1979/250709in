import * as THREE from 'three';

// 추출된 2D 라인 데이터
export interface ExtractedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer?: string; // 레이어 정보 (가구, 공간 등)
  color?: number; // DXF 색상 코드
}

// 뷰 방향 타입
export type ViewDirection = 'front' | 'left' | 'right' | 'top';

// 추출 옵션
export interface ExtractionOptions {
  viewDirection: ViewDirection;
  includeEdges?: boolean; // EdgeGeometry 포함
  includeFaces?: boolean; // Face의 edge 포함
  scale?: number; // mm 단위로 변환할 스케일 (Three.js units → mm)
}

/**
 * 객체의 전체 부모 계층에서 패턴 검색
 */
const hasAncestorWithPattern = (object: THREE.Object3D, patterns: string[]): boolean => {
  let current: THREE.Object3D | null = object;
  while (current) {
    const name = current.name?.toLowerCase() || '';
    for (const pattern of patterns) {
      if (name.includes(pattern)) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
};

/**
 * 객체가 DXF에 포함되어야 하는지 확인
 * 그리드, 조명, 헬퍼 등은 제외
 */
const shouldIncludeObject = (object: THREE.Object3D): boolean => {
  const name = object.name?.toLowerCase() || '';
  const type = object.type?.toLowerCase() || '';

  // 제외할 객체 패턴 (이름 또는 부모 이름에 포함)
  // 주의: 가구와 치수선은 제외하지 않음
  const excludePatterns = [
    'grid',
    'helper',
    'light',
    'camera',
    'controls',
    'axes',
    'background',
    'sky',
    'ambient',
    'directional',
    'point_light',
    'spot_light',
    'gizmo',
    'overlay',
    'debug',
    'slot_drop', // 슬롯 드롭존
    'drop_zone',
    'ghost', // 고스트 미리보기
    'preview',
    'cadgrid', // CAD 그리드
    'infinitegrid', // 무한 그리드
    'column_guide', // 기둥 가이드
    'placement_plane', // 배치 평면
    'boundary' // 경계선
    // 'room', 'floor_plane', 'nativeline', 'guide', 'highlight', 'measure', 'dimension_line' 제거
    // - room: 가구가 room 그룹 안에 있을 수 있음
    // - dimension_line: 치수선은 별도 처리
    // - nativeline: 치수선이 NativeLine 사용
  ];

  // 부모 계층에서 제외 패턴 확인
  if (hasAncestorWithPattern(object, excludePatterns)) {
    return false;
  }

  // 타입 체크 - 메쉬만 포함
  if (type === 'scene' || type === 'group') {
    return true; // 그룹은 자식 순회를 위해 true
  }

  // 라이트 제외
  if (type.includes('light')) {
    return false;
  }

  // 헬퍼 제외
  if (type.includes('helper')) {
    return false;
  }

  // Line, LineSegments: 치수선(dimension)만 포함
  if (type === 'line' || type === 'linesegments') {
    // 치수선은 포함 (name에 'dimension' 포함)
    if (name.includes('dimension')) {
      return true;
    }
    // 그리드 관련 라인은 제외
    if (name.includes('grid')) {
      return false;
    }
    // 기타 라인은 제외 (가이드선 등)
    return false;
  }

  // Mesh인 경우 추가 검사
  if (object instanceof THREE.Mesh) {
    const mesh = object as THREE.Mesh;
    const geometry = mesh.geometry;

    // PlaneGeometry는 모두 제외 (바닥, 벽, 그리드 등)
    if (geometry instanceof THREE.PlaneGeometry) {
      return false;
    }

    // ShaderMaterial 사용 시 (Grid 컴포넌트) 제외
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat.type === 'ShaderMaterial') {
          return false;
        }
      }
    }

    // 투명 머티리얼 제외 (슬롯 영역 등)
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat instanceof THREE.MeshBasicMaterial && mat.opacity < 0.5) {
          return false;
        }
      }
    }
  }

  return true;
};

/**
 * Three.js 3D 좌표를 2D 도면 좌표로 변환
 *
 * 좌표계:
 * - front (정면도): X → X, Y → Y (Z 무시)
 * - left (좌측면도): Z → X, Y → Y (X 무시)
 * - right (우측면도): -Z → X, Y → Y (X 무시)
 * - top (평면도): X → X, -Z → Y (Y 무시)
 */
const projectTo2D = (
  point: THREE.Vector3,
  viewDirection: ViewDirection,
  scale: number = 100 // 기본 스케일: 1 Three.js unit = 100mm
): { x: number; y: number } => {
  switch (viewDirection) {
    case 'front':
      // 정면도: X, Y 축 사용
      return { x: point.x * scale, y: point.y * scale };
    case 'left':
      // 좌측면도: Z, Y 축 사용 (왼쪽에서 보므로 Z가 X로)
      return { x: point.z * scale, y: point.y * scale };
    case 'right':
      // 우측면도: -Z, Y 축 사용 (오른쪽에서 보므로 -Z가 X로)
      return { x: -point.z * scale, y: point.y * scale };
    case 'top':
      // 평면도: X, -Z 축 사용 (위에서 아래를 보므로)
      return { x: point.x * scale, y: -point.z * scale };
    default:
      return { x: point.x * scale, y: point.y * scale };
  }
};

/**
 * BoxGeometry에서 edge 추출
 */
const extractEdgesFromBox = (
  mesh: THREE.Mesh,
  viewDirection: ViewDirection,
  scale: number
): ExtractedLine[] => {
  const lines: ExtractedLine[] = [];
  const geometry = mesh.geometry as THREE.BoxGeometry;

  if (!geometry || !geometry.isBufferGeometry) return lines;

  // EdgeGeometry를 사용하여 모든 edge 추출
  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  const positionAttr = edgeGeometry.getAttribute('position');

  if (!positionAttr) {
    edgeGeometry.dispose();
    return lines;
  }

  // 월드 좌표로 변환하기 위한 매트릭스
  mesh.updateMatrixWorld(true);
  const worldMatrix = mesh.matrixWorld;

  // edge 배열에서 라인 추출 (2개씩 묶어서 하나의 라인)
  for (let i = 0; i < positionAttr.count; i += 2) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    );
    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    );

    // 월드 좌표로 변환
    p1.applyMatrix4(worldMatrix);
    p2.applyMatrix4(worldMatrix);

    // 2D 좌표로 투영
    const proj1 = projectTo2D(p1, viewDirection, scale);
    const proj2 = projectTo2D(p2, viewDirection, scale);

    // 뷰 방향에 따른 edge 필터링
    // 정면도에서는 Z축 방향 edge 제외, 측면도에서는 X축 방향 edge 제외 등
    const shouldInclude = shouldIncludeEdge(p1, p2, viewDirection);

    if (shouldInclude) {
      lines.push({
        x1: proj1.x,
        y1: proj1.y,
        x2: proj2.x,
        y2: proj2.y
      });
    }
  }

  edgeGeometry.dispose();
  return lines;
};

/**
 * 뷰 방향에 따라 edge를 포함할지 결정
 * 시선 방향과 평행한 edge는 점으로 보이므로 제외
 */
const shouldIncludeEdge = (
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  viewDirection: ViewDirection
): boolean => {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const dz = Math.abs(p2.z - p1.z);
  const epsilon = 0.001; // 허용 오차

  switch (viewDirection) {
    case 'front':
      // 정면도: Z축 방향 edge는 제외 (점으로 보임)
      if (dx < epsilon && dy < epsilon && dz > epsilon) return false;
      break;
    case 'left':
    case 'right':
      // 측면도: X축 방향 edge는 제외 (점으로 보임)
      if (dx > epsilon && dy < epsilon && dz < epsilon) return false;
      break;
    case 'top':
      // 평면도: Y축 방향 edge는 제외 (점으로 보임)
      if (dx < epsilon && dy > epsilon && dz < epsilon) return false;
      break;
  }

  // 2D로 투영했을 때 길이가 0에 가까운 선은 제외
  const proj1 = projectTo2D(p1, viewDirection, 1);
  const proj2 = projectTo2D(p2, viewDirection, 1);
  const projLength = Math.sqrt(
    Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
  );

  return projLength > epsilon;
};

/**
 * CylinderGeometry에서 edge 추출 (옷걸이 봉, 환기캡 등)
 */
const extractEdgesFromCylinder = (
  mesh: THREE.Mesh,
  viewDirection: ViewDirection,
  scale: number
): ExtractedLine[] => {
  const lines: ExtractedLine[] = [];
  const geometry = mesh.geometry as THREE.CylinderGeometry;

  if (!geometry || !geometry.isBufferGeometry) return lines;

  // EdgeGeometry 사용
  const edgeGeometry = new THREE.EdgesGeometry(geometry, 30); // 30도 이상 각도만 edge로 처리
  const positionAttr = edgeGeometry.getAttribute('position');

  if (!positionAttr) {
    edgeGeometry.dispose();
    return lines;
  }

  mesh.updateMatrixWorld(true);
  const worldMatrix = mesh.matrixWorld;

  for (let i = 0; i < positionAttr.count; i += 2) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    );
    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    );

    p1.applyMatrix4(worldMatrix);
    p2.applyMatrix4(worldMatrix);

    const proj1 = projectTo2D(p1, viewDirection, scale);
    const proj2 = projectTo2D(p2, viewDirection, scale);

    // 투영된 선의 길이 확인
    const length = Math.sqrt(
      Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
    );

    if (length > 0.1) { // 최소 길이 필터
      lines.push({
        x1: proj1.x,
        y1: proj1.y,
        x2: proj2.x,
        y2: proj2.y
      });
    }
  }

  edgeGeometry.dispose();
  return lines;
};

/**
 * Line 객체에서 edge 추출 (치수선용)
 */
const extractEdgesFromLine = (
  line: THREE.Line,
  viewDirection: ViewDirection,
  scale: number
): ExtractedLine[] => {
  const lines: ExtractedLine[] = [];
  const geometry = line.geometry;

  if (!geometry || !geometry.isBufferGeometry) return lines;

  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) return lines;

  line.updateMatrixWorld(true);
  const worldMatrix = line.matrixWorld;

  // Line은 연속된 점들로 구성 (p1-p2, p2-p3, ...)
  for (let i = 0; i < positionAttr.count - 1; i++) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    );
    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    );

    p1.applyMatrix4(worldMatrix);
    p2.applyMatrix4(worldMatrix);

    const proj1 = projectTo2D(p1, viewDirection, scale);
    const proj2 = projectTo2D(p2, viewDirection, scale);

    // 투영된 선의 길이 확인
    const length = Math.sqrt(
      Math.pow(proj2.x - proj1.x, 2) + Math.pow(proj2.y - proj1.y, 2)
    );

    if (length > 0.1) { // 최소 길이 필터
      lines.push({
        x1: proj1.x,
        y1: proj1.y,
        x2: proj2.x,
        y2: proj2.y
      });
    }
  }

  return lines;
};

/**
 * 일반 BufferGeometry에서 edge 추출
 */
const extractEdgesFromGeometry = (
  mesh: THREE.Mesh,
  viewDirection: ViewDirection,
  scale: number,
  thresholdAngle: number = 1 // 1도 - 거의 모든 edge 포함
): ExtractedLine[] => {
  const lines: ExtractedLine[] = [];
  const geometry = mesh.geometry;

  if (!geometry || !geometry.isBufferGeometry) return lines;

  // EdgesGeometry로 외곽선 추출
  const edgeGeometry = new THREE.EdgesGeometry(geometry, thresholdAngle);
  const positionAttr = edgeGeometry.getAttribute('position');

  if (!positionAttr) {
    edgeGeometry.dispose();
    return lines;
  }

  mesh.updateMatrixWorld(true);
  const worldMatrix = mesh.matrixWorld;

  for (let i = 0; i < positionAttr.count; i += 2) {
    const p1 = new THREE.Vector3(
      positionAttr.getX(i),
      positionAttr.getY(i),
      positionAttr.getZ(i)
    );
    const p2 = new THREE.Vector3(
      positionAttr.getX(i + 1),
      positionAttr.getY(i + 1),
      positionAttr.getZ(i + 1)
    );

    p1.applyMatrix4(worldMatrix);
    p2.applyMatrix4(worldMatrix);

    const proj1 = projectTo2D(p1, viewDirection, scale);
    const proj2 = projectTo2D(p2, viewDirection, scale);

    const shouldInclude = shouldIncludeEdge(p1, p2, viewDirection);

    if (shouldInclude) {
      lines.push({
        x1: proj1.x,
        y1: proj1.y,
        x2: proj2.x,
        y2: proj2.y
      });
    }
  }

  edgeGeometry.dispose();
  return lines;
};

/**
 * Three.js 씬에서 모든 visible mesh의 edge 추출
 */
export const extractSceneEdges = (
  scene: THREE.Scene | THREE.Object3D,
  options: ExtractionOptions
): ExtractedLine[] => {
  const { viewDirection, scale = 100 } = options;
  const allLines: ExtractedLine[] = [];

  console.log('🔍 DXF 추출 시작 - viewDirection:', viewDirection, 'scale:', scale);
  let meshCount = 0;
  let lineCount = 0;
  let skippedCount = 0;

  // 씬 트래버스
  scene.traverse((object) => {
    // visible이 아닌 객체는 스킵
    if (!object.visible) return;

    // 그리드, 조명, 헬퍼 등 제외
    if (!shouldIncludeObject(object)) {
      skippedCount++;
      return;
    }

    // Mesh인 경우 처리
    if (object instanceof THREE.Mesh) {
      const mesh = object as THREE.Mesh;
      meshCount++;

      // 머티리얼 visibility 체크
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const allInvisible = materials.every(mat => mat.visible === false || mat.opacity === 0);
        if (allInvisible) return;
      }

      // 지오메트리 타입에 따른 edge 추출
      const geometry = mesh.geometry;
      let edges: ExtractedLine[] = [];

      if (geometry instanceof THREE.BoxGeometry) {
        edges = extractEdgesFromBox(mesh, viewDirection, scale);
      } else if (geometry instanceof THREE.CylinderGeometry) {
        edges = extractEdgesFromCylinder(mesh, viewDirection, scale);
      } else if (geometry && geometry.isBufferGeometry) {
        edges = extractEdgesFromGeometry(mesh, viewDirection, scale);
      }

      // 레이어 정보 추가
      edges.forEach(edge => {
        // 객체 이름 또는 부모 이름으로 레이어 결정
        edge.layer = getLayerFromObject(object);
      });

      allLines.push(...edges);
    }

    // Line 객체 처리 (치수선)
    if (object instanceof THREE.Line && !(object instanceof THREE.LineSegments)) {
      const line = object as THREE.Line;
      const name = line.name?.toLowerCase() || '';

      // 치수선만 처리
      if (name.includes('dimension')) {
        lineCount++;
        const edges = extractEdgesFromLine(line, viewDirection, scale);
        edges.forEach(edge => {
          edge.layer = 'DIMENSIONS';
        });
        allLines.push(...edges);
      }
    }
  });

  console.log('🔍 DXF 추출 완료:', {
    meshCount,
    lineCount,
    skippedCount,
    totalLines: allLines.length
  });

  // 중복 라인 제거
  return removeDuplicateLines(allLines);
};

/**
 * 객체에서 레이어 이름 추출
 */
const getLayerFromObject = (object: THREE.Object3D): string => {
  // 객체 이름 또는 userData에서 레이어 정보 추출
  const name = object.name?.toLowerCase() || '';
  const parentName = object.parent?.name?.toLowerCase() || '';

  // 레이어 분류
  if (name.includes('furniture') || parentName.includes('furniture')) {
    return 'FURNITURE';
  }
  if (name.includes('door') || parentName.includes('door')) {
    return 'DOOR';
  }
  if (name.includes('shelf') || parentName.includes('shelf')) {
    return 'FURNITURE';
  }
  if (name.includes('drawer') || parentName.includes('drawer')) {
    return 'FURNITURE';
  }
  if (name.includes('rod') || parentName.includes('rod')) {
    return 'FURNITURE';
  }
  if (name.includes('room') || parentName.includes('room')) {
    return 'SPACE';
  }
  if (name.includes('wall') || parentName.includes('wall')) {
    return 'SPACE';
  }
  if (name.includes('floor') || parentName.includes('floor')) {
    return 'SPACE';
  }

  return 'FURNITURE'; // 기본값
};

/**
 * 중복 라인 제거
 */
const removeDuplicateLines = (lines: ExtractedLine[]): ExtractedLine[] => {
  const unique: ExtractedLine[] = [];
  const seen = new Set<string>();
  const epsilon = 0.1; // 0.1mm 이하 차이는 동일하게 취급

  for (const line of lines) {
    // 라인의 정규화된 키 생성 (방향 무관)
    const minX = Math.min(line.x1, line.x2);
    const maxX = Math.max(line.x1, line.x2);
    const minY = Math.min(line.y1, line.y2);
    const maxY = Math.max(line.y1, line.y2);

    const key1 = `${Math.round(minX / epsilon)}_${Math.round(minY / epsilon)}_${Math.round(maxX / epsilon)}_${Math.round(maxY / epsilon)}`;

    // 시작점과 끝점이 동일한 경우 (점) 제외
    if (Math.abs(line.x1 - line.x2) < epsilon && Math.abs(line.y1 - line.y2) < epsilon) {
      continue;
    }

    if (!seen.has(key1)) {
      seen.add(key1);
      unique.push(line);
    }
  }

  return unique;
};

/**
 * 추출된 라인을 바운딩 박스 기준으로 정규화 (원점 이동)
 */
export const normalizeLines = (
  lines: ExtractedLine[],
  offsetX: number = 0,
  offsetY: number = 0
): ExtractedLine[] => {
  if (lines.length === 0) return lines;

  // 바운딩 박스 계산
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const line of lines) {
    minX = Math.min(minX, line.x1, line.x2);
    minY = Math.min(minY, line.y1, line.y2);
    maxX = Math.max(maxX, line.x1, line.x2);
    maxY = Math.max(maxY, line.y1, line.y2);
  }

  // 중심점 계산
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // 라인 정규화 (중심을 원점으로 이동 + 오프셋 적용)
  return lines.map(line => ({
    ...line,
    x1: line.x1 - centerX + offsetX,
    y1: line.y1 - centerY + offsetY,
    x2: line.x2 - centerX + offsetX,
    y2: line.y2 - centerY + offsetY
  }));
};

/**
 * 추출된 라인의 바운딩 박스 계산
 */
export const calculateBoundingBox = (
  lines: ExtractedLine[]
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } => {
  if (lines.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const line of lines) {
    minX = Math.min(minX, line.x1, line.x2);
    minY = Math.min(minY, line.y1, line.y2);
    maxX = Math.max(maxX, line.x1, line.x2);
    maxY = Math.max(maxY, line.y1, line.y2);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};
