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

interface SlotDropZonesSimpleProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
  showDimensions?: boolean;
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZonesSimple: React.FC<SlotDropZonesSimpleProps> = ({ spaceInfo, showAll = true, showDimensions = true }) => {
  // 모든 훅을 먼저 호출
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { showAlert } = useAlert();
  
  // Three.js 컨텍스트 접근
  const { camera, scene } = useThree();
  const { viewMode } = useSpace3DView();
  const { view2DDirection } = useUIStore();
  
  // 테마 컨텍스트에서 색상 가져오기
  const { theme } = useTheme();
  
  // 마우스가 hover 중인 슬롯 인덱스와 영역 상태
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [hoveredZone, setHoveredZone] = useState<'normal' | 'dropped' | null>(null);
  
  // spaceInfo가 없으면 null 반환
  if (!spaceInfo) {
    console.error('❌ No spaceInfo provided to SlotDropZonesSimple');
    return null;
  }
  
  console.log('🔍 SlotDropZonesSimple - spaceInfo:', {
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
  
  console.log('🔍 SlotDropZonesSimple - calculated values:', {
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
    console.log('🔧 베이스프레임 및 슬롯 위치 정보:', {
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
  
  // 드롭 처리 함수
  const handleSlotDrop = useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement): boolean => {
    console.log('🎯 handleSlotDrop called:', {
      hasCurrentDragData: !!currentDragData,
      droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
      droppedCeilingWidth: spaceInfo.droppedCeiling?.width
    });
    
    // 드롭 위치에서 마우스 좌표 계산
    const rect = canvasElement.getBoundingClientRect();
    const mouseX = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((dragEvent.clientY - rect.top) / rect.height) * 2 + 1;
    
    // 단내림이 활성화되어 있는 경우, 마우스 X 위치로 영역 판단
    let zoneToUse: 'normal' | 'dropped' | undefined;
    if (spaceInfo.droppedCeiling?.enabled) {
      try {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        // zoneInfo.dropped이 null인지 확인
        if (!zoneInfo.dropped || !zoneInfo.normal) {
          console.error('❌ Zone info is null:', { dropped: zoneInfo.dropped, normal: zoneInfo.normal });
          return false;
        }
        
        // Three.js 단위로 영역 경계 계산
        const droppedEndX = mmToThreeUnits(zoneInfo.dropped.startX + zoneInfo.dropped.width);
        const normalStartX = mmToThreeUnits(zoneInfo.normal.startX);
        
        // 카메라와 레이캐스트를 사용하여 월드 좌표 계산
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
        
        // Y=0 평면과의 교차점 계산 (바닥 평면)
        const planeY = mmToThreeUnits(internalSpace.startY);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
        const intersectPoint = new THREE.Vector3();
        
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
          // 단내림 위치에 따라 영역 판단
          if (spaceInfo.droppedCeiling.position === 'left') {
            zoneToUse = intersectPoint.x < droppedEndX ? 'dropped' : 'normal';
          } else {
            zoneToUse = intersectPoint.x >= normalStartX ? 'dropped' : 'normal';
          }
          
          console.log('🎯 자동 영역 판단:', {
            mouseX,
            mouseY,
            worldX: intersectPoint.x,
            droppedEndX,
            normalStartX,
            droppedPosition: spaceInfo.droppedCeiling.position,
            detectedZone: zoneToUse,
            zoneInfo: {
              normal: { columnCount: zoneInfo.normal?.columnCount, startX: zoneInfo.normal?.startX, width: zoneInfo.normal?.width },
              dropped: { columnCount: zoneInfo.dropped?.columnCount, startX: zoneInfo.dropped?.startX, width: zoneInfo.dropped?.width }
            }
          });
        } else {
          // 교차점을 찾지 못한 경우 기본값 사용
          zoneToUse = 'normal';
          console.log('⚠️ 평면과의 교차점을 찾지 못함, 기본값 사용:', zoneToUse);
        }
      } catch (error) {
        console.error('❌ 자동 영역 판단 중 오류:', error);
        zoneToUse = 'normal'; // 오류 발생 시 기본값
      }
    }
    
    // 클릭-앤-플레이스 모드와 드래그 모드 모두 지원
    const activeModuleData = currentDragData;
    
    if (!activeModuleData) {
      console.log('❌ No currentDragData available');
      return false;
    }
    
    // HTML5 드래그 데이터 가져오기
    let dragData;
    try {
      const dragDataString = dragEvent.dataTransfer?.getData('application/json');
      console.log('📋 Drag data string:', dragDataString);
      
      if (!dragDataString) {
        console.log('❌ No drag data string from dataTransfer');
        // Fallback to activeModuleData (currentDragData)
        dragData = activeModuleData;
      } else {
        dragData = JSON.parse(dragDataString);
      }
      
      console.log('📦 Parsed drag data:', dragData);
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
      
      // 활성 영역에 맞는 인덱싱 생성
      let zoneIndexing;
      let zoneInternalSpace;
      
      if (zoneToUse === 'dropped' && zoneInfo.dropped) {
        // 단내림 영역용 spaceInfo 생성 - 외경 너비 사용
        const droppedOuterWidth = spaceInfo.droppedCeiling?.width || 900;
        const droppedSpaceInfo = {
          ...spaceInfo,
          width: droppedOuterWidth,  // 외경 너비 사용
          customColumnCount: zoneInfo.dropped.columnCount,
          columnMode: 'custom' as const,
          zone: 'dropped' as const  // zone 정보 추가
        };
        // calculateInternalSpace를 사용하여 정확한 내경 계산
        zoneInternalSpace = calculateInternalSpace(droppedSpaceInfo);
        // 단내림 구간은 높이가 낮음 - dropHeight만큼 차감
        const dropHeight = spaceInfo.droppedCeiling?.dropHeight || 200;
        zoneInternalSpace.height = Math.max(zoneInternalSpace.height - dropHeight, 100); // 최소 100mm 보장
        
        console.log('🔧 [SlotDropZonesSimple] 단내림 영역 내경 계산:', {
          originalHeight: zoneInternalSpace.height + dropHeight,
          dropHeight,
          adjustedHeight: zoneInternalSpace.height,
          zone: 'dropped'
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
        const normalOuterWidth = spaceInfo.width - (spaceInfo.droppedCeiling?.width || 900);
        const normalSpaceInfo = {
          ...spaceInfo,
          width: normalOuterWidth,  // 외경 너비 사용
          customColumnCount: zoneInfo.normal.columnCount,
          columnMode: 'custom' as const,
          zone: 'normal' as const  // zone 정보 추가
        };
        // calculateInternalSpace를 사용하여 정확한 내경 계산
        zoneInternalSpace = calculateInternalSpace(normalSpaceInfo);
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
        spaceInfo  // 원본 spaceInfo 사용
      );
      
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
        console.log('🔍 Colliders with matching slotIndex:', {
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
            console.log('🎯 Detected collider zone:', {
              colliderZone,
              mouseX: intersectPoint.x,
              colliderX: closestCollider.position.x,
              distance: minDistance
            });
          }
        }
      }
      
      console.log('🎰 Slot index from raycast (dropped zone):', {
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
      
      // zone 불일치 검사
      if (colliderZone && zoneToUse !== colliderZone) {
        console.warn('⚠️ Zone mismatch detected!', {
          detectedZone: zoneToUse,
          colliderZone: colliderZone,
          slotIndex
        });
        // 콜라이더의 zone을 신뢰
        zoneToUse = colliderZone;
        console.log('🔧 Corrected zone to match collider:', zoneToUse);
      }
      
      if (slotIndex === null) {
        console.log('❌ No slot index found (dropped zone)');
        
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
              
              console.log('🔧 Fallback slot index calculation:', {
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
      
      // 레이캐스트로 받은 슬롯 인덱스는 이미 영역별로 생성된 콜라이더의 로컬 인덱스
      // 즉, 각 영역에서 0부터 시작하는 인덱스
      const zoneSlotIndex = slotIndex;
      
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
      if (targetZoneInfo && slotIndex >= targetZoneInfo.columnCount) {
        console.error('❌ Invalid slot index for zone:', { 
          zone: zoneToUse, 
          slotIndex, 
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
        
        console.log('🔍 Re-checking colliders for debugging:', {
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
        console.log('🔧 Temporarily correcting slot index:', slotIndex, '->', correctedIndex);
        slotIndex = correctedIndex;
      }
      
      // 슬롯 인덱스가 0 이상인지 확인
      if (slotIndex < 0) {
        console.error('❌ Invalid negative slot index:', slotIndex);
        slotIndex = 0;
      }
      
      // 영역별 spaceInfo 생성 (가구 크기 계산용)
      // 단내림 영역별 외경 너비 계산 (프레임 포함)
      const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;
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
      
      console.log('🔧 [SlotDropZonesSimple] zoneSpaceInfo 생성:', {
        zone: zoneToUse,
        droppedCeilingEnabled: zoneSpaceInfo.droppedCeiling?.enabled,
        zoneSpaceInfo: {
          width: zoneSpaceInfo.width,
          zone: zoneSpaceInfo.zone,
          droppedCeiling: zoneSpaceInfo.droppedCeiling
        }
      });
      
      // 영역별 내경 공간 재계산
      const recalculatedZoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
      if (zoneToUse === 'dropped') {
        // 단내림 영역은 높이 조정
        const dropHeight = spaceInfo.droppedCeiling?.dropHeight || 200;
        recalculatedZoneInternalSpace.height = Math.max(recalculatedZoneInternalSpace.height - dropHeight, 100);
      }
      
      console.log('🔧 [SlotDropZonesSimple] 영역별 내경 공간 재계산:', {
        zone: zoneToUse,
        originalInternalSpace: zoneInternalSpace,
        recalculatedInternalSpace: recalculatedZoneInternalSpace
      });
      
      // 영역별 모듈 목록 생성
      const zoneModules = generateDynamicModules(recalculatedZoneInternalSpace, zoneSpaceInfo);
      
      console.log('🎯 단내림 구간 모듈 생성 결과:', {
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
      // 원본 ID에서 타입 부분만 추출 (너비 정보 제거)
      const moduleBaseType = dragData.moduleData.id.replace(/-\d+$/, '');
      
      // 듀얼 가구 여부 판단 - 원본 모듈 ID로 판단
      const isDual = dragData.moduleData.id.startsWith('dual-');
      
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
      
      console.log('🔍 가구 검색:', {
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
      if (isDual && zoneSlotIndex + 1 >= targetZone.columnCount) {
        console.log('🚫 듀얼 가구가 영역 경계를 넘어감:', {
          zone: zoneToUse,
          zoneSlotIndex,
          targetZoneColumnCount: targetZone.columnCount,
          필요한슬롯: [zoneSlotIndex, zoneSlotIndex + 1],
          영역범위: `0 ~ ${targetZone.columnCount - 1}`
        });
        return false;
      }
      
      // 슬롯 가용성 검사 (영역 내 인덱스 사용)
      // 단내림이 없을 때는 모든 가구를 확인해야 함
      const zoneExistingModules = spaceInfo.droppedCeiling?.enabled 
        ? placedModules.filter(m => m.zone === zoneToUse)
        : placedModules;
      
      // 슬롯 점유 상태 디버깅
      console.log('📊 현재 슬롯 점유 상태:', {
        zone: zoneToUse,
        existingModules: zoneExistingModules.map(m => ({
          id: m.id,
          slotIndex: m.slotIndex,
          isDualSlot: m.isDualSlot,
          occupiedSlots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex]
        }))
      });

      const hasSlotConflict = zoneExistingModules.some(m => {
        if (isDual) {
          // 듀얼 가구는 2개 슬롯 차지
          let conflict = false;
          if (m.isDualSlot) {
            // 기존 가구도 듀얼인 경우: 4개 슬롯 중 하나라도 겹치면 충돌
            // 새 듀얼: [zoneSlotIndex, zoneSlotIndex + 1]
            // 기존 듀얼: [m.slotIndex, m.slotIndex + 1]
            conflict = (m.slotIndex === zoneSlotIndex) || // 같은 위치에서 시작
                      (m.slotIndex === zoneSlotIndex + 1) || // 기존이 새 가구의 두 번째 슬롯에서 시작
                      (m.slotIndex === zoneSlotIndex - 1) || // 기존의 두 번째 슬롯이 새 가구의 첫 번째 슬롯과 겹침
                      (m.slotIndex + 1 === zoneSlotIndex); // 기존의 두 번째 슬롯이 새 가구의 첫 번째 슬롯
          } else {
            // 기존 가구가 싱글인 경우: 새 듀얼의 2개 슬롯 중 하나와 겹치면 충돌
            conflict = m.slotIndex === zoneSlotIndex || m.slotIndex === zoneSlotIndex + 1;
          }
          
          if (conflict) {
            console.log('🚫 듀얼 가구 슬롯 충돌:', {
              배치하려는가구: { 
                slotIndex: zoneSlotIndex, 
                isDual: true,
                occupiedSlots: [zoneSlotIndex, zoneSlotIndex + 1] 
              },
              기존가구: { 
                id: m.id, 
                slotIndex: m.slotIndex, 
                isDualSlot: m.isDualSlot,
                occupiedSlots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex]
              }
            });
          }
          return conflict;
        } else {
          // 싱글 가구는 1개 슬롯 차지하지만, 듀얼 가구가 차지한 슬롯도 확인해야 함
          const conflict = m.slotIndex === zoneSlotIndex || 
                          (m.isDualSlot && (m.slotIndex === zoneSlotIndex || m.slotIndex + 1 === zoneSlotIndex));
          if (conflict) {
            console.log('🚫 싱글 가구 슬롯 충돌:', {
              배치하려는가구: { 
                slotIndex: zoneSlotIndex,
                isDual: false,
                occupiedSlots: [zoneSlotIndex]
              },
              기존가구: { 
                id: m.id, 
                slotIndex: m.slotIndex, 
                isDualSlot: m.isDualSlot,
                occupiedSlots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex]
              }
            });
          }
          return conflict;
        }
      });
      
      if (hasSlotConflict) {
        console.log('❌ 슬롯 충돌로 배치 불가');
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
        
        console.log('🎯 단내림 영역 위치 계산:', {
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
        
        console.log('🎯 메인 영역 위치 계산:', {
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
      const actualSlotWidth = zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined
        ? zoneIndexing.slotWidths[zoneSlotIndex] 
        : zoneIndexing.columnWidth; // Math.floor 대신 columnWidth 사용
      
      // 기둥 분석 - 전체 슬롯 인덱스를 계산해야 함
      const columnSlots = analyzeColumnSlots(spaceInfo);
      
      // zone 슬롯 인덱스를 전체 슬롯 인덱스로 변환
      let globalSlotIndex = zoneSlotIndex;
      if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.position) {
        if (spaceInfo.droppedCeiling.position === 'right' && zoneToUse === 'dropped') {
          // 단내림이 오른쪽: 단내림 슬롯은 메인 슬롯 뒤에 위치
          globalSlotIndex = zoneSlotIndex + zoneInfo.normal.columnCount;
        } else if (spaceInfo.droppedCeiling.position === 'left' && zoneToUse === 'normal') {
          // 단내림이 왼쪽: 메인 슬롯은 단내림 슬롯 뒤에 위치
          globalSlotIndex = zoneSlotIndex + zoneInfo.dropped.columnCount;
        }
        // 그 외의 경우는 zoneSlotIndex를 그대로 사용
      }
      
      const slotInfo = columnSlots[globalSlotIndex]; // 전체 공간 기준 슬롯 인덱스 사용
      
      console.log('🏛️ 기둥 분석 인덱스:', {
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
        
        console.log('🏛️ 듀얼 가구 슬롯 기둥 확인:', {
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
          
          console.log('🏛️ 듀얼 가구 기둥 처리:', {
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
          console.log('🏛️ 싱글 가구 - 기둥 침범 슬롯 감지:', {
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
            console.log('🚫 기둥 침범으로 인해 배치 불가:', {
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
            console.log('🚫 듀얼 가구 배치 불가:', {
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
          
          console.log('🔧 기둥 C 선배치 슬롯 - 원본 크기 유지:', {
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
            
            console.log('🔧 듀얼 가구 - 기둥 A 침범으로 폭 즉시 조정:', {
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
            
            console.log('🔧 싱글 가구 - 기둥 A 침범으로 폭 즉시 조정:', {
              원래폭: actualSlotWidth,
              조정된폭: customWidth,
              위치조정: { 원래X: finalX, 조정된X: furnitureX },
              columnType: slotInfo.columnType
            });
          }
        }
      } else {
        // 기둥이 없는 경우 기존 로직
        if (isDual && zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
          customWidth = zoneIndexing.slotWidths[zoneSlotIndex] + (zoneIndexing.slotWidths[zoneSlotIndex + 1] || zoneIndexing.slotWidths[zoneSlotIndex]);
        } else if (zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
          // 싱글 가구의 경우 실제 슬롯 너비 사용
          customWidth = zoneIndexing.slotWidths[zoneSlotIndex];
        } else {
          customWidth = actualSlotWidth;
        }
        adjustedWidth = moduleData.dimensions.width;
      }
      
      console.log('🎯 가구 배치 정보:', {
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
      const originalBaseType = dragData.moduleData.id.replace(/-\d+$/, '');
      const zoneTargetModuleId = `${originalBaseType}-${customWidth}`;
      
      console.log('🎯 단내림 구간 모듈 ID 생성:', {
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
      
      // 새 모듈 배치
      const newModule: any = {
        id: placedId,
        moduleId: zoneTargetModuleId, // 정확한 너비를 포함한 모듈 ID 사용
        position: { x: furnitureX, y: 0, z: 0 }, // 기둥 침범 시 조정된 위치 사용
        rotation: 0,
        hasDoor: false,
        customDepth: adjustedDepth, // 조정된 깊이 사용
        slotIndex: globalSlotIndex,  // 전체 공간 기준 슬롯 인덱스 사용
        isDualSlot: isDual,
        isValidInCurrentSpace: true,
        adjustedWidth: (slotInfo?.hasColumn || hasColumnInAnySlot) && effectiveColumnType !== 'medium' ? adjustedWidth : undefined, // 기둥 C가 아닌 경우에만 조정된 너비 사용
        hingePosition: hingePosition, // 기둥 위치에 따른 최적 힌지 방향
        zone: zoneToUse, // 영역 정보 저장
        customWidth: customWidth, // 실제 슬롯 너비 사용
        customHeight: zoneToUse === 'dropped' && zoneInternalSpace ? zoneInternalSpace.height : undefined // 단내림 구간의 줄어든 높이 저장
      };
      
      // 기둥 정보가 있으면 추가
      if (slotInfo && slotInfo.hasColumn) {
        newModule.columnSlotInfo = {
          hasColumn: true,
          columnId: slotInfo.column?.id,
          columnPosition: slotInfo.columnPosition,
          availableWidth: slotInfo.availableWidth,
          adjustedWidth: slotInfo.adjustedWidth,
          intrusionDirection: slotInfo.intrusionDirection,
          furniturePosition: slotInfo.furniturePosition
        };
        
        // 기둥 침범 시 실제 조정된 너비 재확인
        console.log('🔧 기둥 침범 가구 최종 설정:', {
          moduleId: newModule.moduleId,
          adjustedWidth: newModule.adjustedWidth,
          customWidth: newModule.customWidth,
          columnSlotInfo: newModule.columnSlotInfo
        });
      }
      
      console.log('✅ 가구 배치 완료:', {
        zone: zoneToUse,
        moduleId: zoneTargetModuleId,
        slotIndex: zoneSlotIndex,
        isDualSlot: isDual,
        isDualFromModuleId: zoneTargetModuleId.startsWith('dual-'),
        occupiedSlots: isDual ? [zoneSlotIndex, zoneSlotIndex + 1] : [zoneSlotIndex],
        position: { x: furnitureX },
        customWidth: customWidth,
        zoneInfo: zoneToUse === 'dropped' ? zoneInfo.dropped : zoneInfo.normal,
        newModule: {
          id: newModule.id,
          moduleId: newModule.moduleId,
          isDualSlot: newModule.isDualSlot,
          slotIndex: newModule.slotIndex
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
        const newModule = {
          id: placedId,
          moduleId: moduleData.id,
          position: { x: finalX, y: 0, z: 0 },
          rotation: 0,
          slotIndex,
          depth: defaultDepth,
          isDualSlot: isDual,
          isValidInCurrentSpace: true,
          adjustedWidth: moduleData.dimensions.width,
          hingePosition: 'right' as 'left' | 'right',
          customWidth: customWidth,
          zone: targetZone // 클릭한 슬롯의 영역 사용
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
    
    console.log('🎰 Slot index from raycast (non-dropped):', slotIndex);
    
    if (slotIndex === null) {
      console.log('❌ No slot index found (non-dropped)');
      return false;
    }
    
    // 듀얼/싱글 가구 판별 - 원본 모듈 ID로 판단
    const isDual = dragData.moduleData.id.startsWith('dual-');
    
    // 메인 구간 슬롯 점유 상태 디버깅
    console.log('📊 메인 구간 슬롯 점유 상태 (drop):', {
      zone: 'main',
      targetSlot: slotIndex,
      isDualDragging: isDual,
      targetSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex],
      existingModules: placedModules.filter(m => !m.zone || m.zone === 'normal').map(m => ({
        id: m.id,
        moduleId: m.moduleId,
        slotIndex: m.slotIndex,
        isDualSlot: m.isDualSlot,
        occupiedSlots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex]
      }))
    });
       
    // 슬롯 가용성 검사
    if (!isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, dragData.moduleData.id)) {
      console.log('❌ 메인 구간 슬롯 충돌로 배치 불가');
      return false;
    }
    
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
      console.log('🎯 [SlotDropZones] 분할창 모듈 생성:', {
        mainDoorCount: spaceInfo.mainDoorCount,
        defaultColumnCount,
        internalWidth: internalSpace.width,
        adjustedSpaceInfo
      });
    }
    
    // 타겟 슬롯의 실제 너비 가져오기
    const targetIndexing = calculateSpaceIndexing(adjustedSpaceInfo);
    const targetWidth = targetIndexing.slotWidths && targetIndexing.slotWidths[slotIndex] !== undefined
      ? targetIndexing.slotWidths[slotIndex]
      : targetIndexing.columnWidth;
    
    // 베이스 타입 추출 (숫자 제거)
    const moduleBaseType = dragData.moduleData.id.replace(/-\d+$/, '');
    
    // 정확한 너비를 포함한 ID 생성
    const targetModuleId = `${moduleBaseType}-${targetWidth}`;
    
    console.log('🎯 [SlotDropZones] Non-dropped module lookup:', {
      originalId: dragData.moduleData.id,
      baseType: moduleBaseType,
      targetWidth,
      targetModuleId,
      slotIndex,
      slotWidths: targetIndexing.slotWidths
    });
    
    // 가구 데이터 조회 (조정된 spaceInfo 사용)
    let moduleData = getModuleById(targetModuleId, internalSpace, adjustedSpaceInfo);
    if (!moduleData) {
      console.error('❌ [SlotDropZones] Module not found:', targetModuleId);
      return false;
    }
    
    // 최종 위치 계산 (듀얼 가구는 나중에 업데이트)
    let finalX = calculateFurniturePosition(slotIndex, targetModuleId, spaceInfo, zoneToUse);
    if (finalX === null) {
      return false;
    }
    
    // 듀얼 가구 위치 디버깅
    if (isDual) {
      console.log('🎯 Dual furniture position debug:', {
        slotIndex,
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
    
    // 실제 슬롯 너비 가져오기
    const actualSlotWidth = zoneTargetIndexing.slotWidths && zoneTargetIndexing.slotWidths[slotIndex] !== undefined
      ? zoneTargetIndexing.slotWidths[slotIndex] 
      : zoneTargetIndexing.columnWidth; // Math.floor 대신 columnWidth 사용
    
    // 듀얼 가구의 경우 두 슬롯의 실제 너비 합계
    let customWidth;
    let dualTargetModuleId = targetModuleId; // 듀얼 가구용 모듈 ID
    
    if (isDual && zoneTargetIndexing.slotWidths && zoneTargetIndexing.slotWidths[slotIndex] !== undefined) {
      const slot1Width = zoneTargetIndexing.slotWidths[slotIndex];
      const slot2Width = zoneTargetIndexing.slotWidths[slotIndex + 1] || slot1Width;
      customWidth = slot1Width + slot2Width;
      
      // 듀얼 가구는 두 슬롯 너비의 합으로 ID 생성
      dualTargetModuleId = `${moduleBaseType}-${customWidth}`;
      
      console.log('🎯 [SlotDropZones] Dual furniture width calculation:', {
        slotIndex,
        slot1Width,
        slot2Width,
        totalWidth: customWidth,
        dualTargetModuleId,
        originalTargetModuleId: targetModuleId
      });
    } else if (zoneTargetIndexing.slotWidths && zoneTargetIndexing.slotWidths[slotIndex] !== undefined) {
      // 싱글 가구의 경우 실제 슬롯 너비 사용
      customWidth = zoneTargetIndexing.slotWidths[slotIndex];
    } else {
      customWidth = actualSlotWidth;
    }
    
    // 듀얼 가구인 경우 정확한 너비로 모듈 다시 조회
    if (isDual && dualTargetModuleId !== targetModuleId) {
      const dualModuleData = getModuleById(dualTargetModuleId, internalSpace, adjustedSpaceInfo);
      if (dualModuleData) {
        moduleData = dualModuleData;
        console.log('✅ [SlotDropZones] Found dual module with exact width:', dualTargetModuleId);
        // 듀얼 가구의 경우 위치 재계산
        finalX = calculateFurniturePosition(slotIndex, dualTargetModuleId, spaceInfo, zoneToUse);
        if (finalX === null) {
          console.error('❌ [SlotDropZones] Failed to calculate dual furniture position');
          return false;
        }
      } else {
        console.warn('⚠️ [SlotDropZones] Dual module not found with exact width, using single slot module:', dualTargetModuleId);
      }
    }
    
    console.log('🎯 가구 배치 시 customWidth 설정:', {
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
      const slot1Info = columnSlots[slotIndex];
      const slot2Info = columnSlots[slotIndex + 1];
      
      console.log('🏛️ 듀얼 가구 기둥 침범 확인:', {
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
          
          console.log('🔧 듀얼 가구 기둥 A 침범 - 폭 조정:', {
            원래폭: customWidth,
            조정된폭: adjustedCustomWidth,
            slot1Available,
            slot2Available,
            totalAvailable: totalAvailableWidth
          });
        } else {
          // 기둥 C의 경우 원본 크기 유지 (FurnitureItem에서 실시간 조정)
          console.log('🔧 듀얼 가구 기둥 C 선배치 - 원본 크기 유지');
        }
      }
    } else {
      // 싱글 가구의 경우 기존 로직 유지
      slotInfo = columnSlots[slotIndex];
      
      if (slotInfo && slotInfo.hasColumn) {
        console.log('🏛️ 싱글 가구 - 기둥 침범 슬롯 감지:', {
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
          console.log('🔧 기둥 C 선배치 슬롯 - 원본 크기 유지');
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
          
          console.log('🔧 기둥 A 침범 - 가구 폭 즉시 조정:', {
            원래폭: customWidth,
            조정된폭: adjustedCustomWidth,
            원래위치: finalX,
            조정된위치: adjustedPosition,
            furnitureBounds
          });
        }
      }
    }
    
    // 새 모듈 배치
    const newModule: any = {
      id: placedId,
      moduleId: isDual ? dualTargetModuleId : targetModuleId, // 듀얼의 경우 합계 너비 ID 사용
      position: { x: adjustedPosition, y: 0, z: 0 },
      rotation: 0,
      hasDoor: false,
      customDepth: defaultDepth,
      slotIndex: slotIndex,
      isDualSlot: isDual,
      isValidInCurrentSpace: true,
      adjustedWidth: slotInfo?.hasColumn && slotInfo.columnType !== 'medium' ? adjustedWidthValue : undefined, // 기둥 C를 제외한 모든 기둥에서 조정된 너비 사용
      hingePosition: 'right' as 'left' | 'right',
      customWidth: adjustedCustomWidth, // 실제 슬롯 너비 사용
      zone: zoneToUse // 단내림 영역 정보 저장
    };
    
    // 기둥 정보가 있으면 추가
    if (slotInfo && slotInfo.hasColumn) {
      newModule.columnSlotInfo = {
        hasColumn: true,
        columnId: slotInfo.column?.id,
        columnPosition: slotInfo.columnPosition,
        availableWidth: slotInfo.availableWidth,
        adjustedWidth: slotInfo.adjustedWidth,
        intrusionDirection: slotInfo.intrusionDirection,
        furniturePosition: slotInfo.furniturePosition
      };
    }
    
    // 듀얼 가구 배치 시 슬롯 점유 상태 로그
    console.log('🎯 가구 배치 완료:', {
      id: placedId,
      moduleId: newModule.moduleId,
      isDual,
      isDualSlot: newModule.isDualSlot,
      slotIndex,
      occupiedSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex],
      zone: zoneToUse,
      position: adjustedPosition,
      width: moduleData.dimensions.width,
      customWidth
    });
    
    // 최종 모듈 데이터 로그
    console.log('🎯 최종 가구 데이터:', {
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
    console.log('📋 배치 전 가구 목록:', placedModules.map(m => ({
      id: m.id.slice(-2),
      slotIndex: m.slotIndex,
      isDualSlot: m.isDualSlot,
      zone: m.zone,
      moduleId: m.moduleId
    })));
    
    addModule(newModule);
    
    // 전체 슬롯 점유 상태 시각화
    const updatedModules = [...placedModules, newModule];
    const targetZone = 'normal'; // 기본값, 실제 zone은 가구 배치 시점에 결정됨
    const slotOccupancy: string[] = new Array(zoneTargetIndexing.columnCount).fill('[ ]');
    
    // 현재 영역의 가구만 필터링 (zone이 없는 경우 normal로 간주)
    const zoneModules = updatedModules.filter(m => {
      if (spaceInfo.droppedCeiling?.enabled) {
        return (m.zone || 'normal') === targetZone;
      }
      return true; // 단내림이 없으면 모든 가구 표시
    });
    
    console.log(`🔍 ${targetZone} 영역 가구 목록:`, zoneModules.map(m => ({
      id: m.id.slice(-2),
      moduleId: m.moduleId,
      slotIndex: m.slotIndex,
      isDualSlot: m.isDualSlot,
      zone: m.zone
    })));
    
    zoneModules.forEach(m => {
      if (m.isDualSlot && m.slotIndex !== undefined) {
        slotOccupancy[m.slotIndex] = `[${m.id.slice(-2)}`;
        if (m.slotIndex + 1 < slotOccupancy.length) {
          slotOccupancy[m.slotIndex + 1] = `${m.id.slice(-2)}]`;
        }
      } else if (m.slotIndex !== undefined) {
        slotOccupancy[m.slotIndex] = `[${m.id.slice(-2)}]`;
      }
    });
    
    console.log(`📊 ${targetZone} 영역 슬롯 점유 상태 (총 ${zoneTargetIndexing.columnCount}개):`, slotOccupancy.join(''));
    
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
    console.log('🎯 SlotDropZonesSimple - registering window.handleSlotDrop');
    window.handleSlotDrop = (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => {
      console.log('🎯 window.handleSlotDrop called');
      // handleSlotDrop 내부에서 마우스 위치를 기반으로 영역을 자동 판단함
      return handleSlotDrop(dragEvent, canvasElement);
    };
    
    return () => {
      console.log('🎯 SlotDropZonesSimple - unregistering window.handleSlotDrop');
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

      const slotIndex = getSlotIndexFromRaycast(
        e.clientX, 
        e.clientY, 
        canvas,
        camera,
        scene,
        spaceInfo
      );
      
      if (slotIndex === null) {
        setHoveredSlotIndex(null);
        setHoveredZone(null);
        return;
      }

      // 레이캐스트로 zone 정보 가져오기
      let detectedZone: 'normal' | 'dropped' | null = null;
      
      // 단내림이 활성화된 경우 영역별 처리
      if (spaceInfo.droppedCeiling?.enabled) {
        // 마우스 위치로 zone 판단
        const rect = canvas.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // 레이캐스터 생성
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
        
        // 모든 콜라이더 가져오기
        const allColliders = scene.children
          .flatMap(child => child.children || [child])
          .filter(obj => obj.userData?.isSlotCollider);
        
        // 레이캐스트 교차점 확인
        const intersects = raycaster.intersectObjects(allColliders, true);
        
        if (intersects.length > 0) {
          // 가장 가까운 콜라이더의 zone 정보 사용
          const closestCollider = intersects[0].object;
          detectedZone = closestCollider.userData?.zone || 'normal';
          
          console.log('🔍 Zone 감지 (레이캐스트):', {
            slotIndex,
            detectedZone,
            colliderData: closestCollider.userData,
            distance: intersects[0].distance
          });
        } else {
          // 레이캐스트 실패 시 마우스 X 위치로 zone 판단
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          if (zoneInfo.dropped && zoneInfo.normal) {
            const droppedEndX = mmToThreeUnits(zoneInfo.dropped.startX + zoneInfo.dropped.width);
            const normalStartX = mmToThreeUnits(zoneInfo.normal.startX);
            
            // 마우스의 세계 좌표 계산
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectPoint = new THREE.Vector3();
            
            if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
              if (spaceInfo.droppedCeiling.position === 'left') {
                detectedZone = intersectPoint.x < droppedEndX ? 'dropped' : 'normal';
              } else {
                detectedZone = intersectPoint.x >= normalStartX ? 'dropped' : 'normal';
              }
            } else {
              detectedZone = 'normal';
            }
          } else {
            detectedZone = 'normal';
          }
        }
      } else {
        // 단내림이 없는 경우 normal zone
        detectedZone = 'normal';
        console.log('🔍 단내림 없음 - normal zone 설정:', {
          slotIndex,
          detectedZone,
          hoveredSlotIndex,
          hoveredZone
        });
      }
      
      // 현재 활성 모듈 확인 (드래그 중이거나 선택된 모듈)
      const activeModuleData = currentDragData;
      
      if (activeModuleData) {
        // isDualFurniture 함수는 너비를 기대하지만, 더 정확한 방법은 moduleId 확인
        const isDual = activeModuleData.moduleData.id.startsWith('dual-');
        
        // 단내림 구간일 경우 영역별 가구 확인
        const isAvailable = (() => {
          if (spaceInfo.droppedCeiling?.enabled && colliderUserData?.zone) {
            // 영역별 컬럼 수 가져오기
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const targetZone = colliderUserData.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
            
            // 듀얼 가구가 영역 경계를 넘어가는지 체크
            if (isDual && slotIndex + 1 >= targetZone.columnCount) {
              console.log('🚫 Hover: 듀얼 가구가 영역 경계를 넘어감:', {
                zone: colliderUserData.zone,
                slotIndex,
                targetZoneColumnCount: targetZone.columnCount,
                필요한슬롯: [slotIndex, slotIndex + 1],
                영역범위: `0 ~ ${targetZone.columnCount - 1}`
              });
              return false;
            }
            
            // 단내림 구간: 동일 영역의 가구만 확인
            const zoneModules = placedModules.filter(m => m.zone === colliderUserData?.zone);
            
            // 단내림 구간 슬롯 점유 상태 로깅
            console.log('🏗️ 단내림 구간 슬롯 점유 상태 (hover):', {
              zone: colliderUserData?.zone,
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
                    console.log('🚫 Hover: 듀얼-듀얼 충돌:', {
                      드래그중: { slotIndex, isDual: true, slots: [slotIndex, slotIndex + 1] },
                      기존가구: { id: m.id, slotIndex: m.slotIndex, isDualSlot: m.isDualSlot, 
                                 moduleId: m.moduleId, slots: [m.slotIndex, m.slotIndex + 1] }
                    });
                  }
                  return conflict;
                } else {
                  // 기존 가구가 싱글인 경우
                  const conflict = m.slotIndex === slotIndex || m.slotIndex === slotIndex + 1;
                  if (conflict) {
                    console.log('🚫 Hover: 듀얼-싱글 충돌:', {
                      드래그중: { slotIndex, isDual: true, slots: [slotIndex, slotIndex + 1] },
                      기존가구: { id: m.id, slotIndex: m.slotIndex, isDualSlot: m.isDualSlot, 
                                 moduleId: m.moduleId, slots: [m.slotIndex] }
                    });
                  }
                  return conflict;
                }
              } else {
                // 싱글 가구는 1개 슬롯 차지하지만, 듀얼 가구가 차지한 슬롯도 확인해야 함
                const conflict = m.slotIndex === slotIndex || 
                       (m.isDualSlot && (m.slotIndex === slotIndex || m.slotIndex + 1 === slotIndex));
                if (conflict) {
                  console.log('🚫 Hover: 싱글 충돌:', {
                    드래그중: { slotIndex, isDual: false, slots: [slotIndex] },
                    기존가구: { id: m.id, slotIndex: m.slotIndex, isDualSlot: m.isDualSlot, 
                               moduleId: m.moduleId,
                               slots: m.isDualSlot ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex] }
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
    // 단내림이 없는 경우 기본 위치 사용
    if (!hasDroppedCeiling || !zoneSlotInfo?.dropped) {
      console.log('🎯 getZoneSlotPositions - returning default positions (no dropped ceiling):', {
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
    console.log('🎯 getZoneSlotPositions - creating colliders for both zones');
    const fullIndexing = calculateSpaceIndexing(spaceInfo);
    
    const allPositions = [];
    
    // normal 영역 콜라이더
    if (fullIndexing.zones?.normal?.threeUnitPositions) {
      console.log('🔍 Normal zone positions:', fullIndexing.zones.normal.threeUnitPositions);
      const normalMin = Math.min(...fullIndexing.zones.normal.threeUnitPositions);
      const normalMax = Math.max(...fullIndexing.zones.normal.threeUnitPositions);
      console.log('📏 Normal zone range:', { min: normalMin, max: normalMax });
      
      allPositions.push(...fullIndexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      })));
    }
    
    // dropped 영역 콜라이더
    if (fullIndexing.zones?.dropped?.threeUnitPositions) {
      console.log('🔍 Dropped zone positions:', fullIndexing.zones.dropped.threeUnitPositions);
      const droppedMin = Math.min(...fullIndexing.zones.dropped.threeUnitPositions);
      const droppedMax = Math.max(...fullIndexing.zones.dropped.threeUnitPositions);
      console.log('📏 Dropped zone range:', { min: droppedMin, max: droppedMax });
      
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
    
    console.log('🎯 All positions for colliders:', allPositions);
    return allPositions;
  };
  
  const zoneSlotPositions = getZoneSlotPositions();
  
  // 배열이 아닌 경우 빈 배열로 처리
  if (!Array.isArray(zoneSlotPositions)) {
    console.error('❌ getZoneSlotPositions returned non-array:', zoneSlotPositions);
    return <group />;
  }
  
  console.log('🎯 SlotDropZonesSimple - rendering colliders:', {
    zoneSlotPositionsLength: zoneSlotPositions.length,
    hasDroppedCeiling,
    viewMode,
    droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
    zoneSlotPositions: zoneSlotPositions,
    indexing: indexing,
    hasIndexingPositions: !!indexing?.threeUnitPositions
  });
  
  return (
    <group>
      {/* 레이캐스팅용 투명 콜라이더들 */}
      {console.log('🎯 렌더링 슬롯 콜라이더 수:', zoneSlotPositions.length)}
      {console.log('🎯 슬롯 콜라이더 상세 정보:', zoneSlotPositions)}
      {zoneSlotPositions.map((slotData, slotIndex) => {
        // slotData가 객체인지 숫자인지 확인
        const isZoneData = typeof slotData === 'object' && slotData !== null;
        const slotX = isZoneData ? slotData.position : slotData;
        // 단내림이 없는 경우 slotZone을 'normal'로 설정
        const slotZone = isZoneData ? slotData.zone : 'normal';
        const slotLocalIndex = isZoneData ? slotData.index : slotIndex;
        // 앞쪽에서 20mm 줄이기
        const reducedDepth = slotDimensions.depth - mmToThreeUnits(20);
        const zOffset = -mmToThreeUnits(10); // 뒤쪽으로 10mm 이동 (앞쪽에서만 20mm 줄이기 위해)
        
        // 영역별 슬롯 너비 계산
        let slotWidth = slotDimensions.width;
        if (hasDroppedCeiling && zoneSlotInfo) {
          const currentZone = slotZone;
          const zoneColumnWidth = currentZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped.columnWidth
            : zoneSlotInfo.normal.columnWidth;
          slotWidth = mmToThreeUnits(zoneColumnWidth);
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
              globalSlotIndex: slotZone === 'dropped' && zoneSlotInfo?.dropped 
                ? slotLocalIndex + zoneSlotInfo.normal.columnCount  // 단내림 영역은 메인 영역 이후 인덱스
                : slotLocalIndex  // 메인 영역 또는 단내림 없는 경우
            }}
            visible={false}
          >
            <boxGeometry args={[slotWidth, slotHeight, reducedDepth]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        );
      })}
      
      {/* 바닥 슬롯 시각화 - 가이드라인과 정확히 일치 (2D 정면뷰에서는 숨김) */}
      {showAll && showDimensions && indexing.threeUnitBoundaries.length > 1 && !(viewMode === '2D' && view2DDirection === 'front') && (() => {
        // 단내림 활성화 여부 확인
        const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;
        const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        // ColumnGuides와 동일한 Y 위치 계산
        const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
        const floatHeight = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.floatHeight || 0) : 0;
        const floorY = mmToThreeUnits(internalSpace.startY) + floatHeight;
        const ceilingY = mmToThreeUnits(internalSpace.startY) + mmToThreeUnits(internalSpace.height);
        
        // Room.tsx의 바닥 계산과 동일하게 수정
        const doorThicknessMm = 20;
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        const panelDepthMm = 1500;
        const furnitureDepthMm = 600;
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
        
        const roomBackZ = -mmToThreeUnits(internalSpace.depth / 2);
        const frameEndZ = furnitureZOffset + furnitureDepth/2; // 좌우 프레임의 앞쪽 끝
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
          return (
            <>
              {/* 메인 영역 표시 */}
              <group key="main-zone-group">
                {/* 바닥 슬롯 메쉬 */}
                <mesh
                    position={[
                      (mmToThreeUnits(zoneSlotInfo.normal.startX) + mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width)) / 2,
                      floorY,
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
                  {/* 천장 슬롯 메쉬 - 바닥과 동일한 깊이 */}
                  <mesh
                    position={[
                      (mmToThreeUnits(zoneSlotInfo.normal.startX) + mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width)) / 2,
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
                  {/* 메인 영역 외곽선 */}
                  <lineSegments
                    position={[
                      (mmToThreeUnits(zoneSlotInfo.normal.startX) + mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width)) / 2,
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
                      (mmToThreeUnits(zoneSlotInfo.dropped.startX) + mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width)) / 2,
                      floorY,
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
                  {/* 천장 슬롯 메쉬 - 단내림 구간은 높이가 다름 */}
                  <mesh
                    position={[
                      (mmToThreeUnits(zoneSlotInfo.dropped.startX) + mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width)) / 2,
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
                  {/* 단내림 영역 외곽선 */}
                  <lineSegments
                    position={[
                      (mmToThreeUnits(zoneSlotInfo.dropped.startX) + mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width)) / 2,
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
          // 단내림이 없는 경우 전체 영역 표시
          const leftX = indexing.threeUnitBoundaries[0];
          const rightX = indexing.threeUnitBoundaries[indexing.threeUnitBoundaries.length - 1];
          const centerX = (leftX + rightX) / 2;
          const width = rightX - leftX;
          
          return (
            <group key="full-zone-group">
              {/* 바닥 슬롯 메쉬 */}
              <mesh
                position={[centerX, floorY, slotFloorZ]}
              >
                <boxGeometry args={[width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth]} />
                <meshBasicMaterial 
                  color={primaryColor} 
                  transparent 
                  opacity={0.35} 
                />
              </mesh>
              {/* 천장 슬롯 메쉬 - 바닥과 동일한 깊이 */}
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
      {console.log('👻 [Ghost] Rendering conditions:', {
        hoveredSlotIndex,
        hasCurrentDragData: !!currentDragData,
        hasSelectedModule: false,
        zoneSlotPositionsLength: zoneSlotPositions.length
      })}
      {hoveredSlotIndex !== null && currentDragData && zoneSlotPositions.map((slotData, slotIndex) => {
        // slotData가 객체인지 숫자인지 확인하여 위치 추출
        const isZoneData = typeof slotData === 'object' && slotData !== null;
        const slotX = isZoneData ? slotData.position : slotData;
        // 단내림이 없는 경우 slotZone을 'normal'로 설정
        const slotZone = isZoneData ? slotData.zone : 'normal';
        const slotLocalIndex = isZoneData ? slotData.index : slotIndex;
        
        // 현재 활성 모듈 가져오기 (드래그 중이거나 선택된 모듈)
        const activeModuleData = currentDragData;
        
        // 현재 드래그 중인 가구가 듀얼인지 확인
        let isDual = false;
        if (activeModuleData) {
          isDual = activeModuleData.moduleData.id.startsWith('dual-');
        }
        
        // 고스트 렌더링 여부 결정
        let shouldRenderGhost = false;
        if (hoveredSlotIndex !== null && activeModuleData) {
          // zone 정보가 있는 경우 로컬 인덱스로 비교
          const compareIndex = isZoneData ? slotLocalIndex : slotIndex;
          
          // zone이 일치하는지도 체크
          // hoveredZone이 null이면 zone 체크를 하지 않음 (모든 영역 허용)
          // hoveredZone이 있으면 해당 zone과 일치하는지 체크
          const zoneMatches = !hoveredZone || hoveredZone === slotZone;
          
          // 단내림이 있고 hoveredZone이 설정되지 않은 경우, 인덱스만으로 비교
          const shouldIgnoreZone = hasDroppedCeiling && !hoveredZone;
          
          if (isDual) {
            // 듀얼 가구: 첫 번째 슬롯에서만 고스트 렌더링
            shouldRenderGhost = compareIndex === hoveredSlotIndex && (shouldIgnoreZone || zoneMatches);
          } else {
            // 싱글 가구: 현재 슬롯에서만 고스트 렌더링
            shouldRenderGhost = compareIndex === hoveredSlotIndex && (shouldIgnoreZone || zoneMatches);
          }
          
          console.log('🎯 고스트 렌더링 체크:', {
            hoveredSlotIndex,
            hoveredZone,
            slotIndex,
            slotLocalIndex,
            slotZone,
            compareIndex,
            isZoneData,
            zoneMatches,
            shouldIgnoreZone,
            shouldRenderGhost,
            hasDroppedCeiling,
            activeModuleData: {
              id: activeModuleData.moduleData.id,
              isDual
            }
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
        
        console.log('🔥 고스트 생성 디버그:', {
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
          const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;
          let zoneSpaceInfo;
          
          if (effectiveZone === 'dropped') {
            // 단내림 영역용 spaceInfo - 높이도 조정
            const droppedHeight = spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 0);
            zoneSpaceInfo = {
              ...spaceInfo,
              width: droppedCeilingWidth,  // 단내림 영역의 외경 너비
              height: droppedHeight,  // 단내림 영역의 높이
              zone: 'dropped' as const
            };
            console.log('🔧 [Ghost Preview] 단내림 영역 zoneSpaceInfo 생성:', {
              zone: 'dropped',
              width: droppedCeilingWidth,
              height: droppedHeight,
              droppedCeilingEnabled: zoneSpaceInfo.droppedCeiling?.enabled
            });
          } else {
            // 메인 영역용 spaceInfo
            zoneSpaceInfo = {
              ...spaceInfo,
              width: spaceInfo.width - droppedCeilingWidth,  // 메인 영역의 외경 너비
              zone: 'normal' as const
            };
            console.log('🔧 [Ghost Preview] 메인 영역 zoneSpaceInfo 생성:', {
              zone: 'normal',
              width: spaceInfo.width - droppedCeilingWidth,
              droppedCeilingEnabled: zoneSpaceInfo.droppedCeiling?.enabled
            });
          }
          
          zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
          
          console.log('🎯 [Ghost Preview] Zone 내부 공간 계산:', {
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
          
          // 슬롯 너비에 기반한 모듈 ID 생성
          const baseType = activeModuleData.moduleData.id.replace(/-\d+$/, '');
          const targetZone = effectiveZone === 'dropped' && zoneSlotInfo.dropped
            ? zoneSlotInfo.dropped
            : zoneSlotInfo.normal;
          
          let targetWidth;
          // 로컬 인덱스 사용 (hoveredSlotIndex는 이미 로컬 인덱스)
          const localIndex = slotLocalIndex;
          
          if (isDual && localIndex < targetZone.columnCount - 1) {
            // 듀얼 가구: 두 슬롯의 너비 합
            const slot1Width = targetZone.slotWidths?.[localIndex] || targetZone.columnWidth;
            const slot2Width = targetZone.slotWidths?.[localIndex + 1] || targetZone.columnWidth;
            targetWidth = slot1Width + slot2Width;
          } else {
            // 싱글 가구: 해당 슬롯의 너비
            targetWidth = targetZone.slotWidths?.[localIndex] || targetZone.columnWidth;
          }
          
          targetModuleId = `${baseType}-${targetWidth}`;
          console.log('🎯 [Ghost Preview] 모듈 ID 생성:', {
            baseType,
            targetWidth,
            targetModuleId,
            originalId: activeModuleData.moduleData.id,
            effectiveZone,
            localIndex
          });
          
          moduleData = getModuleById(targetModuleId, zoneInternalSpace, zoneSpaceInfo);
          
          console.log('🔍 [Ghost Preview] 단내림 구간 미리보기 모듈 조회:', {
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
          moduleData = getModuleById(activeModuleData.moduleData.id, internalSpace, spaceInfo);
        }
        
        if (!moduleData) {
          console.error('❌ [Ghost Preview] 미리보기 모듈을 찾을 수 없음:', {
            targetModuleId,
            effectiveZone,
            zoneInternalSpace,
            baseType,
            targetWidth,
            originalModuleId: activeModuleData.moduleData.id
          });
          // 폴백: 원래 모듈 사용
          moduleData = activeModuleData.moduleData;
        }
        
        // 미리보기 위치 계산 - 실제 배치와 동일한 로직 사용
        let previewX = slotX;
        
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
          if (isDual && slotIndex === hoveredSlotIndex) {
            // 듀얼 가구 - indexing의 threeUnitDualPositions 사용
            if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
              previewX = indexing.threeUnitDualPositions[slotIndex];
            }
          } else {
            // 싱글 가구는 이미 slotX에 올바른 위치가 설정되어 있음
            previewX = slotX;
          }
          
          console.log('🎯 [Normal Ghost] 일반 구간 고스트 위치:', {
            isDual,
            slotIndex,
            hoveredSlotIndex,
            previewX,
            slotX,
            threeUnitDualPositions: indexing.threeUnitDualPositions,
            dualPosition: indexing.threeUnitDualPositions?.[slotIndex]
          });
        }
        
        const customDepth = moduleData?.defaultDepth || Math.min(Math.floor(spaceInfo.depth * 0.9), 580);
        // 단내림 구간의 경우 moduleData가 이미 조정된 높이를 가지고 있어야 함
        const furnitureHeightMm = moduleData.dimensions.height;
        const furnitureHeight = furnitureHeightMm * 0.01;
        
        // 가구 Y 위치 계산 - 가구는 항상 바닥(slotStartY)에서 시작
        const furnitureY = slotStartY + furnitureHeight / 2;
        
        console.log('👻 [Ghost Preview] 가구 높이 계산:', {
          effectiveZone,
          moduleDataHeight: moduleData.dimensions.height,
          moduleDataId: moduleData.id,
          zoneInternalSpaceHeight: zoneInternalSpace?.height,
          furnitureHeightMm,
          furnitureHeight,
          furnitureY,
          slotStartY,
          expectedY: slotStartY + furnitureHeight / 2,
          originalSpaceHeight: spaceInfo.height,
          droppedCeilingDropHeight: spaceInfo.droppedCeiling?.dropHeight,
          isDroppedZone: effectiveZone === 'dropped'
        });
        
        const doorThickness = mmToThreeUnits(20);
        const panelDepth = mmToThreeUnits(1500);
        const furnitureDepth = mmToThreeUnits(600);
        const zOffset = -panelDepth / 2;
        const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
        const previewDepth = mmToThreeUnits(customDepth);
        const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - previewDepth/2;
        
        return (
          <group key={`furniture-preview-${slotIndex}`} position={[previewX, furnitureY, furnitureZ]}>
            <BoxModule 
              moduleData={moduleData}
              color={theme.color}
              isDragging={true}
              hasDoor={false}
              customDepth={customDepth}
              spaceInfo={spaceInfo}
            />
          </group>
        );
      })}
    </group>
  );
};

export default SlotDropZonesSimple;