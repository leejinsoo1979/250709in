import React, { useMemo } from 'react';
import { Text, Html } from '@react-three/drei';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { calculateBaseFrameHeight } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SectionConfig } from '@/data/modules/shelving';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';

const DEFAULT_BASIC_THICKNESS_MM = 18;

// 상판 실효 두께 계산 — PET 재질이면 도어 두께(spaceInfo.panelThickness, 기본 18), 인조대리석이면 사용자 선택값
const getStoneTopThicknessMm = (mod: any, doorThicknessMm: number = 18): number => {
  const t = mod?.stoneTopThickness || 0;
  if (t <= 0) return 0;
  return (mod?.stoneTopMaterial === 'pet') ? doorThicknessMm : t;
};

/** 연장선 + 양쪽 꼭지점 점 표시 */
const ExtLine: React.FC<{
  points: [number, number, number][];
  color?: string;
  lineWidth?: number;
  name?: string;
}> = ({ points, color = '#ffffff', lineWidth = 1, name = 'dimension_line' }) => (
  <group>
    <NativeLine name={name} points={points} color={color} lineWidth={lineWidth} renderOrder={100000} depthTest={false} />
    <mesh position={points[points.length - 1]} renderOrder={100001}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color={color} depthTest={false} transparent />
    </mesh>
  </group>
);

const mmToThreeUnits = (mm: number) => mm * 0.01;

/**
 * 미드웨이 치수 편집 UI (HTML 오버레이)
 * - 2D 치수선 위에 투명 HTML div를 덮어 확실히 클릭 가능하게 함
 * - 클릭 시 input으로 전환, Enter/blur로 확정, ESC로 취소
 */
const MidwayEditableNumber: React.FC<{
  position: [number, number, number];
  value: number;
  onChange: (v: number) => void;
  color: string;
  fontSize: number; // Three 단위 폰트사이즈 (참고용)
  rotated90?: boolean; // 텍스트처럼 세로로 90도 회전 표시
  isDark?: boolean; // 2D 다크모드 여부
}> = ({ position, value, onChange, color, rotated90, isDark }) => {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(String(value));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { setText(String(value)); }, [value]);
  React.useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  const commit = React.useCallback(() => {
    const n = parseFloat(text);
    if (!isNaN(n) && n > 0 && n !== value) onChange(Math.round(n));
    setEditing(false);
  }, [text, value, onChange]);

  // 다크모드 대응 색상
  const bgInput = isDark ? '#1f2937' : 'rgba(255,255,255,0.95)';
  const fgInput = isDark ? '#ffffff' : '#000000';
  const borderInput = isDark ? '#4b5563' : color;
  const hoverBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return (
    <Html
      position={position}
      center
      zIndexRange={[200, 0]}
      style={{ pointerEvents: 'auto', userSelect: 'none' }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') { setText(String(value)); setEditing(false); }
          }}
          style={{
            width: 64, padding: '2px 4px', fontSize: 13,
            border: `1px solid ${borderInput}`, borderRadius: 3, textAlign: 'center',
            backgroundColor: bgInput,
            color: fgInput,
            // 브라우저 기본 스타일 억제 (다크/라이트 모드 명시적 제어)
            colorScheme: isDark ? 'dark' : 'light',
            outline: 'none',
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        />
      ) : (
        <div
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          title="클릭하여 편집"
          style={{
            cursor: 'pointer',
            padding: '2px 8px',
            minWidth: 36,
            textAlign: 'center',
            color,
            fontSize: 13,
            fontWeight: 500,
            background: 'transparent',
            transform: rotated90 ? 'rotate(-90deg)' : undefined,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        >
          {value}
        </div>
      )}
    </Html>
  );
};

type SectionWithCalc = SectionConfig & { calculatedHeight?: number };

/**
 * FurnitureItem.tsx의 furnitureHeightMm 계산을 정확히 복제
 * (FurnitureItem.tsx line 1288-1341과 동기화)
 */
const computeFurnitureHeightMm = (
  mod: PlacedModule,
  moduleData: ReturnType<typeof getModuleById>,
  spaceInfo: SpaceInfo,
  internalSpace: { width: number; height: number; depth: number }
): number => {
  const category = getModuleCategory(mod);
  const isTall = category === 'full';
  const isStandFloat = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeightMm = isStandFloat ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const isStandType = spaceInfo.baseConfig?.type === 'stand';

  let heightMm: number;

  if (mod.isFreePlacement && isTall) {
    // 자유배치 키큰장: freeHeight 우선, 없으면 internalSpace.height
    const baseFreeHeight = mod.freeHeight || internalSpace.height;
    const maxFreeHeight = internalSpace.height - floatHeightMm;
    heightMm = Math.min(baseFreeHeight, maxFreeHeight);
    // 개별 상부프레임 두께 변경 시 보정
    if (mod.topFrameThickness !== undefined) {
      const globalTopFrame = spaceInfo.frameSize?.top || 30;
      heightMm -= (mod.topFrameThickness - globalTopFrame);
    }
  } else if (mod.isFreePlacement && mod.freeHeight) {
    // 자유배치 상/하부장: freeHeight 고정
    heightMm = mod.freeHeight;
  } else {
    // 슬롯 기반
    // cabinetBodyHeight가 있으면 2단서랍장 몸통 높이 오버라이드 (FurnitureItem.tsx와 동기화)
    if (mod.cabinetBodyHeight && (mod.moduleId.includes('lower-drawer-2tier') || mod.moduleId.includes('dual-lower-drawer-2tier'))) {
      heightMm = mod.cabinetBodyHeight;
    } else if (category === 'upper' && mod.customHeight) {
      // 상부장 미드웨이 편집: customHeight 우선 (상단 고정, 하단만 확장)
      heightMm = mod.customHeight;
    } else {
      heightMm = moduleData?.dimensions.height || 0;
    }
    if (!mod.isFreePlacement && heightMm > 0) {
      if (mod.topFrameThickness !== undefined) {
        const globalTop = spaceInfo.frameSize?.top ?? 30;
        heightMm -= (mod.topFrameThickness - globalTop);
      }
      if (mod.baseFrameHeight !== undefined && !isStandType && isTall) {
        const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0;
        heightMm -= (mod.baseFrameHeight - globalBase);
      }
    }
  }

  // 바닥마감재 차감: 키큰장(full)만 (하부장/상부장은 고정 높이이므로 차감 불필요)
  const floorFinishH = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) ? spaceInfo.floorFinish.height : 0;
  if (floorFinishH > 0 && isTall) {
    heightMm -= floorFinishH;
  }

  // hasBase=false → 가구 높이 유지 (FurnitureItem.tsx와 동일하게 높이 증가 제거)

  return heightMm;
};

interface SectionHeightsInfo {
  sections: SectionWithCalc[];
  heightsMm: number[];
  basicThicknessMm: number;
}

const computeSectionHeightsInfo = (
  module: PlacedModule,
  moduleData: ReturnType<typeof getModuleById> | null,
  internalHeightMm: number,
  viewDirection?: 'left' | 'right'
): SectionHeightsInfo => {
  // 듀얼 가구의 경우 leftSections/rightSections 확인
  let rawSections: SectionWithCalc[] | undefined;

  if (module.customSections && module.customSections.length > 0) {
    rawSections = module.customSections as SectionWithCalc[];
  } else if (moduleData?.modelConfig?.leftSections || moduleData?.modelConfig?.rightSections) {
    // 듀얼 가구 (스타일러장 등): 좌측뷰는 leftSections, 우측뷰는 rightSections 사용
    // 기본적으로 leftSections 사용 (주요 섹션)
    rawSections = (viewDirection === 'right' && moduleData?.modelConfig?.rightSections)
      ? moduleData.modelConfig.rightSections as SectionWithCalc[]
      : (moduleData?.modelConfig?.leftSections as SectionWithCalc[] || moduleData?.modelConfig?.rightSections as SectionWithCalc[]);
  } else {
    rawSections = moduleData?.modelConfig?.sections as SectionWithCalc[] | undefined;
  }

  const basicThicknessMm = moduleData?.modelConfig?.basicThickness ?? DEFAULT_BASIC_THICKNESS_MM;

  if (!rawSections || rawSections.length === 0) {
    return {
      sections: [],
      heightsMm: [],
      basicThicknessMm
    };
  }

  // useBaseFurniture.ts(line 112-157)와 동일한 방식:
  // shelving.ts에서 sections 합 = dimensions.height (판재 두께 포함)
  // 하부 섹션 고정, 마지막(상부) 섹션이 높이 차이를 흡수
  let heightsMm: number[];

  const hasCalculatedHeights = rawSections.every(section => typeof (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight === 'number');

  if (hasCalculatedHeights && rawSections.length > 0) {
    // calculatedHeight가 있는 경우: 합산 후 internalHeightMm과 비교하여 마지막 섹션 보정
    const calcHeights = rawSections.map(section => {
      const calc = (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight;
      return Math.max(calc ?? 0, 0);
    });
    const calcTotal = calcHeights.reduce((sum, h) => sum + h, 0);
    if (Math.abs(calcTotal - internalHeightMm) > 1 && rawSections.length > 1) {
      // 하부 고정, 마지막(상부) 섹션이 차이 흡수
      const fixedSum = calcHeights.slice(0, -1).reduce((sum, h) => sum + h, 0);
      calcHeights[calcHeights.length - 1] = Math.max(0, internalHeightMm - fixedSum);
    }
    heightsMm = calcHeights;
  } else {
    // 하부 섹션 고정, 마지막(상부) 섹션이 높이 차이를 흡수 (useBaseFurniture 방식)
    const fixedSum = rawSections.slice(0, -1).reduce((sum, section) => sum + (section.height ?? 0), 0);
    const lastSectionNewHeight = Math.max(0, internalHeightMm - fixedSum);

    heightsMm = rawSections.map((section, idx) => {
      if (idx < rawSections.length - 1) {
        return section.height ?? 0; // 하부 섹션 고정
      }
      return lastSectionNewHeight; // 상부(마지막) 섹션이 나머지 흡수
    });
  }

  return {
    sections: rawSections,
    heightsMm,
    basicThicknessMm
  };
};

/**
 * 하부장 외부서랍 마이다 높이 계산 (LowerCabinet.tsx + ExternalDrawerRenderer 로직 복제)
 * lower-drawer-*, lower-door-lift-*, lower-top-down-* 모듈 전용
 */
const computeLowerCabinetMaidaHeights = (
  moduleId: string,
  moduleHeightMm: number,
  doorTopGap: number,
  doorBottomGap: number,
): { maidaHeightMm: number; maidaBottomMm: number; maidaTopMm: number }[] | null => {
  // 하부장 서랍/마이다 모듈만 처리
  const isLowerDrawer = moduleId.includes('lower-drawer-');
  const isLowerDoorLift = moduleId.includes('lower-door-lift-');
  const isLowerTopDown = moduleId.includes('lower-top-down-');
  const isInduction = moduleId.includes('lower-induction-cabinet') || moduleId.includes('dual-lower-induction-cabinet');

  // 인덕션장: 기본 340/427 + doorTopGap/doorBottomGap 갭 확장 (3D 렌더링과 동일)
  if (isInduction) {
    const defaultDTG = -20;
    const defaultDBG = 5;
    const gapTopExt = doorTopGap - defaultDTG;
    const gapBottomExt = doorBottomGap - defaultDBG;
    const gapMm = 3;
    const maida1H = 340 + gapBottomExt;
    const maida2H = 427 + gapTopExt;
    const maida1Bottom = -5 - gapBottomExt;
    const maida1Top = maida1Bottom + maida1H;
    const maida2Bottom = -5 + 340 + gapMm;
    const maida2Top = maida2Bottom + maida2H;
    return [
      { maidaHeightMm: maida1H, maidaBottomMm: maida1Bottom, maidaTopMm: maida1Top },
      { maidaHeightMm: maida2H, maidaBottomMm: maida2Bottom, maidaTopMm: maida2Top },
    ];
  }

  if (!isLowerDrawer && !isLowerDoorLift && !isLowerTopDown) return null;

  // 터치 변형 (도어올림터치 / 상판내림터치): LowerCabinet.tsx line 758-800과 동일한 비례 계산
  const isDoorLiftTouch = moduleId.includes('lower-door-lift-touch-');
  const isTopDownTouch = moduleId.includes('lower-top-down-touch-');
  if (isDoorLiftTouch || isTopDownTouch) {
    const isTouch2A = moduleId.includes('lower-door-lift-touch-2tier-a');
    const isTouch2B = moduleId.includes('lower-door-lift-touch-2tier-b');
    const isTouch3 = moduleId.includes('lower-door-lift-touch-3tier');
    const isTDTouch2 = moduleId.includes('lower-top-down-touch-2tier');
    const isTDTouch3 = moduleId.includes('lower-top-down-touch-3tier');
    // 마이다 비례: 2B는 2A와 동일하게 [228, 228] 사용 (서랍 본체 높이만 다름)
    const drawerHeights = isTouch2A ? [228, 228]
      : isTouch2B ? [228, 228]
      : isTouch3 ? [228, 117, 117]
      : isTDTouch2 ? [228, 228]
      : isTDTouch3 ? [164, 117, 117]
      : [228, 228];

    const topExtMm = 30;
    const bottomExtMm = 5;
    const totalFrontMm = moduleHeightMm + topExtMm + bottomExtMm;
    const gapMm = 3;
    const drawerCount = drawerHeights.length;
    const totalGaps = (drawerCount - 1) * gapMm;
    const totalMaidaMm = totalFrontMm - totalGaps;
    const totalDrawerH = drawerHeights.reduce((a, b) => a + b, 0);
    // 도어올림 터치 2단(2A/2B): 하→상 [408, 409] 고정
    // 도어올림 터치 3단: 하→상 [360, 227, 227] 고정
    // 상판내림 터치 2단: 하→상 [353, 354] 고정
    // 상판내림 터치 3단: 하→상 [284, 210, 210] 고정
    const isDoorLift2Fixed = drawerCount === 2 && (isTouch2A || isTouch2B);
    const isDoorLift3Fixed = drawerCount === 3 && isTouch3;
    const isTopDown2Fixed = drawerCount === 2 && isTDTouch2;
    const isTopDown3Fixed = drawerCount === 3 && isTDTouch3;
    const maidaHeightsMm = isDoorLift2Fixed
      ? [408, 409]
      : isDoorLift3Fixed
        ? [360, 227, 227]
        : isTopDown2Fixed
          ? [353, 354]
          : isTopDown3Fixed
            ? [284, 210, 210]
            : drawerHeights.map(h => (h / totalDrawerH) * totalMaidaMm);

    // 마이다 위치 (캐비넷 하단 -5mm 부터 시작)
    let currentBottomMm = -bottomExtMm;
    return maidaHeightsMm.map(h => {
      const maidaBottom = currentBottomMm;
      const maidaTop = maidaBottom + h;
      currentBottomMm += h + gapMm;
      return { maidaHeightMm: h, maidaBottomMm: maidaBottom, maidaTopMm: maidaTop };
    });
  }

  const is3Tier = moduleId.includes('lower-drawer-3tier');
  const isDoorLift3Tier = moduleId.includes('lower-door-lift-3tier');
  const isDoorLift2Tier = moduleId.includes('lower-door-lift-2tier');
  const isTopDown3Tier = moduleId.includes('lower-top-down-3tier');
  const isTopDown2Tier = moduleId.includes('lower-top-down-2tier');

  // LowerCabinet.tsx line 349-350과 동일 (2단서랍장은 동적 계산)
  const drawer2TierFromBottom = (moduleHeightMm - 125) / 2;
  const notchFromBottoms = is3Tier ? [295, 510] : isDoorLift3Tier ? [315, 545] : isDoorLift2Tier ? [355] : isTopDown3Tier ? [225, 445, 665] : isTopDown2Tier ? [300, 665] : [drawer2TierFromBottom];
  const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : [65];
  const hideTopNotch = isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier;
  const fixedMaidaHeights = isDoorLift2Tier ? [400, 400] : isDoorLift3Tier ? [360, 210, 210] : undefined;
  // 실제 서랍 개수 (ExternalDrawerRenderer drawerCount와 동일)
  const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : 2;

  // 모듈별 기본 doorTopGap/doorBottomGap (LowerCabinet.tsx line 379-381)
  const defaultDoorTopGap = isTopDown2Tier || isTopDown3Tier ? -80 : isDoorLift2Tier || isDoorLift3Tier ? 30 : -20;
  const defaultDoorBottomGap = 5;

  // ExternalDrawerRenderer line 517-555: zone 계산
  const upperNotchH = 60;
  const upperNotchFromBottom = moduleHeightMm - upperNotchH;

  const sortedNotches = notchFromBottoms
    .map((fb, idx) => ({ fromBottom: fb, height: notchHeights[idx] || 65 }))
    .sort((a, b) => a.fromBottom - b.fromBottom);

  const allNotches = hideTopNotch
    ? [...sortedNotches]
    : [...sortedNotches, { fromBottom: upperNotchFromBottom, height: upperNotchH }];

  interface Zone { bottomMm: number; topMm: number; notchAboveBottom: number; notchBelowTop: number | null; }
  const zones: Zone[] = [];
  let cursor = 0;
  for (let ni = 0; ni < allNotches.length; ni++) {
    const notch = allNotches[ni];
    if (notch.fromBottom > cursor) {
      const notchAboveBottom = notch.fromBottom;
      const notchBelowTop = ni > 0 ? (allNotches[ni - 1].fromBottom + allNotches[ni - 1].height) : null;
      zones.push({ bottomMm: cursor, topMm: notch.fromBottom, notchAboveBottom, notchBelowTop });
    }
    cursor = notch.fromBottom + notch.height;
  }
  // hideTopNotch일 때 마지막 노치 위 남은 공간을 추가 zone으로 생성
  // 단, zone이 이미 drawerCount만큼 있으면 추가하지 않음 (ExternalDrawerRenderer와 동일)
  // 상판내림: 마지막 노치 위 55mm는 전대+상판 영역이지 서랍 zone이 아님
  if (cursor < moduleHeightMm && zones.length < drawerCount) {
    const lastNotch = allNotches[allNotches.length - 1];
    zones.push({
      bottomMm: cursor,
      topMm: moduleHeightMm,
      notchAboveBottom: moduleHeightMm,
      notchBelowTop: lastNotch ? (lastNotch.fromBottom + lastNotch.height) : null,
    });
  }

  // ExternalDrawerRenderer line 149-154: 마이다 높이 계산
  return zones.map((zone, i) => {
    const isTopDrawer = i === zones.length - 1;
    const isBottomDrawer = i === 0;
    const maidaTopBase = zone.notchAboveBottom + 40;
    const maidaBottomBase = zone.notchBelowTop != null ? (zone.notchBelowTop - 5) : -5;
    const gapTopExt = isTopDrawer ? (doorTopGap - defaultDoorTopGap) : 0;
    const gapBottomExt = isBottomDrawer ? (doorBottomGap - defaultDoorBottomGap) : 0;
    const defaultMaidaH = maidaTopBase - maidaBottomBase + gapTopExt + gapBottomExt;
    const maidaH = (fixedMaidaHeights && fixedMaidaHeights[i]) ? fixedMaidaHeights[i] : defaultMaidaH;
    const maidaBottom = maidaBottomBase - gapBottomExt;
    const maidaTop = maidaBottom + maidaH;
    return { maidaHeightMm: maidaH, maidaBottomMm: maidaBottom, maidaTopMm: maidaTop };
  });
};

interface CADDimensions2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
  isSplitView?: boolean;
}

/**
 * CAD 스타일 2D 치수 표기 컴포넌트 - 측면뷰 전용
 */
const CADDimensions2D: React.FC<CADDimensions2DProps> = ({ viewDirection, showDimensions: showDimensionsProp }) => {
  const { spaceInfo } = useSpaceConfigStore();
  // 상판 실효 두께 — PET이면 도어 두께(spaceInfo.panelThickness, 기본 18), stone이면 사용자 선택값
  const _stoneTopThk = (mod: any) => getStoneTopThicknessMm(mod, spaceInfo?.panelThickness || 18);
  const placedModulesStore = useFurnitureStore(state => state.placedModules);
  const { view2DDirection, showDimensions: showDimensionsFromStore, view2DTheme, selectedSlotIndex, showFurniture } = useUIStore();
  const { zones } = useDerivedSpaceStore();
  const placedModules = useMemo(
    () => (showFurniture ? placedModulesStore : []),
    [placedModulesStore, showFurniture]
  );

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  // 2D 도면 치수 색상
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';
  const textColor = dimensionColor;

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;

  // showDimensions가 false이면 치수 표시하지 않음
  if (!showDimensions) {
    return null;
  }

  // 측면도(좌/우)가 아니면 렌더링하지 않음
  if (currentViewDirection !== 'left' && currentViewDirection !== 'right') {
    return null;
  }

  // 공간 크기
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  const spaceDepth = mmToThreeUnits(spaceInfo.depth || 1500);

  // 내부 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 띄워서 배치
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;

  // 프레임 높이 (전역값) — Room.tsx, calculateTopBottomFrameHeight와 동일한 기본값 30
  const globalTopFrameHeightMm = spaceInfo.frameSize?.top ?? 30;

  // 바닥레일/받침대 높이 계산 (전역값)
  // - floor 타입: 받침대 높이 (calculateBaseFrameHeight 사용)
  // - stand 타입 + 띄움 배치: 바닥 프레임 없음 (0)
  // - stand 타입 + 일반 배치: 바닥레일 높이 (baseConfig.height)
  const isStandType = spaceInfo.baseConfig?.type === 'stand';
  const globalRailOrBaseHeightMm = isStandType
    ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))  // 띄움 배치면 바닥 프레임 없음
    : calculateBaseFrameHeight(spaceInfo);

  const isFreePlacementMode = spaceInfo.layoutMode === 'free-placement';

  // 내경 높이 (전역 기준 — 후에 per-furniture delta 보정)
  const floatHeightMmForCalc = isFloating ? floatHeightMm : 0;
  const globalAdjustedInternalHeightMm = isStandType
    ? internalSpace.height - globalRailOrBaseHeightMm - floatHeightMmForCalc
    : internalSpace.height;
  // 바닥마감재 높이
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;

  // 단내림 설정
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
  const dropHeightMm = hasDroppedCeiling ? (spaceInfo.droppedCeiling?.dropHeight || 200) : 0;
  const dropHeight = mmToThreeUnits(dropHeightMm);
  const droppedCeilingHeight = spaceHeight - dropHeight; // 단내림 구간 높이
  const droppedCeilingHeightMm = spaceInfo.height - dropHeightMm; // 단내림 구간 높이 (mm)

  // 선택된 슬롯이 단내림 구간에 해당하는지 판단
  const normalSlotCount = zones?.normal?.columnCount || (spaceInfo.customColumnCount || 4);
  const isSelectedSlotInDroppedZone = hasDroppedCeiling && selectedSlotIndex !== null && selectedSlotIndex >= normalSlotCount;

  // 표시할 높이 (단내림 구간이면 단내림 높이, 아니면 전체 높이)
  const displaySpaceHeight = isSelectedSlotInDroppedZone ? droppedCeilingHeight : spaceHeight;
  const displaySpaceHeightMm = isSelectedSlotInDroppedZone ? droppedCeilingHeightMm : spaceInfo.height;

  // 치수 텍스트 크기 통일 (CleanCAD2D와 동일: 2D = 0.4)
  const largeFontSize = 0.4;
  const smallFontSize = 0.4;

  // 치수선 오프셋
  const leftDimOffset = mmToThreeUnits(400);
  const rightDimOffset = mmToThreeUnits(400);

  // 측면뷰에서 표시할 가구 필터링 (PlacedFurnitureContainer.tsx와 동일한 로직)
  const getVisibleFurnitureForSideView = () => {
    if (placedModules.length === 0) return [];

    const nonSurroundModules = placedModules.filter(m => !m.isSurroundPanel);
    if (nonSurroundModules.length === 0) return [];

    let filteredBySlot = nonSurroundModules;

    if (selectedSlotIndex !== null) {
      if (isFreePlacementMode) {
        // 자유배치 모드: X좌표 기반 가상 슬롯 그룹핑
        const sortedByX = [...nonSurroundModules].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
        const xGroups: number[][] = [];
        let lastX: number | null = null;
        sortedByX.forEach((m, idx) => {
          const mx = m.position?.x ?? 0;
          if (lastX === null || Math.abs(mx - lastX) > 0.01) {
            xGroups.push([idx]);
            lastX = mx;
          } else {
            xGroups[xGroups.length - 1].push(idx);
          }
        });

        if (selectedSlotIndex < xGroups.length) {
          const selectedIds = new Set(
            xGroups[selectedSlotIndex].map(idx => sortedByX[idx].id)
          );
          filteredBySlot = nonSurroundModules.filter(m => selectedIds.has(m.id));
        }
      } else {
        // 슬롯 기반 배치: slotIndex로 직접 필터링 (PlacedFurnitureContainer와 동일)
        const hasDropCeiling = spaceInfo.droppedCeiling?.enabled || false;
        const normalSlotCount = zones?.normal?.columnCount || (spaceInfo.customColumnCount || 4);

        filteredBySlot = nonSurroundModules.filter(module => {
          if (module.slotIndex === undefined) return false;

          let moduleGlobalSlotIndex = module.slotIndex;
          let isInDroppedZone = module.zone === 'dropped';

          if (hasDropCeiling && !isInDroppedZone && zones?.dropped && zones?.normal) {
            const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
            const moduleXMm = module.position.x * 100;
            const normalWidth = zones.normal.width;
            const droppedWidth = zones.dropped.width;

            if (droppedPosition === 'left') {
              isInDroppedZone = moduleXMm < droppedWidth;
            } else {
              isInDroppedZone = moduleXMm >= normalWidth;
            }
          }

          if (hasDropCeiling && isInDroppedZone) {
            moduleGlobalSlotIndex = normalSlotCount + module.slotIndex;
          }

          return module.isDualSlot
            ? (moduleGlobalSlotIndex === selectedSlotIndex || moduleGlobalSlotIndex + 1 === selectedSlotIndex)
            : (moduleGlobalSlotIndex === selectedSlotIndex);
        });
      }
    }

    if (filteredBySlot.length === 0) return [];

    // 슬롯 기반 모드: slotIndex로 이미 정확히 필터링됨 → 그대로 반환
    // (듀얼슬롯 하부장 + 상부장처럼 X좌표가 다를 수 있어 X필터 불필요)
    if (!isFreePlacementMode) {
      return filteredBySlot;
    }

    // 자유배치 모드: 같은 X 위치에 있는 모든 모듈을 반환 (상부장+하부장 동시 표시용)
    if (currentViewDirection === 'left') {
      const target = filteredBySlot.reduce((a, b) => a.position.x < b.position.x ? a : b);
      return filteredBySlot.filter(m => Math.abs((m.position?.x ?? 0) - (target.position?.x ?? 0)) < 0.01);
    } else if (currentViewDirection === 'right') {
      const target = filteredBySlot.reduce((a, b) => a.position.x > b.position.x ? a : b);
      return filteredBySlot.filter(m => Math.abs((m.position?.x ?? 0) - (target.position?.x ?? 0)) < 0.01);
    }

    return [];
  };

  const visibleFurniture = getVisibleFurnitureForSideView();

  // 선택된 가구의 개별 프레임 값 우선 사용 (자유배치/슬롯 공통)
  // 하부장/키큰장 우선 선택 — 받침대·하부프레임 치수의 기준이 되어야 함
  const selectedMod = (() => {
    if (visibleFurniture.length === 0) return undefined;
    const lowerOrFull = visibleFurniture.find(m => {
      const cat = getModuleCategory(m as PlacedModule);
      return cat === 'lower' || cat === 'full';
    });
    return (lowerOrFull ?? visibleFurniture[0]) as PlacedModule;
  })();
  const topFrameHeightMm = (selectedMod?.topFrameThickness !== undefined)
    ? selectedMod.topFrameThickness
    : globalTopFrameHeightMm;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);
  // 개별 가구 hasBase/individualFloatHeight 반영 (FurnitureItem.tsx 1392-1395와 동기화)
  const modHasBaseOff = selectedMod?.hasBase === false && !isStandType;
  const railOrBaseHeightMm = modHasBaseOff
    ? 0  // 하부프레임 OFF → 받침대 0
    : (selectedMod?.baseFrameHeight !== undefined && !isStandType)
      ? selectedMod.baseFrameHeight
      : globalRailOrBaseHeightMm;
  const indivFloatMm = modHasBaseOff ? (selectedMod?.individualFloatHeight ?? 0) : 0;
  const railOrBaseHeight = mmToThreeUnits(railOrBaseHeightMm);

  // per-furniture 받침대/치수 변수
  const baseFrameHeightMm = isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm);
  // 하부프레임 표시값: 바닥마감재와 별개로 표시 (바닥마감재는 별도 치수선으로 표시)
  const baseFrameDisplayMm = baseFrameHeightMm;
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);
  const floorFinishY = isFloating ? 0 : mmToThreeUnits(floorFinishHeightMm);
  const furnitureBaseY = (isFloating ? floatHeight : baseFrameHeight) + floorFinishY;

  // 선택된 가구의 카테고리 확인 (키큰장만 바닥마감재 차감)
  const selectedModCategory = selectedMod ? getModuleCategory(selectedMod) : undefined;
  const isSelectedTall = selectedModCategory === 'full';

  // 내경 높이 (per-furniture delta 보정 적용)
  let adjustedInternalHeightMm = globalAdjustedInternalHeightMm;
  // 바닥마감재: 키큰장(full)만 가구 높이에서 차감 (하부장/상부장은 고정 높이)
  if (floorFinishHeightMm > 0 && isSelectedTall) {
    adjustedInternalHeightMm -= floorFinishHeightMm;
  }
  // 개별 프레임 높이 변경 시 내경 높이 보정 (자유배치/슬롯 공통)
  if (selectedMod) {
    if (selectedMod.topFrameThickness !== undefined) {
      adjustedInternalHeightMm -= (selectedMod.topFrameThickness - globalTopFrameHeightMm);
    }
    if (modHasBaseOff) {
      // hasBase=false → 가구 높이 유지 (FurnitureItem.tsx와 동일하게 높이 증가 제거)
    } else if (selectedMod.baseFrameHeight !== undefined && !isStandType) {
      adjustedInternalHeightMm -= (selectedMod.baseFrameHeight - globalRailOrBaseHeightMm);
    }
  }
  const internalHeight = mmToThreeUnits(adjustedInternalHeightMm);

  // 좌측뷰인 경우
  // 좌측뷰 연장선 시작점
  const leftExtStartZ = -spaceDepth/2 + mmToThreeUnits(70);

  if (currentViewDirection === 'left') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {/* 단내림 구간이 선택된 경우 단내림 높이를 표시 */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <ExtLine points={[[0, 0, leftExtStartZ], [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 보조 가이드 연장선 - 상단 */}
          <ExtLine points={[[0, displaySpaceHeight, leftExtStartZ], [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 수직 치수선 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 높이 텍스트 */}
          <Text
            position={[0, displaySpaceHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={1000}
            depthTest={false}
            rotation={[0, -Math.PI / 2, Math.PI / 2]}
          >
            {displaySpaceHeightMm}
          </Text>
        </group>}

        {/* ===== 왼쪽 2단: 몸통 사이즈 (segment-based, 모든 카테고리) ===== */}
        {visibleFurniture.length > 0 && (() => {
          const leftInnerZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) + mmToThreeUnits(200);
          const leftInnerExtStartZ = leftExtStartZ;
          const effectiveH_l2 = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          const segments_l2: { bottomY: number; topY: number; heightMm: number; key: string; extStartZ?: number; upperModuleId?: string; currentHeightMm?: number }[] = [];
          // 도어 안쪽에 표시할 갭 치수 (상판 윗면~도어 상단)
          const innerGapSegments_l2: { bottomY: number; topY: number; heightMm: number; key: string }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            let moduleData = getModuleById(
              module.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!moduleData) {
              moduleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
            }
            if (!moduleData) return;

            const mod = module as PlacedModule;
            const modCat_l2 = getModuleCategory(mod);
            const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);

            let cabinetBottomMm: number;
            let cabinetTopMm: number;

            if (modCat_l2 === 'upper') {
              const topFrameVal = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
              cabinetTopMm = effectiveH_l2 - topFrameVal;
              cabinetBottomMm = cabinetTopMm - moduleHeightMm;
            } else {
              cabinetBottomMm = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              cabinetTopMm = cabinetBottomMm + moduleHeightMm;
            }

            // 하부장 + 상판: 장 높이와 상판 두께를 분리하여 표시 (PET=18.5, 인조대리석=선택값)
            const stoneThicknessL2 = _stoneTopThk(mod);
            const includeStoneInHeight = modCat_l2 === 'lower' && stoneThicknessL2 > 0;

            // 2섹션 가구(의류장: 코트장/붙박이장B/D)는 섹션별로 분할하여 표시
            // 하부장/상부장은 단일 표시, full 카테고리만 섹션 분할 적용
            let didSplitSections = false;
            if (modCat_l2 === 'full') {
              const sectionInfo = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'left');
              if (sectionInfo.heightsMm.length >= 2) {
                // 하부 → 상부 순서로 누적 쌓기
                let cursorMm = cabinetBottomMm;
                sectionInfo.heightsMm.forEach((hMm, sIdx) => {
                  const sBottom = cursorMm;
                  const sTop = cursorMm + hMm;
                  segments_l2.push({
                    bottomY: mmToThreeUnits(sBottom),
                    topY: mmToThreeUnits(sTop),
                    heightMm: Math.round(hMm),
                    key: `furniture-${moduleIndex}-sec${sIdx}`,
                  });
                  cursorMm = sTop;
                });
                didSplitSections = true;
              }
            }

            // 섹션 분할이 아니면 장 높이 세그먼트 1개 (상판 제외 순수 캐비넷 높이)
            if (!didSplitSections) {
              segments_l2.push({
                bottomY: mmToThreeUnits(cabinetBottomMm),
                topY: mmToThreeUnits(cabinetTopMm),
                heightMm: Math.round(moduleHeightMm),
                key: `furniture-${moduleIndex}`,
                // 상부장이면 미드웨이 편집 시 참조할 id/현재높이 기록
                upperModuleId: modCat_l2 === 'upper' ? mod.id : undefined,
                currentHeightMm: modCat_l2 === 'upper' ? moduleHeightMm : undefined,
              });
            }

            // 상판 두께 세그먼트 (분리 표시)
            if (includeStoneInHeight) {
              segments_l2.push({
                bottomY: mmToThreeUnits(cabinetTopMm),
                topY: mmToThreeUnits(cabinetTopMm + stoneThicknessL2),
                heightMm: stoneThicknessL2,
                key: `stone-top-${moduleIndex}`
              });
            }

            // 상부장: 상부프레임 치수 세그먼트 추가 (캐비넷 상단 ~ 천장)
            if (modCat_l2 === 'upper') {
              const topFrameVal = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
              if (topFrameVal > 0) {
                // 상부프레임 연장선은 가구 뒷면까지 연장
                // 상부장 뒷면을 하부장 뒷면에 정렬
                // 하부장 뒷면 Z = fzOff - furnitureDepth/2 - doorThickness(20mm)
                const upperDepthMm_tf = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
                const upperModDepth_tf = mmToThreeUnits(upperDepthMm_tf);
                const panelDepthMm_tf = spaceInfo.depth || 1500;
                const panelDepth_tf = mmToThreeUnits(panelDepthMm_tf);
                const furnitureDepth_tf = mmToThreeUnits(Math.min(panelDepthMm_tf, 600));
                const doorThk_tf = mmToThreeUnits(20);
                const zOff_tf = -panelDepth_tf / 2;
                const fzOff_tf = zOff_tf + (panelDepth_tf - furnitureDepth_tf) / 2;
                // 상부장 중심 Z = 하부장 뒷면 + 상부장 깊이/2
                const upperFurnitureZ_tf = fzOff_tf - furnitureDepth_tf / 2 - doorThk_tf + upperModDepth_tf / 2;
                const upperFrontZ = upperFurnitureZ_tf + upperModDepth_tf / 2;

                segments_l2.push({
                  bottomY: mmToThreeUnits(cabinetTopMm),
                  topY: mmToThreeUnits(effectiveH_l2),
                  heightMm: Math.round(topFrameVal),
                  key: `upper-topframe-${moduleIndex}`,
                  extStartZ: upperFrontZ
                });
              }
            }

            // 하부장: 뒷턱 치수만 (상판 두께는 몸통에 합산됨)
            if (modCat_l2 === 'lower') {
              const stoneThickness = _stoneTopThk(mod);

              // 뒷턱 치수 (상판 위에 추가)
              if (stoneThickness > 0) {
                const backLipH = mod.stoneTopBackLip || 0;
                if (backLipH > 0) {
                  segments_l2.push({
                    bottomY: mmToThreeUnits(cabinetTopMm + stoneThickness),
                    topY: mmToThreeUnits(cabinetTopMm + stoneThickness + backLipH),
                    heightMm: backLipH,
                    key: `stone-backlip-${moduleIndex}`
                  });
                }
              }
            }
          });

          if (segments_l2.length === 0) return null;

          segments_l2.sort((a, b) => a.bottomY - b.bottomY);

          const allSegments_l2: typeof segments_l2 = [];
          for (let i = 0; i < segments_l2.length; i++) {
            allSegments_l2.push(segments_l2[i]);
            if (i < segments_l2.length - 1) {
              const gapBottomY = segments_l2[i].topY;
              const gapTopY = segments_l2[i + 1].bottomY;
              const gapMm = Math.round((gapTopY - gapBottomY) / 0.01);
              if (gapMm > 0) {
                // 상부장이 바로 위에 있으면 (미드웨이) upperModuleId 전달 → 편집 가능
                const upperAbove = segments_l2[i + 1].upperModuleId;
                const upperCurH = segments_l2[i + 1].currentHeightMm;
                allSegments_l2.push({
                  bottomY: gapBottomY,
                  topY: gapTopY,
                  heightMm: gapMm,
                  key: `gap-${i}`,
                  upperModuleId: upperAbove,
                  currentHeightMm: upperCurH,
                });
              }
            }
          }

          // 하부장의 받침대/바닥마감재도 표시
          const hasLower = visibleFurniture.some(m => getModuleCategory(m as PlacedModule) === 'lower' || getModuleCategory(m as PlacedModule) === 'full');

          return (
            <group>
              {allSegments_l2.map((seg) => {
                const segExtStartZ = seg.extStartZ !== undefined ? seg.extStartZ : leftInnerExtStartZ;
                return (
                <group key={`l2-sec-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, segExtStartZ], [0, seg.bottomY, leftInnerZ]]} color={dimensionColor} />
                  <ExtLine points={[[0, seg.topY, segExtStartZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line"
                    points={[[0, seg.bottomY, leftInnerZ], [0, seg.topY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[-0.008, seg.bottomY, leftInnerZ], [0.008, seg.bottomY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[-0.008, seg.topY, leftInnerZ], [0.008, seg.topY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  {seg.upperModuleId && seg.currentHeightMm ? (
                    <MidwayEditableNumber
                      position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                      value={seg.heightMm}
                      color={textColor}
                      fontSize={largeFontSize}
                      rotated90
                      isDark={view2DTheme === 'dark'}
                      onChange={(newGap) => {
                        const delta = seg.heightMm - newGap; // 양수: 갭 줄임 → 상부장 확장
                        const newHeight = Math.round((seg.currentHeightMm || 0) + delta);
                        if (newHeight > 0 && seg.upperModuleId) {
                          useFurnitureStore.getState().updatePlacedModule(seg.upperModuleId, {
                            customHeight: newHeight,
                          });
                        }
                      }}
                    />
                  ) : (
                    <Text
                      position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, -Math.PI / 2, Math.PI / 2]}
                    >
                      {seg.heightMm}
                    </Text>
                  )}
                </group>
                );
              })}

              {/* 도어 안쪽 갭 치수 (상판 윗면~도어 상단) — 도어 치수선 바깥(오른쪽) */}
              {innerGapSegments_l2.length > 0 && (() => {
                // 도어 전면 Z 계산
                const panelDepthMm_ig = spaceInfo.depth || 1500;
                const furnitureDepthMm_ig = Math.min(panelDepthMm_ig, 600);
                const zOff_ig = -mmToThreeUnits(panelDepthMm_ig) / 2;
                const fzOff_ig = zOff_ig + (mmToThreeUnits(panelDepthMm_ig) - mmToThreeUnits(furnitureDepthMm_ig)) / 2;
                const doorFrontZ_ig = fzOff_ig + mmToThreeUnits(furnitureDepthMm_ig) / 2;
                // 도어 치수선(150mm) 바깥에 배치: 도어 전면 + 300mm
                const innerDimZ = doorFrontZ_ig + mmToThreeUnits(300);
                const innerExtStart = doorFrontZ_ig + mmToThreeUnits(180);
                return innerGapSegments_l2.map((seg) => (
                  <group key={`inner-gap-${seg.key}`}>
                    <ExtLine points={[[0, seg.bottomY, innerExtStart], [0, seg.bottomY, innerDimZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, seg.topY, innerExtStart], [0, seg.topY, innerDimZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line"
                      points={[[0, seg.bottomY, innerDimZ], [0, seg.topY, innerDimZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[-0.008, seg.bottomY, innerDimZ], [0.008, seg.bottomY, innerDimZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[-0.008, seg.topY, innerDimZ], [0.008, seg.topY, innerDimZ]]}
                      color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                    />
                    <Text
                      position={[0, (seg.bottomY + seg.topY) / 2, innerDimZ + mmToThreeUnits(60)]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, -Math.PI / 2, Math.PI / 2]}
                    >
                      {seg.heightMm}
                    </Text>
                  </group>
                ));
              })()}

              {/* 하부프레임 높이: 바닥마감재 상단 ~ 받침대 상단 */}
              {hasLower && baseFrameHeightMm > 0 && (
                <>
                  <ExtLine points={[[0, floorFinishY, leftInnerExtStartZ], [0, floorFinishY, leftInnerZ]]} color={dimensionColor} />
                  <ExtLine points={[[0, furnitureBaseY, leftInnerExtStartZ], [0, furnitureBaseY, leftInnerZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line"
                    points={[[0, floorFinishY, leftInnerZ], [0, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[-0.008, floorFinishY, leftInnerZ], [0.008, floorFinishY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[-0.008, furnitureBaseY, leftInnerZ], [0.008, furnitureBaseY, leftInnerZ]]}
                    color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
                  />
                  <Text
                    position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, leftInnerZ - mmToThreeUnits(60)]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={1000} depthTest={false}
                    rotation={[0, -Math.PI / 2, Math.PI / 2]}
                  >
                    {baseFrameDisplayMm}
                  </Text>
                </>
              )}

            </group>
          );
        })()}

        {/* ===== 오른쪽: 상부프레임 치수 제거됨 (좌측 세그먼트로 이동) ===== */}

        {/* 우측 도어 사이즈 (hasDoor 가구만) */}
        {(() => {
          // 가구 앞면 Z 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm_ud = spaceInfo.depth || 1500;
          const panelDepth_ud = mmToThreeUnits(panelDepthMm_ud);
          const furnitureDepth_ud = mmToThreeUnits(Math.min(panelDepthMm_ud, 600));
          const doorThk_ud = mmToThreeUnits(20);
          const zOff_ud = -panelDepth_ud / 2;
          const fzOff_ud = zOff_ud + (panelDepth_ud - furnitureDepth_ud) / 2;
          // 하부장/키큰장 도어 앞면 Z (도어 포함)
          const lowerDoorFrontZ = fzOff_ud + furnitureDepth_ud / 2;
          // 도어 치수선: 도어 앞면에서 150mm 바깥, 연장선: 30mm부터
          const dimZ = lowerDoorFrontZ + mmToThreeUnits(150);
          const dimExtZ = lowerDoorFrontZ + mmToThreeUnits(30);
          // 상부장 Z: 하부장 뒷면에 정렬 (하부장 뒷면 = fzOff_ud - furnitureDepth_ud/2 - doorThk_ud)
          // 상부장 깊이 (첫 번째 상부장 모듈 기준)
          const firstUpperMod = visibleFurniture.find(m => getModuleCategory(m as PlacedModule) === 'upper') as PlacedModule | undefined;
          const upperModDepthMm = firstUpperMod?.upperSectionDepth || firstUpperMod?.customDepth || 300;
          const upperModDepth_ud = mmToThreeUnits(upperModDepthMm);
          // 상부장 중심 Z = 하부장 뒷면 + 상부장 깊이/2
          const upperFurnitureZ = fzOff_ud - furnitureDepth_ud / 2 - doorThk_ud + upperModDepth_ud / 2;
          const upperFrontZ = upperFurnitureZ + upperModDepth_ud / 2;
          const upperDimZ = upperFrontZ + mmToThreeUnits(200);
          const upperDimExtZ = upperFrontZ + mmToThreeUnits(20);
          const effectiveH_door = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          const doorSegs: { bottomY: number; topY: number; heightMm: number; key: string; isUpper: boolean }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            const mod = module as PlacedModule;
            if (!mod.hasDoor) return;

            // 서랍/마이다 모듈은 마이다 치수 블록에서 별도 처리 → 도어 치수 건너뜀
            const isDrawerMod = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');
            if (isDrawerMod) return;

            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod, internalSpace, spaceInfo);
            if (!modData) return;

            const modCat = getModuleCategory(mod);
            const moduleHeightMm = computeFurnitureHeightMm(mod, modData, spaceInfo, internalSpace);
            const doorTopGapVal = mod.doorTopGap ?? spaceInfo.doorTopGap ?? 0;
            const doorBottomGapVal = mod.doorBottomGap ?? spaceInfo.doorBottomGap ?? 0;

            let doorBottomAbsMm = 0;
            let doorTopAbsMm = 0;
            let doorHeightMm = 0;

            if (modCat === 'upper') {
              // DoorModule과 동일: freeHeight || dimensions.height (delta 보정 없는 원본값)
              const cabinetH = mod.freeHeight || modData.dimensions.height || 600;
              const topFrameVal = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
              const topExtension = topFrameVal - doorTopGapVal;
              doorHeightMm = cabinetH + topExtension + doorBottomGapVal;
              doorTopAbsMm = effectiveH_door - doorTopGapVal;
              doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
            } else if (modCat === 'lower') {
              const cabinetH = modData.dimensions.height ?? 1000;
              const cabinetBottomAbs = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const isDoorLift = modData.id?.includes('lower-door-lift-');
              const isTopDown = modData.id?.includes('lower-top-down-');
              if (isTopDown) {
                doorHeightMm = 710;
                doorBottomAbsMm = cabinetBottomAbs - 5;
                doorTopAbsMm = doorBottomAbsMm + doorHeightMm;
              } else if (isDoorLift) {
                doorHeightMm = cabinetH + 5 + 30;
                doorTopAbsMm = cabinetBottomAbs + cabinetH + 30;
                doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
              } else {
                doorHeightMm = cabinetH + doorTopGapVal + doorBottomGapVal;
                doorTopAbsMm = cabinetBottomAbs + cabinetH + doorTopGapVal;
                doorBottomAbsMm = cabinetBottomAbs - doorBottomGapVal;
              }
            } else {
              // 키큰장
              const isFloorType = !spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor';
              const floorFinishForDoor = (isFloorType && spaceInfo.hasFloorFinish)
                ? (spaceInfo.floorFinish?.height || 0) : 0;
              doorBottomAbsMm = doorBottomGapVal + floorFinishForDoor;
              doorTopAbsMm = effectiveH_door - doorTopGapVal;
              doorHeightMm = Math.max(0, doorTopAbsMm - doorBottomAbsMm);
            }

            if (doorHeightMm <= 0) return;

            doorSegs.push({
              bottomY: mmToThreeUnits(doorBottomAbsMm),
              topY: mmToThreeUnits(doorTopAbsMm),
              heightMm: Math.round(doorHeightMm),
              key: `door-${moduleIndex}`,
              isUpper: modCat === 'upper'
            });

            // 하부장: 도어 상단갭 (도어 상단 ~ 가구 상단) + 하단갭 (바닥 ~ 도어 하단)
            // lower-top-down: 도어 상단 ~ 인조대리석 앞판 하단 갭(20mm) 표시
            // lower-door-lift는 도어가 가구 위로 올라가므로 좌측 2단에서 표시 (여기서 제외)
            const _effStoneThk_l = _stoneTopThk(mod);
            if (modCat === 'lower' && modData.id?.includes('lower-top-down-') && _effStoneThk_l > 0) {
              const cabinetH = modData.dimensions.height ?? 785;
              const cabinetBottomAbs = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const cabinetTopAbs = cabinetBottomAbs + cabinetH;
              // 도어 상단 ~ 인조대리석 앞판 하단 = 20mm 갭
              const doorGapMm = 20;
              const gapBottomAbs = doorTopAbsMm; // 도어 상단
              const gapTopAbs = gapBottomAbs + doorGapMm; // 앞판 하단
              doorSegs.push({
                bottomY: mmToThreeUnits(gapBottomAbs),
                topY: mmToThreeUnits(gapTopAbs),
                heightMm: doorGapMm,
                key: `door-topgap-${moduleIndex}`,
                isUpper: false
              });
              // 앞판 높이 = (캐비넷상단 - 앞판하단) + 상판 실효 두께 (PET=18.5 / 인조대리석=선택값)
              const frontPlateAreaMm = Math.round(cabinetTopAbs - gapTopAbs) + _effStoneThk_l;
              if (frontPlateAreaMm > 0) {
                doorSegs.push({
                  bottomY: mmToThreeUnits(gapTopAbs),
                  topY: mmToThreeUnits(cabinetTopAbs + _effStoneThk_l),
                  heightMm: frontPlateAreaMm,
                  key: `door-frontplate-${moduleIndex}`,
                  isUpper: false
                });
              }
            } else if (modCat === 'lower' && !modData.id?.includes('lower-top-down-') && !modData.id?.includes('lower-door-lift-')) {
              const cabinetH = modData.dimensions.height ?? 1000;
              const cabinetBottomAbs = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const cabinetTopAbsMm = cabinetBottomAbs + cabinetH;
              // 상단갭: 도어 상단 ~ 가구 상단
              const topGapMm = Math.round(Math.abs(cabinetTopAbsMm - doorTopAbsMm));
              if (topGapMm > 0) {
                const gapBottom = Math.min(doorTopAbsMm, cabinetTopAbsMm);
                const gapTop = Math.max(doorTopAbsMm, cabinetTopAbsMm);
                doorSegs.push({
                  bottomY: mmToThreeUnits(gapBottom),
                  topY: mmToThreeUnits(gapTop),
                  heightMm: topGapMm,
                  key: `door-topgap-${moduleIndex}`,
                  isUpper: false
                });
              }
              // 하단갭은 doorSegs 밖에서 별도 렌더링 (바닥 기준 절대 거리)
            }
          });

          if (doorSegs.length === 0) return null;

          // 상부장 도어와 하부장/키큰장 도어 분리
          const upperDoorSegsRaw = doorSegs.filter(s => s.isUpper);
          const lowerDoorSegsRaw = doorSegs.filter(s => !s.isUpper);

          // 같은 높이·위치의 중복 세그먼트 제거 (같은 슬롯에 여러 가구가 있을 때)
          const dedup = (segs: typeof doorSegs) => {
            const seen = new Set<string>();
            return segs.filter(s => {
              const k = `${s.heightMm}_${Math.round(s.bottomY * 1000)}_${Math.round(s.topY * 1000)}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          };
          const upperDoorSegs = dedup(upperDoorSegsRaw);
          const lowerDoorSegs = dedup(lowerDoorSegsRaw);

          // 하부장/키큰장 도어 간 간격 계산
          lowerDoorSegs.sort((a, b) => a.bottomY - b.bottomY);
          const allLowerDoorSegs: typeof doorSegs = [];
          for (let i = 0; i < lowerDoorSegs.length; i++) {
            allLowerDoorSegs.push(lowerDoorSegs[i]);
            if (i < lowerDoorSegs.length - 1) {
              const gapBottomY = lowerDoorSegs[i].topY;
              const gapTopY = lowerDoorSegs[i + 1].bottomY;
              const gapMm = Math.round((gapTopY - gapBottomY) / 0.01);
              if (gapMm > 0) {
                allLowerDoorSegs.push({
                  bottomY: gapBottomY,
                  topY: gapTopY,
                  heightMm: gapMm,
                  key: `door-gap-${i}`,
                  isUpper: false
                });
              }
            }
          }

          return (
            <>
              {/* 하부장/키큰장 도어: 기존 우측 고정 위치 */}
              {allLowerDoorSegs.map((seg) => (
                <group key={`r-door-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, dimExtZ], [0, seg.bottomY, dimZ]]} color={dimensionColor} />
                  <ExtLine points={[[0, seg.topY, dimExtZ], [0, seg.topY, dimZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, dimZ], [0, seg.topY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, dimZ], [0.008, seg.bottomY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, dimZ], [0.008, seg.topY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, dimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
              {/* 상부장 도어: 가구 앞면 바로 우측 */}
              {upperDoorSegs.map((seg) => (
                <group key={`r-upper-door-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, upperDimExtZ], [0, seg.bottomY, upperDimZ]]} color={dimensionColor} />
                  <ExtLine points={[[0, seg.topY, upperDimExtZ], [0, seg.topY, upperDimZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, upperDimZ], [0, seg.topY, upperDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, upperDimZ], [0.008, seg.bottomY, upperDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, upperDimZ], [0.008, seg.topY, upperDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, upperDimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}
              {/* 하부장 도어 하단갭: 바닥(또는 바닥마감재 상단) ~ 도어 최하단 */}
              {(() => {
                if (allLowerDoorSegs.length === 0) return null;
                // 도어 관련 세그먼트 중 가장 낮은 bottomY 찾기
                const lowestBottomY = Math.min(...allLowerDoorSegs.map(s => s.bottomY));
                const bottomStartY = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                const bottomGapMm = Math.round((lowestBottomY - bottomStartY) / 0.01);
                if (bottomGapMm <= 0) return null;
                return (
                  <group key="r-door-bottomgap">
                    <ExtLine points={[[0, bottomStartY, dimExtZ], [0, bottomStartY, dimZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line" points={[[0, bottomStartY, dimZ], [0, lowestBottomY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, bottomStartY, dimZ], [0.008, bottomStartY, dimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <Text position={[0, (bottomStartY + lowestBottomY) / 2, dimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                      {bottomGapMm}
                    </Text>
                  </group>
                );
              })()}
            </>
          );
        })()}

        {/* 바닥마감재 치수 (별도 위치, 좌측뷰) — 하부장은 왼쪽 2단에서 표시, 상부장은 받침대 없으므로 제외 */}
        {floorFinishHeightMm > 0 && !isFloating && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (
        <group>
            {/* 보조 가이드 연장선 - 바닥 */}
            <ExtLine points={[[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)], [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]]} color={dimensionColor} />
            {/* 보조 가이드 연장선 - 마감재 상단 */}
            <ExtLine points={[[0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)], [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]]} color={dimensionColor} />
            {/* 메인 치수선 (바닥 ~ 마감재 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.008, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {floorFinishHeightMm}
            </Text>
        </group>
        )}

        {/* 받침대 높이 (마감재 상단 ~ 받침대 상단, 좌측뷰) — 하부장은 왼쪽 2단에서 표시, 상부장은 받침대 없으므로 제외 */}
        {baseFrameHeightMm > 0 && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (
        <group>
            {/* 보조 가이드 연장선 - 시작 (마감재 상단 or 바닥) */}
            <ExtLine points={[[0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)], [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]]} color={dimensionColor} />
            {/* 보조 가이드 연장선 - 받침대 상단 */}
            <ExtLine points={[[0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)], [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]]} color={dimensionColor} />
            {/* 메인 치수선 (마감재 상단 ~ 받침대 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 시작 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 받침대 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.008, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {baseFrameDisplayMm}
            </Text>
        </group>
        )}


        {/* 하부장/상부장: 바닥 ~ 가구 상단 합산 치수 (바닥마감재 + 하부프레임 + 가구높이) */}
        {(selectedModCategory === 'lower' || selectedModCategory === 'upper') && selectedMod && (() => {
          let selModData = getModuleById(
            selectedMod.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!selModData) {
            selModData = buildModuleDataFromPlacedModule(selectedMod, internalSpace, spaceInfo);
          }
          if (!selModData) return null;
          const selFurnitureHeightMm = computeFurnitureHeightMm(selectedMod, selModData, spaceInfo, internalSpace);
          // 하부장 + 상판: 상판 두께를 총 높이에 포함 (PET=18.5, 인조대리석=선택값)
          const selModCatCombined = getModuleCategory(selectedMod);
          const stoneThicknessCombined = _stoneTopThk(selectedMod);
          const stoneAddition = (selModCatCombined === 'lower' && stoneThicknessCombined > 0) ? stoneThicknessCombined : 0;
          const totalFromFloorMm = Math.round(floorFinishHeightMm + baseFrameHeightMm + selFurnitureHeightMm + stoneAddition);
          const totalFromFloorY = mmToThreeUnits(totalFromFloorMm);
          // 가구 도어 앞면 Z 계산 (도어 치수와 동일 기준)
          const panelDepthMm_c = spaceInfo.depth || 1500;
          const furnitureDepthMm_c = Math.min(panelDepthMm_c, 600);
          const zOff_c = -mmToThreeUnits(panelDepthMm_c) / 2;
          const fzOff_c = zOff_c + (mmToThreeUnits(panelDepthMm_c) - mmToThreeUnits(furnitureDepthMm_c)) / 2;
          const doorFrontZ_c = fzOff_c + mmToThreeUnits(furnitureDepthMm_c) / 2;
          // 합산 치수: 도어 앞면에서 300mm 바깥 (도어 치수 150mm + 간격 150mm)
          const dimZ_combined = doorFrontZ_c + mmToThreeUnits(300);
          const dimZ_combined_ext = doorFrontZ_c + mmToThreeUnits(30);
          return (
            <group>
              {/* 보조 가이드 연장선 - 바닥 */}
              <ExtLine points={[[0, 0, dimZ_combined_ext], [0, 0, dimZ_combined]]} color={dimensionColor} />
              {/* 보조 가이드 연장선 - 가구 상단 */}
              <ExtLine points={[[0, totalFromFloorY, dimZ_combined_ext], [0, totalFromFloorY, dimZ_combined]]} color={dimensionColor} />
              {/* 메인 치수선 (바닥 ~ 가구 상단) */}
              <NativeLine name="dimension_line"
                points={[[0, 0, dimZ_combined], [0, totalFromFloorY, dimZ_combined]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              {/* 티크 마크 - 바닥 */}
              <NativeLine name="dimension_line"
                points={[[-0.008, 0, dimZ_combined], [0.008, 0, dimZ_combined]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              {/* 티크 마크 - 가구 상단 */}
              <NativeLine name="dimension_line"
                points={[[-0.008, totalFromFloorY, dimZ_combined], [0.008, totalFromFloorY, dimZ_combined]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <Text
                position={[0, totalFromFloorY / 2, dimZ_combined + mmToThreeUnits(60)]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={1000} depthTest={false}
                rotation={[0, -Math.PI / 2, Math.PI / 2]}
              >
                {totalFromFloorMm}
              </Text>
            </group>
          );
        })()}

        {/* ===== 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 ===== */}
        {visibleFurniture.map((module, index) => {
          let depthModuleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!depthModuleData) {
            depthModuleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
          }
          if (!depthModuleData) return null;

          const mod = module as PlacedModule;
          const modCategory = getModuleCategory(mod);
          const isLowerMod = modCategory === 'lower';

          // 신발장 계열 판별 (entryway / shelf / Ndrawer-shelf — upper-cabinet-shelf 제외)
          const midSideCheck = mod.moduleId || '';
          const keyForShoe = midSideCheck.replace(/-[\d.]+$/, '');
          const isEntrywayH = midSideCheck.includes('-entryway-');
          const isShelfDrawer = midSideCheck.includes('-4drawer-shelf-') || midSideCheck.includes('-2drawer-shelf-');
          const isPlainShelf = /(^|-)shelf$/.test(keyForShoe) && !midSideCheck.includes('upper-cabinet-');
          const isShoeCategory = (isEntrywayH || isShelfDrawer || isPlainShelf) && !midSideCheck.includes('upper-cabinet-');

          // 현관장 H(entryway-h)는 dimensions.depth가 도어 포함 400mm → 도어 20 차감
          const DOOR_THK_MM = 20;
          // 신발장 하부섹션 기본 깊이 (실제 가구 패널 기준)
          const SHOE_LOWER_DEFAULT_MM = 380;

          // 우선순위:
          // - 일반 가구: upper/lowerSectionDepth > customDepth > dimensions.depth
          // - 신발장: customDepth가 설정되어 있고 섹션이 dimensions.depth(600 초기값)면
          //   customDepth 우선(잘못 저장된 600 무시). 섹션이 다른 값이면 사용자 설정 존중.
          const hasCustomDepth = typeof module.customDepth === 'number' && module.customDepth > 0;
          const baseFallback = isShoeCategory ? 380 : depthModuleData.dimensions.depth;
          const modDimDepth = depthModuleData.dimensions.depth;
          const resolveSectionDepth = (sectionVal: number | undefined): number => {
            if (isShoeCategory && hasCustomDepth && sectionVal === modDimDepth) {
              // 신발장: 섹션이 모듈 dimensions.depth(600)와 동일한 초기값이면 customDepth 우선
              return module.customDepth!;
            }
            return sectionVal ?? (hasCustomDepth ? module.customDepth! : baseFallback);
          };
          const upperDepthRaw = resolveSectionDepth(module.upperSectionDepth);
          const lowerDepthRaw = resolveSectionDepth(module.lowerSectionDepth);

          // 현관장 H는 dimensions.depth(400 도어포함) 기반일 때만 20 차감
          // 섹션별 depth 또는 customDepth는 이미 실제값
          const upperUsesDimDepth = module.upperSectionDepth === undefined && !hasCustomDepth;
          const lowerUsesDimDepth = module.lowerSectionDepth === undefined && !hasCustomDepth;
          const upperDepth = (upperUsesDimDepth && isEntrywayH) ? Math.max(0, upperDepthRaw - DOOR_THK_MM) : upperDepthRaw;
          const lowerDepth = (lowerUsesDimDepth && isEntrywayH) ? Math.max(0, lowerDepthRaw - DOOR_THK_MM) : lowerDepthRaw;
          // 2섹션 구조면 상/하부 분리 표시
          // 판정: 신발장 카테고리 / upper·lowerSectionDepth 둘 다 정의 /
          //      customSections 길이>=2 / modelConfig.sections 길이>=2 (의류장 붙박이장 B 등)
          const cfgSections = (module as any).customSections;
          const mdSections = depthModuleData.modelConfig?.sections;
          const hasTwoSections = (Array.isArray(cfgSections) && cfgSections.length >= 2)
            || (Array.isArray(mdSections) && mdSections.length >= 2);
          const isShoeTwoSection = isShoeCategory
            || (module.upperSectionDepth !== undefined && module.lowerSectionDepth !== undefined)
            || hasTwoSections;

          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);
          const moduleDepthLower = mmToThreeUnits(lowerDepth);

          // 가구 위치 계산 (FurnitureItem.tsx와 동일)
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;

          // 가구 깊이 치수: 하부장은 가구 바닥 아래, 키큰장/상부장은 가구 상단 위
          const isUpperMod = modCategory === 'upper';
          const modHeightMm = isLowerMod
            ? computeFurnitureHeightMm(mod, depthModuleData, spaceInfo, internalSpace)
            : isUpperMod
              ? computeFurnitureHeightMm(mod, depthModuleData, spaceInfo, internalSpace)
              : adjustedInternalHeightMm;
          const modHeight = mmToThreeUnits(modHeightMm);

          // 상부장: 천장 기준 Y 계산 (FurnitureItem.tsx와 동일)
          const depthEffectiveH = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          let furnitureTopEdge: number;
          let furnitureBottomEdge: number;
          if (isUpperMod) {
            const topFrameVal = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
            const cabinetTopMm = depthEffectiveH - topFrameVal;
            const cabinetBottomMm = cabinetTopMm - modHeightMm;
            furnitureTopEdge = mmToThreeUnits(cabinetTopMm);
            furnitureBottomEdge = mmToThreeUnits(cabinetBottomMm);
          } else {
            furnitureBottomEdge = furnitureBaseY;
            furnitureTopEdge = furnitureBaseY + modHeight;
          }

          const depthDimY = isLowerMod
            ? furnitureBottomEdge - mmToThreeUnits(200)    // 하부장: 가구 바닥 아래
            : furnitureTopEdge + mmToThreeUnits(200); // 키큰장/상부장: 가구 상단 위
          const depthDimEdge = isLowerMod ? furnitureBottomEdge : furnitureTopEdge;

          // 신발장 하부섹션 치수 위치 (가구 바닥 아래)
          const depthDimYLower = furnitureBottomEdge - mmToThreeUnits(200);
          const depthDimEdgeLower = furnitureBottomEdge;

          // Z축 위치 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 공간 깊이
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const midSide = mod.moduleId || '';
          const isShoeSide = midSide.includes('-entryway-') || midSide.includes('-shelf-') || midSide.includes('-4drawer-shelf-') || midSide.includes('-2drawer-shelf-');
          // 가구 기본 공간 기준 깊이로 섹션 중심 Z 기본 공식 계산 후
          // direction에 따라 추가 오프셋을 적용 (SectionsRenderer 로직과 일치)
          // - 앞면 정렬(의류장/하부장 기본): frontZ 고정, depth 줄이면 중심이 앞쪽 부근 유지
          // - 뒷면 정렬(상부장/신발장/뒤고정): backZ 고정, depth 줄이면 중심이 뒤쪽 부근 유지
          // 신발장은 실제 가구 기본 depth 380 기준 (의류장은 600)
          const baseModuleDepthMm = isShoeSide
            ? (module.customDepth || 380)
            : depthModuleData.dimensions.depth;
          const baseModuleDepth = mmToThreeUnits(baseModuleDepthMm);
          const baseFrontZ = furnitureZOffset + furnitureDepth / 2 - doorThickness - baseModuleDepth / 2;
          const baseBackZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + baseModuleDepth / 2;

          // 상부섹션/단일 섹션 Z
          const upperDir = (mod.upperSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const upperDiff = baseModuleDepth - moduleDepth;
          const upperOffset = upperDiff === 0 ? 0 : upperDir === 'back' ? upperDiff / 2 : -upperDiff / 2;
          let furnitureZ: number;
          if (isUpperMod || isShoeSide) {
            // 뒷면 정렬 기준: 중심 = baseBack + directionOffset
            furnitureZ = baseBackZ + upperOffset;
          } else {
            // 앞면 정렬 기준: 중심 = baseFront + directionOffset
            furnitureZ = baseFrontZ + upperOffset;
          }

          // 하부 섹션 Z
          const lowerDir = (mod.lowerSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const lowerDiff = baseModuleDepth - moduleDepthLower;
          const lowerOffset = lowerDiff === 0 ? 0 : lowerDir === 'back' ? lowerDiff / 2 : -lowerDiff / 2;
          const furnitureZLower = isShoeTwoSection
            ? (isShoeSide
                ? baseBackZ + lowerOffset  // 신발장 하부: 뒷면 정렬
                : baseFrontZ + lowerOffset) // 의류장 하부: 앞면 정렬
            : furnitureZ;

          // 하부프레임 옵셋 깊이 (하부장 전용)
          const baseFrameOffsetMm = isLowerMod
            ? (mod.baseFrameOffset ?? 65)
            : 0;
          const baseFrameOffsetDepth = mmToThreeUnits(baseFrameOffsetMm);

          return (
            <group key={`furniture-depth-${index}`}>
              {/* 상부섹션(또는 단일) 가구 깊이 — 상단 */}
              {/* 보조 가이드 연장선 - 앞쪽 */}
              <ExtLine points={[[0, depthDimEdge, furnitureZ + moduleDepth/2], [0, depthDimY, furnitureZ + moduleDepth/2]]} color={dimensionColor} />
              {/* 보조 가이드 연장선 - 뒤쪽 */}
              <ExtLine points={[[0, depthDimEdge, furnitureZ - moduleDepth/2], [0, depthDimY, furnitureZ - moduleDepth/2]]} color={dimensionColor} />
              {/* 가구 깊이 치수선 */}
              <NativeLine name="dimension_line"
                points={[[0, depthDimY, furnitureZ - moduleDepth/2], [0, depthDimY, furnitureZ + moduleDepth/2]]}
                color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 앞쪽 티크 */}
              <NativeLine name="dimension_line"
                points={[[0 - 0.02, depthDimY, furnitureZ + moduleDepth/2], [0 + 0.02, depthDimY, furnitureZ + moduleDepth/2]]}
                color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 뒤쪽 티크 */}
              <NativeLine name="dimension_line"
                points={[[0 - 0.02, depthDimY, furnitureZ - moduleDepth/2], [0 + 0.02, depthDimY, furnitureZ - moduleDepth/2]]}
                color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
              />
              {/* 가구 깊이 텍스트 */}
              <Text
                position={[0, depthDimY + mmToThreeUnits(isLowerMod ? -40 : 40), furnitureZ]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={1000} depthTest={false}
                rotation={[0, -Math.PI / 2, 0]}
              >
                {customDepth}
              </Text>

              {/* ─── 2섹션 가구 하부섹션 깊이 — 하단에 별도 표시 ─── */}
              {isShoeTwoSection && (
                <>
                  {/* 보조 가이드 연장선 - 앞쪽 */}
                  <ExtLine points={[[0, depthDimEdgeLower, furnitureZLower + moduleDepthLower/2], [0, depthDimYLower, furnitureZLower + moduleDepthLower/2]]} color={dimensionColor} />
                  {/* 보조 가이드 연장선 - 뒤쪽 */}
                  <ExtLine points={[[0, depthDimEdgeLower, furnitureZLower - moduleDepthLower/2], [0, depthDimYLower, furnitureZLower - moduleDepthLower/2]]} color={dimensionColor} />
                  {/* 하부섹션 깊이 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[0, depthDimYLower, furnitureZLower - moduleDepthLower/2], [0, depthDimYLower, furnitureZLower + moduleDepthLower/2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  {/* 앞쪽 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, depthDimYLower, furnitureZLower + moduleDepthLower/2], [0 + 0.02, depthDimYLower, furnitureZLower + moduleDepthLower/2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  {/* 뒤쪽 티크 */}
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, depthDimYLower, furnitureZLower - moduleDepthLower/2], [0 + 0.02, depthDimYLower, furnitureZLower - moduleDepthLower/2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  {/* 하부섹션 깊이 텍스트 */}
                  <Text
                    position={[0, depthDimYLower - mmToThreeUnits(40), furnitureZLower]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={1000} depthTest={false}
                    rotation={[0, -Math.PI / 2, 0]}
                  >
                    {lowerDepth}
                  </Text>
                </>
              )}

              {/* 상부장 하부마감판 깊이 치수 + 뒤쪽 갭 치수 */}
              {isUpperMod && (() => {
                const finishDepthMm = customDepth - 35;
                const finishDepth = mmToThreeUnits(finishDepthMm);
                const finishZ = furnitureZ + mmToThreeUnits(17.5);
                const finishDimY = furnitureBottomEdge - mmToThreeUnits(80);
                const cabinetBackZ = furnitureZ - moduleDepth / 2;
                const finishBackZ = finishZ - finishDepth / 2;
                const offsetMm = 35;

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge, finishZ + finishDepth/2], [0, finishDimY, finishZ + finishDepth/2]]} color={dimensionColor} />

                    {/* 보조 가이드 연장선 - 마감판 뒤쪽 (갭 치수선 높이까지) */}
                    <ExtLine points={[[0, furnitureBottomEdge, finishBackZ], [0, finishDimY, finishBackZ]]} color={dimensionColor} />

                    {/* 보조 가이드 연장선 - 가구 뒤쪽 (갭 치수선 높이까지) */}
                    <ExtLine points={[[0, furnitureBottomEdge, cabinetBackZ], [0, finishDimY, cabinetBackZ]]} color={dimensionColor} />

                    {/* 마감판 깊이 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, finishDimY, finishBackZ], [0, finishDimY, finishZ + finishDepth/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 앞쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY, finishZ + finishDepth/2], [0 + 0.02, finishDimY, finishZ + finishDepth/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 뒤쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY, finishBackZ], [0 + 0.02, finishDimY, finishBackZ]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 마감판 깊이 텍스트 */}
                    <Text
                      position={[0, finishDimY - mmToThreeUnits(40), finishZ]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {finishDepthMm}
                    </Text>

                    {/* 갭 치수선 (가구 뒷면 ~ 마감판 뒷면 = 35mm) — 같은 높이 */}
                    <NativeLine name="dimension_line"
                      points={[[0, finishDimY, cabinetBackZ], [0, finishDimY, finishBackZ]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 갭 뒤쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY, cabinetBackZ], [0 + 0.02, finishDimY, cabinetBackZ]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    {/* 갭 텍스트 */}
                    <Text
                      position={[0, finishDimY - mmToThreeUnits(40), (cabinetBackZ + finishBackZ) / 2]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {offsetMm}
                    </Text>
                  </group>
                );
              })()}

              {/* 하부프레임 옵셋 깊이 치수 (하부장 전용) — hasBase=false이면 숨김 */}
              {isLowerMod && baseFrameOffsetMm > 0 && mod.hasBase !== false && (() => {
                // 하부프레임은 가구 앞면(도어면)에서 옵셋만큼 뒤로 들어감
                const frontZ = furnitureZOffset + furnitureDepth/2 - doorThickness;
                const offsetBackZ = frontZ - baseFrameOffsetDepth;

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 (절반 길이, 위에서 시작) */}
                    <ExtLine points={[[0, depthDimEdge, frontZ], [0, (depthDimEdge + depthDimY) / 2, frontZ]]} color={dimensionColor} />
                    {/* 보조 가이드 연장선 - 뒤쪽 (절반 길이, 위에서 시작) */}
                    <ExtLine points={[[0, depthDimEdge, offsetBackZ], [0, (depthDimEdge + depthDimY) / 2, offsetBackZ]]} color={dimensionColor} />

                    {/* 하부프레임 옵셋 깊이 치수선 (연장선 끝점 = 중간) */}
                    <NativeLine name="dimension_line"
                      points={[[0, (depthDimEdge + depthDimY) / 2, offsetBackZ], [0, (depthDimEdge + depthDimY) / 2, frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    {/* 앞쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, (depthDimEdge + depthDimY) / 2, frontZ], [0 + 0.02, (depthDimEdge + depthDimY) / 2, frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    {/* 뒤쪽 티크 */}
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, (depthDimEdge + depthDimY) / 2, offsetBackZ], [0 + 0.02, (depthDimEdge + depthDimY) / 2, offsetBackZ]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    {/* 하부프레임 옵셋 깊이 텍스트 */}
                    <Text
                      position={[0, (depthDimEdge + depthDimY) / 2 - mmToThreeUnits(40), (frontZ + offsetBackZ) / 2]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={1000}
                      depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {baseFrameOffsetMm}
                    </Text>
                  </group>
                );
              })()}

              {/* 구 하부섹션 깊이 치수 블록 제거 (신발장용은 isShoeTwoSection 블록에서 도어 차감하여 표시) */}
            </group>
          );
        })}

        {/* ===== 단내림 구간 선택 시 단내림 벽 표시 (빗금 패턴) ===== */}
        {isSelectedSlotInDroppedZone && (() => {
          // 보이는 가구의 깊이 가져오기 (가구가 없으면 기본값 600mm 사용)
          let actualFurnitureDepthMm = 600;
          if (visibleFurniture.length > 0) {
            const visibleModule = visibleFurniture[0];
            const visibleModuleData = getModuleById(
              visibleModule.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            // 상부섹션 깊이 우선 사용 (가구 치수 표시와 동일)
            actualFurnitureDepthMm = visibleModule.upperSectionDepth || visibleModule.customDepth || visibleModuleData?.dimensions.depth || 600;
          }
          const actualFurnitureDepth = mmToThreeUnits(actualFurnitureDepthMm);

          // 빗금 해칭 패턴 생성
          const hatchLines: JSX.Element[] = [];
          const hatchSpacing = mmToThreeUnits(40); // 40mm 간격
          const hatchColor = view2DTheme === 'dark' ? '#FFD700' : '#999999';

          // 가구 Z 위치 계산 (가구 치수와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const baseFurnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const baseFurnitureDepth = mmToThreeUnits(baseFurnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - baseFurnitureDepth) / 2;
          // 가구 Z 위치 (가구 치수 표시와 동일한 방식)
          const furnitureZ = furnitureZOffset + baseFurnitureDepth/2 - doorThickness - actualFurnitureDepth/2;
          // 가구 뒷면과 앞면 Z 위치
          const furnitureBackZ = furnitureZ - actualFurnitureDepth/2;
          const furnitureFrontZ = furnitureZ + actualFurnitureDepth/2;

          // 단내림 벽 영역: Z방향으로 가구 깊이만큼, Y방향으로 dropHeight
          const wallStartZ = furnitureBackZ;
          const wallEndZ = furnitureFrontZ;
          const wallDepth = wallEndZ - wallStartZ;
          const wallStartY = displaySpaceHeight;
          const wallEndY = spaceHeight;

          // 대각선 빗금 생성 (좌하단에서 우상단으로)
          const startOffset = -dropHeight;
          const endOffset = wallDepth;
          const hatchCount = Math.ceil((endOffset - startOffset) / hatchSpacing) + 1;

          for (let i = 0; i <= hatchCount; i++) {
            const offset = startOffset + i * hatchSpacing;

            // 시작점과 끝점 계산 (Z-Y 평면에서)
            let startZ = wallStartZ + offset;
            let startY = wallStartY;
            let endZ = startZ + dropHeight;
            let endY = wallEndY;

            // 클리핑
            if (startZ < wallStartZ) {
              const diff = wallStartZ - startZ;
              startZ = wallStartZ;
              startY = wallStartY + diff;
            }
            if (endZ > wallEndZ) {
              const diff = endZ - wallEndZ;
              endZ = wallEndZ;
              endY = wallEndY - diff;
            }

            // 유효한 선분인지 확인
            if (startZ < wallEndZ && endZ > wallStartZ && startY < wallEndY && endY > wallStartY) {
              hatchLines.push(
                <NativeLine
                  key={`hatch-left-${i}`}
                  name="hatch_line"
                  points={[
                    [0, startY, startZ],
                    [0, endY, endZ]
                  ]}
                  color={hatchColor}
                  lineWidth={0.3}
                  renderOrder={100000}
                  depthTest={false}
                />
              );
            }
          }

          return (
            <group>
              {/* 회색 반투명 배경 메쉬 (정면도와 동일) */}
              <mesh
                position={[0, (wallStartY + wallEndY) / 2, (wallStartZ + wallEndZ) / 2]}
                rotation={[0, -Math.PI / 2, 0]}
                renderOrder={99998}
              >
                <planeGeometry args={[wallDepth, dropHeight]} />
                <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
              </mesh>
              {/* 단내림 벽 테두리 */}
              <NativeLine
                name="dropped_ceiling_border"
                points={[
                  [0, wallStartY, wallStartZ],
                  [0, wallEndY, wallStartZ],
                  [0, wallEndY, wallEndZ],
                  [0, wallStartY, wallEndZ],
                  [0, wallStartY, wallStartZ]
                ]}
                color={hatchColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />
              {/* 빗금 패턴 */}
              {hatchLines}
            </group>
          );
        })()}

        {/* ===== 도어/마이다 높이 치수선 ===== */}
        {(() => {
          // 도어 치수선 Z 위치 (공통)
          const panelDepthMm = spaceInfo.depth || 1500;
          const panelDepthU = mmToThreeUnits(panelDepthMm);
          const furnitureDepthU = mmToThreeUnits(600);
          const furnitureFrontZ = -panelDepthU / 2 + (panelDepthU - furnitureDepthU) / 2 + furnitureDepthU / 2;
          const doorDimZ = furnitureFrontZ + mmToThreeUnits(150);
          const doorExtStartZ = furnitureFrontZ + mmToThreeUnits(30);
          const doorTextOffsetZ = mmToThreeUnits(60);
          const doorColor = dimensionColor;

          // 측면뷰에 보이는 가구만 대상 (visibleFurniture 기반)
          const visibleIds = new Set(visibleFurniture.map(m => m.id));
          // 도어 달린 가구만 필터 (인덕션장도 hasDoor=true일 때만)
          const doorModules = placedModules.filter(m =>
            !m.isSurroundPanel && visibleIds.has(m.id) && m.hasDoor
          );
          if (doorModules.length === 0) return null;

          const effectiveH = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          const elements: JSX.Element[] = [];

          doorModules.forEach((mod, modIdx) => {
            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod as PlacedModule, internalSpace, spaceInfo);

            const modCategory = modData?.category
              ?? (mod.moduleId.includes('-upper-') ? 'upper'
                : mod.moduleId.startsWith('lower-') ? 'lower' : 'full');

            // 서랍/마이다 모듈 체크 (인덕션장 포함)
            const isDrawerModule = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');

            if (modCategory === 'lower' && isDrawerModule) {
              // 서랍 모듈: 마이다 개별 높이
              const modHeightMm = modData ? computeFurnitureHeightMm(mod as PlacedModule, modData, spaceInfo, internalSpace) : 0;
              // 모듈별 기본 doorTopGap (computeLowerCabinetMaidaHeights 내부 defaultDTG와 일치해야 함)
              const isDL = mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-');
              const isTD = mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-');
              const modDefaultTopGap = isDL ? 30 : isTD ? -80 : -20;
              // doorTopGap이 undefined/0(이전 버그)이면 모듈별 기본값 사용
              const effectiveTopGap = (mod.doorTopGap === undefined || mod.doorTopGap === 0) ? modDefaultTopGap : mod.doorTopGap;
              const effectiveBotGap = (mod.doorBottomGap === undefined || mod.doorBottomGap === 0) ? 5 : mod.doorBottomGap;
              const lowerMaidas = computeLowerCabinetMaidaHeights(mod.moduleId, modHeightMm, effectiveTopGap, effectiveBotGap);
              if (lowerMaidas && lowerMaidas.length > 0) {
                const cabinetBottomY = furnitureBaseY;

                const gaps: { bottomMm: number; topMm: number; heightMm: number }[] = [];
                // 하단 갭: 캐비넷 바닥 ~ 마이다 하단 (캐비넷 내부 기준, maidaBottomMm > 0일 때만)
                const firstMaida = lowerMaidas[0];
                const floorToMaidaBottomMm = baseFrameHeightMm + firstMaida.maidaBottomMm;
                if (firstMaida.maidaBottomMm > 0) {
                  gaps.push({ bottomMm: 0, topMm: firstMaida.maidaBottomMm, heightMm: Math.round(firstMaida.maidaBottomMm) });
                }
                // maidaBottomMm < 0인 경우 (인덕션장): 바닥~마이다하단 치수는 마이다 그룹 밖에서 별도 렌더링
                // 마이다 사이 갭
                for (let gi = 0; gi < lowerMaidas.length - 1; gi++) {
                  const gapBotMm = lowerMaidas[gi].maidaTopMm;
                  const gapTopMm = lowerMaidas[gi + 1].maidaBottomMm;
                  if (gapTopMm - gapBotMm > 0) {
                    gaps.push({ bottomMm: gapBotMm, topMm: gapTopMm, heightMm: Math.round(gapTopMm - gapBotMm) });
                  }
                }
                // 상단 갭: 마지막 마이다 상단 ~ 캐비넷 상단
                const lastMaida = lowerMaidas[lowerMaidas.length - 1];
                const topGapTotal = modHeightMm - lastMaida.maidaTopMm;
                if (topGapTotal > 0) {
                  // 상판내림 + 상판: 20mm 갭 + 앞판 높이 (PET=18.5 / 인조대리석=선택값)
                  const _effStT_l3 = _stoneTopThk(mod);
                  if (isTD && _effStT_l3 > 0) {
                    const doorGapMm = 20;
                    if (doorGapMm < topGapTotal) {
                      const frontPlateHeight = (topGapTotal - doorGapMm) + _effStT_l3;
                      gaps.push({ bottomMm: lastMaida.maidaTopMm, topMm: lastMaida.maidaTopMm + doorGapMm, heightMm: doorGapMm });
                      gaps.push({ bottomMm: lastMaida.maidaTopMm + doorGapMm, topMm: modHeightMm + _effStT_l3, heightMm: frontPlateHeight });
                    } else {
                      gaps.push({ bottomMm: lastMaida.maidaTopMm, topMm: modHeightMm, heightMm: Math.round(topGapTotal) });
                    }
                  } else {
                    gaps.push({ bottomMm: lastMaida.maidaTopMm, topMm: modHeightMm, heightMm: Math.round(topGapTotal) });
                  }
                }

                elements.push(
                  <group key={`door-maida-group-${modIdx}`}>
                    {lowerMaidas.map((m, i) => {
                      const dBotY = cabinetBottomY + mmToThreeUnits(m.maidaBottomMm);
                      const dTopY = cabinetBottomY + mmToThreeUnits(m.maidaTopMm);
                      return (
                        <group key={`door-maida-${modIdx}-${i}`}>
                          <NativeLine name="door_height_dim" points={[[0, dBotY, doorDimZ], [0, dTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, dBotY, doorDimZ], [0.008, dBotY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, dTopY, doorDimZ], [0.008, dTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text position={[0, (dBotY + dTopY) / 2, doorDimZ + doorTextOffsetZ]} fontSize={largeFontSize} color={doorColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                            {Number.isInteger(m.maidaHeightMm) ? m.maidaHeightMm.toString() : (Math.round(m.maidaHeightMm * 10) / 10).toString()}
                          </Text>
                          <ExtLine points={[[0, dTopY, doorExtStartZ], [0, dTopY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="door_height_ext" />
                          <ExtLine points={[[0, dBotY, doorExtStartZ], [0, dBotY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="door_height_ext" />
                        </group>
                      );
                    })}
                    {gaps.map((gap, gi) => {
                      const gBotY = cabinetBottomY + mmToThreeUnits(gap.bottomMm);
                      const gTopY = cabinetBottomY + mmToThreeUnits(gap.topMm);
                      return (
                        <group key={`door-gap-${modIdx}-${gi}`}>
                          <NativeLine name="door_height_dim" points={[[0, gBotY, doorDimZ], [0, gTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, gBotY, doorDimZ], [0.008, gBotY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, gTopY, doorDimZ], [0.008, gTopY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text position={[0, (gBotY + gTopY) / 2, doorDimZ + doorTextOffsetZ]} fontSize={largeFontSize} color={doorColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                            {gap.heightMm}
                          </Text>
                          <ExtLine points={[[0, gTopY, doorExtStartZ], [0, gTopY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="door_height_ext" />
                          <ExtLine points={[[0, gBotY, doorExtStartZ], [0, gBotY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="door_height_ext" />
                        </group>
                      );
                    })}
                  </group>
                );

                // 바닥 ~ 마이다 하단 치수 (마이다 그룹과 별도로 하단 영역에 표시)
                if (firstMaida.maidaBottomMm < 0 && Math.abs(floorToMaidaBottomMm) >= 1) {
                  const bottomStartY = floorFinishHeightMm > 0 ? mmToThreeUnits(floorFinishHeightMm) : 0;
                  const maidaBottomAbsY = floorFinishY + mmToThreeUnits(floorToMaidaBottomMm);
                  const floorToMaidaDispMm = Math.round(floorToMaidaBottomMm);
                  elements.push(
                    <group key={`maida-floor-gap-${modIdx}`}>
                      <ExtLine points={[[0, bottomStartY, doorExtStartZ], [0, bottomStartY, doorDimZ]]} color={doorColor} lineWidth={0.3} name="door_height_ext" />
                      <NativeLine name="door_height_dim" points={[[0, bottomStartY, doorDimZ], [0, maidaBottomAbsY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <NativeLine name="door_height_dim" points={[[-0.008, bottomStartY, doorDimZ], [0.008, bottomStartY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <NativeLine name="door_height_dim" points={[[-0.008, maidaBottomAbsY, doorDimZ], [0.008, maidaBottomAbsY, doorDimZ]]} color={doorColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                      <Text position={[0, (bottomStartY + maidaBottomAbsY) / 2, doorDimZ + doorTextOffsetZ]} fontSize={largeFontSize} color={doorColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, -Math.PI / 2, Math.PI / 2]}>
                        {floorToMaidaDispMm}
                      </Text>
                    </group>
                  );
                }

                return; // this module done
              }
            }
            // 마이다가 없는 단일 도어 가구는 첫 번째 도어 치수 블록에서 이미 처리됨
          });

          return elements.length > 0 ? <group>{elements}</group> : null;
        })()}
      </group>
    );
  }

  // 우측뷰인 경우 (좌측뷰와 대칭)
  if (currentViewDirection === 'right') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {/* 단내림 구간이 선택된 경우 단내림 높이를 표시 */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <ExtLine points={[[0, 0, leftExtStartZ], [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 보조 가이드 연장선 - 상단 */}
          <ExtLine points={[[0, displaySpaceHeight, leftExtStartZ], [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]]} color={dimensionColor} />

          {/* 수직 치수선 */}
          <NativeLine name="dimension_line"
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, displaySpaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine name="dimension_line"
            points={[
              [-0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.008, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 높이 텍스트 */}
          <Text
            position={[0, displaySpaceHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={1000}
            depthTest={false}
            rotation={[0, Math.PI / 2, Math.PI / 2]}
          >
            {displaySpaceHeightMm}
          </Text>
        </group>}

        {/* ===== 왼쪽 2단: 몸통 사이즈 (segment-based, 모든 카테고리) — 우측뷰 ===== */}
        {visibleFurniture.length > 0 && (() => {
          const leftInnerZ = -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) + mmToThreeUnits(200);
          const leftInnerExtStartZ = leftExtStartZ;
          const effectiveH_rl2 = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          const segments_rl2: { bottomY: number; topY: number; heightMm: number; key: string }[] = [];
          const innerGapSegments_rl2: { bottomY: number; topY: number; heightMm: number; key: string }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            let moduleData = getModuleById(
              module.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!moduleData) moduleData = buildModuleDataFromPlacedModule(module as PlacedModule, internalSpace, spaceInfo);
            if (!moduleData) return;

            const mod = module as PlacedModule;
            const modCat_rl2 = getModuleCategory(mod);
            const moduleHeightMm = computeFurnitureHeightMm(mod, moduleData, spaceInfo, internalSpace);

            let cabinetBottomMm: number;
            let cabinetTopMm: number;

            if (modCat_rl2 === 'upper') {
              const topFrameVal = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
              cabinetTopMm = effectiveH_rl2 - topFrameVal;
              cabinetBottomMm = cabinetTopMm - moduleHeightMm;
            } else {
              cabinetBottomMm = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              cabinetTopMm = cabinetBottomMm + moduleHeightMm;
            }

            // 하부장 + 인조대리석: 가구 높이에 상판 두께 포함
            const stoneThicknessRL2 = _stoneTopThk(mod);
            const includeStoneInHeightRL2 = modCat_rl2 === 'lower' && stoneThicknessRL2 > 0;
            const displayHeightMmRL2 = includeStoneInHeightRL2 ? moduleHeightMm + stoneThicknessRL2 : moduleHeightMm;
            const displayTopMmRL2 = includeStoneInHeightRL2 ? cabinetTopMm + stoneThicknessRL2 : cabinetTopMm;

            // 2섹션 가구(의류장: 코트장/붙박이장B/D)는 섹션별로 분할하여 표시
            let didSplitSectionsRL2 = false;
            if (modCat_rl2 === 'full') {
              const sectionInfo = computeSectionHeightsInfo(mod, moduleData, moduleHeightMm, 'right');
              if (sectionInfo.heightsMm.length >= 2) {
                let cursorMm = cabinetBottomMm;
                sectionInfo.heightsMm.forEach((hMm, sIdx) => {
                  const sBottom = cursorMm;
                  const sTop = cursorMm + hMm;
                  segments_rl2.push({
                    bottomY: mmToThreeUnits(sBottom),
                    topY: mmToThreeUnits(sTop),
                    heightMm: Math.round(hMm),
                    key: `furniture-${moduleIndex}-sec${sIdx}`
                  });
                  cursorMm = sTop;
                });
                didSplitSectionsRL2 = true;
              }
            }

            if (!didSplitSectionsRL2) {
              segments_rl2.push({
                bottomY: mmToThreeUnits(cabinetBottomMm),
                topY: mmToThreeUnits(displayTopMmRL2),
                heightMm: Math.round(displayHeightMmRL2),
                key: `furniture-${moduleIndex}`
              });
            }

            // 하부장: 뒷턱 치수만 (상판 두께는 몸통에 합산됨)
            if (modCat_rl2 === 'lower') {
              const stoneThickness = _stoneTopThk(mod);

              // 뒷턱 치수 (상판 위에 추가)
              if (stoneThickness > 0) {
                const backLipH = mod.stoneTopBackLip || 0;
                if (backLipH > 0) {
                  segments_rl2.push({
                    bottomY: mmToThreeUnits(cabinetTopMm + stoneThickness),
                    topY: mmToThreeUnits(cabinetTopMm + stoneThickness + backLipH),
                    heightMm: backLipH,
                    key: `stone-backlip-${moduleIndex}`
                  });
                }
              }
            }
          });

          if (segments_rl2.length === 0) return null;
          segments_rl2.sort((a, b) => a.bottomY - b.bottomY);

          const allSegments_rl2: typeof segments_rl2 = [];
          for (let i = 0; i < segments_rl2.length; i++) {
            allSegments_rl2.push(segments_rl2[i]);
            if (i < segments_rl2.length - 1) {
              const gapBottomY = segments_rl2[i].topY;
              const gapTopY = segments_rl2[i + 1].bottomY;
              const gapMm = Math.round((gapTopY - gapBottomY) / 0.01);
              if (gapMm > 0) {
                allSegments_rl2.push({ bottomY: gapBottomY, topY: gapTopY, heightMm: gapMm, key: `gap-${i}` });
              }
            }
          }

          const hasLower_r = visibleFurniture.some(m => getModuleCategory(m as PlacedModule) === 'lower' || getModuleCategory(m as PlacedModule) === 'full');

          return (
            <group>
              {allSegments_rl2.map((seg) => (
                <group key={`rl2-sec-${seg.key}`}>
                  <ExtLine points={[[0, seg.bottomY, leftInnerExtStartZ], [0, seg.bottomY, leftInnerZ]]} color={dimensionColor} />
                  <ExtLine points={[[0, seg.topY, leftInnerExtStartZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, seg.bottomY, leftInnerZ], [0, seg.topY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, leftInnerZ], [0.008, seg.bottomY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, seg.topY, leftInnerZ], [0.008, seg.topY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, (seg.bottomY + seg.topY) / 2, leftInnerZ - mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                    {seg.heightMm}
                  </Text>
                </group>
              ))}

              {/* 도어 안쪽 갭 치수 (상판 윗면~도어 상단) — 우측뷰: 도어 치수선 바깥 */}
              {innerGapSegments_rl2.length > 0 && (() => {
                const panelDepthMm_ig = spaceInfo.depth || 1500;
                const furnitureDepthMm_ig = Math.min(panelDepthMm_ig, 600);
                const zOff_ig = -mmToThreeUnits(panelDepthMm_ig) / 2;
                const fzOff_ig = zOff_ig + (mmToThreeUnits(panelDepthMm_ig) - mmToThreeUnits(furnitureDepthMm_ig)) / 2;
                const doorFrontZ_ig = fzOff_ig + mmToThreeUnits(furnitureDepthMm_ig) / 2;
                const innerDimZ = doorFrontZ_ig + mmToThreeUnits(300);
                const innerExtStart = doorFrontZ_ig + mmToThreeUnits(180);
                return innerGapSegments_rl2.map((seg) => (
                  <group key={`inner-gap-${seg.key}`}>
                    <ExtLine points={[[0, seg.bottomY, innerExtStart], [0, seg.bottomY, innerDimZ]]} color={dimensionColor} />
                    <ExtLine points={[[0, seg.topY, innerExtStart], [0, seg.topY, innerDimZ]]} color={dimensionColor} />
                    <NativeLine name="dimension_line" points={[[0, seg.bottomY, innerDimZ], [0, seg.topY, innerDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, innerDimZ], [0.008, seg.bottomY, innerDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[-0.008, seg.topY, innerDimZ], [0.008, seg.topY, innerDimZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                    <Text position={[0, (seg.bottomY + seg.topY) / 2, innerDimZ + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                      {seg.heightMm}
                    </Text>
                  </group>
                ));
              })()}

              {hasLower_r && baseFrameHeightMm > 0 && (
                <>
                  <ExtLine points={[[0, floorFinishY, leftInnerExtStartZ], [0, floorFinishY, leftInnerZ]]} color={dimensionColor} />
                  <ExtLine points={[[0, furnitureBaseY, leftInnerExtStartZ], [0, furnitureBaseY, leftInnerZ]]} color={dimensionColor} />
                  <NativeLine name="dimension_line" points={[[0, floorFinishY, leftInnerZ], [0, furnitureBaseY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, floorFinishY, leftInnerZ], [0.008, floorFinishY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[-0.008, furnitureBaseY, leftInnerZ], [0.008, furnitureBaseY, leftInnerZ]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
                  <Text position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, leftInnerZ - mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                    {baseFrameDisplayMm}
                  </Text>
                </>
              )}
            </group>
          );
        })()}

        {/* ===== 오른쪽: 상부프레임 치수 제거됨 (좌측으로 이동) ===== */}

        {/* 우측뷰 — 우측 도어 사이즈 */}
        {(() => {
          // 가구 도어 앞면 기준 (좌측뷰와 동일)
          const panelDepthMm_rd = spaceInfo.depth || 1500;
          const furnitureDepthMm_rd = Math.min(panelDepthMm_rd, 600);
          const zOff_rd = -mmToThreeUnits(panelDepthMm_rd) / 2;
          const fzOff_rd = zOff_rd + (mmToThreeUnits(panelDepthMm_rd) - mmToThreeUnits(furnitureDepthMm_rd)) / 2;
          const doorFrontZ_rd = fzOff_rd + mmToThreeUnits(furnitureDepthMm_rd) / 2;
          const dimZ_r = doorFrontZ_rd + mmToThreeUnits(150);
          const dimExtZ_r = doorFrontZ_rd + mmToThreeUnits(30);
          const effectiveH_rd = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;

          const doorSegs_r: { bottomY: number; topY: number; heightMm: number; key: string }[] = [];

          visibleFurniture.forEach((module, moduleIndex) => {
            const mod = module as PlacedModule;
            if (!mod.hasDoor) return;

            // 서랍/마이다 모듈은 마이다 치수 블록에서 별도 처리 → 도어 치수 건너뜀
            const isDrawerMod = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');
            if (isDrawerMod) return;

            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod, internalSpace, spaceInfo);
            if (!modData) return;

            const modCat = getModuleCategory(mod);
            // 선택된 카테고리와 다른 카테고리의 도어는 건너뛰기 (중복 방지)
            if (selectedModCategory && selectedModCategory !== modCat) return;
            const moduleHeightMm = computeFurnitureHeightMm(mod, modData, spaceInfo, internalSpace);
            const doorTopGapVal = mod.doorTopGap ?? spaceInfo.doorTopGap ?? 0;
            const doorBottomGapVal = mod.doorBottomGap ?? spaceInfo.doorBottomGap ?? 0;

            let doorBottomAbsMm = 0;
            let doorTopAbsMm = 0;
            let doorHeightMm = 0;

            if (modCat === 'upper') {
              // 천장에서 상부장 바닥(마감판 하단)까지의 전체 높이
              const topFrameVal = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
              const finishPanelThickness = 18; // 하부마감판 18mm
              doorHeightMm = topFrameVal + moduleHeightMm + finishPanelThickness;
              doorTopAbsMm = effectiveH_rd;
              doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
            } else if (modCat === 'lower') {
              const cabinetH = modData.dimensions.height ?? 1000;
              const cabinetBottomAbs = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const isDoorLift = modData.id?.includes('lower-door-lift-');
              const isTopDown = modData.id?.includes('lower-top-down-');
              if (isTopDown) {
                doorHeightMm = 710;
                doorBottomAbsMm = cabinetBottomAbs - 5;
                doorTopAbsMm = doorBottomAbsMm + doorHeightMm;
              } else if (isDoorLift) {
                doorHeightMm = cabinetH + 5 + 30;
                doorTopAbsMm = cabinetBottomAbs + cabinetH + 30;
                doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
              } else {
                doorHeightMm = cabinetH + doorTopGapVal + doorBottomGapVal;
                doorTopAbsMm = cabinetBottomAbs + cabinetH + doorTopGapVal;
                doorBottomAbsMm = cabinetBottomAbs - doorBottomGapVal;
              }
            } else {
              const isFloorType = !spaceInfo.baseConfig || spaceInfo.baseConfig.type === 'floor';
              const floorFinishForDoor = (isFloorType && spaceInfo.hasFloorFinish)
                ? (spaceInfo.floorFinish?.height || 0) : 0;
              doorBottomAbsMm = doorBottomGapVal + floorFinishForDoor;
              doorTopAbsMm = effectiveH_rd - doorTopGapVal;
              doorHeightMm = Math.max(0, doorTopAbsMm - doorBottomAbsMm);
            }

            if (doorHeightMm <= 0) return;

            doorSegs_r.push({
              bottomY: mmToThreeUnits(doorBottomAbsMm),
              topY: mmToThreeUnits(doorTopAbsMm),
              heightMm: Math.round(doorHeightMm),
              key: `door-${moduleIndex}`
            });

            // 상판내림 + 상판: 도어 상단 ~ 앞판 하단 20mm 갭 + 앞판 영역 (PET=18.5 / 인조대리석=선택값)
            const _effStT_r = _stoneTopThk(mod);
            if (modCat === 'lower' && modData.id?.includes('lower-top-down-') && _effStT_r > 0) {
              const doorGapMm = 20;
              const gapTopAbs_r = doorTopAbsMm + doorGapMm;
              doorSegs_r.push({
                bottomY: mmToThreeUnits(doorTopAbsMm),
                topY: mmToThreeUnits(gapTopAbs_r),
                heightMm: doorGapMm,
                key: `door-topgap-${moduleIndex}`
              });
              // 앞판 높이 = (캐비넷상단 - 앞판하단) + 상판 실효 두께
              const cabinetH_r = modData.dimensions.height ?? 785;
              const cabinetBottomAbs_r = (isFloating ? floatHeightMm : (railOrBaseHeightMm + indivFloatMm)) + floorFinishHeightMm;
              const cabinetTopAbs_r = cabinetBottomAbs_r + cabinetH_r;
              const frontPlateAreaMm_r = Math.round(cabinetTopAbs_r - gapTopAbs_r) + _effStT_r;
              if (frontPlateAreaMm_r > 0) {
                doorSegs_r.push({
                  bottomY: mmToThreeUnits(gapTopAbs_r),
                  topY: mmToThreeUnits(cabinetTopAbs_r + _effStT_r),
                  heightMm: frontPlateAreaMm_r,
                  key: `door-frontplate-${moduleIndex}`
                });
              }
            }
          });

          if (doorSegs_r.length === 0) return null;
          // 같은 높이·위치의 중복 세그먼트 제거
          const seen_r = new Set<string>();
          const dedupSegs_r = doorSegs_r.filter(s => {
            const k = `${s.heightMm}_${Math.round(s.bottomY * 1000)}_${Math.round(s.topY * 1000)}`;
            if (seen_r.has(k)) return false;
            seen_r.add(k);
            return true;
          });
          dedupSegs_r.sort((a, b) => a.bottomY - b.bottomY);

          const allDoorSegs_r: typeof dedupSegs_r = [];
          for (let i = 0; i < dedupSegs_r.length; i++) {
            allDoorSegs_r.push(dedupSegs_r[i]);
            if (i < dedupSegs_r.length - 1) {
              const gapBottomY = dedupSegs_r[i].topY;
              const gapTopY = dedupSegs_r[i + 1].bottomY;
              const gapMm = Math.round((gapTopY - gapBottomY) / 0.01);
              if (gapMm > 0) {
                allDoorSegs_r.push({ bottomY: gapBottomY, topY: gapTopY, heightMm: gapMm, key: `door-gap-${i}` });
              }
            }
          }

          return allDoorSegs_r.map((seg) => (
            <group key={`r-door-${seg.key}`}>
              <ExtLine points={[[0, seg.bottomY, dimExtZ_r], [0, seg.bottomY, dimZ_r]]} color={dimensionColor} />
              <ExtLine points={[[0, seg.topY, dimExtZ_r], [0, seg.topY, dimZ_r]]} color={dimensionColor} />
              <NativeLine name="dimension_line" points={[[0, seg.bottomY, dimZ_r], [0, seg.topY, dimZ_r]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <NativeLine name="dimension_line" points={[[-0.008, seg.bottomY, dimZ_r], [0.008, seg.bottomY, dimZ_r]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <NativeLine name="dimension_line" points={[[-0.008, seg.topY, dimZ_r], [0.008, seg.topY, dimZ_r]]} color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false} />
              <Text position={[0, (seg.bottomY + seg.topY) / 2, dimZ_r + mmToThreeUnits(60)]} fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                {seg.heightMm}
              </Text>
            </group>
          ));
        })()}

        {/* 바닥마감재 치수 (별도 위치, 우측뷰) — 하부장은 왼쪽 2단에서 표시, 상부장은 받침대 없으므로 제외 */}
        {floorFinishHeightMm > 0 && !isFloating && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (
        <group>
            {/* 보조 가이드 연장선 - 바닥 */}
            <ExtLine points={[[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)], [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]]} color={dimensionColor} />
            {/* 보조 가이드 연장선 - 마감재 상단 */}
            <ExtLine points={[[0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(720)], [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]]} color={dimensionColor} />
            {/* 메인 치수선 (바닥 ~ 마감재 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 바닥 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.008, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 마감재 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {floorFinishHeightMm}
            </Text>
        </group>
        )}

        {/* 받침대 높이 (마감재 상단 ~ 받침대 상단, 우측뷰) — 하부장은 왼쪽 2단에서 표시, 상부장은 받침대 없으므로 제외 */}
        {baseFrameHeightMm > 0 && selectedModCategory !== 'lower' && selectedModCategory !== 'upper' && (
        <group>
            {/* 보조 가이드 연장선 - 시작 (마감재 상단 or 바닥) */}
            <ExtLine points={[[0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)], [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]]} color={dimensionColor} />
            {/* 보조 가이드 연장선 - 받침대 상단 */}
            <ExtLine points={[[0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)], [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]]} color={dimensionColor} />
            {/* 메인 치수선 (마감재 상단 ~ 받침대 상단) */}
            <NativeLine name="dimension_line"
              points={[
                [0, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 시작 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.008, floorFinishY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            {/* 티크 마크 - 받침대 상단 */}
            <NativeLine name="dimension_line"
              points={[
                [-0.008, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.008, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
            />
            <Text
              position={[0, floorFinishY + (furnitureBaseY - floorFinishY) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              renderOrder={1000} depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {baseFrameDisplayMm}
            </Text>
        </group>
        )}

        {/* 하부장/상부장: 바닥 ~ 가구 상단 합산 치수 (바닥마감재 + 하부프레임 + 가구높이) — 우측뷰 */}
        {(selectedModCategory === 'lower' || selectedModCategory === 'upper') && selectedMod && (() => {
          let selModData_r = getModuleById(
            selectedMod.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );
          if (!selModData_r) {
            selModData_r = buildModuleDataFromPlacedModule(selectedMod, internalSpace, spaceInfo);
          }
          if (!selModData_r) return null;
          const selFurnitureHeightMm_r = computeFurnitureHeightMm(selectedMod, selModData_r, spaceInfo, internalSpace);
          // 하부장 + 상판: 상판 두께를 총 높이에 포함 (PET=18.5, 인조대리석=선택값)
          const selModCatCombined_r = getModuleCategory(selectedMod);
          const stoneThicknessCombined_r = _stoneTopThk(selectedMod);
          const stoneAddition_r = (selModCatCombined_r === 'lower' && stoneThicknessCombined_r > 0) ? stoneThicknessCombined_r : 0;
          const totalFromFloorMm_r = Math.round(floorFinishHeightMm + baseFrameHeightMm + selFurnitureHeightMm_r + stoneAddition_r);
          const totalFromFloorY_r = mmToThreeUnits(totalFromFloorMm_r);
          // 가구 도어 앞면 Z 계산
          const panelDepthMm_cr = spaceInfo.depth || 1500;
          const furnitureDepthMm_cr = Math.min(panelDepthMm_cr, 600);
          const zOff_cr = -mmToThreeUnits(panelDepthMm_cr) / 2;
          const fzOff_cr = zOff_cr + (mmToThreeUnits(panelDepthMm_cr) - mmToThreeUnits(furnitureDepthMm_cr)) / 2;
          const doorFrontZ_cr = fzOff_cr + mmToThreeUnits(furnitureDepthMm_cr) / 2;
          // 합산 치수: 도어 앞면에서 300mm 바깥
          const dimZ_combined_r = doorFrontZ_cr + mmToThreeUnits(300);
          const dimZ_combined_r_ext = doorFrontZ_cr + mmToThreeUnits(30);
          return (
            <group>
              {/* 보조 가이드 연장선 - 바닥 */}
              <ExtLine points={[[0, 0, dimZ_combined_r_ext], [0, 0, dimZ_combined_r]]} color={dimensionColor} />
              {/* 보조 가이드 연장선 - 가구 상단 */}
              <ExtLine points={[[0, totalFromFloorY_r, dimZ_combined_r_ext], [0, totalFromFloorY_r, dimZ_combined_r]]} color={dimensionColor} />
              {/* 메인 치수선 (바닥 ~ 가구 상단) */}
              <NativeLine name="dimension_line"
                points={[[0, 0, dimZ_combined_r], [0, totalFromFloorY_r, dimZ_combined_r]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              {/* 티크 마크 - 바닥 */}
              <NativeLine name="dimension_line"
                points={[[-0.008, 0, dimZ_combined_r], [0.008, 0, dimZ_combined_r]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              {/* 티크 마크 - 가구 상단 */}
              <NativeLine name="dimension_line"
                points={[[-0.008, totalFromFloorY_r, dimZ_combined_r], [0.008, totalFromFloorY_r, dimZ_combined_r]]}
                color={dimensionColor} lineWidth={1} renderOrder={100000} depthTest={false}
              />
              <Text
                position={[0, totalFromFloorY_r / 2, dimZ_combined_r + mmToThreeUnits(60)]}
                fontSize={largeFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                renderOrder={1000} depthTest={false}
                rotation={[0, Math.PI / 2, Math.PI / 2]}
              >
                {totalFromFloorMm_r}
              </Text>
            </group>
          );
        })()}

        {/* 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 신발장 계열 판별 + 현관장만 도어 차감
          const midSide_d2 = module.moduleId || '';
          const keyForShoe_d2 = midSide_d2.replace(/-[\d.]+$/, '');
          const isEntrywayH_d2 = midSide_d2.includes('-entryway-');
          const isShelfDrawer_d2 = midSide_d2.includes('-4drawer-shelf-') || midSide_d2.includes('-2drawer-shelf-');
          const isPlainShelf_d2 = /(^|-)shelf$/.test(keyForShoe_d2) && !midSide_d2.includes('upper-cabinet-');
          const isShoeCategory_d2 = (isEntrywayH_d2 || isShelfDrawer_d2 || isPlainShelf_d2) && !midSide_d2.includes('upper-cabinet-');
          // 뒷면 정렬 판정은 신발장 계열 전부 유지
          const isBackAlign_d2 = isEntrywayH_d2 || isShelfDrawer_d2 || isPlainShelf_d2 || midSide_d2.includes('-shelf-');
          const DOOR_THK_MM_D2 = 20;
          const SHOE_LOWER_DEFAULT_MM_D2 = 380;

          // 우선순위: customDepth > upperSection/lowerSection > 기본값
          const hasCustomDepth_d2 = typeof module.customDepth === 'number' && module.customDepth > 0;
          const upperDepthRaw_d2 = hasCustomDepth_d2
            ? module.customDepth!
            : (module.upperSectionDepth || moduleData.dimensions.depth);
          const lowerDepthRaw_d2 = hasCustomDepth_d2
            ? module.customDepth!
            : (module.lowerSectionDepth ?? (isShoeCategory_d2 ? SHOE_LOWER_DEFAULT_MM_D2 : moduleData.dimensions.depth));
          const upperDepth = (!hasCustomDepth_d2 && isEntrywayH_d2) ? Math.max(0, upperDepthRaw_d2 - DOOR_THK_MM_D2) : upperDepthRaw_d2;
          const lowerDepth_d2 = (!hasCustomDepth_d2 && isEntrywayH_d2) ? Math.max(0, lowerDepthRaw_d2 - DOOR_THK_MM_D2) : lowerDepthRaw_d2;
          // 신발장 계열이면 항상 상/하부 분리 표시
          const isShoeSide_d2 = isShoeCategory_d2;
          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);
          const moduleDepthLower_d2 = mmToThreeUnits(lowerDepth_d2);

          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = furnitureBaseY + internalHeight + mmToThreeUnits(200);
          const furnitureBottomDimY_d2 = furnitureBaseY - mmToThreeUnits(200);

          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          // 상부장/신발장은 하부장 뒷면 정렬, 그 외는 앞면 정렬
          const isUpperMod_d2 = getModuleCategory(module as PlacedModule) === 'upper';
          // 신발장 실제 기본 깊이 (380) 또는 의류장/일반 (600) 기준
          const baseModuleDepthMm_d2 = isShoeSide_d2
            ? (module.customDepth || 380)
            : moduleData.dimensions.depth;
          const baseModuleDepth_d2 = mmToThreeUnits(baseModuleDepthMm_d2);
          const baseFrontZ_d2 = furnitureZOffset + furnitureDepth/2 - doorThickness - baseModuleDepth_d2/2;
          const baseBackZ_d2 = furnitureZOffset - furnitureDepth/2 - doorThickness + baseModuleDepth_d2/2;
          // 상부 방향 오프셋
          const upperDir_d2 = (module.upperSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const upperDiff_d2 = baseModuleDepth_d2 - moduleDepth;
          const upperOffset_d2 = upperDiff_d2 === 0 ? 0 : upperDir_d2 === 'back' ? upperDiff_d2/2 : -upperDiff_d2/2;
          const furnitureZ = (isUpperMod_d2 || isBackAlign_d2)
            ? (baseBackZ_d2 + upperOffset_d2)
            : (baseFrontZ_d2 + upperOffset_d2);
          // 현관장 하부섹션 Z (하부 섹션 direction 반영)
          const lowerDir_d2 = (module.lowerSectionDepthDirection as 'front' | 'back' | undefined) || 'front';
          const lowerDiff_d2 = baseModuleDepth_d2 - moduleDepthLower_d2;
          const lowerOffset_d2 = lowerDiff_d2 === 0 ? 0 : lowerDir_d2 === 'back' ? lowerDiff_d2/2 : -lowerDiff_d2/2;
          const furnitureZLower_d2 = isShoeSide_d2
            ? (baseBackZ_d2 + lowerOffset_d2)
            : furnitureZ;

          return (
            <group key={`furniture-depth-${index}`}>
              <ExtLine points={[[0, furnitureBaseY + internalHeight, furnitureZ + moduleDepth/2], [0, furnitureTopY, furnitureZ + moduleDepth/2]]} color={dimensionColor} />
              <ExtLine points={[[0, furnitureBaseY + internalHeight, furnitureZ - moduleDepth/2], [0, furnitureTopY, furnitureZ - moduleDepth/2]]} color={dimensionColor} />

              <NativeLine name="dimension_line"
                points={[
                  [0, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ + moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine name="dimension_line"
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />

              <Text
                position={[0, furnitureTopY + mmToThreeUnits(80), furnitureZ]}
                fontSize={largeFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
                renderOrder={1000}
                depthTest={false}
                rotation={[0, Math.PI / 2, 0]}
              >
                {customDepth}
              </Text>

              {/* ─── 신발장 하부섹션 깊이 — 우측뷰 하단, 상/하부 깊이가 다를 때만 ─── */}
              {isShoeSide_d2 && upperDepth !== lowerDepth_d2 && (
                <>
                  <ExtLine points={[[0, furnitureBaseY, furnitureZLower_d2 + moduleDepthLower_d2/2], [0, furnitureBottomDimY_d2, furnitureZLower_d2 + moduleDepthLower_d2/2]]} color={dimensionColor} />
                  <ExtLine points={[[0, furnitureBaseY, furnitureZLower_d2 - moduleDepthLower_d2/2], [0, furnitureBottomDimY_d2, furnitureZLower_d2 - moduleDepthLower_d2/2]]} color={dimensionColor} />
                  <NativeLine name="dimension_line"
                    points={[[0, furnitureBottomDimY_d2, furnitureZLower_d2 - moduleDepthLower_d2/2], [0, furnitureBottomDimY_d2, furnitureZLower_d2 + moduleDepthLower_d2/2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, furnitureBottomDimY_d2, furnitureZLower_d2 + moduleDepthLower_d2/2], [0 + 0.02, furnitureBottomDimY_d2, furnitureZLower_d2 + moduleDepthLower_d2/2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[0 - 0.02, furnitureBottomDimY_d2, furnitureZLower_d2 - moduleDepthLower_d2/2], [0 + 0.02, furnitureBottomDimY_d2, furnitureZLower_d2 - moduleDepthLower_d2/2]]}
                    color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                  />
                  <Text
                    position={[0, furnitureBottomDimY_d2 - mmToThreeUnits(40), furnitureZLower_d2]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    renderOrder={1000} depthTest={false}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    {lowerDepth_d2}
                  </Text>
                </>
              )}

              {/* 상부장 하부마감판 깊이 치수 (우측뷰) */}
              {(() => {
                const mod = module as PlacedModule;
                const modCat = getModuleCategory(mod);
                if (modCat !== 'upper') return null;

                const modHeightMm_r = computeFurnitureHeightMm(mod, moduleData!, spaceInfo, internalSpace);
                const depthEffH_r = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
                const topFrameVal_r = mod.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
                const cabinetTopMm_r = depthEffH_r - topFrameVal_r;
                const cabinetBottomMm_r = cabinetTopMm_r - modHeightMm_r;
                const furnitureBottomEdge_r = mmToThreeUnits(cabinetBottomMm_r);
                // 상부장 Z 재계산 (하부장 뒷면 맞춤)
                const lowerDepthU = mmToThreeUnits(650);
                const upperFurnitureZ = furnitureZOffset + furnitureDepth / 2 - doorThickness - lowerDepthU + moduleDepth / 2;

                const finishDepthMm_r = customDepth - 35;
                const finishDepth_r = mmToThreeUnits(finishDepthMm_r);
                const finishZ_r = upperFurnitureZ + mmToThreeUnits(17.5);
                const finishDimY_r = furnitureBottomEdge_r - mmToThreeUnits(80);
                const cabinetBackZ_r = upperFurnitureZ - moduleDepth / 2;
                const finishBackZ_r = finishZ_r - finishDepth_r / 2;
                const offsetMm_r = 35;

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge_r, finishZ_r + finishDepth_r/2], [0, finishDimY_r, finishZ_r + finishDepth_r/2]]} color={dimensionColor} />
                    {/* 보조 가이드 연장선 - 마감판 뒤쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge_r, finishBackZ_r], [0, finishDimY_r, finishBackZ_r]]} color={dimensionColor} />
                    {/* 보조 가이드 연장선 - 가구 뒤쪽 */}
                    <ExtLine points={[[0, furnitureBottomEdge_r, cabinetBackZ_r], [0, finishDimY_r, cabinetBackZ_r]]} color={dimensionColor} />

                    {/* 마감판 깊이 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[0, finishDimY_r, finishBackZ_r], [0, finishDimY_r, finishZ_r + finishDepth_r/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY_r, finishZ_r + finishDepth_r/2], [0 + 0.02, finishDimY_r, finishZ_r + finishDepth_r/2]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY_r, finishBackZ_r], [0 + 0.02, finishDimY_r, finishBackZ_r]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <Text
                      position={[0, finishDimY_r - mmToThreeUnits(40), finishZ_r]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {finishDepthMm_r}
                    </Text>

                    {/* 갭 치수선 (가구 뒷면 ~ 마감판 뒷면 = 35mm) — 같은 높이 */}
                    <NativeLine name="dimension_line"
                      points={[[0, finishDimY_r, cabinetBackZ_r], [0, finishDimY_r, finishBackZ_r]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[0 - 0.02, finishDimY_r, cabinetBackZ_r], [0 + 0.02, finishDimY_r, cabinetBackZ_r]]}
                      color={dimensionColor} lineWidth={0.5} renderOrder={100000} depthTest={false}
                    />
                    <Text
                      position={[0, finishDimY_r - mmToThreeUnits(40), (cabinetBackZ_r + finishBackZ_r) / 2]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="center" anchorY="middle"
                      renderOrder={1000} depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {offsetMm_r}
                    </Text>
                  </group>
                );
              })()}

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {(module.lowerSectionDepth !== undefined) && (() => {
                const lowerDepth = module.lowerSectionDepth;
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerDimY = floatHeight - mmToThreeUnits(200); // 하단 치수선 위치 (가구 바닥 아래)

                return (
                  <group>
                    <ExtLine points={[[0, floatHeight, lowerFurnitureZ + lowerModuleDepth/2], [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]]} color={dimensionColor} />
                    <ExtLine points={[[0, floatHeight, lowerFurnitureZ - lowerModuleDepth/2], [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]]} color={dimensionColor} />

                    <NativeLine name="dimension_line"
                      points={[
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine name="dimension_line"
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={0.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <Text
                      position={[0, lowerDimY - mmToThreeUnits(80), lowerFurnitureZ]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={1000}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      {lowerDepth}
                    </Text>
                  </group>
                );
              })()}
            </group>
          );
        })}


        {/* ===== 도어/마이다 높이 치수선 (우측뷰) ===== */}
        {(() => {
          const panelDepthMm_door = spaceInfo.depth || 1500;
          const panelDepthU_door = mmToThreeUnits(panelDepthMm_door);
          const furnitureDepthU_door = mmToThreeUnits(600);
          const furnitureFrontZ_door = -panelDepthU_door / 2 + (panelDepthU_door - furnitureDepthU_door) / 2 + furnitureDepthU_door / 2;
          const doorDimZ_r = furnitureFrontZ_door + mmToThreeUnits(200);
          const doorColor_r = dimensionColor;

          // 측면뷰에 보이는 가구만 대상 (visibleFurniture 기반)
          const visibleIds_r = new Set(visibleFurniture.map(m => m.id));
          const doorModules_r = placedModules.filter(m =>
            !m.isSurroundPanel && visibleIds_r.has(m.id) && m.hasDoor
          );
          if (doorModules_r.length === 0) return null;

          const effectiveH_r = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm) : spaceInfo.height;
          const elements_r: JSX.Element[] = [];

          doorModules_r.forEach((mod, modIdx) => {
            let modData = getModuleById(
              mod.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            if (!modData) modData = buildModuleDataFromPlacedModule(mod as PlacedModule, internalSpace, spaceInfo);

            const modCategory = modData?.category
              ?? (mod.moduleId.includes('-upper-') ? 'upper'
                : mod.moduleId.startsWith('lower-') ? 'lower' : 'full');

            const isDrawerModule = mod.moduleId.includes('lower-drawer-')
              || (mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-'))
              || (mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-'))
              || mod.moduleId.includes('lower-induction-cabinet')
              || mod.moduleId.includes('dual-lower-induction-cabinet');

            if (modCategory === 'lower' && isDrawerModule) {
              const modHeightMm = modData ? computeFurnitureHeightMm(mod as PlacedModule, modData, spaceInfo, internalSpace) : 0;
              const isDL_r = mod.moduleId.includes('lower-door-lift-') && !mod.moduleId.includes('-half-');
              const isTD_r = mod.moduleId.includes('lower-top-down-') && !mod.moduleId.includes('-half-');
              const modDefaultTopGap_r = isDL_r ? 30 : isTD_r ? -80 : -20;
              const effectiveTopGap_r = (mod.doorTopGap === undefined || mod.doorTopGap === 0) ? modDefaultTopGap_r : mod.doorTopGap;
              const effectiveBotGap_r = (mod.doorBottomGap === undefined || mod.doorBottomGap === 0) ? 5 : mod.doorBottomGap;
              const lowerMaidas = computeLowerCabinetMaidaHeights(mod.moduleId, modHeightMm, effectiveTopGap_r, effectiveBotGap_r);
              if (lowerMaidas && lowerMaidas.length > 0) {
                const cabinetBottomY_r = furnitureBaseY;

                const gaps_r: { bottomMm: number; topMm: number; heightMm: number; absCoord?: boolean }[] = [];
                // 하단 갭: 바닥~마이다 하단 거리
                const firstMaida_r = lowerMaidas[0];
                const floorToMaidaBottomMm_r = baseFrameHeightMm + firstMaida_r.maidaBottomMm;
                if (firstMaida_r.maidaBottomMm > 0) {
                  gaps_r.push({ bottomMm: 0, topMm: firstMaida_r.maidaBottomMm, heightMm: Math.round(firstMaida_r.maidaBottomMm) });
                } else if (firstMaida_r.maidaBottomMm < 0 && Math.abs(floorToMaidaBottomMm_r) >= 1) {
                  gaps_r.push({ bottomMm: 0, topMm: floorToMaidaBottomMm_r, heightMm: Math.round(floorToMaidaBottomMm_r), absCoord: true });
                }
                // 마이다 사이 갭
                for (let gi = 0; gi < lowerMaidas.length - 1; gi++) {
                  const gapBotMm = lowerMaidas[gi].maidaTopMm;
                  const gapTopMm = lowerMaidas[gi + 1].maidaBottomMm;
                  if (gapTopMm - gapBotMm > 0) {
                    gaps_r.push({ bottomMm: gapBotMm, topMm: gapTopMm, heightMm: Math.round(gapTopMm - gapBotMm) });
                  }
                }
                // 상단 갭: 마지막 마이다 상단 ~ 캐비넷 상단
                const lastMaida_r = lowerMaidas[lowerMaidas.length - 1];
                const topGapTotal_r = modHeightMm - lastMaida_r.maidaTopMm;
                if (topGapTotal_r > 0) {
                  // 상판내림 + 상판: 20mm 갭 + 앞판 높이 (PET=18.5 / 인조대리석=선택값)
                  const _effStT_r2 = _stoneTopThk(mod);
                  if (isTD_r && _effStT_r2 > 0) {
                    const doorGapMm = 20;
                    if (doorGapMm < topGapTotal_r) {
                      const frontPlateHeight_r = (topGapTotal_r - doorGapMm) + _effStT_r2;
                      gaps_r.push({ bottomMm: lastMaida_r.maidaTopMm, topMm: lastMaida_r.maidaTopMm + doorGapMm, heightMm: doorGapMm });
                      gaps_r.push({ bottomMm: lastMaida_r.maidaTopMm + doorGapMm, topMm: modHeightMm + _effStT_r2, heightMm: frontPlateHeight_r });
                    } else {
                      gaps_r.push({ bottomMm: lastMaida_r.maidaTopMm, topMm: modHeightMm, heightMm: Math.round(topGapTotal_r) });
                    }
                  } else {
                    gaps_r.push({ bottomMm: lastMaida_r.maidaTopMm, topMm: modHeightMm, heightMm: Math.round(topGapTotal_r) });
                  }
                }

                elements_r.push(
                  <group key={`r-door-maida-group-${modIdx}`}>
                    {lowerMaidas.map((m, i) => {
                      const dBotY = cabinetBottomY_r + mmToThreeUnits(m.maidaBottomMm);
                      const dTopY = cabinetBottomY_r + mmToThreeUnits(m.maidaTopMm);
                      return (
                        <group key={`r-door-maida-${modIdx}-${i}`}>
                          <NativeLine name="door_height_dim" points={[[0, dBotY, doorDimZ_r], [0, dTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, dBotY, doorDimZ_r], [0.008, dBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, dTopY, doorDimZ_r], [0.008, dTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text position={[0, (dBotY + dTopY) / 2, doorDimZ_r + mmToThreeUnits(60)]} fontSize={largeFontSize} color={doorColor_r} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                            {Number.isInteger(m.maidaHeightMm) ? m.maidaHeightMm.toString() : (Math.round(m.maidaHeightMm * 10) / 10).toString()}
                          </Text>
                          <ExtLine points={[[0, dTopY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, dTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="door_height_ext" />
                          <ExtLine points={[[0, dBotY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, dBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="door_height_ext" />
                        </group>
                      );
                    })}
                    {gaps_r.map((gap, gi) => {
                      const gBotY = gap.absCoord ? floorFinishY + mmToThreeUnits(gap.bottomMm) : cabinetBottomY_r + mmToThreeUnits(gap.bottomMm);
                      const gTopY = gap.absCoord ? floorFinishY + mmToThreeUnits(gap.topMm) : cabinetBottomY_r + mmToThreeUnits(gap.topMm);
                      return (
                        <group key={`r-door-gap-${modIdx}-${gi}`}>
                          <NativeLine name="door_height_dim" points={[[0, gBotY, doorDimZ_r], [0, gTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, gBotY, doorDimZ_r], [0.008, gBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <NativeLine name="door_height_dim" points={[[-0.008, gTopY, doorDimZ_r], [0.008, gTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={1} renderOrder={100000} depthTest={false} />
                          <Text position={[0, (gBotY + gTopY) / 2, doorDimZ_r + mmToThreeUnits(60)]} fontSize={largeFontSize} color={doorColor_r} anchorX="center" anchorY="middle" renderOrder={1000} depthTest={false} rotation={[0, Math.PI / 2, Math.PI / 2]}>
                            {gap.heightMm}
                          </Text>
                          <ExtLine points={[[0, gTopY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, gTopY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="door_height_ext" />
                          <ExtLine points={[[0, gBotY, furnitureFrontZ_door + mmToThreeUnits(20)], [0, gBotY, doorDimZ_r]]} color={doorColor_r} lineWidth={0.3} name="door_height_ext" />
                        </group>
                      );
                    })}
                  </group>
                );
                return;
              }
            }
          });

          return elements_r.length > 0 ? <group>{elements_r}</group> : null;
        })()}

        {/* ===== 단내림 구간 선택 시 단내림 벽 표시 (빗금 패턴) ===== */}
        {isSelectedSlotInDroppedZone && (() => {
          // 보이는 가구의 깊이 가져오기 (가구가 없으면 기본값 600mm 사용)
          let actualFurnitureDepthMm = 600;
          if (visibleFurniture.length > 0) {
            const visibleModule = visibleFurniture[0];
            const visibleModuleData = getModuleById(
              visibleModule.moduleId,
              { width: internalSpace.width, height: internalSpace.height, depth: internalSpace.depth },
              spaceInfo
            );
            // 상부섹션 깊이 우선 사용 (가구 치수 표시와 동일)
            actualFurnitureDepthMm = visibleModule.upperSectionDepth || visibleModule.customDepth || visibleModuleData?.dimensions.depth || 600;
          }
          const actualFurnitureDepth = mmToThreeUnits(actualFurnitureDepthMm);

          // 빗금 해칭 패턴 생성
          const hatchLines: JSX.Element[] = [];
          const hatchSpacing = mmToThreeUnits(40); // 40mm 간격
          const hatchColor = view2DTheme === 'dark' ? '#FFD700' : '#999999';

          // 가구 Z 위치 계산 (가구 치수와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const baseFurnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const baseFurnitureDepth = mmToThreeUnits(baseFurnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - baseFurnitureDepth) / 2;
          // 가구 Z 위치 (가구 치수 표시와 동일한 방식)
          const furnitureZ = furnitureZOffset + baseFurnitureDepth/2 - doorThickness - actualFurnitureDepth/2;
          // 가구 뒷면과 앞면 Z 위치
          const furnitureBackZ = furnitureZ - actualFurnitureDepth/2;
          const furnitureFrontZ = furnitureZ + actualFurnitureDepth/2;

          // 단내림 벽 영역: Z방향으로 가구 깊이만큼, Y방향으로 dropHeight
          const wallStartZ = furnitureBackZ;
          const wallEndZ = furnitureFrontZ;
          const wallDepth = wallEndZ - wallStartZ;
          const wallStartY = displaySpaceHeight;
          const wallEndY = spaceHeight;

          // 대각선 빗금 생성 (좌하단에서 우상단으로)
          const startOffset = -dropHeight;
          const endOffset = wallDepth;
          const hatchCount = Math.ceil((endOffset - startOffset) / hatchSpacing) + 1;

          for (let i = 0; i <= hatchCount; i++) {
            const offset = startOffset + i * hatchSpacing;

            // 시작점과 끝점 계산 (Z-Y 평면에서)
            let startZ = wallStartZ + offset;
            let startY = wallStartY;
            let endZ = startZ + dropHeight;
            let endY = wallEndY;

            // 클리핑
            if (startZ < wallStartZ) {
              const diff = wallStartZ - startZ;
              startZ = wallStartZ;
              startY = wallStartY + diff;
            }
            if (endZ > wallEndZ) {
              const diff = endZ - wallEndZ;
              endZ = wallEndZ;
              endY = wallEndY - diff;
            }

            // 유효한 선분인지 확인
            if (startZ < wallEndZ && endZ > wallStartZ && startY < wallEndY && endY > wallStartY) {
              hatchLines.push(
                <NativeLine
                  key={`hatch-right-${i}`}
                  name="hatch_line"
                  points={[
                    [0, startY, startZ],
                    [0, endY, endZ]
                  ]}
                  color={hatchColor}
                  lineWidth={0.3}
                  renderOrder={100000}
                  depthTest={false}
                />
              );
            }
          }

          return (
            <group>
              {/* 회색 반투명 배경 메쉬 (정면도와 동일) */}
              <mesh
                position={[0, (wallStartY + wallEndY) / 2, (wallStartZ + wallEndZ) / 2]}
                rotation={[0, Math.PI / 2, 0]}
                renderOrder={99998}
              >
                <planeGeometry args={[wallDepth, dropHeight]} />
                <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
              </mesh>
              {/* 단내림 벽 테두리 */}
              <NativeLine
                name="dropped_ceiling_border"
                points={[
                  [0, wallStartY, wallStartZ],
                  [0, wallEndY, wallStartZ],
                  [0, wallEndY, wallEndZ],
                  [0, wallStartY, wallEndZ],
                  [0, wallStartY, wallStartZ]
                ]}
                color={hatchColor}
                lineWidth={0.5}
                renderOrder={100000}
                depthTest={false}
              />
              {/* 빗금 패턴 */}
              {hatchLines}
            </group>
          );
        })()}
      </group>
    );
  }

  return null;
};

export default CADDimensions2D;
