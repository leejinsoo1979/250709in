import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import styles from '../styles/common.module.css';

interface FloorFinishControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const FloorFinishControls: React.FC<FloorFinishControlsProps> = ({
  spaceInfo,
  onUpdate
}) => {
  const [floorThickness, setFloorThickness] = useState<string>(
    spaceInfo.floorFinish?.height?.toString() || '20'
  );

  // spaceInfo 변경 시 로컬 상태 업데이트
  useEffect(() => {
    setFloorThickness(spaceInfo.floorFinish?.height?.toString() || '20');
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
      const thickness = parseInt(floorThickness) || 20;
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
      setFloorThickness('20');
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
      setFloorThickness('20');
      onUpdate({
        hasFloorFinish: true,
        floorFinish: {
          height: 20
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
            있음
          </button>
          <button
            className={`${styles.toggleButton} ${!spaceInfo.hasFloorFinish ? styles.toggleButtonActive : ''}`}
            onClick={() => handleFloorStatusChange(true)}
          >
            없음
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloorFinishControls; 