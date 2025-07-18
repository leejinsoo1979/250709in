import React from 'react';
import styles from './ColumnThumbnail.module.css';

interface ColumnThumbnailProps {
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  material?: 'concrete' | 'steel' | 'wood';
  onDragStart?: (e: React.DragEvent) => void;
}

const ColumnThumbnail: React.FC<ColumnThumbnailProps> = ({
  width = 1200, // 1200mm
  height = 2400, // 2400mm (공간 높이와 동일)
  depth = 1200, // 1200mm
  color = '#888888',
  material = 'concrete',
  onDragStart
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    // 기둥 정보를 드래그 데이터에 저장
    const columnData = {
      type: 'column',
      width,
      height,
      depth,
      color,
      material
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(columnData));
    e.dataTransfer.effectAllowed = 'copy';
    
    onDragStart?.(e);
  };

  // 사용자가 제공한 기둥 이미지 사용
  const getColumnImagePath = () => {
    // 사용자가 제공한 기둥 이미지 경로
    return '/images/column.png';
  };

  return (
    <div 
      className={styles.columnThumbnail}
      draggable
      onDragStart={handleDragStart}
      title={`기둥 - ${material} (${width}×${depth}×${height}mm)`}
    >
      {/* 기둥 이미지만 표시 */}
      <img 
        src={getColumnImagePath()}
        alt={`기둥 - ${material}`}
        className={styles.columnImage}
        onError={(e) => {
          console.error('기둥 이미지 로드 실패:', e);
          // 이미지 로드 실패 시 기본 텍스트 표시
          const img = e.target as HTMLImageElement;
          img.style.display = 'none';
          const container = img.parentElement;
          if (container) {
            container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: #f0f0f0; color: #666; font-size: 12px; text-align: center;">기둥</div>';
          }
        }}
      />
    </div>
  );
};

export default ColumnThumbnail;