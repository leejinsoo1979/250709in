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
            if (isLastSection) {
              // 상부섹션: 가구 최상단부터 하부섹션 끝점(=상부섹션 시작점)까지의 실제 거리
              const topY = floatHeight + baseFrameHeight + internalHeight;
              // sectionStartY는 basicThickness만큼 올라간 상태이므로 원래 위치로 보정
              const bottomY = sectionStartY - basicThickness;
              sectionHeightMm = (topY - bottomY) / 0.01;
            } else {
              // 하부섹션 및 기타: 섹션 자체 높이
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
                    [slotX, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                    [slotX, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
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
                    [slotX,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) : sectionEndY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) - mmToThreeUnits(400)],
                    [slotX,
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) : sectionEndY,
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
                    [slotX,
                      sectionIndex === 0 ? (floatHeight + baseFrameHeight) :
                      isLastSection ? (floatHeight + baseFrameHeight + internalHeight) :
                      sectionStartY,
                      spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [slotX,
                      isLastSection ? sectionStartY : sectionEndY,
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
                    [slotX - 0.03, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [slotX + 0.03, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                )}
                <NativeLine
                  points={[
                    [slotX - 0.03, isLastSection ? (sectionEndY - mmToThreeUnits(75)) : sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)],
                    [slotX + 0.03, isLastSection ? (sectionEndY - mmToThreeUnits(75)) : sectionEndY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]
                  ]}
                  color={dimensionColor}
                  lineWidth={2}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 엔드포인트 - 시작 모서리 */}
                {shouldRenderStartGuide && (
                <mesh
                  position={[slotX, sectionStartY, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]}
                  renderOrder={100001}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.015, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>
                )}

                {/* 엔드포인트 - 끝 모서리 */}
                <mesh
                  position={[
                    slotX,
                    isLastSection ? (floatHeight + baseFrameHeight + internalHeight) : sectionEndY,
                    spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)
                  ]}
                  renderOrder={100001}
                  rotation={[0, -Math.PI / 2, 0]}
                >
                  <circleGeometry args={[0.015, 16]} />
                  <meshBasicMaterial color={dimensionColor} depthTest={false} />
                </mesh>

                {/* 치수 텍스트 */}
                <Text
                  position={[
                    slotX,
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
                  fontSize={mmToThreeUnits(25)}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={1000}
                  depthTest={false}
                  rotation={[0, -Math.PI / 2, Math.PI / 2]}
                >
                  {Math.round(sectionHeightMm)}
                </Text>
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
              <circleGeometry args={[0.015, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 엔드포인트 - 받침대 상단 모서리 */}
            <mesh
              position={[0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500)]}
              renderOrder={100001}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.015, 16]} />
              <meshBasicMaterial color={dimensionColor} depthTest={false} />
            </mesh>

            {/* 치수 텍스트 */}
            <Text
              position={[0, (floatHeight + baseFrameHeight) / 2, spaceDepth/2 + rightDimOffset - mmToThreeUnits(500) + mmToThreeUnits(60)]}
              fontSize={smallFontSize}
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
                  [slotX, floatHeight + baseFrameHeight + internalHeight, furnitureZ + moduleDepth/2],
                  [slotX, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 보조 가이드 연장선 - 뒤쪽 */}
              <NativeLine
                points={[
                  [slotX, floatHeight + baseFrameHeight + internalHeight, furnitureZ - moduleDepth/2],
                  [slotX, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 가구 깊이 치수선 */}
              <NativeLine
                points={[
                  [slotX, furnitureTopY, furnitureZ - moduleDepth/2],
                  [slotX, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 앞쪽 티크 */}
              <NativeLine
                points={[
                  [slotX - 0.02, furnitureTopY, furnitureZ + moduleDepth/2],
                  [slotX + 0.02, furnitureTopY, furnitureZ + moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 뒤쪽 티크 */}
              <NativeLine
                points={[
                  [slotX - 0.02, furnitureTopY, furnitureZ - moduleDepth/2],
                  [slotX + 0.02, furnitureTopY, furnitureZ - moduleDepth/2]
                ]}
                color={dimensionColor}
                lineWidth={1.5}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 엔드포인트 - 치수선 앞쪽 모서리 */}
              <mesh position={[slotX, furnitureTopY, furnitureZ + moduleDepth/2]} renderOrder={100001}>
                <circleGeometry args={[0.015, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 엔드포인트 - 치수선 뒤쪽 모서리 */}
              <mesh position={[slotX, furnitureTopY, furnitureZ - moduleDepth/2]} renderOrder={100001}>
                <circleGeometry args={[0.015, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 엔드포인트 - 보조선 앞쪽 상단 모서리 */}
              <mesh position={[slotX, floatHeight + baseFrameHeight + internalHeight, furnitureZ + moduleDepth/2]} renderOrder={100001}>
                <circleGeometry args={[0.015, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 엔드포인트 - 보조선 뒤쪽 상단 모서리 */}
              <mesh position={[slotX, floatHeight + baseFrameHeight + internalHeight, furnitureZ - moduleDepth/2]} renderOrder={100001}>
                <circleGeometry args={[0.015, 16]} />
                <meshBasicMaterial color={dimensionColor} depthTest={false} />
              </mesh>

              {/* 가구 깊이 텍스트 */}
              <Text
                position={[slotX, furnitureTopY + mmToThreeUnits(80), furnitureZ]}
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
