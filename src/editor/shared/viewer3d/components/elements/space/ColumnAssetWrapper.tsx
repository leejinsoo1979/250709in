import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import ColumnAsset from './ColumnAsset';
import ColumnZoneCrossPopup from '@/editor/shared/components/ColumnZoneCrossPopup';

interface ColumnAssetWrapperProps {
  position: [number, number, number];
  id: string;
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  renderMode?: 'solid' | 'wireframe';
  onPositionChange?: (id: string, newPosition: [number, number, number]) => void;
  onRemove?: (id: string) => void;
  onColumnUpdate?: (id: string, updates: any) => void;
  spaceInfo?: any;
  hasBackPanelFinish?: boolean;
  hasFrontPanelFinish?: boolean;
}

const ColumnAssetWrapper: React.FC<ColumnAssetWrapperProps> = (props) => {
  const [showZoneCrossPopup, setShowZoneCrossPopup] = useState(false);
  const [zoneCrossInfo, setZoneCrossInfo] = useState<{
    fromZone: 'normal' | 'dropped';
    toZone: 'normal' | 'dropped';
    boundaryPosition: 'left' | 'right';
    targetPosition: [number, number, number];
  } | null>(null);

  const handleZoneCross = (info: {
    fromZone: 'normal' | 'dropped';
    toZone: 'normal' | 'dropped';
    boundaryPosition: 'left' | 'right';
    targetPosition: [number, number, number];
  }) => {
    setZoneCrossInfo(info);
    setShowZoneCrossPopup(true);
  };

  const handleConfirm = () => {
    if (zoneCrossInfo && props.onPositionChange) {
      props.onPositionChange(props.id, zoneCrossInfo.targetPosition);
    }
    setShowZoneCrossPopup(false);
    setZoneCrossInfo(null);
  };

  const handleCancel = () => {
    setShowZoneCrossPopup(false);
    setZoneCrossInfo(null);
  };

  // useEffect로 Portal을 Three.js 컨텍스트 외부에서 관리
  React.useEffect(() => {
    if (showZoneCrossPopup && zoneCrossInfo) {
      const portalContainer = document.createElement('div');
      document.body.appendChild(portalContainer);
      
      ReactDOM.render(
        <ColumnZoneCrossPopup
          isOpen={showZoneCrossPopup}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          fromZone={zoneCrossInfo.fromZone}
          toZone={zoneCrossInfo.toZone}
          boundaryPosition={zoneCrossInfo.boundaryPosition}
        />,
        portalContainer
      );
      
      return () => {
        ReactDOM.unmountComponentAtNode(portalContainer);
        document.body.removeChild(portalContainer);
      };
    }
  }, [showZoneCrossPopup, zoneCrossInfo]);

  return (
    <ColumnAsset
      {...props}
      onZoneCross={handleZoneCross}
    />
  );
};

export default ColumnAssetWrapper;