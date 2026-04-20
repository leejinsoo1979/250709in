import React, { useState, useEffect } from 'react';
import { SpaceInfo, DEFAULT_SPACE_VALUES, SPACE_LIMITS } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';

interface WidthControlProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
}

const WidthControl: React.FC<WidthControlProps> = ({ spaceInfo, onUpdate, disabled = false }) => {
  const [error, setError] = useState<string>();
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // 커튼박스는 공간 너비에 포함되지만 사용자에겐 가구 배치 공간(= width - cbWidth)만 표시
  const cbWidth = spaceInfo?.curtainBox?.enabled ? (spaceInfo.curtainBox.width || 150) : 0;
  const storedWidth = spaceInfo?.width || DEFAULT_SPACE_VALUES.WIDTH;
  const displayWidth = storedWidth - cbWidth; // 사용자에게 보이는 "가구 공간 너비"

  // 입력 중인 값을 위한 로컬 상태
  const [inputValue, setInputValue] = useState<string>(displayWidth.toString());

  // spaceInfo가 변경되면 로컬 상태 업데이트
  useEffect(() => {
    setInputValue(displayWidth.toString());
  }, [displayWidth]);

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
      setInputValue(displayWidth.toString());
      return;
    }

    const numValue = parseInt(value); // 사용자가 입력한 "가구 공간" 너비
    // 범위 검증은 가구 공간 기준 (실제 저장값은 + cbWidth)
    const minValue = SPACE_LIMITS.WIDTH.MIN;
    const maxValue = SPACE_LIMITS.WIDTH.MAX - cbWidth;

    if (numValue < minValue) {
      setError(`최소 ${minValue}mm 이상이어야 합니다`);
    } else if (numValue > maxValue) {
      setError(`최대 ${maxValue}mm 이하여야 합니다`);
    } else {
      setError('');
      onUpdate({
        width: numValue + cbWidth, // 저장은 커튼박스 포함 총 폭
      });
    }
  };

  // Enter 키 및 화살표 키 처리
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      
      const currentValue = parseInt(inputValue) || displayWidth;
      const minValue = SPACE_LIMITS.WIDTH.MIN;
      const maxValue = SPACE_LIMITS.WIDTH.MAX - cbWidth;

      let newValue;
      if (e.key === 'ArrowUp') {
        newValue = Math.min(currentValue + 1, maxValue);
      } else {
        newValue = Math.max(currentValue - 1, minValue);
      }

      if (newValue !== currentValue) {
        setInputValue(newValue.toString());
        setError('');
        onUpdate({
          width: newValue + cbWidth, // 저장은 커튼박스 포함 총 폭
        });
      }
    }
  };

  return (
    <div className={styles.inputWrapper} style={{ position: 'relative' }}>
      {isFocused && (
        <label className={`${styles.inputLabel} ${disabled ? styles.disabledLabel : ''}`} style={{ position: 'absolute', bottom: '-20px', fontSize: '11px', color: '#5b21b6', zIndex: 10 }}>
          {SPACE_LIMITS.WIDTH.MIN}~{SPACE_LIMITS.WIDTH.MAX}mm
          {disabled && <span className={styles.disabledText}> (수정불가)</span>}
        </label>
      )}
      <div className={styles.inputWithUnit}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            handleInputBlur();
          }}
          onKeyDown={handleKeyDown}
          className={`${styles.input} ${styles.inputWithUnitField} ${error ? styles.inputError : ''}`}
          placeholder={`${SPACE_LIMITS.WIDTH.MIN}-${SPACE_LIMITS.WIDTH.MAX}`}
          disabled={disabled}
        />
        <span className={styles.unit}>mm</span>
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
    </div>
  );
};

export default WidthControl; 