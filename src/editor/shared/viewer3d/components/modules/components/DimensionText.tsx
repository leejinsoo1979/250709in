import React, { useState } from 'react';
import { Text } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

interface DimensionTextProps {
  // 치수 값
  value: number;
  
  // 위치
  position: [number, number, number];
  
  // 텍스트 앵커
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom';
  
  // 색상 (옵션, 기본값은 테마 색상)
  color?: string;
  
  // 폰트 크기 배율 (옵션, 기본값 1.0)
  sizeMultiplier?: number;
  
  // 접두사 (예: "D" for depth)
  prefix?: string;
  
  // 그림자 효과 (3D 모드에서만)
  showShadow?: boolean;
  
  // 강제 표시 (showDimensions 무시)
  forceShow?: boolean;
  
  // 회전 (Euler 각도)
  rotation?: [number, number, number];
  
  // 그림자 오프셋 (3D 모드)
  shadowOffset?: [number, number, number];
}

/**
 * DimensionText 통합 컴포넌트
 * 
 * 모든 치수 텍스트를 일관되게 렌더링합니다.
 * showDimensions와 showDimensionsText 조건을 중앙에서 관리합니다.
 */
const DimensionText: React.FC<DimensionTextProps> = ({
  value,
  position,
  anchorX = 'center',
  anchorY = 'middle',
  color,
  sizeMultiplier = 1.0,
  prefix = '',
  showShadow = true,
  forceShow = false,
  rotation,
  shadowOffset = [0.01, -0.01, 0]
}) => {
  const { showDimensions, showDimensionsText, view2DDirection, view2DTheme } = useUIStore();
  const { viewMode } = useSpace3DView();
  const [isHovered, setIsHovered] = useState(false);
  
  // 치수 표시 조건 체크 - 중앙 집중식
  if (!forceShow && (!showDimensions || !showDimensionsText)) {
    return null;
  }
  
  // 2D 모드에서 좌측/우측/탑 뷰에서는 숨김 (정면 뷰에서만 표시) - forceShow가 아닌 경우만
  if (!forceShow && viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) {
    return null;
  }
  
  // 테마 색상 가져오기
  const getThemeColor = () => {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
    }
    return '#10b981';
  };
  
  // 색상 결정 - 호버 시 형광색
  const highlightColor = '#00ff00'; // 형광 녹색
  const normalColor = color || (viewMode === '3D' ? getThemeColor() : (view2DTheme === 'dark' ? '#ffffff' : '#000000'));
  const textColor = isHovered ? highlightColor : normalColor;
  
  // 폰트 크기
  const baseFontSize = viewMode === '3D' ? 0.45 : 0.32;
  const fontSize = baseFontSize * sizeMultiplier;
  
  // 텍스트 내용 (소수점 2자리까지 표시, 불필요한 0 제거)
  const formattedValue = parseFloat(value.toFixed(2));
  const displayText = `${prefix}${formattedValue}`;
  
  return (
    <group>
      {/* 3D 모드에서 그림자 효과 */}
      {showShadow && viewMode === '3D' && (
        <Text
          renderOrder={998}
          depthTest={false}
          position={[
            position[0] + shadowOffset[0],
            position[1] + shadowOffset[1],
            position[2] + shadowOffset[2]
          ]}
          fontSize={fontSize}
          color="rgba(0, 0, 0, 0.3)"
          anchorX={anchorX}
          anchorY={anchorY}
          rotation={rotation}
        >
          {displayText}
        </Text>
      )}
      
      {/* 메인 텍스트 */}
      <Text
        renderOrder={999}
        depthTest={false}
        position={position}
        fontSize={fontSize}
        color={textColor}
        anchorX={anchorX}
        anchorY={anchorY}
        rotation={rotation}
        onPointerOver={(e) => {
          e.stopPropagation();
          setIsHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setIsHovered(false);
          document.body.style.cursor = 'default';
        }}
      >
        {displayText}
      </Text>
    </group>
  );
};

export default DimensionText;
