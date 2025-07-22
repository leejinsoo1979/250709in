import React, { useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { Wall } from '@/types/space';
import WallThumbnail from './WallThumbnail';
import styles from './WallControl.module.css';

interface WallControlProps {
  walls: Wall[];
  onWallsChange: (walls: Wall[]) => void;
}

const WallControl: React.FC<WallControlProps> = ({ walls, onWallsChange }) => {
  const spaceConfig = useSpaceConfigStore();
  const { isWallCreationMode, setWallCreationMode, selectedWallId, setSelectedWallId } = useUIStore();

  // 가벽 생성 모드는 제거하고 드래그 앤 드롭 방식으로 대체
  const handleThumbnailDragStart = (e: React.DragEvent) => {
    console.log('🎯 가벽 썸네일 드래그 시작');
  };

  const removeWall = (id: string) => {
    onWallsChange(walls.filter(wall => wall.id !== id));
    if (selectedWallId === id) {
      setSelectedWallId(null);
    }
  };

  const updateWall = (id: string, updates: Partial<Wall>) => {
    onWallsChange(
      walls.map(wall => 
        wall.id === id ? { ...wall, ...updates } : wall
      )
    );
  };

  const selectedWall = walls.find(wall => wall.id === selectedWallId);

  return (
    <div className={styles.wallControl}>
      <div className={styles.header}>
        <h3>가벽 배치</h3>
      </div>

      {/* 가벽 썸네일 드래그 앤 드롭 */}
      <div className={styles.thumbnailSection}>
        <h4>가벽 종류</h4>
        <div className={styles.thumbnailGrid}>
          <WallThumbnail 
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
          />
        </div>
      </div>


    </div>
  );
};

export default WallControl;