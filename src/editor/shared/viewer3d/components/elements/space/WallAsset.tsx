import React, { useRef, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useUIStore } from '@/store/uiStore';


interface WallAssetProps {
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
}

const WallAsset: React.FC<WallAssetProps> = ({
  position,
  id,
  width = 120, // 120mm
  height = 2400, // 2400mm (공간 높이와 동일)
  depth = 730, // 730mm
  color = '#E0E0E0', // 기본 회색
  renderMode = 'solid',
  onPositionChange,
  onRemove,
  spaceInfo
}) => {
// console.log('🎯 WallAsset 렌더링:', { id, height, position });
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
  const [pointerDownTime, setPointerDownTime] = useState<number>(0);
  const [hasMoved, setHasMoved] = useState(false);

  const { viewMode } = useSpace3DView();
  const spaceConfig = useSpaceConfigStore();
  const { selectedWallId, setSelectedWallId, openWallEditModal, openWallPopup, activePopup } = useUIStore();

  // 현재 가벽 데이터 가져오기
  const currentWall = spaceConfig.spaceInfo.walls?.find(wall => wall.id === id);

  // 가벽이 선택되었는지 확인 (편집 모달이 열렸을 때만)
  const isSelected = activePopup.type === 'wallEdit' && activePopup.id === id;

  // 가벽 재질 생성
  const material = React.useMemo(() => {
    // 선택된 가벽은 연두색으로 표시
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
      displayColor = "#4CAF50"; // 선택된 가벽은 연두색
    } else if (isDragging) {
      displayColor = "#ff6b6b"; // 드래그 중인 가벽은 빨간색
    }
    
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(displayColor),
      linewidth: 1
    });
  }, [isDragging, isSelected]);

  // 클릭 처리 - 가벽 선택만
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    
// console.log('🎯 가벽 클릭 이벤트 발생:', id);
    
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

    // 클릭 - 가벽 선택 및 가벽 팝업 열기
// console.log('🎯 가벽 클릭 - 가벽 선택 및 팝업 열기:', id);
// console.log('🎯 현재 selectedWallId:', selectedWallId);
    
    // 가벽 선택 및 가벽 팝업 열기
    setSelectedWallId(id);
    openWallPopup(id);
    
// console.log('✅ setSelectedWallId 및 openWallPopup 호출됨:', id);
// console.log('✅ 변경 후 selectedWallId:', id);
  };

  // 더블 클릭 처리 - 편집 모달 열기
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    
// console.log('🎯 가벽 더블클릭 이벤트 발생:', id);
    
    // 드래그 중이거나 움직임이 있었으면 더블클릭 무시
    if (isDragging || hasMoved) {
// console.log('🎯 드래그 중이거나 움직임이 있었으므로 더블클릭 무시');
      return;
    }

    // 더블 클릭 - 가벽 선택 및 편집 모달 열기
// console.log('🎯 가벽 더블 클릭 - 가벽 선택 및 편집 모달 열기:', id);
// console.log('🎯 현재 selectedWallId:', selectedWallId);
    
    // 가벽 선택 및 편집 모달 열기
    setSelectedWallId(id);
    openWallEditModal(id);
    
// console.log('✅ setSelectedWallId 및 openWallEditModal 호출됨:', id);
// console.log('✅ 변경 후 selectedWallId:', id);
  };

  // 포인터 다운 처리
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    
// console.log('🎯 가벽 포인터 다운:', id);
    
    setPointerDownTime(Date.now());
    setHasMoved(false);
    setDragStart(event.point);
    
    // 화면 좌표 저장
    const startScreenX = event.nativeEvent.clientX;
    const moveThreshold = 5; // 5px 이상 움직여야 드래그로 간주
    
    // 전역 이벤트 리스너 등록
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // 움직임 감지
      const currentScreenX = e.clientX;
      const moveDistance = Math.abs(currentScreenX - startScreenX);
      
      if (moveDistance > moveThreshold && !hasMoved) {
// console.log('🎯 가벽 드래그 시작 감지:', moveDistance);
        setHasMoved(true);
        setIsDragging(true);
        
        // 가벽 드래그 시작 시 카메라 컨트롤 비활성화
        window.dispatchEvent(new CustomEvent('furniture-drag-start'));
      }
      
      // 마우스 움직임을 3D 공간 좌표로 변환
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // 간단한 X축 이동만 허용 (Y, Z는 고정)
      const normalizedX = (x / rect.width) * 2 - 1;
      const spaceWidth = (spaceInfo?.width || 3000) * 0.01; // mm를 적절한 단위로 변환
      const worldX = normalizedX * (spaceWidth / 2);
      
      // X축만 이동, Y는 현재 위치 유지, Z는 뒷벽에 고정
      const spaceDepthM = (spaceInfo?.depth || 1500) * 0.01;
      const wallDepthM = depth * 0.01; // mm를 Three.js 단위로 변환 
      const zPosition = -(spaceDepthM / 2) + (wallDepthM / 2); // 뒷벽에 맞닿도록
      
      const boundedPosition: [number, number, number] = [
        Math.max(-spaceWidth/2 + width*0.01/2, Math.min(spaceWidth/2 - width*0.01/2, worldX)),
        position[1], // Y 좌표는 고정 (바닥 기준 높이의 절반)
        zPosition // Z는 뒷벽에 고정
      ];
      
// console.log('🎯 가벽 드래그 위치 업데이트:', {
        // id,
        // oldPosition: position,
        // newPosition: boundedPosition,
        // spaceWidth,
        // worldX,
        // moveDistance
      // });
      
      if (onPositionChange && !isNaN(boundedPosition[0]) && !isNaN(boundedPosition[1]) && !isNaN(boundedPosition[2])) {
        onPositionChange(id, boundedPosition);
      }
    };
    
    const handleGlobalPointerUp = () => {
// console.log('🎯 가벽 포인터 업:', id, 'hasMoved:', hasMoved);
      
      // 드래그 중이었다면 카메라 컨트롤 재활성화
      if (hasMoved) {
        window.dispatchEvent(new CustomEvent('furniture-drag-end'));
      }
      
      setIsDragging(false);
      setDragStart(null);
      setHasMoved(false);
      
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
// console.log('🎯 가벽 우클릭 - 삭제 확인');
    if (window.confirm('가벽을 삭제하시겠습니까?')) {
      onRemove?.(id);
    }
  };

  return (
    <group position={position}>
      {renderMode === 'wireframe' ? (
        // 와이어프레임 모드: 윤곽선과 대각선 표시
        <group position={[0, (height * 0.01) / 2, 0]}>
          {/* 투명한 클릭 영역 박스 (와이어프레임 모드에서 마우스 인식용) */}
          <mesh
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
            userData={{ isWall: true, wallId: id }}
          >
            <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          
          {/* 기본 박스 윤곽선 */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width * 0.01, height * 0.01, depth * 0.01)]} />
            <primitive object={wireframeMaterial} />
          </lineSegments>
          
          {/* 2D 모드일 때 정면에서 보이는 X자 대각선 추가 */}
          {viewMode === '2D' && (
            <>
              {/* 대각선 1: 좌하단에서 우상단으로 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    count={2}
                    array={new Float32Array([
                      -(width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2,  // 좌하단 앞면
                      (width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2     // 우상단 앞면
                    ])}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#333333"} />
              </line>
              
              {/* 대각선 2: 우하단에서 좌상단으로 */}
              <line>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    count={2}
                    array={new Float32Array([
                      (width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2,   // 우하단 앞면
                      -(width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2    // 좌상단 앞면
                    ])}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={isSelected ? "#4CAF50" : isDragging ? "#ff6b6b" : "#333333"} />
              </line>
            </>
          )}
        </group>
      ) : (
        // 솔리드 모드: 일반 메시
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
          position={[0, (height * 0.01) / 2, 0]} // 가벽 mesh를 위로 올려서 바닥에 맞춤
          userData={{ isWall: true, wallId: id }}
        >
          <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
        </mesh>
      )}
    </group>
  );
};

export default WallAsset;