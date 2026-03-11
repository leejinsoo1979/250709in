import { useState, useRef, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getSlotIndexAndZoneFromMousePosition } from '../../../../utils/slotRaycast';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, FurniturePositioner } from '@/editor/shared/utils/indexing';

interface UseFurnitureDragProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureDrag = ({ spaceInfo }: UseFurnitureDragProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const moveModule = useFurnitureStore(state => state.moveModule);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { setFurnitureDragging, activeDroppedCeilingTab } = useUIStore();
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [tempPosition, setTempPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [dragEndData, setDragEndData] = useState<any>(null);
  const [forceRender, setForceRender] = useState(0);
  const isDragging = useRef(false);
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl, invalidate } = useThree();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 간단한 렌더링 업데이트 - 디바운스 적용
  const triggerRender = useCallback(() => {
    invalidate();
    // forceRender 상태 업데이트 제거 (불필요한 리렌더링 방지)
  }, [invalidate]);

  // 가구 충돌 감지 함수
  const detectFurnitureCollisions = useCallback((movingModuleId: string, newSlotIndex: number, targetSlotInfo: any) => {
    const movingModule = placedModules.find(m => m.id === movingModuleId);
    if (!movingModule) return [];

    const moduleData = getModuleById(movingModule.moduleId, internalSpace, spaceInfo);
    if (!moduleData) return [];

    const indexing = calculateSpaceIndexing(spaceInfo);
    const columnWidth = indexing.columnWidth;
    // 이동하는 가구의 isDualSlot 속성을 우선 사용
    const isDualFurniture = movingModule.isDualSlot !== undefined ? movingModule.isDualSlot :
                           Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;

    // 이동하는 가구의 카테고리 확인
    const movingCategory = moduleData.category;
    const isMovingUpper = movingCategory === 'upper';
    const isMovingLower = movingCategory === 'lower';

    // 이동하는 가구가 차지할 슬롯들 계산
    let occupiedSlots: number[] = [];
    if (isDualFurniture) {
      // 듀얼 가구는 2개 슬롯 차지
      occupiedSlots = [newSlotIndex, newSlotIndex + 1];
      console.log('🔄 듀얼 가구 이동 - 2개 슬롯 차지:', occupiedSlots);
    } else {
      // 싱글 가구는 1개 슬롯 차지
      occupiedSlots = [newSlotIndex];
    }

    // 기둥이 있는 슬롯의 경우 기존 가구와 공존 가능하므로 충돌 감지 제외
    if (targetSlotInfo && targetSlotInfo.hasColumn) {
      console.log('🎯 기둥 슬롯 - 충돌 감지 제외');
      return [];
    }

    // 충돌하는 다른 가구들 찾기
    const collidingModules: string[] = [];
    
    // 단내림 구간에서는 동일 zone의 가구만 충돌 검사
    const modulesToCheck = movingModule.zone 
      ? placedModules.filter(m => m.zone === movingModule.zone)
      : placedModules;
    
    modulesToCheck.forEach(module => {
      if (module.id === movingModuleId) return; // 자기 자신 제외

      const moduleInfo = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleInfo) return;

      // 기존 가구의 카테고리 확인
      const existingCategory = moduleInfo.category;
      const isExistingUpper = existingCategory === 'upper';
      const isExistingLower = existingCategory === 'lower';

      // 상부장과 하부장은 같은 슬롯에 공존 가능
      if ((isMovingUpper && isExistingLower) || (isMovingLower && isExistingUpper)) {
        console.log('✅ 상부장-하부장 공존 가능 (useFurnitureDrag):', {
          이동하는가구: { id: movingModuleId, category: movingCategory },
          기존가구: { id: module.id, category: existingCategory }
        });
        return; // 충돌로 간주하지 않음
      }

      // 기존 가구의 isDualSlot 속성을 우선 사용
      const isModuleDual = module.isDualSlot !== undefined ? module.isDualSlot :
                          Math.abs(moduleInfo.dimensions.width - (columnWidth * 2)) < 50;
      
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
        console.log('💥 충돌 감지:', {
          이동하는가구: {
            id: movingModuleId,
            category: movingCategory,
            isDual: isDualFurniture,
            targetSlots: occupiedSlots
          },
          기존가구: {
            id: module.id,
            category: existingCategory,
            isDual: isModuleDual,
            occupiedSlots: moduleSlots
          }
        });
        collidingModules.push(module.id);
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo]);




  // 드래그 시작
  const handlePointerDown = (e: ThreeEvent<PointerEvent>, placedModuleId: string) => {
    // 왼쪽 버튼이 아니면 드래그 시작하지 않음 (오른쪽 버튼은 OrbitControls 회전용)
    if (e.button !== 0) {
      return;
    }

    // 자유배치 가구는 FreePlacementDropZone에서 별도 처리
    const targetModule = placedModules.find(m => m.id === placedModuleId);
    if (targetModule?.isFreePlacement) {
      return;
    }

    // 더블클릭으로 활성화된 가구만 드래그 가능
    const selectedFurnitureId = useUIStore.getState().selectedFurnitureId;
    if (selectedFurnitureId !== placedModuleId) {
      return;
    }

    e.stopPropagation();

    setDraggingModuleId(placedModuleId);
    isDragging.current = true;
    setFurnitureDragging(true); // 드래그 상태 설정

    // 가구 드래그 시작 이벤트 발생
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));

    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);

    // 드래그 시작 시 즉시 렌더링 업데이트
    triggerRender();

    // 포인터 캡처
    const target = e.target as Element & { setPointerCapture?: (pointerId: number) => void };
    if (target && target.setPointerCapture) {
      target.setPointerCapture(e.pointerId);
    }

    document.body.style.cursor = 'grabbing';
  };

  // 드래그 중 처리
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!isDragging.current || !draggingModuleId) {
      return;
    }

    // 공통 레이캐스팅 유틸리티 사용
    const canvas = event.nativeEvent.target as HTMLCanvasElement;

    // 현재 드래그 중인 모듈 확인
    const currentModule = placedModules.find(m => m.id === draggingModuleId);
    if (!currentModule) return;

    // 마우스 위치에서 슬롯 인덱스와 zone을 감지 (모든 zone에서)
    const raycastResult = getSlotIndexAndZoneFromMousePosition(
      event.nativeEvent.clientX,
      event.nativeEvent.clientY,
      canvas,
      camera,
      scene,
      spaceInfo
      // activeZone 없이 호출 - zone 변경 허용
    );

    let slotIndex = raycastResult.slotIndex;
    let detectedZone = raycastResult.zone;

    if (slotIndex !== null && detectedZone !== null) {
      // 감지된 zone으로 변경
      currentModule.zone = detectedZone;
      // currentModule은 이미 위에서 정의됨
      
      // 단내림이 활성화된 경우 영역 체크
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const checkIsDual = currentModule.isDualSlot !== undefined ? currentModule.isDualSlot : false;

        if (currentModule.zone === 'normal') {
          const maxSlotForDual = checkIsDual ? zoneInfo.normal.columnCount - 1 : zoneInfo.normal.columnCount;
          if (slotIndex >= maxSlotForDual) {
            return;
          }
        } else if (currentModule.zone === 'dropped' && zoneInfo.dropped) {
          const maxSlotForDual = checkIsDual ? zoneInfo.dropped.columnCount - 1 : zoneInfo.dropped.columnCount;
          if (slotIndex >= maxSlotForDual) {
            return;
          }
        }
      }

      // 단내림이 활성화되고 zone 정보가 있는 경우 영역별 처리
      let moduleData;
      let indexing;
      let isDualFurniture;
      
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const targetZone = currentModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;

        // 영역별 spaceInfo와 internalSpace 생성
        // 단내림 영역별 외경 너비 계산 (프레임 포함)
        const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;
        let zoneOuterWidth: number;

        if (currentModule.zone === 'dropped') {
          // 단내림 영역의 외경 너비
          zoneOuterWidth = droppedCeilingWidth;
        } else {
          // 메인 영역의 외경 너비
          zoneOuterWidth = spaceInfo.width - droppedCeilingWidth;
        }

        const zoneSpaceInfo = {
          ...spaceInfo,
          width: zoneOuterWidth,  // 영역별 외경 너비 설정
          zone: currentModule.zone  // zone 정보 추가
        };
        const zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);

        moduleData = getModuleById(currentModule.moduleId, zoneInternalSpace, zoneSpaceInfo);
        if (!moduleData) return;

        // 전체 indexing에서 zone별 정보 가져오기 (threeUnitPositions 포함)
        const fullIndexing = calculateSpaceIndexing(spaceInfo);
        const zoneData = currentModule.zone === 'dropped'
          ? fullIndexing.zones?.dropped
          : fullIndexing.zones?.normal;

        if (!zoneData) {
          console.log('❌ Zone 데이터를 찾을 수 없음:', currentModule.zone);
          return;
        }

        // zone별 indexing은 전체 indexing의 zone 정보를 사용
        indexing = {
          columnCount: zoneData.columnCount,
          columnWidth: zoneData.columnWidth,
          threeUnitPositions: zoneData.threeUnitPositions || [],
          threeUnitDualPositions: zoneData.threeUnitDualPositions || [],
          threeUnitBoundaries: [],
          slotWidths: zoneData.slotWidths,
          zones: fullIndexing.zones  // zone 정보도 포함
        };

        // isDualSlot 속성을 우선 사용
        isDualFurniture = currentModule.isDualSlot !== undefined ? currentModule.isDualSlot :
                         Math.abs(moduleData.dimensions.width - (targetZone.columnWidth * 2)) < 50;
      } else {
        // 단내림이 없는 경우 기존 로직
        moduleData = getModuleById(currentModule.moduleId, internalSpace, spaceInfo);
        if (!moduleData) return;
        
        indexing = calculateSpaceIndexing(spaceInfo);
        const columnWidth = indexing.columnWidth;
        // isDualSlot 속성을 우선 사용
        isDualFurniture = currentModule.isDualSlot !== undefined ? currentModule.isDualSlot :
                         Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
      }

      // 슬롯 가용성 검사 (자기 자신 제외)

      // 위치 계산 - zone별 배열 직접 접근
      const fullIndexing = calculateSpaceIndexing(spaceInfo);
      let finalX: number;

      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        if (currentModule.zone === 'dropped' && fullIndexing.zones?.dropped) {
          const droppedPositions = fullIndexing.zones.dropped.threeUnitPositions;

          if (isDualFurniture && slotIndex < droppedPositions.length - 1) {
            if (fullIndexing.zones.dropped.threeUnitDualPositions &&
                fullIndexing.zones.dropped.threeUnitDualPositions[slotIndex] !== undefined) {
              finalX = fullIndexing.zones.dropped.threeUnitDualPositions[slotIndex];
            } else {
              const leftSlotX = droppedPositions[slotIndex];
              const rightSlotX = droppedPositions[slotIndex + 1];
              finalX = (leftSlotX + rightSlotX) / 2;
            }
          } else {
            finalX = droppedPositions[slotIndex];
          }
        } else if (currentModule.zone === 'normal' && fullIndexing.zones?.normal) {
          const normalPositions = fullIndexing.zones.normal.threeUnitPositions;

          if (isDualFurniture && slotIndex < normalPositions.length - 1) {
            if (fullIndexing.zones.normal.threeUnitDualPositions &&
                fullIndexing.zones.normal.threeUnitDualPositions[slotIndex] !== undefined) {
              finalX = fullIndexing.zones.normal.threeUnitDualPositions[slotIndex];
            } else {
              const leftSlotX = normalPositions[slotIndex];
              const rightSlotX = normalPositions[slotIndex + 1];
              finalX = (leftSlotX + rightSlotX) / 2;
            }
          } else {
            finalX = normalPositions[slotIndex];
          }
        } else {
          return;
        }
      } else {
        if (isDualFurniture) {
          if (fullIndexing.threeUnitDualPositions && fullIndexing.threeUnitDualPositions[slotIndex] !== undefined) {
            finalX = fullIndexing.threeUnitDualPositions[slotIndex];
          } else {
            return;
          }
        } else {
          finalX = fullIndexing.threeUnitPositions[slotIndex];
        }
      }
      
      // 기둥 슬롯으로 이동 시 자동 크기 조정
      // 단내림 구간에서는 글로벌 슬롯 인덱스로 변환 필요
      let globalSlotIndex = slotIndex;
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        if (currentModule.zone === 'dropped' && zoneInfo.dropped) {
          // 단내림 구간: 메인 구간 슬롯 수를 더해서 글로벌 인덱스 계산
          globalSlotIndex = zoneInfo.normal.columnCount + slotIndex;
        }
        // 메인 구간은 이미 글로벌 인덱스와 동일
      }

      const columnSlots = analyzeColumnSlots(spaceInfo);
      const targetSlotInfo = columnSlots[globalSlotIndex];

      console.log('🔍 [useFurnitureDrag] targetSlotInfo 확인:', {
        zone: currentModule.zone,
        slotIndex,
        globalSlotIndex,
        targetSlotInfo,
        hasColumn: targetSlotInfo?.hasColumn,
        columnSlotsLength: columnSlots.length
      });

      if (targetSlotInfo && targetSlotInfo.hasColumn) {
        // 기둥이 있는 슬롯으로 이동하는 경우
        if (isDualFurniture) {
          // 듀얼 가구는 기둥 슬롯에 배치 불가 - 이동 취소
          console.log('❌ 듀얼 가구는 기둥 슬롯에 배치 불가');
          return;
        }
        
        // 싱글 가구인 경우 사용 가능한 공간 확인
        const availableWidth = targetSlotInfo.adjustedWidth || targetSlotInfo.availableWidth;
        if (availableWidth < 150) {
          console.log('❌ 기둥 슬롯에 공간 부족:', availableWidth, 'mm');
          return;
        }
      }


      // 충돌 감지 (기둥 슬롯 제외)
      // 단내림 구간에서는 로컬 슬롯 인덱스 사용
      const collisionCheckIndex = currentModule.zone ? slotIndex : globalSlotIndex;
      
      // 듀얼 가구가 차지할 슬롯 범위 로그
      if (isDualFurniture) {
        console.log('🎯 듀얼 가구 이동 시도:', {
          moduleId: currentModule.moduleId,
          fromSlot: currentModule.slotIndex,
          toSlot: collisionCheckIndex,
          occupiedSlots: [collisionCheckIndex, collisionCheckIndex + 1],
          zone: currentModule.zone
        });
      }
      
      const collidingModules = detectFurnitureCollisions(draggingModuleId, collisionCheckIndex, targetSlotInfo);
      if (collidingModules.length > 0) {
        // 충돌하는 가구가 있으면 이동 취소
        console.log('❌ 충돌 감지: 다른 가구가 이미 배치되어 있음', collidingModules);
        return;
      }

      // 새로운 슬롯의 기둥 정보 확인하여 customDepth와 adjustedWidth 계산
      let newCustomDepth: number | undefined = undefined;
      let newAdjustedWidth: number | undefined = undefined;

      // Y 위치 계산 (FurnitureItem.tsx와 동일한 로직)
      let yPosition = currentModule.position.y;

      const isUpperCabinet = moduleData.category === 'upper';
      const isLowerCabinet = moduleData.category === 'lower';
      const isTallCabinet = moduleData.category === 'full';

      if (isUpperCabinet) {
        // 상부장: 항상 천장에 붙음
        const topFrameHeightMm = spaceInfo.frameSize?.top || 30;
        const upperCabinetHeight = moduleData.dimensions.height || 0;
        const upperCabinetTopY = spaceInfo.height - topFrameHeightMm;
        yPosition = (upperCabinetTopY - upperCabinetHeight/2) * 0.01;
      } else if (isLowerCabinet || isTallCabinet) {
        // 하부장/키큰장: 띄워서 배치 적용
        const isFloating = spaceInfo.baseConfig?.placementType === 'float' && spaceInfo.baseConfig?.type === 'stand';
        const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
        const floorFinishHeight = floorFinishHeightMm * 0.01;
        const furnitureHeight = (moduleData.dimensions.height || 0) * 0.01;

        if (isFloating) {
          // 띄워서 배치: 바닥마감재 + 띄움높이 + 가구높이/2
          const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;
          const floatHeight = floatHeightMm * 0.01;
          yPosition = floorFinishHeight + floatHeight + (furnitureHeight / 2);
        } else {
          // 일반 배치: 바닥마감재 + 받침대높이 + 가구높이/2
          const baseHeight = ((spaceInfo.baseConfig?.height || 65) * 0.01);
          yPosition = floorFinishHeight + baseHeight + (furnitureHeight / 2);
        }
      }

      let adjustedPosition = { x: finalX, y: yPosition, z: currentModule.position.z };

      console.log('🎯 드래그 중 위치 계산:', {
        moduleId: currentModule.id,
        currentPositionY: currentModule.position.y,
        adjustedPositionY: adjustedPosition.y,
        floatMode: spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float',
        floatHeight: spaceInfo.baseConfig?.floatHeight
      });
      
      if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
        const columnDepth = targetSlotInfo.column.depth;
        const isShallowColumn = columnDepth < 400;
        
        // 기둥 침범 방향에 따른 위치 조정
        if (targetSlotInfo.intrusionDirection) {
          // calculateFurnitureBounds를 사용하여 정확한 위치와 크기 계산
          const slotWidthM = indexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: finalX - slotWidthM / 2,
            right: finalX + slotWidthM / 2,
            center: finalX
          };
          
          const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
          
          // 위치 조정 (기둥을 피해서 배치)
          if (targetSlotInfo.intrusionDirection === 'from-left') {
            // 기둥이 왼쪽에서 침범: 가구를 오른쪽으로 밀어냄
            adjustedPosition.x = furnitureBounds.center;
            console.log('🔀 왼쪽 침범 - 위치 조정:', {
              originalX: finalX,
              adjustedX: adjustedPosition.x,
              bounds: furnitureBounds
            });
          } else if (targetSlotInfo.intrusionDirection === 'from-right') {
            // 기둥이 오른쪽에서 침범: 가구를 왼쪽으로 밀어냄
            adjustedPosition.x = furnitureBounds.center;
            console.log('🔁 오른쪽 침범 - 위치 조정:', {
              originalX: finalX,
              adjustedX: adjustedPosition.x,
              bounds: furnitureBounds
            });
          } else if (targetSlotInfo.intrusionDirection === 'center') {
            // 중앙 침범
            adjustedPosition.x = furnitureBounds.center;
            console.log('🟡 중앙 침범 - 위치 조정:', {
              originalX: finalX,
              adjustedX: adjustedPosition.x,
              bounds: furnitureBounds
            });
          }
          
          // 크기 조정
          newAdjustedWidth = furnitureBounds.renderWidth;
          
          // Column C (300mm) 특별 처리 - 깊이 조정
          if (furnitureBounds.depthAdjustmentNeeded || (columnDepth === 300 && furnitureBounds.renderWidth === indexing.columnWidth)) {
            newCustomDepth = 730 - columnDepth; // 430mm
            console.log('🟣 Column C 깊이 조정:', newCustomDepth, 'mm');
          }
        }
        
        // 기둥 A (150mm) 처리
        if (columnDepth <= 150 && !newAdjustedWidth) {
          // intrusionDirection이 없는 경우에도 크기 조정
          const slotWidthM = indexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: finalX - slotWidthM / 2,
            right: finalX + slotWidthM / 2,
            center: finalX
          };
          
          const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
          newAdjustedWidth = furnitureBounds.renderWidth;
          adjustedPosition.x = furnitureBounds.center;
          newCustomDepth = undefined;
          console.log('🟢 Column A 처리: 폭 조정만', {
            adjustedWidth: newAdjustedWidth,
            adjustedX: adjustedPosition.x
          });
        }
      }
      
      // 모듈 업데이트 - zone 정보 유지 및 moduleId 업데이트
      let updatedModuleId = currentModule.moduleId;
      
      // 이제 ID는 너비 정보를 포함하지 않으므로 변경하지 않음
      
      // slotIndex는 이미 zone별 로컬 인덱스이므로 직접 사용
      let finalSlotIndex = slotIndex;
      
      // 드래그 중에는 위치만 업데이트 (moveModule 사용)
      moveModule(draggingModuleId, adjustedPosition);
      
      // 임시로 드래그 정보 저장 (드래그 끝날 때 전체 업데이트용)
      setTempPosition({
        x: adjustedPosition.x,
        y: adjustedPosition.y,
        z: adjustedPosition.z
      });
      
      // 나머지 정보는 드래그가 끝날 때 업데이트하기 위해 저장
      const endData = {
        moduleId: updatedModuleId,
        customDepth: newCustomDepth,
        adjustedWidth: newAdjustedWidth,
        slotIndex: finalSlotIndex,
        isDualSlot: isDualFurniture,
        zone: currentModule.zone,
        customWidth: (() => {
          // 기둥이 있는 슬롯인 경우 customWidth를 설정하지 않음 (adjustedWidth만 사용)
          if (targetSlotInfo && targetSlotInfo.hasColumn) {
            console.log('✅ 기둥 슬롯 → customWidth = undefined, adjustedWidth =', newAdjustedWidth);
            return undefined; // 기둥 슬롯에서는 adjustedWidth만 사용
          }
          // zone별로 다른 슬롯 너비 사용
          if (currentModule.zone && spaceInfo.droppedCeiling?.enabled) {
            const fullIndexing = calculateSpaceIndexing(spaceInfo);
            
            if (currentModule.zone === 'dropped' && fullIndexing.zones?.dropped?.slotWidths) {
              const droppedSlotWidths = fullIndexing.zones.dropped.slotWidths;
              if (isDualFurniture && finalSlotIndex < droppedSlotWidths.length - 1) {
                // 듀얼 가구: 두 슬롯의 실제 너비 합계
                return droppedSlotWidths[finalSlotIndex] + droppedSlotWidths[finalSlotIndex + 1];
              } else if (droppedSlotWidths[finalSlotIndex] !== undefined) {
                // 싱글 가구: 해당 슬롯의 실제 너비
                return droppedSlotWidths[finalSlotIndex];
              }
            } else if (currentModule.zone === 'normal' && fullIndexing.zones?.normal?.slotWidths) {
              const normalSlotWidths = fullIndexing.zones.normal.slotWidths;
              if (isDualFurniture && finalSlotIndex < normalSlotWidths.length - 1) {
                // 듀얼 가구: 두 슬롯의 실제 너비 합계
                return normalSlotWidths[finalSlotIndex] + normalSlotWidths[finalSlotIndex + 1];
              } else if (normalSlotWidths[finalSlotIndex] !== undefined) {
                // 싱글 가구: 해당 슬롯의 실제 너비
                return normalSlotWidths[finalSlotIndex];
              }
            }
            
            // fallback: zone의 평균 슬롯 너비
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const targetZone = currentModule.zone === 'dropped' && zoneInfo.dropped 
              ? zoneInfo.dropped 
              : zoneInfo.normal;
            return targetZone.columnWidth;
          }
          
          // zone이 없는 경우 기존 로직 사용
          const globalIndexing = calculateSpaceIndexing(spaceInfo);
          if (globalIndexing.slotWidths) {
            if (isDualFurniture && slotIndex < globalIndexing.slotWidths.length - 1) {
              // 듀얼 가구: 두 슬롯의 실제 너비 합계
              return globalIndexing.slotWidths[slotIndex] + globalIndexing.slotWidths[slotIndex + 1];
            } else if (globalIndexing.slotWidths[slotIndex] !== undefined) {
              // 싱글 가구: 해당 슬롯의 실제 너비
              return globalIndexing.slotWidths[slotIndex];
            }
          }
          
          // fallback: 평균 슬롯 너비
          const fallbackWidth = globalIndexing.columnWidth;
          console.log('⚠️ customWidth fallback:', fallbackWidth);
          return fallbackWidth;
        })()
      };

      console.log('📦 [useFurnitureDrag] endData 생성:', {
        zone: currentModule.zone,
        adjustedWidth: endData.adjustedWidth,
        customWidth: endData.customWidth,
        customDepth: endData.customDepth,
        slotIndex: endData.slotIndex
      });

      // 드래그 끝날 때 사용할 데이터 저장
      setDragEndData(endData);
      
      invalidate();
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
    }
  };

  // 드래그 종료
  const handlePointerUp = () => {
    if (isDragging.current && draggingModuleId) {
      // 드래그가 끝날 때 전체 속성 업데이트
      if (dragEndData && tempPosition) {
        updatePlacedModule(draggingModuleId, {
          ...dragEndData,
          position: tempPosition
        });
      }
      
      isDragging.current = false;
      setDraggingModuleId(null);
      setTempPosition(null);
      setDragEndData(null);
      setFurniturePlacementMode(false);
      
      // 가구 드래그 종료 이벤트 발생
      window.dispatchEvent(new CustomEvent('furniture-drag-end'));
      
      // 드래그 종료 시 즉시 렌더링 업데이트
      triggerRender();
      
      // 드래그 종료 후 짧은 지연 후에 드래그 상태 해제 (자석 효과 방지)
      setTimeout(() => {
        setFurnitureDragging(false); // 드래그 상태 해제
        triggerRender(); // 드래그 상태 해제 후에도 렌더링 업데이트
      }, 100); // 100ms 지연
      
      // 3D 모드에서 그림자 강제 업데이트
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
      
      document.body.style.cursor = 'default';
    }
  };

  return {
    draggingModuleId,
    isDragging: isDragging.current,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    forceRender // React 리렌더링 강제를 위한 state
  };
}; 