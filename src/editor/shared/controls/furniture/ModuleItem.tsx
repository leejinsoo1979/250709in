import React, { useRef, useState } from 'react';
import { ModuleData, validateModuleForInternalSpace, getModuleById } from '@/data/modules';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getInternalSpaceBoundsX, getModuleBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import { placeFurnitureFree } from '@/editor/shared/furniture/hooks/usePlaceFurnitureFree';
import { isCustomizableModuleId, getCustomizableCategory, getCustomDimensionKey, CUSTOMIZABLE_DEFAULTS } from './CustomizableFurnitureLibrary';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import DoorIcon from './DoorIcon';
import styles from './ModuleLibrary.module.css';


interface ModuleItemProps {
  module: ModuleData;
  internalSpace: { width: number; height: number; depth: number };
}

const ModuleItem: React.FC<ModuleItemProps> = ({ module, internalSpace }) => {
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const setSelectedFurnitureId = useFurnitureStore(state => state.setSelectedFurnitureId);
  const { openFurniturePopup, setIsSlotDragging } = useUIStore();
  const itemRef = useRef<HTMLDivElement>(null);

  // 도어 상태 관리 (기본값: false - 도어 없음)
  const [hasDoor, setHasDoor] = useState<boolean>(false);

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



  // 클릭 핸들러
  const handleClick = () => {
    console.log('🔵 ModuleItem 클릭:', module.id);
    if (isValid || needsWarning) {
      setSelectedFurnitureId(module.id);
      setFurniturePlacementMode(true); // 클릭 시 배치 모드 활성화 (고스트 프리뷰용)
      console.log('🎯 가구 선택됨:', module.id, '- 배치 모드 활성화');
    }
  };

  // 더블클릭 핸들러: 자유배치 모드에서 좌측부터 자동 배치
  const handleDoubleClick = () => {
    const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
    if (spaceInfo.layoutMode !== 'free-placement') return;
    if (!isValid && !needsWarning) return;

    console.log('🔵 ModuleItem 더블클릭 (자동배치):', module.id);

    const furnitureStore = useFurnitureStore.getState();
    const placedModules = furnitureStore.placedModules;
    const internalSpace = calculateInternalSpace(spaceInfo);

    // 활성 가구 데이터 결정
    let moduleData: any;
    let dims: { width: number; height: number; depth: number };

    if (isCustomizableModuleId(module.id)) {
      const category = getCustomizableCategory(module.id);
      const dimKey = getCustomDimensionKey(module.id);
      const defaults = CUSTOMIZABLE_DEFAULTS[dimKey] || CUSTOMIZABLE_DEFAULTS[category];
      const height = category === 'full' ? internalSpace.height : defaults.height;
      const lastDims = furnitureStore.lastCustomDimensions[dimKey];
      const pp = useMyCabinetStore.getState().pendingPlacement;

      dims = {
        width: pp ? pp.width : (lastDims ? lastDims.width : defaults.width),
        height: pp ? pp.height : (lastDims ? lastDims.height : height),
        depth: pp ? pp.depth : (lastDims ? lastDims.depth : defaults.depth),
      };
      moduleData = {
        id: module.id,
        name: defaults.label,
        category: (pp ? pp.category : category) as 'full' | 'upper' | 'lower',
        dimensions: dims,
        color: '#D4C5A9',
        description: defaults.label,
        hasDoor: false,
        isDynamic: false,
        type: 'box' as const,
        defaultDepth: dims.depth,
        modelConfig: { basicThickness: 18, hasOpenFront: true, hasShelf: false, sections: [] },
      };
    } else {
      moduleData = getModuleById(module.id, internalSpace, spaceInfo);
      if (!moduleData) return;
      const lastDims = furnitureStore.lastCustomDimensions[module.id.replace(/-[\d.]+$/, '')];
      dims = lastDims ? { width: lastDims.width, height: lastDims.height, depth: lastDims.depth } : moduleData.dimensions;
      moduleData = { ...moduleData, dimensions: dims };
    }

    const furnitureWidth = dims.width;

    // 공간 경계 계산 (잠긴 이격거리 반영)
    const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);
    const lockedGaps = spaceInfo.lockedWallGaps;
    const effStartX = (lockedGaps?.left != null && lockedGaps.left > 0) ? startX + lockedGaps.left : startX;
    const effEndX = (lockedGaps?.right != null && lockedGaps.right > 0) ? endX - lockedGaps.right : endX;

    // 배치된 가구 바운드를 왼쪽→오른쪽 정렬
    const freeModules = placedModules.filter(m => m.isFreePlacement && !m.isSurroundPanel);
    const sortedBounds = freeModules.map(m => getModuleBoundsX(m)).sort((a, b) => a.left - b.left);

    // 카테고리 (upper/lower 공존 가능)
    const newCategory = moduleData.category || 'full';

    // 좌측부터 빈 공간 찾기
    const halfW = furnitureWidth / 2;
    let targetX: number | null = null;

    // 후보 위치: 왼쪽 벽부터 시작
    const candidates: { left: number; right: number }[] = [];

    if (sortedBounds.length === 0) {
      candidates.push({ left: effStartX, right: effEndX });
    } else {
      // 왼쪽 벽 ~ 첫 가구
      if (sortedBounds[0].left > effStartX) {
        candidates.push({ left: effStartX, right: sortedBounds[0].left });
      }
      // 가구 사이
      for (let i = 0; i < sortedBounds.length - 1; i++) {
        if (sortedBounds[i + 1].left > sortedBounds[i].right) {
          candidates.push({ left: sortedBounds[i].right, right: sortedBounds[i + 1].left });
        }
      }
      // 마지막 가구 ~ 오른쪽 벽
      const lastRight = sortedBounds[sortedBounds.length - 1].right;
      if (effEndX > lastRight) {
        candidates.push({ left: lastRight, right: effEndX });
      }
    }

    // upper/lower 공존: 동일 카테고리가 아닌 가구 위에도 배치 가능
    if (newCategory === 'upper' || newCategory === 'lower') {
      const coexistCategory = newCategory === 'upper' ? 'lower' : 'upper';
      for (const b of sortedBounds) {
        if (b.category === coexistCategory) {
          // 이 가구 위(또는 아래)에 배치 가능 — 같은 위치를 후보에 추가
          const overlapLeft = b.left;
          const overlapRight = b.right;
          if (overlapRight - overlapLeft >= furnitureWidth) {
            candidates.push({ left: overlapLeft, right: overlapRight });
          }
        }
      }
      // 중복 제거 후 좌측 우선 정렬
      candidates.sort((a, b) => a.left - b.left);
    }

    for (const gap of candidates) {
      const gapWidth = gap.right - gap.left;
      if (gapWidth >= furnitureWidth) {
        targetX = gap.left + halfW;
        break;
      }
    }

    if (targetX === null) {
      console.warn('❌ [자동배치] 배치할 빈 공간이 없습니다');
      return;
    }

    // 배치 실행
    const pendingPlacement = useMyCabinetStore.getState().pendingPlacement;
    const result = placeFurnitureFree({
      moduleId: module.id,
      xPositionMM: targetX,
      spaceInfo,
      dimensions: dims,
      existingModules: placedModules,
      moduleData,
      pendingPlacement,
    });

    if (result.success && result.module) {
      furnitureStore.addModule(result.module);
      console.log('✅ [자동배치] 배치 완료:', result.module.id, 'at X=', targetX);

      // 배치 모드 해제 및 선택 해제
      furnitureStore.setFurniturePlacementMode(false);
      furnitureStore.setSelectedFurnitureId(null);
    } else {
      console.warn('❌ [자동배치] 배치 실패:', result.error);
    }
  };

  // useEffect로 직접 DOM에 클릭/더블클릭 이벤트 추가
  React.useEffect(() => {
    const element = itemRef.current;
    if (!element) return;

    element.addEventListener('click', handleClick, true);
    element.addEventListener('dblclick', handleDoubleClick, true);

    return () => {
      element.removeEventListener('click', handleClick, true);
      element.removeEventListener('dblclick', handleDoubleClick, true);
    };
  }, [module.id, isValid, needsWarning]);

  // 네이티브 HTML5 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    if (!isValid && !needsWarning) {
      e.preventDefault();
      return;
    }

    console.log('🚀 드래그 시작:', module.id);

    // 드래그 시작 시 가구 선택 (고스트 표시용)
    setSelectedFurnitureId(module.id);

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
    console.log('🛑 드래그 종료:', module.id);

    // 가구 배치 모드 비활성화
    setFurniturePlacementMode(false);
    setIsSlotDragging(false); // 슬롯 드래그 종료

    // 전역 드래그 상태 초기화를 지연시켜 drop 이벤트가 먼저 처리되도록 함
    setTimeout(() => {
      setCurrentDragData(null);
      // 드래그 종료 후 선택 해제
      setSelectedFurnitureId(null);
    }, 100);
  };

  // 선택된 가구인지 확인
  const selectedFurnitureId = useFurnitureStore(state => state.selectedFurnitureId);
  const isSelected = selectedFurnitureId === module.id;

  return (
    <div
      ref={itemRef}
      key={module.id}
      className={`${styles.moduleItem} ${!isValid && !needsWarning ? styles.moduleItemDisabled : ''} ${needsWarning ? styles.moduleItemWarning : ''} ${isDynamic ? styles.moduleItemDynamic : ''} ${isSelected ? styles.moduleItemSelected : ''}`}
      tabIndex={-1}
      draggable={false}
      // onDragStart={handleDragStart}
      // onDragEnd={handleDragEnd}
      title={needsWarning ? '배치슬롯의 사이즈를 늘려주세요' : (!isValid ? '내경 공간에 맞지 않는 모듈입니다' : '클릭하여 선택하세요')}
      style={{
        cursor: (isValid || needsWarning) ? 'pointer' : 'not-allowed'
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