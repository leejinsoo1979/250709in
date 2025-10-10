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
  const { view2DDirection, showDimensions: showDimensionsFromStore, showDimensionsText, showFurniture, view2DTheme } = useUIStore();

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  // 2D 도면 치수 색상 설정 - view2DTheme 사용
  // 라이트 모드: 검정색, 다크 모드: 흰색
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';
  
  console.log('📐 CADDimensions2D 치수 색상:', {
    view2DTheme,
    dimensionColor,
    expectedLight: '#000000',
    expectedDark: '#FFFFFF'
  });

  const dimensionColors = {
    primary: dimensionColor,     // 기본 치수선
    furniture: dimensionColor,   // 가구 치수선
    column: dimensionColor,      // 컬럼 치수선
    float: dimensionColor,       // 띄움 높이
    background: view2DTheme === 'dark' ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    text: dimensionColor         // 텍스트
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

  // showDimensions가 false이면 치수 표시하지 않음
  if (!showDimensions) {
    return null;
  }

  // 측면도(좌/우)는 치수를 렌더링하지 않음 - Hook 순서 유지를 위해 조건부 렌더링 사용
  const shouldHideView = (currentViewDirection === 'left' || currentViewDirection === 'right');

  if (shouldHideView) {
    return null;
  }

  // 정면도 전용 치수
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
            {parseFloat(spaceInfo.width.toFixed(2))}mm
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
            {parseFloat(internalSpace.width.toFixed(2))}mm
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

      {/* 배치된 가구 치수 - 정면도에서만 표시 (측면도에서는 숨김) */}
      {showFurniture && currentViewDirection === 'front' && React.useMemo(() => placedModules.map((module, index) => {
        // 도어가 있는 가구는 치수 표시하지 않음
        if (module.doorConfig) {
          return null;
        }
        const internalSpace = calculateInternalSpace(spaceInfo);
        const moduleData = getModuleById(
          module.moduleId,
          internalSpace,
          spaceInfo
        );
        
        if (!moduleData) return null;
        
        // 기둥 슬롯 분석
        const columnSlots = analyzeColumnSlots(spaceInfo);
        const slotInfo = module.slotIndex !== undefined ? columnSlots[module.slotIndex] : undefined;
        const indexing = calculateSpaceIndexing(spaceInfo);
        
        // 듀얼 가구인지 확인 (FurnitureItem.tsx와 동일한 로직)
        const isDualFurniture = module.isDualSlot !== undefined 
          ? module.isDualSlot 
          : moduleData.id.includes('dual-');
        
        // 실제 렌더링될 가구 폭과 위치 계산 (FurnitureItem.tsx와 동일한 로직)
        let furnitureWidthMm = moduleData.dimensions.width;
        let furniturePositionX = module.position.x;
        
        // 노서라운드 모드 위치 보정 되돌리기
        // FurnitureItem.tsx에서 positionAdjustmentForEndPanel로 조정된 것을 원복
        if (spaceInfo.surroundType === 'no-surround' && spaceInfo.installType === 'freestanding') {
          const END_PANEL_THICKNESS = 18;
          
          if (isDualFurniture && module.slotIndex === 0) {
            // 첫번째 슬롯 듀얼: 9mm 오른쪽으로 이동했으므로 왼쪽으로 되돌림
            furniturePositionX = furniturePositionX - ((END_PANEL_THICKNESS / 2) * 0.01);
            console.log('📐 노서라운드 듀얼 첫번째 슬롯 위치 원복:', {
              moduleId: module.moduleId,
              adjustedX: module.position.x,
              originalX: furniturePositionX
            });
          } else if (isDualFurniture && module.slotIndex === indexing.columnCount - 2) {
            // 마지막-1 슬롯 듀얼: 9mm 왼쪽으로 이동했으므로 오른쪽으로 되돌림
            furniturePositionX = furniturePositionX + ((END_PANEL_THICKNESS / 2) * 0.01);
            console.log('📐 노서라운드 듀얼 마지막 슬롯 위치 원복:', {
              moduleId: module.moduleId,
              adjustedX: module.position.x,
              originalX: furniturePositionX
            });
          }
        }
        
        // FurnitureItem.tsx와 동일한 우선순위 적용
        // 우선순위 1: adjustedWidth (기둥 침범 조정 너비 - 최우선)
        if (module.adjustedWidth !== undefined && module.adjustedWidth !== null) {
          furnitureWidthMm = parseFloat(module.adjustedWidth.toFixed(2));
        }
        // 우선순위 2: customWidth (슬롯 사이즈에 맞춘 너비 - 기둥이 없는 경우)
        else if (module.customWidth !== undefined && module.customWidth !== null) {
          furnitureWidthMm = parseFloat(module.customWidth.toFixed(2));
        }
        // 우선순위 3: 슬롯 너비 직접 계산 (customWidth가 없는 경우)
        else if (indexing.slotWidths && module.slotIndex !== undefined) {
          if (isDualFurniture && module.slotIndex < indexing.slotWidths.length - 1) {
            furnitureWidthMm = parseFloat((indexing.slotWidths[module.slotIndex] + indexing.slotWidths[module.slotIndex + 1]).toFixed(2));
          } else if (indexing.slotWidths[module.slotIndex] !== undefined) {
            furnitureWidthMm = parseFloat(indexing.slotWidths[module.slotIndex].toFixed(2));
          }
        }
        // 우선순위 4: 기본값 (모듈 원래 크기)
        else {
          furnitureWidthMm = parseFloat(moduleData.dimensions.width.toFixed(2));
        }
        
        // 기둥 침범 시 가구 크기와 위치 재계산
        if (slotInfo && slotInfo.hasColumn) {
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
          
          console.log('📐 [CADDimensions2D] 기둥 침범 가구 치수 업데이트:', {
            moduleId: module.moduleId,
            slotIndex: module.slotIndex,
            hasColumn: slotInfo.hasColumn,
            originalWidth: moduleData.dimensions.width,
            adjustedWidth: module.adjustedWidth,
            calculatedWidth: furnitureBounds.renderWidth,
            finalWidth: furnitureWidthMm,
            intrusionDirection: slotInfo.intrusionDirection,
            columnType: slotInfo.columnType
          });
        }
        
        // 노서라운드 모드에서 실제 가구 너비 계산 (FurnitureItem.tsx와 동일)
        let actualFurnitureWidthMm = furnitureWidthMm;
        
        // 노서라운드 모드에서는 기둥이 있는 경우만 조정 (엔드패널은 이미 slotWidths에 반영됨)
        if (spaceInfo.surroundType === 'no-surround' && module.slotIndex !== undefined) {
          // 기둥이 있는 경우 adjustedWidth 적용
          if (module.adjustedWidth !== undefined && module.adjustedWidth !== null) {
            actualFurnitureWidthMm = module.adjustedWidth;
          }
        }
        
        // 도어가 있는 경우 - 도어의 실제 크기와 위치로 치수 가이드 조정
        let displayWidth = actualFurnitureWidthMm !== undefined && actualFurnitureWidthMm !== null
          ? parseFloat(actualFurnitureWidthMm.toFixed(2))
          : parseFloat(furnitureWidthMm.toFixed(2));
        let displayPositionX = furniturePositionX;
        
        
        // 도어 치수 표시 코드 주석 처리
        // if (module.doorConfig) {
        //   // no-surround freestanding에서 첫 번째/마지막 슬롯은 특별 처리
        //   if (spaceInfo.surroundType === 'no-surround' && 
        //       spaceInfo.installType === 'freestanding' &&
        //       (module.slotIndex === 0 || module.slotIndex === indexing.columnCount - 1)) {
        //     // 첫 번째/마지막 슬롯: 가구 본체는 582mm이지만 도어는 600mm - 3mm = 597mm
        //     // 가구 본체 너비(582mm)에 18mm를 더해서 원래 슬롯 너비(600mm)로 복원
        //     displayWidth = furnitureWidthMm + 18 - 3; // 582 + 18 - 3 = 597mm
        //   } else {
        //     // 일반 슬롯: 원래 슬롯 너비에서 3mm를 뺀 값
        //     const baseSlotWidth = Math.floor(spaceInfo.width / indexing.columnCount);
        //     const remainder = spaceInfo.width % indexing.columnCount;
        //     
        //     let originalSlotWidth = baseSlotWidth;
        //     if (module.slotIndex !== undefined && remainder > 0 && module.slotIndex < remainder) {
        //       originalSlotWidth = baseSlotWidth + 1;
        //     }
        //     
        //     displayWidth = originalSlotWidth - 3; // 도어 실제 크기
        //   }
        //   
        //   console.log('🚪 [CADDimensions2D] 도어 치수 가이드:', {
        //     moduleId: module.moduleId,
        //     slotIndex: module.slotIndex,
        //     furnitureWidth: furnitureWidthMm,
        //     doorWidth: displayWidth,
        //     originalSlotWidth,
        //     surroundType: spaceInfo.surroundType,
        //     installType: spaceInfo.installType
        //   });
        // }

        const moduleWidth = mmToThreeUnits(displayWidth);
        const leftX = displayPositionX - moduleWidth / 2;
        const rightX = displayPositionX + moduleWidth / 2;
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
              position={[displayPositionX, dimY - mmToThreeUnits(40), 0.01]}
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
                {displayWidth}mm
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
      }), [placedModules, spaceInfo.columns, spaceInfo.installType, spaceInfo.surroundType, spaceInfo.wallConfig, showFurniture])}
      
      
      {/* 컬럼 치수 표시 */}
      {(() => {
        console.log('🔍 CADDimensions2D - spaceInfo 체크:', {
          width: spaceInfo.width,
          wallConfig: spaceInfo.wallConfig,
          surroundType: spaceInfo.surroundType,
          gapConfig: spaceInfo.gapConfig
        });
        const indexing = calculateSpaceIndexing(spaceInfo);
        console.log('📐 CADDimensions2D - indexing 결과:', {
          slotWidths: indexing.slotWidths,
          optimizedGapConfig: indexing.optimizedGapConfig,
          columnCount: indexing.columnCount,
          totalWidth: spaceInfo.width,
          gapConfig: spaceInfo.gapConfig,
          surroundType: spaceInfo.surroundType,
          installType: spaceInfo.installType
        });
        if (indexing.columnCount <= 1) return null;
        // columnCount가 1(싱글 캐비닛)일 때는 분할선/치수 분절을 모두 렌더링하지 않음
        return indexing.threeUnitBoundaries.slice(0, -1).map((leftX, index) => {
          const rightX = indexing.threeUnitBoundaries[index + 1];
          // slotWidths가 있으면 사용, 없으면 경계에서 계산
          const rawColumnWidth = indexing.slotWidths && indexing.slotWidths[index]
            ? indexing.slotWidths[index]
            : (rightX - leftX) / 0.01; // Three.js 단위를 mm로 변환
          const columnWidth = parseFloat(rawColumnWidth.toFixed(2));
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
                  {columnWidth}mm
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