import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
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
  const { selectedColumnId, setSelectedColumnId } = useUIStore();

  const spaceWidth = spaceConfig.spaceInfo.width || 3000;

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

  // 좌/우 갭 계산 (ColumnEditModal과 동일 로직)
  const getGaps = (col: Column) => {
    const columnX = col.position[0] * 100; // 3D 좌표 → mm
    const columnWidth = col.width;
    const maxGap = Math.max(0, spaceWidth - columnWidth);
    const leftGap = Math.max(0, Math.min(columnX + (spaceWidth / 2) - (columnWidth / 2), maxGap));
    const rightGap = Math.max(0, Math.min((spaceWidth / 2) - columnX - (columnWidth / 2), maxGap));
    return { leftGap, rightGap, maxGap };
  };

  // 좌측갭 변경 핸들러
  const handleLeftGapChange = (col: Column, value: number) => {
    const maxGap = Math.max(0, spaceWidth - col.width);
    const safeValue = Math.max(0, Math.min(value, maxGap));
    const newX = safeValue + (col.width / 2) - (spaceWidth / 2);
    const newPosition = [...col.position] as [number, number, number];
    newPosition[0] = newX / 100;
    onColumnsChange(columns.map(c => c.id === col.id ? { ...c, position: newPosition } : c));
  };

  // 우측갭 변경 핸들러
  const handleRightGapChange = (col: Column, value: number) => {
    const maxGap = Math.max(0, spaceWidth - col.width);
    const safeValue = Math.max(0, Math.min(value, maxGap));
    const newX = (spaceWidth / 2) - safeValue - (col.width / 2);
    const newPosition = [...col.position] as [number, number, number];
    newPosition[0] = newX / 100;
    onColumnsChange(columns.map(c => c.id === col.id ? { ...c, position: newPosition } : c));
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

      {/* 배치된 기둥 목록 */}
      {columns.length > 0 && (
        <div className={styles.columnList}>
          <h4>{t('sidebar.placedColumns') || '배치된 기둥'} ({columns.length})</h4>
          <div className={styles.columns}>
            {columns.map((col, index) => {
              const { leftGap, rightGap } = getGaps(col);
              return (
                <div
                  key={col.id}
                  className={`${styles.columnItem} ${selectedColumnId === col.id ? styles.selected : ''}`}
                  onClick={() => setSelectedColumnId(col.id)}
                >
                  <div className={styles.columnInfo}>
                    <span className={styles.columnName}>
                      {t('sidebar.column') || '기둥'}{String.fromCharCode(65 + index)} {col.width}×{col.depth}
                    </span>
                    <div className={styles.gapInputs}>
                      <label className={styles.gapLabel}>
                        <span>{t('column.leftGap') || '좌측갭'}</span>
                        <input
                          type="number"
                          className={styles.gapInput}
                          value={Math.round(leftGap)}
                          onChange={(e) => handleLeftGapChange(col, Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          step="10"
                          min="0"
                        />
                        <span className={styles.gapUnit}>mm</span>
                      </label>
                      <label className={styles.gapLabel}>
                        <span>{t('column.rightGap') || '우측갭'}</span>
                        <input
                          type="number"
                          className={styles.gapInput}
                          value={Math.round(rightGap)}
                          onChange={(e) => handleRightGapChange(col, Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          step="10"
                          min="0"
                        />
                        <span className={styles.gapUnit}>mm</span>
                      </label>
                    </div>
                  </div>
                  <div className={styles.columnActions}>
                    {onOpenEditModal && (
                      <button
                        className={styles.editButton}
                        onClick={(e) => { e.stopPropagation(); onOpenEditModal(col.id); }}
                        title={t('common.edit') || '편집'}
                      >
                        ✎
                      </button>
                    )}
                    <button
                      className={styles.removeButton}
                      onClick={(e) => { e.stopPropagation(); removeColumn(col.id); }}
                      title={t('common.delete') || '삭제'}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default ColumnControl;
