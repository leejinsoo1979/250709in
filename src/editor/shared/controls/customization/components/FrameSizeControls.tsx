import React from 'react';
import { FrameSize } from '@/store/core/spaceConfigStore';
import { useUIStore, HighlightedFrame } from '@/store/uiStore';
import styles from '../../styles/common.module.css';

interface FrameSizeControlsProps {
  frameSize: FrameSize;
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
  const handleInputFocus = (frame: HighlightedFrame) => {
    setHighlightedFrame(frame);
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
        <div className={styles.description}>
          벽이 있는 쪽은 40~100mm 범위에서 조정 가능하며, 벽이 없는 쪽은 18mm 엔드패널로 고정됩니다.
        </div>
        {surroundFrameWidth && (
          <div className={styles.infoBox} style={{ marginBottom: '12px' }}>
            <span>프레임 폭 내경: <strong>{surroundFrameWidth}mm</strong></span>
            <span className={styles.infoDetail}>
              (전체 폭 {spaceWidth}mm - 좌측 프레임 {!hasLeftWall ? END_PANEL_WIDTH : frameSize.left}mm - 우측 프레임 {!hasRightWall ? END_PANEL_WIDTH : frameSize.right}mm)
            </span>
            <span className={styles.infoDetail} style={{ marginTop: '4px' }}>
              슬롯 수: <strong>{columnInfo.columnCount}개</strong> / 슬롯당 너비: <strong>{columnInfo.columnWidth}mm</strong>
            </span>
          </div>
        )}
        <div className={styles.inputGroup} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>좌측 (40~100)</label>
            <input
              type="number"
              min="40"
              max="100"
              value={!hasLeftWall ? END_PANEL_WIDTH : frameSize.left}
              onChange={(e) => handleRealTimeChange('left', e.target.value)}
              onFocus={() => handleInputFocus('left')}
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
              type="number"
              min="40"
              max="100"
              value={!hasRightWall ? END_PANEL_WIDTH : frameSize.right}
              onChange={(e) => handleRealTimeChange('right', e.target.value)}
              onFocus={() => handleInputFocus('right')}
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
              type="number"
              min="10"
              max="200"
              value={frameSize.top}
              onChange={(e) => handleRealTimeChange('top', e.target.value)}
              onFocus={() => handleInputFocus('top')}
              onBlur={() => handleInputBlur('top')}
              onKeyDown={(e) => onKeyDown(e, 'top')}
              className={styles.input}
              placeholder="10"
            />
          </div>
        </div>
      </div>
    );
  }

  // 노서라운드 모드
  return (
    <div className={styles.section}>
      <span className={styles.label}>프레임 설정</span>
      <p className={styles.description}>
        노서라운드에서는 좌우 프레임이 제거되고, 선택한 이격거리({gapSize}mm)에 따라 
        상/하단 프레임 폭이 자동 계산됩니다.
      </p>
      {noSurroundFrameWidth && (
        <div className={styles.infoBox} style={{ marginBottom: '12px' }}>
          <span>프레임 폭 내경: <strong>{noSurroundFrameWidth}mm</strong></span>
          <span className={styles.infoDetail}>
            (전체 폭 {spaceWidth}mm - 좌우 이격거리 각 {gapSize}mm)
          </span>
          <span className={styles.infoDetail} style={{ marginTop: '4px' }}>
            슬롯 수: <strong>{columnInfo.columnCount}개</strong> / 슬롯당 너비: <strong>{columnInfo.columnWidth}mm</strong>
          </span>
        </div>
      )}
      <div className={styles.inputGroup}>
        <div className={styles.inputWrapper}>
          <label className={styles.inputLabel}>상단 (10~200)</label>
          <input
            type="number"
            min="10"
            max="200"
            value={frameSize.top}
            onChange={(e) => handleRealTimeChange('top', e.target.value)}
            onFocus={() => handleInputFocus('top')}
            onBlur={() => handleInputBlur('top')}
            onKeyDown={(e) => onKeyDown(e, 'top')}
            className={styles.input}
            placeholder="50"
          />
        </div>
      </div>
    </div>
  );
};

export default FrameSizeControls; 