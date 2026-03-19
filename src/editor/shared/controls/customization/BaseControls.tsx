import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import PlacementControls from './components/PlacementControls';
import styles from '../styles/common.module.css';

interface BaseControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
}

const BaseControls: React.FC<BaseControlsProps> = ({ spaceInfo, onUpdate, disabled = false }) => {
  const { placedModules, updatePlacedModule } = useFurnitureStore();

  // 자유배치 가구 freeHeight 재계산
  const recalcFreePlacementHeights = (updatedSpaceInfo: Partial<SpaceInfo>) => {
    const merged = { ...spaceInfo, ...updatedSpaceInfo } as SpaceInfo;
    if (merged.baseConfig) {
      merged.baseConfig = { ...spaceInfo.baseConfig, ...updatedSpaceInfo.baseConfig } as SpaceInfo['baseConfig'];
    }
    const internalSpace = calculateInternalSpace(merged);
    const newMaxHeight = internalSpace.height;

    placedModules.forEach(mod => {
      if (!mod.isFreePlacement) return;
      const cat = getModuleCategory(mod);
      if (cat !== 'full') return;
      if (mod.freeHeight !== newMaxHeight) {
        updatePlacedModule(mod.id, { freeHeight: newMaxHeight });
      }
    });
  };

  // 바닥마감재가 있을 때 받침대 높이 조정해서 표시
  const getAdjustedBaseHeight = () => {
    const originalHeight = spaceInfo.baseConfig?.height || 65;
    if (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) {
      const floorFinishHeight = spaceInfo.floorFinish.height || 0;
      return Math.max(0, originalHeight - floorFinishHeight);
    }
    return originalHeight;
  };

  // 로컬 상태들 - 항상 string으로 관리
  const [baseHeight, setBaseHeight] = useState<string>(
    String(getAdjustedBaseHeight())
  );
  const [baseDepth, setBaseDepth] = useState<string>(
    String(spaceInfo.baseConfig?.depth ?? 0)
  );

  // baseConfig 또는 바닥마감재 변경 시 로컬 상태 동기화
  useEffect(() => {
    setBaseHeight(String(getAdjustedBaseHeight()));
    setBaseDepth(String(spaceInfo.baseConfig?.depth ?? 0));
  }, [spaceInfo.baseConfig, spaceInfo.hasFloorFinish, spaceInfo.floorFinish]);

  // 높이 입력 처리 (로컬 상태만 변경, store는 blur에서 업데이트)
  const handleHeightChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setBaseHeight(value);
    }
  };

  // 깊이 입력 처리 (로컬 상태만 변경, store는 blur에서 업데이트)
  const handleDepthChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setBaseDepth(value);
    }
  };

  // 높이 업데이트 (blur 또는 Enter 시)
  const handleHeightBlur = () => {
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };

    let value: any = baseHeight;

    if (typeof value === 'string') {
      value = value === '' ? 65 : parseInt(value);
    }

    if (value < 50) value = 50;
    if (value > 500) value = 500;

    setBaseHeight(value);

    // 저장할 때는 바닥마감재 높이를 더해서 저장
    let saveValue = value;
    if (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) {
      const floorFinishHeight = spaceInfo.floorFinish.height || 0;
      saveValue = value + floorFinishHeight;
    }

    if (saveValue !== currentBaseConfig.height) {
      const updates: Partial<SpaceInfo> = {
        baseConfig: {
          ...currentBaseConfig,
          height: saveValue,
        },
      };
      onUpdate(updates);
      recalcFreePlacementHeights(updates);
    }
  };

  // 깊이 업데이트 (blur 또는 Enter 시)
  const handleDepthBlur = () => {
    let value: any = baseDepth;

    if (typeof value === 'string') {
      value = value === '' ? 0 : parseInt(value);
    }

    if (value < 0) value = 0;
    if (value > 300) value = 300;

    setBaseDepth(value);

    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };

    if (value !== (currentBaseConfig.depth ?? 0)) {
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          depth: value,
        },
      });
    }
  };

  // Enter 키 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleHeightBlur();
  };

  const handleDepthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleDepthBlur();
  };

  return (
    <div className={styles.container}>
      <PlacementControls
        baseConfig={spaceInfo.baseConfig}
        baseHeight={baseHeight}
        baseDepth={baseDepth}
        onHeightChange={handleHeightChange}
        onDepthChange={handleDepthChange}
        onHeightBlur={handleHeightBlur}
        onDepthBlur={handleDepthBlur}
        onKeyDown={handleKeyDown}
        onDepthKeyDown={handleDepthKeyDown}
        disabled={disabled}
      />
    </div>
  );
};

export default BaseControls;
