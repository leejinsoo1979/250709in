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
  const setSelectedModuleForPlacement = useFurnitureStore(state => state.setSelectedModuleForPlacement);
  const selectedModuleForPlacement = useFurnitureStore(state => state.selectedModuleForPlacement);
  const { openFurniturePopup } = useUIStore();
  const itemRef = useRef<HTMLDivElement>(null);
  
  // 도어 상태 관리 (기본값: false - 도어 없음)
  const [hasDoor, setHasDoor] = useState<boolean>(false);
  
  // 현재 모듈이 선택되었는지 확인
  const isSelected = selectedModuleForPlacement?.moduleData?.id === module.id;
  
  // 모듈 유효성 검사
  const validation = validateModuleForInternalSpace(module, internalSpace);
  const isValid = validation.isValid;
  const needsWarning = validation.needsWarning || false;
  const isDynamic = module.isDynamic;

  // 도어 버튼 클릭 핸들러
  const handleDoorToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // 이벤트 버블링 방지
    const newHasDoor = !hasDoor;
    setHasDoor(newHasDoor);
    
    // 선택된 모듈의 도어 상태도 업데이트
    if (isSelected && selectedModuleForPlacement) {
      const updatedData = {
        ...selectedModuleForPlacement,
        moduleData: {
          ...selectedModuleForPlacement.moduleData,
          hasDoor: newHasDoor
        }
      };
      setSelectedModuleForPlacement(updatedData);
    }
  };

  // 간단한 드래그 아이콘 생성
  const createDragIcon = (): HTMLElement => {
    const icon = document.createElement('div');
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-primary').trim() || '#10b981';
    icon.style.cssText = `position:absolute;top:-1000px;width:48px;height:48px;background:${hasDoor ? primaryColor : primaryColor};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:28px;font-weight:bold;`;
    icon.textContent = hasDoor ? '🚪' : '📦'; // 도어 없음: 박스 아이콘으로 변경
    document.body.appendChild(icon);
    return icon;
  };



  // 네이티브 HTML5 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    if (!isValid && !needsWarning) {
      e.preventDefault();
      return;
    }
    
    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);
    
    // 드래그 데이터 설정 (도어 정보 포함)
    const dragData = {
      type: 'furniture',
      moduleData: {
        id: module.id,
        name: module.name,
        dimensions: module.dimensions,
        type: module.type || 'default',
        color: module.color,
        hasDoor: hasDoor, // 현재 도어 상태 포함
        needsWarning: needsWarning // 경고 필요 여부 추가
      }
    };
    
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', module.id); // 호환성을 위해 추가
    
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

    // 전역 드래그 상태 초기화
    setCurrentDragData(null);
  };

  // 클릭 핸들러 - 클릭-앤-플레이스 모드로 변경
  const handleClick = () => {
    if (!isValid && !needsWarning) {
      alert(`이 모듈은 현재 내경 공간에 맞지 않습니다.\n내경 공간: ${internalSpace.width}×${internalSpace.height}×${internalSpace.depth}mm\n모듈 크기: ${module.dimensions.width}×${module.dimensions.height}×${module.defaultDepth || module.dimensions.depth}mm`);
      return;
    }
    
    if (needsWarning) {
      alert('배치슬롯의 사이즈를 늘려주세요');
      return;
    }
    
    // 클릭-앤-플레이스 데이터 설정
    const clickData = {
      type: 'furniture' as const,
      moduleData: {
        id: module.id,
        name: module.name,
        dimensions: module.dimensions,
        type: module.type || 'default',
        color: module.color,
        hasDoor: hasDoor,
        needsWarning: needsWarning
      }
    };
    
    // 이미 선택된 모듈을 다시 클릭하면 선택 해제
    if (isSelected) {
      console.log('🚫 [ModuleItem] Deselecting module:', module.id);
      setSelectedModuleForPlacement(null);
      setFurniturePlacementMode(false);
    } else {
      // 새로운 모듈 선택
      console.log('✅ [ModuleItem] Selecting module:', {
        moduleId: module.id,
        clickData
      });
      setSelectedModuleForPlacement(clickData);
      setFurniturePlacementMode(true);
    }
  };

  return (
    <div
      ref={itemRef}
      key={module.id}
      className={`${styles.moduleItem} ${!isValid && !needsWarning ? styles.moduleItemDisabled : ''} ${needsWarning ? styles.moduleItemWarning : ''} ${isDynamic ? styles.moduleItemDynamic : ''} ${isSelected ? styles.moduleItemSelected : ''}`}
      onClick={handleClick}
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
            aspectRatio: `${module.dimensions.width} / ${module.dimensions.height}`
          }}
        />
        {!isValid && !needsWarning && <div className={styles.invalidIcon}>✕</div>}
        {needsWarning && <div className={styles.warningIcon}>⚠️</div>}
        {isDynamic && <div className={styles.dynamicIcon}>⚡</div>}
      </div>
      
      <div className={styles.moduleInfo}>
        <div className={`${styles.moduleName} ${!isValid ? styles.moduleNameDisabled : ''}`}>
          {module.name}
        </div>
        <div className={styles.moduleDimensions}>
          {module.dimensions.width} × {module.dimensions.height} × {module.defaultDepth || module.dimensions.depth}mm
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