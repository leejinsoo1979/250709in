import React from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { TouchSlider } from '@/components/TouchUI/TouchSlider';
import { TouchNumberInput } from '@/components/TouchUI/TouchNumberInput';
import styles from '../style.module.css';

interface ControlWrapperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  type?: 'slider' | 'number';
}

export const TouchCompatibleControl: React.FC<ControlWrapperProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'mm',
  onChange,
  disabled = false,
  type = 'number',
}) => {
  const { isTouchDevice, isMobile, isTablet } = useResponsive();
  
  // 터치 디바이스나 모바일/태블릿에서는 터치 최적화 컴포넌트 사용
  if (isTouchDevice || isMobile || isTablet) {
    if (type === 'slider') {
      return (
        <TouchSlider
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
          disabled={disabled}
        />
      );
    } else {
      return (
        <TouchNumberInput
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          onChange={onChange}
          disabled={disabled}
        />
      );
    }
  }
  
  // 데스크톱에서는 기존 컨트롤 사용
  return (
    <div className={styles.inputGroup}>
      <div className={styles.inputRow}>
        <label className={styles.inputLabel}>{label}</label>
        {type === 'slider' ? (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className={styles.doorSlider}
            disabled={disabled}
          />
        ) : (
          <div className={styles.numberInputGroup}>
            <button 
              className={styles.decrementButton}
              onClick={() => onChange(Math.max(min, value - step))}
              disabled={disabled || value <= min}
            >
              −
            </button>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className={styles.numberInput}
              disabled={disabled}
            />
            <button 
              className={styles.incrementButton}
              onClick={() => onChange(Math.min(max, value + step))}
              disabled={disabled || value >= max}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
};