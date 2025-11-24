import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';

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
  category: 'full' | 'upper' | 'lower';
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
  slotWidths?: number[]; // 듀얼 가구의 개별 슬롯 너비 (mm)
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
  PANTSHANGER_WIDTH: 586, // 바지걸이 내경폭
  
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
      
      // 이미 shelfPositions가 있으면 안전선반 위치 추가 (Type4 바닥판 보존하면서 안전선반 추가)
      if (section.shelfPositions && section.shelfPositions.length > 0) {
        return {
          ...section,
          shelfPositions: [...section.shelfPositions, safetyPosInSection]
        };
      }
      
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
  defaultDepth?: number,
  category?: 'full' | 'upper' | 'lower'
): Partial<ModuleData> => ({
  id,
  name,
  category: category || 'full',
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
  
  // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `single-2drawer-hanging-${widthForId}`,
    `2단서랍+옷장 ${widthForId}mm`,
    columnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE1,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `하단 2단 서랍장 + 상단 옷장 (안전선반 포함)`
      : `하단 2단 서랍장 + 상단 옷장`,
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
      type: 'hanging', // 하부장도 옷걸이 구역
      heightType: 'absolute',
      height: bottomHeight,
      shelfPositions: [0] // 치수 표시용 (실제 상판은 SingleType2.tsx에서 렌더링)
    },
    {
      type: 'hanging',
      heightType: 'absolute',
      height: topHeight
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `single-2hanging-${widthForId}`,
    `2단 옷장 ${widthForId}mm`,
    columnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE2,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `하단 짧은옷장 + 상단 긴옷장 (안전선반 포함)`
      : `하단 짧은옷장 + 상단 긴옷장`
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
      height: hangingHeight,
      shelfPositions: [0] // 치수 표시용 (실제 패널은 BaseFurnitureShell에서 렌더링)
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `single-4drawer-hanging-${widthForId}`,
    `4단서랍+옷장 ${widthForId}mm`,
    columnWidth, // columnWidth 사용 (500mm 대신)
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE4,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `4단 서랍장 + 옷장 복합형 (안전선반 포함)`
      : `4단 서랍장 + 옷장 복합형`
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
const createDualType1 = (dualColumnWidth: number, maxHeight: number, slotWidths?: number[]): ModuleData => {
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
  
  // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
  const widthForId = Math.round(dualColumnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-2drawer-hanging-${widthForId}`,
    `듀얼 2단서랍+옷장 ${widthForId}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE1,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `듀얼 하단 2단 서랍장 + 상단 옷장 (안전선반 포함)`
      : `듀얼 하단 2단 서랍장 + 상단 옷장`
  );
  
  return {
    ...base,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 저장
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입2: 2단 옷장 생성
 */
const createDualType2 = (dualColumnWidth: number, maxHeight: number, slotWidths?: number[]): ModuleData => {
  const bottomHeight = FURNITURE_SPECS.TYPE2_BOTTOM_HEIGHT;
  const topHeight = maxHeight - bottomHeight;
  
  // 기본 섹션 구성
  const baseSections: SectionConfig[] = [
    {
      type: 'hanging', // 하부장도 옷걸이 구역
      heightType: 'absolute',
      height: bottomHeight,
      shelfPositions: [0] // 치수 표시용 (실제 상판은 DualType1.tsx에서 렌더링)
    },
    {
      type: 'hanging',
      heightType: 'absolute',
      height: topHeight
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const widthForId = Math.round(dualColumnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-2hanging-${widthForId}`,
    `듀얼 2단 옷장 ${widthForId}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE2,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `듀얼 하단 짧은옷장 + 상단 긴옷장 (안전선반 포함)`
      : `듀얼 하단 짧은옷장 + 상단 긴옷장`
  );
  
  return {
    ...base,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 저장
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입4: 4단서랍+옷장 복합형 생성
 */
const createDualType4 = (dualColumnWidth: number, maxHeight: number, slotWidths?: number[]): ModuleData => {
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
      height: hangingHeight,
      shelfPositions: [0] // 치수 표시용 (실제 패널은 BaseFurnitureShell에서 렌더링)
    }
  ];
  
  // 안전선반 적용
  const sections = applySafetyShelf(baseSections, maxHeight);
  
  const widthForId = Math.round(dualColumnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-4drawer-hanging-${widthForId}`,
    `듀얼 4단서랍+옷장 ${widthForId}mm`,
    dualColumnWidth, // dualColumnWidth 사용 (1000mm 대신)
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.TYPE4,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `듀얼 4단 서랍장 + 옷장 복합형 (안전선반 포함)`
      : `듀얼 4단 서랍장 + 옷장 복합형`
  );
  
  return {
    ...base,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 저장
    modelConfig: {
      ...base.modelConfig,
      sections
    }
  } as ModuleData;
};

/**
 * 듀얼 타입5: 서랍+옷장 & 스타일러장 복합형 생성 (좌우 비대칭)
 */
const createDualType5 = (dualColumnWidth: number, maxHeight: number, slotWidths?: number[]): ModuleData => {
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
  // 좌측 섹션들의 총 높이와 동일하게 설정
  const rightSectionHeight = leftDrawerWithFinishHeight + leftHangingHeight; // 600 + (maxHeight - 600) = maxHeight
  const rightBaseSections: SectionConfig[] = [
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: rightSectionHeight
    }
  ];
  
  // 좌우 각각 안전선반 적용
  const leftSections = applySafetyShelf(leftBaseSections, maxHeight);
  const rightSections = applySafetyShelf(rightBaseSections, maxHeight);
  
  const widthForId = Math.round(dualColumnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-2drawer-styler-${widthForId}`,
    `듀얼 서랍+스타일러 ${widthForId}mm`,
    dualColumnWidth,
    maxHeight,
    600, // 좌측 서랍+옷장 기본 깊이 (customDepth로 변경 가능)
    FURNITURE_SPECS.COLORS.STYLER,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `좌측 서랍+옷장 + 우측 스타일러장 (안전선반 포함)`
      : `좌측 서랍+옷장 + 우측 스타일러장`,
    600
  );
  
  return {
    ...base,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 저장
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
const createDualType6 = (dualColumnWidth: number, maxHeight: number, slotWidths?: number[]): ModuleData => {
  const bottomSectionHeight = FURNITURE_SPECS.TYPE4_DRAWER_HEIGHT; // 하단부 총 높이
  const topHangingHeight = maxHeight - bottomSectionHeight; // 상단 옷장 높이
  
  const widthForId = Math.round(dualColumnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-4drawer-pantshanger-${widthForId}`,
    `듀얼 서랍+바지걸이 ${widthForId}mm`,
    dualColumnWidth,
    maxHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    FURNITURE_SPECS.COLORS.PANTSHANGER,
    maxHeight > FURNITURE_SPECS.SAFETY_SHELF_THRESHOLD 
      ? `좌측 4단서랍+옷장 + 우측 바지걸이+옷장 (통합 안전선반)`
      : `좌측 4단서랍+옷장 + 우측 바지걸이+옷장`
  );
  
  return {
    ...base,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 저장
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
// 상부장 가구 생성 함수
// ============================================================================

/**
 * 상부장 기본형 - 선반 2단
 */
const createUpperCabinet1 = (columnWidth: number, maxHeight?: number): ModuleData => {
  const widthForId = Math.round(columnWidth * 100) / 100;
  // maxHeight가 제공되면 사용, 아니면 기본값 600mm
  const upperHeight = maxHeight ? maxHeight - 200 : 600; // 천장과 200mm 갭

  const base = createFurnitureBase(
    `upper-cabinet-shelf-${widthForId}`,
    `상부장 선반형 ${widthForId}mm`,
    columnWidth,
    upperHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#e8f5e9', // 연한 초록색
    `상부장 선반 2단형`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    hasDoor: true, // 상부장은 기본적으로 도어 있음
    thumbnail: '/images/furniture-thumbnails/상부장 선반형.png',
    modelConfig: {
      ...base.modelConfig,
      sections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 2 // 2단 선반
        }
      ]
    }
  } as ModuleData;
};

/**
 * 상부장 2단형 - 중간 선반 1개
 */
const createUpperCabinet4 = (columnWidth: number, maxHeight?: number): ModuleData => {
  const widthForId = Math.round(columnWidth * 100) / 100;
  const upperHeight = maxHeight ? maxHeight - 200 : 600; // 천장과 200mm 갭

  const base = createFurnitureBase(
    `upper-cabinet-2tier-${widthForId}`,
    `상부장 2단형 ${widthForId}mm`,
    columnWidth,
    upperHeight,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#e3f2fd', // 연한 파란색
    `상부장 2단형 (중간 선반 1개)`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/상부장 2단형.png',
    modelConfig: {
      ...base.modelConfig,
      sections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 1 // 중간 선반 1개로 2단 구성
        }
      ]
    }
  } as ModuleData;
};

/**
 * 상부장 오픈형 - 선반 없음
 */
const createUpperCabinet2 = (columnWidth: number): ModuleData => {
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `upper-cabinet-open-${widthForId}`,
    `상부장 오픈형 ${widthForId}mm`,
    columnWidth,
    600,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#fff3e0', // 연한 주황색
    `상부장 오픈형`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/상부장 오픈형.png',
    modelConfig: {
      ...base.modelConfig,
      sections: [
        {
          type: 'open',
          heightType: 'percentage',
          height: 100
        }
      ]
    }
  } as ModuleData;
};

/**
 * 상부장 혼합형 - 상단 오픈 + 하단 선반
 */
const createUpperCabinet3 = (columnWidth: number): ModuleData => {
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `upper-cabinet-mixed-${widthForId}`,
    `상부장 혼합형 ${widthForId}mm`,
    columnWidth,
    600,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#f3e5f5', // 연한 보라색
    `상부장 혼합형 (오픈+선반)`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/상부장 혼합형.png',
    modelConfig: {
      ...base.modelConfig,
      sections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 50,
          count: 1
        },
        {
          type: 'open',
          heightType: 'percentage',
          height: 50
        }
      ]
    }
  } as ModuleData;
};

/**
 * 하부장 기본형 - W600xD600xH1000
 * 기본 패널 두께 18mm 적용
 * 슬롯 너비에 따라 동적으로 조절
 */
const createLowerCabinet1 = (columnWidth: number): ModuleData => {
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `lower-cabinet-basic-${widthForId}`,
    `하부장 ${widthForId}mm`,
    columnWidth,
    1000, // 하부장 높이 1000mm
    600, // 하부장 깊이 600mm (기본값)
    '#fff3e0', // 연한 오렌지색
    `하부장 기본형 W${widthForId}xH1000xD600`,
    600, // 기본 깊이
    'lower' // 하부장 카테고리 명시
  );
  
  return {
    ...base,
    isDynamic: true, // 동적 크기 조절 가능
    defaultDepth: 600, // 기본 깊이 600mm
    thumbnail: '/images/furniture-thumbnails/하부장.png',
    modelConfig: {
      ...base.modelConfig,
      basicThickness: FURNITURE_SPECS.BASIC_THICKNESS, // 18mm 패널 두께
      hasOpenFront: false, // 전면 막힘 (문짣 가능)
      sections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 2 // 선반 2단
        }
      ]
    }
  } as ModuleData;
};

/**
 * 하부장 2단형 - 중간 선반 1개
 */
const createLowerCabinet2 = (columnWidth: number): ModuleData => {
  const widthForId = Math.round(columnWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `lower-cabinet-2tier-${widthForId}`,
    `하부장 2단형 ${widthForId}mm`,
    columnWidth,
    1000, // 하부장 높이 1000mm
    600, // 하부장 깊이 600mm (기본값)
    '#fce4ec', // 연한 핑크색
    `하부장 2단형 (중간 선반 1개)`,
    600, // 기본 깊이
    'lower' // 하부장 카테고리 명시
  );
  
  return {
    ...base,
    isDynamic: true, // 동적 크기 조절 가능
    defaultDepth: 600, // 기본 깊이 600mm
    thumbnail: '/images/furniture-thumbnails/하부장 2단형.png',
    modelConfig: {
      ...base.modelConfig,
      basicThickness: FURNITURE_SPECS.BASIC_THICKNESS, // 18mm 패널 두께
      hasOpenFront: false, // 전면 막힘 (문짣 가능)
      sections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 1 // 중간 선반 1개로 2단 구성
        }
      ]
    }
  } as ModuleData;
};

// ============================================================================
// 듀얼 상부장 가구 생성 함수
// ============================================================================

/**
 * 듀얼 상부장 선반형 - 선반 2단
 */
const createDualUpperCabinet1 = (dualWidth: number): ModuleData => {
  const widthForId = Math.round(dualWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-upper-cabinet-shelf-${widthForId}`,
    `듀얼 상부장 선반형 ${widthForId}mm`,
    dualWidth,
    600, // 상부장 기본 높이 600mm
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#c8e6c9', // 진한 초록색
    `듀얼 상부장 선반 2단형`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/듀얼 상부장 선반형.png',
    modelConfig: {
      ...base.modelConfig,
      leftSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 2 // 좌측 2단 선반
        }
      ],
      rightSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 2 // 우측 2단 선반
        }
      ]
    }
  } as ModuleData;
};

/**
 * 듀얼 상부장 2단형 - 중간 선반 1개
 */
const createDualUpperCabinet2 = (dualWidth: number): ModuleData => {
  const widthForId = Math.round(dualWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-upper-cabinet-2tier-${widthForId}`,
    `듀얼 상부장 2단형 ${widthForId}mm`,
    dualWidth,
    600, // 상부장 기본 높이 600mm
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#bbdefb', // 진한 파란색
    `듀얼 상부장 2단형 (중간 선반 1개)`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/듀얼 상부장2단형.png',
    modelConfig: {
      ...base.modelConfig,
      leftSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 1 // 좌측 중간 선반 1개
        }
      ],
      rightSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 1 // 우측 중간 선반 1개
        }
      ]
    }
  } as ModuleData;
};

/**
 * 듀얼 상부장 오픈형 - 선반 없음
 */
const createDualUpperCabinet3 = (dualWidth: number): ModuleData => {
  const widthForId = Math.round(dualWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-upper-cabinet-open-${widthForId}`,
    `듀얼 상부장 오픈형 ${widthForId}mm`,
    dualWidth,
    600,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#ffe0b2', // 진한 주황색
    `듀얼 상부장 오픈형`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/듀얼 상부장 오픈형.png',
    modelConfig: {
      ...base.modelConfig,
      leftSections: [
        {
          type: 'open',
          heightType: 'percentage',
          height: 100
        }
      ],
      rightSections: [
        {
          type: 'open',
          heightType: 'percentage',
          height: 100
        }
      ]
    }
  } as ModuleData;
};

/**
 * 듀얼 상부장 혼합형 - 상단 오픈 + 하단 선반
 */
const createDualUpperCabinet4 = (dualWidth: number): ModuleData => {
  const widthForId = Math.round(dualWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-upper-cabinet-mixed-${widthForId}`,
    `듀얼 상부장 혼합형 ${widthForId}mm`,
    dualWidth,
    600,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    '#e1bee7', // 진한 보라색
    `듀얼 상부장 혼합형 (오픈+선반)`,
    FURNITURE_SPECS.DEFAULT_DEPTH,
    'upper' // 상부장 카테고리 명시
  );
  
  return {
    ...base,
    thumbnail: '/images/furniture-thumbnails/듀얼 상부장 혼합형.png',
    modelConfig: {
      ...base.modelConfig,
      leftSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 50,
          count: 1
        },
        {
          type: 'open',
          heightType: 'percentage',
          height: 50
        }
      ],
      rightSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 50,
          count: 1
        },
        {
          type: 'open',
          heightType: 'percentage',
          height: 50
        }
      ]
    }
  } as ModuleData;
};

// ============================================================================
// 듀얼 하부장 가구 생성 함수
// ============================================================================

/**
 * 듀얼 하부장 기본형 - 선반 2단
 */
const createDualLowerCabinet1 = (dualWidth: number): ModuleData => {
  const widthForId = Math.round(dualWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-lower-cabinet-basic-${widthForId}`,
    `듀얼 하부장 ${widthForId}mm`,
    dualWidth,
    1000, // 하부장 높이 1000mm
    600, // 하부장 깊이 600mm (기본값)
    '#ffcc80', // 진한 오렌지색
    `듀얼 하부장 기본형 W${widthForId}xH1000xD600`,
    600, // 기본 깊이
    'lower' // 하부장 카테고리 명시
  );
  
  return {
    ...base,
    isDynamic: true, // 동적 크기 조절 가능
    defaultDepth: 600, // 기본 깊이 600mm
    thumbnail: '/images/furniture-thumbnails/듀얼 하부장.png',
    modelConfig: {
      ...base.modelConfig,
      basicThickness: FURNITURE_SPECS.BASIC_THICKNESS, // 18mm 패널 두께
      hasOpenFront: false, // 전면 막힘 (문짣 가능)
      leftSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 2 // 좌측 선반 2단
        }
      ],
      rightSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 2 // 우측 선반 2단
        }
      ]
    }
  } as ModuleData;
};

/**
 * 듀얼 하부장 2단형 - 중간 선반 1개
 */
const createDualLowerCabinet2 = (dualWidth: number): ModuleData => {
  const widthForId = Math.round(dualWidth * 100) / 100;
  
  const base = createFurnitureBase(
    `dual-lower-cabinet-2tier-${widthForId}`,
    `듀얼 하부장 2단형 ${widthForId}mm`,
    dualWidth,
    1000, // 하부장 높이 1000mm
    600, // 하부장 깊이 600mm (기본값)
    '#f8bbd0', // 진한 핑크색
    `듀얼 하부장 2단형 (중간 선반 1개)`,
    600, // 기본 깊이
    'lower' // 하부장 카테고리 명시
  );
  
  return {
    ...base,
    isDynamic: true, // 동적 크기 조절 가능
    defaultDepth: 600, // 기본 깊이 600mm
    thumbnail: '/images/furniture-thumbnails/듀얼 하부장 2단형.png',
    modelConfig: {
      ...base.modelConfig,
      basicThickness: FURNITURE_SPECS.BASIC_THICKNESS, // 18mm 패널 두께
      hasOpenFront: false, // 전면 막힘 (문짣 가능)
      leftSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 1 // 좌측 중간 선반 1개
        }
      ],
      rightSections: [
        {
          type: 'shelf',
          heightType: 'percentage',
          height: 100,
          count: 1 // 우측 중간 선반 1개
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

  // 단내림 구간인 경우 로그 출력
  if (spaceInfo && (spaceInfo as any).zone === 'dropped') {
    console.log('🟠 generateShelvingModules 단내림 구간 처리');
    console.log('  zone:', (spaceInfo as any).zone);
    console.log('  internalSpaceHeight:', internalSpace.height);
    console.log('  maxHeight:', maxHeight);
    console.log('  droppedCeilingEnabled:', spaceInfo.droppedCeiling?.enabled);
    console.log('  dropHeight:', spaceInfo.droppedCeiling?.dropHeight);
  }

  // 단내림 구간의 경우 internalSpace.height가 이미 조정되어 있음
  // (calculateInternalSpace에서 처리됨)
  
  // 띄워서 배치인 경우 가용 높이에서 띄움 높이를 차감
  if (spaceInfo?.baseConfig?.type === 'stand' && spaceInfo.baseConfig.placementType === 'float') {
    const floatHeight = spaceInfo.baseConfig.floatHeight || 0;
    maxHeight = maxHeight - floatHeight;
  }
  
  // SpaceInfo가 제공되면 그대로 사용, 아니면 기본값 사용
  let indexingSpaceInfo: SpaceInfo;
  
  if (spaceInfo) {
    indexingSpaceInfo = spaceInfo;
  } else {
    // 기본값 사용 - 최소한의 기본 설정으로 상하부장 표시
    console.warn('⚠️ [generateShelvingModules] No spaceInfo provided, using defaults');
    indexingSpaceInfo = {
      width: internalSpace.width,
      height: 2400, // 기본 높이
      depth: 600, // 기본 깊이
      customColumnCount: undefined, // customColumnCount를 설정하지 않으면 SpaceCalculator.getDefaultColumnCount가 사용됨
      columnMode: 'custom',
      baseConfig: {
        type: 'wall',
        placementType: 'floor',
        floatHeight: 0
      },
      materialConfig: {
        interior: '#FFFFFF',
        doorColor: '#E0E0E0'
      }
    } as SpaceInfo;
  }
  
  // _tempSlotWidths가 있으면 우선 사용 (getModuleById에서 특정 너비로 검색하는 경우)
  let columnWidth: number;
  let columnCount: number;
  let slotWidths: number[] | undefined;
  let zoneSlotInfo: any = null; // 디버깅용으로 여기서 선언
  
  if (indexingSpaceInfo && '_tempSlotWidths' in indexingSpaceInfo && indexingSpaceInfo._tempSlotWidths) {
    slotWidths = indexingSpaceInfo._tempSlotWidths as number[];
    columnCount = slotWidths.length;
    
    // 모든 슬롯이 같은 너비인지 확인
    const uniqueWidths = [...new Set(slotWidths.map(w => Math.round(w * 100) / 100))];
    if (uniqueWidths.length === 1) {
      // 모든 슬롯이 같은 너비면 그 값을 사용
      columnWidth = uniqueWidths[0];
    } else {
      // 다른 너비가 있으면 첫 번째 슬롯 너비 사용
      columnWidth = Math.round(slotWidths[0] * 100) / 100;
    }
    
    // console.log('🎯 _tempSlotWidths 사용:', {
    //   slotWidths,
    //   columnWidth,
    //   '원본첫번째슬롯': slotWidths[0],
    //   '정규화된너비': columnWidth,
    //   'uniqueWidths': uniqueWidths
    // });
  } else {
    // 단내림 구간인지 확인하고 zoneSlotInfo 사용
    zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(indexingSpaceInfo, indexingSpaceInfo.customColumnCount);
    
    // 단내림이 활성화되고 zone 정보가 전달된 경우
    if (indexingSpaceInfo.droppedCeiling?.enabled && (indexingSpaceInfo as any).zone) {
      const zone = (indexingSpaceInfo as any).zone;
      // console.log('🎯 [generateShelvingModules] Zone 정보 확인:', {
      //   zone,
      //   droppedCeilingEnabled: indexingSpaceInfo.droppedCeiling?.enabled,
      //   zoneSlotInfo: {
      //     dropped: zoneSlotInfo.dropped ? {
      //       columnWidth: zoneSlotInfo.dropped.columnWidth,
      //       columnCount: zoneSlotInfo.dropped.columnCount,
      //       slotWidths: zoneSlotInfo.dropped.slotWidths
      //     } : null,
      //     normal: zoneSlotInfo.normal ? {
      //       columnWidth: zoneSlotInfo.normal.columnWidth,
      //       columnCount: zoneSlotInfo.normal.columnCount,
      //       slotWidths: zoneSlotInfo.normal.slotWidths
      //     } : null
      //   }
      // });
      
      if (zone === 'dropped' && zoneSlotInfo.dropped) {
        columnWidth = Math.round(zoneSlotInfo.dropped.columnWidth * 100) / 100;
        columnCount = zoneSlotInfo.dropped.columnCount;
        slotWidths = zoneSlotInfo.dropped.slotWidths;
        // console.log('✅ [generateShelvingModules] 단내림 영역 사용:', {
        //   columnWidth,
        //   columnCount,
        //   slotWidths,
        //   zone: 'dropped',
        //   internalSpaceWidth: internalSpace.width,
        //   internalSpaceHeight: internalSpace.height
        // });
      } else if (zone === 'normal' && zoneSlotInfo.normal) {
        columnWidth = Math.round(zoneSlotInfo.normal.columnWidth * 100) / 100;
        columnCount = zoneSlotInfo.normal.columnCount;
        slotWidths = zoneSlotInfo.normal.slotWidths;
        // console.log('✅ [generateShelvingModules] 메인 영역 사용:', {
        //   columnWidth,
        //   columnCount,
        //   slotWidths,
        //   zone: 'normal',
        //   internalSpaceWidth: internalSpace.width,
        //   internalSpaceHeight: internalSpace.height
        // });
      } else {
        // zone 정보가 있지만 해당 zone이 없는 경우 fallback
        console.warn('⚠️ [generateShelvingModules] Zone 정보는 있지만 해당 zone이 없음, fallback 사용:', {
          zone,
          availableZones: {
            dropped: !!zoneSlotInfo.dropped,
            normal: !!zoneSlotInfo.normal
          }
        });
        columnWidth = Math.round(zoneSlotInfo.normal.columnWidth * 100) / 100;
        columnCount = zoneSlotInfo.normal.columnCount;
        slotWidths = zoneSlotInfo.normal.slotWidths;
      }
    } else {
      // 단내림이 없는 경우 일반 계산
      columnWidth = zoneSlotInfo.normal.columnWidth;
      columnCount = zoneSlotInfo.normal.columnCount;
      slotWidths = zoneSlotInfo.normal.slotWidths;
      // console.log('✅ [generateShelvingModules] 일반 계산 사용:', {
      //   columnWidth,
      //   columnCount,
      //   slotWidths,
      //   zone: 'none',
      //   internalSpaceWidth: internalSpace.width,
      //   internalSpaceHeight: internalSpace.height
      // });
    }
  }
  
  
  // console.log('🎯 [generateShelvingModules] 계산 결과:', {
  //   zone: (indexingSpaceInfo as any).zone,
  //   columnWidth,
  //   columnCount,
  //   slotWidths,
  //   zoneSlotInfo,
  //   droppedCeilingEnabled: indexingSpaceInfo.droppedCeiling?.enabled,
  //   internalSpaceWidth: internalSpace.width,
  //   '슬롯별 너비': slotWidths ? slotWidths : '없음',
  //   '슬롯 너비 합계': slotWidths ? slotWidths.reduce((sum, w) => sum + w, 0) : 0
  // });
  
  // 700mm 컬럼이 계산되면 에러 발생
  if (columnWidth >= 680 && columnWidth <= 720) {
    console.error('🚨🚨🚨 [generateShelvingModules] 700mm column calculated!', {
      spaceInfo,
      internalSpace,
      columnWidth,
      columnCount,
      zoneSlotInfo
    });
  }
  
  const modules: ModuleData[] = [];
  
  // console.log('🎯 슬롯 너비 정보:', {
  //   zone: (indexingSpaceInfo as any).zone,
  //   columnWidth,
  //   columnCount,
  //   slotWidths,
  //   uniqueWidths: slotWidths ? [...new Set(slotWidths)] : []
  // });
  
  // 갤러리 표시용으로는 평균 너비의 가구만 생성 (중복 방지)
  // 가구 높이는 internalSpace.height 사용 (이미 위에서 maxHeight 선언됨)
  
  // === 싱글 가구 생성 ===
  // console.log('🔨 싱글 가구 생성 시작:', {
  //   columnWidth,
  //   '반올림된너비': Math.round(columnWidth * 100) / 100,
  //   '생성될ID예시': `single-2drawer-hanging-${Math.round(columnWidth * 100) / 100}`
  // });
  modules.push(createSingleType1(columnWidth, maxHeight));
  modules.push(createSingleType2(columnWidth, maxHeight));
  modules.push(createSingleType4(columnWidth, maxHeight));
  
  // === 듀얼 가구 생성 ===
  // _tempSlotWidths가 있고 듀얼 가구를 위한 2개의 슬롯 너비가 있으면 합계 사용
  let dualWidth: number;
  if (slotWidths && slotWidths.length >= 2) {
    // 실제 슬롯 너비들의 합계 사용 (예: 449 + 449 = 898)
    // 소수점 2자리로 정규화
    dualWidth = Math.round((slotWidths[0] + slotWidths[1]) * 100) / 100;
  } else {
    // 기본값: 평균 너비의 2배
    dualWidth = Math.round(columnWidth * 2 * 100) / 100;
  }
  
  // console.log('🎯🔥 듀얼 가구 생성 체크:', {
  //   dualWidth,
  //   '슬롯 너비 배열': slotWidths,
  //   '첫번째 슬롯': slotWidths ? slotWidths[0] : null,
  //   '두번째 슬롯': slotWidths ? slotWidths[1] : null,
  //   '듀얼 너비 계산': slotWidths && slotWidths.length >= 2 ? `${slotWidths[0]} + ${slotWidths[1]} = ${dualWidth}` : `${columnWidth} × 2 = ${dualWidth}`,
  //   internalSpaceWidth: internalSpace.width,
  //   willCreateDual: dualWidth <= internalSpace.width,
  //   zone: (indexingSpaceInfo as any).zone
  // });
  
  // 단내림 구간이어도 듀얼 가구는 갤러리에 표시해야 함
  // 실제 배치 가능 여부는 ModuleGallery의 isModuleValid에서 체크
  const isDroppedZone = (indexingSpaceInfo as any).zone === 'dropped';
  
  if (dualWidth <= internalSpace.width || isDroppedZone) {
    // 듀얼 가구 생성 시 개별 슬롯 너비 전달
    const dualSlotWidths = slotWidths && slotWidths.length >= 2 ? 
      [slotWidths[0], slotWidths[1]] : 
      [dualWidth / 2, dualWidth / 2];
    
    // console.log('🔥🔥🔥 듀얼 가구 슬롯 너비 정보:', {
    //   dualWidth,
    //   dualSlotWidths,
    //   '첫번째 슬롯': dualSlotWidths[0],
    //   '두번째 슬롯': dualSlotWidths[1],
    //   '합계': dualSlotWidths[0] + dualSlotWidths[1]
    // });
    
    modules.push(createDualType1(dualWidth, maxHeight, dualSlotWidths));
    modules.push(createDualType2(dualWidth, maxHeight, dualSlotWidths));
    modules.push(createDualType4(dualWidth, maxHeight, dualSlotWidths));
    modules.push(createDualType5(dualWidth, maxHeight, dualSlotWidths));
    modules.push(createDualType6(dualWidth, maxHeight, dualSlotWidths));
    
    // === 듀얼 상부장 가구 생성 ===
    modules.push(createDualUpperCabinet1(dualWidth));
    modules.push(createDualUpperCabinet2(dualWidth));
    modules.push(createDualUpperCabinet3(dualWidth));
    modules.push(createDualUpperCabinet4(dualWidth));
    
    // === 듀얼 하부장 가구 생성 ===
    modules.push(createDualLowerCabinet1(dualWidth));
    modules.push(createDualLowerCabinet2(dualWidth));
  }
  
  // === 싱글 상부장 가구 생성 ===
  // 상부장은 항상 생성 (단내림 구간에서도 천장 기준으로 배치되므로)
  const upperCabinet1 = createUpperCabinet1(columnWidth);
  // console.log('🔨 상부장 1 생성:', {
  //   id: upperCabinet1.id,
  //   name: upperCabinet1.name,
  //   category: upperCabinet1.category,
  //   dimensions: upperCabinet1.dimensions,
  //   internalSpaceHeight: internalSpace.height,
  //   zone: (indexingSpaceInfo as any).zone
  // });
  modules.push(upperCabinet1);
  modules.push(createUpperCabinet2(columnWidth));
  modules.push(createUpperCabinet3(columnWidth));
  modules.push(createUpperCabinet4(columnWidth)); // 새로운 2단형 추가
  
  // === 싱글 하부장 가구 생성 ===
  // 하부장도 항상 생성 (배치 가능 여부는 UI에서 판단)
  const lowerCabinet1 = createLowerCabinet1(columnWidth);
  // console.log('🔨 하부장 생성:', {
  //   id: lowerCabinet1.id,
  //   name: lowerCabinet1.name,
  //   category: lowerCabinet1.category,
  //   dimensions: lowerCabinet1.dimensions,
  //   internalSpaceHeight: internalSpace.height,
  //   zone: (indexingSpaceInfo as any).zone
  // });
  modules.push(lowerCabinet1);

  const lowerCabinet2 = createLowerCabinet2(columnWidth);
  // console.log('🔨 하부장 2단형 생성:', {
  //   id: lowerCabinet2.id,
  //   name: lowerCabinet2.name,
  //   category: lowerCabinet2.category,
  //   dimensions: lowerCabinet2.dimensions,
  //   internalSpaceHeight: internalSpace.height,
  //   zone: (indexingSpaceInfo as any).zone
  // });
  modules.push(lowerCabinet2);
  
  // console.log('📊 generateShelvingModules 최종 결과:', {
  //   totalModulesCount: modules.length,
  //   categories: [...new Set(modules.map(m => m.category))],
  //   upperCount: modules.filter(m => m.category === 'upper').length,
  //   lowerCount: modules.filter(m => m.category === 'lower').length,
  //   fullCount: modules.filter(m => m.category === 'full').length
  // });
  
  return modules;
};