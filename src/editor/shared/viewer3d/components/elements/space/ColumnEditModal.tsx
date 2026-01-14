import React, { useState, useEffect } from 'react';
import { Column } from '@/types/space';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import styles from './ColumnEditModal.module.css';

interface ColumnEditModalProps {
  column: Column | null;
  isOpen: boolean;
  onClose: () => void;
  spaceInfo: any;
}

const ColumnEditModal: React.FC<ColumnEditModalProps> = ({ 
  column, 
  isOpen, 
  onClose, 
  spaceInfo 
}) => {
  const { updateColumn, removeColumn } = useSpaceConfigStore();
  const [editedColumn, setEditedColumn] = useState<Column | null>(null);

  useEffect(() => {
    if (column) {
      setEditedColumn({ ...column });
    }
  }, [column]);

  if (!isOpen || !column || !editedColumn) {
    return null;
  }

  const handleSizeChange = (dimension: 'width' | 'height' | 'depth', value: number) => {
    const updated = { ...editedColumn, [dimension]: value };
    setEditedColumn(updated);
    updateColumn(column.id, { [dimension]: value });
  };

  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    const newPosition = [...editedColumn.position] as [number, number, number];
    const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    newPosition[axisIndex] = value;
    
    const updated = { ...editedColumn, position: newPosition };
    setEditedColumn(updated);
    updateColumn(column.id, { position: newPosition });
  };

  const handleColorChange = (color: string) => {
    const updated = { ...editedColumn, color };
    setEditedColumn(updated);
    updateColumn(column.id, { color });
  };

  const handleMaterialChange = (material: 'concrete' | 'steel' | 'wood') => {
    const updated = { ...editedColumn, material };
    setEditedColumn(updated);
    updateColumn(column.id, { material });
  };

  const handleBackPanelFinishChange = (hasBackPanelFinish: boolean) => {
    const updated = { ...editedColumn, hasBackPanelFinish };
    setEditedColumn(updated);
    updateColumn(column.id, { hasBackPanelFinish });
  };

  const handleFrontPanelFinishChange = (hasFrontPanelFinish: boolean) => {
    const updated = { ...editedColumn, hasFrontPanelFinish };
    setEditedColumn(updated);
    updateColumn(column.id, { hasFrontPanelFinish });
  };

  const handleDelete = () => {
    if (window.confirm('기둥을 삭제하시겠습니까?')) {
      removeColumn(column.id);
      onClose();
    }
  };

  // 공간 제한 계산
  const spaceWidthM = (spaceInfo?.width || 3600) * 0.001;
  const spaceHeightM = (spaceInfo?.height || 2400) * 0.001;
  const spaceDepthM = (spaceInfo?.depth || 1500) * 0.001;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>기둥 설정</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.modalBody}>
          {/* 기둥 크기 설정 */}
          <div className={styles.section}>
            <h3>크기 설정 (mm)</h3>
            <div className={styles.sizeControls}>
              <div className={styles.inputGroup}>
                <label>폭 (Width)</label>
                <input
                  type="range"
                  min="200"
                  max="5000"
                  step="100"
                  value={editedColumn.width}
                  onChange={(e) => handleSizeChange('width', parseInt(e.target.value))}
                />
                <input
                  type="number"
                  value={editedColumn.width}
                  onChange={(e) => handleSizeChange('width', parseInt(e.target.value))}
                  min="200"
                  max="5000"
                  step="100"
                />
              </div>

              <div className={styles.inputGroup}>
                <label>높이 (Height)</label>
                <input
                  type="range"
                  min="1000"
                  max="30000"
                  step="500"
                  value={editedColumn.height}
                  onChange={(e) => handleSizeChange('height', parseInt(e.target.value))}
                />
                <input
                  type="number"
                  value={editedColumn.height}
                  onChange={(e) => handleSizeChange('height', parseInt(e.target.value))}
                  min="1000"
                  max="30000"
                  step="500"
                />
              </div>

              <div className={styles.inputGroup}>
                <label>깊이 (Depth)</label>
                <input
                  type="range"
                  min="200"
                  max="5000"
                  step="100"
                  value={editedColumn.depth}
                  onChange={(e) => handleSizeChange('depth', parseInt(e.target.value))}
                />
                <input
                  type="number"
                  value={editedColumn.depth}
                  onChange={(e) => handleSizeChange('depth', parseInt(e.target.value))}
                  min="200"
                  max="5000"
                  step="100"
                />
              </div>
            </div>
          </div>

          {/* 위치 설정 */}
          <div className={styles.section}>
            <h3>위치 설정 (m)</h3>
            <div className={styles.positionControls}>
              <div className={styles.inputGroup}>
                <label>X축 (좌우)</label>
                <input
                  type="range"
                  min={-spaceWidthM / 2}
                  max={spaceWidthM / 2}
                  step="0.1"
                  value={editedColumn.position[0]}
                  onChange={(e) => handlePositionChange('x', parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  value={editedColumn.position[0].toFixed(2)}
                  onChange={(e) => handlePositionChange('x', parseFloat(e.target.value))}
                  step="0.1"
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Y축 (상하)</label>
                <input
                  type="range"
                  min="0"
                  max={spaceHeightM}
                  step="0.1"
                  value={editedColumn.position[1]}
                  onChange={(e) => handlePositionChange('y', parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  value={editedColumn.position[1].toFixed(2)}
                  onChange={(e) => handlePositionChange('y', parseFloat(e.target.value))}
                  step="0.1"
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Z축 (앞뒤)</label>
                <input
                  type="range"
                  min={-spaceDepthM / 2}
                  max={spaceDepthM / 2}
                  step="0.1"
                  value={editedColumn.position[2]}
                  onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  value={editedColumn.position[2].toFixed(2)}
                  onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* 벽면 간격 설정 */}
          <div className={styles.section}>
            <h3>벽면 간격 설정 (mm)</h3>
            <div className={styles.distanceControls}>
              <div className={styles.distanceInfo}>
                <div className={styles.distanceItem}>
                  <label>왼쪽 벽까지의 거리</label>
                  <span className={styles.distanceValue}>
                    {((spaceWidthM / 2 + editedColumn.position[0]) * 1000).toFixed(0)}mm
                  </span>
                  <input
                    type="number"
                    value={Math.round((spaceWidthM / 2 + editedColumn.position[0]) * 1000)}
                    onChange={(e) => {
                      const distanceFromLeft = parseInt(e.target.value);
                      const newX = (distanceFromLeft / 1000) - (spaceWidthM / 2);
                      handlePositionChange('x', newX);
                    }}
                    min="0"
                    max={spaceWidthM * 1000}
                    step="10"
                  />
                </div>

                <div className={styles.distanceItem}>
                  <label>오른쪽 벽까지의 거리</label>
                  <span className={styles.distanceValue}>
                    {((spaceWidthM / 2 - editedColumn.position[0]) * 1000).toFixed(0)}mm
                  </span>
                  <input
                    type="number"
                    value={Math.round((spaceWidthM / 2 - editedColumn.position[0]) * 1000)}
                    onChange={(e) => {
                      const distanceFromRight = parseInt(e.target.value);
                      const newX = (spaceWidthM / 2) - (distanceFromRight / 1000);
                      handlePositionChange('x', newX);
                    }}
                    min="0"
                    max={spaceWidthM * 1000}
                    step="10"
                  />
                </div>

                <div className={styles.distanceItem}>
                  <label>앞벽까지의 거리</label>
                  <span className={styles.distanceValue}>
                    {((spaceDepthM / 2 + editedColumn.position[2]) * 1000).toFixed(0)}mm
                  </span>
                  <input
                    type="number"
                    value={Math.round((spaceDepthM / 2 + editedColumn.position[2]) * 1000)}
                    onChange={(e) => {
                      const distanceFromFront = parseInt(e.target.value);
                      const newZ = (distanceFromFront / 1000) - (spaceDepthM / 2);
                      handlePositionChange('z', newZ);
                    }}
                    min="0"
                    max={spaceDepthM * 1000}
                    step="10"
                  />
                </div>

                <div className={styles.distanceItem}>
                  <label>뒷벽까지의 거리</label>
                  <span className={styles.distanceValue}>
                    {((spaceDepthM / 2 - editedColumn.position[2]) * 1000).toFixed(0)}mm
                  </span>
                  <input
                    type="number"
                    value={Math.round((spaceDepthM / 2 - editedColumn.position[2]) * 1000)}
                    onChange={(e) => {
                      const distanceFromBack = parseInt(e.target.value);
                      const newZ = (spaceDepthM / 2) - (distanceFromBack / 1000);
                      handlePositionChange('z', newZ);
                    }}
                    min="0"
                    max={spaceDepthM * 1000}
                    step="10"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 색상 및 재질 설정 */}
          <div className={styles.section}>
            <h3>외관 설정</h3>
            <div className={styles.appearanceControls}>
              <div className={styles.inputGroup}>
                <label>색상</label>
                <input
                  type="color"
                  value={editedColumn.color}
                  onChange={(e) => handleColorChange(e.target.value)}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>재질</label>
                <select
                  value={editedColumn.material}
                  onChange={(e) => handleMaterialChange(e.target.value as 'concrete' | 'steel' | 'wood')}
                >
                  <option value="concrete">콘크리트</option>
                  <option value="steel">철골</option>
                  <option value="wood">목재</option>
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={editedColumn.hasBackPanelFinish || false}
                    onChange={(e) => handleBackPanelFinishChange(e.target.checked)}
                  />
                  뒷면 패널 마감
                </label>
              </div>

              <div className={styles.inputGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={editedColumn.hasFrontPanelFinish || false}
                    onChange={(e) => handleFrontPanelFinishChange(e.target.checked)}
                  />
                  전면 패널 마감
                </label>
              </div>
            </div>
          </div>

          {/* 정보 표시 */}
          <div className={styles.section}>
            <h3>기둥 정보</h3>
            <div className={styles.infoGrid}>
              <div>ID: {column.id}</div>
              <div>크기: {editedColumn.width}×{editedColumn.depth}×{editedColumn.height}mm</div>
              <div>위치: ({editedColumn.position[0].toFixed(2)}, {editedColumn.position[1].toFixed(2)}, {editedColumn.position[2].toFixed(2)})m</div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.deleteButton} onClick={handleDelete}>
            기둥 삭제
          </button>
          <button className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnEditModal;