import React from 'react';

interface ColumnDropTargetProps {
  columnIndex: number;
  columnWidth: number;
  position: { x: number; y: number; z: number };
  internalSpace: { width: number; height: number; depth: number };
}

// 드롭 타겟 컴포넌트 (순수 Three.js 투명 메시)
const ColumnDropTarget: React.FC<ColumnDropTargetProps> = ({
  columnIndex,
  columnWidth,
  position,
  internalSpace
}) => {
  // 높이는 내경 공간 높이와 동일하게 설정
  const height = internalSpace.height * 0.01; // mm → Three.js 단위 변환
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