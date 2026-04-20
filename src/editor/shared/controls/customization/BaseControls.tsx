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

  // 로컬 상태들 - 항상 string으로 관리
  // 받침대 높이는 바닥마감재와 무관하게 원래 값 그대로 표시
  const [baseHeight, setBaseHeight] = useState<string>(
    String(spaceInfo.baseConfig?.height || 60)
  );
  const [baseDepth, setBaseDepth] = useState<string>(
    String(spaceInfo.baseConfig?.depth ?? 0)
  );

  // baseConfig 변경 시 로컬 상태 동기화
  // UI 표시값은 항상 60 이상으로 보정 (기본값 60)
  useEffect(() => {
    const stored = spaceInfo.baseConfig?.height;
    const displayH = (stored === undefined || stored < 60) ? 60 : stored;
    setBaseHeight(String(displayH));
    setBaseDepth(String(spaceInfo.baseConfig?.depth ?? 0));
    // UI 표시값과 저장값이 다르면 store 동기화 (UI가 진실의 원천)
    if (stored !== displayH) {
      const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor' as const, height: 60 };
      onUpdate({ baseConfig: { ...currentBaseConfig, height: displayH } });
    }
  }, [spaceInfo.baseConfig]);

  // 높이 입력 처리 — 즉시 store 업데이트 (실시간 반영)
  const handleHeightChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      if (value !== '' && parseInt(value) > 150) {
        setBaseHeight('150');
        return;
      }
      setBaseHeight(value);
      // 유효한 숫자면 즉시 store 업데이트
      if (value !== '') {
        const num = parseInt(value);
        if (num >= 60 && num <= 150) {
          const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor' as const, height: 60 };
          if (num !== currentBaseConfig.height) {
            onUpdate({ baseConfig: { ...currentBaseConfig, height: num } });
          }
        }
      }
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
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 60 };

    let value: any = baseHeight;

    if (typeof value === 'string') {
      value = value === '' ? 60 : parseInt(value);
    }

    if (value < 60) value = 60;
    if (value > 150) value = 150;

    setBaseHeight(String(value));

    if (value !== currentBaseConfig.height) {
      const saveValue = value;
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

    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 60 };

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
