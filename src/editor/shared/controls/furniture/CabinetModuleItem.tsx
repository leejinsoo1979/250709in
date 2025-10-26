import React, { useRef, useState } from 'react';
import { ModuleData, validateModuleForInternalSpace } from '@/data/modules';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import DoorIcon from './DoorIcon';
import styles from './ModuleLibrary.module.css';

interface CabinetModuleItemProps {
  module: ModuleData;
  internalSpace: { width: number; height: number; depth: number };
}

const CabinetModuleItem: React.FC<CabinetModuleItemProps> = ({ module, internalSpace }) => {
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
  
  // 디버깅: 상부장 유효성 검사 결과
  if (module.category === 'upper') {
    console.log('🔍 상부장 유효성 검사:', {
      moduleId: module.id,
      moduleName: module.name,
      moduleHeight: module.dimensions.height,
      internalSpaceHeight: internalSpace.height,
      fitsHeight: validation.fitsHeight,
      isValid,
      needsWarning,
      validation
    });
  }

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
    icon.textContent = hasDoor ? '🚪' : '📦';

    wrapper.appendChild(icon);
    document.body.appendChild(wrapper);
    return wrapper;
  };

  // 네이티브 HTML5 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    console.log('🎯 드래그 시작 시도:', {
      moduleId: module.id,
      category: module.category,
      isValid,
      needsWarning,
      canDrag: isValid || needsWarning
    });
    
    if (!isValid && !needsWarning) {
      console.log('❌ 드래그 차단됨:', { moduleId: module.id, isValid, needsWarning });
      e.preventDefault();
      return;
    }
    
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
    
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', module.id);
    
    e.dataTransfer.effectAllowed = 'copy';
    
    // 간단한 드래그 아이콘 설정
    const dragIcon = createDragIcon();
    e.dataTransfer.setDragImage(dragIcon, 24, 24);
    setTimeout(() => dragIcon.remove(), 0);

    // 전역 드래그 상태 설정
    setCurrentDragData(dragData);
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

  // 카테고리에 따라 라벨 결정
  const getCategoryLabel = () => {
    if (module.category === 'upper') return '상부장';
    if (module.category === 'lower') return '하부장';
    return '';
  };

  return (
    <div
      ref={itemRef}
      key={module.id}
      className={`${styles.moduleItem} ${styles.cabinetModuleItem} ${!isValid && !needsWarning ? styles.moduleItemDisabled : ''} ${needsWarning ? styles.moduleItemWarning : ''} ${isDynamic ? styles.moduleItemDynamic : ''}`}
      tabIndex={-1}
      draggable={isValid || needsWarning}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={needsWarning ? '배치슬롯의 사이즈를 늘려주세요' : (!isValid ? '내경 공간에 맞지 않는 모듈입니다' : '드래그하여 배치하세요')}
      style={{ 
        cursor: (isValid || needsWarning) ? 'grab' : 'not-allowed'
      }}
    >
      {/* 2D 썸네일 */}
      <div className={styles.modulePreview3D}>
        <div className={styles.cabinetThumbnail}>
          {/* 정면 뷰 */}
          <div 
            className={styles.cabinetFront}
            style={{ 
              backgroundColor: module.color || '#8B7355',
              width: '120px',
              height: module.category === 'upper' ? '80px' : '120px',
              position: 'relative',
              borderRadius: '4px',
              border: '2px solid rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {/* 선반 라인 표시 */}
            {module.modelConfig?.sections?.[0]?.count && Array.from({ length: module.modelConfig.sections[0].count - 1 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  width: '90%',
                  height: '2px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  top: `${((idx + 1) / module.modelConfig.sections[0].count) * 100}%`
                }}
              />
            ))}
            
            {/* 카테고리 아이콘 */}
            <div style={{ 
              fontSize: '24px', 
              opacity: 0.5,
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}>
              {module.category === 'upper' ? '⬆️' : '⬇️'}
            </div>
          </div>
        </div>
        
        {!isValid && !needsWarning && <div className={styles.invalidIcon}>✕</div>}
        {needsWarning && <div className={styles.warningIcon}>⚠️</div>}
        {isDynamic && <div className={styles.dynamicIcon}>⚡</div>}
        
        {/* 카테고리 라벨 */}
        <div className={styles.categoryLabel}>
          {getCategoryLabel()}
        </div>
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

export default CabinetModuleItem;