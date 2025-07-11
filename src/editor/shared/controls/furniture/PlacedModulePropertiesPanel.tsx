import React, { useState, useEffect, useCallback } from 'react';
import { useSpaceConfigStore, FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import styles from './PlacedModulePropertiesPanel.module.css';

const PlacedModulePropertiesPanel: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const editMode = useFurnitureStore(state => state.editMode);
  const editingModuleId = useFurnitureStore(state => state.editingModuleId);
  const setEditMode = useFurnitureStore(state => state.setEditMode);
  const setEditingModuleId = useFurnitureStore(state => state.setEditingModuleId);
  
  // 현재 편집 중인 배치된 모듈 찾기
  const currentPlacedModule = placedModules.find(module => module.id === editingModuleId);
  
  // 기본 가구 깊이 계산 (가구별 defaultDepth 우선, 없으면 fallback)
  const getDefaultDepth = useCallback((moduleData?: ModuleData) => {
    // 가구별 기본 깊이가 정의되어 있으면 사용
    if (moduleData?.defaultDepth) {
      return Math.min(moduleData.defaultDepth, spaceInfo.depth);
    }
    
    // 기존 로직 (fallback)
    const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
    return Math.min(spaceBasedDepth, FURNITURE_LIMITS.DEPTH.DEFAULT_FALLBACK);
  }, [spaceInfo.depth]);
  
  // 로컬 상태로 속성 관리
  const [customDepth, setCustomDepth] = useState<number>(580); // 임시 기본값
  const [depthInputValue, setDepthInputValue] = useState<string>('580');
  const [depthError, setDepthError] = useState<string>('');
  const [hingePosition, setHingePosition] = useState<'left' | 'right'>('right');
  const [hasDoor, setHasDoor] = useState<boolean>(false); // 도어 설치 여부
  
  // 현재 모듈의 속성값으로 로컬 상태 초기화
  useEffect(() => {
    if (currentPlacedModule) {
      const internalSpace = calculateInternalSpace(spaceInfo);
      const moduleData = getModuleById(currentPlacedModule.moduleId, internalSpace, spaceInfo);
      const depth = currentPlacedModule.customDepth || getDefaultDepth(moduleData || undefined);
      setCustomDepth(depth);
      setDepthInputValue(depth.toString());
      setHingePosition(currentPlacedModule.hingePosition || 'right');
      setHasDoor(currentPlacedModule.hasDoor ?? false); // 실제 도어 설치 여부
    }
  }, [currentPlacedModule, spaceInfo, getDefaultDepth]);

  // 편집모드가 아니거나 편집 중인 모듈이 없으면 렌더링하지 않음
  if (!editMode || !editingModuleId || !currentPlacedModule) {
    return null;
  }
  
  const internalSpace = calculateInternalSpace(spaceInfo);
  const moduleData = getModuleById(currentPlacedModule.moduleId, internalSpace, spaceInfo);
  
  if (!moduleData) {
    return null;
  }

  // 듀얼 가구인지 확인 (moduleId에 'dual'이 포함되어 있는지 확인)
  const isDualFurniture = currentPlacedModule.moduleId.includes('dual');

  const handleClose = () => {
    setEditMode(false);
    setEditingModuleId(null);
    // 선택상태 제거로 인해 setSelectedPlacedModuleId 호출 불필요
  };

  const handleCustomDepthChange = (newDepth: number) => {
    setCustomDepth(newDepth);
    if (editingModuleId) {
      updatePlacedModule(editingModuleId, { customDepth: newDepth });
    }
  };

  // 깊이 입력 필드 처리
  const handleDepthInputChange = (value: string) => {
    // 숫자와 빈 문자열만 허용
    if (value === '' || /^\d+$/.test(value)) {
      setDepthInputValue(value);
      setDepthError('');
    }
  };

  const handleDepthInputBlur = () => {
    const value = depthInputValue;
    if (value === '') {
      // 빈 값인 경우 기존 값으로 되돌림
      setDepthInputValue(customDepth.toString());
      return;
    }
    
    const numValue = parseInt(value);
    const minDepth = FURNITURE_LIMITS.DEPTH.MIN;
    const maxDepth = Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX);
    
    // 범위 검증
    if (numValue < minDepth) {
      setDepthError(`최소 ${minDepth}mm 이상이어야 합니다`);
    } else if (numValue > maxDepth) {
      setDepthError(`최대 ${maxDepth}mm 이하여야 합니다`);
    } else {
      setDepthError('');
      handleCustomDepthChange(numValue);
    }
  };

  const handleDepthKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDepthInputBlur();
    }
  };

  const handleHingePositionChange = (position: 'left' | 'right') => {
    setHingePosition(position);
    if (editingModuleId) {
      updatePlacedModule(editingModuleId, { hingePosition: position });
    }
  };

  const handleDoorChange = (doorEnabled: boolean) => {
    setHasDoor(doorEnabled);
    if (editingModuleId) {
      updatePlacedModule(editingModuleId, { hasDoor: doorEnabled });
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>가구 편집</h3>
          <button className={styles.closeButton} onClick={handleClose}>
            ✕
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.moduleInfo}>
            <div className={styles.modulePreview}>
              <div 
                className={styles.moduleBox}
                style={{ 
                  backgroundColor: moduleData.color,
                  aspectRatio: `${moduleData.dimensions.width} / ${moduleData.dimensions.height}`
                }}
              />
            </div>
            
            <div className={styles.moduleDetails}>
              <h4 className={styles.moduleName}>{moduleData.name}</h4>
              
              <div className={styles.property}>
                <span className={styles.propertyLabel}>크기:</span>
                <span className={styles.propertyValue}>
                  {moduleData.dimensions.width} × {moduleData.dimensions.height} × {customDepth}mm
                </span>
              </div>
              
              <div className={styles.property}>
                <span className={styles.propertyLabel}>위치:</span>
                <span className={styles.propertyValue}>
                  X: {Math.round(currentPlacedModule.position.x * 100)}mm, 
                  Z: {Math.round(currentPlacedModule.position.z * 100)}mm
                </span>
              </div>
            </div>
          </div>
          
          {/* 깊이 설정 */}
          <div className={styles.propertySection}>
            <h5 className={styles.sectionTitle}>가구 깊이</h5>
            <div className={styles.depthInputWrapper}>
              <div className={styles.inputWithUnit}>
                <input
                  type="text"
                  value={depthInputValue}
                  onChange={(e) => handleDepthInputChange(e.target.value)}
                  onBlur={handleDepthInputBlur}
                  onKeyDown={handleDepthKeyDown}
                  className={`${styles.depthInput} ${depthError ? styles.inputError : ''}`}
                  placeholder={`${FURNITURE_LIMITS.DEPTH.MIN}-${FURNITURE_LIMITS.DEPTH.MAX}`}
                />
                <span className={styles.unit}>mm</span>
              </div>
              {depthError && <div className={styles.errorMessage}>{depthError}</div>}
              <div className={styles.depthRange}>
                범위: {FURNITURE_LIMITS.DEPTH.MIN}mm ~ {Math.min(spaceInfo.depth, FURNITURE_LIMITS.DEPTH.MAX)}mm
              </div>
            </div>
          </div>

          {/* 도어 설정 (도어 지원 가구만) */}
          {moduleData.hasDoor && (
            <div className={styles.propertySection}>
              <h5 className={styles.sectionTitle}>도어 유무</h5>
              <div className={styles.doorSelector}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="doorOption"
                    value="none"
                    checked={!hasDoor}
                    onChange={() => handleDoorChange(false)}
                  />
                  <span className={styles.radioText}>없음 (오픈형으로 설치)</span>
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="doorOption"
                    value="with-door"
                    checked={hasDoor}
                    onChange={() => handleDoorChange(true)}
                  />
                  <span className={styles.radioText}>있음 (문짝으로 설치)</span>
                </label>
              </div>
              
              {/* 힌지 위치 선택 (도어가 있고 듀얼 가구가 아닌 경우만) */}
              {hasDoor && !isDualFurniture && (
                <div className={styles.hingeSubSection}>
                  <h6 className={styles.subSectionTitle}>힌지 위치</h6>
                  <div className={styles.hingeSelector}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="hingePosition"
                        value="left"
                        checked={hingePosition === 'left'}
                        onChange={() => handleHingePositionChange('left')}
                      />
                      <span className={styles.radioText}>왼쪽 (오른쪽으로 열림)</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="hingePosition"
                        value="right"
                        checked={hingePosition === 'right'}
                        onChange={() => handleHingePositionChange('right')}
                      />
                      <span className={styles.radioText}>오른쪽 (왼쪽으로 열림)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 편집 안내 */}
          <div className={styles.editGuide}>
            <p>• 가구를 더블클릭하여 편집모드에 진입할 수 있습니다</p>
            <p>• 마우스 드래그로 가구를 이동할 수 있습니다</p>
            <p>• 키보드 화살표로 가구를 이동할 수 있습니다</p>
            <p>• Delete 키로 가구를 삭제할 수 있습니다</p>
            <p>• Esc 키로 편집을 종료할 수 있습니다</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlacedModulePropertiesPanel; 