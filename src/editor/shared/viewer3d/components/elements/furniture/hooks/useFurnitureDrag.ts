import { useState, useRef, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getSlotIndexFromMousePosition as getSlotIndexFromRaycast, getSlotIndexAndZoneFromMousePosition } from '../../../../utils/slotRaycast';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer } from '@/editor/shared/utils/indexing';

interface UseFurnitureDragProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureDrag = ({ spaceInfo }: UseFurnitureDragProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const moveModule = useFurnitureStore(state => state.moveModule);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { setFurnitureDragging, activeDroppedCeilingTab, viewMode, setViewMode } = useUIStore();
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const isDragging = useRef(false);
  
  // Three.js 컨텍스트 접근
  const { camera, scene, gl, invalidate, controls } = useThree();
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);

  // 간단한 렌더링 업데이트 - 디바운스 적용
  const triggerRender = useCallback(() => {
    invalidate();
    // forceRender 상태 업데이트 제거 (불필요한 리렌더링 방지)
  }, [invalidate]);

  // 가구 충돌 감지 함수
  const detectFurnitureCollisions = useCallback((
    movingModuleId: string,
    newSlotIndex: number,
    targetSlotInfo: any,
    targetZone?: 'normal' | 'dropped',
    treatAsDual?: boolean
  ) => {
    const movingModule = placedModules.find(m => m.id === movingModuleId);
    if (!movingModule) return [];

    const moduleData = getModuleById(movingModule.moduleId, internalSpace, spaceInfo);
    if (!moduleData) return [];

    const indexing = calculateSpaceIndexing(spaceInfo);
    const columnWidth = indexing.columnWidth;
    // 이동하는 가구의 isDual 여부: 호출 측에서 강제 지정되면 우선 사용
    const isDualFurniture = typeof treatAsDual === 'boolean'
      ? treatAsDual
      : (movingModule.isDualSlot !== undefined
          ? movingModule.isDualSlot
          : Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50);

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
    
    // 충돌 검사 대상: 대상 zone이 지정되면 그 zone의 가구만, 아니면 전체
    const modulesToCheck = targetZone
      ? placedModules.filter(m => m.zone === targetZone)
      : (movingModule.zone ? placedModules.filter(m => m.zone === movingModule.zone) : placedModules);
    
    modulesToCheck.forEach(module => {
      if (module.id === movingModuleId) return; // 자기 자신 제외

      const moduleInfo = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleInfo) return;

      // 상부장/하부장 카테고리 확인
      const movingModuleInfo = getModuleById(movingModule.moduleId, internalSpace, spaceInfo);
      const isMovingUpper = movingModuleInfo?.category === 'upper' || movingModule.moduleId.includes('upper-cabinet');
      const isMovingLower = movingModuleInfo?.category === 'lower' || movingModule.moduleId.includes('lower-cabinet');
      const isExistingUpper = moduleInfo.category === 'upper' || module.moduleId.includes('upper-cabinet');
      const isExistingLower = moduleInfo.category === 'lower' || module.moduleId.includes('lower-cabinet');
      
      // 상부장과 하부장은 같은 슬롯에 공존 가능
      if ((isMovingUpper && isExistingLower) || (isMovingLower && isExistingUpper)) {
        console.log('✅ 상부장/하부장 공존 가능:', {
          moving: { id: movingModuleId, category: isMovingUpper ? 'upper' : 'lower' },
          existing: { id: module.id, category: isExistingUpper ? 'upper' : 'lower' }
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
            isDual: isDualFurniture,
            targetSlots: occupiedSlots,
            category: isMovingUpper ? 'upper' : (isMovingLower ? 'lower' : 'normal')
          },
          기존가구: {
            id: module.id,
            isDual: isModuleDual,
            occupiedSlots: moduleSlots,
            category: isExistingUpper ? 'upper' : (isExistingLower ? 'lower' : 'normal')
          }
        });
        collidingModules.push(module.id);
      }
    });

    return collidingModules;
  }, [placedModules, internalSpace, spaceInfo]);




  // 드래그 시작
  const handlePointerDown = (e: ThreeEvent<PointerEvent>, placedModuleId: string) => {
    console.log('🖱️ 드래그 시작:', placedModuleId, 'button:', e.button);
    
    // 왼쪽 버튼이 아니면 드래그 시작하지 않음 (오른쪽 버튼은 OrbitControls 회전용)
    if (e.button !== 0) {
      if (import.meta.env.DEV) {
        console.log('❌ 왼쪽 버튼이 아님, 드래그 취소');
      }
      return;
    }
    
    e.stopPropagation();
    
    // 3D 모드에서 정면 뷰로 초기화 (거리는 유지)
    if (viewMode === '3D' && controls) {
      // 현재 카메라 거리 유지
      const currentDistance = camera.position.distanceTo(controls.target);
      
      // 공간의 정확한 중앙 계산
      const centerX = 0; // 중앙은 0
      const centerY = spaceInfo.height / 200; // 높이의 중앙
      
      // 카메라를 정면 중앙에서 보도록 설정 (거리는 현재 거리 유지)
      camera.position.set(0, centerY, currentDistance);
      controls.target.set(0, centerY, 0);
      controls.update();
      
      console.log('📐 정면 뷰로 초기화 - 중앙 정렬, 거리 유지:', currentDistance);
    }
    
    setDraggingModuleId(placedModuleId);
    isDragging.current = true;
    setFurnitureDragging(true); // 드래그 상태 설정
    
    // 가구 드래그 시작 이벤트 발생
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));
    
    if (import.meta.env.DEV) {
      console.log('✅ 드래그 상태 설정 완료:', { draggingModuleId: placedModuleId, isDragging: isDragging.current });
    }
    
    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);
    
    // 드래그 시작 시 즉시 렌더링 업데이트
    triggerRender();
    
    // 포인터 캡처
    const target = e.target as Element & { setPointerCapture?: (pointerId: number) => void };
    if (target && target.setPointerCapture) {
      target.setPointerCapture(e.pointerId);
      if (import.meta.env.DEV) {
        console.log('📌 포인터 캡처 설정');
      }
    }
    
    document.body.style.cursor = 'grabbing';
  };

  // 드래그 중 처리
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!isDragging.current || !draggingModuleId) {
      return;
    }
    
    console.log('🖱️ 드래그 중:', draggingModuleId);

    // 공통 레이캐스팅 유틸리티 사용
    const canvas = event.nativeEvent.target as HTMLCanvasElement;
    
    // 현재 드래그 중인 모듈의 zone 정보 확인
    const currentModule = placedModules.find(m => m.id === draggingModuleId);
    if (!currentModule) return;
    
    // 영역 제한 없이 슬롯과 소속 영역을 함께 탐지하여
    // 노멀 ↔ 단내림 구간을 가로지르는 이동을 허용
    const { slotIndex, zone: detectedZone } = getSlotIndexAndZoneFromMousePosition(
      event.nativeEvent.clientX,
      event.nativeEvent.clientY,
      canvas,
      camera,
      scene,
      spaceInfo
    );
    
    if (slotIndex !== null) {
      // currentModule은 이미 위에서 정의됨
      
      // 단내림이 활성화된 경우 영역 체크
      if (spaceInfo.droppedCeiling?.enabled && detectedZone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        // 듀얼 가구인지 먼저 확인
        const checkIsDual = currentModule.isDualSlot !== undefined ? currentModule.isDualSlot : false;
        
        if (detectedZone === 'normal') {
          const maxSlotForDual = checkIsDual ? zoneInfo.normal.columnCount - 1 : zoneInfo.normal.columnCount;
          if (slotIndex >= maxSlotForDual) {
            console.log('❌ 메인구간 가구: 유효하지 않은 슬롯 인덱스', {
              isDual: checkIsDual,
              slotIndex,
              maxSlotForDual,
              columnCount: zoneInfo.normal.columnCount
            });
            return;
          }
        } else if (detectedZone === 'dropped' && zoneInfo.dropped) {
          const maxSlotForDual = checkIsDual ? zoneInfo.dropped.columnCount - 1 : zoneInfo.dropped.columnCount;
          if (slotIndex >= maxSlotForDual) {
            console.log('❌ 단내림구간 가구: 유효하지 않은 슬롯 인덱스', {
              isDual: checkIsDual,
              slotIndex,
              maxSlotForDual,
              columnCount: zoneInfo.dropped.columnCount
            });
            return;
          }
        }
        
        console.log('✅ 영역별 가구 이동 검증 통과:', {
          zone: detectedZone,
          slotIndex,
          maxSlots: detectedZone === 'dropped' ? zoneInfo.dropped?.columnCount : zoneInfo.normal.columnCount
        });
      }

      // 단내림이 활성화되고 감지된 zone 정보가 있는 경우 영역별 처리
      let moduleData;
      let indexing;
      let isDualFurniture;
      let effectiveZone: 'normal' | 'dropped' | undefined = detectedZone || undefined;
      
      if (spaceInfo.droppedCeiling?.enabled && detectedZone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const targetZone = detectedZone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
        
        // 영역별 spaceInfo와 internalSpace 생성
        // 단내림 영역별 외경 너비 계산 (프레임 포함)
        const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
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
        
        // zone별 indexing은 targetZone 정보를 직접 사용
        indexing = {
          columnCount: targetZone.columnCount,
          columnWidth: targetZone.columnWidth,
          threeUnitPositions: [],
          threeUnitDualPositions: {},
          threeUnitBoundaries: []
        };
        // isDualSlot 속성을 우선 사용
        isDualFurniture = currentModule.isDualSlot !== undefined ? currentModule.isDualSlot :
                         Math.abs(moduleData.dimensions.width - (targetZone.columnWidth * 2)) < 50;

        // 단내림(현재) → 메인(목표) 이동 시 정책 적용: 듀얼은 두 칸 이동, 불가 시 싱글로 전환
        let forceTreatAsDual: boolean | undefined = undefined;
        if (currentModule.zone === 'dropped' && detectedZone === 'normal' && isDualFurniture) {
          const normalCount = zoneInfo.normal.columnCount;
          // 두 칸 이동 가능한지 (마지막-1 미만)
          if (slotIndex < normalCount - 1) {
            forceTreatAsDual = true; // 우선 듀얼 유지 (두 칸)
          } else {
            forceTreatAsDual = false; // 마지막 슬롯이면 싱글로 전환
          }
          // 강제 정책을 즉시 반영하여 이후 위치/충돌 계산에 사용
          if (typeof forceTreatAsDual === 'boolean') {
            isDualFurniture = forceTreatAsDual;
          }
        }
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

      // 최종 위치 계산 - 영역별 처리
      let finalX: number;
      
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const targetZone = currentModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
        
        // 전체 indexing 정보를 가져와서 zone별 실제 위치 사용
        const fullIndexing = calculateSpaceIndexing(spaceInfo);
        
        // slotIndex는 이미 영역별 로컬 인덱스이므로 직접 사용
        const zoneSlotIndex = slotIndex;
        
        if (detectedZone === 'dropped' && fullIndexing.zones?.dropped) {
          // 단내림 영역: 계산된 위치 사용
          const droppedPositions = fullIndexing.zones.dropped.threeUnitPositions;
          
          if (isDualFurniture && zoneSlotIndex < droppedPositions.length - 1) {
            // 듀얼 가구: threeUnitDualPositions 사용
            if (fullIndexing.zones.dropped.threeUnitDualPositions && 
                fullIndexing.zones.dropped.threeUnitDualPositions[zoneSlotIndex] !== undefined) {
              finalX = fullIndexing.zones.dropped.threeUnitDualPositions[zoneSlotIndex];
            } else {
              // fallback: 두 슬롯의 중간점 계산
              const leftSlotX = droppedPositions[zoneSlotIndex];
              const rightSlotX = droppedPositions[zoneSlotIndex + 1];
              finalX = (leftSlotX + rightSlotX) / 2;
            }
          } else {
            // 싱글 가구: 해당 슬롯 위치
            finalX = droppedPositions[zoneSlotIndex];
          }
          
          console.log('🎯 단내림 영역 위치 계산:', {
            zoneSlotIndex,
            isDual: isDualFurniture,
            droppedPositions,
            finalX
          });
        } else if (detectedZone === 'normal' && fullIndexing.zones?.normal) {
          // 메인 영역: 계산된 위치 사용
          const normalPositions = fullIndexing.zones.normal.threeUnitPositions;
          
          if (isDualFurniture && zoneSlotIndex < normalPositions.length - 1) {
            // 듀얼 가구: threeUnitDualPositions 사용
            if (fullIndexing.zones.normal.threeUnitDualPositions && 
                fullIndexing.zones.normal.threeUnitDualPositions[zoneSlotIndex] !== undefined) {
              finalX = fullIndexing.zones.normal.threeUnitDualPositions[zoneSlotIndex];
            } else {
              // fallback: 두 슬롯의 중간점 계산
              const leftSlotX = normalPositions[zoneSlotIndex];
              const rightSlotX = normalPositions[zoneSlotIndex + 1];
              finalX = (leftSlotX + rightSlotX) / 2;
            }
          } else {
            // 싱글 가구: 해당 슬롯 위치
            finalX = normalPositions[zoneSlotIndex];
          }
          
          console.log('🎯 메인 영역 위치 계산:', {
            zoneSlotIndex,
            isDual: isDualFurniture,
            normalPositions,
            finalX
          });
        } else {
          // fallback
          const leftSlotX = targetZone.startX + (zoneSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2);
          if (isDualFurniture && zoneSlotIndex < targetZone.columnCount - 1) {
            const rightSlotX = targetZone.startX + ((zoneSlotIndex + 1) * targetZone.columnWidth) + (targetZone.columnWidth / 2);
            finalX = ((leftSlotX + rightSlotX) / 2) * 0.01;
          } else {
            finalX = leftSlotX * 0.01;
          }
        }
      } else {
        // 단내림이 없는 경우 기존 로직
        if (isDualFurniture) {
          if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
            finalX = indexing.threeUnitDualPositions[slotIndex];
          } else {
            return; // 듀얼 위치가 없으면 이동하지 않음
          }
        } else {
          finalX = indexing.threeUnitPositions[slotIndex];
        }
      }
      
      // 기둥 슬롯으로 이동 시 자동 크기 조정
      // 단내림 구간에서는 글로벌 슬롯 인덱스로 변환 필요
      let globalSlotIndex = slotIndex;
      if (spaceInfo.droppedCeiling?.enabled && detectedZone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        if (detectedZone === 'dropped' && zoneInfo.dropped) {
          // 단내림 구간: 메인 구간 슬롯 수를 더해서 글로벌 인덱스 계산
          globalSlotIndex = zoneInfo.normal.columnCount + slotIndex;
        }
        // 메인 구간은 이미 글로벌 인덱스와 동일
      }
      
      const columnSlots = analyzeColumnSlots(spaceInfo, placedModules);
      let targetSlotInfo = columnSlots[globalSlotIndex];
      
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
      const collisionCheckIndex = effectiveZone ? slotIndex : globalSlotIndex;
      
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
      
      let treatAsDualForCollision = isDualFurniture;
      let collidingModules = detectFurnitureCollisions(
        draggingModuleId,
        collisionCheckIndex,
        targetSlotInfo,
        effectiveZone,
        treatAsDualForCollision
      );
      if (collidingModules.length > 0) {
        // 충돌 발생. 단내림→메인 이동에서 듀얼 강제였던 경우, 싱글 전환으로 재시도
        if (spaceInfo.droppedCeiling?.enabled && currentModule.zone === 'dropped' && detectedZone === 'normal' && isDualFurniture) {
          console.log('🔁 듀얼 충돌 발생, 싱글로 전환하여 재시도');
          treatAsDualForCollision = false;
          // 위치 재계산: 메인 영역에서 싱글 기준
          const fullIndexing = calculateSpaceIndexing(spaceInfo);
          if (fullIndexing.zones?.normal) {
            const normalPositions = fullIndexing.zones.normal.threeUnitPositions;
            if (slotIndex < normalPositions.length) {
              finalX = normalPositions[slotIndex];
            }
          }
          // 글로벌 인덱스는 동일 (메인)
          // 기둥 정보/충돌 재계산
          const columnSlotsRetry = analyzeColumnSlots(spaceInfo, placedModules);
          const targetSlotInfoRetry = columnSlotsRetry[slotIndex];
          collidingModules = detectFurnitureCollisions(
            draggingModuleId,
            slotIndex,
            targetSlotInfoRetry,
            'normal',
            false
          );
          if (collidingModules.length > 0) {
            console.log('❌ 싱글 전환 후에도 충돌. 이동 취소', collidingModules);
            return;
          }
          // 싱글 전환 적용
          isDualFurniture = false;
          effectiveZone = 'normal';
          // targetSlotInfo 갱신
          targetSlotInfo = targetSlotInfoRetry as any;
        } else {
          // 충돌하는 가구가 있으면 이동 취소
          console.log('❌ 충돌 감지: 다른 가구가 이미 배치되어 있음', collidingModules);
          return;
        }
      }

      // 새로운 슬롯의 기둥 정보 확인하여 customDepth와 adjustedWidth 계산
      let newCustomDepth: number | undefined = undefined;
      let newAdjustedWidth: number | undefined = undefined;
      
      // Y 위치 계산 - 상부장은 상부 프레임에 붙여서 배치
      let calculatedY = currentModule.position.y;
      
      // mm를 Three.js 단위로 변환
      const mmToThreeUnits = (mm: number) => mm * 0.01;
      
      // 내경 공간 시작점 계산
      const floorHeight = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 0) : 0;
      const baseHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 
                        spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig.placementType === 'float' ? 
                        (spaceInfo.baseConfig.floatHeight || 0) : 0;
      const furnitureStartY = mmToThreeUnits(floorHeight + baseHeight);
      
      // 상부장인지 확인 (카테고리 또는 ID로 확인)
      const isUpperCabinet = moduleData.category === 'upper' || 
                            currentModule.moduleId.includes('upper-cabinet') ||
                            moduleData.id?.includes('upper-cabinet');
      
      const isLowerCabinet = moduleData.category === 'lower' || 
                            currentModule.moduleId.includes('lower-cabinet') ||
                            moduleData.id?.includes('lower-cabinet');
      
      if (isUpperCabinet) {
        // 상부장은 내경 공간 상단에 배치
        const furnitureHeightMm = moduleData.dimensions.height;
        
        // 상부장은 항상 천장에 붙어있어야 함
        // 내경 높이를 사용하여 계산
        const internalHeightMm = internalSpace.height;
        
        // 받침대 높이 확인 - 받침대가 있을 때만 적용
        // baseConfig.type === 'floor': 받침대 있음 (65mm)
        // baseConfig.type === 'stand': 받침대 없음 (0mm)
        const baseFrameHeightMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0;
        
        // 상부장 Y 위치: 내경높이 + 받침대높이 - 가구높이/2
        calculatedY = mmToThreeUnits(internalHeightMm + baseFrameHeightMm - furnitureHeightMm / 2);
        
        console.log('🔝 드래그 중 상부장 Y 위치 계산:', {
          moduleId: moduleData.id,
          currentModuleId: currentModule.moduleId,
          category: moduleData.category,
          isUpperCabinet,
          internalHeightMm,
          baseFrameHeightMm,
          furnitureHeightMm,
          calculatedY,
          previousY: currentModule.position.y,
          설명: '상부장은 내경높이 + 받침대높이 기준'
        });
      } else {
        // 하부장 및 일반 가구는 바닥에 배치
        const furnitureHeightMm = moduleData.dimensions.height;
        calculatedY = furnitureStartY + mmToThreeUnits(furnitureHeightMm / 2);
        
        if (isLowerCabinet) {
          console.log('📦 드래그 중 하부장 Y 위치 계산:', {
            moduleId: moduleData.id,
            currentModuleId: currentModule.moduleId,
            category: moduleData.category,
            isLowerCabinet,
            furnitureStartY,
            furnitureHeightMm,
            calculatedY,
            previousY: currentModule.position.y
          });
        }
      }
      
      const adjustedPosition = { x: finalX, y: calculatedY, z: currentModule.position.z };
      
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
      
      // 단내림→메인 이동에서 싱글로 전환된 경우 ID를 single-* 로 변경
      if (spaceInfo.droppedCeiling?.enabled && currentModule.zone === 'dropped' && (detectedZone === 'normal' || effectiveZone === 'normal') && !isDualFurniture) {
        const fullIndexing = calculateSpaceIndexing(spaceInfo);
        const normalWidth = fullIndexing.zones?.normal?.slotWidths?.[slotIndex] || fullIndexing.zones?.normal?.columnWidth || fullIndexing.columnWidth;
        updatedModuleId = currentModule.moduleId
          .replace(/^dual-/, 'single-')
          .replace(/-(\d+)$/, `-${normalWidth}`);
      }
      
      // slotIndex는 이미 zone별 로컬 인덱스이므로 직접 사용
      const finalSlotIndex = slotIndex;
      
      updatePlacedModule(draggingModuleId, {
        moduleId: updatedModuleId,
        position: adjustedPosition,
        customDepth: newCustomDepth,
        adjustedWidth: newAdjustedWidth, // 기둥이 없는 슬롯으로 이동 시 undefined로 설정되어야 함
        slotIndex: finalSlotIndex,
        isDualSlot: isDualFurniture, // 듀얼 유지 여부 반영 (전환 시 false)
        zone: detectedZone || currentModule.zone, // 감지된 zone으로 업데이트하여 cross-zone 이동 허용
        customWidth: (() => {
          // 기둥이 있는 슬롯인 경우 customWidth를 설정하지 않음 (adjustedWidth만 사용)
          if (targetSlotInfo && targetSlotInfo.hasColumn) {
            return undefined; // 기둥 슬롯에서는 adjustedWidth만 사용
          }
          // zone별로 다른 슬롯 너비 사용
          if (detectedZone && spaceInfo.droppedCeiling?.enabled) {
            const fullIndexing = calculateSpaceIndexing(spaceInfo);
            
            if (detectedZone === 'dropped' && fullIndexing.zones?.dropped?.slotWidths) {
              const droppedSlotWidths = fullIndexing.zones.dropped.slotWidths;
              if (isDualFurniture && finalSlotIndex < droppedSlotWidths.length - 1) {
                // 듀얼 가구: 두 슬롯의 실제 너비 합계
                return droppedSlotWidths[finalSlotIndex] + droppedSlotWidths[finalSlotIndex + 1];
              } else if (droppedSlotWidths[finalSlotIndex] !== undefined) {
                // 싱글 가구: 해당 슬롯의 실제 너비
                return droppedSlotWidths[finalSlotIndex];
              }
            } else if (detectedZone === 'normal' && fullIndexing.zones?.normal?.slotWidths) {
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
            const targetZone = (detectedZone === 'dropped' && zoneInfo.dropped) 
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
          return globalIndexing.columnWidth;
        })()
      });
      invalidate();
      if (gl && gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
    }
  };

  // 드래그 종료
  const handlePointerUp = () => {
    if (isDragging.current) {
      if (import.meta.env.DEV) {
        console.log('🏁 드래그 종료');
      }
      
      isDragging.current = false;
      setDraggingModuleId(null);
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