import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './TouchNumberInput.module.css';

interface TouchNumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  disabled?: boolean;
}

export const TouchNumberInput: React.FC<TouchNumberInputProps> = ({
  value,
  min = 0,
  max = Infinity,
  step = 1,
  onChange,
  label,
  unit = '',
  disabled = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value.toString());
  const [showKeypad, setShowKeypad] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startY = useRef<number>(0);
  const startValue = useRef<number>(value);

  // 스와이프로 값 조정
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isEditing) return;
    startY.current = e.touches[0].clientY;
    startValue.current = value;
  }, [disabled, isEditing, value]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || isEditing) return;
    e.preventDefault();
    
    const deltaY = startY.current - e.touches[0].clientY;
    const sensitivity = 0.5; // 스와이프 민감도
    const deltaValue = Math.round(deltaY * sensitivity) * step;
    const newValue = Math.max(min, Math.min(max, startValue.current + deltaValue));
    
    onChange(newValue);
  }, [disabled, isEditing, min, max, step, onChange]);

  // 터치 숫자 키패드
  const handleKeypadPress = useCallback((digit: string) => {
    if (digit === 'clear') {
      setLocalValue('');
    } else if (digit === 'delete') {
      setLocalValue(prev => prev.slice(0, -1));
    } else if (digit === 'done') {
      const numValue = parseFloat(localValue) || 0;
      const clampedValue = Math.max(min, Math.min(max, numValue));
      onChange(clampedValue);
      setShowKeypad(false);
      setIsEditing(false);
    } else if (digit === '.') {
      if (!localValue.includes('.')) {
        setLocalValue(prev => prev + digit);
      }
    } else {
      setLocalValue(prev => prev + digit);
    }
  }, [localValue, min, max, onChange]);

  // 버튼 클릭 핸들러
  const handleDecrement = useCallback(() => {
    if (!disabled) {
      const newValue = Math.max(min, value - step);
      onChange(newValue);
    }
  }, [disabled, value, min, step, onChange]);

  const handleIncrement = useCallback(() => {
    if (!disabled) {
      const newValue = Math.min(max, value + step);
      onChange(newValue);
    }
  }, [disabled, value, max, step, onChange]);

  // 입력 필드 클릭
  const handleInputClick = useCallback(() => {
    if (!disabled) {
      setIsEditing(true);
      setShowKeypad(true);
      setLocalValue(value.toString());
    }
  }, [disabled, value]);

  // 외부 값 변경 시 동기화
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value.toString());
    }
  }, [value, isEditing]);

  return (
    <>
      <div className={`${styles.touchNumberInput} ${disabled ? styles.disabled : ''}`}>
        {label && (
          <div className={styles.label}>{label}</div>
        )}
        
        <div className={styles.controls}>
          <button
            className={styles.button}
            onClick={handleDecrement}
            disabled={disabled || value <= min}
            aria-label="감소"
          >
            −
          </button>
          
          <div
            className={styles.inputWrapper}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
          >
            <input
              ref={inputRef}
              type="text"
              className={styles.input}
              value={isEditing ? localValue : value}
              onClick={handleInputClick}
              readOnly
              disabled={disabled}
            />
            {unit && <span className={styles.unit}>{unit}</span>}
          </div>
          
          <button
            className={styles.button}
            onClick={handleIncrement}
            disabled={disabled || value >= max}
            aria-label="증가"
          >
            +
          </button>
        </div>
        
        {!isEditing && (
          <div className={styles.hint}>위아래로 스와이프하여 조정</div>
        )}
      </div>

      {/* 터치 키패드 */}
      {showKeypad && (
        <div className={styles.keypadOverlay} onClick={() => setShowKeypad(false)}>
          <div className={styles.keypad} onClick={(e) => e.stopPropagation()}>
            <div className={styles.keypadDisplay}>{localValue || '0'}</div>
            <div className={styles.keypadGrid}>
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'delete'].map((key) => (
                <button
                  key={key}
                  className={`${styles.keypadButton} ${key === 'delete' ? styles.deleteButton : ''}`}
                  onClick={() => handleKeypadPress(key)}
                >
                  {key === 'delete' ? '⌫' : key}
                </button>
              ))}
            </div>
            <div className={styles.keypadActions}>
              <button
                className={`${styles.keypadButton} ${styles.clearButton}`}
                onClick={() => handleKeypadPress('clear')}
              >
                지우기
              </button>
              <button
                className={`${styles.keypadButton} ${styles.doneButton}`}
                onClick={() => handleKeypadPress('done')}
              >
                완료
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};