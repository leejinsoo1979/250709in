import React from 'react';
import { Text } from '@react-three/drei';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateFurnitureDimensions } from '@/editor/shared/utils/furnitureDimensionCalculator';

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
  const { placedModules } = useFurnitureStore();
  const { view2DDirection, showDimensions: showDimensionsFromStore, view2DTheme } = useUIStore();

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  // 2D 도면 치수 색상
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';
  const textColor = dimensionColor;

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

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
  const internalHeight = mmToThreeUnits(internalSpace.height);

  // 내부 공간을 상부/하부 섹션으로 분할 (50%씩)
  const upperSectionHeight = internalHeight / 2;
  const lowerSectionHeight = internalHeight / 2;

  // 띄워서 배치
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;

  // 프레임 높이
  const topFrameHeightMm = spaceInfo.frameSize?.top || 0;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);
  const baseFrameHeightMm = spaceInfo.baseConfig?.height || 0;
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);
  const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;

  // 폰트 크기
  const largeFontSize = mmToThreeUnits(40);
  const smallFontSize = mmToThreeUnits(30);

  // 치수선 오프셋
  const leftDimOffset = mmToThreeUnits(150);
  const rightDimOffset = mmToThreeUnits(150);

  // 좌측뷰인 경우
  if (currentViewDirection === 'left') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 ===== */}
        <group>
          {/* 보조 가이드 연장선 - 하단 */}
          <NativeLine
            points={[
              [0, floatHeight, -spaceDepth/2],
              [0, floatHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 보조 가이드 연장선 - 상단 */}
          <NativeLine
            points={[
              [0, floatHeight + spaceHeight, -spaceDepth/2],
              [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 수직 치수선 */}
          <NativeLine
            points={[
              [0, floatHeight, -spaceDepth/2 - leftDimOffset],
              [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine
            points={[
              [-0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset],
              [0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine
            points={[
              [-0.03, floatHeight, -spaceDepth/2 - leftDimOffset],
              [0.03, floatHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 엔드포인트 - 상단 (세로선과 연장선 만나는 지점) */}
          <mesh position={[0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 엔드포인트 - 하단 (세로선과 연장선 만나는 지점) */}
          <mesh position={[0, floatHeight, -spaceDepth/2 - leftDimOffset]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 높이 텍스트 */}
          <Text
            position={[0, floatHeight + spaceHeight / 2, -spaceDepth/2 - leftDimOffset - mmToThreeUnits(60)]}
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
        </group>

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 ===== */}

        {/* 상부 프레임 두께 */}
        {topFrameHeightMm > 0 && (
          <group>
            {/* 보조 가이드 연장선 - 하단 (상부 프레임 하단) */}
            <NativeLine
              points={[
                [0, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 상단 (가구 최상단) */}
            <NativeLine
              points={[
                [0, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 수직 치수선 */}
            <NativeLine
              points={[
                [0, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine
              points={[
                [-0.03, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine
              points={[
                [-0.03, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <Text
              position={[0, floatHeight + spaceHeight - topFrameHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)]}
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

        {/* 가구별 섹션 치수 가이드 - 첫 번째 가구만 표시 */}
        {placedModules.slice(0, 1).map((module, moduleIndex) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData || !moduleData.modelConfig?.sections) return null;

          const sections = moduleData.modelConfig.sections;
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

          // 실제 렌더링 높이 계산
          const basicThickness = mmToThreeUnits(18); // 18mm 패널 두께
          const availableHeight = internalHeight; // internalHeight가 이미 내경임

          // 고정 높이 섹션들의 총 높이
          const fixedSections = sections.filter((s: any) => s.heightType === 'absolute');
          const totalFixedHeight = fixedSections.reduce((sum: number, section: any) => {
            return sum + Math.min(mmToThreeUnits(section.height), availableHeight);
          }, 0);

          // 퍼센트 섹션들에게 남은 높이
          const remainingHeight = availableHeight - totalFixedHeight;

          // 각 섹션의 실제 높이 계산 (받침대 + 하판(basicThickness) 위부터 시작)
          let currentY = floatHeight + baseFrameHeight + basicThickness;

          return sections.map((section, sectionIndex) => {
            let sectionHeight: number;
            if (section.heightType === 'absolute') {
              sectionHeight = Math.min(mmToThreeUnits(section.height), availableHeight);
            } else {
              sectionHeight = remainingHeight * (section.height / 100);
            }

            // 상부섹션(마지막)은 가이드선을 짧게 해서 상단 끝에 맞춤
            const isLastSection = sectionIndex === sections.length - 1;

            // Y 오프셋 없음 - 실제 섹션 위치 그대로 사용
            const sectionStartY = currentY;
            const sectionEndY = currentY + sectionHeight;

            // 치수 표시값 계산 (sectionStartY 계산 후에)
            let sectionHeightMm: number;

            // 4단서랍장 여부 확인
            const is4Drawer = moduleData.id?.includes('4drawer-hanging');

            if (isLastSection) {
              // 상부섹션: 가구 최상단부터 하부섹션 끝점(=상부섹션 시작점)까지의 실제 거리
              const topY = floatHeight + baseFrameHeight + internalHeight;
              // sectionStartY는 basicThickness만큼 올라간 상태이므로 원래 위치로 보정
              const bottomY = sectionStartY - basicThickness;
              sectionHeightMm = (topY - bottomY) / 0.01;
            } else if (sectionIndex === 0) {
              // 하부섹션: 치수선이 그려지는 실제 거리 (받침대 위 ~ sectionEndY - basicThickness)
              const lineStart = floatHeight + baseFrameHeight;
              const lineEnd = sectionEndY - basicThickness;
              sectionHeightMm = (lineEnd - lineStart) / 0.01;
            } else {
              // 중간 섹션: 섹션 자체 높이
              sectionHeightMm = sectionHeight / 0.01;
            }

            currentY = sectionEndY; // 다음 섹션 위치

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
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                    [0,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight + (is4Drawer ? basicThickness : 0)) :
                      sectionIndex === 0 ? (sectionEndY - (is4Drawer ? basicThickness : 0)) : sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                    [0,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight + (is4Drawer ? basicThickness : 0)) :
                      sectionIndex === 0 ? (sectionEndY - (is4Drawer ? basicThickness : 0)) : sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
                      sectionIndex === 0 ? (floatHeight + baseFrameHeight) :
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [0,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight + (is4Drawer ? basicThickness : 0)) :
                      sectionIndex === 0 ? (sectionEndY - (is4Drawer ? basicThickness : 0)) :
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [0 + 0.03,
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight + (is4Drawer ? basicThickness : 0)) :
                      sectionIndex === 0 ? (sectionEndY - (is4Drawer ? basicThickness : 0)) :
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [0 + 0.03,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight + (is4Drawer ? basicThickness : 0)) :
                      sectionIndex === 0 ? (sectionEndY - (is4Drawer ? basicThickness : 0)) :
                      sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)
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
                    isLastSection ? (floatHeight + baseFrameHeight + internalHeight + (is4Drawer ? basicThickness : 0)) :
                    sectionIndex === 0 ? (sectionEndY - (is4Drawer ? basicThickness : 0)) :
                    sectionEndY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)
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
                    (() => {
                      if (sectionIndex === 0) {
                        // 하부섹션: 받침대 위부터 sectionEndY까지
                        return (floatHeight + baseFrameHeight + sectionEndY) / 2;
                      } else if (isLastSection) {
                        // 상부섹션: 가구 최상단부터 하부섹션 끝까지
                        const lineStart = floatHeight + baseFrameHeight + internalHeight;
                        return (lineStart + sectionStartY) / 2;
                      } else {
                        // 중간 섹션
                        return (sectionStartY + sectionEndY) / 2;
                      }
                    })(),
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)
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

                {/* 선반 섹션인 경우 각 칸의 내경 높이 표시 */}
                {(() => {
                  // 디버깅: 섹션 정보 출력
                  console.log('🔍 CADDimensions2D 섹션 체크:', {
                    sectionIndex,
                    type: section.type,
                    hasShelfPositions: !!section.shelfPositions,
                    shelfPositions: section.shelfPositions,
                    isLastSection
                  });

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
                    // isLastSection이면 가구 최상단(floatHeight + baseFrameHeight + internalHeight)
                    // 아니면 sectionEndY
                    const sectionTopY = isLastSection ? (floatHeight + baseFrameHeight + internalHeight) : sectionEndY;

                    // 섹션 상단에서 상단판(basicThickness) 2개 두께를 뺀 위치가 내부 상단
                    const topFrameBottomY = sectionTopY - basicThickness;
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
                  const textX = 0 - indexing.columnWidth / 2 - mmToThreeUnits(100);

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
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 끝 (받침대 상단) */}
            <NativeLine
              points={[
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 치수선 */}
            <NativeLine
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine
              points={[
                [-0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 엔드포인트 - 바닥 모서리 */}
            <mesh
              position={[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 엔드포인트 - 받침대 상단 모서리 */}
            <mesh
              position={[0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 치수 텍스트 */}
            <Text
              position={[0, (floatHeight + baseFrameHeight) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)]}
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

        {/* ===== 가구별 내경 치수 (정면뷰 치수를 90도 회전) ===== */}
        {(() => {
          const furnitureDimensions = calculateFurnitureDimensions(placedModules, spaceInfo);

          return furnitureDimensions.map((furnitureDim, index) => {
            const { module, innerWidth, innerHeight, innerDepth, isMultiSection, sections } = furnitureDim;

            // 가구 위치 계산
            const indexing = calculateSpaceIndexing(spaceInfo);
            const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;

            // Z축 중앙 위치 (가구 측면의 중앙)
            const panelDepthMm = spaceInfo.depth || 1500;
            const panelDepth = mmToThreeUnits(panelDepthMm);
            const furnitureDepthMm = module.customDepth || furnitureDim.moduleData.dimensions.depth || 600;
            const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
            const doorThickness = mmToThreeUnits(20);
            const zOffset = -panelDepth / 2;
            const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
            const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness;

            // 내경 치수 표시 (정면뷰의 가로 치수가 좌측뷰에서는 깊이가 됨)
            const innerWidthMm = innerWidth;
            const innerDepthMm = innerDepth;
            const innerWidthThree = mmToThreeUnits(innerWidthMm);

            if (isMultiSection && sections) {
              // 멀티 섹션 가구: 각 섹션별로 내경 높이 표시
              return sections.map(section => {
                const sectionCenterY = mmToThreeUnits(section.startY + section.height / 2);
                const innerHeightMm = section.innerHeight;

                return (
                  <group key={`furniture-inner-${module.id || index}-section-${section.index}`}>
                    {/* 내경 너비 텍스트 (수평) - 가구 측면 중앙에 표시 */}
                    <Text
                      position={[0, sectionCenterY, furnitureZ]}
                      fontSize={largeFontSize}
                      color="#FF6B6B" // 내경 치수는 붉은색으로 구분
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={100002}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      W{Math.round(innerWidthMm)}
                    </Text>

                    {/* 내경 높이 텍스트 (수직) */}
                    <Text
                      position={[0, sectionCenterY + mmToThreeUnits(80), furnitureZ]}
                      fontSize={smallFontSize}
                      color="#FF6B6B"
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={100002}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      H{Math.round(innerHeightMm)}
                    </Text>

                    {/* 내경 깊이 텍스트 */}
                    <Text
                      position={[0, sectionCenterY - mmToThreeUnits(80), furnitureZ]}
                      fontSize={smallFontSize}
                      color="#FF6B6B"
                      anchorX="center"
                      anchorY="middle"
                      renderOrder={100002}
                      depthTest={false}
                      rotation={[0, Math.PI / 2, 0]}
                    >
                      D{Math.round(innerDepthMm)}
                    </Text>
                  </group>
                );
              });
            } else {
              // 단일 섹션 가구
              const furnitureCenterY = floatHeight + baseFrameHeight + mmToThreeUnits(furnitureDim.actualHeight) / 2;
              const innerHeightMm = innerHeight;

              return (
                <group key={`furniture-inner-${module.id || index}`}>
                  {/* 내경 너비 텍스트 (수평) - 가구 측면 중앙에 표시 */}
                  <Text
                    position={[0, furnitureCenterY, furnitureZ]}
                    fontSize={largeFontSize}
                    color="#FF6B6B" // 내경 치수는 붉은색으로 구분
                    anchorX="center"
                    anchorY="middle"
                    renderOrder={100002}
                    depthTest={false}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    W{Math.round(innerWidthMm)}
                  </Text>

                  {/* 내경 높이 텍스트 (수직) */}
                  <Text
                    position={[0, furnitureCenterY + mmToThreeUnits(80), furnitureZ]}
                    fontSize={smallFontSize}
                    color="#FF6B6B"
                    anchorX="center"
                    anchorY="middle"
                    renderOrder={100002}
                    depthTest={false}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    H{Math.round(innerHeightMm)}
                  </Text>

                  {/* 내경 깊이 텍스트 */}
                  <Text
                    position={[0, furnitureCenterY - mmToThreeUnits(80), furnitureZ]}
                    fontSize={smallFontSize}
                    color="#FF6B6B"
                    anchorX="center"
                    anchorY="middle"
                    renderOrder={100002}
                    depthTest={false}
                    rotation={[0, Math.PI / 2, 0]}
                  >
                    D{Math.round(innerDepthMm)}
                  </Text>
                </group>
              );
            }
          });
        })()}

        {/* ===== 가구별 깊이 치수 ===== */}
        {placedModules.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          const customDepth = module.customDepth || moduleData.dimensions.depth;
          const moduleDepth = mmToThreeUnits(customDepth);

          // 가구 위치 계산 (FurnitureItem.tsx와 동일)
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = floatHeight + baseFrameHeight + internalHeight + mmToThreeUnits(200); // 가구 상단 + 200mm

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
                  [0, floatHeight + baseFrameHeight + internalHeight, furnitureZ + moduleDepth/2],
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
                  [0, floatHeight + baseFrameHeight + internalHeight, furnitureZ - moduleDepth/2],
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
        {/* ===== 왼쪽: 전체 높이 치수 ===== */}
        <group>
          {/* 보조 가이드 연장선 - 하단 */}
          <NativeLine
            points={[
              [0, floatHeight, -spaceDepth/2],
              [0, floatHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 보조 가이드 연장선 - 상단 */}
          <NativeLine
            points={[
              [0, floatHeight + spaceHeight, -spaceDepth/2],
              [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={1}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 수직 치수선 */}
          <NativeLine
            points={[
              [0, floatHeight, -spaceDepth/2 - leftDimOffset],
              [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 상단 티크 */}
          <NativeLine
            points={[
              [-0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset],
              [0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 하단 티크 */}
          <NativeLine
            points={[
              [-0.03, floatHeight, -spaceDepth/2 - leftDimOffset],
              [0.03, floatHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColor}
            lineWidth={2}
            renderOrder={100000}
            depthTest={false}
          />

          {/* 엔드포인트 - 상단 */}
          <mesh position={[0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 엔드포인트 - 하단 */}
          <mesh position={[0, floatHeight, -spaceDepth/2 - leftDimOffset]} renderOrder={100001} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.06, 16]} />
            <meshBasicMaterial color={dimensionColor} depthTest={false} />
          </mesh>

          {/* 높이 텍스트 */}
          <Text
            position={[0, floatHeight + spaceHeight / 2, -spaceDepth/2 - leftDimOffset - mmToThreeUnits(60)]}
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
        </group>

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 (좌측뷰 line 172-857과 동일, rotation만 대칭) ===== */}

        {/* 상부 프레임 두께 */}
        {topFrameHeightMm > 0 && (
          <group>
            {/* 보조 가이드 연장선 - 하단 (상부 프레임 하단) */}
            <NativeLine
              points={[
                [0, floatHeight + spaceHeight - topFrameHeight, -spaceDepth/2],
                [0, floatHeight + spaceHeight - topFrameHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 보조 가이드 연장선 - 상단 (가구 최상단) */}
            <NativeLine
              points={[
                [0, floatHeight + spaceHeight, -spaceDepth/2],
                [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 수직 치수선 */}
            <NativeLine
              points={[
                [0, floatHeight + spaceHeight - topFrameHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)],
                [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 하단 */}
            <NativeLine
              points={[
                [-0.03, floatHeight + spaceHeight - topFrameHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)],
                [0.03, floatHeight + spaceHeight - topFrameHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 티크 마크 - 상단 */}
            <NativeLine
              points={[
                [-0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)],
                [0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <Text
              position={[0, floatHeight + spaceHeight - topFrameHeight / 2, -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500) + mmToThreeUnits(60)]}
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

        {/* 가구별 섹션 치수 가이드 - 첫 번째 가구만 표시 */}
        {placedModules.slice(0, 1).map((module, moduleIndex) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData || !moduleData.modelConfig?.sections) return null;

          const sections = moduleData.modelConfig.sections;
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

          // 실제 렌더링 높이 계산
          const basicThickness = mmToThreeUnits(18);
          const availableHeight = internalHeight;

          // 고정 높이 섹션들의 총 높이
          const fixedSections = sections.filter((s: any) => s.heightType === 'absolute');
          const totalFixedHeight = fixedSections.reduce((sum: number, section: any) => {
            return sum + Math.min(mmToThreeUnits(section.height), availableHeight);
          }, 0);

          // 퍼센트 섹션들에게 남은 높이
          const remainingHeight = availableHeight - totalFixedHeight;

          // 각 섹션의 실제 높이 계산
          let currentY = floatHeight + baseFrameHeight + basicThickness;

          return sections.map((section, sectionIndex) => {
            let sectionHeight: number;
            if (section.heightType === 'absolute') {
              sectionHeight = Math.min(mmToThreeUnits(section.height), availableHeight);
            } else {
              sectionHeight = remainingHeight * (section.height / 100);
            }

            const isLastSection = sectionIndex === sections.length - 1;
            const sectionStartY = currentY;
            const sectionEndY = currentY + sectionHeight;

            let sectionHeightMm: number;
            if (isLastSection) {
              const topY = floatHeight + baseFrameHeight + internalHeight;
              const bottomY = sectionStartY - basicThickness;
              sectionHeightMm = (topY - bottomY) / 0.01;
            } else if (sectionIndex === 0) {
              // 하부섹션: 치수선이 그려지는 실제 거리 (받침대 위 ~ sectionEndY - basicThickness)
              const lineStart = floatHeight + baseFrameHeight;
              const lineEnd = sectionEndY - basicThickness;
              sectionHeightMm = (lineEnd - lineStart) / 0.01;
            } else {
              sectionHeightMm = sectionHeight / 0.01;
            }

            currentY = sectionEndY;
            const shouldRenderStartGuide = sectionIndex !== 0;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {/* 보조 가이드 연장선 - 시작 */}
                {shouldRenderStartGuide && (
                <NativeLine
                  points={[
                    [0,
                      sectionStartY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500) + mmToThreeUnits(400)],
                    [0,
                      sectionStartY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                {/* 보조 가이드 연장선 - 끝 */}
                <NativeLine
                  points={[
                    [0,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                      sectionIndex === 0 ? sectionEndY : sectionEndY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500) + mmToThreeUnits(400)],
                    [0,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                      sectionIndex === 0 ? sectionEndY : sectionEndY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
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
                      sectionIndex === 0 ? (floatHeight + baseFrameHeight) :
                      sectionStartY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)],
                    [0,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                      sectionIndex === 0 ? sectionEndY :
                      sectionEndY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
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
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)],
                    [0 + 0.03,
                      sectionStartY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
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
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                      sectionIndex === 0 ? sectionEndY :
                      sectionEndY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)],
                    [0 + 0.03,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                      sectionIndex === 0 ? sectionEndY :
                      sectionEndY,
                      -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)]
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
                    -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)
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
                    isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                    sectionIndex === 0 ? sectionEndY :
                    sectionEndY,
                    -spaceDepth/2 - leftDimOffset + mmToThreeUnits(500)
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
                    (() => {
                      if (sectionIndex === 0) {
                        return (floatHeight + baseFrameHeight + sectionEndY) / 2;
                      } else if (isLastSection) {
                        const lineStart = floatHeight + baseFrameHeight + internalHeight;
                        return (lineStart + sectionStartY) / 2;
                      } else {
                        return (sectionStartY + sectionEndY) / 2;
                      }
                    })(),
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)
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

                {/* 선반 섹션인 경우 각 칸의 내경 높이 표시 */}
                {(() => {
                  if ((section.type !== 'shelf' && section.type !== 'hanging') || !section.shelfPositions || section.shelfPositions.length === 0) {
                    return null;
                  }

                  const compartmentHeights: Array<{ height: number; centerY: number; heightMm: number }> = [];
                  const shelfPositions = section.shelfPositions;

                  // 첫 번째 칸
                  if (shelfPositions.length > 0) {
                    if (shelfPositions[0] === 0) {
                      // 바닥판은 표시 안 함
                    } else {
                      const firstShelfBottomMm = shelfPositions[0] - basicThickness / 0.01 / 2;
                      const height = mmToThreeUnits(firstShelfBottomMm);
                      const centerY = sectionStartY + height / 2;
                      compartmentHeights.push({ height, centerY, heightMm: firstShelfBottomMm });
                    }
                  }

                  // 중간 칸들
                  for (let i = 0; i < shelfPositions.length - 1; i++) {
                    const currentShelfTopMm = shelfPositions[i] + basicThickness / 0.01 / 2;
                    const nextShelfBottomMm = shelfPositions[i + 1] - basicThickness / 0.01 / 2;
                    const heightMm = nextShelfBottomMm - currentShelfTopMm;
                    const height = mmToThreeUnits(heightMm);
                    const centerY = sectionStartY + mmToThreeUnits(currentShelfTopMm + heightMm / 2);
                    compartmentHeights.push({ height, centerY, heightMm });
                  }

                  // 마지막 칸
                  if (shelfPositions.length > 0) {
                    const lastShelfPos = shelfPositions[shelfPositions.length - 1];
                    const lastShelfTopMm = lastShelfPos + basicThickness / 0.01 / 2;

                    // 섹션 상단 Y 위치 계산 (좌측뷰와 동일)
                    const sectionTopY = isLastSection ? (floatHeight + baseFrameHeight + internalHeight) : sectionEndY;

                    // 섹션 상단에서 상단판(basicThickness) 2개 두께를 뺀 위치가 내부 상단
                    const topFrameBottomY = sectionTopY - basicThickness;
                    const topFrameBottomMm = (topFrameBottomY - sectionStartY) / 0.01;

                    const heightMm = topFrameBottomMm - lastShelfTopMm;
                    const height = mmToThreeUnits(heightMm);
                    const centerY = sectionStartY + mmToThreeUnits(lastShelfTopMm + heightMm / 2);
                    compartmentHeights.push({ height, centerY, heightMm });
                  }

                  return compartmentHeights.map((compartment, compartmentIndex) => {
                    const compartmentBottom = compartment.centerY - compartment.height / 2;
                    const compartmentTop = compartment.centerY + compartment.height / 2;

                    // X 위치: 가구 박스 왼쪽 안쪽 (우측뷰도 동일)
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
                          rotation={[0, Math.PI / 2, Math.PI / 2]}
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

                  let drawerY = sectionStartY + mmToThreeUnits(drawerGap);
                  for (let i = 0; i < drawerIndex; i++) {
                    drawerY += mmToThreeUnits(section.drawerHeights![i] + drawerGap);
                  }
                  drawerY += mmToThreeUnits(drawerHeight / 2);

                  const textZ = furnitureZ;
                  const textX = 0 - indexing.columnWidth / 2 - mmToThreeUnits(100);

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
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [-0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [-0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <mesh
              position={[0, 0, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]}
              renderOrder={100001}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            <mesh
              position={[0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]}
              renderOrder={100001}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.06, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            <Text
              position={[0, (floatHeight + baseFrameHeight) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)]}
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

        {/* 가구별 깊이 치수 */}
        {placedModules.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          const customDepth = module.customDepth || moduleData.dimensions.depth;
          const moduleDepth = mmToThreeUnits(customDepth);

          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureTopY = floatHeight + baseFrameHeight + internalHeight + mmToThreeUnits(200);

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
                  [0, floatHeight + baseFrameHeight + internalHeight, furnitureZ + moduleDepth/2],
                  [0, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              <NativeLine
                points={[
                  [0, floatHeight + baseFrameHeight + internalHeight, furnitureZ - moduleDepth/2],
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

              <mesh position={[0, floatHeight + baseFrameHeight + internalHeight, furnitureZ + moduleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              <mesh position={[0, floatHeight + baseFrameHeight + internalHeight, furnitureZ - moduleDepth/2]} renderOrder={100001} rotation={[0, Math.PI / 2, 0]}>
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
            </group>
          );
        })}
      </group>
    );
  }

  return null;
};

export default CADDimensions2D;
