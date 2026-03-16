import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import BaseTypeSelector from './components/BaseTypeSelector';
import PlacementControls from './components/PlacementControls';
import styles from '../styles/common.module.css';

interface BaseControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
  /** 'type-only': 타입 선택만, 'placement-only': 높이/깊이만, undefined: 전부 */
  renderMode?: 'type-only' | 'placement-only';
}

const BaseControls: React.FC<BaseControlsProps> = ({ spaceInfo, onUpdate, disabled = false, renderMode }) => {
  const { placedModules, updatePlacedModule } = useFurnitureStore();

  console.log('🔧 BaseControls - disabled 상태:', disabled);

  // 자유배치 가구 freeHeight 재계산 (float 전환/변경 시)
  // 슬롯배치는 shelving.ts에서 모듈 생성 시 floatHeight 반영하지만,
  // 자유배치는 이미 배치된 가구의 freeHeight를 수동으로 갱신해야 함
  const recalcFreePlacementHeights = (updatedSpaceInfo: Partial<SpaceInfo>) => {
    const merged = { ...spaceInfo, ...updatedSpaceInfo } as SpaceInfo;
    if (merged.baseConfig) {
      merged.baseConfig = { ...spaceInfo.baseConfig, ...updatedSpaceInfo.baseConfig } as SpaceInfo['baseConfig'];
    }
    const internalSpace = calculateInternalSpace(merged);
    const isFloat = merged.baseConfig?.type === 'stand' && merged.baseConfig?.placementType === 'float';
    const floatH = isFloat ? (merged.baseConfig?.floatHeight || 0) : 0;
    const newMaxHeight = internalSpace.height - floatH;

    placedModules.forEach(mod => {
      if (!mod.isFreePlacement) return;
      // 키큰장(full category)만 freeHeight 갱신 — 상/하부장은 독립 높이
      const cat = getModuleCategory(mod);
      if (cat !== 'full') return;
      // freeHeight가 있든 없든 새 최대높이로 갱신
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
  const [floatHeight, setFloatHeight] = useState<string>(
    String(spaceInfo.baseConfig?.floatHeight || 60)
  );

  // baseConfig 또는 바닥마감재 변경 시 로컬 상태 동기화
  useEffect(() => {
    setBaseHeight(String(getAdjustedBaseHeight()));
    setBaseDepth(String(spaceInfo.baseConfig?.depth ?? 0));
    if (spaceInfo.baseConfig) {
      setFloatHeight(String(spaceInfo.baseConfig.floatHeight || 60));
    }
  }, [spaceInfo.baseConfig, spaceInfo.hasFloorFinish, spaceInfo.floorFinish]);

  // 받침대 타입 변경 처리
  const handleBaseTypeChange = (type: 'floor' | 'stand') => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };

    // 띄워서 배치 선택 시 자동으로 띄움 높이 200mm 및 바닥 마감재 없음
    if (type === 'stand') {
      setFloatHeight('200'); // 기본값 200mm로 설정
      const doorSetupMode = spaceInfo.doorSetupMode || 'furniture-fit';
      const floatBottomGap = doorSetupMode === 'furniture-fit' ? 1.5 : 200;
      const updates: Partial<SpaceInfo> = {
        baseConfig: {
          ...currentBaseConfig,
          type,
          placementType: 'float', // 자동으로 띄워서 배치 설정
          floatHeight: 200, // 기본 높이 200mm
        },
        hasFloorFinish: false,  // 바닥 마감재 자동으로 없음
        floorFinish: undefined,  // 바닥 마감재 설정 제거
        doorBottomGap: floatBottomGap,
      };
      onUpdate(updates);
      // 개별 모듈 도어 갭도 갱신
      placedModules.forEach(module => {
        if (module.hasDoor) {
          updatePlacedModule(module.id, { doorBottomGap: floatBottomGap });
        }
      });
      // 자유배치 가구 freeHeight 재계산 (float 전환으로 높이 축소)
      recalcFreePlacementHeights(updates);
    } else {
      // 바닥에 배치 선택 (받침대 있음)
      const doorSetupModeForFloor = spaceInfo.doorSetupMode || 'furniture-fit';
      const groundBottomGap = doorSetupModeForFloor === 'furniture-fit' ? 1.5 : 25;
      const updates: Partial<SpaceInfo> = {
        baseConfig: {
          ...currentBaseConfig,
          type,
          placementType: 'ground', // 바닥에 배치 설정
          height: currentBaseConfig.height || 65, // 받침대 높이 유지
        },
        doorBottomGap: groundBottomGap,
      };
      onUpdate(updates);
      // 개별 모듈 도어 갭도 갱신
      placedModules.forEach(module => {
        if (module.hasDoor) {
          updatePlacedModule(module.id, { doorBottomGap: groundBottomGap });
        }
      });
      // 자유배치 가구 freeHeight 재계산 (ground 복귀로 높이 복원)
      recalcFreePlacementHeights(updates);
    }
  };

  // 배치 유형 변경 처리
  const handlePlacementTypeChange = (placementType: 'ground' | 'float') => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'stand', height: 65 };

    // 띄워서 배치 선택 시 바닥 마감재도 자동으로 없음으로 설정
    const updates: Partial<SpaceInfo> = placementType === 'float'
      ? {
          baseConfig: {
            ...currentBaseConfig,
            placementType,
            floatHeight: currentBaseConfig.floatHeight || 60,
          },
          hasFloorFinish: false,
          floorFinish: undefined,
        }
      : {
          baseConfig: {
            ...currentBaseConfig,
            placementType,
          },
        };

    onUpdate(updates);

    // 자유배치 가구 freeHeight 재계산 (float↔ground 전환)
    recalcFreePlacementHeights(updates);

    // 바닥 배치로 변경 시 모든 가구에 도어 기본 갭 설정
    if (placementType === 'ground') {
      const doorSetupMode = spaceInfo.doorSetupMode || 'furniture-fit';
      const defaultBottomGap = doorSetupMode === 'furniture-fit' ? 1.5 : 25;
      placedModules.forEach(module => {
        if (module.hasDoor) {
          updatePlacedModule(module.id, {
            doorTopGap: module.doorTopGap ?? 1.5,
            doorBottomGap: module.doorBottomGap ?? defaultBottomGap
          });
        }
      });
    }
  };

  // 높이 입력 처리
  const handleHeightChange = (value: string) => {
    console.log('🔧 BaseControls - handleHeightChange 호출됨:', value);
    
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      console.log('🔧 BaseControls - 입력값 검증 통과:', value);
      setBaseHeight(value);
      
      // 빈 문자열이면 업데이트하지 않음 (사용자가 입력 중)
      if (value === '') {
        return;
      }
      
      // 실시간 업데이트: 유효한 숫자인 경우 즉시 store 업데이트
      if (!isNaN(Number(value))) {
        let validatedValue = parseInt(value);
        
        // 바닥마감재가 있으면 표시된 값에 바닥마감재 높이를 더해서 저장
        if (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) {
          const floorFinishHeight = spaceInfo.floorFinish.height || 0;
          validatedValue = validatedValue + floorFinishHeight;
        }
        
        // baseConfig가 없으면 기본값으로 생성
        const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };
        
        console.log('🔧 BaseControls - store 업데이트:', {
          표시값: value,
          저장값: validatedValue,
          바닥마감재: spaceInfo.floorFinish?.height || 0
        });
        
        // 즉시 store 업데이트
        onUpdate({
          baseConfig: {
            ...currentBaseConfig,
            height: validatedValue,
          },
        });
      }
    } else {
      console.log('🔧 BaseControls - 입력값 검증 실패:', value);
    }
  };

  // 깊이 입력 처리
  const handleDepthChange = (value: string) => {
    console.log('🔧 BaseControls - handleDepthChange 호출됨:', value);

    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      console.log('🔧 BaseControls - depth 입력값 검증 통과:', value);
      setBaseDepth(value);

      // 빈 문자열이면 0으로 즉시 업데이트 (가구 사라지는 것 방지)
      if (value === '') {
        const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };
        console.log('🔧 BaseControls - 빈 문자열, depth=0으로 업데이트');
        onUpdate({
          baseConfig: {
            ...currentBaseConfig,
            depth: 0,
          },
        });
      } else {
        // 실시간 업데이트
        const validatedValue = parseInt(value);
        const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };
        console.log('🔧 BaseControls - depth store 업데이트:', {
          입력값: value,
          저장값: validatedValue,
          현재baseConfig: currentBaseConfig,
          새baseConfig: { ...currentBaseConfig, depth: validatedValue }
        });
        onUpdate({
          baseConfig: {
            ...currentBaseConfig,
            depth: validatedValue,
          },
        });
      }
    } else {
      console.log('🔧 BaseControls - depth 입력값 검증 실패:', value);
    }
  };

  // 띄움 높이 입력 처리
  const handleFloatHeightChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setFloatHeight(value);
      
      // 빈 문자열이면 업데이트하지 않음 (사용자가 입력 중)
      if (value === '') {
        return;
      }
      
      // 실시간 업데이트: 유효한 숫자인 경우 즉시 store 업데이트
      if (!isNaN(Number(value))) {
        const validatedValue = parseInt(value);
        
        // 범위 검증은 blur 시에만 적용
        
        // baseConfig가 없으면 기본값으로 생성
        const currentBaseConfig = spaceInfo.baseConfig || { type: 'stand', height: 0, floatHeight: 60 };
        
        // 즉시 store 업데이트
        const updates: Partial<SpaceInfo> = {
          baseConfig: {
            ...currentBaseConfig,
            floatHeight: validatedValue,
          },
        };
        onUpdate(updates);

        // 자유배치 가구 freeHeight 재계산
        recalcFreePlacementHeights(updates);
      }
    }
  };

  // 높이 업데이트 (blur 또는 Enter 시)
  const handleHeightBlur = () => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };
    
    let value = baseHeight;
    
    // 문자열이면 숫자로 변환
    if (typeof value === 'string') {
      value = value === '' ? 65 : parseInt(value);
    }

    // 최소값 (50mm) 보장
    if (value < 50) {
      value = 50;
    }

    // 최대값 (500mm) 보장
    if (value > 500) {
      value = 500;
    }

    // 로컬 상태 업데이트 (표시값)
    setBaseHeight(value);

    // 저장할 때는 바닥마감재 높이를 더해서 저장
    let saveValue = value;
    if (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) {
      const floorFinishHeight = spaceInfo.floorFinish.height || 0;
      saveValue = value + floorFinishHeight;
    }

    // 값이 변경된 경우만 업데이트
    if (saveValue !== currentBaseConfig.height) {
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          height: saveValue,
        },
      });
    }
  };

  // 깊이 업데이트 (blur 또는 Enter 시)
  const handleDepthBlur = () => {
    let value = baseDepth;

    // 문자열이면 숫자로 변환
    if (typeof value === 'string') {
      value = value === '' ? 0 : parseInt(value);
    }

    // 최소값 (0mm) 보장
    if (value < 0) {
      value = 0;
    }

    // 최대값 (300mm) 보장
    if (value > 300) {
      value = 300;
    }

    // 로컬 상태 업데이트
    setBaseDepth(value);

    // baseConfig가 없으면 기본값으로 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };

    // 값이 변경된 경우만 업데이트
    if (value !== (currentBaseConfig.depth ?? 0)) {
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          depth: value,
        },
      });
    }
  };

  // 띄움 높이 업데이트 (blur 또는 Enter 시)
  const handleFloatHeightBlur = () => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'stand', height: 0, floatHeight: 60 };
    
    let value = floatHeight;
    
    // 문자열이면 숫자로 변환
    if (typeof value === 'string') {
      value = value === '' ? 60 : parseInt(value);
    }

    // 최소값 (0mm) 보장
    if (value < 0) {
      value = 0;
    }

    // 최대값 (200mm) 보장
    if (value > 200) {
      value = 200;
    }

    // 로컬 상태 업데이트
    setFloatHeight(value);

    // 값이 변경된 경우만 업데이트
    if (value !== currentBaseConfig.floatHeight) {
      const doorSetupMode = spaceInfo.doorSetupMode || 'furniture-fit';
      const updatesObj: Partial<SpaceInfo> = {
        baseConfig: {
          ...currentBaseConfig,
          floatHeight: value,
        },
      };
      // 천장바닥기준이면 doorBottomGap도 새 floatHeight로 갱신
      if (doorSetupMode === 'space-fit') {
        updatesObj.doorBottomGap = value;
      }
      onUpdate(updatesObj);
      // space-fit이면 개별 모듈 도어 갭도 갱신
      if (doorSetupMode === 'space-fit') {
        placedModules.forEach(module => {
          if (module.hasDoor) {
            updatePlacedModule(module.id, { doorBottomGap: value });
          }
        });
      }
    }
  };

  // Enter 키 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleHeightBlur();
    }
  };

  // 깊이 Enter 키 처리
  const handleDepthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDepthBlur();
    }
  };

  // 띄움 높이 Enter 키 처리
  const handleFloatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFloatHeightBlur();
    }
  };

  return (
    <div className={styles.container}>
      {/* 받침대 타입 선택 */}
      {renderMode !== 'placement-only' && (
        <BaseTypeSelector
          baseConfig={spaceInfo.baseConfig}
          onBaseTypeChange={handleBaseTypeChange}
          disabled={disabled}
        />
      )}

      {/* 배치 설정 및 높이 조절 */}
      {renderMode !== 'type-only' && (
        <PlacementControls
          baseConfig={spaceInfo.baseConfig}
          baseHeight={baseHeight}
          baseDepth={baseDepth}
          floatHeight={floatHeight}
          onPlacementTypeChange={handlePlacementTypeChange}
          onHeightChange={handleHeightChange}
          onDepthChange={handleDepthChange}
          onFloatHeightChange={handleFloatHeightChange}
          onHeightBlur={handleHeightBlur}
          onDepthBlur={handleDepthBlur}
          onFloatHeightBlur={handleFloatHeightBlur}
          onKeyDown={handleKeyDown}
          onDepthKeyDown={handleDepthKeyDown}
          onFloatKeyDown={handleFloatKeyDown}
          disabled={disabled}
        />
      )}
    </div>
  );
};

export default BaseControls; 