import { ModuleData, type SectionConfig } from '@/data/modules';
import { calculateHingePositions } from '@/domain/boring/calculators/hingeCalculator';
import { DEFAULT_HINGE_SETTINGS } from '@/domain/boring/constants';
import type { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import type { FreeSurroundConfig } from '@/store/core/spaceConfigStore';
import {
  normalizeDoorHingePositionsMm,
  resolveDoorLeafDimensions,
  resolveDoorVerticalGeometry,
  resolveSideAnchoredDoorHingePositionsMm,
  resolveSidePanelMatchedHingePositions
} from './doorGeometryCalculator';
import type { DoorOuterOpenSides } from './doorOuterGap';
import { resolveShelfFrontInsetMm } from './shelfInsetCalculator';
import { getTopDownStoneFrontVisibleHeightMm, resolveTopDown2TierGeometry, resolveTopDownTopPanelFrontReductionMm } from './topDownCabinetGeometry';
import { getDirectLowerDowelShelfPositionsMm, isDirectLowerDowelShelfModule } from './lowerCabinetDowelShelves';
import { resolveDrawerRailSizingMm } from './drawerRailSizing';
import { isDummyModuleId } from './dummyModule';

// 패널 정보 계산 함수 - 상부장/하부장 구분하여 표시
export const calculatePanelDetails = (
  moduleData: ModuleData,
  customWidth: number,
  customDepth: number,
  hasDoor: boolean = false,
  t: any = (key: string) => key,
  originalWidth?: number, // 도어용 원래 너비 (기둥 조정 전)
  hingePosition?: 'left' | 'right', // 힌지 위치
  hingeType?: 'A' | 'B', // 경첩 타입 (A: 45mm, B: 48mm)
  spaceHeight?: number, // 공간 높이 (mm) - 도어 높이 계산용
  doorTopGap?: number, // 천장에서 도어 상단까지 이격거리 (mm)
  doorBottomGap?: number, // 바닥에서 도어 하단까지 이격거리 (mm)
  baseHeight?: number, // 받침대 높이 (mm) - 브라켓 보링 Y오프셋 계산용
  backPanelThicknessMm?: number, // 백패널 두께 (mm, 기본값: 9)
  customConfig?: CustomFurnitureConfig, // 커스텀 가구 내부 구조
  hasLeftEndPanel?: boolean, // 좌측 엔드패널 여부
  hasRightEndPanel?: boolean, // 우측 엔드패널 여부
  endPanelThickness?: number, // 엔드패널 두께 (mm, 기본값: 18)
  freeHeight?: number, // 자유배치 모드 가구 높이 (mm) — 지정 시 섹션 비례 스케일링
  topFrameHeightMm?: number, // 상단몰딩 높이 (mm) — 0이면 프레임 없음
  baseFrameHeightMm?: number, // 걸래받이(받침대) 높이 (mm) — 0이면 받침대 없음
  hasTopFrame?: boolean, // 상단몰딩 표시 여부 (기본: true)
  hasBase?: boolean, // 걸래받이(받침대) 표시 여부 (기본: true)
  isDualSlot?: boolean, // 듀얼 슬롯 가구 여부 (커스텀 가구에서 moduleId에 'dual'이 없어도 듀얼 판단)
  leftEpAdjacentFurniture?: boolean, // 좌측 EP 방향에 인접 가구 있음 (ㄷ자 측판 생략)
  rightEpAdjacentFurniture?: boolean, // 우측 EP 방향에 인접 가구 있음 (ㄷ자 측판 생략)
  topPanelNotchSize?: '680x140' | '340x140', // 상판 따내기 크기
  topPanelNotchSide?: 'left' | 'right', // 따내기 위치 (기본: right)
  // 인조대리석 상판설치
  stoneTopThickness?: number, // 인조대리석 두께 (0=없음, 10/20/30mm)
  stoneTopFrontOffset?: number, // 앞 오프셋 (mm)
  stoneTopBackOffset?: number, // 뒤 오프셋 (mm)
  stoneTopLeftOffset?: number, // 좌 오프셋 (mm)
  stoneTopRightOffset?: number, // 우 오프셋 (mm)
  // 인조대리석 뒷턱
  stoneTopBackLipHeight?: number,
  stoneTopBackLipThickness?: number,
  stoneTopBackLipDepthOffset?: number,
  stoneTopBackLipTopOffset?: number,
  stoneTopBackLipTopBackOffset?: number,
  stoneTopBackLipFullFill?: boolean,
  stoneTopBackLipFillHeight?: number,
  endPanelTopOffsetMm?: number,
  endPanelBottomOffsetMm?: number,
  // 레그라박스 마이다 개별 사이즈 (mm) — di=0(아래) ~ di=N(위)
  // 있으면 fixed 마이다 값보다 우선. 없으면 모듈 기본값 사용.
  customMaidaHeights?: number[],
  customHingePositionsMm?: number[],
  customUpperDoorHingePositionsMm?: number[],
  customLowerDoorHingePositionsMm?: number[],
  customSectionsOverride?: SectionConfig[],
  doorOuterOpenSides?: DoorOuterOpenSides,
  splitDoorGaps?: {
    upperDoorTopGap?: number;
    upperDoorBottomGap?: number;
    lowerDoorTopGap?: number;
    lowerDoorBottomGap?: number;
  },
  lowerSectionTopOffsetMm: number = 0
) => {
  const panels: { upper: any[]; lower: any[]; door: any[]; frame: any[] } = {
    upper: [],     // 상부장 패널
    lower: [],     // 하부장 패널
    door: [],      // 도어 패널
    frame: []      // 프레임 패널 (상부/하부)
  };

  // === 키큰장찬넬(insert-frame) 전용 패널 처리 ===
  // 3D BoxModule.tsx Insert 분기와 동일: 전면 프레임(136×H×18) + 좌EP(18×H×40) + 우EP(18×H×40)
  // 재질: 상단몰딩/걸레받이와 동일 카테고리(frame). 사이즈는 공간 전체 높이 기준.
  // 함수 최종 반환은 배열이므로 동일 형식의 배열로 반환.
  if (moduleData.id.includes('insert-frame') || (moduleData?.modelConfig as any)?.isInsertFrame === true) {
    // 사용자 입력값(customWidth) 우선, 없으면 기본 136
    const insertOuterWidthMm = (typeof customWidth === 'number' && customWidth > 0)
      ? customWidth
      : (moduleData.dimensions.width || 136);
    const insertEpThicknessMm = 18;
    const insertEpDepthMm = 40; // 58 - 18
    const insertFrontFrameThicknessMm = 18;
    const insertHeightMm = (typeof spaceHeight === 'number' && spaceHeight > 0)
      ? spaceHeight
      : (moduleData.dimensions.height || 2400);

    // 3D BoxModule.tsx Insert 분기와 동일: 상단 프레임(공간 frameSize.top, 기본 30)과
    // 걸레받이(공간 baseConfig.height, 기본 65)가 옆 가구와 같은 라인에 함께 그려짐.
    // 옆 가구의 상단몰딩/걸레받이와 동일 카테고리(frame). 사이즈는 공간 전체 높이 기준.
    const insertTopFrameMm = (typeof topFrameHeightMm === 'number' && topFrameHeightMm > 0)
      ? topFrameHeightMm
      : 30;
    const insertBaseFrameMm = (typeof baseFrameHeightMm === 'number' && baseFrameHeightMm > 0)
      ? baseFrameHeightMm
      : 65;
    const hasInsertTopFrame = hasTopFrame !== false && insertTopFrameMm > 0;
    const hasInsertBaseFrame = hasBase !== false && insertBaseFrameMm > 0;
    // EP 본체 높이 = 전체 공간 높이 - 상단몰딩 - 걸레받이 (옆 가구 EP와 동일)
    const insertEpHeightMm = Math.max(
      0,
      insertHeightMm - (hasInsertTopFrame ? insertTopFrameMm : 0) - (hasInsertBaseFrame ? insertBaseFrameMm : 0),
    );

    const insertResult: any[] = [];
    insertResult.push({ name: '=== 키큰장찬넬 ===' });
    insertResult.push({
      name: '키큰장찬넬 전면프레임',
      width: insertOuterWidthMm,
      height: insertHeightMm,
      thickness: insertFrontFrameThicknessMm,
      material: 'PET',
      quantity: 1,
    });
    insertResult.push({
      name: '키큰장찬넬 좌EP',
      width: insertEpThicknessMm,
      height: insertEpHeightMm,
      thickness: insertEpDepthMm,
      material: 'PET',
      quantity: 1,
    });
    insertResult.push({
      name: '키큰장찬넬 우EP',
      width: insertEpThicknessMm,
      height: insertEpHeightMm,
      thickness: insertEpDepthMm,
      material: 'PET',
      quantity: 1,
    });
    // 상단몰딩 — 공간 frameSize.top 기준 (옆 가구 상단몰딩과 동일)
    if (hasInsertTopFrame) {
      insertResult.push({
        name: '상단몰딩',
        width: insertOuterWidthMm,
        height: insertTopFrameMm,
        thickness: insertFrontFrameThicknessMm,
        material: 'PET',
        quantity: 1,
      });
    }
    // 걸레받이 — 공간 baseConfig.height 기준 (옆 가구 걸레받이와 동일)
    if (hasInsertBaseFrame) {
      insertResult.push({
        name: '걸래받이',
        width: insertOuterWidthMm,
        height: insertBaseFrameMm,
        thickness: insertFrontFrameThicknessMm,
        material: 'PET',
        quantity: 1,
      });
    }
    return insertResult;
  }

  // 도어 없는 모듈 — 마이다(서랍 앞판)만 사용하는 모듈은 도어 강제 차단
  // 3D LowerCabinet.tsx L922의 도어 차단 목록과 동일
  const moduleId = moduleData.id;
  const isDummyModule = isDummyModuleId(moduleId);
  const isNoDoorModule =
    moduleId.includes('lower-drawer-') ||          // 서랍전용 (싱글/듀얼)
    moduleId.includes('lower-door-lift-2tier') ||   // 도어올림 2단
    moduleId.includes('lower-door-lift-3tier') ||   // 도어올림 3단
    moduleId.includes('lower-door-lift-touch-') ||  // 도어올림 터치
    moduleId.includes('lower-top-down-2tier') ||    // 상판내림 2단
    moduleId.includes('lower-top-down-3tier') ||    // 상판내림 3단
    moduleId.includes('lower-top-down-touch-') ||   // 상판내림 터치
    moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet');
  const effectiveHasDoor = isNoDoorModule ? false : hasDoor;

  // 도어는 커버도어이므로 원래 너비 사용, 없으면 customWidth 사용
  const doorWidth = originalWidth || customWidth;
  const doorPanelCutThickness = 18.5;
  const doorPanelCutMaterial = 'PET';
  
  // 실제 3D 렌더링과 동일한 두께 값들 (BaseFurnitureShell.tsx와 DrawerRenderer.tsx 참조)
  const basicThickness = moduleData.modelConfig?.basicThickness || 18;
  const rawBackPanelThickness = backPanelThicknessMm ?? 9;
  // 백패널/서랍 바닥판 MDF는 가구재 18.5T 선택과 무관하게 명목 두께(3/4.5/6/9T)를 유지한다.
  // 기존 저장 데이터에 남아 있을 수 있는 자동 +0.5T 값은 새 선택지로 정규화한다.
  const backPanelThickness = rawBackPanelThickness === 9.5
    ? 9
    : rawBackPanelThickness === 5 || rawBackPanelThickness === 5.5
      ? 6
    : rawBackPanelThickness === 3.5
      ? 3
      : rawBackPanelThickness;
  const drawerHandleThickness = basicThickness; // 마이다는 외부 노출 패널이므로 도어와 동일한 basicThickness
  const drawerSideThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : 15; // PB+PET 코팅 시 15.5mm
  const drawerBottomThickness = backPanelThickness; // 서랍 바닥판 - MDF 재질, 백패널과 동일
  const backPanelTopClearance = 1; // 백패널 상단 조립 공차 1mm
  const backReductionForPanelsMm = backPanelThickness + basicThickness - 1;
  
  // 선반 앞면 30mm 옵셋 (다보선반: 상부장·하부장 공통)
  const isUpperCabinet = moduleData.category === 'upper';
  const shelfFrontInsetMm = resolveShelfFrontInsetMm({
    moduleId: moduleData.id,
    cabinetCategory: moduleData.category,
    depthMm: customDepth
  });

  const originalHeight = moduleData.dimensions.height;
  const height = freeHeight || originalHeight;
  const topDownStretcherHeightMm = 55;
  const getTopDownStoneFrontHeightMm = (stoneThicknessMm: number) => {
    return getTopDownStoneFrontVisibleHeightMm(height, doorTopGap);
  };
  const heightRatio = freeHeight && originalHeight > 0 ? freeHeight / originalHeight : 1;
  // 내경 = 전체폭 - 실제 측판두께×2 (18.5mm면 18.5×2, 18mm면 18×2)
  const innerWidth = customWidth - (basicThickness * 2);
  const _innerHeight = height - (basicThickness * 2);
  const standardSidePanelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
  
  // 섹션 정보 가져오기
  // 듀얼 타입5,6 특별 처리 (leftSections/rightSections 구조)
  let sections;
  // 듀얼 타입5/6은 leftSections + rightSections 모두 처리
  const isStylerCabinet = moduleData.id.includes('dual-2drawer-styler');
  const isPantsHanger = moduleData.id.includes('dual-4drawer-pantshanger');
  const isType5or6 = isPantsHanger || isStylerCabinet;
  const stylerRightColumnWidth = isStylerCabinet
    ? Math.max(0, Math.min(
      moduleData.modelConfig?.rightAbsoluteWidth || (innerWidth - basicThickness) / 2,
      innerWidth - basicThickness
    ))
    : 0;
  const stylerLeftColumnWidth = isStylerCabinet
    ? Math.max(0, innerWidth - stylerRightColumnWidth - basicThickness)
    : 0;
  const rightSectionsForType5or6 = isType5or6 ? (moduleData.modelConfig?.rightSections || []) : [];
  if (isType5or6) {
    sections = moduleData.modelConfig?.leftSections || [];
  } else {
    // sections가 없으면 leftSections 폴백 (듀얼 상부장 등 leftSections/rightSections만 있는 가구)
    sections = moduleData.modelConfig?.sections || moduleData.modelConfig?.leftSections || [];
  }
  if (Array.isArray(customSectionsOverride) && customSectionsOverride.length > 0) {
    sections = customSectionsOverride;
  }
  
  // availableHeight는 mm 단위로 사용 (내경이 아닌 전체 높이 기준)
  const _availableHeightMm = height;
  
  
  // 전체 가구의 기본 구조는 일단 저장하지만 표시하지 않음
  // 나중에 필요시 사용할 수 있도록 보관
  
  // === 섹션별 패널 계산 ===
  if (sections && sections.length > 0) {
    const isKitchenNSectionFurniture =
      sections.length >= 2 && (
        moduleData.id.includes('pull-out-cabinet') ||
        moduleData.id.includes('pantry-cabinet') ||
        (moduleData.id.includes('fridge-cabinet') && !moduleData.id.includes('built-in-fridge'))
      );

    // 섹션 높이 계산 함수 (전체 높이 기준으로 계산)
    const calculateSectionHeight = (section) => {
      const heightType = section.heightType || 'percentage';

      if (heightType === 'absolute') {
        // 절대값인 경우 section.height를 그대로 사용
        return section.height || 0;
      } else {
        // 비율인 경우 (사용되지 않지만 호환성 유지)
        return height * ((section.height || section.heightRatio || 100) / 100);
      }
    };

    // 고정 높이 섹션들의 총 높이
    const fixedSections = sections.filter(s => s.heightType === 'absolute');
    const totalFixedHeight = fixedSections.reduce((sum, section) => {
      return sum + calculateSectionHeight(section);
    }, 0);

    // 중간 칸막이 두께 고려 (섹션 개수 - 1개의 칸막이)
    const dividerCount = sections.length > 1 ? (sections.length - 1) : 0;
    const _dividerThickness = dividerCount * basicThickness;

    // 나머지 높이 계산 (전체 - 고정높이)
    const remainingHeight = height - totalFixedHeight;

    // 각 섹션별 내부 구조 처리
    sections.forEach((section, sectionIndex) => {
      // 상부장/하부장 구분
      // 가구 타입에 따른 구분 로직
      let sectionName = '';
      let targetPanel = null;

      // 2단 옷장/선반장 (single-2hanging, dual-2hanging, single-2shelf, dual-2shelf, single-shelf, dual-shelf): 첫 번째 섹션이 하부장, 두 번째 섹션이 상부장
      if (moduleData.id.includes('single-2hanging') || moduleData.id.includes('dual-2hanging') ||
          moduleData.id.includes('single-2shelf') || moduleData.id.includes('dual-2shelf') ||
          moduleData.id.includes('single-shelf-') || moduleData.id.includes('dual-shelf-') ||
          moduleData.id.includes('entryway-h')) {
        if (sectionIndex === 0) {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 싱글 서랍+옷장/선반장 (single-2drawer-hanging, single-4drawer-hanging, single-2drawer-shelf, single-4drawer-shelf): drawer면 하부장, 나머지 상부장
      else if (moduleData.id.includes('single-2drawer-hanging') || moduleData.id.includes('single-4drawer-hanging') ||
               moduleData.id.includes('single-2drawer-shelf') || moduleData.id.includes('single-4drawer-shelf')) {
        if (section.type === 'drawer') {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 듀얼 서랍+옷장/선반장 타입 (dual-2drawer-hanging, dual-4drawer-hanging, dual-2drawer-shelf, dual-4drawer-shelf, dual-4drawer-pantshanger, dual-2drawer-styler)
      else if (moduleData.id.includes('dual-2drawer-hanging') ||
               moduleData.id.includes('dual-4drawer-hanging') ||
               moduleData.id.includes('dual-2drawer-shelf') ||
               moduleData.id.includes('dual-4drawer-shelf') ||
               moduleData.id.includes('dual-4drawer-pantshanger') ||
               moduleData.id.includes('dual-2drawer-styler')) {
        if (section.type === 'drawer') {
          sectionName = '하부장';
          targetPanel = panels.lower;
        } else {
          sectionName = '상부장';
          targetPanel = panels.upper;
        }
      }
      // 인출장/팬트리장/냉장고장: sections 배열은 아래→위 순서 (0=하부, 1=상부, 2=상부 추가)
      // 섹션 UI(PlacedModulePropertiesPanel)의 인덱스 규칙(sIdx===0이 '하부')과 일치
      else if (
        moduleData.id.includes('pull-out-cabinet') ||
        moduleData.id.includes('pantry-cabinet') ||
        moduleData.id.includes('fridge-cabinet') ||
        moduleData.id.includes('built-in-fridge')
      ) {
        const isLowerSection = sectionIndex === 0;
        sectionName = isLowerSection ? '하부장' : '상부장';
        targetPanel = isLowerSection ? panels.lower : panels.upper;
      }
      // 일반 서랍장 (상하부장 구분 없음)
      else if (section.type === 'drawer') {
        targetPanel = panels.lower;
        sectionName = '';
      }
      // 기타 (옷장 등)
      else {
        targetPanel = panels.upper;
        sectionName = '';
      }

      // 실제 섹션 높이 계산
      // - 다중 섹션: 첫 번째 섹션(하단)은 고정, 마지막 섹션(상단)이 높이 변화 흡수
      // - 단일 섹션: 전체 높이 사용
      let sectionHeightMm;
      if (section.heightType === 'absolute') {
        const usesExplicitSectionHeights = Array.isArray(customSectionsOverride)
          && customSectionsOverride.length === sections.length;
        if (usesExplicitSectionHeights) {
          sectionHeightMm = section.height || 0;
        } else if (sections.length >= 2) {
          // 다중 섹션: 마지막 섹션이 나머지 높이를 흡수
          const isLastSection = sectionIndex === sections.length - 1;
          if (isLastSection) {
            // 마지막 섹션: 전체 높이 - 이전 섹션들의 고정 높이
            const previousSectionsHeight = sections
              .filter((_, idx) => idx < sectionIndex)
              .reduce((sum, s) => sum + (s.height || 0), 0);
            sectionHeightMm = height - previousSectionsHeight;
          } else {
            // 이전 섹션들: 고정 높이 유지
            sectionHeightMm = section.height || 0;
          }
        } else {
          // 단일 섹션: 전체 높이 사용
          sectionHeightMm = height;
        }
      } else {
        // 비율 섹션은 남은 높이에서 계산
        const variableSections = sections.filter(s => s.heightType !== 'absolute');
        const totalPercentage = variableSections.reduce((sum, s) => sum + (s.height || s.heightRatio || 100), 0);
        const percentage = (section.height || section.heightRatio || 100) / totalPercentage;
        sectionHeightMm = remainingHeight * percentage;
      }

      // === 섹션별 측판 추가 (좌우 2개) ===
      // 측판은 섹션 높이만큼 만들어짐
      const sectionPrefix = sectionName === '상부장' ? '(상)' : sectionName === '하부장' ? '(하)' : '';

      // 상하 분리 측판 가구 여부 확인
      // (3D 렌더링 BaseFurnitureShell의 측판 분할 조건과 일치해야 패널목록과 3D가 매칭됨)
      const isSplitSidePanelFurniture =
        moduleData.id.includes('4drawer-hanging') ||
        moduleData.id.includes('2drawer-hanging') ||
        moduleData.id.includes('2hanging') ||
        moduleData.id.includes('entryway-h') ||
        moduleData.id.includes('4drawer-shelf') ||
        moduleData.id.includes('2drawer-shelf') ||
        moduleData.id.includes('2shelf') ||
        moduleData.id.includes('single-shelf-') ||
        moduleData.id.includes('dual-shelf-') ||
        moduleData.id.includes('4drawer-pantshanger') ||
        moduleData.id.includes('2drawer-styler') ||
        moduleData.id.includes('pull-out-cabinet') ||
        moduleData.id.includes('pantry-cabinet') ||
        moduleData.id.includes('fridge-cabinet');

      // 측판 높이는 섹션 높이 그대로 사용 (3D 렌더링의 getSectionHeights와 동일)
      const adjustedSectionHeight = sectionHeightMm;

      // Type5 스타일러장: 우측 절대깊이 (660mm), 좌측은 customDepth 그대로
      // 3D DualType5.tsx line 170-184와 동일한 로직
      const rightAbsoluteDepthForSide = moduleData.modelConfig?.rightAbsoluteDepth;
      let leftSideDepth = customDepth;
      let rightSideDepth = rightAbsoluteDepthForSide || customDepth;

      // 상판내림: 상판 두께별로 측판 상단 윗부분이 달라짐 → 원장 깊이 조정
      // 측판 윗부분 길이: 10mm→613, 20mm→600, 30mm→593
      // 측판 본체 길이: 항상 600 (customDepth)
      // 원장 깊이 = max(윗부분, 본체)
      // 상판내림: 측판 원장 깊이 (임시 — 10mm도 20mm와 동일하게 600, 30mm도 600)
      const isTopDownForSide = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');
      if (isTopDownForSide) {
        leftSideDepth = customDepth;
        rightSideDepth = customDepth;
      }

      // Type5 스타일러장(2drawer-styler): 3D에서 우측판은 분할 안됨 (전체 높이 통짜)
      // 좌측판만 섹션별로 분할. DualType5.tsx line 921-932 주석 참조
      // 다중 섹션이고 상하 분리 측판 가구인 경우만 섹션별로 추가
      // 그 외는 통짜로 첫 번째 섹션에만 추가
      if (sections.length >= 2 && isSplitSidePanelFurniture) {
        const sidePanelHeight = adjustedSectionHeight;
        const splitSidePanelNotches = moduleData.id.includes('shelf-split') && sectionIndex === 0
          ? [{ y: 80, z: 40, fromBottom: sidePanelHeight - 80 }]
          : undefined;
        // 냉장고장(반통/built-in 제외): 좌우 측판은 가구재 두께 −3mm (18→15, 18.5→15.5)
        // 3D BaseFurnitureShell line 644 와 동일한 분기
        const isFridgeCabinetSplitSide =
          moduleData.id.includes('fridge-cabinet') && !moduleData.id.includes('built-in-fridge');
        const splitSideThickness = isFridgeCabinetSplitSide
          ? Math.max(basicThickness - 3, 1)
          : basicThickness;
        // 상하 분리: 각 섹션마다 좌측판 추가
        const leftSplitSideEntry: any = {
          name: isKitchenNSectionFurniture ? `좌측판${sectionIndex + 1}` : `${sectionPrefix}좌측`,
          width: leftSideDepth,
          height: sidePanelHeight,
          thickness: splitSideThickness,
          material: 'PB'
        };
        if (splitSidePanelNotches) leftSplitSideEntry.sideNotches = splitSidePanelNotches;
        targetPanel.push(leftSplitSideEntry);

        if (isStylerCabinet) {
          // 스타일러장: 우측판은 첫 번째 섹션에서만 전체 높이 통짜로 추가
          if (sectionIndex === 0) {
            const rightStylerSideEntry: any = {
              name: '우측판',
              width: rightSideDepth,
              height: height,
              thickness: splitSideThickness,
              material: 'PB'
            };
            if (splitSidePanelNotches) rightStylerSideEntry.sideNotches = splitSidePanelNotches;
            targetPanel.push(rightStylerSideEntry);
          }
        } else {
          // 일반 분할 측판 가구: 우측판도 섹션별 분할
          const rightSplitSideEntry: any = {
            name: isKitchenNSectionFurniture ? `우측판${sectionIndex + 1}` : `${sectionPrefix}우측`,
            width: rightSideDepth,
            height: sidePanelHeight,
            thickness: splitSideThickness,
            material: 'PB'
          };
          if (splitSidePanelNotches) rightSplitSideEntry.sideNotches = splitSidePanelNotches;
          targetPanel.push(rightSplitSideEntry);
        }
      } else if (sectionIndex === 0) {
        // 통짜 측판: 첫 번째 섹션에 전체 높이로 추가
        // 하부장 측판 따내기(sideNotches) 계산 — 3D LowerCabinet.tsx L412~L431와 동일
        let sidePanelNotches: Array<{ y: number; z: number; fromBottom: number }> | undefined;
        const id = moduleData.id;
        if (id.includes('lower-')) {
          const notches: Array<{ y: number; z: number; fromBottom: number }> = [];
          // 상단 따내기 (60mm) — 상판이 없는 하부장 (drawer, half-cabinet, sink, induction)
          const hideTopPanel = id.includes('lower-half-cabinet') || id.includes('dual-lower-half-cabinet')
            || id.includes('lower-sink-cabinet') || id.includes('dual-lower-sink-cabinet')
            || id.includes('lower-induction-cabinet') || id.includes('dual-lower-induction-cabinet')
            || id.includes('lower-drawer-');
          // 도어올림/상판내림은 상단 따내기 없음 (상판내림 상단은 665에 포함)
          const noUpperNotch = id.includes('lower-door-lift-') || id.includes('lower-top-down-');
          if (hideTopPanel && !noUpperNotch) {
            notches.push({ y: 60, z: 40, fromBottom: height - 60 });
          }
          // 중간 따내기 (65mm) — 외부서랍 노치
          if (id.includes('lower-door-lift-touch-')) {
            // 도어올림 터치: 따내기 없음
          } else if (id.includes('lower-top-down-touch-')) {
            notches.push({ y: 65, z: 40, fromBottom: 665 });
          } else if (id.includes('lower-drawer-3tier')) {
            notches.push({ y: 65, z: 40, fromBottom: 295 }, { y: 65, z: 40, fromBottom: 510 });
          } else if (id.includes('lower-drawer-2tier')) {
            notches.push({ y: 65, z: 40, fromBottom: (moduleData.dimensions.height - 125) / 2 });
          } else if (id.includes('lower-door-lift-3tier')) {
            notches.push({ y: 65, z: 40, fromBottom: 315 }, { y: 65, z: 40, fromBottom: 545 });
          } else if (id.includes('lower-door-lift-2tier')) {
            notches.push({ y: 65, z: 40, fromBottom: 355 });
          } else if (id.includes('lower-top-down-3tier')) {
            notches.push({ y: 65, z: 40, fromBottom: 225 }, { y: 65, z: 40, fromBottom: 445 }, { y: 65, z: 40, fromBottom: 665 });
          } else if (id.includes('lower-top-down-2tier')) {
            resolveTopDown2TierGeometry(height, stoneTopThickness).notches.forEach(notch => {
              notches.push({ y: notch.height, z: 40, fromBottom: notch.fromBottom });
            });
          } else if (id.includes('lower-top-down-half') || id.includes('dual-lower-top-down-half')) {
            notches.push({ y: 65, z: 40, fromBottom: 665 });
          }
          if (notches.length > 0) sidePanelNotches = notches;
        }

        // 냉장고장(반통/built-in 제외): 좌우 측판은 가구재 두께 −3mm (18→15, 18.5→15.5)
        const isFridgeCabinetSidePanel = id.includes('fridge-cabinet') && !id.includes('built-in-fridge');
        const sideThickness = isFridgeCabinetSidePanel ? Math.max(basicThickness - 3, 1) : basicThickness;
        const leftSideEntry: any = {
          name: '좌측판',
          width: leftSideDepth,
          height: height,
          thickness: sideThickness,
          material: 'PB'
        };
        const rightSideEntry: any = {
          name: '우측판',
          width: rightSideDepth,
          height: height,
          thickness: sideThickness,
          material: 'PB'
        };
        if (sidePanelNotches) {
          leftSideEntry.sideNotches = sidePanelNotches;
          rightSideEntry.sideNotches = sidePanelNotches;
        }
        targetPanel.push(leftSideEntry);
        targetPanel.push(rightSideEntry);
      }

      // === Type5/6 중앙 칸막이 (좌측 섹션과 우측 섹션 사이) ===
      // 3D DualType5.tsx line 818-863와 동일: leftSections 개수만큼 섹션별 분할
      // 깊이 = Math.max(leftDepth, rightDepth) (스타일러장: 660mm, 바지걸이장: 650mm)
      //
      // 3D 로직 분석 (DualType5.tsx line 832-841):
      //   - 첫 섹션: finalBottom=-h/2, finalTop=originalTop → height = sectionHeights[0]
      //   - 마지막 섹션: finalBottom=originalBottom, finalTop=h/2 → height = h - sectionHeights[0]
      //   - 중간 섹션: height = sectionHeight (확장 없음)
      //   합계 = h (전체 가구 높이)
      //
      // sectionHeights[0] = leftSections[0].height (styler: 600, pantshanger: 1000)
      if (isType5or6) {
        // 바지걸이장(Type6): 상부섹션에는 칸막이 없음 (상부는 전체 너비 옷장)
        // 스타일러장(Type5): 모든 섹션에 칸막이 있음
        const isLastSection = sectionIndex === sections.length - 1;
        const skipMiddlePanel = isPantsHanger && isLastSection;

        if (!skipMiddlePanel) {
          const middlePanelDepth = Math.max(leftSideDepth, rightSideDepth) - backReductionForPanelsMm; // 백패널과 맞닿게 감소
          const isFirstSection = sectionIndex === 0;
          const leftLowerHeightMm = moduleData.modelConfig?.leftSections?.[0]?.height || 0;
          const furnitureHeightMm = moduleData.dimensions.height;

          let middlePanelHeightMm: number;
          if (isFirstSection) {
            middlePanelHeightMm = leftLowerHeightMm;
          } else if (isLastSection) {
            middlePanelHeightMm = furnitureHeightMm - leftLowerHeightMm;
          } else {
            middlePanelHeightMm = sectionHeightMm;
          }

          targetPanel.push({
            name: `${sectionPrefix}칸막이`,
            width: middlePanelDepth,
            height: middlePanelHeightMm,
            thickness: basicThickness,
            material: 'PB'
          });
        }
      }

      // === 수평 패널 너비 계산 (상판, 바닥판, 선반 공통) ===
      // 15mm/18mm: 좌우 측판과 각각 0.5mm 갭 → 총 1mm 감소
      // 15.5mm/18.5mm: 갭 없음 (0mm)
      const sidePanelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
      const horizontalPanelWidth = innerWidth - sidePanelGap;

      const lowerTopPanelFrontReduction = Math.max(0, lowerSectionTopOffsetMm || 0);
      const resolveLowerTopPanelDepth = () => {
        if (moduleData.id.includes('shelf-split')) {
          // 도어분절 현관장 하부상판은 3D의 목찬넬 뒤쪽 전대 뒷면부터 백패널 앞면까지의 부재다.
          // BoxModule shelf-split 렌더링 공식과 동일: D - 40 - t - (backT + t - 1)
          return Math.max(1, customDepth - 39 - basicThickness * 2 - backPanelThickness);
        }
        return customDepth - backReductionForPanelsMm - lowerTopPanelFrontReduction;
      };

      if (isKitchenNSectionFurniture) {
        const isFridgeNoBackLower = moduleData.id.includes('fridge-cabinet') && sectionIndex === 0;
        const lowerBackReduction = isFridgeNoBackLower ? basicThickness - 1 : backReductionForPanelsMm;

        // 3D BaseFurnitureShell은 N섹션 키큰장 수평재를 고정 이름으로 렌더링한다.
        if (sectionIndex === 0) {
          panels.lower.push({
            name: '(하)바닥',
            width: horizontalPanelWidth,
            depth: customDepth - lowerBackReduction,
            thickness: basicThickness,
            material: 'PB'
          });
        }
        if (sectionIndex < sections.length - 1) {
          panels.lower.push({
            name: '(하)상판',
            width: horizontalPanelWidth,
            depth: customDepth - lowerBackReduction - lowerTopPanelFrontReduction,
            thickness: basicThickness,
            material: 'PB'
          });
          panels.upper.push({
            name: '(상)바닥',
            width: horizontalPanelWidth,
            depth: customDepth - backReductionForPanelsMm,
            thickness: basicThickness,
            material: 'PB'
          });
        }
        if (sectionIndex === sections.length - 1) {
          panels.upper.push({
            name: '(상)상판',
            width: horizontalPanelWidth,
            depth: customDepth - backReductionForPanelsMm,
            thickness: basicThickness,
            material: 'PB'
          });
        }
      } else {
        // === 하판 (첫 번째 섹션만) - 뒤에서 26mm 줄임 ===
        if (sectionIndex === 0) {
          targetPanel.push({
            name: `${sectionPrefix}바닥`,
            width: horizontalPanelWidth,
            depth: customDepth - backReductionForPanelsMm, // 백패널과 맞닿게 감소
            thickness: basicThickness,
            material: 'PB'
          });
        }
        const isMultiSection = sections.length >= 2;
        if (isMultiSection && sectionIndex < sections.length - 1) {
          // 다중 섹션이고 마지막이 아니면: 하부섹션 상판
          targetPanel.push({
            name: `${sectionPrefix}상판`,
            width: horizontalPanelWidth,
            depth: sectionIndex === 0
              ? resolveLowerTopPanelDepth()
              : customDepth - backReductionForPanelsMm, // 백패널과 맞닿게 감소 + 하부상판 앞 옵셋/목찬넬 반영
            thickness: basicThickness,
            material: 'PB'
          });
        } else if (sectionIndex === sections.length - 1) {
          // 마지막 섹션
          if (isMultiSection) {
            // 다중 섹션: 상부섹션 바닥판
            targetPanel.push({
              name: `${sectionPrefix}바닥`,
              width: horizontalPanelWidth,
              depth: customDepth - backReductionForPanelsMm, // 백패널과 맞닿게 감소
              thickness: basicThickness,
              material: 'PB'
            });
          }
          // 상판 - 뒤에서 26mm 줄임 (상판이 없는 하부장은 제외)
          const noTopPanel = moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet')
            || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet')
            || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')
            || moduleData.id.includes('lower-drawer-');
          if (!noTopPanel) {
            const isTopDownForTop = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');
            const topDownFrontReductionMm = isTopDownForTop
              ? resolveTopDownTopPanelFrontReductionMm(basicThickness, stoneTopThickness)
              : 0;
            const topPanelEntry: any = {
              name: `${sectionPrefix}상판`,
              width: horizontalPanelWidth,
              depth: customDepth - backReductionForPanelsMm - topDownFrontReductionMm, // 3D 상판내림 상판 렌더링 깊이와 동일
              thickness: basicThickness,
              material: 'PB'
            };
            // 상판 따내기 정보 추가 (상부장만)
            if (topPanelNotchSize && moduleData.category === 'upper') {
              const [nw, nd] = topPanelNotchSize.split('x').map(Number);
              topPanelEntry.cornerNotch = {
                width: nw,
                depth: nd,
                side: topPanelNotchSide || 'right'
              };
            }
            targetPanel.push(topPanelEntry);
          }
        }
      }

      // === 백패널 (섹션별로 분리) ===
      // 백패널 계산:
      // - 가로: innerWidth - sidePanelGap + 14 (18T 계열은 좌우 0.5mm씩 보정 후 홈 안쪽으로 좌우 7mm씩 삽입)
      // - 세로: 섹션 내경높이 + 10 (섹션 내경높이에서 상하 5mm씩 확장)
      // 예: 가구 600×1000, 18/18.5T → 백패널 폭 577

      // 백패널 높이 계산
      // 기본: 섹션높이 - 상하판(36) + heightExtension(10) + 상하확장(26) = 섹션높이
      // 실제 제작 높이는 상단 조립 공차 1mm를 빼서 측판보다 1mm 짧게 한다.
      const heightExtension = 10; // backPanelConfig.heightExtension
      const totalHeightExtension = basicThickness * 2 - heightExtension;
      let backPanelHeight = sectionHeightMm - basicThickness * 2 + heightExtension + totalHeightExtension;

      // Type5/6 (4drawer-pantshanger, 2drawer-styler): 상/하부 섹션 경계에서 높이 분할
      const getBackPanelWidth = (baseWidth: number) => baseWidth - sidePanelGap + 14;
      let backPanelWidth = getBackPanelWidth(innerWidth);
      let backPanelNamePrefix = sectionPrefix;
      if (isType5or6) {
        // 바지걸이장은 전체 내경폭, 스타일러장은 좌측 컬럼 폭으로 산출한다.
        // 높이: 상/하부 섹션 경계에서 분할
        const leftLowerSectionHeightMm = moduleData.modelConfig?.leftSections?.[0]?.height || 0;
        const lowerBoundaryMm = basicThickness + leftLowerSectionHeightMm;
        const furnitureHeightMm = moduleData.dimensions.height;
        if (isStylerCabinet) {
          backPanelWidth = getBackPanelWidth(stylerLeftColumnWidth);
          backPanelNamePrefix = sectionPrefix ? `좌${sectionPrefix}` : '좌';
        }
        if (sectionIndex === 0) {
          backPanelHeight = lowerBoundaryMm;
        } else if (sectionIndex === 1) {
          backPanelHeight = furnitureHeightMm - lowerBoundaryMm;
        }
      }
      backPanelHeight = Math.max(0, backPanelHeight - backPanelTopClearance);

      // 백패널 보강대 (상단/하단) - 60mm 높이, PB 재질
      // 15mm/18mm: 양쪽 0.5mm씩 축소 (총 1mm), 15.5mm/18.5mm: 갭 없음
      // 하부장 모듈은 하단 보강대 생략 (상단만)
      const reinforcementHeight = 60; // mm
      const reinforcementDepth = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : 15; // PB+PET 코팅 시 15.5mm
      // 보강대 너비: 바지걸이장은 전체 내경폭, 스타일러장은 좌측 컬럼 폭 기준
      const reinforcementWidth = isStylerCabinet
        ? stylerLeftColumnWidth
        : innerWidth - sidePanelGap;
      const isLowerCabinetModule = moduleData.id.includes('lower-');
      const isGlassCabinetModule = moduleData.id.includes('glass-cabinet');
      const sectionHasBackPanel = (section as any).hasBackPanel !== false;
      if (isKitchenNSectionFurniture) {
        const sectionNumberPrefix = `(${sectionIndex + 1}단)`;
        if (sectionHasBackPanel) {
          targetPanel.push({
            name: `${sectionNumberPrefix}백패널`,
            width: backPanelWidth,
            height: backPanelHeight,
            thickness: backPanelThickness,
            material: 'MDF'
          });
          targetPanel.push({
            name: `${sectionNumberPrefix}보강대 1`,
            width: reinforcementWidth,
            height: reinforcementHeight,
            thickness: reinforcementDepth,
            material: 'PB'
          });
          targetPanel.push({
            name: `${sectionNumberPrefix}보강대 2`,
            width: reinforcementWidth,
            height: reinforcementHeight,
            thickness: reinforcementDepth,
            material: 'PB'
          });
        } else if (moduleData.id.includes('fridge-cabinet')) {
          for (let reinforcementIndex = 1; reinforcementIndex <= 3; reinforcementIndex += 1) {
            targetPanel.push({
              name: `${sectionNumberPrefix}보강대 ${reinforcementIndex}`,
              width: reinforcementWidth,
              height: reinforcementHeight,
              thickness: reinforcementDepth,
              material: 'PB'
            });
          }
        }
      } else {
        if (sectionHasBackPanel) {
          targetPanel.push({
            name: `${backPanelNamePrefix}백패널`,
            width: backPanelWidth, // 내경폭 + 홈 안쪽 좌우 7mm씩 삽입
            height: isGlassCabinetModule ? 510 : backPanelHeight, // 유리장은 서랍모듈 뒤 MDF 백패널만 CNC 대상
            thickness: backPanelThickness, // 9mm
            material: 'MDF'
          });
          if (!isLowerCabinetModule) {
            if (!isGlassCabinetModule) {
              targetPanel.push({
                name: isType5or6 ? `${sectionPrefix}보강대` : `${sectionPrefix}후면 보강대 1`,
                width: reinforcementWidth,
                height: reinforcementHeight,
                thickness: reinforcementDepth,
                material: 'PB'
              });
            }
          }
          if (!isGlassCabinetModule) {
            targetPanel.push({
              name: isType5or6 ? `${sectionPrefix}보강대` : `${sectionPrefix}후면 보강대 2`,
              width: reinforcementWidth,
              height: reinforcementHeight,
              thickness: reinforcementDepth,
              material: 'PB'
            });
          }
        } else if (moduleData.id.includes('built-in-fridge') && sectionIndex === 0) {
          ['상', '중', '하'].forEach((suffix) => {
            targetPanel.push({
              name: `(하)후면보강대${suffix}`,
              width: reinforcementWidth,
              height: reinforcementHeight,
              thickness: reinforcementDepth,
              material: 'PB'
            });
          });
        }
      }

      // 서랍 섹션 처리 (DrawerRenderer.tsx 참조)
      if (section.type === 'drawer' && section.count) {
        const drawerHeights = section.drawerHeights;

        // Type5/6 듀얼은 좌측 컬럼 내경폭을 사용 (3D DualType6.tsx와 동일)
        let drawerInnerWidth = innerWidth;
        if (isType5or6) {
          const rightAbsoluteWidth = moduleData.modelConfig?.rightAbsoluteWidth || 0;
          const originalTotalWidth = moduleData.dimensions.width;
          const rightRatio = rightAbsoluteWidth / (originalTotalWidth - 36);
          const rightWidth = innerWidth * rightRatio;
          drawerInnerWidth = innerWidth - rightWidth - basicThickness; // 좌측 컬럼 내경
        }

        for (let i = 0; i < section.count; i++) {
          const drawerNum = i + 1;

          // 개별 서랍 높이 (drawerHeights 배열에서 가져오거나 균등 분할)
          // drawer 섹션은 고정이므로 heightRatio 적용하지 않음
          let individualDrawerHeight;
          if (drawerHeights && drawerHeights[i]) {
            individualDrawerHeight = drawerHeights[i];
          } else {
            // 균등 분할 (전체 섹션 높이 - 칸막이 두께) / 서랍 개수
            individualDrawerHeight = Math.floor((sectionHeightMm - basicThickness * (section.count - 1)) / section.count);
          }

          // 서랍 본체 크기 계산 (DrawerRenderer.tsx 3D 렌더링과 완전 일치)
          // DrawerRenderer.renderDrawer() 호출: drawerWidth = 내경 - 좌우날개 100mm - 레일 공차 11mm
          // actualDrawerDepth = (D - bt) - 60mm, drawerBodyDepth = actualDrawerDepth - 15mm(손잡이판)
          const drawerWidth = drawerInnerWidth - 111; // 서랍 전체 폭 (Type5/6: 좌측컬럼 내경 기준)
          const drawerFrontBackWidth = drawerWidth - drawerSideThickness * 2; // 앞판/뒷판 폭 = 서랍 외경 - 좌우 측판
          const drawerBodyHeight = individualDrawerHeight - 30; // 상하 15mm씩 감소
          const drawerRailSizing = resolveDrawerRailSizingMm(customDepth, backPanelThickness, basicThickness);
          const drawerBodyDepth = drawerRailSizing.railSizeMm != null
            ? drawerRailSizing.drawerSideDepthMm
            : (customDepth - basicThickness) - 60 - drawerHandleThickness;
          const drawerFrontBackHeight = Math.max(0, drawerBodyHeight - 13 - drawerBottomThickness);

          const drawerMaidaWidth = drawerInnerWidth - 48; // 전면 개구부 기준 좌우 24mm 갭

          // 서랍 손잡이판 (마이다) - PB
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum}(마이다)`,
            width: drawerMaidaWidth,
            height: individualDrawerHeight,
            thickness: drawerHandleThickness,
            material: 'PB'
          });

          // 서랍 앞판/뒷판 바닥판 끼우는 홈 위치 계산
          // 홈 높이는 바닥판 두께보다 1mm 크게 가공한다.
          const drawerGroovePositionY = 12; // 측판 하단에서 12mm 위치에 홈 시작
          const drawerGrooveHeight = drawerBottomThickness + 1; // 홈 폭 = 바닥판 두께 + 1mm

          // 서랍 앞판 마이다 보링 위치 계산
          // X(너비) 방향: 좌측 50mm, 중앙, 우측 50mm (3개)
          // Y(높이) 방향: 상단 50mm, 하단 50mm (2개)
          const drawerFrontBoringEdgeX = 50; // 좌우 끝에서 50mm
          const drawerFrontBoringEdgeY = 50; // 상하 끝에서 50mm
          const drawerFrontBoringXPositions = [
            drawerFrontBoringEdgeX, // 좌측에서 50mm
            drawerFrontBackWidth / 2, // 중앙
            drawerFrontBackWidth - drawerFrontBoringEdgeX // 우측에서 50mm
          ];
          const drawerFrontBoringYPositions = [
            drawerFrontBoringEdgeY, // 하단에서 30mm
            drawerFrontBackHeight - drawerFrontBoringEdgeY // 상단에서 50mm
          ];

          // 서랍 앞판 (두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 앞판`,
            width: drawerFrontBackWidth,
            height: drawerFrontBackHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 7.5 // 홈 깊이 7.5mm
            }],
            // 마이다 보링 위치 (서랍 측판과 연결용)
            boringPositions: drawerFrontBoringYPositions, // Y위치 (height 기준): 상하 30mm
            boringDepthPositions: drawerFrontBoringXPositions // X위치 (width 기준): 좌 50mm, 중앙, 우 50mm
          });

          // 서랍 뒷판 (두께 15mm)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 뒷판`,
            width: drawerFrontBackWidth,
            height: drawerFrontBackHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 7.5 // 홈 깊이 7.5mm
            }]
          });

          // 서랍 측판 보링 위치: DrawerRenderer와 동일 기준.
          // 하단 보링 = 바닥판 윗면 + 20mm, 상단 보링 = 측판 상단 - 20mm, 중간은 양 끝의 중앙.
          const drawerEdgeOffsetY = 20;
          const drawerBottomTopY = basicThickness + 10 + drawerBottomThickness - drawerSideThickness;
          const drawerLowerBoringY = drawerBottomTopY + drawerEdgeOffsetY;
          const drawerUpperBoringY = drawerBodyHeight - drawerEdgeOffsetY;
          const drawerBoringYPositions = [
            drawerLowerBoringY,
            (drawerLowerBoringY + drawerUpperBoringY) / 2,
            drawerUpperBoringY
          ];
          // X위치: 앞판/뒷판 중간 2개 (width=깊이 기준)
          // DrawerRenderer: frontPanelZ = depth/2 - sideThickness/2 = 앞끝에서 sideThickness/2
          //                 backPanelZ = -depth/2 + sideThickness/2 = 뒤끝에서 sideThickness/2
          const drawerBoringXPositions = [
            drawerSideThickness / 2, // 앞쪽 끝에서 7.5mm
            drawerBodyDepth - drawerSideThickness / 2 // 뒤쪽 끝에서 7.5mm
          ];

          // 서랍 좌측판 (전체 깊이 사용, 두께 15mm)
          // 바닥판 홈 가공 + 앞판/뒷판 보링
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 좌측판`,
            width: drawerBodyDepth, // 전체 깊이 사용
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            boringPositions: drawerBoringYPositions, // Y위치 (height 기준)
            boringDepthPositions: drawerBoringXPositions, // X위치 (width 기준)
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 7.5 // 홈 깊이 7.5mm
            }]
          });

          // 서랍 우측판 (전체 깊이 사용, 두께 15mm)
          // 바닥판 홈 가공 + 앞판/뒷판 보링
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 우측판`,
            width: drawerBodyDepth, // 전체 깊이 사용
            height: drawerBodyHeight,
            thickness: drawerSideThickness, // 15mm
            material: 'PB',  // 서랍 본체는 PB 재질
            boringPositions: drawerBoringYPositions, // Y위치 (height 기준)
            boringDepthPositions: drawerBoringXPositions, // X위치 (width 기준)
            groovePositions: [{
              y: drawerGroovePositionY,
              height: drawerGrooveHeight,
              depth: 7.5 // 홈 깊이 7.5mm
            }]
          });

          // 서랍 바닥판 (DrawerRenderer의 Drawer Bottom)
          // 측판 홈 깊이 7.5mm에서 0.5mm 여유를 두고 좌우 각 7mm씩 끼움
          // L = 폭(좌우), W = 깊이(앞뒤)
          targetPanel.push({
            name: `${sectionPrefix}서랍${drawerNum} 바닥`,
            width: drawerWidth - drawerSideThickness * 2 + 14, // 폭(좌우) → L방향, 좌우 각 7mm 홈 끼움
            depth: Math.max(0, drawerBodyDepth - 1), // 깊이(앞뒤) → W방향, 앞쪽 1mm 공차
            thickness: drawerBottomThickness,
            material: 'MDF'
          });
        }

        // === 서랍속장 (날개벽) 패널 ===
        // DrawerRenderer.tsx 3D 렌더링과 동일한 치수
        // 구조: 좌/우 각각 수직패널(레일용) + 전면수평패널 + 후면수평패널 = 6개
        const bpt = backPanelThickness; // 백패널 두께 (기본 9mm)

        // 수직 패널 (레일 부착): 전면 수평패널 뒷면 ~ 후면 수평패널 앞면 사이
        // 3D: verticalPanelDepth = frontEdge - backEdge
        //   frontEdge = (depth/2 - 85 - 18/2) - 18/2 = depth/2 - 85 - 18 = depth/2 - 103
        //   backEdge = (-depth/2 + 18 + bpt + 18/2 - 1) + 18/2 = -depth/2 + 18 + bpt + 18 - 1 = -depth/2 + 35 + bpt
        //   depth = customDepth * 0.01 (Three.js) → mm: customDepth
        //   verticalPanelDepthMm = customDepth - 103 - 35 - bpt = customDepth - 138 - bpt
        const wingVerticalPanelDepthMm = customDepth - 138 - bpt;
        const wingVerticalPanelHeightMm = sectionHeightMm - basicThickness * 2; // 서랍 섹션 내경 높이 (상판/하판 제외)
        const wingVerticalPanelThickness = drawerSideThickness; // 서랍재 두께 (15mm, PET 시 15.5mm)

        // 좌측 수직 패널
        targetPanel.push({
          name: `${sectionPrefix}서랍속장(좌)`,
          width: wingVerticalPanelDepthMm, // Z축 깊이
          height: wingVerticalPanelHeightMm, // Y축 높이
          thickness: wingVerticalPanelThickness, // 18mm
          material: 'PB'
        });
        // 우측 수직 패널
        targetPanel.push({
          name: `${sectionPrefix}서랍속장(우)`,
          width: wingVerticalPanelDepthMm,
          height: wingVerticalPanelHeightMm,
          thickness: wingVerticalPanelThickness,
          material: 'PB'
        });

        // 수평 패널 (전면/후면): 앞 프레임 폭 50mm 고정
        const wingHorizontalPanelWidthMm = 50;
        const wingHorizontalPanelHeightMm = sectionHeightMm - basicThickness * 2; // 내경 높이
        const wingHorizontalPanelDepthMm = drawerSideThickness; // 서랍재 두께 (15mm, PET 시 15.5mm)

        // 좌측 후면 수평 패널
        targetPanel.push({
          name: `${sectionPrefix}서랍속장(좌) 후면`,
          width: wingHorizontalPanelWidthMm,
          height: wingHorizontalPanelHeightMm,
          thickness: wingHorizontalPanelDepthMm,
          material: 'PB'
        });
        // 우측 후면 수평 패널
        targetPanel.push({
          name: `${sectionPrefix}서랍속장(우) 후면`,
          width: wingHorizontalPanelWidthMm,
          height: wingHorizontalPanelHeightMm,
          thickness: wingHorizontalPanelDepthMm,
          material: 'PB'
        });
        // 좌측 전면 수평 패널
        targetPanel.push({
          name: `${sectionPrefix}서랍속장(좌) 전면`,
          width: wingHorizontalPanelWidthMm,
          height: wingHorizontalPanelHeightMm,
          thickness: wingHorizontalPanelDepthMm,
          material: 'PB'
        });
        // 우측 전면 수평 패널
        targetPanel.push({
          name: `${sectionPrefix}서랍속장(우) 전면`,
          width: wingHorizontalPanelWidthMm,
          height: wingHorizontalPanelHeightMm,
          thickness: wingHorizontalPanelDepthMm,
          material: 'PB'
        });
      } else if (section.type === 'hanging') {
        // 옷장 섹션 - 선반이 있으면 추가 (하나만)
        // 2단 옷장 하부장의 shelfPositions: [0]은 치수 표시용이므로 제외
        const is2HangingLower = (moduleData.id.includes('single-2hanging') || moduleData.id.includes('dual-2hanging') ||
                                moduleData.id.includes('single-2shelf') || moduleData.id.includes('dual-2shelf')) && sectionIndex === 0;
        if (section.shelfPositions && section.shelfPositions.length > 0 && !is2HangingLower) {
          targetPanel.push({
            name: `${sectionPrefix}선반 1`,
            width: horizontalPanelWidth, // 좌우 0.5mm씩 갭
            depth: customDepth - backReductionForPanelsMm - shelfFrontInsetMm, // 실제 선반 깊이 (상부장: 앞 30mm 옵셋)
            thickness: basicThickness,
            material: 'PB'
          });
        }
      } else if (section.type === 'shelf' && section.count && !isDirectLowerDowelShelfModule(moduleData.id)) {
        // 선반 구역 (ShelfRenderer.tsx 참조)
        for (let i = 1; i <= section.count; i++) {
          targetPanel.push({
            name: `${sectionPrefix}선반 ${i}`,
            width: horizontalPanelWidth, // 좌우 0.5mm씩 갭
            depth: customDepth - backReductionForPanelsMm - shelfFrontInsetMm, // 실제 선반 깊이 (상부장: 앞 30mm 옵셋)
            thickness: basicThickness,
            material: 'PB'  // 기본 재질
          });
        }
      } else if (section.type === 'open') {
        // 오픈 섹션 - 패널 없음 (빈 공간)
        // CNC 절단 목록에 추가할 항목 없음
      }
    });

    // 인출장 2단 전자렌지 인출 부재는 MicrowavePullOut에서 직접 렌더링되므로
    // 섹션 루프(open 타입)에서 누락되지 않도록 3D panelName과 같은 이름으로 추가한다.
    if (moduleData.id.includes('pull-out-cabinet')) {
      const microwaveWingThickness = 18;
      const microwaveWingHeight = 65;
      const microwaveFrontInset = 35;
      const microwaveFrontFrameThickness = 18;
      const microwaveFrontFrameHeight = 62;
      const microwaveSideGap = 2;
      const microwaveTrayThickness = 18;
      const microwaveTrayDepth = 450;
      const backPanelFrontOffset = backReductionForPanelsMm;
      const wingDepth = customDepth - microwaveFrontInset - backPanelFrontOffset;
      const wingInnerSpan = innerWidth - microwaveWingThickness * 2;
      const trayAndFrameWidth = wingInnerSpan - microwaveSideGap * 2;

      panels.upper.push(
        {
          name: '전자렌지 좌날개',
          width: wingDepth,
          height: microwaveWingHeight,
          thickness: microwaveWingThickness,
          material: 'PB'
        },
        {
          name: '전자렌지 우날개',
          width: wingDepth,
          height: microwaveWingHeight,
          thickness: microwaveWingThickness,
          material: 'PB'
        },
        {
          name: '전자렌지 전면프레임',
          width: trayAndFrameWidth,
          height: microwaveFrontFrameHeight,
          thickness: microwaveFrontFrameThickness,
          material: 'PB'
        },
        {
          name: '전자렌지 인출 트레이 바닥판',
          width: trayAndFrameWidth,
          depth: microwaveTrayDepth,
          thickness: microwaveTrayThickness,
          material: 'PB'
        }
      );
    }

    // LowerCabinet.tsx에서 직접 렌더링하는 하부장 다보선반.
    // 해당 모듈들은 modelConfig section count가 0이라 기존 섹션 루프에서는 패널목록에 누락된다.
    const hasDirectLowerDowelShelves = isDirectLowerDowelShelfModule(moduleData.id);
    if (hasDirectLowerDowelShelves) {
      const directShelfPositions = getDirectLowerDowelShelfPositionsMm({
        moduleId: moduleData.id,
        cabinetHeightMm: height,
        basicThicknessMm: basicThickness,
        sections: customSectionsOverride || moduleData.modelConfig?.sections,
      });
      const directShelfFrontInsetMm = resolveShelfFrontInsetMm({
        moduleId: moduleData.id,
        cabinetCategory: 'lower',
        depthMm: customDepth,
      });
      const backReductionMm = backReductionForPanelsMm;
      const shelfDepthMm = customDepth - backReductionMm - directShelfFrontInsetMm;
      directShelfPositions.forEach((_, index) => {
        const shelfName = `선반 ${index + 1}`;
        if (panels.lower.some(panel => panel.name === shelfName)) return;
        panels.lower.push({
          name: shelfName,
          width: innerWidth,
          depth: shelfDepthMm,
          thickness: 18,
          material: 'PB',
        });
      });
    }

    // === 현관장 H 전용: 서랍받침대 + 서랍속장(날개벽) + 속서랍 ===
    if (moduleData.id.includes('entryway-h')) {
      const backReduction = backReductionForPanelsMm;
      const lowerTopOffset = 85; // 하부 상판 앞쪽 오프셋
      const sidePanelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
      const horizontalPanelWidth = innerWidth - sidePanelGap;

      // 1. 서랍받침대 (하부 상판과 동일 크기)
      panels.lower.push({
        name: '서랍받침대',
        width: horizontalPanelWidth,
        depth: customDepth - backReduction - lowerTopOffset,
        thickness: basicThickness,
        material: 'PB'
      });

      // 2. 서랍속장(날개벽) — 수직 패널 좌/우
      const wingVertDepth = customDepth - lowerTopOffset - backReduction - 2 * basicThickness;
      ['좌', '우'].forEach(side => {
        panels.lower.push({
          name: `서랍속장(${side})`,
          width: wingVertDepth,
          depth: 188,
          thickness: drawerSideThickness, // 서랍재 두께 (15mm, PET 시 15.5mm)
          material: 'PB'
        });
      });

      // 3. 서랍속장(날개벽) — 수평 패널 전면/후면 × 좌/우
      const wingHorizWidth = 50; // 앞 프레임 폭 50mm 고정
      ['좌', '우'].forEach(side => {
        ['전면', '후면'].forEach(face => {
          panels.lower.push({
            name: `서랍속장(${side}) ${face}`,
            width: wingHorizWidth,
            depth: 188,
            thickness: drawerSideThickness, // 서랍재 두께 (15mm, PET 시 15.5mm)
            material: 'PB'
          });
        });
      });

      // 4. 속서랍 — 내경 - 좌우날개 100mm - 레일 공차 11mm
      const drawerAreaWidth = horizontalPanelWidth - 111;
      const drawerRailSizing = resolveDrawerRailSizingMm(customDepth, backPanelThickness, basicThickness, lowerTopOffset);
      const drawerSideDepth = drawerRailSizing.railSizeMm != null
        ? drawerRailSizing.drawerSideDepthMm
        : customDepth - lowerTopOffset - backReduction - 1.5 * basicThickness;
      const drawerInnerWidth = drawerAreaWidth - 2 * drawerSideThickness;
      const drawerBackH = 155 - 18 - backPanelThickness;
      const drawerGroovePositionY = 12;
      const drawerGrooveHeight = backPanelThickness + 1;
      const drawerSideGroove = [{ y: drawerGroovePositionY, height: drawerGrooveHeight, depth: 7.5 }];

      // 서랍 좌측판
      panels.lower.push({
        name: '서랍1 좌측판',
        width: Math.round(drawerSideDepth),
        depth: 155,
        thickness: drawerSideThickness,
        material: 'PB',
        groovePositions: drawerSideGroove
      });

      // 서랍 우측판
      panels.lower.push({
        name: '서랍1 우측판',
        width: Math.round(drawerSideDepth),
        depth: 155,
        thickness: drawerSideThickness,
        material: 'PB',
        groovePositions: drawerSideGroove
      });

      // 서랍 앞판
      panels.lower.push({
        name: '서랍1 앞판',
        width: Math.round(drawerInnerWidth),
        depth: Math.round(drawerBackH),
        thickness: drawerSideThickness,
        material: 'PB'
      });

      // 서랍 뒷판
      panels.lower.push({
        name: '서랍1 뒷판',
        width: Math.round(drawerInnerWidth),
        depth: Math.round(drawerBackH),
        thickness: drawerSideThickness,
        material: 'PB'
      });

      // 서랍 바닥판
      panels.lower.push({
        name: '서랍1 바닥',
        width: Math.round(drawerInnerWidth + 14),
        depth: Math.max(0, Math.round(drawerSideDepth) - 1),
        thickness: backPanelThickness,
        material: 'MDF'
      });

      // 서랍 마이다 (좌우 24mm 갭)
      panels.lower.push({
        name: '서랍1(마이다)',
        width: horizontalPanelWidth - 48,
        depth: 212,
        thickness: drawerSideThickness,
        material: 'PB'
      });
    }
  }

  // === 바지걸이장 안전선반 (전체 너비, 상부 섹션) ===
  if (isPantsHanger && moduleData.modelConfig?.hasSharedSafetyShelf) {
    const sidePanelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
    const shelfFrontInsetMm = resolveShelfFrontInsetMm({
      moduleId: moduleData.id,
      cabinetCategory: moduleData.category,
      explicitInsetMm: moduleData.modelConfig?.shelfFrontInsetMm
    });
    panels.upper.push({
      name: '(상)선반 1',
      width: innerWidth - sidePanelGap,
      depth: customDepth - backReductionForPanelsMm - shelfFrontInsetMm,
      thickness: basicThickness,
      material: 'PB'
    });
  }

  // === Type5/6 우측 섹션 패널 (rightSections) ===
  if (isType5or6 && rightSectionsForType5or6.length > 0) {
    // 우측 컬럼 내경폭 계산 (3D DualType6.tsx와 동일)
    const rightAbsoluteWidth = moduleData.modelConfig?.rightAbsoluteWidth || 0;
    const originalTotalWidth = moduleData.dimensions.width;
    const rightRatio = rightAbsoluteWidth / (originalTotalWidth - 36); // 36 = 양쪽 측판 두께
    const rightInnerWidth = innerWidth * rightRatio;
    const rightHorizontalPanelWidth = rightInnerWidth - 1; // 좌우 0.5mm 갭

    if (isStylerCabinet) {
      const reinforcementDepth = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : 15;
      panels.upper.push({
        name: '우백패널',
        width: stylerRightColumnWidth - standardSidePanelGap + 14,
        height,
        thickness: backPanelThickness,
        material: 'MDF'
      });
      panels.upper.push({
        name: '우보강대',
        width: stylerRightColumnWidth,
        height: 60,
        thickness: reinforcementDepth,
        material: 'PB'
      });
      panels.upper.push({
        name: '우보강대',
        width: stylerRightColumnWidth,
        height: 60,
        thickness: reinforcementDepth,
        material: 'PB'
      });
    }

    // 우측 섹션 높이 계산
    const rightFixedSections = rightSectionsForType5or6.filter(s => s.heightType === 'absolute');
    const rightTotalFixedHeight = rightFixedSections.reduce((sum, s) => sum + (s.height || 0), 0);
    const rightRemainingHeight = (height - basicThickness * 2) - rightTotalFixedHeight; // 내경 기준 (3D DualType6.tsx와 동일)

    rightSectionsForType5or6.forEach((section, sectionIndex) => {
      let rSectionHeight;
      if (section.heightType === 'absolute') {
        rSectionHeight = section.height || 0;
      } else {
        const variableSecs = rightSectionsForType5or6.filter(s => s.heightType !== 'absolute');
        const totalPct = variableSecs.reduce((sum, s) => sum + (s.height || s.heightRatio || 100), 0);
        const pct = (section.height || section.heightRatio || 100) / totalPct;
        rSectionHeight = rightRemainingHeight * pct;
      }

      const rSectionPrefix = rightSectionsForType5or6.length > 1
        ? (sectionIndex === 0 ? '우(하)' : '우(상)')
        : '우';

      // 우측 섹션 상부/하부 구분: 첫 번째 섹션이 하부, 나머지가 상부
      const rTargetPanel = (rightSectionsForType5or6.length > 1 && sectionIndex === 0)
        ? panels.lower
        : panels.upper;

      // 바지걸이장은 우측 백패널/보강대가 좌측과 통합되고, 스타일러장은 위에서 우측 통짜 패널을 별도 생성한다.

      // 우측 섹션별 내부 요소 (hanging → 선반)
      if (section.type === 'hanging') {
        if (section.shelfPositions && section.shelfPositions.length > 0) {
          rTargetPanel.push({
            name: `${rSectionPrefix}선반 1`,
            width: rightHorizontalPanelWidth,
            depth: customDepth - backReductionForPanelsMm - shelfFrontInsetMm,
            thickness: basicThickness,
            material: 'PB'
          });
        }
      } else if (section.type === 'shelf' && section.count) {
        for (let i = 1; i <= section.count; i++) {
          rTargetPanel.push({
            name: `${rSectionPrefix}선반 ${i}`,
            width: rightHorizontalPanelWidth,
            depth: customDepth - backReductionForPanelsMm - shelfFrontInsetMm,
            thickness: basicThickness,
            material: 'PB'
          });
        }
      }
    });
  }

  // === 도어 패널 (커버도어이므로 원래 너비 사용) ===
  // lower-drawer-* 는 서랍전용 모듈 — 도어 자체가 존재하지 않음
  // lower-induction-cabinet 은 마이다(서랍 앞판) 전용 — 도어 아닌 마이다로 별도 생성
  if (effectiveHasDoor) {
    const doorGap = 3; // DoorModule.tsx 3D 렌더링과 동일 (doorGap = 3)
    const doorLeafDimensions = resolveDoorLeafDimensions({
      moduleId: moduleData.id,
      cabinetCategory: moduleData.category,
      doorWidthMm: doorWidth,
      cabinetHeightMm: height,
      doorTopGapMm: doorTopGap,
      doorBottomGapMm: doorBottomGap,
      doorGapMm: doorGap,
      isDualSlot: isDualSlot || moduleData.id.includes('dual'),
      hingeSide: hingePosition ?? 'left'
    });
    const actualDoorH = doorLeafDimensions.leafHeightMm;
    const isDoorSplitPanelModule = moduleData.id.includes('pantry-cabinet-split') || moduleData.id.includes('shelf-split');
    let bracketHingeYPositions: number[] | null = null;
    const getShelfCollisionRangesFromBottom = () => {
      const targetSections = customSectionsOverride || sections;
      if (!Array.isArray(targetSections) || targetSections.length === 0) return [];
      const toShelfRange = (centerMm: number) => ({
        bottomMm: centerMm - basicThickness / 2,
        topMm: centerMm + basicThickness / 2,
      });

      const directLowerShelfPositions = getDirectLowerDowelShelfPositionsMm({
        moduleId: moduleData.id,
        cabinetHeightMm: height,
        basicThicknessMm: basicThickness,
        sections: targetSections,
      });
      if (directLowerShelfPositions.length > 0) {
        return directLowerShelfPositions.map(position => toShelfRange(basicThickness + position));
      }

      const availableHeightMm = height - basicThickness * 2;
      let currentYFromBottom = basicThickness;
      const shelfRanges: Array<{ bottomMm: number; topMm: number }> = [];

      targetSections.forEach(section => {
        const sectionHeightMm = section.heightType === 'absolute'
          ? section.height
          : availableHeightMm * ((section.height || 100) / 100);
        const hasShelfPositionList = Array.isArray(section.shelfPositions) && section.shelfPositions.length > 0;
        const shelfPositions = hasShelfPositionList
          ? section.shelfPositions!.filter(position => position > 0)
          : (section.type === 'shelf' && section.count && section.count > 0)
            ? Array.from({ length: section.count }, (_, index) => (
              sectionHeightMm / (section.count! + 1) * (index + 1)
            ))
            : [];

        shelfPositions.forEach(position => {
          shelfRanges.push(toShelfRange(currentYFromBottom + position));
        });
        currentYFromBottom += sectionHeightMm;
      });

      return shelfRanges;
    };
    const shelfRangesFromBottom = getShelfCollisionRangesFromBottom();
    const doorVerticalGeometry = resolveDoorVerticalGeometry({
      moduleId: moduleData.id,
      cabinetCategory: moduleData.category,
      doorWidthMm: doorWidth,
      cabinetHeightMm: height,
      doorTopGapMm: doorTopGap,
      doorBottomGapMm: doorBottomGap,
      doorGapMm: doorGap,
      isDualSlot: isDualSlot || moduleData.id.includes('dual'),
      hingeSide: hingePosition ?? 'left',
      cabinetBottomMm: 0,
    });
    const calculateFixedHingePositions = (doorH: number, hingeCount: number) => {
      const margin = DEFAULT_HINGE_SETTINGS.topBottomMargin;
      if (hingeCount <= 2) {
        return [margin, doorH - margin];
      }

      const spacing = (doorH - 2 * margin) / (hingeCount - 1);
      return Array.from({ length: hingeCount }, (_, index) => margin + spacing * index);
    };

    const resolveMatchedHingePositions = (
      doorBottomOnSideMm: number,
      doorH: number,
      customPositionsMm?: number[],
      fixedHingeCount?: number,
      defaultPositionsMm?: number[]
    ) => resolveSidePanelMatchedHingePositions({
      doorHeightMm: doorH,
      doorBottomOnSideMm,
      shelfCollisionRangesOnSideMm: shelfRangesFromBottom,
      customDoorPositionsMm: customPositionsMm,
      defaultDoorPositionsMm: defaultPositionsMm ?? (fixedHingeCount
        ? calculateFixedHingePositions(doorH, fixedHingeCount)
        : calculateHingePositions(doorH)),
      preserveEdgePositionsMm: true
    });

    // 도어 보링 데이터 생성 헬퍼

    const createDoorBoringData = (
      doorW: number,
      doorH: number,
      isLeftHinge: boolean,
      fixedHingeCount?: number,
      customPositionsMm?: number[],
      insideFaceHingeSide?: 'left' | 'right'
    ) => {
      if (isDummyModule) {
        return {
          boringPositions: [] as number[],
          boringDepthPositions: [] as number[],
          screwPositions: [] as number[],
          screwDepthPositions: [] as number[],
          screwHoleSpacing: undefined,
          hingeCount: 0,
          isLeftHinge,
        };
      }

      const hingePositions = normalizeDoorHingePositionsMm(
        customPositionsMm && customPositionsMm.length > 0
          ? customPositionsMm
          : fixedHingeCount
            ? calculateFixedHingePositions(doorH, fixedHingeCount)
            : calculateHingePositions(doorH),
        doorH
      );
      const resolvedInsideFaceHingeSide = insideFaceHingeSide ?? (isLeftHinge ? 'right' : 'left');
      // 옵티마이저/MPR은 도어 안쪽면 기준이다.
      // 우측 도어/우측 힌지 타공은 화면 왼쪽, 좌측 도어/좌측 힌지 타공은 화면 오른쪽에 온다.
      const cupX = resolvedInsideFaceHingeSide === 'left'
        ? DEFAULT_HINGE_SETTINGS.cupEdgeDistance
        : doorW - DEFAULT_HINGE_SETTINGS.cupEdgeDistance;
      // 나사홀은 안쪽면에서 힌지컵보다 도어 중심 방향으로 들어간다.
      const screwX = resolvedInsideFaceHingeSide === 'left'
        ? cupX + DEFAULT_HINGE_SETTINGS.screwRowDistance
        : cupX - DEFAULT_HINGE_SETTINGS.screwRowDistance;
      // 나사홀 Y 오프셋 (힌지컵 중심에서 상하)
      const screwHoleSpacing = hingeType === 'B' ? 48 : 45;
      const screwYOffset = screwHoleSpacing / 2; // A: 22.5mm, B: 24mm

      return {
        // boringPositions: 힌지컵 Y좌표 배열 (도어 하단 기준)
        boringPositions: hingePositions,
        // boringDepthPositions: 힌지컵 X좌표
        boringDepthPositions: [cupX],
        // 나사홀 정보
        screwPositions: hingePositions.flatMap(y => [y - screwYOffset, y + screwYOffset]),
        screwDepthPositions: [screwX],
        screwHoleSpacing,
        hingeCount: hingePositions.length,
        isLeftHinge,
      };
    };

    const pushDoorPanel = (
      name: string,
      widthMm: number,
      heightMm: number,
      isLeftHinge: boolean,
      fixedHingeCount?: number,
      customPositionsMm?: number[],
      insideFaceHingeSide?: 'left' | 'right'
    ) => {
      const doorBoring = createDoorBoringData(widthMm, heightMm, isLeftHinge, fixedHingeCount, customPositionsMm, insideFaceHingeSide);
      panels.door.push({
        name,
        width: widthMm,
        height: heightMm,
        thickness: 18.5,  // PET 재질 항상 18.5mm
        material: 'PET',
        boringPositions: doorBoring.boringPositions,
        boringDepthPositions: doorBoring.boringDepthPositions,
        screwPositions: doorBoring.screwPositions,
        screwDepthPositions: doorBoring.screwDepthPositions,
        screwHoleSpacing: doorBoring.screwHoleSpacing,
        hingeCount: doorBoring.hingeCount,
        isDoor: true,
        isLeftHinge,
      });
    };
    const getOuterAdjustedDoorWidth = (leaf: { name: 'single' | 'left' | 'right'; widthMm: number }) => {
      const leftCompensation = doorOuterOpenSides?.left ? 1.5 : 0;
      const rightCompensation = doorOuterOpenSides?.right ? 1.5 : 0;
      if (leaf.name === 'single') {
        return leaf.widthMm + leftCompensation + rightCompensation;
      }
      if (leaf.name === 'left') {
        return leaf.widthMm + leftCompensation;
      }
      if (leaf.name === 'right') {
        return leaf.widthMm + rightCompensation;
      }
      return leaf.widthMm;
    };

    if (isDoorSplitPanelModule) {
      const isPantryDoorSplitModule = moduleData.id.includes('pantry-cabinet-split');
      const defaultLowerSectionTopMm = isPantryDoorSplitModule ? 1825 : 860;
      const customLowerSectionTopMm = Array.isArray(customSectionsOverride) && customSectionsOverride[0]?.height > 0
        ? customSectionsOverride[0].height
        : undefined;
      const lowerSectionTopMm = customLowerSectionTopMm ?? defaultLowerSectionTopMm;
      const customUpperSectionHeightMm = Array.isArray(customSectionsOverride) && customSectionsOverride[1]?.height > 0
        ? customSectionsOverride[1].height
        : undefined;
      const upperSectionTopMm = customUpperSectionHeightMm !== undefined
        ? Math.min(height, lowerSectionTopMm + customUpperSectionHeightMm)
        : height;
      const defaultLowerDoorTopGapMm = isPantryDoorSplitModule ? -2 : -40;
      const defaultUpperDoorBottomGapMm = isPantryDoorSplitModule ? 1 : -20;
      const effectiveLowerDoorTopGapMm = typeof splitDoorGaps?.lowerDoorTopGap === 'number'
        ? (splitDoorGaps.lowerDoorTopGap === (isPantryDoorSplitModule ? 2 : 40) ? defaultLowerDoorTopGapMm : splitDoorGaps.lowerDoorTopGap)
        : defaultLowerDoorTopGapMm;
      const effectiveUpperDoorBottomGapMm = typeof splitDoorGaps?.upperDoorBottomGap === 'number'
        ? (splitDoorGaps.upperDoorBottomGap === 20 && !isPantryDoorSplitModule ? defaultUpperDoorBottomGapMm : splitDoorGaps.upperDoorBottomGap)
        : defaultUpperDoorBottomGapMm;
      const effectiveLowerDoorBottomGapMm = splitDoorGaps?.lowerDoorBottomGap ?? 0;
      const effectiveUpperDoorTopGapMm = splitDoorGaps?.upperDoorTopGap ?? doorTopGap ?? 0;
      const lowerDoorTopMm = lowerSectionTopMm + effectiveLowerDoorTopGapMm;
      const upperDoorBottomMm = lowerSectionTopMm + effectiveUpperDoorBottomGapMm;
      const lowerDoorBottomMm = effectiveLowerDoorBottomGapMm;
      const lowerDoorH = lowerDoorTopMm - lowerDoorBottomMm;
      const upperDoorH = upperSectionTopMm - effectiveUpperDoorTopGapMm - upperDoorBottomMm;

      bracketHingeYPositions = [];

      doorLeafDimensions.leaves.forEach((leaf) => {
        const isLeftHinge = leaf.hingeSide === 'left';
        const prefix = leaf.name === 'left'
          ? '좌측 '
          : leaf.name === 'right'
            ? '우측 '
            : '';

        const resolvedLower = resolveMatchedHingePositions(
          lowerDoorBottomMm,
          lowerDoorH,
          customLowerDoorHingePositionsMm,
          undefined,
          resolveSideAnchoredDoorHingePositionsMm({
            doorHeightMm: lowerDoorH,
            doorBottomOnSideMm: lowerDoorBottomMm,
            defaultDoorPositionsMm: calculateHingePositions(lowerDoorH),
            firstSidePositionMm: DEFAULT_HINGE_SETTINGS.topBottomMargin,
            lastSidePositionMm: lowerSectionTopMm - DEFAULT_HINGE_SETTINGS.topBottomMargin,
          })
        );
        const resolvedUpper = resolveMatchedHingePositions(
          upperDoorBottomMm,
          upperDoorH,
          customUpperDoorHingePositionsMm,
          undefined,
          resolveSideAnchoredDoorHingePositionsMm({
            doorHeightMm: upperDoorH,
            doorBottomOnSideMm: upperDoorBottomMm,
            defaultDoorPositionsMm: calculateHingePositions(upperDoorH),
            firstSidePositionMm: lowerSectionTopMm + DEFAULT_HINGE_SETTINGS.topBottomMargin,
            lastSidePositionMm: upperSectionTopMm - DEFAULT_HINGE_SETTINGS.topBottomMargin,
          })
        );
        bracketHingeYPositions?.push(
          ...resolvedLower.sidePositionsMm,
          ...resolvedUpper.sidePositionsMm
        );

        const adjustedLeafWidth = getOuterAdjustedDoorWidth(leaf);
        const insideFaceHingeSide = leaf.name === 'right'
          ? 'left'
          : leaf.name === 'left'
            ? 'right'
            : undefined;
        pushDoorPanel(`${prefix}하부 도어`, adjustedLeafWidth, lowerDoorH, isLeftHinge, undefined, resolvedLower.doorPositionsMm, insideFaceHingeSide);
        pushDoorPanel(`${prefix}상부 도어`, adjustedLeafWidth, upperDoorH, isLeftHinge, undefined, resolvedUpper.doorPositionsMm, insideFaceHingeSide);
      });

      bracketHingeYPositions = Array.from(new Set(bracketHingeYPositions)).sort((a, b) => a - b);
    } else {
      const doorLeaves = moduleData.id.includes('right-corner')
        ? doorLeafDimensions.leaves.filter((leaf) => leaf.name !== 'right')
        : doorLeafDimensions.leaves;

      const bracketSidePositions: number[] = [];
      doorLeaves.forEach((leaf) => {
        const isLeftHinge = leaf.hingeSide === 'left';
        const doorName = leaf.name === 'left'
          ? '좌측 도어'
          : leaf.name === 'right'
            ? '우측 도어'
            : '도어';
        const insideFaceHingeSide = leaf.name === 'right'
          ? 'left'
          : leaf.name === 'left'
            ? 'right'
            : undefined;
        const resolved = resolveMatchedHingePositions(
          doorVerticalGeometry.bottomMm,
          leaf.heightMm,
          customHingePositionsMm
        );
        bracketSidePositions.push(...resolved.sidePositionsMm);
        pushDoorPanel(doorName, getOuterAdjustedDoorWidth(leaf), leaf.heightMm, isLeftHinge, undefined, resolved.doorPositionsMm, insideFaceHingeSide);
      });
      bracketHingeYPositions = Array.from(new Set(bracketSidePositions)).sort((a, b) => a - b);
    }

    // === 측판에 힌지 브라켓 타공 데이터 주입 ===
    // 도어가 없는 모듈(서랍전용, 인덕션장 등)은 브라켓 보링 불필요
    if (effectiveHasDoor && !isDummyModule) {
    // 도어는 상부+하부 섹션 전체를 한장으로 덮는 구조
    // → 상부+하부 합산 높이를 한몸통으로 계산하여 타공점 결정
    // → 분리 측판이면 각 측판의 Y범위에 해당하는 타공점을 상대좌표로 변환
    // 브라켓 보링: 도어 힌지 Y위치를 측판 기준으로 변환
    // 도어 높이 = actualDoorH (위에서 이미 계산됨)
    const bracketYPositions = bracketHingeYPositions ?? resolveMatchedHingePositions(
      doorVerticalGeometry.bottomMm,
      actualDoorH,
      customHingePositionsMm
    ).sidePositionsMm;

    const allSidePanels = [...panels.upper, ...panels.lower];
    const isLeftSidePanel = (name: string) =>
      (name.includes('좌측') || name.includes('좌측판')) && !name.includes('서랍');
    const isRightSidePanel = (name: string) =>
      (name.includes('우측') || name.includes('우측판')) && !name.includes('서랍');

    // 분리 측판 가구 여부
    const isSplitSidePanelForBracket =
      moduleData.id.includes('4drawer-hanging') ||
      moduleData.id.includes('2drawer-hanging') ||
      moduleData.id.includes('2hanging') ||
      moduleData.id.includes('4drawer-shelf') ||
      moduleData.id.includes('2drawer-shelf') ||
      moduleData.id.includes('2shelf') ||
      moduleData.id.includes('single-shelf-') ||
      moduleData.id.includes('dual-shelf-') ||
      moduleData.id.includes('shelf-split') ||
      moduleData.id.includes('pantry-cabinet-split');

    // 하부 섹션 높이 계산 (분리 측판에서 Y좌표 변환용)
    let lowerSectionHeight = 0;
    const sectionsForBracket = customSectionsOverride || sections;
    if (isSplitSidePanelForBracket && sectionsForBracket.length >= 2) {
      const lowerSection = sectionsForBracket[0];
      if (lowerSection.heightType === 'absolute') {
        lowerSectionHeight = lowerSection.height || 0;
      } else {
        const variableSecs = sectionsForBracket.filter(s => s.heightType !== 'absolute');
        const totalPct = variableSecs.reduce((sum, s) => sum + (s.height || s.heightRatio || 100), 0);
        const pct = (lowerSection.height || lowerSection.heightRatio || 100) / totalPct;
        const fixedSecs = sectionsForBracket.filter(s => s.heightType === 'absolute');
        const totalFixed = fixedSecs.reduce((sum, s) => sum + (s.height || 0), 0);
        lowerSectionHeight = (height - totalFixed) * pct;
      }
    }

    // 측판에 브라켓 타공 주입
    // 좌측판/우측판에 따라 앞 가장자리 방향이 대칭
    // 우측판: 앞=X=width → bracketX = width - distance
    // 좌측판: 앞=X=0 → bracketX = distance
    const injectBracketBoring = (panel: any) => {
      const panelWidth = panel.width || customDepth;
      const bracketXFromFront = [20, 52]; // 앞 가장자리에서의 거리
      const isLeftPanel = panel.name.includes('좌측');
      const bracketXPositions = isLeftPanel
        ? bracketXFromFront // 좌측판: 앞=X=0, 그대로
        : bracketXFromFront.map(d => panelWidth - d); // 우측판: 앞=X=width, 뒤집기

      if (isSplitSidePanelForBracket && sectionsForBracket.length >= 2) {
        // 분리 측판: 전체 기준 Y좌표를 해당 섹션 범위로 필터링 후 상대좌표 변환
        const isLowerPanel = panel.name.includes('(하)');
        const isUpperPanel = panel.name.includes('(상)');

        if (isLowerPanel) {
          // 하부 측판: 0 ~ lowerSectionHeight 범위
          const filtered = bracketYPositions.filter(y => y < lowerSectionHeight);
          if (filtered.length > 0) {
            panel.bracketBoringPositions = filtered;
            panel.bracketBoringDepthPositions = bracketXPositions;
            panel.isBracketSide = true;
          }
        } else if (isUpperPanel) {
          // 상부 측판: lowerSectionHeight 이상 → 상대좌표로 변환
          const filtered = bracketYPositions
            .filter(y => y >= lowerSectionHeight)
            .map(y => y - lowerSectionHeight);
          if (filtered.length > 0) {
            panel.bracketBoringPositions = filtered;
            panel.bracketBoringDepthPositions = bracketXPositions;
            panel.isBracketSide = true;
          }
        }
      } else {
        // 통짜 측판: 전체 기준 Y좌표 그대로
        panel.bracketBoringPositions = bracketYPositions;
        panel.bracketBoringDepthPositions = bracketXPositions;
        panel.isBracketSide = true;
      }
    };

    if (isDualSlot || moduleData.id.includes('dual')) {
      allSidePanels.forEach((panel: any) => {
        if (isLeftSidePanel(panel.name) || isRightSidePanel(panel.name)) {
          injectBracketBoring(panel);
        }
      });
    } else {
      const isLeftHinge = (hingePosition ?? 'left') === 'left';
      allSidePanels.forEach((panel: any) => {
        if (isLeftHinge && isLeftSidePanel(panel.name)) {
          injectBracketBoring(panel);
        } else if (!isLeftHinge && isRightSidePanel(panel.name)) {
          injectBracketBoring(panel);
        }
      });
    }

    } // end hasDoor bracket boring

  } // end if (effectiveHasDoor) — 도어 패널 + 브라켓 보링 블록

  // === 커스텀 가구 내부 패널 (칸막이, 선반, 서랍) ===
  if (customConfig && customConfig.sections) {
    const basicThicknessCC = customConfig.panelThickness || basicThickness;
    const drawerHandleThicknessCC = (basicThicknessCC === 18.5 || basicThicknessCC === 15.5) ? 15.5 : 15; // PB+PET 코팅 시 15.5mm
    const drawerSideThicknessCC = (basicThicknessCC === 18.5 || basicThicknessCC === 15.5) ? 15.5 : 15; // PB+PET 코팅 시 15.5mm
    const drawerBottomThicknessCC = backPanelThickness; // MDF 재질, 백패널과 동일
    const backReductionForCustomPanelsMm = backPanelThickness + basicThicknessCC - 1;
    const targetPanel = panels.upper.length > 0 ? panels.upper : panels.lower;

    customConfig.sections.forEach((section, secIdx) => {
      const sectionPrefix = customConfig.sections.length > 1 ? `섹션${secIdx + 1} ` : '';
      const sectionInnerWidth = customWidth - (basicThicknessCC * 2);

      // 칸막이 (세로 칸막이) → 별도 패널
      if (section.hasPartition && section.partitionPosition) {
        targetPanel.push({
          name: `${sectionPrefix}칸막이`,
          width: customDepth - backReductionForCustomPanelsMm, // 백패널 여유
          height: section.height,
          thickness: basicThicknessCC,
          material: 'PB'
        });
      }

      // 요소 기반 패널 생성 헬퍼
      const processElements = (
        elements: Array<{ type: string; heights?: number[]; height?: number; hasRod?: boolean; withShelf?: boolean; drawerAlign?: 'top' | 'bottom' }> | undefined,
        areaPrefix: string,
        areaWidth: number
      ) => {
        if (!elements) return;
        const ccGap = (basicThicknessCC === 15.5 || basicThicknessCC === 18.5) ? 0 : 1;
        const horizontalW = areaWidth - ccGap; // 좌우 0.5mm 갭 (15.5/18.5mm는 갭 없음)

        for (const el of elements) {
          switch (el.type) {
            case 'shelf': {
              const shelfCount = el.heights?.length || 0;
              for (let i = 0; i < shelfCount; i++) {
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}선반 ${i + 1}`,
                  width: horizontalW,
                  depth: customDepth - backReductionForCustomPanelsMm,
                  thickness: basicThicknessCC,
                  material: 'PB'
                });
              }
              break;
            }
            case 'drawer': {
              const drawerCount = el.heights?.length || 0;
              for (let i = 0; i < drawerCount; i++) {
                const dh = el.heights?.[i] || 200;
                // 3D 렌더러와 동일한 공식 (DrawerRenderer.tsx 기준)
                const drawerWidth = areaWidth - 111; // 내경 - 좌우날개 100mm - 레일 공차 11mm
                const drawerFrontBackWidth = drawerWidth - drawerSideThicknessCC * 2; // 앞/뒷판 = 서랍 외경 - 좌우 측판
                const drawerBodyHeight = dh - 30;
                const drawerRailSizing = resolveDrawerRailSizingMm(customDepth, backPanelThickness, basicThicknessCC);
                const drawerBodyDepth = drawerRailSizing.railSizeMm != null
                  ? drawerRailSizing.drawerSideDepthMm
                  : (customDepth - basicThicknessCC) - 60 - drawerHandleThicknessCC;
                const drawerFrontBackHeight = Math.max(0, drawerBodyHeight - 13 - drawerBottomThicknessCC);

                const drawerMaidaWidth = areaWidth - 48; // 전면 개구부 기준 좌우 24mm 갭
                // 마이다 (손잡이판)는 서랍 박스 외경이 아니라 전면 개구부 기준
                // drawerAlign='top'인 경우 맨 아래 서랍 마이다에 +24(하단)+18(상단) 확장 (DrawerRenderer.tsx 동일)
                const isTopAlign = (el as any).drawerAlign === 'top';
                const isBottomDrawer = i === 0; // heights[0]이 맨 아래 서랍 (DrawerRenderer: index 0부터 아래→위 쌓음)
                const maidaBottomExt = (isTopAlign && isBottomDrawer) ? 24 : 0;
                const maidaTopExt = (isTopAlign && isBottomDrawer) ? 18 : 0;
                const maidaHeight = dh + maidaBottomExt + maidaTopExt;
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}서랍${i + 1}(마이다)`,
                  width: drawerMaidaWidth,
                  height: maidaHeight,
                  thickness: drawerHandleThicknessCC,
                  material: 'PB'
                });
                // 서랍 앞판
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}서랍${i + 1} 앞판`,
                  width: drawerFrontBackWidth,
                  height: drawerFrontBackHeight,
                  thickness: drawerSideThicknessCC,
                  material: 'PB'
                });
                // 서랍 뒷판
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}서랍${i + 1} 뒷판`,
                  width: drawerFrontBackWidth,
                  height: drawerFrontBackHeight,
                  thickness: drawerSideThicknessCC,
                  material: 'PB'
                });
                // 서랍 좌측판
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}서랍${i + 1} 좌측판`,
                  width: drawerBodyDepth,
                  height: drawerBodyHeight,
                  thickness: drawerSideThicknessCC,
                  material: 'PB'
                });
                // 서랍 우측판
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}서랍${i + 1} 우측판`,
                  width: drawerBodyDepth,
                  height: drawerBodyHeight,
                  thickness: drawerSideThicknessCC,
                  material: 'PB'
                });
                // 서랍 바닥판 - L = 폭(좌우), W = 깊이(앞뒤)
                // 측판 홈 깊이 7.5mm에서 0.5mm 여유를 두고 좌우 각 7mm씩 끼움
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}서랍${i + 1} 바닥`,
                  width: drawerWidth - drawerSideThicknessCC * 2 + 14, // 폭 → L방향, 좌우 각 7mm 홈 끼움
                  depth: Math.max(0, drawerBodyDepth - 1), // 깊이 → W방향, 앞쪽 1mm 공차
                  thickness: drawerBottomThicknessCC,
                  material: 'MDF'
                });
              }
              break;
            }
            case 'rod': {
              // 옷봉 + 고정선반
              if ((el as any).withShelf) {
                targetPanel.push({
                  name: `${sectionPrefix}${areaPrefix}옷봉 선반`,
                  width: horizontalW,
                  depth: customDepth - backReductionForCustomPanelsMm,
                  thickness: basicThicknessCC,
                  material: 'PB'
                });
              }
              break;
            }
            // open, pants: 패널 없음
          }
        }
      };

      // areaSubSplits 헬퍼: 영역별 상하 분할 처리
      const processAreaSubSplits = (areaKey: string, areaWidth: number) => {
        const split = section.areaSubSplits?.[areaKey];
        if (!split?.enabled) return;
        // 상/하 영역 요소
        processElements(split.upperElements, `${areaKey === 'full' ? '' : areaKey + ' '}상부 `, areaWidth);
        processElements(split.lowerElements, `${areaKey === 'full' ? '' : areaKey + ' '}하부 `, areaWidth);
      };

      // === 좌우 분할(horizontalSplit) / 칸막이 / 단일 영역 처리 ===
      if (section.horizontalSplit) {
        // 독립 박스 좌우 분할
        const hs = section.horizontalSplit;
        const leftWidth = hs.position;
        const is3Way = hs.secondPosition !== undefined;
        const numDividers = is3Way ? 2 : 1;

        // 분할판 패널: 각 분할 위치에 2개 (독립 박스: 좌박스 우측판 + 우박스 좌측판)
        for (let d = 0; d < numDividers; d++) {
          targetPanel.push({
            name: `${sectionPrefix}좌우 분할판 ${d + 1}A`,
            width: customDepth - backReductionForCustomPanelsMm,
            height: section.height,
            thickness: basicThicknessCC,
            material: 'PB'
          });
          targetPanel.push({
            name: `${sectionPrefix}좌우 분할판 ${d + 1}B`,
            width: customDepth - backReductionForCustomPanelsMm,
            height: section.height,
            thickness: basicThicknessCC,
            material: 'PB'
          });
        }

        // 각 서브박스의 요소 처리
        if (is3Way) {
          const centerWidth = hs.secondPosition!;
          const rightWidth = sectionInnerWidth - leftWidth - centerWidth - numDividers * 2 * basicThicknessCC;
          processElements(hs.leftElements, '좌 ', leftWidth);
          processElements(hs.centerElements, '중 ', centerWidth);
          processElements(hs.rightElements, '우 ', rightWidth);
          // areaSubSplits for each sub-area
          processAreaSubSplits('left', leftWidth);
          processAreaSubSplits('center', centerWidth);
          processAreaSubSplits('right', rightWidth);
        } else {
          const rightWidth = sectionInnerWidth - leftWidth - 2 * basicThicknessCC;
          processElements(hs.leftElements, '좌 ', leftWidth);
          processElements(hs.rightElements, '우 ', rightWidth);
          // areaSubSplits for each sub-area
          processAreaSubSplits('left', leftWidth);
          processAreaSubSplits('right', rightWidth);
        }
      } else if (section.hasPartition) {
        // 칸막이 (기존 로직)
        const partPos = section.partitionPosition || sectionInnerWidth / 2;
        const leftWidth = partPos;
        const rightWidth = sectionInnerWidth - partPos - basicThicknessCC;
        processElements(section.leftElements, `${sectionPrefix}좌 `, leftWidth);
        processElements(section.rightElements, `${sectionPrefix}우 `, rightWidth);
        // areaSubSplits for partition areas
        processAreaSubSplits('left', leftWidth);
        processAreaSubSplits('right', rightWidth);
      } else {
        // 단일 영역
        processElements(section.elements, '', sectionInnerWidth);
        // areaSubSplits for full area
        processAreaSubSplits('full', sectionInnerWidth);
      }
    });
  }

  // === 유리장 전용 서랍 모듈 목재 패널 ===
  // BaseFurnitureShell의 glass-cabinet 전용 렌더 분기와 panelName을 맞춘다.
  // 금속/유리 선반, 브론즈 프레임은 CNC 제외 대상이라 여기에는 넣지 않는다.
  if (moduleData.id.includes('glass-cabinet')) {
    const glassPanelsTarget = panels.upper.length > 0 ? panels.upper : panels.lower;
    const glassSidePanelThickness = 18;
    const glassDrawerModuleHeight = 500;
    const glassDrawerModuleDepth = 277;
    const glassDrawerModuleInnerWidth = innerWidth - glassSidePanelThickness * 2;
    const drawerModuleBottomDepth = glassDrawerModuleDepth - 18;

    glassPanelsTarget.push(
      {
        name: '서랍 좌측판',
        width: glassDrawerModuleDepth,
        height: glassDrawerModuleHeight,
        thickness: glassSidePanelThickness,
        material: 'PB'
      },
      {
        name: '서랍 우측판',
        width: glassDrawerModuleDepth,
        height: glassDrawerModuleHeight,
        thickness: glassSidePanelThickness,
        material: 'PB'
      },
      {
        name: '서랍 바닥판',
        width: glassDrawerModuleInnerWidth,
        depth: drawerModuleBottomDepth,
        thickness: glassSidePanelThickness,
        material: 'PB'
      }
    );

    const glassDrawerPanelThickness = drawerSideThickness;
    const glassDrawerBottomThickness = backPanelThickness;
    const glassDrawerOuterWidth = glassDrawerModuleInnerWidth - 11;
    const glassDrawerFrontBackWidth = glassDrawerOuterWidth - glassDrawerPanelThickness * 2;
    const glassDrawerBottomWidth = glassDrawerFrontBackWidth + 10;
    const glassDrawerBodyDepth = 250;
    const glassDrawerBottomDepth = glassDrawerBodyDepth - 10;
    const glassDrawerSideHeights = [126, 146];
    const glassMaidaWidth = glassDrawerModuleInnerWidth - 4;

    glassDrawerSideHeights.forEach((drawerSideHeight, index) => {
      const drawerNo = index + 1;
      const prefix = `유리장 서랍${drawerNo}`;
      const drawerBackHeight = drawerSideHeight - 10 - glassDrawerBottomThickness;

      glassPanelsTarget.push(
        {
          name: `${prefix} 좌측판`,
          width: glassDrawerBodyDepth,
          height: drawerSideHeight,
          thickness: glassDrawerPanelThickness,
          material: 'PB'
        },
        {
          name: `${prefix} 우측판`,
          width: glassDrawerBodyDepth,
          height: drawerSideHeight,
          thickness: glassDrawerPanelThickness,
          material: 'PB'
        },
        {
          name: `${prefix} 앞판`,
          width: glassDrawerFrontBackWidth,
          height: drawerSideHeight,
          thickness: glassDrawerPanelThickness,
          material: 'PB'
        },
        {
          name: `${prefix} 뒷판`,
          width: glassDrawerFrontBackWidth,
          height: drawerBackHeight,
          thickness: glassDrawerPanelThickness,
          material: 'PB'
        },
        {
          name: `${prefix} 바닥`,
          width: glassDrawerBottomWidth,
          depth: glassDrawerBottomDepth,
          thickness: glassDrawerBottomThickness,
          material: 'MDF'
        },
        {
          name: `${prefix} 마이다`,
          width: glassMaidaWidth,
          height: 240,
          thickness: basicThickness,
          material: 'PB'
        }
      );
    });

    const glassFrameWidth = glassDrawerModuleInnerWidth;
    const glassWoodChannelHeight = 60;
    const glassWoodChannelVerticalHeight = glassWoodChannelHeight - doorPanelCutThickness;
    const backPanelDepthOffset = basicThickness - 1;
    const rearAlignedPanelDepth = customDepth - 57 - backPanelThickness - basicThickness;
    const topRearInnerPanelDepth = drawerModuleBottomDepth - basicThickness;

    glassPanelsTarget.push(
      {
        name: '목찬넬프레임수평(1)',
        width: glassFrameWidth,
        depth: 40,
        thickness: doorPanelCutThickness,
        material: doorPanelCutMaterial
      },
      {
        name: '목찬넬프레임수직(1)',
        width: glassFrameWidth,
        height: glassWoodChannelVerticalHeight,
        thickness: doorPanelCutThickness,
        material: doorPanelCutMaterial
      },
      {
        name: '전대',
        width: glassFrameWidth,
        height: glassWoodChannelHeight,
        thickness: basicThickness,
        material: 'PB'
      },
      {
        name: '상단뒤프레임',
        width: glassFrameWidth,
        height: 36.5,
        thickness: basicThickness,
        material: 'PB'
      },
      {
        name: '상단뒤프레임 안쪽판재',
        width: glassFrameWidth,
        depth: Math.max(0, topRearInnerPanelDepth),
        thickness: basicThickness,
        material: 'PB'
      },
      {
        name: '상단뒤프레임 하단판재',
        width: glassFrameWidth,
        depth: Math.max(0, rearAlignedPanelDepth),
        thickness: basicThickness,
        material: 'PB'
      },
      {
        name: '서랍 바닥판2',
        width: glassDrawerModuleInnerWidth,
        depth: Math.max(0, customDepth - 58 - backPanelThickness - backPanelDepthOffset),
        thickness: glassSidePanelThickness,
        material: 'PB'
      }
    );
  }

  // 플랫 배열로 변환하여 반환
  const result: any[] = [];
  const isLowerCabinetModule = moduleData.id.includes('lower-');

  // 상부장 패널 (하부장 모듈이면 "몸통", 아니면 "상부 섹션")
  if (panels.upper.length > 0) {
    result.push({ name: isLowerCabinetModule ? '=== 몸통 ===' : `=== ${t('furniture.upperSection')} ===` });
    result.push(...panels.upper);
  }

  // 하부장 패널 (하부 섹션) — 하부장 모듈이면 몸통에 합산
  if (panels.lower.length > 0) {
    if (isLowerCabinetModule) {
      // 하부장: lower 패널도 몸통에 포함 (별도 헤더 없이 추가)
      result.push(...panels.lower);
    } else {
      result.push({ name: `=== ${t('furniture.lowerSection')} ===` });
      result.push(...panels.lower);
    }
  }

  // 도어 패널은 필요시 표시 (하부장은 외부서랍과 합쳐서 뒤에서 출력)
  if (!isLowerCabinetModule && panels.door.length > 0 && effectiveHasDoor) {
    result.push({ name: `=== ${t('furniture.door')} ===` });
    result.push(...panels.door);
  }

  // 엔드패널(EP) — 좌/우 독립
  const epT = 18.5; // EP(엔드패널)는 PET 재질 항상 18.5mm
  const epThicknessMm = endPanelThickness || 18; // 사용자 설정 EP 두께
  const isEpCFrame = epThicknessMm > 18; // >18mm이면 ㄷ자 프레임
  const epConnectorWidth = epThicknessMm - 18.5; // 전면/후면 연결판 폭 = EP두께 - 외판두께
  // 사용자가 명시한 값(0 포함, undefined가 아니면)을 우선 사용. undefined일 때만 default.
  const effectiveEndPanelTopOffsetMm = hasTopFrame === false
    ? 0
    : (endPanelTopOffsetMm !== undefined ? (endPanelTopOffsetMm as number) : (topFrameHeightMm ?? 0));
  const effectiveEndPanelBottomOffsetMm = hasBase === false
    ? 0
    : (endPanelBottomOffsetMm !== undefined ? (endPanelBottomOffsetMm as number) : (baseFrameHeightMm ?? 0));
  const endPanelHeight = height + effectiveEndPanelTopOffsetMm + effectiveEndPanelBottomOffsetMm;

  if (hasLeftEndPanel) {
    if (isEpCFrame) {
      // ㄷ자 프레임: 측판(인접가구 없을 때만) + 전면연결판 + 후면연결판
      if (!leftEpAdjacentFurniture) {
        result.push({
          name: 'EP(좌)측판',
          width: endPanelHeight,
          height: customDepth,
          thickness: epT,
          material: 'PET',
          quantity: 1,
        });
      }
      result.push({
        name: 'EP(좌)전면연결판',
        width: endPanelHeight,
        height: leftEpAdjacentFurniture ? epThicknessMm : epConnectorWidth,
        thickness: epT,
        material: 'PET',
        quantity: 1,
      });
      result.push({
        name: 'EP(좌)후면연결판',
        width: endPanelHeight,
        height: leftEpAdjacentFurniture ? epThicknessMm : epConnectorWidth,
        thickness: epT,
        material: 'PET',
        quantity: 1,
      });
    } else {
      result.push({
        name: '엔드패널(좌)',
        width: endPanelHeight,
        height: customDepth,
        thickness: epT,
        material: 'PET',
        quantity: 1,
      });
    }
  }
  if (hasRightEndPanel) {
    if (isEpCFrame) {
      if (!rightEpAdjacentFurniture) {
        result.push({
          name: 'EP(우)측판',
          width: endPanelHeight,
          height: customDepth,
          thickness: epT,
          material: 'PET',
          quantity: 1,
        });
      }
      result.push({
        name: 'EP(우)전면연결판',
        width: endPanelHeight,
        height: rightEpAdjacentFurniture ? epThicknessMm : epConnectorWidth,
        thickness: epT,
        material: 'PET',
        quantity: 1,
      });
      result.push({
        name: 'EP(우)후면연결판',
        width: endPanelHeight,
        height: rightEpAdjacentFurniture ? epThicknessMm : epConnectorWidth,
        thickness: epT,
        material: 'PET',
        quantity: 1,
      });
    } else {
      result.push({
        name: '엔드패널(우)',
        width: endPanelHeight,
        height: customDepth,
        thickness: epT,
        material: 'PET',
        quantity: 1,
      });
    }
  }

  // === 하부장 외부서랍 패널 (ExternalDrawerRenderer 기준) ===
  const extDrawerPanels: any[] = [];
  if (!moduleData.id.includes('lower-door-lift-touch-') && !moduleData.id.includes('lower-top-down-touch-') && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || (moduleData.id.includes('lower-top-down-') && !moduleData.id.includes('lower-top-down-half')))) {
    const is3TierExt = moduleData.id.includes('lower-drawer-3tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-top-down-3tier');
    const extDrawerCount = is3TierExt ? 3 : 2;
    // ExternalDrawerRenderer 기준 치수
    const extSideDepthMm = Math.min(customDepth - 50, 453); // 서랍 깊이 = 캐비넷깊이 - 50, 최대 453
    const sideGapMm = 6; // 좌우 갭
    const extInnerWidth = innerWidth - sideGapMm * 2 - drawerSideThickness * 2; // 서랍 내부 폭
    const extBottomWidthMm = extInnerWidth + 14; // 바닥판 폭: 좌우 각 7mm 홈 끼움

    // === 마이다 높이 계산 (ExternalDrawerRenderer + LowerCabinet.tsx 동일 로직) ===
    const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
    const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
    const isTopDown2Tier = moduleData.id.includes('lower-top-down-2tier');
    const isTopDown3Tier = moduleData.id.includes('lower-top-down-3tier');

    let notchFromBottoms: number[];
    let notchHeightsArr: number[];
    let hideTopNotch = false;
    let fixedMaidaHeights: number[] | undefined;

    if (is3TierExt) {
      if (moduleData.id.includes('lower-drawer-3tier')) {
        notchFromBottoms = [295, 510]; notchHeightsArr = [65, 65];
      } else if (isDoorLift3Tier) {
        notchFromBottoms = [315, 545]; notchHeightsArr = [65, 65];
        hideTopNotch = true; fixedMaidaHeights = [360, 210, 210];
      } else { // lower-top-down-3tier
        notchFromBottoms = [225, 445, 665]; notchHeightsArr = [65, 65, 65];
        hideTopNotch = true;
      }
    } else {
      if (isDoorLift2Tier) {
        notchFromBottoms = [355]; notchHeightsArr = [65];
        hideTopNotch = true; fixedMaidaHeights = [400, 400];
      } else if (isTopDown2Tier) {
        const topDown2TierGeometry = resolveTopDown2TierGeometry(height, stoneTopThickness);
        notchFromBottoms = topDown2TierGeometry.notches.map(notch => notch.fromBottom);
        notchHeightsArr = topDown2TierGeometry.notches.map(notch => notch.height);
        hideTopNotch = true;
      } else { // standard lower-drawer-2tier
        const bodyH = moduleData.dimensions.height || 785;
        notchFromBottoms = [(bodyH - 125) / 2]; notchHeightsArr = [65];
      }
    }

    // zone 계산 (ExternalDrawerRenderer 동일)
    const sidePanelHMm = height;
    const upperNotchH = 60;
    const sortedNotches = notchFromBottoms
      .map((fb, idx) => ({ fromBottom: fb, height: notchHeightsArr[idx] || 65 }))
      .sort((a, b) => a.fromBottom - b.fromBottom);
    const allNotches = hideTopNotch
      ? [...sortedNotches]
      : [...sortedNotches, { fromBottom: sidePanelHMm - upperNotchH, height: upperNotchH }];

    const extZones: { notchAboveBottom: number; notchBelowTop: number | null }[] = [];
    let zCursor = 0;
    for (let ni = 0; ni < allNotches.length; ni++) {
      const notch = allNotches[ni];
      if (notch.fromBottom > zCursor) {
        extZones.push({
          notchAboveBottom: notch.fromBottom,
          notchBelowTop: ni > 0 ? (allNotches[ni - 1].fromBottom + allNotches[ni - 1].height) : null,
        });
      }
      zCursor = notch.fromBottom + notch.height;
    }
    if (hideTopNotch && zCursor < sidePanelHMm && extZones.length < extDrawerCount) {
      const lastNotch = allNotches[allNotches.length - 1];
      extZones.push({
        notchAboveBottom: sidePanelHMm - basicThickness,
        notchBelowTop: lastNotch ? (lastNotch.fromBottom + lastNotch.height) : null,
      });
    }

    // 측판 높이: 1단 250mm, 2단이상 130mm (3단서랍), 2단서랍은 모두 250mm
    for (let di = 0; di < extDrawerCount; di++) {
      const extSideHMm = extDrawerCount >= 3 ? (di === 0 ? 250 : 130) : 250;
      const extBackHMm = extSideHMm - 15 - backPanelThickness; // 뒷판높이 = 측판 - 15 - 바닥판두께
      const drawerNum = di + 1;

      // 마이다 높이: fixedMaidaHeights 우선, 없으면 zone 기반 계산
      let maidaHeightMm: number;
      if (fixedMaidaHeights && fixedMaidaHeights[di]) {
        maidaHeightMm = fixedMaidaHeights[di];
      } else if (extZones[di]) {
        const zone = extZones[di];
        const maidaTopMm = zone.notchAboveBottom + 40;
        const maidaBottomMm = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
        maidaHeightMm = maidaTopMm - maidaBottomMm;
      } else {
        maidaHeightMm = 375; // 안전 기본값
      }

      // 외부서랍: 앞판 없음 (ExternalDrawerRenderer 주석: "서랍 앞판 없음" — 마이다가 앞면 덮음)
      // 서랍 측판 보링/홈 위치 (키큰장 서랍과 동일 로직)
      const extEdgeOffsetY = 20;
      const extGroovePositionY = 12; // 바닥판 홈: 측판 하단에서 12mm
      const extGrooveHeight = backPanelThickness + 1; // 홈 폭 = 바닥판 두께 + 1mm
      const extBottomTopY = 14 + backPanelThickness;
      const extLowerBoringY = extBottomTopY + extEdgeOffsetY;
      const extUpperBoringY = extSideHMm - extEdgeOffsetY;
      const extBoringYPositions = [
        extLowerBoringY,
        (extLowerBoringY + extUpperBoringY) / 2,
        extUpperBoringY
      ];
      const extBoringXPositions = [
        drawerSideThickness / 2,                    // 앞쪽 끝에서 7.5mm
        extSideDepthMm - drawerSideThickness / 2    // 뒤쪽 끝에서 7.5mm
      ];
      extDrawerPanels.push(
        { name: `서랍${drawerNum} 좌측판`, width: extSideDepthMm, height: extSideHMm, thickness: drawerSideThickness, material: 'PB',
          boringPositions: extBoringYPositions, boringDepthPositions: extBoringXPositions,
          groovePositions: [{ y: extGroovePositionY, height: extGrooveHeight, depth: 7.5 }] },
        { name: `서랍${drawerNum} 우측판`, width: extSideDepthMm, height: extSideHMm, thickness: drawerSideThickness, material: 'PB',
          boringPositions: extBoringYPositions, boringDepthPositions: extBoringXPositions,
          groovePositions: [{ y: extGroovePositionY, height: extGrooveHeight, depth: 7.5 }] },
        { name: `서랍${drawerNum} 뒷판`, width: Math.round(extInnerWidth), height: Math.round(extBackHMm), thickness: drawerSideThickness, material: 'PB',
          groovePositions: [{ y: extGroovePositionY, height: extGrooveHeight, depth: 7.5 }] },
        { name: `서랍${drawerNum} 바닥`, width: Math.round(extBottomWidthMm), depth: extSideDepthMm, thickness: backPanelThickness, material: 'MDF' },
      );
      // 마이다: 서랍 앞면을 덮는 판 — 도어 유무와 무관하게 외부서랍에는 항상 존재
      extDrawerPanels.push(
        { name: `서랍${drawerNum}(마이다)`, width: customWidth - 3, height: Math.round(maidaHeightMm), thickness: 18.5, material: 'PET' },
      );
    }
  }

  // === 터치 레그라박스 서랍 패널 (도어올림 터치 + 상판내림 터치) ===
  if (moduleData.id.includes('lower-door-lift-touch-') || moduleData.id.includes('lower-top-down-touch-')) {
    // 도어올림 터치
    const isTouch2A = moduleData.id.includes('lower-door-lift-touch-2tier-a');
    const isTouch2B = moduleData.id.includes('lower-door-lift-touch-2tier-b');
    const isTouch3 = moduleData.id.includes('lower-door-lift-touch-3tier');
    // 상판내림 터치
    const isTDTouch2 = moduleData.id.includes('lower-top-down-touch-2tier');
    const isTDTouch3 = moduleData.id.includes('lower-top-down-touch-3tier');
    // 서랍 본체 높이 (바닥판/뒷판 제작용)
    // 상판내림 터치 3단: 1·2·3단 모두 164로 통일 (1·2단을 3단과 동일하게)
    const drawerHeights = isTouch2A ? [228, 228]
      : isTouch2B ? [228, 164]
      : isTouch3 ? [228, 117, 117]
      : isTDTouch2 ? [228, 228]
      : isTDTouch3 ? [164, 164, 164]
      : [228, 228];
    // 마이다 비례 (2B는 2A와 동일하게 [228, 228])
    const maidaDrawerHeights = isTouch2A ? [228, 228]
      : isTouch2B ? [228, 228]
      : isTouch3 ? [228, 117, 117]
      : isTDTouch2 ? [228, 228]
      : isTDTouch3 ? [164, 164, 164]
      : [228, 228];
    const drawerThicknessMm = 15;
    const bottomSideGapMm = 17;
    const backSideGapMm = 18.5;
    const drawerBottomWidthMm = innerWidth - bottomSideGapMm * 2;
    const drawerBackWidthMm = innerWidth - backSideGapMm * 2;
    const drawerDepthMm = 490;

    // 마이다 높이 비례배분
    const topExtMm = 30;
    const bottomExtMm = 5;
    const totalFrontMm = height + topExtMm + bottomExtMm;
    const gapMm = 3;
    const totalGaps = (maidaDrawerHeights.length - 1) * gapMm;
    const totalMaidaMm = totalFrontMm - totalGaps;
    const totalMaidaDrawerH = maidaDrawerHeights.reduce((a: number, b: number) => a + b, 0);

    // 도어올림 터치 2단(2A/2B): 하→상 [408, 409] 고정
    // 도어올림 터치 3단: 하→상 [360, 227, 227] 고정
    // 상판내림 터치 2단: 하→상 [353, 354] 고정
    // 상판내림 터치 3단: 하→상 [284, 210, 210] 고정
    const isDoorLift2Fixed = drawerHeights.length === 2 && (isTouch2A || isTouch2B);
    const isDoorLift3Fixed = drawerHeights.length === 3 && isTouch3;
    const isTopDown2Fixed = drawerHeights.length === 2 && isTDTouch2;
    const isTopDown3Fixed = drawerHeights.length === 3 && isTDTouch3;
    const fixedMaidaDoorLift2 = [408, 409];
    const fixedMaidaDoorLift3 = [360, 227, 227];
    const fixedMaidaTopDown2 = [353, 354];
    const fixedMaidaTopDown3 = [185, 240, 240];

    // 사용자가 가구 편집 팝업에서 지정한 customMaidaHeights 우선 사용
    const cmh = (customMaidaHeights && customMaidaHeights.length === drawerHeights.length
      && customMaidaHeights.every(v => typeof v === 'number' && v > 0))
      ? customMaidaHeights
      : undefined;

    drawerHeights.forEach((dh, di) => {
      const drawerNum = di + 1;
      const backH = dh - drawerThicknessMm;
      let maidaH: number;
      if (cmh) {
        maidaH = cmh[di];
      } else if (isDoorLift2Fixed) {
        maidaH = fixedMaidaDoorLift2[di];
      } else if (isDoorLift3Fixed) {
        maidaH = fixedMaidaDoorLift3[di];
      } else if (isTopDown2Fixed) {
        maidaH = fixedMaidaTopDown2[di];
      } else if (isTopDown3Fixed) {
        maidaH = fixedMaidaTopDown3[di];
      } else {
        const maidaRef = maidaDrawerHeights[di] ?? dh;
        // 마이다 높이는 소수점 1자리 유지
        const maidaHRaw = (maidaRef / totalMaidaDrawerH) * totalMaidaMm;
        maidaH = Math.round(maidaHRaw * 10) / 10;
      }

      extDrawerPanels.push(
        { name: `터치서랍${drawerNum} 바닥판`, width: Math.round(drawerBottomWidthMm), depth: drawerDepthMm, thickness: drawerThicknessMm, material: 'PB' },
        { name: `터치서랍${drawerNum} 뒷판`, width: Math.round(drawerBackWidthMm), height: Math.round(backH), thickness: drawerThicknessMm, material: 'PB' },
        { name: `터치서랍${drawerNum}(마이다)`, width: customWidth - 3, height: maidaH, thickness: 18.5, material: 'PET' },
      );
    });
  }

  // === 인덕션장 레그라박스 서랍 패널 (바닥판 + 뒷판만, 측판은 기성품) ===
  if (moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet')) {
    const drawerThickness = (basicThickness === 18.5 || basicThickness === 15.5) ? 15.5 : 15;
    const bottomSideGap = 17; // 바닥판: 양쪽 17mm 갭
    const backSideGap = 18.5; // 뒷판: 양쪽 18.5mm 갭
    const drawerBottomWidth = customWidth - basicThickness * 2 - bottomSideGap * 2; // 내경 - 양쪽 17mm
    const drawerBackWidth = customWidth - basicThickness * 2 - backSideGap * 2; // 내경 - 양쪽 18.5mm
    const drawerDepth = 490; // 레그라박스 서랍 바닥판 깊이 고정
    // 반턱 따내기: 양쪽 하단 안쪽 38mm, 위로 7.5mm
    const rebateWidthMm = 38;
    const rebateHeightMm = 7.5;
    // 1단 서랍: 총 높이 228mm
    extDrawerPanels.push({
      name: '인덕션 1단서랍 바닥판',
      width: drawerBottomWidth,
      depth: drawerDepth,
      thickness: drawerThickness,
      material: 'PB',
      rebate: { width: rebateWidthMm, height: rebateHeightMm, position: 'bottom-both-sides' },
    });
    extDrawerPanels.push({
      name: '인덕션 1단서랍 뒷판',
      width: drawerBackWidth,
      height: 228 - drawerThickness, // 총높이 - 바닥판두께
      thickness: drawerThickness,
      material: 'PB',
    });
    // 2단 서랍: 총 높이 164mm
    extDrawerPanels.push({
      name: '인덕션 2단서랍 바닥판',
      width: drawerBottomWidth,
      depth: drawerDepth,
      thickness: drawerThickness,
      material: 'PB',
      rebate: { width: rebateWidthMm, height: rebateHeightMm, position: 'bottom-both-sides' },
    });
    extDrawerPanels.push({
      name: '인덕션 2단서랍 뒷판',
      width: drawerBackWidth,
      height: 164 - drawerThickness, // 총높이 - 바닥판두께
      thickness: drawerThickness,
      material: 'PB',
    });
    // 인덕션장 마이다 2개 (도어 대신) + doorTopGap/doorBottomGap 갭 확장 (3D와 동일)
    const maidaWidthMm = customWidth - 3; // 좌우 1.5mm씩 갭
    const inductionDefaultDTG = -20;
    const inductionDefaultDBG = 5;
    const inductionGapTopExt = (doorTopGap ?? inductionDefaultDTG) - inductionDefaultDTG;
    const inductionGapBottomExt = (doorBottomGap ?? inductionDefaultDBG) - inductionDefaultDBG;
    const inductionMaida2BottomMm = -5 + 340 + 3;
    const inductionMaida2TopMm = height - 20 + inductionGapTopExt;
    const inductionMaida2HeightMm = Math.max(0, inductionMaida2TopMm - inductionMaida2BottomMm);
    extDrawerPanels.push({
      name: '인덕션 1단서랍(마이다)',
      width: maidaWidthMm,
      height: 340 + inductionGapBottomExt,
      thickness: 18.5,
      material: 'PET',
    });
    extDrawerPanels.push({
      name: '인덕션 2단서랍(마이다)',
      width: maidaWidthMm,
      height: inductionMaida2HeightMm,
      thickness: 18.5,
      material: 'PET',
    });
  }

  // 하부장: 외부서랍 + 도어를 "서랍 및 도어"로 합산 출력
  if (isLowerCabinetModule && (extDrawerPanels.length > 0 || (panels.door.length > 0 && effectiveHasDoor))) {
    result.push({ name: '=== 서랍 및 도어 ===' });
    result.push(...extDrawerPanels);
    if (panels.door.length > 0 && effectiveHasDoor) {
      result.push(...panels.door);
    }
  } else if (extDrawerPanels.length > 0) {
    // 하부장이 아닌데 외부서랍이 있는 경우 (발생하지 않지만 안전장치)
    result.push(...extDrawerPanels);
  }

  // === L자 PET 프레임 (하부장 따내기 마감) ===
  if (!moduleData.id.includes('lower-door-lift-touch-') && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-top-down-') || moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet') || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet') || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet'))) {
    const is3Tier = moduleData.id.includes('lower-drawer-3tier');
    const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
    const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
    const isTopDown3Tier = moduleData.id.includes('lower-top-down-3tier');
    const isTopDown2Tier = moduleData.id.includes('lower-top-down-2tier');
    const isTopDownHalf = moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half');
    const isTopDownTouch = moduleData.id.includes('lower-top-down-touch-');
    const isHalfCabinet = moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet')
      || moduleData.id.includes('lower-sink-cabinet') || moduleData.id.includes('dual-lower-sink-cabinet')
      || moduleData.id.includes('lower-induction-cabinet') || moduleData.id.includes('dual-lower-induction-cabinet');
    // 보강대 따내기 (65mm)
    const lowerNotches: { fromBottom: number; height: number }[] = isHalfCabinet
      ? [] // 반통/한통/싱크장/인덕션장: 중간 따내기 없음, 상단만
      : is3Tier
      ? [{ fromBottom: 295, height: 65 }, { fromBottom: 510, height: 65 }]
      : isDoorLift3Tier
      ? [{ fromBottom: 315, height: 65 }, { fromBottom: 545, height: 65 }]
      : isDoorLift2Tier
      ? [{ fromBottom: 355, height: 65 }]
      : isTopDown3Tier
      ? [{ fromBottom: 225, height: 65 }, { fromBottom: 445, height: 65 }, { fromBottom: 665, height: 65 }]
      : isTopDown2Tier
      ? resolveTopDown2TierGeometry(height, stoneTopThickness).notches
      : isTopDownHalf || isTopDownTouch
      ? [{ fromBottom: 665, height: 65 }]
      : [{ fromBottom: ((moduleData.dimensions.height || 785) - 125) / 2, height: 65 }];
    // 상단 따내기 (60mm) - 도어올림/상판내림은 상단 따내기 없음 (상판내림은 665에 이미 포함)
    if (!isDoorLift2Tier && !isDoorLift3Tier && !isTopDown3Tier && !isTopDown2Tier && !isTopDownHalf && !isTopDownTouch) {
      lowerNotches.push({ fromBottom: height - 60, height: 60 });
    }

    lowerNotches.forEach((notch, ni) => {
      if (notch.height <= 0) return;
      const lFrameWidth = moduleData.id.includes('right-corner')
        ? customWidth / 2 + 58
        : customWidth;
      const lFrameVerticalWidth = moduleData.id.includes('right-corner')
        ? customWidth / 2 + 45
        : customWidth;
      // 수평판: 깊이 40mm
      panels.frame.push({
        name: `목찬넬프레임수평(${ni + 1})`,
        width: lFrameWidth,
        height: 40,
        thickness: 18.5,
        material: 'PET',
        quantity: 1,
      });
      // 수직판: 높이 = 따내기높이 - 수평판두께
      panels.frame.push({
        name: `목찬넬프레임수직(${ni + 1})`,
        width: lFrameVerticalWidth,
        height: notch.height - 18.5,
        thickness: 18.5,
        material: 'PET',
        quantity: 1,
      });
      // 가로전대: L자 프레임 뒤 보강판 — 3D BaseFurnitureShell 가로전대(하N)/가로전대
      const stretcherGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
      panels.frame.push({
        name: `가로전대(${ni + 1})`,
        width: innerWidth - stretcherGap, // 상판/바닥판과 동일 너비
        height: notch.height,        // 노치 높이 (65mm 또는 60mm)
        thickness: basicThickness,
        material: 'PB',
      });
    });
  }

  if (moduleData.id.includes('right-corner')) {
    const cornerFrameHeight = Math.max(0, height - 60 - basicThickness);
    const sideFrameHeight = Math.max(0, height - 60);
    panels.frame.push(
      {
        name: '우측코너장 세로프레임 좌',
        width: 58,
        height: cornerFrameHeight,
        thickness: basicThickness,
        material: 'PB',
      },
      {
        name: '우측코너장 세로프레임 우',
        width: 58,
        height: cornerFrameHeight,
        thickness: basicThickness,
        material: 'PB',
      },
      {
        name: '우측코너장 측면 쫄대프레임',
        width: 58,
        height: sideFrameHeight,
        thickness: basicThickness,
        material: 'PB',
      },
      {
        name: '우측코너장 우측측판 전면 쫄대프레임',
        width: 58,
        height: sideFrameHeight,
        thickness: basicThickness,
        material: 'PB',
      }
    );
  }

  // === 싱크장/인덕션장 전대 (상단 따내기 아래 150mm) ===
  const apronGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
  if (moduleId.includes('lower-sink-cabinet') || moduleId.includes('dual-lower-sink-cabinet') || moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet')) {
    const isInductionCabinet = moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet');
    panels.frame.push({
      name: '전대',
      width: innerWidth - apronGap, // 상판/바닥판과 동일 너비
      height: isInductionCabinet ? Math.max(0, height - 635) : 150,
      thickness: basicThickness,
      material: 'PB',
    });
  }

  // === 상판내림 전대 (topStretcher: 기본 55mm, 가구 높이 증감분 연동) — 3D BaseFurnitureShell ===
  if (moduleId.includes('lower-top-down-')) {
    // 10mm 상판: 외경 전대 (가구 전체 폭, 측판 앞면에 부착)
    // 20/30mm: 내경 전대 (측판 사이 끼움)
    const isOuterStretcher = stoneTopThickness === 10;
    panels.frame.push({
      name: '전대',
      width: isOuterStretcher ? customWidth : (innerWidth - apronGap),
      height: topDownStretcherHeightMm,
      thickness: basicThickness,
      material: 'PB',
    });
  }

  // === 도어분절 현관장 하부섹션 상단 목찬넬 ===
  // BoxModule.tsx의 shelf-split 전용 렌더링과 동일한 부재를 패널 목록에도 노출한다.
  if (moduleData.id.includes('shelf-split')) {
    const woodChannelHeight = 80;
    const woodChannelVerticalHeight = woodChannelHeight - doorPanelCutThickness;
    const channelGap = (basicThickness === 15.5 || basicThickness === 18.5) ? 0 : 1;
    panels.frame.push(
      {
        name: '목찬넬프레임수평(1)',
        width: customWidth,
        depth: 40,
        thickness: doorPanelCutThickness,
        material: doorPanelCutMaterial,
      },
      {
        name: '목찬넬프레임수직(1)',
        width: customWidth,
        height: woodChannelVerticalHeight,
        thickness: doorPanelCutThickness,
        material: doorPanelCutMaterial,
      },
      {
        name: '전대',
        width: innerWidth - channelGap,
        height: woodChannelHeight,
        thickness: basicThickness,
        material: 'PB',
      }
    );
  }

  // === 상부장 하부 마감판 (3D UpperCabinet.tsx L131-148과 동일) ===
  if (moduleData.category === 'upper') {
    panels.frame.push({
      name: '하부마감판',
      width: customWidth,
      depth: customDepth - 35,
      thickness: 18.5, // PET 재질 항상 18.5mm
      material: 'PET',
    });
  }

  // === 프레임 패널 (상단몰딩 / 걸래받이) ===
  const PET_THICKNESS = 18.5; // PET 재질 항상 18.5mm

  // 상단몰딩 — 하부장(lower-*)에는 없음. 상부장/키큰장은 실제 렌더링과 동일하게 포함
  if (!isLowerCabinetModule && hasTopFrame !== false && topFrameHeightMm && topFrameHeightMm > 0) {
    panels.frame.push({
      name: '상단몰딩',
      width: customWidth,
      height: topFrameHeightMm,
      thickness: PET_THICKNESS,
      material: 'PET',
    });
  }

  // 걸래받이 (받침대) — 상부장(upper)은 벽걸이라 걸래받이 없음
  if (!isUpperCabinet && hasBase !== false && baseFrameHeightMm && baseFrameHeightMm > 0) {
    panels.frame.push({
      name: '걸래받이',
      width: customWidth,
      height: baseFrameHeightMm,
      thickness: PET_THICKNESS,
      material: 'PET',
    });
  }

  // 프레임 패널 추가
  if (panels.frame.length > 0) {
    result.push({ name: '=== 프레임 ===' });
    result.push(...panels.frame);
  }

  // 인조대리석 상판 추가 (하부장 전용)
  const isLowerForStone = moduleData.id.includes('lower-') || moduleData.id.includes('dual-lower-') || moduleData.category === 'lower';
  if (stoneTopThickness && stoneTopThickness > 0 && isLowerForStone) {
    const isTopDownForStone = moduleData.id.includes('lower-top-down-') || moduleData.id.includes('dual-lower-top-down-');
    // 상판내림: 인조대리석 상판 깊이 = customDepth + 23 (두께 무관 623 고정)
    const effectiveFrontOffsetForStone = isTopDownForStone ? 23 : (stoneTopFrontOffset || 0);
    result.push({ name: '=== 인조대리석 ===' });
    // 수평 상판 (모든 하부장 공통)
    result.push({
      name: '인조대리석 상판',
      width: customWidth + (stoneTopLeftOffset || 0) + (stoneTopRightOffset || 0),
      depth: customDepth + effectiveFrontOffsetForStone + (stoneTopBackOffset || 0),
      thickness: stoneTopThickness,
      material: '인조대리석',
    });
    // 상판내림 전용: 수직 앞판 (45도 연귀 접합)
    // 높이: 상단 마이다 상단과 앞판 하단 사이 20mm 유지 + 45도 연귀 겹침
    if (isTopDownForStone) {
      const frontPlateHeight = getTopDownStoneFrontHeightMm(stoneTopThickness);
      result.push({
        name: '인조대리석 앞판',
        width: customWidth + (stoneTopLeftOffset || 0) + (stoneTopRightOffset || 0),
        height: frontPlateHeight, // height = 깊이/높이 방향 (W방향)
        thickness: stoneTopThickness,
        material: '인조대리석',
      });
    }

    // 인조대리석 뒷턱 옵션이 있는 경우 뒷턱 패널들 추가
    const backLipT = stoneTopBackLipThickness || 12; // 뒷턱 두께 기본값
    if (stoneTopBackLipHeight && stoneTopBackLipHeight > 0) {
      const topWidth = customWidth + (stoneTopLeftOffset || 0) + (stoneTopRightOffset || 0);
      
      if (stoneTopBackLipDepthOffset && stoneTopBackLipDepthOffset > 0) {
        // 옵셋이 있는 경우 3분할 렌더링 (전면, 상단 덮개판, 다채움 시 미드웨이)
        // 1. 전면 수직 젠다이 (높이 = backLipHeight - backLipThickness)
        result.push({
          name: '인조대리석 뒷턱 전면부',
          width: topWidth,
          height: stoneTopBackLipHeight - backLipT, // 수직 높이
          thickness: backLipT,
          material: '인조대리석',
        });
        
        // 2. 상단 덮개판 (수평판) - 깊이 = 돌출오프셋 + 두께 + 돌출보정
        const coverDepth = stoneTopBackLipDepthOffset + backLipT + (stoneTopBackLipTopOffset || 0) + (stoneTopBackLipTopBackOffset || 0);
        result.push({
          name: '인조대리석 뒷턱 상단부',
          width: topWidth,
          depth: coverDepth, // 깊이
          thickness: backLipT,
          material: '인조대리석',
        });

        // 3. 다채움 옵션 시 미드웨이 패널
        if (stoneTopBackLipFullFill && stoneTopBackLipFillHeight && stoneTopBackLipFillHeight > 0) {
          result.push({
            name: '인조대리석 벽체 미드웨이',
            width: topWidth,
            height: stoneTopBackLipFillHeight, // 수직 높이
            thickness: backLipT,
            material: '인조대리석',
          });
        }
      } else {
        // 옵셋 없는 기본 형태 (단일 뒷턱)
        // 다채움 옵션인 경우 미드웨이 전체 높이로 한 판을 출력
        const finalBackLipHeight = (stoneTopBackLipFullFill && stoneTopBackLipFillHeight && stoneTopBackLipFillHeight > 0) 
            ? stoneTopBackLipFillHeight 
            : stoneTopBackLipHeight;
            
        result.push({
          name: '인조대리석 뒷턱',
          width: topWidth,
          height: finalBackLipHeight,
          thickness: backLipT,
          material: '인조대리석',
        });
      }
    }
  }

  return result;
};

// === 서라운드 패널 목록 생성 (공간 전체 단위) ===
const SURROUND_SIDE_DEPTH = 40; // L자형 측면 패널 깊이 (mm)
export const calculateSurroundPanels = (
  freeSurround: FreeSurroundConfig | undefined,
  surroundHeightMm: number, // 서라운드 높이 (mm) = 공간높이 - 바닥마감재 - 띄움높이
  _panelThicknessMm?: number // deprecated: PET는 항상 18.5mm
): any[] => {
  const SURROUND_PANEL_THICKNESS = 18.5; // 서라운드(PET 재질) 항상 18.5mm
  if (!freeSurround) return [];

  const result: any[] = [];

  // 좌측 서라운드
  if (freeSurround.left?.enabled && freeSurround.left.method !== 'none') {
    const method = freeSurround.left.method || 'lshape';
    const gapMm = freeSurround.left.gap || 0;
    const panelHeightMm = Math.max(0, surroundHeightMm - (freeSurround.left.topGap || 0) - (freeSurround.left.bottomGap || 0));

    if (method === 'lshape' && gapMm > 0) {
      // L자형: 측면판 + 전면판
      result.push({
        name: '좌측 서라운드 측면판',
        width: SURROUND_SIDE_DEPTH,
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
      result.push({
        name: '좌측 서라운드 전면판',
        width: Math.max(0, gapMm - 3), // 양쪽 1.5mm씩 이격
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
    } else if (method === 'ep') {
      // 엔드패널형: 단일 패널
      result.push({
        name: '좌측 서라운드',
        width: SURROUND_PANEL_THICKNESS,
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
    }
  }

  // 우측 서라운드
  if (freeSurround.right?.enabled && freeSurround.right.method !== 'none') {
    const method = freeSurround.right.method || 'lshape';
    const gapMm = freeSurround.right.gap || 0;
    const panelHeightMm = Math.max(0, surroundHeightMm - (freeSurround.right.topGap || 0) - (freeSurround.right.bottomGap || 0));

    if (method === 'lshape' && gapMm > 0) {
      result.push({
        name: '우측 서라운드 측면판',
        width: SURROUND_SIDE_DEPTH,
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
      result.push({
        name: '우측 서라운드 전면판',
        width: Math.max(0, gapMm - 3), // 양쪽 1.5mm씩 이격
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
    } else if (method === 'ep') {
      result.push({
        name: '우측 서라운드',
        width: SURROUND_PANEL_THICKNESS,
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
    }
  }

  // 중간 서라운드 (가구 사이 gap)
  if (freeSurround.middle && freeSurround.middle.length > 0) {
    freeSurround.middle.forEach((midCfg, idx) => {
      if (!midCfg.enabled || midCfg.method === 'none') return;
      const gapMm = midCfg.gap || 0;
      if (gapMm <= 0) return;

      const label = freeSurround.middle!.length > 1 ? `중간${idx + 1}` : '중간';
      const panelHeightMm = Math.max(0, surroundHeightMm - (midCfg.topGap || 0) - (midCfg.bottomGap || 0));

      // 좌측 측면판
      result.push({
        name: `${label} 서라운드 좌측면판`,
        width: SURROUND_SIDE_DEPTH,
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
      // 우측 측면판
      result.push({
        name: `${label} 서라운드 우측면판`,
        width: SURROUND_SIDE_DEPTH,
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
      // 전면판
      result.push({
        name: `${label} 서라운드 전면판`,
        width: Math.max(0, gapMm - 3), // 양쪽 1.5mm씩 이격
        height: panelHeightMm,
        thickness: SURROUND_PANEL_THICKNESS,
        material: 'PET',
      });
    });
  }

  return result;
};
