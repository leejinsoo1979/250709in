import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useUIStore } from '@/store/uiStore';


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
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string) => void;
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
  onDragStart,
  onDragEnd
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
  const [pointerDownTime, setPointerDownTime] = useState<number>(0);
  const [hasMoved, setHasMoved] = useState(false);
  
  // 드래그 중 임시 위치 상태 - 제거
  
  // Throttle을 위한 ref
  const lastUpdateTime = useRef<number>(0);
  const updateThrottle = 16; // 16ms throttle (60fps에 맞춤)
  
  // Debounce를 위한 ref
  const finalUpdateTimeout = useRef<NodeJS.Timeout | null>(null);

  const { viewMode } = useSpace3DView();
  // 선택적 구독으로 불필요한 리렌더 방지
  const columns = useSpaceConfigStore(state => state.spaceInfo.columns);
  const { selectedColumnId, setSelectedColumnId, openColumnEditModal, openColumnPopup, activePopup, view2DDirection } = useUIStore();

  // 현재 기둥 데이터 가져오기
  const currentColumn = columns?.find(col => col.id === id);
  
  const { invalidate, camera, raycaster, gl } = useThree();
  
  // 기둥 위치나 크기 변경 시 렌더링 업데이트 (드래그 중이 아닐 때만)
  // 성능 개선을 위해 주석 처리 - Three.js가 자동으로 업데이트됨
  // useEffect(() => {
  //   if (!isDragging) {
  //     invalidate();
  //   }
  // }, [position, width, height, depth, isDragging, invalidate]);
  
  // 컴포넌트 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (finalUpdateTimeout.current) {
        clearTimeout(finalUpdateTimeout.current);
      }
    };
  }, []);



  // 기둥이 선택되었는지 확인 (편집 모달이 열렸을 때만)
  const isSelected = activePopup.type === 'columnEdit' && activePopup.id === id;

  // 기둥 재질 생성
  const material = React.useMemo(() => {
    // 선택된 기둥은 연두색으로 표시
    const displayColor = isSelected ? '#4CAF50' : color;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(displayColor),
      metalness: 0.1,
      roughness: 0.7,
      transparent: true,
      opacity: isDragging ? 0.7 : 1.0,
    });
  }, [color, isDragging, isSelected]);

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
    
    // console.log('🎯 기둥 포인터 다운:', id);
    
    setPointerDownTime(Date.now());
    setHasMoved(false);
    setDragStart(event.point);
    
    // 화면 좌표 저장
    const startScreenX = event.nativeEvent.clientX;
    let moveThreshold = 5; // 5px 이상 움직여야 드래그로 간주
    
    // 전역 이벤트 리스너 등록
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // 움직임 감지
      const currentScreenX = e.clientX;
      const moveDistance = Math.abs(currentScreenX - startScreenX);
      
      if (moveDistance > moveThreshold && !hasMoved) {
        // console.log('🎯 드래그 시작 감지:', moveDistance);
        setHasMoved(true);
        setIsDragging(true);
        onDragStart?.(id); // 드래그 시작 콜백
      }
      
      // 마우스 움직임을 3D 공간 좌표로 변환 (raycaster 사용)
      const canvas = gl.domElement;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // raycaster 설정
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      
      // 바닥 평면과의 교차점 계산
      const planeY = position[1]; // 기둥의 Y 위치 (바닥 높이)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectPoint);
      
      if (intersectPoint) {
        // 공간 크기 제한
        const spaceWidth = (spaceInfo?.width || 3000) * 0.01;
        const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01;
        const columnDepthM = depth * 0.01;
        const zPosition = -(spaceDepthM / 2) + (columnDepthM / 2); // 뒷벽에 고정
        
        const boundedPosition: [number, number, number] = [
          Math.max(-spaceWidth/2 + width*0.01/2, Math.min(spaceWidth/2 - width*0.01/2, intersectPoint.x)),
          position[1], // Y 좌표는 고정
          zPosition // Z는 뒷벽에 고정
        ];
        
        // 드래그 중에 실시간으로 위치 업데이트
        if (onPositionChange) {
          onPositionChange(id, boundedPosition);
        }
      }
    };
    
    const handleGlobalPointerUp = (e: PointerEvent) => {
      // console.log('🎯 기둥 포인터 업:', id, 'hasMoved:', hasMoved);
      
      setIsDragging(false);
      setDragStart(null);
      setHasMoved(false);
      onDragEnd?.(id); // 드래그 종료 콜백
      
      // 전역 이벤트 리스너 제거
      document.removeEventListener('pointermove', handleGlobalPointerMove);
      document.removeEventListener('pointerup', handleGlobalPointerUp);
    };
    
    // 전역 이벤트 리스너 등록
    document.addEventListener('pointermove', handleGlobalPointerMove);
    document.addEventListener('pointerup', handleGlobalPointerUp);
  };

  // 우클릭으로 삭제
  const handleContextMenu = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // console.log('🎯 기둥 우클릭 - 삭제 확인');
    if (window.confirm('기둥을 삭제하시겠습니까?')) {
      onRemove?.(id);
    }
  };

  // 애니메이션 효과 제거 (기둥은 회전하지 않음)
  // useFrame((state) => {
  //   if (meshRef.current && isHovered) {
  //     meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 2) * 0.1;
  //   }
  // });


  return (
    <group ref={viewMode === '3D' ? meshRef : null} position={position}>
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
        </group>
      ) : (
        // 3D 솔리드 모드: 일반 메시
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
        >
          <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
        </mesh>
      )}
    </group>
  );
};

export default React.memo(ColumnAsset);