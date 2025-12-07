import React, { useState, useEffect, useRef } from 'react';
import { useUIStore, HighlightedFrame } from '@/store/uiStore';
import styles from '../../styles/common.module.css';

interface FrameSizeControlsProps {
  frameSize: {
    left: number;
    right: number;
    top: number;
  };
  hasLeftWall: boolean;
  hasRightWall: boolean;
  isSurround: boolean;
  surroundFrameWidth?: number | null;
  noSurroundFrameWidth?: number | null;
  gapSize?: 2 | 3;
  spaceWidth: number;
  columnInfo: {
    columnCount: number;
    columnWidth: number;
  };
  onFrameSizeChange: (dimension: 'left' | 'right' | 'top', value: string) => void;
  onFrameSizeBlur: (dimension: 'left' | 'right' | 'top', value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, dimension: 'left' | 'right' | 'top') => void;
}

// 개별 숫자 입력 필드 컴포넌트
interface NumberInputProps {
  value: number;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  onBlur,
  onKeyDown,
  onFocus,
  disabled,
  placeholder,
  className
}) => {
  const [inputValue, setInputValue] = useState(String(value));
  const isEditingRef = useRef(false);

  // 외부 value가 변경되고 편집 중이 아닐 때만 동기화
  useEffect(() => {
    if (!isEditingRef.current) {
      setInputValue(String(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // 숫자만 허용 (빈 문자열도 허용)
    if (newValue === '' || /^\d+$/.test(newValue)) {
      setInputValue(newValue);
      onChange(newValue);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isEditingRef.current = true;
    onFocus(e);
  };

  const handleBlur = () => {
    isEditingRef.current = false;
    onBlur(inputValue);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={inputValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
};

const FrameSizeControls: React.FC<FrameSizeControlsProps> = ({
  frameSize,
  hasLeftWall,
  hasRightWall,
  isSurround,
  onFrameSizeChange,
  onFrameSizeBlur,
  onKeyDown
}) => {
  const END_PANEL_WIDTH = 18;
  const { setHighlightedFrame } = useUIStore();

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>, frame: HighlightedFrame) => {
    setHighlightedFrame(frame);
    e.target.select();
  };

  const handleInputBlur = (dimension: 'left' | 'right' | 'top') => (value: string) => {
    setHighlightedFrame(null);
    onFrameSizeBlur(dimension, value);
  };

  // frameSize 값을 숫자로 변환 (안전하게)
  const getNumericValue = (val: number | string): number => {
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return val;
  };

  if (isSurround) {
    return (
      <div className={styles.section}>
        <span className={styles.label}>프레임 설정</span>
        <div className={styles.inputGroup} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>좌측 (40~100)</label>
            <NumberInput
              value={!hasLeftWall ? END_PANEL_WIDTH : getNumericValue(frameSize.left)}
              onChange={(val) => onFrameSizeChange('left', val)}
              onFocus={(e) => handleInputFocus(e, 'left')}
              onBlur={handleInputBlur('left')}
              onKeyDown={(e) => onKeyDown(e, 'left')}
              className={`${styles.input} ${!hasLeftWall ? styles.inputError : ''}`}
              placeholder="50"
              disabled={!hasLeftWall}
            />
          </div>

          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>우측 (40~100)</label>
            <NumberInput
              value={!hasRightWall ? END_PANEL_WIDTH : getNumericValue(frameSize.right)}
              onChange={(val) => onFrameSizeChange('right', val)}
              onFocus={(e) => handleInputFocus(e, 'right')}
              onBlur={handleInputBlur('right')}
              onKeyDown={(e) => onKeyDown(e, 'right')}
              className={`${styles.input} ${!hasRightWall ? styles.inputError : ''}`}
              placeholder="50"
              disabled={!hasRightWall}
            />
          </div>

          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>상단 (10~200)</label>
            <NumberInput
              value={getNumericValue(frameSize.top)}
              onChange={(val) => onFrameSizeChange('top', val)}
              onFocus={(e) => handleInputFocus(e, 'top')}
              onBlur={handleInputBlur('top')}
              onKeyDown={(e) => onKeyDown(e, 'top')}
              className={styles.input}
              placeholder="10"
            />
          </div>
        </div>
        <div className={styles.hint} style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          (키보드 상,하 커서키로 숫자를 변경하세요)
        </div>
      </div>
    );
  }

  // 노서라운드 모드
  return (
    <div className={styles.section}>
      <span className={styles.label}>프레임 설정</span>
      <div className={styles.inputGroup}>
        <div className={styles.inputWrapper}>
          <label className={styles.inputLabel}>상단 (10~200)</label>
          <NumberInput
            value={getNumericValue(frameSize.top)}
            onChange={(val) => onFrameSizeChange('top', val)}
            onFocus={(e) => handleInputFocus(e, 'top')}
            onBlur={handleInputBlur('top')}
            onKeyDown={(e) => onKeyDown(e, 'top')}
            className={styles.input}
            placeholder="50"
          />
        </div>
      </div>
      <div className={styles.hint} style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
        (키보드 상,하 커서키로 숫자를 변경하세요)
      </div>
    </div>
  );
};

export default FrameSizeControls;
