import React, { useRef, useState, useEffect } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useUIStore } from '@/store/uiStore';

interface PanelBAssetProps {
  position: [number, number, number];
  id: string;
  width?: number;
  height?: number; // 항상 18mm
  depth?: number;
  color?: string;
  renderMode?: 'solid' | 'wireframe';
  onPositionChange?: (id: string, newPosition: [number, number, number]) => void;
  onRemove?: (id: string) => void;
  spaceInfo?: any;
}

const PanelBAsset: React.FC<PanelBAssetProps> = ({
  position,
  id,
  width = 600, // 600mm 기본 폭
  height = 18, // 18mm 고정
  depth = 730, // 730mm
  color = '#8B4513', // 갈색 (나무 느낌)
  renderMode = 'solid',
  onPositionChange,
  onRemove,
  spaceInfo
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
  const { selectedPanelBId, setSelectedPanelBId, openPanelBEditModal, openPanelBPopup, activePopup, view2DDirection, setFurnitureDragging } = useUIStore();

  // 현재 패널B 데이터 가져오기
  const currentPanelB = spaceConfig.spaceInfo.panelBs?.find(panel => panel.id === id);
  
  const { invalidate } = useThree();
  
  // 패널B 위치나 크기 변경 시 렌더링 업데이트 (드래그 중이 아닐 때만)
  useEffect(() => {
    if (!isDragging) {
      invalidate();
      tempPositionRef.current = position; // 위치 동기화
    }
  }, [position, width, height, depth, isDragging, invalidate]);

  // 패널B가 선택되었는지 확인 (편집 모달이 열렸을 때만)
  const isSelected = activePopup.type === 'panelBEdit' && activePopup.id === id;

  // 패널B 재질 생성 - 드래그 중에는 업데이트하지 않음
  const material = React.useMemo(() => {
    // 선택된 패널B는 연두색으로 표시
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
      displayColor = "#4CAF50"; // 선택된 패널B는 연두색
    } else if (isDragging) {
      displayColor = "#ff6b6b"; // 드래그 중인 패널B는 빨간색
    }
    
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(displayColor),
      linewidth: 1
    });
  }, [isDragging, isSelected]);

  // 클릭 처리 - 패널B 선택만
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    
    // 드래그 중이거나 움직임이 있었으면 클릭 무시
    if (isDragging || hasMoved) {
      return;
    }

    // 클릭 시간이 너무 길면 드래그로 간주
    const clickDuration = Date.now() - pointerDownTime;
    if (clickDuration > 200) {
      return;
    }

    // 클릭 - 패널B 선택 및 패널B 팝업 열기
    setSelectedPanelBId(id);
    openPanelBPopup(id);
  };

  // 더블 클릭 처리 - 편집 모달 열기
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    
    // 드래그 중이거나 움직임이 있었으면 더블클릭 무시
    if (isDragging || hasMoved) {
      return;
    }

    // 더블 클릭 - 패널B 선택 및 편집 모달 열기
    setSelectedPanelBId(id);
    openPanelBEditModal(id);
  };

  // 포인터 다운 처리
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    
    setPointerDownTime(Date.now());
    setHasMoved(false);
    setDragStart(event.point);
    
    // 화면 좌표 저장
    const startScreenX = event.nativeEvent.clientX;
    let moveThreshold = 5; // 5px 이상 움직여야 드래그로 간주
    const updateInterval = 16; // 약 60fps로 제한
    
    // 드래그 시작 시 필요한 값들 미리 계산
    const spaceWidthHalf = (spaceInfo?.width || 3000) * 0.005;
    const panelHalfWidth = width * 0.005;
    const minX = -spaceWidthHalf + panelHalfWidth;
    const maxX = spaceWidthHalf - panelHalfWidth;
    
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
        setFurnitureDragging(true); // 패널B 드래그 시작 시 화면 회전 비활성화
        
        // 패널B 드래그 시작 이벤트 발생 (가구와 동일한 이벤트 사용)
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
      
      // 간단한 X축 이동만 허용 (Y는 바닥에 고정, Z는 뒷벽에 고정)
      const normalizedX = (x / rect.width) * 2 - 1;
      const worldX = normalizedX * spaceWidthHalf;
      
      // X축만 이동, Y는 바닥 위, Z는 뒷벽에 고정
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
        
        // 패널B 드래그 종료 이벤트 발생 (가구와 동일한 이벤트 사용)
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
    if (window.confirm('패널B를 삭제하시겠습니까?')) {
      onRemove?.(id);
    }
  };

  return (
    <group position={position}>
      {viewMode === '2D' ? (
        // 2D 모드: 옅은 갈색 면에 나무 패턴 표시
        <group position={[0, (height * 0.01) / 2, 0]}>
          {/* 투명한 클릭 영역 박스 */}
          <mesh
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
            userData={{ isPanelB: true, panelBId: id }}
          >
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
          {/* 옅은 갈색 배경 면 */}
          <mesh>
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial 
              color={isSelected ? "#c8e6c9" : "#f5deb3"} 
              transparent 
              opacity={0.8}
            />
          </mesh>
          
          {/* 윤곽선 */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, depth * 0.01)]} />
            <lineBasicMaterial color={isSelected ? "#4CAF50" : "#8B4513"} />
          </lineSegments>
          
          {/* 나무 패턴 (가로 선) */}
          {(() => {
            const color = isSelected ? "#4CAF50" : "#8B4513";
            const spacing = 0.05; // 5cm 간격
            const widthM = width * 0.01;
            const heightM = height * 0.01;
            const depthM = depth * 0.01;
            
            const lines = [];
            
            switch (view2DDirection) {
              case 'front':
                // 정면뷰: 가로선 패턴
                for (let i = 0; i < 3; i++) {
                  const xPos = -widthM/2 + (i + 1) * widthM / 4;
                  lines.push(
                    <Line
                      key={`front-line-${i}`}
                      points={[
                        [xPos, -heightM/2, depthM/2 + 0.001],
                        [xPos, heightM/2, depthM/2 + 0.001]
                      ]}
                      color={color}
                      lineWidth={0.5}
                    />
                  );
                }
                break;
                
              case 'top':
                // 상부뷰: 가로선 패턴
                for (let i = 0; i < 3; i++) {
                  const xPos = -widthM/2 + (i + 1) * widthM / 4;
                  lines.push(
                    <Line
                      key={`top-line-${i}`}
                      points={[
                        [xPos, heightM/2 + 0.001, -depthM/2],
                        [xPos, heightM/2 + 0.001, depthM/2]
                      ]}
                      color={color}
                      lineWidth={0.5}
                    />
                  );
                }
                break;
                
              case 'left':
              case 'right':
                // 측면뷰: 가로선 패턴
                for (let i = 0; i < 3; i++) {
                  const zPos = -depthM/2 + (i + 1) * depthM / 4;
                  lines.push(
                    <Line
                      key={`side-line-${i}`}
                      points={[
                        [widthM/2 + 0.001, -heightM/2, zPos],
                        [widthM/2 + 0.001, heightM/2, zPos]
                      ]}
                      color={color}
                      lineWidth={0.5}
                    />
                  );
                }
                break;
            }
            
            return lines;
          })()}
        </group>
      ) : renderMode === 'wireframe' ? (
        // 3D 와이어프레임 모드: 윤곽선만 표시
        <group position={[0, (height * 0.01) / 2, 0]}>
          {/* 투명한 클릭 영역 박스 (와이어프레임 모드에서 마우스 인식용) */}
          <mesh
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
            userData={{ isPanelB: true, panelBId: id }}
          >
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
          {/* 기본 박스 윤곽선 */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, depth * 0.01)]} />
            <primitive object={wireframeMaterial} />
          </lineSegments>
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
          position={[0, (height * 0.01) / 2, 0]} // 패널B를 바닥 위에 올려서 배치
          userData={{ isPanelB: true, panelBId: id }}
          scale={isDragging ? [0.95, 0.95, 0.95] : [1, 1, 1]}
        >
          <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
        </mesh>
      )}
    </group>
  );
};

export default React.memo(PanelBAsset, (prevProps, nextProps) => {
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
    prevProps.spaceInfo?.width === nextProps.spaceInfo?.width &&
    prevProps.spaceInfo?.depth === nextProps.spaceInfo?.depth &&
    prevProps.spaceInfo?.height === nextProps.spaceInfo?.height
  );
});