확장import React from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { TouchCompatibleControl } from './TouchCompatibleControls';
import HeightControl from '@/editor/shared/controls/space/HeightControl';
import { SpaceInfo, SPACE_LIMITS, DEFAULT_SPACE_VALUES } from '@/store/core/spaceConfigStore';

interface ResponsiveHeightControlProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

export const ResponsiveHeightControl: React.FC<ResponsiveHeightControlProps> = ({
  spaceInfo,
  onUpdate
}) => {
  const { isTouchDevice, isMobile, isTablet } = useResponsive();
  
  // 터치 디바이스나 모바일/태블릿에서는 터치 최적화 컴포넌트 사용
  if (isTouchDevice || isMobile || isTablet) {
    return (
      <TouchCompatibleControl
        label={`높이`}
        value={spaceInfo?.height || DEFAULT_SPACE_VALUES.HEIGHT}
        min={SPACE_LIMITS.HEIGHT.MIN}
        max={SPACE_LIMITS.HEIGHT.MAX}
        step={10}
        unit="mm"
        onChange={(value) => onUpdate({ height: value })}
        type="number"
      />
    );
  }
  
  // 데스크톱에서는 기존 컨트롤 사용
  return (
    <HeightControl 
      spaceInfo={spaceInfo}
      onUpdate={onUpdate}
    />
  );
};