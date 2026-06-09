import React, { useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import { SectionConfig } from '@/data/modules/shelving';
import { useSpace3DView } from '../../../context/useSpace3DView';
import ShelfRenderer from '../ShelfRenderer';
import DrawerRenderer from '../DrawerRenderer';
import { Html, Text } from '@react-three/drei';
import NativeLine from '../../elements/NativeLine';
import { useUIStore } from '@/store/uiStore';
import DimensionText from './DimensionText';
import { useDimensionColor } from '../hooks/useDimensionColor';
import EditableDimensionText from './EditableDimensionText';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { updateSectionHeight } from '@/editor/shared/utils/sectionHeightUpdater';
import { getThemeHex } from '@/theme';
import SidePanelBoring from './SidePanelBoring';
import { calculateShelfBoringPositionsFromThreeUnits } from '@/domain/boring';
import { isDirectLowerDowelShelfModule } from '@/editor/shared/utils/lowerCabinetDowelShelves';
import {
  resolveDefaultDoorHingePositionsMm,
  resolveDoorVerticalGeometry,
  resolveSideAnchoredDoorHingePositionsMm,
  resolveSidePanelMatchedHingePositions,
  type DoorCabinetCategory
} from '@/editor/shared/utils/doorGeometryCalculator';
import { isDummyModuleId } from '@/editor/shared/utils/dummyModule';

const usesDrawerFrontInsteadOfHingedDoor = (moduleId?: string) => {
  if (!moduleId) return false;

  return moduleId.includes('lower-drawer-')
    || moduleId.includes('lower-door-lift-1tier')
    || moduleId.includes('lower-door-lift-2tier')
    || moduleId.includes('lower-door-lift-3tier')
    || moduleId.includes('lower-door-lift-touch-')
    || moduleId.includes('lower-top-down-1tier')
    || moduleId.includes('lower-top-down-2tier')
    || moduleId.includes('lower-top-down-3tier')
    || moduleId.includes('lower-top-down-touch-')
    || moduleId.includes('lower-induction-cabinet')
    || moduleId.includes('dual-lower-induction-cabinet')
    || moduleId.includes('lower-touch-drawer-');
};

const hasRenderedTopPanel = (moduleId?: string, category?: string) => {
  if (!moduleId) return true;

  const isLowerModule = category === 'lower'
    || moduleId.includes('lower-')
    || moduleId.includes('dual-lower-');
  if (!isLowerModule) return true;

  return moduleId.includes('lower-door-lift-') || moduleId.includes('lower-top-down-');
};

// SectionsRenderer Props 인터페이스
interface SectionsRendererProps {
  // 설정 데이터
  modelConfig: {
    sections?: SectionConfig[];
  };
  
  // 치수 관련
  height: number;
  innerWidth: number;
  depth: number;
  adjustedDepthForShelves: number;
  
  // 계산된 값들
  basicThickness: number;
  shelfZOffset: number;
  
  // 재질
  material: THREE.Material;
  
  // 렌더 모드
  renderMode: 'solid' | 'wireframe';
  
  // 헬퍼 함수들
  calculateSectionHeight: (section: SectionConfig, availableHeight: number) => number;
  mmToThreeUnits: (mm: number) => number;
  
  // 가구 ID (칸 강조용)
  furnitureId?: string;

  // 가구 카테고리 (upper/lower/full)
  category?: string;
  
  // 강조 상태
  isHighlighted?: boolean;

  // 드래그 상태
  isDragging?: boolean;

  // 섹션 내경 치수 숨김 (듀얼 타입 중복 방지용)
  hideSectionDimensions?: boolean;

  // 배치된 가구 ID (치수 편집용)
  placedFurnitureId?: string;

  // 섹션별 깊이 배열 (Three.js 단위)
  sectionDepths?: number[];

  // 섹션별 깊이 방향 (앞에서/뒤에서)
  sectionDepthDirections?: ('front' | 'back')[];

  // 섹션별 너비 배열 (Three.js 단위) — 기둥 침범 시 섹션별 다른 너비
  sectionWidths?: number[];

  // 섹션별 너비 방향 (좌고정/우고정)
  sectionWidthDirections?: ('left' | 'right')[];

  // 텍스처 URL과 패널별 결 방향
  textureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };

  // 띄움 배치 시 치수 가이드 Y 오프셋 보정용 (mm)
  lowerSectionTopOffsetMm?: number;

  // 띄움 배치 여부 (spaceInfo 기반)
  isFloatingPlacement?: boolean;

  // 선반 앞면 들여쓰기 (mm, 다보 선반용 - 기본: 0)
  shelfFrontInsetMm?: number;

  // 도어/서랍 상단갭/하단갭 (mm, 확장 방향)
  doorTopGap?: number;
  doorBottomGap?: number;
}

/**
 * SectionsRenderer 컴포넌트
 * - sections 설정에 따라 내부 구조 렌더링
 * - 서랍, 선반, 옷걸이 구역 등을 자동으로 배치
 */
const SectionsRenderer: React.FC<SectionsRendererProps> = ({
  modelConfig,
  height,
  innerWidth,
  depth,
  adjustedDepthForShelves,
  basicThickness,
  shelfZOffset,
  material,
  renderMode,
  calculateSectionHeight,
  mmToThreeUnits,
  furnitureId,
  category,
  isHighlighted = false,
  isDragging = false,
  hideSectionDimensions = false,
  placedFurnitureId,
  sectionDepths,
  sectionDepthDirections,
  sectionWidths,
  sectionWidthDirections,
  textureUrl,
  panelGrainDirections,
  lowerSectionTopOffsetMm = 0,
  isFloatingPlacement = false,
  shelfFrontInsetMm = 0,
  doorTopGap = 0,
  doorBottomGap = 0,
}) => {
  // UI 상태에서 치수 표시 여부 가져오기
  const showDimensions = useUIStore(state => state.showDimensions);
  const highlightedSection = useUIStore(state => state.highlightedSection);
  const highlightedPanel = useUIStore(state => state.highlightedPanel);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();

  // 측면뷰 여부 확인
  const isSideView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');

  // 가구 스토어 메서드
  const { placedModules, updatePlacedModule } = useFurnitureStore();

  // 현재 배치된 가구 모듈 (backPanelThickness 등 참조용)
  const currentPlacedModule = placedFurnitureId
    ? placedModules.find(m => m.id === placedFurnitureId)
    : undefined;
  const moduleIdForBoringOwner = currentPlacedModule?.moduleId || furnitureId || '';
  const isLowerDowelBoringOwnedByLowerCabinet = isDirectLowerDowelShelfModule(moduleIdForBoringOwner);
  const isTopDownBoringOwnedByLowerCabinet = moduleIdForBoringOwner.includes('lower-top-down-')
    || moduleIdForBoringOwner.includes('dual-lower-top-down-');
  const shouldRenderTopPanelBoring = hasRenderedTopPanel(moduleIdForBoringOwner, category);

  // Hover 상태 관리 (섹션별)
  const [hoveredSectionIndex, setHoveredSectionIndex] = useState<number | null>(null);

  // 테마 색상
  const themeColor = getThemeHex();

  // 치수 가이드 Y 오프셋: 가구 group 자체가 Y 위치를 반영하므로 추가 보정 불필요
  const dimensionYOffset = 0;

  // 하부섹션 상판 옵셋은 상판 깊이 보정값이고, 띄움배치 판정과 분리해야 한다.
  const hasFloatingPlacement = !!isFloatingPlacement;

  // 패널 비활성화용 material - 한 번만 생성하고 재사용
  const panelDimmedMaterial = React.useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#666666'),
      transparent: true,
      opacity: 0.1
    });
    mat.needsUpdate = true;
    return mat;
  }, []); // 한 번만 생성

  // 패널 강조용 material (형광색)
  const highlightMaterial = React.useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00FF00'), // 형광 녹색
      transparent: true,
      opacity: 1.0
    }),
  []);

  // 패널용 material 결정 - useCallback로 최적화
  const getPanelMaterial = React.useCallback((panelName: string) => {
    // 패널 ID 생성
    const panelId = `${placedFurnitureId}-${panelName}`;

    // 패널이 강조되어야 하는지 확인
    const isHighlighted = highlightedPanel === panelId;

    // 선택된 패널만 형광색으로 강조, 나머지는 원래대로
    if (isHighlighted) {
      return highlightMaterial;
    }
    return material;
  }, [highlightedPanel, placedFurnitureId, material, highlightMaterial]);

  // 치수 변경 핸들러
  const handleDimensionChange = useCallback((sectionIndex: number, newInternalHeight: number) => {
    if (!placedFurnitureId) {
      console.warn('⚠️ placedFurnitureId가 없어서 치수를 수정할 수 없습니다');
      return;
    }

// console.log('📏 치수 변경 요청:', {
      // placedFurnitureId,
      // sectionIndex,
      // newInternalHeight
    // });

    // 배치된 가구 찾기
    const placedModule = placedModules.find(m => m.id === placedFurnitureId);
    if (!placedModule) {
      console.error('❌ 배치된 가구를 찾을 수 없습니다:', placedFurnitureId);
      return;
    }

    // 섹션 높이 업데이트
    const result = updateSectionHeight(
      placedModule,
      sectionIndex,
      newInternalHeight,
      basicThickness
    );

    if (!result.success) {
      alert(result.error || '섹션 높이를 업데이트할 수 없습니다');
      return;
    }

// console.log('✅ 섹션 높이 업데이트 성공:', result);

    const updatedHeight = result.updatedHeight!;

    // 가구 스토어 업데이트
    updatePlacedModule(placedFurnitureId, {
      customSections: result.updatedSections,
      ...(placedModule.isFreePlacement ? { freeHeight: updatedHeight, userResizedHeight: true } : {}),
      // moduleData도 업데이트 (dimensions.height)
      moduleData: {
        ...placedModule.moduleData!,
        dimensions: {
          ...placedModule.moduleData!.dimensions,
          height: updatedHeight
        },
        modelConfig: {
          ...placedModule.moduleData!.modelConfig,
          sections: result.updatedSections
        }
      }
    });

// console.log('🎉 가구 업데이트 완료!');
  }, [placedFurnitureId, placedModules, updatePlacedModule, basicThickness]);
  
  // 상하부장 여부 확인 (upper-cabinet, lower-cabinet 패턴)
  const isUpperLowerCabinet = furnitureId?.includes('upper-cabinet') || furnitureId?.includes('lower-cabinet');
  
  // sections 기반 내부 구조 렌더링
  const renderSections = () => {
    const { sections } = modelConfig;
    
    if (!sections || sections.length === 0) {
      return null;
    }
    

    // 사용 가능한 내부 높이
    const availableHeight = height - basicThickness * 2;
    
    // 고정 높이 섹션들 분리
    const fixedSections = sections.filter((s: SectionConfig) => s.heightType === 'absolute');
    
    // 고정 섹션들의 총 높이 계산
    const totalFixedHeight = fixedSections.reduce((sum: number, section: SectionConfig) => {
      return sum + calculateSectionHeight(section, availableHeight);
    }, 0);
    
    // 나머지 공간 계산
    const remainingHeight = availableHeight - totalFixedHeight;
    
    const isShelfSplitFurniture = !!furnitureId?.includes('shelf-split');
    const shouldPreserveExplicitShelfSplitSections = isShelfSplitFurniture
      && sections.length >= 2
      && sections.every((section: SectionConfig) => section.heightType === 'absolute')
      && totalFixedHeight > 0;

    // 모든 섹션의 높이 계산
    // 각 absolute 섹션은 자체 지정 높이를 사용 (useBaseFurniture에서 이미 비례 조정됨)
    const allSections = sections.map((section: SectionConfig, index: number) => {
      let calcHeight: number;

      if (section.heightType === 'absolute') {
        calcHeight = calculateSectionHeight(section, availableHeight);
      } else {
        calcHeight = calculateSectionHeight(section, remainingHeight);
      }

      return {
        ...section,
        calculatedHeight: calcHeight
      };
    });

    // 마지막 섹션은 나머지 공간을 채우도록 조정 (오차 보정)
    // 도어분절 현관장은 섹션 높이를 줄이면 그만큼 상단 갭/몰딩이 생기므로
    // 명시된 섹션 높이를 다시 늘려 채우면 정면 내경 표시가 실제와 어긋난다.
    if (allSections.length >= 2 && !shouldPreserveExplicitShelfSplitSections) {
      const lastIdx = allSections.length - 1;
      const lowerSectionsHeight = allSections
        .slice(0, lastIdx)
        .reduce((sum, s) => sum + s.calculatedHeight, 0);
      allSections[lastIdx].calculatedHeight = availableHeight - lowerSectionsHeight;
    }

    // 렌더링
    let currentYPosition = -height/2 + basicThickness;
    
    return allSections.map((section: SectionConfig & { calculatedHeight: number }, index: number) => {
      const sectionHeight = section.calculatedHeight;
      // Type4 하부 섹션(drawer)은 서랍을 18mm 아래로
      const isType4DrawerSection = (furnitureId?.includes('4drawer-hanging') || furnitureId?.includes('4drawer-shelf')) && section.type === 'drawer' && index === 0;
      const sectionCenterY = currentYPosition + sectionHeight / 2 - (isType4DrawerSection ? basicThickness : 0);

      // 현재 섹션의 깊이 가져오기 (sectionDepths가 없으면 기본 depth 사용)
      // sectionDepths는 호출자(BoxModule)가 어떤 단위로 넣는지에 따라 다름:
      //  - 인출장/팬트리장/냉장고장: mm 단위 (placedModule.sectionDepths)
      //  - 그 외: Three.js 단위 (이전 코드 호환)
      // 큰 값(10 이상)이면 mm로 간주하여 변환
      const rawSecDepth = sectionDepths?.[index];
      const currentSectionDepth = (rawSecDepth !== undefined && rawSecDepth > 0)
        ? (rawSecDepth > 10 ? mmToThreeUnits(rawSecDepth) : rawSecDepth)
        : depth;

      // adjustedDepthForShelves 계산 (백패널 두께 고려)
      // depth와 adjustedDepthForShelves의 차이를 계산해서 비율적용
      const backPanelThickness = depth - adjustedDepthForShelves;
      const currentAdjustedDepthForShelves = currentSectionDepth - backPanelThickness;

      // Z 오프셋 계산 (방향에 따라 앞/뒤로 이동)
      const depthDiff = depth - currentSectionDepth;
      const sectionDir = sectionDepthDirections?.[index] || 'front';
      const directionOffset = depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;
      const currentShelfZOffset = shelfZOffset + directionOffset;

      // 섹션별 너비 및 X 오프셋 (기둥 침범 시 섹션별 다른 너비 + 좌/우 고정)
      const currentSectionInnerWidth = (sectionWidths && sectionWidths[index]) ? sectionWidths[index] : innerWidth;
      const widthDiff = innerWidth - currentSectionInnerWidth;
      const widthDir = sectionWidthDirections?.[index] || 'left';
      // left = 좌고정: 우측을 줄임 → 섹션 중심 X 음수(왼쪽) 이동
      // right = 우고정: 좌측을 줄임 → 섹션 중심 X 양수(오른쪽) 이동
      const sectionXOffset = widthDiff === 0 ? 0 : widthDir === 'right' ? widthDiff / 2 : -widthDiff / 2;

      // 섹션 이름 결정 (상부/하부 구분)
      const sectionName = allSections.length >= 2
        ? (index === 0 ? '(하)' : '(상)')
        : '';

      let sectionContent = null;

      switch (section.type) {
        case 'shelf':
          // 하부장 반통/한통, 도어올림/상판내림 반통·한통은 다보선반을 LowerCabinet.tsx에서 직접 렌더링
          // SectionsRenderer에서는 건너뜀 (중복 방지)
          const isDowelShelfModule = furnitureId && (
            furnitureId.includes('lower-half-cabinet') || furnitureId.includes('dual-lower-half-cabinet') ||
            furnitureId.includes('lower-door-lift-half') || furnitureId.includes('dual-lower-door-lift-half') ||
            furnitureId.includes('lower-top-down-half') || furnitureId.includes('dual-lower-top-down-half')
          );
          // 선반 구역 (안전선반 포함)
          if (section.count && section.count > 0 && !isDowelShelfModule) {
            // 섹션별 강조 확인
            const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;
            const shelfPositionsKey = Array.isArray(section.shelfPositions)
              ? section.shelfPositions.map((position: number) => Math.round(position)).join(',')
              : '';

            sectionContent = (
              <ShelfRenderer
                key={`shelf-section-${index}-d${currentSectionDepth.toFixed(4)}-z${currentShelfZOffset.toFixed(4)}-p${shelfPositionsKey}`}
                shelfCount={section.count}
                innerWidth={currentSectionInnerWidth}
                innerHeight={sectionHeight}
                depth={currentAdjustedDepthForShelves}
                originalDepth={adjustedDepthForShelves}
                basicThickness={basicThickness}
                material={material}
                yOffset={sectionCenterY}
                zOffset={currentShelfZOffset}
                shelfPositions={section.shelfPositions}
                isTopFinishPanel={section.isTopFinishPanel}
                showTopFrameDimension={index === 0}
                renderMode={renderMode}
                furnitureId={placedFurnitureId || furnitureId}
                isHighlighted={isSectionHighlighted}
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
                sectionName={sectionName}
                sectionIndex={index}
                floatOffsetMm={lowerSectionTopOffsetMm}
                shelfFrontInsetMm={shelfFrontInsetMm}
              />
            );
          }
          break;

        case 'hanging':
          // 옷걸이 구역 - 안전선반이 없어도 ShelfRenderer 호출 (치수 표시를 위해)
          // 섹션별 강조 확인
          const isHangingSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

          sectionContent = (
            <ShelfRenderer
              shelfCount={section.count || (section.shelfPositions ? section.shelfPositions.length : 0)}
              innerWidth={innerWidth}
              innerHeight={sectionHeight}
              depth={currentAdjustedDepthForShelves}
              originalDepth={adjustedDepthForShelves}
              basicThickness={basicThickness}
              material={material}
              yOffset={sectionCenterY}
              zOffset={currentShelfZOffset}
              shelfPositions={section.shelfPositions}
              isTopFinishPanel={section.isTopFinishPanel}
              showTopFrameDimension={index === 0}
              sectionIndex={index}
              renderMode={renderMode}
              furnitureId={placedFurnitureId || furnitureId}
              sectionType={section.type}
              sectionInternalHeight={section.internalHeight}
              isLastSection={index === allSections.length - 1}
              isHighlighted={isHangingSectionHighlighted}
              allowSideViewDimensions={true}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              sectionName={sectionName}
              floatOffsetMm={lowerSectionTopOffsetMm}
              shelfFrontInsetMm={shelfFrontInsetMm}
            />
          );
          break;

        case 'drawer':
          // 서랍 구역
          if (section.count && section.count > 0) {
            // 섹션별 강조 확인
            const isDrawerSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

            // 2단 vs 4단 서랍장 구분 (섹션 높이 700mm 미만이면 2단)
            const is2TierDrawer = sectionHeight < mmToThreeUnits(700);

            // 서랍속장 프레임 높이 = 섹션 내경 (외경 - 상판 - 바닥판)
            const drawerInnerHeight = sectionHeight - basicThickness * 2;
            // Y 위치: 2단은 바닥에 붙도록 18mm 아래로
            const drawerYOffset = is2TierDrawer
              ? sectionCenterY - basicThickness
              : sectionCenterY;

            // 섹션 깊이에 따른 Z 오프셋 계산 (방향에 따라 앞/뒤)
            // 섹션 박스 이동(directionOffset)과 동일한 값 사용 → 서랍이 섹션과 함께 이동
            const drawerZOffset = directionOffset;

            // 인출장(반통) 1단 속서랍은 외부 도어 갭과 무관 (외부 도어가 가구 전체를 덮음)
            const isPullOutInnerDrawer = !!furnitureId?.includes('pull-out-cabinet');
            sectionContent = (
              <DrawerRenderer
                drawerCount={section.count}
                innerWidth={currentSectionInnerWidth}
                innerHeight={drawerInnerHeight}
                depth={currentSectionDepth}
                basicThickness={basicThickness}
                yOffset={drawerYOffset}
                zOffset={drawerZOffset}
                drawerHeights={section.drawerHeights}
                gapHeight={section.gapHeight}
                material={material}
                renderMode={renderMode}
                isHighlighted={isDrawerSectionHighlighted}
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId || furnitureId}
                sectionName={sectionName}
                backPanelThicknessOverride={currentPlacedModule?.backPanelThickness}
                topPanelFrontInset={index === 0 && category === 'lower' ? lowerSectionTopOffsetMm : 0}
                doorTopGap={doorTopGap}
                doorBottomGap={doorBottomGap}
                disableGapMaidaExtension={isPullOutInnerDrawer}
              />
            );
          }
          break;
      }
      
      // 중간 구분 패널 위치 계산 (마지막 섹션이 아닌 경우)
      const hasDividerPanel = index < allSections.length - 1;
      const dividerPanelY = currentYPosition + sectionHeight + basicThickness/2 - basicThickness;
      
      // 다음 섹션을 위해 Y 위치 이동
      currentYPosition += sectionHeight;
      
      return (
        <group key={`section-${index}`} position={[sectionXOffset, 0, 0]}>
          {sectionContent}

          {/* 섹션 내경 치수 표시 - 2단 옷장은 하부 섹션만 표시 (상부는 안전선반 있을 때만), 듀얼 타입 중복 방지 */}
          {(() => {
            // 모든 가구에서 furnitureId 확인
// console.log('🔵 SectionsRenderer furnitureId 체크:', { furnitureId, index });

            const is2HangingFurniture = furnitureId?.includes('2hanging');
            const isDualFurniture = furnitureId?.includes('dual');

            // 듀얼 가구 디버깅
            if (isDualFurniture) {
// console.log('🔴 듀얼 가구 감지:', { furnitureId, index, isDualFurniture });
            }
            const hasTwoSections = allSections.length === 2;
            // 2hanging의 상부 섹션에 안전선반이 있으면 치수 표시
            const hasSafetyShelf = section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0);

            // 2단 옷장(2hanging) 특별 처리: 안전선반 있으면 상부도 표시
            const shouldHide2HangingUpper = false; // 안전선반 윗칸 내경도 표시하도록 수정

            // 섹션 내경 치수 표시 조건 - 상부장/하부장 모듈에서는 칸 내경 치수 숨김 (선반 두께만 표시)
            const isUpperCabinet = furnitureId?.includes('upper-cabinet');
            const isLowerCabinet = furnitureId?.includes('lower-cabinet');
            const isUpperOrLowerCabinet = isUpperCabinet || isLowerCabinet;

// console.log('🔍 SectionsRenderer 내경치수 체크:', {
              // furnitureId,
              // isUpperCabinet,
              // isLowerCabinet,
              // isUpperOrLowerCabinet,
              // category
            // });

            // 도어분절 현관장(shelf-split): 두 섹션 모두 type='shelf'이지만 H 편집 가능해야 함
            const isShelfSplit = !!furnitureId?.includes('shelf-split');
            const shouldShow = !isUpperOrLowerCabinet && !hideSectionDimensions && showDimensions && showDimensionsText &&
                              viewMode !== '3D' &&
                              !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) &&
                              (section.type === 'hanging' || section.type === 'drawer' || (isShelfSplit && section.type === 'shelf')) &&
                              !shouldHide2HangingUpper;

            // 2hanging만 로그
            if (furnitureId?.includes('2hanging')) {
// console.log(`🚨 섹션${index} | furnitureId: ${furnitureId} | hasSafetyShelf: ${hasSafetyShelf} | shouldShow: ${shouldShow} | shouldHide2HangingUpper: ${shouldHide2HangingUpper}`);
            }
            
            return shouldShow && (
            <group>
              {(() => {
                // 섹션의 실제 내경 계산을 위한 가이드선 위치 설정
                let bottomY, topY;
                let actualInternalHeight;

                // 섹션 타입별로 가이드선 위치 계산
                const hasSafetyShelf = section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0);

                // 2hanging 디버그
                if (furnitureId?.includes('2hanging')) {
// console.log(`📏 섹션${index} 치수 계산 | type: ${section.type} | shelfPositions:`, section.shelfPositions, `| hasSafetyShelf: ${hasSafetyShelf}`);
                }

                if (section.type === 'hanging') {
                  // 섹션의 절대 위치 계산
                  const sectionBottomY = sectionCenterY - sectionHeight/2;
                  const sectionTopY = sectionCenterY + sectionHeight/2;
                  
                  // Type4 hanging 섹션 특별 처리
                  const isType4HangingSection = furnitureId?.includes('4drawer-hanging') && section.type === 'hanging' && index === 1;
                  
                  // 하단 가이드선 위치 결정
                  if (index === 0) {
                    // 첫 번째 섹션: 걸래받이 상단
                    bottomY = -height/2 + basicThickness;
                  } else if (isType4HangingSection) {
                    // Type4 상부 섹션: 상부섹션 바닥판 상단부터 (하부 1000mm + 바닥판 18mm)
                    bottomY = -height/2 + mmToThreeUnits(1000) + basicThickness;
                  } else {
                    // 상부 섹션 (index > 0)
                    if (index > 0) {
                      // 듀얼/싱글 모두 상부섹션 시작점부터 시작 (내경)
                      // sectionBottomY = 상부섹션 영역 시작점 (섹션 경계)
                      bottomY = sectionBottomY;

// console.log('🔴🔴🔴 상부섹션 hanging bottomY:', {
                        // furnitureId,
                        // index,
                        // sectionBottomY,
                        // 'sectionBottomY_mm': sectionBottomY * 100,
                        // bottomY,
                        // 'bottomY_mm': bottomY * 100,
                        // '섹션영역시작': '정확히 sectionBottomY',
                        // view2DDirection,
                        // viewMode
                      // });

                      // 2D 우측뷰에서 상부섹션 치수가이드를 36mm 아래로 확장
                      if (view2DDirection === 'right') {
// console.log('🟢 SectionsRenderer: 우측뷰 상부섹션 36mm 확장', {
                          // view2DDirection,
                          // index,
                          // originalBottomY: bottomY,
                          // adjustedBottomY: bottomY - 0.36
                        // });
                        bottomY -= 0.36;
                      }
                    } else {
                      // 하부 섹션: 바닥판 상단부터
                      bottomY = sectionBottomY + basicThickness;
                    }
                  }
                  
                  // 디버깅: hanging 섹션의 치수 계산 확인
                  if (section.type === 'hanging') {
// console.log('🔍 Hanging 섹션 치수 계산:', {
                      // index,
                      // sectionType: section.type,
                      // hasShelfPositions: !!(section.shelfPositions && section.shelfPositions.length > 0),
                      // shelfPositions: section.shelfPositions,
                      // sectionBottomY,
                      // sectionTopY,
                      // bottomY,
                      // basicThickness,
                      // basicThickness_mm: basicThickness * 100,
                      // height,
                      // calculatedHeight: section.calculatedHeight,
                      // sectionHeight
                    // });
                  }
                  
                  // 상단 가이드선 위치 결정
                  if (index === allSections.length - 1) {
                    // 마지막 섹션 (상부 섹션)
                    // 띄움배치 여부 확인 (명시 플래그 우선, 없으면 lowerSectionTopOffsetMm 기준)
                    const isFloating = hasFloatingPlacement;
                    const isLastSection = index === allSections.length - 1;

                    // 띄움배치 시 상부섹션 확장 제거 — 상단 선반갭 유지 (바닥배치와 동일)
                    const floatingAdjustment = 0;

// console.log('🟢🟢🟢 [SectionsRenderer] 정면뷰 상부섹션 topY 계산:', {
                      // furnitureId,
                      // index,
                      // lowerSectionTopOffsetMm,
                      // isFloating,
                      // isLastSection,
                      // floatingAdjustment,
                      // 'floatingAdjustment_mm': floatingAdjustment * 100
                    // });

                    // hanging 섹션에서 안전선반이 있는 경우: 안전선반 하단까지
                    if (hasSafetyShelf) {
                      // 안전선반의 위치를 가져옴 (0이 아닌 첫 번째 값 = 안전선반, 섹션 하단 기준)
                      const safetyShelfPositionMm = section.shelfPositions.find(pos => pos > 0);
                      if (safetyShelfPositionMm !== undefined) {
                        // 안전선반 하단 Y 위치 = 섹션 하단 + 안전선반 위치(mm) - 안전선반 두께/2
                        topY = sectionBottomY + (safetyShelfPositionMm * 0.01) - basicThickness / 2 + floatingAdjustment;
                      } else {
                        topY = height/2 - basicThickness + floatingAdjustment;
                      }
                    } else {
                      // 안전선반 없는 경우
                      const is2HangingUpperSection = (furnitureId?.includes('2hanging') || furnitureId?.includes('2drawer-hanging')) && index === 1;
                      const isDualFurniture = furnitureId?.includes('dual');

// console.log('🔵🔵🔵 [SectionsRenderer] 안전선반 없는 경우:', {
                        // furnitureId,
                        // is2HangingUpperSection,
                        // isDualFurniture,
                        // sectionTopY,
                        // 'sectionTopY_mm': sectionTopY * 100,
                        // bottomY,
                        // 'bottomY_mm': bottomY * 100,
                        // sectionHeight,
                        // 'sectionHeight_mm': sectionHeight * 100,
                        // 'height/2': height/2,
                        // 'height/2_mm': height/2 * 100,
                        // basicThickness,
                        // 'basicThickness_mm': basicThickness * 100,
                        // floatingAdjustment,
                        // 'floatingAdjustment_mm': floatingAdjustment * 100
                      // });

                      if (is2HangingUpperSection && isDualFurniture) {
                        // 듀얼 가구: sectionTopY가 측판 상단
                        topY = sectionTopY - basicThickness + floatingAdjustment;
// console.log('🟡 듀얼 가구 케이스 - topY:', topY, 'topY_mm:', topY * 100);
                      } else if (is2HangingUpperSection) {
                        // 싱글 가구: bottomY + sectionHeight
                        topY = bottomY + sectionHeight + floatingAdjustment;
// console.log('🟡 싱글 가구 케이스 - topY:', topY, 'topY_mm:', topY * 100);
                      } else {
                        // 일반 케이스: 상단 몰딩 하단까지
                        topY = height/2 - basicThickness + floatingAdjustment;
// console.log('🟡 일반 케이스 - topY:', topY, 'topY_mm:', topY * 100);
                      }
                    }
                  } else {
                    // 다음 섹션과의 경계
                    // 섹션 높이에서 상하판 두께만 빼면 내경
                    // topY = bottomY + (sectionHeight - basicThickness * 2)
                    topY = bottomY + (sectionHeight - basicThickness * 2);
                  }

                  // 2단 옷장 상부 섹션 (안전선반 없는 경우): calculatedHeight가 availableHeight 기반 나머지로 계산되므로
                  // 원래 정의된 절대 높이를 치수 표시 및 가이드선에 사용
                  const is2HangingUpperForDisplay = (furnitureId?.includes('2hanging')) && index > 0 && !hasSafetyShelf;
                  if (is2HangingUpperForDisplay && section.heightType === 'absolute' && section.height) {
                    topY = bottomY + mmToThreeUnits(section.height);
                  }

                  // 실제 내경 계산 (가이드선 사이의 거리)
                  actualInternalHeight = (topY - bottomY) / 0.01;
                } else if (section.type === 'drawer') {
                  // drawer 섹션: 걸래받이 윗면부터 상판 아랫면까지
                  const sectionBottomY = sectionCenterY - sectionHeight/2;
                  const sectionTopY = sectionCenterY + sectionHeight/2;

                  // 2drawer-hanging의 하부 섹션만 특별 처리 (걸래받이 있음)
                  const is2DrawerHangingLowerSection = furnitureId?.includes('2drawer-hanging') && index === 0;

                  // 상부 섹션(index > 0)은 상부섹션 영역 시작점부터 시작
                  bottomY = index === 0 ? (-height/2 + basicThickness) : sectionBottomY;
                  topY = is2DrawerHangingLowerSection ? (sectionTopY - basicThickness * 2) : (sectionTopY - basicThickness);
                  // 실제 거리로 내경 계산 (하드코딩 없음)
                  actualInternalHeight = (topY - bottomY) / 0.01;

                  if (index > 0) {
// console.log('🔴🔴🔴 상부섹션 drawer bottomY:', {
                      // furnitureId,
                      // index,
                      // sectionBottomY,
                      // 'sectionBottomY_mm': sectionBottomY * 100,
                      // bottomY,
                      // 'bottomY_mm': bottomY * 100,
                      // '섹션영역시작': '정확히 sectionBottomY',
                      // view2DDirection,
                      // viewMode
                    // });
                  }

// console.log('📏 DRAWER 섹션 치수:', {
                    // index,
                    // height,
                    // basicThickness,
                    // sectionHeight,
                    // sectionCenterY,
                    // sectionBottomY,
                    // sectionTopY,
                    // bottomY,
                    // topY,
                    // 'bottomY_mm': bottomY * 100,
                    // 'topY_mm': topY * 100,
                    // 'internal_mm': actualInternalHeight
                  // });
                } else if (isShelfSplit && section.type === 'shelf') {
                  const sectionBottomY = sectionCenterY - sectionHeight / 2;
                  const sectionTopY = sectionCenterY + sectionHeight / 2;
                  // shelf-split은 하부 상판이 일반 판재가 아니라 목찬넬/상부 바닥판 구조다.
                  // 하부: 하부 바닥판 윗면 -> 상부 바닥판 아랫면
                  // 상부: 상부 바닥판 윗면 -> 최상단 상판 아랫면
                  bottomY = sectionBottomY;
                  topY = sectionTopY - basicThickness * 2;
                  actualInternalHeight = Math.max(0, (topY - bottomY) / 0.01);
                } else {
                  // 다른 타입은 기본값 사용
                  const sectionBottomY = sectionCenterY - sectionHeight/2;
                  const sectionTopY = sectionCenterY + sectionHeight/2;

                  // 측면뷰에서 상부 섹션(index > 0)인 경우: 상부섹션 영역 시작점부터
                  if (isSideView && index > 0) {
                    bottomY = sectionBottomY;
                    topY = sectionTopY;
                  } else {
                    bottomY = sectionBottomY;
                    topY = sectionTopY;
                  }
                  actualInternalHeight = (topY - bottomY) / 0.01;
                }
                
                const centerY = (topY + bottomY) / 2;

                // 치수 디버깅
// console.log('📏 섹션 내경 치수:', {
                  // furnitureId,
                  // sectionIndex: index,
                  // actualInternalHeight: Math.round(actualInternalHeight)
                // });

                // 현재 섹션의 hover 상태에 따른 색상
                const isHovered = hoveredSectionIndex === index;
                const currentColor = isHovered ? themeColor : (viewMode === '3D' ? '#000000' : dimensionColor);

                // 안전선반 위 칸의 내경 계산 (안전선반이 있는 경우)
                let topCompartmentHeight = null;
                let topCompartmentBottomY = null;
                let topCompartmentTopY = null;

                const isDualFurniture = furnitureId?.includes('dual');

                // 측면뷰가 아닌 경우에만 안전선반 위 칸을 별도로 렌더링
                if (hasSafetyShelf && index === allSections.length - 1 && !isSideView) {
                  const safetyShelfPositionMm = section.shelfPositions.find(pos => pos > 0);
                  if (safetyShelfPositionMm !== undefined) {
                    const sectionBottomY = sectionCenterY - sectionHeight/2;
                    // 안전선반 윗면
                    topCompartmentBottomY = sectionBottomY + (safetyShelfPositionMm * 0.01) + basicThickness / 2;
                    // 상단 몰딩 하단 (띄움배치 시에도 상단갭 유지)
                    topCompartmentTopY = height/2 - basicThickness;
                    // 안전선반 위 칸의 내경
                    topCompartmentHeight = (topCompartmentTopY - topCompartmentBottomY) / 0.01;

// console.log('🔵 안전선반 위 칸 렌더링:', {
                      // furnitureId,
                      // sectionIndex: index,
                      // totalSections: allSections.length,
                      // isLastSection: index === allSections.length - 1,
                      // topCompartmentHeight: Math.round(topCompartmentHeight),
                      // safetyShelfPositionMm
                    // });
                  }
                }

                return (
                  <>
                    {/* 하단 칸 내경 치수 (바닥판 ~ 안전선반 하단 또는 천장) */}
                    <>
                      {/* 치수 텍스트 - 편집 가능 */}
                      <EditableDimensionText
                        position={[
                          viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
                          centerY + dimensionYOffset,
                          viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0
                        ]}
                        fontSize={baseFontSize}
                        color={viewMode === '3D' ? '#000000' : dimensionColor}
                        rotation={[0, 0, Math.PI / 2]}
                        value={actualInternalHeight}
                        onValueChange={(newValue) => handleDimensionChange(index, newValue)}
                        sectionIndex={index}
                        furnitureId={furnitureId}
                        renderOrder={1000}
                        depthTest={false}
                        onHoverChange={(hovered) => setHoveredSectionIndex(hovered ? index : null)}
                      />

                      {/* 수직 연결선 - 왼쪽으로 이동 (hover 시 테마 색상) */}
                      <group>
                        <NativeLine name="dimension_line"
                          points={[
                            [-innerWidth/2 * 0.3, topY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                            [-innerWidth/2 * 0.3, bottomY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                          ]}
                          color={currentColor}
                          lineWidth={1}
                          dashed={false}
                        />

                        {/* 가이드선 클릭/hover 영역 */}
                        <mesh
                          position={[-innerWidth/2 * 0.3, (topY + bottomY) / 2 + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                          onPointerOver={(e) => {
                            e.stopPropagation();
                            setHoveredSectionIndex(index);
                          }}
                          onPointerOut={(e) => {
                            e.stopPropagation();
                            setHoveredSectionIndex(null);
                          }}
                        >
                          <planeGeometry args={[0.3, Math.abs(topY - bottomY)]} />
                          <meshBasicMaterial transparent opacity={0} depthTest={false} side={2} />
                        </mesh>
                      </group>

                      {/* 섹션 내경 가이드선 양끝 엔드포인트 - 측면뷰/탑뷰와 드래그 중에는 숨김 */}
                      {!isDragging && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
                        <>
                          <mesh
                            position={[-innerWidth/2 * 0.3, topY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                            renderOrder={100000}
                          >
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={currentColor} depthTest={false} depthWrite={false} />
                          </mesh>
                          <mesh
                            position={[-innerWidth/2 * 0.3, bottomY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                            renderOrder={100000}
                          >
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={currentColor} depthTest={false} depthWrite={false} />
                          </mesh>
                        </>
                      )}
                    </>

                    {/* 안전선반 위 칸의 내경 치수 (안전선반이 있는 경우 추가 표시) */}
                    {topCompartmentHeight !== null && topCompartmentBottomY !== null && topCompartmentTopY !== null && (
                      <>
                        {(() => {
                          const topCenterY = (topCompartmentTopY + topCompartmentBottomY) / 2;
                          const topSectionIndex = `${index}-top`;
                          const isTopHovered = hoveredSectionIndex === topSectionIndex;
                          const topCurrentColor = isTopHovered ? themeColor : (viewMode === '3D' ? '#000000' : dimensionColor);

                          return (
                            <>
                              {/* 안전선반 위 칸 치수 텍스트 */}
                              <EditableDimensionText
                                position={[
                                  viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
                                  topCenterY + dimensionYOffset,
                                  viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0
                                ]}
                                fontSize={baseFontSize}
                                color={viewMode === '3D' ? '#000000' : dimensionColor}
                                rotation={[0, 0, Math.PI / 2]}
                                value={topCompartmentHeight}
                                onValueChange={(newValue) => handleDimensionChange(index, newValue)}
                                sectionIndex={index}
                                furnitureId={furnitureId}
                                renderOrder={1000}
                                depthTest={false}
                                onHoverChange={(hovered) => setHoveredSectionIndex(hovered ? topSectionIndex : null)}
                              />

                              {/* 안전선반 위 칸 수직 연결선 */}
                              <group>
                                <NativeLine name="dimension_line"
                                  points={[
                                    [-innerWidth/2 * 0.3, topCompartmentTopY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                                    [-innerWidth/2 * 0.3, topCompartmentBottomY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                                  ]}
                                  color={topCurrentColor}
                                  lineWidth={1}
                                  dashed={false}
                                />

                                {/* 가이드선 클릭/hover 영역 */}
                                <mesh
                                  position={[-innerWidth/2 * 0.3, topCenterY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                                  onPointerOver={(e) => {
                                    e.stopPropagation();
                                    setHoveredSectionIndex(topSectionIndex);
                                  }}
                                  onPointerOut={(e) => {
                                    e.stopPropagation();
                                    setHoveredSectionIndex(null);
                                  }}
                                >
                                  <planeGeometry args={[0.3, Math.abs(topCompartmentTopY - topCompartmentBottomY)]} />
                                  <meshBasicMaterial transparent opacity={0} depthTest={false} side={2} />
                                </mesh>
                              </group>

                              {/* 안전선반 위 칸 수직선 양끝 엔드포인트 */}
                              {!isDragging && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
                                <>
                                  <mesh
                                    position={[-innerWidth/2 * 0.3, topCompartmentTopY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                                    renderOrder={100000}
                                  >
                                    <sphereGeometry args={[0.05, 8, 8]} />
                                    <meshBasicMaterial color={topCurrentColor} depthTest={false} depthWrite={false} />
                                  </mesh>
                                  <mesh
                                    position={[-innerWidth/2 * 0.3, topCompartmentBottomY + dimensionYOffset, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                                    renderOrder={100000}
                                  >
                                    <sphereGeometry args={[0.05, 8, 8]} />
                                    <meshBasicMaterial color={topCurrentColor} depthTest={false} depthWrite={false} />
                                  </mesh>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}
                  </>
                );
              })()}
            </group>
            );
          })()}
          
          {/* 첫 번째 섹션의 하단 프레임 두께 표시 - 제거됨 (2D에서 18mm 두께 표시 불필요) */}
          
          
          {/* 마지막 섹션의 상단 프레임 두께 표시 - 제거됨 (2D에서 18mm 두께 표시 불필요) */}
        </group>
      );
    });
  };
  
  // 모든 보링 위치 수집
  // - 이동선반: 선반 밑면 위치
  // - 고정 패널(상판/바닥판/섹션구분판): 패널 중심 위치
  // 보링 위치는 가구 바닥 기준 mm 값
  //
  // ShelfRenderer에서 선반 Y 위치 계산과 동일한 방식 사용:
  // - 선반 Y = sectionCenterY - sectionHeight/2 + mmToThreeUnits(positionMm)
  //          = currentYPosition + mmToThreeUnits(positionMm)
  // - currentYPosition 초기값: -height/2 + basicThickness
  // - currentYPosition 업데이트: currentYPosition += sectionHeight
  // 선반/패널 보링 위치 계산 (유틸리티 함수 사용)
  const allBoringResult = useMemo(() => {
    const { sections } = modelConfig;
    if (!sections || sections.length === 0) return { positions: [], details: [] };
    const isShelfSplitBoring = !!furnitureId?.includes('shelf-split');
    const explicitSectionTotalMm = isShelfSplitBoring
      ? sections.reduce((sum, section) => (
        sum + (section.heightType === 'absolute' ? (Number(section.height) || 0) : 0)
      ), 0)
      : 0;
    const effectiveHeightMm = explicitSectionTotalMm > 0
      ? explicitSectionTotalMm
      : height * 100;

    const result = calculateShelfBoringPositionsFromThreeUnits({
      sections,
      heightInThreeUnits: effectiveHeightMm / 100,
      basicThicknessInThreeUnits: basicThickness,
      additionalDowelBorings: {
        enabled: !!currentPlacedModule?.additionalDowelBoringsEnabled,
        count: currentPlacedModule?.additionalDowelBoringCount ?? 0,
        spacingMm: 32,
      },
    });

    const sectionRanges: Array<{ start: number; end: number }> = [];
    const totalHeightMm = effectiveHeightMm;
    const basicThicknessMm = basicThickness * 100;
    const availableHeightMm = totalHeightMm - basicThicknessMm * 2;
    let currentY = basicThicknessMm;

    sections.forEach(section => {
      const sectionHeightMm = section.heightType === 'absolute'
        ? section.height
        : availableHeightMm * (section.height / 100);
      sectionRanges.push({
        start: currentY - basicThicknessMm,
        end: currentY + sectionHeightMm,
      });
      currentY += sectionHeightMm;
    });

    const backPanelThickness = depth - adjustedDepthForShelves;
    const fixedPanelBackReduction = backPanelThickness + basicThickness - mmToThreeUnits(1);
    const getSectionDepth = (sectionIndex: number) => {
      const rawSecDepth = sectionDepths?.[sectionIndex];
      return (rawSecDepth !== undefined && rawSecDepth > 0)
        ? (rawSecDepth > 10 ? mmToThreeUnits(rawSecDepth) : rawSecDepth)
        : depth;
    };
    const getSectionDirectionOffset = (sectionIndex: number) => {
      const sectionDepth = getSectionDepth(sectionIndex);
      const depthDiff = depth - sectionDepth;
      const sectionDir = sectionDepthDirections?.[sectionIndex] || 'front';
      return depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;
    };
    const getSectionIndexByY = (yMm: number) => {
      const foundIndex = sectionRanges.findIndex(range => yMm >= range.start && yMm <= range.end);
      return foundIndex >= 0 ? foundIndex : 0;
    };
    const isFixedPanelDetail = (detail: typeof result.details[number]) => (
      detail.type === 'fixed-panel' ||
      detail.role === 'bottom-panel' ||
      detail.role === 'top-panel' ||
      detail.role === 'section-divider' ||
      detail.role === 'fixed-shelf'
    );
    const buildHoleZPositions = (detail: typeof result.details[number]) => {
      const sectionIndex = detail.role === 'top-panel'
        ? Math.max(0, sections.length - 1)
        : detail.role === 'section-divider'
          ? Math.min(
            sections.length - 1,
            Math.max(0, Math.floor((detail.roleIndex ?? 0) / 2) + ((detail.roleIndex ?? 0) % 2))
          )
          : getSectionIndexByY(detail.y);
      const sectionDepth = getSectionDepth(sectionIndex);
      const directionOffset = getSectionDirectionOffset(sectionIndex);

      if (isFixedPanelDetail(detail)) {
        // 천판/지판/섹션 구분판은 BaseFurnitureShell의 실제 수평 패널 렌더링 깊이와 동일해야 한다.
        const isLowerTopDivider = detail.role === 'section-divider' && (detail.roleIndex ?? 0) % 2 === 0;
        const isShelfSplitLowerTopDivider = isLowerTopDivider && !!furnitureId?.includes('shelf-split');
        const frontInset = isShelfSplitLowerTopDivider
          ? mmToThreeUnits(40) + basicThickness
          : isLowerTopDivider
            ? mmToThreeUnits(lowerSectionTopOffsetMm || 0)
            : 0;
        const panelDepth = Math.max(mmToThreeUnits(1), sectionDepth - fixedPanelBackReduction - frontInset);
        const panelCenterZ = directionOffset + fixedPanelBackReduction / 2 - frontInset / 2;
        const panelFrontZ = panelCenterZ + panelDepth / 2;
        const panelBackZ = panelCenterZ - panelDepth / 2;

        return [
          panelFrontZ - mmToThreeUnits(30),
          panelCenterZ,
          panelBackZ + mmToThreeUnits(30),
        ];
      }

      const shelfDepth = sectionDepth - backPanelThickness - basicThickness - mmToThreeUnits(shelfFrontInsetMm);
      const shelfCenterZ = shelfZOffset + directionOffset + basicThickness / 2 - mmToThreeUnits(shelfFrontInsetMm) / 2;
      const shelfFrontZ = shelfCenterZ + shelfDepth / 2;
      const shelfBackZ = shelfCenterZ - shelfDepth / 2;

      return [
        shelfFrontZ - mmToThreeUnits(30),
        shelfBackZ + mmToThreeUnits(30),
      ];
    };

    return {
      positions: result.positions,
      details: result.details.map(detail => ({
        ...detail,
        holeZPositions: buildHoleZPositions(detail),
      })),
    };
  }, [
    adjustedDepthForShelves,
    basicThickness,
    depth,
    height,
    currentPlacedModule?.additionalDowelBoringCount,
    currentPlacedModule?.additionalDowelBoringsEnabled,
    mmToThreeUnits,
    modelConfig,
    furnitureId,
    isLowerDowelBoringOwnedByLowerCabinet,
    sectionDepthDirections,
    sectionDepths,
    lowerSectionTopOffsetMm,
    shelfFrontInsetMm,
    shelfZOffset,
  ]);

  const hingeBracketResult = useMemo((): {
    positions: number[];
    details?: Array<{ yMm: number; zPositions: number[] }>;
  } => {
    if (!currentPlacedModule?.hasDoor) return { positions: [] };
    const moduleId = currentPlacedModule.moduleId || furnitureId || '';
    if (isDummyModuleId(moduleId)) return { positions: [] };
    if (usesDrawerFrontInsteadOfHingedDoor(moduleId)) return { positions: [] };

    const unitPerMm = mmToThreeUnits(1);
    if (!unitPerMm) return { positions: [] };

    const heightMm = height / unitPerMm;
    const basicThicknessMm = basicThickness / unitPerMm;
    const cabinetCategory = (category || currentPlacedModule.moduleData?.category || 'generic') as DoorCabinetCategory;
    const doorWidthMm = (innerWidth + basicThickness * 2) / unitPerMm;
    const isDoorSplitModule = moduleId.includes('shelf-split') || moduleId.includes('pantry-cabinet-split');

    if (isDoorSplitModule) {
      const sections = modelConfig.sections || [];
      const lowerSection = sections[0];
      const lowerSectionHeightMm = lowerSection?.heightType === 'absolute'
        ? (lowerSection.height || 0)
        : heightMm * (((lowerSection?.height || lowerSection?.heightRatio || 50) as number) / 100);
      const upperSection = sections[1];
      const upperSectionHeightMm = upperSection?.heightType === 'absolute'
        ? (upperSection.height || 0)
        : Math.max(0, heightMm - lowerSectionHeightMm);
      const upperSectionTopMm = Math.min(heightMm, lowerSectionHeightMm + upperSectionHeightMm);
      const isPantrySplit = moduleId.includes('pantry-cabinet-split');
      const lowerTopHingeInsetMm = moduleId.includes('shelf-split') ? 140 : 120;
      const defaultLowerDoorTopGapMm = isPantrySplit ? -2 : -40;
      const defaultUpperDoorBottomGapMm = isPantrySplit ? -1 : 20;
      const rawLowerDoorTopGapMm = (currentPlacedModule as any).lowerDoorTopGap;
      const rawUpperDoorBottomGapMm = (currentPlacedModule as any).upperDoorBottomGap;
      const lowerDoorTopGapMm = typeof rawLowerDoorTopGapMm === 'number'
        ? (rawLowerDoorTopGapMm === (isPantrySplit ? 2 : 40) ? defaultLowerDoorTopGapMm : rawLowerDoorTopGapMm)
        : defaultLowerDoorTopGapMm;
      const lowerDoorBottomGapMm = (currentPlacedModule as any).lowerDoorBottomGap ?? 0;
      const upperDoorBottomGapMm = typeof rawUpperDoorBottomGapMm === 'number'
        ? (
          (!isPantrySplit && rawUpperDoorBottomGapMm === -20)
            ? defaultUpperDoorBottomGapMm
            : (isPantrySplit && rawUpperDoorBottomGapMm === 1 ? defaultUpperDoorBottomGapMm : rawUpperDoorBottomGapMm)
        )
        : defaultUpperDoorBottomGapMm;
      const upperDoorTopGapMm = (currentPlacedModule as any).upperDoorTopGap ?? doorTopGap ?? 0;
      const lowerDoorTopMm = lowerSectionHeightMm + lowerDoorTopGapMm;
      const lowerDoorBottomMm = -lowerDoorBottomGapMm;
      const lowerDoorHeightMm = Math.max(1, lowerDoorTopMm - lowerDoorBottomMm);
      const upperDoorBottomMm = lowerSectionHeightMm - upperDoorBottomGapMm;
      const upperDoorHeightMm = Math.max(1, upperSectionTopMm + upperDoorTopGapMm - upperDoorBottomMm);
      const shelfCollisionRanges = allBoringResult.details
        .filter(detail => detail.role === 'movable-shelf')
        .map(detail => ({
          bottomMm: detail.y - basicThicknessMm / 2,
          topMm: detail.y + basicThicknessMm / 2,
        }));
      const resolvedLower = resolveSidePanelMatchedHingePositions({
        doorHeightMm: lowerDoorHeightMm,
        doorBottomOnSideMm: lowerDoorBottomMm,
        shelfCollisionRangesOnSideMm: shelfCollisionRanges,
        customSidePositionsMm: currentPlacedModule.lowerDoorHingePositionsMm,
        defaultDoorPositionsMm: resolveSideAnchoredDoorHingePositionsMm({
          doorHeightMm: lowerDoorHeightMm,
          doorBottomOnSideMm: lowerDoorBottomMm,
          defaultDoorPositionsMm: resolveDefaultDoorHingePositionsMm({ doorHeightMm: lowerDoorHeightMm }),
          firstSidePositionMm: 120,
          lastSidePositionMm: lowerSectionHeightMm - lowerTopHingeInsetMm,
        }),
        preserveEdgePositionsMm: true
      });
      const resolvedUpper = resolveSidePanelMatchedHingePositions({
        doorHeightMm: upperDoorHeightMm,
        doorBottomOnSideMm: upperDoorBottomMm,
        shelfCollisionRangesOnSideMm: shelfCollisionRanges,
        customSidePositionsMm: currentPlacedModule.upperDoorHingePositionsMm,
        defaultDoorPositionsMm: resolveSideAnchoredDoorHingePositionsMm({
          doorHeightMm: upperDoorHeightMm,
          doorBottomOnSideMm: upperDoorBottomMm,
          defaultDoorPositionsMm: resolveDefaultDoorHingePositionsMm({ doorHeightMm: upperDoorHeightMm }),
          firstSidePositionMm: lowerSectionHeightMm + 120,
          lastSidePositionMm: upperSectionTopMm - 120,
        }),
        preserveEdgePositionsMm: true
      });

      const lowerPositions = resolvedLower.sidePositionsMm
        .filter(position => position >= 0 && position <= heightMm);
      const upperPositions = resolvedUpper.sidePositionsMm
        .filter(position => position >= 0 && position <= heightMm);
      const getSectionDepthUnits = (sectionIndex: number) => {
        const rawSecDepth = sectionDepths?.[sectionIndex];
        return (rawSecDepth !== undefined && rawSecDepth > 0)
          ? (rawSecDepth > 10 ? mmToThreeUnits(rawSecDepth) : rawSecDepth)
          : depth;
      };
      const getSectionFrontZ = (sectionIndex: number) => {
        const sectionDepth = getSectionDepthUnits(sectionIndex);
        const depthDiff = depth - sectionDepth;
        const sectionDir = sectionDepthDirections?.[sectionIndex] || 'front';
        const directionOffset = depthDiff === 0 ? 0 : sectionDir === 'back' ? depthDiff / 2 : -depthDiff / 2;
        return directionOffset + sectionDepth / 2;
      };
      const lowerFrontZ = getSectionFrontZ(0);
      const upperFrontZ = getSectionFrontZ(1);
      const buildHingeDetails = (positions: number[], frontZ: number) => positions.map(position => ({
        yMm: position,
        zPositions: [
          frontZ - mmToThreeUnits(20),
          frontZ - mmToThreeUnits(52),
        ],
      }));
      return {
        positions: [
          ...lowerPositions,
          ...upperPositions,
        ],
        details: [
          ...buildHingeDetails(lowerPositions, lowerFrontZ),
          ...buildHingeDetails(upperPositions, upperFrontZ),
        ],
      };
    }

    const doorGeometry = resolveDoorVerticalGeometry({
      moduleId,
      cabinetCategory,
      doorWidthMm,
      cabinetHeightMm: heightMm,
      doorTopGapMm: doorTopGap ?? (currentPlacedModule as any).doorTopGap,
      doorBottomGapMm: doorBottomGap ?? (currentPlacedModule as any).doorBottomGap,
      isDualSlot: currentPlacedModule.isDualSlot,
      hingeSide: currentPlacedModule.hingePosition ?? 'right',
      cabinetBottomMm: 0,
    });
    const availableHeightMm = heightMm - basicThicknessMm * 2;
    let currentYFromBottom = basicThicknessMm;
    const shelfCollisionRanges: Array<{ bottomMm: number; topMm: number }> = [];

    (modelConfig.sections || []).forEach(section => {
      const sectionHeightMm = section.heightType === 'absolute'
        ? (section.height || 0)
        : availableHeightMm * (((section.height || section.heightRatio || 100) as number) / 100);
      const shelfPositions = Array.isArray(section.shelfPositions) && section.shelfPositions.length > 0
        ? section.shelfPositions.filter((position: number) => position > 0)
        : (section.type === 'shelf' && section.count && section.count > 0)
          ? Array.from({ length: section.count }, (_, index) => (
            sectionHeightMm / (section.count + 1) * (index + 1)
          ))
          : [];

      shelfPositions.forEach((position: number) => {
        const shelfCenterFromCabinetBottom = currentYFromBottom + position;
        shelfCollisionRanges.push({
          bottomMm: shelfCenterFromCabinetBottom - basicThicknessMm / 2,
          topMm: shelfCenterFromCabinetBottom + basicThicknessMm / 2,
        });
      });
      currentYFromBottom += sectionHeightMm;
    });
    const isSinkCabinet = currentPlacedModule.moduleId?.includes('lower-sink-cabinet')
      || currentPlacedModule.moduleId?.includes('dual-lower-sink-cabinet');
    const isTopDownDoorCabinet = currentPlacedModule.moduleId?.includes('lower-top-down-half')
      || currentPlacedModule.moduleId?.includes('dual-lower-top-down-half');
    const topHingeInsetFromBodyTopMm = isSinkCabinet ? 300 : isTopDownDoorCabinet ? 180 : 120;
    const resolvedPositions = resolveSidePanelMatchedHingePositions({
      doorHeightMm: doorGeometry.leafHeightMm,
      doorBottomOnSideMm: doorGeometry.bottomMm,
      shelfCollisionRangesOnSideMm: shelfCollisionRanges,
      customSidePositionsMm: (isSinkCabinet || isTopDownDoorCabinet) ? undefined : currentPlacedModule.hingePositionsMm,
      defaultDoorPositionsMm: resolveSideAnchoredDoorHingePositionsMm({
        doorHeightMm: doorGeometry.leafHeightMm,
        doorBottomOnSideMm: doorGeometry.bottomMm,
        defaultDoorPositionsMm: resolveDefaultDoorHingePositionsMm({
          doorHeightMm: doorGeometry.leafHeightMm,
        }),
        firstSidePositionMm: 120,
        lastSidePositionMm: heightMm - topHingeInsetFromBodyTopMm,
      }),
      preserveEdgePositionsMm: true
    });

    return {
      positions: resolvedPositions.sidePositionsMm
        .filter(position => position >= 0 && position <= heightMm),
    };
  }, [
    basicThickness,
    allBoringResult.details,
    category,
    currentPlacedModule,
    doorBottomGap,
    doorTopGap,
    furnitureId,
    height,
    innerWidth,
    mmToThreeUnits,
    modelConfig.sections,
    sectionDepthDirections,
    sectionDepths,
    depth,
  ]);
  const hingeBracketPositions = hingeBracketResult.positions;
  const hingeBracketDetails = hingeBracketResult.details;

  const sideBoringDetails = isTopDownBoringOwnedByLowerCabinet
    ? []
    : isLowerDowelBoringOwnedByLowerCabinet
    ? allBoringResult.details.filter(detail => detail.role === 'additional-dowel')
    : allBoringResult.details.filter(detail => (
      shouldRenderTopPanelBoring || detail.role !== 'top-panel'
    ));
  const sideBoringPositions = sideBoringDetails.map(detail => detail.y);
  const sideHingeBracketPositions = isLowerDowelBoringOwnedByLowerCabinet
    ? []
    : hingeBracketPositions;
  const sideHingeBracketDetails = isLowerDowelBoringOwnedByLowerCabinet
    ? undefined
    : hingeBracketDetails;

  return (
    <>
      {renderSections()}

      {/* 측면뷰에서 선반핀 보링 시각화 */}
      <SidePanelBoring
        height={height}
        depth={depth}
        basicThickness={basicThickness}
        innerWidth={innerWidth}
        boringPositions={sideBoringPositions}
        boringDetails={sideBoringDetails}
        hingeBracketPositions={sideHingeBracketPositions}
        hingeBracketDetails={sideHingeBracketDetails}
        placedFurnitureId={placedFurnitureId}
        category={category}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        mmToThreeUnits={mmToThreeUnits}
      />
    </>
  );
};

export default SectionsRenderer; 
