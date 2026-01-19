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

  // 보링 위치 (mm 단위, 가구 바닥 기준 절대 위치)
  // 선반 위치 + 섹션 상판/바닥판 위치 포함
  boringPositions?: number[];

  // 유틸 함수
  mmToThreeUnits: (mm: number) => number;
}

/**
 * SidePanelBoring 컴포넌트
 *
 * 2D 측면도에서 좌우 측판의 선반핀 보링 홀을 시각화합니다.
 * - 좌측뷰: 좌측판 내측면에 보링 표시
 * - 우측뷰: 우측판 내측면에 보링 표시
 * - 각 보링 위치에 3개의 홀 표시:
 *   - 앞쪽 끝에서 50mm 떨어진 위치
 *   - 뒤쪽 끝에서 50mm 떨어진 위치
 *   - 가운데 (깊이 중앙)
 * - 홀 지름: 3mm (빈 원 - outline만 표시)
 * - 보링 위치: 선반 위치 + 섹션 상판/바닥판 위치
 */
export const SidePanelBoring: React.FC<SidePanelBoringProps> = ({
  height,
  depth,
  basicThickness,
  innerWidth,
  boringPositions = [],
  mmToThreeUnits,
}) => {
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(state => state.view2DDirection);

  // 2D 측면뷰가 아니면 렌더링하지 않음
  if (viewMode !== '2D' || (view2DDirection !== 'left' && view2DDirection !== 'right')) {
    return null;
  }

  // 보링 위치가 없으면 렌더링하지 않음
  if (boringPositions.length === 0) {
    return null;
  }

  // 보링 홀 설정
  const holeDiameter = 3; // mm
  const holeOuterRadius = mmToThreeUnits(holeDiameter / 2);
  const holeInnerRadius = holeOuterRadius * 0.6; // 안쪽 반지름 (빈 원 효과)
  const edgeOffset = mmToThreeUnits(50); // 끝에서 50mm 떨어진 위치
  const holeColor = '#666666'; // 회색

  // X 위치: 측판의 안쪽 면 (내부 공간에 가까운 쪽)
  // 좌측뷰에서는 좌측판 안쪽 면, 우측뷰에서는 우측판 안쪽 면
  const xPosition = view2DDirection === 'left'
    ? -innerWidth / 2 + mmToThreeUnits(0.5) // 좌측판 안쪽 면 (살짝 안쪽으로)
    : innerWidth / 2 - mmToThreeUnits(0.5);  // 우측판 안쪽 면 (살짝 안쪽으로)

  // 3개의 홀 Z 위치 (깊이 방향)
  // 측면뷰에서는 Z축이 가로 방향으로 보임
  // - 앞쪽 끝에서 50mm
  // - 뒤쪽 끝에서 50mm
  // - 가운데
  const frontZ = depth / 2 - edgeOffset; // 앞쪽 끝에서 50mm
  const backZ = -depth / 2 + basicThickness + edgeOffset; // 뒤쪽 끝에서 50mm (백패널 두께 고려)
  const centerZ = (frontZ + backZ) / 2; // 가운데

  // 각 보링 위치에 3개의 보링 홀 렌더링
  return (
    <group>
      {boringPositions.map((boringPosMm, boringIndex) => {
        // 보링 Y 위치 (가구 하단 기준으로 변환)
        const boringY = -height / 2 + mmToThreeUnits(boringPosMm);

        // 3개의 홀 Z 위치
        const holeZPositions = [frontZ, centerZ, backZ];

        return (
          <group key={`boring-${boringIndex}`}>
            {holeZPositions.map((zPos, holeIndex) => (
              <mesh
                key={`hole-${boringIndex}-${holeIndex}`}
                position={[xPosition, boringY, zPos]}
                rotation={[0, Math.PI / 2, 0]} // Y축 90도 회전하여 측면에서 보이게
                renderOrder={100}
              >
                {/* 원형 홀 - 빈 원 (ring) */}
                <ringGeometry args={[holeInnerRadius, holeOuterRadius, 32]} />
                <meshBasicMaterial
                  color={holeColor}
                  side={THREE.DoubleSide}
                  depthTest={false}
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
