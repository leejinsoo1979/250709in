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
  spaceInfo?: any;
  hasBackPanelFinish?: boolean;
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

  return (
    <>
      <ColumnAsset
        {...props}
        onZoneCross={handleZoneCross}
      />
      
      {/* 팝업을 React Three Fiber 외부에 렌더링 */}
      {showZoneCrossPopup && zoneCrossInfo && ReactDOM.createPortal(
        <ColumnZoneCrossPopup
          isOpen={showZoneCrossPopup}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          fromZone={zoneCrossInfo.fromZone}
          toZone={zoneCrossInfo.toZone}
          boundaryPosition={zoneCrossInfo.boundaryPosition}
        />,
        document.body
      )}
    </>
  );
};

export default ColumnAssetWrapper;