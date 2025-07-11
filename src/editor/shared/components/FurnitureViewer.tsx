import React from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';

interface FurnitureViewerProps {
  spaceInfo: SpaceInfo;
  viewMode: '2D' | '3D';
  svgSize: { width: number; height: number };
}

const FurnitureViewer: React.FC<FurnitureViewerProps> = ({ spaceInfo, viewMode, svgSize }) => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Space3DView 
        spaceInfo={spaceInfo}
        svgSize={svgSize}
        viewMode={viewMode}
      />
    </div>
  );
};

export default FurnitureViewer; 