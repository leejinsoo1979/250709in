import React, { useState } from 'react';
import styles from './PanelBControl.module.css';
import ColumnThumbnail from './ColumnThumbnail';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { PanelB } from '@/types/space';

const PanelBControl: React.FC = () => {
  const { isPanelBCreationMode, setPanelBCreationMode } = useUIStore();
  const { spaceInfo } = useSpaceConfigStore();
  const [isDragging, setIsDragging] = useState(false);
  
  // 기본 패널B 설정
  const defaultPanelB = {
    width: 600,
    height: 18,
    depth: 730,
    color: '#8B4513',
    material: 'wood' as const
  };
  
  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    
    const dragData = {
      type: 'panelB',
      width: defaultPanelB.width,
      height: defaultPanelB.height,
      depth: defaultPanelB.depth,
      color: defaultPanelB.color,
      material: defaultPanelB.material
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
  };
  
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  const handleCreationModeToggle = () => {
    setPanelBCreationMode(!isPanelBCreationMode);
  };
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>패널B</h3>
      </div>
      
      <div className={styles.thumbnailGrid}>
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          className={isDragging ? styles.dragging : ''}
        >
          <ColumnThumbnail
            width={600}
            height={18}
            depth={730}
            color="#8B4513"
            label="패널B"
          />
        </div>
      </div>
    </div>
  );
};

export default PanelBControl;