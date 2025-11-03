import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useTheme } from '@/contexts/ThemeContext';
import styles from './SlotSelector.module.css';

/**
 * 측면뷰용 슬롯 선택 컴포넌트
 * 2D 좌측/우측 측면뷰에서만 표시
 * 슬롯 개수만큼 버튼 생성하여 특정 슬롯만 보기 가능
 */
const SlotSelector: React.FC = () => {
  const { viewMode, view2DDirection, selectedSlotIndex, setSelectedSlotIndex, view2DTheme } = useUIStore();
  const { columnCount, zones } = useDerivedSpaceStore();
  const { theme } = useTheme();

  // 측면뷰가 아닐 때 selectedSlotIndex를 null로 리셋
  React.useEffect(() => {
    if (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right')) {
      // 측면뷰가 아닐 때 슬롯 선택 해제
      if (selectedSlotIndex !== null) {
        setSelectedSlotIndex(null);
      }
    }
  }, [viewMode, view2DDirection, selectedSlotIndex, setSelectedSlotIndex]);

  // 2D 모드이고 좌측/우측 측면뷰일 때만 표시
  if (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right')) {
    return null;
  }

  // 테마 색상 매핑
  const themeColorMap: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };

  const themeColor = themeColorMap[theme.color] || '#3b82f6';

  // 컨테이너 스타일 (다크/라이트 테마 적용)
  const isDark = view2DTheme === 'dark';
  const containerStyle: React.CSSProperties = {
    backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
  };

  // 일반 영역과 단내림 영역 슬롯 개수 계산
  const normalSlotCount = zones?.normal?.columnCount || columnCount;
  const droppedSlotCount = zones?.dropped?.columnCount || 0;
  const totalSlots = normalSlotCount + droppedSlotCount;

  return (
    <div className={styles.slotSelector} style={containerStyle}>
      <div className={styles.slotButtons}>
        {/* 일반 영역 슬롯 버튼들 */}
        {Array.from({ length: normalSlotCount }, (_, index) => {
          const isActive = selectedSlotIndex === index;

          // 버튼 스타일 (다크/라이트 테마에 따른 색상)
          const buttonStyle: React.CSSProperties = isActive
            ? {
                backgroundColor: themeColor,
                borderColor: themeColor,
                color: 'white',
              }
            : {
                backgroundColor: isDark ? '#2a2a2a' : 'white',
                borderColor: isDark ? '#404040' : '#d0d0d0',
                color: isDark ? '#e0e0e0' : '#333',
              };

          return (
            <button
              key={index}
              className={`${styles.slotButton} ${isActive ? styles.active : ''}`}
              onClick={() => setSelectedSlotIndex(index)}
              style={buttonStyle}
            >
              {index + 1}
            </button>
          );
        })}

        {/* 단내림 영역 슬롯 버튼들 (있는 경우) */}
        {droppedSlotCount > 0 && Array.from({ length: droppedSlotCount }, (_, index) => {
          const slotIndex = normalSlotCount + index;
          const isActive = selectedSlotIndex === slotIndex;

          // 버튼 스타일 (단내림 영역은 약간 다른 색상)
          const buttonStyle: React.CSSProperties = isActive
            ? {
                backgroundColor: themeColor,
                borderColor: themeColor,
                color: 'white',
              }
            : {
                backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
                borderColor: isDark ? '#303030' : '#c0c0c0',
                color: isDark ? '#d0d0d0' : '#555',
              };

          return (
            <button
              key={slotIndex}
              className={`${styles.slotButton} ${isActive ? styles.active : ''}`}
              onClick={() => setSelectedSlotIndex(slotIndex)}
              style={buttonStyle}
              title="단내림 영역"
            >
              {slotIndex + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SlotSelector;
