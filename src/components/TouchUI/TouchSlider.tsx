import React, { useRef, useState, useCallback, useEffect } from 'react';
import styles from './TouchSlider.module.css';

interface TouchSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  disabled?: boolean;
}

export const TouchSlider: React.FC<TouchSliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit = '',
  disabled = false,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  // 값 변경 처리
  const handleValueChange = useCallback((newValue: number) => {
    const clampedValue = Math.max(min, Math.min(max, newValue));
    const steppedValue = Math.round(clampedValue / step) * step;
    setLocalValue(steppedValue);
    onChange(steppedValue);
  }, [min, max, step, onChange]);

  // 터치/마우스 위치를 값으로 변환
  const positionToValue = useCallback((clientX: number) => {
    if (!sliderRef.current) return value;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const percentage = (clientX - rect.left) / rect.width;
    return min + (max - min) * Math.max(0, Math.min(1, percentage));
  }, [min, max, value]);

  // 터치 시작
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    setIsDragging(true);
    const touch = e.touches[0];
    const newValue = positionToValue(touch.clientX);
    handleValueChange(newValue);
  }, [disabled, positionToValue, handleValueChange]);

  // 터치 이동
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || disabled) return;
    e.preventDefault();
    const touch = e.touches[0];
    const newValue = positionToValue(touch.clientX);
    handleValueChange(newValue);
  }, [isDragging, disabled, positionToValue, handleValueChange]);

  // 터치 종료
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 마우스 이벤트 (데스크톱 호환성)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    setIsDragging(true);
    const newValue = positionToValue(e.clientX);
    handleValueChange(newValue);
  }, [disabled, positionToValue, handleValueChange]);

  // 버튼 클릭 핸들러
  const handleDecrement = useCallback(() => {
    if (!disabled) {
      handleValueChange(localValue - step);
    }
  }, [disabled, localValue, step, handleValueChange]);

  const handleIncrement = useCallback(() => {
    if (!disabled) {
      handleValueChange(localValue + step);
    }
  }, [disabled, localValue, step, handleValueChange]);

  // 전역 마우스 이벤트
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || disabled) return;
      const newValue = positionToValue(e.clientX);
      handleValueChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, disabled, positionToValue, handleValueChange]);

  // 외부 값 변경 시 동기화
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const percentage = ((localValue - min) / (max - min)) * 100;

  return (
    <div className={`${styles.touchSlider} ${disabled ? styles.disabled : ''}`}>
      {label && (
        <div className={styles.label}>
          <span>{label}</span>
          <span className={styles.value}>
            {localValue}{unit}
          </span>
        </div>
      )}
      
      <div className={styles.controls}>
        <button
          className={styles.button}
          onClick={handleDecrement}
          disabled={disabled || localValue <= min}
          aria-label="감소"
        >
          −
        </button>
        
        <div
          ref={sliderRef}
          className={styles.sliderTrack}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div
            className={styles.sliderFill}
            style={{ width: `${percentage}%` }}
          />
          <div
            className={styles.sliderHandle}
            style={{ left: `${percentage}%` }}
          />
        </div>
        
        <button
          className={styles.button}
          onClick={handleIncrement}
          disabled={disabled || localValue >= max}
          aria-label="증가"
        >
          +
        </button>
      </div>
    </div>
  );
};