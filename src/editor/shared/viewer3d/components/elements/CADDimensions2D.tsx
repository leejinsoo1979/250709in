import React, { useMemo } from 'react';
import { Text } from '@react-three/drei';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { calculateBaseFrameHeight } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SectionConfig } from '@/data/modules/shelving';

const DEFAULT_BASIC_THICKNESS_MM = 18;

const mmToThreeUnits = (mm: number) => mm * 0.01;

type SectionWithCalc = SectionConfig & { calculatedHeight?: number };

interface SectionHeightsInfo {
  sections: SectionWithCalc[];
  heightsMm: number[];
  basicThicknessMm: number;
}

const computeSectionHeightsInfo = (
  module: PlacedModule,
  moduleData: ReturnType<typeof getModuleById> | null,
  internalHeightMm: number
): SectionHeightsInfo => {
  const rawSections = ((module.customSections && module.customSections.length > 0)
    ? module.customSections
    : moduleData?.modelConfig?.sections) as SectionWithCalc[] | undefined;

  const basicThicknessMm = moduleData?.modelConfig?.basicThickness ?? DEFAULT_BASIC_THICKNESS_MM;

  if (!rawSections || rawSections.length === 0) {
    return {
      sections: [],
      heightsMm: [],
      basicThicknessMm
    };
  }

  const availableHeightMm = Math.max(internalHeightMm - basicThicknessMm * 2, 0);
  const hasCalculatedHeights = rawSections.every(section => typeof (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight === 'number');

  let heightsMm: number[];

  if (hasCalculatedHeights) {
    heightsMm = rawSections.map(section => {
      const calc = (section as SectionWithCalc & { calculatedHeight?: number }).calculatedHeight;
      return Math.max(calc ?? 0, 0);
    });
  } else {
    const absoluteSections = rawSections.filter(section => section.heightType === 'absolute');
    const totalFixedMm = absoluteSections.reduce((sum, section) => {
      const value = typeof section.height === 'number' ? section.height : 0;
      return sum + Math.min(value, availableHeightMm);
    }, 0);

    const remainingMm = Math.max(availableHeightMm - totalFixedMm, 0);
    const percentageSections = rawSections.filter(section => section.heightType !== 'absolute');
    const totalPercentage = percentageSections.reduce((sum, section) => sum + (section.height ?? 0), 0);
    const percentageCount = percentageSections.length;

    heightsMm = rawSections.map(section => {
      if (section.heightType === 'absolute') {
        return Math.min(section.height ?? 0, availableHeightMm);
      }

      if (totalPercentage > 0) {
        return remainingMm * ((section.height ?? 0) / totalPercentage);
      }

      return percentageCount > 0 ? remainingMm / percentageCount : remainingMm;
    });

    const assignedMm = heightsMm.reduce((sum, value) => sum + value, 0);
    const diffMm = availableHeightMm - assignedMm;
    if (Math.abs(diffMm) > 0.01 && heightsMm.length > 0) {
      heightsMm[heightsMm.length - 1] = Math.max(heightsMm[heightsMm.length - 1] + diffMm, 0);
    }
  }

  return {
    sections: rawSections,
    heightsMm,
    basicThicknessMm
  };
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
  const placedModulesStore = useFurnitureStore(state => state.placedModules);
  const { view2DDirection, showDimensions: showDimensionsFromStore, view2DTheme, selectedSlotIndex, showFurniture } = useUIStore();
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

  // 프레임 높이
  const topFrameHeightMm = spaceInfo.frameSize?.top || 0;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);

  // 바닥레일/받침대 높이 계산
  // - floor 타입: 받침대 높이 (calculateBaseFrameHeight 사용)
  // - stand 타입 + 띄움 배치: 바닥 프레임 없음 (0)
  // - stand 타입 + 일반 배치: 바닥레일 높이 (baseConfig.height)
  const isStandType = spaceInfo.baseConfig?.type === 'stand';
  const railOrBaseHeightMm = isStandType
    ? (isFloating ? 0 : (spaceInfo.baseConfig?.height || 0))  // 띄움 배치면 바닥 프레임 없음
    : calculateBaseFrameHeight(spaceInfo);
  const railOrBaseHeight = mmToThreeUnits(railOrBaseHeightMm);

  // 내경 높이 조정
  // - stand 타입: 바닥레일 높이 빼기
  // - 띄움 배치: 띄움 높이도 빼기 (가구가 공간에 맞춰 높이 조정됨)
  const floatHeightMmForCalc = isFloating ? floatHeightMm : 0;
  const adjustedInternalHeightMm = isStandType
    ? internalSpace.height - railOrBaseHeightMm - floatHeightMmForCalc
    : internalSpace.height;
  const internalHeight = mmToThreeUnits(adjustedInternalHeightMm);

  // 내부 공간을 상부/하부 섹션으로 분할 (50%씩)
  const upperSectionHeight = internalHeight / 2;
  const lowerSectionHeight = internalHeight / 2;

  // 하위 호환성을 위한 변수 (기존 코드에서 사용)
  // 띄움 배치에서는 띄움 높이를 받침대 높이 변수에 설정 (치수 표시용)
  const baseFrameHeightMm = isFloating ? floatHeightMm : railOrBaseHeightMm;
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);

  // 가구 및 치수선 시작 Y 위치
  // - 띄움 배치: floatHeight만 사용 (baseFrameHeight는 텍스트 표시용으로만 사용)
  // - 일반 배치: baseFrameHeight 사용 (floatHeight는 0)
  const furnitureBaseY = isFloating ? floatHeight : baseFrameHeight;

  // 단내림 설정
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
  const dropHeightMm = hasDroppedCeiling ? (spaceInfo.droppedCeiling?.dropHeight || 200) : 0;
  const dropHeight = mmToThreeUnits(dropHeightMm);
  const droppedCeilingHeight = spaceHeight - dropHeight; // 단내림 구간 높이

  // 폰트 크기
  const largeFontSize = mmToThreeUnits(40);
  const smallFontSize = mmToThreeUnits(30);

  // 치수선 오프셋
  const leftDimOffset = mmToThreeUnits(400);
  const rightDimOffset = mmToThreeUnits(400);

  // 측면뷰에서 표시할 가구 필터링
  const getVisibleFurnitureForSideView = () => {
    if (placedModules.length === 0) return [];

    // 선택된 슬롯의 가구만 필터링
    let filteredBySlot = placedModules;
    if (selectedSlotIndex !== null) {
      filteredBySlot = placedModules.filter(module => {
        if (module.slotIndex === undefined) return false;

        // 듀얼 가구인 경우: 시작 슬롯 또는 다음 슬롯 확인
        if (module.isDualSlot) {
          return module.slotIndex === selectedSlotIndex || module.slotIndex + 1 === selectedSlotIndex;
        }

        // 싱글 가구인 경우: 정확히 일치하는 슬롯만
        return module.slotIndex === selectedSlotIndex;
      });
    }

    if (filteredBySlot.length === 0) return [];

    if (currentViewDirection === 'left') {
      // 좌측뷰: X 좌표가 가장 작은(왼쪽 끝) 가구
      const leftmostModule = filteredBySlot.reduce((leftmost, current) =>
        current.position.x < leftmost.position.x ? current : leftmost
      );
      return [leftmostModule];
    } else if (currentViewDirection === 'right') {
      // 우측뷰: X 좌표가 가장 큰(오른쪽 끝) 가구
      const rightmostModule = filteredBySlot.reduce((rightmost, current) =>
        current.position.x > rightmost.position.x ? current : rightmost
      );
      return [rightmostModule];
    }

    return [];
  };

  const visibleFurniture = getVisibleFurnitureForSideView();

  // 좌측뷰인 경우
  if (currentViewDirection === 'left') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <NativeLine
            points={[
              [0, 0, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 보조 가이드 연장선 - 상단 */}
          <NativeLine
            points={[
              [0, spaceHeight, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 수직 치수선 */}
          <NativeLine
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine
            points={[
              [-0.03, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine
            points={[
              [-0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 엔드포인트 - 상단 (세로선과 연장선 만나는 지점) */}
          <mesh position={[0, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 엔드포인트 - 하단 (세로선과 연장선 만나는 지점) */}
          <mesh position={[0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 높이 텍스트 */}
          <Text
            position={[0, spaceHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={1000}
            depthTest={false}
            rotation={[0, -Math.PI / 2, Math.PI / 2]}
          >
            {spaceInfo.height}
          </Text>
        </group>}

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 ===== */}

        {/* 상부 프레임 두께 (공간 상단 기준 - floatHeight 없음) */}
        {topFrameHeightMm > 0 && (
          <group>
            {/* 보조 가이드 연장선 - 하단 (상부 프레임 하단) */}
            <NativeLine
              points={[
                [0, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 상단 (공간 최상단) */}
            <NativeLine
              points={[
                [0, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 수직 치수선 */}
            <NativeLine
              points={[
                [0, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine
              points={[
                [-0.03, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine
              points={[
                [-0.03, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <Text
              position={[0, spaceHeight - topFrameHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {topFrameHeightMm}
            </Text>
          </group>
        )}

        {/* 가구별 섹션 치수 가이드 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, moduleIndex) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;

          // 가구 Z 위치 계산 (실제 가구 위치와 동일하게)
          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const moduleDepth = mmToThreeUnits(moduleData.dimensions.depth);
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;

          const actualDepthMm = moduleData.dimensions.depth;
          // 서랍 실제 깊이 (전체 깊이 - 뒤판 및 여유)
          const drawerDepthMm = 517;

          const { sections: sectionConfigs, heightsMm: sectionHeightsMm, basicThicknessMm } = computeSectionHeightsInfo(module as PlacedModule, moduleData, internalSpace.height);
          if (sectionConfigs.length === 0) {
            return null;
          }

          const basicThickness = mmToThreeUnits(basicThicknessMm);
          const sectionHeights = sectionHeightsMm.map(mmToThreeUnits);
          const totalSections = sectionConfigs.length;
          const sectionStartMm: number[] = [];
          let accumMm = 0;
          sectionHeightsMm.forEach(heightMm => {
            sectionStartMm.push(accumMm);
            accumMm += heightMm;
          });

          // 각 섹션의 실제 높이 계산 (받침대 + 하판(basicThickness) 위부터 시작)
          const cabinetBottomY = furnitureBaseY;
          const cabinetTopY = cabinetBottomY + internalHeight;

          return sectionConfigs.map((section, sectionIndex) => {
            const interiorStartMm = sectionStartMm[sectionIndex] ?? 0;
            const computedHeightMm = sectionHeightsMm[sectionIndex] ?? Math.max(sectionHeights[sectionIndex] / 0.01, 0);
            const interiorStartY = cabinetBottomY + mmToThreeUnits(interiorStartMm);
            const interiorEndY = interiorStartY + mmToThreeUnits(computedHeightMm);

            const isLastSection = sectionIndex === totalSections - 1;

            let sectionStartY = sectionIndex === 0 ? cabinetBottomY : interiorStartY;
            let sectionEndY = isLastSection ? cabinetTopY : interiorEndY;

            // 우측뷰에서 상부섹션의 치수가이드를 36mm 아래로 확장
            if (currentViewDirection === 'right' && sectionIndex > 0) {
              console.log('🔴 CADDimensions2D: 우측뷰 상부섹션 36mm 확장', {
                currentViewDirection,
                sectionIndex,
                originalStartY: sectionStartY,
                adjustedStartY: sectionStartY - mmToThreeUnits(36)
              });
              sectionStartY -= mmToThreeUnits(36);
            }

            const sectionHeight = sectionEndY - sectionStartY;
            const sectionHeightMm = Math.max(sectionHeight / 0.01, 0);

            // 첫 번째 섹션은 하단 가이드선 표시 안 함 (받침대와 겹침)
            const shouldRenderStartGuide = sectionIndex !== 0;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {/* 보조 가이드 연장선 - 시작 */}
                {shouldRenderStartGuide && (
                <NativeLine
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                {/* 보조 가이드 연장선 - 끝 (상부섹션은 가구 최상단에서) */}
                <NativeLine
                  points={[
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 치수선 */}
                <NativeLine
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 티크 마크 */}
                {shouldRenderStartGuide && (
                <NativeLine
                  points={[
                    [0 - 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                <NativeLine
                  points={[
                    [0 - 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 엔드포인트 - 시작 모서리 */}
                {shouldRenderStartGuide && (
                <mesh
                  position={[
                    0,
                    sectionStartY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>
                )}

                {/* 엔드포인트 - 끝 모서리 */}
                <mesh
                  position={[
                    0,
                    sectionEndY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>

                {/* 치수 텍스트 */}
                <Text
                  position={[
                    0,
                    (sectionStartY + sectionEndY) / 2,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)
                  ]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={1000}
                  depthTest={false}
                  rotation={[0, -Math.PI / 2, Math.PI / 2]}
                >
                  {Math.round(sectionHeightMm)}
                </Text>

                {/* 선반 섹션 내경 높이 표시 제거 - 호버 반응 없는 중복 치수 */}
                {(() => {
                  return null; // 완전히 비활성화

                  // shelf 또는 hanging 타입이면서 shelfPositions가 있는 경우만 처리
                  if ((section.type !== 'shelf' && section.type !== 'hanging') || !section.shelfPositions || section.shelfPositions.length === 0) {
                    return null;
                  }

                  const compartmentHeights: Array<{ height: number; centerY: number; heightMm: number }> = [];
                  const shelfPositions = section.shelfPositions;

                  // 첫 번째 칸 (맨 아래) - 바닥부터 첫 번째 선반 하단까지
                  // 정면뷰(ShelfRenderer.tsx line 171-202)와 동일한 로직
                  if (shelfPositions.length > 0) {
                    // positionMm === 0인 경우 (바닥판) - 칸 높이 치수는 표시하지 않음 (선반 두께만 표시)
                    if (shelfPositions[0] === 0) {
                      console.log('🔵 측면뷰 첫 번째 칸: 바닥판(0)이므로 표시 안 함');
                    } else {
                      const firstShelfBottomMm = shelfPositions[0] - basicThickness / 0.01 / 2; // 첫 번째 선반의 하단
                      const height = mmToThreeUnits(firstShelfBottomMm);
                      const centerY = sectionStartY + height / 2;

                      console.log('🔵 측면뷰 첫 번째 칸:', {
                        shelfPos_0: shelfPositions[0],
                        basicThickness_mm: basicThickness / 0.01,
                        firstShelfBottomMm,
                        표시될값: Math.round(firstShelfBottomMm)
                      });

                      compartmentHeights.push({ height, centerY, heightMm: firstShelfBottomMm });
                    }
                  }

                  // 중간 칸들 - 현재 선반 상단부터 다음 선반 하단까지
                  // 정면뷰(ShelfRenderer.tsx line 206-213)와 완전히 동일한 로직
                  for (let i = 0; i < shelfPositions.length - 1; i++) {
                    const currentShelfTopMm = shelfPositions[i] + basicThickness / 0.01 / 2; // 현재 선반의 상단
                    const nextShelfBottomMm = shelfPositions[i + 1] - basicThickness / 0.01 / 2; // 다음 선반의 하단
                    const heightMm = nextShelfBottomMm - currentShelfTopMm;
                    const height = mmToThreeUnits(heightMm); // Three.js 단위로 변환
                    const centerY = sectionStartY + mmToThreeUnits(currentShelfTopMm + heightMm / 2);

                    console.log(`🔵 측면뷰 중간 칸 ${i}:`, {
                      shelfPos_i: shelfPositions[i],
                      shelfPos_next: shelfPositions[i + 1],
                      basicThickness_mm: basicThickness / 0.01,
                      currentShelfTopMm,
                      nextShelfBottomMm,
                      heightMm,
                      표시될값: Math.round(heightMm)
                    });

                    compartmentHeights.push({ height, centerY, heightMm });
                  }

                  // 마지막 칸 - 마지막 선반 상단부터 섹션 상단까지
                  // 정면뷰(ShelfRenderer.tsx line 222-232)와 동일한 로직
                  if (shelfPositions.length > 0) {
                    const lastShelfPos = shelfPositions[shelfPositions.length - 1];
                    const lastShelfTopMm = lastShelfPos + basicThickness / 0.01 / 2; // 선반 상단 위치

                    // 섹션 상단 Y 위치 계산
                    // isLastSection이면 가구 최상단(furnitureBaseY + internalHeight)
                    // 아니면 sectionEndY
                    const sectionTopY = isLastSection ? (furnitureBaseY + internalHeight) : sectionEndY;

                    // 섹션 상단에서 상단판(basicThickness) 2개 두께를 뺀 위치가 내부 상단
                    // 띄움배치 시 상부섹션은 18mm 확장
                    const floatingAdjustment = (isFloating && isLastSection) ? mmToThreeUnits(18) : 0;
                    const topFrameBottomY = sectionTopY - basicThickness + floatingAdjustment;
                    const topFrameBottomMm = (topFrameBottomY - sectionStartY) / 0.01;

                    const heightMm = topFrameBottomMm - lastShelfTopMm; // 선반 상단부터 상단 프레임 하단까지
                    const height = mmToThreeUnits(heightMm); // Three.js 단위로 변환
                    const centerY = sectionStartY + mmToThreeUnits(lastShelfTopMm + heightMm / 2);

                    console.log('🔵 측면뷰 마지막 칸:', {
                      lastShelfPos,
                      basicThickness_mm: basicThickness / 0.01,
                      lastShelfTopMm,
                      topFrameBottomMm,
                      sectionHeight_mm: sectionHeight / 0.01,
                      heightMm,
                      표시될값: Math.round(heightMm)
                    });

                    compartmentHeights.push({ height, centerY, heightMm });
                  }

                  return compartmentHeights.map((compartment, compartmentIndex) => {
                    const compartmentBottom = compartment.centerY - compartment.height / 2;
                    const compartmentTop = compartment.centerY + compartment.height / 2;

                    // X 위치: 가구 박스 왼쪽 안쪽 (가구 폭의 절반 - 100mm)
                    const lineX = 0 - indexing.columnWidth / 2 + mmToThreeUnits(100);

                    return (
                      <group key={`shelf-compartment-${sectionIndex}-${compartmentIndex}`}>
                        {/* 보조 가이드 연장선 - 하단 */}
                        <NativeLine
                          points={[
                            [lineX - mmToThreeUnits(200), compartmentBottom, furnitureZ],
                            [lineX, compartmentBottom, furnitureZ]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                          renderOrder={10000}
                          depthTest={false}
                        />

                        {/* 보조 가이드 연장선 - 상단 */}
                        <NativeLine
                          points={[
                            [lineX - mmToThreeUnits(200), compartmentTop, furnitureZ],
                            [lineX, compartmentTop, furnitureZ]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                          renderOrder={10000}
                          depthTest={false}
                        />

                        {/* 치수선 */}
                        <NativeLine
                          points={[
                            [lineX, compartmentBottom, furnitureZ],
                            [lineX, compartmentTop, furnitureZ]
                          ]}
                          color={dimensionColor}
                          lineWidth={2}
                          renderOrder={10000}
                          depthTest={false}
                        />

                        {/* 티크 마크 - 하단 */}
                        <NativeLine
                          points={[
                            [lineX, compartmentBottom, furnitureZ - 0.03],
                            [lineX, compartmentBottom, furnitureZ + 0.03]
                          ]}
                          color={dimensionColor}
                          lineWidth={2}
                          renderOrder={10000}
                          depthTest={false}
                        />

                        {/* 티크 마크 - 상단 */}
                        <NativeLine
                          points={[
                            [lineX, compartmentTop, furnitureZ - 0.03],
                            [lineX, compartmentTop, furnitureZ + 0.03]
                          ]}
                          color={dimensionColor}
                          lineWidth={2}
                          renderOrder={10000}
                          depthTest={false}
                        />

                        {/* 치수 텍스트 */}
                        <Text
                          position={[
                            lineX - mmToThreeUnits(60),
                            compartment.centerY,
                            furnitureZ
                          ]}
                          fontSize={largeFontSize}
                          color={textColor}
                          anchorX="center"
                          anchorY="middle"
                          renderOrder={10000}
                          depthTest={false}
                          rotation={[0, -Math.PI / 2, Math.PI / 2]}
                        >
                          {Math.round(compartment.heightMm)}
                        </Text>
                      </group>
                    );
                  });
                })()}

                {/* 서랍 섹션인 경우 각 서랍별 깊이 표시 */}
                {section.type === 'drawer' && section.drawerHeights && section.drawerHeights.map((drawerHeight, drawerIndex) => {
                  const drawerGap = section.gapHeight || 0;
                  const totalDrawerHeight = drawerHeight + drawerGap;

                  // 각 서랍의 Y 위치 계산 (DrawerRenderer와 동일한 방식)
                  // sectionStartY는 받침대 + 하판 위치, 여기에 첫 공백(gapHeight)을 더함
                  let drawerY = sectionStartY + mmToThreeUnits(drawerGap);
                  for (let i = 0; i < drawerIndex; i++) {
                    drawerY += mmToThreeUnits(section.drawerHeights![i] + drawerGap);
                  }
                  drawerY += mmToThreeUnits(drawerHeight / 2); // 서랍 중앙

                  // 서랍 깊이 텍스트 Z 위치: 서랍 중심 (가구 중심과 동일)
                  const textZ = furnitureZ;

                  // X 위치: 가구 박스 왼쪽 바깥으로 (가구 폭의 절반 + 100mm)
                  const textX = 0; // 측면뷰에서는 단면 중앙에 깊이 표기

                  return (
                    <Text
                      key={`drawer-depth-${sectionIndex}-${drawerIndex}`}
                      position={[textX, drawerY, textZ]}
                      fontSize={largeFontSize}
                      color="#008B8B"
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={10000}
                      depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      D{drawerDepthMm}
                    </Text>
                  );
                })}
              </group>
            );
          });
        })}

        {/* 받침대 높이 */}
        {baseFrameHeightMm > 0 && (
        <group>
            {/* 보조 가이드 연장선 - 시작 (바닥) */}
            <NativeLine
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 끝 (받침대 상단) */}
            <NativeLine
              points={[
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 치수선 */}
            <NativeLine
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine
              points={[
                [-0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 엔드포인트 - 바닥 모서리 */}
            <mesh
              position={[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 엔드포인트 - 받침대 상단 모서리 (가구가 없을 때만 표시) */}
            {visibleFurniture.length === 0 && (
            <mesh
              position={[0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>
            )}

            {/* 치수 텍스트 */}
            <Text
              position={[0, furnitureBaseY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              {baseFrameHeightMm}
            </Text>
        </group>
        )}


        {/* ===== 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 ===== */}
        {visibleFurniture.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 상부섹션 깊이 우선 사용
          const upperDepth = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);

          // 가구 위치 계산 (FurnitureItem.tsx와 동일)
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = furnitureBaseY + internalHeight + mmToThreeUnits(200); // 가구 상단 + 200mm

          // Z축 위치 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600; // 가구 깊이 고정값
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;

          return (
            <group key={`furniture-depth-${index}`}>
              {/* 보조 가이드 연장선 - 앞쪽 */}
              <NativeLine
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ + moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 보조 가이드 연장선 - 뒤쪽 */}
              <NativeLine
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 가구 깊이 치수선 */}
              <NativeLine
                points={[
                  [0, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 앞쪽 티크 */}
              <NativeLine
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ + moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 뒤쪽 티크 */}
              <NativeLine
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 엔드포인트 - 앞쪽 (치수선과 연장선 만나는 지점) */}
              <mesh position={[0, furnitureTopY, furnitureZ + moduleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 엔드포인트 - 뒤쪽 (치수선과 연장선 만나는 지점) */}
              <mesh position={[0, furnitureTopY, furnitureZ - moduleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 가구 깊이 텍스트 */}
              <Text
                position={[0, furnitureTopY + mmToThreeUnits(80), furnitureZ]}
                fontSize={largeFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
                renderOrder={1000}
                depthTest={false}
                rotation={[0, -Math.PI / 2, 0]}
              >
                {customDepth}
              </Text>

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {(module.lowerSectionDepth !== undefined) && (() => {
                const lowerDepth = module.lowerSectionDepth;
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerDimY = floatHeight - mmToThreeUnits(200); // 하단 치수선 위치 (가구 바닥 아래)

                return (
                  <group>
                    {/* 보조 가이드 연장선 - 앞쪽 */}
                    <NativeLine
                      points={[
                        [0, floatHeight, lowerFurnitureZ + lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 보조 가이드 연장선 - 뒤쪽 */}
                    <NativeLine
                      points={[
                        [0, floatHeight, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 하부 깊이 치수선 */}
                    <NativeLine
                      points={[
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 앞쪽 티크 */}
                    <NativeLine
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 뒤쪽 티크 */}
                    <NativeLine
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    {/* 엔드포인트 - 앞쪽 */}
                    <mesh position={[0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    {/* 엔드포인트 - 뒤쪽 */}
                    <mesh position={[0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    {/* 하부 깊이 텍스트 */}
                    <Text
                      position={[0, lowerDimY - mmToThreeUnits(80), lowerFurnitureZ]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={1000}
                      depthTest={false}
                      rotation={[0, -Math.PI / 2, 0]}
                    >
                      {lowerDepth}
                    </Text>
                  </group>
                );
              })()}
            </group>
          );
        })}
      </group>
    );
  }

  // 우측뷰인 경우 (좌측뷰와 대칭)
  if (currentViewDirection === 'right') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 (공간 높이 - 바닥부터 시작) ===== */}
        {<group>
          {/* 보조 가이드 연장선 - 하단 */}
          <NativeLine
            points={[
              [0, 0, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 보조 가이드 연장선 - 상단 */}
          <NativeLine
            points={[
              [0, spaceHeight, -spaceDepth/2 + mmToThreeUnits(110)],
              [0, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 수직 치수선 */}
          <NativeLine
            points={[
              [0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine
            points={[
              [-0.03, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine
            points={[
              [-0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)],
              [0.03, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 엔드포인트 - 상단 */}
          <mesh position={[0, spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 엔드포인트 - 하단 */}
          <mesh position={[0, 0, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150)]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 높이 텍스트 */}
          <Text
            position={[0, spaceHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(150) - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            renderOrder={1000}
            depthTest={false}
            rotation={[0, Math.PI / 2, Math.PI / 2]}
          >
            {spaceInfo.height}
          </Text>
        </group>}

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 (좌측뷰와 동일, rotation만 대칭) ===== */}

        {/* 상부 프레임 두께 (공간 상단 기준 - floatHeight 없음) */}
        {topFrameHeightMm > 0 && (
          <group>
            {/* 보조 가이드 연장선 - 하단 (상부 프레임 하단) */}
            <NativeLine
              points={[
                [0, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 상단 (공간 최상단) */}
            <NativeLine
              points={[
                [0, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 수직 치수선 */}
            <NativeLine
              points={[
                [0, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine
              points={[
                [-0.03, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine
              points={[
                [-0.03, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <Text
              position={[0, spaceHeight - topFrameHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {topFrameHeightMm}
            </Text>
          </group>
        )}

        {/* 가구별 섹션 치수 가이드 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, moduleIndex) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;

          // 가구 Z 위치 계산 (실제 가구 위치와 동일하게)
          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const moduleDepth = mmToThreeUnits(moduleData.dimensions.depth);
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;

          const actualDepthMm = moduleData.dimensions.depth;
          const drawerDepthMm = 517;

          const { sections: sectionConfigs, heightsMm: sectionHeightsMm, basicThicknessMm } = computeSectionHeightsInfo(module as PlacedModule, moduleData, internalSpace.height);
          if (sectionConfigs.length === 0) {
            return null;
          }

          const basicThickness = mmToThreeUnits(basicThicknessMm);
          const sectionHeights = sectionHeightsMm.map(mmToThreeUnits);
          const totalSections = sectionConfigs.length;
          const sectionStartMm: number[] = [];
          let accumMm = 0;
          sectionHeightsMm.forEach(heightMm => {
            sectionStartMm.push(accumMm);
            accumMm += heightMm;
          });

          const cabinetBottomY = furnitureBaseY;
          const cabinetTopY = cabinetBottomY + internalHeight;

          return sectionConfigs.map((section, sectionIndex) => {
            const interiorStartMm = sectionStartMm[sectionIndex] ?? 0;
            const computedHeightMm = sectionHeightsMm[sectionIndex] ?? Math.max(sectionHeights[sectionIndex] / 0.01, 0);
            const interiorStartY = cabinetBottomY + mmToThreeUnits(interiorStartMm);
            const interiorHeightUnits = mmToThreeUnits(computedHeightMm);
            const interiorEndY = interiorStartY + mmToThreeUnits(computedHeightMm);

            const isLastSection = sectionIndex === totalSections - 1;

            // 좌측뷰와 동일한 계산 방식
            let sectionStartY = sectionIndex === 0 ? cabinetBottomY : interiorStartY;
            let sectionEndY = isLastSection ? cabinetTopY : interiorEndY;

            const sectionHeightMm = Math.max((sectionEndY - sectionStartY) / 0.01, 0);

            // 첫 번째 섹션은 하단 가이드선 표시 안 함 (받침대와 겹침)
            const shouldRenderStartGuide = sectionIndex !== 0;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {/* 보조 가이드 연장선 - 시작 */}
                {shouldRenderStartGuide && (
                <NativeLine
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                {/* 보조 가이드 연장선 - 끝 (상부섹션은 가구 최상단에서) */}
                <NativeLine
                  points={[
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 치수선 */}
                <NativeLine
                  points={[
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 티크 마크 */}
                {shouldRenderStartGuide && (
                <NativeLine
                  points={[
                    [0 - 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                <NativeLine
                  points={[
                    [0 - 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                    [0 + 0.03,
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 엔드포인트 - 시작 모서리 */}
                {shouldRenderStartGuide && (
                <mesh
                  position={[
                    0,
                    sectionStartY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>
                )}

                {/* 엔드포인트 - 끝 모서리 */}
                <mesh
                  position={[
                    0,
                    sectionEndY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)
                  ]}
                  renderOrder={100001}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.06, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>

                {/* 치수 텍스트 */}
                <Text
                  position={[
                    0,
                    (sectionStartY + sectionEndY) / 2,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)
                  ]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={1000}
                  depthTest={false}
                  rotation={[0, Math.PI / 2, Math.PI / 2]}
                >
                  {Math.round(sectionHeightMm)}
                </Text>

                {/* 서랍 섹션인 경우 각 서랍별 깊이 표시 */}
                {section.type === 'drawer' && section.drawerHeights && section.drawerHeights.map((drawerHeight, drawerIndex) => {
                  const drawerGap = section.gapHeight || 0;

                  let drawerY = sectionStartY + mmToThreeUnits(drawerGap);
                  for (let i = 0; i < drawerIndex; i++) {
                    drawerY += mmToThreeUnits(section.drawerHeights![i] + drawerGap);
                  }
                  drawerY += mmToThreeUnits(drawerHeight / 2);

                  const textZ = furnitureZ;
                  const textX = 0; // 측면뷰에서도 서랍 내부 중앙에 깊이 표기

                  return (
                    <Text
                      key={`drawer-depth-${sectionIndex}-${drawerIndex}`}
                      position={[textX, drawerY, textZ]}
                      fontSize={largeFontSize}
                      color="#008B8B"
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={10000}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      D{drawerDepthMm}
                    </Text>
                  );
                })}
              </group>
            );
          });
        })}

        {/* 받침대 높이 */}
        {baseFrameHeightMm > 0 && (
        <group>
            <NativeLine
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) - mmToThreeUnits(360)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [-0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)],
                [0.03, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 엔드포인트 - 바닥 모서리 */}
            <mesh
              position={[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 엔드포인트 - 받침대 상단 모서리 (가구가 없을 때만 표시) */}
            {visibleFurniture.length === 0 && (
            <mesh
              position={[0, furnitureBaseY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750)]}
              renderOrder={100001}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>
            )}

            <Text
              position={[0, furnitureBaseY / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(750) + mmToThreeUnits(60)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
            >
              {baseFrameHeightMm}
            </Text>
        </group>
        )}

        {/* 가구별 깊이 치수 - 측면뷰에서 보이는 가구만 표시 */}
        {visibleFurniture.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 상부섹션 깊이 우선 사용
          const upperDepth = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
          const customDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(customDepth);

          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = furnitureBaseY + internalHeight + mmToThreeUnits(200);

          const panelDepthMm = spaceInfo.depth || 1500;
          const furnitureDepthMm = 600;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(20);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;

          return (
            <group key={`furniture-depth-${index}`}>
              <NativeLine
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ + moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine
                points={[
                  [0, furnitureBaseY + internalHeight, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine
                points={[
                  [0, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ + moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine
                points={[
                  [0 - 0.02, furnitureTopY, furnitureZ - moduleDepth/2],
                  [0 + 0.02, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              <mesh position={[0, furnitureTopY, furnitureZ + moduleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              <mesh position={[0, furnitureTopY, furnitureZ - moduleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

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

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {(module.lowerSectionDepth !== undefined) && (() => {
                const lowerDepth = module.lowerSectionDepth;
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerDimY = floatHeight - mmToThreeUnits(200); // 하단 치수선 위치 (가구 바닥 아래)

                return (
                  <group>
                    <NativeLine
                      points={[
                        [0, floatHeight, lowerFurnitureZ + lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine
                      points={[
                        [0, floatHeight, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine
                      points={[
                        [0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <NativeLine
                      points={[
                        [0 - 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2],
                        [0 + 0.02, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]
                      ]}
                      color={dimensionColor}
                      lineWidth={1.5}
                      renderOrder={100000}
                      depthTest={false}
                    />

                    <mesh position={[0, lowerDimY, lowerFurnitureZ + lowerModuleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

                    <mesh position={[0, lowerDimY, lowerFurnitureZ - lowerModuleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                      <circleGeometry args={[0.06, 16]} />
                      <meshBasicMaterial color={dimensionColor} depthTest={false} />
                    </mesh>

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
      </group>
    );
  }

  return null;
};

export default CADDimensions2D;
