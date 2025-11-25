import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useTheme } from '@/contexts/ThemeContext';
import styles from './SlotSelector.module.css';

interface SlotSelectorProps {
  /** 4분할 뷰에서 사용할 때 true */
  forSplitView?: boolean;
  /** 4분할 뷰에서의 방향 (left 또는 right) */
  splitViewDirection?: 'left' | 'right';
  /** 컴팩트 모드 (4분할 뷰용) */
  compact?: boolean;
}

/**
 * 측면뷰용 슬롯 선택 컴포넌트
 * 2D 좌측/우측 측면뷰에서만 표시
 * 슬롯 개수만큼 버튼 생성하여 특정 슬롯만 보기 가능
 */
const SlotSelector: React.FC<SlotSelectorProps> = ({
  forSplitView = false,
  splitViewDirection,
  compact = false
}) => {
  const { viewMode, view2DDirection, selectedSlotIndex, setSelectedSlotIndex, view2DTheme } = useUIStore();
  const { columnCount, zones } = useDerivedSpaceStore();
  const { theme } = useTheme();
  const { spaceInfo } = useSpaceConfigStore();

  // 실제 방향 결정 (4분할 뷰에서는 splitViewDirection 사용)
  const effectiveDirection = forSplitView ? splitViewDirection : view2DDirection;

  // 측면뷰가 아닐 때 selectedSlotIndex를 null로 리셋 (4분할 뷰가 아닌 경우에만)
  React.useEffect(() => {
    if (!forSplitView && (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right'))) {
      // 측면뷰가 아닐 때 슬롯 선택 해제
      if (selectedSlotIndex !== null) {
        setSelectedSlotIndex(null);
      }
    }
  }, [viewMode, view2DDirection, selectedSlotIndex, setSelectedSlotIndex, forSplitView]);

  // 4분할 뷰가 아닌 경우: 2D 모드이고 좌측/우측 측면뷰일 때만 표시
  if (!forSplitView && (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right'))) {
    return null;
  }

  // 4분할 뷰인 경우: splitViewDirection이 left 또는 right인지 확인
  if (forSplitView && splitViewDirection !== 'left' && splitViewDirection !== 'right') {
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

  // 단내림 위치에 따른 슬롯 순서 결정
  const isDroppedOnLeft = spaceInfo?.droppedCeiling?.position === 'left';

  // 슬롯 배열 생성
  const slotButtons = [];

  if (isDroppedOnLeft) {
    // 단내림이 좌측: 번호도 역순, actualIndex도 역순
    // 8,7 / 6,5,4,3,2,1 → actualIndex: 7,6 / 5,4,3,2,1,0
    // 단내림 슬롯들 (역순)
    for (let i = droppedSlotCount - 1; i >= 0; i--) {
      slotButtons.push({
        displayIndex: normalSlotCount + droppedSlotCount - i, // 8, 7
        actualIndex: normalSlotCount + i, // 7, 6
        zone: 'dropped' as const
      });
    }
    // 일반 슬롯들 (역순)
    for (let i = normalSlotCount - 1; i >= 0; i--) {
      slotButtons.push({
        displayIndex: i + 1, // 6, 5, 4, 3, 2, 1
        actualIndex: i, // 5, 4, 3, 2, 1, 0
        zone: 'normal' as const
      });
    }
  } else {
    // 단내림이 우측: 1,2,3,4,5,6 / 7,8 → actualIndex: 0,1,2,3,4,5 / 6,7
    // 일반 슬롯들
    for (let i = 0; i < normalSlotCount; i++) {
      slotButtons.push({
        displayIndex: i + 1, // 1, 2, 3, 4, 5, 6
        actualIndex: i, // 0, 1, 2, 3, 4, 5
        zone: 'normal' as const
      });
    }
    // 단내림 슬롯들
    for (let i = 0; i < droppedSlotCount; i++) {
      slotButtons.push({
        displayIndex: normalSlotCount + i + 1, // 7, 8
        actualIndex: normalSlotCount + i, // 6, 7
        zone: 'dropped' as const
      });
    }
  }

  const finalSlotButtons = slotButtons;

  // 컴팩트 모드용 컨테이너 스타일
  const compactContainerStyle: React.CSSProperties = compact ? {
    backgroundColor: 'rgba(18, 18, 18, 0.85)',
    padding: '4px 8px',
    borderRadius: '6px',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(8px)',
    position: 'absolute',
    bottom: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    pointerEvents: 'auto'
  } : containerStyle;

  return (
    <div
      className={compact ? undefined : styles.slotSelector}
      style={compactContainerStyle}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={compact ? undefined : styles.slotButtons} style={compact ? { display: 'flex', gap: '3px', alignItems: 'center' } : undefined}>
        {finalSlotButtons.map((slot) => {
          const isActive = selectedSlotIndex === slot.actualIndex;
          const isDroppedZone = slot.zone === 'dropped';

          // 버튼 스타일 (다크/라이트 테마에 따른 색상)
          const baseButtonStyle: React.CSSProperties = isActive
            ? {
                backgroundColor: themeColor,
                borderColor: themeColor,
                color: 'white',
              }
            : isDroppedZone
            ? {
                backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
                borderColor: isDark ? '#303030' : '#c0c0c0',
                color: isDark ? '#d0d0d0' : '#555',
              }
            : {
                backgroundColor: isDark ? '#2a2a2a' : 'white',
                borderColor: isDark ? '#404040' : '#d0d0d0',
                color: isDark ? '#e0e0e0' : '#333',
              };

          // 컴팩트 모드용 버튼 스타일
          const buttonStyle: React.CSSProperties = compact
            ? {
                ...baseButtonStyle,
                minWidth: '24px',
                height: '22px',
                padding: '0 6px',
                border: '1px solid',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                pointerEvents: 'auto',
                position: 'relative' as const,
                zIndex: 10000
              }
            : baseButtonStyle;

          return (
            <button
              key={slot.actualIndex}
              className={compact ? undefined : `${styles.slotButton} ${isActive ? styles.active : ''}`}
              onClick={(e) => {
                e.stopPropagation(); // 4분할 뷰에서 클릭 이벤트 버블링 방지
                e.preventDefault();
                setSelectedSlotIndex(slot.actualIndex);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={buttonStyle}
              title={isDroppedZone ? '단내림 영역' : `슬롯 ${slot.displayIndex}`}
            >
              {slot.displayIndex}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SlotSelector;
