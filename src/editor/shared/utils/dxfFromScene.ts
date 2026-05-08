import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { formatDxfDate } from './dxfKoreanText';
import {
  generateDxfFromData,
  generateCombinedDxfFromData,
  downloadDxf,
  type ViewDirection,
  type SideViewFilter,
  type CombinedDxfDrawingInput
} from './dxfDataRenderer';

// 도면 타입 정의
export type DrawingType = 'front' | 'plan' | 'side' | 'sideLeft' | 'door';

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
      // 측면도 내보내기는 항상 좌측뷰만 사용
      return 'left';
    case 'door':
      // 도어도면: 정면에서 도어/서랍만 표시
      return 'front';
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
    case 'side':
    case 'sideLeft':
      // 측면도: 가장 왼쪽에 있는 가구의 측면을 봄
      return 'leftmost';
    case 'door':
      // 도어도면: 모든 가구의 도어/서랍 표시
      return 'all';
    default:
      return 'all';
  }
};

const drawingTypeToTitle = (drawingType: DrawingType): string => {
  switch (drawingType) {
    case 'front':
      return '입면도';
    case 'plan':
      return '평면도';
    case 'side':
    case 'sideLeft':
      return '측면도';
    case 'door':
      return '도어도면';
    default:
      return '도면';
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
 */
export const generateDXFFromScene = (
  spaceInfo: SpaceInfo,
  drawingType: DrawingType,
  placedModules?: PlacedModule[]
): string | null => {
  console.log(`📐 데이터 기반 DXF 생성 시작 (${drawingType})...`);

  // 뷰 방향 결정
  const viewDirection = drawingTypeToViewDirection(drawingType);

  // 측면뷰 필터 결정 (sideLeft: leftmost만)
  const sideViewFilter = drawingTypeToSideViewFilter(drawingType);

  // placedModules가 없으면 빈 배열 사용
  const modules = placedModules || [];

  try {
    // 데이터 기반 DXF 생성 (측면뷰 필터 전달)
    const dxfString = generateDxfFromData(
      spaceInfo,
      modules,
      viewDirection,
      sideViewFilter,
      false,
      drawingType === 'door' ? ['DOOR', 'DOOR_DIMENSIONS'] : undefined
    );

    console.log(`✅ DXF 생성 완료 (${drawingType}, 필터: ${sideViewFilter})`);

    return dxfString;
  } catch (error) {
    console.error('❌ DXF 생성 실패:', error);
    return null;
  }
};

export const generateCombinedDXFFromScene = (
  spaceInfo: SpaceInfo,
  drawingTypes: DrawingType[],
  placedModules?: PlacedModule[]
): string | null => {
  console.log(`📐 통합 DXF 생성 시작 (${drawingTypes.join(', ')})...`);

  const modules = placedModules || [];
  const drawings = drawingTypes.flatMap<CombinedDxfDrawingInput>(drawingType => {
    if (drawingType === 'side' || drawingType === 'sideLeft') {
      return modules.map((module, index) => ({
        title: `측면도 ${index + 1}`,
        viewDirection: drawingTypeToViewDirection(drawingType),
        sideViewFilter: 'leftmost' as const,
        targetModuleId: module.id
      }));
    }

    return [{
      title: drawingTypeToTitle(drawingType),
      viewDirection: drawingTypeToViewDirection(drawingType),
      sideViewFilter: drawingTypeToSideViewFilter(drawingType),
      includeLayers: drawingType === 'door' ? ['DOOR', 'DOOR_DIMENSIONS'] : undefined
    }];
  });

  try {
    const dxfString = generateCombinedDxfFromData(spaceInfo, modules, drawings);
    console.log(`✅ 통합 DXF 생성 완료 (${drawingTypes.length}개 도면)`);
    return dxfString;
  } catch (error) {
    console.error('❌ 통합 DXF 생성 실패:', error);
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
    side: 'side',
    sideLeft: 'side',
    door: 'door'
  };

  return `furniture-${typeNames[drawingType]}-${dimensions}-${timestamp}.dxf`;
};

export const generateCombinedDXFFilenameFromScene = (
  spaceInfo: SpaceInfo
): string => {
  const timestamp = formatDxfDate();
  const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;

  return `furniture-all-in-one-${dimensions}-${timestamp}.dxf`;
};
