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
  
  // 로컬 상태들
  const [baseHeight, setBaseHeight] = useState<string | number>(() => 
    spaceInfo.baseConfig?.height?.toString() || '65'
  );
  const [floatHeight, setFloatHeight] = useState<string | number>(() => 
    spaceInfo.baseConfig?.floatHeight?.toString() || '60'
  );

  // baseConfig 변경 시 로컬 상태 동기화
  useEffect(() => {
    if (spaceInfo.baseConfig) {
      setBaseHeight(spaceInfo.baseConfig.height);
      setFloatHeight(spaceInfo.baseConfig.floatHeight || 60);
    }
  }, [spaceInfo.baseConfig]);

  // 받침대 타입 변경 처리
  const handleBaseTypeChange = (type: 'floor' | 'stand') => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'floor', height: 65 };
    
    onUpdate({
      baseConfig: {
        ...currentBaseConfig,
        type,
        // 받침대 있음 선택 시 placementType 속성 제거
        ...(type === 'floor' ? {} : { placementType: currentBaseConfig.placementType || 'ground' }),
      },
    });
  };

  // 배치 유형 변경 처리
  const handlePlacementTypeChange = (placementType: 'ground' | 'float') => {
    // 기존 baseConfig가 없으면 기본값으로 초기화하여 생성
    const currentBaseConfig = spaceInfo.baseConfig || { type: 'stand', height: 65 };
    
    onUpdate({
      baseConfig: {
        ...currentBaseConfig,
        placementType,
        // 띄워서 배치 선택 시 기본 높이 설정
        ...(placementType === 'float' ? { floatHeight: currentBaseConfig.floatHeight || 60 } : {}),
      },
    });
  };

  // 높이 입력 처리
  const handleHeightChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setBaseHeight(value);
    }
  };

  // 띄움 높이 입력 처리
  const handleFloatHeightChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setFloatHeight(value);
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

    // 최대값 (100mm) 보장
    if (value > 100) {
      value = 100;
    }

    // 로컬 상태 업데이트
    setBaseHeight(value);

    // 값이 변경된 경우만 업데이트
    if (value !== currentBaseConfig.height) {
      onUpdate({
        baseConfig: {
          ...currentBaseConfig,
          height: value,
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
      />

      {/* 배치 설정 및 높이 조절 */}
      <PlacementControls
        baseConfig={spaceInfo.baseConfig}
        baseHeight={baseHeight}
        floatHeight={floatHeight}
        onPlacementTypeChange={handlePlacementTypeChange}
        onHeightChange={handleHeightChange}
        onFloatHeightChange={handleFloatHeightChange}
        onHeightBlur={handleHeightBlur}
        onFloatHeightBlur={handleFloatHeightBlur}
        onKeyDown={handleKeyDown}
        onFloatKeyDown={handleFloatKeyDown}
      />

      {/* 컬럼 수 설정 */}
      {/* ColumnCountControls 컴포넌트를 제거하고 import도 삭제합니다. */}
    </div>
  );
};

export default BaseControls; 