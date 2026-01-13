import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { useCustomFurnitureStore, CustomFurnitureData } from '@/store/core/customFurnitureStore';

interface CustomFurnitureModuleProps {
  customFurnitureId: string;
  // 슬롯 크기 (mm)
  slotWidth: number;
  slotHeight: number;
  slotDepth: number;
  // 원본 크기 (mm) - 스케일 계산용
  originalWidth?: number;
  originalHeight?: number;
  originalDepth?: number;
  // 스케일 모드
  scaleMode?: 'uniform' | 'non-uniform' | 'fixed';
  // 기타 옵션
  color?: string;
  isDragging?: boolean;
  isEditMode?: boolean;
  showFurniture?: boolean;
  isHighlighted?: boolean;
  // 이벤트 핸들러
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
}

/**
 * 커스텀 가구 3D 렌더링 컴포넌트
 *
 * SketchUp에서 임포트한 커스텀 가구를 렌더링합니다.
 * 슬롯 크기에 맞게 스케일을 조정합니다.
 */
const CustomFurnitureModule: React.FC<CustomFurnitureModuleProps> = ({
  customFurnitureId,
  slotWidth,
  slotHeight,
  slotDepth,
  originalWidth,
  originalHeight,
  originalDepth,
  scaleMode = 'non-uniform',
  color,
  isDragging = false,
  isEditMode = false,
  showFurniture = true,
  isHighlighted = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onDoubleClick,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getCustomFurnitureById } = useCustomFurnitureStore();

  // 커스텀 가구 데이터 가져오기
  const customFurniture = useMemo(() => {
    // customFurnitureId에서 'custom-' 접두사 제거
    const actualId = customFurnitureId.replace(/^custom-/, '');
    return getCustomFurnitureById(actualId);
  }, [customFurnitureId, getCustomFurnitureById]);

  // mm → Three.js 단위 변환
  const mmToThree = (mm: number) => mm * 0.01;

  // 스케일 계산
  const scale = useMemo(() => {
    if (!customFurniture) return { x: 1, y: 1, z: 1 };

    const origW = originalWidth || customFurniture.originalDimensions.width;
    const origH = originalHeight || customFurniture.originalDimensions.height;
    const origD = originalDepth || customFurniture.originalDimensions.depth;

    // 슬롯 크기로 스케일 계산
    const scaleX = slotWidth / origW;
    const scaleY = slotHeight / origH;
    const scaleZ = slotDepth / origD;

    switch (scaleMode) {
      case 'uniform':
        // 가장 작은 비율로 균등 스케일
        const minScale = Math.min(scaleX, scaleY, scaleZ);
        return { x: minScale, y: minScale, z: minScale };

      case 'non-uniform':
        // 각 축 독립적으로 스케일
        return { x: scaleX, y: scaleY, z: scaleZ };

      case 'fixed':
      default:
        // 원본 크기 유지
        return { x: 1, y: 1, z: 1 };
    }
  }, [customFurniture, slotWidth, slotHeight, slotDepth, originalWidth, originalHeight, originalDepth, scaleMode]);

  // Z-up → Y-up 변환 적용
  const applyCoordinateConversion = (obj: THREE.Object3D): THREE.Object3D => {
    const wrapper = new THREE.Group();
    wrapper.add(obj);
    // Z-up → Y-up: X축 기준 -90도 회전
    wrapper.rotation.x = -Math.PI / 2;
    wrapper.updateMatrixWorld(true);
    return wrapper;
  };

  // 모델 로드 (실제로는 저장된 데이터에서 복원)
  useEffect(() => {
    if (!customFurniture) {
      setError('커스텀 가구를 찾을 수 없습니다.');
      setIsLoading(false);
      return;
    }

    console.log('📦 CustomFurnitureModule - 모델 로드 시작:', customFurniture.name);

    // 간단한 박스로 대체 렌더링 (실제 모델 로드는 추후 구현)
    // TODO: Firebase에서 모델 파일 로드 또는 IndexedDB에서 복원
    const geometry = new THREE.BoxGeometry(
      mmToThree(customFurniture.originalDimensions.width),
      mmToThree(customFurniture.originalDimensions.height),
      mmToThree(customFurniture.originalDimensions.depth)
    );

    const material = new THREE.MeshStandardMaterial({
      color: color || '#8B7355',
      roughness: 0.7,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'CustomFurnitureBody';

    // 원점을 좌측 하단 앞으로 이동
    mesh.position.set(
      mmToThree(customFurniture.originalDimensions.width) / 2,
      mmToThree(customFurniture.originalDimensions.height) / 2,
      mmToThree(customFurniture.originalDimensions.depth) / 2
    );

    const group = new THREE.Group();
    group.name = customFurniture.name;
    group.add(mesh);

    // 패널이 있으면 패널별로 렌더링
    if (customFurniture.panels && customFurniture.panels.length > 0) {
      // 기존 메쉬 제거
      group.remove(mesh);
      geometry.dispose();
      material.dispose();

      // 패널별 렌더링
      customFurniture.panels.forEach((panel, index) => {
        const panelGeometry = new THREE.BoxGeometry(
          mmToThree(panel.originalSize.width),
          mmToThree(panel.originalSize.height),
          mmToThree(panel.originalSize.depth)
        );

        const panelMaterial = new THREE.MeshStandardMaterial({
          color: getPanelColor(panel.name),
          roughness: 0.7,
          metalness: 0.1,
        });

        const panelMesh = new THREE.Mesh(panelGeometry, panelMaterial);
        panelMesh.name = panel.name;
        panelMesh.position.set(
          mmToThree(panel.originalPosition.x),
          mmToThree(panel.originalPosition.y),
          mmToThree(panel.originalPosition.z)
        );

        group.add(panelMesh);
      });
    }

    setModel(group);
    setIsLoading(false);
    console.log('✅ CustomFurnitureModule - 모델 로드 완료:', customFurniture.name);

  }, [customFurniture, color]);

  // 패널 색상 결정 (디버깅용)
  const getPanelColor = (panelName: string): string => {
    if (panelName.includes('Left') || panelName.includes('좌측')) return '#A0522D';
    if (panelName.includes('Right') || panelName.includes('우측')) return '#A0522D';
    if (panelName.includes('Top') || panelName.includes('상판')) return '#CD853F';
    if (panelName.includes('Bottom') || panelName.includes('바닥')) return '#CD853F';
    if (panelName.includes('Back') || panelName.includes('백')) return '#DEB887';
    if (panelName.includes('Shelf') || panelName.includes('선반')) return '#D2B48C';
    if (panelName.includes('Drawer') || panelName.includes('서랍')) return '#F5DEB3';
    return '#8B7355';
  };

  // 강조 효과
  useEffect(() => {
    if (!groupRef.current) return;

    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material && material.emissive) {
          if (isHighlighted) {
            material.emissive.setHex(0x444444);
          } else {
            material.emissive.setHex(0x000000);
          }
        }
      }
    });
  }, [isHighlighted]);

  if (!showFurniture) {
    return null;
  }

  if (isLoading) {
    // 로딩 중일 때 간단한 와이어프레임 박스 표시
    return (
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[mmToThree(slotWidth), mmToThree(slotHeight), mmToThree(slotDepth)]} />
          <meshBasicMaterial color="#888888" wireframe />
        </mesh>
      </group>
    );
  }

  if (error || !model) {
    // 에러 시 빨간색 박스 표시
    return (
      <group ref={groupRef}>
        <mesh
          position={[
            mmToThree(slotWidth) / 2,
            mmToThree(slotHeight) / 2,
            mmToThree(slotDepth) / 2,
          ]}
        >
          <boxGeometry args={[mmToThree(slotWidth), mmToThree(slotHeight), mmToThree(slotDepth)]} />
          <meshStandardMaterial color="#ff4444" opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  return (
    <group
      ref={groupRef}
      scale={[scale.x, scale.y, scale.z]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onDoubleClick={onDoubleClick}
    >
      <primitive object={model} />
    </group>
  );
};

export default CustomFurnitureModule;
