import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';

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
    // 듀얼 가구 중단선반 통합 옵션
    hasSharedMiddlePanel?: boolean; // 좌우 섹션 간 공유 중단선반 여부
    middlePanelHeight?: number; // 중단선반 위치 (바닥에서 mm)
    // 듀얼 가구 안전선반 통합 옵션 (상부 옷장이 동일 용도인 경우)
    hasSharedSafetyShelf?: boolean; // 통합 안전선반 여부
    safetyShelfHeight?: number; // 안전선반 위치 (바닥에서 mm)
  };
}

/**
 * 박스형 모듈들 (sections 기반 리팩토링)
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
  const { height: maxHeight, depth: internalDepth } = internalSpace;
  
  // 가구 최대 깊이 = 내경 깊이 전체 사용 가능 (백패널은 내부에 끼워짐)
  const maxFurnitureDepth = Math.max(internalDepth, 130); // 최소 130mm 보장
  
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
  
  // === 안전선반 적용 헬퍼 함수 ===
  
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
    safetyPosition: number = 2050,
    heightThreshold: number = 2300
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
  
  // === 싱글 가구 5개 (핵심형) ===
  
  // 타입1: 2단 서랍장 + 옷장 (안전 선반 적용)
  const type1DrawerHeight = 600; // 서랍장 고정 높이
  const type1HangingHeight = maxHeight - type1DrawerHeight; // 옷장 높이 = 전체 - 서랍장
  
  // 기본 섹션 구성
  const type1BaseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: type1DrawerHeight, 
      count: 2, // 2단 서랍
      drawerHeights: [255, 255], // 각 서랍 높이 (mm)
      gapHeight: 24.0 // 서랍 간 공백 높이 (mm)
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: type1HangingHeight // 옷장 높이
    }
  ];
  
  // 안전선반 적용
  const type1Sections = applySafetyShelf(type1BaseSections, maxHeight);
  
  modules.push({
    id: `single-2drawer-hanging-${columnWidth}`,
    name: `2단서랍+옷장 ${columnWidth}mm`,
    category: 'full',
    dimensions: { width: columnWidth, height: maxHeight, depth: maxFurnitureDepth },
    color: '#8D6E63',
    description: maxHeight > 2300 
      ? `하단 2단 서랍장 + 상단 옷장 (안전선반 포함) | 폭 ${columnWidth}mm`
      : `하단 2단 서랍장 + 상단 옷장 | 폭 ${columnWidth}mm`,
    isDynamic: true,
    hasDoor: true,
    widthOptions: [columnWidth],
    type: 'box',
    defaultDepth: 600, // 서랍+옷장 복합형 기본 깊이
    modelConfig: {
      basicThickness: 18,
      hasOpenFront: true,
      sections: type1Sections
    }
  });



  // 타입2: 2단 옷장 (하단 고정 + 상단 가변, 안전 선반 적용)
  const type2BottomHangingHeight = 1025; // 하단 옷장 고정 높이 (내부에 마감 선반 포함)
  const type2TopHangingHeight = maxHeight - type2BottomHangingHeight; // 상단 옷장 높이
  
  // 기본 섹션 구성
  const type2BaseSections: SectionConfig[] = [
    { 
      type: 'shelf', 
      heightType: 'absolute', 
      height: type2BottomHangingHeight,
      count: 1, // 하부 옷걸이 구역 (내부 상단에 마감 패널 1개)
      shelfPositions: [type2BottomHangingHeight - 18 - 9] // 섹션 최상단에서 27mm 아래 (선반 두께 + 중심점 보정)
    },
    { 
      type: 'hanging', 
      heightType: 'absolute', 
      height: type2TopHangingHeight 
    }
  ];
  
  // 안전선반 적용
  const type2Sections = applySafetyShelf(type2BaseSections, maxHeight);
  
  modules.push({
    id: `single-2hanging-${columnWidth}`,
    name: `2단 옷장 ${columnWidth}mm`,
    category: 'full',
    dimensions: { width: columnWidth, height: maxHeight, depth: maxFurnitureDepth },
    color: '#303F9F',
    description: maxHeight > 2300 
      ? `하단 짧은옷장 + 상단 긴옷장 (안전선반 포함) | 폭 ${columnWidth}mm`
      : `하단 짧은옷장 + 상단 긴옷장 | 폭 ${columnWidth}mm`,
    isDynamic: true,
    hasDoor: true,
    widthOptions: [columnWidth],
    type: 'box',
    defaultDepth: 600, // 옷장 전용 기본 깊이
    modelConfig: {
      basicThickness: 18,
      hasOpenFront: true,
      sections: type2Sections
    }
  });



  // 타입4: 서랍+옷장 복합형 (동적 높이 계산, 안전선반 적용)
  const drawerHeight = 1000; // 서랍장 고정 높이
  const hangingHeight = maxHeight - drawerHeight; // 옷장 높이 = 전체 - 서랍장
  
  const type4BaseSections: SectionConfig[] = [
    { 
      type: 'drawer', 
      heightType: 'absolute', 
      height: drawerHeight, 
      count: 4,
      // 상세 서랍 높이 정의: 바닥부터 255, 255, 176, 176 + 공백 24.0씩 5곳
      drawerHeights: [255, 255, 176, 176], // 각 서랍 높이 (mm) - 바닥부터 순서
      gapHeight: 24.0 // 서랍 간 공백 높이 (mm)
    },
    { type: 'hanging', heightType: 'absolute', height: hangingHeight }
  ];
  
  // 안전선반 적용
  const type4Sections = applySafetyShelf(type4BaseSections, maxHeight);
  
  modules.push({
    id: `single-4drawer-hanging-${columnWidth}`,
    name: `4단서랍+옷장 ${columnWidth}mm`,
    category: 'full',
    dimensions: { width: columnWidth, height: maxHeight, depth: maxFurnitureDepth },
    color: '#0097A7',
    description: maxHeight > 2300 
      ? `4단 서랍장 + 옷장 복합형 (안전선반 포함) | 폭 ${columnWidth}mm`
      : `4단 서랍장 + 옷장 복합형 | 폭 ${columnWidth}mm`,
    isDynamic: true,
    hasDoor: true,
    widthOptions: [columnWidth],
    type: 'box',
    defaultDepth: 600, // 4단서랍+옷장 복합형 기본 깊이
    modelConfig: {
      basicThickness: 18,
      hasOpenFront: true,
      sections: type4Sections
    }
  });



  // === 듀얼 가구 5개 (핵심형) ===
  
  // 컬럼이 2개 이상인 경우 듀얼 가구 추가
  if (columnCount >= 2) {
    const dualColumnWidth = columnWidth * 2;
    
    // 듀얼 타입1: 2단 서랍장 + 옷장 (안전 선반 적용)
    const dualType1BaseSections: SectionConfig[] = [
      { 
        type: 'drawer', 
        heightType: 'absolute', 
        height: type1DrawerHeight, 
        count: 2, // 2단 서랍
        drawerHeights: [255, 255], // 각 서랍 높이 (mm)
        gapHeight: 24.0 // 서랍 간 공백 높이 (mm)
      },
      { 
        type: 'hanging', 
        heightType: 'absolute', 
        height: type1HangingHeight 
      }
    ];
    
    // 안전선반 적용
    const dualType1Sections = applySafetyShelf(dualType1BaseSections, maxHeight);
    
    modules.push({
      id: `dual-2drawer-hanging-${dualColumnWidth}`,
      name: `듀얼 2단서랍+옷장 ${dualColumnWidth}mm`,
      category: 'full',
      dimensions: { width: dualColumnWidth, height: maxHeight, depth: maxFurnitureDepth },
      color: '#8D6E63',
      description: maxHeight > 2300 
        ? `듀얼 하단 2단 서랍장 + 상단 옷장 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
        : `듀얼 하단 2단 서랍장 + 상단 옷장 | 폭 ${dualColumnWidth}mm`,
      isDynamic: true,
      hasDoor: true,
      widthOptions: [dualColumnWidth],
      type: 'box',
      defaultDepth: 600, // 듀얼 서랍+옷장 복합형 기본 깊이
      modelConfig: {
        basicThickness: 18,
        hasOpenFront: true,
        sections: dualType1Sections
      }
    });

    
    // 듀얼 타입2: 2단 옷장 (하단 고정 + 상단 가변, 안전 선반 적용)
    const dualType2BaseSections: SectionConfig[] = [
      { 
        type: 'shelf', 
        heightType: 'absolute', 
        height: type2BottomHangingHeight,
        count: 1, // 하부 옷걸이 구역 (내부 상단에 마감 패널 1개)
        shelfPositions: [type2BottomHangingHeight - 18 - 9] // 섹션 최상단에서 27mm 아래 (선반 두께 + 중심점 보정)
      },
      { 
        type: 'hanging', 
        heightType: 'absolute', 
        height: type2TopHangingHeight 
      }
    ];
    
    // 안전선반 적용
    const dualType2Sections = applySafetyShelf(dualType2BaseSections, maxHeight);
    
    modules.push({
      id: `dual-2hanging-${dualColumnWidth}`,
      name: `듀얼 2단 옷장 ${dualColumnWidth}mm`,
      category: 'full',
      dimensions: { width: dualColumnWidth, height: maxHeight, depth: maxFurnitureDepth },
      color: '#303F9F',
      description: maxHeight > 2300 
        ? `듀얼 하단 짧은옷장 + 상단 긴옷장 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
        : `듀얼 하단 짧은옷장 + 상단 긴옷장 | 폭 ${dualColumnWidth}mm`,
      isDynamic: true,
      hasDoor: true,
      widthOptions: [dualColumnWidth],
      type: 'box',
      defaultDepth: 600, // 옷장 전용 기본 깊이
      modelConfig: {
        basicThickness: 18,
        hasOpenFront: true,
        sections: dualType2Sections
      }
    });



    // 듀얼 타입4: 4단서랍+옷장 복합형 (동적 높이 계산, 안전선반 적용)
    const dualType4BaseSections: SectionConfig[] = [
      { 
        type: 'drawer', 
        heightType: 'absolute', 
        height: drawerHeight, 
        count: 4,
        // 상세 서랍 높이 정의: 바닥부터 255, 255, 176, 176 + 공백 24.0씩 5곳
        drawerHeights: [255, 255, 176, 176], // 각 서랍 높이 (mm) - 바닥부터 순서
        gapHeight: 24.0 // 서랍 간 공백 높이 (mm)
      },
      { type: 'hanging', heightType: 'absolute', height: hangingHeight }
    ];
    
    // 안전선반 적용
    const dualType4Sections = applySafetyShelf(dualType4BaseSections, maxHeight);
    
    modules.push({
      id: `dual-4drawer-hanging-${dualColumnWidth}`,
      name: `듀얼 4단서랍+옷장 ${dualColumnWidth}mm`,
      category: 'full',
      dimensions: { width: dualColumnWidth, height: maxHeight, depth: maxFurnitureDepth },
      color: '#0097A7',
      description: maxHeight > 2300 
        ? `듀얼 4단 서랍장 + 옷장 복합형 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
        : `듀얼 4단 서랍장 + 옷장 복합형 | 폭 ${dualColumnWidth}mm`,
      isDynamic: true,
      hasDoor: true,
      widthOptions: [dualColumnWidth],
      type: 'box',
      defaultDepth: 600, // 듀얼 4단서랍+옷장 복합형 기본 깊이
      modelConfig: {
        basicThickness: 18,
        hasOpenFront: true,
        sections: dualType4Sections
      }
    });

    // 듀얼 타입5: 서랍+옷장 & 스타일러장 복합형 (좌우 비대칭, 안전선반 적용)
    const stylerWidth = 694; // 스타일러 내경폭 (절대값)
    const leftDrawerWithFinishHeight = 600; // 좌측 서랍장 + 마감 패널 (582 + 18)
    const leftHangingHeight = maxHeight - leftDrawerWithFinishHeight; // 좌측 옷장 높이
    
    // 좌측 섹션 (서랍+옷장)에 안전선반 적용
    const type5LeftBaseSections: SectionConfig[] = [
      { 
        type: 'drawer', 
        heightType: 'absolute', 
        height: leftDrawerWithFinishHeight, 
        count: 2, // 2단 서랍
        drawerHeights: [255, 255], // 각 서랍 높이
        gapHeight: 24.0 // 서랍 간 공백
      },
      { 
        type: 'hanging', 
        heightType: 'absolute', 
        height: leftHangingHeight // 좌측 상단 옷장
      }
    ];
    
    // 우측 섹션 (스타일러장)에 안전선반 적용
    const type5RightBaseSections: SectionConfig[] = [
      { 
        type: 'hanging', 
        heightType: 'absolute', 
        height: maxHeight // 완전 스타일러장
      }
    ];
    
    // 좌우 각각 안전선반 적용
    const type5LeftSections = applySafetyShelf(type5LeftBaseSections, maxHeight);
    const type5RightSections = applySafetyShelf(type5RightBaseSections, maxHeight);
    
    modules.push({
      id: `dual-2drawer-styler-${dualColumnWidth}`,
      name: `듀얼 서랍+스타일러 ${dualColumnWidth}mm`,
      category: 'full',
      dimensions: { width: dualColumnWidth, height: maxHeight, depth: maxFurnitureDepth },
      color: '#4CAF50',
      description: maxHeight > 2300 
        ? `좌측 서랍+옷장 + 우측 스타일러장 (안전선반 포함) | 폭 ${dualColumnWidth}mm`
        : `좌측 서랍+옷장 + 우측 스타일러장 | 폭 ${dualColumnWidth}mm`,
      isDynamic: true,
      hasDoor: true,
      widthOptions: [dualColumnWidth],
      type: 'box',
      defaultDepth: 660, // 서랍+스타일러 복합형 기본 깊이
      modelConfig: {
        basicThickness: 18,
        hasOpenFront: true,
        rightAbsoluteWidth: stylerWidth, // 우측 절대폭 지정
        leftSections: type5LeftSections,
        rightSections: type5RightSections
      }
    });

    // 듀얼 타입6: 4단서랍+바지걸이+옷장 복합형 (좌우 비대칭, 통합 중단선반, 통합 안전선반)
    // 상부 옷장이 좌우 동일 용도 → 안전선반 1개 (전체 폭)
    const pantsHangerWidth = 564; // 바지걸이 내경폭 (절대값)
    const bottomSectionHeight = 1000; // 하단부 총 높이 (서랍장 또는 바지걸이)
    const topHangingHeight = maxHeight - bottomSectionHeight; // 상단 옷장 높이
    
    modules.push({
      id: `dual-4drawer-pantshanger-${dualColumnWidth}`,
      name: `듀얼 서랍+바지걸이 ${dualColumnWidth}mm`,
      category: 'full',
      dimensions: { width: dualColumnWidth, height: maxHeight, depth: maxFurnitureDepth },
      color: '#9C27B0',
      description: maxHeight > 2300 
        ? `좌측 4단서랍+옷장 + 우측 바지걸이+옷장 (통합 안전선반) | 폭 ${dualColumnWidth}mm`
        : `좌측 4단서랍+옷장 + 우측 바지걸이+옷장 | 폭 ${dualColumnWidth}mm`,
      isDynamic: true,
      hasDoor: true,
      widthOptions: [dualColumnWidth],
      type: 'box',
      defaultDepth: 600, // 서랍+바지걸이 복합형 기본 깊이
      modelConfig: {
        basicThickness: 18,
        hasOpenFront: true,
        rightAbsoluteWidth: pantsHangerWidth, // 우측 바지걸이 고정폭 564mm
        // 통합 중단선반: 좌측 면판과 우측 면판 사이에 끼워지는 1개의 패널
        hasSharedMiddlePanel: true, // 중단에 공유 패널 존재 (3D 렌더링에서 처리)
        middlePanelHeight: bottomSectionHeight, // 중단 패널 위치 (바닥에서 1000mm)
        // 통합 안전선반: 상부 옷장이 좌우 동일 용도이므로 전체 폭 1개 패널
        hasSharedSafetyShelf: maxHeight > 2300, // 통합 안전선반 필요 여부
        safetyShelfHeight: 2050, // 안전선반 위치 (바닥에서 mm)
        leftSections: [
          { 
            type: 'drawer', 
            heightType: 'absolute', 
            height: bottomSectionHeight, 
            count: 4, // 4단 서랍
            // 타입4와 동일한 서랍 상세내역: 바닥부터 255, 255, 176, 176 + 공백 24.0mm
            // 중단선반은 전체 폭에 걸쳐 1개만 생성 (좌우 공유)
            drawerHeights: [255, 255, 176, 176], // 각 서랍 높이
            gapHeight: 24.0 // 서랍 간 공백
          },
          { 
            type: 'hanging', 
            heightType: 'absolute', 
            height: topHangingHeight // 좌측 상단 옷장 (안전선반은 통합 처리)
          }
        ],
        rightSections: [
          { 
            type: 'hanging', 
            heightType: 'absolute', 
            height: bottomSectionHeight // 우측 하단 바지걸이 (564mm 내경, 1000mm 높이)
          },
          { 
            type: 'hanging', 
            heightType: 'absolute', 
            height: topHangingHeight // 우측 상단 옷장 (안전선반은 통합 처리)
          }
        ]
      }
    });


  }
  
  return modules;
};