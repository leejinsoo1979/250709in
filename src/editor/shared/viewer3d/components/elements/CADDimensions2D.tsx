import React from 'react';
import { Line, Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import * as THREE from 'three';

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
  const { view2DDirection, showDimensions: showDimensionsFromStore, showDimensionsText, view2DTheme } = useUIStore();

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  // 2D 도면 치수 색상 설정
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';

  const dimensionColors = {
    primary: dimensionColor,
    furniture: dimensionColor,
    background: view2DTheme === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    text: dimensionColor
  };

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 공간 크기
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  const spaceDepth = mmToThreeUnits(spaceInfo.depth || 1500);

  // 내부 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const internalHeight = mmToThreeUnits(internalSpace.height);

  // 띄워서 배치
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;

  // 프레임 높이
  const topFrameHeightMm = spaceInfo.frameSize?.top || 0;
  const topFrameHeight = mmToThreeUnits(topFrameHeightMm);
  const baseFrameHeightMm = spaceInfo.baseConfig?.frameHeight || 0;
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);

  // showDimensions가 false이면 치수 표시하지 않음
  if (!showDimensions) {
    return null;
  }

  // 측면도(좌/우)가 아니면 렌더링하지 않음
  if (currentViewDirection !== 'left' && currentViewDirection !== 'right') {
    return null;
  }

  // 치수선 오프셋
  const leftDimOffset = mmToThreeUnits(200);   // 왼쪽 치수선 간격
  const rightDimOffset = mmToThreeUnits(200);  // 오른쪽 치수선 간격
  const textOffset = mmToThreeUnits(100);      // 텍스트 추가 간격

  // 좌측뷰인 경우
  if (currentViewDirection === 'left') {
    return (
      <group>
        {/* ===== 왼쪽: 전체 높이 치수 ===== */}
        <group>
          {/* 수직 치수선 */}
          <Line
            points={[
              [0, floatHeight, -spaceDepth/2 - leftDimOffset],
              [0, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]
            ]}
            color={dimensionColors.primary}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />

          {/* 상단 티크 마크 */}
          <Line
            points={[[-0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset], [0.03, floatHeight + spaceHeight, -spaceDepth/2 - leftDimOffset]]}
            color={dimensionColors.primary}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />

          {/* 하단 티크 마크 */}
          <Line
            points={[[-0.03, floatHeight, -spaceDepth/2 - leftDimOffset], [0.03, floatHeight, -spaceDepth/2 - leftDimOffset]]}
            color={dimensionColors.primary}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />

          {/* 높이 텍스트 */}
          {showDimensionsText && (
            <Html
              position={[0, floatHeight + spaceHeight / 2, -spaceDepth/2 - leftDimOffset - textOffset]}
              center
              transform={false}
              occlude={false}
              zIndexRange={[1000, 1001]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  background: dimensionColors.background,
                  color: dimensionColors.text,
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  border: `1.5px solid ${dimensionColors.primary}`,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  userSelect: 'none'
                }}
              >
                {spaceInfo.height}
              </div>
            </Html>
          )}
        </group>

        {/* ===== 오른쪽: 상부프레임/가구높이/받침대 ===== */}

        {/* 상부 프레임 두께 */}
        {topFrameHeightMm > 0 && (
          <group>
            <Line
              points={[[0, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset], [0, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset]]}
              color={dimensionColors.primary}
              lineWidth={1.5}
              renderOrder={999999}
              depthTest={false}
            />
            <Line
              points={[[-0.03, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset], [0.03, floatHeight + spaceHeight - topFrameHeight, spaceDepth/2 + rightDimOffset]]}
              color={dimensionColors.primary}
              lineWidth={1.5}
              renderOrder={999999}
              depthTest={false}
            />
            <Line
              points={[[-0.03, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset], [0.03, floatHeight + spaceHeight, spaceDepth/2 + rightDimOffset]]}
              color={dimensionColors.primary}
              lineWidth={1.5}
              renderOrder={999999}
              depthTest={false}
            />
            {showDimensionsText && (
              <Html
                position={[0, floatHeight + spaceHeight - topFrameHeight / 2, spaceDepth/2 + rightDimOffset + textOffset]}
                center
                transform={false}
                occlude={false}
                zIndexRange={[1000, 1001]}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    background: dimensionColors.background,
                    color: dimensionColors.text,
                    padding: '4px 10px',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    border: `1.5px solid ${dimensionColors.primary}`,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                  }}
                >
                  상판 {topFrameHeightMm}
                </div>
              </Html>
            )}
          </group>
        )}

        {/* 가구 내부 높이 */}
        <group>
          <Line
            points={[[0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset], [0, floatHeight + baseFrameHeight + internalHeight, spaceDepth/2 + rightDimOffset]]}
            color={dimensionColors.furniture}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />
          <Line
            points={[[-0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset], [0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset]]}
            color={dimensionColors.furniture}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />
          <Line
            points={[[-0.03, floatHeight + baseFrameHeight + internalHeight, spaceDepth/2 + rightDimOffset], [0.03, floatHeight + baseFrameHeight + internalHeight, spaceDepth/2 + rightDimOffset]]}
            color={dimensionColors.furniture}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />
          {showDimensionsText && (
            <Html
              position={[0, floatHeight + baseFrameHeight + internalHeight / 2, spaceDepth/2 + rightDimOffset + textOffset]}
              center
              transform={false}
              occlude={false}
              zIndexRange={[1000, 1001]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  background: dimensionColors.background,
                  color: dimensionColors.furniture,
                  padding: '4px 10px',
                  borderRadius: '3px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  border: `1.5px solid ${dimensionColors.furniture}`,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  userSelect: 'none'
                }}
              >
                내부 {internalSpace.height}
              </div>
            </Html>
          )}
        </group>

        {/* 받침대 높이 */}
        {baseFrameHeightMm > 0 && (
          <group>
            <Line
              points={[[0, floatHeight, spaceDepth/2 + rightDimOffset], [0, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset]]}
              color={dimensionColors.primary}
              lineWidth={1.5}
              renderOrder={999999}
              depthTest={false}
            />
            <Line
              points={[[-0.03, floatHeight, spaceDepth/2 + rightDimOffset], [0.03, floatHeight, spaceDepth/2 + rightDimOffset]]}
              color={dimensionColors.primary}
              lineWidth={1.5}
              renderOrder={999999}
              depthTest={false}
            />
            <Line
              points={[[-0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset], [0.03, floatHeight + baseFrameHeight, spaceDepth/2 + rightDimOffset]]}
              color={dimensionColors.primary}
              lineWidth={1.5}
              renderOrder={999999}
              depthTest={false}
            />
            {showDimensionsText && (
              <Html
                position={[0, floatHeight + baseFrameHeight / 2, spaceDepth/2 + rightDimOffset + textOffset]}
                center
                transform={false}
                occlude={false}
                zIndexRange={[1000, 1001]}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    background: dimensionColors.background,
                    color: dimensionColors.text,
                    padding: '4px 10px',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    border: `1.5px solid ${dimensionColors.primary}`,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    userSelect: 'none'
                  }}
                >
                  하판 {baseFrameHeightMm}
                </div>
              </Html>
            )}
          </group>
        )}

        {/* ===== 하단: 전체 깊이 치수 ===== */}
        <group>
          {/* 수평 치수선 */}
          <Line
            points={[[0, floatHeight - mmToThreeUnits(200), -spaceDepth/2], [0, floatHeight - mmToThreeUnits(200), spaceDepth/2]]}
            color={dimensionColors.primary}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />

          {/* 왼쪽 티크 마크 */}
          <Line
            points={[[0, floatHeight - mmToThreeUnits(200) - 0.03, -spaceDepth/2], [0, floatHeight - mmToThreeUnits(200) + 0.03, -spaceDepth/2]]}
            color={dimensionColors.primary}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />

          {/* 오른쪽 티크 마크 */}
          <Line
            points={[[0, floatHeight - mmToThreeUnits(200) - 0.03, spaceDepth/2], [0, floatHeight - mmToThreeUnits(200) + 0.03, spaceDepth/2]]}
            color={dimensionColors.primary}
            lineWidth={1.5}
            renderOrder={999999}
            depthTest={false}
          />

          {/* 깊이 텍스트 */}
          {showDimensionsText && (
            <Html
              position={[0, floatHeight - mmToThreeUnits(300), 0]}
              center
              transform={false}
              occlude={false}
              zIndexRange={[1000, 1001]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  background: dimensionColors.background,
                  color: dimensionColors.text,
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  border: `1.5px solid ${dimensionColors.primary}`,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  userSelect: 'none'
                }}
              >
                {spaceInfo.depth || 1500}
              </div>
            </Html>
          )}
        </group>

        {/* ===== 가구별 깊이 치수 ===== */}
        {placedModules.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          const customDepth = module.customDepth || moduleData.dimensions.depth;
          const furnitureDepth = mmToThreeUnits(customDepth);

          // 가구 위치는 FurnitureItem과 동일하게 계산
          const indexing = calculateSpaceIndexing(spaceInfo);
          const slotX = -spaceWidth / 2 + indexing.columnWidth * module.slotIndex + indexing.columnWidth / 2;
          const furnitureY = floatHeight + baseFrameHeight + internalHeight / 2;

          return (
            <group key={`furniture-depth-${index}`}>
              {/* 가구 깊이 치수선 */}
              <Line
                points={[[slotX, furnitureY, -furnitureDepth/2], [slotX, furnitureY, furnitureDepth/2]]}
                color={dimensionColors.furniture}
                lineWidth={1.5}
                renderOrder={999999}
                depthTest={false}
              />

              {/* 앞쪽 티크 마크 */}
              <Line
                points={[[slotX - 0.02, furnitureY, -furnitureDepth/2], [slotX + 0.02, furnitureY, -furnitureDepth/2]]}
                color={dimensionColors.furniture}
                lineWidth={1.5}
                renderOrder={999999}
                depthTest={false}
              />

              {/* 뒤쪽 티크 마크 */}
              <Line
                points={[[slotX - 0.02, furnitureY, furnitureDepth/2], [slotX + 0.02, furnitureY, furnitureDepth/2]]}
                color={dimensionColors.furniture}
                lineWidth={1.5}
                renderOrder={999999}
                depthTest={false}
              />

              {/* 가구 깊이 텍스트 */}
              {showDimensionsText && (
                <Html
                  position={[slotX, furnitureY - mmToThreeUnits(100), 0]}
                  center
                  transform={false}
                  occlude={false}
                  zIndexRange={[1000, 1001]}
                  style={{ pointerEvents: 'none' }}
                >
                  <div
                    style={{
                      background: dimensionColors.background,
                      color: dimensionColors.furniture,
                      padding: '3px 8px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      border: `1.5px solid ${dimensionColors.furniture}`,
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      userSelect: 'none'
                    }}
                  >
                    {customDepth}
                  </div>
                </Html>
              )}
            </group>
          );
        })}
      </group>
    );
  }

  // 우측뷰는 좌측뷰와 동일하지만 좌우 반전
  return null;
};

export default CADDimensions2D;
