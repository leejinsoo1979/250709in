import React, { useState, useEffect, useRef } from 'react';
import { Column } from '@/types/space';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import styles from './ColumnEditModal.module.css';

interface ColumnEditModalProps {
  columnId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const ColumnEditModal: React.FC<ColumnEditModalProps> = ({ 
  columnId, 
  isOpen, 
  onClose 
}) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { setSelectedColumnId, activePopup, closeAllPopups } = useUIStore();
  
  const columns = spaceInfo.columns || [];
  const column = columnId ? columns.find(col => col.id === columnId) : null;

  // 원본 column 값 저장 (취소 시 복원용)
  const originalColumnRef = useRef<Column | null>(null);

  // 로컬 상태로 편집 중인 값들을 관리
  const [editValues, setEditValues] = useState<Partial<Column>>({});

  // 모달이 열릴 때마다 현재 기둥 값으로 초기화 + 원본 저장
  useEffect(() => {
    if (column && isOpen) {
      setEditValues({
        width: column.width,
        height: column.height,
        depth: column.depth,
        position: [...column.position]
      });
      originalColumnRef.current = { ...column };
    }
  }, [column, isOpen]);

  // columnEdit 팝업이 활성화되지 않았거나 다른 기둥이 편집 중이면 렌더링하지 않음
  if (!isOpen || !column || activePopup.type !== 'columnEdit' || activePopup.id !== columnId) {
    return null;
  }

  // store에 실시간 반영
  const updateColumnInStore = (partial: Partial<Column>) => {
    const updatedColumns = columns.map(col =>
      col.id === column.id ? { ...col, ...partial } : col
    );
    setSpaceInfo({ columns: updatedColumns });
  };

  // 입력값 변경 핸들러 (실시간 반영)
  const handleInputChange = (field: keyof Column, value: any) => {
    setEditValues(prev => {
      const newValues = {
        ...prev,
        [field]: value
      };
      // 깊이 변경 시 Z 위치 자동 조정
      if (field === 'depth') {
        const spaceDepth = spaceInfo.depth || 1500;
        const newDepth = value;
        const newZ = -(spaceDepth / 2) + (newDepth / 2);
        const currentPosition = prev.position || column.position;
        newValues.position = [currentPosition[0], currentPosition[1], newZ / 100];
      }
      // store에 즉시 반영
      updateColumnInStore({ ...column, ...newValues });
      return newValues;
    });
  };

  // 좌측갭/우측갭 계산 및 변경 핸들러 (실시간 반영)
  const spaceWidth = spaceInfo.width || 3000;
  const columnX = (editValues.position?.[0] || column.position[0]) * 100;
  const columnWidth = editValues.width || column.width;
  const minGap = 0;
  const maxGap = Math.max(0, spaceWidth - columnWidth);
  const leftGap = Math.max(minGap, Math.min(columnX + (spaceWidth / 2) - (columnWidth / 2), maxGap));
  const rightGap = Math.max(minGap, Math.min((spaceWidth / 2) - columnX - (columnWidth / 2), maxGap));

  const handleLeftGapChange = (value: number) => {
    const safeValue = Math.max(minGap, Math.min(value, maxGap));
    const newX = safeValue + (columnWidth / 2) - (spaceWidth / 2);
    const newPosition = [...(editValues.position || column.position)] as [number, number, number];
    newPosition[0] = newX / 100;
    setEditValues(prev => {
      const newValues = { ...prev, position: newPosition };
      updateColumnInStore({ ...column, ...newValues });
      return newValues;
    });
  };
  
  const handleRightGapChange = (value: number) => {
    const safeValue = Math.max(minGap, Math.min(value, maxGap));
    const newX = (spaceWidth / 2) - safeValue - (columnWidth / 2);
    const newPosition = [...(editValues.position || column.position)] as [number, number, number];
    newPosition[0] = newX / 100;
    setEditValues(prev => {
      const newValues = { ...prev, position: newPosition };
      updateColumnInStore({ ...column, ...newValues });
      return newValues;
    });
  };

  // 확인(저장) 버튼: 모달만 닫음
  const handleSave = () => {
    onClose();
  };

  // 취소 버튼: 원본 값으로 복원
  const handleCancel = () => {
    if (originalColumnRef.current) {
      const updatedColumns = columns.map(col =>
        col.id === column.id ? { ...originalColumnRef.current! } : col
      );
      setSpaceInfo({ columns: updatedColumns });
    }
    setEditValues({});
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('기둥을 삭제하시겠습니까?')) {
      const updatedColumns = columns.filter(col => col.id !== column.id);
      setSpaceInfo({ columns: updatedColumns });
      setSelectedColumnId(null);
      onClose();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.title}>기둥 편집</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className={styles.modalContent}>
          {/* 기둥 정보 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>기본 정보</h4>
            <div className={styles.infoRow}>
              <span>기둥 ID:</span>
              <span className={styles.columnId}>{column.id.split('-')[1]}</span>
            </div>
          </div>

          {/* 크기 설정 - 한 줄로 표시 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>크기</h4>
            <div className={styles.inputRow}>
              <div className={styles.inputItem}>
                <label>폭 (mm)</label>
                <input
                  type="number"
                  value={editValues.width || column.width}
                  onChange={(e) => handleInputChange('width', Number(e.target.value))}
                  min="100"
                  max="1000"
                  step="10"
                />
              </div>
              <div className={styles.inputItem}>
                <label>깊이 (mm)</label>
                <input
                  type="number"
                  value={editValues.depth || column.depth}
                  onChange={(e) => handleInputChange('depth', Number(e.target.value))}
                  min="100"
                  max="1500"
                  step="10"
                />
              </div>
              <div className={styles.inputItem}>
                <label>높이 (mm)</label>
                <input
                  type="number"
                  value={editValues.height || column.height}
                  onChange={(e) => handleInputChange('height', Number(e.target.value))}
                  min="1000"
                  max="3000"
                  step="10"
                />
              </div>
            </div>
          </div>

          {/* 위치 설정 - 좌측갭, 우측갭으로 표시 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>위치</h4>
            <div className={styles.inputRow}>
              <div className={styles.inputItem}>
                <label>좌측갭 (mm)</label>
                <input
                  type="number"
                  value={Math.round(leftGap)}
                  onChange={(e) => handleLeftGapChange(Number(e.target.value))}
                  step="10"
                />
              </div>
              <div className={styles.inputItem}>
                <label>우측갭 (mm)</label>
                <input
                  type="number"
                  value={Math.round(rightGap)}
                  onChange={(e) => handleRightGapChange(Number(e.target.value))}
                  step="10"
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.deleteButton} onClick={handleDelete}>
            삭제
          </button>
          <div className={styles.actionButtons}>
            <button className={styles.cancelButton} onClick={handleCancel}>
              취소
            </button>
            <button className={styles.saveButton} onClick={handleSave}>
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnEditModal; 