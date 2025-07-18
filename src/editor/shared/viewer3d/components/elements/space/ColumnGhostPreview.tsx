import React, { useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';

interface ColumnGhostPreviewProps {
  spaceInfo: any;
}

const ColumnGhostPreview: React.FC<ColumnGhostPreviewProps> = ({ spaceInfo }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState<any>(null);
  const [currentSlotIndex, setCurrentSlotIndex] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [ghostPosition, setGhostPosition] = useState<[number, number, number]>([0, 0, 0]);
  const { viewMode } = useSpace3DView();
  const { indexing } = useDerivedSpaceStore();

  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      const data = e.dataTransfer?.getData('application/json');
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData.type === 'column') {
            setIsDragging(true);
            setDragData(parsedData);
            console.log('🏗️ 기둥 드래그 시작:', parsedData);
          }
        } catch (error) {
          console.error('드래그 데이터 파싱 오류:', error);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isDragging || !dragData) return;
      
      e.preventDefault();
      setMousePosition({ x: e.clientX, y: e.clientY });

      // 캔버스 찾기
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const isOverCanvas = 
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isOverCanvas) {
        // 슬롯 기능 비활성화 - 단순 중앙 배치 사용
        const camera = window.threeCamera;
        const scene = window.threeScene;
        
        // 마우스 위치에 따른 단순 배치
        const rect = canvas.getBoundingClientRect();
        const centerX = (e.clientX - rect.left - rect.width / 2) / 100;
        setGhostPosition([centerX, ghostPosition[1], ghostPosition[2]]);
        setCurrentSlotIndex(null);
      } else {
        setCurrentSlotIndex(null);
      }
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      setDragData(null);
      setCurrentSlotIndex(null);
      console.log('🏗️ 기둥 드래그 종료');
    };

    const handleDrop = (e: DragEvent) => {
      handleDragEnd();
    };

    // 전역 드래그 이벤트 리스너 등록
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragend', handleDragEnd);
      document.removeEventListener('drop', handleDrop);
    };
  }, [isDragging, dragData, spaceInfo]);

  // 드래그 중이 아니거나 유효한 슬롯이 없으면 렌더링하지 않음
  if (!isDragging || !dragData || currentSlotIndex === null || !indexing?.threeUnitPositions) {
    return null;
  }

  // 슬롯 위치 가져오기
  const slotPositionX = indexing.threeUnitPositions[currentSlotIndex];
  const spaceDepthM = (spaceInfo.depth || 1500) * 0.001;

  // 기둥 크기 (mm를 m로 변환)
  const columnWidth = (dragData.width || 6000) * 0.001;
  const columnHeight = (dragData.height || 24000) * 0.001;
  const columnDepth = (dragData.depth || 6000) * 0.001;

  // 기둥 위치 계산 (바닥 기준, 뒷벽 근처) - 유효한 슬롯이 있을 때만
  const calculatedGhostPosition: [number, number, number] = [
    slotPositionX,
    0, // 바닥 기준 Y=0
    -(spaceDepthM / 2) + 0.5
  ];

  // 재질별 색상 결정
  const getColumnColor = () => {
    switch (dragData.material) {
      case 'concrete':
        return '#888888';
      case 'steel':
        return '#B0B0B0';
      case 'wood':
        return '#D2691E';
      default:
        return dragData.color || '#888888';
    }
  };

  return (
    <group>
      {/* 고스트 기둥 */}
      <mesh position={calculatedGhostPosition}>
        <boxGeometry args={[columnWidth, columnHeight, columnDepth]} />
        <meshBasicMaterial 
          color={getColumnColor()}
          transparent 
          opacity={0.4}
          wireframe={false}
        />
      </mesh>

      {/* 고스트 기둥 윤곽선 */}
      <lineSegments position={calculatedGhostPosition}>
        <edgesGeometry args={[new THREE.BoxGeometry(columnWidth, columnHeight, columnDepth)]} />
        <lineBasicMaterial color="#4CAF50" linewidth={3} />
      </lineSegments>

      {/* 슬롯 하이라이트 */}
      <mesh 
        position={[slotPositionX, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[columnWidth + 0.2, spaceDepthM]} />
        <meshBasicMaterial 
          color="#4CAF50"
          transparent 
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 슬롯 경계선 */}
      <lineSegments position={[slotPositionX, 0.02, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(columnWidth + 0.2, spaceDepthM)]} />
        <lineBasicMaterial color="#4CAF50" linewidth={2} />
      </lineSegments>

      {/* 배치 가이드 텍스트 */}
      {viewMode === '3D' && (
        <group position={[slotPositionX, columnHeight + 1, -(spaceDepthM / 2) + 0.5]}>
          <mesh>
            <planeGeometry args={[2, 0.6]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[1.8, 0.4]} />
            <meshBasicMaterial color="#4CAF50" />
          </mesh>
          {/* 텍스트는 Text 컴포넌트로 추가 가능 */}
        </group>
      )}
    </group>
  );
};

export default ColumnGhostPreview;