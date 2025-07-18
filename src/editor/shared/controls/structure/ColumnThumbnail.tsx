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

  const getMaterialTexture = () => {
    switch (material) {
      case 'concrete':
        return 'linear-gradient(45deg, #888888 25%, #999999 25%, #999999 50%, #888888 50%, #888888 75%, #999999 75%, #999999)';
      case 'steel':
        return 'linear-gradient(90deg, #B0B0B0 0%, #D3D3D3 50%, #B0B0B0 100%)';
      case 'wood':
        return 'linear-gradient(90deg, #D2691E 0%, #CD853F 30%, #D2691E 60%, #CD853F 100%)';
      default:
        return color;
    }
  };

  return (
    <div 
      className={styles.columnThumbnail}
      draggable
      onDragStart={handleDragStart}
      title={`기둥 - ${material} (${width}×${depth}×${height}mm)`}
    >
      <div className={styles.thumbnailContainer}>
        {/* 3D 기둥 표현 */}
        <div className={styles.columnView}>
          {/* 기둥 상단면 */}
          <div 
            className={styles.columnTop}
            style={{ 
              background: getMaterialTexture(),
              filter: 'brightness(1.2)'
            }}
          />
          
          {/* 기둥 정면 */}
          <div 
            className={styles.columnFront}
            style={{ 
              background: getMaterialTexture()
            }}
          />
          
          {/* 기둥 우측면 */}
          <div 
            className={styles.columnRight}
            style={{ 
              background: getMaterialTexture(),
              filter: 'brightness(0.8)'
            }}
          />
        </div>
        
        {/* 기둥 정보 */}
        <div className={styles.columnInfo}>
          <div className={styles.columnName}>기둥</div>
          <div className={styles.columnDetails}>
            <span className={styles.material}>{material === 'concrete' ? '콘크리트' : material === 'steel' ? '철골' : '목재'}</span>
            <span className={styles.size}>{width/1000}×{depth/1000}×{height/1000}m</span>
          </div>
        </div>
      </div>
      
      {/* 드래그 힌트 */}
      <div className={styles.dragHint}>
        드래그하여 배치
      </div>
    </div>
  );
};

export default ColumnThumbnail;