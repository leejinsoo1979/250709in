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
  const [sizeInputs, setSizeInputs] = React.useState({ width: '', depth: '', height: '' });
  
  const columns = spaceInfo.columns || [];
  const column = columns.find(col => col.id === columnId);

  React.useEffect(() => {
    if (!column) return;
    setSizeInputs({
      width: String(column.width ?? ''),
      depth: String(column.depth ?? ''),
      height: String(column.height ?? ''),
    });
  }, [column?.id, column?.width, column?.depth, column?.height]);
  
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

  const handleToggleLock = () => {
    handleColumnUpdate(column.id, { isLocked: !column.isLocked });
  };

  const isLocked = column.isLocked ?? false;
  const handleSizeInputChange = (field: 'width' | 'depth' | 'height', raw: string) => {
    if (raw !== '' && raw !== '-' && !/^-?\d*\.?\d*$/.test(raw)) return;
    setSizeInputs(prev => ({ ...prev, [field]: raw }));
    const next = Number(raw);
    if (raw !== '' && raw !== '-' && Number.isFinite(next)) {
      handleColumnUpdate(column.id, { [field]: next });
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
              value={sizeInputs.width}
              onChange={(e) => handleSizeInputChange('width', e.target.value)}
              min="100"
              max="1000"
              step="0.1"
              disabled={isLocked}
            />
          </div>
          <div className={styles.propertyItem}>
            <label>깊이 (mm)</label>
            <input
              type="number"
              value={sizeInputs.depth}
              onChange={(e) => handleSizeInputChange('depth', e.target.value)}
              min="100"
              max="1500"
              step="0.1"
              disabled={isLocked}
            />
          </div>
          <div className={styles.propertyItem}>
            <label>높이 (mm)</label>
            <input
              type="number"
              value={sizeInputs.height}
              onChange={(e) => handleSizeInputChange('height', e.target.value)}
              min="1000"
              max="3000"
              step="0.1"
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
            />
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleToggleLock}
          className={`${styles.lockButton} ${isLocked ? styles.locked : ''}`}
        >
          {isLocked ? '잠금 해제' : '기둥 잠금'}
        </button>
        <button
          onClick={() => handleRemoveColumn(column.id)}
          className={styles.deleteButton}
          disabled={isLocked}
        >
          기둥 삭제
        </button>
      </div>
    </div>
  );
};

export default ColumnProperties;
