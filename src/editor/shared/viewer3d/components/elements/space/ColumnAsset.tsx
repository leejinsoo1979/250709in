import React, { useRef, useState } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { useUIStore } from '@/store/uiStore';
import ColumnEditModal from './ColumnEditModal';

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
  spaceInfo
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);
  const { viewMode } = useSpace3DView();
  const spaceConfig = useSpaceConfigStore();
  const { setSelectedColumnId } = useUIStore();

  // 현재 기둥 데이터 가져오기
  const currentColumn = spaceConfig.spaceInfo.columns?.find(col => col.id === id);

  // 기둥 재질 생성
  const material = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.1,
      roughness: 0.7,
      transparent: true,
      opacity: isDragging ? 0.7 : 1.0,
    });
  }, [color, isDragging]);

  // 와이어프레임용 윤곽선 재질
  const wireframeMaterial = React.useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: new THREE.Color(isDragging ? "#ff6b6b" : "#333333"),
      linewidth: 1
    });
  }, [isDragging]);

  // 클릭 처리 (싱글/더블 클릭 구분)
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (isDragging) return;

    const newClickCount = clickCount + 1;
    setClickCount(newClickCount);

    if (clickTimer) {
      clearTimeout(clickTimer);
    }

    const timer = setTimeout(() => {
      if (newClickCount === 1) {
        // 싱글 클릭 - 모달 열기
        console.log('🎯 기둥 싱글 클릭 - 모달 열기');
        setIsModalOpen(true);
      } else if (newClickCount === 2) {
        // 더블 클릭 - 기둥 삭제
        console.log('🎯 기둥 더블 클릭 - 삭제 확인');
        if (window.confirm('기둥을 삭제하시겠습니까?')) {
          onRemove?.(id);
        }
      }
      setClickCount(0);
    }, 300); // 300ms 내에 더블 클릭 감지

    setClickTimer(timer);
  };

  // 드래그 시작
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setIsDragging(true);
    setDragStart(event.point);
    
    let localDragStart: THREE.Vector3 | null = event.point;
    
    // 전역 이벤트 리스너 등록
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!localDragStart) return;
      
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
      const columnDepthM = depth * 0.01; // mm를 Three.js 단위로 변환 
      const zPosition = -(spaceDepthM / 2) + (columnDepthM / 2); // 뒷벽에 맞닿도록
      
      const boundedPosition: [number, number, number] = [
        Math.max(-spaceWidth/2 + width*0.01/2, Math.min(spaceWidth/2 - width*0.01/2, worldX)),
        position[1], // Y 좌표는 고정 (바닥 기준 높이의 절반)
        zPosition // Z는 뒷벽에 고정
      ];
      
      console.log('🎯 기둥 드래그 위치 업데이트:', {
        id,
        oldPosition: position,
        newPosition: boundedPosition,
        spaceWidth,
        worldX
      });
      
      if (onPositionChange && !isNaN(boundedPosition[0]) && !isNaN(boundedPosition[1]) && !isNaN(boundedPosition[2])) {
        onPositionChange(id, boundedPosition);
      }
    };
    
    const handleGlobalPointerUp = () => {
      setIsDragging(false);
      setDragStart(null);
      localDragStart = null;
      
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
    console.log('🎯 기둥 우클릭 - 삭제 확인');
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
    <group position={position}>
      {renderMode === 'wireframe' ? (
        // 와이어프레임 모드: 윤곽선과 대각선 표시
        <group position={[0, (height * 0.01) / 2, 0]}>
          {/* 투명한 클릭 영역 박스 (와이어프레임 모드에서 마우스 인식용) */}
          <mesh
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
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
              <Line
                points={[
                  [-(width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2],  // 좌하단 앞면
                  [(width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2]     // 우상단 앞면
                ]}
                color={isDragging ? "#ff6b6b" : "#333333"}
                lineWidth={1}
              />
              
              {/* 대각선 2: 우하단에서 좌상단으로 */}
              <Line
                points={[
                  [(width * 0.01) / 2, -(height * 0.01) / 2, (depth * 0.01) / 2],   // 우하단 앞면
                  [-(width * 0.01) / 2, (height * 0.01) / 2, (depth * 0.01) / 2]    // 좌상단 앞면
                ]}
                color={isDragging ? "#ff6b6b" : "#333333"}
                lineWidth={1}
              />
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
          onPointerDown={handlePointerDown}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          onContextMenu={handleContextMenu}
          position={[0, (height * 0.01) / 2, 0]} // 기둥 mesh를 위로 올려서 바닥에 맞춤
        >
          <boxGeometry args={[width * 0.01, height * 0.01, depth * 0.01]} />
        </mesh>
      )}
      

      

      {/* 기둥 편집 모달 */}
      <ColumnEditModal
        column={currentColumn || null}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        spaceInfo={spaceInfo}
      />
    </group>
  );
};

export default ColumnAsset;