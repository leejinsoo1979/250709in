import React from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { TouchCompatibleControl } from './TouchCompatibleControls';
import WidthControl from '@/editor/shared/controls/space/WidthControl';
import { SpaceInfo, SPACE_LIMITS, DEFAULT_SPACE_VALUES } from '@/store/core/spaceConfigStore';

interface ResponsiveWidthControlProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
}

export const ResponsiveWidthControl: React.FC<ResponsiveWidthControlProps> = ({
  spaceInfo,
  onUpdate,
  disabled = false
}) => {
  const { isTouchDevice, isMobile, isTablet } = useResponsive();
  
  // 터치 디바이스나 모바일/태블릿에서는 터치 최적화 컴포넌트 사용
  if (isTouchDevice || isMobile || isTablet) {
    return (
      <TouchCompatibleControl
        label={`폭`}
        value={spaceInfo?.width || DEFAULT_SPACE_VALUES.WIDTH}
        min={SPACE_LIMITS.WIDTH.MIN}
        max={SPACE_LIMITS.WIDTH.MAX}
        step={10}
        unit="mm"
        onChange={(value) => onUpdate({ width: value })}
        disabled={disabled}
        type="number"
      />
    );
  }
  
  // 데스크톱에서는 기존 컨트롤 사용
  return (
    <WidthControl 
      spaceInfo={spaceInfo}
      onUpdate={onUpdate}
      disabled={disabled}
    />
  );
};