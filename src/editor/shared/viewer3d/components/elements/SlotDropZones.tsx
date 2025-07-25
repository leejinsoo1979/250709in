import React, { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData } from '@/data/modules';
import BoxModule from '../modules/BoxModule';
import { 
  getSlotIndexFromMousePosition as getSlotIndexFromRaycast,
  isDualFurniture,
  calculateSlotDimensions,
  calculateSlotStartY,
  calculateFurniturePosition
} from '../../utils/slotRaycast';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, adjustFurniturePositionForColumn, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, splitDualToSinglesIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition, generateCabinetPlacementOptions, CabinetPlacementOption } from '@/editor/shared/utils/columnSlotProcessor';
import { useSpace3DView } from '../../context/useSpace3DView';
import CabinetPlacementPopup from '@/editor/shared/controls/CabinetPlacementPopup';
import { useTheme } from '@/contexts/ThemeContext';

interface SlotDropZonesProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZones: React.FC<SlotDropZonesProps> = ({ spaceInfo, showAll = true }) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl, invalidate } = useThree();
  const { viewMode } = useSpace3DView();
  
  // 테마 컨텍스트에서 색상 가져오기
  const { theme } = useTheme();
  
  // 마우스가 hover 중인 슬롯 인덱스 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  
  // 캐비넷 배치 선택 팝업 상태
  const [showPlacementPopup, setShowPlacementPopup] = useState(false);
  const [placementOptions, setPlacementOptions] = useState<CabinetPlacementOption[]>([]);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [pendingPlacementData, setPendingPlacementData] = useState<{
    dragEvent: DragEvent;
    dragData: any;
    slotIndex: number;
    moduleData: any;
  } | null>(null);
  
  // 내경 공간 및 인덱싱 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  // 기둥 슬롯 분석 (기둥 변경사항에 반응하도록 개선)
  const columnSlots = React.useMemo(() => {
    console.log('🔄 SlotDropZones - 기둥 슬롯 분석 업데이트:', {
      columnsCount: spaceInfo.columns?.length || 0,
      spaceWidth: spaceInfo.width,
      spaceHeight: spaceInfo.height,
      spaceDepth: spaceInfo.depth
    });
    return analyzeColumnSlots(spaceInfo);
  }, [spaceInfo, spaceInfo.columns]);

  // 가구 충돌 감지 함수 (새 가구 배치용)
  const detectNewFurnitureCollisions = React.useCallback((newSlotIndex: number, isDualFurniture: boolean) => {
    // 새 가구가 차지할 슬롯들 계산
    let occupiedSlots: number[] = [];
    if (isDualFurniture) {
      occupiedSlots = [newSlotIndex, newSlotIndex + 1];
    } else {
      occupiedSlots = [newSlotIndex];
    }

    // 충돌하는 기존 가구들 찾기
    const collidingModules: string[] = [];
    placedModules.forEach(module => {
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;

      const indexing = calculateSpaceIndexing(spaceInfo);
      const columnWidth = indexing.columnWidth;
      const isModuleDual = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
      
      // 기존 가구가 차지하는 슬롯들
      let moduleSlots: number[] = [];
      if (isModuleDual && module.slotIndex !== undefined) {
        moduleSlots = [module.slotIndex, module.slotIndex + 1];
      } else if (module.slotIndex !== undefined) {
        moduleSlots = [module.slotIndex];
      }

      // 슬롯 겹침 확인
      const hasOverlap = occupiedSlots.some(slot => moduleSlots.includes(slot));
      if (hasOverlap) {
        collidingModules.push(module.id);
        if (import.meta.env.DEV) {
          console.log('🚨 새 가구 배치로 인한 충돌 감지:', {
            newSlots: occupiedSlots,
            collidingModule: module.id,
            existingSlots: moduleSlots
          });
        }
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo]);

  // 충돌한 가구들 제거
  const removeCollidingFurniture = React.useCallback((collidingModuleIds: string[]) => {
    collidingModuleIds.forEach(moduleId => {
      if (import.meta.env.DEV) {
        console.log('🗑️ 새 가구 배치로 인한 기존 가구 제거:', moduleId);
      }
      removeModule(moduleId);
    });
  }, [removeModule]);
  
  // 드롭 처리 함수
  const handleSlotDrop = React.useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
    if (!currentDragData) {
      return false;
    }
    
    // HTML5 드래그 데이터 가져오기
    let dragData;
    try {
      const dragDataString = dragEvent.dataTransfer?.getData('application/json');
      if (!dragDataString) {
        return false;
      }
      dragData = JSON.parse(dragDataString);
    } catch (error) {
      console.error('Error parsing drag data:', error);
      return false;
    }
    
    if (!dragData || dragData.type !== 'furniture') {
      return false;
    }
    
    // needsWarning 확인 - 경고가 필요한 경우 즉시 경고 메시지 표시 후 중단
    if (dragData.moduleData?.needsWarning) {
      alert('배치슬롯의 사이즈를 늘려주세요');
      return false;
    }
    
    // 레이캐스팅으로 슬롯 인덱스 찾기
    const slotIndex = getSlotIndexFromRaycast(
      dragEvent.clientX, 
      dragEvent.clientY, 
      canvasElement,
      camera,
      scene,
      spaceInfo
    );
    
    if (slotIndex === null) {
      return false;
    }
    
    // 듀얼/싱글 가구 판별
    const isDual = isDualFurniture(dragData.moduleData.id, spaceInfo);
       
    // 슬롯 가용성 검사 - 충돌 시 배치 실패
    if (!isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
      return false; // 충돌하는 슬롯에는 배치 불가
    }
    
    // 가구 데이터 조회
    const moduleData = getModuleById(dragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      return false;
    }
    
    // 기둥 슬롯 정보 가져오기
    const targetSlotInfo = columnSlots[slotIndex];
    
    // 기본 가구 깊이 계산 함수 (미리 정의)
    const getDefaultDepth = (moduleData: ModuleData | undefined) => {
      
      if (moduleData?.defaultDepth) {
        const result = Math.min(moduleData.defaultDepth, spaceInfo.depth);
        return result;
      }
      
      // 기존 fallback 로직
      const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
      const result = Math.min(spaceBasedDepth, 580);
      return result;
    };
    
    // 듀얼 → 싱글 2개 분할 확인
    if (isDual) {
      const splitResult = splitDualToSinglesIfNeeded(moduleData, slotIndex, spaceInfo);
      if (splitResult.shouldSplit) {
        // 듀얼장을 2개의 싱글장으로 분할하여 배치
        const placedModules: any[] = [];
        
        // 왼쪽 싱글 가구 배치
        if (splitResult.leftSingleData && splitResult.leftSlotIndex !== undefined) {
          const leftX = calculateFurniturePosition(splitResult.leftSlotIndex, splitResult.leftSingleData.id, spaceInfo);
          if (leftX !== null) {
            const leftSlotInfo = columnSlots[splitResult.leftSlotIndex];
            let leftPosition = { x: leftX, y: 0, z: 0 };
            let leftFurnitureWidth = splitResult.leftSingleData.dimensions.width;
            
            // 기둥이 있는 슬롯의 경우 미리 위치와 크기 조정
            let leftDoorWidth = splitResult.leftSingleData.dimensions.width - 3; // 기본값: 가구 너비 - 3mm
            if (leftSlotInfo && leftSlotInfo.hasColumn) {
              const slotWidthM = indexing.columnWidth * 0.01;
              const originalBounds = {
                left: leftX - slotWidthM / 2,
                right: leftX + slotWidthM / 2,
                center: leftX
              };
              const furnitureBounds = calculateFurnitureBounds(leftSlotInfo, originalBounds, spaceInfo);
              leftPosition = { x: furnitureBounds.center, y: 0, z: 0 };
              leftFurnitureWidth = furnitureBounds.renderWidth;
              
              console.log('🏛️ 듀얼 분할 - 왼쪽 가구 기둥 침범 조정:', {
                slotIndex: splitResult.leftSlotIndex,
                originalX: leftX,
                adjustedX: leftPosition.x,
                originalWidth: splitResult.leftSingleData.dimensions.width,
                adjustedWidth: leftFurnitureWidth,
                intrusionDirection: leftSlotInfo.intrusionDirection
              });
            }
            
            const leftId = `placed-${Date.now()}-left-${Math.random().toString(36).substr(2, 9)}`;
            const leftModule = {
              id: leftId,
              moduleId: splitResult.leftSingleData.id,
              position: leftPosition,
              rotation: 0,
              hasDoor: false,
              customDepth: getDefaultDepth(splitResult.leftSingleData),
              slotIndex: splitResult.leftSlotIndex,
              isDualSlot: false,
              isValidInCurrentSpace: true,
              // 경계 기반 조정된 너비 저장
              adjustedWidth: leftFurnitureWidth,
              // 기둥 침범에 따른 최적 힌지 방향
              hingePosition: leftSlotInfo ? calculateOptimalHingePosition(leftSlotInfo) : 'right',
              columnSlotInfo: leftSlotInfo?.hasColumn ? {
                hasColumn: true,
                columnId: leftSlotInfo.column?.id,
                columnPosition: leftSlotInfo.columnPosition,
                availableWidth: leftSlotInfo.availableWidth,
                needsMullion: leftSlotInfo.needsMullion,
                mullionSide: leftSlotInfo.mullionSide,
                wasConvertedFromDual: true,
                originalDualSlots: [slotIndex, slotIndex + 1],
                actualSlots: [splitResult.leftSlotIndex],
                doorWidth: leftDoorWidth // 기둥 커버용 도어 너비
              } : { hasColumn: false }
            };
            placedModules.push(leftModule);
          }
        }
        
        // 오른쪽 싱글 가구 배치
        if (splitResult.rightSingleData && splitResult.rightSlotIndex !== undefined) {
          const rightX = calculateFurniturePosition(splitResult.rightSlotIndex, splitResult.rightSingleData.id, spaceInfo);
          if (rightX !== null) {
            const rightSlotInfo = columnSlots[splitResult.rightSlotIndex];
            let rightPosition = { x: rightX, y: 0, z: 0 };
            let rightFurnitureWidth = splitResult.rightSingleData.dimensions.width;
            
            // 기둥이 있는 슬롯의 경우 미리 위치와 크기 조정
            let rightDoorWidth = splitResult.rightSingleData.dimensions.width - 3; // 기본값: 가구 너비 - 3mm
            if (rightSlotInfo && rightSlotInfo.hasColumn) {
              const slotWidthM = indexing.columnWidth * 0.01;
              const originalBounds = {
                left: rightX - slotWidthM / 2,
                right: rightX + slotWidthM / 2,
                center: rightX
              };
              const furnitureBounds = calculateFurnitureBounds(rightSlotInfo, originalBounds, spaceInfo);
              rightPosition = { x: furnitureBounds.center, y: 0, z: 0 };
              rightFurnitureWidth = furnitureBounds.renderWidth;
              
              console.log('🏛️ 듀얼 분할 - 오른쪽 가구 기둥 침범 조정:', {
                slotIndex: splitResult.rightSlotIndex,
                originalX: rightX,
                adjustedX: rightPosition.x,
                originalWidth: splitResult.rightSingleData.dimensions.width,
                adjustedWidth: rightFurnitureWidth,
                intrusionDirection: rightSlotInfo.intrusionDirection
              });
            }
            
            const rightId = `placed-${Date.now()}-right-${Math.random().toString(36).substr(2, 9)}`;
            const rightModule = {
              id: rightId,
              moduleId: splitResult.rightSingleData.id,
              position: rightPosition,
              rotation: 0,
              hasDoor: false,
              customDepth: getDefaultDepth(splitResult.rightSingleData),
              slotIndex: splitResult.rightSlotIndex,
              isDualSlot: false,
              isValidInCurrentSpace: true,
              // 경계 기반 조정된 너비 저장
              adjustedWidth: rightFurnitureWidth,
              // 기둥 침범에 따른 최적 힌지 방향
              hingePosition: rightSlotInfo ? calculateOptimalHingePosition(rightSlotInfo) : 'right',
              columnSlotInfo: rightSlotInfo?.hasColumn ? {
                hasColumn: true,
                columnId: rightSlotInfo.column?.id,
                columnPosition: rightSlotInfo.columnPosition,
                availableWidth: rightSlotInfo.availableWidth,
                needsMullion: rightSlotInfo.needsMullion,
                mullionSide: rightSlotInfo.mullionSide,
                wasConvertedFromDual: true,
                originalDualSlots: [slotIndex, slotIndex + 1],
                actualSlots: [splitResult.rightSlotIndex],
                doorWidth: rightDoorWidth // 기둥 커버용 도어 너비
              } : { hasColumn: false }
            };
            placedModules.push(rightModule);
          }
        }
        
        // 분할된 가구들을 한 번에 배치 (충돌 감지 포함)
        placedModules.forEach(module => {
          // 각 분할된 가구에 대해 충돌 감지
          if (module.slotIndex !== undefined) {
            const collidingModules = detectNewFurnitureCollisions(module.slotIndex, module.isDualSlot || false);
            if (collidingModules.length > 0) {
              removeCollidingFurniture(collidingModules);
              if (import.meta.env.DEV) {
                console.log('🗑️ 분할 배치로 인해 슬롯 ' + module.slotIndex + '에서 ' + collidingModules.length + '개 기존 가구 제거됨');
              }
            }
          }
          addModule(module);
        });
        
        // Shadow auto-update enabled - manual shadow updates removed
        
        // 드래그 상태 초기화
        setCurrentDragData(null);
        
        console.log('✅ 듀얼장 분할 배치 완료:', {
          originalDualId: moduleData.id,
          leftModule: placedModules[0]?.id,
          rightModule: placedModules[1]?.id,
          leftSlot: splitResult.leftSlotIndex,
          rightSlot: splitResult.rightSlotIndex
        });
        
        return true;
      }
    }
    
    // 기존 단일 가구 배치 로직 (분할이 필요하지 않은 경우)
    let actualModuleData = moduleData;
    let actualModuleId = dragData.moduleData.id;
    let actualIsDual = isDual;
    
    if (targetSlotInfo && targetSlotInfo.hasColumn && !isDual) {
      // 싱글 가구인 경우에만 기존 변환 로직 적용
      const conversionResult = convertDualToSingleIfNeeded(moduleData, targetSlotInfo, spaceInfo);
      if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
        actualModuleData = conversionResult.convertedModuleData;
        actualModuleId = conversionResult.convertedModuleData.id;
        actualIsDual = false;
      }
    }
    
    // 최종 위치 계산
    let finalX = calculateFurniturePosition(slotIndex, actualModuleId, spaceInfo);
    if (finalX === null) {
      return false;
    }
    
    // 고유 ID 생성
    const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 현재 가구의 사용자 설정 깊이 확인
    const currentPlacedModule = placedModules.find(m => m.moduleId === actualModuleId);
    const currentCustomDepth = currentPlacedModule?.customDepth;
    
    // 기본 깊이 설정 - 사용자 설정이 있으면 우선 사용
    let customDepth = currentCustomDepth || getDefaultDepth(actualModuleData);
    
    // 기둥이 있는 슬롯인 경우 기둥 타입에 따라 처리
    if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
      const columnDepth = targetSlotInfo.column.depth;
      const DEPTH_THRESHOLD = 500; // 깊은/얕은 기둥 구분 기준
      const isDeepColumn = columnDepth >= DEPTH_THRESHOLD;
      
      if (isDeepColumn) {
        // 깊은 기둥(기둥A): 사용자 설정 깊이가 있으면 유지, 없으면 원래 깊이
        if (!currentCustomDepth) {
          customDepth = getDefaultDepth(actualModuleData); // 사용자 설정이 없을 때만 원래 깊이로
        }
        console.log('🔧 깊은 기둥(기둥A) - 깊이 유지, 폭만 조정:', {
          slotIndex: slotIndex,
          columnDepth: columnDepth,
          hasUserCustomDepth: !!currentCustomDepth,
          userCustomDepth: currentCustomDepth,
          finalDepth: customDepth,
          logic: '깊은 기둥은 폭만 조정, 사용자 설정 우선'
        });
      } else {
        // 얕은 기둥(기둥C): 사용자 설정이 없을 때만 깊이 조정
        if (!currentCustomDepth) {
          const adjustedDepth = 730 - columnDepth;
          console.log('🔧 얕은 기둥(기둥C) - 깊이 조정:', {
            slotIndex: slotIndex,
            columnDepth: columnDepth,
            originalDepth: getDefaultDepth(actualModuleData),
            adjustedDepth: adjustedDepth,
            계산식: `730 - ${columnDepth} = ${adjustedDepth}`
          });
          
          if (adjustedDepth >= 200) {
            customDepth = adjustedDepth;
            console.log('✅ customDepth 설정:', customDepth);
          }
        } else {
          console.log('🔧 얕은 기둥(기둥C) - 사용자 설정 깊이 유지:', {
            slotIndex: slotIndex,
            userCustomDepth: currentCustomDepth,
            logic: '사용자가 이미 깊이를 설정했으므로 유지'
          });
        }
      }
    } else {
      console.log('🔧 기둥 없는 슬롯 - 기본 깊이:', {
        slotIndex: slotIndex,
        hasColumn: false,
        customDepth: customDepth
      });
    }
    
    // 기둥이 있는 슬롯의 경우 위치와 크기 미리 조정
    let finalPosition = { x: finalX, y: 0, z: 0 };
    let adjustedFurnitureWidth = actualModuleData.dimensions.width;
    let doorWidthForColumn = actualModuleData.dimensions.width - 3; // 기본값: 가구 너비 - 3mm
    
    if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
      const columnDepth = targetSlotInfo.column.depth;
      
      console.log('🔍 기둥 정보 확인:', {
        slotIndex,
        columnDepth,
        columnWidth: targetSlotInfo.column.width,
        columnId: targetSlotInfo.column.id
      });
      
      // 기둥C (300mm 깊이)의 특별 처리: 침범량이 150mm 미만이면 기둥A 방식 적용
      const isColumnC = columnDepth === 300;
      let shouldUseDeepColumnLogic = false;
      
      if (isColumnC) {
        // 기둥C의 슬롯 침범량 계산
        const slotWidthM = indexing.columnWidth * 0.01;
        const slotLeftX = finalX - slotWidthM / 2;
        const slotRightX = finalX + slotWidthM / 2;
        
        const columnWidthM = targetSlotInfo.column.width * 0.01;
        const columnLeftX = targetSlotInfo.column.position[0] - columnWidthM / 2;
        const columnRightX = targetSlotInfo.column.position[0] + columnWidthM / 2;
        
        // 기둥이 슬롯 끝에서 안쪽으로 얼마나 들어왔는지 계산 (mm 단위)
        let intrusionFromEdge = 0;
        
        // 기둥이 왼쪽 끝에서 침범한 경우
        if (columnLeftX < slotLeftX && columnRightX > slotLeftX) {
          intrusionFromEdge = (columnRightX - slotLeftX) * 1000;
        }
        // 기둥이 오른쪽 끝에서 침범한 경우  
        else if (columnLeftX < slotRightX && columnRightX > slotRightX) {
          intrusionFromEdge = (slotRightX - columnLeftX) * 1000;
        }
        // 기둥이 슬롯을 완전히 덮는 경우
        else if (columnLeftX <= slotLeftX && columnRightX >= slotRightX) {
          intrusionFromEdge = (slotRightX - slotLeftX) * 1000; // 전체 슬롯 폭
        }
        
        // 항상 기둥A 방식 사용 (가구 폭 조정)
        shouldUseDeepColumnLogic = true;
        
        console.log('🏛️ 배치 시 기둥C 침범량 분석:', {
          slotIndex,
          intrusionFromEdge: intrusionFromEdge.toFixed(1) + 'mm',
          useDeepLogic: shouldUseDeepColumnLogic,
          appliedMethod: shouldUseDeepColumnLogic ? '기둥A 방식 (폭 조정)' : '기둥C 방식 (깊이 조정)'
        });
      }
      
      // 모든 기둥에 대해 위치와 크기 조정 적용
      console.log('🏛️ 기둥 침범 시 위치와 폭 조정');
      const slotWidthM = indexing.columnWidth * 0.01;
      const originalSlotBounds = {
        left: finalX - slotWidthM / 2,
        right: finalX + slotWidthM / 2,
        center: finalX
      };
      
      const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
      
      // 남은 공간이 150mm 미만이면 배치 불가
      if (furnitureBounds.renderWidth < 150) {
        console.error('❌ 기둥 침범으로 남은 공간이 150mm 미만:', furnitureBounds.renderWidth);
        return;
      }
      
      finalPosition = { x: furnitureBounds.center, y: 0, z: 0 };
      adjustedFurnitureWidth = furnitureBounds.renderWidth;
    }
    
    // 새 모듈 배치
    const newModule = {
      id: placedId,
      moduleId: actualModuleId, // 변환된 모듈 ID 사용
      position: finalPosition,
      rotation: 0,
      hasDoor: false, // 배치 시 항상 도어 없음 (오픈형)
      customDepth: customDepth, // 가구별 기본 깊이 설정
      slotIndex: slotIndex,
      isDualSlot: actualIsDual, // 변환 후 실제 상태 반영
      isValidInCurrentSpace: true,
      // 기둥 침범에 따른 조정된 가구 너비 저장
      adjustedWidth: adjustedFurnitureWidth,
      // 기둥 침범에 따른 최적 힌지 방향
      hingePosition: targetSlotInfo ? calculateOptimalHingePosition(targetSlotInfo) : 'right',
      // 기둥 관련 메타데이터 추가
      columnSlotInfo: targetSlotInfo?.hasColumn ? {
        hasColumn: true,
        columnId: targetSlotInfo.column?.id,
        columnPosition: targetSlotInfo.columnPosition,
        availableWidth: targetSlotInfo.availableWidth,
        needsMullion: targetSlotInfo.needsMullion,
        mullionSide: targetSlotInfo.mullionSide,
        wasConvertedFromDual: actualModuleId !== dragData.moduleData.id, // 변환 여부 표시
        originalDualSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex], // 원래 점유 슬롯
        actualSlots: actualIsDual ? [slotIndex, slotIndex + 1] : [slotIndex], // 실제 점유 슬롯
        doorWidth: doorWidthForColumn // 기둥 커버용 도어 너비
      } : { hasColumn: false }
    };
    
    // 충돌 감지 및 충돌한 가구 제거
    const collidingModules = detectNewFurnitureCollisions(slotIndex, actualIsDual);
    if (collidingModules.length > 0) {
      removeCollidingFurniture(collidingModules);
      if (import.meta.env.DEV) {
        console.log('🗑️ 새 가구 배치로 인해 ' + collidingModules.length + '개 기존 가구 제거됨');
      }
    }
    
    addModule(newModule);
    
    // Shadow auto-update enabled - manual shadow updates removed
    
    // 드래그 상태 초기화
    setCurrentDragData(null);
    
    return true;
  }, [
    currentDragData, 
    camera,
    scene,
    spaceInfo,
    internalSpace,
    placedModules,
    addModule, 
    setCurrentDragData,
    columnSlots
  ]);

  // 직접 분할 배치 함수 (간단한 버전)
  const attemptDirectSplitPlacement = (column: any, slotIndex: number, moduleData: any, spaceInfo: SpaceInfo) => {
    try {
      const indexing = calculateSpaceIndexing(spaceInfo);
      const slotWidthMm = indexing.columnWidth;
      const slotCenterX = indexing.threeUnitPositions[slotIndex];
      
      // 기둥 정보
      const columnCenterX = column.position[0]; // meters
      const columnLeftX = columnCenterX - (column.width * 0.01) / 2;
      const columnRightX = columnCenterX + (column.width * 0.01) / 2;
      
      // 슬롯 경계
      const slotLeftX = slotCenterX - (slotWidthMm * 0.01) / 2;
      const slotRightX = slotCenterX + (slotWidthMm * 0.01) / 2;
      
      // 기둥의 슬롯 침범 폭 계산 (mm)
      const columnSlotOverlapWidth = Math.max(0, 
        Math.min(columnRightX, slotRightX) - Math.max(columnLeftX, slotLeftX)
      ) * 100; // meters to mm
      
      // 좌우 여유 공간 계산 (mm)
      const leftSpaceMm = Math.max(0, (columnLeftX - slotLeftX) * 100);
      const rightSpaceMm = Math.max(0, (slotRightX - columnRightX) * 100);
      
      console.log('📐 기둥 침범 분석:', {
        columnWidth: column.width,
        columnSlotOverlapWidth: columnSlotOverlapWidth.toFixed(1),
        leftSpaceMm: leftSpaceMm.toFixed(1),
        rightSpaceMm: rightSpaceMm.toFixed(1),
        shouldSplit: columnSlotOverlapWidth >= 150,
        minRequired: 150
      });
      
      // 분할배치 조건: 기둥이 슬롯에 충분히 침범하고 기둥이 충분히 깊어야 함
      // 기둥C(300mm)는 침범폭이 300mm이지만 깊이가 작아서 분할배치 안함
      const shouldSplit = columnSlotOverlapWidth >= 400 && column.depth >= 500; // 더 엄격한 조건
      
      if (!shouldSplit) {
        return { 
          success: false, 
          reason: `분할배치 조건 불충족 - 침범폭: ${columnSlotOverlapWidth.toFixed(0)}mm, 기둥깊이: ${column.depth}mm (침범폭≥400mm, 기둥깊이≥500mm 필요)` 
        };
      }
      
      // 분할 가능성 확인 - 최소 공간 요구사항 완화 (50mm)
      if (leftSpaceMm < 50 && rightSpaceMm < 50) {
        return { 
          success: false, 
          reason: `양쪽 모두 공간 부족 - 좌측: ${leftSpaceMm.toFixed(0)}mm, 우측: ${rightSpaceMm.toFixed(0)}mm` 
        };
      }
      
      // 깊이 조정 - 깊은 기둥은 깊이 조정 안함
      const DEPTH_THRESHOLD = 500;
      const isDeepColumn = column.depth >= DEPTH_THRESHOLD;
      let adjustedDepth: number;
      
      if (isDeepColumn) {
        // 깊은 기둥: 원래 깊이 유지
        adjustedDepth = 730;
      } else {
        // 얕은 기둥: 깊이 조정
        adjustedDepth = 730 - column.depth;
        if (adjustedDepth < 200) {
          return { 
            success: false, 
            reason: `깊이 부족 - 조정된 깊이: ${adjustedDepth}mm` 
          };
        }
      }
      
      // 캐비넷 크기와 위치 계산 (한쪽만 있어도 배치 가능)
      const leftCabinetWidth = leftSpaceMm > 50 ? Math.max(50, leftSpaceMm - 5) : 0;
      const rightCabinetWidth = rightSpaceMm > 50 ? Math.max(50, rightSpaceMm - 5) : 0;
      
      const leftCabinetCenterX = slotLeftX + (leftSpaceMm * 0.01) / 2;
      const rightCabinetCenterX = columnRightX + (rightSpaceMm * 0.01) / 2;
      
      // 기둥 앞면에 배치할 캐비넷의 여유공간 계산
      const frontSpaceMm = adjustedDepth; // 조정된 깊이가 기둥 앞쪽 여유공간
      const canAddFrontCabinet = frontSpaceMm >= 150;
      
      console.log('🏗️ 기둥 앞면 캐비넷 배치 검토:', {
        frontSpaceMm,
        canAddFrontCabinet,
        columnDepth: column.depth,
        adjustedDepth
      });
      
      // 모듈 생성
      const modules = [];
      const timestamp = Date.now();
      
      // 기본 싱글 모듈 ID 생성 (기존 모듈이 어떤 타입이든 싱글로 변환)
      let baseModuleId = moduleData.id;
      if (baseModuleId.includes('dual-')) {
        baseModuleId = baseModuleId.replace('dual-', 'single-');
      } else if (!baseModuleId.includes('single-')) {
        // 기본 모듈이면 single- 접두사 추가
        baseModuleId = `single-${baseModuleId}`;
      }

      // 왼쪽 캐비넷 (공간이 있을 때만)
      if (leftCabinetWidth > 0) {
        modules.push({
          id: `split-left-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          moduleId: baseModuleId,
          position: { x: leftCabinetCenterX, y: 0, z: 0 },
          rotation: 0,
          hasDoor: false,
          customDepth: adjustedDepth,
          slotIndex: slotIndex,
          isDualSlot: false,
          isValidInCurrentSpace: true,
          adjustedWidth: leftCabinetWidth,
          hingePosition: 'right' as 'left' | 'right'
        });
      }
      
      // 오른쪽 캐비넷 (공간이 있을 때만)
      if (rightCabinetWidth > 0) {
        modules.push({
          id: `split-right-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          moduleId: baseModuleId,
          position: { x: rightCabinetCenterX, y: 0, z: 0 },
          rotation: 0,
          hasDoor: false,
          customDepth: adjustedDepth,
          slotIndex: slotIndex,
          isDualSlot: false,
          isValidInCurrentSpace: true,
          adjustedWidth: rightCabinetWidth,
          hingePosition: 'left' as 'left' | 'right'
        });
      }
      
      // 기둥 앞면에 맞닿는 좁은 캐비넷 추가 (여유공간 150mm 이상일 때)
      if (canAddFrontCabinet) {
        const frontCabinetWidth = Math.min(column.width - 20, 200); // 기둥 너비보다 작게, 최대 200mm
        const frontCabinetDepth = Math.min(frontSpaceMm - 10, 150); // 여유공간보다 작게, 최대 150mm
        const frontCabinetCenterX = columnCenterX; // 기둥 중심에 배치
        const frontCabinetZ = (column.depth * 0.01) / 2 + (frontCabinetDepth * 0.01) / 2; // 기둥 앞면에 맞닿게
        
        modules.push({
          id: `split-front-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          moduleId: baseModuleId,
          position: { x: frontCabinetCenterX, y: 0, z: frontCabinetZ },
          rotation: 0,
          hasDoor: false,
          customDepth: frontCabinetDepth,
          slotIndex: slotIndex,
          isDualSlot: false,
          isValidInCurrentSpace: true,
          adjustedWidth: frontCabinetWidth,
          hingePosition: 'right' as 'left' | 'right',
          isFrontColumn: true // 기둥 앞면 캐비넷 표시
        });
        
        console.log('✨ 기둥 앞면 캐비넷 추가:', {
          width: frontCabinetWidth,
          depth: frontCabinetDepth,
          centerX: frontCabinetCenterX,
          centerZ: frontCabinetZ
        });
      }
      
      // 최소 하나 이상의 모듈이 생성되었는지 확인
      if (modules.length === 0) {
        return { 
          success: false, 
          reason: '배치 가능한 캐비넷이 없음 - 모든 공간이 부족함' 
        };
      }

      console.log('✨ 분할 배치 모듈 생성 완료:', {
        leftModule: leftCabinetWidth > 0 ? { width: leftCabinetWidth, centerX: leftCabinetCenterX } : null,
        rightModule: rightCabinetWidth > 0 ? { width: rightCabinetWidth, centerX: rightCabinetCenterX } : null,
        frontModule: canAddFrontCabinet ? { 
          width: Math.min(column.width - 20, 200), 
          depth: Math.min(frontSpaceMm - 10, 150),
          centerX: columnCenterX 
        } : null,
        totalModules: modules.length,
        columnSlotOverlapWidth: columnSlotOverlapWidth.toFixed(1),
        depth: adjustedDepth
      });
      
      return { success: true, modules };
      
    } catch (error) {
      console.error('❌ 직접 분할 배치 에러:', error);
      return { success: false, reason: `에러 발생: ${error}` };
    }
  };

  // 선택된 배치 옵션 처리
  const handleSelectedPlacement = (
    option: CabinetPlacementOption, 
    placementData: { dragEvent: DragEvent; dragData: any; slotIndex: number; moduleData: any }
  ): boolean => {
    const { dragData, slotIndex, moduleData } = placementData;
    
    console.log('🏗️ 선택된 배치 옵션 처리:', {
      optionType: option.type,
      cabinetCount: option.cabinets.length,
      slotIndex
    });

    // 각 캐비넷을 배치
    option.cabinets.forEach((cabinet, index) => {
      const placedId = `placed-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
      
      const newModule = {
        id: placedId,
        moduleId: cabinet.moduleId,
        position: { x: cabinet.position[0], y: cabinet.position[1], z: cabinet.position[2] },
        rotation: 0,
        hasDoor: false,
        customDepth: cabinet.depth,
        slotIndex: slotIndex, // 분할 배치도 같은 슬롯에 배치 (위치는 다름)
        isDualSlot: false,
        isValidInCurrentSpace: true,
        adjustedWidth: cabinet.width,
        hingePosition: 'right' as 'left' | 'right',
        columnSlotInfo: {
          hasColumn: true,
          columnType: 'shallow',
          placementType: option.type,
          originalOption: option,
          splitIndex: index // 분할에서의 순서 (0: 왼쪽, 1: 오른쪽)
        }
      };

      // 캐비넷 배치 시 충돌 감지 및 제거
      const collidingModules = detectNewFurnitureCollisions(cabinet.slotIndex, false); // 캐비넷은 단일 슬롯
      if (collidingModules.length > 0) {
        removeCollidingFurniture(collidingModules);
        if (import.meta.env.DEV) {
          console.log('🗑️ 캐비넷 배치로 인해 ' + collidingModules.length + '개 기존 가구 제거됨');
        }
      }

      addModule(newModule);
      console.log('✅ 캐비넷 배치 완료:', {
        id: placedId,
        moduleId: cabinet.moduleId,
        width: cabinet.width,
        depth: cabinet.depth,
        position: cabinet.position
      });
    });

    // Shadow auto-update enabled - manual shadow updates removed

    // 드래그 상태 초기화
    setCurrentDragData(null);
    
    return true;
  };

  // 팝업에서 옵션 선택 시
  const handlePopupSelect = (option: CabinetPlacementOption) => {
    if (pendingPlacementData) {
      handleSelectedPlacement(option, pendingPlacementData);
    }
    setShowPlacementPopup(false);
    setPendingPlacementData(null);
    setPlacementOptions([]);
  };

  // 팝업 취소 시
  const handlePopupCancel = () => {
    setShowPlacementPopup(false);
    setPendingPlacementData(null);
    setPlacementOptions([]);
    setCurrentDragData(null);
  };
  
  // window 객체에 함수 노출
  useEffect(() => {
    window.handleSlotDrop = handleSlotDrop;
    
    return () => {
      delete window.handleSlotDrop;
    };
  }, [handleSlotDrop]);
  
  // 간단한 드래그오버 이벤트 핸들러 - 바닥 하이라이트용
  useEffect(() => {
    if (!currentDragData) {
      return;
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault(); // 드롭 허용
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const slotIndex = getSlotIndexFromRaycast(
        e.clientX, 
        e.clientY, 
        canvas,
        camera,
        scene,
        spaceInfo
      );
      
      // 슬롯이 감지되었을 때 충돌 검사
      if (slotIndex !== null && currentDragData) {
        const isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
        
        // 슬롯 가용성 검사 - 사용 불가능한 슬롯은 하이라이트하지 않음
        if (isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, currentDragData.moduleData.id)) {
          setHoveredSlotIndex(slotIndex);
        } else {
          setHoveredSlotIndex(null); // 충돌하는 슬롯은 하이라이트 안함
        }
      } else {
        setHoveredSlotIndex(slotIndex);
      }
    };

    const handleDragLeave = () => {
      setHoveredSlotIndex(null);
    };

    // 캔버스 컨테이너에 이벤트 리스너 추가
    const canvasContainer = document.querySelector('canvas')?.parentElement;
    if (canvasContainer) {
      canvasContainer.addEventListener('dragover', handleDragOver);
      canvasContainer.addEventListener('dragleave', handleDragLeave);
    }

    return () => {
      if (canvasContainer) {
        canvasContainer.removeEventListener('dragover', handleDragOver);
        canvasContainer.removeEventListener('dragleave', handleDragLeave);
      }
    };
  }, [currentDragData, camera, scene, spaceInfo, placedModules, columnSlots]);
  
  // 슬롯 크기 및 위치 계산
  const slotDimensions = calculateSlotDimensions(spaceInfo);
  const slotStartY = calculateSlotStartY(spaceInfo);
  
  
  return (
    <>
      <group>
        {/* 레이캐스팅용 투명 콜라이더들 */}
        {indexing.threeUnitPositions.map((slotX, slotIndex) => (
          <mesh
            key={`slot-collider-${slotIndex}`}
            position={[slotX, slotStartY + slotDimensions.height / 2, 0]}
            userData={{ 
              slotIndex, 
              isSlotCollider: true,
              type: 'slot-collider'
            }}
            visible={false}
          >
            <boxGeometry args={[slotDimensions.width, slotDimensions.height, slotDimensions.depth]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        ))}
        
        {/* 가구 미리보기 */}
        {indexing.threeUnitPositions.map((slotX, slotIndex) => {
          
          // 현재 드래그 중인 가구가 듀얼인지 확인
          let isDual = false;
          if (currentDragData) {
            isDual = isDualFurniture(currentDragData.moduleData.id, spaceInfo);
          }
          
          // 하이라이트 여부 결정
          let shouldHighlight = false;
          if (hoveredSlotIndex !== null && currentDragData) {
            if (isDual) {
              // 듀얼 가구: 현재 슬롯과 다음 슬롯 모두 하이라이트
              shouldHighlight = slotIndex === hoveredSlotIndex || slotIndex === hoveredSlotIndex + 1;
            } else {
              // 싱글 가구: 현재 슬롯만 하이라이트
              shouldHighlight = slotIndex === hoveredSlotIndex;
            }
          }
          
          if (!shouldHighlight || !currentDragData) return null;
          
          // 드래그 중인 가구의 모듈 데이터 가져오기
          let moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
          if (!moduleData) return null;
        
        // 미리보기용 듀얼 분할 확인
        let previewModules: any[] = [];
        if (hoveredSlotIndex !== null && isDual) {
          const splitResult = splitDualToSinglesIfNeeded(moduleData, hoveredSlotIndex, spaceInfo);
          if (splitResult.shouldSplit) {
            // 분할 미리보기: 두 개의 싱글 가구
            if (splitResult.leftSingleData && (slotIndex === hoveredSlotIndex)) {
              previewModules.push({
                data: splitResult.leftSingleData,
                slotIndex: hoveredSlotIndex,
                position: indexing.threeUnitPositions[hoveredSlotIndex]
              });
            }
            if (splitResult.rightSingleData && (slotIndex === hoveredSlotIndex + 1)) {
              previewModules.push({
                data: splitResult.rightSingleData,
                slotIndex: hoveredSlotIndex + 1,
                position: indexing.threeUnitPositions[hoveredSlotIndex + 1]
              });
            }
          } else {
            // 분할하지 않는 듀얼 가구
            if (slotIndex === hoveredSlotIndex) {
              previewModules.push({
                data: moduleData,
                slotIndex: hoveredSlotIndex,
                position: (indexing.threeUnitPositions[hoveredSlotIndex] + indexing.threeUnitPositions[hoveredSlotIndex + 1]) / 2
              });
            }
          }
        } else if (!isDual && slotIndex === hoveredSlotIndex) {
          // 싱글 가구 미리보기
          let previewModuleData = moduleData;
          const previewSlotInfo = columnSlots[hoveredSlotIndex];
          if (previewSlotInfo && previewSlotInfo.hasColumn) {
            const conversionResult = convertDualToSingleIfNeeded(moduleData, previewSlotInfo, spaceInfo);
            if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
              previewModuleData = conversionResult.convertedModuleData;
            }
          }
          previewModules.push({
            data: previewModuleData,
            slotIndex: hoveredSlotIndex,
            position: indexing.threeUnitPositions[hoveredSlotIndex]
          });
        }

        if (previewModules.length === 0) return null;

        // 미리보기용 기본 깊이 계산 함수
        const getPreviewDepth = (moduleData: ModuleData) => {
          if (moduleData?.defaultDepth) {
            return Math.min(moduleData.defaultDepth, spaceInfo.depth);
          }
          const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
          return Math.min(spaceBasedDepth, 580);
        };

        // Z축 위치 계산 상수
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const doorThicknessMm = 20;
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        const panelDepthMm = 1500;
        const furnitureDepthMm = 600;
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;

        // 현재 슬롯에 해당하는 미리보기 모듈 찾기
        const currentPreviewModule = previewModules.find(pm => pm.slotIndex === slotIndex);
        if (!currentPreviewModule) return null;

        const previewModuleData = currentPreviewModule.data;
        const previewCustomDepth = getPreviewDepth(previewModuleData);
        const furnitureHeight = previewModuleData.dimensions.height * 0.01;
        const furnitureY = slotStartY + furnitureHeight / 2;
        // 기존: const furnitureX = currentPreviewModule.position;
        // 위치 조정 로직 추가
        let furnitureX = currentPreviewModule.position;
        // 아래 코드가 적용될 부분: 미리보기에서 드래그 중이거나 드래그 모드일 때는 원래 x를, 아니면 originalSlotCenterX를 사용
        // 조건에 따라 조정
        // isDraggingThis, isDragMode는 미리보기에서는 항상 true 취급(미리보기니까)
        // 하지만 placedModule.position.x, originalSlotCenterX 패턴을 미리보기에도 적용
        // 아래와 같이 가상 예시로 적용:
        // adjustedPosition = {
        //   ...placedModule.position,
        //   x: (isDraggingThis || isDragMode)
        //     ? placedModule.position.x
        //     : originalSlotCenterX
        // }
        // 미리보기에서는 currentPreviewModule.position이 원래 x, indexing.threeUnitPositions[slotIndex]가 originalSlotCenterX
        // isDraggingThis/isDragMode는 미리보기에서 항상 true로 간주
        // 실제 적용 예시:
        // furnitureX = (isDraggingThis || isDragMode) ? currentPreviewModule.position : indexing.threeUnitPositions[slotIndex];
        // 아래처럼 적용하면 실제 코드와 동일한 패턴
        const isDraggingThis = true; // 미리보기에서는 항상 true
        const isDragMode = true;     // 미리보기에서는 항상 true
        const originalSlotCenterX = indexing.threeUnitPositions[slotIndex];
        furnitureX = (isDraggingThis || isDragMode)
          ? currentPreviewModule.position
          : originalSlotCenterX;

        const previewDepth = mmToThreeUnits(previewCustomDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - previewDepth/2;

        return (
          <group key={`furniture-preview-${slotIndex}`} position={[furnitureX, furnitureY, furnitureZ]}>
            <BoxModule 
              moduleData={previewModuleData}
              color={theme.color}
              isDragging={true}
              internalHeight={previewModuleData.dimensions.height}
              hasDoor={false}
              customDepth={previewCustomDepth}
              spaceInfo={spaceInfo}
            />
          </group>
        );
      })}
    </group>
      
      {/* 캐비넷 배치 선택 팝업 */}
      {showPlacementPopup && pendingPlacementData && (
        <CabinetPlacementPopup
          options={placementOptions}
          onSelect={handlePopupSelect}
          onCancel={handlePopupCancel}
          position={popupPosition}
          columnDepth={pendingPlacementData.slotIndex !== undefined && columnSlots[pendingPlacementData.slotIndex]?.column?.depth || 0}
        />
      )}
    </>
  );
};

export default SlotDropZones;