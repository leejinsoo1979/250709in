import React, { useEffect } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useTouchOrbitControls } from '../hooks/useTouchOrbitControls';

interface TouchOrbitControlsSetupProps {
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  enabled: boolean;
}

export const TouchOrbitControlsSetup: React.FC<TouchOrbitControlsSetupProps> = ({ 
  controlsRef, 
  enabled 
}) => {
  // Canvas 내부에서 터치 컨트롤 설정
  useTouchOrbitControls(controlsRef, {
    enabled,
    enableRotate: true,
    enableZoom: true,
    enablePan: true,
  });

  return null;
};