import React from 'react';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import styles from './SlotSelector.module.css';

/**
 * 측면뷰용 슬롯 선택 컴포넌트
 * 2D 좌측/우측 측면뷰에서만 표시
 * 슬롯 개수만큼 버튼 생성하여 특정 슬롯만 보기 가능
 */
const SlotSelector: React.FC = () => {
  const { viewMode, view2DDirection, selectedSlotIndex, setSelectedSlotIndex } = useUIStore();
  const { columnCount } = useDerivedSpaceStore();

  // 2D 모드이고 좌측/우측 측면뷰일 때만 표시
  if (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right')) {
    return null;
  }

  // 슬롯 개수 (columnCount + 1)
  const slotCount = columnCount + 1;

  return (
    <div className={styles.slotSelector}>
      <div className={styles.slotButtons}>
        {/* 전체 보기 버튼 */}
        <button
          className={`${styles.slotButton} ${selectedSlotIndex === null ? styles.active : ''}`}
          onClick={() => setSelectedSlotIndex(null)}
        >
          전체
        </button>

        {/* 슬롯 선택 버튼들 (1번부터 N번까지) */}
        {Array.from({ length: slotCount }, (_, index) => (
          <button
            key={index}
            className={`${styles.slotButton} ${selectedSlotIndex === index ? styles.active : ''}`}
            onClick={() => setSelectedSlotIndex(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SlotSelector;
