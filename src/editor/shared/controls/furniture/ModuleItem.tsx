import React, { useRef, useState } from 'react';
import { ModuleData, validateModuleForInternalSpace } from '@/data/modules';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import DoorIcon from './DoorIcon';
import styles from './ModuleLibrary.module.css';


interface ModuleItemProps {
  module: ModuleData;
  internalSpace: { width: number; height: number; depth: number };
}

const ModuleItem: React.FC<ModuleItemProps> = ({ module, internalSpace }) => {
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const { openFurniturePopup, setIsSlotDragging } = useUIStore();
  const itemRef = useRef<HTMLDivElement>(null);

  // 도어 상태 관리 (기본값: false - 도어 없음)
  const [hasDoor, setHasDoor] = useState<boolean>(false);

  // 모듈 유효성 검사
  const validation = validateModuleForInternalSpace(module, internalSpace);
  const isValid = validation.isValid;
  const needsWarning = validation.needsWarning || false;
  const isDynamic = module.isDynamic;

  console.log(`🎨 [ModuleItem] ${module.id} 렌더링:`, {
    isValid,
    needsWarning,
    isDynamic,
    draggable: isValid || needsWarning,
    internalSpace
  });

  // 도어 버튼 클릭 핸들러
  const handleDoorToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // 이벤트 버블링 방지
    const newHasDoor = !hasDoor;
    setHasDoor(newHasDoor);
  };

  // 간단한 드래그 아이콘 생성
  const createDragIcon = (): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:absolute;top:-1000px;width:48px;height:48px;background:transparent;`;

    const icon = document.createElement('div');
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim() || '#10b981';
    icon.style.cssText = `width:48px;height:48px;background:${hasDoor ? primaryColor : primaryColor};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:28px;font-weight:bold;`;
    icon.textContent = hasDoor ? '🚪' : '📦'; // 도어 없음: 박스 아이콘으로 변경

    wrapper.appendChild(icon);
    document.body.appendChild(wrapper);
    return wrapper;
  };



  // 네이티브 HTML5 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    console.log('🚀 [ModuleItem] handleDragStart 호출:', {
      moduleId: module.id,
      moduleName: module.name,
      isValid,
      needsWarning,
      validation,
      internalSpace
    });

    if (!isValid && !needsWarning) {
      console.log('❌ [ModuleItem] 드래그 차단됨 (유효하지 않음)');
      e.preventDefault();
      return;
    }

    console.log('✅ [ModuleItem] 드래그 시작 허용');

    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);
    setIsSlotDragging(true); // 슬롯 드래그 시작

    // 드래그 데이터 설정 (도어 정보 포함)
    const dragData = {
      type: 'furniture',
      moduleData: {
        id: module.id,
        name: module.name,
        dimensions: module.dimensions,
        type: module.type || 'default',
        category: module.category, // 카테고리 정보 추가
        color: module.color,
        hasDoor: hasDoor, // 현재 도어 상태 포함
        needsWarning: needsWarning // 경고 필요 여부 추가
      }
    };

    console.log('📦 [ModuleItem] 드래그 데이터 설정:', dragData);

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', module.id); // 호환성을 위해 추가

    e.dataTransfer.effectAllowed = 'copy';

    // 간단한 드래그 아이콘 설정
    const dragIcon = createDragIcon();
    e.dataTransfer.setDragImage(dragIcon, 24, 24);
    setTimeout(() => dragIcon.remove(), 0);

    // 전역 드래그 상태 설정
    setCurrentDragData(dragData);

    console.log('✅ [ModuleItem] 드래그 초기화 완료');
  };

  const handleDragEnd = () => {
    // 가구 배치 모드 비활성화
    setFurniturePlacementMode(false);
    setIsSlotDragging(false); // 슬롯 드래그 종료

    // 전역 드래그 상태 초기화를 지연시켜 drop 이벤트가 먼저 처리되도록 함
    setTimeout(() => {
      setCurrentDragData(null);
    }, 100);
  };


  return (
    <div
      ref={itemRef}
      key={module.id}
      className={`${styles.moduleItem} ${!isValid && !needsWarning ? styles.moduleItemDisabled : ''} ${needsWarning ? styles.moduleItemWarning : ''} ${isDynamic ? styles.moduleItemDynamic : ''}`}
      tabIndex={-1}
      draggable={isValid || needsWarning}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={needsWarning ? '배치슬롯의 사이즈를 늘려주세요' : (!isValid ? '내경 공간에 맞지 않는 모듈입니다' : '드래그하여 배치하세요')}
      style={{ 
        cursor: (isValid || needsWarning) ? 'grab' : 'not-allowed'
      }}
    >
      <div className={styles.modulePreview}>
        <div 
          className={styles.moduleBox}
          style={{ 
            backgroundColor: (isValid || needsWarning) ? module.color : '#ccc',
            aspectRatio: `${module.dimensions.width} / ${module.dimensions.height}`,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* 상하부장 구분 표시 */}
          {(module.category === 'upper' || module.category === 'lower') && (
            <div style={{ 
              fontSize: '16px', 
              opacity: 0.6,
              position: 'absolute'
            }}>
              {module.category === 'upper' ? '상' : '하'}
            </div>
          )}
        </div>
        {!isValid && !needsWarning && <div className={styles.invalidIcon}>✕</div>}
        {needsWarning && <div className={styles.warningIcon}>⚠️</div>}
        {isDynamic && <div className={styles.dynamicIcon}>⚡</div>}
      </div>
      
      <div className={styles.moduleInfo}>
        <div className={`${styles.moduleName} ${!isValid ? styles.moduleNameDisabled : ''}`}>
          {module.name}
        </div>
        <div className={styles.moduleDimensions}>
          {module.slotWidths && module.slotWidths.length === 2 ? (
            // 듀얼 가구인 경우 개별 슬롯 너비 표시
            <>
              {module.slotWidths[0]}mm × 2슬롯 (총 {module.dimensions.width}mm) × {module.dimensions.height} × {module.defaultDepth || module.dimensions.depth}mm
            </>
          ) : (
            // 싱글 가구인 경우 기존 표시
            <>
              {module.dimensions.width} × {module.dimensions.height} × {module.defaultDepth || module.dimensions.depth}mm
            </>
          )}
        </div>
        {module.description && (
          <div className={styles.moduleDescription}>{module.description}</div>
        )}
        {!isValid && !needsWarning && (
          <div className={styles.validationError}>
            내경 공간 초과
          </div>
        )}
        {needsWarning && (
          <div className={styles.validationWarning}>
            슬롯 사이즈 부족
          </div>
        )}
      </div>
      
      {/* 도어 아이콘 버튼 (오른편에 배치) */}
      <div className={styles.doorOption}>
        <DoorIcon
          isActive={hasDoor}
          onClick={handleDoorToggle}
          disabled={!isValid}
          className={styles.doorIconButton}
        />
      </div>
    </div>
  );
};

export default ModuleItem; 