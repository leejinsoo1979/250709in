import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { Text, Line } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';

// 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = ({ args, position, material, renderMode }) => {
  const { theme } = useTheme();
  // 진짜 물리적 그림자를 위한 원래 재질 사용 (서랍과 동일)
  const createInnerMaterial = (originalMaterial: THREE.Material) => {
    const { viewMode } = useSpace3DView();
    
    if (originalMaterial instanceof THREE.MeshStandardMaterial) {
      // console.log('📚 ShelfRenderer - 원본 텍스처:', originalMaterial.map);
      // 복제하지 말고 원본 재질을 그대로 사용 (텍스처 유지)
      return originalMaterial;
    }
    return material;
  };

  const innerMaterial = createInnerMaterial(material);
  const { viewMode } = useSpace3DView();

  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'}>
          <boxGeometry args={args} />
          {viewMode === '2D' ? (
            <meshStandardMaterial 
              map={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.map : null}
              color={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.color : new THREE.Color('#FFFFFF')}
              transparent={true}
              opacity={0.5}
              metalness={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.metalness : 0.0}
              roughness={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.roughness : 0.6}
              toneMapped={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.toneMapped : true}
              envMapIntensity={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.envMapIntensity : 1.0}
              emissive={innerMaterial instanceof THREE.MeshStandardMaterial ? innerMaterial.emissive : new THREE.Color(0x000000)}
            />
          ) : (
            <primitive object={innerMaterial} attach="material" />
          )}
        </mesh>
      )}
      {/* 윤곽선 렌더링 - 3D에서 더 강력한 렌더링 */}
      {viewMode === '3D' ? (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color="#505050"
            transparent={true}
            opacity={0.9}
            depthTest={true}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        </lineSegments>
      ) : (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? (theme?.mode === 'dark' ? "#ffffff" : "#333333") : (theme?.mode === 'dark' ? "#cccccc" : "#888888")} 
            linewidth={0.5}
            transparent={false}
            opacity={1.0}
            depthTest={false}
          />
        </lineSegments>
      )}
    </group>
  );
};

interface ShelfRendererProps {
  shelfCount: number;
  innerWidth: number;
  innerHeight: number;
  depth: number;
  basicThickness: number;
  material: THREE.Material;
  yOffset?: number; // 전체 선반 그룹의 Y축 오프셋
  zOffset?: number; // 선반의 Z축 위치 조정 (백패널 전진 대응)
  // 절대 위치 지정 (DrawerRenderer 스타일)
  shelfPositions?: number[]; // 각 선반의 Y 위치 (mm, 섹션 하단 기준)
  isTopFinishPanel?: boolean; // 최상단 마감 패널 여부
  renderMode: 'solid' | 'wireframe'; // 렌더 모드 추가
}

/**
 * ShelfRenderer 컴포넌트 (범용적으로 개선)
 * 
 * 임의의 선반 개수에 대응하여 선반을 렌더링합니다.
 * yOffset을 통해 특정 구역(section) 내에서 위치 조정 가능합니다.
 */
export const ShelfRenderer: React.FC<ShelfRendererProps> = ({
  shelfCount,
  innerWidth,
  innerHeight,
  depth,
  basicThickness,
  material,
  yOffset = 0,
  zOffset = 0,
  shelfPositions,
  isTopFinishPanel,
  renderMode,
}) => {
  const showDimensions = useUIStore(state => state.showDimensions);
  const { theme } = useTheme();
  const { viewMode } = useSpace3DView();
  
  if (shelfCount <= 0) {
    return null;
  }

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 절대 위치 모드: 마감 패널 또는 절대 위치 지정
  if (isTopFinishPanel && shelfCount === 1) {
    // 최상단 마감 패널 모드
    const topPosition = innerHeight / 2 - basicThickness / 2;
    
    return (
      <group position={[0, yOffset, 0]}>
        <BoxWithEdges
          args={[innerWidth, basicThickness, depth - basicThickness]}
          position={[0, topPosition, basicThickness/2 + zOffset]}
          material={material}
          renderMode={renderMode}
        />
      </group>
    );
  }
  
  if (shelfPositions && shelfPositions.length === shelfCount) {
    // 절대 위치 모드: 지정된 위치에 선반 배치
    return (
      <group position={[0, yOffset, 0]}>
        {shelfPositions.map((positionMm, i) => {
          // 섹션 하단 기준 위치를 Three.js 좌표로 변환
          const relativeYPosition = (-innerHeight / 2) + mmToThreeUnits(positionMm);
          return (
            <BoxWithEdges
              key={`shelf-${i}`}
              args={[innerWidth, basicThickness, depth - basicThickness]}
              position={[0, relativeYPosition, basicThickness/2 + zOffset]}
              material={material}
              renderMode={renderMode}
            />
          );
        })}
        
        {/* 치수 표시 - showDimensions가 true이고 2D 정면뷰일 때만 표시 */}
        {showDimensions && viewMode === '2D' && (
          <group>
            {(() => {
              const compartmentHeights: { height: number; centerY: number }[] = [];
              
              // 첫 번째 칸 (맨 아래)
              if (shelfPositions.length > 0) {
                const firstShelfY = (-innerHeight / 2) + mmToThreeUnits(shelfPositions[0]);
                const height = shelfPositions[0];
                compartmentHeights.push({
                  height,
                  centerY: (-innerHeight / 2) + mmToThreeUnits(height / 2)
                });
              }
              
              // 중간 칸들
              for (let i = 0; i < shelfPositions.length - 1; i++) {
                const currentShelfY = shelfPositions[i];
                const nextShelfY = shelfPositions[i + 1];
                const height = nextShelfY - currentShelfY;
                const centerY = (-innerHeight / 2) + mmToThreeUnits(currentShelfY + height / 2);
                compartmentHeights.push({ height, centerY });
              }
              
              // 마지막 칸 (맨 위)
              if (shelfPositions.length > 0) {
                const lastShelfPos = shelfPositions[shelfPositions.length - 1];
                const height = innerHeight / 0.01 - lastShelfPos; // mm 단위로 변환
                const centerY = (-innerHeight / 2) + mmToThreeUnits(lastShelfPos + height / 2);
                compartmentHeights.push({ height, centerY });
              }
              
              return compartmentHeights.map((compartment, i) => (
                <group key={`dimension-${i}`}>
                  {/* 치수 텍스트 - CleanCAD2D 스타일로 칸 중앙에 표시 */}
                  <Text
                    position={[0, compartment.centerY, basicThickness + zOffset + 0.2]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                  >
                    {Math.round(compartment.height)}
                  </Text>
                </group>
              ));
            })()}
          </group>
        )}
      </group>
    );
  }
  
  // 치수 표시용 색상 설정 - CleanCAD2D와 동일한 스타일 (맨 위로 이동)
  const dimensionColor = '#4CAF50'; // 메인 테마 색상
  const textColor = dimensionColor;
  const baseFontSize = 0.12; // CleanCAD2D의 기본 폰트 크기

  // 기존 균등 분할 모드 (하위 호환성)
  const shelfSpacing = innerHeight / (shelfCount + 1);
  
  return (
    <group position={[0, yOffset, 0]}>
      {Array.from({ length: shelfCount }, (_, i) => {
        // 섹션 내에서의 상대적 Y 위치 계산
        const relativeYPosition = (-innerHeight / 2) + shelfSpacing * (i + 1);
        return (
          <BoxWithEdges
            key={`shelf-${i}`}
            args={[innerWidth, basicThickness, depth - basicThickness]}
            position={[0, relativeYPosition, basicThickness/2 + zOffset]}
            material={material}
            renderMode={renderMode}
          />
        );
      })}
      
      {/* 치수 표시 - showDimensions가 true이고 2D 정면뷰일 때만 표시 */}
      {showDimensions && viewMode === '2D' && (
        <group>
          {Array.from({ length: shelfCount + 1 }, (_, i) => {
            // 각 칸의 높이 계산
            let compartmentHeight: number;
            let compartmentBottomY: number;
            let compartmentCenterY: number;
            
            if (i === 0) {
              // 첫 번째 칸 (하단)
              compartmentBottomY = -innerHeight / 2;
              const firstShelfY = (-innerHeight / 2) + shelfSpacing;
              compartmentHeight = firstShelfY - compartmentBottomY;
              compartmentCenterY = compartmentBottomY + compartmentHeight / 2;
            } else if (i === shelfCount) {
              // 마지막 칸 (상단)
              const lastShelfY = (-innerHeight / 2) + shelfSpacing * shelfCount;
              compartmentBottomY = lastShelfY;
              compartmentHeight = (innerHeight / 2) - lastShelfY;
              compartmentCenterY = compartmentBottomY + compartmentHeight / 2;
            } else {
              // 중간 칸들
              const currentShelfY = (-innerHeight / 2) + shelfSpacing * i;
              const nextShelfY = (-innerHeight / 2) + shelfSpacing * (i + 1);
              compartmentBottomY = currentShelfY;
              compartmentHeight = nextShelfY - currentShelfY;
              compartmentCenterY = compartmentBottomY + compartmentHeight / 2;
            }
            
            const compartmentHeightMm = Math.round(compartmentHeight / 0.01);
            
            return (
              <group key={`dimension-${i}`}>
                {/* 치수 텍스트 - CleanCAD2D 스타일로 칸 중앙에 표시 */}
                <Text
                  position={[0, compartmentCenterY, basicThickness + zOffset + 0.2]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                >
                  {compartmentHeightMm}
                </Text>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
};

export default ShelfRenderer; 