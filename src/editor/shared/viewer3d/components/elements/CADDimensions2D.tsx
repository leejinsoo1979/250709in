import React from 'react';
import { Text } from '@react-three/drei';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';

interface CADDimensions2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
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
  const baseFrameHeightMm = spaceInfo.baseConfig?.frameHeight || 0;
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);

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
              fontSize={smallFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              상판 {topFrameHeightMm}
            </Text>
          </group>
        )}

        {/* 가구별 섹션 치수 가이드 */}
        {placedModules.map((module, moduleIndex) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData || !moduleData.modelConfig?.sections) return null;

          const sections = moduleData.modelConfig.sections;
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;

          // 실제 렌더링 높이 계산 (useBaseFurniture와 동일한 로직)
          const basicThickness = mmToThreeUnits(18); // 18mm 패널 두께
          const availableHeight = internalHeight - basicThickness * 2;

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
            const sectionHeightMm = sectionHeight / 0.01;

            const sectionStartY = currentY;
            const sectionEndY = currentY + sectionHeight;
            currentY = sectionEndY;

            return (
              <group key={`section-${moduleIndex}-${sectionIndex}`}>
                {/* 보조 가이드 연장선 - 시작 */}
                <NativeLine
                  points={[
                    [slotX, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                    [slotX, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 보조 가이드 연장선 - 끝 */}
                <NativeLine
                  points={[
                    [slotX, sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                    [slotX, sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 치수선 */}
                <NativeLine
                  points={[
                    [slotX, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [slotX, sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 티크 마크 */}
                <NativeLine
                  points={[
                    [slotX - 0.03, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [slotX + 0.03, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine
                  points={[
                    [slotX - 0.03, sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [slotX + 0.03, sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 치수 텍스트 */}
                <Text
                  position={[slotX, sectionStartY + sectionHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)]}
                  fontSize={mmToThreeUnits(25)}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={1000}
                  depthTest={false}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  측판높이 {Math.round(sectionHeightMm)}
                </Text>
              </group>
            );
          });
        })}

        {/* 받침대 높이 */}
        {baseFrameHeightMm > 0 && (
        <group>
            {/* 보조 가이드 연장선 - 하단 (바닥) */}
            <NativeLine
              points={[
                [0, floatHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                [0, floatHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 치수선 */}
            <NativeLine
              points={[
                [0, floatHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
              ]}
              color={dimensionColor}
              lineWidth={2}
              renderOrder={100000}
              depthTest={false}
            />
            <NativeLine
              points={[
                [-0.03, floatHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                [0.03, floatHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
            <Text
              position={[0, floatHeight + baseFrameHeight / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)]}
              fontSize={smallFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000}
              depthTest={false}
              rotation={[0, -Math.PI / 2, Math.PI / 2]}
            >
              하판 {baseFrameHeightMm}
            </Text>
        </group>
        )}


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
          const furnitureY = floatHeight + baseFrameHeight + internalHeight / 2;

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
              {/* 가구 깊이 치수선 */}
              <NativeLine
                points={[
                  [slotX, furnitureY, furnitureZ - moduleDepth/2],
                  [slotX, furnitureY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 앞쪽 티크 */}
              <NativeLine
                points={[
                  [slotX - 0.02, furnitureY, furnitureZ + moduleDepth/2],
                  [slotX + 0.02, furnitureY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 뒤쪽 티크 */}
              <NativeLine
                points={[
                  [slotX - 0.02, furnitureY, furnitureZ - moduleDepth/2],
                  [slotX + 0.02, furnitureY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 가구 깊이 텍스트 */}
              <Text
                position={[slotX, furnitureY - mmToThreeUnits(80), furnitureZ]}
                fontSize={mmToThreeUnits(25)}
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

  // 우측뷰는 나중에 구현
  return null;
};

export default CADDimensions2D;
