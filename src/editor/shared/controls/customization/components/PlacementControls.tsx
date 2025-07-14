import React from 'react';
import { BaseConfig } from '@/store/core/spaceConfigStore';
import { useUIStore, HighlightedFrame } from '@/store/uiStore';
import styles from '../../styles/common.module.css';

interface PlacementControlsProps {
  baseConfig?: BaseConfig;
  baseHeight: string | number;
  floatHeight: string | number;
  onPlacementTypeChange: (placementType: 'ground' | 'float') => void;
  onHeightChange: (value: string) => void;
  onFloatHeightChange: (value: string) => void;
  onHeightBlur: () => void;
  onFloatHeightBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFloatKeyDown: (e: React.KeyboardEvent) => void;
}

const PlacementControls: React.FC<PlacementControlsProps> = ({
  baseConfig,
  baseHeight,
  floatHeight,
  onPlacementTypeChange,
  onHeightChange,
  onFloatHeightChange,
  onHeightBlur,
  onFloatHeightBlur,
  onKeyDown,
  onFloatKeyDown
}) => {
  const { setHighlightedFrame } = useUIStore();
  const isFloor = baseConfig?.type === 'floor' || !baseConfig;
  const isStand = baseConfig?.type === 'stand';
  const isGround = baseConfig?.placementType === 'ground';
  const isFloat = baseConfig?.placementType === 'float';

  // 입력 필드 포커스 핸들러
  const handleInputFocus = () => {
    setHighlightedFrame('base');
  };

  // 입력 필드 블러 핸들러
  const handleInputBlur = () => {
    setHighlightedFrame(null);
    onHeightBlur();
  };

  // 띄움 높이 블러 핸들러
  const handleFloatInputBlur = () => {
    setHighlightedFrame(null);
    onFloatHeightBlur();
  };

  return (
    <>
      {/* 받침대 있음 - 높이 설정 */}
      {isFloor && (
        <div className={styles.section}>
          <span className={styles.label}>받침대 높이 (mm)</span>
          <p className={styles.description}>
            받침대는 바닥마감재 위에 적용되며, 기본값은 65mm입니다. (50-100mm)
          </p>
          <div className={styles.inputWrapper}>
            <div className={styles.inputWithUnit}>
              <input
                type="text"
                value={baseHeight}
                onChange={(e) => onHeightChange(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={onKeyDown}
                className={`${styles.input} ${styles.inputWithUnitField}`}
                placeholder="65"
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>
          <p className={styles.description}>
            받침대는 바닥마감재 위에서부터 {baseHeight}mm 길이로 설치됩니다.
          </p>
        </div>
      )}

      {/* 받침대 없음 - 배치 설정 */}
      {isStand && (
        <div className={styles.section}>
          <span className={styles.label}>배치 설정</span>
          <div className={styles.radioGroup}>
            <button
              className={`${styles.button} ${isGround ? styles.buttonActive : ''}`}
              onClick={() => onPlacementTypeChange('ground')}
            >
              바닥에 배치
            </button>
            <button
              className={`${styles.button} ${isFloat ? styles.buttonActive : ''}`}
              onClick={() => onPlacementTypeChange('float')}
            >
              띄워서 배치
            </button>
          </div>
        </div>
      )}

      {/* 받침대 없음 + 띄워서 배치 - 띄움 높이 설정 */}
      {isStand && isFloat && (
        <div className={styles.section}>
          <span className={styles.label}>띄움 높이 (mm)</span>
          <div className={styles.inputWrapper}>
            <div className={styles.inputWithUnit}>
              <input
                type="text"
                value={floatHeight}
                onChange={(e) => onFloatHeightChange(e.target.value)}
                onFocus={handleInputFocus}
                onBlur={handleFloatInputBlur}
                onKeyDown={onFloatKeyDown}
                className={`${styles.input} ${styles.inputWithUnitField}`}
                placeholder="60"
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>
          <p className={styles.description}>
            바닥으로부터 {floatHeight}mm 높이가 띄워집니다.
          </p>
        </div>
      )}
    </>
  );
};

export default PlacementControls; 