import React, { useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { Column } from '@/types/space';
import ColumnThumbnail from './ColumnThumbnail';
import styles from './ColumnControl.module.css';

interface ColumnControlProps {
  columns: Column[];
  onColumnsChange: (columns: Column[]) => void;
}

const ColumnControl: React.FC<ColumnControlProps> = ({ columns, onColumnsChange }) => {
  const spaceConfig = useSpaceConfigStore();
  const { isColumnCreationMode, setColumnCreationMode, selectedColumnId, setSelectedColumnId } = useUIStore();

  // 기둥 생성 모드는 제거하고 드래그 앤 드롭 방식으로 대체
  const handleThumbnailDragStart = (e: React.DragEvent) => {
    console.log('🎯 기둥 썸네일 드래그 시작');
  };

  const removeColumn = (id: string) => {
    onColumnsChange(columns.filter(col => col.id !== id));
    if (selectedColumnId === id) {
      setSelectedColumnId(null);
    }
  };

  const updateColumn = (id: string, updates: Partial<Column>) => {
    onColumnsChange(
      columns.map(col => 
        col.id === id ? { ...col, ...updates } : col
      )
    );
  };

  const selectedColumn = columns.find(col => col.id === selectedColumnId);

  return (
    <div className={styles.columnControl}>

      {/* 기둥 썸네일 드래그 앤 드롭 */}
      <div className={styles.thumbnailSection}>
        <h4>구조물 종류</h4>
        <div className={styles.thumbnailGrid}>
          <ColumnThumbnail 
            width={300}
            height={2400}
            depth={730}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            title="기둥A"
          />
          <ColumnThumbnail 
            width={120}
            height={2400}
            depth={730}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            title="기둥B"
          />
          <ColumnThumbnail 
            width={300}
            height={2400}
            depth={300}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            title="기둥C"
          />
          <ColumnThumbnail 
            width={20}
            height={2400}
            depth={730}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            title="패널A"
          />
        </div>
      </div>


    </div>
  );
};

export default ColumnControl;