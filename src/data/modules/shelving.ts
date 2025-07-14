import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';

// ============================================================================
// 타입 정의 (기존과 동일)
// ============================================================================

// 가구 섹션 설정 인터페이스 (하위 호환성 보장)
export interface SectionConfig {
  type: 'shelf' | 'hanging' | 'drawer' | 'open';
  height: number; // 퍼센트 (0-100) 또는 절대값 (mm)
  heightType?: 'percentage' | 'absolute'; // 높이 계산 방식 (기본값: percentage)
  count?: number; // 선반 개수 또는 서랍 개수
  
  // 서랍 전용 상세 설정 (타입4 가구용)
  drawerHeights?: number[]; // 각 서랍의 개별 높이 (mm) - [176, 176, 255, 255]
  gapHeight?: number; // 서랍 간 공백 높이 (mm) - 24.0
  
  // 선반 전용 상세 설정 (절대 위치 지정용)
  shelfPositions?: number[]; // 각 선반의 Y 위치 (mm, 섹션 하단 기준)
  isTopFinishPanel?: boolean; // 최상단 마감 패널 여부
}

// 타입 가드 함수: Firebase에서 불러온 데이터 검증
export const validateSectionConfig = (section: unknown): section is SectionConfig => {
  if (typeof section !== 'object' || section === null) {
    return false;
  }
  
  const s = section as Record<string, unknown>;
  return (
    typeof s.type === 'string' &&
    ['shelf', 'hanging', 'drawer', 'open'].includes(s.type) &&
    typeof s.height === 'number' &&
    (s.heightType === undefined || 
     (typeof s.heightType === 'string' && ['percentage', 'absolute'].includes(s.heightType))) &&
    (s.count === undefined || typeof s.count === 'number')
  );
};

// ModuleData 인터페이스 정의 (확장됨)
export interface ModuleData {
  id: string;
  name: string;
  category: 'full';
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  color: string;
  description?: string;
  hasDoor?: boolean;
  isDynamic?: boolean;
  widthOptions?: number[];
  type?: 'basic' | 'box' | 'shelf';
  defaultDepth?: number; // 가구 타입별 기본 깊이 (mm)
  modelConfig?: {
    basicThickness?: number;
    hasOpenFront?: boolean;
    hasShelf?: boolean;
    shelfCount?: number;
    // 기본 sections (싱글 가구 + 좌우 동일한 듀얼 가구)
    sections?: SectionConfig[];
    // 듀얼 전용: 좌우 비대칭 구조
    leftSections?: SectionConfig[];
    rightSections?: SectionConfig[];
    // 절대값 기준 폭 분할 (스타일러 등 고정 치수용)
    rightAbsoluteWidth?: number; // 우측 절대폭 (mm)
    // 절대값 기준 깊이 분할 (스타일러 등 고정 치수용)
    rightAbsoluteDepth?: number; // 우측 절대깊이 (mm)
    // 듀얼 가구 중단선반 통합 옵션
    hasSharedMiddlePanel?: boolean; // 좌우 섹션 간 공유 중단선반 여부
    middlePanelHeight?: number; // 중단선반 위치 (바닥에서 mm)
    // 듀얼 가구 안전선반 통합 옵션 (상부 옷장이 동일 용도인 경우)
    hasSharedSafetyShelf?: boolean; // 통합 안전선반 여부
    safetyShelfHeight?: number; // 안전선반 위치 (바닥에서 mm)
  };
}

// ============================================================================
// 가구 스펙 상수 정의
// ============================================================================

const FURNITURE_SPECS = {
  // 기본 치수
  BASIC_THICKNESS: 18,
  DEFAULT_DEPTH: 600,
  
  // 타입별 높이 스펙
  TYPE1_DRAWER_HEIGHT: 600,  // 타입1 서랍장 높이
  TYPE2_BOTTOM_HEIGHT: 1025, // 타입2 하단 옷장 높이
  TYPE4_DRAWER_HEIGHT: 1000, // 타입4 서랍장 높이
  
  // 서랍 상세 스펙
  DRAWER_HEIGHTS_2TIER: [255, 255] as number[], // 2단 서랍 높이
  DRAWER_HEIGHTS_4TIER: [255, 255, 176, 176] as number[], // 4단 서랍 높이
  DRAWER_GAP: 24.0, // 서랍 간 공백
  
  // 특수 가구 스펙
  STYLER_WIDTH: 694,     // 스타일러 내경폭
  PANTSHANGER_WIDTH: 564, // 바지걸이 내경폭
  
  // 안전선반 스펙
  SAFETY_SHELF_POSITION: 2050, // 안전선반 위치
  SAFETY_SHELF_THRESHOLD: 2300, // 안전선반 적용 임계 높이
  
  // 색상 설정
  COLORS: {
    TYPE1: '#8D6E63',  // 갈색 (서랍+옷장)
    TYPE2: '#303F9F',  // 남색 (2단 옷장)
    TYPE4: '#0097A7',  // 청록색 (4단서랍+옷장)
    STYLER: '#4CAF50', // 녹색 (스타일러)
    PANTSHANGER: '#9C27B0' // 보라색 (바지걸이)
  }
};

// ============================================================================
// 헬퍼 함수들
// ============================================================================

/**
 * 안전선반을 섹션에 적용하는 헬퍼 함수
 * 
 * @param sections 기본 섹션 구성
 * @param totalHeight 가구 전체 높이 (mm)
 * @param safetyPosition 안전선반 위치 (가구 바닥패널부터 mm, 기본값: 2050)
 * @param heightThreshold 안전선반 적용 임계 높이 (mm, 기본값: 2300)
 * @returns 안전선반이 적용된 섹션 구성
 */
const applySafetyShelf = (
  sections: SectionConfig[], 
  totalHeight: number, 
  safetyPosition: number = FURNITURE_SPECS.SAFETY_SHELF_POSITION,
  heightThreshold: number = FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD
): SectionConfig[] => {
  // 높이가 임계값 이하면 그대로 반환
  if (totalHeight <= heightThreshold) return sections;
  
  // 각 섹션의 시작 위치 계산하면서 안전선반 적용
  let currentPosition = 0;
  
  return sections.map(section => {
    const sectionStart = currentPosition;
    const sectionEnd = currentPosition + section.height;
    
    // 다음 섹션을 위해 위치 업데이트
    currentPosition += section.height;
    
    // 이 섹션이 hanging 타입이고, 안전선반 위치가 이 섹션 범위 내에 있는지 확인
    if (section.type === 'hanging' && 
        safetyPosition >= sectionStart && 
        safetyPosition < sectionEnd) {
      
      const safetyPosInSection = safetyPosition - sectionStart;
      
      return {
        ...section,
        count: 1, // 안전 선반 1개
        shelfPositions: [safetyPosInSection] // 섹션 내 위치
      };
    }
    
    return section;
  });
};

/**
 * 가구 기본 정보 생성 헬퍼 함수
 */
const createFurnitureBase = (
  id: string,
  name: string,
  width: number,
  height: number,
  depth: number,
  color: string,
  description: string,
  defaultDepth?: number
): Partial<ModuleData> => ({
  id,
  name,
  category: 'full',
  dimensions: { width, height, depth },
  color,
  description,
  isDynamic: true,
  hasDoor: true,
  widthOptions: [width],
  type: 'box',
  defaultDepth: defaultDepth || FURNITURE_SPECS.DEFAULT_DEPTH,
  modelConfig: {
    basicThickness: FURNITURE_SPECS.BASIC_THICKNESS,
    hasOpenFront: true,
  }
});

// ============================================================================
// 싱글 가구 생성 함수들
// ============================================================================

/**
 * 싱글 타입1: 2단 서랍장 + 옷장 생성
 */
const createSingleType1 = (columnWidth: number, maxHeight: number): ModuleData => {
  const drawerHeight = FURNITURE_SPECS.TYPE1_DRAWER_HEIGHT;
  const hangingHeight = maxHeight - drawerHeight;
  
  // 기본 섹션 구성
  const baseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: drawerHeight, 
      count: 2,
      drawerHeights: FURNITURE_SPECS.DRAWER_HEIGHTS_2TIER,
      gapHeight: FURNITURE_SPECS.DRAWER_GAP
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: hangingHeight
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const base = createFurnitureBase(
    `single-2drawer-hanging-${columnWidth}`,
    `2단서랍+옷장 ${columnWidth}mm`,
    columnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE1,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `하단 2단 서랍장 + 상단 옷장 (안전선반 포함) | 폭 ${columnWidth}mm`
      : `하단 2단 서랍장 + 상단 옷장 | 폭 ${columnWidth}mm`,
    FURNITURE_SPECS.DEFAULT_DEPTH // 서랍+옷장 복합형 기본 깊이
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 싱글 타입2: 2단 옷장 생성 (하단 고정 + 상단 가변)
 */
const createSingleType2 = (columnWidth: number, maxHeight: number): ModuleData => {
  const bottomHeight = FURNITURE_SPECS.TYPE2_BOTTOM_HEIGHT;
  const topHeight = maxHeight - bottomHeight;
  
  // 기본 섹션 구성
  const baseSections: SectionConfig[] = [
    { 
      type: 'shelf', 
      heightType: 'absolute', 
      height: bottomHeight,
      count: 1, // 하부 옷걸이 구역 (내부 상단에 마감 패널 1개)
      shelfPositions: [bottomHeight - 18 - 9] // 섹션 최상단에서 27mm 아래
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: topHeight 
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const base = createFurnitureBase(
    `single-2hanging-${columnWidth}`,
    `2단 옷장 ${columnWidth}mm`,
    columnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE2,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `하단 짧은옷장 + 상단 긴옷장 (안전선반 포함) | 폭 ${columnWidth}mm`
      : `하단 짧은옷장 + 상단 긴옷장 | 폭 ${columnWidth}mm`
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 싱글 타입4: 4단서랍+옷장 복합형 생성
 */
const createSingleType4 = (columnWidth: number, maxHeight: number): ModuleData => {
  const drawerHeight = FURNITURE_SPECS.TYPE4_DRAWER_HEIGHT;
  const hangingHeight = maxHeight - drawerHeight;
  
  const baseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: drawerHeight, 
      count: 4,
      drawerHeights: FURNITURE_SPECS.DRAWER_HEIGHTS_4TIER,
      gapHeight: FURNITURE_SPECS.DRAWER_GAP
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: hangingHeight 
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const base = createFurnitureBase(
    `single-4drawer-hanging-${columnWidth}`,
    `4단서랍+옷장 ${columnWidth}mm`,
    columnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE4,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `4단 서랍장 + 옷장 복합형 (안전선반 포함) | 폭 ${columnWidth}mm`
      : `4단 서랍장 + 옷장 복합형 | 폭 ${columnWidth}mm`
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

// ============================================================================
// 듀얼 가구 생성 함수들  
// ============================================================================

/**
 * 듀얼 타입1: 2단 서랍장 + 옷장 생성
 */
const createDualType1 = (dualColumnWidth: number, maxHeight: number): ModuleData => {
  const drawerHeight = FURNITURE_SPECS.TYPE1_DRAWER_HEIGHT;
  const hangingHeight = maxHeight - drawerHeight;
  
  // 기본 섹션 구성
  const baseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: drawerHeight, 
      count: 2,
      drawerHeights: FURNITURE_SPECS.DRAWER_HEIGHTS_2TIER,
      gapHeight: FURNITURE_SPECS.DRAWER_GAP
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: hangingHeight
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const base = createFurnitureBase(
    `dual-2drawer-hanging-${dualColumnWidth}`,
    `듀얼 2단서랍+옷장 ${dualColumnWidth}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE1,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `듀얼 하단 2단 서랍장 + 상단 옷장 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
      : `듀얼 하단 2단 서랍장 + 상단 옷장 | 폭 ${dualColumnWidth}mm`
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입2: 2단 옷장 생성
 */
const createDualType2 = (dualColumnWidth: number, maxHeight: number): ModuleData => {
  const bottomHeight = FURNITURE_SPECS.TYPE2_BOTTOM_HEIGHT;
  const topHeight = maxHeight - bottomHeight;
  
  // 기본 섹션 구성
  const baseSections: SectionConfig[] = [
    { 
      type: 'shelf', 
      heightType: 'absolute', 
      height: bottomHeight,
      count: 1, // 하부 옷걸이 구역 (내부 상단에 마감 패널 1개)
      shelfPositions: [bottomHeight - 18 - 9] // 섹션 최상단에서 27mm 아래
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: topHeight 
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const base = createFurnitureBase(
    `dual-2hanging-${dualColumnWidth}`,
    `듀얼 2단 옷장 ${dualColumnWidth}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE2,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `듀얼 하단 짧은옷장 + 상단 긴옷장 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
      : `듀얼 하단 짧은옷장 + 상단 긴옷장 | 폭 ${dualColumnWidth}mm`
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입4: 4단서랍+옷장 복합형 생성
 */
const createDualType4 = (dualColumnWidth: number, maxHeight: number): ModuleData => {
  const drawerHeight = FURNITURE_SPECS.TYPE4_DRAWER_HEIGHT;
  const hangingHeight = maxHeight - drawerHeight;
  
  const baseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: drawerHeight, 
      count: 4,
      drawerHeights: FURNITURE_SPECS.DRAWER_HEIGHTS_4TIER,
      gapHeight: FURNITURE_SPECS.DRAWER_GAP
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: hangingHeight 
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const base = createFurnitureBase(
    `dual-4drawer-hanging-${dualColumnWidth}`,
    `듀얼 4단서랍+옷장 ${dualColumnWidth}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE4,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `듀얼 4단 서랍장 + 옷장 복합형 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
      : `듀얼 4단 서랍장 + 옷장 복합형 | 폭 ${dualColumnWidth}mm`
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입5: 서랍+옷장 & 스타일러장 복합형 생성 (좌우 비대칭)
 */
const createDualType5 = (dualColumnWidth: number, maxHeight: number): ModuleData => {
  const leftDrawerWithFinishHeight = FURNITURE_SPECS.TYPE1_DRAWER_HEIGHT; // 좌측 서랍장 + 마감 패널
  const leftHangingHeight = maxHeight - leftDrawerWithFinishHeight; // 좌측 옷장 높이
  
  // 좌측 섹션 (서랍+옷장)에 안전선반 적용
  const leftBaseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: leftDrawerWithFinishHeight, 
      count: 2,
      drawerHeights: FURNITURE_SPECS.DRAWER_HEIGHTS_2TIER,
      gapHeight: FURNITURE_SPECS.DRAWER_GAP
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: leftHangingHeight
    }
  ];
  
  // 우측 섹션 (스타일러장)에 안전선반 적용
  const rightBaseSections: SectionConfig[] = [
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: maxHeight // 완전 스타일러장
    }
  ];
  
  // 좌우 각각 안전선반 적용
  const leftSections = applySafetyShelf(leftBaseSections, maxHeight);
  const rightSections = applySafetyShelf(rightBaseSections, maxHeight);
  
  const base = createFurnitureBase(
    `dual-2drawer-styler-${dualColumnWidth}`,
    `듀얼 서랍+스타일러 ${dualColumnWidth}mm`,
    dualColumnWidth,
    maxHeight,
    600, // 좌측 서랍+옷장 기본 깊이 (customDepth로 변경 가능)
    FURNITURE_SPECS.COLORS.STYLER,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `좌측 서랍+옷장 + 우측 스타일러장 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
      : `좌측 서랍+옷장 + 우측 스타일러장 | 폭 ${dualColumnWidth}mm`,
    600
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      rightAbsoluteWidth: FURNITURE_SPECS.STYLER_WIDTH, // 우측 절대폭 지정
      rightAbsoluteDepth: 660, // 우측 스타일러장 고정 깊이 (660mm)
      // 중단 패널 설정: 좌측에만 개별 구분 패널 생성 (우측 스타일러는 중단 패널 없음)
      // 좌측 측판과 중간 측판은 서랍장 높이에서 상/하로 분할됨 (우측 측판은 분할 안됨)
      hasSharedMiddlePanel: false, // 전체 폭 공유 패널 없음, 좌측 섹션에만 개별 구분 패널
      leftSections,
      rightSections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입6: 4단서랍+바지걸이+옷장 복합형 생성 (좌우 비대칭, 통합 선반)
 */
const createDualType6 = (dualColumnWidth: number, maxHeight: number): ModuleData => {
  const bottomSectionHeight = FURNITURE_SPECS.TYPE4_DRAWER_HEIGHT; // 하단부 총 높이
  const topHangingHeight = maxHeight - bottomSectionHeight; // 상단 옷장 높이
  
  const base = createFurnitureBase(
    `dual-4drawer-pantshanger-${dualColumnWidth}`,
    `듀얼 서랍+바지걸이 ${dualColumnWidth}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.PANTSHANGER,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `좌측 4단서랍+옷장 + 우측 바지걸이+옷장 (통합 안전선반) | 폭 ${dualColumnWidth}mm`
      : `좌측 4단서랍+옷장 + 우측 바지걸이+옷장 | 폭 ${dualColumnWidth}mm`
  );
  
  return {
    ...base,
    modelConfig: {
      ...base.modelConfig,
      rightAbsoluteWidth: FURNITURE_SPECS.PANTSHANGER_WIDTH, // 우측 바지걸이 고정폭
      // 통합 중단선반: 좌측 면판과 우측 면판 사이에 끼워지는 1개의 패널
      hasSharedMiddlePanel: true,
      middlePanelHeight: bottomSectionHeight, // 중단 패널 위치
      // 통합 안전선반: 상부 옷장이 좌우 동일 용도이므로 전체 폭 1개 패널
      hasSharedSafetyShelf: maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD,
      safetyShelfHeight: FURNITURE_SPECS.SAFETY_SHELF_POSITION,
      leftSections: [
        { 
          type: 'drawer', 
          heightType: 'absolute', 
          height: bottomSectionHeight, 
          count: 4,
          drawerHeights: FURNITURE_SPECS.DRAWER_HEIGHTS_4TIER,
          gapHeight: FURNITURE_SPECS.DRAWER_GAP
        },
        { 
          type: 'hanging', 
          heightType: 'absolute', 
          height: topHangingHeight
        }
      ],
      rightSections: [
        { 
          type: 'hanging', 
          heightType: 'absolute', 
          height: bottomSectionHeight // 우측 하단 바지걸이
        },
        { 
          type: 'hanging', 
          heightType: 'absolute', 
          height: topHangingHeight // 우측 상단 옷장
        }
      ]
    }
  } as ModuleData;
};

// ============================================================================
// 메인 생성 함수 (기존 인터페이스 유지)
// ============================================================================

/**
 * 박스형 모듈들 생성 (sections 기반 리팩토링)
 * 
 * 각 가구는 여러 섹션으로 구성됩니다:
 * - shelf: 선반 구역 (가로 칸막이 여러 개)
 * - hanging: 옷걸이 구역 (가로 칸막이 없음)
 * - drawer: 서랍 구역 (서랍 패널들)
 * - open: 완전 오픈 구역
 */
export const generateShelvingModules = (
  internalSpace: { width: number; height: number; depth: number }, 
  spaceInfo?: SpaceInfo
): ModuleData[] => {
  let { height: maxHeight } = internalSpace;
  
  // 띄워서 배치인 경우 가용 높이에서 띄움 높이를 차감
  if (spaceInfo?.baseConfig?.type === 'stand' && spaceInfo.baseConfig.placementType === 'float') {
    const floatHeight = spaceInfo.baseConfig.floatHeight || 0;
    maxHeight = maxHeight - floatHeight;
  }
  
  // SpaceInfo가 제공되면 그대로 사용, 아니면 필요한 속성만 갖는 객체 생성
  let indexingSpaceInfo: SpaceInfo;
  
  if (spaceInfo) {
    indexingSpaceInfo = spaceInfo;
  } else {
    indexingSpaceInfo = {
      width: 3600,
      height: 2400,
      depth: 580,
      installType: 'built-in',
      wallConfig: { left: true, right: true },
      hasFloorFinish: false,
      surroundType: 'surround'
    };
  }
  
  // 컬럼 계산 로직 가져오기
  const indexing = calculateSpaceIndexing(indexingSpaceInfo);
  const columnWidth = indexing.columnWidth;
  const columnCount = indexing.columnCount;
  
  const modules: ModuleData[] = [];
  
  // === 싱글 가구 생성 ===
  modules.push(createSingleType1(columnWidth, maxHeight));
  modules.push(createSingleType2(columnWidth, maxHeight));
  modules.push(createSingleType4(columnWidth, maxHeight));
  
  // === 듀얼 가구 생성 (컬럼이 2개 이상인 경우) ===
  if (columnCount >= 2) {
    const dualColumnWidth = columnWidth * 2;
    
    modules.push(createDualType1(dualColumnWidth, maxHeight));
    modules.push(createDualType2(dualColumnWidth, maxHeight));
    modules.push(createDualType4(dualColumnWidth, maxHeight));
    modules.push(createDualType5(dualColumnWidth, maxHeight));
    modules.push(createDualType6(dualColumnWidth, maxHeight));
  }
  
  return modules;
};