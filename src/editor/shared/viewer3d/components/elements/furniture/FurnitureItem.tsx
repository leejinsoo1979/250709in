import React from 'react';
import { Box, Edges } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import BoxModule from '../../modules/BoxModule';
import * as THREE from 'three';

interface FurnitureItemProps {
  placedModule: PlacedModule;
  spaceInfo: SpaceInfo;
  furnitureStartY: number;
  isDragMode: boolean;
  isEditMode: boolean;
  isDraggingThis: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>, id: string) => void;
}

const FurnitureItem: React.FC<FurnitureItemProps> = ({
  placedModule,
  spaceInfo,
  furnitureStartY,
  isDragMode,
  isEditMode,
  isDraggingThis,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick
}) => {
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 모듈 데이터 가져오기
  const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
  
  if (!moduleData) {
    return null; // 모듈 데이터가 없으면 렌더링하지 않음
  }
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 가구 치수를 Three.js 단위로 변환
  const width = mmToThreeUnits(moduleData.dimensions.width);
  
  // 가구 높이 계산: 받침대 설정에 따라 조정
  let furnitureHeightMm = internalSpace.height;
  if (spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig.placementType === 'float') {
    // 띄워서 배치일 때: 내경 높이에서 띄움 높이를 뺌
    const floatHeightMm = spaceInfo.baseConfig.floatHeight || 0;
    furnitureHeightMm = internalSpace.height - floatHeightMm;
  }
  
  const height = mmToThreeUnits(furnitureHeightMm);
  
  // 깊이 계산: customDepth가 있으면 사용, 없으면 기본 깊이 사용
  const actualDepthMm = placedModule.customDepth || moduleData.dimensions.depth;
  const depth = mmToThreeUnits(actualDepthMm);

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
  
  // 가구를 가구 공간의 뒷쪽에 배치 (프레임 앞면에서 도어 두께만큼 뒤)
  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;

  // 색상 설정: 특별한 상태일 때만 색상 전달, 평상시에는 undefined로 MaterialPanel 색상 사용
  const isSpecialState = isDraggingThis || isEditMode || isDragMode;
  const furnitureColor = isSpecialState 
    ? (isDraggingThis ? '#66ff66' : isEditMode ? '#ffaa00' : isDragMode ? '#ff6666' : undefined)
    : undefined; // 평상시에는 색상을 전달하지 않음

  return (
    <group
      position={[
        placedModule.position.x,
        furnitureStartY + height / 2, // 내경 바닥 높이 + 가구 높이의 절반
        furnitureZ // 공간 앞면에서 뒤쪽으로 배치
      ]}
      rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
      onDoubleClick={(e) => onDoubleClick(e, placedModule.id)}
      onPointerDown={(e) => onPointerDown(e, placedModule.id)}
      onPointerMove={(e) => onPointerMove(e)}
      onPointerUp={onPointerUp}
      onPointerOver={() => {
        document.body.style.cursor = isDragMode ? 'grab' : (isDraggingThis ? 'grabbing' : 'grab');
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* 노서라운드 모드에서 가구 위치 디버깅 */}
      {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && (() => {
        console.log(`🪑 [가구위치] 이격거리${spaceInfo.gapConfig.size}mm: X=${placedModule.position.x.toFixed(3)}, 폭=${moduleData.dimensions.width}mm`);
        return null;
      })()}

      {/* 가구 타입에 따라 다른 컴포넌트 렌더링 */}
      {moduleData.type === 'box' ? (
        // 박스형 가구 렌더링
        <BoxModule 
          moduleData={moduleData}
          isDragging={isDragMode || isDraggingThis || isEditMode}
          color={furnitureColor}
          internalHeight={furnitureHeightMm}
          hasDoor={placedModule.hasDoor ?? false} // 기본값: 도어 없음
          customDepth={actualDepthMm}
          hingePosition={placedModule.hingePosition || 'right'}
          spaceInfo={spaceInfo}
        />
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
              transparent={isDragMode || isDraggingThis || isEditMode}
              opacity={isDragMode || isDraggingThis || isEditMode ? 0.8 : 1.0}
            />
          </Box>
          <Edges 
            color={isDraggingThis ? '#00ff00' : isEditMode ? '#ff8800' : isDragMode ? '#ff0000' : '#cccccc'} 
            threshold={1} 
            scale={1.001}
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
    </group>
  );
};

export default FurnitureItem; 