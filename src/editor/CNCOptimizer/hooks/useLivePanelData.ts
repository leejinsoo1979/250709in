import { useEffect, useState, useMemo } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById, buildModuleDataFromPlacedModule } from '@/data/modules';
import { calculatePanelDetails as calculatePanelDetailsShared, calculateSurroundPanels } from '@/editor/shared/utils/calculatePanelDetails';
import { calculateTopBottomFrameHeight, calculateBaseFrameHeight } from '@/editor/shared/viewer3d/utils/geometry';
import { Panel } from '../types';
import { normalizePanels, NormalizedPanel } from '@/utils/cutlist/normalize';
import { calculateShelfBoringPositions } from '@/domain/boring/utils/calculateShelfBoringPositions';
import { computeFrameMergeGroups, computeStoneTopMergeGroups } from '@/editor/shared/utils/frameMergeUtils';
import { getDefaultGrainDirection } from '@/editor/shared/utils/materialConstants';
import { withUpperSafetyShelfRemoved } from '@/editor/shared/utils/upperSafetyShelf';

/**
 * CNC 패널 이름 → 3D panelName 변환
 * calculatePanelDetails와 BaseFurnitureShell/DrawerRenderer/ShelfRenderer 간 이름 차이 보정
 */
function toMeshName(cncName: string): string {
  // 단일 섹션 가구: "바닥" → "바닥판" (3D BaseFurnitureShell에서 단일 섹션이면 '바닥판' 사용)
  if (cncName === '바닥') return '바닥판';
  // 보강대: CNC "좌(상)후면 보강대 1" → 3D "좌(상)보강대 1"
  if (cncName.includes('후면 보강대')) return cncName.replace('후면 보강대', '보강대').trim();
  // 하부장 노치 보강 가로전대: CNC "가로전대(1)" → 3D "가로전대(하1)"
  const lowerStretcherMatch = cncName.match(/^가로전대\((\d+)\)$/);
  if (lowerStretcherMatch) return `가로전대(하${lowerStretcherMatch[1]})`;
  // 하부장 직접 다보선반: CNC/기존 저장값 "다보선반(1)" → 3D "선반 1"
  const dowelShelfMatch = cncName.match(/^다보선반(?:\s*|\()(\d+)\)?$/);
  if (dowelShelfMatch) return `선반 ${dowelShelfMatch[1]}`;
  const compactShelfMatch = cncName.match(/^(\([^)]+\))?선반(\d+)$/);
  if (compactShelfMatch) return `${compactShelfMatch[1] ?? ''}선반 ${compactShelfMatch[2]}`;
  // 터치 레그라 마이다: CNC "터치서랍1(마이다)" → 3D "터치1단서랍(마이다)"
  const touchLegraMaidaMatch = cncName.match(/^터치서랍(\d+)\(마이다\)$/);
  if (touchLegraMaidaMatch) return `터치${touchLegraMaidaMatch[1]}단서랍(마이다)`;
  // 터치 레그라 바닥판/뒷판: CNC "터치서랍1 바닥판" → 3D "터치1단서랍 바닥판"
  const touchLegraPanelMatch = cncName.match(/^터치서랍(\d+)\s+(바닥판|뒷판)$/);
  if (touchLegraPanelMatch) return `터치${touchLegraPanelMatch[1]}단서랍 ${touchLegraPanelMatch[2]}`;
  // 프레임: CNC "상단몰딩" / "걸래받이" → 3D "top-frame" / "base-frame"
  if (cncName.includes('상단몰딩') || cncName.includes('상단 몰딩')) return 'top-frame';
  if (cncName.includes('걸래받이') || cncName.includes('걸래받이')) return 'base-frame';
  // 서라운드: CNC → 3D Room name
  // L자 측면판/전면판 (자유배치)
  if (cncName.includes('좌측 서라운드 측면판')) return 'left-surround-lshape-side';
  if (cncName.includes('좌측 서라운드 전면판')) return 'left-surround-lshape-front';
  if (cncName.includes('우측 서라운드 측면판')) return 'right-surround-lshape-side';
  if (cncName.includes('우측 서라운드 전면판')) return 'right-surround-lshape-front';
  // 일반 서라운드
  if (cncName.includes('좌측 서라운드 프레임') || cncName === '좌측 서라운드') return 'left-surround-ep';
  if (cncName.includes('우측 서라운드 프레임') || cncName === '우측 서라운드') return 'right-surround-ep';
  if (cncName.includes('상부 서라운드 프레임')) return 'top-frame';
  // 커튼박스 L자 프레임
  if (cncName.includes('커튼박스 전면판')) return 'slot-cb-front-panel';
  if (cncName.includes('커튼박스 측면판')) return 'slot-cb-border-panel';
  return cncName;
}

/**
 * 패널 이름에서 기본 결방향(grain) 결정
 * - 단일 소스: materialConstants.ts의 getDefaultGrainDirection() 사용
 * - 팝업 패널목록과 CNC 옵티마이저가 동일한 규칙을 공유함
 */
function getDefaultGrain(panelName: string): 'HORIZONTAL' | 'VERTICAL' {
  return getDefaultGrainDirection(panelName) === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';
}

function isStonePanel(panel: { name?: string; material?: string }): boolean {
  return panel.material === '인조대리석' || !!panel.name?.includes('인조대리석');
}

type OuterSurroundMod = {
  category: 'full' | 'upper' | 'lower';
  heightMm: number;
  frontHeightMm?: number;
};

function getPlacedModuleCategory(module: any): 'full' | 'upper' | 'lower' {
  const id = module?.moduleId || '';
  if (id.startsWith('upper-') || id.includes('-upper-')) return 'upper';
  if (id.startsWith('lower-') || id.includes('-lower-')) return 'lower';
  return 'full';
}

function getPlacedModuleWidthMm(module: any): number {
  return module?.isFreePlacement && module?.freeWidth
    ? module.freeWidth
    : (module?.customWidth || module?.adjustedWidth || module?.moduleWidth || 0);
}

function computeOuterSurroundMods(placedModules: any[], spaceInfo: any, side: 'left' | 'right'): OuterSurroundMod[] {
  const mods = placedModules.filter(m => !m.isSurroundPanel);
  if (mods.length === 0) return [];

  const halfSpaceMm = (spaceInfo.width || 0) / 2;
  const frameLeftMm = spaceInfo.frameSize?.left || 0;
  const frameRightMm = spaceInfo.frameSize?.right || 0;
  const boundaryMm = side === 'left' ? -halfSpaceMm + frameLeftMm : halfSpaceMm - frameRightMm;

  let extremeX: number | null = null;
  mods.forEach((m) => {
    const w = getPlacedModuleWidthMm(m);
    const centerXmm = Math.round((m.position?.x ?? 0) * 100);
    const edgeMm = side === 'left' ? centerXmm - w / 2 : centerXmm + w / 2;
    if (extremeX === null) extremeX = edgeMm;
    else if (side === 'left' && edgeMm < extremeX) extremeX = edgeMm;
    else if (side === 'right' && edgeMm > extremeX) extremeX = edgeMm;
  });
  if (extremeX === null || Math.abs(extremeX - boundaryMm) > 50) return [];

  const outermost = mods.filter((m) => {
    const w = getPlacedModuleWidthMm(m);
    const centerXmm = Math.round((m.position?.x ?? 0) * 100);
    const edgeMm = side === 'left' ? centerXmm - w / 2 : centerXmm + w / 2;
    return Math.abs(edgeMm - (extremeX as number)) <= 1;
  });

  const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const topFrameMM = spaceInfo.frameSize?.top || 30;
  return outermost.map((m): OuterSurroundMod => {
    const category = getPlacedModuleCategory(m);
    const freeHeightMm = typeof m.freeHeight === 'number' && m.freeHeight > 0 ? m.freeHeight : undefined;
    const customHeightMm = typeof m.customHeight === 'number' && m.customHeight > 0 ? m.customHeight : undefined;
    const explicitHeightMm = category === 'upper'
      ? (customHeightMm ?? freeHeightMm)
      : (freeHeightMm ?? customHeightMm);

    let moduleDataH = 0;
    try {
      const internalSp = { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth || 1500 };
      const md = getModuleById(m.moduleId, internalSp, spaceInfo);
      if (md?.dimensions?.height) moduleDataH = md.dimensions.height;
    } catch { /* noop */ }

    const defaultCabH = category === 'lower'
      ? 785
      : category === 'upper'
        ? 785
        : spaceInfo.height;
    const cabHeight = explicitHeightMm ?? (moduleDataH > 0 ? moduleDataH : defaultCabH);

    if (category === 'upper') {
      let ceilingHeightMm = spaceInfo.height;
      if (m.zone === 'dropped') {
        if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
          ceilingHeightMm = spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
        } else if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.dropHeight !== undefined) {
          ceilingHeightMm = spaceInfo.height - spaceInfo.droppedCeiling.dropHeight;
        }
      }
      const topGapMm = m.hasTopFrame === false ? (m.topFrameGap ?? 0) : 0;
      const topMm = ceilingHeightMm - topGapMm;
      const topFrameMm = m.hasTopFrame === false ? 0 : (m.topFrameThickness ?? topFrameMM);
      const bodyTopMm = topMm - topFrameMm;
      const bodyBottomMm = bodyTopMm - cabHeight;
      const doorBottomGapMm = m.doorBottomGap ?? spaceInfo.doorBottomGap ?? 0;
      return {
        category,
        heightMm: cabHeight,
        frontHeightMm: Math.max(0, topMm - (bodyBottomMm - doorBottomGapMm)),
      };
    }

    if (category === 'lower') {
      const modBaseH = spaceInfo.baseConfig?.type === 'stand' ? 0 : (m.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 100);
      return {
        category,
        heightMm: floorFinishMM + modBaseH + cabHeight,
      };
    }

    return { category, heightMm: spaceInfo.height };
  });
}

function buildSurroundPanelsFromRenderedFrames(placedModules: any[], spaceInfo: any, surroundThickness: number, surroundMaterial: string): any[] {
  if (spaceInfo.surroundType !== 'surround' || !spaceInfo.frameSize) return [];
  const fs = spaceInfo.frameSize;
  const SIDE_DEPTH = 40;
  const panels: any[] = [];
  const leftMods = computeOuterSurroundMods(placedModules, spaceInfo, 'left');
  const rightMods = computeOuterSurroundMods(placedModules, spaceInfo, 'right');

  if (fs.left > 0) {
    const mods = leftMods.length > 0 ? leftMods : [{ category: 'full' as const, heightMm: spaceInfo.height }];
    mods.forEach((om, idx) => {
      const suffix = mods.length > 1 ? ` ${idx + 1}` : '';
      panels.push({ name: `좌측 서라운드 측면판${suffix}`, width: SIDE_DEPTH, height: om.heightMm, thickness: surroundThickness, material: surroundMaterial });
      panels.push({ name: `좌측 서라운드 전면판${suffix}`, width: Math.max(0, fs.left - 3), height: om.frontHeightMm ?? om.heightMm, thickness: surroundThickness, material: surroundMaterial });
    });
  }

  if (fs.right > 0) {
    const mods = rightMods.length > 0 ? rightMods : [{ category: 'full' as const, heightMm: spaceInfo.height }];
    mods.forEach((om, idx) => {
      const suffix = mods.length > 1 ? ` ${idx + 1}` : '';
      panels.push({ name: `우측 서라운드 측면판${suffix}`, width: SIDE_DEPTH, height: om.heightMm, thickness: surroundThickness, material: surroundMaterial });
      panels.push({ name: `우측 서라운드 전면판${suffix}`, width: Math.max(0, fs.right - 3), height: om.frontHeightMm ?? om.heightMm, thickness: surroundThickness, material: surroundMaterial });
    });
  }

  if (fs.top > 0) {
    panels.push({
      name: '상부 서라운드 프레임',
      width: spaceInfo.width - (fs.left || 0) - (fs.right || 0),
      height: fs.top,
      thickness: surroundThickness,
      material: surroundMaterial,
    });
  }
  return panels;
}

/**
 * Hook for live panel data binding from Configurator
 * Subscribes to furniture store changes and provides normalized panels
 */
export function useLivePanelData() {
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Extract panels from placed modules
  useEffect(() => {
    console.log('=== useLivePanelData extracting panels ===');
    console.log('placedModules:', placedModules);
    console.log('placedModules.length:', placedModules.length);
    console.log('spaceInfo:', spaceInfo);
    
    // Debug: Check if placedModules is actually an array
    if (!Array.isArray(placedModules)) {
      console.error('placedModules is not an array:', typeof placedModules, placedModules);
      return;
    }

    const extractPanels = () => {
      setIsLoading(true);
      try {
      // 가구가 배치되지 않은 경우 빈 배열 반환
      if (!placedModules || placedModules.length === 0) {
        console.log('No modules placed, returning empty panels');
        setPanels([]);
        setIsLoading(false);
        return;
      }
      
      const allPanels: Panel[] = [];
      
      // Internal space calculation
      // 가구 배치 높이 = 공간 높이 - 상단몰딩 - 걸래받이(받침대)
      const frameTop = spaceInfo.frameSize?.top || 0;
      const baseHeight = spaceInfo.baseConfig?.height || 0;
      const furnitureHeight = spaceInfo.height - frameTop - baseHeight;
      const internalSpace = {
        width: spaceInfo.width - 36,
        height: furnitureHeight,
        depth: spaceInfo.depth
      };

      console.log('internalSpace:', internalSpace, `(공간 ${spaceInfo.height} - 상단몰딩 ${frameTop} - 하부 ${baseHeight} = ${furnitureHeight})`);

      placedModules.forEach((placedModule, moduleIndex) => {
        // Get module ID
        const moduleId = placedModule.moduleId || placedModule.moduleType;
        console.log(`Module ${moduleIndex}: moduleId = ${moduleId}`);
        if (!moduleId) {
          console.warn(`Module ${moduleIndex} has no moduleId`);
          return;
        }

        // 가구 식별 라벨 생성 (패널 이름 앞에 붙임)
        const furnitureNumber = moduleIndex + 1;
        
        
        // Find module data with dynamic sizing
        // 배치된 가구의 moduleData가 있으면 그것을 사용 (높이 변경 등 반영), 없으면 원본 가져오기
        // 커스텀 가구(customizable-*)는 PlacedModule 속성에서 ModuleData를 빌드
        // 단내림 구간 가구는 zone 반영된 spaceInfo로 moduleData 조회 (3D 렌더링과 동일)
        let effectiveSpaceInfo = spaceInfo;
        let effectiveInternalSpace = internalSpace;
        if (placedModule.zone === 'dropped') {
          effectiveSpaceInfo = { ...spaceInfo, zone: 'dropped' as const };
          const dropFrameTop = spaceInfo.frameSize?.top || 0;
          const dropBaseH = spaceInfo.baseConfig?.height || 0;
          const isFreePlc = spaceInfo.layoutMode === 'free-placement';
          let dropH = 0;
          if (isFreePlc && spaceInfo.stepCeiling?.enabled) dropH = spaceInfo.stepCeiling.dropHeight || 0;
          else if (!isFreePlc && spaceInfo.droppedCeiling?.enabled) dropH = spaceInfo.droppedCeiling.dropHeight || 0;
          effectiveInternalSpace = {
            ...internalSpace,
            height: spaceInfo.height - dropH - dropFrameTop - dropBaseH,
          };
        }
        let moduleData = (placedModule as any).moduleData
          || getModuleById(moduleId, effectiveInternalSpace, effectiveSpaceInfo)
          || buildModuleDataFromPlacedModule(placedModule);
        if (!moduleData) {
          console.warn(`Module ${moduleIndex}: No module data found for ${moduleId}`);
          return;
        }

        // customSections가 있으면 modelConfig.sections를 대체 (섹션 높이 변경, 안전선반 제거 등 반영)
        if (placedModule.customSections && moduleData.modelConfig) {
          moduleData = {
            ...moduleData,
            modelConfig: {
              ...moduleData.modelConfig,
              sections: placedModule.customSections
            }
          };
          console.log(`Module ${moduleIndex}: Using customSections from placed module`, placedModule.customSections);
        }
        // 상부 안전선반 제거 옵션 적용 (코트장/붙박이장B/D)
        moduleData = withUpperSafetyShelfRemoved(moduleData, (placedModule as any).removeUpperSafetyShelf);
        console.log(`Module ${moduleIndex}: Found module data`, moduleData);

        // 가구 식별 라벨: "[1]" 형태 (간결하게)
        const furnitureLabel = placedModules.length > 1 ? `[${furnitureNumber}]` : '';

        // Get actual module configuration
        // 듀얼 가구: placedModule.width는 전체 듀얼 폭이지만, calculatePanelDetails는 칼럼 폭 기준
        // PlacedModulePropertiesPanel과 동일 순서: adjustedWidth → customWidth → moduleData.dimensions.width
        const width = (placedModule as any).adjustedWidth
          ?? (placedModule as any).customWidth
          ?? moduleData.dimensions.width;
        const depth = placedModule.customDepth || moduleData.dimensions.depth;
        const hasDoor = placedModule.hasDoor || false;
        const material = placedModule.material || 'PB';
        const color = placedModule.color || 'MW';
        const moduleHingePosition = (placedModule as any).hingePosition || 'right';
        const moduleHingeType = (placedModule as any).hingeType || 'A';
        // doorTopGap/doorBottomGap: 모듈별 기본값 적용 (PlacedModulePropertiesPanel과 동일)
        // 도어올림=30, 상판내림=-80, 일반하부장=-20, 키큰장=5 (하부장 0은 이전 버그값 → 기본값 복원)
        const rawDoorTopGap = (placedModule as any).doorTopGap;
        const rawDoorBottomGap = (placedModule as any).doorBottomGap;
        const modId = placedModule.moduleId || '';
        const isLowerMod = modId.startsWith('lower-') || modId.includes('dual-lower-');
        const isDoorLiftMod = modId.includes('lower-door-lift-') && !modId.includes('-half-');
        const isTopDownMod = modId.includes('lower-top-down-') && !modId.includes('-half-');
        const defaultTopGap = isDoorLiftMod ? 30 : isTopDownMod ? -80 : isLowerMod ? -20 : 5;
        const moduleDoorTopGap = (rawDoorTopGap === undefined || (isLowerMod && rawDoorTopGap === 0)) ? defaultTopGap : rawDoorTopGap;
        const moduleDoorBottomGap = (rawDoorBottomGap === undefined || (isLowerMod && rawDoorBottomGap === 0)) ? (isLowerMod ? 5 : 25) : rawDoorBottomGap;


        // Extract panel details using shared calculatePanelDetails (same as PlacedModulePropertiesPanel)
        const t = (key: string) => key; // 간단한 번역 함수
        const moduleBackPanelThickness = (placedModule as any).backPanelThickness ?? 9;

        // 프레임 높이 계산
        const topFrameH = (placedModule as any).topFrameThickness ?? calculateTopBottomFrameHeight(spaceInfo);
        const baseFrameH = (placedModule as any).baseFrameHeight ?? calculateBaseFrameHeight(spaceInfo);
        const floorFinishH = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinishHeight || 15) : 0;
        const visualBaseFrameH = spaceInfo.baseConfig?.type === 'floor' && floorFinishH > 0
          ? Math.max(0, baseFrameH - floorFinishH) : baseFrameH;

        // 단내림 구간 높이 계산 (도어 높이 산출용)
        let moduleSpaceHeight = spaceInfo.height;
        const isFreePlacement = spaceInfo.layoutMode === 'free-placement';
        if (placedModule.zone === 'dropped') {
          if (isFreePlacement && spaceInfo.stepCeiling?.enabled) {
            moduleSpaceHeight = spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
          } else if (!isFreePlacement && spaceInfo.droppedCeiling?.enabled) {
            moduleSpaceHeight = spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0);
          }
        }

        // EP ㄷ자 프레임: 인접 가구 판단 (측판 생략 여부) — PlacedModulePropertiesPanel과 동일
        let leftEpAdj = false, rightEpAdj = false;
        if (placedModule.slotIndex !== undefined && !placedModule.isFreePlacement) {
          const mySlot = placedModule.slotIndex;
          const myZone = placedModule.zone || 'normal';
          const isDual = placedModule.isDualSlot;
          leftEpAdj = placedModules.some(m =>
            m.id !== placedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
            m.slotIndex !== undefined && (m.slotIndex === mySlot - 1 || (m.isDualSlot && m.slotIndex === mySlot - 2))
          );
          const rightEnd = isDual ? mySlot + 1 : mySlot;
          rightEpAdj = placedModules.some(m =>
            m.id !== placedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
            m.slotIndex !== undefined && (m.slotIndex === rightEnd + 1 || (m.isDualSlot && m.slotIndex === rightEnd + 1))
          );
        }

        const allPanelsList = calculatePanelDetailsShared(
          moduleData, width, depth, hasDoor, t, undefined,
          moduleHingePosition, moduleHingeType,
          moduleSpaceHeight, moduleDoorTopGap, moduleDoorBottomGap,
          baseHeight, moduleBackPanelThickness, placedModule.customConfig,
          placedModule.hasLeftEndPanel,     // 좌측 엔드패널 여부
          placedModule.hasRightEndPanel,    // 우측 엔드패널 여부
          (placedModule as any).endPanelThickness, // 엔드패널 두께
          (() => {
            return getPlacedModuleCategory(placedModule) === 'upper'
              ? (placedModule.customHeight ?? placedModule.freeHeight)
              : (placedModule.freeHeight ?? placedModule.customHeight);
          })(), // 렌더링과 동일한 높이 우선순위
          topFrameH,                        // 상단몰딩 높이
          visualBaseFrameH,                 // 걸래받이 높이 (바닥마감재 차감)
          (placedModule as any).hasTopFrame, // 상단몰딩 표시 여부
          (placedModule as any).hasBase,     // 걸래받이 표시 여부
          placedModule.isDualSlot,           // 듀얼 슬롯 가구 여부
          leftEpAdj,                         // leftEpAdjacentFurniture
          rightEpAdj,                        // rightEpAdjacentFurniture
          (placedModule as any).topPanelNotchSize,  // 상판 따내기 크기
          (placedModule as any).topPanelNotchSide,  // 따내기 위치
          // 인조대리석 상판설치 (frontOffset 미설정 시 모듈별 기본값 적용)
          placedModule.stoneTopThickness,
          (() => {
            const stT = placedModule.stoneTopThickness || 0;
            const fo = placedModule.stoneTopFrontOffset;
            if (stT > 0 && (fo === undefined || fo === 0)) {
              return isTopDownMod ? (stT === 30 ? 33 : 23) : isDoorLiftMod ? 0 : 23;
            }
            return fo;
          })(),
          placedModule.stoneTopBackOffset,
          placedModule.stoneTopLeftOffset,
          placedModule.stoneTopRightOffset,
          placedModule.stoneTopBackLip,
          placedModule.stoneTopBackLipThickness,
          placedModule.stoneTopBackLipDepthOffset,
          placedModule.stoneTopBackLipTopOffset,
          placedModule.stoneTopBackLipTopBackOffset,
          placedModule.stoneTopBackLipFullFill,
          placedModule.stoneTopBackLipFillHeight,
          (placedModule as any).hasTopFrame === false
            ? 0
            : (((placedModule as any).endPanelTopOffset ?? 0) > 0 ? (placedModule as any).endPanelTopOffset : topFrameH),
          (placedModule as any).hasBase === false
            ? 0
            : (((placedModule as any).endPanelBottomOffset ?? 0) > 0 ? (placedModule as any).endPanelBottomOffset : baseFrameH)
        );

        console.log(`Module ${moduleIndex}: All panels list received:`, allPanelsList);
        console.log(`Module ${moduleIndex}: Total panel count:`, allPanelsList.length);

        // calculatePanelDetailsShared는 평면 배열을 반환함 (섹션 헤더 포함)
        // 섹션 헤더("=== xxx ===")를 제외하고 실제 패널만 필터링
        // 또한 width나 depth 속성이 있어야 실제 패널로 간주
        // 유리장: 도어(금속 프레임+브라운 유리)는 별도 제작이므로 CNC 패널 추출 제외
        const isGlassCabinet = moduleData?.id?.includes('glass-cabinet');
        let modulePanels = allPanelsList.filter((item: any) => {
          const isNotHeader = item.name && !item.name.includes('===');
          const hasValidDimensions = item.width !== undefined || item.depth !== undefined;
          const isGlassDoor = isGlassCabinet && item.name && (item.name.includes('도어') || item.name.includes('Door'));
          return isNotHeader && hasValidDimensions && !isStonePanel(item) && !isGlassDoor;
        });

        // 유리장: 백패널은 서랍모듈 뒤(서랍 측판 H=500) 영역만 포함, 후면 보강대는 제외
        if (isGlassCabinet) {
          const GLASS_DRAWER_SIDE_H = 500;
          modulePanels = modulePanels.filter((item: any) => {
            // 후면 보강대 제거 (서랍 위/아래 영역에 위치)
            if (item.name && item.name.includes('후면 보강대')) return false;
            return true;
          }).map((item: any) => {
            // 백패널 높이를 서랍 영역 크기로 축소 (+10mm extension 유지)
            if (item.name && item.name.includes('백패널')) {
              return { ...item, height: GLASS_DRAWER_SIDE_H + 10 };
            }
            return item;
          });
        }

        console.log(`Module ${moduleIndex}: Filtered ${modulePanels.length} actual panels (excluding ${allPanelsList.length - modulePanels.length} section headers)`);

        // 패널 결방향 정보 가져오기
        const panelGrainDirections = placedModule.panelGrainDirections || {};
        console.log(`Module ${moduleIndex}: panelGrainDirections:`, panelGrainDirections);

        // 보링 위치 계산 (2D 뷰어와 동일한 데이터)
        // sections가 없으면 leftSections 사용 (듀얼 비대칭 가구 대응)
        const modelConfig = moduleData.modelConfig;
        const sections = modelConfig?.sections || modelConfig?.leftSections || [];
        const furnitureHeight = placedModule.customHeight || moduleData.dimensions.height;
        const basicThicknessMm = modelConfig?.basicThickness ?? (spaceInfo.panelThickness ?? 18);

        console.log(`[BORING DEBUG] Module ${moduleIndex}: moduleData.id=${moduleData.id}`);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: sections=`, sections);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: sections.length=`, sections?.length);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: leftSections=`, modelConfig?.leftSections);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: rightSections=`, modelConfig?.rightSections);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: furnitureHeight=${furnitureHeight}`);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: modelConfig=`, modelConfig);

        // 전체 가구 보링 위치 계산
        const boringResult = calculateShelfBoringPositions({
          sections,
          totalHeightMm: furnitureHeight,
          basicThicknessMm,
        });
        const allBoringPositions = boringResult.positions;

        // 분리 측판용 섹션 높이 계산 (allBoringPositions에서 직접 분리)
        const halfThicknessMm = basicThicknessMm / 2; // 9mm
        let lowerSectionHeightForBoring = 0;
        if (sections.length >= 2) {
          const sec0 = sections[0];
          if (sec0.heightType === 'absolute') {
            lowerSectionHeightForBoring = sec0.height;
          } else {
            const availH = furnitureHeight - basicThicknessMm * 2;
            const varSecs = sections.filter(s => s.heightType !== 'absolute');
            const totalPct = varSecs.reduce((sum, s) => sum + (s.height || 100), 0);
            lowerSectionHeightForBoring = availH * ((sec0.height || 100) / totalPct);
          }
        }
        // 하부 측판 범위: 0 ~ lowerSectionHeight (절대좌표)
        // 하부 상판 중심 = 18 + lowerSectionHeight - 18 - 9 = lowerSectionHeight - 9
        // 상부 바닥판 중심 = 18 + lowerSectionHeight - 18 + 9 = lowerSectionHeight + 9
        // 하부 측판 범위: 보링 ≤ lowerSectionHeight (하부 상판까지)
        // 상부 측판 범위: 보링 > lowerSectionHeight (상부 바닥판부터)
        // 상부 측판의 로컬좌표 변환: 보링 - (18 + lowerSectionHeight - 18) = 보링 - lowerSectionHeight
        // 하지만 하부 상판의 절대위치와 상부 바닥판의 절대위치 사이에 칸막이가 있음
        // 칸막이 중심 = basicThickness(18) + lowerSectionHeight - basicThickness(18) = lowerSectionHeight
        // 하부 상판 중심: lowerSectionHeight - halfThickness (하부 측판에 속함)
        // 상부 바닥판 중심: lowerSectionHeight + halfThickness (상부 측판에 속함)
        const lowerCutoff = lowerSectionHeightForBoring; // 이 값 이하면 하부, 초과면 상부
        // 상부 측판의 panelBottom (절대좌표): 칸막이 하면 = lowerSectionHeight
        // 하부는 panelBottom = 0

        console.log(`[BORING DEBUG] Module ${moduleIndex}: allBoringPositions:`, allBoringPositions);
        console.log(`[BORING DEBUG] Module ${moduleIndex}: lowerSectionHeightForBoring=${lowerSectionHeightForBoring}`);

        // Panel 타입으로 변환하고 고유 ID 할당
        const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
          // 패널 이름으로 결방향 찾기 (사용자 설정 > 패널 타입 기본값)
          const grainDirection = panelGrainDirections[panel.name];
          const grainValue = grainDirection
            ? (grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL')
            : getDefaultGrain(panel.name);

          // 측판인지 확인
          const isDrawerSidePanel = panel.name.includes('서랍') && (panel.name.includes('좌측판') || panel.name.includes('우측판'));
          const isDrawerFrontPanel = panel.name.includes('서랍') && panel.name.includes('앞판');
          const isDoorPanel = panel.isDoor === true || panel.name.includes('도어') || panel.name.includes('Door');
          const isFurnitureSidePanel = (
            panel.name.includes('좌측') ||
            panel.name.includes('우측') ||
            panel.name.includes('좌측판') ||
            panel.name.includes('우측판') ||
            panel.name.includes('Left') ||
            panel.name.includes('Right') ||
            panel.name.includes('측판')
          );
          const isSidePanel = isFurnitureSidePanel;

          // 측판의 보링 위치 결정
          let panelBoringPositions: number[] | undefined = undefined;

          if (isSidePanel) {
            if (isDrawerSidePanel) {
              // 서랍 본체 측판
              if (panel.boringPositions && panel.boringPositions.length > 0) {
                panelBoringPositions = panel.boringPositions;
              } else {
                const drawerHeight = panel.height || 0;
                const edgeOffsetY = 20;
                if (drawerHeight > 0) {
                  panelBoringPositions = [edgeOffsetY, drawerHeight / 2, drawerHeight - edgeOffsetY];
                }
              }
            } else {
              // 가구 본체 측판
              const isUpperSection = panel.name.includes('(상)');
              const isLowerSection = panel.name.includes('(하)');
              const isSplitPanel = isUpperSection || isLowerSection;
              const panelHeight = panel.height || panel.depth || furnitureHeight;

              if (isSplitPanel) {
                // 분리 측판: allBoringPositions에서 직접 섹션 범위 필터링
                // (2D 뷰어 SidePanelBoring과 동일한 소스 데이터 사용)
                if (isLowerSection) {
                  // 하부: 절대좌표 <= lowerCutoff 범위, 로컬좌표 = 그대로 (panelBottom=0)
                  panelBoringPositions = allBoringPositions
                    .filter(pos => pos <= lowerCutoff);
                } else {
                  // 상부: 절대좌표 > lowerCutoff 범위, 로컬좌표 = pos - lowerCutoff
                  panelBoringPositions = allBoringPositions
                    .filter(pos => pos > lowerCutoff)
                    .map(pos => pos - lowerCutoff);
                }
                panelBoringPositions.sort((a, b) => a - b);
                console.log(`  [BORING] 분리 측판 "${panel.name}" (${isLowerSection ? '하부' : '상부'}): allBoringPositions에서 직접 분리 → ${panelBoringPositions.length}개:`, panelBoringPositions);
              } else {
                // 통짜 측판: 전체 보링 그대로
                panelBoringPositions = allBoringPositions
                  .filter(pos => pos >= 0 && pos <= panelHeight);
                console.log(`  [BORING] 통짜 측판 "${panel.name}": ${panelBoringPositions.length}개:`, panelBoringPositions);
              }
            }
          }

          // ★★★ 서랍 앞판 마이다 보링 처리 ★★★
          // calculatePanelDetails에서 이미 계산된 boringPositions/boringDepthPositions 사용
          let panelBoringDepthPositions: number[] | undefined = undefined;

          if (isDrawerFrontPanel) {
            if (panel.boringPositions && panel.boringPositions.length > 0) {
              panelBoringPositions = panel.boringPositions;
              panelBoringDepthPositions = panel.boringDepthPositions;
              console.log(`[BORING] ★ 서랍 앞판 감지! "${panel.name}" - boringPositions:`, panelBoringPositions);
              console.log(`[BORING]   boringDepthPositions:`, panelBoringDepthPositions);
            } else {
              console.log(`[BORING] 서랍 앞판 "${panel.name}": boringPositions 없음 (calculatePanelDetails에서 계산 안됨)`);
            }
          } else if (isDrawerSidePanel) {
            // 서랍 측판은 이미 위에서 panelBoringPositions 처리됨
            panelBoringDepthPositions = panel.boringDepthPositions;
          }

          // ★★★ 도어 패널 보링 처리 ★★★
          let screwPositions: number[] | undefined = undefined;
          let screwDepthPositions: number[] | undefined = undefined;

          if (isDoorPanel) {
            // 도어 패널: 힌지컵 보링 + 나사홀
            if (panel.boringPositions && panel.boringPositions.length > 0) {
              panelBoringPositions = panel.boringPositions;
              panelBoringDepthPositions = panel.boringDepthPositions;
              console.log(`[BORING] ★ 도어 패널 감지! "${panel.name}" - 힌지컵 boringPositions:`, panelBoringPositions);
            }
            if (panel.screwPositions && panel.screwPositions.length > 0) {
              screwPositions = panel.screwPositions;
              screwDepthPositions = panel.screwDepthPositions;
              console.log(`[BORING]   나사홀 screwPositions:`, screwPositions);
            }
          }

          console.log(`  Panel ${panelIndex}: "${panel.name}" - grain: ${grainDirection} -> ${grainValue}`);

          return {
            id: `m${moduleIndex}_p${panelIndex}`,
            name: furnitureLabel ? `${furnitureLabel} ${panel.name}` : panel.name,
            width: panel.width || 0,
            height: panel.height || panel.depth || 0, // depth가 height로 사용될 수 있음
            thickness: panel.thickness,
            material: panel.material || material,
            color: color,
            quantity: 1,
            grain: grainValue,
            boringPositions: panelBoringPositions,
            boringDepthPositions: panelBoringDepthPositions, // 서랍 측판/앞판만
            groovePositions: panel.groovePositions, // 서랍 앞판/뒷판 바닥판 홈
            // 도어 전용 필드
            screwPositions: isDoorPanel ? screwPositions : undefined,
            screwDepthPositions: isDoorPanel ? screwDepthPositions : undefined,
            isDoor: isDoorPanel || undefined,
            isLeftHinge: isDoorPanel ? panel.isLeftHinge : undefined,
            screwHoleSpacing: isDoorPanel ? panel.screwHoleSpacing : undefined,
            // 측판 힌지 브라켓 타공 필드
            bracketBoringPositions: panel.bracketBoringPositions,
            bracketBoringDepthPositions: panel.bracketBoringDepthPositions,
            isBracketSide: panel.isBracketSide,
            // 따내기 (노치) 정보
            cornerNotch: panel.cornerNotch,
            sideNotches: panel.sideNotches,
            rebate: panel.rebate,
            // 3D 뷰어 패널 하이라이트용
            meshName: toMeshName(panel.name),
            furnitureId: placedModule.id,
          };
        });

        console.log(`Module ${moduleIndex}: Converted ${convertedPanels.length} panels`);
        allPanels.push(...convertedPanels);
      });

      // 서라운드 패널 추가 — 좌측은 맨 좌측 가구에, 우측은 맨 우측 가구에 귀속
      // 자유배치: freeSurround 설정에서 패널 생성
      // 균등배치: surroundType + frameSize에서 패널 생성
      let surroundPanelList: any[] = [];
      const spaceH = spaceInfo.height || 2400;
      const floorFinishForSurround = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinishHeight || 15) : 0;
      const floatH = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
        ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
      const surroundH = spaceH - floorFinishForSurround - floatH;

      const userPT = spaceInfo.panelThickness ?? 18;
      const surroundThickness = (userPT === 18.5 || userPT === 15.5) ? 18.5 : 18;
      const surroundMaterial = surroundThickness === 18.5 ? 'PET' : 'PB';

      if (spaceInfo.freeSurround) {
        // 자유배치 서라운드
        surroundPanelList = calculateSurroundPanels(spaceInfo.freeSurround, surroundH, spaceInfo.panelThickness ?? 18);
      } else if (spaceInfo.surroundType === 'surround' && spaceInfo.frameSize) {
        // 균등배치 서라운드 — frameSize에서 직접 패널 생성
        // 서라운드 두께/재질: 사용자 설정값 따름 (18→PB, 18.5→PET). 15/15.5는 서라운드에 없으므로 18/18.5로 변환
        surroundPanelList = buildSurroundPanelsFromRenderedFrames(placedModules, spaceInfo, surroundThickness, surroundMaterial);
      }

      // 슬롯배치 커튼박스 L자 프레임 패널 추가
      if (spaceInfo.layoutMode !== 'free-placement' && spaceInfo.curtainBox?.enabled) {
        const cbPos = spaceInfo.curtainBox.position || 'right';
        const cbWidthMM = spaceInfo.curtainBox.width || 150;
        const cbDropH = spaceInfo.curtainBox.dropHeight || 60;
        const cbPanelThickness = surroundThickness; // 커튼박스도 서라운드와 동일 두께
        const cbSideDepth = 40;
        // 전면 가림판: CB폭 - 3mm (양쪽 1.5mm gap)
        const cbFrontWidth = cbWidthMM - 3;
        // 높이: 서라운드 높이(공간-바닥재-float) + cbDropH (3D Room.tsx와 동일)
        const cbPanelHeight = surroundH + cbDropH;
        const posLabel = cbPos === 'left' ? '좌측' : '우측';

        // 전면 가림판
        surroundPanelList.push({
          name: `${posLabel} 커튼박스 전면판`,
          width: cbFrontWidth,
          height: cbPanelHeight,
          thickness: cbPanelThickness,
          material: surroundMaterial,
        });
        // 경계면 칸막이 (측면판)
        surroundPanelList.push({
          name: `${posLabel} 커튼박스 측면판`,
          width: cbSideDepth,
          height: cbPanelHeight,
          thickness: cbPanelThickness,
          material: surroundMaterial,
        });
      }

      if (surroundPanelList.length > 0) {
        // 맨 좌측/우측 가구 인덱스 판별 (slotIndex 기준, 없으면 배열 순서)
        let leftMostIdx = 0;
        let rightMostIdx = placedModules.length - 1;
        if (placedModules.length > 1) {
          let minSlot = Infinity, maxSlot = -Infinity;
          placedModules.forEach((pm, idx) => {
            const slot = pm.slotIndex ?? idx;
            if (slot < minSlot) { minSlot = slot; leftMostIdx = idx; }
            if (slot > maxSlot) { maxSlot = slot; rightMostIdx = idx; }
          });
        }

        const leftFurnitureNumber = leftMostIdx + 1;
        const rightFurnitureNumber = rightMostIdx + 1;
        const leftLabel = placedModules.length > 1 ? `[${leftFurnitureNumber}]` : '';
        const rightLabel = placedModules.length > 1 ? `[${rightFurnitureNumber}]` : '';

        console.log(`서라운드 패널 ${surroundPanelList.length}개: 좌측→가구${leftFurnitureNumber}(idx=${leftMostIdx}, id=${placedModules[leftMostIdx]?.id}), 우측→가구${rightFurnitureNumber}(idx=${rightMostIdx}, id=${placedModules[rightMostIdx]?.id})`);
        console.log(`  배열 첫번째: id=${placedModules[0]?.id}, 배열 마지막: id=${placedModules[placedModules.length - 1]?.id}`);

        surroundPanelList.forEach((panel: any, idx: number) => {
          const isLeft = panel.name.includes('좌측');
          const isRight = panel.name.includes('우측');
          // 좌측 서라운드 → 맨 좌측 가구, 우측 서라운드 → 맨 우측 가구, 중간 → 별도
          let furnitureId = 'surround';
          let namePrefix = '';
          if (isLeft) {
            furnitureId = placedModules[leftMostIdx].id;
            namePrefix = leftLabel ? `${leftLabel} ` : '';
          } else if (isRight) {
            furnitureId = placedModules[rightMostIdx].id;
            namePrefix = rightLabel ? `${rightLabel} ` : '';
          }

          allPanels.push({
            id: `surround_p${idx}`,
            name: `${namePrefix}${panel.name}`,
            width: panel.width || 0,
            height: panel.height || 0,
            thickness: panel.thickness,
            material: panel.material || 'PB',
            color: placedModules[0]?.color || 'MW',
            quantity: 1,
            grain: getDefaultGrain(panel.name),
            meshName: toMeshName(panel.name),
            furnitureId,
          });
        });
      }

      // 프레임 패널 furnitureId 통일: 3D에서 프레임은 하나의 공유 객체이므로
      // 모든 모듈의 프레임 패널을 첫 번째 모듈 ID로 통일해야 Room.tsx의 excludeKey와 매칭됨
      // (상부 서라운드 프레임도 meshName='top-frame'이므로 포함)
      const firstId = placedModules[0]?.id || '';
      allPanels.forEach(p => {
        if ((p.meshName === 'top-frame' || p.meshName === 'base-frame') && p.furnitureId !== firstId) {
          p.furnitureId = firstId;
        }
      });

      console.log('========================================');
      console.log('📊 패널 추출 완료 요약:');
      console.log(`   - 배치된 가구 수: ${placedModules.length}`);
      console.log(`   - 총 추출된 패널 수: ${allPanels.length}`);
      console.log('   - 가구별 패널 수:');
      const panelCountByModule = new Map<number, number>();
      allPanels.forEach(p => {
        const moduleIdx = parseInt(p.id.split('_')[0].replace('m', ''));
        panelCountByModule.set(moduleIdx, (panelCountByModule.get(moduleIdx) || 0) + 1);
      });
      panelCountByModule.forEach((count, moduleIdx) => {
        console.log(`     가구 ${moduleIdx}: ${count}개 패널`);
      });
      console.log('========================================');
      console.log('All panels:', allPanels);

      // ★ 프레임 병합 처리: frameMergeEnabled=true일 때 개별 상부/걸래받이을 병합
      // 병합 조건: 프레임 높이(Y축)·두께(Z축)가 동일하고 합산 너비(X축) ≤ 2420mm
      if (spaceInfo.frameMergeEnabled && placedModules.length > 1) {
        const frameTop = spaceInfo.frameSize?.top || 0;
        const baseHeight = spaceInfo.baseConfig?.height || 0;
        const floorFinishH = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinishHeight || 15) : 0;
        const visualBaseH = spaceInfo.baseConfig?.type === 'floor' && floorFinishH > 0
          ? Math.max(0, baseHeight - floorFinishH) : baseHeight;

        const topGroups = computeFrameMergeGroups(placedModules, 'top', 2420, frameTop);
        const baseGroups = computeFrameMergeGroups(placedModules, 'base', 2420, visualBaseH);

        // 기존 개별 프레임 패널 제거 (상부 서라운드 프레임도 병합 상단몰딩과 중복이므로 제거)
        const framePanelIndices: number[] = [];
        allPanels.forEach((p, idx) => {
          if (p.name.includes('상단몰딩') || p.name.includes('걸래받이') || p.name === '상부 서라운드 프레임') {
            framePanelIndices.push(idx);
          }
        });

        // 뒤에서부터 제거 (인덱스 밀림 방지)
        for (let i = framePanelIndices.length - 1; i >= 0; i--) {
          allPanels.splice(framePanelIndices[i], 1);
        }

        // 병합된 프레임 패널 추가
        topGroups.forEach((group, gIdx) => {
          if (group.frameHeight > 0) {
            allPanels.push({
              id: `merged_top_${gIdx}`,
              name: `${group.label} 상단몰딩`,
              width: Math.round(group.totalWidthMm * 10) / 10,
              height: group.frameHeight,
              thickness: (spaceInfo.panelThickness === 18.5 || spaceInfo.panelThickness === 15.5) ? 18.5 : 18, // 프레임: 사용자 설정 따름
              material: (spaceInfo.panelThickness === 18.5 || spaceInfo.panelThickness === 15.5) ? 'PET' : 'PB',
              color: placedModules[0]?.color || 'MW',
              quantity: 1,
              grain: 'H' as any,
              meshName: 'top-frame',
              furnitureId: placedModules[0]?.id || '',
            });
          }
        });

        baseGroups.forEach((group, gIdx) => {
          if (group.frameHeight > 0) {
            allPanels.push({
              id: `merged_base_${gIdx}`,
              name: `${group.label} 걸래받이`,
              width: Math.round(group.totalWidthMm * 10) / 10,
              height: group.frameHeight,
              thickness: (spaceInfo.panelThickness === 18.5 || spaceInfo.panelThickness === 15.5) ? 18.5 : 18, // 프레임: 사용자 설정 따름
              material: (spaceInfo.panelThickness === 18.5 || spaceInfo.panelThickness === 15.5) ? 'PET' : 'PB',
              color: placedModules[0]?.color || 'MW',
              quantity: 1,
              grain: 'H' as any,
              meshName: 'base-frame',
              furnitureId: placedModules[0]?.id || '',
            });
          }
        });

        console.log(`🔗 프레임 병합: 상부 ${topGroups.length}그룹, 하부 ${baseGroups.length}그룹 (개별 ${framePanelIndices.length}개 제거)`);

        // =========================================================
        // ★ 인조대리석 상판 병합 처리
        // 상걸래받이과 마찬가지로 병합 후 내보내기 (stoneTopMergeGroups 활용)
        // =========================================================
        const stoneTopGroups = computeStoneTopMergeGroups(placedModules, 3680);
        
        if (stoneTopGroups.length > 0) {
          const stonePanelIndices: number[] = [];
          
          // 먼저, 병합 그룹에 속하는 모듈들의 ID 목록 추출
          const mergedModuleIds = new Set<string>();
          stoneTopGroups.forEach(g => g.moduleIds.forEach(id => mergedModuleIds.add(id)));

          // 병합 대상 모듈에서 개별로 생성된 인조대리석 패널의 인덱스 수집
          allPanels.forEach((p, idx) => {
            // 인조대리석 패널이면서, 이 패널의 주인이 병합 그룹에 속해 있다면 제거 대상
            // furnitureId가 없고 id만 있는 경우(기존) 대비를 위해 id에서 추출해서 확인
            const pModIdxMatch = p.id.match(/^m(\d+)_/);
            if (pModIdxMatch) {
              const pModIdx = parseInt(pModIdxMatch[1]);
              const ownerModule = placedModules[pModIdx];
              if (ownerModule && mergedModuleIds.has(ownerModule.id) && p.name.includes('인조대리석')) {
                stonePanelIndices.push(idx);
              }
            }
          });

          // 뒤에서부터 제거 (인덱스 밀림 방지)
          for (let i = stonePanelIndices.length - 1; i >= 0; i--) {
            allPanels.splice(stonePanelIndices[i], 1);
          }

          // 병합된 인조대리석 패널 생성
          stoneTopGroups.forEach((group, gIdx) => {
            // 그룹의 첫번째 모듈 설정값을 기준 모델로 가져옴
            const firstModuleId = group.moduleIds[0];
            const firstModIndex = placedModules.findIndex(m => m.id === firstModuleId);
            if (firstModIndex < 0) return;
            const refMod = placedModules[firstModIndex];

            // 1. 수평 상판
            const defaultDepth = refMod.customDepth || 600; // dimensions 대신 customDepth 활용
            allPanels.push({
              id: `merged_stone_top_${gIdx}`,
              name: `${group.label} 인조대리석 상판`,
              width: Math.round(group.totalWidthMm * 10) / 10,
              height: defaultDepth + (refMod.stoneTopFrontOffset || 0) + (refMod.stoneTopBackOffset || 0),
              thickness: refMod.stoneTopThickness || 12,
              material: '인조대리석',
              color: (refMod as any).color || 'MW',
              quantity: 1,
              grain: 'H' as any,
              meshName: 'stone-top',
              furnitureId: refMod.id,
            });

            // 2. 앞판 (상판내림 전용)
            // 상판내림 모듈인 경우 앞판 추가 (이 구분을 위해 refMod.id 패턴 확인)
            const refModuleId = refMod.moduleId || refMod.id;
            const isTopDownForStone = refModuleId.includes('lower-top-down-') || refModuleId.includes('dual-lower-top-down-');
            if (isTopDownForStone) {
              const refModuleData = getModuleById(refModuleId);
              const refHeight = refMod.freeHeight || refMod.customHeight || refModuleData?.dimensions.height || 785;
              const rawTopGap = (refMod as any).doorTopGap ?? spaceInfo.doorTopGap;
              const effectiveDoorTopGap = (rawTopGap === undefined || rawTopGap === 0) ? -80 : rawTopGap;
              const topFrontMm = 705 + (effectiveDoorTopGap - (-80));
              const frontPlateHeight = Math.max(0, refHeight - topFrontMm - 20) + (refMod.stoneTopThickness || 12);
              allPanels.push({
                id: `merged_stone_front_${gIdx}`,
                name: `${group.label} 인조대리석 앞판`,
                width: Math.round(group.totalWidthMm * 10) / 10,
                height: frontPlateHeight,
                thickness: refMod.stoneTopThickness || 12,
                material: '인조대리석',
                color: (refMod as any).color || 'MW',
                quantity: 1,
                grain: 'H' as any,
                meshName: 'stone-front',
                furnitureId: refMod.id,
              });
            }

            // 3. 뒷턱 관련 패널들
            const backLipH = refMod.stoneTopBackLip || 0;
            const backLipT = refMod.stoneTopBackLipThickness || 12;
            if (backLipH > 0) {
              const mergedWidth = Math.round(group.totalWidthMm * 10) / 10;
              
              if (refMod.stoneTopBackLipDepthOffset && refMod.stoneTopBackLipDepthOffset > 0) {
                // 전면부
                allPanels.push({
                  id: `merged_stone_backlip_front_${gIdx}`,
                  name: `${group.label} 인조대리석 뒷턱 전면부`,
                  width: mergedWidth,
                  height: backLipH - backLipT,
                  thickness: backLipT,
                  material: '인조대리석',
                  color: (refMod as any).color || 'MW',
                  quantity: 1,
                  grain: 'H' as any,
                  meshName: 'stone-backlip',
                  furnitureId: refMod.id,
                });
                
                // 상단부
                const coverDepth = refMod.stoneTopBackLipDepthOffset + backLipT + (refMod.stoneTopBackLipTopOffset || 0) + (refMod.stoneTopBackLipTopBackOffset || 0);
                allPanels.push({
                  id: `merged_stone_backlip_top_${gIdx}`,
                  name: `${group.label} 인조대리석 뒷턱 상단부`,
                  width: mergedWidth,
                  height: coverDepth, // depth가 height로 변환
                  thickness: backLipT,
                  material: '인조대리석',
                  color: (refMod as any).color || 'MW',
                  quantity: 1,
                  grain: 'H' as any,
                  meshName: 'stone-backlip',
                  furnitureId: refMod.id,
                });

                // 다채움
                if (refMod.stoneTopBackLipFullFill && refMod.stoneTopBackLipFillHeight && refMod.stoneTopBackLipFillHeight > 0) {
                  allPanels.push({
                    id: `merged_stone_backlip_midway_${gIdx}`,
                    name: `${group.label} 인조대리석 벽체 미드웨이`,
                    width: mergedWidth,
                    height: refMod.stoneTopBackLipFillHeight,
                    thickness: backLipT,
                    material: '인조대리석',
                    color: (refMod as any).color || 'MW',
                    quantity: 1,
                    grain: 'H' as any,
                    meshName: 'stone-backlip',
                    furnitureId: refMod.id,
                  });
                }
              } else {
                const finalBackLipHeight = (refMod.stoneTopBackLipFullFill && refMod.stoneTopBackLipFillHeight && refMod.stoneTopBackLipFillHeight > 0) 
                    ? refMod.stoneTopBackLipFillHeight 
                    : backLipH;

                allPanels.push({
                  id: `merged_stone_backlip_${gIdx}`,
                  name: `${group.label} 인조대리석 뒷턱`,
                  width: mergedWidth,
                  height: finalBackLipHeight,
                  thickness: backLipT,
                  material: '인조대리석',
                  color: (refMod as any).color || 'MW',
                  quantity: 1,
                  grain: 'H' as any,
                  meshName: 'stone-backlip',
                  furnitureId: refMod.id,
                });
              }
            }
          });

          console.log(`🔗 상판 병합: 상판 ${stoneTopGroups.length}그룹 (개별 ${stonePanelIndices.length}개 제거)`);
        }
      }

      setPanels(allPanels.filter(panel => !isStonePanel(panel)));
      } catch (error) {
        console.error('❌ extractPanels error:', error);
        console.error('❌ Stack:', error instanceof Error ? error.stack : '');
        setPanels([]);
      } finally {
        setIsLoading(false);
      }
    };

    extractPanels();
  }, [placedModules, spaceInfo]);

  // Normalize panels for CutList compatibility
  const normalizedPanels = useMemo(() => {
    return normalizePanels(panels, 'mm');
  }, [panels]);

  // Panel statistics
  const stats = useMemo(() => {
    const materialGroups = new Map<string, { count: number; area: number }>();
    
    panels.forEach(panel => {
      const key = `${panel.material}-${panel.color}`;
      const current = materialGroups.get(key) || { count: 0, area: 0 };
      const area = (panel.width * panel.height * panel.quantity) / 1000000; // to m²
      
      materialGroups.set(key, {
        count: current.count + panel.quantity,
        area: current.area + area
      });
    });

    return {
      totalPanels: panels.length,
      totalQuantity: panels.reduce((sum, p) => sum + p.quantity, 0),
      totalArea: panels.reduce((sum, p) => sum + (p.width * p.height * p.quantity / 1000000), 0),
      materialGroups: Array.from(materialGroups.entries()).map(([key, data]) => ({
        key,
        material: key.split('-')[0],
        color: key.split('-')[1],
        ...data
      }))
    };
  }, [panels]);

  return {
    panels,
    normalizedPanels,
    stats,
    isLoading,
    // Utility function to get panels by material/color
    getPanelsByMaterial: (material?: string, color?: string) => {
      return panels.filter(panel => {
        if (material && panel.material !== material) return false;
        if (color && panel.color !== color) return false;
        return true;
      });
    },
    // Utility function to get normalized panels by material/color
    getNormalizedPanelsByMaterial: (material?: string, color?: string) => {
      return normalizedPanels.filter(panel => {
        if (material && panel.material !== material) return false;
        if (color && panel.color !== color) return false;
        return true;
      });
    }
  };
}

/**
 * Hook to subscribe to live panel updates with callback
 */
export function usePanelSubscription(callback: (panels: Panel[]) => void) {
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);

  useEffect(() => {
    // 가구가 배치되지 않은 경우 빈 배열 콜백
    if (!placedModules || placedModules.length === 0) {
      callback([]);
      return;
    }
    
    // Extract panels and call callback
    const allPanels: Panel[] = [];
    
    // 가구 배치 높이 = 공간 높이 - 상단몰딩 - 걸래받이(받침대)
    const frameTop2 = spaceInfo.frameSize?.top || 0;
    const baseHeight2 = spaceInfo.baseConfig?.height || 0;
    const furnitureHeight2 = spaceInfo.height - frameTop2 - baseHeight2;
    const internalSpace = {
      width: spaceInfo.width - 36,
      height: furnitureHeight2,
      depth: spaceInfo.depth
    };

    placedModules.forEach((placedModule, moduleIndex) => {
      const moduleId = placedModule.moduleId || placedModule.moduleType;
      if (!moduleId) return;

      // 배치된 가구의 moduleData가 있으면 그것을 사용 (높이 변경 등 반영), 없으면 원본 가져오기
      // 단내림 구간 가구는 zone 반영된 spaceInfo로 moduleData 조회 (3D 렌더링과 동일)
      let effectiveSpaceInfo2 = spaceInfo;
      let effectiveInternalSpace2 = internalSpace;
      if (placedModule.zone === 'dropped') {
        effectiveSpaceInfo2 = { ...spaceInfo, zone: 'dropped' as const };
        const isFreePlc2 = spaceInfo.layoutMode === 'free-placement';
        let dropH2 = 0;
        if (isFreePlc2 && spaceInfo.stepCeiling?.enabled) dropH2 = spaceInfo.stepCeiling.dropHeight || 0;
        else if (!isFreePlc2 && spaceInfo.droppedCeiling?.enabled) dropH2 = spaceInfo.droppedCeiling.dropHeight || 0;
        effectiveInternalSpace2 = {
          ...internalSpace,
          height: spaceInfo.height - dropH2 - frameTop2 - baseHeight2,
        };
      }
      let moduleData = (placedModule as any).moduleData
        || getModuleById(moduleId, effectiveInternalSpace2, effectiveSpaceInfo2)
        || buildModuleDataFromPlacedModule(placedModule);
      if (!moduleData) return;

      // customSections가 있으면 modelConfig.sections를 대체 (섹션 높이 변경, 안전선반 제거 등 반영)
      if (placedModule.customSections && moduleData.modelConfig) {
        moduleData = {
          ...moduleData,
          modelConfig: {
            ...moduleData.modelConfig,
            sections: placedModule.customSections
          }
        };
      }
      // 상부 안전선반 제거 옵션 적용 (코트장/붙박이장B/D)
      moduleData = withUpperSafetyShelfRemoved(moduleData, (placedModule as any).removeUpperSafetyShelf);

      // 가구 식별 라벨 생성 (간결하게)
      const furnitureNumber2 = moduleIndex + 1;
      const furnitureLabel2 = placedModules.length > 1 ? `[${furnitureNumber2}]` : '';

      const width = (placedModule as any).adjustedWidth
        ?? (placedModule as any).customWidth
        ?? moduleData.dimensions.width;
      const depth = placedModule.customDepth || moduleData.dimensions.depth;
      const hasDoor = placedModule.hasDoor || false;
      const material = placedModule.material || 'PB';
      const color = placedModule.color || 'MW';
      const moduleHingePosition = (placedModule as any).hingePosition || 'right';
      const moduleHingeType = (placedModule as any).hingeType || 'A';
      const moduleDoorTopGap = (placedModule as any).doorTopGap ?? 5;
      const moduleDoorBottomGap = (placedModule as any).doorBottomGap ?? 25;

      // Extract panel details using shared calculatePanelDetails (same as PlacedModulePropertiesPanel)
      const t = (key: string) => key; // 간단한 번역 함수
      const moduleBackPanelThickness2 = (placedModule as any).backPanelThickness ?? 9;

      // 프레임 높이 계산
      const topFrameH2 = (placedModule as any).topFrameThickness ?? calculateTopBottomFrameHeight(spaceInfo);
      const baseFrameH2 = (placedModule as any).baseFrameHeight ?? calculateBaseFrameHeight(spaceInfo);
      const floorFinishH2 = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinishHeight || 15) : 0;
      const visualBaseFrameH2 = spaceInfo.baseConfig?.type === 'floor' && floorFinishH2 > 0
        ? Math.max(0, baseFrameH2 - floorFinishH2) : baseFrameH2;

      // 단내림 구간 높이 계산 (도어 높이 산출용)
      let moduleSpaceHeight2 = spaceInfo.height;
      const isFreePlacement2 = spaceInfo.layoutMode === 'free-placement';
      if (placedModule.zone === 'dropped') {
        if (isFreePlacement2 && spaceInfo.stepCeiling?.enabled) {
          moduleSpaceHeight2 = spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
        } else if (!isFreePlacement2 && spaceInfo.droppedCeiling?.enabled) {
          moduleSpaceHeight2 = spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0);
        }
      }

      // EP ㄷ자 프레임: 인접 가구 판단 — PlacedModulePropertiesPanel과 동일
      let leftEpAdj2 = false, rightEpAdj2 = false;
      if (placedModule.slotIndex !== undefined && !placedModule.isFreePlacement) {
        const mySlot = placedModule.slotIndex;
        const myZone = placedModule.zone || 'normal';
        const isDual = placedModule.isDualSlot;
        leftEpAdj2 = placedModules.some(m =>
          m.id !== placedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
          m.slotIndex !== undefined && (m.slotIndex === mySlot - 1 || (m.isDualSlot && m.slotIndex === mySlot - 2))
        );
        const rightEnd = isDual ? mySlot + 1 : mySlot;
        rightEpAdj2 = placedModules.some(m =>
          m.id !== placedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
          m.slotIndex !== undefined && (m.slotIndex === rightEnd + 1 || (m.isDualSlot && m.slotIndex === rightEnd + 1))
        );
      }

      const allPanelsList = calculatePanelDetailsShared(
        moduleData, width, depth, hasDoor, t, undefined,
        moduleHingePosition, moduleHingeType,
        moduleSpaceHeight2, moduleDoorTopGap, moduleDoorBottomGap,
        baseHeight2, moduleBackPanelThickness2, placedModule.customConfig,
        placedModule.hasLeftEndPanel,
        placedModule.hasRightEndPanel,
        (placedModule as any).endPanelThickness,
        (() => {
          return getPlacedModuleCategory(placedModule) === 'upper'
            ? (placedModule.customHeight ?? placedModule.freeHeight)
            : (placedModule.freeHeight ?? placedModule.customHeight);
        })(),
        topFrameH2,
        visualBaseFrameH2,
        (placedModule as any).hasTopFrame,
        (placedModule as any).hasBase,
        placedModule.isDualSlot,           // 듀얼 슬롯 가구 여부
        leftEpAdj2,                         // leftEpAdjacentFurniture
        rightEpAdj2,                        // rightEpAdjacentFurniture
        (placedModule as any).topPanelNotchSize,  // 상판 따내기 크기
        (placedModule as any).topPanelNotchSide,  // 따내기 위치
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        (placedModule as any).hasTopFrame === false
          ? 0
          : (((placedModule as any).endPanelTopOffset ?? 0) > 0 ? (placedModule as any).endPanelTopOffset : topFrameH2),
        (placedModule as any).hasBase === false
          ? 0
          : (((placedModule as any).endPanelBottomOffset ?? 0) > 0 ? (placedModule as any).endPanelBottomOffset : baseFrameH2)
      );

      // calculatePanelDetailsShared는 평면 배열을 반환함 (섹션 헤더 포함)
      // 섹션 헤더("=== xxx ===")를 제외하고 실제 패널만 필터링
      // 또한 width나 depth 속성이 있어야 실제 패널로 간주
      // 유리장: 도어(금속 프레임+브라운 유리) 별도 제작 → CNC 추출 제외
      const isGlassCabinetForFilter = moduleData?.id?.includes('glass-cabinet');
      let modulePanels = allPanelsList.filter((item: any) => {
        const isNotHeader = item.name && !item.name.includes('===');
        const hasValidDimensions = item.width !== undefined || item.depth !== undefined;
        const isGlassDoor = isGlassCabinetForFilter && item.name && (item.name.includes('도어') || item.name.includes('Door'));
        return isNotHeader && hasValidDimensions && !isStonePanel(item) && !isGlassDoor;
      });

      // 유리장: 백패널은 서랍모듈 뒤(서랍 측판 H=500) 영역만 포함, 후면 보강대는 제외
      if (isGlassCabinetForFilter) {
        const GLASS_DRAWER_SIDE_H = 500;
        modulePanels = modulePanels.filter((item: any) => {
          if (item.name && item.name.includes('후면 보강대')) return false;
          return true;
        }).map((item: any) => {
          if (item.name && item.name.includes('백패널')) {
            return { ...item, height: GLASS_DRAWER_SIDE_H + 10 };
          }
          return item;
        });
      }

      // 패널 결방향 정보 가져오기
      const panelGrainDirections = placedModule.panelGrainDirections || {};

      // 보링 위치 계산 (2D 뷰어와 동일한 데이터)
      // sections가 없으면 leftSections 사용 (듀얼 비대칭 가구 대응)
      const modelConfig = moduleData.modelConfig;
      const sections = modelConfig?.sections || modelConfig?.leftSections || [];
      const furnitureHeight = placedModule.customHeight || moduleData.dimensions.height;
      const basicThicknessMm = modelConfig?.basicThickness ?? (spaceInfo.panelThickness ?? 18);

      console.log(`[OPT BORING DEBUG] moduleId=${moduleId}, sections=`, sections);

      // 전체 가구 보링 위치 계산
      const boringResult = calculateShelfBoringPositions({
        sections,
        totalHeightMm: furnitureHeight,
        basicThicknessMm,
      });
      const allBoringPositions = boringResult.positions;

      console.log(`[OPT BORING DEBUG] allBoringPositions=`, allBoringPositions);

      // 분리 측판용 섹션 높이 계산 (allBoringPositions에서 직접 분리)
      let lowerSectionHeightForBoring2 = 0;
      if (sections.length >= 2) {
        const sec0 = sections[0];
        if (sec0.heightType === 'absolute') {
          lowerSectionHeightForBoring2 = sec0.height;
        } else {
          const availH = furnitureHeight - basicThicknessMm * 2;
          const varSecs = sections.filter(s => s.heightType !== 'absolute');
          const totalPct = varSecs.reduce((sum, s) => sum + (s.height || 100), 0);
          lowerSectionHeightForBoring2 = availH * ((sec0.height || 100) / totalPct);
        }
      }
      const lowerCutoff2 = lowerSectionHeightForBoring2;

      console.log(`[OPT BORING DEBUG] lowerSectionHeightForBoring=${lowerSectionHeightForBoring2}, lowerCutoff=${lowerCutoff2}`);

      // Panel 타입으로 변환하고 고유 ID 할당
      const convertedPanels: Panel[] = modulePanels.map((panel, panelIndex) => {
        // 패널 이름으로 결방향 찾기 (사용자 설정 > 패널 타입 기본값)
        const grainDirection = panelGrainDirections[panel.name];
        const grainValue = grainDirection
          ? (grainDirection === 'vertical' ? 'VERTICAL' : 'HORIZONTAL')
          : getDefaultGrain(panel.name);

        // 측판인지 확인 (가구 측판 + 서랍 본체 측판 모두 포함)
        const isDrawerSidePanel = panel.name.includes('서랍') && (panel.name.includes('좌측판') || panel.name.includes('우측판'));
        // 서랍 앞판: "서랍1 앞판" 등 - 마이다 보링 대상
        const isDrawerFrontPanel = panel.name.includes('서랍') && panel.name.includes('앞판');
        // 도어 패널 여부
        const isDoorPanel = panel.isDoor === true || panel.name.includes('도어') || panel.name.includes('Door');
        const isFurnitureSidePanel = (
          panel.name.includes('좌측') ||
          panel.name.includes('우측') ||
          panel.name.includes('좌측판') ||
          panel.name.includes('우측판') ||
          panel.name.includes('측판')
        );
        // 가구 측판 또는 서랍 측판 모두 보링 대상
        const isSidePanel = isFurnitureSidePanel;

        console.log(`[OPT PANEL CHECK] "${panel.name}": isDrawerSidePanel=${isDrawerSidePanel}, isDrawerFrontPanel=${isDrawerFrontPanel}, isSidePanel=${isSidePanel}, panel=`, panel);

        // 측판의 보링 위치 결정
        let panelBoringPositions: number[] | undefined = undefined;

        if (isSidePanel) {
          // 서랍 본체 측판인 경우: calculatePanelDetails에서 이미 계산된 boringPositions 사용
          if (isDrawerSidePanel) {
            if (panel.boringPositions && panel.boringPositions.length > 0) {
              panelBoringPositions = panel.boringPositions;
              console.log(`[OPT BORING] 서랍 측판 "${panel.name}": 이미 계산된 boringPositions 사용`, panelBoringPositions);
            } else {
              // fallback: 직접 계산
              const drawerHeight = panel.height || 0;
              const edgeOffsetY = 20; // 끝에서 20mm

              if (drawerHeight > 0) {
                const topBoring = drawerHeight - edgeOffsetY;
                const middleBoring = drawerHeight / 2;
                const bottomBoring = edgeOffsetY;
                panelBoringPositions = [bottomBoring, middleBoring, topBoring];
                console.log(`[OPT BORING] 서랍 측판 "${panel.name}": fallback 계산`, panelBoringPositions);
              }
            }
          } else {
            // 가구 본체 측판
            const isUpperSection = panel.name.includes('(상)');
            const isLowerSection = panel.name.includes('(하)');
            const isSplitPanel = isUpperSection || isLowerSection;
            // 측판 높이: panel.height 또는 panel.depth, 없으면 가구 전체 높이 사용
            const panelHeight = panel.height || panel.depth || furnitureHeight; // 측판 높이 (mm)
            const halfThickness = basicThicknessMm / 2; // 9mm

            console.log(`[OPT BORING] "${panel.name}": isUpper=${isUpperSection}, isLower=${isLowerSection}, isSplit=${isSplitPanel}, panelHeight=${panelHeight}, furnitureHeight=${furnitureHeight}`);

          if (isSplitPanel) {
            // 분리 측판: allBoringPositions에서 직접 섹션 범위 필터링
            // (2D 뷰어 SidePanelBoring과 동일한 소스 데이터 사용)
            if (isLowerSection) {
              // 하부: 절대좌표 <= lowerCutoff 범위
              panelBoringPositions = allBoringPositions
                .filter(pos => pos <= lowerCutoff2);
            } else {
              // 상부: 절대좌표 > lowerCutoff 범위, 로컬좌표 = pos - lowerCutoff
              panelBoringPositions = allBoringPositions
                .filter(pos => pos > lowerCutoff2)
                .map(pos => pos - lowerCutoff2);
            }
            panelBoringPositions.sort((a, b) => a - b);
            console.log(`[OPT BORING] 분리 측판 "${panel.name}" (${isLowerSection ? '하부' : '상부'}): allBoringPositions에서 직접 분리 → ${panelBoringPositions.length}개:`, panelBoringPositions);
          } else {
            // 통짜 측판: 전체 가구 보링 위치를 패널 로컬 좌표로 변환
            // allBoringPositions는 가구 바닥 기준 절대 좌표
            // 가장자리 보링도 포함하도록 >= 및 <= 사용
            console.log(`[OPT BORING] 통짜 측판 - allBoringPositions:`, allBoringPositions);
            panelBoringPositions = allBoringPositions
              .filter(pos => pos >= 0 && pos <= panelHeight);
            console.log(`[OPT BORING] result:`, panelBoringPositions);
          }

          console.log(`[OPT BORING FINAL] "${panel.name}" - boringPositions:`, panelBoringPositions);
          }
        }

        // ★★★ 서랍 앞판 마이다 보링 처리 ★★★
        // calculatePanelDetails에서 이미 계산된 boringPositions/boringDepthPositions 사용
        let panelBoringDepthPositions: number[] | undefined = undefined;

        if (isDrawerFrontPanel) {
          if (panel.boringPositions && panel.boringPositions.length > 0) {
            panelBoringPositions = panel.boringPositions;
            panelBoringDepthPositions = panel.boringDepthPositions;
            console.log(`[OPT BORING] ★ 서랍 앞판 감지! "${panel.name}" - boringPositions:`, panelBoringPositions);
            console.log(`[OPT BORING]   boringDepthPositions:`, panelBoringDepthPositions);
          } else {
            console.log(`[OPT BORING] 서랍 앞판 "${panel.name}": boringPositions 없음`);
          }
        } else if (isDrawerSidePanel) {
          // 서랍 측판은 이미 위에서 panelBoringPositions 처리됨
          panelBoringDepthPositions = panel.boringDepthPositions;
        }

        // ★★★ 도어 패널 보링 처리 ★★★
        let screwPositions: number[] | undefined = undefined;
        let screwDepthPositions: number[] | undefined = undefined;

        if (isDoorPanel) {
          // 도어 패널: 힌지컵 보링 + 나사홀
          if (panel.boringPositions && panel.boringPositions.length > 0) {
            panelBoringPositions = panel.boringPositions;
            panelBoringDepthPositions = panel.boringDepthPositions;
            console.log(`[OPT BORING] ★ 도어 패널 감지! "${panel.name}" - 힌지컵 boringPositions:`, panelBoringPositions);
          }
          if (panel.screwPositions && panel.screwPositions.length > 0) {
            screwPositions = panel.screwPositions;
            screwDepthPositions = panel.screwDepthPositions;
            console.log(`[OPT BORING]   나사홀 screwPositions:`, screwPositions);
          }
        }

        return {
          id: `m${moduleIndex}_p${panelIndex}`,
          name: furnitureLabel2 ? `${furnitureLabel2} ${panel.name}` : panel.name,
          width: panel.width || 0,
          height: panel.height || panel.depth || 0, // depth가 height로 사용될 수 있음
          thickness: panel.thickness,
          material: panel.material || material,
          color: color,
          quantity: 1,
          grain: grainValue,
          boringPositions: panelBoringPositions,
          boringDepthPositions: panelBoringDepthPositions, // 서랍 측판/앞판만
          groovePositions: panel.groovePositions, // 서랍 앞판/뒷판 바닥판 홈
          // 도어 전용 필드
          screwPositions: isDoorPanel ? screwPositions : undefined,
          screwDepthPositions: isDoorPanel ? screwDepthPositions : undefined,
          isDoor: isDoorPanel || undefined,
          isLeftHinge: isDoorPanel ? panel.isLeftHinge : undefined,
          screwHoleSpacing: isDoorPanel ? panel.screwHoleSpacing : undefined,
          // 측판 힌지 브라켓 타공 필드
          bracketBoringPositions: panel.bracketBoringPositions,
          bracketBoringDepthPositions: panel.bracketBoringDepthPositions,
          isBracketSide: panel.isBracketSide,
          // 따내기 (노치) 정보
          cornerNotch: panel.cornerNotch,
          sideNotches: panel.sideNotches,
          rebate: panel.rebate,
        };
      });

      allPanels.push(...convertedPanels);
    });

    // 서라운드 패널 추가 — 좌측은 맨 좌측 가구에, 우측은 맨 우측 가구에 귀속
    // 자유배치: freeSurround / 균등배치: surroundType + frameSize
    let surroundPanelList2: any[] = [];
    const spaceH2 = spaceInfo.height || 2400;
    const floorFinishForSurround2 = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinishHeight || 15) : 0;
    const floatH2 = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float'
      ? (spaceInfo.baseConfig.floatHeight || 0) : 0;
    const surroundH2 = spaceH2 - floorFinishForSurround2 - floatH2;
    const userPT2 = spaceInfo.panelThickness ?? 18;
    const surroundThickness2 = (userPT2 === 18.5 || userPT2 === 15.5) ? 18.5 : 18;
    const surroundMaterial2 = surroundThickness2 === 18.5 ? 'PET' : 'PB';

    if (spaceInfo.freeSurround) {
      surroundPanelList2 = calculateSurroundPanels(spaceInfo.freeSurround, surroundH2, spaceInfo.panelThickness ?? 18);
    } else if (spaceInfo.surroundType === 'surround' && spaceInfo.frameSize) {
      // 서라운드 두께/재질: 사용자 설정값 따름 (18→PB, 18.5→PET). 15/15.5는 서라운드에 없으므로 18/18.5로 변환
      surroundPanelList2 = buildSurroundPanelsFromRenderedFrames(placedModules, spaceInfo, surroundThickness2, surroundMaterial2);
    }

    // 슬롯배치 커튼박스 L자 프레임 패널 추가
    if (!isFreePlacement2 && spaceInfo.curtainBox?.enabled) {
      const cbPos2 = spaceInfo.curtainBox.position || 'right';
      const cbWidthMM2 = spaceInfo.curtainBox.width || 150;
      const cbDropH2 = spaceInfo.curtainBox.dropHeight || 60;
      const cbPanelThickness2 = surroundThickness2; // 커튼박스도 서라운드와 동일 두께
      const cbSideDepth2 = 40;
      const cbFrontWidth2 = cbWidthMM2 - 3;
      const cbPanelHeight2 = surroundH2 + cbDropH2;
      const posLabel2 = cbPos2 === 'left' ? '좌측' : '우측';

      surroundPanelList2.push({
        name: `${posLabel2} 커튼박스 전면판`,
        width: cbFrontWidth2, height: cbPanelHeight2,
        thickness: cbPanelThickness2, material: surroundMaterial2,
      });
      surroundPanelList2.push({
        name: `${posLabel2} 커튼박스 측면판`,
        width: cbSideDepth2, height: cbPanelHeight2,
        thickness: cbPanelThickness2, material: surroundMaterial2,
      });
    }

    if (surroundPanelList2.length > 0) {
      // 맨 좌측/우측 가구 인덱스 판별
      let leftMostIdx2 = 0;
      let rightMostIdx2 = placedModules.length - 1;
      if (placedModules.length > 1) {
        let minSlot2 = Infinity, maxSlot2 = -Infinity;
        placedModules.forEach((pm, idx) => {
          const slot = pm.slotIndex ?? idx;
          if (slot < minSlot2) { minSlot2 = slot; leftMostIdx2 = idx; }
          if (slot > maxSlot2) { maxSlot2 = slot; rightMostIdx2 = idx; }
        });
      }

      const leftFn2 = leftMostIdx2 + 1;
      const rightFn2 = rightMostIdx2 + 1;
      const leftLbl2 = placedModules.length > 1 ? `[${leftFn2}]` : '';
      const rightLbl2 = placedModules.length > 1 ? `[${rightFn2}]` : '';

      surroundPanelList2.forEach((panel: any, idx: number) => {
        const isLeft = panel.name.includes('좌측');
        const isRight = panel.name.includes('우측');
        let furnitureId2 = 'surround';
        let namePrefix2 = '';
        if (isLeft) {
          furnitureId2 = placedModules[leftMostIdx2].id;
          namePrefix2 = leftLbl2 ? `${leftLbl2} ` : '';
        } else if (isRight) {
          furnitureId2 = placedModules[rightMostIdx2].id;
          namePrefix2 = rightLbl2 ? `${rightLbl2} ` : '';
        }

        allPanels.push({
          id: `surround_p${idx}`,
          name: `${namePrefix2}${panel.name}`,
          width: panel.width || 0,
          height: panel.height || 0,
          thickness: panel.thickness,
          material: panel.material || 'PB',
          color: placedModules[0]?.color || 'MW',
          quantity: 1,
          grain: getDefaultGrain(panel.name),
          meshName: toMeshName(panel.name),
          furnitureId: furnitureId2,
        });
      });
    }

    callback(allPanels.filter(panel => !isStonePanel(panel)));
  }, [placedModules, spaceInfo, callback]);
}
