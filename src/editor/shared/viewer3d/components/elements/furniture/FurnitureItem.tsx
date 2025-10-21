import React, { useEffect } from 'react';
import { Box, Edges, Html } from '@react-three/drei';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import BoxModule from '../../modules/BoxModule';
import * as THREE from 'three';
import { analyzeColumnSlots, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition } from '@/editor/shared/utils/columnSlotProcessor';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import DoorModule from '../../modules/DoorModule';
import { useUIStore } from '@/store/uiStore';
import { EditIcon } from '@/components/common/Icons';
import { getEdgeColor } from '../../../utils/edgeColorUtils';
import { useColumnCResize } from '@/editor/shared/furniture/hooks/useColumnCResize';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import EndPanelWithTexture from '../../modules/components/EndPanelWithTexture';
import { useTheme } from '@/contexts/ThemeContext';

// 엔드패널 두께 상수
const END_PANEL_THICKNESS = 18; // mm

// 상부장/하부장과 키큰장(듀얼 포함)의 인접 판단 함수
const checkAdjacentUpperLowerToFull = (
  currentModule: PlacedModule,
  allModules: PlacedModule[],
  spaceInfo: SpaceInfo
): { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | 'both' | null } => {
  // 현재 가구가 키큰장(full) 또는 듀얼 캐비넷인지 확인
  const currentModuleData = getModuleById(currentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
  if (!currentModuleData) {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }
  
  // 키큰장(full)이 아니면 처리하지 않음
  // 듀얼 캐비넷이어도 상부장/하부장이면 엔드패널 처리하지 않음
  const isDualCabinet = currentModule.moduleId?.includes('dual-');
  
  // 키큰장(full 카테고리)만 처리
  // 듀얼 상부장/하부장은 처리하지 않음 (같은 카테고리끼리는 엔드패널 불필요)
  if (currentModuleData.category !== 'full') {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 현재 가구의 슬롯 인덱스
  const currentSlotIndex = currentModule.slotIndex;
  if (currentSlotIndex === undefined) {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 듀얼 캐비넷의 경우 두 개의 슬롯을 차지
  const isCurrentDual = isDualCabinet || currentModule.isDualSlot;
  
  // 단내림이 활성화된 경우, 현재 모듈의 zone 사용
  let currentZone: 'normal' | 'dropped' | undefined = currentModule.zone;
  if (spaceInfo.droppedCeiling?.enabled && currentZone) {
    }
  
  // 인접한 슬롯에 상부장/하부장이 있는지 확인
  // 왼쪽: 싱글 가구는 -1, 듀얼 가구는 시작 슬롯이 -2 위치에 있어야 함
  let leftAdjacentModule = allModules.find(m => {
    // 왼쪽에 있는 가구가 듀얼인 경우 처리
    const isLeftDual = m.moduleId?.includes('dual-');
    if (isLeftDual) {
      // 듀얼 가구의 시작 슬롯이 currentSlotIndex - 2 위치에 있고,
      // 듀얼이 차지하는 두 번째 슬롯(+1)이 현재 가구 바로 왼쪽(currentSlotIndex - 1)에 있는지 확인
      const isAdjacent = m.slotIndex === currentSlotIndex - 2;
      if (isAdjacent) {
        }
      return isAdjacent;
    } else {
      // 싱글 가구는 바로 왼쪽 슬롯에 있어야 함
      const isAdjacent = m.slotIndex === currentSlotIndex - 1;
      if (isAdjacent) {
        }
      return isAdjacent;
    }
  });
  
  // 오른쪽: 현재 가구가 듀얼이면 +2, 싱글이면 +1 위치 체크
  let rightAdjacentModule = isCurrentDual 
    ? allModules.find(m => m.slotIndex === currentSlotIndex + 2)  // 듀얼은 +2
    : allModules.find(m => m.slotIndex === currentSlotIndex + 1); // 싱글은 +1
  
  // 단내림이 활성화된 경우, 인접 모듈이 같은 zone에 있는지 확인
  if (currentZone && spaceInfo.droppedCeiling?.enabled) {
    // 왼쪽 인접 모듈이 다른 zone에 있으면 무시
    if (leftAdjacentModule) {
      const leftZone = leftAdjacentModule.zone;
      if (leftZone !== currentZone) {
        leftAdjacentModule = undefined;
      }
    }
    
    // 오른쪽 인접 모듈이 다른 zone에 있으면 무시
    if (rightAdjacentModule) {
      const rightZone = rightAdjacentModule.zone;
      if (rightZone !== currentZone) {
        rightAdjacentModule = undefined;
      }
    }
  }
  
  // 왼쪽 인접 모듈이 상부장/하부장인지 확인
  let hasLeftAdjacent = false;
  if (leftAdjacentModule) {
    // 상하부장 판단을 모듈 ID로 직접 수행 (더 안정적)
    const isLeftUpperCabinet = leftAdjacentModule.moduleId?.includes('upper-cabinet');
    const isLeftLowerCabinet = leftAdjacentModule.moduleId?.includes('lower-cabinet');
    const isLeftUpperLower = isLeftUpperCabinet || isLeftLowerCabinet;
    
    if (isLeftUpperLower) {
      hasLeftAdjacent = true;
    }
  }
  
  // 오른쪽 인접 모듈이 상부장/하부장인지 확인
  let hasRightAdjacent = false;
  if (rightAdjacentModule) {
    // 상하부장 판단을 모듈 ID로 직접 수행 (더 안정적)
    const isRightUpperCabinet = rightAdjacentModule.moduleId?.includes('upper-cabinet');
    const isRightLowerCabinet = rightAdjacentModule.moduleId?.includes('lower-cabinet');
    const isRightUpperLower = isRightUpperCabinet || isRightLowerCabinet;
    
    if (isRightUpperLower) {
      hasRightAdjacent = true;
    }
  }

  // 결과 반환
  const result = (() => {
    if (hasLeftAdjacent && hasRightAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'both' as const };
    } else if (hasLeftAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'left' as const };
    } else if (hasRightAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'right' as const };
    }
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  })();

  // 듀얼 가구일 때만 디버그 로그
  if (isCurrentDual) {
    }

  return result;
};

interface FurnitureItemProps {
  placedModule: PlacedModule;
  placedModules: PlacedModule[]; // 추가
  spaceInfo: SpaceInfo;
  furnitureStartY: number;
  isDragMode: boolean;
  isEditMode: boolean;
  isDraggingThis: boolean;
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode: 'solid' | 'wireframe';
  showFurniture?: boolean; // 가구 본체 표시 여부
  onPointerDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>, id: string) => void;
}

const FurnitureItem: React.FC<FurnitureItemProps> = ({
  placedModule,
  placedModules,
  spaceInfo,
  furnitureStartY,
  isDragMode,
  isEditMode,
  isDraggingThis,
  viewMode,
  view2DDirection,
  renderMode,
  showFurniture = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick
}) => {
  // Three.js 컨텍스트 접근
  const { gl, invalidate, scene, camera } = useThree();

  // 디버그: showFurniture 값 확인
  useEffect(() => {
    console.log('🎯 FurnitureItem - showFurniture:', showFurniture, 'placedModuleId:', placedModule.id, 'moduleId:', placedModule.moduleId);
  }, [showFurniture, placedModule.id, placedModule.moduleId]);
  const { isFurnitureDragging, showDimensions, view2DTheme, selectedFurnitureId, selectedSlotIndex } = useUIStore();
  const { updatePlacedModule } = useFurnitureStore();
  const [isHovered, setIsHovered] = React.useState(false);
  const isSelected = viewMode === '3D' && selectedFurnitureId === placedModule.id;
  const { theme: appTheme } = useTheme();
  
  // 테마 색상 매핑
  const themeColorMap: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };
  
  const selectionHighlightColor = themeColorMap[appTheme.color] || '#3b82f6';
  const highlightPadding = 0.02; // ≒2mm 추가 여유
  const highlightMeshRef = React.useRef<THREE.Mesh>(null);
  
  // 렌더링 추적 및 클린업
  React.useEffect(() => {
    // 마운트/언마운트 로그 제거 (성능 최적화)
    return () => {
      // 무거운 클린업 제거 - React Three Fiber가 자동으로 처리
    };
  }, [placedModule.id]);

  React.useEffect(() => {
    if (!isSelected) return;
    if (!highlightMeshRef.current) return;
    // 강조용 보조 메쉬는 입력 이벤트에서 제외한다.
    highlightMeshRef.current.raycast = () => null;
    highlightMeshRef.current.traverse(child => {
      child.raycast = () => null;
    });
  }, [isSelected]);

  // 섹션 깊이 변경 추적
  React.useEffect(() => {
    console.log('🔍 FurnitureItem - placedModule 섹션 깊이 변경:', {
      id: placedModule.id,
      moduleId: placedModule.moduleId,
      lowerSectionDepth: placedModule.lowerSectionDepth,
      upperSectionDepth: placedModule.upperSectionDepth
    });
  }, [placedModule.lowerSectionDepth, placedModule.upperSectionDepth, placedModule.id, placedModule.moduleId]);
  
  // 테마 색상 가져오기
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  
  // 내경 공간 계산 - zone 정보가 있으면 zone별 계산
  let internalSpace = calculateInternalSpace(spaceInfo);
  let zoneSpaceInfo = spaceInfo;
  
  // 단내림이 활성화되고 zone 정보가 있는 경우 영역별 처리
  // 높이는 항상 재계산해야 하므로 조건 제거
  if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // 단내림 영역별 외경 너비 계산 (프레임 포함)
    const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;
    let zoneOuterWidth: number;
    
    if (placedModule.zone === 'dropped') {
      // 단내림 영역의 외경 너비
      zoneOuterWidth = droppedCeilingWidth;
    } else {
      // 메인 영역의 외경 너비
      zoneOuterWidth = spaceInfo.width - droppedCeilingWidth;
    }
    
    // 영역별 spaceInfo 생성
    zoneSpaceInfo = {
      ...spaceInfo,
      width: zoneOuterWidth,  // zone의 외경 너비
      zone: placedModule.zone  // zone 정보 추가
    };
    
    internalSpace = calculateInternalSpace(zoneSpaceInfo);
    internalSpace.startX = targetZone.startX;
    
    // calculateInternalSpace에서 이미 zone === 'dropped'일 때 높이를 조정하므로
    // 여기서는 추가 조정하지 않음
    if (placedModule.zone === 'dropped') {
      }
  }
  
  // 모듈 데이터 가져오기 - zone별 spaceInfo 사용
  // 가구 위치 변경 시 렌더링 업데이트 및 그림자 업데이트
  // Hook은 조건부 return 전에 선언되어야 함
  useEffect(() => {
    invalidate();
    
    // 3D 모드에서 그림자 강제 업데이트
    if (gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;
      
      // 메쉬 렌더링 완료 보장을 위한 지연 업데이트
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 100);
      
      // 추가로 300ms 후에도 한 번 더 (완전한 렌더링 보장)
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 300);
    }
  }, [placedModule.position.x, placedModule.position.y, placedModule.position.z, placedModule.id, invalidate, gl]);

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 기둥 포함 슬롯 분석 (기둥 변경사항 실시간 반영)
  // Hook은 조건부 return 전에 선언되어야 함
  const columnSlots = React.useMemo(() => {
    return analyzeColumnSlots(spaceInfo, placedModules);
  }, [spaceInfo, spaceInfo.columns, placedModule.id, placedModule.slotIndex, placedModules]);

  // Column C 크기 조절 훅 - 모든 Hook은 조건부 return 전에 호출되어야 함
  // 실제 값은 나중에 계산되므로 여기서는 기본값으로 호출
  const [columnCParams, setColumnCParams] = React.useState({
    isEnabled: false,
    depth: 300,
    width: 600
  });
  
  const columnCResize = useColumnCResize(
    placedModule,
    columnCParams.isEnabled,
    columnCParams.depth,
    columnCParams.width
  );

  // 위치 변경 로깅용 useEffect - early return 전에 선언
  const [positionLogData, setPositionLogData] = React.useState<any>(null);
  
  useEffect(() => {
    if (positionLogData) {
      }
  }, [positionLogData]);

  // Column C 파라미터 업데이트를 위한 상태와 useEffect
  const [columnCState, setColumnCState] = React.useState<{
    isEnabled: boolean;
    depth: number;
    width: number;
  } | null>(null);
  
  React.useEffect(() => {
    if (columnCState) {
      setColumnCParams(columnCState);
    }
  }, [columnCState]);
  
  // 위치 로깅을 위한 상태와 useEffect
  const [positionState, setPositionState] = React.useState<any>(null);
  
  React.useEffect(() => {
    if (positionState) {
      setPositionLogData(positionState);
    }
  }, [positionState]);
  
  // 모든 Hook 선언을 여기에 추가 (조건부 return 이전)
  // 이 Hook들은 나중에 계산되는 변수들을 사용하므로 별도 state로 관리
  const [deferredEffects, setDeferredEffects] = React.useState<{
    columnC?: any;
    position?: any;
  }>({});
  
  React.useEffect(() => {
    if (deferredEffects.columnC) {
      setColumnCParams(deferredEffects.columnC);
    }
  }, [deferredEffects.columnC]);
  
  React.useEffect(() => {
    if (deferredEffects.position) {
      setPositionLogData(deferredEffects.position);
    }
  }, [deferredEffects.position]);
  
  // Column C와 위치 계산을 위한 상태 - 나중에 계산될 값들
  const [calculatedValues, setCalculatedValues] = React.useState<{
    isColumnCFront?: boolean;
    slotInfoColumn?: any;
    indexingColumnWidth?: number;
    adjustedPosition?: any;
    actualModuleData?: any;
  }>({});
  
  // 계산된 값들이 변경될 때 deferredEffects 업데이트
  React.useEffect(() => {
    if (calculatedValues.isColumnCFront !== undefined) {
      setDeferredEffects({
        columnC: {
          isEnabled: calculatedValues.isColumnCFront,
          depth: calculatedValues.slotInfoColumn?.depth || 300,
          width: calculatedValues.indexingColumnWidth || 600
        },
        position: {
          id: placedModule.id,
          isEditMode,
          placedModulePosition: placedModule.position,
          adjustedPosition: calculatedValues.adjustedPosition,
          positionDifference: calculatedValues.adjustedPosition ? {
            x: calculatedValues.adjustedPosition.x - placedModule.position.x,
            y: calculatedValues.adjustedPosition.y - placedModule.position.y,
            z: calculatedValues.adjustedPosition.z - placedModule.position.z
          } : { x: 0, y: 0, z: 0 },
          zone: placedModule.zone,
          category: calculatedValues.actualModuleData?.category
        }
      });
    }
  }, [calculatedValues, placedModule.id, isEditMode, placedModule.position, placedModule.zone]);

  // 너비에 따라 모듈 ID 생성 (targetModuleId 정의를 getModuleById 호출 전으로 이동)
  let targetModuleId = placedModule.moduleId;
  
  // 싱글 상하부장 디버깅
  const isUpperCabinet = placedModule.moduleId.includes('upper-cabinet');
  const isLowerCabinet = placedModule.moduleId.includes('lower-cabinet');
  const isDualCabinet = placedModule.moduleId.includes('dual-');
  
  if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
    console.log('🔍 싱글 상하부장 처리 시작:', {
      original: placedModule.moduleId,
      customWidth: placedModule.customWidth,
      adjustedWidth: placedModule.adjustedWidth,
      internalSpace,
      zoneSpaceInfo
    });
  }
  
  // adjustedWidth가 있는 경우 (기둥 A 침범) - 원본 모듈 ID 사용
  // 폭 조정은 렌더링 시에만 적용
  if (placedModule.adjustedWidth) {
    // 기둥 A 침범 - 원본 모듈 사용, 폭은 렌더링 시 조정
  }
  // customWidth가 있고 adjustedWidth가 없는 경우 - customWidth로 모듈 ID 생성
  else if (placedModule.customWidth && !placedModule.adjustedWidth) {
    // 상하부장 특별 처리
    const isUpperLower = targetModuleId.includes('upper-cabinet') || targetModuleId.includes('lower-cabinet');
    
    if (isUpperLower) {
      // 싱글 상하부장의 경우 customWidth를 무조건 적용
      // 이미 customWidth가 포함되어 있어도 다시 설정
      const baseId = targetModuleId.replace(/-\d+$/, '');
      targetModuleId = `${baseId}-${placedModule.customWidth}`;
      
      if (!isDualCabinet) {
        console.log('🎯 싱글 상하부장 ID 강제 변경:', {
          original: placedModule.moduleId,
          baseId,
          customWidth: placedModule.customWidth,
          newTargetId: targetModuleId
        });
      }
    } else {
      // 일반 가구: 이미 customWidth를 포함하고 있지 않을 때만 변경
      if (!targetModuleId.endsWith(`-${placedModule.customWidth}`)) {
        const baseType = targetModuleId.replace(/-\d+$/, '');
        targetModuleId = `${baseType}-${placedModule.customWidth}`;
      }
    }
  }

  // getModuleById 호출
  let moduleData = getModuleById(targetModuleId, internalSpace, zoneSpaceInfo);
  
  if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
    console.log('📌 싱글 상하부장 getModuleById 결과:', {
      targetModuleId,
      moduleDataFound: !!moduleData,
      moduleData: moduleData ? { id: moduleData.id, dimensions: moduleData.dimensions } : null
    });
  }
  
  // moduleData가 없으면 기본 모듈 ID로 재시도
  if (!moduleData && targetModuleId !== placedModule.moduleId) {
    if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
      console.log('⚠️ 싱글 상하부장 첫 시도 실패, 원본 ID로 재시도:', placedModule.moduleId);
    }
    // targetModuleId로 모듈을 찾을 수 없음, 원본 ID로 재시도
    moduleData = getModuleById(placedModule.moduleId, internalSpace, zoneSpaceInfo);
    
    if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
      console.log('📌 싱글 상하부장 원본 ID 재시도 결과:', {
        moduleDataFound: !!moduleData
      });
    }
  }
  
  // 그래도 못 찾으면 다양한 패턴으로 재시도
  if (!moduleData) {
    const parts = placedModule.moduleId.split('-');
    
    // 상하부장 특별 처리
    const isUpperCabinetFallback = placedModule.moduleId.includes('upper-cabinet');
    const isLowerCabinetFallback = placedModule.moduleId.includes('lower-cabinet');
    
    if (isUpperCabinetFallback || isLowerCabinetFallback) {
      if (!isDualCabinet) {
        console.log('🚨 싱글 상하부장 모든 시도 실패, 패턴 재시도 시작');
      }
      
      // 상하부장의 경우 너비를 변경해서 재시도
      // 예: upper-cabinet-shelf-600 -> upper-cabinet-shelf-[슬롯너비]
      if (internalSpace) {
        const baseId = targetModuleId.replace(/-\d+$/, '');
        
        // 슬롯 너비 우선 사용
        let tryWidth = placedModule.customWidth || internalSpace.width;
        
        // 슬롯 인덱스가 있고 indexing 정보가 있으면 슬롯 너비 사용
        if (placedModule.slotIndex !== undefined && indexing && indexing.columnWidth) {
          tryWidth = indexing.columnWidth;
          if (!isDualCabinet) {
            console.log('🔧 싱글 상하부장 슬롯 너비로 시도:', {
              slotIndex: placedModule.slotIndex,
              columnWidth: indexing.columnWidth,
              tryWidth
            });
          }
        }
        
        const newId = `${baseId}-${tryWidth}`;
        
        if (!isDualCabinet) {
          console.log('🔧 싱글 상하부장 시도 ID:', newId);
        }
        
        moduleData = getModuleById(newId, internalSpace, zoneSpaceInfo);
        
        // 그래도 못 찾으면 다양한 너비들로 시도
        if (!moduleData) {
          // 슬롯 기반 너비들 먼저 시도
          const tryWidths = [
            placedModule.customWidth,
            indexing?.columnWidth,
            internalSpace.width,
            600, 900, 1200, 1500, 1800
          ].filter(w => w && w > 0);
          
          // 중복 제거
          const uniqueWidths = [...new Set(tryWidths)];
          
          for (const width of uniqueWidths) {
            const testId = `${baseId}-${width}`;
            if (!isDualCabinet) {
              console.log('🔧 싱글 상하부장 너비로 시도:', testId);
            }
            moduleData = getModuleById(testId, internalSpace, zoneSpaceInfo);
            if (moduleData) {
              if (!isDualCabinet) {
                console.log('✅ 싱글 상하부장 찾음!:', testId);
              }
              break;
            }
          }
        }
      }
    } else {
      // 일반 가구 처리 (기존 로직)
      if (parts.length >= 3) {
        // 마지막이 숫자면 제거하고 시도
        if (/^\d+$/.test(parts[parts.length - 1])) {
          const withoutWidth = parts.slice(0, -1).join('-');
          moduleData = getModuleById(withoutWidth, internalSpace, zoneSpaceInfo);
        }
        
        // 그래도 없으면 upper/lower 제거하고 시도  
        if (!moduleData && (parts.includes('upper') || parts.includes('lower'))) {
          const withoutCategory = parts.filter(p => p !== 'upper' && p !== 'lower').join('-');
          moduleData = getModuleById(withoutCategory, internalSpace, zoneSpaceInfo);
        }
      }
      
      // 패턴 2: 기본 타입만으로 시도 (single-open)
      if (!moduleData) {
        const baseType = parts.slice(0, 2).join('-');
        if (baseType !== placedModule.moduleId) {
          moduleData = getModuleById(baseType, internalSpace, zoneSpaceInfo);
        }
      }
    }
    
    // customWidth 적용
    if (moduleData && placedModule.customWidth) {
      moduleData = {
        ...moduleData,
        dimensions: {
          ...moduleData.dimensions,
          width: placedModule.customWidth
        }
      };
    }
  }
  
  // moduleData가 없을 때 체크 - 단순 변수로 처리
  const moduleNotFound = !moduleData;
  
  // 도어 위치 고정을 위한 원래 슬롯 정보 계산 - zone별 처리
  let indexing;
  if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // zone별 indexing은 targetZone 정보를 직접 사용
    indexing = {
      columnCount: targetZone.columnCount,
      columnWidth: targetZone.columnWidth,
      threeUnitPositions: [],
      threeUnitDualPositions: {},
      threeUnitBoundaries: []
    };
  } else {
    indexing = calculateSpaceIndexing(zoneSpaceInfo);
  }

  const zoneSlotInfo = React.useMemo(() => {
    if (!spaceInfo.droppedCeiling?.enabled) {
      return null;
    }
    return ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
  }, [spaceInfo.droppedCeiling?.enabled, spaceInfo.customColumnCount, spaceInfo.width, spaceInfo.installType, spaceInfo.gapConfig, spaceInfo.surroundType]);

  const convertGlobalToZoneIndex = React.useCallback((
    index: number | undefined,
    zone: 'normal' | 'dropped' | undefined
  ): number | undefined => {
    if (index === undefined || zone === undefined) {
      return index;
    }

    if (!spaceInfo.droppedCeiling?.enabled || !zoneSlotInfo) {
      return index;
    }

    const zoneInfo = zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
    const zoneCount = zoneInfo?.columnCount ?? 0;

    const clampIndex = (value: number): number => {
      if (zoneCount <= 0) {
        return 0;
      }
      if (value < 0) {
        return 0;
      }
      if (value >= zoneCount) {
        return zoneCount - 1;
      }
      return value;
    };

    if (zoneCount > 0 && index >= 0 && index < zoneCount) {
      return index;
    }

    const droppedCount = zoneSlotInfo.dropped?.columnCount ?? 0;
    const normalCount = zoneSlotInfo.normal?.columnCount ?? 0;
    const position = spaceInfo.droppedCeiling.position;

    if (zone === 'normal' && position === 'left') {
      return clampIndex(index - droppedCount);
    }

    if (zone === 'dropped' && position === 'right') {
      return clampIndex(index - normalCount);
    }

    return clampIndex(index);
  }, [spaceInfo.droppedCeiling?.enabled, spaceInfo.droppedCeiling?.position, zoneSlotInfo]);

  const convertZoneToGlobalIndex = React.useCallback((
    index: number | undefined,
    zone: 'normal' | 'dropped' | undefined
  ): number | undefined => {
    if (index === undefined || zone === undefined) {
      return index;
    }

    if (!spaceInfo.droppedCeiling?.enabled || !zoneSlotInfo) {
      return index;
    }

    const zoneInfo = zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
    const zoneCount = zoneInfo?.columnCount ?? 0;

    if (zoneCount > 0 && index >= zoneCount) {
      return index;
    }

    if (zone === 'normal' && spaceInfo.droppedCeiling.position === 'left') {
      return index + (zoneSlotInfo.dropped?.columnCount ?? 0);
    }

    if (zone === 'dropped' && spaceInfo.droppedCeiling.position === 'right') {
      return index + (zoneSlotInfo.normal?.columnCount ?? 0);
    }

    return index;
  }, [spaceInfo.droppedCeiling?.enabled, spaceInfo.droppedCeiling?.position, zoneSlotInfo]);

  const localSlotIndex = React.useMemo(() => {
    if (placedModule.slotIndex === undefined) {
      return undefined;
    }
    return convertGlobalToZoneIndex(placedModule.slotIndex, placedModule.zone as 'normal' | 'dropped');
  }, [placedModule.slotIndex, placedModule.zone, convertGlobalToZoneIndex]);

  const globalSlotIndex = React.useMemo(() => {
    if (placedModule.slotIndex === undefined) {
      return undefined;
    }

    const baseIndex = localSlotIndex !== undefined ? localSlotIndex : placedModule.slotIndex;
    return convertZoneToGlobalIndex(baseIndex, placedModule.zone as 'normal' | 'dropped');
  }, [placedModule.slotIndex, placedModule.zone, localSlotIndex, convertZoneToGlobalIndex]);

  const normalizedSlotIndex = localSlotIndex ?? placedModule.slotIndex;

  const slotInfo = globalSlotIndex !== undefined ? columnSlots[globalSlotIndex] : undefined;

  const slotBoundaries = React.useMemo(() => {
    if (normalizedSlotIndex === undefined) {
      return null;
    }

    if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
      const targetZone = placedModule.zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
      if (targetZone) {
        const slotWidths = targetZone.slotWidths && targetZone.slotWidths.length === targetZone.columnCount
          ? targetZone.slotWidths
          : new Array(targetZone.columnCount).fill(targetZone.columnWidth);

        if (normalizedSlotIndex >= slotWidths.length) {
          return null;
        }

        let accumulated = targetZone.startX;
        for (let i = 0; i < normalizedSlotIndex; i++) {
          accumulated += slotWidths[i];
        }
        const left = accumulated;
        const right = accumulated + slotWidths[normalizedSlotIndex];

        return {
          left: left * 0.01,
          right: right * 0.01
        } as const;
      }
    }

    if (indexing.threeUnitBoundaries && indexing.threeUnitBoundaries.length > normalizedSlotIndex + 1) {
      return {
        left: indexing.threeUnitBoundaries[normalizedSlotIndex],
        right: indexing.threeUnitBoundaries[normalizedSlotIndex + 1]
      } as const;
    }

    return null;
  }, [normalizedSlotIndex, spaceInfo.droppedCeiling?.enabled, placedModule.zone, zoneSlotInfo, indexing.threeUnitBoundaries]);

  const isColumnC = (slotInfo?.columnType === 'medium') || false;
  
  // 듀얼 → 싱글 변환 확인 (드래그 중이 아닐 때만, 기둥 C가 아닐 때만)
  const actualModuleData = React.useMemo(() => {
    let result = moduleData;
    if (moduleData) {
      if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn && !isColumnC) {
        const conversionResult = convertDualToSingleIfNeeded(moduleData, slotInfo, spaceInfo);
        if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
          result = conversionResult.convertedModuleData;
        }
      }
      
      // Column C에서 싱글 가구로 변환 (듀얼 가구가 Column C에 배치된 경우)
      if (!isFurnitureDragging && isColumnC && moduleData.id.includes('dual-')) {
        result = {
          ...moduleData,
          id: moduleData.id.replace('dual-', 'single-'),
          name: moduleData.name.replace('듀얼', '싱글'),
          dimensions: {
            ...moduleData.dimensions,
            width: slotInfo?.subSlots ? 
              (placedModule.subSlotPosition === 'left' ? 
                slotInfo.subSlots.left.availableWidth : 
                slotInfo.subSlots.right.availableWidth) : 
              indexing.columnWidth / 2
          }
        };
      }
    }
    return result;
  }, [moduleData, isFurnitureDragging, slotInfo, isColumnC, spaceInfo, placedModule.subSlotPosition, indexing.columnWidth]);
  
  // 듀얼 가구인지 확인 (가장 먼저 계산)
  // placedModule.isDualSlot이 있으면 그것을 사용, 없으면 모듈 ID로 판단
  const isDualFurniture = placedModule.isDualSlot !== undefined 
    ? placedModule.isDualSlot 
    : actualModuleData?.id.includes('dual-') || false;
  
  // 상부장/하부장과 인접한 키큰장인지 확인 (actualModuleData가 있을 때만)
  const adjacentCheck = actualModuleData 
    ? checkAdjacentUpperLowerToFull(placedModule, placedModules, spaceInfo)
    : { hasAdjacentUpperLower: false, adjacentSide: null };
  
  // 듀얼 가구 인접 체크 디버깅
  if (isDualFurniture && actualModuleData) {
    }
  
  // 마지막 슬롯인지 확인 (adjustedPosition 초기화 전에 필요)
  const isLastSlot = normalizedSlotIndex !== undefined
    ? normalizedSlotIndex === indexing.columnCount - 1
    : false;
  
  // adjustedPosition 계산을 useMemo로 최적화 (초기값만 설정)
  const initialAdjustedPosition = React.useMemo(() => {
    const basePosition = { ...(placedModule.position || { x: 0, y: 0, z: 0 }) };
    if (isLastSlot && !isFurnitureDragging) {
      // 마지막 슬롯은 originalSlotCenterX를 나중에 계산하므로 여기서는 position 사용
      return { ...(placedModule.position || { x: 0, y: 0, z: 0 }) };
    }
    return basePosition;
  }, [placedModule.position, isLastSlot, isFurnitureDragging]);
  
  // 🔴🔴🔴 Y축 위치 계산 - actualModuleData가 정의된 후에 실행
  // 상부장 체크 (변수명 변경: 위에서 이미 선언됨)
  const isUpperCabinetForY = placedModule.moduleId?.includes('upper-cabinet') || 
                             placedModule.moduleId?.includes('dual-upper-cabinet');
  
  // 하부장 체크 (변수명 변경: 위에서 이미 선언됨)
  const isLowerCabinetForY = placedModule.moduleId?.includes('lower-cabinet') || 
                             placedModule.moduleId?.includes('dual-lower-cabinet');
  
  // 키큰장 체크
  const isTallCabinetForY = actualModuleData?.category === 'full';
  
  // adjustedPosition 계산 (Y축 위치 포함)
  let adjustedPosition = initialAdjustedPosition;
  
  if (isUpperCabinetForY && actualModuleData) {
    // 상부장은 상부프레임 하단에 붙어야 함
    const upperCabinetHeight = actualModuleData?.dimensions.height || 0; // 상부장 높이
    
    // 띄워서 배치 모드와 관계없이 상부장은 항상 상부프레임 하단에 붙어야 함
    // 바닥 마감재 높이
    const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    
    // 상부프레임 높이 - frameSize.top 사용
    const topFrameHeightMm = spaceInfo.frameSize?.top || 10; // 기본값 10mm
    
    // 하부프레임 높이 - frameSize.bottom 사용  
    const bottomFrameHeightMm = spaceInfo.frameSize?.bottom || 0;
    
    // 내경 높이 = 전체 높이 - 상부프레임 - 하부프레임 - 바닥마감재
    const internalHeight = spaceInfo.height - topFrameHeightMm - bottomFrameHeightMm - floorFinishHeightMm;
    
    // 상부장 중심 Y = 바닥마감재 + 하부프레임 + 내경높이 - 상부장 높이/2
    // 이렇게 하면 상부장 상단이 상부프레임 하단에 딱 붙음
    const upperCabinetCenterY = (floorFinishHeightMm + bottomFrameHeightMm + internalHeight - upperCabinetHeight/2) * 0.01;
    
    adjustedPosition = {
      ...adjustedPosition,
      y: upperCabinetCenterY
    };
    
    } 
  // 하부장과 키큰장의 띄워서 배치 처리
  else if ((isLowerCabinetForY || isTallCabinetForY) && actualModuleData) {
    // 띄워서 배치 확인 - placementType이 명시적으로 'float'이고 type이 'stand'일 때만
    const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    
    if (isFloatPlacement) {
      // 바닥 마감재 높이
      const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? 
                                  spaceInfo.floorFinish.height : 0;
      const floorFinishHeight = floorFinishHeightMm * 0.01; // mm to Three.js units
      
      // 띄움 높이 - baseConfig가 있을 때만 floatHeight 가져오기
      const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;
      const floatHeight = floatHeightMm * 0.01; // mm to Three.js units
      
      // 가구 높이
      const furnitureHeight = (actualModuleData?.dimensions.height || 0) * 0.01; // mm to Three.js units
      
      // Y 위치 계산: 바닥마감재 + 띄움높이 + 가구높이/2
      const yPos = floorFinishHeight + floatHeight + (furnitureHeight / 2);
      
      adjustedPosition = {
        ...adjustedPosition,
        y: yPos
      };
      
      } else {
      // 일반 배치 (받침대 있거나 바닥 배치)
      // 기본적으로 받침대 높이 65mm 적용, stand 타입일 때만 0
      const baseHeightMm = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
      const baseHeight = baseHeightMm * 0.01; // mm to Three.js units
      
      // 바닥 마감재 높이
      const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? 
                                  spaceInfo.floorFinish.height : 0;
      const floorFinishHeight = floorFinishHeightMm * 0.01; // mm to Three.js units
      
      // 가구 높이
      const furnitureHeight = (actualModuleData?.dimensions.height || 0) * 0.01; // mm to Three.js units
      
      // Y 위치 계산: 바닥마감재 + 받침대높이 + 가구높이/2
      const yPos = floorFinishHeight + baseHeight + (furnitureHeight / 2);
      
      adjustedPosition = {
        ...adjustedPosition,
        y: yPos
      };
      
      }
  }
  
  // 기둥 침범 상황 확인 및 가구/도어 크기 조정
  // customWidth는 슬롯 기반 너비 조정 시 사용, adjustedWidth는 기둥 침범 시 사용
  // 듀얼 가구는 customWidth가 올바른지 확인 필요
  let furnitureWidthMm = actualModuleData?.dimensions.width || 0; // 기본값
  
  // adjustedWidth가 있으면 최우선 사용 (기둥 침범 케이스)
  if (placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null) {
    furnitureWidthMm = placedModule.adjustedWidth;
    } else if (placedModule.customWidth !== undefined && placedModule.customWidth !== null) {
    // customWidth가 명시적으로 설정되어 있으면 사용 (배치/드래그/키보드 이동 시 설정된 슬롯 맞춤 너비)
    furnitureWidthMm = placedModule.customWidth;
    } else {
    // 기본값은 모듈 원래 크기 (이미 위에서 설정됨)
    }
  
  // 엔드패널 조정 전 원래 너비 저장 (엔드패널 조정 시 사용)
  let originalFurnitureWidthMm = furnitureWidthMm;
  
  // 슬롯 가이드와의 크기 비교 로그
  if (indexing.slotWidths && normalizedSlotIndex !== undefined) {
    const slotGuideWidth = isDualFurniture && normalizedSlotIndex < indexing.slotWidths.length - 1
      ? indexing.slotWidths[normalizedSlotIndex] + indexing.slotWidths[normalizedSlotIndex + 1]
      : indexing.slotWidths[normalizedSlotIndex];
    
    }
  
  // 키큰장인지 확인 (2hanging이 포함된 모듈 ID)
  const isTallCabinet = actualModuleData?.id?.includes('2hanging') || false;

  // 키큰장 엔드패널 처리
  let adjustedWidthForEndPanel = furnitureWidthMm;
  let positionAdjustmentForEndPanel = 0; // 위치 조정값
  
  // 키큰장이 상하부장과 인접한 경우 확인
  const needsEndPanelAdjustment = adjacentCheck.hasAdjacentUpperLower;
  const endPanelSide = adjacentCheck.adjacentSide;
  
  // 🔴🔴🔴 엔드패널 디버깅 - 키큰장일 때만
  if (actualModuleData?.category === 'full') {
    }
  
  // 노서라운드 첫/마지막 슬롯 여부 확인 (상하부장 처리에서 사용)
  // 세미스탠딩도 프리스탠딩과 동일하게 처리
  // 세미스탠딩의 경우 벽이 없는 쪽 슬롯만 해당
  const isSemiStanding = spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing';
  const hasLeftWall = spaceInfo.wallConfig?.left;
  const hasRightWall = spaceInfo.wallConfig?.right;
  
  const isNoSurroundFirstSlot = spaceInfo.surroundType === 'no-surround' && 
                                  ((spaceInfo.installType === 'freestanding') || 
                                   (isSemiStanding && !hasLeftWall)) && // 세미스탠딩에서 왼쪽 벽이 없는 경우
                                  normalizedSlotIndex === 0;
  const isNoSurroundLastSlot = spaceInfo.surroundType === 'no-surround' && 
                                 ((spaceInfo.installType === 'freestanding') ||
                                  (isSemiStanding && !hasRightWall)) && // 세미스탠딩에서 오른쪽 벽이 없는 경우
                                 isLastSlot;
  // 듀얼 가구가 마지막 슬롯에 있는 경우
  const isNoSurroundDualLastSlot = spaceInfo.surroundType === 'no-surround' && 
                                    ((spaceInfo.installType === 'freestanding') ||
                                     (isSemiStanding && !hasRightWall)) && // 세미스탠딩에서 오른쪽 벽이 없는 경우
                                    isDualFurniture && 
                                    normalizedSlotIndex === indexing.columnCount - 2;
  
  // 키큰장이 상하부장과 인접했을 때 - 너비 조정 및 위치 이동
  if (needsEndPanelAdjustment && endPanelSide) {
    // 노서라운드 첫/마지막 슬롯에서는 특별 처리
    if (isNoSurroundFirstSlot || isNoSurroundLastSlot || isNoSurroundDualLastSlot) {
      // 노서라운드에서는 바깥쪽 엔드패널 18mm + 안쪽 상하부장 엔드패널 18mm = 총 36mm 줄임
      if (endPanelSide === 'left') {
        // 마지막 슬롯에서 왼쪽 상하부장: 총 36mm 줄이고 위치는 중앙 유지
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 2); // 36mm 줄임
        // 위치는 이동하지 않음 (슬롯 중앙 유지)
        positionAdjustmentForEndPanel = 0;
      } else if (endPanelSide === 'right') {
        // 첫번째 슬롯에서 오른쪽 상하부장: 총 36mm 줄이고 위치는 중앙 유지
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 2); // 36mm 줄임
        // 위치는 이동하지 않음 (슬롯 중앙 유지)
        positionAdjustmentForEndPanel = 0;
      } else if (endPanelSide === 'both') {
        // 양쪽 상하부장: 54mm 줄이고 중앙 유지 (바깥쪽 18mm + 양쪽 안쪽 36mm)
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 3);
        positionAdjustmentForEndPanel = 0;
      }
    } else {
      // 일반적인 경우: 엔드패널 두께만큼 키큰장 너비를 줄이고 위치 조정
      if (endPanelSide === 'left') {
        // 왼쪽에 상하부장이 있으면 18mm 줄이고 오른쪽으로 9mm 이동
        adjustedWidthForEndPanel = originalFurnitureWidthMm - END_PANEL_THICKNESS;
        positionAdjustmentForEndPanel = (END_PANEL_THICKNESS / 2) * 0.01; // 오른쪽으로 9mm 이동
      } else if (endPanelSide === 'right') {
        // 오른쪽에 상하부장이 있으면 18mm 줄이고 왼쪽으로 9mm 이동
        adjustedWidthForEndPanel = originalFurnitureWidthMm - END_PANEL_THICKNESS;
        positionAdjustmentForEndPanel = -(END_PANEL_THICKNESS / 2) * 0.01; // 왼쪽으로 9mm 이동
      } else if (endPanelSide === 'both') {
        // 양쪽에 상하부장이 있으면 36mm 줄이고 중앙 유지
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 2);
        positionAdjustmentForEndPanel = 0;
      }
    }
    
    furnitureWidthMm = adjustedWidthForEndPanel; // 실제 가구 너비 업데이트
  }
  
  // 노서라운드 모드에서 엔드패널 처리
  // 벽없음(freestanding) 또는 한쪽벽(semistanding) 모드에서 엔드패널이 있는 슬롯 처리
  if (spaceInfo.surroundType === 'no-surround' && 
      (spaceInfo.installType === 'freestanding' || 
       spaceInfo.installType === 'semistanding' || 
       spaceInfo.installType === 'semi-standing') && 
      normalizedSlotIndex !== undefined) {

    // 프리스탠딩에서는 양쪽 모두, 세미스탠딩에서는 벽이 없는 쪽만 처리
    let shouldProcessFirstSlot = false;
    let shouldProcessLastSlot = false;

    if (spaceInfo.installType === 'freestanding') {
      // 프리스탠딩: 양쪽 모두 처리
      shouldProcessFirstSlot = normalizedSlotIndex === 0;
      shouldProcessLastSlot = isLastSlot;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽이 없는 쪽만 처리
      shouldProcessFirstSlot = normalizedSlotIndex === 0 && !spaceInfo.wallConfig?.left;
      shouldProcessLastSlot = isLastSlot && !spaceInfo.wallConfig?.right;
    }

    // 듀얼 가구의 경우: 첫번째 슬롯에 있고, 왼쪽에 벽이 없으면 처리
    const isDualFirstSlot = isDualFurniture && normalizedSlotIndex === 0 && 
                            (spaceInfo.installType === 'freestanding' || 
                             ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.left));

    const isFirstSlotNoSurround = shouldProcessFirstSlot && !isDualFirstSlot;

    // 듀얼 가구의 경우: 마지막에서 두번째 슬롯에 있고, 오른쪽에 벽이 없으면 처리
    const isDualLastSlot = isDualFurniture && normalizedSlotIndex === indexing.columnCount - 2 && 
                            (spaceInfo.installType === 'freestanding' || 
                             ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.right));
    // 듀얼 가구가 마지막 슬롯에 있으면 isLastSlot 처리를 하지 않음
    const isLastSlotNoSurround = shouldProcessLastSlot && !isDualLastSlot;
    
    // 듀얼 가구 첫번째 슬롯 특별 처리 (상하부장 유무와 관계없이 항상 처리)
    if (isDualFirstSlot && !needsEndPanelAdjustment) {
      // 듀얼 가구가 첫번째 슬롯에 있는 경우: 왼쪽만 18mm 줄임
      const originalWidth = furnitureWidthMm;
      furnitureWidthMm = originalWidth - END_PANEL_THICKNESS; // 왼쪽만 18mm 줄임
      positionAdjustmentForEndPanel = (END_PANEL_THICKNESS / 2) * 0.01; // 오른쪽으로 9mm 이동
      
      }
    // 듀얼 가구 마지막 슬롯 특별 처리 (상하부장 유무와 관계없이 항상 처리)
    else if (isDualLastSlot && !needsEndPanelAdjustment) {
      // 듀얼 가구가 마지막 슬롯에 있는 경우: 오른쪽만 18mm 줄임
      const originalWidth = furnitureWidthMm;
      furnitureWidthMm = originalWidth - END_PANEL_THICKNESS; // 오른쪽만 18mm 줄임
      positionAdjustmentForEndPanel = -(END_PANEL_THICKNESS / 2) * 0.01; // 왼쪽으로 9mm 이동
      
      }
    // 싱글 가구 첫/마지막 슬롯 처리 (상하부장도 포함)
    else if ((isFirstSlotNoSurround || isLastSlotNoSurround)) {
      // 키큰장이 아니거나, 키큰장이지만 상하부장과 인접하지 않은 경우
      if (!needsEndPanelAdjustment) {
        // 가구 너비를 18mm 줄임
        const originalWidth = furnitureWidthMm;
        furnitureWidthMm = originalWidth - END_PANEL_THICKNESS;
        
        // 노서라운드 모드에서 위치 조정
        // 키큰장: 엔드패널에서 멀어지는 방향으로 9mm 이동 (침범 방지)
        // 상하부장: 엔드패널 쪽으로 9mm 이동 (엔드패널과 함께 이동)
        if (isTallCabinet) {
          // 키큰장은 엔드패널 반대쪽으로 이동 (침범 방지)
          if (isFirstSlotNoSurround) {
            // 첫번째 슬롯: 왼쪽에 엔드패널이 있으므로 오른쪽으로 9mm 이동
            positionAdjustmentForEndPanel = (END_PANEL_THICKNESS / 2) * 0.01; // 오른쪽으로 9mm
          } else if (isLastSlotNoSurround) {
            // 마지막 슬롯: 오른쪽에 엔드패널이 있으므로 왼쪽으로 9mm 이동
            positionAdjustmentForEndPanel = -(END_PANEL_THICKNESS / 2) * 0.01; // 왼쪽으로 9mm
          }
        } else {
          // 상하부장도 엔드패널 반대쪽으로 이동 (가구+엔드패널이 슬롯에 딱 맞도록)
          if (isFirstSlotNoSurround) {
            // 첫번째 슬롯: 왼쪽에 엔드패널이 있으므로 오른쪽으로 9mm 이동
            positionAdjustmentForEndPanel = (END_PANEL_THICKNESS / 2) * 0.01; // 오른쪽으로 9mm
          } else if (isLastSlotNoSurround) {
            // 마지막 슬롯: 오른쪽에 엔드패널이 있으므로 왼쪽으로 9mm 이동
            positionAdjustmentForEndPanel = -(END_PANEL_THICKNESS / 2) * 0.01; // 왼쪽으로 9mm
          }
        }
        
        } else {
        // 키큰장이 상하부장과 인접한 경우는 위에서 이미 처리했으므로
        // 하지만 노서라운드 첫/마지막 슬롯이면 추가 위치 조정이 필요할 수 있음
        // 상하부장 자체는 추가 처리가 필요함
        if (isUpperCabinet || isLowerCabinet) {
          // 상하부장이 첫/마지막 슬롯에 있는 경우도 처리
          const originalWidth = furnitureWidthMm;
          // 이미 키큰장 때문에 조정된 경우가 아니면 조정
          if (furnitureWidthMm === originalFurnitureWidthMm) {
            furnitureWidthMm = originalWidth - END_PANEL_THICKNESS;
            
            if (isFirstSlotNoSurround) {
              positionAdjustmentForEndPanel = (END_PANEL_THICKNESS / 2) * 0.01;
            } else if (isLastSlotNoSurround) {
              positionAdjustmentForEndPanel = -(END_PANEL_THICKNESS / 2) * 0.01;
            }
            
            }
        }
      }
    }
    
    // 노서라운드 모드에서는 slotWidths가 이미 엔드패널을 고려하여 계산되어 있음
    // FurnitureItem에서 추가로 조정하지 않음
    }

  // 디버깅용 로그 추가 제거됨

  // 키큰장 높이는 항상 내경 높이와 동일 (띄워서 배치와 관계없이)
  // 키큰장은 바닥(또는 띄움 위치)부터 시작해서 상부프레임 하단까지
  
  // 노서라운드 모드에서 엔드패널 위치 조정은 나중에 적용
  
  let adjustedDepthMm = actualModuleData?.dimensions.depth || 0;

  // 가구 높이는 기본적으로 모듈 데이터의 높이 사용
  let furnitureHeightMm = actualModuleData?.dimensions.height || 0;

  // 단내림 구간 높이 디버깅
  if (placedModule.zone === 'dropped') {
    console.log('🟢 FurnitureItem 단내림 구간 가구 높이');
    console.log('  zone:', placedModule.zone);
    console.log('  moduleId:', placedModule.moduleId);
    console.log('  furnitureHeightMm:', furnitureHeightMm);
    console.log('  actualModuleDataHeight:', actualModuleData?.dimensions.height);
    console.log('  internalSpaceHeight:', internalSpace.height);
    console.log('  droppedCeilingEnabled:', spaceInfo.droppedCeiling?.enabled);
    console.log('  dropHeight:', spaceInfo.droppedCeiling?.dropHeight);
  }
  
  // Column C 가구 너비 디버깅
  if (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) {
    }
  
  // 듀얼 가구인지 확인하여 도어 크기 결정 (이미 위에서 계산됨)
  // 단내림 구간에서는 zone별 columnWidth 사용
  let originalSlotWidthMm: number;
  
  // 노서라운드 모드에서 끝 슬롯인지 확인
  const isEndSlotInNoSurround = spaceInfo.surroundType === 'no-surround' && 
    normalizedSlotIndex !== undefined &&
    (normalizedSlotIndex === 0 || normalizedSlotIndex === indexing.columnCount - 1);
  
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled && zoneSlotInfo) {
    const targetZone = placedModule.zone === 'dropped' && zoneSlotInfo.dropped ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
    const localIndex = localSlotIndex ?? placedModule.slotIndex ?? 0;
    
    // 마지막 슬롯의 경우 실제 남은 너비 사용
    if (isLastSlot && !isDualFurniture) {
      const usedWidth = targetZone.columnWidth * (targetZone.columnCount - 1);
      originalSlotWidthMm = targetZone.width - usedWidth;
    } else if (isDualFurniture && localIndex === targetZone.columnCount - 2) {
      // 마지막-1 슬롯의 듀얼 가구인 경우
      const normalSlotWidth = targetZone.columnWidth;
      const lastSlotStart = targetZone.startX + ((targetZone.columnCount - 1) * targetZone.columnWidth);
      const lastSlotEnd = targetZone.startX + targetZone.width;
      const lastSlotWidth = lastSlotEnd - lastSlotStart;
      originalSlotWidthMm = normalSlotWidth + lastSlotWidth;
    } else if (isDualFurniture) {
      // 듀얼 가구: 실제 슬롯 너비들의 합계 사용
      if (targetZone.slotWidths && localIndex >= 0 && localIndex < targetZone.slotWidths.length - 1) {
        originalSlotWidthMm = targetZone.slotWidths[localIndex] + targetZone.slotWidths[localIndex + 1];
      } else {
        // fallback: 평균 너비 * 2
        originalSlotWidthMm = targetZone.columnWidth * 2;
      }
    } else {
      // 싱글 가구: 해당 슬롯의 실제 너비 사용
      if (targetZone.slotWidths && localIndex >= 0 && localIndex < targetZone.slotWidths.length) {
        originalSlotWidthMm = targetZone.slotWidths[localIndex];
      } else {
        // fallback: 평균 너비
        originalSlotWidthMm = targetZone.columnWidth;
      }
    }
    
  } else {
    // 단내림이 없는 경우도 마지막 슬롯 처리
    if (isLastSlot && !isDualFurniture) {
      const usedWidth = indexing.columnWidth * (indexing.columnCount - 1);
      const totalInternalWidth = internalSpace.width;  // 내경 전체 너비
      originalSlotWidthMm = totalInternalWidth - usedWidth;
    } else if (isDualFurniture) {
      // 듀얼 가구: 실제 슬롯 너비들의 합계 사용
      if (indexing.slotWidths && normalizedSlotIndex !== undefined && normalizedSlotIndex < indexing.slotWidths.length - 1) {
        originalSlotWidthMm = indexing.slotWidths[normalizedSlotIndex] + indexing.slotWidths[normalizedSlotIndex + 1];
      } else {
        // fallback: 평균 너비 * 2
        originalSlotWidthMm = indexing.columnWidth * 2;
      }
    } else {
      // 싱글 가구: 해당 슬롯의 실제 너비 사용
      if (indexing.slotWidths && normalizedSlotIndex !== undefined && indexing.slotWidths[normalizedSlotIndex] !== undefined) {
        originalSlotWidthMm = indexing.slotWidths[normalizedSlotIndex];
      } else {
        // fallback: 평균 너비
        originalSlotWidthMm = indexing.columnWidth;
      }
    }
  }
  
  // 도어 크기 디버깅
  if (placedModule.hasDoor) {
    let targetZoneSlotWidths = null;
    let targetZoneInfo = null;
    if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
      targetZoneSlotWidths = targetZone.slotWidths;
      targetZoneInfo = targetZone;
    }
    
    // 도어 너비가 가구 너비와 크게 차이나는 경우 - 기둥 침범 시와 엔드패널 있는 경우에는 보정하지 않음
    // 기둥 침범 시 도어는 원래 슬롯 너비를 유지해야 함 (커버도어)
    // 키큰장에 엔드패널이 있을 때도 도어는 원래 슬롯 너비를 유지해야 함
    const widthDifference = Math.abs(originalSlotWidthMm - furnitureWidthMm);
    if (widthDifference > 20 && !isEditMode && !isDraggingThis && !(slotInfo && slotInfo.hasColumn) && !needsEndPanelAdjustment) {
      // 기둥이 없고 엔드패널도 없는 경우에만 가구 너비를 기준으로 도어 너비 보정
      originalSlotWidthMm = furnitureWidthMm;
    } else if (needsEndPanelAdjustment) {
      }
  }
  
  // 벽없음 + 노서라운드 모드에서 벽이 없는 쪽의 가구는 도어가 엔드패널을 덮도록 확장
  let doorWidthExpansion = 0;
  let doorWidth = actualModuleData?.dimensions.width || 0;
  let doorXOffset = 0;
  let originalSlotWidthForDoor = originalSlotWidthMm;
  
  // 노서라운드 엔드패널이 있는 슬롯 도어 확장 처리
  // hasLeftWall과 hasRightWall은 이미 위에서 선언됨 (809-810줄)
  if (spaceInfo.surroundType === 'no-surround' && 
      (spaceInfo.installType === 'freestanding' || 
       spaceInfo.installType === 'semistanding' || 
       spaceInfo.installType === 'semi-standing') && 
      normalizedSlotIndex !== undefined) {
    
    // 프리스탠딩에서는 양쪽 모두, 세미스탠딩에서는 벽이 없는 쪽만 처리
    let shouldExpandFirstSlot = false;
    let shouldExpandLastSlot = false;
    
    if (spaceInfo.installType === 'freestanding') {
      // 프리스탠딩: 양쪽 모두 확장
      shouldExpandFirstSlot = normalizedSlotIndex === 0;
      shouldExpandLastSlot = isLastSlot;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽이 없는 쪽만 확장
      shouldExpandFirstSlot = normalizedSlotIndex === 0 && !spaceInfo.wallConfig?.left;
      shouldExpandLastSlot = isLastSlot && !spaceInfo.wallConfig?.right;
    }

    // 듀얼 가구의 경우: 첫번째 슬롯에 있고, 왼쪽에 벽이 없으면 처리
    const isDualFirstSlotDoor = isDualFurniture && normalizedSlotIndex === 0 && 
                            (spaceInfo.installType === 'freestanding' || 
                             ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.left));

    const isFirstSlotFreestanding = shouldExpandFirstSlot && !isDualFirstSlotDoor;
    const isLastSlotFreestanding = shouldExpandLastSlot;
    const isDualLastSlot = isDualFurniture && normalizedSlotIndex === indexing.columnCount - 2 && 
                            (spaceInfo.installType === 'freestanding' || 
                             ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.right));
    
    // 첫번째 또는 마지막 슬롯: 도어 확장
    if (isFirstSlotFreestanding || isLastSlotFreestanding || isDualFirstSlotDoor || isDualLastSlot) {
      if (isDualFurniture && isDualFirstSlotDoor) {
        // 듀얼 가구가 첫번째 슬롯에 있는 경우: 왼쪽 도어만 18mm 확장
        doorWidthExpansion = END_PANEL_THICKNESS; // 18mm 확장
        // 상하부장이 인접한 경우 위치 조정 사용, 아니면 기본 9mm 이동
        doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : -(END_PANEL_THICKNESS / 2) * 0.01;
        
        } else if (isDualFurniture && isDualLastSlot) {
        // 듀얼 가구가 마지막 슬롯에 있는 경우: 오른쪽 도어만 18mm 확장
        doorWidthExpansion = END_PANEL_THICKNESS; // 18mm 확장
        // 상하부장이 인접한 경우 위치 조정 사용, 아니면 기본 9mm 이동
        doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : (END_PANEL_THICKNESS / 2) * 0.01;
        
        } else {
        // 싱글 가구 또는 듀얼 가구 첫번째 슬롯: 한쪽만 18mm 확장
        doorWidthExpansion = END_PANEL_THICKNESS;
        
        // 도어 위치는 확장된 방향과 반대로 이동 (가구 위치에 맞춤)
        // 상하부장이 인접한 경우 위치 조정 사용, 아니면 기본 9mm 이동
        if (isFirstSlotFreestanding) {
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : -(END_PANEL_THICKNESS / 2) * 0.01;
        } else {
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : (END_PANEL_THICKNESS / 2) * 0.01;
        }
        
        }
    }
    
    // 벽 위치 설정 (freestanding은 양쪽 벽 없음) - hasLeftWall, hasRightWall은 이미 위에서 설정됨
  } else if (spaceInfo.surroundType === 'no-surround' && normalizedSlotIndex !== undefined) {
    const isFirstSlot = normalizedSlotIndex === 0;
    const isLastSlotForDual = isDualFurniture && normalizedSlotIndex === indexing.columnCount - 2;
    const isLastSlotForSingle = !isDualFurniture && isLastSlot;
    
    // 벽 위치 확인
    if (spaceInfo.installType === 'freestanding') {
      // 벽없음 모드: 양쪽 모두 벽 없음 - hasLeftWall, hasRightWall은 이미 위에서 false로 설정됨
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 반벽 모드: hasLeftWall, hasRightWall은 이미 wallConfig에서 설정됨
    }
    
    if (isFirstSlot && !hasLeftWall) {
      // 왼쪽 벽이 없는 첫번째 슬롯
      if (isDualFurniture) {
        // 듀얼장: 두 슬롯 모두의 도어를 확장
        const firstSlotReduction = indexing.slotWidths?.[0] ? indexing.columnWidth - indexing.slotWidths[0] : 0;
        const secondSlotReduction = indexing.slotWidths?.[1] ? indexing.columnWidth - indexing.slotWidths[1] : 0;
        // 두 슬롯의 총 너비에 18mm 추가
        doorWidthExpansion = END_PANEL_THICKNESS + firstSlotReduction + secondSlotReduction;
        // 상하부장이 인접한 경우 positionAdjustmentForEndPanel 값 사용, 아니면 기본 9mm 이동
        doorXOffset = needsEndPanelAdjustment && isNoSurroundFirstSlot ? 
          positionAdjustmentForEndPanel : -(END_PANEL_THICKNESS / 2) * 0.01;
        
        } else {
        // 싱글장: 18mm 확장, 상하부장 인접 시 위치 조정
        doorWidthExpansion = END_PANEL_THICKNESS;
        // 상하부장이 인접한 경우 positionAdjustmentForEndPanel 값 사용, 아니면 기본 9mm 이동
        doorXOffset = needsEndPanelAdjustment && isNoSurroundFirstSlot ? 
          positionAdjustmentForEndPanel : -(END_PANEL_THICKNESS / 2) * 0.01;
        
        }
      
    } else if ((isLastSlotForDual || isLastSlotForSingle) && !hasRightWall) {
      // 오른쪽 벽이 없는 마지막 슬롯
      if (isDualFurniture && isLastSlotForDual) {
        // 듀얼장: 두 슬롯 모두의 도어를 확장
        const lastSlotIndex = indexing.columnCount - 1;
        const beforeLastSlotIndex = indexing.columnCount - 2;
        const lastSlotReduction = indexing.slotWidths?.[lastSlotIndex] ? 
          indexing.columnWidth - indexing.slotWidths[lastSlotIndex] : 0;
        const beforeLastSlotReduction = indexing.slotWidths?.[beforeLastSlotIndex] ? 
          indexing.columnWidth - indexing.slotWidths[beforeLastSlotIndex] : 0;
        // 두 슬롯의 총 너비에 18mm 추가
        doorWidthExpansion = END_PANEL_THICKNESS + lastSlotReduction + beforeLastSlotReduction;
        // 상하부장이 인접한 경우 positionAdjustmentForEndPanel 값 사용, 아니면 기본 9mm 이동
        doorXOffset = needsEndPanelAdjustment && isNoSurroundLastSlot ? 
          positionAdjustmentForEndPanel : (END_PANEL_THICKNESS / 2) * 0.01;
        
        } else {
        // 싱글장: 18mm 확장, 상하부장 인접 시 위치 조정
        doorWidthExpansion = END_PANEL_THICKNESS;
        // 상하부장이 인접한 경우 positionAdjustmentForEndPanel 값 사용, 아니면 기본 9mm 이동
        doorXOffset = needsEndPanelAdjustment && isNoSurroundLastSlot ? 
          positionAdjustmentForEndPanel : (END_PANEL_THICKNESS / 2) * 0.01;
        
        }
    }
  }
  
  // 도어는 항상 원래 슬롯 중심에 고정 (가구 이동과 무관)
  let originalSlotCenterX: number;
  
  // zone이 있는 경우 zone별 위치 계산
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // zone 내 로컬 슬롯 인덱스 사용
    const localSlotIndexForZone = localSlotIndex ?? placedModule.slotIndex ?? 0;

    if (isDualFurniture && localSlotIndexForZone < targetZone.columnCount - 1) {
      // 듀얼 가구: 두 슬롯의 중간점
      let leftSlotX, rightSlotX;

      // 마지막-1 슬롯이 듀얼인 경우 마지막 슬롯의 실제 너비 고려
      if (localSlotIndexForZone === targetZone.columnCount - 2) {
        leftSlotX = targetZone.startX + (localSlotIndexForZone * targetZone.columnWidth) + (targetZone.columnWidth / 2);
        const lastSlotStart = targetZone.startX + ((localSlotIndexForZone + 1) * targetZone.columnWidth);
        const lastSlotEnd = targetZone.startX + targetZone.width;
        rightSlotX = (lastSlotStart + lastSlotEnd) / 2;
      } else {
        leftSlotX = targetZone.startX + (localSlotIndexForZone * targetZone.columnWidth) + (targetZone.columnWidth / 2);
        rightSlotX = targetZone.startX + ((localSlotIndexForZone + 1) * targetZone.columnWidth) + (targetZone.columnWidth / 2);
      }
      originalSlotCenterX = ((leftSlotX + rightSlotX) / 2) * 0.01; // mm to Three.js units
    } else {
      // 싱글 가구
      // targetZone의 threeUnitPositions나 계산된 위치 사용
      const zoneIndexing = placedModule.zone === 'dropped' && indexing.zones?.dropped 
        ? indexing.zones.dropped 
        : (placedModule.zone === 'normal' && indexing.zones?.normal ? indexing.zones.normal : indexing);
      
      if (zoneIndexing.threeUnitPositions && zoneIndexing.threeUnitPositions[localSlotIndexForZone] !== undefined) {
        originalSlotCenterX = zoneIndexing.threeUnitPositions[localSlotIndexForZone];
      } else {
        // fallback: 기본 계산 사용
        originalSlotCenterX = (targetZone.startX + (localSlotIndexForZone * targetZone.columnWidth) + (targetZone.columnWidth / 2)) * 0.01;
      }
    }
  } else {
    // zone이 없는 경우 기존 로직
    // 듀얼 가구는 두 슬롯의 중간 위치 계산
    if (isDualFurniture && normalizedSlotIndex !== undefined) {
      // 듀얼 가구: 두 슬롯의 중간 위치
      const leftSlotX = indexing.threeUnitPositions[normalizedSlotIndex];
      const rightSlotX = indexing.threeUnitPositions[normalizedSlotIndex + 1] || leftSlotX;
      originalSlotCenterX = (leftSlotX + rightSlotX) / 2;
      
      } else if (normalizedSlotIndex !== undefined && indexing.threeUnitPositions[normalizedSlotIndex] !== undefined) {
      // 싱글 가구: 슬롯 중심 위치
      originalSlotCenterX = indexing.threeUnitPositions[normalizedSlotIndex]; // 실제 슬롯 중심 위치
    } else {
      // 슬롯 인덱스가 없는 경우, 듀얼 가구라면 듀얼 위치에서 찾기
      
      if (isDualFurniture && indexing.threeUnitDualPositions) {
        // 듀얼 가구의 경우 듀얼 위치에서 가장 가까운 위치 찾기
        const closestDualIndex = indexing.threeUnitPositions.findIndex(pos => 
          Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
        );
        if (closestDualIndex >= 0) {
          originalSlotCenterX = indexing.threeUnitDualPositions[closestDualIndex];
        } else {
          // 백업: 현재 위치 사용 (기존 동작)
          originalSlotCenterX = placedModule.position.x;
        }
      } else {
        // 싱글 가구의 경우 싱글 위치에서 가장 가까운 위치 찾기
        const closestSingleIndex = indexing.threeUnitPositions.findIndex(pos => 
          Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
        );
        if (closestSingleIndex >= 0) {
          originalSlotCenterX = indexing.threeUnitPositions[closestSingleIndex];
        } else {
          // 백업: 현재 위치 사용 (기존 동작)
          originalSlotCenterX = placedModule.position.x;
        }
      }
    }
  }
  
  // 마지막 슬롯도 일반 슬롯과 동일하게 처리 (특별 처리 제거)
  // threeUnitPositions가 이미 올바른 위치를 가지고 있음
  
  // 마지막 슬롯은 기둥 처리 제외
  if (!isFurnitureDragging && !isLastSlot && slotInfo && slotInfo.hasColumn && slotInfo.column) {
    // 기둥 타입에 따른 처리 방식 확인
    const columnProcessingMethod = slotInfo.columnProcessingMethod || 'width-adjustment';
    
    const slotWidthM = indexing.columnWidth * 0.01; // mm to meters
    const originalSlotBounds = {
      left: originalSlotCenterX - slotWidthM / 2,
      right: originalSlotCenterX + slotWidthM / 2,
      center: originalSlotCenterX
    };
    
    // 기둥 침범에 따른 새로운 가구 경계 계산
    const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
    
    // 기둥 A(deep) 등에 대해 폭 조정 방식 적용 (기둥 C는 제외 - 깊이 조정)
    // 기둥 침범 시에는 가구 폭을 조정하여 기둥과 겹치지 않도록 함
    if (columnProcessingMethod === 'width-adjustment') {
      // 일반 폭 조정 방식: 가구 크기와 위치 조정
      // 기둥 침범 시에는 항상 폭 조정
      furnitureWidthMm = furnitureBounds.renderWidth;
      adjustedPosition = {
        ...adjustedPosition, // adjustedPosition 사용하여 상부장 Y 위치 보존
        x: furnitureBounds.center + (needsEndPanelAdjustment ? positionAdjustmentForEndPanel : 0)
      };
      
      // 기둥 변경으로 인한 폭 조정이 필요한 경우 실시간 업데이트
      if (!isFurnitureDragging && (
        placedModule.adjustedWidth !== furnitureWidthMm || 
        placedModule.position.x !== adjustedPosition.x
      )) {
        updatePlacedModule(placedModule.id, {
          adjustedWidth: furnitureWidthMm,
          position: adjustedPosition,
          columnSlotInfo: {
            hasColumn: true,
            columnId: slotInfo.column?.id,
            columnPosition: slotInfo.columnPosition,
            availableWidth: slotInfo.availableWidth,
            adjustedWidth: slotInfo.adjustedWidth,
            intrusionDirection: slotInfo.intrusionDirection,
            furniturePosition: slotInfo.furniturePosition
          }
        });
      }
    } else if (columnProcessingMethod === 'depth-adjustment') {
      // 깊이 조정 방식 (기둥 C(300mm) 및 얕은 기둥)
      const slotDepth = 730; // 슬롯 기본 깊이
      const columnDepth = slotInfo.column.depth;
      const remainingDepth = slotDepth - columnDepth;
      
      // 듀얼캐비닛인지 확인
      // isDualFurniture는 이미 위에서 계산됨
      
     if (isDualFurniture && remainingDepth <= 300) {
        // 듀얼캐비닛이고 남은 깊이가 300mm 이하면 배치 불가
        // 배치 불가 처리 (원래 깊이 유지하거나 다른 처리)
        adjustedDepthMm = actualModuleData?.dimensions.depth || 0;
      } else {
        // 배치 가능 - 깊이만 조정, 폭과 위치는 그대로
        adjustedDepthMm = remainingDepth;
      }
    }
  }

  const shouldResetCustomDepth = !isFurnitureDragging && slotInfo && !slotInfo.hasColumn && !!placedModule.customDepth;

  if (slotInfo && !slotInfo.hasColumn && placedModule.customDepth) {
    // 기둥이 슬롯을 벗어났을 때 customDepth 제거
    // 깊이를 원래대로 복구
    adjustedDepthMm = actualModuleData?.dimensions.depth || 0;
  }

  const shouldResetWidth = !isFurnitureDragging && slotInfo && !slotInfo.hasColumn &&
    (placedModule.adjustedWidth !== undefined || placedModule.columnSlotInfo !== undefined);

  if (slotInfo && !slotInfo.hasColumn && (placedModule.adjustedWidth || placedModule.columnSlotInfo)) {
    // 기둥이 슬롯을 벗어났을 때 폭도 원상복구
    // 폭을 원래대로 복구
    furnitureWidthMm = actualModuleData?.dimensions.width || 0;
    
    // 위치도 슬롯 중심으로 복구
    const slotCenterX = (normalizedSlotIndex !== undefined && indexing.threeUnitPositions[normalizedSlotIndex] !== undefined)
      ? indexing.threeUnitPositions[normalizedSlotIndex]
      : placedModule.position.x;
    adjustedPosition = {
      ...adjustedPosition, // adjustedPosition 사용하여 상부장 Y 위치 보존
      x: slotCenterX + (needsEndPanelAdjustment ? positionAdjustmentForEndPanel : 0)
    };
  }
  
  // 가구 치수를 Three.js 단위로 변환
  const width = mmToThreeUnits(furnitureWidthMm);
  
  // 가구 높이 계산: actualModuleData.dimensions.height가 이미 올바른 높이를 가지고 있음
  // generateShelvingModules에서 internalSpace.height를 기반으로 가구를 생성했기 때문
  // 추가 조정 불필요
  
  const height = mmToThreeUnits(furnitureHeightMm);
  
  // 단내림 구간 최종 높이 디버깅
  if (placedModule.zone === 'dropped') {
    }
  
  // 깊이 계산: customDepth 우선, 기둥 충돌로 조정된 깊이, 기본 깊이 순
  const moduleDepth = actualModuleData?.dimensions?.depth || 0;
  const actualDepthMm = placedModule.customDepth || (adjustedDepthMm !== moduleDepth ? adjustedDepthMm : moduleDepth);
  const depth = mmToThreeUnits(actualDepthMm);
  
  // Column C 깊이 디버깅
  if (isColumnC && slotInfo) {
    }

  // 도어 두께 (20mm)
  const doorThicknessMm = 20;
  const doorThickness = mmToThreeUnits(doorThicknessMm);

  // Room.tsx와 동일한 Z축 위치 계산
  const panelDepthMm = 1500; // 전체 공간 깊이
  const furnitureDepthMm = 600; // 가구 공간 깊이
  const panelDepth = mmToThreeUnits(panelDepthMm);
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
  
  // Room.tsx와 동일한 계산: 뒷벽에서 600mm만 나오도록
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm
  
  // Z축 위치 계산 - 기둥 C가 있어도 위치는 변경하지 않음
  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
  
  // 기둥 C 디버깅 - 위치는 유지, 깊이만 조정
  if (adjustedDepthMm !== moduleDepth && slotInfo?.hasColumn) {
    }
  
  // 기둥 C가 있는 경우 디버깅
  if (slotInfo?.hasColumn && slotInfo.columnProcessingMethod === 'depth-adjustment' && slotInfo.column) {
    }

  // 색상 설정: 드래그 중일 때만 색상 전달, 다른 상태에서는 MaterialPanel 색상 사용
  const furnitureColor = isDraggingThis ? '#66ff66' : undefined;
  
  // 기둥 침범 상황에 따른 최적 힌지 방향 계산 (드래그 중이 아닐 때만)
  let optimalHingePosition = placedModule.hingePosition || 'right';
  
  // 노서라운드 모드에서 커버도어의 힌지 위치 조정
  if (spaceInfo.surroundType === 'no-surround' && normalizedSlotIndex !== undefined) {
    const isFirstSlot = normalizedSlotIndex === 0;
    // isLastSlot은 이미 위에서 정의됨
    
    if (spaceInfo.installType === 'freestanding') {
      if (isFirstSlot) {
        // 첫번째 슬롯: 힌지가 오른쪽에 있어야 왼쪽 엔드패널을 덮음
        optimalHingePosition = 'right';
        } else if (isLastSlot) {
        // 마지막 슬롯: 힌지가 왼쪽에 있어야 오른쪽 엔드패널을 덮음
        optimalHingePosition = 'left';
        }
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      if (isFirstSlot && !spaceInfo.wallConfig?.left) {
        optimalHingePosition = 'right';
      } else if (isLastSlot && !spaceInfo.wallConfig?.right) {
        optimalHingePosition = 'left';
      }
    }
  } else if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn) {
    // 기둥 침범 상황에 따른 힌지 조정
    optimalHingePosition = calculateOptimalHingePosition(slotInfo);
    }

  // Column C 기둥 앞 가구인지 확인
  const isColumnCFront = isColumnC && placedModule.columnSlotInfo?.spaceType === 'front';
  
  // adjustedPosition을 memoize하여 참조 안정성 확보
  const memoizedAdjustedPosition = React.useMemo(() => ({
    x: adjustedPosition.x,
    y: adjustedPosition.y,
    z: adjustedPosition.z
  }), [adjustedPosition.x, adjustedPosition.y, adjustedPosition.z]);

  React.useEffect(() => {
    if (!shouldResetCustomDepth) return;
    updatePlacedModule(placedModule.id, { customDepth: undefined });
  }, [shouldResetCustomDepth, placedModule.id, updatePlacedModule]);

  const widthResetPayload = React.useMemo(() => {
    if (!shouldResetWidth) return null;
    return {
      adjustedWidth: undefined,
      columnSlotInfo: undefined,
      position: memoizedAdjustedPosition
    };
  }, [shouldResetWidth, memoizedAdjustedPosition]);

  React.useEffect(() => {
    if (!widthResetPayload) return;
    updatePlacedModule(placedModule.id, widthResetPayload);
  }, [widthResetPayload, placedModule.id, updatePlacedModule]);
  
  // 계산된 값들을 상태로 업데이트 - 값이 실제로 변경될 때만 업데이트
  React.useEffect(() => {
    setCalculatedValues(prev => {
      // 값이 실제로 변경되었는지 확인
      const hasChanged = 
        prev.isColumnCFront !== isColumnCFront ||
        prev.slotInfoColumn !== slotInfo?.column ||
        prev.indexingColumnWidth !== indexing.columnWidth ||
        prev.adjustedPosition?.x !== memoizedAdjustedPosition.x ||
        prev.adjustedPosition?.y !== memoizedAdjustedPosition.y ||
        prev.adjustedPosition?.z !== memoizedAdjustedPosition.z ||
        prev.actualModuleData?.id !== actualModuleData?.id;
      
      if (!hasChanged) {
        return prev; // 변경 없으면 이전 값 유지 (리렌더링 방지)
      }
      
      return {
        isColumnCFront,
        slotInfoColumn: slotInfo?.column,
        indexingColumnWidth: indexing.columnWidth,
        adjustedPosition: memoizedAdjustedPosition,
        actualModuleData
      };
    });
  }, [isColumnCFront, slotInfo?.column, indexing.columnWidth, memoizedAdjustedPosition, actualModuleData]);

  // Column C 전용 이벤트 핸들러 래핑
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (isColumnCFront && !isDragMode) {
      // Column C 기둥 앞 가구는 리사이즈 모드
      columnCResize.handlePointerDown(e);
    } else {
      // 일반 가구는 드래그 모드
      onPointerDown(e, placedModule.id);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerMove(e);
    } else {
      onPointerMove(e);
    }
  };

  const handlePointerUp = () => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerUp();
    } else {
      onPointerUp();
    }
  };

  // 위치 변경 로깅은 이미 상단에서 처리됨

  // 🔴🔴🔴 최종 Y 위치 확인
  const finalYPosition = adjustedPosition.y;
  
  if (isUpperCabinet) {
    }

  // 모듈 데이터는 이미 line 458에서 체크했으므로 여기서는 체크하지 않음
  // 이곳에서 early return하면 React Hooks 에러 발생
  
  // moduleData가 없으면 빈 그룹 반환
  // 듀얼 가구의 슬롯 너비 계산 (useMemo로 최적화)
  const calculatedSlotWidths = React.useMemo(() => {
    if (!isDualFurniture || needsEndPanelAdjustment) {
      return undefined;
    }

    if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
      const targetZone = placedModule.zone === 'dropped' && zoneSlotInfo.dropped ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
      if (targetZone?.slotWidths) {
        const localIndex = localSlotIndex ?? placedModule.slotIndex;
        if (localIndex !== undefined && localIndex >= 0 && localIndex < targetZone.slotWidths.length - 1) {
          return [targetZone.slotWidths[localIndex], targetZone.slotWidths[localIndex + 1]];
        }
      }
    }

    if (indexing.slotWidths && normalizedSlotIndex !== undefined && normalizedSlotIndex < indexing.slotWidths.length - 1) {
      return [indexing.slotWidths[normalizedSlotIndex], indexing.slotWidths[normalizedSlotIndex + 1]];
    }

    return undefined;
  }, [isDualFurniture, needsEndPanelAdjustment, placedModule.zone, localSlotIndex, normalizedSlotIndex,
      spaceInfo.droppedCeiling?.enabled, zoneSlotInfo, indexing.slotWidths]);

  // moduleData가 없으면 빈 그룹 반환 (모든 Hook 호출 이후)
  if (moduleNotFound || !moduleData) {
    return <group />;
  }

  return (
    <group userData={{ furnitureId: placedModule.id }}>
      {/* 가구 본체 (기둥에 의해 밀려날 수 있음) */}
      <group
        userData={{ furnitureId: placedModule.id, type: 'furniture-body' }}
        position={[
          adjustedPosition.x + positionAdjustmentForEndPanel,
          finalYPosition, // 상부장은 강제로 14, 나머지는 adjustedPosition.y
          furnitureZ // 공간 앞면에서 뒤쪽으로 배치
        ]}
        rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        onDoubleClick={(e) => onDoubleClick(e, placedModule.id)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={() => {
          if (isColumnCFront && !isDragMode) {
            document.body.style.cursor = columnCResize.isResizing ? 'crosshair' : 'move';
          } else {
            document.body.style.cursor = isDragMode ? 'grab' : (isDraggingThis ? 'grabbing' : 'grab');
          }
          setIsHovered(true);
        }}
        onPointerOut={() => {
          if (!columnCResize.isResizing) {
            document.body.style.cursor = 'default';
          }
          setIsHovered(false);
        }}
      >
        {isSelected && width > 0 && height > 0 && depth > 0 && (
          <>
            {/* 발광 효과를 위한 외부 메쉬 */}
            <mesh
              position={[0, 0, 0]}
              renderOrder={998}
            >
              <boxGeometry args={[width + highlightPadding * 3, height + highlightPadding * 3, depth + highlightPadding * 3]} />
              <meshBasicMaterial
                color={selectionHighlightColor}
                transparent
                opacity={0.1}
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            
            {/* 메인 하이라이트 박스와 엣지 */}
            <mesh
              ref={highlightMeshRef}
              position={[0, 0, 0]}
              renderOrder={999}
              userData={{ decoration: 'selection-highlight', furnitureId: placedModule.id }}
            >
              <boxGeometry args={[width, height, depth]} />
              <meshBasicMaterial
                color={selectionHighlightColor}
                transparent
                opacity={0.05}
                depthWrite={false}
                depthTest={true}
                toneMapped={false}
              />
              {/* 모든 엣지 라인 강조 */}
              <Edges
                color={selectionHighlightColor}
                scale={1.0}
                threshold={15}
                linewidth={3}
              />
            </mesh>
            
            {/* 외곽 엣지 라인 (더 크게) */}
            <Box args={[width + 0.005, height + 0.005, depth + 0.005]}>
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
              />
              <Edges
                color={selectionHighlightColor}
                scale={1.0}
                threshold={15}
                linewidth={2}
              />
            </Box>
          </>
        )}
        {/* 노서라운드 모드에서 가구 위치 디버깅 */}
        {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && (() => {
          return null;
        })()}

        {/* 가구 타입에 따라 다른 컴포넌트 렌더링 */}
        {moduleData.type === 'box' ? (
          // 박스형 가구 렌더링 (도어 제외)
          <>
            {(() => {
              // 듀얼 가구이고 측면뷰인 경우, 표시할 섹션 계산
              let visibleSectionIndex: number | null = null;
              if (
                placedModule.isDualSlot &&
                (view2DDirection === 'left' || view2DDirection === 'right') &&
                normalizedSlotIndex !== undefined
              ) {
                if (selectedSlotIndex !== null) {
                  // 슬롯이 선택된 경우: 선택된 슬롯에 따라 섹션 표시
                  if (normalizedSlotIndex === selectedSlotIndex) {
                    // 첫 번째 슬롯 선택 → 좌측 섹션 (인덱스 0)
                    visibleSectionIndex = 0;
                  } else if (normalizedSlotIndex + 1 === selectedSlotIndex) {
                    // 두 번째 슬롯 선택 → 우측 섹션 (인덱스 1)
                    visibleSectionIndex = 1;
                  }
                } else {
                  // 슬롯이 선택되지 않은 경우: view2DDirection에 따라 자동 선택
                  if (view2DDirection === 'left') {
                    // 좌측뷰 → 첫 번째 슬롯 (좌측 섹션)
                    visibleSectionIndex = 0;
                  } else if (view2DDirection === 'right') {
                    // 우측뷰 → 두 번째 슬롯 (우측 섹션)
                    visibleSectionIndex = 1;
                  }
                }
              }

              console.log('🔍 FurnitureItem - visibleSectionIndex 계산:', {
                isDualSlot: placedModule.isDualSlot,
                view2DDirection,
                selectedSlotIndex,
                slotIndex: normalizedSlotIndex,
                visibleSectionIndex,
                furnitureId: placedModule.id
              });

              return (
                <BoxModule
                  moduleData={actualModuleData}
                  isDragging={isDraggingThis} // 실제로 이 가구를 드래그하는 경우만 true
                  color={furnitureColor}
                  internalHeight={furnitureHeightMm}
                  viewMode={viewMode}
                  renderMode={renderMode}
                  hasDoor={(slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || (placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null))) || needsEndPanelAdjustment
                    ? false // 기둥 A(deep) 또는 adjustedWidth가 있는 경우 또는 엔드패널 조정이 필요한 경우 도어는 별도 렌더링
                    : (placedModule.hasDoor ?? false)}
                  customDepth={actualDepthMm}
                  hingePosition={optimalHingePosition}
                  spaceInfo={zoneSpaceInfo}
                  doorWidth={originalSlotWidthMm + doorWidthExpansion} // 도어 너비에 확장분 추가
                  originalSlotWidth={originalSlotWidthMm}
                  slotCenterX={doorXOffset} // 도어 위치 오프셋 적용
                  adjustedWidth={furnitureWidthMm} // 조정된 너비를 adjustedWidth로 전달
                  slotIndex={normalizedSlotIndex} // 슬롯 인덱스 전달
                  slotInfo={slotInfo} // 슬롯 정보 전달 (기둥 침범 여부 포함)
                  slotWidths={calculatedSlotWidths}
                  isHighlighted={isSelected} // 선택 상태 전달
                  placedFurnitureId={placedModule.id} // 배치된 가구 ID 전달 (치수 편집용)
                  customSections={placedModule.customSections} // 사용자 정의 섹션 설정
                  showFurniture={showFurniture} // 가구 본체 표시 여부
                  visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
                  doorTopGap={placedModule.doorTopGap} // 천장에서 도어 상단까지의 갭
                  doorBottomGap={placedModule.doorBottomGap} // 바닥에서 도어 하단까지의 갭
                  lowerSectionDepth={placedModule.lowerSectionDepth} // 하부 섹션 깊이 (mm)
                  upperSectionDepth={placedModule.upperSectionDepth} // 상부 섹션 깊이 (mm)
                  doorSplit={placedModule.doorSplit}
                  upperDoorTopGap={placedModule.upperDoorTopGap}
                  upperDoorBottomGap={placedModule.upperDoorBottomGap}
                  lowerDoorTopGap={placedModule.lowerDoorTopGap}
                  lowerDoorBottomGap={placedModule.lowerDoorBottomGap}
                  grainDirection={placedModule.grainDirection} // 텍스처 결 방향 (하위 호환성)
                  panelGrainDirections={(() => {
                    console.log('🚨 FurnitureItem - placedModule 체크:', {
                      id: placedModule.id,
                      hasPanelGrainDirections: !!placedModule.panelGrainDirections,
                      panelGrainDirections: placedModule.panelGrainDirections,
                      panelGrainDirectionsType: typeof placedModule.panelGrainDirections,
                      panelGrainDirectionsKeys: placedModule.panelGrainDirections ? Object.keys(placedModule.panelGrainDirections) : []
                    });
                    return placedModule.panelGrainDirections;
                  })()} // 패널별 개별 결 방향
                />
              );
            })()}
            
            {/* 가구 너비 디버깅 */}
              {(() => {
              const slotWidthMm = (() => {
                if (placedModule.zone && spaceInfo.droppedCeiling?.enabled && indexing.zones) {
                  const targetZone = placedModule.zone === 'dropped' && indexing.zones.dropped ? indexing.zones.dropped : indexing.zones.normal;
                  const zoneIndex = localSlotIndex ?? placedModule.slotIndex;
                  if (zoneIndex !== undefined) {
                    return targetZone.slotWidths?.[zoneIndex] || targetZone.columnWidth;
                  }
                  return targetZone.columnWidth;
                }
                if (normalizedSlotIndex !== undefined) {
                  return indexing.slotWidths?.[normalizedSlotIndex] || indexing.columnWidth;
                }
                return indexing.columnWidth;
              })();
              
              const expectedThreeUnits = mmToThreeUnits(slotWidthMm);
              const actualThreeUnits = mmToThreeUnits(furnitureWidthMm);
              
              return null;
            })()}
          </>
        ) : (
          // 기본 가구 (단순 Box) 렌더링
          <>
            <Box 
              args={[width, height, depth]}
            >
              <meshPhysicalMaterial 
                color={furnitureColor}
                clearcoat={0.1}
                clearcoatRoughness={0.8}
                metalness={0.0}
                roughness={0.7}
                reflectivity={0.2}
                transparent={isDraggingThis || isEditMode}
                opacity={isDraggingThis || isEditMode ? 0.8 : 1.0}
              />
            </Box>
            <Edges 
              color={columnCResize.isResizing ? '#ff6600' : getEdgeColor({
                isDragging: isDraggingThis,
                isEditMode,
                isDragMode,
                viewMode,
                view2DTheme,
                renderMode
              })} 
              threshold={1} 
              scale={1.001}
              linewidth={columnCResize.isResizing ? 3 : 1}
            />
            
            {/* 편집 모드일 때 안내 텍스트 */}
            {isEditMode && (
              <primitive 
                object={(() => {
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d')!;
                  canvas.width = 256;
                  canvas.height = 128;
                  context.fillStyle = 'rgba(255, 140, 0, 0.9)';
                  context.fillRect(0, 0, 256, 128);
                  context.fillStyle = '#ffffff';
                  context.font = '16px Arial';
                  context.textAlign = 'center';
                  context.fillText('편집 모드', 128, 25);
                  context.font = '12px Arial';
                  context.fillText('더블클릭으로 진입', 128, 40);
                  context.fillText('드래그: 이동', 128, 55);
                  context.fillText('←→: 이동', 128, 70);
                  context.fillText('Del: 삭제', 128, 85);
                  context.fillText('Esc: 해제', 128, 100);
                  
                  const texture = new THREE.CanvasTexture(canvas);
                  const material = new THREE.MeshBasicMaterial({ 
                    map: texture, 
                    transparent: true,
                    depthTest: false
                  });
                  const geometry = new THREE.PlaneGeometry(3, 1.5);
                  const mesh = new THREE.Mesh(geometry, material);
                  mesh.position.set(0, height + 2, 0);
                  mesh.renderOrder = 1002;
                  return mesh;
                })()}
              />
            )}
          </>
        )}
        
        {/* Column C 기둥 앞 가구 리사이즈 안내 표시 */}
        {isColumnCFront && isHovered && !isDragMode && !columnCResize.isResizing && (
          <Html
            position={[0, height/2 + 0.5, depth/2 + 0.1]}
            center
            occlude={false}  // 메쉬에 가려지지 않도록 설정
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 10000  // zIndex도 더 높게 설정
            }}
          >
            <div
              style={{
                background: 'rgba(255, 102, 0, 0.9)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              ↔️ 드래그하여 크기 조절
            </div>
          </Html>
        )}
        
        {/* Column C 리사이즈 방향 표시 */}
        {columnCResize.isResizing && columnCResize.resizeDirection && (
          <Html
            position={[0, 0, depth/2 + 0.1]}
            center
            occlude={false}  // 메쉬에 가려지지 않도록 설정
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 10000  // zIndex도 더 높게 설정
            }}
          >
            <div
              style={{
                background: 'rgba(255, 102, 0, 0.9)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              {columnCResize.resizeDirection === 'horizontal' ? '↔️ 너비 조절' : '↕️ 깊이 조절'}
            </div>
          </Html>
        )}
        
      </group>

      {/* 기둥 침범 시 또는 엔드패널 조정이 필요한 경우 도어를 별도로 렌더링 (원래 슬롯 위치에 고정) */}
      {/* 기둥 A (deep 타입) 또는 기둥이 있고 adjustedWidth가 설정된 경우 또는 엔드패널 조정이 필요한 경우 커버도어 렌더링 */}
      {(placedModule.hasDoor ?? false) && 
       ((slotInfo && slotInfo.hasColumn && slotInfo.columnType === 'deep') || 
        (slotInfo && slotInfo.hasColumn && placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null) ||
        needsEndPanelAdjustment) && 
       spaceInfo && (() => {
        return true;
      })() && (
        <group
          userData={{ furnitureId: placedModule.id, type: 'cover-door' }}
          position={[
            originalSlotCenterX + doorXOffset, // 도어 중심에 오프셋 적용
            finalYPosition, // 상부장은 14, 나머지는 adjustedPosition.y
            furnitureZ // 다른 도어들과 동일한 z축 위치
          ]}
          rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        >
          <DoorModule
            moduleWidth={doorWidth}
            moduleDepth={actualModuleData?.dimensions.depth || 0}
            hingePosition={optimalHingePosition}
            spaceInfo={spaceInfo}
            color={isDraggingThis ? '#ff6600' : actualModuleData?.category === 'full' ? undefined : spaceInfo.materialConfig?.doorColor}
            textureUrl={spaceInfo.materialConfig?.doorTexture}
            originalSlotWidth={originalSlotWidthForDoor}
            slotCenterX={doorXOffset}
            moduleData={actualModuleData}
            isDragging={isDraggingThis}
            isEditMode={isEditMode}
            slotWidths={(() => {
              if (placedModule.zone === 'dropped' && zoneSlotInfo?.dropped) {
                const targetZone = zoneSlotInfo.dropped;
                const zoneIndex = localSlotIndex ?? placedModule.slotIndex;
                if (zoneIndex !== undefined && targetZone.slotWidths && zoneIndex < targetZone.slotWidths.length - 1) {
                  return [targetZone.slotWidths[zoneIndex], targetZone.slotWidths[zoneIndex + 1]];
                }
              } else if (indexing.slotWidths && normalizedSlotIndex !== undefined && normalizedSlotIndex < indexing.slotWidths.length - 1) {
                return [indexing.slotWidths[normalizedSlotIndex], indexing.slotWidths[normalizedSlotIndex + 1]];
              }
              return undefined;
            })()}
          />
        </group>
      )}

      {/* 키큰장/듀얼 캐비넷 옆에 상하부장이 있을 때 엔드패널 렌더링 */}
      {/* 단, 다음의 경우는 제외:
          1. 벽 없는 구간에 있는 경우 (기존 로직)
          2. 노서라운드 벽없음 첫/마지막 슬롯 (노서라운드용 엔드패널이 별도로 렌더링됨) */}
      {(() => {
        // 엔드패널 렌더링 여부 디버깅
        if (actualModuleData?.category === 'full' && !needsEndPanelAdjustment) {
          }
        return null;
      })()}
      {needsEndPanelAdjustment && endPanelSide && !isNoSurroundFirstSlot && !isNoSurroundLastSlot && !isNoSurroundDualLastSlot && (() => {
        // 엔드패널 위치 계산
        const endPanelWidth = mmToThreeUnits(END_PANEL_THICKNESS);
        const endPanelHeight = height; // 가구와 동일한 높이
        const endPanelDepth = depth; // 가구와 동일한 깊이

        // 엔드패널 X 위치 계산 (가구의 줄어든 너비 고려)
        const adjustedHalfWidth = width / 2; // 이미 줄어든 너비의 절반
        const endPanelXPositions = [];

        const furnitureCenterX = adjustedPosition.x + positionAdjustmentForEndPanel;

        if (endPanelSide === 'left' || endPanelSide === 'both') {
          const leftPanelX = (isNoSurroundFirstSlot || isNoSurroundLastSlot || isNoSurroundDualLastSlot)
            ? furnitureCenterX - adjustedHalfWidth - endPanelWidth / 2
            : (slotBoundaries
                ? slotBoundaries.left + endPanelWidth / 2
                : furnitureCenterX - adjustedHalfWidth - endPanelWidth / 2);

          endPanelXPositions.push({
            x: leftPanelX,
            side: 'left'
          });
        }
        if (endPanelSide === 'right' || endPanelSide === 'both') {
          const rightPanelX = (isNoSurroundFirstSlot || isNoSurroundLastSlot || isNoSurroundDualLastSlot)
            ? furnitureCenterX + adjustedHalfWidth + endPanelWidth / 2
            : (slotBoundaries
                ? slotBoundaries.right - endPanelWidth / 2
                : furnitureCenterX + adjustedHalfWidth + endPanelWidth / 2);

          endPanelXPositions.push({
            x: rightPanelX,
            side: 'right'
          });
        }
        
        return (
          <>
            {endPanelXPositions.map((panel, index) => (
              <group
                key={`endpanel-group-${placedModule.id}-${panel.side}-${index}`}
                position={[panel.x, finalYPosition, furnitureZ]}
              >
                <EndPanelWithTexture
                  width={endPanelWidth}
                  height={endPanelHeight}
                  depth={endPanelDepth}
                  position={[0, 0, 0]}
                  spaceInfo={zoneSpaceInfo}
                  renderMode={renderMode}
                />
              </group>
            ))}
          </>
        );
      })()}

      {/* 도어는 BoxModule 내부에서 렌더링하도록 변경 */}
      
      {/* 3D 모드에서 편집 아이콘 표시 - showDimensions가 true이고 3D 모드일 때만 표시 */}
      {showDimensions && viewMode === '3D' && (
        <Html
          position={[
            adjustedPosition.x + positionAdjustmentForEndPanel,
            finalYPosition - height / 2 - 2.0, // 하부 프레임보다 더 아래로 (1.0 -> 2.0)
            furnitureZ + depth / 2 + 0.5 // 가구 앞쪽
          ]}
          center
          style={{
            userSelect: 'none',
            pointerEvents: 'auto',
            zIndex: 100,
            background: 'transparent'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: `2px solid ${getThemeColor()}`,
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                transition: 'all 0.2s ease',
                opacity: isHovered ? 1 : 0.8,
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                // 이미 편집 모드라면 팝업 닫기
                if (isEditMode) {
                  const closeAllPopups = useUIStore.getState().closeAllPopups;
                  closeAllPopups();
                } else {
                  // 편집 모드가 아니면 팝업 열기
                  onDoubleClick(e as any, placedModule.id);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              title="가구 속성 편집"
            >
              <EditIcon color={getThemeColor()} size={18} />
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default FurnitureItem; 
