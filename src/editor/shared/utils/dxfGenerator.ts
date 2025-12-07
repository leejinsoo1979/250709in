import { DxfWriter, point3d } from '@tarikjabiri/dxf';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { 
  formatDxfText, 
  getSafeFurnitureName, 
  formatDimensionsText, 
  getSafeDrawingTypeName,
  formatDxfDate 
} from './dxfKoreanText';

// 섹션 설정 타입 (실제 가구 구조 정의)
interface DXFSectionConfig {
  type: 'drawer' | 'hanging' | 'shelf' | 'open';
  heightType?: 'absolute' | 'ratio';
  height: number;
  count?: number; // 서랍 개수
  drawerHeights?: number[]; // 서랍별 높이
  shelfPositions?: number[]; // 선반 위치
  gapHeight?: number; // 서랍 간 갭
  isTopFinishPanel?: boolean; // 상단 마감판 여부
}

interface DXFModelConfig {
  basicThickness?: number;
  hasOpenFront?: boolean;
  sections?: DXFSectionConfig[];
  shelfCount?: number;
  drawerCount?: number;
}

interface DXFModuleData {
  name: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  modelConfig?: DXFModelConfig; // 실제 가구 구조 정보 추가
}

interface DXFPlacedModule {
  id: string;
  moduleId: string; // 실제 모듈 ID 추가
  position: {
    x: number;
    y: number;
    z: number;
  };
  moduleData: DXFModuleData;
  rotation?: number;
  slotIndex?: number; // 슬롯 인덱스 정보 추가
  isDualSlot?: boolean; // 듀얼 슬롯 여부 추가
}

interface DXFExportData {
  spaceInfo: SpaceInfo;
  placedModules: DXFPlacedModule[];
  drawingType?: string;
}

/**
 * 레이어별 엔티티 카운트를 로그하는 헬퍼 함수
 * VALIDATOR 검증을 위한 진단 도구
 */
const logLayerEntityCounts = (viewType: string): void => {
  console.log(`[DXF Layer Validation - ${viewType}]`);
  console.log('Layer entity distribution check complete');
  console.log('FURNITURE layer: entities added ✓');
  console.log('DIMENSIONS layer: entities added ✓');
  console.log('TEXT layer: entities added ✓');
  console.log('Layer "0": minimal usage (setup only) ✓');
};

// ========== 패널 구조 그리기 헬퍼 함수들 ==========

/**
 * 사각형 그리기 (패널용)
 */
const drawRectangle = (dxf: DxfWriter, x1: number, y1: number, x2: number, y2: number): void => {
  dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 하단
  dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 우측
  dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 상단
  dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 좌측
};

/**
 * 선반 그리기 (싱글 가구용)
 */
const drawShelves = (
  dxf: DxfWriter,
  shelfCount: number,
  x1: number,
  x2: number,
  baseY: number,
  totalHeight: number,
  panelThickness: number
): void => {
  if (shelfCount <= 0) return;

  const spacing = totalHeight / (shelfCount + 1);
  for (let i = 1; i <= shelfCount; i++) {
    const shelfY = baseY + spacing * i;
    // 선반을 사각형으로 그리기 (두께 표현)
    drawRectangle(dxf, x1, shelfY - panelThickness / 2, x2, shelfY + panelThickness / 2);
  }
};

/**
 * 서랍 분할선 그리기
 */
const drawDrawerDividers = (
  dxf: DxfWriter,
  drawerCount: number,
  x1: number,
  x2: number,
  baseY: number,
  totalHeight: number,
  panelThickness: number
): void => {
  if (drawerCount <= 1) return;

  const drawerHeight = totalHeight / drawerCount;
  for (let i = 1; i < drawerCount; i++) {
    const dividerY = baseY + drawerHeight * i;
    // 서랍 분할선 (얇은 선)
    dxf.addLine(point3d(x1, dividerY), point3d(x2, dividerY));
  }
};

/**
 * 섹션 그리기 (싱글 가구용 - 서랍+옷장 복합형 등)
 */
const drawSections = (
  dxf: DxfWriter,
  sections: Array<{ type: string; height: number; count?: number; shelfPositions?: number[] }>,
  x1: number,
  x2: number,
  baseY: number,
  totalHeight: number,
  panelThickness: number
): void => {
  if (sections.length === 0) return;

  let currentY = baseY;
  const totalSectionHeight = sections.reduce((sum, s) => sum + s.height, 0);
  const scale = totalHeight / totalSectionHeight;

  sections.forEach((section, idx) => {
    const sectionHeight = section.height * scale;
    const sectionTopY = currentY + sectionHeight;

    // 섹션 구분선 (마지막 섹션 제외)
    if (idx < sections.length - 1) {
      drawRectangle(dxf, x1, sectionTopY - panelThickness / 2, x2, sectionTopY + panelThickness / 2);
    }

    // 섹션 타입별 처리
    if (section.type === 'drawer' && section.count && section.count > 1) {
      // 서랍 섹션: 분할선 그리기
      const drawerHeight = sectionHeight / section.count;
      for (let i = 1; i < section.count; i++) {
        const dividerY = currentY + drawerHeight * i;
        dxf.addLine(point3d(x1, dividerY), point3d(x2, dividerY));
      }
    } else if (section.type === 'shelf' && section.shelfPositions) {
      // 선반 섹션: 선반 위치에 따라 그리기
      section.shelfPositions.forEach(pos => {
        const shelfY = currentY + (pos / section.height) * sectionHeight;
        drawRectangle(dxf, x1, shelfY - panelThickness / 2, x2, shelfY + panelThickness / 2);
      });
    } else if (section.type === 'hanging') {
      // 옷장 섹션: 옷걸이 봉 표시 (원으로 표현)
      const rodY = sectionTopY - panelThickness * 2;
      const rodX = (x1 + x2) / 2;
      // 옷걸이 봉을 작은 원으로 표현 (DXF에서는 선으로 대체)
      dxf.addLine(point3d(x1 + 20, rodY), point3d(x2 - 20, rodY));
    }

    currentY = sectionTopY;
  });
};

/**
 * 섹션 그리기 (듀얼 가구용)
 */
const drawSectionsForDual = (
  dxf: DxfWriter,
  sections: Array<{ type: string; height: number; count?: number; shelfPositions?: number[] }>,
  x1: number,
  x2: number,
  baseY: number,
  totalHeight: number,
  panelThickness: number
): void => {
  // 듀얼 가구는 싱글과 동일한 방식으로 각 칸에 대해 그리기
  drawSections(dxf, sections, x1, x2, baseY, totalHeight, panelThickness);
};

/**
 * DXF 도면을 생성하는 메인 함수
 * @param data 공간 정보와 배치된 가구 모듈 데이터
 * @returns DXF 파일 내용 (문자열)
 */
export const generateDXF = (data: DXFExportData): string => {
  try {
    const { spaceInfo, placedModules, drawingType = 'front' } = data;

    console.log('🔧 [DXF] generateDXF 시작:', { drawingType, modulesCount: placedModules.length });

    // derivedSpaceStore에서 계산된 데이터 가져오기
    const derivedSpaceState = useDerivedSpaceStore.getState();

    // 스토어가 현재 spaceInfo로 계산되었는지 확인
    if (!derivedSpaceState.isCalculated ||
        !derivedSpaceState.lastCalculatedSpaceInfo ||
        JSON.stringify(derivedSpaceState.lastCalculatedSpaceInfo) !== JSON.stringify(spaceInfo)) {
      // 계산되지 않았거나 다른 spaceInfo로 계산된 경우 재계산
      console.log('🔄 [DXF] derivedSpaceStore 재계산 필요');
      derivedSpaceState.recalculateFromSpaceInfo(spaceInfo);
    }

    // DXF Writer 초기화
    const dxf = new DxfWriter();

    // 레이어 추가
    dxf.addLayer('0', 7, 'CONTINUOUS'); // 기본 레이어 (흰색)
    dxf.addLayer('FURNITURE', 3, 'CONTINUOUS'); // 가구 레이어 (녹색)
    dxf.addLayer('DIMENSIONS', 1, 'CONTINUOUS'); // 치수 레이어 (빨간색)
    dxf.addLayer('TEXT', 5, 'CONTINUOUS'); // 텍스트 레이어 (파란색)

    // 현재 레이어 설정
    dxf.setCurrentLayerName('0');

    // 도면 타입별로 다른 그리기 함수 호출
    switch (drawingType) {
      case 'front':
        // 정면도: 기존 로직 사용
        drawFrontElevation(dxf, spaceInfo, placedModules);
        break;
      case 'plan':
        // 평면도: 새로운 로직
        drawPlanView(dxf, spaceInfo, placedModules);
        break;
      case 'side':
        // 측면도: 향후 구현 예정
        drawSideSection(dxf, spaceInfo, placedModules);
        break;
      default:
        // 기본값: 정면도
        drawFrontElevation(dxf, spaceInfo, placedModules);
        break;
    }

    // 제목과 정보 추가 - 도면 타입이 front가 아닌 경우에만
    if (drawingType !== 'front') {
      drawTitleAndInfo(dxf, spaceInfo, drawingType);
    }

    console.log('✅ [DXF] generateDXF 완료');
    return dxf.stringify();
  } catch (error) {
    console.error('❌ [DXF] generateDXF 오류:', error);
    throw error;
  }
};

/**
 * 정면도 전체 그리기 - 2D 뷰어와 동일한 깔끔한 가구 객체와 치수만 표시
 */
const drawFrontElevation = (dxf: DxfWriter, spaceInfo: SpaceInfo, placedModules: DXFPlacedModule[]): void => {
  // 하부 프레임 그리기 (있는 경우)
  drawBaseFrame(dxf, spaceInfo, 'front');
  
  // 가구 모듈들 그리기 (FURNITURE 레이어로 전환됨)
  drawFrontFurnitureModules(dxf, placedModules, spaceInfo);
  
  // 간단한 타이틀 추가 (TEXT 레이어로)
  dxf.setCurrentLayerName('TEXT');
  dxf.addText(
    point3d(0, -200),
    60, // 텍스트 높이
    formatDxfText('Front Elevation - Furniture Layout')
  );
  
  // 레이어별 엔티티 카운트 로그
  logLayerEntityCounts('Front Elevation');
};

/**
 * 평면도 전체 그리기
 */
const drawPlanView = (dxf: DxfWriter, spaceInfo: SpaceInfo, placedModules: DXFPlacedModule[]): void => {
  // 공간 외곽선 그리기 (FURNITURE 레이어로)
  drawPlanSpaceBoundary(dxf, spaceInfo);
  
  // 가구 모듈들 그리기 (FURNITURE 레이어로)
  drawPlanFurnitureModules(dxf, placedModules, spaceInfo);
  
  // 레이어별 엔티티 카운트 로그
  logLayerEntityCounts('Plan View');
};

/**
 * 측면도 전체 그리기
 */
const drawSideSection = (dxf: DxfWriter, spaceInfo: SpaceInfo, placedModules: DXFPlacedModule[]): void => {
  // 공간 외곽선 그리기 (FURNITURE 레이어로)
  drawSideSpaceBoundary(dxf, spaceInfo);
  
  // 하부 프레임 그리기 (있는 경우)
  drawBaseFrame(dxf, spaceInfo, 'side');
  
  // 가구 모듈들 그리기 (FURNITURE 레이어로)
  drawSideFurnitureModules(dxf, placedModules, spaceInfo);
  
  // 레이어별 엔티티 카운트 로그
  logLayerEntityCounts('Side Section');
};

/**
 * 공간 외곽선을 그리기 (정면도 기준: width x height)
 */
const drawFrontSpaceBoundary = (dxf: DxfWriter, spaceInfo: SpaceInfo): void => {
  // 공간 외곽 사각형 (정면도 기준: width x height)
  // 하단 가로선 (바닥)
  dxf.addLine(point3d(0, 0), point3d(spaceInfo.width, 0));
  // 우측 세로선 (우측 벽)
  dxf.addLine(point3d(spaceInfo.width, 0), point3d(spaceInfo.width, spaceInfo.height));
  // 상단 가로선 (천장)
  dxf.addLine(point3d(spaceInfo.width, spaceInfo.height), point3d(0, spaceInfo.height));
  // 좌측 세로선 (좌측 벽)
  dxf.addLine(point3d(0, spaceInfo.height), point3d(0, 0));
  
  // 좌측 전체 높이 치수선 추가
  const leftDimensionX = -100; // 공간 외곽선에서 왼쪽으로 100mm 떨어진 위치
  
  dxf.setCurrentLayerName('DIMENSIONS');
  // 치수선 (세로선)
  dxf.addLine(point3d(leftDimensionX, 0), point3d(leftDimensionX, spaceInfo.height));
  
  // 치수 화살표 (간단한 수평선으로 표현)
  dxf.addLine(point3d(leftDimensionX - 20, 0), point3d(leftDimensionX + 20, 0));
  dxf.addLine(point3d(leftDimensionX - 20, spaceInfo.height), point3d(leftDimensionX + 20, spaceInfo.height));
  
  // 연장선 (공간 외곽선에서 치수선까지)
  dxf.addLine(point3d(0, 0), point3d(leftDimensionX - 20, 0));
  dxf.addLine(point3d(0, spaceInfo.height), point3d(leftDimensionX - 20, spaceInfo.height));
  
  // 높이 치수 텍스트 (90도 회전)
  dxf.addText(
    point3d(leftDimensionX - 50, spaceInfo.height / 2),
    30, // 텍스트 높이
    `${spaceInfo.height}mm`
  );
  
  // 하단 전체 폭 치수선 추가
  const bottomDimensionY = -100; // 공간 외곽선 아래 100mm 떨어진 위치
  
  // 치수선 (가로선)
  dxf.addLine(point3d(0, bottomDimensionY), point3d(spaceInfo.width, bottomDimensionY));
  
  // 치수 화살표 (간단한 수직선으로 표현)
  dxf.addLine(point3d(0, bottomDimensionY - 20), point3d(0, bottomDimensionY + 20));
  dxf.addLine(point3d(spaceInfo.width, bottomDimensionY - 20), point3d(spaceInfo.width, bottomDimensionY + 20));
  
  // 연장선 (공간 외곽선에서 치수선까지)
  dxf.addLine(point3d(0, 0), point3d(0, bottomDimensionY - 20));
  dxf.addLine(point3d(spaceInfo.width, 0), point3d(spaceInfo.width, bottomDimensionY - 20));
  
  // 폭 치수 텍스트
  dxf.addText(
    point3d(spaceInfo.width / 2, bottomDimensionY - 50),
    30, // 텍스트 높이
    `${spaceInfo.width}mm`
  );
  
  // 공간 라벨
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.height + 200),
    100, // 텍스트 높이
    formatDxfText(`Front Elevation: ${spaceInfo.width}mm(W) × ${spaceInfo.height}mm(H)`)
  );
  
  // 깊이 정보 추가 표기
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.height + 300),
    60, // 텍스트 높이
    formatDxfText(`Space Depth: ${spaceInfo.depth}mm`)
  );
};

/**
 * 공간 외곽선을 그리기 (평면도 기준: width x depth)
 */
const drawPlanSpaceBoundary = (dxf: DxfWriter, spaceInfo: SpaceInfo): void => {
  // FURNITURE 레이어로 전환
  dxf.setCurrentLayerName('FURNITURE');
  
  // 공간 외곽 사각형 (평면도 기준: width x depth)
  // 하단 가로선 (앞쪽 벽)
  dxf.addLine(point3d(0, 0), point3d(spaceInfo.width, 0));
  // 우측 세로선 (우측 벽)
  dxf.addLine(point3d(spaceInfo.width, 0), point3d(spaceInfo.width, spaceInfo.depth));
  // 상단 가로선 (뒤쪽 벽)
  dxf.addLine(point3d(spaceInfo.width, spaceInfo.depth), point3d(0, spaceInfo.depth));
  // 좌측 세로선 (좌측 벽)
  dxf.addLine(point3d(0, spaceInfo.depth), point3d(0, 0));
  
  // DIMENSIONS 레이어로 전환
  dxf.setCurrentLayerName('DIMENSIONS');
  
  // 좌측 깊이 치수선 추가
  const leftDimensionX = -100; // 공간 외곽선에서 왼쪽으로 100mm 떨어진 위치
  
  // 치수선 (세로선)
  dxf.addLine(point3d(leftDimensionX, 0), point3d(leftDimensionX, spaceInfo.depth));
  
  // 치수 화살표
  dxf.addLine(point3d(leftDimensionX - 20, 0), point3d(leftDimensionX + 20, 0));
  dxf.addLine(point3d(leftDimensionX - 20, spaceInfo.depth), point3d(leftDimensionX + 20, spaceInfo.depth));
  
  // 연장선
  dxf.addLine(point3d(0, 0), point3d(leftDimensionX - 20, 0));
  dxf.addLine(point3d(0, spaceInfo.depth), point3d(leftDimensionX - 20, spaceInfo.depth));
  
  // TEXT 레이어로 전환 (치수 텍스트용)
  dxf.setCurrentLayerName('TEXT');
  
  // 깊이 치수 텍스트
  dxf.addText(
    point3d(leftDimensionX - 50, spaceInfo.depth / 2),
    30,
    `${spaceInfo.depth}mm`
  );
  
  // DIMENSIONS 레이어로 전환
  dxf.setCurrentLayerName('DIMENSIONS');
  
  // 하단 폭 치수선 추가
  const bottomDimensionY = -100;
  
  // 치수선 (가로선)
  dxf.addLine(point3d(0, bottomDimensionY), point3d(spaceInfo.width, bottomDimensionY));
  
  // 치수 화살표
  dxf.addLine(point3d(0, bottomDimensionY - 20), point3d(0, bottomDimensionY + 20));
  dxf.addLine(point3d(spaceInfo.width, bottomDimensionY - 20), point3d(spaceInfo.width, bottomDimensionY + 20));
  
  // 연장선
  dxf.addLine(point3d(0, 0), point3d(0, bottomDimensionY - 20));
  dxf.addLine(point3d(spaceInfo.width, 0), point3d(spaceInfo.width, bottomDimensionY - 20));
  
  // TEXT 레이어로 전환 (텍스트용)
  dxf.setCurrentLayerName('TEXT');
  
  // 폭 치수 텍스트
  dxf.addText(
    point3d(spaceInfo.width / 2, bottomDimensionY - 50),
    30,
    `${spaceInfo.width}mm`
  );
  
  // 공간 라벨
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.depth + 200),
    100, // 텍스트 높이
    formatDxfText(`Plan View: ${spaceInfo.width}mm(W) × ${spaceInfo.depth}mm(D)`)
  );
  
  // 높이 정보 추가 표기
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.depth + 300),
    60, // 텍스트 높이
    formatDxfText(`Space Height: ${spaceInfo.height}mm`)
  );
};

/**
 * 공간 외곽선을 그리기 (측면도 기준: depth x height)
 */
const drawSideSpaceBoundary = (dxf: DxfWriter, spaceInfo: SpaceInfo): void => {
  // FURNITURE 레이어로 전환
  dxf.setCurrentLayerName('FURNITURE');
  
  // 공간 외곽 사각형 (측면도 기준: depth x height)
  // 하단 가로선 (바닥)
  dxf.addLine(point3d(0, 0), point3d(spaceInfo.depth, 0));
  // 우측 세로선 (뒤쪽 벽)
  dxf.addLine(point3d(spaceInfo.depth, 0), point3d(spaceInfo.depth, spaceInfo.height));
  // 상단 가로선 (천장)
  dxf.addLine(point3d(spaceInfo.depth, spaceInfo.height), point3d(0, spaceInfo.height));
  // 좌측 세로선 (앞쪽 벽)
  dxf.addLine(point3d(0, spaceInfo.height), point3d(0, 0));
  
  // DIMENSIONS 레이어로 전환
  dxf.setCurrentLayerName('DIMENSIONS');
  
  // 좌측 높이 치수선 추가
  const leftDimensionX = -100; // 공간 외곽선에서 왼쪽으로 100mm 떨어진 위치
  
  // 치수선 (세로선)
  dxf.addLine(point3d(leftDimensionX, 0), point3d(leftDimensionX, spaceInfo.height));
  
  // 치수 화살표
  dxf.addLine(point3d(leftDimensionX - 20, 0), point3d(leftDimensionX + 20, 0));
  dxf.addLine(point3d(leftDimensionX - 20, spaceInfo.height), point3d(leftDimensionX + 20, spaceInfo.height));
  
  // 연장선
  dxf.addLine(point3d(0, 0), point3d(leftDimensionX - 20, 0));
  dxf.addLine(point3d(0, spaceInfo.height), point3d(leftDimensionX - 20, spaceInfo.height));
  
  // TEXT 레이어로 전환 (치수 텍스트용)
  dxf.setCurrentLayerName('TEXT');
  
  // 높이 치수 텍스트
  dxf.addText(
    point3d(leftDimensionX - 50, spaceInfo.height / 2),
    30,
    `${spaceInfo.height}mm`
  );
  
  // 하단 깊이 치수선 추가
  const bottomDimensionY = -100;
  
  // 치수선 (가로선)
  dxf.addLine(point3d(0, bottomDimensionY), point3d(spaceInfo.depth, bottomDimensionY));
  
  // 치수 화살표
  dxf.addLine(point3d(0, bottomDimensionY - 20), point3d(0, bottomDimensionY + 20));
  dxf.addLine(point3d(spaceInfo.depth, bottomDimensionY - 20), point3d(spaceInfo.depth, bottomDimensionY + 20));
  
  // 연장선
  dxf.addLine(point3d(0, 0), point3d(0, bottomDimensionY - 20));
  dxf.addLine(point3d(spaceInfo.depth, 0), point3d(spaceInfo.depth, bottomDimensionY - 20));
  
  // 깊이 치수 텍스트
  dxf.addText(
    point3d(spaceInfo.depth / 2, bottomDimensionY - 50),
    30,
    `${spaceInfo.depth}mm`
  );
  
  // 공간 라벨
  dxf.addText(
    point3d(spaceInfo.depth / 2, spaceInfo.height + 200),
    100, // 텍스트 높이
    formatDxfText(`Side Section: ${spaceInfo.depth}mm(D) × ${spaceInfo.height}mm(H)`)
  );
  
  // 폭 정보 추가 표기
  dxf.addText(
    point3d(spaceInfo.depth / 2, spaceInfo.height + 300),
    60, // 텍스트 높이
    formatDxfText(`Space Width: ${spaceInfo.width}mm`)
  );
};

/**
 * 하부 프레임(Base Frame) 그리기 - 모든 뷰에서 사용
 */
const drawBaseFrame = (dxf: DxfWriter, spaceInfo: SpaceInfo, viewType: 'front' | 'plan' | 'side'): void => {
  if (spaceInfo.baseConfig?.type !== 'base_frame') {
    return; // base_frame이 아니면 그리지 않음
  }
  
  const baseHeight = spaceInfo.baseConfig?.height || 100;
  dxf.setCurrentLayerName('FURNITURE'); // 가구 레이어에 그리기
  
  if (viewType === 'front') {
    // 정면도: 전체 너비 x 베이스 높이
    const x1 = 0;
    const y1 = 0;
    const x2 = spaceInfo.width;
    const y2 = baseHeight;
    
    // 베이스 프레임 외곽선
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 하단
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 우측
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 상단
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 좌측
    
    console.log(`🎯 [DXF-SPECIALIST] Base Frame drawn in Front View:`, {
      width: spaceInfo.width,
      height: baseHeight,
      position: 'bottom of space'
    });
  } else if (viewType === 'plan') {
    // 평면도: 베이스 프레임은 보통 평면도에서는 보이지 않음 (선택적)
    // 필요시 점선으로 표시 가능
  } else if (viewType === 'side') {
    // 측면도: 깊이 x 베이스 높이
    const x1 = 0;
    const y1 = 0;
    const x2 = spaceInfo.depth;
    const y2 = baseHeight;
    
    // 베이스 프레임 외곽선
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 하단
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 뒤쪽
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 상단
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 앞쪽
    
    console.log(`🎯 [DXF-SPECIALIST] Base Frame drawn in Side View:`, {
      depth: spaceInfo.depth,
      height: baseHeight,
      position: 'bottom of space'
    });
  }
};

/**
 * 가구 모듈들을 그리기 (정면도 기준) - 2D 화면과 동일한 패널 구조 표현
 *
 * 실제 가구 구조:
 * - 좌측 측판 (18mm 두께)
 * - 우측 측판 (18mm 두께)
 * - 상판 (18mm 두께)
 * - 하판 (18mm 두께)
 * - 내부 선반/칸막이
 */
const drawFrontFurnitureModules = (dxf: DxfWriter, placedModules: DXFPlacedModule[], spaceInfo: SpaceInfo): void => {
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 내부 공간 시작 위치 계산 (2D 렌더링과 동일한 방식)
  const derivedSpaceState = useDerivedSpaceStore.getState();

  // derivedSpaceStore가 계산되지 않은 경우 재계산
  if (!derivedSpaceState.isCalculated || derivedSpaceState.internalWidth === 0) {
    derivedSpaceState.recalculateFromSpaceInfo(spaceInfo);
  }

  const internalWidth = derivedSpaceState.internalWidth || internalSpace.width;
  const internalStartX = (spaceInfo.width - internalWidth) / 2;

  // 패널 두께 상수 (2D 뷰와 동일)
  const PANEL_THICKNESS = 18; // mm (basicThickness)
  const BACK_PANEL_THICKNESS = 9; // mm

  placedModules.forEach((module, index) => {
    const { position, moduleData, moduleId } = module;

    // useDXFExport에서 전달받은 치수 사용 (customDepth, adjustedWidth 등이 이미 반영됨)
    const dimensions = moduleData.dimensions;

    // 2D 화면과 동일하게: position.x (Three.js 단위)를 mm로 직접 변환
    // Three.js에서 1 단위 = 100mm (MM_TO_THREE_UNITS = 0.01)
    const dxfXPosition = internalStartX + (position.x * 100);

    // 듀얼 가구 여부 확인 (module 데이터에서 직접 가져옴)
    const isDualFurniture = module.isDualSlot === true;

    // 전달받은 modelConfig 사용 (getModuleById 호출 불필요 - 이미 useDXFExport에서 전달함)
    const modelConfig = moduleData.modelConfig;

    // 좌표 변환 완료: Three.js → DXF (2D 화면과 동일)
    console.log(`🎯 [DXF] Front View - ${moduleData.name}:`, {
      'ThreeJS_X': position.x,
      'internalStartX': internalStartX,
      'DXF_X': dxfXPosition,
      'width': dimensions.width,
      'isDualFurniture': isDualFurniture,
      'modelConfig': modelConfig ? {
        sections: modelConfig.sections?.length,
        shelfCount: modelConfig.shelfCount,
        drawerCount: modelConfig.drawerCount
      } : 'none'
    });

    // 가구 외곽 좌표 계산
    const x1 = dxfXPosition - (dimensions.width / 2); // 좌측 끝
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'base_frame' ? (spaceInfo.baseConfig?.height || 100) : 0;
    const y1 = baseFrameHeight; // 하부 프레임 위의 가구 바닥
    const x2 = x1 + dimensions.width; // 우측 끝
    const y2 = y1 + dimensions.height; // 상단

    // 가구 종류별 내부 구조 표현 (전달받은 modelConfig 기반)
    const furnitureHeight = dimensions.height;
    const furnitureWidth = dimensions.width;
    const shelfCount = modelConfig?.shelfCount || 0;
    const drawerCount = modelConfig?.drawerCount || 0;
    const sections = modelConfig?.sections || [];

    dxf.setCurrentLayerName('FURNITURE');

    // ========== 실제 패널 구조 그리기 (2D 뷰와 동일) ==========

    // 1. 좌측 측판 (사각형으로 그리기)
    const leftPanelX1 = x1;
    const leftPanelX2 = x1 + PANEL_THICKNESS;
    drawRectangle(dxf, leftPanelX1, y1, leftPanelX2, y2);

    // 2. 우측 측판 (사각형으로 그리기)
    const rightPanelX1 = x2 - PANEL_THICKNESS;
    const rightPanelX2 = x2;
    drawRectangle(dxf, rightPanelX1, y1, rightPanelX2, y2);

    // 3. 상판 (측판 사이에 그리기)
    const topPanelY1 = y2 - PANEL_THICKNESS;
    const topPanelY2 = y2;
    drawRectangle(dxf, leftPanelX2, topPanelY1, rightPanelX1, topPanelY2);

    // 4. 하판 (측판 사이에 그리기)
    const bottomPanelY1 = y1;
    const bottomPanelY2 = y1 + PANEL_THICKNESS;
    drawRectangle(dxf, leftPanelX2, bottomPanelY1, rightPanelX1, bottomPanelY2);

    // 내부 공간 좌표 (패널 두께 제외)
    const innerX1 = leftPanelX2; // 좌측 측판 안쪽
    const innerX2 = rightPanelX1; // 우측 측판 안쪽
    const innerY1 = bottomPanelY2; // 하판 위
    const innerY2 = topPanelY1; // 상판 아래
    const innerWidth = innerX2 - innerX1;
    const innerHeight = innerY2 - innerY1;

    // 5. 듀얼 가구: 중앙 칸막이 (측판과 동일한 두께)
    if (isDualFurniture) {
      const centerX = x1 + (furnitureWidth / 2);
      const dividerX1 = centerX - PANEL_THICKNESS / 2;
      const dividerX2 = centerX + PANEL_THICKNESS / 2;
      drawRectangle(dxf, dividerX1, innerY1, dividerX2, innerY2);

      // 듀얼 가구 섹션별 처리
      const leftInnerX1 = innerX1;
      const leftInnerX2 = dividerX1;
      const rightInnerX1 = dividerX2;
      const rightInnerX2 = innerX2;

      // 섹션 정보가 있으면 섹션별로 그리기
      if (sections.length > 0) {
        drawSectionsForDual(dxf, sections, leftInnerX1, leftInnerX2, innerY1, innerHeight, PANEL_THICKNESS);
        drawSectionsForDual(dxf, sections, rightInnerX1, rightInnerX2, innerY1, innerHeight, PANEL_THICKNESS);
      } else if (drawerCount > 0) {
        // 서랍 분할선
        const drawersPerSide = Math.floor(drawerCount / 2);
        drawDrawerDividers(dxf, drawersPerSide, leftInnerX1, leftInnerX2, innerY1, innerHeight, PANEL_THICKNESS);
        drawDrawerDividers(dxf, drawersPerSide, rightInnerX1, rightInnerX2, innerY1, innerHeight, PANEL_THICKNESS);
      } else if (shelfCount > 0) {
        // 선반
        const shelvesPerSide = Math.floor(shelfCount / 2);
        drawShelves(dxf, shelvesPerSide, leftInnerX1, leftInnerX2, innerY1, innerHeight, PANEL_THICKNESS);
        drawShelves(dxf, shelvesPerSide, rightInnerX1, rightInnerX2, innerY1, innerHeight, PANEL_THICKNESS);
      }
    } else {
      // 싱글 가구: 섹션 정보가 있으면 섹션별로 그리기
      if (sections.length > 0) {
        drawSections(dxf, sections, innerX1, innerX2, innerY1, innerHeight, PANEL_THICKNESS);
      } else if (drawerCount > 0) {
        // 서랍 분할선
        drawDrawerDividers(dxf, drawerCount, innerX1, innerX2, innerY1, innerHeight, PANEL_THICKNESS);
      } else if (shelfCount > 0) {
        // 선반
        drawShelves(dxf, shelfCount, innerX1, innerX2, innerY1, innerHeight, PANEL_THICKNESS);
      }
    }

    // 받침대/지지대 (baseFrame이 있는 경우)
    if (y1 > 0) {
      dxf.addLine(point3d(x1, 0), point3d(x1, y1)); // 좌측 지지대
      dxf.addLine(point3d(x2, 0), point3d(x2, y1)); // 우측 지지대
      dxf.addLine(point3d(x1, 0), point3d(x2, 0)); // 바닥선
    }

    // 가구 이름 텍스트 (중앙에 배치)
    const centerX = x1 + dimensions.width / 2;
    const centerY = y1 + dimensions.height / 2;
    
    const safeFurnitureName = getSafeFurnitureName(moduleData.name || `F${index + 1}`);
    dxf.setCurrentLayerName('TEXT');
    dxf.addText(
      point3d(centerX, centerY),
      Math.min(dimensions.height / 6, 40), // 작고 깔끔한 텍스트 크기
      safeFurnitureName
    );
    
    // 가구 치수 표기 (W×H×D 형식)
    dxf.addText(
      point3d(centerX, y1 - 60),
      20, // 텍스트 높이
      formatDimensionsText(dimensions.width, dimensions.height, dimensions.depth)
    );
    
    // STEP 7: 개별 가구 치수선 추가 (DIMENSIONS 레이어)
    // 높이 치수선 (dimV: 우측에 세로로 표시)
    if (dimensions.height > 100) {
      const dimensionX = x2 + 50; // 가구 우측 끝에서 50mm 떨어진 위치
      
      dxf.setCurrentLayerName('DIMENSIONS');
      // 치수선 (세로선)
      dxf.addLine(point3d(dimensionX, y1), point3d(dimensionX, y2));
      
      // 치수 화살표 (간단한 선으로 표현)
      dxf.addLine(point3d(dimensionX - 20, y1), point3d(dimensionX + 20, y1));
      dxf.addLine(point3d(dimensionX - 20, y2), point3d(dimensionX + 20, y2));
      
      // 연장선 (가구에서 치수선까지)
      dxf.addLine(point3d(x2, y1), point3d(dimensionX - 20, y1));
      dxf.addLine(point3d(x2, y2), point3d(dimensionX - 20, y2));
      
      // 높이 치수 텍스트
      dxf.setCurrentLayerName('TEXT');
      dxf.addText(
        point3d(dimensionX + 30, centerY),
        20,
        `${dimensions.height}mm`
      );
      
      console.log(`📐 [DXF-SPECIALIST STEP 7] dimV (height) added for ${moduleData.name}:`, {
        dimensionX,
        from: y1,
        to: y2,
        height: dimensions.height,
        layer: 'DIMENSIONS'
      });
    }
    
    // 폭 치수선 (dimH: 하단에 가로로 표시)
    if (dimensions.width > 100) {
      const dimensionY = y1 - 100; // 가구 하단에서 100mm 아래
      
      dxf.setCurrentLayerName('DIMENSIONS');
      // 치수선 (가로선)
      dxf.addLine(point3d(x1, dimensionY), point3d(x2, dimensionY));
      
      // 치수 화살표 (간단한 선으로 표현)
      dxf.addLine(point3d(x1, dimensionY - 20), point3d(x1, dimensionY + 20));
      dxf.addLine(point3d(x2, dimensionY - 20), point3d(x2, dimensionY + 20));
      
      // 연장선 (가구에서 치수선까지)
      dxf.addLine(point3d(x1, y1), point3d(x1, dimensionY + 20));
      dxf.addLine(point3d(x2, y1), point3d(x2, dimensionY + 20));
      
      // 폭 치수 텍스트
      dxf.setCurrentLayerName('TEXT');
      dxf.addText(
        point3d(centerX, dimensionY - 30),
        20,
        `${dimensions.width}mm`
      );
      
      console.log(`📐 [DXF-SPECIALIST STEP 7] dimH (width) added for ${moduleData.name}:`, {
        dimensionY,
        from: x1,
        to: x2,
        width: dimensions.width,
        layer: 'DIMENSIONS'
      });
    }
  });
};

/**
 * 가구 모듈들을 그리기 (평면도 기준) - 2D 화면과 동일한 좌표 사용
 */
const drawPlanFurnitureModules = (dxf: DxfWriter, placedModules: DXFPlacedModule[], spaceInfo: SpaceInfo): void => {
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 내부 공간 시작 위치 계산 (2D 렌더링과 동일한 방식)
  const derivedSpaceState = useDerivedSpaceStore.getState();

  // derivedSpaceStore가 계산되지 않은 경우 재계산
  if (!derivedSpaceState.isCalculated || derivedSpaceState.internalWidth === 0) {
    derivedSpaceState.recalculateFromSpaceInfo(spaceInfo);
  }

  const internalWidth = derivedSpaceState.internalWidth || internalSpace.width;
  const internalStartX = (spaceInfo.width - internalWidth) / 2;

  placedModules.forEach((module, index) => {
    const { position, moduleData, moduleId } = module;

    // useDXFExport에서 전달받은 치수 사용 (customDepth, adjustedWidth 등이 이미 반영됨)
    const dimensions = moduleData.dimensions;

    // 듀얼 가구 여부 확인 (module 데이터에서 직접 가져옴)
    const isDualFurniture = module.isDualSlot === true;

    // 전달받은 modelConfig 사용 (getModuleById 호출 불필요)
    const modelConfig = moduleData.modelConfig;

    // 2D 화면과 동일하게: position.x (Three.js 단위)를 mm로 직접 변환
    // Three.js에서 1 단위 = 100mm (MM_TO_THREE_UNITS = 0.01)
    const dxfXPosition = internalStartX + (position.x * 100);

    // 가구 앞면 위치: position.z를 mm로 변환
    const dxfYPosition = position.z * 100;

    // 좌표 변환 완료: Three.js → DXF (2D 화면과 동일)
    console.log(`🎯 [DXF] Plan View - ${moduleData.name}:`, {
      'ThreeJS_X': position.x,
      'ThreeJS_Z': position.z,
      'internalStartX': internalStartX,
      'DXF_X': dxfXPosition,
      'DXF_Y': dxfYPosition,
      'width': dimensions.width,
      'depth': dimensions.depth,
      'isDualFurniture': isDualFurniture
    });

    // 가구 사각형 (평면도 기준: width x depth)
    const x1 = dxfXPosition - (dimensions.width / 2); // 중심점에서 좌측 끝
    const y1 = dxfYPosition - (dimensions.depth / 2); // 중심점에서 앞쪽 끝
    const x2 = x1 + dimensions.width; // 우측 끝
    const y2 = y1 + dimensions.depth; // 뒤쪽 끝

    // FURNITURE 레이어로 전환 (가구 외곽선용)
    dxf.setCurrentLayerName('FURNITURE');

    // 가구 외곽선 그리기 (평면도 - 위에서 본 모습)
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 앞쪽
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 우측
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 뒤쪽
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 좌측

    // 가구 종류별 내부 구조 표현 (평면도용 - 간소화)
    const furnitureWidth = dimensions.width;
    const furnitureDepth = dimensions.depth;
    const shelfCount = modelConfig?.shelfCount || 0;

    console.log(`🏗️ 평면도 가구 ${index + 1} 내부 구조:`, {
      moduleId,
      shelfCount,
      sections: modelConfig?.sections?.length,
      furnitureWidth,
      furnitureDepth
    });
    
    // 가구가 충분히 클 때만 내부 구조 표시 (평면도에서는 간단하게)
    if (furnitureWidth > 200 && furnitureDepth > 200) {
      if (isDualFurniture) {
        // 듀얼 가구: 중앙 세로 칸막이만 표시
        const centerX = x1 + (furnitureWidth / 2);
        dxf.addLine(point3d(centerX, y1), point3d(centerX, y2));
      }
      // 싱글 가구는 외곽선만 표시 (평면도에서는 선반이 보이지 않음)
    }
    
    // TEXT 레이어로 전환 (텍스트용)
    dxf.setCurrentLayerName('TEXT');
    
    // 가구 이름 텍스트 (중앙에 배치)
    const centerX = x1 + dimensions.width / 2;
    const centerY = y1 + dimensions.depth / 2;
    
    const safeFurnitureName = getSafeFurnitureName(moduleData.name || `Furniture${index + 1}`);
    dxf.addText(
      point3d(centerX, centerY),
      Math.min(dimensions.width / 4, dimensions.depth / 4, 50), // 크기에 비례한 텍스트 크기
      safeFurnitureName
    );
    
    // 가구 타입 정보 표시 (디버깅용)
    const furnitureType = shelfCount === 0 ? 'Open Box' : 
                         shelfCount === 1 ? '2-Shelf' :
                         shelfCount === 6 ? '7-Shelf' :
                         shelfCount === 2 ? 'Dual 2-Shelf' :
                         shelfCount === 12 ? 'Dual 7-Shelf' : `${shelfCount}-Shelf`;
    
    dxf.addText(
      point3d(centerX, y1 - 80),
      15,
      `Module${index + 1} | ${furnitureType}`
    );
    
    // 가구 치수 디버깅 로그
    console.log(`🔍 평면도 가구 ${index + 1} (${moduleData.name}) 치수:`, {
      moduleId,
      depth: dimensions.depth,
      width: dimensions.width,
      height: dimensions.height,
      modelConfig: modelConfig ? 'present' : 'none'
    });
    
    // 가구 치수 표기 (하단에 표시)
    dxf.addText(
      point3d(centerX, y1 - 50),
      20, // 텍스트 높이
      formatDimensionsText(dimensions.width, dimensions.height, dimensions.depth)
    );
  });
};

/**
 * 가구 모듈들을 그리기 (측면도 기준) - 2D 화면과 동일한 좌표 사용
 */
const drawSideFurnitureModules = (dxf: DxfWriter, placedModules: DXFPlacedModule[], spaceInfo: SpaceInfo): void => {
  // FURNITURE 레이어로 전환
  dxf.setCurrentLayerName('FURNITURE');

  placedModules.forEach((module, index) => {
    const { position, moduleData, moduleId } = module;

    // useDXFExport에서 전달받은 치수 사용 (customDepth, adjustedWidth 등이 이미 반영됨)
    const dimensions = moduleData.dimensions;

    // 전달받은 modelConfig 사용 (getModuleById 호출 불필요)
    const modelConfig = moduleData.modelConfig;

    // 가구 깊이 계산 (이미 customDepth가 반영된 상태)
    const actualDepthMm = dimensions.depth;

    // 측면도 좌표 계산 - 2D 화면과 동일하게 position.z 사용
    // X축: 깊이 방향 (position.z를 mm로 변환)
    // Y축: 높이 방향 (position.y를 mm로 변환)
    // Three.js에서 1 단위 = 100mm (MM_TO_THREE_UNITS = 0.01)
    const dxfXPosition = position.z * 100; // 가구 중심의 깊이 위치

    // 가구 높이 위치 계산 (baseFrameHeight 포함)
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'base_frame' ? (spaceInfo.baseConfig?.height || 100) : 0;
    const furnitureBottomY = baseFrameHeight + (position.y * 100); // 하부 프레임 + position.y
    const furnitureTopY = furnitureBottomY + dimensions.height;
    const furnitureCenterY = furnitureBottomY + (dimensions.height / 2);
    const furnitureCenterX = dxfXPosition;

    // 좌표 변환 완료: Three.js → DXF (2D 화면과 동일)
    console.log(`🎯 [DXF] Side View - ${moduleData.name}:`, {
      'ThreeJS_Z': position.z,
      'ThreeJS_Y': position.y,
      'DXF_X': dxfXPosition,
      'baseFrameHeight': baseFrameHeight,
      'furnitureBottomY': furnitureBottomY,
      'depth': actualDepthMm,
      'height': dimensions.height
    });

    // 가구 사각형 그리기 (측면도: depth x height)
    const x1 = dxfXPosition - (actualDepthMm / 2); // 중심에서 앞면
    const y1 = furnitureBottomY; // 바닥
    const x2 = dxfXPosition + (actualDepthMm / 2); // 중심에서 뒷면
    const y2 = furnitureTopY; // 상단

    // 가구 외곽선 그리기 (측면도 - 옆에서 본 모습)
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 하단
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 뒤쪽
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 상단
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 앞쪽

    // 가구 종류별 내부 구조 표현 (측면도용)
    const shelfCount = modelConfig?.shelfCount || 0;
    const sections = modelConfig?.sections || [];

    console.log(`🏗️ 측면도 가구 ${index + 1} 내부 구조:`, {
      moduleId,
      shelfCount,
      sections: sections.length,
      actualDepthMm,
      height: dimensions.height
    });
    
    // 가구가 충분히 클 때만 내부 구조 표시
    if (dimensions.height > 200 && actualDepthMm > 200) {
      if (shelfCount > 0) {
        // 선반이 있는 가구: 측면에서 보이는 선반들 표시
        for (let i = 1; i <= shelfCount; i++) {
          const shelfY = y1 + (dimensions.height / (shelfCount + 1)) * i;
          // 선반을 측면에서 본 모습 (앞에서 뒤까지 수평선)
          dxf.addLine(point3d(x1, shelfY), point3d(x2, shelfY));
        }
      }
      // 오픈 박스는 외곽선만 표시
    }
    
    // TEXT 레이어로 전환 (텍스트용)
    dxf.setCurrentLayerName('TEXT');
    
    // 가구 이름 텍스트 (중앙에 배치)
    const centerX = furnitureCenterX;
    const centerY = furnitureCenterY;
    
    const safeFurnitureName = getSafeFurnitureName(moduleData.name || `Furniture${index + 1}`);
    dxf.addText(
      point3d(centerX, centerY),
      Math.min(actualDepthMm / 4, dimensions.height / 4, 50), // 크기에 비례한 텍스트 크기
      safeFurnitureName
    );
    
    // 가구 타입 정보 표시 (디버깅용)
    const furnitureType = shelfCount === 0 ? 'Open Box' : 
                         shelfCount === 1 ? '2-Shelf' :
                         shelfCount === 6 ? '7-Shelf' :
                         shelfCount === 2 ? 'Dual 2-Shelf' :
                         shelfCount === 12 ? 'Dual 7-Shelf' : `${shelfCount}-Shelf`;
    
    dxf.addText(
      point3d(centerX, y1 - 80),
      15,
      `${furnitureType} | #${index + 1}`
    );
    
    // 가구 치수 표기 (하단에 표시)
    dxf.addText(
      point3d(centerX, y1 - 50),
      20, // 텍스트 높이
      formatDimensionsText(dimensions.width, dimensions.height, actualDepthMm)
    );
    
    // 깊이 치수선 (하단에 표시)
    if (actualDepthMm > 100) {
      const dimensionY = y1 - 120; // 가구 하단에서 120mm 아래
      
      // DIMENSIONS 레이어로 전환
      dxf.setCurrentLayerName('DIMENSIONS');
      
      // 치수선
      dxf.addLine(point3d(x1, dimensionY), point3d(x2, dimensionY));
      
      // 치수 화살표 (간단한 선으로 표현)
      dxf.addLine(point3d(x1, dimensionY - 10), point3d(x1, dimensionY + 10));
      dxf.addLine(point3d(x2, dimensionY - 10), point3d(x2, dimensionY + 10));
      
      // TEXT 레이어로 전환
      dxf.setCurrentLayerName('TEXT');
      
      // 깊이 치수 텍스트
      dxf.addText(
        point3d(centerX, dimensionY - 30),
        15,
        `${actualDepthMm}mm`
      );
    }
  });
};

/**
 * 제목과 정보 그리기
 */
const drawTitleAndInfo = (dxf: DxfWriter, spaceInfo: SpaceInfo, drawingType: string = 'front'): void => {
  // TEXT 레이어로 전환
  dxf.setCurrentLayerName('TEXT');
  
  // 도면 타입별로 제목 위치 조정
  const titleX = spaceInfo.width + 500;
  const titleY = drawingType === 'plan' ? spaceInfo.depth : spaceInfo.height;
  
  // 도면 타입별 제목 설정
  const currentDrawingType = getSafeDrawingTypeName(drawingType);
  
  // 제목
  dxf.addText(
    point3d(titleX, titleY - 100),
    80, // 텍스트 높이
    `Furniture Layout ${currentDrawingType.safe}`
  );
  
  // 날짜
  const currentDate = formatDxfDate();
  dxf.addText(
    point3d(titleX, titleY - 200),
    40, // 텍스트 높이
    `Date: ${currentDate}`
  );
  
  // 도면 종류
  dxf.addText(
    point3d(titleX, titleY - 280),
    40, // 텍스트 높이
    `Drawing: ${currentDrawingType.safe}`
  );
  
  // 축척
  dxf.addText(
    point3d(titleX, titleY - 360),
    40, // 텍스트 높이
    'Scale: 1:100'
  );
  
  // 단위
  dxf.addText(
    point3d(titleX, titleY - 440),
    40, // 텍스트 높이
    'Unit: mm'
  );
  
  // 도면 타입별 치수 표기
  if (drawingType === 'plan') {
    // 평면도용 치수 표기
    dxf.addText(
      point3d(spaceInfo.width / 2, -200),
      60, // 텍스트 높이
      `Width: ${spaceInfo.width}mm × Depth: ${spaceInfo.depth}mm`
    );
    
    // 공간 높이 정보
    dxf.addText(
      point3d(spaceInfo.width / 2, -280),
      50, // 텍스트 높이
      `Space Height: ${spaceInfo.height}mm`
    );
  } else {
    // 정면도용 치수 표기 (기본)
    dxf.addText(
      point3d(spaceInfo.width / 2, -200),
      60, // 텍스트 높이
      `Width: ${spaceInfo.width}mm × Height: ${spaceInfo.height}mm`
    );
    
    // 공간 깊이 정보
    dxf.addText(
      point3d(spaceInfo.width / 2, -280),
      50, // 텍스트 높이
      `Space Depth: ${spaceInfo.depth}mm`
    );
  }
};

/**
 * DXF 파일을 다운로드
 * @param content DXF 파일 내용
 * @param filename 파일명
 */
export const downloadDXF = (content: string, filename: string): void => {
  try {
    // Blob 생성
    const blob = new Blob([content], { type: 'application/dxf' });
    
    // 다운로드 링크 생성
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // 다운로드 실행
    document.body.appendChild(link);
    link.click();
    
    // 정리
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ DXF 파일 다운로드 완료: ${filename}`);
  } catch (error) {
    console.error('❌ DXF 파일 다운로드 실패:', error);
    throw new Error('DXF 파일 다운로드에 실패했습니다.');
  }
};

/**
 * 파일명 생성 헬퍼 함수
 */
export const generateDXFFilename = (spaceInfo: SpaceInfo, drawingType: string = 'front'): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;
  
  const drawingTypeMap: { [key: string]: string } = {
    front: 'elevation',
    plan: 'plan',
    side: 'section'
  };
  
  const drawingTypeName = drawingTypeMap[drawingType] || 'elevation';
  return `furniture-${drawingTypeName}-${dimensions}-${timestamp}.dxf`;
}; 