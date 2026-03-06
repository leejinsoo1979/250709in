import React from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { TouchSlider } from '@/components/TouchUI/TouchSlider';
import { TouchNumberInput } from '@/components/TouchUI/TouchNumberInput';
import styles from '../style.module.css';
import rightPanelStyles from './RightPanel.module.css';

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
  if (type === 'slider') {
    // 원래의 커스텀 도어 슬라이더 사용 (RightPanel의 디자인)
    const [isDragging, setIsDragging] = React.useState(false);
    
    // 슬라이더 라벨 생성
    const labels = [];
    for (let i = min; i <= max; i += step) {
      labels.push(i);
    }
    
    // 슬라이더 위치 계산 (0-100%)
    const getSliderPosition = (val: number) => {
      if (max === min) return 0;
      return ((val - min) / (max - min)) * 100;
    };
    
    // 위치에서 값 계산
    const getValueFromPosition = (position: number) => {
      const normalizedPosition = Math.max(0, Math.min(100, position));
      const val = Math.round(min + (normalizedPosition / 100) * (max - min));
      return Math.max(min, Math.min(max, val));
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      handleMouseMove(e);
    };
    
    const handleMouseMove = (e: React.MouseEvent | MouseEvent) => {
      if (!isDragging && e.type !== 'mousedown') return;
      
      const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect() || 
                   (e.target as HTMLElement)?.closest(`.${rightPanelStyles.sliderTrack}`)?.getBoundingClientRect();
      
      if (!rect) return;
      
      const position = ((e.clientX - rect.left) / rect.width) * 100;
      const newValue = getValueFromPosition(position);
      
      if (newValue !== value) {
        onChange(newValue);
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    React.useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isDragging]);
    
    const sliderPosition = getSliderPosition(value);
    
    return (
      <div className={styles.inputGroup}>
        <div className={styles.inputRow}>
          <label className={styles.inputLabel}>{label}</label>
          <div className={rightPanelStyles.doorSlider}>
            <div 
              className={rightPanelStyles.sliderTrack}
              onMouseDown={handleMouseDown}
            >
              {/* 슬라이더 구간 표시 */}
              {labels.map((_, index) => {
                const isActive = index <= labels.findIndex(l => l >= value);
                return (
                  <div
                    key={index}
                    className={`${rightPanelStyles.sliderDivider} ${isActive ? rightPanelStyles.active : ''}`}
                  />
                );
              })}
              
              {/* 슬라이더 핸들 */}
              <div 
                className={rightPanelStyles.sliderHandle}
                style={{ left: `${sliderPosition}%` }}
              />
            </div>
            
            {/* 슬라이더 라벨 */}
            <div className={rightPanelStyles.sliderLabels}>
              {labels.map((num) => (
                <span 
                  key={num} 
                  className={num === value ? rightPanelStyles.active : ''}
                  onClick={() => onChange(num)}
                >
                  {num}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // 숫자 타입일 때는 기존 그대로
  return (
    <div className={styles.inputGroup}>
      <div className={styles.inputRow}>
        <label className={styles.inputLabel}>{label}</label>
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
      </div>
    </div>
  );
};