import React, { useState, useEffect } from 'react';
import { SpaceInfo, DEFAULT_SPACE_VALUES, SPACE_LIMITS } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';

interface HeightControlProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const HeightControl: React.FC<HeightControlProps> = ({ spaceInfo, onUpdate }) => {
  const [error, setError] = useState<string>();
  
  // 안전한 기본값 제공
  const safeHeight = spaceInfo?.height || DEFAULT_SPACE_VALUES.HEIGHT;
  
  // 입력 중인 값을 위한 로컬 상태
  const [inputValue, setInputValue] = useState<string>(safeHeight.toString());

  // spaceInfo가 변경되면 로컬 상태 업데이트
  useEffect(() => {
    setInputValue(safeHeight.toString());
  }, [safeHeight]);

  // 입력 중에는 로컬 상태만 업데이트
  const handleInputChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setInputValue(value);
    }
  };

  // 입력 완료 후 유효성 검사 및 상태 업데이트
  const handleInputBlur = () => {
    const value = inputValue;
    if (value === '') {
      // 빈 값인 경우 기존 값으로 되돌림
      setInputValue(safeHeight.toString());
      return;
    }
    
    const numValue = parseInt(value);
    // 범위 검증 (높이: 1500~3500mm)
    const minValue = SPACE_LIMITS.HEIGHT.MIN;
    const maxValue = SPACE_LIMITS.HEIGHT.MAX;
    
    // 범위 검증
    if (numValue < minValue) {
      setError(`최소 ${minValue}mm 이상이어야 합니다`);
    } else if (numValue > maxValue) {
      setError(`최대 ${maxValue}mm 이하여야 합니다`);
    } else {
      setError('');
      onUpdate({
        height: numValue
      });
    }
  };

  // Enter 키 및 화살표 키 처리
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      
      const currentValue = parseInt(inputValue) || safeHeight;
      const minValue = SPACE_LIMITS.HEIGHT.MIN;
      const maxValue = SPACE_LIMITS.HEIGHT.MAX;
      
      let newValue;
      if (e.key === 'ArrowUp') {
        newValue = Math.min(currentValue + 1, maxValue);
      } else {
        newValue = Math.max(currentValue - 1, minValue);
      }
      
      if (newValue !== currentValue) {
        // 로컬 상태와 스토어를 동기적으로 업데이트
        setInputValue(newValue.toString());
        setError('');
        onUpdate({
          height: newValue
        });
      }
    }
  };

  return (
    <div className={styles.inputWrapper}>
      <label className={styles.inputLabel}>높이 ({SPACE_LIMITS.HEIGHT.MIN}mm ~ {SPACE_LIMITS.HEIGHT.MAX}mm)</label>
      <div className={styles.inputWithUnit}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className={`${styles.input} ${styles.inputWithUnitField} ${error ? styles.inputError : ''}`}
          placeholder={`${SPACE_LIMITS.HEIGHT.MIN}-${SPACE_LIMITS.HEIGHT.MAX}`}
        />
        <span className={styles.unit}>mm</span>
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
    </div>
  );
};

export default HeightControl; 