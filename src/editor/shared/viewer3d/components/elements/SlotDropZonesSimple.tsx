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
import { useUIStore } from '@/store/uiStore';

interface SlotDropZonesSimpleProps {
  spaceInfo: SpaceInfo;
  showAll?: boolean;
  showDimensions?: boolean;
  activeZone?: 'normal' | 'dropped';
}

// 전역 window 타입 확장
declare global {
  interface Window {
    handleSlotDrop?: (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => boolean;
  }
}

const SlotDropZonesSimple: React.FC<SlotDropZonesSimpleProps> = ({ spaceInfo, showAll = true, showDimensions = true, activeZone: activeZoneProp }) => {
  // 모든 훅을 먼저 호출
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const currentDragData = useFurnitureStore(state => state.currentDragData);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const { showAlert } = useAlert();
  
  // Three.js 컨텍스트 접근
  const { camera, scene } = useThree();
  const { viewMode } = useSpace3DView();
  const { view2DDirection } = useUIStore();
  const activeZone = activeZoneProp;
  
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
  const handleSlotDrop = useCallback((dragEvent: DragEvent, canvasElement: HTMLCanvasElement, activeZoneParam?: 'normal' | 'dropped'): boolean => {
    console.log('🎯 handleSlotDrop called:', {
      hasCurrentDragData: !!currentDragData,
      activeZoneParam,
      activeZone,
      zoneToUse: activeZoneParam || activeZone,
      droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
      droppedCeilingWidth: spaceInfo.droppedCeiling?.width
    });
    
    // 드롭 위치에서 마우스 좌표 계산
    const rect = canvasElement.getBoundingClientRect();
    const mouseX = ((dragEvent.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((dragEvent.clientY - rect.top) / rect.height) * 2 + 1;
    
    // 단내림이 활성화되어 있고 activeZone이 없는 경우, 마우스 X 위치로 영역 판단
    let zoneToUse = activeZoneParam || activeZone;
    if (spaceInfo.droppedCeiling?.enabled && !zoneToUse) {
      try {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
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
            detectedZone: zoneToUse
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
    
    if (!currentDragData) {
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
        // Fallback to currentDragData if HTML5 drag data is not available
        dragData = currentDragData;
      } else {
        dragData = JSON.parse(dragDataString);
      }
      
      console.log('📦 Parsed drag data:', dragData);
    } catch (error) {
      console.error('Error parsing drag data:', error);
      // Fallback to currentDragData
      dragData = currentDragData;
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
        // 단내림 구간은 높이가 낮음
        zoneInternalSpace.height = zoneInternalSpace.height - (spaceInfo.droppedCeiling?.dropHeight || 200);
        // zoneInfo에서 직접 columnWidth 사용
        zoneIndexing = {
          columnCount: zoneInfo.dropped.columnCount,
          columnWidth: zoneInfo.dropped.columnWidth,
          threeUnitPositions: [],
          threeUnitDualPositions: {},
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
          threeUnitDualPositions: {},
          threeUnitBoundaries: [],
          slotWidths: zoneInfo.normal.slotWidths || Array(zoneInfo.normal.columnCount).fill(zoneInfo.normal.columnWidth)
        };
      }
      
      // 영역별 인덱싱으로 슬롯 인덱스 계산
      const slotIndex = getSlotIndexFromRaycast(
        dragEvent.clientX,
        dragEvent.clientY,
        canvasElement,
        camera,
        scene,
        spaceInfo,  // 원본 spaceInfo 사용
        zoneToUse   // zoneToUse 전달
      );
      
      console.log('🎰 Slot index from raycast (dropped zone):', {
        slotIndex,
        zoneToUse,
        droppedInfo: spaceInfo.droppedCeiling
      });
      
      if (slotIndex === null) {
        console.log('❌ No slot index found (dropped zone)');
        return false;
      }
      
      // 레이캐스트로 받은 슬롯 인덱스는 이미 영역별로 생성된 콜라이더의 로컬 인덱스
      // 즉, 각 영역에서 0부터 시작하는 인덱스
      const zoneSlotIndex = slotIndex;
      
      // 영역 검증 - 활성 영역에 맞는 슬롯인지 확인
      if (zoneToUse === 'dropped' && slotIndex >= zoneInfo.dropped.columnCount) {
        return false;
      } else if (zoneToUse === 'normal' && slotIndex >= zoneInfo.normal.columnCount) {
        return false;
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
      
      // generateDynamicModules에 전달할 spaceInfo - 전체 spaceInfo에 zone 정보만 추가
      const zoneSpaceInfo = {
        ...spaceInfo,
        zone: zoneToUse  // zone 정보 추가
      };
      
      
      // 영역별 모듈 목록 생성
      const zoneModules = generateDynamicModules(zoneInternalSpace, zoneSpaceInfo);
      
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
      const moduleData = getModuleById(targetModuleId, zoneInternalSpace, zoneSpaceInfo);
      
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
          finalX,
          gapConfig: spaceInfo.gapConfig
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
          finalX,
          gapConfig: spaceInfo.gapConfig
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
      
      // 실제 슬롯 너비 가져오기 (slotWidths 사용)
      const targetZoneInfo = zoneToUse === 'dropped' ? zoneInfo.dropped : zoneInfo.normal;
      const actualSlotWidth = zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined
        ? zoneIndexing.slotWidths[zoneSlotIndex] 
        : zoneIndexing.columnWidth; // Math.floor 대신 columnWidth 사용
      
      // 듀얼 가구의 경우 두 슬롯의 실제 너비 합계
      let customWidth;
      if (isDual && zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
        customWidth = zoneIndexing.slotWidths[zoneSlotIndex] + (zoneIndexing.slotWidths[zoneSlotIndex + 1] || zoneIndexing.slotWidths[zoneSlotIndex]);
      } else if (zoneIndexing.slotWidths && zoneIndexing.slotWidths[zoneSlotIndex] !== undefined) {
        // 싱글 가구의 경우 실제 슬롯 너비 사용
        customWidth = zoneIndexing.slotWidths[zoneSlotIndex];
      } else {
        customWidth = actualSlotWidth;
      }
      
      console.log('🎯 가구 배치 정보:', {
        zone: zoneToUse,
        슬롯인덱스: zoneSlotIndex,
        슬롯너비: actualSlotWidth,
        모듈너비: moduleData.dimensions.width,
        customWidth: customWidth,
        adjustedWidth: moduleData.dimensions.width,
        차이: Math.abs(moduleData.dimensions.width - customWidth),
        위치X: finalX,
        위치X_mm: finalX * 100,
        마지막슬롯여부: zoneSlotIndex === targetZoneInfo.columnCount - 1,
        영역시작X_mm: targetZoneInfo.startX,
        영역끝X_mm: targetZoneInfo.startX + targetZoneInfo.width,
        가구왼쪽끝_mm: (finalX * 100) - (customWidth / 2),
        가구오른쪽끝_mm: (finalX * 100) + (customWidth / 2),
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
      
      // 새 모듈 배치
      const newModule = {
        id: placedId,
        moduleId: zoneTargetModuleId, // 정확한 너비를 포함한 모듈 ID 사용
        position: { x: finalX, y: 0, z: 0 },
        rotation: 0,
        hasDoor: false,
        customDepth: defaultDepth,
        slotIndex: zoneSlotIndex,  // 영역 내 인덱스 사용
        isDualSlot: isDual,
        isValidInCurrentSpace: true,
        adjustedWidth: moduleData.dimensions.width,
        hingePosition: 'right' as 'left' | 'right',
        zone: zoneToUse, // 영역 정보 저장
        customWidth: customWidth, // 실제 슬롯 너비 사용
        customHeight: zoneToUse === 'dropped' && zoneInternalSpace ? zoneInternalSpace.height : undefined // 단내림 구간의 줄어든 높이 저장
      };
      
      console.log('✅ 가구 배치 완료:', {
        zone: zoneToUse,
        moduleId: zoneTargetModuleId,
        slotIndex: zoneSlotIndex,
        isDualSlot: isDual,
        isDualFromModuleId: zoneTargetModuleId.startsWith('dual-'),
        occupiedSlots: isDual ? [zoneSlotIndex, zoneSlotIndex + 1] : [zoneSlotIndex],
        position: { x: finalX },
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
      setCurrentDragData(null);
      
      // 전체 슬롯 점유 상태 디버깅
      setTimeout(() => {
        debugSlotOccupancy(placedModules, spaceInfo);
      }, 100);
      
      // 가구 배치 완료 이벤트 발생 (카메라 리셋용)
      window.dispatchEvent(new CustomEvent('furniture-placement-complete'));
      return true;
    } else {
      
      // activeZone이 없는 경우 자동으로 적절한 영역 결정
      if (spaceInfo.droppedCeiling?.enabled && !zoneToUse) {
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
        setCurrentDragData(null);
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
    
    // 듀얼/싱글 가구 판별 - moduleId로 직접 확인
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
    let finalX = calculateFurniturePosition(slotIndex, targetModuleId, spaceInfo);
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
    
    // 사용할 인덱싱 정보 결정 - activeZone에 따라 다른 인덱싱 사용
    let zoneTargetIndexing = indexing;
    if (spaceInfo.droppedCeiling?.enabled && activeZone && indexing.zones) {
      zoneTargetIndexing = activeZone === 'dropped' && indexing.zones.dropped 
        ? indexing.zones.dropped 
        : (activeZone === 'normal' && indexing.zones.normal ? indexing.zones.normal : indexing);
    }
    
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
        finalX = calculateFurniturePosition(slotIndex, dualTargetModuleId, spaceInfo);
        if (finalX === null) {
          console.error('❌ [SlotDropZones] Failed to calculate dual furniture position');
          return false;
        }
      } else {
        console.warn('⚠️ [SlotDropZones] Dual module not found with exact width, using single slot module:', dualTargetModuleId);
      }
    }
    
    console.log('🎯 가구 배치 시 customWidth 설정:', {
      activeZone,
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
    
    // 새 모듈 배치
    const newModule = {
      id: placedId,
      moduleId: isDual ? dualTargetModuleId : targetModuleId, // 듀얼의 경우 합계 너비 ID 사용
      position: { x: finalX, y: 0, z: 0 },
      rotation: 0,
      hasDoor: false,
      customDepth: defaultDepth,
      slotIndex: slotIndex,
      isDualSlot: isDual,
      isValidInCurrentSpace: true,
      adjustedWidth: moduleData.dimensions.width,
      hingePosition: 'right' as 'left' | 'right',
      customWidth: customWidth, // 실제 슬롯 너비 사용
      zone: activeZone || undefined // 단내림 영역 정보 추가
    };
    
    // 듀얼 가구 배치 시 슬롯 점유 상태 로그
    console.log('🎯 가구 배치 완료:', {
      id: placedId,
      moduleId: newModule.moduleId,
      isDual,
      isDualSlot: newModule.isDualSlot,
      slotIndex,
      occupiedSlots: isDual ? [slotIndex, slotIndex + 1] : [slotIndex],
      zone: activeZone,
      position: finalX,
      width: moduleData.dimensions.width,
      customWidth
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
    const targetZone = activeZone || 'normal';
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
    
    setCurrentDragData(null);
    
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
    showAlert,
    activeZone
  ]);
  
  // window 객체에 함수 노출 - activeZone을 클로저로 포함
  useEffect(() => {
    console.log('🎯 SlotDropZonesSimple - registering window.handleSlotDrop');
    window.handleSlotDrop = (dragEvent: DragEvent, canvasElement: HTMLCanvasElement) => {
      console.log('🎯 window.handleSlotDrop called with activeZone:', activeZone);
      // activeZone을 현재 상태값으로 직접 전달
      return handleSlotDrop(dragEvent, canvasElement, activeZone);
    };
    
    return () => {
      console.log('🎯 SlotDropZonesSimple - unregistering window.handleSlotDrop');
      delete window.handleSlotDrop;
    };
  }, [handleSlotDrop, activeZone]);
  
  // 간단한 드래그오버 이벤트 핸들러
  useEffect(() => {
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
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        
        // 레이캐스트로 받은 slotIndex는 이미 영역별 로컬 인덱스
        // 활성 영역과 맞는지만 확인
        const allColliders = scene.children
          .flatMap(child => child.children || [child])
          .filter(obj => obj.userData?.isSlotCollider);
        
        
        const colliderUserData = allColliders
          .find(obj => obj.userData?.slotIndex === slotIndex && obj.userData?.isSlotCollider)
          ?.userData;
        
        // zone 정보 저장
        detectedZone = colliderUserData?.zone || 'normal';
        
        console.log('🔍 Zone 감지:', {
          slotIndex,
          detectedZone,
          colliderUserData,
          activeZone
        });
        
        // activeZone이 설정된 경우에만 zone 체크
        if (activeZone && colliderUserData?.zone !== activeZone) {
          setHoveredSlotIndex(null);
          setHoveredZone(null);
          return;
        }
      } else {
        // 단내림이 없는 경우 normal zone
        detectedZone = 'normal';
      }
      
      if (currentDragData) {
        // isDualFurniture 함수는 너비를 기대하지만, 더 정확한 방법은 moduleId 확인
        const isDual = currentDragData.moduleData.id.startsWith('dual-');
        
        // 단내림 구간일 경우 영역별 가구 확인
        const isAvailable = (() => {
          if (spaceInfo.droppedCeiling?.enabled && activeZone) {
            // 영역별 컬럼 수 가져오기
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const targetZone = activeZone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
            
            // 듀얼 가구가 영역 경계를 넘어가는지 체크
            if (isDual && slotIndex + 1 >= targetZone.columnCount) {
              console.log('🚫 Hover: 듀얼 가구가 영역 경계를 넘어감:', {
                activeZone,
                slotIndex,
                targetZoneColumnCount: targetZone.columnCount,
                필요한슬롯: [slotIndex, slotIndex + 1],
                영역범위: `0 ~ ${targetZone.columnCount - 1}`
              });
              return false;
            }
            
            // 단내림 구간: 동일 영역의 가구만 확인
            const zoneModules = placedModules.filter(m => m.zone === activeZone);
            
            // 단내림 구간 슬롯 점유 상태 로깅
            console.log('🏗️ 단내림 구간 슬롯 점유 상태 (hover):', {
              activeZone,
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
            return isSlotAvailable(slotIndex, isDual, placedModules, spaceInfo, currentDragData.moduleData.id);
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
        activeZone,
        defaultPositions: indexing.threeUnitPositions,
        indexingExists: !!indexing,
        threeUnitPositionsExists: !!indexing?.threeUnitPositions,
        isArray: Array.isArray(indexing?.threeUnitPositions)
      });
      return indexing.threeUnitPositions || [];
    }
    
    // 단내림이 있지만 activeZone이 없는 경우 모든 영역의 콜라이더 생성
    if (!activeZone) {
      console.log('🎯 getZoneSlotPositions - creating colliders for both zones');
      const fullIndexing = calculateSpaceIndexing(spaceInfo);
      
      const allPositions = [];
      
      // normal 영역 콜라이더
      if (fullIndexing.zones?.normal?.threeUnitPositions) {
        allPositions.push(...fullIndexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
          position: pos,
          zone: 'normal',
          index: idx
        })));
      }
      
      // dropped 영역 콜라이더
      if (fullIndexing.zones?.dropped?.threeUnitPositions) {
        allPositions.push(...fullIndexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
          position: pos,
          zone: 'dropped',
          index: idx
        })));
      }
      
      return allPositions;
    }
    
    // 활성 영역에 따른 슬롯 위치 계산
    // 중요: calculateSpaceIndexing에서 계산된 실제 위치를 사용해야 함
    const fullIndexing = calculateSpaceIndexing(spaceInfo);
    
    console.log('🔍 fullIndexing debug:', {
      hasZones: !!fullIndexing.zones,
      hasNormal: !!fullIndexing.zones?.normal,
      hasDropped: !!fullIndexing.zones?.dropped,
      normalPositions: fullIndexing.zones?.normal?.threeUnitPositions,
      droppedPositions: fullIndexing.zones?.dropped?.threeUnitPositions,
      activeZone,
      hasDroppedCeiling: spaceInfo.droppedCeiling?.enabled,
      droppedCeilingInfo: spaceInfo.droppedCeiling,
      fullIndexing: fullIndexing
    });
    
    if (activeZone === 'normal' && fullIndexing.zones?.normal?.threeUnitPositions) {
      console.log('🎯 Using calculated normal zone positions:', fullIndexing.zones.normal.threeUnitPositions);
      return fullIndexing.zones.normal.threeUnitPositions;
    } else if (activeZone === 'dropped' && fullIndexing.zones?.dropped?.threeUnitPositions) {
      console.log('🎯 Using calculated dropped zone positions:', fullIndexing.zones.dropped.threeUnitPositions);
      return fullIndexing.zones.dropped.threeUnitPositions;
    }
    
    // fallback: 직접 계산 (이전 로직 유지)
    if (activeZone === 'normal') {
      const normalColumnCount = zoneSlotInfo.normal.columnCount;
      const normalStartX = mmToThreeUnits(zoneSlotInfo.normal.startX);
      const normalColumnWidth = mmToThreeUnits(zoneSlotInfo.normal.columnWidth);
      
      console.log('🎯 getZoneSlotPositions - fallback normal zone calculation');
      
      return Array.from({ length: normalColumnCount }, (_, i) => 
        normalStartX + (i * normalColumnWidth) + (normalColumnWidth / 2)
      );
    } else if (activeZone === 'dropped') {
      const droppedColumnCount = zoneSlotInfo.dropped.columnCount;
      const droppedStartX = mmToThreeUnits(zoneSlotInfo.dropped.startX);
      const droppedColumnWidth = mmToThreeUnits(zoneSlotInfo.dropped.columnWidth);
      
      console.log('🎯 getZoneSlotPositions - fallback dropped zone calculation:', {
        droppedColumnCount,
        droppedStartX,
        droppedColumnWidth
      });
      
      return Array.from({ length: droppedColumnCount }, (_, i) => 
        droppedStartX + (i * droppedColumnWidth) + (droppedColumnWidth / 2)
      );
    }
    
    return [];
  };
  
  const zoneSlotPositions = getZoneSlotPositions();
  
  // 배열이 아닌 경우 빈 배열로 처리
  if (!Array.isArray(zoneSlotPositions)) {
    console.error('❌ getZoneSlotPositions returned non-array:', zoneSlotPositions);
    return <group />;
  }
  
  console.log('🎯 SlotDropZonesSimple - rendering colliders:', {
    zoneSlotPositionsLength: zoneSlotPositions.length,
    activeZone,
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
      {zoneSlotPositions.map((slotData, slotIndex) => {
        // slotData가 객체인지 숫자인지 확인
        const isZoneData = typeof slotData === 'object' && slotData !== null;
        const slotX = isZoneData ? slotData.position : slotData;
        const slotZone = isZoneData ? slotData.zone : activeZone;
        const slotLocalIndex = isZoneData ? slotData.index : slotIndex;
        // 앞쪽에서 20mm 줄이기
        const reducedDepth = slotDimensions.depth - mmToThreeUnits(20);
        const zOffset = -mmToThreeUnits(10); // 뒤쪽으로 10mm 이동 (앞쪽에서만 20mm 줄이기 위해)
        
        // 영역별 슬롯 너비 계산
        let slotWidth = slotDimensions.width;
        if (hasDroppedCeiling && zoneSlotInfo) {
          const currentZone = slotZone || activeZone;
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
        const currentZone = slotZone || activeZone;
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
            key={`slot-collider-${slotIndex}`}
            position={[slotX, colliderY, zOffset]}
            userData={{ 
              slotIndex: slotLocalIndex,  // 영역 내 로컬 인덱스 (항상 0부터 시작)
              isSlotCollider: true,
              type: 'slot-collider',
              zone: slotZone,  // 영역 정보 추가
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
        const slotFloorDepth = frameEndZ - roomBackZ; // 바닥 슬롯 메쉬 깊이
        const slotFloorZ = (frameEndZ + roomBackZ) / 2; // 바닥 중심 Z 좌표
        
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
          // 단내림 활성화된 경우 activeZone에 따라 분리
          if (activeZone === 'normal') {
            // 메인구간: 메인 영역만 표시
            const leftX = mmToThreeUnits(zoneSlotInfo.normal.startX);
            const rightX = mmToThreeUnits(zoneSlotInfo.normal.startX + zoneSlotInfo.normal.width);
            const centerX = (leftX + rightX) / 2;
            const width = rightX - leftX;
            
            return (
              <group key="main-zone-group">
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
                <lineSegments
                  position={[centerX, floorY, slotFloorZ]}
                >
                  <edgesGeometry args={[new THREE.BoxGeometry(width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth)]} />
                  <lineBasicMaterial color={primaryColor} opacity={0.8} transparent />
                </lineSegments>
              </group>
            );
          } else if (activeZone === 'dropped') {
            // 단내림 구간: 단내림 영역만 표시
            const leftX = mmToThreeUnits(zoneSlotInfo.dropped.startX);
            const rightX = mmToThreeUnits(zoneSlotInfo.dropped.startX + zoneSlotInfo.dropped.width);
            const centerX = (leftX + rightX) / 2;
            const width = rightX - leftX;
            
            return (
              <group key="dropped-zone-group">
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
                <lineSegments
                  position={[centerX, floorY, slotFloorZ]}
                >
                  <edgesGeometry args={[new THREE.BoxGeometry(width, viewMode === '2D' ? 0.1 : 0.001, slotFloorDepth)]} />
                  <lineBasicMaterial color={primaryColor} opacity={0.8} transparent />
                </lineSegments>
              </group>
            );
          } else {
            // activeZone이 설정되지 않은 경우 양쪽 영역 모두 표시
            return (
              <>
                {/* 메인 영역 표시 */}
                <group key="main-zone-group">
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
          }
        } else {
          // 단내림이 없는 경우 전체 영역 표시
          const leftX = indexing.threeUnitBoundaries[0];
          const rightX = indexing.threeUnitBoundaries[indexing.threeUnitBoundaries.length - 1];
          const centerX = (leftX + rightX) / 2;
          const width = rightX - leftX;
          
          return (
            <group key="full-zone-group">
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
      {hoveredSlotIndex !== null && currentDragData && zoneSlotPositions.map((slotData, slotIndex) => {
        // slotData가 객체인지 숫자인지 확인하여 위치 추출
        const isZoneData = typeof slotData === 'object' && slotData !== null;
        const slotX = isZoneData ? slotData.position : slotData;
        const slotZone = isZoneData ? slotData.zone : activeZone;
        const slotLocalIndex = isZoneData ? slotData.index : slotIndex;
        
        // 현재 드래그 중인 가구가 듀얼인지 확인
        let isDual = false;
        if (currentDragData) {
          isDual = currentDragData.moduleData.id.startsWith('dual-');
        }
        
        // 고스트 렌더링 여부 결정
        let shouldRenderGhost = false;
        if (hoveredSlotIndex !== null && currentDragData) {
          // zone 정보가 있는 경우 로컬 인덱스로 비교
          const compareIndex = isZoneData ? slotLocalIndex : slotIndex;
          
          // zone이 일치하는지도 체크
          // hoveredZone이 null이면 zone 체크를 하지 않음 (모든 영역 허용)
          // hoveredZone이 있으면 해당 zone과 일치하는지 체크
          const zoneMatches = !hoveredZone || hoveredZone === slotZone;
          
          if (isDual) {
            // 듀얼 가구: 첫 번째 슬롯에서만 고스트 렌더링
            shouldRenderGhost = compareIndex === hoveredSlotIndex && zoneMatches;
          } else {
            // 싱글 가구: 현재 슬롯에서만 고스트 렌더링
            shouldRenderGhost = compareIndex === hoveredSlotIndex && zoneMatches;
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
            shouldRenderGhost
          });
        }
        
        if (!shouldRenderGhost || !currentDragData) return null;
        
        // 드래그 중인 가구의 모듈 데이터 가져오기
        let moduleData;
        
        // 단내림이 활성화된 경우 영역별 모듈 생성
        let zoneInternalSpace = null; // 미리보기에서 사용할 변수 선언
        // activeZone이 없어도 slotZone 정보로 영역 판단
        const effectiveZone = activeZone || slotZone;
        
        console.log('🔥 고스트 생성 디버그:', {
          slotIndex,
          slotLocalIndex,
          hoveredSlotIndex,
          hoveredZone,
          activeZone,
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
          } else {
            // 메인 영역용 spaceInfo
            zoneSpaceInfo = {
              ...spaceInfo,
              width: spaceInfo.width - droppedCeilingWidth,  // 메인 영역의 외경 너비
              zone: 'normal' as const
            };
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
          const baseType = currentDragData.moduleData.id.replace(/-\d+$/, '');
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
          
          const targetModuleId = `${baseType}-${targetWidth}`;
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
          moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        }
        
        if (!moduleData) {
          console.error('❌ [Ghost Preview] 미리보기 모듈을 찾을 수 없음');
          return null;
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
          
          if (isDual && slotIndex < zoneInfo.columnCount - 1) {
            // 듀얼 가구
            let leftSlotX, rightSlotX;
            
            // 마지막-1 슬롯이 듀얼인 경우 마지막 슬롯의 실제 너비 고려
            if (slotIndex === zoneInfo.columnCount - 2) {
              leftSlotX = startX + (slotIndex * columnWidth) + (columnWidth / 2);
              const lastSlotStart = startX + ((slotIndex + 1) * columnWidth);
              const lastSlotEnd = startX + mmToThreeUnits(zoneInfo.width);
              rightSlotX = (lastSlotStart + lastSlotEnd) / 2;
            } else {
              leftSlotX = startX + (slotIndex * columnWidth) + (columnWidth / 2);
              rightSlotX = startX + ((slotIndex + 1) * columnWidth) + (columnWidth / 2);
            }
            previewX = (leftSlotX + rightSlotX) / 2;
          } else {
            // 싱글 가구
            if (slotIndex === zoneInfo.columnCount - 1) {
              // 마지막 슬롯: 실제 남은 공간의 중앙
              const lastSlotStart = startX + (slotIndex * columnWidth);
              const lastSlotEnd = startX + mmToThreeUnits(zoneInfo.width);
              previewX = (lastSlotStart + lastSlotEnd) / 2;
            } else {
              previewX = startX + (slotIndex * columnWidth) + (columnWidth / 2);
            }
          }
        } else if (isDual && slotIndex === hoveredSlotIndex) {
          // 일반 구간 - indexing의 threeUnitDualPositions 사용
          if (indexing.threeUnitDualPositions && indexing.threeUnitDualPositions[slotIndex] !== undefined) {
            previewX = indexing.threeUnitDualPositions[slotIndex];
          }
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