import React from 'react';
import { Line, Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing, calculateInternalSpace } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { useTheme } from '@/contexts/ThemeContext';
import * as THREE from 'three';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';

interface CADDimensions2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
}

/**
 * CAD 스타일 2D 치수 표기 컴포넌트
 * 각 뷰포트에 맞는 치수 표시를 위해 뷰 방향별로 다른 치수선 제공
 */
const CADDimensions2D: React.FC<CADDimensions2DProps> = ({ viewDirection, showDimensions: showDimensionsProp }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { view2DDirection, showDimensions: showDimensionsFromStore } = useUIStore();
  const { theme } = useTheme();
  
  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;
  
  // CSS 변수에서 실제 테마 색상 가져오기
  const getThemeColorFromCSS = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const computedColor = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName).trim();
      return computedColor || fallback;
    }
    return fallback;
  };

  // 테마 기반 치수 색상 설정
  const primaryColor = getThemeColorFromCSS('--theme-primary', '#10b981');
  const dimensionColors = {
    primary: primaryColor,     // 기본 치수선 (테마 색상)
    furniture: primaryColor,   // 가구 치수선 (테마 색상)
    column: primaryColor,      // 컬럼 치수선 (테마 색상)
    float: primaryColor,       // 띄움 높이 (테마 색상)
    background: theme?.mode === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    text: primaryColor         // 텍스트도 테마 색상
  };
  
  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 공간 크기 (Three.js 단위)
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  
  // 내부 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const internalWidth = mmToThreeUnits(internalSpace.width);
  const internalHeight = mmToThreeUnits(internalSpace.height);
  
  // 띄워서 배치일 때 프레임 하단 위치 계산
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
  
  // 실제 프레임 높이 계산 (띄워서 배치 시 줄어든 높이)
  const actualFrameHeight = spaceHeight - floatHeight;
  
  // 치수선 위치 계산
  const dimensionOffsetY = spaceHeight + mmToThreeUnits(150); // 상단 치수선
  const dimensionOffsetX = -mmToThreeUnits(200); // 좌측 치수선
  const rightDimensionOffsetX = spaceWidth + mmToThreeUnits(200); // 우측 치수선
  
  // 화살표 생성 함수
  const createArrow = (start: THREE.Vector3, end: THREE.Vector3, size = 0.02) => {
    const direction = end.clone().sub(start).normalize();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(size);
    
    return [
      start.clone().add(direction.clone().multiplyScalar(size)).add(perpendicular),
      start.clone(),
      start.clone().add(direction.clone().multiplyScalar(size)).sub(perpendicular)
    ];
  };

  // 정면뷰에서만 치수 표시 (다른 뷰에서는 복잡함 방지)
  // showDimensions가 false이면 치수 표시하지 않음
  if (currentViewDirection !== 'front' || !showDimensions) {
    return null;
  }

  return (
    <group>
      {/* 전체 폭 치수 (상단) */}
      <group>
        {/* 치수선 */}
        <Line
          points={[
            [0, dimensionOffsetY, 0.01],
            [spaceWidth, dimensionOffsetY, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(0, dimensionOffsetY, 0.01),
            new THREE.Vector3(0.05, dimensionOffsetY, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(spaceWidth, dimensionOffsetY, 0.01),
            new THREE.Vector3(spaceWidth - 0.05, dimensionOffsetY, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 치수 텍스트 */}
        <Html
          position={[spaceWidth / 2, dimensionOffsetY + mmToThreeUnits(50), 0.01]}
          center
          transform={false}
          occlude={false}
          zIndexRange={[1000, 1001]}
        >
          <div
            style={{
              background: dimensionColors.background,
              color: dimensionColors.primary,
              padding: '6px 10px',
              borderRadius: '4px',
              fontSize: '18px',
              fontWeight: 'bold',
              border: `1px solid ${dimensionColors.primary}`,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          >
            {spaceInfo.width}mm
          </div>
        </Html>
        
        {/* 좌측 연장선 */}
        <Line
          points={[
            [0, floatHeight, 0.01],
            [0, dimensionOffsetY + mmToThreeUnits(20), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 우측 연장선 */}
        <Line
          points={[
            [spaceWidth, floatHeight, 0.01],
            [spaceWidth, dimensionOffsetY + mmToThreeUnits(20), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 상단 보조 가이드 연장선 (좌측) */}
        <Line
          points={[
            [0, dimensionOffsetY, 0.01],
            [-mmToThreeUnits(50), dimensionOffsetY, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={0.5}
        />
        
        {/* 상단 보조 가이드 연장선 (우측) */}
        <Line
          points={[
            [spaceWidth, dimensionOffsetY, 0.01],
            [spaceWidth + mmToThreeUnits(50), dimensionOffsetY, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={0.5}
        />
      </group>
      
      {/* 내부 공간 폭 치수 (상단 안쪽) */}
      <group>
        {/* 내부 폭 치수선 */}
        <Line
          points={[
            [mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, dimensionOffsetY - mmToThreeUnits(100), 0.01],
            [spaceWidth - mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, dimensionOffsetY - mmToThreeUnits(100), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, dimensionOffsetY - mmToThreeUnits(100), 0.01),
            new THREE.Vector3(mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2 + 0.05, dimensionOffsetY - mmToThreeUnits(100), 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(spaceWidth - mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, dimensionOffsetY - mmToThreeUnits(100), 0.01),
            new THREE.Vector3(spaceWidth - mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2 - 0.05, dimensionOffsetY - mmToThreeUnits(100), 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 내부 폭 텍스트 */}
        <Html
          position={[spaceWidth / 2, dimensionOffsetY - mmToThreeUnits(100) + mmToThreeUnits(50), 0.01]}
          center
          transform={false}
          occlude={false}
          zIndexRange={[1000, 1001]}
        >
          <div
            style={{
              background: dimensionColors.background,
              color: dimensionColors.primary,
              padding: '10px 15px',
              borderRadius: '4px',
              fontSize: '28px',
              fontWeight: 'bold',
              border: `2px solid ${dimensionColors.primary}`,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          >
            {internalSpace.width}mm
          </div>
        </Html>
        
        {/* 좌측 내부 연장선 */}
        <Line
          points={[
            [mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0), 0.01],
            [mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, dimensionOffsetY - mmToThreeUnits(80), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 우측 내부 연장선 */}
        <Line
          points={[
            [spaceWidth - mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0), 0.01],
            [spaceWidth - mmToThreeUnits(spaceInfo.width - internalSpace.width) / 2, dimensionOffsetY - mmToThreeUnits(80), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
      </group>
      
      {/* 전체 높이 치수 (좌측) */}
      <group>
        {/* 치수선 */}
        <Line
          points={[
            [dimensionOffsetX, floatHeight, 0.01],
            [dimensionOffsetX, floatHeight + actualFrameHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(dimensionOffsetX, floatHeight, 0.01),
            new THREE.Vector3(dimensionOffsetX, floatHeight + 0.05, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(dimensionOffsetX, floatHeight + actualFrameHeight, 0.01),
            new THREE.Vector3(dimensionOffsetX, floatHeight + actualFrameHeight - 0.05, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 치수 텍스트 */}
        <Html
          position={[dimensionOffsetX - mmToThreeUnits(80), floatHeight + actualFrameHeight / 2, 0.01]}
          center
          transform={false}
          occlude={false}
          zIndexRange={[1000, 1001]}
        >
          <div
            style={{
              background: dimensionColors.background,
              color: dimensionColors.primary,
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '24px',
              fontWeight: 'bold',
              border: `1px solid ${dimensionColors.primary}`,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
              transform: 'rotate(-90deg)'
            }}
          >
            {Math.round(actualFrameHeight / 0.01)}mm
          </div>
        </Html>
        
        {/* 하단 연장선 */}
        <Line
          points={[
            [0, floatHeight, 0.01],
            [dimensionOffsetX - mmToThreeUnits(20), floatHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 상단 연장선 */}
        <Line
          points={[
            [0, floatHeight + actualFrameHeight, 0.01],
            [dimensionOffsetX - mmToThreeUnits(20), floatHeight + actualFrameHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 좌측 보조 가이드 연장선 (하단) */}
        <Line
          points={[
            [dimensionOffsetX, floatHeight, 0.01],
            [dimensionOffsetX, floatHeight - mmToThreeUnits(50), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={0.5}
        />
        
        {/* 좌측 보조 가이드 연장선 (상단) */}
        <Line
          points={[
            [dimensionOffsetX, floatHeight + actualFrameHeight, 0.01],
            [dimensionOffsetX, floatHeight + actualFrameHeight + mmToThreeUnits(50), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={0.5}
        />
      </group>
      
      {/* 우측 높이 치수 */}
      <group>
        {/* 치수선 */}
        <Line
          points={[
            [rightDimensionOffsetX, floatHeight, 0.01],
            [rightDimensionOffsetX, floatHeight + actualFrameHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(rightDimensionOffsetX, floatHeight, 0.01),
            new THREE.Vector3(rightDimensionOffsetX, floatHeight + 0.05, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(rightDimensionOffsetX, floatHeight + actualFrameHeight, 0.01),
            new THREE.Vector3(rightDimensionOffsetX, floatHeight + actualFrameHeight - 0.05, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 치수 텍스트 */}
        <Html
          position={[rightDimensionOffsetX + mmToThreeUnits(80), floatHeight + actualFrameHeight / 2, 0.01]}
          center
          transform={false}
          occlude={false}
          zIndexRange={[1000, 1001]}
        >
          <div
            style={{
              background: dimensionColors.background,
              color: dimensionColors.primary,
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '24px',
              fontWeight: 'bold',
              border: `1px solid ${dimensionColors.primary}`,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
              transform: 'rotate(90deg)'
            }}
          >
            {Math.round(actualFrameHeight / 0.01)}mm
          </div>
        </Html>
        
        {/* 하단 연장선 */}
        <Line
          points={[
            [spaceWidth, floatHeight, 0.01],
            [rightDimensionOffsetX + mmToThreeUnits(20), floatHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 상단 연장선 */}
        <Line
          points={[
            [spaceWidth, floatHeight + actualFrameHeight, 0.01],
            [rightDimensionOffsetX + mmToThreeUnits(20), floatHeight + actualFrameHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 우측 보조 가이드 연장선 (하단) */}
        <Line
          points={[
            [rightDimensionOffsetX, floatHeight, 0.01],
            [rightDimensionOffsetX, floatHeight - mmToThreeUnits(50), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={0.5}
        />
        
        {/* 우측 보조 가이드 연장선 (상단) */}
        <Line
          points={[
            [rightDimensionOffsetX, floatHeight + actualFrameHeight, 0.01],
            [rightDimensionOffsetX, floatHeight + actualFrameHeight + mmToThreeUnits(50), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={0.5}
        />
      </group>
      
      {/* 내부 공간 높이 치수 (좌측 안쪽) */}
      <group>
        {/* 내부 높이 치수선 */}
        <Line
          points={[
            [dimensionOffsetX + mmToThreeUnits(150), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0), 0.01],
            [dimensionOffsetX + mmToThreeUnits(150), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + internalHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(dimensionOffsetX + mmToThreeUnits(150), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0), 0.01),
            new THREE.Vector3(dimensionOffsetX + mmToThreeUnits(150), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + 0.05, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(dimensionOffsetX + mmToThreeUnits(150), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + internalHeight, 0.01),
            new THREE.Vector3(dimensionOffsetX + mmToThreeUnits(150), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + internalHeight - 0.05, 0.01)
          )}
          color={dimensionColors.primary}
          lineWidth={2}
        />
        
        {/* 내부 높이 텍스트 */}
        <Html
          position={[dimensionOffsetX + mmToThreeUnits(150) - mmToThreeUnits(80), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + internalHeight / 2, 0.01]}
          center
          transform={false}
          occlude={false}
          zIndexRange={[1000, 1001]}
        >
          <div
            style={{
              background: dimensionColors.background,
              color: dimensionColors.primary,
              padding: '10px 15px',
              borderRadius: '4px',
              fontSize: '28px',
              fontWeight: 'bold',
              border: `2px solid ${dimensionColors.primary}`,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
              transform: 'rotate(-90deg)'
            }}
          >
            {Math.round(internalHeight / 0.01)}mm
          </div>
        </Html>
        
        {/* 내부 하단 연장선 */}
        <Line
          points={[
            [0, floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0), 0.01],
            [dimensionOffsetX + mmToThreeUnits(170), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0), 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
        
        {/* 내부 상단 연장선 */}
        <Line
          points={[
            [0, floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + internalHeight, 0.01],
            [dimensionOffsetX + mmToThreeUnits(170), floatHeight + mmToThreeUnits(spaceInfo.baseConfig?.frameHeight || 0) + internalHeight, 0.01]
          ]}
          color={dimensionColors.primary}
          lineWidth={1}
          dashed={false}
        />
      </group>
      
      {/* 우측 띄움 높이 치수 (띄워서 배치일 때만 표시) */}
      {isFloating && floatHeight > 0 && (
        <group>
          {/* 띄움 높이 치수선 */}
          <Line
            points={[
              [rightDimensionOffsetX + mmToThreeUnits(100), 0, 0.01],
              [rightDimensionOffsetX + mmToThreeUnits(100), floatHeight, 0.01]
            ]}
            color={dimensionColors.float}
            lineWidth={2}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrow(
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), 0, 0.01),
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), 0.05, 0.01)
            )}
            color={dimensionColors.float}
            lineWidth={2}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrow(
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), floatHeight, 0.01),
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), floatHeight - 0.05, 0.01)
            )}
            color={dimensionColors.float}
            lineWidth={2}
          />
          
          {/* 띄움 높이 텍스트 */}
          <Html
            position={[rightDimensionOffsetX + mmToThreeUnits(180), floatHeight / 2, 0.01]}
            center
            transform={false}
            occlude={false}
            zIndexRange={[1000, 1001]}
          >
            <div
              style={{
                background: dimensionColors.background,
                color: dimensionColors.float,
                padding: '6px 10px',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: 'bold',
                border: `1px solid ${dimensionColors.float}`,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                pointerEvents: 'none',
                transform: 'rotate(90deg)'
              }}
            >
              띄움 {Math.round(floatHeight / 0.01)}mm
            </div>
          </Html>
          
          {/* 하단 연장선 (바닥) */}
          <Line
            points={[
              [spaceWidth, 0, 0.01],
              [rightDimensionOffsetX + mmToThreeUnits(120), 0, 0.01]
            ]}
            color={dimensionColors.float}
            lineWidth={1}
            dashed={false}
          />
          
          {/* 상단 연장선 (프레임 하단) */}
          <Line
            points={[
              [spaceWidth, floatHeight, 0.01],
              [rightDimensionOffsetX + mmToThreeUnits(120), floatHeight, 0.01]
            ]}
            color={dimensionColors.float}
            lineWidth={1}
            dashed={false}
          />
        </group>
      )}
      
      {/* 배치된 가구 치수 */}
      {placedModules.map((module, index) => {
        const internalSpace = calculateInternalSpace(spaceInfo);
        const moduleData = getModuleById(
          module.moduleId,
          internalSpace,
          spaceInfo
        );
        
        if (!moduleData) return null;
        
        // 기둥 슬롯 분석
        const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
        const slotInfo = module.slotIndex !== undefined ? columnSlots[module.slotIndex] : undefined;
        const indexing = calculateSpaceIndexing(spaceInfo);
        
        // 실제 렌더링될 가구 폭과 위치 계산 (FurnitureItem.tsx와 동일한 로직)
        let furnitureWidthMm = moduleData.dimensions.width;
        let furniturePositionX = module.position.x;
        
        if (slotInfo && slotInfo.hasColumn) {
          // 듀얼 가구인지 확인
          const isDualFurniture = Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
          const originalSlotWidthMm = isDualFurniture ? (indexing.columnWidth * 2) : indexing.columnWidth;
          
          // 슬롯 중심 위치 계산
          let originalSlotCenterX: number;
          if (module.slotIndex !== undefined && indexing.threeUnitPositions[module.slotIndex] !== undefined) {
            originalSlotCenterX = indexing.threeUnitPositions[module.slotIndex];
          } else {
            originalSlotCenterX = module.position.x;
          }
          
          // 슬롯 경계 계산
          const slotWidthM = indexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: originalSlotCenterX - slotWidthM / 2,
            right: originalSlotCenterX + slotWidthM / 2,
            center: originalSlotCenterX
          };
          
          // 가구 경계 계산
          const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
          furnitureWidthMm = furnitureBounds.renderWidth;
          furniturePositionX = furnitureBounds.center;
        }
        
        // adjustedPosition이 있으면 우선 사용
        if (module.adjustedPosition) {
          furniturePositionX = module.adjustedPosition.x;
        }
        if (module.adjustedWidth) {
          furnitureWidthMm = module.adjustedWidth;
        }
        
        const moduleWidth = mmToThreeUnits(furnitureWidthMm);
        const leftX = furniturePositionX - moduleWidth / 2;
        const rightX = furniturePositionX + moduleWidth / 2;
        const dimY = -mmToThreeUnits(100); // 하단 치수선
        
        // 가구의 상단 Y 좌표 계산
        const furnitureTopY = floatHeight + mmToThreeUnits(moduleData.dimensions.height);
        
        return (
          <group key={`module-dim-${index}`}>
            {/* 치수선 */}
            <Line
              points={[
                [leftX, dimY, 0.01],
                [rightX, dimY, 0.01]
              ]}
              color={dimensionColors.furniture}
              lineWidth={2}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrow(
                new THREE.Vector3(leftX, dimY, 0.01),
                new THREE.Vector3(leftX + 0.03, dimY, 0.01),
                0.015
              )}
              color={dimensionColors.furniture}
              lineWidth={2}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrow(
                new THREE.Vector3(rightX, dimY, 0.01),
                new THREE.Vector3(rightX - 0.03, dimY, 0.01),
                0.015
              )}
              color={dimensionColors.furniture}
              lineWidth={2}
            />
            
            {/* 치수 텍스트 */}
            <Html
              position={[furniturePositionX, dimY - mmToThreeUnits(40), 0.01]}
              center
              transform={false}
              occlude={false}
              zIndexRange={[1000, 1001]}
            >
              <div
                style={{
                  background: dimensionColors.background,
                  color: dimensionColors.furniture,
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  border: `1px solid ${dimensionColors.furniture}`,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              >
                {furnitureWidthMm}mm
              </div>
            </Html>
            
            {/* 위쪽 연장선 - 가구 상단에서 위쪽 외부 영역으로 */}
            <Line
              points={[
                [leftX, furnitureTopY, 0.01],
                [leftX, furnitureTopY + mmToThreeUnits(30), 0.01]
              ]}
              color={dimensionColors.furniture}
              lineWidth={1}
              dashed={false}
            />
            <Line
              points={[
                [rightX, furnitureTopY, 0.01],
                [rightX, furnitureTopY + mmToThreeUnits(30), 0.01]
              ]}
              color={dimensionColors.furniture}
              lineWidth={1}
              dashed={false}
            />
            {/* 아래쪽 연장선 - 가구 하단에서 아래쪽 외부 영역으로 */}
            <Line
              points={[
                [leftX, floatHeight, 0.01],
                [leftX, dimY + mmToThreeUnits(20), 0.01]
              ]}
              color={dimensionColors.furniture}
              lineWidth={1}
              dashed={false}
            />
            <Line
              points={[
                [rightX, floatHeight, 0.01],
                [rightX, dimY + mmToThreeUnits(20), 0.01]
              ]}
              color={dimensionColors.furniture}
              lineWidth={1}
              dashed={false}
            />
          </group>
        );
      })}
      
      
      {/* 컬럼 치수 표시 */}
      {(() => {
        const indexing = calculateSpaceIndexing(spaceInfo);
        if (indexing.columnCount <= 1) return null;
        // columnCount가 1(싱글 캐비닛)일 때는 분할선/치수 분절을 모두 렌더링하지 않음
        return indexing.threeUnitBoundaries.slice(0, -1).map((leftX, index) => {
          const rightX = indexing.threeUnitBoundaries[index + 1];
          const columnWidth = (rightX - leftX) / 0.01; // Three.js 단위를 mm로 변환
          const centerX = (leftX + rightX) / 2;
          const dimY = spaceHeight + mmToThreeUnits(80); // 중간 높이 치수선
          
          return (
            <group key={`column-dim-${index}`}>
              {/* 치수선 */}
              <Line
                points={[
                  [leftX, dimY, 0.01],
                  [rightX, dimY, 0.01]
                ]}
                color={dimensionColors.column}
                lineWidth={1.5}
              />
              
              {/* 화살표 */}
              <Line
                points={createArrow(
                  new THREE.Vector3(leftX, dimY, 0.01),
                  new THREE.Vector3(leftX + 0.025, dimY, 0.01),
                  0.01
                )}
                color={dimensionColors.column}
                lineWidth={1.5}
              />
              <Line
                points={createArrow(
                  new THREE.Vector3(rightX, dimY, 0.01),
                  new THREE.Vector3(rightX - 0.025, dimY, 0.01),
                  0.01
                )}
                color={dimensionColors.column}
                lineWidth={1.5}
              />
              
              {/* 치수 텍스트 */}
              <Html
                position={[centerX, dimY + mmToThreeUnits(30), 0.01]}
                center
                transform={false}
                occlude={false}
                zIndexRange={[1000, 1001]}
              >
                <div
                  style={{
                    background: dimensionColors.background,
                    color: dimensionColors.column,
                    padding: '4px 7px',
                    borderRadius: '3px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    border: `1px solid ${dimensionColors.column}`,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                >
                  {Math.round(columnWidth)}mm
                </div>
              </Html>
            </group>
          );
        });
      })()}
    </group>
  );
};

export default CADDimensions2D;