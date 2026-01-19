import React from 'react';
import * as THREE from 'three';
import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

interface SidePanelBoringProps {
  // 치수
  height: number; // 가구 전체 높이 (Three.js 단위)
  depth: number; // 가구 깊이 (Three.js 단위)
  basicThickness: number; // 패널 두께 (Three.js 단위)
  innerWidth: number; // 내부 너비 (Three.js 단위)
  innerHeight: number; // 내부 높이 (Three.js 단위)

  // 선반 위치 (mm 단위, 섹션 하단 기준)
  shelfPositions?: number[];

  // 섹션 정보 (멀티섹션 가구용)
  sectionHeights?: number[]; // 섹션별 높이 (Three.js 단위)

  // 유틸 함수
  mmToThreeUnits: (mm: number) => number;
}

/**
 * SidePanelBoring 컴포넌트
 *
 * 2D 측면도에서 좌우 측판의 선반핀 보링 홀을 시각화합니다.
 * - 좌측뷰: 좌측판 보링
 * - 우측뷰: 우측판 보링
 * - 각 선반 위치에 3개의 홀 표시:
 *   - 앞쪽 끝에서 50mm 떨어진 위치
 *   - 뒤쪽 끝에서 50mm 떨어진 위치
 *   - 가운데 (깊이 중앙)
 * - 홀 지름: 3mm
 */
export const SidePanelBoring: React.FC<SidePanelBoringProps> = ({
  height,
  depth,
  basicThickness,
  innerWidth,
  innerHeight,
  shelfPositions = [],
  sectionHeights,
  mmToThreeUnits,
}) => {
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(state => state.view2DDirection);

  // 2D 측면뷰가 아니면 렌더링하지 않음
  if (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right')) {
    return null;
  }

  // 선반이 없으면 렌더링하지 않음
  if (shelfPositions.length === 0) {
    return null;
  }

  // 보링 홀 설정
  const holeDiameter = 3; // mm
  const holeRadius = mmToThreeUnits(holeDiameter / 2);
  const edgeOffset = mmToThreeUnits(50); // 끝에서 50mm 떨어진 위치
  const holeColor = '#333333'; // 어두운 회색

  // X 위치: 좌측뷰는 좌측판, 우측뷰는 우측판
  const xPosition = view2DDirection === 'left'
    ? -innerWidth / 2 - basicThickness / 2 // 좌측판 중앙
    : innerWidth / 2 + basicThickness / 2;  // 우측판 중앙

  // 선반 깊이 (백패널 두께 제외)
  const shelfDepth = depth - basicThickness;

  // 3개의 홀 Z 위치 (깊이 방향)
  // - 앞쪽 끝에서 50mm
  // - 뒤쪽 끝에서 50mm
  // - 가운데
  const frontZ = depth / 2 - edgeOffset; // 앞쪽 끝에서 50mm
  const backZ = -depth / 2 + basicThickness + edgeOffset; // 뒤쪽 끝에서 50mm (백패널 두께 고려)
  const centerZ = (frontZ + backZ) / 2; // 가운데

  // 각 선반 위치에 3개의 보링 홀 렌더링
  return (
    <group>
      {shelfPositions.map((shelfPosMm, shelfIndex) => {
        // shelfPosMm === 0은 바닥판이므로 보링 홀 표시하지 않음
        if (shelfPosMm === 0) {
          return null;
        }

        // 선반 Y 위치 (가구 하단 기준으로 변환)
        const shelfY = -height / 2 + mmToThreeUnits(shelfPosMm);

        // 3개의 홀 Z 위치
        const holeZPositions = [frontZ, centerZ, backZ];

        return (
          <group key={`shelf-boring-${shelfIndex}`}>
            {holeZPositions.map((zPos, holeIndex) => (
              <mesh
                key={`hole-${shelfIndex}-${holeIndex}`}
                position={[xPosition, shelfY, zPos]}
                rotation={[0, Math.PI / 2, 0]} // Y축 90도 회전하여 측면에서 보이게
              >
                {/* 원형 홀 - 채워진 원 */}
                <circleGeometry args={[holeRadius, 16]} />
                <meshBasicMaterial
                  color={holeColor}
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
};

export default SidePanelBoring;
