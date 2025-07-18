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
      <div className={styles.header}>
        <h3>기둥 배치</h3>
      </div>

      {/* 기둥 썸네일 드래그 앤 드롭 */}
      <div className={styles.thumbnailSection}>
        <h4>기둥 종류</h4>
        <div className={styles.thumbnailGrid}>
          <ColumnThumbnail 
            material="concrete" 
            color="#888888"
            onDragStart={handleThumbnailDragStart}
          />
          <ColumnThumbnail 
            material="steel" 
            color="#B0B0B0"
            onDragStart={handleThumbnailDragStart}
          />
          <ColumnThumbnail 
            material="wood" 
            color="#D2691E"
            onDragStart={handleThumbnailDragStart}
          />
        </div>
      </div>

      <div className={styles.info}>
        <p>• 기둥을 드래그하여 3D 뷰어에 배치</p>
        <p>• 기둥 클릭으로 편집, 더블클릭으로 삭제</p>
        <p>• 공간 경계 내에서만 배치 가능</p>
      </div>

      {/* 기둥 목록 */}
      <div className={styles.columnList}>
        <h4>배치된 기둥 ({columns.length}개)</h4>
        {columns.length === 0 ? (
          <p className={styles.emptyState}>배치된 기둥이 없습니다.</p>
        ) : (
          <div className={styles.columns}>
            {columns.map((column) => (
              <div 
                key={column.id}
                className={`${styles.columnItem} ${selectedColumnId === column.id ? styles.selected : ''}`}
                onClick={() => setSelectedColumnId(column.id)}
              >
                <div className={styles.columnInfo}>
                  <span className={styles.columnName}>기둥 {column.id.split('-')[1]}</span>
                  <span className={styles.columnSize}>
                    {column.width}×{column.depth}×{column.height}mm
                  </span>
                </div>
                <button
                  className={styles.removeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeColumn(column.id);
                  }}
                  title="기둥 삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 선택된 기둥 설정 */}
      {selectedColumn && (
        <div className={styles.columnSettings}>
          <h4>기둥 설정</h4>
          
          <div className={styles.settingGroup}>
            <label>크기 (mm)</label>
            <div className={styles.sizeInputs}>
              <div className={styles.inputGroup}>
                <label>폭</label>
                <input
                  type="number"
                  value={selectedColumn.width}
                  onChange={(e) => updateColumn(selectedColumn.id, { width: parseInt(e.target.value) })}
                  min="800"
                  max="3000"
                  step="200"
                />
              </div>
              <div className={styles.inputGroup}>
                <label>높이</label>
                <input
                  type="number"
                  value={selectedColumn.height}
                  onChange={(e) => {
                    const newHeight = parseInt(e.target.value);
                    // 바닥 기준으로 Y 위치는 항상 0
                    updateColumn(selectedColumn.id, { 
                      height: newHeight,
                      position: [selectedColumn.position[0], 0, selectedColumn.position[2]] as [number, number, number]
                    });
                  }}
                  min="2000"
                  max="5000"
                  step="100"
                />
              </div>
              <div className={styles.inputGroup}>
                <label>깊이</label>
                <input
                  type="number"
                  value={selectedColumn.depth}
                  onChange={(e) => {
                    const newDepth = parseInt(e.target.value);
                    // 뒷벽에 붙은 상태 유지하면서 깊이 변경
                    const spaceDepthM = (spaceConfig.spaceInfo?.depth || 1500) * 0.01;
                    const newColumnDepthM = newDepth * 0.01;
                    const newZPosition = -(spaceDepthM / 2) + (newColumnDepthM / 2);
                    
                    updateColumn(selectedColumn.id, { 
                      depth: newDepth,
                      position: [selectedColumn.position[0], selectedColumn.position[1], newZPosition] as [number, number, number]
                    });
                  }}
                  min="800"
                  max="3000"
                  step="200"
                />
              </div>
            </div>
          </div>

          <div className={styles.settingGroup}>
            <label>색상</label>
            <input
              type="color"
              value={selectedColumn.color}
              onChange={(e) => updateColumn(selectedColumn.id, { color: e.target.value })}
            />
          </div>

          <div className={styles.settingGroup}>
            <label>재질</label>
            <select
              value={selectedColumn.material}
              onChange={(e) => updateColumn(selectedColumn.id, { material: e.target.value })}
            >
              <option value="concrete">콘크리트</option>
              <option value="steel">철골</option>
              <option value="wood">목재</option>
            </select>
          </div>

          <div className={styles.settingGroup}>
            <label>벽면 간격 (mm)</label>
            <div className={styles.positionInputs}>
              <div className={styles.inputGroup}>
                <label>좌측갭</label>
                <input
                  type="number"
                  value={(() => {
                    // 좌측 벽과의 거리 계산
                    const spaceWidthM = (spaceConfig.spaceInfo?.width || 3600) * 0.01;
                    const columnWidthM = selectedColumn.width * 0.01;
                    const distanceToLeft = Math.round((spaceWidthM / 2 + selectedColumn.position[0] - columnWidthM / 2) * 100);
                    return Math.max(0, distanceToLeft);
                  })()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    const spaceWidthM = (spaceConfig.spaceInfo?.width || 3600) * 0.01;
                    const columnWidthM = selectedColumn.width * 0.01;
                    // 새로운 X 위치 계산: 좌측 벽 + 간격 + 기둥 폭의 절반
                    const newX = -(spaceWidthM / 2) + (value * 0.01) + (columnWidthM / 2);
                    const newPos = [...selectedColumn.position] as [number, number, number];
                    newPos[0] = newX;
                    updateColumn(selectedColumn.id, { position: newPos });
                  }}
                  min="0"
                  step="10"
                />
              </div>
              <div className={styles.inputGroup}>
                <label>우측갭</label>
                <input
                  type="number"
                  value={(() => {
                    // 우측 벽과의 거리 계산
                    const spaceWidthM = (spaceConfig.spaceInfo?.width || 3600) * 0.01;
                    const columnWidthM = selectedColumn.width * 0.01;
                    const distanceToRight = Math.round((spaceWidthM / 2 - selectedColumn.position[0] - columnWidthM / 2) * 100);
                    return Math.max(0, distanceToRight);
                  })()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    const spaceWidthM = (spaceConfig.spaceInfo?.width || 3600) * 0.01;
                    const columnWidthM = selectedColumn.width * 0.01;
                    // 새로운 X 위치 계산: 우측 벽 - 간격 - 기둥 폭의 절반
                    const newX = (spaceWidthM / 2) - (value * 0.01) - (columnWidthM / 2);
                    const newPos = [...selectedColumn.position] as [number, number, number];
                    newPos[0] = newX;
                    updateColumn(selectedColumn.id, { position: newPos });
                  }}
                  min="0"
                  step="10"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnControl;