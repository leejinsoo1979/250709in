import React from 'react';
import { Column } from '@/types/space';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import styles from './ColumnProperties.module.css';

interface ColumnPropertiesProps {
  columnId: string;
}

const ColumnProperties: React.FC<ColumnPropertiesProps> = ({ columnId }) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { activePopup, closeAllPopups } = useUIStore();
  
  const columns = spaceInfo.columns || [];
  const column = columns.find(col => col.id === columnId);
  
  if (!column) {
    return (
      <div className={styles.columnProperties}>
        <div className={styles.header}>
          <h3>기둥 속성</h3>
        </div>
        <div className={styles.empty}>
          <p>기둥을 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  const handleColumnUpdate = (id: string, updates: Partial<Column>) => {
    const updatedColumns = columns.map(col => 
      col.id === id ? { ...col, ...updates } : col
    );
    setSpaceInfo({ columns: updatedColumns });
  };

  const handleRemoveColumn = (id: string) => {
    if (window.confirm('기둥을 삭제하시겠습니까?')) {
      const updatedColumns = columns.filter(col => col.id !== id);
      setSpaceInfo({ columns: updatedColumns });
    }
  };

  return (
    <div className={styles.columnProperties}>
      <div className={styles.header}>
        <h3>기둥 속성</h3>
        <span className={styles.columnId}>기둥 {column.id.split('-')[1]}</span>
        <button className={styles.closeButton} onClick={closeAllPopups}>
          ✕
        </button>
      </div>

      <div className={styles.propertySection}>
        <h4>크기</h4>
        <div className={styles.propertyGroup}>
          <div className={styles.propertyItem}>
            <label>폭 (mm)</label>
            <input
              type="number"
              value={column.width}
              onChange={(e) => handleColumnUpdate(column.id, { width: Number(e.target.value) })}
              min="100"
              max="1000"
              step="10"
            />
          </div>
          <div className={styles.propertyItem}>
            <label>깊이 (mm)</label>
            <input
              type="number"
              value={column.depth}
              onChange={(e) => handleColumnUpdate(column.id, { depth: Number(e.target.value) })}
              min="100"
              max="1500"
              step="10"
            />
          </div>
          <div className={styles.propertyItem}>
            <label>높이 (mm)</label>
            <input
              type="number"
              value={column.height}
              onChange={(e) => handleColumnUpdate(column.id, { height: Number(e.target.value) })}
              min="1000"
              max="3000"
              step="10"
            />
          </div>
        </div>
      </div>

      <div className={styles.propertySection}>
        <h4>위치</h4>
        <div className={styles.propertyGroup}>
          <div className={styles.propertyItem}>
            <label>X 좌표 (mm)</label>
            <input
              type="number"
              value={Math.round(column.position[0] * 100)}
              onChange={(e) => handleColumnUpdate(column.id, { 
                position: [Number(e.target.value) / 100, column.position[1], column.position[2]] as [number, number, number]
              })}
              step="10"
            />
          </div>
          <div className={styles.propertyItem}>
            <label>Y 좌표 (mm)</label>
            <input
              type="number"
              value={Math.round(column.position[1] * 100)}
              onChange={(e) => handleColumnUpdate(column.id, { 
                position: [column.position[0], Number(e.target.value) / 100, column.position[2]] as [number, number, number]
              })}
              step="10"
            />
          </div>
          <div className={styles.propertyItem}>
            <label>Z 좌표 (mm)</label>
            <input
              type="number"
              value={Math.round(column.position[2] * 100)}
              onChange={(e) => handleColumnUpdate(column.id, { 
                position: [column.position[0], column.position[1], Number(e.target.value) / 100] as [number, number, number]
              })}
              step="10"
            />
          </div>
        </div>
      </div>

      <div className={styles.propertySection}>
        <h4>재질</h4>
        <div className={styles.propertyGroup}>
          <div className={styles.propertyItem}>
            <label>재질</label>
            <select
              value={column.material}
              onChange={(e) => handleColumnUpdate(column.id, { material: e.target.value as 'concrete' | 'steel' | 'wood' })}
            >
              <option value="concrete">콘크리트</option>
              <option value="steel">철골</option>
              <option value="wood">목재</option>
            </select>
          </div>
          <div className={styles.propertyItem}>
            <label>색상</label>
            <input
              type="color"
              value={column.color}
              onChange={(e) => handleColumnUpdate(column.id, { color: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={() => handleRemoveColumn(column.id)}
          className={styles.deleteButton}
        >
          기둥 삭제
        </button>
      </div>
    </div>
  );
};

export default ColumnProperties;