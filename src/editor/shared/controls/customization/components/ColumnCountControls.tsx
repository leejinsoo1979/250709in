import React from 'react';
import { FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';

interface ColumnLimits {
  minColumns: number;
  maxColumns: number;
  canUseSingle: boolean;
  canUseDual: boolean;
}

interface ColumnCountControlsProps {
  columnCount: number;
  internalWidth: number;
  columnLimits: ColumnLimits;
  currentColumnWidth: number;
  isAutoMode: boolean;
  onColumnCountChange: (newCount: number) => void;
  onResetColumnCount: () => void;
  disabled?: boolean;
}

const ColumnCountControls: React.FC<ColumnCountControlsProps> = ({
  columnCount,
  internalWidth,
  columnLimits,
  currentColumnWidth,
  isAutoMode,
  onColumnCountChange,
  onResetColumnCount,
  disabled = false
}) => {
  return (
    <div className={styles.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`${styles.label} ${disabled ? styles.disabledLabel : ''}`}>
          컬럼 수 설정
          {disabled && <span className={styles.disabledText}> (스타일러장, 바지걸이장 배치시 수정불가)</span>}
        </span>
        {!isAutoMode && (
          <button
            className={`${styles.button}`}
            onClick={onResetColumnCount}
            style={{ fontSize: '12px', padding: '4px 8px' }}
            disabled={disabled}
          >
            자동
          </button>
        )}
      </div>
      
      <div className={styles.inputWrapper}>
        <input
          type="range"
          min={columnLimits.minColumns}
          max={columnLimits.maxColumns}
          value={columnCount}
          onChange={(e) => !disabled && onColumnCountChange(parseInt(e.target.value))}
          className={styles.slider}
          style={{ width: '100%' }}
          disabled={disabled}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginTop: '4px' }}>
          <span>{columnLimits.minColumns}</span>
          <span>{columnLimits.maxColumns}</span>
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
          {columnCount}개 컬럼 × {currentColumnWidth}mm
        </span>
        <span style={{ fontSize: '12px', color: isAutoMode ? '#007AFF' : '#666' }}>
          {isAutoMode ? '자동' : '수동'}
        </span>
      </div>
      
      <p className={styles.description}>
        내경폭 {internalWidth}mm를 {columnCount}개 컬럼으로 분할
        {!columnLimits.canUseSingle && <><br />※ 싱글장 사용 불가 (내경폭 {'>'} 600mm)</>}
        {!columnLimits.canUseDual && <><br />※ 듀얼장 사용 불가 (내경폭 {'>'} {FURNITURE_LIMITS.DUAL_THRESHOLD}mm)</>}
      </p>
    </div>
  );
};

export default ColumnCountControls; 