import React from 'react';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DoorModule from '../DoorModule';

/**
 * DualType1 컴포넌트
 * - 2단 서랍 + 옷장 복합형 (dual-2drawer-hanging)
 * - ID 패턴: dual-2drawer-hanging-*
 * - 구조: 하단 2단서랍 + 상단 옷장 (듀얼 타입)
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const DualType1: React.FC<FurnitureTypeProps> = ({
  moduleData,
  color,
  internalHeight,
  hasDoor,
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  isDragging = false
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging
  });

  return (
    <BaseFurnitureShell {...baseFurniture}>
      {/* sections 기반 내부 구조 렌더링 */}
      <SectionsRenderer
        modelConfig={baseFurniture.modelConfig}
        height={baseFurniture.height}
        innerWidth={baseFurniture.innerWidth}
        depth={baseFurniture.depth}
        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
        basicThickness={baseFurniture.basicThickness}
        shelfZOffset={baseFurniture.shelfZOffset}
        material={baseFurniture.material}
        calculateSectionHeight={baseFurniture.calculateSectionHeight}
        renderMode={useSpace3DView().renderMode}
      />
      
      {/* 도어 렌더링 */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
        />
      )}
    </BaseFurnitureShell>
  );
};

export default DualType1; 