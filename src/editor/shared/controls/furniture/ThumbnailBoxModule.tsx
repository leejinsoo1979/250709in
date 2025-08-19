import React from 'react';
import { ModuleData } from '@/data/modules';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer } from '@/editor/shared/viewer3d/components/modules/shared';
import * as THREE from 'three';

interface ThumbnailBoxModuleProps {
  moduleData: ModuleData;
  color?: string;
}

/**
 * 썸네일용 간단한 BoxModule 
 * - 3D 컨텍스트 없이 작동
 * - 기본적인 박스 형태만 렌더링
 */
const ThumbnailBoxModule: React.FC<ThumbnailBoxModuleProps> = ({ 
  moduleData, 
  color 
}) => {
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    isDragging: false,
    isEditMode: false
  });

  // 상부장/하부장 구분하여 렌더링
  const isUpperCabinet = moduleData.category === 'upper';
  const isLowerCabinet = moduleData.category === 'lower';
  
  return (
    <BaseFurnitureShell {...baseFurniture} isDragging={false} isEditMode={false}>
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
        renderMode="solid"
      />
    </BaseFurnitureShell>
  );
};

export default ThumbnailBoxModule;