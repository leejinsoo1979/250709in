import React, { useEffect, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData, generateDynamicModules } from '@/data/modules';
import BoxModule from '../modules/BoxModule';
import {
  getSlotIndexFromMousePosition as getSlotIndexFromRaycast,
  isDualFurniture,
  calculateSlotDimensions,
  calculateSlotStartY,
  calculateFurniturePosition
} from '../../utils/slotRaycast';
import { isSlotAvailable, debugSlotOccupancy } from '@/editor/shared/utils/slotAvailability';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { useAlert } from '@/contexts/AlertContext';
import { analyzeColumnSlots, canPlaceFurnitureInColumnSlot, calculateFurnitureBounds, calculateOptimalHingePosition } from '@/editor/shared/utils/columnSlotProcessor';
import { useUIStore } from '@/store/uiStore';
import { PlacedModule } from '@/editor/shared/furniture/types';

interface SlotDropZonesSimpleProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
  showDimensions?: boolean;
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZonesSimple: React.FC<SlotDropZonesSimpleProps> = ({ spaceInfo, showAll = true, showDimensions = true, viewMode: viewModeProp, view2DDirection: view2DDirectionProp }) => {
  const SLOT_DEBUG = true; // 디버깅 활성화
  const debugLog = (...args: any[]) => {
    if (SLOT_DEBUG) {
// console.log(...args);
    }
  };
  const debugWarn = (...args: any[]) => {
    if (SLOT_DEBUG) {
      console.warn(...args);
    }
  };
  // 모든 훅을 먼저 호출
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const selectedFurnitureId = useFurnitureStore(state => state.selectedFurnitureId);
  const setSelectedFurnitureId = useFurnitureStore(state => state.setSelectedFurnitureId);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { showAlert } = useAlert();

  // Three.js 컨텍스트 접근
  const { camera, scene } = useThree();
  const { viewMode: contextViewMode } = useSpace3DView();
  const { view2DDirection: view2DDirectionStore } = useUIStore();

  // 슬롯 바닥 클릭 시 선택 해제 및 팝업 닫기 핸들러
  const handleSlotFloorClick = useCallback((e: any) => {
    // 드래그 중이면 무시
    if (useFurnitureStore.getState().currentDragData) return;
    e.stopPropagation();
    (window as any).__r3fClickHandled = true; // 허공 클릭 deselect 중복 방지
    useFurnitureStore.getState().setSelectedFurnitureId(null);
    useUIStore.getState().setSelectedFurnitureId(null);
    useUIStore.getState().closeAllPopups();
  }, []);

  // prop으로 받은 값을 우선 사용, 없으면 store/context 값 사용
  const viewMode = viewModeProp || contextViewMode;
  const view2DDirection = view2DDirectionProp || view2DDirectionStore;

  debugLog('🎯 SlotDropZonesSimple - viewMode:', {
    viewModeProp,
    contextViewMode,
    finalViewMode: viewMode
  });

  // 고스트 프리뷰 상태 로깅
  debugLog('👻 Ghost Preview State:', {
    selectedFurnitureId,
    currentDragData: !!currentDragData,
    placedModulesCount: placedModules.length
  });

  // 테마 컨텍스트에서 색상 가져오기
  const { theme } = useTheme();

  // 마우스가 hover 중인 슬롯 인덱스와 영역 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [hoveredZone, setHoveredZone] = useState<'normal' | 'dropped' | null>(null);

  // 자유배치 모드 플래그 (early return 하지 않고 렌더링 단계에서 null 반환)
  const isFreePlacement = spaceInfo?.layoutMode === 'free-placement';
  const isInvalidSpaceInfo = !spaceInfo;

  debugLog('🔍 SlotDropZonesSimple - spaceInfo:', {
    width: spaceInfo.width,
    height: spaceInfo.height,
    depth: spaceInfo.depth,
    surroundType: spaceInfo.surroundType,
    gapConfig: spaceInfo.gapConfig,
    customColumnCount: spaceInfo.customColumnCount,
    columnMode: spaceInfo.columnMode
  });

  // 기본값 확인
  if (!spaceInfo.width || !spaceInfo.height || !spaceInfo.depth) {
    console.error('❌ Invalid spaceInfo dimensions:', {
      width: spaceInfo.width,
      height: spaceInfo.height,
      depth: spaceInfo.depth
    });
    return <group />;
  }

  // 내경 공간 및 인덱싱 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);

  debugLog('🔍 SlotDropZonesSimple - calculated values:', {
    internalSpace,
    indexing: {
      columnCount: indexing?.columnCount,
      columnWidth: indexing?.columnWidth,
      threeUnitPositionsLength: indexing?.threeUnitPositions?.length,
      slotWidths: indexing?.slotWidths
    }
  });

  // indexing이 제대로 계산되지 않은 경우 빈 컴포넌트 반환
  if (!indexing || !indexing.threeUnitPositions || !Array.isArray(indexing.threeUnitPositions)) {
    console.error('❌ Invalid indexing data:', {
      indexing,
      hasIndexing: !!indexing,
      hasThreeUnitPositions: !!indexing?.threeUnitPositions,
      isArray: Array.isArray(indexing?.threeUnitPositions),
      spaceInfo
    });
    return <group />;
  }

  // 슬롯 크기 및 위치 계산
  const slotDimensions = calculateSlotDimensions(spaceInfo);
  const slotStartY = calculateSlotStartY(spaceInfo);

  // 베이스프레임 정보 디버깅
  if (spaceInfo.baseConfig) {
    debugLog('🔧 베이스프레임 및 슬롯 위치 정보:', {
      baseType: spaceInfo.baseConfig.type,
      baseHeight: spaceInfo.baseConfig.height,
      placementType: spaceInfo.baseConfig.placementType,
      floatHeight: spaceInfo.baseConfig.floatHeight,
      slotStartY: slotStartY,
      slotHeight: slotDimensions.height,
      슬롯중심Y: slotStartY + slotDimensions.height / 2,
      floorFinishHeight: spaceInfo.hasFloorFinish ? spaceInfo.floorFinish?.height : 0
    });
  }

  // mm를 Three.js 단위로 변환하는 함수
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const threeUnitsToMm = (units: number) => units * 100;

  // 드롭 처리 함수
  const handleSlotDrop = useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
// console.log('🎯🎯🎯 [handleSlotDrop] 호출됨!');

    // 드롭 위치에서 마우스 좌표 계산
    const rect = canvasElement.getBoundingClientRect();
    const mouseX = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((dragEvent.clientY - rect.top) / rect.height) * 2 + 1;

    // 단내림이 활성화되어 있는 경우, 마우스 X 좌표로 영역 자동 판단
    let zoneToUse: 'normal' | 'dropped' | undefined;
    if (spaceInfo.droppedCeiling?.enabled && zoneSlotInfo?.dropped) {
      // 간이 레이캐스트로 X 위치 추정
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      // 레이 방향에서 Z=0 평면과의 교점 계산
      const ray = raycaster.ray;
      const t = -ray.origin.z / ray.direction.z;
      const intersectX = ray.origin.x + ray.direction.x * t;
      const intersectXMm = threeUnitsToMm(intersectX);

      // 영역 판단
      const normalEndX = zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width;
      const droppedStartX = zoneSlotInfo.dropped.startX;
      const droppedEndX = droppedStartX + zoneSlotInfo.dropped.width;

      if (intersectXMm >= droppedStartX && intersectXMm < droppedEndX) {
        zoneToUse = 'dropped';
      } else if (intersectXMm >= zoneSlotInfo.normal.startX && intersectXMm < normalEndX) {
        zoneToUse = 'normal';
      }

      debugLog('🎯 Drop - 마우스 X 좌표로 영역 자동 판단:', {
        mouseX: dragEvent.clientX,
        normalizedMouseX: mouseX,
        intersectX,
        intersectXMm,
        normalRange: `${zoneSlotInfo.normal.startX} ~ ${normalEndX}`,
        droppedRange: `${droppedStartX} ~ ${droppedEndX}`,
        detectedZone: zoneToUse
      });
    }

    // 클릭-앤-플레이스 모드와 드래그 모드 모두 지원
    const activeModuleData = currentDragData;

    if (!activeModuleData) {
      return false;
    }

    // HTML5 드래그 데이터 가져오기
    let dragData;
    try {
      const dragDataString = dragEvent.dataTransfer?.getData('application/json');

      if (!dragDataString) {
        // Fallback to activeModuleData (currentDragData)
        dragData = activeModuleData;
      } else {
        dragData = JSON.parse(dragDataString);
      }
    } catch (error) {
      console.error('Error parsing drag data:', error);
      // Fallback to activeModuleData
      dragData = activeModuleData;
    }

    if (!dragData || dragData.type !== 'furniture') {
      return false;
    }

    // needsWarning 확인
    if (dragData.moduleData?.needsWarning) {
      showAlert('배치슬롯의 사이즈를 늘려주세요', { title: '배치 불가' });
      return false;
    }


    // 단내림이 활성화된 경우 영역별 처리
    if (spaceInfo.droppedCeiling?.enabled && zoneToUse) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

      debugLog('🎯 배치 시작 - zone 정보:', {
        zoneToUse,
        droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
        droppedCeilingPosition: spaceInfo.droppedCeiling?.position,
        zoneInfo: {
          normal: zoneInfo.normal ? {
            columnCount: zoneInfo.normal.columnCount,
            startX: zoneInfo.normal.startX,
            width: zoneInfo.normal.width
          } : null,
          dropped: zoneInfo.dropped ? {
            columnCount: zoneInfo.dropped.columnCount,
            startX: zoneInfo.dropped.startX,
            width: zoneInfo.dropped.width
          } : null
        }
      });

      // 활성 영역에 맞는 인덱싱 생성
      let zoneIndexing;
      let zoneInternalSpace;

      if (zoneToUse === 'dropped' && zoneInfo.dropped) {
        // 단내림 영역용 spaceInfo 생성 - 외경 너비 사용
        const droppedOuterWidth = spaceInfo.droppedCeiling?.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
        const droppedSpaceInfo = {
          ...spaceInfo,
          width: droppedOuterWidth,  // 외경 너비 사용
          customColumnCount: zoneInfo.dropped.columnCount,
          columnMode: 'custom' as const,
          zone: 'dropped' as const  // zone 정보 추가
        };
        // calculateInternalSpace를 사용하여 정확한 내경 계산
        // calculateInternalSpace가 이미 zone을 감지하여 dropHeight를 뺀으므로 중복 빼기 방지
        zoneInternalSpace = calculateInternalSpace(droppedSpaceInfo);

        debugLog('🔧 [SlotDropZonesSimple] 단내림 영역 내경 계산:', {
          height: zoneInternalSpace.height,
          startY: zoneInternalSpace.startY,
          zone: 'dropped',
          droppedCeilingEnabled: droppedSpaceInfo.droppedCeiling?.enabled,
          droppedSpaceInfo: {
            zone: droppedSpaceInfo.zone,
            droppedCeiling: droppedSpaceInfo.droppedCeiling,
            height: droppedSpaceInfo.height
          },
          설명: 'calculateInternalSpace가 이미 dropHeight 처리함'
        });

        // zoneInfo에서 직접 columnWidth 사용
        zoneIndexing = {
          columnCount: zoneInfo.dropped.columnCount,
          columnWidth: zoneInfo.dropped.columnWidth,
          threeUnitPositions: [],
          threeUnitDualPositions: [],
          threeUnitBoundaries: [],
          slotWidths: zoneInfo.dropped.slotWidths || Array(zoneInfo.dropped.columnCount).fill(zoneInfo.dropped.columnWidth)
        };
      } else {
        // 메인 영역용 spaceInfo 생성 - 외경 너비 사용
        const normalOuterWidth = spaceInfo.width - (spaceInfo.droppedCeiling?.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900));
        const normalSpaceInfo = {
          ...spaceInfo,
          width: normalOuterWidth,  // 외경 너비 사용
          customColumnCount: zoneInfo.normal.columnCount,
          columnMode: 'custom' as const,
          zone: 'normal' as const  // zone 정보 추가
        };
        // calculateInternalSpace를 사용하여 정확한 내경 계산
        zoneInternalSpace = calculateInternalSpace(normalSpaceInfo);

        debugLog('🔧 [SlotDropZonesSimple] 일반 영역 내경 계산:', {
          height: zoneInternalSpace.height,
          startY: zoneInternalSpace.startY,
          zone: 'normal',
          normalSpaceInfo: {
            zone: normalSpaceInfo.zone,
            height: normalSpaceInfo.height
          }
        });

        // zoneInfo에서 직접 columnWidth 사용
        zoneIndexing = {
          columnCount: zoneInfo.normal.columnCount,
          columnWidth: zoneInfo.normal.columnWidth,
          threeUnitPositions: [],
          threeUnitDualPositions: [],
          threeUnitBoundaries: [],
          slotWidths: zoneInfo.normal.slotWidths || Array(zoneInfo.normal.columnCount).fill(zoneInfo.normal.columnWidth)
        };
      }

      // 영역별 인덱싱으로 슬롯 인덱스 계산
      let slotIndex = getSlotIndexFromRaycast(
        dragEvent.clientX,
        dragEvent.clientY,
        canvasElement,
        camera,
        scene,
        spaceInfo,  // 원본 spaceInfo 사용
        zoneToUse   // 활성 탭에 따른 영역 필터링
      );

      let colliderGlobalSlotIndex: number | undefined;

      // 콜라이더에서 zone 정보 가져오기
      let colliderZone: 'normal' | 'dropped' | undefined;
      if (slotIndex !== null && spaceInfo.droppedCeiling?.enabled) {
        const allColliders = [];
        scene.traverse((child) => {
          if (child.userData?.isSlotCollider && child.userData?.slotIndex === slotIndex) {
            allColliders.push(child);
          }
        });

        // 해당 slotIndex를 가진 콜라이더 찾기
        const matchingColliders = allColliders.filter(c => c.userData.slotIndex === slotIndex);
        debugLog('🔍 Colliders with matching slotIndex:', {
          slotIndex,
          matchingColliders: matchingColliders.map(c => ({
            zone: c.userData.zone,
            position: c.position.x
          }))
        });

        // 마우스 위치와 가장 가까운 콜라이더의 zone 사용
        if (matchingColliders.length > 0) {
          // 마우스 X 위치 계산
          const rect = canvasElement.getBoundingClientRect();
          const mouseX = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(mouseX, 0), camera);

          // Y=0 평면과의 교차점
          const planeY = mmToThreeUnits(internalSpace.startY);
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
          const intersectPoint = new THREE.Vector3();

          if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            // 가장 가까운 콜라이더 찾기
            let closestCollider = matchingColliders[0];
            let minDistance = Math.abs(intersectPoint.x - closestCollider.position.x);

            for (const collider of matchingColliders) {
              const distance = Math.abs(intersectPoint.x - collider.position.x);
              if (distance < minDistance) {
                minDistance = distance;
                closestCollider = collider;
              }
            }

            colliderZone = closestCollider.userData.zone;
            if (typeof closestCollider.userData.globalSlotIndex === 'number') {
              colliderGlobalSlotIndex = closestCollider.userData.globalSlotIndex;
            }
            debugLog('🎯 Detected collider zone:', {
              colliderZone,
              mouseX: intersectPoint.x,
              colliderX: closestCollider.position.x,
              distance: minDistance,
              globalSlotIndex: closestCollider.userData.globalSlotIndex
            });
          }
        }
      }

      debugLog('🎰 Slot index from raycast (dropped zone):', {
        slotIndex,
        zoneToUse,
        colliderZone,
        zoneMismatch: colliderZone && zoneToUse !== colliderZone,
        droppedInfo: spaceInfo.droppedCeiling,
        zoneInfo: {
          normal: {
            columnCount: zoneInfo.normal?.columnCount,
            startX: zoneInfo.normal?.startX,
            width: zoneInfo.normal?.width
          },
          dropped: {
            columnCount: zoneInfo.dropped?.columnCount,
            startX: zoneInfo.dropped?.startX,
            width: zoneInfo.dropped?.width
          }
        },
        validationCheck: {
          isDroppedZone: zoneToUse === 'dropped',
          droppedExists: !!zoneInfo.dropped,
          slotIndexVsColumnCount: `${slotIndex} >= ${zoneInfo.dropped?.columnCount}`,
          willFail: zoneToUse === 'dropped' && (!zoneInfo.dropped || slotIndex >= zoneInfo.dropped.columnCount)
        }
      });

      // zone 불일치 검사 - 콜라이더의 zone을 우선 신뢰
      if (colliderZone && zoneToUse !== colliderZone) {
        debugWarn('⚠️ Zone mismatch detected!', {
          마우스위치기반Zone: zoneToUse,
          콜라이더Zone: colliderZone,
          slotIndex,
          설명: '콜라이더의 zone을 신뢰하여 사용합니다'
        });
        // 콜라이더의 zone을 신뢰 (콜라이더가 정확한 zone 정보를 가지고 있음)
        zoneToUse = colliderZone;
        debugLog('🔧 Zone corrected to match collider:', zoneToUse);
      } else if (!colliderZone && spaceInfo.droppedCeiling?.enabled) {
        // 콜라이더 zone이 없는 경우 경고
        debugWarn('⚠️ No collider zone found, using mouse-based detection:', zoneToUse);
      }

      if (slotIndex === null) {
        debugLog('❌ No slot index found (dropped zone)');

        // Fallback: 마우스 위치로 슬롯 인덱스 추정
        if (spaceInfo.droppedCeiling?.enabled && zoneToUse && zoneInfo[zoneToUse]) {
          const targetZone = zoneInfo[zoneToUse];
          const rect = canvasElement.getBoundingClientRect();
          const mouseX = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;

          // 카메라와 레이캐스트를 사용하여 월드 좌표 계산
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(mouseX, 0), camera);

          // Y=0 평면과의 교차점 계산
          const planeY = mmToThreeUnits(internalSpace.startY);
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
          const intersectPoint = new THREE.Vector3();

          if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            // 영역 시작점과 끝점
            const zoneStartX = mmToThreeUnits(targetZone.startX);
            const zoneEndX = mmToThreeUnits(targetZone.startX + targetZone.width);

            // 마우스 X 위치가 해당 영역 내에 있는지 확인
            if (intersectPoint.x >= zoneStartX && intersectPoint.x <= zoneEndX) {
              // 영역 내에서의 상대 위치 계산
              const relativeX = intersectPoint.x - zoneStartX;
              const columnWidth = mmToThreeUnits(targetZone.columnWidth);

              // 슬롯 인덱스 추정
              slotIndex = Math.floor(relativeX / columnWidth);
              slotIndex = Math.max(0, Math.min(slotIndex, targetZone.columnCount - 1));

              debugLog('🔧 Fallback slot index calculation:', {
                zoneToUse,
                mouseWorldX: intersectPoint.x,
                zoneStartX,
                zoneEndX,
                relativeX,
                columnWidth,
                calculatedSlotIndex: slotIndex
              });
            } else {
              console.error('❌ Mouse position outside target zone');
              return false;
            }
          } else {
            console.error('❌ Failed to calculate world position');
            return false;
          }
        } else {
          return false;
        }
      }

      const convertToZoneIndex = (
        globalSlot: number,
        targetZone: 'normal' | 'dropped' | undefined = zoneToUse
      ) => {
        if (!spaceInfo.droppedCeiling?.enabled || targetZone === undefined) {
          return globalSlot;
        }

        const droppedCount = zoneInfo.dropped?.columnCount ?? 0;
        const normalCount = zoneInfo.normal?.columnCount ?? 0;

        if (targetZone === 'dropped') {
          return spaceInfo.droppedCeiling.position === 'right'
            ? globalSlot - normalCount
            : globalSlot;
        }

        if (targetZone === 'normal') {
          return spaceInfo.droppedCeiling.position === 'left'
            ? globalSlot - droppedCount
            : globalSlot;
        }

        return globalSlot;
      };

      const mapToGlobalSlotIndex = (
        localSlot: number,
        targetZone: 'normal' | 'dropped' | undefined = zoneToUse
      ) => {
        if (!spaceInfo.droppedCeiling?.enabled) {
          return localSlot;
        }

        const droppedCount = zoneInfo.dropped?.columnCount ?? 0;
        const normalCount = zoneInfo.normal?.columnCount ?? 0;

        if (targetZone === 'dropped') {
          return spaceInfo.droppedCeiling.position === 'right'
            ? localSlot + normalCount
            : localSlot;
        }

        if (targetZone === 'normal') {
          return spaceInfo.droppedCeiling.position === 'left'
            ? localSlot + droppedCount
            : localSlot;
        }

        return localSlot;
      };

      // 레이캐스트로 받은 슬롯 인덱스는 콜라이더의 로컬 인덱스
      // colliderZone이 있으면 이미 올바른 zone의 로컬 인덱스
      let zoneSlotIndex = slotIndex;

      let resolvedZone: 'normal' | 'dropped' | undefined = zoneToUse;
      if (!resolvedZone && colliderZone) {
        resolvedZone = colliderZone;
        zoneToUse = colliderZone;
      }
      if (!resolvedZone) {
        resolvedZone = 'normal';
      }

      let globalSlotIndexCandidate: number | null = null;
      if (typeof colliderGlobalSlotIndex === 'number') {
        globalSlotIndexCandidate = colliderGlobalSlotIndex;
      } else if (slotIndex !== null) {
        globalSlotIndexCandidate = mapToGlobalSlotIndex(slotIndex, resolvedZone);
      }

      if (globalSlotIndexCandidate !== null) {
        zoneSlotIndex = convertToZoneIndex(globalSlotIndexCandidate, resolvedZone);
        debugLog('🔁 Zone/global index reconciliation:', {
          resolvedZone,
          colliderZone,
          slotIndex,
          colliderGlobalSlotIndex,
          globalSlotIndexCandidate,
          convertedZoneSlotIndex: zoneSlotIndex
        });
      }

      // 좌표 기반 추정(Fallback)일 경우 재보정
      if (spaceInfo.droppedCeiling?.enabled && zoneSlotIndex !== null && zoneSlotIndex < 0) {
        zoneSlotIndex = 0;
      }

      if (zoneSlotIndex == null) {
        zoneSlotIndex = 0;
      }

      debugLog('🎯 Zone slot index calculation:', {
        originalSlotIndex: slotIndex,
        zoneSlotIndex,
        zoneToUse,
        colliderZone,
        hasColliderZone: !!colliderZone,
        droppedPosition: spaceInfo.droppedCeiling?.position
      });

      // 영역 검증 - 활성 영역에 맞는 슬롯인지 확인
      if (zoneToUse === 'dropped' && !zoneInfo.dropped) {
        console.error('❌ Dropped zone info is null');
        return false;
      } else if (zoneToUse === 'normal' && !zoneInfo.normal) {
        console.error('❌ Normal zone info is null');
        return false;
      }

      // 디버깅을 위해 조건을 일시적으로 수정
      const targetZoneInfo = zoneToUse === 'dropped' ? zoneInfo.dropped : zoneInfo.normal;
      if (targetZoneInfo && zoneSlotIndex >= targetZoneInfo.columnCount) {
        console.error('❌ Invalid slot index for zone:', {
          zone: zoneToUse,
          slotIndex,
          zoneSlotIndex,
          columnCount: targetZoneInfo.columnCount,
          validRange: `0-${targetZoneInfo.columnCount - 1}`,
          allZoneInfo: {
            normal: { columnCount: zoneInfo.normal?.columnCount, startX: zoneInfo.normal?.startX },
            dropped: { columnCount: zoneInfo.dropped?.columnCount, startX: zoneInfo.dropped?.startX }
          }
        });

        // 콜라이더를 다시 찾아서 확인
        const allColliders = [];
        scene.traverse((child) => {
          if (child.userData?.isSlotCollider) {
            allColliders.push(child);
          }
        });

        debugLog('🔍 Re-checking colliders for debugging:', {
          totalColliders: allColliders.length,
          droppedZoneColliders: allColliders.filter(c => c.userData.zone === 'dropped').map(c => ({
            slotIndex: c.userData.slotIndex,
            position: c.position.x
          })),
          normalZoneColliders: allColliders.filter(c => c.userData.zone === 'normal').map(c => ({
            slotIndex: c.userData.slotIndex,
            position: c.position.x
          }))
        });

        // 임시로 slotIndex를 보정
        const correctedIndex = Math.min(slotIndex, targetZoneInfo.columnCount - 1);
        debugLog('🔧 Temporarily correcting slot index:', slotIndex, '->', correctedIndex);
        slotIndex = correctedIndex;
      }

      // 슬롯 인덱스가 0 이상인지 확인
      if (zoneSlotIndex < 0) {
        console.error('❌ Invalid negative slot index:', { slotIndex, zoneSlotIndex });
        zoneSlotIndex = 0;
      }

      // 영역별 spaceInfo 생성 (가구 크기 계산용)
      // 단내림 영역별 외경 너비 계산 (프레임 포함)
      const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
      const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
      let zoneOuterWidth: number;

      if (zoneToUse === 'dropped') {
        // 단내림 영역의 외경 너비
        zoneOuterWidth = droppedCeilingWidth;
      } else {
        // 메인 영역의 외경 너비
        zoneOuterWidth = spaceInfo.width - droppedCeilingWidth;
      }

      // targetZone 객체 가져오기
      const targetZone = zoneToUse === 'dropped' ? zoneInfo.dropped : zoneInfo.normal;

      if (!targetZone) {
        console.error('❌ Target zone is null:', { zoneToUse, zoneInfo });
        return false;
      }

      // generateDynamicModules에 전달할 spaceInfo - 전체 spaceInfo에 zone 정보만 추가
      const zoneSpaceInfo = {
        ...spaceInfo,
        zone: zoneToUse,  // zone 정보 추가
        width: zoneOuterWidth  // 영역별 너비 설정
      };

      debugLog('🔧 [SlotDropZonesSimple] zoneSpaceInfo 생성:', {
        zone: zoneToUse,
        droppedCeilingEnabled: zoneSpaceInfo.droppedCeiling?.enabled,
        zoneSpaceInfo: {
          width: zoneSpaceInfo.width,
          zone: zoneSpaceInfo.zone,
          droppedCeiling: zoneSpaceInfo.droppedCeiling
        }
      });

      // 영역별 내경 공간 재계산
      // calculateInternalSpace가 이미 zone을 감지하여 dropHeight를 뺀으므로 중복 빼기 방지
      const recalculatedZoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);

      debugLog('🔧 [SlotDropZonesSimple] 영역별 내경 공간 재계산:', {
        zone: zoneToUse,
        originalInternalSpace: zoneInternalSpace,
        recalculatedInternalSpace: recalculatedZoneInternalSpace
      });

      // 영역별 모듈 목록 생성
      const zoneModules = generateDynamicModules(recalculatedZoneInternalSpace, zoneSpaceInfo);

      debugLog('🎯 단내림 구간 모듈 생성 결과:', {
        zoneToUse,
        moduleCount: zoneModules.length,
        zoneInternalSpace,
        zoneSpaceInfo: {
          width: zoneSpaceInfo.width,
          zone: zoneSpaceInfo.zone,
          customColumnCount: zoneSpaceInfo.customColumnCount
        },
        firstModule: zoneModules[0]
      });

      // 드래그하는 모듈과 동일한 타입의 모듈 찾기
      // 원본 ID에서 타입 부분만 추출 (소수점 포함한 너비 정보 제거)
      const moduleBaseType = dragData.moduleData.id.replace(/-[\d.]+$/, '');

      // 듀얼 가구 여부 판단 - ID prefix, isDualSlot 플래그, 또는 너비 기반
      const isDual = dragData.moduleData.id.startsWith('dual-')
        || dragData.isDualSlot === true
        || (dragData.moduleData.dimensions.width > indexing.columnWidth * 1.5);

      // 영역에 맞는 너비의 동일 타입 모듈 찾기 - 실제 슬롯 너비 사용
      let targetWidth: number;
      if (isDual && zoneIndexing.slotWidths && zoneSlotIndex < zoneIndexing.slotWidths.length - 1) {
        targetWidth = zoneIndexing.slotWidths[zoneSlotIndex] + zoneIndexing.slotWidths[zoneSlotIndex + 1];
      } else if (zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
        targetWidth = zoneIndexing.slotWidths[zoneSlotIndex];
      } else {
        // fallback
        const zoneColumnWidth = zoneIndexing.columnWidth;
        targetWidth = isDual ? zoneColumnWidth * 2 : zoneColumnWidth;
      }

      // 정확한 너비를 포함한 ID 생성
      const targetModuleId = `${moduleBaseType}-${targetWidth}`;

      debugLog('🔍 가구 검색:', {
        원본ID: dragData.moduleData.id,
        기본타입: moduleBaseType,
        목표너비: targetWidth,
        찾는ID: targetModuleId,
        isDual,
        생성된모듈수: zoneModules.length,
        생성된모듈들: zoneModules.map(m => ({
          id: m.id,
          width: m.dimensions.width
        }))
      });

      // getModuleById를 사용하여 정확한 너비의 가구 생성
      const moduleData = getModuleById(targetModuleId, recalculatedZoneInternalSpace, zoneSpaceInfo);

      if (!moduleData) {
        console.error('❌ 가구를 찾을 수 없음:', {
          targetModuleId,
          targetWidth,
          zoneToUse
        });
        return false;
      }


      // 듀얼 가구 여부는 이미 위에서 판단했으므로 재사용

      // 듀얼 가구가 영역 경계를 넘어가는지 체크
// console.log('🔍🔍🔍 [경계 체크]', {
        // isDual,
        // zoneSlotIndex,
        // targetZoneColumnCount: targetZone.columnCount,
        // '다음슬롯인덱스': zoneSlotIndex + 1,
        // '경계넘음': zoneSlotIndex + 1 >= targetZone.columnCount,
        // zone: zoneToUse
      // });

      if (isDual && zoneSlotIndex + 1 >= targetZone.columnCount) {
        console.error('❌❌❌ 듀얼 가구 배치 불가: zone 경계를 침범합니다');
        debugLog('🚫 듀얼 가구가 영역 경계를 넘어감:', {
          zone: zoneToUse,
          zoneSlotIndex,
          targetZoneColumnCount: targetZone.columnCount,
          필요한슬롯: [zoneSlotIndex, zoneSlotIndex + 1],
          영역범위: `0 ~ ${targetZone.columnCount - 1}`
        });
        showAlert?.('듀얼 가구는 구역 경계를 넘을 수 없습니다', 'error');
        return false;
      }

      // 슬롯 가용성 검사 (영역 내 인덱스 사용)
      // 단내림이 없을 때는 모든 가구를 확인해야 함
      const targetZoneForFiltering: 'normal' | 'dropped' | undefined = spaceInfo.droppedCeiling?.enabled
        ? (zoneToUse || 'normal')
        : undefined;

      const zoneExistingModules = spaceInfo.droppedCeiling?.enabled
        ? placedModules.filter(m => (m.zone || 'normal') === targetZoneForFiltering)
        : placedModules;

      // 슬롯 점유 상태 디버깅
      debugLog('[SlotDebug] slot-occupancy', {
        zone: zoneToUse,
        existingModules: zoneExistingModules.map(m => {
          const moduleZone = (m.zone || 'normal') as 'normal' | 'dropped';
          const localIndex = convertToZoneIndex(m.slotIndex, moduleZone);
          return {
            id: m.id,
            slotIndex: m.slotIndex,
            localSlotIndex: localIndex,
            globalSlotIndex: mapToGlobalSlotIndex(localIndex, moduleZone),
            isDualSlot: m.isDualSlot,
            occupiedSlots: m.isDualSlot
              ? [localIndex, localIndex + 1]
              : [localIndex]
          };
        })
      });

      const globalSlotIndexForCheck = globalSlotIndexCandidate !== null
        ? globalSlotIndexCandidate
        : mapToGlobalSlotIndex(zoneSlotIndex, zoneToUse);

      debugLog('[SlotDebug] drop-check', {
        zone: zoneToUse,
        zoneSlotIndex,
        globalSlotIndexForCheck,
        isDual,
        colliderGlobalSlotIndex
      });

      if (!isSlotAvailable(globalSlotIndexForCheck, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
        debugLog('❌ 영역 슬롯 충돌로 배치 불가', {
          slotIndex,
          globalSlotIndex: globalSlotIndexForCheck,
          zone: zoneToUse
        });
        return false;
      }

      const hasSlotConflict = zoneExistingModules.some(m => {
        const moduleZone = (m.zone || 'normal') as 'normal' | 'dropped';
        const existingZoneIndex = convertToZoneIndex(m.slotIndex, moduleZone);
        if (isDual) {
          // 듀얼 가구는 2개 슬롯 차지
          let conflict = false;
          if (m.isDualSlot) {
            // 기존 가구도 듀얼인 경우: 4개 슬롯 중 하나라도 겹치면 충돌
            // 새 듀얼: [zoneSlotIndex, zoneSlotIndex + 1]
            // 기존 듀얼: [m.slotIndex, m.slotIndex + 1]
            conflict = (existingZoneIndex === zoneSlotIndex) || // 같은 위치에서 시작
              (existingZoneIndex === zoneSlotIndex + 1) || // 기존이 새 가구의 두 번째 슬롯에서 시작
              (existingZoneIndex === zoneSlotIndex - 1) || // 기존의 두 번째 슬롯이 새 가구의 첫 번째 슬롯과 겹침
              (existingZoneIndex + 1 === zoneSlotIndex); // 기존의 두 번째 슬롯이 새 가구의 첫 번째 슬롯
          } else {
            // 기존 가구가 싱글인 경우: 새 듀얼의 2개 슬롯 중 하나와 겹치면 충돌
            conflict = existingZoneIndex === zoneSlotIndex || existingZoneIndex === zoneSlotIndex + 1;
          }

          if (conflict) {
            debugLog('🚫 듀얼 가구 슬롯 충돌:', {
              배치하려는가구: {
                slotIndex: zoneSlotIndex,
                isDual: true,
                occupiedSlots: [zoneSlotIndex, zoneSlotIndex + 1]
              },
              기존가구: {
                id: m.id,
                slotIndex: m.slotIndex,
                localSlotIndex: existingZoneIndex,
                isDualSlot: m.isDualSlot,
                occupiedSlots: m.isDualSlot ? [existingZoneIndex, existingZoneIndex + 1] : [existingZoneIndex]
              }
            });
          }
          return conflict;
        } else {
          // 싱글 가구는 1개 슬롯 차지하지만, 듀얼 가구가 차지한 슬롯도 확인해야 함
          const conflict = existingZoneIndex === zoneSlotIndex ||
            (m.isDualSlot && (existingZoneIndex === zoneSlotIndex || existingZoneIndex + 1 === zoneSlotIndex));
          if (conflict) {
            debugLog('🚫 싱글 가구 슬롯 충돌:', {
              배치하려는가구: {
                slotIndex: zoneSlotIndex,
                isDual: false,
                occupiedSlots: [zoneSlotIndex]
              },
              기존가구: {
                id: m.id,
                slotIndex: m.slotIndex,
                localSlotIndex: existingZoneIndex,
                isDualSlot: m.isDualSlot,
                occupiedSlots: m.isDualSlot ? [existingZoneIndex, existingZoneIndex + 1] : [existingZoneIndex]
              }
            });
          }
          return conflict;
        }
      });

      if (hasSlotConflict) {
        debugLog('❌ 슬롯 충돌로 배치 불가');
        return false;
      }

      // 최종 위치 계산 - calculateSpaceIndexing에서 계산된 실제 위치 사용
      let finalX: number;

      // 전체 indexing 정보를 가져와서 zone별 실제 위치 사용
      const fullIndexing = calculateSpaceIndexing(spaceInfo);

      if (zoneToUse === 'dropped' && fullIndexing.zones?.dropped) {
        // 단내림 영역: 계산된 위치 사용
        const droppedPositions = fullIndexing.zones.dropped.threeUnitPositions;

        if (isDual && zoneSlotIndex < droppedPositions.length - 1) {
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

        debugLog('🎯 단내림 영역 위치 계산:', {
          zoneSlotIndex,
          isDual,
          droppedPositions,
          dualPositions: fullIndexing.zones.dropped.threeUnitDualPositions,
          selectedDualPosition: isDual ? fullIndexing.zones.dropped.threeUnitDualPositions?.[zoneSlotIndex] : null,
          finalX,
          gapConfig: spaceInfo.gapConfig,
          zoneInfo: {
            columnCount: fullIndexing.zones.dropped.columnCount,
            startX: fullIndexing.zones.dropped.internalStartX
          }
        });
      } else if (fullIndexing.zones?.normal) {
        // 메인 영역: 계산된 위치 사용
        const normalPositions = fullIndexing.zones.normal.threeUnitPositions;

        if (isDual && zoneSlotIndex < normalPositions.length - 1) {
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

        debugLog('🎯 메인 영역 위치 계산:', {
          zoneSlotIndex,
          isDual,
          normalPositions,
          dualPositions: fullIndexing.zones.normal.threeUnitDualPositions,
          selectedDualPosition: isDual ? fullIndexing.zones.normal.threeUnitDualPositions?.[zoneSlotIndex] : null,
          finalX,
          gapConfig: spaceInfo.gapConfig,
          zoneInfo: {
            columnCount: fullIndexing.zones.normal.columnCount,
            startX: fullIndexing.zones.normal.internalStartX
          }
        });
      } else {
        // fallback: zones가 없는 경우 전체 indexing 사용
        const positions = indexing.threeUnitPositions;

        if (isDual && zoneSlotIndex < positions.length - 1) {
          if (indexing.threeUnitDualPositions &&
            indexing.threeUnitDualPositions[zoneSlotIndex] !== undefined) {
            finalX = indexing.threeUnitDualPositions[zoneSlotIndex];
          } else {
            const leftSlotX = positions[zoneSlotIndex];
            const rightSlotX = positions[zoneSlotIndex + 1];
            finalX = (leftSlotX + rightSlotX) / 2;
          }
        } else {
          finalX = positions[zoneSlotIndex];
        }
      }


      // 고유 ID 생성 - 단내림 구간은 별도 ID 체계
      const placedId = zoneToUse === 'dropped'
        ? `dropped-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        : `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 기본 깊이 설정
      const defaultDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);

      // 실제 슬롯 너비 가져오기 (slotWidths 사용) - targetZoneInfo는 이미 위에서 선언됨
      const targetZoneWidths = zoneToUse === 'dropped'
        ? zoneIndexing.slotWidths || zoneInfo.dropped?.slotWidths
        : zoneIndexing.slotWidths || zoneInfo.normal?.slotWidths;

      const fallbackColumnWidth = zoneToUse === 'dropped'
        ? (zoneInfo.dropped?.columnWidth ?? zoneIndexing.columnWidth)
        : (zoneInfo.normal?.columnWidth ?? zoneIndexing.columnWidth);

      const actualSlotWidth = targetZoneWidths && zoneSlotIndex < targetZoneWidths.length
        ? targetZoneWidths[zoneSlotIndex]
        : fallbackColumnWidth;

      // 기둥 분석 - 전체 슬롯 인덱스를 계산해야 함
      const columnSlots = analyzeColumnSlots(spaceInfo);

      // zone 슬롯 인덱스를 전체 슬롯 인덱스로 변환
      let globalSlotIndex = globalSlotIndexForCheck;
      debugLog('[SlotDebug] width-input', {
        zone: zoneToUse,
        zoneSlotIndex,
        globalSlotIndex,
        slotWidths: targetZoneWidths,
        actualSlotWidth,
        fallbackColumnWidth,
        columnSlotsLength: columnSlots.length
      });

      const slotInfo = columnSlots[globalSlotIndex]; // 전체 공간 기준 슬롯 인덱스 사용

      debugLog('🏛️ 기둥 분석 인덱스:', {
        zoneToUse,
        zoneSlotIndex,
        slotIndex,
        globalSlotIndex,
        columnSlotsLength: columnSlots.length,
        slotInfo: slotInfo ? {
          hasColumn: slotInfo.hasColumn,
          availableWidth: slotInfo.availableWidth,
          adjustedWidth: slotInfo.adjustedWidth
        } : null
      });

      // 듀얼 가구의 경우 두 슬롯의 실제 너비 합계
      let customWidth;
      let adjustedWidth;
      let furnitureX = finalX;
      let effectiveColumnType: string | undefined;

      // 듀얼 가구의 경우 두 슬롯 모두 확인
      let hasColumnInAnySlot = false;
      let columnType: string | undefined;
      let totalAvailableWidth = 0;

      if (isDual) {
        // 듀얼 가구가 차지하는 두 슬롯 확인
        const slot1Info = columnSlots[globalSlotIndex];
        const slot2Info = columnSlots[globalSlotIndex + 1];

        debugLog('🏛️ 듀얼 가구 슬롯 기둥 확인:', {
          slot1: {
            index: globalSlotIndex,
            hasColumn: slot1Info?.hasColumn || false,
            columnType: slot1Info?.columnType,
            availableWidth: slot1Info?.availableWidth || targetZoneInfo.columnWidth
          },
          slot2: {
            index: globalSlotIndex + 1,
            hasColumn: slot2Info?.hasColumn || false,
            columnType: slot2Info?.columnType,
            availableWidth: slot2Info?.availableWidth || targetZoneInfo.columnWidth
          }
        });

        // 두 슬롯 중 하나라도 기둥이 있으면 처리
        if (slot1Info?.hasColumn || slot2Info?.hasColumn) {
          hasColumnInAnySlot = true;

          // 두 슬롯의 사용 가능한 너비 합계 계산
          const slot1Width = slot1Info?.hasColumn ? slot1Info.availableWidth : targetZoneInfo.columnWidth;
          const slot2Width = slot2Info?.hasColumn ? slot2Info.availableWidth : targetZoneInfo.columnWidth;
          totalAvailableWidth = slot1Width + slot2Width;

          // 기둥 타입 결정 (둘 중 하나라도 medium이 아니면 즉시 조정)
          if (slot1Info?.hasColumn && slot1Info.columnType !== 'medium') {
            columnType = slot1Info.columnType;
          } else if (slot2Info?.hasColumn && slot2Info.columnType !== 'medium') {
            columnType = slot2Info.columnType;
          } else {
            columnType = 'medium'; // 둘 다 medium이거나 기둥이 없는 경우
          }

          debugLog('🏛️ 듀얼 가구 기둥 처리:', {
            totalAvailableWidth,
            originalWidth: moduleData.dimensions.width,
            columnType,
            willAdjust: columnType !== 'medium'
          });
        }
      }

      // 기둥이 있는 슬롯인지 확인 (싱글 가구 또는 듀얼 가구 처리)
      if ((slotInfo && slotInfo.hasColumn) || hasColumnInAnySlot) {
        if (!isDual) {
          // 싱글 가구 처리 (기존 로직)
          debugLog('🏛️ 싱글 가구 - 기둥 침범 슬롯 감지:', {
            slotIndex,
            hasColumn: true,
            availableWidth: slotInfo.availableWidth,
            adjustedWidth: slotInfo.adjustedWidth,
            intrusionDirection: slotInfo.intrusionDirection,
            furniturePosition: slotInfo.furniturePosition,
            columnType: slotInfo.columnType
          });

          // 기둥 침범 시 배치 가능 여부 확인
          const canPlace = canPlaceFurnitureInColumnSlot(slotInfo, moduleData.dimensions.width, isDual);

          if (!canPlace) {
            debugLog('🚫 기둥 침범으로 인해 배치 불가:', {
              이유: '공간 부족'
            });
            showAlert?.({
              type: 'error',
              message: '기둥 침범으로 인해 공간이 부족합니다.',
              duration: 3000
            });
            return false;
          }
        } else {
          // 듀얼 가구 처리
          // 최소 필요 너비 확인 (300mm 이상이어야 배치 가능)
          if (totalAvailableWidth < 300) {
            debugLog('🚫 듀얼 가구 배치 불가:', {
              이유: '기둥 침범으로 인한 공간 부족',
              totalAvailableWidth,
              최소필요너비: 300
            });
            showAlert?.({
              type: 'error',
              message: '기둥 침범으로 인해 듀얼 가구를 배치할 공간이 부족합니다.',
              duration: 3000
            });
            return false;
          }
        }

        // 기둥 타입에 따라 다르게 처리
        effectiveColumnType = isDual ? columnType : slotInfo.columnType;

        if (effectiveColumnType === 'medium') {
          // 기둥 C(300mm)가 이미 있는 슬롯에는 가구를 원본 크기로 배치
          // 나중에 FurnitureItem에서 실시간으로 폭이 조정됨
          customWidth = actualSlotWidth; // 슬롯 너비 사용
          adjustedWidth = moduleData.dimensions.width; // 가구는 원본 크기 유지

          debugLog('🔧 기둥 C 선배치 슬롯 - 원본 크기 유지:', {
            원래폭: actualSlotWidth,
            가구폭: moduleData.dimensions.width,
            customWidth: customWidth,
            위치: finalX,
            message: '폭 조정은 FurnitureItem에서 실시간으로 처리됨'
          });
        } else {
          // 기둥 A(깊은 기둥) 등 다른 기둥은 즉시 폭 조정
          if (isDual) {
            // 듀얼 가구의 경우 totalAvailableWidth 사용
            customWidth = totalAvailableWidth;
            adjustedWidth = totalAvailableWidth;

            debugLog('🔧 듀얼 가구 - 기둥 A 침범으로 폭 즉시 조정:', {
              원래폭: moduleData.dimensions.width,
              조정된폭: customWidth,
              columnType: effectiveColumnType
            });
          } else {
            // 싱글 가구 처리 (기존 로직)
            const slotWidthM = targetZoneInfo.columnWidth * 0.01; // mm to meters
            const originalSlotBounds = {
              left: finalX - slotWidthM / 2,
              right: finalX + slotWidthM / 2,
              center: finalX
            };

            const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);

            // 기둥 침범에 따른 가구 너비와 위치 조정
            customWidth = furnitureBounds.renderWidth;
            adjustedWidth = furnitureBounds.renderWidth;
            furnitureX = furnitureBounds.center; // 가구 위치를 남은 공간 중심으로 이동

            debugLog('🔧 싱글 가구 - 기둥 A 침범으로 폭 즉시 조정:', {
              원래폭: actualSlotWidth,
              조정된폭: customWidth,
              위치조정: { 원래X: finalX, 조정된X: furnitureX },
              columnType: slotInfo.columnType
            });
          }
        }
      } else {
        // 기둥이 없는 경우 슬롯 내경 그대로 사용
        if (isDual && zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
          // 듀얼: columnWidth * 2의 0.5mm 단위 내림
          customWidth = Math.floor(zoneIndexing.columnWidth * 2 * 2) / 2;
        } else if (zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
          customWidth = zoneIndexing.slotWidths[zoneSlotIndex];

          // 🎯 끝 슬롯 체크: 엔드패널이 있는 경우 엔드패널(18mm) 공간 확보
          // 노서라운드: 벽없음/한쪽벽만 적용
          // 서라운드: 벽이 없는 쪽만 적용 (양쪽벽은 엔드패널 없음)
          const hasEndPanel = (
            // 노서라운드 모드
            (spaceInfo.surroundType === 'no-surround' &&
              (spaceInfo.installType === 'freestanding' ||
                spaceInfo.installType === 'semistanding' ||
                spaceInfo.installType === 'semi-standing')) ||
            // 서라운드 모드에서 한쪽벽/벽없음
            (spaceInfo.surroundType === 'surround' &&
              (spaceInfo.installType === 'freestanding' ||
                spaceInfo.installType === 'semistanding' ||
                spaceInfo.installType === 'semi-standing'))
          );

          if (hasEndPanel) {
            const END_PANEL_THICKNESS = 18; // 슬롯 계산 기준
            const isFirstSlot = zoneSlotIndex === 0;

            // zone별 마지막 슬롯 판단 - zone이 있으면 해당 zone의 columnCount 사용
            let isLastSlot: boolean;
            if (spaceInfo.droppedCeiling?.enabled && zoneIndexing.zones && zoneToUse) {
              const targetZone = zoneToUse === 'dropped' ? zoneIndexing.zones.dropped : zoneIndexing.zones.normal;
              isLastSlot = zoneSlotIndex === (targetZone?.columnCount ?? zoneIndexing.columnCount) - 1;
            } else {
              isLastSlot = zoneSlotIndex === zoneIndexing.columnCount - 1;
            }

            // 단내림이 있는 경우 각 영역별로 처리
            if (spaceInfo.droppedCeiling?.enabled && zoneIndexing.zones) {
              const droppedPosition = spaceInfo.droppedCeiling.position;

              if (zoneToUse === 'normal') {
                // 일반구간: 경계면 슬롯은 슬롯 너비 그대로 사용 (이격거리는 이미 반영됨)
                // 양쪽 끝 슬롯만 엔드패널 처리
                if (droppedPosition === 'left' && isLastSlot) {
                  // 좌측 단내림 → 일반구간 우측 끝 슬롯 (엔드패널)
                  if (spaceInfo.installType === 'freestanding' || !spaceInfo.wallConfig?.right) {
                    customWidth = customWidth - END_PANEL_THICKNESS;
                    debugLog('🎯 일반구간 우측 끝 슬롯 가구 너비 조정 (엔드패널):', {
                      slotIndex: zoneSlotIndex,
                      surroundType: spaceInfo.surroundType,
                      originalWidth: zoneIndexing.slotWidths[zoneSlotIndex],
                      adjustedWidth: customWidth,
                      endPanelSpace: END_PANEL_THICKNESS
                    });
                  }
                } else if (droppedPosition === 'right' && isFirstSlot) {
                  // 우측 단내림 → 일반구간 좌측 끝 슬롯 (엔드패널)
                  if (spaceInfo.installType === 'freestanding' || !spaceInfo.wallConfig?.left) {
                    customWidth = customWidth - END_PANEL_THICKNESS;
                    debugLog('🎯 일반구간 좌측 끝 슬롯 가구 너비 조정 (엔드패널):', {
                      slotIndex: zoneSlotIndex,
                      surroundType: spaceInfo.surroundType,
                      originalWidth: zoneIndexing.slotWidths[zoneSlotIndex],
                      adjustedWidth: customWidth,
                      endPanelSpace: END_PANEL_THICKNESS
                    });
                  }
                }
                // 경계면 슬롯 (isFirstSlot when left, isLastSlot when right)은 슬롯 너비 그대로 사용
              } else if (zoneToUse === 'dropped') {
                // 단내림구간: 경계면 슬롯은 슬롯 너비 그대로 사용 (이격거리는 이미 반영됨)
                // 양쪽 끝 슬롯만 엔드패널 처리
                if (droppedPosition === 'left' && isFirstSlot) {
                  // 좌측 단내림 → 단내림구간 좌측 끝 슬롯 (엔드패널)
                  if (spaceInfo.installType === 'freestanding' || !spaceInfo.wallConfig?.left) {
                    customWidth = customWidth - END_PANEL_THICKNESS;
                    debugLog('🎯 단내림구간 좌측 끝 슬롯 가구 너비 조정 (엔드패널):', {
                      slotIndex: zoneSlotIndex,
                      surroundType: spaceInfo.surroundType,
                      originalWidth: zoneIndexing.slotWidths[zoneSlotIndex],
                      adjustedWidth: customWidth,
                      endPanelSpace: END_PANEL_THICKNESS
                    });
                  }
                } else if (droppedPosition === 'right' && isLastSlot) {
                  // 우측 단내림 → 단내림구간 우측 끝 슬롯 (엔드패널)
                  if (spaceInfo.installType === 'freestanding' || !spaceInfo.wallConfig?.right) {
                    customWidth = customWidth - END_PANEL_THICKNESS;
                    debugLog('🎯 단내림구간 우측 끝 슬롯 가구 너비 조정 (엔드패널):', {
                      slotIndex: zoneSlotIndex,
                      surroundType: spaceInfo.surroundType,
                      originalWidth: zoneIndexing.slotWidths[zoneSlotIndex],
                      adjustedWidth: customWidth,
                      endPanelSpace: END_PANEL_THICKNESS
                    });
                  }
                }
                // 경계면 슬롯 (isLastSlot when left, isFirstSlot when right)은 슬롯 너비 그대로 사용
              }
            } else {
              // 단내림 없는 경우: 첫 번째 또는 마지막 슬롯
              // 한쪽벽: 벽이 없는 쪽만
              // 벽없음: 양쪽
              if (isFirstSlot && (spaceInfo.installType === 'freestanding' || !spaceInfo.wallConfig?.left)) {
                customWidth = customWidth - END_PANEL_THICKNESS;
                debugLog('🎯 좌측 끝 슬롯 가구 너비 조정:', {
                  slotIndex: zoneSlotIndex,
                  surroundType: spaceInfo.surroundType,
                  originalWidth: zoneIndexing.slotWidths[zoneSlotIndex],
                  adjustedWidth: customWidth,
                  endPanelSpace: END_PANEL_THICKNESS
                });
              } else if (isLastSlot && (spaceInfo.installType === 'freestanding' || !spaceInfo.wallConfig?.right)) {
                customWidth = customWidth - END_PANEL_THICKNESS;
                debugLog('🎯 우측 끝 슬롯 가구 너비 조정:', {
                  slotIndex: zoneSlotIndex,
                  surroundType: spaceInfo.surroundType,
                  originalWidth: zoneIndexing.slotWidths[zoneSlotIndex],
                  adjustedWidth: customWidth,
                  endPanelSpace: END_PANEL_THICKNESS
                });
              }
            }
          }
        } else {
          customWidth = actualSlotWidth;
        }
        // 노서라운드 모드에서는 adjustedWidth를 설정하지 않음 (엔드패널 조정은 FurnitureItem에서 처리)
        // adjustedWidth는 기둥 침범 시에만 사용
        adjustedWidth = customWidth;
      }

      const normalizeWidth = (value?: number | null) =>
        typeof value === 'number' && !Number.isNaN(value)
          ? Number(value.toFixed(2))
          : undefined;
      customWidth = normalizeWidth(customWidth);
      adjustedWidth = normalizeWidth(adjustedWidth);

      debugLog('🎯 가구 배치 정보:', {
        zone: zoneToUse,
        슬롯인덱스: zoneSlotIndex,
        슬롯너비: actualSlotWidth,
        모듈너비: moduleData.dimensions.width,
        customWidth: customWidth,
        adjustedWidth: adjustedWidth,
        차이: Math.abs(moduleData.dimensions.width - customWidth),
        위치X: furnitureX,
        위치X_mm: furnitureX * 100,
        기둥침범: slotInfo?.hasColumn || false,
        마지막슬롯여부: zoneSlotIndex === targetZoneInfo.columnCount - 1,
        영역시작X_mm: targetZoneInfo.startX,
        영역끝X_mm: targetZoneInfo.startX + targetZoneInfo.width,
        가구왼쪽끝_mm: (furnitureX * 100) - (customWidth / 2),
        가구오른쪽끝_mm: (furnitureX * 100) + (customWidth / 2),
        slotWidths: zoneIndexing.slotWidths,
        zoneInfo: {
          normal: zoneInfo.normal,
          dropped: zoneInfo.dropped
        }
      });

      // 정확한 너비를 포함한 moduleId 생성
      // 원본 모듈의 타입(single/dual)을 유지
      const originalBaseType = dragData.moduleData.id.replace(/-[\d.]+$/, '');
      const zoneTargetModuleId = customWidth !== undefined
        ? `${originalBaseType}-${customWidth}`
        : dragData.moduleData.id;

      debugLog('🎯 단내림 구간 모듈 ID 생성:', {
        originalDragId: dragData.moduleData.id,
        foundModuleId: moduleData.id,
        baseType: originalBaseType,
        customWidth,
        targetModuleId: zoneTargetModuleId,
        isDual,
        slotIndex: zoneSlotIndex,
        occupiedSlots: isDual ? [zoneSlotIndex, zoneSlotIndex + 1] : [zoneSlotIndex]
      });

      // 힌지 방향 결정 (기둥 위치 고려)
      const hingePosition = slotInfo && slotInfo.hasColumn ?
        calculateOptimalHingePosition(slotInfo) :
        'right';

      // 깊이는 기본값 사용 (기둥 C는 이제 폭 조정 방식만 사용)
      let adjustedDepth = defaultDepth;

      // 상부장/하부장/키큰장 체크 및 Y 위치 계산
      const isUpperCabinet = moduleData?.category === 'upper';
      const isLowerCabinet = moduleData?.category === 'lower';
      const isFullCabinet = moduleData?.category === 'full';

      let furnitureY = 0; // 기본값

      if (isFullCabinet) {
        // 키큰장: 바닥부터 시작
        // 내경 공간의 시작 Y 위치 사용
        const floorY = mmToThreeUnits(zoneInternalSpace.startY);
        const furnitureHeightMm = moduleData?.dimensions?.height || 2200;
        const furnitureHeight = mmToThreeUnits(furnitureHeightMm);

        // 키큰장은 바닥에서 시작
        furnitureY = floorY + furnitureHeight / 2;

        debugLog('🏢 키큰장 초기 배치 Y 위치 계산:', {
          zone: zoneToUse,
          floorY,
          floorYmm: zoneInternalSpace.startY,
          furnitureHeightMm,
          furnitureHeight,
          furnitureY,
          furnitureBottomY: furnitureY - furnitureHeight / 2,
          expectedFloorY: floorY,
          zoneInternalSpace: {
            startY: zoneInternalSpace.startY,
            height: zoneInternalSpace.height
          },
          isDroppedZone: zoneToUse === 'dropped',
          설명: '키큰장은 바닥부터 시작'
        });
      } else if (isUpperCabinet) {
        // 상부장: 천장에 붙어있음
        // 내경 공간의 상단 Y 위치 사용
        const floorY = mmToThreeUnits(zoneInternalSpace.startY);
        const ceilingY = floorY + mmToThreeUnits(zoneInternalSpace.height);
        const furnitureHeightMm = moduleData?.dimensions?.height || 600;
        const furnitureHeight = mmToThreeUnits(furnitureHeightMm);

        // 상부장은 천장에서 아래로
        furnitureY = ceilingY - furnitureHeight / 2;

        debugLog('🔝 상부장 초기 배치 Y 위치 계산:', {
          zone: zoneToUse,
          floorY,
          ceilingY,
          furnitureHeightMm,
          furnitureHeight,
          furnitureY,
          zoneInternalSpace: {
            startY: zoneInternalSpace.startY,
            height: zoneInternalSpace.height
          },
          isDroppedZone: zoneToUse === 'dropped',
          설명: '상부장은 천장에서 아래로'
        });
      } else if (isLowerCabinet) {
        // 하부장: 바닥에서 시작
        const floorY = mmToThreeUnits(zoneInternalSpace.startY);
        const furnitureHeightMm = moduleData?.dimensions?.height || 1000;
        const furnitureHeight = mmToThreeUnits(furnitureHeightMm);

        // 하부장은 바닥에서 시작
        furnitureY = floorY + furnitureHeight / 2;
      } else {
        // 기본 가구: 바닥에서 시작
        debugLog('⚠️ 기본 가구 Y 위치 계산 (카테고리 없음):', {
          moduleCategory: moduleData?.category,
          moduleId: moduleData?.id
        });
        const floorY = mmToThreeUnits(zoneInternalSpace.startY);
        const furnitureHeightMm = moduleData?.dimensions?.height || 600;
        const furnitureHeight = mmToThreeUnits(furnitureHeightMm);

        // 기본 가구도 바닥에서 시작
        furnitureY = floorY + furnitureHeight / 2;
      }

      // 영역별 Y 위치 비교
      debugLog(`⚠️ ${zoneToUse === 'dropped' ? '단내림' : '일반'} 구간 최종 Y 위치:`, {
        zone: zoneToUse,
        furnitureY,
        floorY: mmToThreeUnits(zoneInternalSpace.startY),
        startYmm: zoneInternalSpace.startY,
        internalHeight: zoneInternalSpace.height,
        category: moduleData?.category,
        furnitureHeightMm: moduleData?.dimensions?.height,
        expectedBottomY: furnitureY - mmToThreeUnits((moduleData?.dimensions?.height || 600) / 2)
      });

      // 새 모듈 배치
      const newModule: any = {
        id: placedId,
        moduleId: zoneTargetModuleId, // 정확한 너비를 포함한 모듈 ID 사용
        position: { x: furnitureX, y: furnitureY, z: 0 }, // 상부장/하부장/키큰장에 따른 Y 위치 사용
        rotation: 0,
        hasDoor: false,
        customDepth: adjustedDepth, // 조정된 깊이 사용
        slotIndex: globalSlotIndex,  // 전체 공간 기준 슬롯 인덱스 사용
        isDualSlot: isDual,
        isValidInCurrentSpace: true,
        adjustedWidth: adjustedWidth,
        hingePosition: hingePosition, // 기둥 위치에 따른 최적 힌지 방향
        zone: zoneToUse, // 영역 정보 저장
        customWidth: customWidth, // 실제 슬롯 너비 사용 (소수점 2자리)
        customHeight: zoneToUse === 'dropped' && zoneInternalSpace ? zoneInternalSpace.height : undefined, // 단내림 구간의 줄어든 높이 저장
        lowerSectionTopOffset: moduleData.id.includes('2drawer') || moduleData.id.includes('4drawer') ? 85 : 0 // 2단/4단 서랍장 85mm, 나머지 0mm
      };

      // 기둥 정보가 있으면 추가
      if (slotInfo && slotInfo.hasColumn) {
        // furniturePosition을 spaceType으로 매핑
        let spaceType: 'left' | 'right' | 'front' | undefined;
        if (slotInfo.furniturePosition === 'left-aligned') {
          spaceType = 'left';
        } else if (slotInfo.furniturePosition === 'right-aligned') {
          spaceType = 'right';
        }

        newModule.columnSlotInfo = {
          hasColumn: true,
          columnId: slotInfo.column?.id,
          columnPosition: slotInfo.columnPosition,
          availableWidth: slotInfo.availableWidth,
          adjustedWidth: slotInfo.adjustedWidth,
          intrusionDirection: slotInfo.intrusionDirection,
          furniturePosition: slotInfo.furniturePosition,
          spaceType // 'left', 'right', 'front' 중 하나
        };

        // 기둥 침범 시 실제 조정된 너비 재확인
        debugLog('🔧 기둥 침범 가구 최종 설정:', {
          moduleId: newModule.moduleId,
          adjustedWidth: newModule.adjustedWidth,
          customWidth: newModule.customWidth,
          columnSlotInfo: newModule.columnSlotInfo
        });
      }

      debugLog('✅ 가구 배치 완료:', {
        zone: zoneToUse,
        moduleId: zoneTargetModuleId,
        slotIndex: zoneSlotIndex,
        isDualSlot: isDual,
        isDualFromModuleId: zoneTargetModuleId.startsWith('dual-'),
        occupiedSlots: isDual ? [zoneSlotIndex, zoneSlotIndex + 1] : [zoneSlotIndex],
        position: {
          x: furnitureX,
          y: furnitureY,
          y_mm: furnitureY * 100
        },
        moduleCategory: moduleData?.category,
        isUpperCabinet: moduleData?.category === 'upper',
        customWidth: customWidth,
        zoneInfo: zoneToUse === 'dropped' ? zoneInfo.dropped : zoneInfo.normal,
        newModule: {
          id: newModule.id,
          moduleId: newModule.moduleId,
          isDualSlot: newModule.isDualSlot,
          slotIndex: newModule.slotIndex,
          position: newModule.position
        }
      });

      addModule(newModule);
      // 드래그 모드인 경우에만 currentDragData 초기화
      if (currentDragData) {
        setCurrentDragData(null);
      }

      // 전체 슬롯 점유 상태 디버깅
      setTimeout(() => {
        debugSlotOccupancy(placedModules, spaceInfo);
      }, 100);

      // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
      window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
      return true;
    } else {

      // 단내림이 활성화되어 있지만 zone이 결정되지 않은 경우 자동으로 적절한 영역 결정
      if (spaceInfo.droppedCeiling?.enabled) {
        // 클릭한 위치의 슬롯 인덱스를 기반으로 영역 결정
        const allColliders = scene.children
          .filter(obj => obj.userData?.isSlotCollider && obj.visible)
          .sort((a, b) => (a.userData?.slotIndex || 0) - (b.userData?.slotIndex || 0));

        const colliderUserData = allColliders
          .find(obj => obj.userData?.slotIndex === slotIndex && obj.userData?.isSlotCollider)
          ?.userData;

        // 클릭한 슬롯의 영역 정보 사용
        const targetZone = colliderUserData?.zone || 'normal';

        // 변수 정의 추가
        const moduleData = dragData.moduleData;
        const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const isDual = moduleData.id.includes('dual')
          || dragData.isDualSlot === true
          || (moduleData.dimensions.width > indexing.columnWidth * 1.5);
        const defaultDepth = moduleData.defaultDepth || 600;
        const slotIndex = colliderUserData?.slotIndex;
        const customWidth = moduleData.customWidth || moduleData.dimensions.width;

        // X 위치 계산
        let finalX = 0;
        if (slotIndex !== undefined) {
          finalX = calculateFurniturePosition(slotIndex, moduleData.id, spaceInfo, targetZone) || 0;
        }

        // 상부장 Y 위치 계산
        let furnitureY = 0;
        if (moduleData?.category === 'upper') {
          // 상부장: 전체 공간 최상단에 배치
          const furnitureHeightMm = moduleData?.dimensions?.height || 600;

          // 전체 높이에서 상단 프레임만 빼기
          let totalHeightMm = spaceInfo.height;
          const topFrameHeight = spaceInfo.topFrame?.height || 10;
          totalHeightMm = totalHeightMm - topFrameHeight;

          // 상부장 Y 위치 계산
          furnitureY = (totalHeightMm - furnitureHeightMm / 2) / 100;
        } else if (moduleData?.category === 'lower') {
          // 하부장: 바닥에서 시작
          const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
          let startHeightMm = floorFinishHeightMm;
          if (spaceInfo.baseConfig?.type === 'floor') {
            startHeightMm += spaceInfo.baseConfig?.height || 65;
          } else if (spaceInfo.baseConfig?.placementType === 'float') {
            startHeightMm += spaceInfo.baseConfig?.floatHeight || 0;
          }
          const furnitureHeightMm = moduleData?.dimensions?.height || 1000;
          furnitureY = (startHeightMm + furnitureHeightMm / 2) / 100;
        }

        const newModule = {
          id: placedId,
          moduleId: moduleData.id,
          position: { x: finalX, y: furnitureY, z: 0 },
          rotation: 0,
          slotIndex: slotIndex!,
          depth: defaultDepth,
          isDualSlot: isDual,
          isValidInCurrentSpace: true,
          adjustedWidth: moduleData.dimensions.width,
          hingePosition: 'right' as 'left' | 'right',
          customWidth: customWidth,
          zone: targetZone, // 클릭한 슬롯의 영역 사용
          lowerSectionTopOffset: moduleData.id.includes('2drawer') || moduleData.id.includes('4drawer') ? 85 : 0 // 2단/4단 서랍장 85mm, 나머지 0mm
        };

        addModule(newModule);
        // 드래그 모드인 경우에만 currentDragData 초기화
        if (currentDragData) {
          setCurrentDragData(null);
        }
        window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
        return true;
      }
    }

    // 단내림이 없는 경우 기존 로직
    const slotIndex = getSlotIndexFromRaycast(
      dragEvent.clientX,
      dragEvent.clientY,
      canvasElement,
      camera,
      scene,
      spaceInfo
    );

    debugLog('🎰 Slot index from raycast (non-dropped):', slotIndex);

    if (slotIndex === null) {
      debugLog('❌ No slot index found (non-dropped)');
      return false;
    }

    const zoneSlotIndex = slotIndex;

    // 듀얼/싱글 가구 판별 - ID prefix, isDualSlot 플래그, 또는 너비 기반
    const isDual = dragData.moduleData.id.startsWith('dual-')
      || dragData.isDualSlot === true
      || (dragData.moduleData.dimensions.width > indexing.columnWidth * 1.5);

    // 메인 구간 슬롯 점유 상태 디버깅
    const mapToGlobalSlotIndex = (index: number): number => index;

    debugLog('📊 메인 구간 슬롯 점유 상태 (drop):', {
      zone: zoneToUse || 'normal',
      targetSlotLocal: slotIndex,
      targetSlotGlobal: mapToGlobalSlotIndex(slotIndex),
      isDualDragging: isDual,
      targetSlotsLocal: isDual ? [slotIndex, slotIndex + 1] : [slotIndex],
      existingModules: placedModules
        .map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          slotIndexGlobal: m.slotIndex,
          slotIndexLocal: mapToGlobalSlotIndex(m.slotIndex),
          isDualSlot: m.isDualSlot,
          occupiedSlots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex]
        }))
    });

    // 슬롯 가용성 검사 (전역 인덱스 기준)
    const globalSlotIndexForCheck = mapToGlobalSlotIndex(slotIndex);
    if (!isSlotAvailable(globalSlotIndexForCheck, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
      debugLog('❌ 메인 구간 슬롯 충돌로 배치 불가');
      return false;
    }

    const globalSlotIndex = globalSlotIndexForCheck;

    // 분할창인 경우 spaceInfo 조정 - mainDoorCount 정보도 포함
    let adjustedSpaceInfo = spaceInfo;
    if (spaceInfo.mainDoorCount && spaceInfo.mainDoorCount > 0) {
      const defaultColumnCount = Math.max(1, Math.floor(internalSpace.width / 600));
      adjustedSpaceInfo = {
        ...spaceInfo,
        mainDoorCount: spaceInfo.mainDoorCount,  // mainDoorCount 유지
        customColumnCount: spaceInfo.mainDoorCount,
        columnMode: 'custom' as const
      };
      debugLog('🎯 [SlotDropZones] 분할창 모듈 생성:', {
        mainDoorCount: spaceInfo.mainDoorCount,
        defaultColumnCount,
        internalWidth: internalSpace.width,
        adjustedSpaceInfo
      });
    }

    // 타겟 슬롯의 실제 너비 가져오기
    const targetIndexing = calculateSpaceIndexing(adjustedSpaceInfo);
    const zoneIndexDataForTarget = zoneToUse === 'dropped' ? zoneSlotInfo?.dropped : zoneSlotInfo?.normal;
    const targetWidth = zoneIndexDataForTarget?.slotWidths?.[zoneSlotIndex]
      ?? zoneIndexDataForTarget?.columnWidth
      ?? (targetIndexing.slotWidths && targetIndexing.slotWidths[slotIndex] !== undefined
        ? targetIndexing.slotWidths[slotIndex]
        : targetIndexing.columnWidth);

    // 베이스 타입 추출 (소수점 포함한 숫자 제거)
    const moduleBaseType = dragData.moduleData.id.replace(/-[\d.]+$/, '');

    // 듀얼 가구인 경우 너비를 2배로 계산
    const finalWidth = isDual ? targetWidth * 2 : targetWidth;

    // 정확한 너비를 포함한 ID 생성
    const targetModuleId = `${moduleBaseType}-${finalWidth}`;

    debugLog('🎯 [SlotDropZones] Non-dropped module lookup:', {
      originalId: dragData.moduleData.id,
      baseType: moduleBaseType,
      targetWidth,
      targetModuleId,
      slotIndex,
      slotWidths: targetIndexing.slotWidths,
      zoneSlotIndex
    });

    // 가구 데이터 조회 (조정된 spaceInfo 사용)
    let moduleData = getModuleById(targetModuleId, internalSpace, adjustedSpaceInfo);
    if (!moduleData) {
      console.error('❌ [SlotDropZones] Module not found:', targetModuleId);
      return false;
    }

    // 최종 위치 계산 (듀얼 가구는 나중에 업데이트)
    let finalX = calculateFurniturePosition(zoneSlotIndex, targetModuleId, spaceInfo, zoneToUse);
    if (finalX === null) {
      return false;
    }

    // 듀얼 가구 위치 디버깅
    if (isDual) {
      debugLog('🎯 Dual furniture position debug:', {
        slotIndex,
        zoneSlotIndex,
        columnCount: indexing.columnCount,
        threeUnitDualPositions: indexing.threeUnitDualPositions,
        finalX,
        expectedPosition: indexing.threeUnitDualPositions?.[slotIndex]
      });
    }

    // 고유 ID 생성 - 단내림 구간은 별도 ID 체계
    const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 기본 깊이 설정
    const defaultDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);

    // 사용할 인덱싱 정보 결정
    let zoneTargetIndexing = indexing;
    if (spaceInfo.droppedCeiling?.enabled && zoneToUse && indexing.zones) {
      const zoneIndexing = zoneToUse === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
      if (zoneIndexing) {
        zoneTargetIndexing = zoneIndexing;
      }
    }

    // 실제 슬롯 너비 가져오기
    const actualSlotWidth = zoneTargetIndexing.slotWidths && zoneTargetIndexing.slotWidths[zoneSlotIndex] !== undefined
      ? zoneTargetIndexing.slotWidths[zoneSlotIndex]
      : zoneTargetIndexing.columnWidth; // Math.floor 대신 columnWidth 사용

    // 듀얼 가구의 경우 두 슬롯의 실제 너비 합계
    let customWidth;
    let dualTargetModuleId = targetModuleId; // 듀얼 가구용 모듈 ID

    if (isDual && zoneTargetIndexing.slotWidths && zoneTargetIndexing.slotWidths[zoneSlotIndex] !== undefined
        && zoneSlotIndex < zoneTargetIndexing.slotWidths.length - 1) {
      // 듀얼: columnWidth * 2의 0.5mm 단위 내림
      customWidth = Math.floor(zoneTargetIndexing.columnWidth * 2 * 2) / 2;

      // 듀얼 가구는 합산 너비로 ID 생성
      dualTargetModuleId = `${moduleBaseType}-${customWidth}`;

      debugLog('🎯 [SlotDropZones] Dual furniture width calculation:', {
        slotIndex,
        zoneSlotIndex,
        slot1Width,
        slot2Width,
        totalWidth: customWidth,
        dualTargetModuleId,
        originalTargetModuleId: targetModuleId
      });
    } else if (zoneTargetIndexing.slotWidths && zoneTargetIndexing.slotWidths[zoneSlotIndex] !== undefined) {
      // 싱글 가구의 경우 실제 슬롯 너비 사용
      customWidth = zoneTargetIndexing.slotWidths[zoneSlotIndex];
    } else {
      customWidth = actualSlotWidth;
    }

    // 듀얼 가구인 경우 정확한 너비로 모듈 다시 조회
    if (isDual && dualTargetModuleId !== targetModuleId) {
      const dualModuleData = getModuleById(dualTargetModuleId, internalSpace, adjustedSpaceInfo);
      if (dualModuleData) {
        moduleData = dualModuleData;
        debugLog('✅ [SlotDropZones] Found dual module with exact width:', dualTargetModuleId);
        // 듀얼 가구의 경우 위치 재계산
        finalX = calculateFurniturePosition(zoneSlotIndex, dualTargetModuleId, spaceInfo, zoneToUse);
        if (finalX === null) {
          console.error('❌ [SlotDropZones] Failed to calculate dual furniture position');
          return false;
        }
      } else {
        debugWarn('⚠️ [SlotDropZones] Dual module not found with exact width, using single slot module:', dualTargetModuleId);
      }
    }

    debugLog('🎯 가구 배치 시 customWidth 설정:', {
      slotIndex,
      isDual,
      targetIndexing: {
        columnWidth: zoneTargetIndexing.columnWidth,
        slotWidths: zoneTargetIndexing.slotWidths
      },
      actualSlotWidth,
      customWidth,
      moduleWidth: moduleData.dimensions.width,
      평균너비: zoneTargetIndexing.columnWidth,
      내경너비: internalSpace.width,
      슬롯수: zoneTargetIndexing.columnCount,
      finalModuleId: isDual ? dualTargetModuleId : targetModuleId
    });

    // 기둥 분석
    const columnSlots = analyzeColumnSlots(spaceInfo);

    // 기둥이 있는 경우 가구 폭과 위치 조정
    let adjustedCustomWidth = customWidth;
    let adjustedPosition = finalX;
    let adjustedWidthValue = moduleData.dimensions.width;
    let slotInfo = null; // slotInfo를 더 넓은 스코프에서 선언

    // 듀얼 가구의 경우 두 슬롯 모두 확인
    if (isDual) {
      const slot1Info = columnSlots[globalSlotIndex];
      const slot2Info = columnSlots[globalSlotIndex + 1];

      debugLog('🏛️ 듀얼 가구 기둥 침범 확인:', {
        slot1: {
          index: slotIndex,
          hasColumn: slot1Info?.hasColumn || false,
          columnType: slot1Info?.columnType,
          availableWidth: slot1Info?.availableWidth
        },
        slot2: {
          index: slotIndex + 1,
          hasColumn: slot2Info?.hasColumn || false,
          columnType: slot2Info?.columnType,
          availableWidth: slot2Info?.availableWidth
        }
      });

      // 두 슬롯 중 하나라도 기둥이 있는지 확인
      const hasColumnInAnySlot = (slot1Info?.hasColumn || false) || (slot2Info?.hasColumn || false);

      if (hasColumnInAnySlot) {
        // 기둥 A가 있는 경우 즉시 폭 조정
        const hasDeepColumn = (slot1Info?.columnType === 'deep') || (slot2Info?.columnType === 'deep');

        if (hasDeepColumn) {
          // 두 슬롯의 사용 가능한 너비 합계 계산
          const slot1Available = slot1Info?.availableWidth || zoneTargetIndexing.columnWidth;
          const slot2Available = slot2Info?.availableWidth || zoneTargetIndexing.columnWidth;
          const totalAvailableWidth = slot1Available + slot2Available;

          adjustedCustomWidth = totalAvailableWidth;
          adjustedWidthValue = totalAvailableWidth;

          debugLog('🔧 듀얼 가구 기둥 A 침범 - 폭 조정:', {
            원래폭: customWidth,
            조정된폭: adjustedCustomWidth,
            slot1Available,
            slot2Available,
            totalAvailable: totalAvailableWidth
          });
        } else {
          // 기둥 C의 경우 원본 크기 유지 (FurnitureItem에서 실시간 조정)
          debugLog('🔧 듀얼 가구 기둥 C 선배치 - 원본 크기 유지');
        }
      }
    } else {
      // 싱글 가구의 경우 기존 로직 유지
      slotInfo = columnSlots[globalSlotIndex];

      if (slotInfo && slotInfo.hasColumn) {
        debugLog('🏛️ 싱글 가구 - 기둥 침범 슬롯 감지:', {
          slotIndex,
          hasColumn: true,
          availableWidth: slotInfo.availableWidth,
          adjustedWidth: slotInfo.adjustedWidth,
          columnType: slotInfo.columnType,
          column: slotInfo.column,
          intrusionDirection: slotInfo.intrusionDirection,
          furniturePosition: slotInfo.furniturePosition
        });

        if (slotInfo.columnType === 'medium') {
          // 기둥 C(300mm)가 이미 있는 슬롯에는 가구를 원본 크기로 배치
          // 나중에 FurnitureItem에서 실시간으로 폭이 조정됨
          debugLog('🔧 기둥 C 선배치 슬롯 - 원본 크기 유지');
        } else {
          // 기둥 A(깊은 기둥) 등 다른 기둥은 즉시 폭 조정
          const slotWidthM = zoneTargetIndexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: finalX - slotWidthM / 2,
            right: finalX + slotWidthM / 2,
            center: finalX
          };

          const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);

          adjustedCustomWidth = furnitureBounds.renderWidth;
          adjustedWidthValue = furnitureBounds.renderWidth;
          adjustedPosition = furnitureBounds.center;

          debugLog('🔧 기둥 A 침범 - 가구 폭 즉시 조정:', {
            원래폭: customWidth,
            조정된폭: adjustedCustomWidth,
            원래위치: finalX,
            조정된위치: adjustedPosition,
            furnitureBounds
          });
        }
      }
    }

    // 상부장/하부장/키큰장 체크 및 Y 위치 계산
    const isUpperCabinet = moduleData?.category === 'upper';
    const isLowerCabinet = moduleData?.category === 'lower';
    const isFullCabinet = moduleData?.category === 'full';

    let furnitureY = 0; // 기본값

    if (isFullCabinet) {
      // 키큰장: 바닥부터 천장까지 (바닥마감재와 띄워서 배치 고려)
      const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
      let startHeightMm = floorFinishHeightMm;
      if (spaceInfo.baseConfig?.type === 'floor') {
        startHeightMm += spaceInfo.baseConfig?.height || 65;
      } else if (spaceInfo.baseConfig?.placementType === 'float') {
        startHeightMm += spaceInfo.baseConfig?.floatHeight || 0;
      }
      const furnitureHeightMm = moduleData?.dimensions?.height || 2200;
      furnitureY = (startHeightMm + furnitureHeightMm / 2) / 100; // mm를 m로 변환

      debugLog('🏢 키큰장 드래그 Y 위치 계산:', {
        category: moduleData.category,
        startHeightMm,
        furnitureHeightMm,
        furnitureY,
        baseConfig: spaceInfo.baseConfig,
        placementType: spaceInfo.baseConfig?.placementType,
        floatHeight: spaceInfo.baseConfig?.floatHeight,
        설명: '키큰장은 바닥/띄움 높이부터 시작'
      });
    } else if (isUpperCabinet) {
      // 상부장: 전체 공간 상단에 배치 (mm 단위로 계산)
      const furnitureHeightMm = moduleData?.dimensions?.height || 600;

      // 전체 높이에서 상단 프레임만 빼기
      let totalHeightMm = spaceInfo.height;
      const topFrameHeight = spaceInfo.topFrame?.height || 10;
      totalHeightMm = totalHeightMm - topFrameHeight;

      // 상부장 Y 위치 계산
      furnitureY = (totalHeightMm - furnitureHeightMm / 2) / 100; // mm를 m로 변환

      debugLog('🔴 상부장 Y 위치 계산:', {
        moduleCategory: moduleData?.category,
        moduleId: moduleData?.id,
        spaceHeight: spaceInfo.height,
        topFrameHeight,
        totalHeightMm,
        furnitureHeightMm,
        furnitureY,
        furnitureYMm: furnitureY * 100,
        설명: '전체 공간 최상단에 배치 (받침대 영향 없음)'
      });
    } else if (isLowerCabinet) {
      // 하부장: 바닥에서 시작 (바닥마감재와 띄워서 배치 고려)
      const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
      let startHeightMm = floorFinishHeightMm;
      if (spaceInfo.baseConfig?.type === 'floor') {
        startHeightMm += spaceInfo.baseConfig?.height || 65;
      } else if (spaceInfo.baseConfig?.placementType === 'float') {
        startHeightMm += spaceInfo.baseConfig?.floatHeight || 0;
      }
      const furnitureHeightMm = moduleData?.dimensions?.height || 1000;
      furnitureY = (startHeightMm + furnitureHeightMm / 2) / 100; // mm를 m로 변환
    }

    // 새 모듈 배치
    const newModule: any = {
      id: placedId,
      moduleId: isDual ? dualTargetModuleId : targetModuleId, // 듀얼의 경우 합계 너비 ID 사용
      position: { x: adjustedPosition, y: furnitureY, z: 0 },
      rotation: 0,
      hasDoor: false,
      customDepth: defaultDepth,
      slotIndex: globalSlotIndex,
      isDualSlot: isDual,
      isValidInCurrentSpace: true,
      adjustedWidth: slotInfo?.hasColumn && slotInfo.columnType !== 'medium' ? adjustedWidthValue : undefined, // 기둥 C를 제외한 모든 기둥에서 조정된 너비 사용
      hingePosition: 'right' as 'left' | 'right',
      // 노서라운드 모드에서는 customWidth를 설정하지 않음 - FurnitureItem이 직접 slotWidths 사용
      customWidth: spaceInfo.surroundType === 'no-surround' ? undefined : adjustedCustomWidth,
      zone: zoneToUse, // 단내림 영역 정보 저장
      lowerSectionTopOffset: moduleData.id.includes('2drawer') || moduleData.id.includes('4drawer') ? 85 : 0 // 2단/4단 서랍장 85mm, 나머지 0mm
    };

    // 기둥 정보가 있으면 추가
    if (slotInfo && slotInfo.hasColumn) {
      // furniturePosition을 spaceType으로 매핑
      let spaceType: 'left' | 'right' | 'front' | undefined;
      if (slotInfo.furniturePosition === 'left-aligned') {
        spaceType = 'left';
      } else if (slotInfo.furniturePosition === 'right-aligned') {
        spaceType = 'right';
      }

      newModule.columnSlotInfo = {
        hasColumn: true,
        columnId: slotInfo.column?.id,
        columnPosition: slotInfo.columnPosition,
        availableWidth: slotInfo.availableWidth,
        adjustedWidth: slotInfo.adjustedWidth,
        intrusionDirection: slotInfo.intrusionDirection,
        furniturePosition: slotInfo.furniturePosition,
        spaceType // 'left', 'right', 'front' 중 하나
      };
    }

    // 듀얼 가구 배치 시 슬롯 점유 상태 로그
    debugLog('🎯 가구 배치 완료:', {
      id: placedId,
      moduleId: newModule.moduleId,
      isDual,
      isDualSlot: newModule.isDualSlot,
      slotIndex: globalSlotIndex,
      zoneSlotIndex,
      occupiedSlots: isDual ? [globalSlotIndex, globalSlotIndex + 1] : [globalSlotIndex],
      zone: zoneToUse,
      position: adjustedPosition,
      width: moduleData.dimensions.width,
      customWidth
    });

    // 최종 모듈 데이터 로그
    debugLog('🎯 최종 가구 데이터:', {
      moduleId: newModule.moduleId,
      customWidth: newModule.customWidth,
      adjustedWidth: newModule.adjustedWidth,
      slotInfo: slotInfo ? {
        hasColumn: slotInfo.hasColumn,
        columnType: slotInfo.columnType,
        availableWidth: slotInfo.availableWidth
      } : null,
      position: newModule.position,
      '조정된 너비 사용 여부': newModule.adjustedWidth !== undefined
    });

    // 배치 전 기존 가구 상태 확인
    debugLog('📋 배치 전 가구 목록:', placedModules.map(m => ({
      id: m.id.slice(-2),
      slotIndex: m.slotIndex,
      isDualSlot: m.isDualSlot,
      zone: m.zone,
      moduleId: m.moduleId
    })));

    addModule(newModule);

    // 전체 슬롯 점유 상태 시각화
    const updatedModules = [...placedModules, newModule];
    const targetZone: 'normal' | 'dropped' = spaceInfo.droppedCeiling?.enabled
      ? (zoneToUse || 'normal')
      : 'normal';
    const slotOccupancy: string[] = new Array(zoneTargetIndexing.columnCount).fill('[ ]');

    // 현재 영역의 가구만 필터링 (zone이 없는 경우 normal로 간주)
    const zoneModules = updatedModules.filter(m => {
      if (spaceInfo.droppedCeiling?.enabled) {
        return (m.zone || 'normal') === targetZone;
      }
      return true; // 단내림이 없으면 모든 가구 표시
    });

    debugLog(`🔍 ${targetZone} 영역 가구 목록:`, zoneModules.map(m => ({
      id: m.id.slice(-2),
      moduleId: m.moduleId,
      slotIndex: m.slotIndex,
      isDualSlot: m.isDualSlot,
      zone: m.zone
    })));

    zoneModules.forEach(m => {
      if (m.slotIndex === undefined) {
        return;
      }

      // 단내림이 없으면 slotIndex를 그대로 사용
      const localIndex = m.slotIndex;

      if (localIndex < 0 || localIndex >= slotOccupancy.length) {
        return;
      }

      if (m.isDualSlot) {
        slotOccupancy[localIndex] = `[${m.id.slice(-2)}`;
        if (localIndex + 1 < slotOccupancy.length) {
          slotOccupancy[localIndex + 1] = `${m.id.slice(-2)}]`;
        }
      } else {
        slotOccupancy[localIndex] = `[${m.id.slice(-2)}]`;
      }
    });

    debugLog(`📊 ${targetZone} 영역 슬롯 점유 상태 (총 ${zoneTargetIndexing.columnCount}개):`, slotOccupancy.join(''));

    // 드래그 모드인 경우에만 currentDragData 초기화
    if (currentDragData) {
      setCurrentDragData(null);
    }

    // 전체 슬롯 점유 상태 디버깅
    setTimeout(() => {
      debugSlotOccupancy(placedModules, spaceInfo);
    }, 100);

    // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
    window.dispatchEvent(new CustomEvent('furniture-placement-complete'));

    return true;
  }, [
    currentDragData,
    camera,
    scene,
    spaceInfo,
    internalSpace,
    indexing,
    placedModules,
    addModule,
    setCurrentDragData,
    showAlert
  ]);

  // window 객체에 함수 노출
  useEffect(() => {
    window.handleSlotDrop = (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => {
      return handleSlotDrop(dragEvent, canvasElement);
    };

    return () => {
      delete window.handleSlotDrop;
    };
  }, [handleSlotDrop]);

  // 간단한 드래그오버 이벤트 핸들러 (드래그 모드와 클릭-앤-플레이스 모드 모두 지원)
  useEffect(() => {
    // 드래그 데이터나 선택된 모듈이 없으면 반환
    if (!currentDragData) {
      return;
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      debugLog('🔥 handleDragOver 호출:', {
        hasCurrentDragData: !!currentDragData,
        mouseX: e.clientX,
        mouseY: e.clientY,
        droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled
      });

      // 단내림이 활성화되어 있는 경우, 마우스 X 좌표로 영역 자동 판단
      let detectedZone: 'normal' | 'dropped' | null = null;
      if (spaceInfo.droppedCeiling?.enabled && zoneSlotInfo?.dropped) {
        // 마우스 좌표를 3D 공간 좌표로 변환하여 영역 판단
        const rect = canvas.getBoundingClientRect();
        const normalizedX = ((e.clientX - rect.left) / rect.width) * 2 - 1;

        // 간이 레이캐스트로 X 위치 추정
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(normalizedX, 0), camera);

        // 레이 방향에서 Z=0 평면과의 교점 계산 (간단한 추정)
        const ray = raycaster.ray;
        const t = -ray.origin.z / ray.direction.z;
        const intersectX = ray.origin.x + ray.direction.x * t;
        const intersectXMm = threeUnitsToMm(intersectX);

        // 영역 판단
        const normalEndX = zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width;
        const droppedStartX = zoneSlotInfo.dropped.startX;
        const droppedEndX = droppedStartX + zoneSlotInfo.dropped.width;

        if (intersectXMm >= droppedStartX && intersectXMm < droppedEndX) {
          detectedZone = 'dropped';
        } else if (intersectXMm >= zoneSlotInfo.normal.startX && intersectXMm < normalEndX) {
          detectedZone = 'normal';
        }

        debugLog('🔍 Hover - 마우스 X 좌표로 영역 자동 판단:', {
          mouseX: e.clientX,
          normalizedX,
          intersectX,
          intersectXMm,
          normalRange: `${zoneSlotInfo.normal.startX} ~ ${normalEndX}`,
          droppedRange: `${droppedStartX} ~ ${droppedEndX}`,
          detectedZone
        });
      } else {
        detectedZone = 'normal';
      }

      const slotIndex = getSlotIndexFromRaycast(
        e.clientX,
        e.clientY,
        canvas,
        camera,
        scene,
        spaceInfo,
        detectedZone || undefined
      );

      debugLog('🎯 getSlotIndexFromRaycast 결과 (hover):', {
        slotIndex,
        detectedZone,
        droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled
      });

      if (slotIndex === null) {
        setHoveredSlotIndex(null);
        setHoveredZone(null);
        return;
      }

      // 현재 활성 모듈 확인 (드래그 중이거나 선택된 모듈)
      const activeModuleData = currentDragData;

      if (activeModuleData) {
        // 듀얼 여부: dual- prefix, isDualSlot 플래그, 또는 너비가 칸 너비의 1.5배 초과
        const isDual = activeModuleData.moduleData.id.startsWith('dual-')
          || activeModuleData.isDualSlot === true
          || (activeModuleData.moduleData.dimensions.width > indexing.columnWidth * 1.5);

        // 단내림 구간일 경우 영역별 가구 확인
        const isAvailable = (() => {
          if (spaceInfo.droppedCeiling?.enabled && detectedZone) {
            // 영역별 컬럼 수 가져오기
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const targetZone = detectedZone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;

            // 듀얼 가구가 영역 경계를 넘어가는지 체크
            if (isDual && slotIndex + 1 >= targetZone.columnCount) {
              debugLog('🚫 Hover: 듀얼 가구가 영역 경계를 넘어감:', {
                zone: detectedZone,
                slotIndex,
                targetZoneColumnCount: targetZone.columnCount,
                필요한슬롯: [slotIndex, slotIndex + 1],
                영역범위: `0 ~ ${targetZone.columnCount - 1}`
              });
              return false;
            }

            // 단내림 구간: 동일 영역의 가구만 확인
            const zoneModules = placedModules.filter(m => m.zone === detectedZone);

            // 단내림 구간 슬롯 점유 상태 로깅
            debugLog('🏗️ 단내림 구간 슬롯 점유 상태 (hover):', {
              zone: detectedZone,
              currentSlot: slotIndex,
              isDualDragging: isDual,
              targetSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex],
              existingModules: zoneModules.map(m => ({
                id: m.id,
                slotIndex: m.slotIndex,
                isDualSlot: m.isDualSlot,
                occupiedSlots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex],
                zone: m.zone
              }))
            });

            const hasConflict = zoneModules.some(m => {
              if (isDual) {
                // 듀얼 가구는 2개 슬롯 차지
                if (m.isDualSlot) {
                  // 기존 가구도 듀얼인 경우: 완전한 충돌 검사
                  const conflict = (m.slotIndex === slotIndex) ||
                    (m.slotIndex === slotIndex + 1) ||
                    (m.slotIndex === slotIndex - 1) ||
                    (m.slotIndex + 1 === slotIndex);
                  if (conflict) {
                    debugLog('🚫 Hover: 듀얼-듀얼 충돌:', {
                      드래그중: { slotIndex, isDual: true, slots: [slotIndex, slotIndex + 1] },
                      기존가구: {
                        id: m.id, slotIndex: m.slotIndex, isDualSlot: m.isDualSlot,
                        moduleId: m.moduleId, slots: [m.slotIndex, m.slotIndex + 1]
                      }
                    });
                  }
                  return conflict;
                } else {
                  // 기존 가구가 싱글인 경우
                  const conflict = m.slotIndex === slotIndex || m.slotIndex === slotIndex + 1;
                  if (conflict) {
                    debugLog('🚫 Hover: 듀얼-싱글 충돌:', {
                      드래그중: { slotIndex, isDual: true, slots: [slotIndex, slotIndex + 1] },
                      기존가구: {
                        id: m.id, slotIndex: m.slotIndex, isDualSlot: m.isDualSlot,
                        moduleId: m.moduleId, slots: [m.slotIndex]
                      }
                    });
                  }
                  return conflict;
                }
              } else {
                // 싱글 가구는 1개 슬롯 차지하지만, 듀얼 가구가 차지한 슬롯도 확인해야 함
                const conflict = m.slotIndex === slotIndex ||
                  (m.isDualSlot && (m.slotIndex === slotIndex || m.slotIndex + 1 === slotIndex));
                if (conflict) {
                  debugLog('🚫 Hover: 싱글 충돌:', {
                    드래그중: { slotIndex, isDual: false, slots: [slotIndex] },
                    기존가구: {
                      id: m.id, slotIndex: m.slotIndex, isDualSlot: m.isDualSlot,
                      moduleId: m.moduleId,
                      slots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex]
                    }
                  });
                }
                return conflict;
              }
            });
            return !hasConflict;
          } else {
            // 단내림이 없는 경우 기존 로직 사용
            return isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, activeModuleData.moduleData.id);
          }
        })();

        if (isAvailable) {
          setHoveredSlotIndex(slotIndex);
          setHoveredZone(detectedZone);
        } else {
          setHoveredSlotIndex(null);
          setHoveredZone(null);
        }
      } else {
        setHoveredSlotIndex(slotIndex);
        setHoveredZone(detectedZone);
      }
    };

    const handleDragLeave = () => {
      setHoveredSlotIndex(null);
      setHoveredZone(null);
    };


    const canvas = document.querySelector('canvas');
    const canvasContainer = canvas?.parentElement;

    if (canvasContainer && currentDragData) {
      // 드래그 이벤트
      canvasContainer.addEventListener('dragover', handleDragOver);
      canvasContainer.addEventListener('dragleave', handleDragLeave);
    }

    return () => {
      if (canvasContainer) {
        canvasContainer.removeEventListener('dragover', handleDragOver);
        canvasContainer.removeEventListener('dragleave', handleDragLeave);
      }
    };
  }, [currentDragData, camera, scene, spaceInfo, placedModules]);


  // 단내림 정보 가져오기
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
  const zoneSlotInfo = hasDroppedCeiling ? ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount) : null;

  // 영역별 슬롯 위치 계산
  const getZoneSlotPositions = () => {
    debugLog('🚨🚨🚨 getZoneSlotPositions 진입:', {
      hasDroppedCeiling,
      '단내림활성화': spaceInfo.droppedCeiling?.enabled,
      'zoneSlotInfo존재': !!zoneSlotInfo,
      'zoneSlotInfo.dropped존재': !!zoneSlotInfo?.dropped,
      'surroundType': spaceInfo.surroundType,
      'installType': spaceInfo.installType
    });

    // 단내림이 없는 경우 기본 위치 사용
    if (!hasDroppedCeiling || !zoneSlotInfo?.dropped) {
      debugLog('🎯 getZoneSlotPositions - returning default positions (no dropped ceiling):', {
        hasDroppedCeiling,
        hasDroppedInfo: !!zoneSlotInfo?.dropped,
        defaultPositions: indexing.threeUnitPositions,
        indexingExists: !!indexing,
        threeUnitPositionsExists: !!indexing?.threeUnitPositions,
        isArray: Array.isArray(indexing?.threeUnitPositions),
        positionCount: indexing.threeUnitPositions?.length
      });
      // 단내림이 없을 때도 영역 정보를 포함하여 반환
      if (indexing.threeUnitPositions) {
        return indexing.threeUnitPositions.map((pos, idx) => ({
          position: pos,
          zone: 'normal' as const,
          index: idx
        }));
      }
      return [];
    }

    // 단내림이 있는 경우 모든 영역의 콜라이더 생성
    debugLog('🎯 getZoneSlotPositions - creating colliders for both zones');
    const fullIndexing = calculateSpaceIndexing(spaceInfo);

    const allPositions = [];

    // normal 영역 콜라이더
    if (fullIndexing.zones?.normal?.threeUnitPositions) {
      debugLog('🔍 Normal zone positions:', fullIndexing.zones.normal.threeUnitPositions);
      const normalMin = Math.min(...fullIndexing.zones.normal.threeUnitPositions);
      const normalMax = Math.max(...fullIndexing.zones.normal.threeUnitPositions);
      debugLog('📏 Normal zone range:', { min: normalMin, max: normalMax });

      allPositions.push(...fullIndexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      })));
    }

    // dropped 영역 콜라이더
    if (fullIndexing.zones?.dropped?.threeUnitPositions) {
      debugLog('🔍 Dropped zone positions:', fullIndexing.zones.dropped.threeUnitPositions);
      const droppedMin = Math.min(...fullIndexing.zones.dropped.threeUnitPositions);
      const droppedMax = Math.max(...fullIndexing.zones.dropped.threeUnitPositions);
      debugLog('📏 Dropped zone range:', { min: droppedMin, max: droppedMax });

      allPositions.push(...fullIndexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'dropped' as const,
        index: idx
      })));

      // 영역 겹침 확인
      if (fullIndexing.zones.normal?.threeUnitPositions) {
        const normalMin = Math.min(...fullIndexing.zones.normal.threeUnitPositions);
        const normalMax = Math.max(...fullIndexing.zones.normal.threeUnitPositions);
        if ((droppedMin >= normalMin && droppedMin <= normalMax) ||
          (droppedMax >= normalMin && droppedMax <= normalMax)) {
          console.error('❌ Zone overlap detected!', {
            normal: { min: normalMin, max: normalMax },
            dropped: { min: droppedMin, max: droppedMax }
          });
        }
      }
    }

    const zoneLocalCounters: Record<'normal' | 'dropped', number> = {
      normal: 0,
      dropped: 0
    };

    const sortedPositions = allPositions
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item, globalIndex) => {
        const zone = item.zone;
        let localIndex = item.index;

        if (zone === 'normal' || zone === 'dropped') {
          localIndex = zoneLocalCounters[zone];
          zoneLocalCounters[zone] += 1;
        }

        return {
          position: item.position,
          zone: item.zone,
          index: localIndex,
          globalIndex
        };
      });

    debugLog('🎯 All positions for colliders:', {
      original: allPositions,
      sorted: sortedPositions
    });

    return sortedPositions;
  };

  const zoneSlotPositions = getZoneSlotPositions();

  // 배열이 아닌 경우 빈 배열로 처리
  if (!Array.isArray(zoneSlotPositions)) {
    console.error('❌ getZoneSlotPositions returned non-array:', zoneSlotPositions);
    return <group />;
  }

  debugLog('🎯 SlotDropZonesSimple - rendering colliders:', {
    zoneSlotPositionsLength: zoneSlotPositions.length,
    hasDroppedCeiling,
    viewMode,
    droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
    zoneSlotPositions: zoneSlotPositions,
    indexing: indexing,
    hasIndexingPositions: !!indexing?.threeUnitPositions
  });

  if (isInvalidSpaceInfo || isFreePlacement) return null;

  return (
    <group>
      {/* 레이캐스팅용 투명 콜라이더들 - 좌우측뷰에서는 숨김 */}
      {debugLog('🎯 렌더링 슬롯 콜라이더 수:', zoneSlotPositions.length)}
      {debugLog('🎯 슬롯 콜라이더 상세 정보:', zoneSlotPositions)}
      {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && zoneSlotPositions.map((slotData, slotIndex) => {
        // slotData가 객체인지 숫자인지 확인
        const isZoneData = typeof slotData === 'object' && slotData !== null;
        const slotX = isZoneData ? slotData.position : slotData;
        // 단내림이 없는 경우 slotZone을 'normal'로 설정
        const slotZone = isZoneData ? slotData.zone : 'normal';
        const slotLocalIndex = isZoneData ? slotData.index : slotIndex;
        const slotGlobalIndex = isZoneData && typeof slotData.globalIndex === 'number'
          ? slotData.globalIndex
          : slotIndex;

        // Z축 위치 계산 - Room.tsx와 동일한 로직 사용 (실제 공간 깊이)
        const panelDepthMm = spaceInfo.depth || 600;
        const furnitureDepthMm = Math.min(panelDepthMm, 600);
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const panelZOffset = -panelDepth / 2;
        const furnitureZOffset = panelZOffset + (panelDepth - furnitureDepth) / 2;

        // 콜라이더는 전체 깊이 사용하되, 가구 배치 영역의 중심에 위치
        const reducedDepth = slotDimensions.depth;
        const zOffset = furnitureZOffset; // 가구 배치 영역의 Z 중심

        // 영역별 슬롯 너비 계산 - slotWidths 배열 사용
        let slotWidth = slotDimensions.width;
        if (hasDroppedCeiling && zoneSlotInfo) {
          const currentZone = slotZone;
          // slotWidths 배열에서 실제 슬롯 너비 가져오기
          const zoneSlotWidths = currentZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped.slotWidths
            : zoneSlotInfo.normal.slotWidths;

          if (zoneSlotWidths && slotLocalIndex < zoneSlotWidths.length) {
            slotWidth = mmToThreeUnits(zoneSlotWidths[slotLocalIndex]);
          } else {
            // slotWidths가 없으면 기본 columnWidth 사용
            const zoneColumnWidth = currentZone === 'dropped' && zoneSlotInfo.dropped
              ? zoneSlotInfo.dropped.columnWidth
              : zoneSlotInfo.normal.columnWidth;
            slotWidth = mmToThreeUnits(zoneColumnWidth);
          }
        } else if (indexing.slotWidths && slotLocalIndex < indexing.slotWidths.length) {
          // 단내림이 없는 경우 indexing.slotWidths 사용
          slotWidth = mmToThreeUnits(indexing.slotWidths[slotLocalIndex]);
        }

        // 띄워서 배치인지 확인
        const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
        const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;

        // ColumnGuides와 정확히 동일한 Y 위치 계산
        const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
        const ceilingY = mmToThreeUnits(internalSpace.startY) + mmToThreeUnits(internalSpace.height);

        // 단내림 구간의 경우 높이 조정
        let slotHeight = ceilingY - floorY;
        const currentZone = slotZone;
        if (hasDroppedCeiling && currentZone === 'dropped') {
          // 단내림 구간은 높이가 낮음
          const droppedTotalHeight = spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 0);
          const topFrameHeight = spaceInfo.frameSize?.top || 0;
          const droppedCeilingY = mmToThreeUnits(droppedTotalHeight - topFrameHeight);
          slotHeight = droppedCeilingY - floorY;
        }

        // 슬롯의 중앙 Y 위치
        const colliderY = floorY + slotHeight / 2;

        return (
          <mesh
            key={`slot-collider-${slotZone}-${slotLocalIndex}`}
            name={`SlotCollider-${slotZone}-${slotLocalIndex}`}
            position={[slotX, colliderY, zOffset]}
            userData={{
              slotIndex: slotLocalIndex,  // 영역 내 로컬 인덱스 (항상 0부터 시작)
              isSlotCollider: true,
              type: 'slot-collider',
              zone: slotZone || 'normal',  // 영역 정보 추가 - null인 경우 'normal'로 설정
              globalSlotIndex: slotGlobalIndex
            }}
            visible={false}
          >
            <boxGeometry args={[slotWidth, slotHeight, reducedDepth]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        );
      })}

      {/* 바닥 슬롯 시각화 - 가이드라인과 정확히 일치 (2D 좌측/우측뷰에서는 숨김) */}
      {showAll && showDimensions && indexing.threeUnitBoundaries.length > 1 && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (() => {
        // 단내림 활성화 여부 확인
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
        const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

        // ColumnGuides와 동일한 Y 위치 계산
        const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
        const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
        const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
        const ceilingY = mmToThreeUnits(internalSpace.startY) + mmToThreeUnits(internalSpace.height);

        // Room.tsx의 바닥 계산과 동일하게 수정 - 실제 공간 깊이 사용
        const doorThicknessMm = 20;
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이 사용
        const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 깊이는 공간 깊이와 600mm 중 작은 값
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;

        const roomBackZ = -mmToThreeUnits(internalSpace.depth / 2);
        const frameEndZ = furnitureZOffset + furnitureDepth / 2; // 좌우 프레임의 앞쪽 끝
        const slotFloorDepth = frameEndZ - roomBackZ - mmToThreeUnits(20); // 바닥 슬롯 메쉬 깊이 (앞쪽에서 20mm 줄임)
        const slotFloorZ = (frameEndZ + roomBackZ) / 2 - mmToThreeUnits(10); // 바닥 중심 Z 좌표 (앞쪽으로 10mm 이동)

        // CSS 변수에서 실제 테마 색상 가져오기
        const getThemeColorFromCSS = () => {
          if (typeof window !== 'undefined') {
            const computedColor = getComputedStyle(document.documentElement)
              .getPropertyValue('--theme-primary').trim();
            return computedColor || '#10b981';
          }
          return '#10b981';
        };

        const primaryColor = getThemeColorFromCSS();

        if (hasDroppedCeiling && zoneSlotInfo.dropped) {
          // 단내림 활성화된 경우 양쪽 영역 모두 표시
          debugLog('🎯🎯🎯 SlotDropZonesSimple - 투명 슬롯 메쉬 경계:', {
            메인영역: {
              시작X_mm: zoneSlotInfo.normal.startX,
              너비_mm: zoneSlotInfo.normal.width,
              끝X_mm: zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width,
              시작X_three: mmToThreeUnits(zoneSlotInfo.normal.startX),
              끝X_three: mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width),
              중심X_three: (mmToThreeUnits(zoneSlotInfo.normal.startX) + mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width)) / 2,
              너비_three: mmToThreeUnits(zoneSlotInfo.normal.width)
            }
          });

          return (
            <>
              {/* 메인 영역 표시 */}
              <group key="main-zone-group">
                {/* 바닥 슬롯 메쉬 */}
                <mesh
                  position={[
                    mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width / 2),
                    floorY,
                    slotFloorZ
                  ]}
                  onClick={handleSlotFloorClick}
                >
                  <boxGeometry args={[
                    mmToThreeUnits(zoneSlotInfo.normal.width),
                    viewMode === '2D' ? 0.1 : 0.001,
                    slotFloorDepth
                  ]} />
                  <meshBasicMaterial
                    color={primaryColor}
                    transparent
                    opacity={0.35}
                  />
                </mesh>
                {/* 천장 슬롯 메쉬 - 바닥과 동일한 깊이, 2D 모드에서는 숨김 */}
                {viewMode !== '2D' && (
                  <mesh
                    position={[
                      mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width / 2),
                      ceilingY,
                      slotFloorZ
                    ]}
                  >
                    <boxGeometry args={[
                      mmToThreeUnits(zoneSlotInfo.normal.width),
                      viewMode === '2D' ? 0.1 : 0.001,
                      slotFloorDepth
                    ]} />
                    <meshBasicMaterial
                      color={primaryColor}
                      transparent
                      opacity={0.35}
                    />
                  </mesh>
                )}
                {/* 메인 영역 외곽선 */}
                <lineSegments
                  position={[
                    mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width / 2),
                    floorY,
                    slotFloorZ
                  ]}
                >
                  <edgesGeometry args={[new THREE.BoxGeometry(
                    mmToThreeUnits(zoneSlotInfo.normal.width),
                    viewMode === '2D' ? 0.1 : 0.001,
                    slotFloorDepth
                  )]} />
                  <lineBasicMaterial color={primaryColor} opacity={0.8} transparent />
                </lineSegments>
              </group>
              {/* 단내림 영역 표시 */}
              <group key="dropped-zone-group">
                {/* 바닥 슬롯 메쉬 */}
                <mesh
                  position={[
                    mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width / 2),
                    floorY,
                    slotFloorZ
                  ]}
                  onClick={handleSlotFloorClick}
                >
                  <boxGeometry args={[
                    mmToThreeUnits(zoneSlotInfo.dropped.width),
                    viewMode === '2D' ? 0.1 : 0.001,
                    slotFloorDepth
                  ]} />
                  <meshBasicMaterial
                    color={primaryColor}
                    transparent
                    opacity={0.35}
                  />
                </mesh>
                {/* 천장 슬롯 메쉬 - 단내림 구간은 높이가 다름, 2D 모드에서는 숨김 */}
                {viewMode !== '2D' && (
                  <mesh
                    position={[
                      mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width / 2),
                      mmToThreeUnits(spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 0) - (spaceInfo.frameSize?.top || 0)),
                      slotFloorZ
                    ]}
                  >
                    <boxGeometry args={[
                      mmToThreeUnits(zoneSlotInfo.dropped.width),
                      viewMode === '2D' ? 0.1 : 0.001,
                      slotFloorDepth
                    ]} />
                    <meshBasicMaterial
                      color={primaryColor}
                      transparent
                      opacity={0.35}
                    />
                  </mesh>
                )}
                {/* 단내림 영역 외곽선 */}
                <lineSegments
                  position={[
                    mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width / 2),
                    floorY,
                    slotFloorZ
                  ]}
                >
                  <edgesGeometry args={[new THREE.BoxGeometry(
                    mmToThreeUnits(zoneSlotInfo.dropped.width),
                    viewMode === '2D' ? 0.1 : 0.001,
                    slotFloorDepth
                  )]} />
                  <lineBasicMaterial color={primaryColor} opacity={0.8} transparent />
                </lineSegments>
              </group>
            </>
          );
        } else {
          // 단내림이 없는 경우 전체 영역 표시 - zoneSlotInfo 사용
          const startX = mmToThreeUnits(zoneSlotInfo.normal.startX);
          const endX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
          const centerX = (startX + endX) / 2;
          const width = endX - startX;

          debugLog('🎯🎯🎯 SlotDropZonesSimple - 단내림 없는 경우 투명 슬롯 메쉬 경계:', {
            'zoneSlotInfo.normal.startX': zoneSlotInfo.normal.startX,
            'zoneSlotInfo.normal.width': zoneSlotInfo.normal.width,
            'startX_three': startX,
            'endX_three': endX,
            'centerX_three': centerX,
            'width_three': width
          });

          return (
            <group key="full-zone-group">
              {/* 바닥 슬롯 메쉬 */}
              <mesh
                position={[centerX, floorY, slotFloorZ]}
                onClick={handleSlotFloorClick}
              >
                <boxGeometry args={[width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth]} />
                <meshBasicMaterial
                  color={primaryColor}
                  transparent
                  opacity={0.35}
                />
              </mesh>
              {/* 천장 슬롯 메쉬 - 2D 모드에서는 숨김 */}
              {debugLog('🎯 천장 메시 렌더링 조건:', { viewMode, shouldRender: viewMode !== '2D' })}
              {viewMode !== '2D' && (
                <mesh
                  position={[centerX, ceilingY, slotFloorZ]}
                >
                  <boxGeometry args={[width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth]} />
                  <meshBasicMaterial
                    color={primaryColor}
                    transparent
                    opacity={0.35}
                  />
                </mesh>
              )}
              <lineSegments
                position={[centerX, floorY, slotFloorZ]}
              >
                <edgesGeometry args={[new THREE.BoxGeometry(width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth)]} />
                <lineBasicMaterial color={primaryColor} opacity={0.8} transparent />
              </lineSegments>
            </group>
          );
        }

        return null;
      })()}

      {/* 가구 미리보기 */}
      {debugLog('👻 [Ghost] Rendering conditions:', {
        hoveredSlotIndex,
        hasCurrentDragData: !!currentDragData,
        hasSelectedFurnitureId: !!selectedFurnitureId,
        zoneSlotPositionsLength: zoneSlotPositions.length
      })}
      {(currentDragData || selectedFurnitureId) && zoneSlotPositions.map((slotData, slotIndex) => {
        // slotData가 객체인지 숫자인지 확인하여 위치 추출
        const isZoneData = typeof slotData === 'object' && slotData !== null;
        const slotX = isZoneData ? slotData.position : slotData;
        // 단내림이 없는 경우 slotZone을 'normal'로 설정
        const slotZone = isZoneData ? slotData.zone : 'normal';
        const slotLocalIndex = isZoneData ? slotData.index : slotIndex;

        // 현재 활성 모듈 가져오기 (드래그 중이거나 선택된 모듈)
        let activeModuleData = currentDragData;

// console.log('🔍 [Ghost] activeModuleData 생성 전:', {
          // hasCurrentDragData: !!currentDragData,
          // selectedFurnitureId,
          // hoveredSlotIndex,
          // slotIndex
        // });

        // selectedFurnitureId가 있고 currentDragData가 없으면 selectedFurnitureId로부터 데이터 생성
        if (!activeModuleData && selectedFurnitureId) {
          const moduleData = getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
// console.log('🔍 [Ghost] moduleData 조회 결과:', {
            // selectedFurnitureId,
            // foundModuleData: !!moduleData,
            // moduleDataId: moduleData?.id
          // });
          if (moduleData) {
            activeModuleData = {
              type: 'furniture',
              moduleData: {
                id: moduleData.id,
                name: moduleData.name,
                dimensions: moduleData.dimensions,
                type: moduleData.type || 'default',
                category: moduleData.category,
                color: moduleData.color
              }
            };
          }
        }

        // 현재 드래그 중인 가구가 듀얼인지 확인
        let isDual = false;
        if (activeModuleData) {
          // 듀얼 여부: dual- prefix, isDualSlot 플래그, 또는 너비가 칸 너비의 1.5배 초과
          isDual = activeModuleData.moduleData.id.startsWith('dual-')
            || activeModuleData.isDualSlot === true
            || (activeModuleData.moduleData.dimensions.width > indexing.columnWidth * 1.5);

// console.log('🔍 [Ghost] activeModuleData 있음, 듀얼 체크:', {
            // moduleId: activeModuleData.moduleData.id,
            // isDual,
            // selectedFurnitureId,
            // hoveredSlotIndex
          // });
        }

        // 해당 슬롯에 이미 배치된 모듈 찾기 (띄움 높이를 재사용하기 위해)
        const localSlotIndexForOccupancy = slotLocalIndex ?? slotIndex;
        const occupantModule = placedModules.find(m =>
          m.slotIndex === localSlotIndexForOccupancy &&
          m.zone === slotZone
        );

        // 배치된 모듈의 띄움 높이 가져오기
        const floatOffsetFromOccupant = occupantModule?.lowerSectionTopOffset;

        // 고스트 렌더링 여부 결정
        let shouldRenderGhost = false;
        if (activeModuleData) {
// console.log('🔍 [Ghost] shouldRenderGhost 결정 시작:', {
            // hasCurrentDragData: !!currentDragData,
            // selectedFurnitureId,
            // hoveredSlotIndex,
            // slotIndex
          // });
          const compareIndex = isZoneData ? slotLocalIndex : slotIndex;

          // 클릭 모드: selectedFurnitureId가 있으면 클릭 모드 (섬네일 클릭)
          if (selectedFurnitureId) {
            const moduleIdForCheck = selectedFurnitureId || currentDragData?.moduleData?.id || activeModuleData?.moduleData?.id || '';

// console.log('🟢🟢🟢 [Click Mode] 클릭 모드 진입:', {
              // selectedFurnitureId,
              // currentDragDataId: currentDragData?.moduleData?.id,
              // activeModuleDataId: activeModuleData?.moduleData?.id,
              // moduleIdForCheck,
              // hoveredSlotIndex,
              // slotIndex: compareIndex,
              // slotZone
            // });

            if (!moduleIdForCheck) {
              console.error('❌ [Click Mode] moduleId가 없습니다!');
              shouldRenderGhost = false;
            } else {
              // 듀얼 가구일 때 겹치지 않도록 짝수 슬롯(0,2,4,...)에만 고스트 표시
              if (isDual && compareIndex % 2 !== 0) {
// console.log('🚫 [Click Mode] 듀얼 가구 홀수 슬롯 제외:', { slotIndex: compareIndex });
                shouldRenderGhost = false;
              } else {
                // isSlotAvailable 함수로 슬롯 사용 가능 여부 확인
                const available = isSlotAvailable(
                  compareIndex,
                  isDual,
                  placedModules,
                  spaceInfo,
                  moduleIdForCheck,
                  undefined, // excludeModuleId
                  slotZone // targetZone
                );

// console.log('👻 [Click Mode] 슬롯 점유 체크:', {
                  // slotIndex: compareIndex,
                  // slotZone,
                  // isDual,
                  // available,
                  // moduleIdForCheck
                // });

                shouldRenderGhost = available;
              }
            }
          }
          // 드래그 모드: currentDragData만 있고 selectedFurnitureId가 없으면 드래그 중
          else if (currentDragData && !selectedFurnitureId) {
            const zoneMatches = hoveredZone ? (hoveredZone === slotZone) : true;
            const isHoveredSlot = compareIndex === hoveredSlotIndex && zoneMatches;

            if (isHoveredSlot) {
              // hover 중인 슬롯이면 사용 가능 여부 확인
              const available = isSlotAvailable(
                compareIndex,
                isDual,
                placedModules,
                spaceInfo,
                selectedFurnitureId || (currentDragData?.moduleData.id || ''),
                undefined, // excludeModuleId
                slotZone // targetZone
              );
              shouldRenderGhost = available;
            } else {
              shouldRenderGhost = false;
            }
          }

          debugLog('🔥 고스트 렌더링 체크:', {
            mode: currentDragData ? 'drag' : selectedFurnitureId ? 'click' : 'none',
            hoveredSlotIndex,
            hoveredZone,
            slotIndex,
            slotLocalIndex,
            slotZone,
            compareIndex,
            shouldRenderGhost,
            isDual
          });
        }

        if (!shouldRenderGhost || !activeModuleData) return null;

        // 활성 가구의 모듈 데이터 가져오기
        let moduleData;
        let targetModuleId = activeModuleData.moduleData.id; // 기본값 설정

        // 단내림이 활성화된 경우 영역별 모듈 생성
        let zoneInternalSpace = null; // 미리보기에서 사용할 변수 선언
        // slotZone 정보로 영역 판단
        const effectiveZone = slotZone;

        debugLog('🔥 고스트 생성 디버그:', {
          slotIndex,
          slotLocalIndex,
          hoveredSlotIndex,
          hoveredZone,
          slotZone,
          effectiveZone,
          shouldRenderGhost,
          hasDroppedCeiling,
          hasZoneSlotInfo: !!zoneSlotInfo
        });

        if (hasDroppedCeiling && effectiveZone && zoneSlotInfo) {
          // 단내림 영역별 외경 너비 계산 (프레임 포함)
          const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);
          let zoneSpaceInfo;

          if (effectiveZone === 'dropped') {
            // 단내림 영역용 spaceInfo - 높이는 동일 (천장만 낮아짐)
            zoneSpaceInfo = {
              ...spaceInfo,
              width: droppedCeilingWidth,  // 단내림 영역의 외경 너비
              height: spaceInfo.height,  // 단내림 영역의 높이는 전체 높이와 동일
              zone: 'dropped' as const
            };
            debugLog('🔧 [Ghost Preview] 단내림 영역 zoneSpaceInfo 생성:', {
              zone: 'dropped',
              width: droppedCeilingWidth,
              height: spaceInfo.height,
              droppedCeilingEnabled: zoneSpaceInfo.droppedCeiling?.enabled
            });
          } else {
            // 메인 영역용 spaceInfo
            zoneSpaceInfo = {
              ...spaceInfo,
              width: spaceInfo.width - droppedCeilingWidth,  // 메인 영역의 외경 너비
              zone: 'normal' as const
            };
            debugLog('🔧 [Ghost Preview] 메인 영역 zoneSpaceInfo 생성:', {
              zone: 'normal',
              width: spaceInfo.width - droppedCeilingWidth,
              droppedCeilingEnabled: zoneSpaceInfo.droppedCeiling?.enabled
            });
          }

          zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);

          debugLog('🎯 [Ghost Preview] Zone 내부 공간 계산:', {
            effectiveZone,
            zoneSpaceInfo: {
              width: zoneSpaceInfo.width,
              height: zoneSpaceInfo.height,
              zone: (zoneSpaceInfo as any).zone
            },
            zoneInternalSpace,
            originalHeight: spaceInfo.height,
            droppedCeilingDropHeight: spaceInfo.droppedCeiling?.dropHeight
          });

          // 슬롯 너비에 기반한 모듈 ID 생성 (소수점 포함)
          const baseType = activeModuleData.moduleData.id.replace(/-[\d.]+$/, '');
          const targetZone = effectiveZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped
            : zoneSlotInfo.normal;

          let targetWidth;
          // 로컬 인덱스 사용 (hoveredSlotIndex는 이미 로컬 인덱스)
          const localIndex = slotLocalIndex;

          // 기둥 정보 확인 (단내림 구간에서도 기둥 조정 필요)
          const columnSlots = analyzeColumnSlots(spaceInfo);

          if (isDual && localIndex < targetZone.columnCount - 1) {
            // 듀얼 가구: 두 슬롯의 너비 합
            const slot1Info = columnSlots[localIndex];
            const slot2Info = columnSlots[localIndex + 1];

            // 각 슬롯의 adjustedWidth 또는 기본 너비 사용
            const slot1Width = (slot1Info?.hasColumn && slot1Info.adjustedWidth)
              ? slot1Info.adjustedWidth
              : (targetZone.slotWidths?.[localIndex] || targetZone.columnWidth);
            const slot2Width = (slot2Info?.hasColumn && slot2Info.adjustedWidth)
              ? slot2Info.adjustedWidth
              : (targetZone.slotWidths?.[localIndex + 1] || targetZone.columnWidth);

            targetWidth = slot1Width + slot2Width;

            if ((slot1Info?.hasColumn && slot1Info.adjustedWidth) || (slot2Info?.hasColumn && slot2Info.adjustedWidth)) {
// console.log(`🏗️ [Ghost Preview 단내림] 듀얼 가구 기둥 조정:`, {
                // 슬롯1: { 인덱스: localIndex, 원본: targetZone.slotWidths?.[localIndex], 조정: slot1Width, 기둥: slot1Info?.hasColumn },
                // 슬롯2: { 인덱스: localIndex + 1, 원본: targetZone.slotWidths?.[localIndex + 1], 조정: slot2Width, 기둥: slot2Info?.hasColumn },
                // 총너비: targetWidth
              // });
            }
          } else {
            // 싱글 가구: 해당 슬롯의 너비
            const slotInfo = columnSlots[localIndex];

            // adjustedWidth가 있으면 우선 사용
            if (slotInfo?.hasColumn && slotInfo.adjustedWidth) {
              targetWidth = slotInfo.adjustedWidth;
// console.log(`🏗️ [Ghost Preview 단내림] 싱글 가구 기둥 조정:`, {
                // 슬롯인덱스: localIndex,
                // 원본: targetZone.slotWidths?.[localIndex] || targetZone.columnWidth,
                // 조정: targetWidth,
                // 기둥너비: slotInfo.column?.width
              // });
            } else {
              targetWidth = targetZone.slotWidths?.[localIndex] || targetZone.columnWidth;
            }
          }

          targetModuleId = `${baseType}-${targetWidth}`;
          debugLog('🎯 [Ghost Preview] 모듈 ID 생성:', {
            baseType,
            targetWidth,
            targetModuleId,
            originalId: activeModuleData.moduleData.id,
            effectiveZone,
            localIndex
          });

          moduleData = getModuleById(targetModuleId, zoneInternalSpace, zoneSpaceInfo);

          debugLog('🔍 [Ghost Preview] 단내림 구간 미리보기 모듈 조회:', {
            effectiveZone,
            baseType,
            targetWidth,
            targetModuleId,
            moduleFound: !!moduleData,
            moduleHeight: moduleData?.dimensions.height,
            hoveredSlotIndex,
            localIndex,
            slotLocalIndex,
            targetZone: {
              columnCount: targetZone.columnCount,
              columnWidth: targetZone.columnWidth,
              slotWidths: targetZone.slotWidths
            },
            zoneSpaceInfo: {
              width: zoneSpaceInfo.width,
              height: zoneSpaceInfo.height,
              zone: zoneSpaceInfo.zone
            },
            zoneInternalSpace: {
              width: zoneInternalSpace.width,
              height: zoneInternalSpace.height,
              depth: zoneInternalSpace.depth
            },
            originalSpaceHeight: spaceInfo.height,
            droppedCeilingDropHeight: spaceInfo.droppedCeiling?.dropHeight
          });
        } else {
          // 단내림이 없는 경우에도 슬롯별 너비를 고려한 모듈 ID 생성
          const baseType = activeModuleData.moduleData.id.replace(/-[\d.]+$/, '');
          let targetWidth;

          // 기둥 정보 확인
          const columnSlots = analyzeColumnSlots(spaceInfo);
          const targetSlotInfo = columnSlots[hoveredSlotIndex];

          if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.adjustedWidth) {
            // 기둥이 있는 슬롯의 경우 adjustedWidth 사용
            targetWidth = targetSlotInfo.adjustedWidth;
// console.log(`🏗️ [Ghost Preview] 기둥 슬롯 ${hoveredSlotIndex} 고스트 너비 조정:`, {
              // 원본슬롯너비: indexing.columnWidth,
              // 기둥너비: targetSlotInfo.column?.width,
              // 조정된너비: targetWidth
            // });
          } else if (isDual && hoveredSlotIndex < indexing.columnCount - 1) {
            // 듀얼 가구: 두 슬롯의 너비 합
            targetWidth = indexing.columnWidth * 2;
          } else {
            // 싱글 가구: 해당 슬롯의 너비
            targetWidth = indexing.columnWidth;
          }

          const targetModuleId = `${baseType}-${targetWidth}`;
          debugLog('🎯 [Ghost Preview] 일반 구간 모듈 ID 생성:', {
            baseType,
            targetWidth,
            targetModuleId,
            originalId: activeModuleData.moduleData.id,
            hasColumn: targetSlotInfo?.hasColumn,
            columnWidth: targetSlotInfo?.column?.width
          });

          moduleData = getModuleById(targetModuleId, internalSpace, spaceInfo);

          // 못 찾으면 원래 ID로 다시 시도
          if (!moduleData) {
            moduleData = getModuleById(activeModuleData.moduleData.id, internalSpace, spaceInfo);
          }
          // 모듈 데이터가 없으면 원래 모듈 데이터 사용
          if (!moduleData) {
            // activeModuleData.moduleData를 사용하되, ID는 targetModuleId로 설정된 새 객체 생성
            moduleData = {
              ...activeModuleData.moduleData,
              id: targetModuleId,
              dimensions: {
                ...activeModuleData.moduleData.dimensions,
                width: targetWidth
              }
            };
          }
        }

        // 미리보기 위치 계산 - 실제 배치와 동일한 로직 사용
        let previewX = slotX;

// console.log('👻 [Ghost Preview] Rendering module:', {
          // slotIndex,
          // moduleId: moduleData.id,
          // originalId: activeModuleData.moduleData.id,
          // dimensions: moduleData.dimensions
        // });

        if (hasDroppedCeiling && effectiveZone && zoneSlotInfo) {
          // 단내림 구간
          const zoneInfo = effectiveZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped
            : zoneSlotInfo.normal;

          const startX = mmToThreeUnits(zoneInfo.startX);
          const columnWidth = mmToThreeUnits(zoneInfo.columnWidth);

          // 로컬 인덱스 사용
          const localIdx = slotLocalIndex;

          if (isDual && localIdx < zoneInfo.columnCount - 1) {
            // 듀얼 가구
            let leftSlotX, rightSlotX;

            // 마지막-1 슬롯이 듀얼인 경우 마지막 슬롯의 실제 너비 고려
            if (localIdx === zoneInfo.columnCount - 2) {
              leftSlotX = startX + (localIdx * columnWidth) + (columnWidth / 2);
              const lastSlotStart = startX + ((localIdx + 1) * columnWidth);
              const lastSlotEnd = startX + mmToThreeUnits(zoneInfo.width);
              rightSlotX = (lastSlotStart + lastSlotEnd) / 2;
            } else {
              leftSlotX = startX + (localIdx * columnWidth) + (columnWidth / 2);
              rightSlotX = startX + ((localIdx + 1) * columnWidth) + (columnWidth / 2);
            }
            previewX = (leftSlotX + rightSlotX) / 2;
          } else {
            // 싱글 가구
            if (localIdx === zoneInfo.columnCount - 1) {
              // 마지막 슬롯: 실제 남은 공간의 중앙
              const lastSlotStart = startX + (localIdx * columnWidth);
              const lastSlotEnd = startX + mmToThreeUnits(zoneInfo.width);
              previewX = (lastSlotStart + lastSlotEnd) / 2;
            } else {
              previewX = startX + (localIdx * columnWidth) + (columnWidth / 2);
            }
          }
        } else {
          // 단내림이 없는 일반 구간
          if (isDual) {
            // 듀얼 가구 - indexing의 threeUnitDualPositions 사용
            // 드래그 모드와 클릭 모드 모두 지원
            if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
              previewX = indexing.threeUnitDualPositions[slotIndex];
            } else {
              // threeUnitDualPositions가 없으면 두 슬롯의 중심 계산
              const slot1X = indexing.threeUnitPositions[slotIndex];
              const slot2X = indexing.threeUnitPositions[slotIndex + 1];
              if (slot1X !== undefined && slot2X !== undefined) {
                previewX = (slot1X + slot2X) / 2;
              }
            }
          } else {
            // 싱글 가구는 이미 slotX에 올바른 위치가 설정되어 있음
            previewX = slotX;
          }

          debugLog('🎯 [Normal Ghost] 일반 구간 고스트 위치:', {
            isDual,
            slotIndex,
            hoveredSlotIndex,
            previewX,
            slotX,
            threeUnitDualPositions: indexing.threeUnitDualPositions,
            dualPosition: indexing.threeUnitDualPositions?.[slotIndex]
          });
        }

        let customDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);

        // 카테고리 체크
        const isUpperCabinet = moduleData?.category === 'upper';
        const isLowerCabinet = moduleData?.category === 'lower';
        const isFullCabinet = moduleData?.category === 'full';

        // 단내림 구간의 경우 높이 조정 - 실제 배치 로직과 동일하게
        let adjustedFurnitureHeightMm = moduleData.dimensions.height;
        if (effectiveZone === 'dropped' && isFullCabinet && spaceInfo.droppedCeiling?.enabled) {
          // 키큰장인 경우 단내림 구간에서 높이 조정
          const dropHeight = spaceInfo.droppedCeiling?.dropHeight || 200;
          const maxHeight = spaceInfo.height - dropHeight;
          adjustedFurnitureHeightMm = Math.min(adjustedFurnitureHeightMm, maxHeight - 100); // 여유 공간 100mm
          debugLog('👻 [Ghost Preview] 단내림 구간 키큰장 높이 조정:', {
            원래높이: moduleData.dimensions.height,
            조정된높이: adjustedFurnitureHeightMm,
            dropHeight,
            maxHeight
          });
        }

        // 띄움 높이 계산 - 배치된 모듈에서 가져오거나 spaceInfo에서 가져옴
        const baseFloatOffsetMm = spaceInfo.baseConfig?.placementType === 'float'
          ? spaceInfo.baseConfig?.floatHeight || 0
          : undefined;
        const effectiveFloatOffsetMm = floatOffsetFromOccupant !== undefined
          ? floatOffsetFromOccupant
          : baseFloatOffsetMm;

        // 가구 Y 위치 계산 - 실제 배치 로직과 동일하게
        let furnitureY: number;

        if (isFullCabinet) {
          // 키큰장: 바닥부터 시작
          const floorY = mmToThreeUnits(zoneInternalSpace?.startY || internalSpace.startY);
          const furnitureHeight = mmToThreeUnits(adjustedFurnitureHeightMm);
          const floatOffset = effectiveFloatOffsetMm !== undefined ? mmToThreeUnits(effectiveFloatOffsetMm) : 0;

          // 키큰장은 바닥에서 시작 (띄움 높이 적용)
          furnitureY = floorY + floatOffset + furnitureHeight / 2;

          debugLog('👻 [Ghost Preview] 키큰장 Y 위치:', {
            floorY,
            furnitureHeightMm: adjustedFurnitureHeightMm,
            furnitureHeight,
            furnitureY,
            category: moduleData.category,
            설명: '키큰장은 바닥부터 시작'
          });
        } else if (isUpperCabinet) {
          // 상부장: 전체 공간 최상단에 배치 (실제 배치 로직과 동일)
          const furnitureHeightMm = adjustedFurnitureHeightMm;

          // 바닥 마감재 및 베이스 높이 계산
          const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
          let baseHeightMm = floorFinishHeightMm;

          if (spaceInfo.baseConfig?.type === 'floor') {
            baseHeightMm += spaceInfo.baseConfig?.height || 65;
          } else if (spaceInfo.baseConfig?.placementType === 'float') {
            baseHeightMm += spaceInfo.baseConfig?.floatHeight || 0;
          }

          // 전체 높이에서 상단 프레임과 하부 높이를 빼기
          // 단내림 구간이면 단내림 높이 사용
          let totalHeightMm = spaceInfo.height;
          if (effectiveZone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
            const dropHeight = spaceInfo.droppedCeiling?.dropHeight || 200;
            totalHeightMm = spaceInfo.height - dropHeight;
          }
          const topFrameHeight = spaceInfo.topFrame?.height || 10;
          totalHeightMm = totalHeightMm - topFrameHeight - baseHeightMm;

          // 상부장 Y 위치 계산 (mm 단위로 계산 후 Three.js 단위로 변환)
          furnitureY = mmToThreeUnits(baseHeightMm + totalHeightMm - furnitureHeightMm / 2);

          debugLog('👻 [Ghost Preview] 상부장 Y 위치:', {
            effectiveZone,
            isDroppedZone: effectiveZone === 'dropped',
            totalHeightMm,
            topFrameHeight,
            baseHeightMm,
            floorFinishHeightMm,
            furnitureHeightMm,
            furnitureY,
            furnitureY_mm: baseHeightMm + totalHeightMm - furnitureHeightMm / 2,
            category: moduleData.category,
            설명: '상부장은 띄움 배치 고려하여 배치'
          });
        } else if (isLowerCabinet) {
          // 하부장: 바닥에서 시작 (실제 배치 로직과 동일)
          const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
          let startHeightMm = floorFinishHeightMm;

          if (effectiveFloatOffsetMm !== undefined) {
            startHeightMm += effectiveFloatOffsetMm;
          } else if (spaceInfo.baseConfig?.type === 'floor') {
            startHeightMm += spaceInfo.baseConfig?.height || 65;
          } else if (spaceInfo.baseConfig?.type !== 'stand') {
            startHeightMm += spaceInfo.baseConfig?.height || 65;
          }

          const furnitureHeightMm = adjustedFurnitureHeightMm;
          furnitureY = mmToThreeUnits(startHeightMm + furnitureHeightMm / 2);

          debugLog('👻 [Ghost Preview] 하부장 Y 위치:', {
            floorFinishHeightMm,
            startHeightMm,
            furnitureHeightMm,
            furnitureY,
            furnitureY_mm: startHeightMm + furnitureHeightMm / 2,
            category: moduleData.category,
            설명: '하부장은 바닥에서 시작'
          });
        } else {
          // 기본 가구: 바닥에서 시작
          const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
          let startHeightMm = floorFinishHeightMm;

          if (effectiveFloatOffsetMm !== undefined) {
            startHeightMm += effectiveFloatOffsetMm;
          } else if (spaceInfo.baseConfig?.type === 'floor') {
            startHeightMm += spaceInfo.baseConfig?.height || 65;
          }

          const furnitureHeightMm = adjustedFurnitureHeightMm;
          furnitureY = mmToThreeUnits(startHeightMm + furnitureHeightMm / 2);

          debugLog('👻 [Ghost Preview] 기본 가구 Y 위치:', {
            floorFinishHeightMm,
            startHeightMm,
            furnitureHeightMm,
            furnitureY,
            furnitureY_mm: startHeightMm + furnitureHeightMm / 2,
            category: moduleData.category,
            설명: '기본 가구는 띄움 배치 고려'
          });
        }

        // 배치된 모듈이 있고 같은 category일 때만 Y 위치를 직접 사용
        // (상부장 슬롯에 하부장 고스트가 상부장 위치로 가는 것을 방지)
        if (occupantModule && occupantModule.position && typeof occupantModule.position.y === 'number') {
          // occupant module의 category 확인 (moduleId 패턴으로 판단)
          const occupantIsUpper = occupantModule.moduleId?.includes('upper-') || false;
          const occupantIsLower = occupantModule.moduleId?.includes('lower-') || false;
          const occupantIsFull = occupantModule.moduleId?.includes('2hanging') || false;

          // 같은 category일 때만 position 재사용
          const isSameCategory =
            (isUpperCabinet && occupantIsUpper) ||
            (isLowerCabinet && occupantIsLower) ||
            (isFullCabinet && occupantIsFull);

          if (isSameCategory) {
            furnitureY = occupantModule.position.y;
            debugLog('👻 [Ghost Preview] occupant position 재사용:', {
              ghostCategory: moduleData.category,
              occupantCategory: occupantIsUpper ? 'upper' : occupantIsLower ? 'lower' : 'full',
              positionY: occupantModule.position.y
            });
          }
        }

        debugLog('👻 [Ghost Preview] 가구 높이 계산:', {
          effectiveZone,
          moduleDataHeight: moduleData.dimensions.height,
          moduleDataId: moduleData.id,
          zoneInternalSpaceHeight: zoneInternalSpace?.height,
          adjustedFurnitureHeightMm,
          furnitureY,
          slotStartY,
          expectedY: slotStartY + mmToThreeUnits(adjustedFurnitureHeightMm) / 2,
          originalSpaceHeight: spaceInfo.height,
          droppedCeilingDropHeight: spaceInfo.droppedCeiling?.dropHeight,
          isDroppedZone: effectiveZone === 'dropped'
        });

        const doorThickness = mmToThreeUnits(20);
        const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이 사용
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepthMm = Math.min(panelDepthMm, 600);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
        const previewDepth = mmToThreeUnits(customDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth / 2 - doorThickness - previewDepth / 2;

        // 기둥 정보를 고려한 커스텀 너비와 위치 계산
        let customWidth = undefined;
        let adjustedPreviewX = previewX;

        // 기둥 슬롯 정보 확인
        const columnSlots = analyzeColumnSlots(spaceInfo);
        const targetSlotInfo = columnSlots[hoveredSlotIndex];

        // 기둥이 있는 슬롯인 경우 calculateFurnitureBounds 사용 (실제 배치와 동일)
        if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.adjustedWidth) {
          // 듀얼 가구는 기둥 슬롯에 배치 불가
          if (isDual) {
// console.log('👻 [Ghost Preview] 기둥 슬롯에 듀얼 가구는 미리보기 없음');
            return null;
          }

          // 실제 배치와 동일한 방식으로 경계 계산
          const slotWidthM = indexing.columnWidth * 0.01;
          const originalSlotBounds = {
            left: previewX - slotWidthM / 2,
            right: previewX + slotWidthM / 2,
            center: previewX
          };

          // calculateFurnitureBounds로 실제 가구 경계 계산 (실제 배치와 동일)
          const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);

          // 공간이 부족한 경우 미리보기 표시 안함
          if (furnitureBounds.renderWidth < 150) {
// console.log('👻 [Ghost Preview] 기둥 슬롯 공간 부족:', furnitureBounds.renderWidth, 'mm');
            return null;
          }

          // 실제 배치와 동일하게 크기와 위치 사용
          customWidth = furnitureBounds.renderWidth;
          adjustedPreviewX = furnitureBounds.center;

// console.log(`👻 [Ghost Preview] 기둥 슬롯 ${hoveredSlotIndex} 고스트 조정 (calculateFurnitureBounds):`, {
            // 원본슬롯너비: indexing.columnWidth,
            // renderWidth: customWidth,
            // center: adjustedPreviewX,
            // 기둥너비: targetSlotInfo.column?.width,
            // furniturePosition: targetSlotInfo.furniturePosition,
            // furnitureBounds
          // });
        } else if (hasDroppedCeiling && effectiveZone && zoneSlotInfo) {
          // 단내림 구간에서 커스텀 너비 계산 (기둥 조정 포함)
          const targetZone = effectiveZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped
            : zoneSlotInfo.normal;

          // 로컬 인덱스 사용
          const localIdx = slotLocalIndex;

          if (isDual && localIdx < targetZone.columnCount - 1) {
            // 듀얼 가구: 두 슬롯의 너비 합 (기둥 조정 포함)
            const slot1Info = columnSlots[localIdx];
            const slot2Info = columnSlots[localIdx + 1];

            const slot1Width = (slot1Info?.hasColumn && slot1Info.adjustedWidth)
              ? slot1Info.adjustedWidth
              : (targetZone.slotWidths?.[localIdx] || targetZone.columnWidth);
            const slot2Width = (slot2Info?.hasColumn && slot2Info.adjustedWidth)
              ? slot2Info.adjustedWidth
              : (targetZone.slotWidths?.[localIdx + 1] || targetZone.columnWidth);

            customWidth = slot1Width + slot2Width;

            if ((slot1Info?.hasColumn && slot1Info.adjustedWidth) || (slot2Info?.hasColumn && slot2Info.adjustedWidth)) {
// console.log(`👻 [Ghost Preview 단내림] 듀얼 가구 기둥 조정:`, {
                // 슬롯1: { 인덱스: localIdx, 조정: slot1Width, 기둥: slot1Info?.hasColumn },
                // 슬롯2: { 인덱스: localIdx + 1, 조정: slot2Width, 기둥: slot2Info?.hasColumn },
                // 총너비: customWidth
              // });
            }
          } else {
            // 싱글 가구: 해당 슬롯의 너비 (기둥 조정 포함)
            const slotInfo = columnSlots[localIdx];

            if (slotInfo?.hasColumn && slotInfo.adjustedWidth) {
              customWidth = slotInfo.adjustedWidth;
// console.log(`👻 [Ghost Preview 단내림] 싱글 가구 기둥 조정:`, {
                // 슬롯인덱스: localIdx,
                // 조정된너비: customWidth,
                // 기둥너비: slotInfo.column?.width
              // });
            } else {
              customWidth = targetZone.slotWidths?.[localIdx] || targetZone.columnWidth;
            }
          }

          debugLog('👻 [Ghost Preview] 단내림 커스텀 너비:', {
            effectiveZone,
            localIdx,
            isDual,
            customWidth,
            moduleWidth: moduleData.dimensions.width,
            targetZone: {
              columnCount: targetZone.columnCount,
              columnWidth: targetZone.columnWidth,
              slotWidths: targetZone.slotWidths
            }
          });
        } else if (isDual) {
          // 일반 구간에서 듀얼 가구 커스텀 너비 계산
          customWidth = indexing.columnWidth * 2;

          debugLog('👻 [Ghost Preview] 일반 구간 듀얼 가구:', {
            columnWidth: indexing.columnWidth,
            customWidth,
            moduleWidth: moduleData.dimensions.width
          });
        }

        // 최종 위치 업데이트
        previewX = adjustedPreviewX;

        // 고스트 높이 조정 (키큰장이 아닌 경우에도 단내림 구간에서 높이 조정)
        let customHeight = undefined;
        if (effectiveZone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
          const dropHeight = spaceInfo.droppedCeiling?.dropHeight || 200;
          const maxHeight = spaceInfo.height - dropHeight;

          if (moduleData?.category === 'upper') {
            // 상부장은 높이 조정 불필요 (천장 기준)
            customHeight = undefined;
          } else if (moduleData?.category === 'full') {
            // 키큰장: 단내림 구간 높이에 맞춤
            customHeight = maxHeight - 100; // 여유 공간 100mm
          } else {
            // 하부장 및 일반 가구: 높이 유지
            customHeight = moduleData.dimensions.height;
          }

          debugLog('👻 [Ghost Preview] 커스텀 높이:', {
            effectiveZone,
            category: moduleData?.category,
            originalHeight: moduleData.dimensions.height,
            customHeight,
            dropHeight,
            maxHeight
          });
        }

        return (
          <group key={`furniture-preview-${slotIndex}-${moduleData.id}`} position={[previewX, furnitureY, furnitureZ]} onClick={handleSlotFloorClick}>
            <BoxModule
              moduleData={moduleData}
              color={theme.color}
              isDragging={true}
              hasDoor={false}
              customDepth={customDepth}
              customWidth={customWidth}
              customHeight={customHeight}
              spaceInfo={spaceInfo}
              lowerSectionTopOffset={effectiveFloatOffsetMm}
            />
          </group>
        );
      })}

      {/* 기둥 앞 공간 고스트 (기둥 C 전용) - 기둥 양옆에 가구가 배치된 후에만 표시 */}
      {(currentDragData || selectedFurnitureId) && (() => {
        // 기둥 분석
        const columnSlotsForFront = analyzeColumnSlots(spaceInfo);

        // 기둥 앞 공간이 있는 슬롯만 필터링 (Column C = depth 300mm)
        const frontSpaceSlots = columnSlotsForFront.filter(slot => {
          const hasColumn = slot.hasColumn;
          const isColumnC = slot.column?.depth === 300;
          return hasColumn && isColumnC;
        });

        if (frontSpaceSlots.length === 0) {
          return null;
        }

        // 모듈 데이터 가져오기
        const moduleIdForFront = currentDragData?.moduleData?.id || selectedFurnitureId;
        const moduleDataForFront = currentDragData?.moduleData || (moduleIdForFront ? getModuleById(moduleIdForFront) : null);

        // 싱글장만 기둥 앞 공간에 배치 가능
        const isSingleModule = moduleIdForFront?.startsWith('single-') || moduleIdForFront?.includes('-single-');
        if (!isSingleModule) {
          return null;
        }

        // 디버깅: 현재 배치된 모든 가구 정보 출력
// console.log('🔍 [Front Space Debug] 배치된 가구 목록:', {
          // totalCount: placedModules.length,
          // modules: placedModules.map(m => ({
            // id: m.id,
            // slotIndex: m.slotIndex,
            // hasColumnSlotInfo: !!m.columnSlotInfo,
            // spaceType: m.columnSlotInfo?.spaceType
          // }))
        // });

        // 기둥이 차지하는 슬롯 범위 계산 (같은 기둥 ID를 가진 모든 슬롯)
        const columnSlotIndices = frontSpaceSlots.map(s => s.slotIndex);
        const leftmostColumnSlot = Math.min(...columnSlotIndices);
        const rightmostColumnSlot = Math.max(...columnSlotIndices);

// console.log('🔍 [Front Space Debug] 기둥 범위:', {
          // columnSlotIndices,
          // leftmostColumnSlot,
          // rightmostColumnSlot
        // });

        // 기둥 양옆(기둥 외부)에 가구가 있는지 확인
        // 기둥 왼쪽 끝 바깥 슬롯에 가구가 있는지
        const leftOutsideFurniture = placedModules.find(m =>
          m.slotIndex === leftmostColumnSlot - 1 &&
          m.columnSlotInfo?.spaceType !== 'front' // front 배치 가구 제외
        );
        // 기둥 오른쪽 끝 바깥 슬롯에 가구가 있는지
        const rightOutsideFurniture = placedModules.find(m =>
          m.slotIndex === rightmostColumnSlot + 1 &&
          m.columnSlotInfo?.spaceType !== 'front' // front 배치 가구 제외
        );

        const hasBothSidesOutside = !!(leftOutsideFurniture && rightOutsideFurniture);

// console.log('🔍 [Front Space Debug] 외부 가구 체크:', {
          // leftSlotToCheck: leftmostColumnSlot - 1,
          // hasLeftOutsideFurniture: !!leftOutsideFurniture,
          // leftFurnitureInfo: leftOutsideFurniture ? { id: leftOutsideFurniture.id, slotIndex: leftOutsideFurniture.slotIndex } : null,
          // rightSlotToCheck: rightmostColumnSlot + 1,
          // hasRightOutsideFurniture: !!rightOutsideFurniture,
          // rightFurnitureInfo: rightOutsideFurniture ? { id: rightOutsideFurniture.id, slotIndex: rightOutsideFurniture.slotIndex } : null,
          // hasBothSidesOutside
        // });

        // 기둥 양옆에 가구가 없으면 빈 배열 반환
        if (!hasBothSidesOutside) {
// console.log('🔍 [Front Space Debug] 기둥 양옆 외부에 가구 없음 - 고스트 표시 안함');
          return null;
        }

        // 기둥 앞에 이미 가구가 배치된 슬롯 제외
        const availableSlots = frontSpaceSlots.filter(slotInfo => {
          const frontSpaceFurniture = placedModules.find(m =>
            m.slotIndex === slotInfo.slotIndex &&
            m.columnSlotInfo?.spaceType === 'front'
          );
          return !frontSpaceFurniture;
        });

// console.log('🔍 [Front Space Debug] availableSlots:', {
          // count: availableSlots.length,
          // slots: availableSlots.map(s => s.slotIndex)
        // });

        if (availableSlots.length === 0) {
// console.log('🔍 [Front Space Debug] 사용 가능한 슬롯 없음');
          return null;
        }

// console.log('🟢 [Front Space Ghost] 기둥 앞 공간 고스트 렌더링:', {
          // availableSlots: availableSlots.map(s => ({
            // slotIndex: s.slotIndex,
            // frontSpace: s.frontSpace
          // })),
          // moduleId: moduleIdForFront
        // });

        return availableSlots.map(slotInfo => {
          // frontSpace가 없으면 기본값 계산 (Column C 기준: 730 - 300 = 430mm)
          const columnDepth = slotInfo.column?.depth || 300;
          const STANDARD_CABINET_DEPTH = 730;
          const calculatedFrontSpaceDepth = STANDARD_CABINET_DEPTH - columnDepth;
          const calculatedFrontSpaceWidth = slotInfo.column?.width || 300;
          // fallback용 슬롯 X 위치 (indexing에서 가져오기)
          const slotCenterX = indexing.threeUnitPositions[slotInfo.slotIndex] || 0;

          const frontSpace = slotInfo.frontSpace || {
            available: true,
            width: calculatedFrontSpaceWidth,
            depth: calculatedFrontSpaceDepth,
            centerX: slotCenterX,
            centerZ: (calculatedFrontSpaceDepth / 2) * 0.01
          };

// console.log('🔍 [Front Space Render] 고스트 렌더링 데이터:', {
            // slotIndex: slotInfo.slotIndex,
            // hasFrontSpace: !!slotInfo.frontSpace,
            // frontSpaceCenterX: frontSpace.centerX,
            // frontSpaceDepth: frontSpace.depth,
            // columnDepth
          // });

          // Z축 위치 계산 - 일반 캐비닛 영역 내에서 앞쪽에 배치
          const panelDepthMm = spaceInfo.depth || 730;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepthMm = Math.min(panelDepthMm, 600);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const panelZOffset = -panelDepth / 2;
          const furnitureZOffset = panelZOffset + (panelDepth - furnitureDepth) / 2;
          // 기둥 앞 공간: 일반 가구 영역의 앞쪽에서 frontSpace.depth만큼 차지
          // 가구 영역 앞쪽 끝에서 시작하여 뒤로 frontSpace.depth/2 들어간 위치
          const frontSpaceDepthThree = mmToThreeUnits(frontSpace.depth);
          const furnitureFrontZ = furnitureZOffset + furnitureDepth / 2;
          const frontSpaceZ = furnitureFrontZ - frontSpaceDepthThree / 2;

// console.log('🔍 [Front Space Z] Z 위치 계산:', {
            // panelDepthMm,
            // furnitureDepthMm,
            // frontSpaceDepth: frontSpace.depth,
            // furnitureZOffset,
            // furnitureFrontZ,
            // frontSpaceZ
          // });

          // Y축 위치 (바닥)
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
          const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
          const furnitureHeight = mmToThreeUnits(moduleDataForFront.dimensions.height);
          const furnitureY = floorY + furnitureHeight / 2;

          // 기둥 앞 공간에 맞는 고스트 크기
          const ghostWidth = frontSpace.width;
          const ghostDepth = frontSpace.depth;

          return (
            <group
              key={`front-space-ghost-${slotInfo.slotIndex}`}
              position={[frontSpace.centerX, furnitureY, frontSpaceZ]}
            >
              <BoxModule
                moduleData={moduleDataForFront}
                color={theme.color}
                isDragging={true}
                hasDoor={false}
                customDepth={ghostDepth}
                customWidth={ghostWidth}
                spaceInfo={spaceInfo}
              />
              {/* + 아이콘 버튼 */}
              <mesh
                position={[0, 0, mmToThreeUnits(ghostDepth / 2) + 0.05]}
                onClick={(e) => {
                  e.stopPropagation();

                  // 기둥 앞 공간에 가구 배치
                  const newModuleId = `front-space-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                  // Position 계산 (Three.js 단위)
                  const positionX = frontSpace.centerX;
                  const positionY = furnitureY;
                  const positionZ = frontSpaceZ;

                  // 새 모듈 생성
                  const newModule: PlacedModule = {
                    id: newModuleId,
                    moduleId: moduleDataForFront.id,
                    position: { x: positionX, y: positionY, z: positionZ },
                    rotation: 0,
                    hasDoor: false, // 오픈형 (도어 없음)
                    customDepth: ghostDepth, // 기둥 앞 공간 깊이 (430mm)
                    customWidth: ghostWidth, // 기둥 너비
                    slotIndex: slotInfo.slotIndex,
                    isDualSlot: false,
                    isValidInCurrentSpace: true,
                    zone: spaceInfo.droppedCeiling?.enabled ? 'dropped' : 'normal',
                    columnSlotInfo: {
                      hasColumn: true,
                      columnId: slotInfo.column?.id,
                      columnPosition: slotInfo.columnPosition,
                      availableWidth: ghostWidth,
                      spaceType: 'front', // 기둥 앞 공간 배치 표시
                      moduleOrder: 2 // 양옆 가구 다음 순서
                    },
                    columnPlacementMode: 'beside' // 기둥 측면 배치 모드에서 사용
                  };

// console.log('🟢 기둥 앞 공간에 가구 배치:', {
                    // moduleId: newModule.id,
                    // slotIndex: slotInfo.slotIndex,
                    // frontSpace,
                    // position: newModule.position,
                    // customDepth: newModule.customDepth,
                    // customWidth: newModule.customWidth
                  // });

                  // 가구 추가
                  addModule(newModule);

                  // 선택 상태 초기화
                  if (currentDragData) {
                    setCurrentDragData(null);
                  }
                  setSelectedFurnitureId(null);

                  // 가구 배치 완료 이벤트 발생
                  window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
                }}
              >
                <circleGeometry args={[0.3, 32]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, 0, mmToThreeUnits(ghostDepth / 2) + 0.06]}>
                <ringGeometry args={[0.25, 0.3, 32]} />
                <meshBasicMaterial color={theme.color} />
              </mesh>
              {/* + 기호 */}
              <mesh position={[0, 0, mmToThreeUnits(ghostDepth / 2) + 0.07]}>
                <planeGeometry args={[0.2, 0.05]} />
                <meshBasicMaterial color={theme.color} />
              </mesh>
              <mesh position={[0, 0, mmToThreeUnits(ghostDepth / 2) + 0.07]}>
                <planeGeometry args={[0.05, 0.2]} />
                <meshBasicMaterial color={theme.color} />
              </mesh>
            </group>
          );
        });
      })()}
    </group>
  );
};

export default SlotDropZonesSimple;
