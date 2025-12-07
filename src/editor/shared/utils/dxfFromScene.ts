import { DxfWriter, point3d } from '@tarikjabiri/dxf';
import { sceneHolder } from '../viewer3d/sceneHolder';
import { extractSceneEdges, calculateBoundingBox, type ExtractedLine, type ViewDirection } from './sceneEdgeExtractor';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { formatDxfDate } from './dxfKoreanText';

// 도면 타입 정의
export type DrawingType = 'front' | 'plan' | 'side';

/**
 * 뷰 방향을 추출 옵션의 ViewDirection으로 변환
 */
const drawingTypeToViewDirection = (drawingType: DrawingType): ViewDirection => {
  switch (drawingType) {
    case 'front':
      return 'front';
    case 'plan':
      return 'top';
    case 'side':
      return 'left';
    default:
      return 'front';
  }
};

/**
 * DXF 레이어 설정
 */
const setupDXFLayers = (dxf: DxfWriter): void => {
  // 레이어 추가
  dxf.addLayer('SPACE', 8, 'CONTINUOUS'); // 회색 - 공간 외곽선
  dxf.addLayer('FURNITURE', 7, 'CONTINUOUS'); // 흰색/검정 - 가구
  dxf.addLayer('DOOR', 4, 'CONTINUOUS'); // 청록색 - 도어
  dxf.addLayer('DIMENSIONS', 1, 'CONTINUOUS'); // 빨강 - 치수
  dxf.addLayer('TEXT', 2, 'CONTINUOUS'); // 노랑 - 텍스트
};

/**
 * 추출된 라인들을 DXF에 추가
 */
const addLinesToDXF = (dxf: DxfWriter, lines: ExtractedLine[]): void => {
  for (const line of lines) {
    // 레이어 설정 (레이어가 있으면 사용, 없으면 FURNITURE)
    const layer = line.layer || 'FURNITURE';

    try {
      dxf.setCurrentLayerName(layer);
    } catch {
      // 레이어가 없으면 FURNITURE 사용
      dxf.setCurrentLayerName('FURNITURE');
    }

    // 라인 추가
    dxf.addLine(
      point3d(line.x1, line.y1),
      point3d(line.x2, line.y2)
    );
  }
};

/**
 * 치수선 추가
 */
const addDimensions = (
  dxf: DxfWriter,
  lines: ExtractedLine[],
  spaceInfo: SpaceInfo,
  drawingType: DrawingType
): void => {
  dxf.setCurrentLayerName('DIMENSIONS');

  const bbox = calculateBoundingBox(lines);
  const margin = 100; // 치수선 마진 (mm)

  // 바운딩 박스 크기가 유효하지 않으면 공간 정보 사용
  const width = bbox.width > 0 ? bbox.width : spaceInfo.width;
  const height = bbox.height > 0 ? bbox.height : spaceInfo.height;

  // 치수 위치 계산
  const dimY = bbox.minY - margin;
  const dimX = bbox.maxX + margin;

  // 가로 치수선 (하단)
  if (width > 0) {
    // 치수선 (단순화: 시작-끝 라인과 텍스트)
    dxf.addLine(
      point3d(bbox.minX, dimY - 20),
      point3d(bbox.maxX, dimY - 20)
    );
    // 시작 수직선
    dxf.addLine(
      point3d(bbox.minX, dimY - 10),
      point3d(bbox.minX, dimY - 30)
    );
    // 끝 수직선
    dxf.addLine(
      point3d(bbox.maxX, dimY - 10),
      point3d(bbox.maxX, dimY - 30)
    );
  }

  // 세로 치수선 (우측)
  if (height > 0) {
    dxf.addLine(
      point3d(dimX + 20, bbox.minY),
      point3d(dimX + 20, bbox.maxY)
    );
    // 시작 수평선
    dxf.addLine(
      point3d(dimX + 10, bbox.minY),
      point3d(dimX + 30, bbox.minY)
    );
    // 끝 수평선
    dxf.addLine(
      point3d(dimX + 10, bbox.maxY),
      point3d(dimX + 30, bbox.maxY)
    );
  }
};

/**
 * 도면 제목 블록 추가
 */
const addTitleBlock = (
  dxf: DxfWriter,
  spaceInfo: SpaceInfo,
  drawingType: DrawingType,
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): void => {
  dxf.setCurrentLayerName('TEXT');

  const titleY = bbox.minY - 300;
  const centerX = (bbox.minX + bbox.maxX) / 2;

  // 도면 타입별 제목
  const drawingTypeNames: Record<DrawingType, string> = {
    front: 'FRONT ELEVATION',
    plan: 'PLAN VIEW',
    side: 'SIDE SECTION'
  };

  const title = drawingTypeNames[drawingType] || 'DRAWING';

  // 제목 박스
  const boxWidth = 600;
  const boxHeight = 150;

  dxf.addLine(
    point3d(centerX - boxWidth / 2, titleY),
    point3d(centerX + boxWidth / 2, titleY)
  );
  dxf.addLine(
    point3d(centerX + boxWidth / 2, titleY),
    point3d(centerX + boxWidth / 2, titleY - boxHeight)
  );
  dxf.addLine(
    point3d(centerX + boxWidth / 2, titleY - boxHeight),
    point3d(centerX - boxWidth / 2, titleY - boxHeight)
  );
  dxf.addLine(
    point3d(centerX - boxWidth / 2, titleY - boxHeight),
    point3d(centerX - boxWidth / 2, titleY)
  );

  // 내부 구분선
  dxf.addLine(
    point3d(centerX - boxWidth / 2, titleY - boxHeight / 2),
    point3d(centerX + boxWidth / 2, titleY - boxHeight / 2)
  );
};

/**
 * Three.js 씬에서 DXF 생성
 */
export const generateDXFFromScene = (
  spaceInfo: SpaceInfo,
  drawingType: DrawingType
): string | null => {
  // 씬 참조 가져오기
  const scene = sceneHolder.getScene();

  if (!scene) {
    console.error('❌ DXF 생성 실패: Three.js 씬을 찾을 수 없습니다.');
    return null;
  }

  console.log(`📐 DXF 생성 시작 (${drawingType})...`);

  // 뷰 방향 결정
  const viewDirection = drawingTypeToViewDirection(drawingType);

  // 씬에서 edge 추출
  const lines = extractSceneEdges(scene, {
    viewDirection,
    scale: 100 // 1 Three.js unit = 100mm
  });

  console.log(`📐 추출된 라인 수: ${lines.length}`);

  if (lines.length === 0) {
    console.warn('⚠️ 추출된 라인이 없습니다.');
  }

  // 바운딩 박스 계산
  const bbox = calculateBoundingBox(lines);

  console.log(`📐 바운딩 박스:`, bbox);

  // DXF 생성
  const dxf = new DxfWriter();

  // 레이어 설정
  setupDXFLayers(dxf);

  // 라인 추가
  addLinesToDXF(dxf, lines);

  // 치수선 추가
  addDimensions(dxf, lines, spaceInfo, drawingType);

  // 제목 블록 추가
  addTitleBlock(dxf, spaceInfo, drawingType, bbox);

  // DXF 문자열 생성
  const dxfString = dxf.stringify();

  console.log(`✅ DXF 생성 완료 (${drawingType})`);

  return dxfString;
};

/**
 * DXF 파일 다운로드
 */
export const downloadDXFFromScene = (
  dxfContent: string,
  filename: string
): void => {
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

/**
 * DXF 파일명 생성
 */
export const generateDXFFilenameFromScene = (
  spaceInfo: SpaceInfo,
  drawingType: DrawingType
): string => {
  const timestamp = formatDxfDate();
  const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;

  const typeNames: Record<DrawingType, string> = {
    front: 'front',
    plan: 'plan',
    side: 'side'
  };

  return `furniture-${typeNames[drawingType]}-${dimensions}-${timestamp}.dxf`;
};
