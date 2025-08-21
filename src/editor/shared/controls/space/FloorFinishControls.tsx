import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface FloorFinishControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const FloorFinishControls: React.FC<FloorFinishControlsProps> = ({
  spaceInfo,
  onUpdate
}) => {
  const { t } = useTranslation();
  const [floorThickness, setFloorThickness] = useState<string>(
    spaceInfo.floorFinish?.height?.toString() || '9'
  );

  // spaceInfo 변경 시 로컬 상태 업데이트
  useEffect(() => {
    setFloorThickness(spaceInfo.floorFinish?.height?.toString() || '9');
  }, [spaceInfo.floorFinish?.height]);

  const handleFloorStatusChange = (isFinished: boolean) => {
    if (isFinished) {
      // 바닥마감완료 - hasFloorFinish = false
      onUpdate({
        hasFloorFinish: false,
        floorFinish: undefined
      });
    } else {
      // 바닥설치예정 - hasFloorFinish = true
      const thickness = parseInt(floorThickness) || 9;
      onUpdate({
        hasFloorFinish: true,
        floorFinish: {
          height: thickness
        }
      });
    }
  };

  const handleThicknessChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setFloorThickness(value);
    }
  };

  const handleThicknessBlur = () => {
    const value = floorThickness;
    if (value === '') {
      setFloorThickness('9');
      return;
    }
    
    const numValue = parseInt(value);
    
    // 범위 검증 (5-100mm)
    if (numValue >= 5 && numValue <= 100) {
      onUpdate({
        hasFloorFinish: true,
        floorFinish: {
          height: numValue
        }
      });
    } else {
      // 범위를 벗어나면 기본값으로 되돌림
      setFloorThickness('9');
      onUpdate({
        hasFloorFinish: true,
        floorFinish: {
          height: 9
        }
      });
    }
  };

  const handleThicknessKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleThicknessBlur();
    }
  };

  // 실제 공간 높이 계산 (전체 높이 - 바닥 두께)
  const actualSpaceHeight = spaceInfo.hasFloorFinish 
    ? spaceInfo.height - (spaceInfo.floorFinish?.height || 0)
    : spaceInfo.height;

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.toggleButtonGroup}>
          <button
            className={`${styles.toggleButton} ${spaceInfo.hasFloorFinish ? styles.toggleButtonActive : ''}`}
            onClick={() => handleFloorStatusChange(false)}
          >
            {t('common.enabled')}
          </button>
          <button
            className={`${styles.toggleButton} ${!spaceInfo.hasFloorFinish ? styles.toggleButtonActive : ''}`}
            onClick={() => handleFloorStatusChange(true)}
          >
            {t('common.none')}
          </button>
        </div>
      </div>
      
      {/* 바닥 마감재가 있을 때 두께 입력 필드 표시 */}
      {spaceInfo.hasFloorFinish && (
        <div className={styles.section}>
          <label className={styles.label}>{t('space.floorFinishThickness')}</label>
          <div className={styles.inputWrapper}>
            <input
              type="text"
              className={styles.input}
              value={floorThickness}
              onChange={(e) => handleThicknessChange(e.target.value)}
              onBlur={handleThicknessBlur}
              onKeyDown={handleThicknessKeyDown}
              placeholder="5-100"
            />
            <span className={styles.unit}>mm</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloorFinishControls; 