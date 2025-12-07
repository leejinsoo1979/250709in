import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { formatDxfDate } from './dxfKoreanText';
import { generateDxfFromData, downloadDxf, type ViewDirection, type SideViewFilter } from './dxfDataRenderer';

// 도면 타입 정의 - 좌측뷰/우측뷰 분리
export type DrawingType = 'front' | 'plan' | 'side' | 'sideLeft' | 'sideRight';

/**
 * 도면 타입을 뷰 방향으로 변환
 * @param drawingType 도면 타입
 */
const drawingTypeToViewDirection = (drawingType: DrawingType): ViewDirection => {
  switch (drawingType) {
    case 'front':
      return 'front';
    case 'plan':
      return 'top';
    case 'side':
    case 'sideLeft':
      return 'left';
    case 'sideRight':
      return 'right';
    default:
      return 'front';
  }
};

/**
 * 도면 타입을 측면뷰 필터로 변환
 * @param drawingType 도면 타입
 */
const drawingTypeToSideViewFilter = (drawingType: DrawingType): SideViewFilter => {
  switch (drawingType) {
    case 'sideLeft':
      return 'leftmost';  // 좌측면도: leftmost X 위치 가구만
    case 'sideRight':
      return 'rightmost'; // 우측면도: rightmost X 위치 가구만
    default:
      return 'all';       // 기타: 모든 가구
  }
};

/**
 * 데이터 기반 DXF 생성
 *
 * 중요: 3D 메쉬에서 추출하는 방식이 아닌,
 * spaceInfo와 placedModules 데이터에서 직접 좌표를 계산합니다.
 * CleanCAD2D, CADDimensions2D와 완전히 동일한 로직을 사용합니다.
 *
 * 측면뷰 필터링:
 * - sideLeft: leftmost X 위치의 가구만 포함
 * - sideRight: rightmost X 위치의 가구만 포함
 */
export const generateDXFFromScene = (
  spaceInfo: SpaceInfo,
  drawingType: DrawingType,
  placedModules?: PlacedModule[]
): string | null => {
  console.log(`📐 데이터 기반 DXF 생성 시작 (${drawingType})...`);

  // 뷰 방향 결정
  const viewDirection = drawingTypeToViewDirection(drawingType);

  // 측면뷰 필터 결정 (sideLeft: leftmost만, sideRight: rightmost만)
  const sideViewFilter = drawingTypeToSideViewFilter(drawingType);

  // placedModules가 없으면 빈 배열 사용
  const modules = placedModules || [];

  try {
    // 데이터 기반 DXF 생성 (측면뷰 필터 전달)
    const dxfString = generateDxfFromData(spaceInfo, modules, viewDirection, sideViewFilter);

    console.log(`✅ DXF 생성 완료 (${drawingType}, 필터: ${sideViewFilter})`);

    return dxfString;
  } catch (error) {
    console.error('❌ DXF 생성 실패:', error);
    return null;
  }
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
    side: 'side-left', // 기존 side는 좌측으로 취급
    sideLeft: 'side-left',
    sideRight: 'side-right'
  };

  return `furniture-${typeNames[drawingType]}-${dimensions}-${timestamp}.dxf`;
};
