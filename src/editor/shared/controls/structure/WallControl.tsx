import React from 'react';
import { Wall } from '@/types/space';
import styles from './WallControl.module.css';
import ColumnThumbnail from './ColumnThumbnail';

interface WallControlProps {
  walls: Wall[];
  onWallsChange: (walls: Wall[]) => void;
}

const WallControl: React.FC<WallControlProps> = ({ walls, onWallsChange }) => {
  const handleThumbnailDragStart = (e: React.DragEvent) => {
    console.log('🎯 가벽 썸네일 드래그 시작');
  };

  const handleThumbnailDoubleClick = (wallData: any) => {
    console.log('🎯 가벽 썸네일 더블클릭:', wallData);
  };

  return (
    <div className={styles.wallControl}>
      <div className={styles.thumbnailSection}>
        <h4>가벽</h4>
        <div className={styles.thumbnailGrid}>
          <ColumnThumbnail 
            width={120}
            height={2400}
            depth={730}
            material="concrete" 
            color="#E0E0E0"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title="가벽"
          />
        </div>
      </div>
    </div>
  );
};

export default WallControl;