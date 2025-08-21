import React from 'react';
import { BaseConfig } from '@/store/core/spaceConfigStore';
import { useUIStore, HighlightedFrame } from '@/store/uiStore';
import { useTranslation } from '@/i18n/useTranslation';
import styles from '../../styles/common.module.css';

interface PlacementControlsProps {
  baseConfig?: BaseConfig;
  baseHeight: string;
  floatHeight: string;
  onPlacementTypeChange: (placementType: 'ground' | 'float') => void;
  onHeightChange: (value: string) => void;
  onFloatHeightChange: (value: string) => void;
  onHeightBlur: () => void;
  onFloatHeightBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFloatKeyDown: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
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
  onFloatKeyDown,
  disabled = false
}) => {
  const { t } = useTranslation();
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
          <span className={styles.label}>{t('frame.baseHeight')}</span>
          <div className={styles.inputWrapper}>
            <div className={styles.inputWithUnit}>
              <input
                type="text"
                value={baseHeight}
                onChange={(e) => {
                  console.log('🔧 PlacementControls - input onChange 호출됨:', e.target.value);
                  onHeightChange(e.target.value);
                }}
                onInput={(e) => {
                  console.log('🔧 PlacementControls - input onInput 호출됨:', e.currentTarget.value);
                }}
                onClick={(e) => {
                  console.log('🔧 PlacementControls - input onClick 호출됨, disabled:', disabled);
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={onKeyDown}
                className={`${styles.input} ${styles.inputWithUnitField}`}
                placeholder="65"
                disabled={disabled}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>
        </div>
      )}

      {/* 띄워서 배치 - 띄움 높이 설정 */}
      {isStand && (
        <div className={styles.section}>
          <span className={styles.label}>{t('frame.floatHeight')}</span>
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
                disabled={disabled}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PlacementControls; 