import React from 'react';

interface ColumnDropTargetProps {
  columnIndex: number;
  columnWidth: number;
  position: { x: number; y: number; z: number };
  internalSpace: { width: number; height: number; depth: number };
  customHeight?: number; // 단내림구간을 위한 커스텀 높이 (mm 단위)
}

// 드롭 타겟 컴포넌트 (순수 Three.js 투명 메시)
const ColumnDropTarget: React.FC<ColumnDropTargetProps> = ({
  columnIndex,
  columnWidth,
  position,
  internalSpace,
  customHeight
}) => {
  // 높이는 커스텀 높이가 있으면 사용, 없으면 내경 공간 높이 사용
  const height = customHeight ? customHeight * 0.01 : internalSpace.height * 0.01; // mm → Three.js 단위 변환
  const width = columnWidth * 0.01; // mm → Three.js 단위 변환
  const depth = internalSpace.depth * 0.01;
  
  return (
    <mesh
      position={[position.x, position.y + height / 2, position.z]}
      userData={{ columnIndex, isDropTarget: true }}
      visible={false} // 시각적으로 보이지 않게 설정
    >
      <boxGeometry args={[width, height, depth]} />
      {/* 드롭 감지는 상위 컴포넌트에서 처리 */}
    </mesh>
  );
};

export default ColumnDropTarget; 