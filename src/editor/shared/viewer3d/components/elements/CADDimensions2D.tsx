import React from 'react';
import { Line, Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import * as THREE from 'three';

interface CADDimensions2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * CAD 스타일 2D 치수 표기 컴포넌트
 * 각 뷰포트에 맞는 치수 표시를 위해 뷰 방향별로 다른 치수선 제공
 */
const CADDimensions2D: React.FC<CADDimensions2DProps> = ({ viewDirection }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { view2DDirection } = useUIStore();
  
  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 공간 크기 (Three.js 단위)
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  
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
  if (currentViewDirection !== 'front') {
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
          color="#1976d2"
          lineWidth={2}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(0, dimensionOffsetY, 0.01),
            new THREE.Vector3(0.05, dimensionOffsetY, 0.01)
          )}
          color="#1976d2"
          lineWidth={2}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(spaceWidth, dimensionOffsetY, 0.01),
            new THREE.Vector3(spaceWidth - 0.05, dimensionOffsetY, 0.01)
          )}
          color="#1976d2"
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
              background: 'rgba(255, 255, 255, 0.9)',
              color: '#1976d2',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '15px',
              fontWeight: 'bold',
              border: '1px solid #1976d2',
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
          color="#1976d2"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.01}
        />
        
        {/* 우측 연장선 */}
        <Line
          points={[
            [spaceWidth, floatHeight, 0.01],
            [spaceWidth, dimensionOffsetY + mmToThreeUnits(20), 0.01]
          ]}
          color="#1976d2"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.01}
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
          color="#1976d2"
          lineWidth={2}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(dimensionOffsetX, floatHeight, 0.01),
            new THREE.Vector3(dimensionOffsetX, floatHeight + 0.05, 0.01)
          )}
          color="#1976d2"
          lineWidth={2}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(dimensionOffsetX, floatHeight + actualFrameHeight, 0.01),
            new THREE.Vector3(dimensionOffsetX, floatHeight + actualFrameHeight - 0.05, 0.01)
          )}
          color="#1976d2"
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
              background: 'rgba(255, 255, 255, 0.9)',
              color: '#1976d2',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '15px',
              fontWeight: 'bold',
              border: '1px solid #1976d2',
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
          color="#1976d2"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.01}
        />
        
        {/* 상단 연장선 */}
        <Line
          points={[
            [0, floatHeight + actualFrameHeight, 0.01],
            [dimensionOffsetX - mmToThreeUnits(20), floatHeight + actualFrameHeight, 0.01]
          ]}
          color="#1976d2"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.01}
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
          color="#1976d2"
          lineWidth={2}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(rightDimensionOffsetX, floatHeight, 0.01),
            new THREE.Vector3(rightDimensionOffsetX, floatHeight + 0.05, 0.01)
          )}
          color="#1976d2"
          lineWidth={2}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrow(
            new THREE.Vector3(rightDimensionOffsetX, floatHeight + actualFrameHeight, 0.01),
            new THREE.Vector3(rightDimensionOffsetX, floatHeight + actualFrameHeight - 0.05, 0.01)
          )}
          color="#1976d2"
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
              background: 'rgba(255, 255, 255, 0.9)',
              color: '#1976d2',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '15px',
              fontWeight: 'bold',
              border: '1px solid #1976d2',
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
          color="#1976d2"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.01}
        />
        
        {/* 상단 연장선 */}
        <Line
          points={[
            [spaceWidth, floatHeight + actualFrameHeight, 0.01],
            [rightDimensionOffsetX + mmToThreeUnits(20), floatHeight + actualFrameHeight, 0.01]
          ]}
          color="#1976d2"
          lineWidth={1}
          dashed
          dashSize={0.02}
          gapSize={0.01}
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
            color="#ff6b35"
            lineWidth={2}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrow(
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), 0, 0.01),
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), 0.05, 0.01)
            )}
            color="#ff6b35"
            lineWidth={2}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrow(
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), floatHeight, 0.01),
              new THREE.Vector3(rightDimensionOffsetX + mmToThreeUnits(100), floatHeight - 0.05, 0.01)
            )}
            color="#ff6b35"
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
                background: 'rgba(255, 255, 255, 0.9)',
                color: '#ff6b35',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                border: '1px solid #ff6b35',
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
            color="#ff6b35"
            lineWidth={1}
            dashed
            dashSize={0.015}
            gapSize={0.008}
          />
          
          {/* 상단 연장선 (프레임 하단) */}
          <Line
            points={[
              [spaceWidth, floatHeight, 0.01],
              [rightDimensionOffsetX + mmToThreeUnits(120), floatHeight, 0.01]
            ]}
            color="#ff6b35"
            lineWidth={1}
            dashed
            dashSize={0.015}
            gapSize={0.008}
          />
        </group>
      )}
      
      {/* 배치된 가구 치수 */}
      {placedModules.map((module, index) => {
        const moduleData = getModuleById(
          module.moduleId,
          { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
          spaceInfo
        );
        
        if (!moduleData) return null;
        
        const moduleWidth = mmToThreeUnits(moduleData.dimensions.width);
        const leftX = module.position.x - moduleWidth / 2;
        const rightX = module.position.x + moduleWidth / 2;
        const dimY = -mmToThreeUnits(100); // 하단 치수선
        
        return (
          <group key={`module-dim-${index}`}>
            {/* 치수선 */}
            <Line
              points={[
                [leftX, dimY, 0.01],
                [rightX, dimY, 0.01]
              ]}
              color="#ff9800"
              lineWidth={2}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrow(
                new THREE.Vector3(leftX, dimY, 0.01),
                new THREE.Vector3(leftX + 0.03, dimY, 0.01),
                0.015
              )}
              color="#ff9800"
              lineWidth={2}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrow(
                new THREE.Vector3(rightX, dimY, 0.01),
                new THREE.Vector3(rightX - 0.03, dimY, 0.01),
                0.015
              )}
              color="#ff9800"
              lineWidth={2}
            />
            
            {/* 치수 텍스트 */}
            <Html
              position={[module.position.x, dimY - mmToThreeUnits(40), 0.01]}
              center
              transform={false}
              occlude={false}
              zIndexRange={[1000, 1001]}
            >
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.9)',
                  color: '#ff9800',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  border: '1px solid #ff9800',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              >
                {moduleData.dimensions.width}mm
              </div>
            </Html>
            
            {/* 연장선 */}
            <Line
              points={[
                [leftX, 0, 0.01],
                [leftX, dimY + mmToThreeUnits(20), 0.01]
              ]}
              color="#ff9800"
              lineWidth={1}
              dashed
              dashSize={0.015}
              gapSize={0.008}
            />
            <Line
              points={[
                [rightX, 0, 0.01],
                [rightX, dimY + mmToThreeUnits(20), 0.01]
              ]}
              color="#ff9800"
              lineWidth={1}
              dashed
              dashSize={0.015}
              gapSize={0.008}
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
                color="#4caf50"
                lineWidth={1.5}
              />
              
              {/* 화살표 */}
              <Line
                points={createArrow(
                  new THREE.Vector3(leftX, dimY, 0.01),
                  new THREE.Vector3(leftX + 0.025, dimY, 0.01),
                  0.01
                )}
                color="#4caf50"
                lineWidth={1.5}
              />
              <Line
                points={createArrow(
                  new THREE.Vector3(rightX, dimY, 0.01),
                  new THREE.Vector3(rightX - 0.025, dimY, 0.01),
                  0.01
                )}
                color="#4caf50"
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
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: '#4caf50',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    border: '1px solid #4caf50',
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