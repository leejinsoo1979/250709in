import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import ColumnThumbnail from './ColumnThumbnail';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './ColumnControl.module.css';

interface ColumnControlProps {
  columns: Column[];
  onColumnsChange: (columns: Column[]) => void;
  onOpenEditModal?: (id: string) => void;
}

const ColumnControl: React.FC<ColumnControlProps> = ({ columns, onColumnsChange, onOpenEditModal }) => {
  const { t } = useTranslation();
  const spaceConfig = useSpaceConfigStore();

  // 기둥 생성 모드는 제거하고 드래그 앤 드롭 방식으로 대체
  const handleThumbnailDragStart = (e: React.DragEvent) => {
    console.log('🎯 기둥 썸네일 드래그 시작');
  };

  // 더블클릭 핸들러 추가
  const handleThumbnailDoubleClick = (columnData: any) => {
    // 공간 정보 가져오기
    const spaceInfo = spaceConfig.spaceInfo;
    if (!spaceInfo) return;

    // 공간 중앙에 기둥 배치
    const centerX = 0;
    const centerZ = -(spaceInfo.depth || 1500) * 0.01 / 2 + (columnData.depth * 0.01) / 2;

    const newColumn: Column = {
      id: `column-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      position: [centerX, 0, centerZ],
      width: columnData.width,
      height: columnData.height || spaceInfo.height || 2400,
      depth: columnData.depth,
      color: columnData.color || '#888888',
      material: columnData.material || 'concrete'
    };

    onColumnsChange([...columns, newColumn]);
  };

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
