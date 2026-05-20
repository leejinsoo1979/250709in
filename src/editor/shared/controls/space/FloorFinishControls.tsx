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
    spaceInfo.floorFinish?.height?.toString() || '15'
  );

  // spaceInfo 변경 시 로컬 상태 업데이트
  useEffect(() => {
    setFloorThickness(spaceInfo.floorFinish?.height?.toString() || '15');
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
      const thickness = parseInt(floorThickness) || 15;
      onUpdate({
        hasFloorFinish: true,
        floorFinish: {
          height: thickness
        }
      });
    }
  };

  const commitThickness = (numValue: number) => {
    const clamped = Math.max(5, Math.min(100, Math.round(numValue)));
    onUpdate({
      hasFloorFinish: true,
      floorFinish: { height: clamped }
    });
    return clamped;
  };

  const handleThicknessChange = (value: string) => {
    // 숫자와 빈 문자열만 허용 + 입력 즉시 실시간 반영 (5~100 범위 내)
    if (value === '' || /^\d+$/.test(value)) {
      setFloorThickness(value);
      if (value !== '') {
        const num = parseInt(value, 10);
        if (!isNaN(num) && num >= 5 && num <= 100) {
          onUpdate({
            hasFloorFinish: true,
            floorFinish: { height: num }
          });
        }
      }
    }
  };

  const handleThicknessBlur = () => {
    const value = floorThickness;
    if (value === '') {
      setFloorThickness('15');
      commitThickness(15);
      return;
    }
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      setFloorThickness('15');
      commitThickness(15);
      return;
    }
    const clamped = commitThickness(num);
    setFloorThickness(String(clamped));
  };

  const handleThicknessKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleThicknessBlur();
      return;
    }
    // ArrowUp/Down으로 1mm씩 증감 (Shift: 10mm)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseInt(floorThickness, 10) || 15;
      const step = (e as any).shiftKey ? 10 : 1;
      const next = Math.max(5, Math.min(100, cur + (e.key === 'ArrowUp' ? step : -step)));
      setFloorThickness(String(next));
      commitThickness(next);
    }
  };

  // 실제 공간 높이 계산 (전체 높이 - 바닥 두께)
  const actualSpaceHeight = spaceInfo.hasFloorFinish 
    ? spaceInfo.height - (spaceInfo.floorFinish?.height || 0)
    : spaceInfo.height;

  // 띄워서 배치일 때는 바닥마감재 설정 비활성화
  const isFloatingMode = spaceInfo.baseConfig?.placementType === 'float' && (spaceInfo.baseConfig?.floatHeight || 0) > 0;

  // 띄워서 배치로 변경되면 바닥마감재 자동 제거
  useEffect(() => {
    if (isFloatingMode && spaceInfo.hasFloorFinish) {
      onUpdate({
        hasFloorFinish: false,
        floorFinish: undefined
      });
    }
  }, [isFloatingMode]);

  if (isFloatingMode) {
    return (
      <div className={styles.container}>
        <div className={styles.section}>
          <p className={styles.disabledMessage}>
            띄워서 배치 시 바닥마감재 설정이 비활성화됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.toggleButtonGroup}>
          <button
            className={`${styles.toggleButton} ${!spaceInfo.hasFloorFinish ? styles.toggleButtonActive : ''}`}
            onClick={() => handleFloorStatusChange(true)}
          >
            바닥재 시공완료
          </button>
          <button
            className={`${styles.toggleButton} ${spaceInfo.hasFloorFinish ? styles.toggleButtonActive : ''}`}
            onClick={() => handleFloorStatusChange(false)}
          >
            시공예정
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