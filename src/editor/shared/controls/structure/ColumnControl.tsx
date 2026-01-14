import React, { useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { Column } from '@/types/space';
import ColumnThumbnail from './ColumnThumbnail';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './ColumnControl.module.css';

interface ColumnControlProps {
  columns: Column[];
  onColumnsChange: (columns: Column[]) => void;
}

const ColumnControl: React.FC<ColumnControlProps> = ({ columns, onColumnsChange }) => {
  const { t } = useTranslation();
  const spaceConfig = useSpaceConfigStore();
  const { isColumnCreationMode, setColumnCreationMode, selectedColumnId, setSelectedColumnId } = useUIStore();

  // 기둥 생성 모드는 제거하고 드래그 앤 드롭 방식으로 대체
  const handleThumbnailDragStart = (e: React.DragEvent) => {
    console.log('🎯 기둥 썸네일 드래그 시작');
  };

  // 더블클릭 핸들러 추가
  const handleThumbnailDoubleClick = (columnData: any) => {
    console.log('🎯 기둥 썸네일 더블클릭:', columnData);
    
    // 공간 정보 가져오기
    const spaceInfo = spaceConfig.spaceInfo;
    if (!spaceInfo) return;
    
    // 공간 중앙에 기둥 배치
    const centerX = 0; // 공간 중앙
    const centerZ = -(spaceInfo.depth || 1500) * 0.01 / 2 + (columnData.depth * 0.01) / 2; // 뒷벽에 맞닿도록
    
    const newColumn: Column = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, centerZ],
      width: columnData.width,
      height: columnData.height || spaceInfo.height || 2400,
      depth: columnData.depth,
      color: columnData.color || '#888888',
      material: columnData.material || 'concrete'
    };
    
    console.log('🏗️ 더블클릭으로 새 기둥 생성:', newColumn);
    onColumnsChange([...columns, newColumn]);
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
        <h4>{t('sidebar.structureTypes')}</h4>
        <div className={styles.thumbnailGrid}>
          <ColumnThumbnail
            width={300}
            height={2400}
            depth={712}
            material="concrete"
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.columnA')}
          />
          <ColumnThumbnail 
            width={120}
            height={2400}
            depth={730}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.columnB')}
          />
          <ColumnThumbnail 
            width={300}
            height={2400}
            depth={300}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.columnC')}
          />
          <ColumnThumbnail 
            width={20}
            height={2400}
            depth={730}
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.panelA')}
          />
          <ColumnThumbnail 
            width={600}
            height={18}
            depth={730}
            material="wood" 
            color="#8B4513"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.panelB')}
          />
          <ColumnThumbnail 
            width={120}
            height={2400}
            depth={730}
            material="concrete" 
            color="#E0E0E0"
            onDragStart={handleThumbnailDragStart}
            onDoubleClick={handleThumbnailDoubleClick}
            title={t('sidebar.partition')}
          />
        </div>
      </div>


    </div>
  );
};

export default ColumnControl;