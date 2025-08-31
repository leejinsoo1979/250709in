import React, { useRef, useState, useEffect } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useUIStore } from '@/store/uiStore';
import { TextureGenerator } from '../../../utils/materials/TextureGenerator';
import { ColumnIndexer } from '@/editor/shared/utils/indexing';


interface ColumnAssetProps {
  position: [number, number, number];
  id: string;
  width?: number;
  height?: number;
  depth?: number;
  color?: string;
  renderMode?: 'solid' | 'wireframe';
  onPositionChange?: (id: string, newPosition: [number, number, number]) => void;
  onRemove?: (id: string) => void;
  spaceInfo?: any;
  hasBackPanelFinish?: boolean;
  onZoneCross?: (info: {
    fromZone: 'normal' | 'dropped';
    toZone: 'normal' | 'dropped';
    boundaryPosition: 'left' | 'right';
    targetPosition: [number, number, number];
  }) => void;
}

const ColumnAsset: React.FC<ColumnAssetProps> = ({
  position,
  id,
  width = 300, // 300mm
  height = 2400, // 2400mm (공간 높이와 동일)
  depth = 730, // 730mm
  color = '#E0E0E0', // 기본 회색
  renderMode = 'solid',
  onPositionChange,
  onRemove,
  spaceInfo,
  hasBackPanelFinish = false,
  onZoneCross
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
  const [pointerDownTime, setPointerDownTime] = useState<number>(0);
  const [hasMoved, setHasMoved] = useState(false);
  
  // 캐싱된 canvas 및 rect
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // 드래그 중 임시 위치 (리렌더링 최소화)
  const tempPositionRef = useRef<[number, number, number]>(position);
  const lastUpdateTimeRef = useRef<number>(0);
  

  const { viewMode } = useSpace3DView();
  const spaceConfig = useSpaceConfigStore();
  const { selectedColumnId, setSelectedColumnId, openColumnEditModal, openColumnPopup, activePopup, view2DDirection, setIsDraggingColumn, viewMode: uiViewMode } = useUIStore();

  // 현재 기둥 데이터 가져오기
  const currentColumn = spaceConfig.spaceInfo.columns?.find(col => col.id === id);
  
  // 기둥 위치나 크기 변경 시 렌더링 업데이트 (드래그 중이 아닐 때만)
  useEffect(() => {
    if (!isDragging) {
      tempPositionRef.current = position; // 위치 동기화
    }
  }, [position, width, height, depth, isDragging]);

  // 기둥이 선택되었는지 확인 (편집 모달이 열렸을 때만)
  const isSelected = activePopup.type === 'columnEdit' && activePopup.id === id;
  
  // 구역 판별 함수
  const getZoneForPosition = (xPosition: number): 'normal' | 'dropped' | null => {
    if (!spaceConfig.spaceInfo.droppedCeiling?.enabled) {
      return 'normal';
    }
    
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(
      spaceConfig.spaceInfo,
      spaceConfig.spaceInfo.customColumnCount
    );
    
    if (!zoneInfo || !zoneInfo.normal || !zoneInfo.dropped) {
      return null;
    }
    
    // Three.js 좌표를 mm로 변환
    const xInMm = xPosition * 100;
    
    // 단내림 위치에 따라 구역 판별
    if (spaceConfig.spaceInfo.droppedCeiling.position === 'left') {
      // 왼쪽 단내림: dropped가 왼쪽, normal이 오른쪽
      if (xInMm >= zoneInfo.dropped.startX && xInMm <= zoneInfo.dropped.startX + zoneInfo.dropped.width) {
        return 'dropped';
      } else if (xInMm >= zoneInfo.normal.startX && xInMm <= zoneInfo.normal.startX + zoneInfo.normal.width) {
        return 'normal';
      }
    } else {
      // 오른쪽 단내림: normal이 왼쪽, dropped가 오른쪽
      if (xInMm >= zoneInfo.normal.startX && xInMm <= zoneInfo.normal.startX + zoneInfo.normal.width) {
        return 'normal';
      } else if (xInMm >= zoneInfo.dropped.startX && xInMm <= zoneInfo.dropped.startX + zoneInfo.dropped.width) {
        return 'dropped';
      }
    }
    
    return null;
  };
  
  // 구역 경계 위치 계산
  const getZoneBoundaryX = (targetZone: 'normal' | 'dropped', side: 'left' | 'right'): number => {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(
      spaceConfig.spaceInfo,
      spaceConfig.spaceInfo.customColumnCount
    );
    
    if (!zoneInfo || !zoneInfo[targetZone]) {
      return 0;
    }
    
    const zone = zoneInfo[targetZone];
    const columnHalfWidthMm = width / 2;
    const innerWallThickness = 10; // 단내림 내벽 두께 10mm
    
    // 단내림 구간의 경우 내벽 두께를 고려하여 더 안쪽으로 배치
    if (targetZone === 'dropped') {
      // 단내림 구간은 내벽 두께만큼 더 안쪽으로
      if (side === 'left') {
        // 단내림 왼쪽 경계: 내벽 두께 + 기둥 반폭
        return (zone.startX + innerWallThickness + columnHalfWidthMm) * 0.01;
      } else {
        // 단내림 오른쪽 경계: 내벽 두께 + 기둥 반폭만큼 안쪽
        return (zone.startX + zone.width - innerWallThickness - columnHalfWidthMm) * 0.01;
      }
    } else {
      // 일반 구간은 기존대로
      if (side === 'left') {
        return (zone.startX + columnHalfWidthMm) * 0.01;
      } else {
        return (zone.startX + zone.width - columnHalfWidthMm) * 0.01;
      }
    }
  };

  // 기둥 재질 생성 - 그라데이션 텍스처 적용
  const material = React.useMemo(() => {
    // 벽과 똑같은 그라데이션 텍스처 사용
    const gradientTexture = TextureGenerator.createWallGradientTexture();
    
    // 텍스처가 세로로 한 번만 적용되도록 설정
    gradientTexture.wrapS = THREE.ClampToEdgeWrapping;
    gradientTexture.wrapT = THREE.ClampToEdgeWrapping;
    
    // 선택된 기둥은 연두색 틴트 적용
    const displayColor = isSelected ? '#4CAF50' : new THREE.Color(1, 1, 1);
    
    return new THREE.MeshStandardMaterial({
      map: gradientTexture,
      color: displayColor,
      metalness: 0.1,
      roughness: 0.7,
    });
  }, [isSelected]);

  // 와이어프레임용 윤곽선 재질
  const wireframeMaterial = React.useMemo(() => {
    let displayColor = "#333333";
    if (isSelected) {
      displayColor = "#4CAF50"; // 선택된 기둥은 연두색
    } else if (isDragging) {
      displayColor = "#ff6b6b"; // 드래그 중인 기둥은 빨간색
    }
    
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(displayColor),
      linewidth: 1
    });
  }, [isDragging, isSelected]);

  // 클릭 처리 - 기둥 선택만
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();
    event.nativeEvent.preventDefault();
    
    // console.log('🎯 기둥 클릭 이벤트 발생:', id);
    
    // 드래그 중이거나 움직임이 있었으면 클릭 무시
    if (isDragging || hasMoved) {
      // console.log('🎯 드래그 중이거나 움직임이 있었으므로 클릭 무시');
      return;
    }

    // 클릭 시간이 너무 길면 드래그로 간주
    const clickDuration = Date.now() - pointerDownTime;
    if (clickDuration > 200) {
      // console.log('🎯 클릭 시간이 너무 길어서 무시:', clickDuration);
      return;
    }

    // 클릭 - 기둥 선택 및 기둥 팝업 열기
    // console.log('🎯 기둥 클릭 - 기둥 선택 및 팝업 열기:', id);
    // console.log('🎯 현재 selectedColumnId:', selectedColumnId);
    
    // 기둥 선택 및 기둥 팝업 열기
    setSelectedColumnId(id);
    openColumnPopup(id);
    
    // console.log('✅ setSelectedColumnId 및 openColumnPopup 호출됨:', id);
    // console.log('✅ 변경 후 selectedColumnId:', id);
  };

  // 더블 클릭 처리 - 편집 모달 열기
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();
    event.nativeEvent.preventDefault();
    
    // console.log('🎯 기둥 더블클릭 이벤트 발생:', id);
    
    // 드래그 중이거나 움직임이 있었으면 더블클릭 무시
    if (isDragging || hasMoved) {
      // console.log('🎯 드래그 중이거나 움직임이 있었으므로 더블클릭 무시');
      return;
    }

    // 더블 클릭 - 기둥 선택 및 편집 모달 열기
    // console.log('🎯 기둥 더블 클릭 - 기둥 선택 및 편집 모달 열기:', id);
    // console.log('🎯 현재 selectedColumnId:', selectedColumnId);
    
    // 기둥 선택 및 편집 모달 열기
    setSelectedColumnId(id);
    openColumnEditModal(id);
    
    // console.log('✅ setSelectedColumnId 및 openColumnEditModal 호출됨:', id);
    // console.log('✅ 변경 후 selectedColumnId:', id);
  };

  // 포인터 다운 처리
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();
    // passive 이벤트 리스너 경고 방지 - preventDefault 제거
    
    // console.log('🎯 기둥 포인터 다운:', id);
    
    setPointerDownTime(Date.now());
    setHasMoved(false);
    setDragStart(event.point);
    
    // 화면 좌표 저장
    const startScreenX = event.nativeEvent.clientX;
    const moveThreshold = 5; // 5px 이상 움직여야 드래그로 간주
    const updateInterval = 16; // 약 60fps로 제한
    
    // 드래그 시작 시 필요한 값들 미리 계산
    const spaceWidthHalf = (spaceInfo?.width || 3000) * 0.005;
    const columnHalfWidth = width * 0.005;
    const minX = -spaceWidthHalf + columnHalfWidth;
    const maxX = spaceWidthHalf - columnHalfWidth;
    
    // Canvas 찾기 (한 번만)
    if (!canvasRef.current) {
      canvasRef.current = document.querySelector('canvas');
    }
    
    // 전역 이벤트 리스너 등록
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // 움직임 감지
      const currentScreenX = e.clientX;
      const moveDistance = Math.abs(currentScreenX - startScreenX);
      
      if (moveDistance > moveThreshold && !isDraggingRef.current) {
        setHasMoved(true);
        setIsDragging(true);
        isDraggingRef.current = true;
        setIsDraggingColumn(true); // 기둥 드래그 시작 시 화면 회전 비활성화
        
        // 3D 모드에서 기둥 드래그 시작 시 카메라 리셋 이벤트 발생
        if (uiViewMode === '3D') {
          window.dispatchEvent(new CustomEvent('reset-camera-for-column'));
        }
        
        // 기둥 드래그 시작 이벤트 발생 (가구와 동일한 이벤트 사용)
        window.dispatchEvent(new CustomEvent('furniture-drag-start'));
      }
      
      // 드래그 중이 아니면 무시
      if (!isDraggingRef.current) return;
      
      // 쓰로틀링 - 너무 자주 업데이트하지 않도록
      const currentTime = Date.now();
      if (currentTime - lastUpdateTimeRef.current < updateInterval) return;
      lastUpdateTimeRef.current = currentTime;
      
      // 마우스 움직임을 3D 공간 좌표로 변환
      if (!canvasRef.current) return;
      
      // rect를 업데이트 (드래그 시작 시에만)
      if (!canvasRectRef.current) {
        canvasRectRef.current = canvasRef.current.getBoundingClientRect();
      }
      const rect = canvasRectRef.current;
      const x = e.clientX - rect.left;
      
      // 간단한 X축 이동만 허용 (Y, Z는 고정)
      const normalizedX = (x / rect.width) * 2 - 1;
      const worldX = normalizedX * spaceWidthHalf;
      
      // X축만 이동, Y는 현재 위치 유지, Z는 뒷벽에 고정  
      let newX = Math.max(minX, Math.min(maxX, worldX));
      
      // 다른 기둥에 밀착되도록 스냅 (뛰어넘기 방지)
      const columns = spaceConfig.spaceInfo.columns || [];
      const columnWidthInThreeUnits = width * 0.01; // mm to three units
      const snapThreshold = columnWidthInThreeUnits * 0.3; // 30% 이내에서 스냅
      const epsilon = 0.001; // 부동소수점 오차 허용치
      
      for (const column of columns) {
        if (column.id === id || !column.position) continue; // 자기 자신은 제외
        
        const otherX = column.position[0];
        const otherLeft = otherX - columnWidthInThreeUnits / 2;
        const otherRight = otherX + columnWidthInThreeUnits / 2;
        
        // 현재 기둥의 왼쪽과 오른쪽 경계
        const currentLeft = newX - columnWidthInThreeUnits / 2;
        const currentRight = newX + columnWidthInThreeUnits / 2;
        
        // 겹침 감지 및 스냅
        if (currentLeft < otherRight + epsilon && currentRight > otherLeft - epsilon) {
          // 겹치려고 하는 경우
          if (newX > otherX) {
            // 오른쪽으로 밀착
            newX = otherX + columnWidthInThreeUnits;
          } else {
            // 왼쪽으로 밀착
            newX = otherX - columnWidthInThreeUnits;
          }
        } else {
          // 겹치지 않는 경우 가까우면 스냅
          const distToLeft = Math.abs(newX - (otherX - columnWidthInThreeUnits));
          const distToRight = Math.abs(newX - (otherX + columnWidthInThreeUnits));
          
          if (distToLeft < snapThreshold) {
            newX = otherX - columnWidthInThreeUnits;
          } else if (distToRight < snapThreshold) {
            newX = otherX + columnWidthInThreeUnits;
          }
        }
      }
      
      // 공간 범위 내로 제한
      newX = Math.max(minX, Math.min(maxX, newX));
      
      // 구역 교차 검사 (단내림이 활성화된 경우에만)
      if (spaceConfig.spaceInfo.droppedCeiling?.enabled) {
        const currentZone = getZoneForPosition(position[0]);
        const newZone = getZoneForPosition(newX);
        
        if (currentZone && newZone && currentZone !== newZone) {
          // 구역을 넘으려고 함 - 드래그 중단하고 팝업 표시
          
          // 어느 쪽 경계에 배치할지 결정
          let boundaryPosition: 'left' | 'right';
          if (newZone === 'dropped') {
            // 단내림 구간으로 이동
            if (spaceConfig.spaceInfo.droppedCeiling.position === 'left') {
              // 왼쪽 단내림: 일반 구간에서 왼쪽으로 이동 -> 단내림 오른쪽 경계
              boundaryPosition = 'right';
            } else {
              // 오른쪽 단내림: 일반 구간에서 오른쪽으로 이동 -> 단내림 왼쪽 경계
              boundaryPosition = 'left';
            }
          } else {
            // 일반 구간으로 이동
            if (spaceConfig.spaceInfo.droppedCeiling.position === 'left') {
              // 왼쪽 단내림: 단내림에서 오른쪽으로 이동 -> 일반 왼쪽 경계
              boundaryPosition = 'left';
            } else {
              // 오른쪽 단내림: 단내림에서 왼쪽으로 이동 -> 일반 오른쪽 경계
              boundaryPosition = 'right';
            }
          }
          
          const targetX = getZoneBoundaryX(newZone, boundaryPosition);
          
          // onZoneCross 콜백 호출
          if (onZoneCross) {
            onZoneCross({
              fromZone: currentZone,
              toZone: newZone,
              boundaryPosition,
              targetPosition: [targetX, position[1], position[2]]
            });
          }
          
          // 드래그 중단
          handleGlobalPointerUp();
          return;
        }
      }
      
      // 임시 위치 업데이트
      tempPositionRef.current = [newX, position[1], position[2]];
      
      if (onPositionChange && !isNaN(newX)) {
        // 애니메이션 프레임 취소 및 새로 요청
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        
        animationFrameRef.current = requestAnimationFrame(() => {
          onPositionChange(id, tempPositionRef.current);
          animationFrameRef.current = null;
        });
      }
    };
    
    const handleGlobalPointerUp = () => {
      // 드래그 중이었다면 화면 회전 다시 활성화
      if (isDraggingRef.current) {
        setIsDraggingColumn(false);
        
        // 기둥 드래그 종료 이벤트 발생
        window.dispatchEvent(new CustomEvent('column-drag-end'));
        window.dispatchEvent(new CustomEvent('furniture-drag-end'));
      }
      
      setIsDragging(false);
      isDraggingRef.current = false;
      setDragStart(null);
      setHasMoved(false);
      
      // 전역 이벤트 리스너 제거
      document.removeEventListener('pointermove', handleGlobalPointerMove);
      document.removeEventListener('pointerup', handleGlobalPointerUp);
      
      // 캐시 초기화
      canvasRectRef.current = null;
      
      // 애니메이션 프레임 취소
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    
    // 전역 이벤트 리스너 등록 - passive 옵션 추가
    document.addEventListener('pointermove', handleGlobalPointerMove, { passive: true });
    document.addEventListener('pointerup', handleGlobalPointerUp);
  };

  // 우클릭으로 삭제
  const handleContextMenu = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopPropagation();
    event.nativeEvent.preventDefault();
    // console.log('🎯 기둥 우클릭 - 삭제 확인');
    if (window.confirm('기둥을 삭제하시겠습니까?')) {
      onRemove?.(id);
    }
  };


  // 드래그 중일 때는 프레임마다 업데이트하지 않음 (성능 최적화)
  // React Three Fiber가 자동으로 처리하도록 함

  return (
    <>
      <group position={position}>
      {viewMode === '2D' ? (
        // 2D 모드: 옅은 회색 면에 빗살무늬 표시
        <group position={[0, (height * 0.01) / 2, 0]}>
          {/* 투명한 클릭 영역 박스 */}
          <mesh
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
            userData={{ isColumn: true, columnId: id }}
          >
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
          {/* 옅은 회색 배경 면 */}
          <mesh>
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial 
              color={isSelected ? "#e8f5e8" : "#f0f0f0"} 
              transparent 
              opacity={0.6}
            />
          </mesh>
          
          {/* 윤곽선 */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, depth * 0.01)]} />
            <lineBasicMaterial color={isSelected ? "#4CAF50" : "#999999"} />
          </lineSegments>
          
          {/* 빗살무늬 (뷰별 적절한 면에 표시) */}
          {(() => {
            const color = isSelected ? "#4CAF50" : "#cccccc";
            const spacing = 0.25; // 덜 촘촘하게
            const widthM = width * 0.01;
            const heightM = height * 0.01;
            const depthM = depth * 0.01;
            
            const lines = [];
            
            switch (view2DDirection) {
              case 'front':
                // 정면뷰: XY 평면에 대각선 빗살 (좌하→우상)
                for (let i = -Math.ceil(widthM / spacing); i <= Math.ceil(heightM / spacing); i++) {
                  const y1 = -heightM/2 + i * spacing;
                  const y2 = y1 + widthM;
                  
                  // 기둥 영역 내에서 잘라내기
                  const startY = Math.max(-heightM/2, Math.min(heightM/2, y1));
                  const endY = Math.max(-heightM/2, Math.min(heightM/2, y2));
                  
                  if (startY < endY) {
                    const startX = -widthM/2 + (startY - y1);
                    const endX = -widthM/2 + (endY - y1);
                    
                    lines.push(
                      <line key={`front-diag-${i}`}>
                        <bufferGeometry>
                          <bufferAttribute
                            attach="attributes-position"
                            count={2}
                            array={new Float32Array([
                              Math.max(-widthM/2, Math.min(widthM/2, startX)), startY, depthM/2 + 0.001,
                              Math.max(-widthM/2, Math.min(widthM/2, endX)), endY, depthM/2 + 0.001
                            ])}
                            itemSize={3}
                          />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} />
                      </line>
                    );
                  }
                }
                break;
                
              case 'top':
                // 상부뷰: XZ 평면에 대각선 빗살
                for (let i = -Math.ceil(widthM / spacing); i <= Math.ceil(depthM / spacing); i++) {
                  const z1 = -depthM/2 + i * spacing;
                  const z2 = z1 + widthM;
                  
                  const startZ = Math.max(-depthM/2, Math.min(depthM/2, z1));
                  const endZ = Math.max(-depthM/2, Math.min(depthM/2, z2));
                  
                  if (startZ < endZ) {
                    const startX = -widthM/2 + (startZ - z1);
                    const endX = -widthM/2 + (endZ - z1);
                    
                    lines.push(
                      <line key={`top-diag-${i}`}>
                        <bufferGeometry>
                          <bufferAttribute
                            attach="attributes-position"
                            count={2}
                            array={new Float32Array([
                              Math.max(-widthM/2, Math.min(widthM/2, startX)), 0.001, startZ,
                              Math.max(-widthM/2, Math.min(widthM/2, endX)), 0.001, endZ
                            ])}
                            itemSize={3}
                          />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} />
                      </line>
                    );
                  }
                }
                break;
                
              case 'left':
              case 'right':
                // 측면뷰: YZ 평면에 대각선 빗살
                for (let i = -Math.ceil(heightM / spacing); i <= Math.ceil(depthM / spacing); i++) {
                  const z1 = -depthM/2 + i * spacing;
                  const z2 = z1 + heightM;
                  
                  const startZ = Math.max(-depthM/2, Math.min(depthM/2, z1));
                  const endZ = Math.max(-depthM/2, Math.min(depthM/2, z2));
                  
                  if (startZ < endZ) {
                    const startY = -heightM/2 + (startZ - z1);
                    const endY = -heightM/2 + (endZ - z1);
                    
                    lines.push(
                      <line key={`side-diag-${i}`}>
                        <bufferGeometry>
                          <bufferAttribute
                            attach="attributes-position"
                            count={2}
                            array={new Float32Array([
                              0.001, Math.max(-heightM/2, Math.min(heightM/2, startY)), startZ,
                              0.001, Math.max(-heightM/2, Math.min(heightM/2, endY)), endZ
                            ])}
                            itemSize={3}
                          />
                        </bufferGeometry>
                        <lineBasicMaterial color={color} />
                      </line>
                    );
                  }
                }
                break;
            }
            
            return lines;
          })()}
        </group>
      ) : renderMode === 'wireframe' ? (
        // 3D 와이어프레임 모드: 윤곽선과 대각선 표시
        <group position={[0, (height * 0.01) / 2, 0]}>
          {/* 투명한 클릭 영역 박스 (와이어프레임 모드에서 마우스 인식용) */}
          <mesh
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
            userData={{ isColumn: true, columnId: id }}
          >
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
          {/* 기본 박스 윤곽선 */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, depth * 0.01)]} />
            <primitive object={wireframeMaterial} />
          </lineSegments>
          
          {/* X자 대각선 */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  -(width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2,
                  (width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#333333"} />
          </line>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  (width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2,
                  -(width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#333333"} />
          </line>
        </group>
      ) : (
        // 3D 솔리드 모드: 일반 메시
        <>
          <group position={[0, (height * 0.01) / 2, 0]}>
            <mesh
              ref={meshRef}
              material={material}
              receiveShadow={viewMode === '3D'}
              castShadow={viewMode === '3D'}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onPointerDown={handlePointerDown}
              onPointerEnter={() => setIsHovered(true)}
              onPointerLeave={() => setIsHovered(false)}
              onContextMenu={handleContextMenu}
              userData={{ isColumn: true, columnId: id }}
            >
              <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            </mesh>
            
            {/* 3D 솔리드 모드에서도 윤곽선 추가 */}
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, depth * 0.01)]} />
              <lineBasicMaterial 
                color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#666666"} 
                linewidth={1}
              />
            </lineSegments>
          </group>
          
          {/* 뒷면 패널 마감 */}
          {hasBackPanelFinish && (
            <group position={[0, (height * 0.01) / 2, -(depth * 0.01) / 2 - 0.009]}>
              <mesh
                receiveShadow={viewMode === '3D'}
                castShadow={viewMode === '3D'}
              >
                <boxGeometry args={[width * 0.01, height * 0.01, 0.018]} /> {/* 18mm 두께 */}
                <meshStandardMaterial 
                  color="#F5F5DC" 
                  roughness={0.6}
                  metalness={0.0}
                />
              </mesh>
              
              {/* 뒷면 패널 마감 윤곽선 */}
              <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, 0.018)]} />
                <lineBasicMaterial color="#999999" linewidth={1} />
              </lineSegments>
            </group>
          )}
        </>
      )}
    </group>
      
    </>
  );
};

export default React.memo(ColumnAsset, (prevProps, nextProps) => {
  // 커스텀 비교 함수: 위치, 크기, 색상이 같으면 리렌더링 방지
  return prevProps.position[0] === nextProps.position[0] &&
    prevProps.position[1] === nextProps.position[1] &&
    prevProps.position[2] === nextProps.position[2] &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.depth === nextProps.depth &&
    prevProps.color === nextProps.color &&
    prevProps.id === nextProps.id &&
    prevProps.renderMode === nextProps.renderMode &&
    prevProps.hasBackPanelFinish === nextProps.hasBackPanelFinish &&
    prevProps.spaceInfo?.width === nextProps.spaceInfo?.width &&
    prevProps.spaceInfo?.depth === nextProps.spaceInfo?.depth &&
    prevProps.spaceInfo?.height === nextProps.spaceInfo?.height;
});