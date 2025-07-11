import React from 'react';
import { FrameSize } from '@/store/core/spaceConfigStore';
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
            <label className={styles.inputLabel}>좌측 (40~100mm)</label>
            <div className={styles.inputWithUnit}>
              <input
                type="text"
                value={!hasLeftWall ? END_PANEL_WIDTH : frameSize.left}
                onChange={(e) => onFrameSizeChange('left', e.target.value)}
                onBlur={() => onFrameSizeBlur('left')}
                onKeyDown={(e) => onKeyDown(e, 'left')}
                className={`${styles.input} ${styles.inputWithUnitField} ${!hasLeftWall ? styles.inputError : ''}`}
                placeholder="50"
                disabled={!hasLeftWall}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>
          
          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>우측 (40~100mm)</label>
            <div className={styles.inputWithUnit}>
              <input
                type="text"
                value={!hasRightWall ? END_PANEL_WIDTH : frameSize.right}
                onChange={(e) => onFrameSizeChange('right', e.target.value)}
                onBlur={() => onFrameSizeBlur('right')}
                onKeyDown={(e) => onKeyDown(e, 'right')}
                className={`${styles.input} ${styles.inputWithUnitField} ${!hasRightWall ? styles.inputError : ''}`}
                placeholder="50"
                disabled={!hasRightWall}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>
          
          <div className={styles.inputWrapper}>
            <label className={styles.inputLabel}>상단 (10~200mm)</label>
            <div className={styles.inputWithUnit}>
              <input
                type="text"
                value={frameSize.top}
                onChange={(e) => onFrameSizeChange('top', e.target.value)}
                onBlur={() => onFrameSizeBlur('top')}
                onKeyDown={(e) => onKeyDown(e, 'top')}
                className={`${styles.input} ${styles.inputWithUnitField}`}
                placeholder="10"
              />
              <span className={styles.unit}>mm</span>
            </div>
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
          <label className={styles.inputLabel}>상단 (mm)</label>
          <div className={styles.inputWithUnit}>
            <input
              type="text"
              value={frameSize.top}
              onChange={(e) => onFrameSizeChange('top', e.target.value)}
              onBlur={() => onFrameSizeBlur('top')}
              onKeyDown={(e) => onKeyDown(e, 'top')}
              className={`${styles.input} ${styles.inputWithUnitField}`}
              placeholder="50"
            />
            <span className={styles.unit}>mm</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrameSizeControls; 