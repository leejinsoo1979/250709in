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
import { analyzeColumnSlots, adjustFurniturePositionForColumn, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, splitDualToSinglesIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition } from '@/editor/shared/utils/columnSlotProcessor';
import { useSpace3DView } from '../../context/useSpace3DView';

interface SlotDropZonesProps {
  spaceInfo: SpaceInfo;
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZones: React.FC<SlotDropZonesProps> = ({ spaceInfo }) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl } = useThree();
  const { viewMode } = useSpace3DView();
  
  // 마우스가 hover 중인 슬롯 인덱스 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  
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
  
  // 드롭 처리 함수
  const handleSlotDrop = React.useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
    if (!currentDragData) return false;
    
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
    
    // 기둥 슬롯 정보 가져오기
    const targetSlotInfo = columnSlots[slotIndex];
    
    // 가구 데이터 조회
    let moduleData = getModuleById(dragData.moduleData.id, internalSpace, spaceInfo);
    if (!moduleData) {
      return false;
    }
    
    // 기본 가구 깊이 계산 함수 (미리 정의)
    const getDefaultDepth = (moduleData: ModuleData | undefined) => {
      console.log('⚙️ [SlotDropZones] getDefaultDepth 계산:', {
        moduleId: moduleData?.id,
        moduleName: moduleData?.name,
        moduleDefaultDepth: moduleData?.defaultDepth,
        spaceDepth: spaceInfo.depth
      });
      
      if (moduleData?.defaultDepth) {
        const result = Math.min(moduleData.defaultDepth, spaceInfo.depth);
        console.log('✅ [SlotDropZones] defaultDepth 사용:', {
          moduleDefaultDepth: moduleData.defaultDepth,
          spaceDepth: spaceInfo.depth,
          finalResult: result
        });
        return result;
      }
      
      // 기존 fallback 로직
      const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
      const result = Math.min(spaceBasedDepth, 580);
      console.log('⚠️ [SlotDropZones] fallback 사용:', {
        spaceBasedDepth: spaceBasedDepth,
        fallbackLimit: 580,
        finalResult: result,
        reason: 'moduleData?.defaultDepth가 없음'
      });
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
        
        // 분할된 가구들을 한 번에 배치
        placedModules.forEach(module => addModule(module));
        
        // 그림자 업데이트
        if (viewMode === '3D' && gl && gl.shadowMap) {
          gl.shadowMap.needsUpdate = true;
          requestAnimationFrame(() => {
            gl.shadowMap.needsUpdate = true;
            requestAnimationFrame(() => {
              gl.shadowMap.needsUpdate = true;
            });
          });
        }
        
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
    
    const customDepth = getDefaultDepth(actualModuleData);
    
    // 기둥이 있는 슬롯의 경우 위치와 크기 미리 조정
    let finalPosition = { x: finalX, y: 0, z: 0 };
    let adjustedFurnitureWidth = actualModuleData.dimensions.width;
    let doorWidthForColumn = actualModuleData.dimensions.width - 3; // 기본값: 가구 너비 - 3mm
    
    if (targetSlotInfo && targetSlotInfo.hasColumn) {
      // 슬롯의 원래 경계 계산
      const slotWidthM = indexing.columnWidth * 0.01; // mm to meters
      const originalSlotBounds = {
        left: finalX - slotWidthM / 2,
        right: finalX + slotWidthM / 2,
        center: finalX
      };
      
      // 기둥 침범에 따른 새로운 가구 경계 계산
      const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
      
      // 가구 위치와 크기를 미리 조정
      finalPosition = { x: furnitureBounds.center, y: 0, z: 0 };
      adjustedFurnitureWidth = furnitureBounds.renderWidth;
      
      console.log('🏛️ 기둥이 있는 슬롯에 가구 배치 - 미리 조정:', {
        slotIndex,
        originalX: finalX,
        adjustedX: finalPosition.x,
        originalWidth: actualModuleData.dimensions.width,
        adjustedWidth: adjustedFurnitureWidth,
        columnPosition: targetSlotInfo.columnPosition,
        availableWidth: targetSlotInfo.availableWidth,
        intrusionDirection: targetSlotInfo.intrusionDirection,
        logic: '기둥 침범 방지: 배치 시점에 위치와 크기 미리 조정'
      });
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
    
    addModule(newModule);
    
    // 가구 배치 완료 후 그림자 즉시 업데이트
    if (viewMode === '3D' && gl && gl.shadowMap) {
      // 그림자 맵 강제 업데이트
      gl.shadowMap.needsUpdate = true;
      
      // 다음 몇 프레임에서도 계속 업데이트 (확실한 반영을 위해)
      requestAnimationFrame(() => {
        gl.shadowMap.needsUpdate = true;
        requestAnimationFrame(() => {
          gl.shadowMap.needsUpdate = true;
        });
      });
      
              if (import.meta.env.DEV) {
          console.log('🌟 SlotDropZones - 가구 배치 후 그림자 강제 업데이트 완료');
        }
    }
    
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
        const furnitureX = currentPreviewModule.position;
        const previewDepth = mmToThreeUnits(previewCustomDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - previewDepth/2;
        
        return (
          <group key={`furniture-preview-${slotIndex}`} position={[furnitureX, furnitureY, furnitureZ]}>
            <BoxModule 
              moduleData={previewModuleData}
              color="#88ff88"
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
  );
};

export default SlotDropZones;