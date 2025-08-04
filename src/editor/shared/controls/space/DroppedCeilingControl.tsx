import React from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { SpaceCalculator } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import styles from './DroppedCeilingControl.module.css';

interface DroppedCeilingControlProps {
  expanded?: boolean;
  onToggle?: () => void;
}

const DroppedCeilingControl: React.FC<DroppedCeilingControlProps> = ({
  expanded = true,
  onToggle
}) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, removeModule } = useFurnitureStore();
  const droppedCeiling = spaceInfo.droppedCeiling;

  const handleEnabledToggle = () => {
    if (droppedCeiling?.enabled) {
      // 비활성화 - 컬럼 수를 기본값으로 리셋
      const internalSpace = calculateInternalSpace(spaceInfo);
      const defaultColumnCount = SpaceCalculator.getDefaultColumnCount(internalSpace.width);
      
      // 단내림 비활성화 시 현재 메인 도어 개수를 customColumnCount로 이동
      const currentMainDoorCount = spaceInfo.mainDoorCount || spaceInfo.customColumnCount || defaultColumnCount;
      
      console.log('🔧 [DroppedCeilingControl] Disabling dropped ceiling, preserving door count:', {
        currentMainDoorCount,
        customColumnCount: spaceInfo.customColumnCount,
        defaultColumnCount,
        internalWidth: internalSpace.width
      });
      
      // 모든 가구들 제거 (메인 구간과 단내림 구간 모두)
      const modulesToRemove = placedModules.filter(module => {
        // 단내림이 활성화되어 있었다면 모든 가구 제거
        return true;
      });
      
      console.log('🗑️ [DroppedCeilingControl] Removing ALL furniture (main + dropped areas):', {
        totalModules: placedModules.length,
        modulesToRemove: modulesToRemove.length,
        mainAreaModules: modulesToRemove.filter(m => m.columnSlotInfo?.spaceType === 'main').length,
        droppedAreaModules: modulesToRemove.filter(m => m.columnSlotInfo?.spaceType === 'dropped').length
      });
      
      // 모든 가구들 제거
      modulesToRemove.forEach(module => {
        removeModule(module.id);
      });
      
      setSpaceInfo({
        droppedCeiling: {
          enabled: false,
          position: droppedCeiling.position || 'right',
          width: droppedCeiling.width || 900,
          dropHeight: droppedCeiling.dropHeight || 200
        },
        customColumnCount: currentMainDoorCount,
        mainDoorCount: undefined,
        droppedCeilingDoorCount: undefined
      });
    } else {
      // 활성화 - 기존 값이 있으면 유지, 없으면 기본값 사용
      const defaultWidth = droppedCeiling?.width || 900;
      
      // 단내림 구간의 내경폭으로 기본 도어 개수 계산
      const frameThickness = 50;
      const internalWidth = defaultWidth - frameThickness;
      
      // 기본값을 최소 개수(1개)로 설정
      const defaultDoorCount = 1;
      
      setSpaceInfo({
        droppedCeiling: {
          enabled: true,
          position: droppedCeiling?.position || 'right',
          width: defaultWidth,
          dropHeight: droppedCeiling?.dropHeight || 200
        },
        // 단내림 구간의 도어 개수를 1개로 초기 설정
        droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount || defaultDoorCount
      });
    }
  };

  const handlePositionChange = (position: 'left' | 'right') => {
    if (droppedCeiling) {
      setSpaceInfo({
        droppedCeiling: {
          ...droppedCeiling,
          position
        }
      });
    }
  };

  const handleWidthChange = (value: number) => {
    if (droppedCeiling) {
      setSpaceInfo({
        droppedCeiling: {
          ...droppedCeiling,
          width: value
        }
      });
    }
  };

  const handleDropHeightChange = (value: number) => {
    if (droppedCeiling) {
      setSpaceInfo({
        droppedCeiling: {
          ...droppedCeiling,
          dropHeight: value
        }
      });
    }
  };


  return (
    <div className={styles.droppedCeilingControl}>
      <div className={styles.header} onClick={onToggle}>
        <div className={styles.indicator}></div>
        <h3 className={styles.label}>단내림 설정</h3>
        {onToggle && (
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            className={`${styles.expandIcon} ${expanded ? styles.expanded : ''}`}
          >
            <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )}
      </div>
      
      {expanded && (
        <div className={styles.content}>
          {/* 활성화/비활성화 토글 */}
          <div className={styles.enableToggle}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={droppedCeiling?.enabled || false}
                onChange={handleEnabledToggle}
                className={styles.checkbox}
              />
              <span className={styles.toggleSwitch}></span>
              <span className={styles.toggleText}>단내림 활성화</span>
            </label>
          </div>

          {droppedCeiling?.enabled && (
            <>
              {/* 위치 선택 */}
              <div className={styles.positionGroup}>
                <div className={styles.inputLabel}>위치</div>
                <div className={styles.toggleGroup}>
                  <button
                    className={`${styles.toggleButton} ${droppedCeiling.position === 'left' ? styles.active : ''}`}
                    onClick={() => handlePositionChange('left')}
                  >
                    왼쪽
                  </button>
                  <button
                    className={`${styles.toggleButton} ${droppedCeiling.position === 'right' ? styles.active : ''}`}
                    onClick={() => handlePositionChange('right')}
                  >
                    오른쪽
                  </button>
                </div>
              </div>

              {/* 폭 설정 */}
              <div className={styles.numberInput}>
                <div className={styles.inputLabel}>폭</div>
                <div className={styles.inputGroup}>
                  <button 
                    className={styles.inputButton}
                    onClick={() => handleWidthChange(droppedCeiling.width - 50)}
                    disabled={droppedCeiling.width <= 300}
                  >
                    −
                  </button>
                  <div className={styles.inputField}>
                    <input
                      type="number"
                      value={droppedCeiling.width}
                      onChange={(e) => handleWidthChange(Number(e.target.value))}
                      min={300}
                      max={2000}
                      step={50}
                      style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-surface)' }}
                    />
                    <span className={styles.inputUnit}>mm</span>
                  </div>
                  <button 
                    className={styles.inputButton}
                    onClick={() => handleWidthChange(droppedCeiling.width + 50)}
                    disabled={droppedCeiling.width >= 2000}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Drop 높이 설정 */}
              <div className={styles.numberInput}>
                <div className={styles.inputLabel}>Drop 높이</div>
                <div className={styles.inputGroup}>
                  <button 
                    className={styles.inputButton}
                    onClick={() => handleDropHeightChange(droppedCeiling.dropHeight - 25)}
                    disabled={droppedCeiling.dropHeight <= 100}
                  >
                    −
                  </button>
                  <div className={styles.inputField}>
                    <input
                      type="number"
                      value={droppedCeiling.dropHeight}
                      onChange={(e) => handleDropHeightChange(Number(e.target.value))}
                      min={100}
                      max={500}
                      step={25}
                      style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-surface)' }}
                    />
                    <span className={styles.inputUnit}>mm</span>
                  </div>
                  <button 
                    className={styles.inputButton}
                    onClick={() => handleDropHeightChange(droppedCeiling.dropHeight + 25)}
                    disabled={droppedCeiling.dropHeight >= 500}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 정보 표시 */}
              <div className={styles.infoPanel}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>전체 폭:</span>
                  <span className={styles.infoValue}>
                    {spaceInfo.width} mm
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>일반 영역:</span>
                  <span className={styles.infoValue}>
                    {spaceInfo.width - droppedCeiling.width} mm
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>단내림 영역:</span>
                  <span className={styles.infoValue}>
                    {droppedCeiling.width} mm
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>단내림 높이:</span>
                  <span className={styles.infoValue}>
                    {spaceInfo.height - droppedCeiling.dropHeight} mm
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DroppedCeilingControl;