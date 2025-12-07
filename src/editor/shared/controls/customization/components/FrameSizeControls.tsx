import React from 'react';
import { useUIStore, HighlightedFrame } from '@/store/uiStore';
import styles from '../../styles/common.module.css';

// 입력 중 빈 문자열을 허용하기 위한 타입
type LocalFrameSize = {
  left: number | string;
  right: number | string;
  top: number | string;
};

interface FrameSizeControlsProps {
  frameSize: LocalFrameSize;
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
  onFrameSizeBlur: (dimension: 'left' | 'right' | 'top') => void;
  onKeyDown: (e: React.KeyboardEvent, dimension: 'left' | 'right' | 'top') => void;
}

const FrameSizeControls: React.FC<FrameSizeControlsProps> = ({
  frameSize,
  hasLeftWall,
  hasRightWall,
  isSurround,
  surroundFrameWidth,
  noSurroundFrameWidth,
  gapSize,
  spaceWidth,
  columnInfo,
  onFrameSizeChange,
  onFrameSizeBlur,
  onKeyDown
}) => {
  const END_PANEL_WIDTH = 18; // 고정 18mm
  const { setHighlightedFrame } = useUIStore();

  // 입력 필드 포커스 핸들러
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>, frame: HighlightedFrame) => {
    setHighlightedFrame(frame);
    // 포커스 시 전체 텍스트 선택
    e.target.select();
  };

  // 입력 필드 블러 핸들러
  const handleInputBlur = (dimension: 'left' | 'right' | 'top') => {
    setHighlightedFrame(null);
    onFrameSizeBlur(dimension);
  };

  // 실시간 변경 핸들러 (onChange 시 즉시 업데이트)
  const handleRealTimeChange = (dimension: 'left' | 'right' | 'top', value: string) => {
    onFrameSizeChange(dimension, value);
  };

  if (isSurround) {
    return (
      <div className={styles.section}>
        <span className={styles.label}>프레임 설정</span>
        <div className={styles.inputGroup} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>좌측 (40~100)</label>
            <input
              type="text"
              value={!hasLeftWall ? END_PANEL_WIDTH : frameSize.left}
              onChange={(e) => handleRealTimeChange('left', e.target.value)}
              onFocus={(e) => handleInputFocus(e, 'left')}
              onBlur={() => handleInputBlur('left')}
              onKeyDown={(e) => onKeyDown(e, 'left')}
              className={`${styles.input} ${!hasLeftWall ? styles.inputError : ''}`}
              placeholder="50"
              disabled={!hasLeftWall}
            />
          </div>

          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>우측 (40~100)</label>
            <input
              type="text"
              value={!hasRightWall ? END_PANEL_WIDTH : frameSize.right}
              onChange={(e) => handleRealTimeChange('right', e.target.value)}
              onFocus={(e) => handleInputFocus(e, 'right')}
              onBlur={() => handleInputBlur('right')}
              onKeyDown={(e) => onKeyDown(e, 'right')}
              className={`${styles.input} ${!hasRightWall ? styles.inputError : ''}`}
              placeholder="50"
              disabled={!hasRightWall}
            />
          </div>

          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>상단 (10~200)</label>
            <input
              type="text"
              value={frameSize.top}
              onChange={(e) => handleRealTimeChange('top', e.target.value)}
              onFocus={(e) => handleInputFocus(e, 'top')}
              onBlur={() => handleInputBlur('top')}
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
          <input
            type="text"
            value={frameSize.top}
            onChange={(e) => handleRealTimeChange('top', e.target.value)}
            onFocus={(e) => handleInputFocus(e, 'top')}
            onBlur={() => handleInputBlur('top')}
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