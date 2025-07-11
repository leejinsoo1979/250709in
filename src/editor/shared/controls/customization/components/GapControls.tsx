import React from 'react';
import styles from '../../styles/common.module.css';

interface GapControlsProps {
  gapSize: 2 | 3;
  onGapSizeChange: (size: 2 | 3) => void;
}

const GapControls: React.FC<GapControlsProps> = ({
  gapSize,
  onGapSizeChange
}) => {
  return (
    <div className={styles.section}>
      <span className={styles.label}>이격거리 설정</span>
      <p className={styles.description}>노서라운드 옵션 선택 시 이격거리를 선택해주세요:</p>
      <div className={styles.radioGroup}>
        <button
          className={`${styles.button} ${gapSize === 2 ? styles.buttonActive : ''}`}
          onClick={() => onGapSizeChange(2)}
        >
          2mm
        </button>
        <button
          className={`${styles.button} ${gapSize === 3 ? styles.buttonActive : ''}`}
          onClick={() => onGapSizeChange(3)}
        >
          3mm
        </button>
      </div>
    </div>
  );
};

export default GapControls; 