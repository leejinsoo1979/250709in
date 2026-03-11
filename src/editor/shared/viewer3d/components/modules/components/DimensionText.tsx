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

  // Three.js 객체 이름 (DXF 추출 시 레이어 분류에 사용)
  name?: string;
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
  shadowOffset = [0.01, -0.01, 0],
  name
}) => {
  const { showDimensions, showDimensionsText, view2DDirection, view2DTheme } = useUIStore();
  const { viewMode } = useSpace3DView();
  const [isHovered, setIsHovered] = useState(false);

  // 디버그: forceShow와 측면 뷰 확인
  React.useEffect(() => {
    if (forceShow && viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      console.log('📏 DimensionText forceShow in side view:', {
        prefix,
        value,
        viewMode,
        view2DDirection,
        forceShow,
        showDimensions,
        showDimensionsText
      });
    }
  }, [forceShow, viewMode, view2DDirection, prefix, value, showDimensions, showDimensionsText]);

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
  
  // 폰트 크기 - 3D에서 더 크게
  const baseFontSize = viewMode === '3D' ? 0.55 : 0.32;
  const fontSize = baseFontSize * sizeMultiplier;

  // 3D 외곽선 (배경과 구분)
  const outlineW = viewMode === '3D' ? 0.06 : 0;
  const outlineC = '#ffffff';
  
  // 텍스트 내용 (정수로 표시)
  const formattedValue = Math.round(value);
  const displayText = `${prefix}${formattedValue}`;
  
  return (
    <Text
      name={name}
      renderOrder={999}
      depthTest={false}
      position={position}
      fontSize={fontSize}
      color={textColor}
      anchorX={anchorX}
      anchorY={anchorY}
      rotation={rotation}
      outlineWidth={outlineW}
      outlineColor={outlineC}
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
  );
};

export default DimensionText;
