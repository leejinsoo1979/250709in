import React from 'react';
import styles from './WallThumbnail.module.css';

interface WallThumbnailProps {
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  material?: 'concrete' | 'steel' | 'wood';
  onDragStart?: (e: React.DragEvent) => void;
}

const WallThumbnail: React.FC<WallThumbnailProps> = ({
  width = 120, // 120mm
  height = 2400, // 2400mm (공간 높이와 동일)
  depth = 730, // 730mm
  color = '#888888',
  material = 'concrete',
  onDragStart
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    // 가벽 정보를 드래그 데이터에 저장
    const wallData = {
      type: 'wall',
      width,
      height,
      depth,
      color,
      material
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(wallData));
    e.dataTransfer.effectAllowed = 'copy';
    
    onDragStart?.(e);
  };

  // 가벽 이미지 경로 (기둥 이미지와 비슷하지만 얇은 형태)
  const getWallImagePath = () => {
    // 가벽 이미지 경로 (없다면 기본 CSS로 표시)
    return '/images/wall.png';
  };

  return (
    <div 
      className={styles.wallThumbnail}
      draggable
      onDragStart={handleDragStart}
      title={`가벽 - ${material} (${width}×${depth}×${height}mm)`}
    >
      {/* 가벽 이미지 또는 기본 표시 */}
      <div className={styles.wallPreview}>
        <div 
          className={styles.wallShape}
          style={{ backgroundColor: color }}
        >
          가벽
        </div>
      </div>
    </div>
  );
};

export default WallThumbnail;