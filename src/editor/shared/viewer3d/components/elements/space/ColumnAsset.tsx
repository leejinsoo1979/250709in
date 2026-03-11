import React, { useRef, useState, useEffect, useMemo } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useUIStore } from '@/store/uiStore';
import {
  isCabinetTexture1,
  applyCabinetTexture1Settings,
  isOakTexture,
  applyOakTextureSettings
} from '@/editor/shared/utils/materialConstants';


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
  onColumnUpdate?: (id: string, updates: any) => void;
  spaceInfo?: any;
  hasBackPanelFinish?: boolean;
  hasFrontPanelFinish?: boolean;
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
  onColumnUpdate,
  spaceInfo,
  hasBackPanelFinish = false,
  hasFrontPanelFinish = false
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
  const { selectedColumnId, setSelectedColumnId, openColumnEditModal, openColumnPopup, activePopup, view2DDirection, setFurnitureDragging, viewMode: uiViewMode } = useUIStore();

  // 현재 기둥 데이터 가져오기
  const currentColumn = spaceConfig.spaceInfo.columns?.find(col => col.id === id);
  
  const { invalidate } = useThree();
  
  // 기둥 위치나 크기 변경 시 렌더링 업데이트 (드래그 중이 아닐 때만)
  useEffect(() => {
    if (!isDragging) {
      invalidate();
      tempPositionRef.current = position; // 위치 동기화
    }
  }, [position, width, height, depth, isDragging, invalidate]);

  // 기둥이 선택되었는지 확인 (편집 모달이 열렸을 때만)
  const isSelected = activePopup.type === 'columnEdit' && activePopup.id === id;

  // 기둥 재질 생성 - 드래그 중에는 업데이트하지 않음
  const material = React.useMemo(() => {
    // 선택된 기둥은 연두색으로 표시
    const displayColor = isSelected ? '#4CAF50' : color;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(displayColor),
      metalness: 0.1,
      roughness: 0.7,
      transparent: true,
      opacity: 1.0,
    });
  }, [color, isSelected]); // isDragging 제거

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

  // 전면 패널 재질 (텍스처 지원)
  const frontPanelMaterial = useMemo(() => {
    const interiorColor = spaceConfig.spaceInfo.materialConfig?.interiorColor || '#E0E0E0';
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(interiorColor),
      roughness: 0.6,
      metalness: 0.0,
    });
  }, [spaceConfig.spaceInfo.materialConfig?.interiorColor]);

  // 전면 패널 텍스처 로딩
  const textureUrl = spaceConfig.spaceInfo.materialConfig?.interiorTexture;

  useEffect(() => {
    if (!textureUrl || !frontPanelMaterial) return;

    // Cabinet Texture1인 경우 미리 재질 설정
    if (isCabinetTexture1(textureUrl)) {
      applyCabinetTexture1Settings(frontPanelMaterial);
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      textureUrl,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        frontPanelMaterial.map = texture;

        if (isOakTexture(textureUrl)) {
          applyOakTextureSettings(frontPanelMaterial, false);
        } else if (!isCabinetTexture1(textureUrl)) {
          frontPanelMaterial.color.setHex(0xffffff);
          frontPanelMaterial.toneMapped = true;
          frontPanelMaterial.roughness = 0.6;
        }

        frontPanelMaterial.needsUpdate = true;
      },
      undefined,
      (error) => {
        console.error('전면 패널 텍스처 로딩 실패:', error);
      }
    );

    return () => {
      if (frontPanelMaterial.map) {
        frontPanelMaterial.map.dispose();
        frontPanelMaterial.map = null;
      }
    };
  }, [textureUrl, frontPanelMaterial]);

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
    
    // console.log('🎯 기둥 포인터 다운:', id);
    
    setPointerDownTime(Date.now());
    setHasMoved(false);
    setDragStart(event.point);
    
    // 화면 좌표 저장
    const startScreenX = event.nativeEvent.clientX;
    let moveThreshold = 5; // 5px 이상 움직여야 드래그로 간주
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
        setFurnitureDragging(true); // 기둥 드래그 시작 시 화면 회전 비활성화
        
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
      const newX = Math.max(minX, Math.min(maxX, worldX));
      
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
        setFurnitureDragging(false);
        
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
          
          {/* 투명 배경 (2D에서 메쉬 색상 숨김) */}
          <mesh>
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial
              transparent
              opacity={0}
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
            const spacing = 0.5; // 2배 덜 촘촘하게
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
                      <Line
                        key={`front-diag-${i}`}
                        points={[
                          [Math.max(-widthM/2, Math.min(widthM/2, startX)), startY, depthM/2 + 0.001],
                          [Math.max(-widthM/2, Math.min(widthM/2, endX)), endY, depthM/2 + 0.001]
                        ]}
                        color={color}
                        lineWidth={1}
                      />
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
                      <Line
                        key={`top-diag-${i}`}
                        points={[
                          [Math.max(-widthM/2, Math.min(widthM/2, startX)), 0.001, startZ],
                          [Math.max(-widthM/2, Math.min(widthM/2, endX)), 0.001, endZ]
                        ]}
                        color={color}
                        lineWidth={1}
                      />
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
                      <Line
                        key={`side-diag-${i}`}
                        points={[
                          [0.001, Math.max(-heightM/2, Math.min(heightM/2, startY)), startZ],
                          [0.001, Math.max(-heightM/2, Math.min(heightM/2, endY)), endZ]
                        ]}
                        color={color}
                        lineWidth={1}
                      />
                    );
                  }
                }
                break;
            }
            
            return lines;
          })()}

          {/* 전면 패널 윤곽선 (18mm 두께) - 2D */}
          {(() => {
            const topFrameHeight = spaceConfig.spaceInfo.frameSize?.top || 30;
            const baseHeight = spaceConfig.spaceInfo.baseConfig?.height || 65;
            const panelHeight = height - topFrameHeight - baseHeight;
            const panelCenterY = baseHeight + panelHeight / 2 - height / 2; // group 중심 기준 오프셋

            if (hasFrontPanelFinish) {
              return (
                <lineSegments position={[0, panelCenterY * 0.01, (depth * 0.01) / 2 + 0.09]}>
                  <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, panelHeight * 0.01, 0.18)]} />
                  <lineBasicMaterial color={isSelected ? "#4CAF50" : (spaceConfig.spaceInfo.materialConfig?.interiorColor || "#999999")} />
                </lineSegments>
              );
            }

            return null;
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
          <Line
            points={[
              [-(width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2],
              [(width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2]
            ]}
            color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#333333"}
            lineWidth={1}
          />
          <Line
            points={[
              [(width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2],
              [-(width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2]
            ]}
            color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#333333"}
            lineWidth={1}
          />

          {/* 전면 패널 윤곽선 (18mm 두께) */}
          {(() => {
            const topFrameHeight = spaceConfig.spaceInfo.frameSize?.top || 30;
            const baseHeight = spaceConfig.spaceInfo.baseConfig?.height || 65;
            const panelHeight = height - topFrameHeight - baseHeight;
            const panelCenterY = baseHeight + panelHeight / 2 - height / 2; // group 중심 기준 오프셋

            if (hasFrontPanelFinish) {
              return (
                <lineSegments position={[0, panelCenterY * 0.01, (depth * 0.01) / 2 + 0.09]}>
                  <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, panelHeight * 0.01, 0.18)]} />
                  <lineBasicMaterial color={isSelected ? "#4CAF50" : (spaceConfig.spaceInfo.materialConfig?.interiorColor || "#333333")} />
                </lineSegments>
              );
            }

            return null;
          })()}
        </group>
      ) : (
        // 3D 솔리드 모드: 일반 메시
        <>
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
            position={[0, (height * 0.01) / 2, 0]} // 기둥 mesh를 위로 올려서 바닥에 맞춤
            userData={{ isColumn: true, columnId: id }}
            scale={isDragging ? [0.95, 0.95, 0.95] : [1, 1, 1]}
          >
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
          </mesh>
          
          {/* 뒷면 패널 마감 */}
          {hasBackPanelFinish && (
            <mesh
              position={[0, (height * 0.01) / 2, -(depth * 0.01) / 2 - 0.009]} // 기둥 뒷면에서 18mm(0.018) 뒤에 위치
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
          )}

          {/* 전면 패널 (기둥과 같은 폭, 18mm 두께) - 프레임 재질 */}
          {(() => {
            const topFrameHeight = spaceConfig.spaceInfo.frameSize?.top || 30;
            const baseHeight = spaceConfig.spaceInfo.baseConfig?.height || 65;
            const panelHeight = height - topFrameHeight - baseHeight;
            const panelCenterY = baseHeight + panelHeight / 2;

            if (hasFrontPanelFinish) {
              return (
                <mesh
                  position={[0, panelCenterY * 0.01, (depth * 0.01) / 2 + 0.09]}
                  receiveShadow={viewMode === '3D'}
                  castShadow={viewMode === '3D'}
                  material={frontPanelMaterial}
                >
                  <boxGeometry args={[width * 0.01, panelHeight * 0.01, 0.18]} />
                </mesh>
              );
            }

            return null;
          })()}
        </>
      )}
    </group>
  );
};

export default React.memo(ColumnAsset, (prevProps, nextProps) => {
  // 커스텀 비교 함수: 위치, 크기, 색상이 같으면 리렌더링 방지
  return (
    prevProps.position[0] === nextProps.position[0] &&
    prevProps.position[1] === nextProps.position[1] &&
    prevProps.position[2] === nextProps.position[2] &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.depth === nextProps.depth &&
    prevProps.color === nextProps.color &&
    prevProps.id === nextProps.id &&
    prevProps.renderMode === nextProps.renderMode &&
    prevProps.hasBackPanelFinish === nextProps.hasBackPanelFinish &&
    prevProps.hasFrontPanelFinish === nextProps.hasFrontPanelFinish &&
    prevProps.spaceInfo?.width === nextProps.spaceInfo?.width &&
    prevProps.spaceInfo?.depth === nextProps.spaceInfo?.depth &&
    prevProps.spaceInfo?.height === nextProps.spaceInfo?.height
  );
});