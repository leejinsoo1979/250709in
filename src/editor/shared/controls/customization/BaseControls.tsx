import React, { useState, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import BaseTypeSelector from './components/BaseTypeSelector';
import PlacementControls from './components/PlacementControls';
import styles from '../styles/common.module.css';

interface BaseControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
  disabled?: boolean;
}

const BaseControls: React.FC<BaseControlsProps> = ({ spaceInfo, onUpdate, disabled = false }) => {
  
  console.log('🔧 BaseControls - disabled 상태:', disabled);
  
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
    String(0)
  );
  const [floatHeight, setFloatHeight] = useState<string>(
    String(spaceInfo.baseConfig?.floatHeight || 60)
  );

  // baseConfig 또는 바닥마감재 변경 시 로컬 상태 동기화
  useEffect(() => {
    setBaseHeight(String(getAdjustedBaseHeight()));
    setBaseDepth(String(0));
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
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          type,
          placementType: 'float', // 자동으로 띄워서 배치 설정
          floatHeight: 200, // 기본 높이 200mm
        },
        hasFloorFinish: false,  // 바닥 마감재 자동으로 없음
        floorFinish: undefined,  // 바닥 마감재 설정 제거
      });
    } else {
      // 바닥에 배치 선택 (받침대 있음)
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          type,
          placementType: 'ground', // 바닥에 배치 설정
          height: currentBaseConfig.height || 65, // 받침대 높이 유지
        },
      });
    }
  };

  // 배치 유형 변경 처리
  const handlePlacementTypeChange = (placementType: 'ground' | 'float') => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'stand', height: 65 };
    
    // 띄워서 배치 선택 시 바닥 마감재도 자동으로 없음으로 설정
    if (placementType === 'float') {
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          placementType,
          floatHeight: currentBaseConfig.floatHeight || 60,
        },
        hasFloorFinish: false,  // 바닥 마감재 자동으로 없음
        floorFinish: undefined,  // 바닥 마감재 설정 제거
      });
    } else {
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          placementType,
        },
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
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setBaseDepth(value);
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
        onUpdate({
          baseConfig: {
            ...currentBaseConfig,
            floatHeight: validatedValue,
          },
        });
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

    // 최대값 (600mm) 보장
    if (value > 600) {
      value = 600;
    }

    // 로컬 상태 업데이트
    setBaseDepth(value);
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
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          floatHeight: value,
        },
      });
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
      <BaseTypeSelector
        baseConfig={spaceInfo.baseConfig}
        onBaseTypeChange={handleBaseTypeChange}
        disabled={disabled}
      />

      {/* 배치 설정 및 높이 조절 */}
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

      {/* 컬럼 수 설정 */}
      {/* ColumnCountControls 컴포넌트를 제거하고 import도 삭제합니다. */}
    </div>
  );
};

export default BaseControls; 