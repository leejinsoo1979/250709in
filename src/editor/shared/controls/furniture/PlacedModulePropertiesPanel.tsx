import React, { useState, useEffect, useCallback } from 'react';
import { useSpaceConfigStore, FURNITURE_LIMITS } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';
import { analyzeColumnSlots } from '../../utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '../../utils/indexing';
import styles from './PlacedModulePropertiesPanel.module.css';

// 가구 이미지 매핑 함수
const getFurnitureImagePath = (moduleId: string) => {
  // moduleId에서 실제 이미지 파일명 추출
  // 예: "dual-2drawer-hanging-1200" → "dual-2drawer-hanging.png"
  const imageName = moduleId.split('-').slice(0, -1).join('-') + '.png';
  const path = `${import.meta.env.BASE_URL}images/furniture-thumbnails/${imageName}`;
  if (import.meta.env.DEV) {
    console.log(`🖼️ [가구 팝업 이미지] ${moduleId} → ${imageName} → ${path}`);
  }
  return path;
};

const PlacedModulePropertiesPanel: React.FC = () => {
  // 컴포넌트 마운트 시 스타일 강제 적용 (다크모드 대응)
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 모든 테마에서 input 필드는 항상 흰 배경에 검은 텍스트 */
      .furniture-depth-input,
      input.furniture-depth-input,
      .${styles.depthInput},
      .${styles.panel} input[type="text"],
      .${styles.panel} input[type="number"],
      .${styles.depthInputWrapper} input,
      .${styles.inputWithUnit} input {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
        opacity: 1 !important;
        caret-color: #000000 !important;
      }
      .furniture-depth-input:focus,
      input.furniture-depth-input:focus,
      .${styles.depthInput}:focus,
      .${styles.panel} input[type="text"]:focus,
      .${styles.panel} input[type="number"]:focus,
      .${styles.depthInputWrapper} input:focus,
      .${styles.inputWithUnit} input:focus {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
      }
      /* 모든 상태에서 적용 */
      .${styles.depthInput}:hover,
      .${styles.depthInput}:active,
      .${styles.depthInput}:disabled,
      .${styles.depthInput}::placeholder {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
      }
      /* 다크 테마 클래스가 있는 경우 */
      .theme-dark .furniture-depth-input,
      .theme-dark input.furniture-depth-input,
      .theme-dark .${styles.depthInput},
      .theme-dark .${styles.panel} input,
      body.theme-dark .${styles.depthInput},
      html.theme-dark .${styles.depthInput} {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        background-color: #ffffff !important;
      }
    `;
    // 스타일을 가장 마지막에 추가하여 우선순위 보장
    document.head.appendChild(style);
    style.setAttribute('data-furniture-panel-styles', 'true');
    
    return () => {
      if (style.parentNode) {
        document.head.removeChild(style);
      }
    };
  }, []);
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const { activePopup, closeAllPopups } = useUIStore();

  // 훅 선언부를 조건문 위로 이동
  const [customDepth, setCustomDepth] = useState<number>(580); // 임시 기본값
  const [depthInputValue, setDepthInputValue] = useState<string>('580');
  const [depthError, setDepthError] = useState<string>('');
  const [hingePosition, setHingePosition] = useState<'left' | 'right'>('right');
  const [hasDoor, setHasDoor] = useState<boolean>(false);
  const [showWarning, setShowWarning] = useState(false);
  
  // 전체 팝업에서 엔터키 처리 - 조건문 위로 이동
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('🔑 키 입력 감지:', e.key, 'activePopup.type:', activePopup.type, 'showWarning:', showWarning);
      
      // 경고창이 열려있을 때
      if (showWarning) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          setShowWarning(false);
          console.log('✅ 경고창 닫기');
        }
        return;
      }
      
      // 메인 팝업이 열려있을 때 (furnitureEdit 타입 체크)
      if (activePopup.type === 'furnitureEdit') {
        if (e.key === 'Enter') {
          // input 필드에 포커스가 있는 경우는 제외 (깊이 입력 필드)
          const activeElement = document.activeElement;
          console.log('🎯 액티브 요소:', activeElement?.tagName, activeElement);
          
          if (activeElement?.tagName !== 'INPUT') {
            e.preventDefault();
            console.log('✅ 엔터키로 팝업 닫기');
            closeAllPopups(); // 확인 버튼과 동일한 동작
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          console.log('✅ ESC키로 팝업 닫기');
          closeAllPopups(); // 취소와 동일한 동작
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    console.log('🎯 키 이벤트 리스너 등록');
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      console.log('🎯 키 이벤트 리스너 제거');
    };
  }, [activePopup.type, showWarning, closeAllPopups]);
  
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

  // 현재 편집 중인 배치된 모듈 찾기 (조건부 렌더링 전에 미리 계산)
  const currentPlacedModule = activePopup.type === 'furnitureEdit' && activePopup.id 
    ? placedModules.find(module => module.id === activePopup.id)
    : null;

  // 모듈 데이터 가져오기 (조건부 렌더링 전에 미리 계산)
  const moduleData = currentPlacedModule 
    ? getModuleById(currentPlacedModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo) 
    : null;

  // 기둥 옆 캐비넷 여부 확인 (조건부 렌더링 전에 미리 계산)
  const isCoverDoor = React.useMemo(() => {
    if (!currentPlacedModule || !moduleData) return false;
    
    // 슬롯 인덱스가 있으면 기둥 슬롯 분석
    if (currentPlacedModule.slotIndex !== undefined) {
      const columnSlots = analyzeColumnSlots(spaceInfo);
      const slotInfo = columnSlots[currentPlacedModule.slotIndex];
      return slotInfo?.hasColumn || false;
    }
    
    // 슬롯 인덱스가 없으면 위치 기반으로 판단
    const columnSlots = analyzeColumnSlots(spaceInfo);
    const indexing = calculateSpaceIndexing(spaceInfo);
    
    // 가구 위치에서 가장 가까운 슬롯 찾기
    const slotIndex = indexing.threeUnitPositions.findIndex(pos => 
      Math.abs(pos - currentPlacedModule.position.x) < 0.1
    );
    
    if (slotIndex >= 0) {
      return columnSlots[slotIndex]?.hasColumn || false;
    }
    
    return false;
  }, [currentPlacedModule, moduleData, spaceInfo]);

  // 초기값 설정 - 의존성에서 getDefaultDepth 제거하여 불필요한 재실행 방지
  useEffect(() => {
    if (currentPlacedModule && moduleData) {
      const initialDepth = currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null
        ? currentPlacedModule.customDepth 
        : getDefaultDepth(moduleData);
      
      setCustomDepth(initialDepth);
      setDepthInputValue(initialDepth.toString());
      setHingePosition(currentPlacedModule.hingePosition || 'right');
      setHasDoor(currentPlacedModule.hasDoor ?? moduleData.hasDoor ?? false);
      
      console.log('🔧 팝업 초기값 설정:', {
        moduleId: currentPlacedModule.moduleId,
        hasCustomDepth: currentPlacedModule.customDepth !== undefined && currentPlacedModule.customDepth !== null,
        customDepth: currentPlacedModule.customDepth,
        defaultDepth: getDefaultDepth(moduleData),
        finalDepth: initialDepth
      });
    }
  }, [currentPlacedModule?.id, moduleData?.id]); // id만 의존성으로 하여 모듈 변경 시에만 실행

  // 가구 편집 팝업이 활성화되지 않았으면 렌더링하지 않음 (조건부 렌더링은 훅 선언 이후에만)
  if (activePopup.type !== 'furnitureEdit' || !activePopup.id) {
    return null;
  }

  // 듀얼 가구 여부 확인 (moduleId 기반)
  const isDualFurniture = moduleData ? moduleData.id.startsWith('dual-') : false;

  // 싱글 가구 여부 확인 (듀얼이 아닌 경우)
  const isSingleFurniture = !isDualFurniture;

  // 디버깅용 로그 (개발 모드에서만 출력)
  if (import.meta.env.DEV) {
    console.log(`🔍 [가구 타입 확인] ${moduleData?.id}: 듀얼=${isDualFurniture}, 싱글=${isSingleFurniture}, 커버도어=${isCoverDoor}`);
  }

  // 모듈 데이터가 없으면 렌더링하지 않음
  if (!currentPlacedModule || !moduleData) {
    return null;
  }

  const handleClose = () => {
    closeAllPopups();
  };

  const handleDeleteClick = () => {
    if (activePopup.id) {
      removeModule(activePopup.id);
      closeAllPopups();
    }
  };

  const handleCustomDepthChange = (newDepth: number) => {
    setCustomDepth(newDepth);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { customDepth: newDepth });
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
    // 커버도어인 경우 경고 표시
    if (isCoverDoor) {
      setShowWarning(true);
      // 3초 후 자동으로 경고 숨김
      setTimeout(() => setShowWarning(false), 3000);
      return;
    }
    
    setHingePosition(position);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hingePosition: position });
    }
  };

  const handleDoorChange = (doorEnabled: boolean) => {
    setHasDoor(doorEnabled);
    if (activePopup.id) {
      updatePlacedModule(activePopup.id, { hasDoor: doorEnabled });
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>가구 편집</h3>
          <div className={styles.headerButtons}>
            <button className={styles.closeButton} onClick={handleClose}>
              ✕
            </button>
          </div>
        </div>
        
        <div className={styles.content}>
          <div className={styles.moduleInfo}>
            <div className={styles.modulePreview}>
              <img 
                src={getFurnitureImagePath(moduleData.id)}
                alt={moduleData.name}
                className={styles.moduleImage}
                onError={(e) => {
                  // 이미지 로드 실패 시 기본 색상 박스로 대체
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                  const container = img.parentElement;
                  if (container) {
                    container.innerHTML = `<div 
                      class="${styles.moduleBox}"
                      style="
                        background-color: ${moduleData.color};
                        aspect-ratio: ${moduleData.dimensions.width} / ${moduleData.dimensions.height}
                      "
                    ></div>`;
                  }
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
                <span className={styles.propertyLabel}></span>
                <span className={styles.propertyValue}>
                  X: {Math.round(currentPlacedModule.position.x * 100)}mm, 
                  Z: {Math.round(currentPlacedModule.position.z * 100)}mm
                </span>
              </div>
            </div>
          </div>
          
          {/* 깊이 설정 */}
          <div className={styles.propertySection}>
            <h5 className={styles.sectionTitle}>깊이 설정</h5>
            <div className={styles.depthInputWrapper}>
              <div className={styles.inputWithUnit}>
                <input
                  type="number"
                  value={depthInputValue}
                  onChange={(e) => handleDepthInputChange(e.target.value)}
                  onBlur={handleDepthInputBlur}
                  onKeyDown={handleDepthKeyDown}
                  className={`${styles.depthInput} furniture-depth-input ${depthError ? styles.inputError : ''}`}
                  placeholder={`${FURNITURE_LIMITS.DEPTH.MIN}-${FURNITURE_LIMITS.DEPTH.MAX}`}
                  style={{
                    color: '#000000',
                    backgroundColor: '#ffffff',
                    WebkitTextFillColor: '#000000',
                    opacity: 1
                  }}
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
              <div className={styles.doorTabSelector}>
                <button
                  className={`${styles.doorTab} ${!hasDoor ? styles.activeDoorTab : ''}`}
                  onClick={() => handleDoorChange(false)}
                >
                  없음
                </button>
                <button
                  className={`${styles.doorTab} ${hasDoor ? styles.activeDoorTab : ''}`}
                  onClick={() => handleDoorChange(true)}
                >
                  있음
                </button>
              </div>
              
              {/* 경첩 방향 선택 (도어가 있고 싱글 가구인 경우만) */}
              {hasDoor && isSingleFurniture && (
                <div className={styles.hingeSubSection}>
                  <h6 className={styles.subSectionTitle}>경첩 방향</h6>
                  <div className={styles.hingeTabSelector}>
                    <button
                      className={`${styles.hingeTab} ${hingePosition === 'left' ? styles.activeHingeTab : ''}`}
                      onClick={() => handleHingePositionChange('left')}
                    >
                      왼쪽
                      <span className={styles.hingeTabSubtitle}>오른쪽으로 열림</span>
                    </button>
                    <button
                      className={`${styles.hingeTab} ${hingePosition === 'right' ? styles.activeHingeTab : ''}`}
                      onClick={() => handleHingePositionChange('right')}
                    >
                      오른쪽
                      <span className={styles.hingeTabSubtitle}>왼쪽으로 열림</span>
                    </button>
                  </div>
                  {isCoverDoor && (
                    <div className={styles.coverDoorNote}>
                      커버도어는 경첩 위치 변경이 불가합니다
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 삭제 버튼 */}
          <button 
            className={styles.deleteButton}
            onClick={handleDeleteClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            삭제
          </button>

          {/* 확인/취소 버튼 */}
          <div className={styles.confirmButtons}>
            <button 
              className={styles.cancelButton}
              onClick={handleClose}
            >
              취소
            </button>
            <button 
              className={styles.confirmButton}
              onClick={handleClose}
            >
              확인
            </button>
          </div>
        </div>
      </div>
      
      {/* 경고 팝업 */}
      {showWarning && (
        <div className={styles.warningOverlay}>
          <div className={styles.warningModal}>
            <div className={styles.warningIcon}>⚠️</div>
            <div className={styles.warningMessage}>
              커버도어는 경첩 위치 변경이 불가합니다
            </div>
            <button 
              className={styles.warningCloseButton}
              onClick={() => setShowWarning(false)}
            >
              확인
            </button>
          </div>
        </div>
      )}


    </div>
  );
};

export default PlacedModulePropertiesPanel; 