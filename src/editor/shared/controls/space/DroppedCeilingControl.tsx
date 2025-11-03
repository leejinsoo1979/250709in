import React from 'react';
import { useSpaceConfigStore, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { SpaceCalculator } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './DroppedCeilingControl.module.css';

interface DroppedCeilingControlProps {
  expanded?: boolean;
  onToggle?: () => void;
}

const DroppedCeilingControl: React.FC<DroppedCeilingControlProps> = ({
  expanded = true,
  onToggle
}) => {
  const { t } = useTranslation();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, removeModule, updatePlacedModule } = useFurnitureStore();
  const { zones } = useDerivedSpaceStore();
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
          width: droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH,
          dropHeight: droppedCeiling.dropHeight || 200
        },
        customColumnCount: currentMainDoorCount,
        mainDoorCount: undefined,
        droppedCeilingDoorCount: undefined
      });
    } else {
      // 활성화 - 기존 값이 있으면 유지, 없으면 기본값 사용
      const defaultWidth = droppedCeiling?.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
      
      // 단내림 구간의 내경폭으로 기본 도어 개수 계산
      const frameThickness = 50;
      const internalWidth = defaultWidth - frameThickness;
      
      // SpaceCalculator를 사용하여 폭에 따른 최소 도어 개수 계산
      const droppedLimits = SpaceCalculator.getColumnCountLimits(internalWidth);
      
      // 단내림 활성화 시에도 모든 가구 제거 (호환되지 않는 가구들이 있을 수 있음)
      console.log('🗑️ [DroppedCeilingControl] Removing ALL furniture when enabling dropped ceiling:', {
        totalModules: placedModules.length
      });
      
      // 모든 가구들 제거
      placedModules.forEach(module => {
        removeModule(module.id);
      });
      
      setSpaceInfo({
        droppedCeiling: {
          enabled: true,
          position: droppedCeiling?.position || 'right',
          width: defaultWidth,
          dropHeight: droppedCeiling?.dropHeight || 200
        },
        // 단내림 구간의 도어 개수를 최소값으로 설정
        droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount || droppedLimits.minColumns
      });
    }
  };

  const handlePositionChange = (position: 'left' | 'right') => {
    if (droppedCeiling) {
      const normalSlotCount = zones?.normal?.columnCount || 0;
      const droppedSlotCount = zones?.dropped?.columnCount || 0;

      // setSpaceInfo를 먼저 호출
      setSpaceInfo({
        droppedCeiling: {
          ...droppedCeiling,
          position
        }
      });

      // 다음 프레임에서 가구 이동 (zones 업데이트 후)
      setTimeout(() => {
        placedModules.forEach(module => {
          if (module.slotIndex !== undefined) {
            const isInDropped = module.zone === 'dropped';

            if (isInDropped) {
              // 단내림 영역: slotIndex 그대로 유지 (끝은 끝으로)
              // 아무것도 안 함
            } else {
              // 일반 영역: 영역 내 상대 위치 유지하며 역순
              const newSlotIndex = (normalSlotCount - 1) - module.slotIndex;
              updatePlacedModule(module.id, { slotIndex: newSlotIndex });
            }
          }
        });
      }, 0);
    }
  };

  const handleWidthChange = (value: number) => {
    if (droppedCeiling) {
      // 최소 400mm, 최대 600mm로 제한
      const clampedValue = Math.max(400, Math.min(600, value));
      setSpaceInfo({
        droppedCeiling: {
          ...droppedCeiling,
          width: clampedValue
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
        <h3 className={styles.label}>{t('space.droppedCeiling')}</h3>
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
              <span className={styles.toggleText}>{t('space.droppedCeilingEnabled')}</span>
            </label>
          </div>

          {droppedCeiling?.enabled && (
            <>
              {/* 위치 선택 */}
              <div className={styles.positionGroup}>
                <div className={styles.inputLabel}>{t('placement.droppedCeilingPosition')}</div>
                <div className={styles.toggleGroup}>
                  <button
                    className={`${styles.toggleButton} ${droppedCeiling.position === 'left' ? styles.active : ''}`}
                    onClick={() => handlePositionChange('left')}
                  >
                    {t('furniture.left')}
                  </button>
                  <button
                    className={`${styles.toggleButton} ${droppedCeiling.position === 'right' ? styles.active : ''}`}
                    onClick={() => handlePositionChange('right')}
                  >
                    {t('furniture.right')}
                  </button>
                </div>
              </div>

              {/* 폭 설정 */}
              <div className={styles.numberInput}>
                <div className={styles.inputLabel}>{t('space.width')}</div>
                <div className={styles.inputGroup}>
                  <button 
                    className={styles.inputButton}
                    onClick={() => handleWidthChange(droppedCeiling.width - 50)}
                    disabled={droppedCeiling.width <= 400}
                  >
                    −
                  </button>
                  <div className={styles.inputField}>
                    <input
                      type="number"
                      value={droppedCeiling.width}
                      onChange={(e) => handleWidthChange(Number(e.target.value))}
                      min={400}
                      max={600}
                      step={50}
                      style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-surface)' }}
                    />
                    <span className={styles.inputUnit}>mm</span>
                  </div>
                  <button 
                    className={styles.inputButton}
                    onClick={() => handleWidthChange(droppedCeiling.width + 50)}
                    disabled={droppedCeiling.width >= 600}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Drop 높이 설정 */}
              <div className={styles.numberInput}>
                <div className={styles.inputLabel}>{t('space.droppedCeilingHeight')}</div>
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
                  <span className={styles.infoLabel}>{t('space.totalWidth')}:</span>
                  <span className={styles.infoValue}>
                    {spaceInfo.width} mm
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>{t('space.mainSection')}:</span>
                  <span className={styles.infoValue}>
                    {spaceInfo.width - droppedCeiling.width} mm
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>{t('space.droppedSection')}:</span>
                  <span className={styles.infoValue}>
                    {droppedCeiling.width} mm
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>{t('space.droppedCeilingHeight')}:</span>
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