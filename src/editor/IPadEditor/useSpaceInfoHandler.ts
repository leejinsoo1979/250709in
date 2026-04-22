// iPad용 handleSpaceInfoUpdate 로직 — 웹 Configurator에서 복제
// 웹 Configurator 건드리지 않음
import { useSpaceConfigStore, type SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { SpaceCalculator } from '@/editor/shared/utils/indexing';

export const useSpaceInfoHandler = () => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, clearAllModules, updatePlacedModule } = useFurnitureStore();

  const getCurrentColumnCount = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      return spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 6;
    }
    return spaceInfo.customColumnCount || 6;
  };

  const handleSpaceInfoUpdate = (updates: Partial<SpaceInfo>) => {
    const isDimensionChange =
      (updates.width !== undefined && updates.width !== spaceInfo.width) ||
      (updates.height !== undefined && updates.height !== spaceInfo.height) ||
      (updates.depth !== undefined && updates.depth !== spaceInfo.depth);
    const isColumnCountChange =
      (updates.customColumnCount !== undefined && updates.customColumnCount !== spaceInfo.customColumnCount) ||
      (updates.mainDoorCount !== undefined && updates.mainDoorCount !== spaceInfo.mainDoorCount) ||
      (updates.droppedCeilingDoorCount !== undefined && updates.droppedCeilingDoorCount !== spaceInfo.droppedCeilingDoorCount);

    if ((isDimensionChange || isColumnCountChange) && placedModules.length > 0) {
      clearAllModules();
    }

    let finalUpdates: Partial<SpaceInfo> = { ...updates };

    if ((finalUpdates.installType as any) === 'built-in') {
      finalUpdates.installType = 'builtin';
    }

    // 서라운드 타입 변경 시
    if (updates.surroundType && updates.surroundType !== spaceInfo.surroundType) {
      const currentInstallType = finalUpdates.installType || spaceInfo.installType;
      const currentWallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;
      const newFrameSize: any = { ...spaceInfo.frameSize, top: spaceInfo.frameSize?.top || 30 };

      if (updates.surroundType === 'surround') {
        switch (currentInstallType) {
          case 'builtin':
            newFrameSize.left = 50; newFrameSize.right = 50; break;
          case 'semistanding':
            if (currentWallConfig?.left && !currentWallConfig.right) {
              newFrameSize.left = 50; newFrameSize.right = 0;
            } else if (!currentWallConfig?.left && currentWallConfig?.right) {
              newFrameSize.left = 0; newFrameSize.right = 50;
            }
            break;
          case 'freestanding':
            newFrameSize.left = 0; newFrameSize.right = 0; break;
        }
      } else if (updates.surroundType === 'no-surround') {
        newFrameSize.left = 0; newFrameSize.right = 0;
        finalUpdates.gapConfig = {
          left: currentWallConfig?.left ? 1.5 : 0,
          right: currentWallConfig?.right ? 1.5 : 0,
          middle: spaceInfo.gapConfig?.middle ?? 1.5,
        } as any;
      }
      finalUpdates.frameSize = newFrameSize;
    }

    // 세미스탠딩 벽 위치 변경
    if (updates.wallConfig && spaceInfo.installType === 'semistanding' && spaceInfo.surroundType === 'surround') {
      const newFrameSize: any = { ...spaceInfo.frameSize };
      if (updates.wallConfig.left && !updates.wallConfig.right) {
        newFrameSize.left = 50; newFrameSize.right = 0;
      } else if (!updates.wallConfig.left && updates.wallConfig.right) {
        newFrameSize.left = 0; newFrameSize.right = 50;
      }
      finalUpdates.frameSize = newFrameSize;
    }

    // 설치 타입 변경
    if (updates.installType) {
      if (!updates.wallConfig) {
        switch (updates.installType) {
          case 'builtin': finalUpdates.wallConfig = { left: true, right: true }; break;
          case 'semistanding': finalUpdates.wallConfig = { left: true, right: false }; break;
          case 'freestanding': finalUpdates.wallConfig = { left: false, right: false }; break;
        }
      }
      const newFrameSize: any = { ...spaceInfo.frameSize };
      const wallConfig = finalUpdates.wallConfig || spaceInfo.wallConfig;

      if (spaceInfo.surroundType === 'surround') {
        switch (updates.installType) {
          case 'builtin':
            newFrameSize.left = 50; newFrameSize.right = 50; break;
          case 'semistanding':
            if (wallConfig?.left && !wallConfig.right) {
              newFrameSize.left = 50; newFrameSize.right = 0;
            } else if (!wallConfig?.left && wallConfig?.right) {
              newFrameSize.left = 0; newFrameSize.right = 50;
            }
            break;
          case 'freestanding':
            newFrameSize.left = 0; newFrameSize.right = 0; break;
        }
      } else if (spaceInfo.surroundType === 'no-surround') {
        newFrameSize.left = 0; newFrameSize.right = 0;
        finalUpdates.gapConfig = {
          left: wallConfig?.left ? 1.5 : 0,
          right: wallConfig?.right ? 1.5 : 0,
          middle: spaceInfo.gapConfig?.middle ?? 1.5,
        } as any;
      }
      finalUpdates.frameSize = newFrameSize;
    }

    // 너비 변경 시 도어 개수 자동 조정
    if (updates.width && updates.width !== spaceInfo.width) {
      const tempSpaceInfo: SpaceInfo = { ...spaceInfo, ...finalUpdates, width: updates.width } as any;
      const internalWidth = SpaceCalculator.calculateInternalWidth(tempSpaceInfo);
      const limits = SpaceCalculator.getColumnCountLimits(internalWidth);
      const currentCount = spaceInfo.customColumnCount || getCurrentColumnCount();
      const adjustedCount = Math.max(limits.minColumns, Math.min(limits.maxColumns, currentCount));
      finalUpdates.customColumnCount = adjustedCount;
    }

    // customColumnCount 직접 변경
    if (updates.customColumnCount !== undefined) {
      finalUpdates.customColumnCount = updates.customColumnCount;
      finalUpdates.mainDoorCount = updates.customColumnCount;
    }

    // 단내림 새로 활성화
    if (updates.droppedCeiling?.enabled && !spaceInfo.droppedCeiling?.enabled) {
      const currentWidth = finalUpdates.width || spaceInfo.width || 4800;
      const droppedWidth = updates.droppedCeiling.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
      const mainZoneWidth = currentWidth - droppedWidth;
      const frameThickness = 50;
      const normalAreaInternalWidth = mainZoneWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
      const currentDoorCount = getCurrentColumnCount();
      const adjustedMainDoorCount = Math.max(minRequiredSlots, currentDoorCount);
      finalUpdates.mainDoorCount = adjustedMainDoorCount;

      const droppedFrameThickness = 50;
      const droppedInternalWidth = droppedWidth - droppedFrameThickness;
      const droppedMinSlots = Math.max(1, Math.ceil(droppedInternalWidth / MAX_SLOT_WIDTH));
      finalUpdates.droppedCeilingDoorCount = droppedMinSlots;
    }

    // 단내림 폭 변경 시 도어개수 조정
    if (updates.droppedCeiling?.width && spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50;
      const internalWidth = updates.droppedCeiling.width - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const MIN_SLOT_WIDTH = 400;
      const newDoorRange = {
        min: Math.max(1, Math.ceil(internalWidth / MAX_SLOT_WIDTH)),
        max: Math.max(1, Math.floor(internalWidth / MIN_SLOT_WIDTH)),
      };
      const currentDoorCount = spaceInfo.droppedCeilingDoorCount || 2;
      if (currentDoorCount < newDoorRange.min || currentDoorCount > newDoorRange.max) {
        const adjustedDoorCount = Math.max(newDoorRange.min, Math.min(newDoorRange.max, currentDoorCount));
        finalUpdates.droppedCeilingDoorCount = adjustedDoorCount;
      }
    }

    setSpaceInfo(finalUpdates as any);

    // 도어 상단갭 전파
    if ((finalUpdates as any).doorTopGap !== undefined) {
      const currentModules = useFurnitureStore.getState().placedModules;
      const modulesWithDoor = currentModules.filter(m => m.hasDoor);
      modulesWithDoor.forEach(m => {
        const isLower = m.moduleId?.includes('lower-');
        if (!isLower) {
          updatePlacedModule(m.id, { doorTopGap: (finalUpdates as any).doorTopGap });
        }
      });
    }
  };

  return { handleSpaceInfoUpdate };
};
