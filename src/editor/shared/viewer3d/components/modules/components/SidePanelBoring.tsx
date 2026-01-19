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
  width?: number; // 가구 전체 너비 (Three.js 단위) - 정면뷰용

  // 보링 위치 (mm 단위, 가구 바닥 기준 절대 위치)
  // 선반 위치 + 섹션 상판/바닥판 위치 포함
  boringPositions?: number[];

  // 유틸 함수
  mmToThreeUnits: (mm: number) => number;
}

/**
 * SidePanelBoring 컴포넌트
 *
 * 2D 뷰에서 좌우 측판의 선반핀 보링 홀을 시각화합니다.
 * 보링은 측판을 관통합니다.
 *
 * - 좌측뷰/우측뷰: 해당 측판 내측면에 보링 표시
 * - 정면뷰: 양쪽 측판에 보링 표시 (관통이므로 측판 두께 영역에 표시)
 * - 탑뷰: 양쪽 측판에 보링 표시 (위에서 내려다본 관통홀)
 *
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
  width,
  boringPositions = [],
  mmToThreeUnits,
}) => {
  const { viewMode } = useSpace3DView();
  const view2DDirection = useUIStore(state => state.view2DDirection);

  // 2D 뷰가 아니면 렌더링하지 않음
  if (viewMode !== '2D') {
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

  // 3개의 홀 Z 위치 (깊이 방향)
  const frontZ = depth / 2 - edgeOffset; // 앞쪽 끝에서 50mm
  const backZ = -depth / 2 + basicThickness + edgeOffset; // 뒤쪽 끝에서 50mm (백패널 두께 고려)
  const centerZ = (frontZ + backZ) / 2; // 가운데
  const holeZPositions = [frontZ, centerZ, backZ];

  // 가구 전체 너비 (width가 없으면 innerWidth + 측판 두께*2로 계산)
  const totalWidth = width || (innerWidth + basicThickness * 2);

  // 측면뷰 (left/right) - 해당 측판에만 보링 표시
  if (view2DDirection === 'left' || view2DDirection === 'right') {
    // X 위치: 측판의 안쪽 면
    const xPosition = view2DDirection === 'left'
      ? -innerWidth / 2 + mmToThreeUnits(0.5)
      : innerWidth / 2 - mmToThreeUnits(0.5);

    return (
      <group>
        {boringPositions.map((boringPosMm, boringIndex) => {
          const boringY = -height / 2 + mmToThreeUnits(boringPosMm);

          return (
            <group key={`boring-${boringIndex}`}>
              {holeZPositions.map((zPos, holeIndex) => (
                <mesh
                  key={`hole-${boringIndex}-${holeIndex}`}
                  position={[xPosition, boringY, zPos]}
                  rotation={[0, Math.PI / 2, 0]}
                  renderOrder={100}
                >
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
  }

  // 정면뷰 (front) - 양쪽 측판에 보링 표시
  // 정면에서 측판을 바라보면 3mm 지름 관통홀이 측판 두께를 가로지르는 형태
  // 위/아래 2개의 수평선으로 표현 (3mm 간격)
  if (view2DDirection === 'front') {
    // 좌측판 X 중앙
    const leftPanelXCenter = -totalWidth / 2 + basicThickness / 2;
    // 우측판 X 중앙
    const rightPanelXCenter = totalWidth / 2 - basicThickness / 2;

    // 수평선 길이 (측판 두께)
    const lineLength = basicThickness;
    const lineThickness = mmToThreeUnits(0.3); // 선 두께
    const holeRadius = mmToThreeUnits(holeDiameter / 2); // 1.5mm

    return (
      <group>
        {boringPositions.map((boringPosMm, boringIndex) => {
          const boringY = -height / 2 + mmToThreeUnits(boringPosMm);

          return (
            <group key={`boring-${boringIndex}`}>
              {/* 좌측판 보링 - 상단 수평선 */}
              <mesh
                position={[leftPanelXCenter, boringY + holeRadius, depth / 2 + mmToThreeUnits(1)]}
                renderOrder={100}
              >
                <planeGeometry args={[lineLength, lineThickness]} />
                <meshBasicMaterial
                  color={holeColor}
                  side={THREE.DoubleSide}
                  depthTest={false}
                />
              </mesh>
              {/* 좌측판 보링 - 하단 수평선 */}
              <mesh
                position={[leftPanelXCenter, boringY - holeRadius, depth / 2 + mmToThreeUnits(1)]}
                renderOrder={100}
              >
                <planeGeometry args={[lineLength, lineThickness]} />
                <meshBasicMaterial
                  color={holeColor}
                  side={THREE.DoubleSide}
                  depthTest={false}
                />
              </mesh>

              {/* 우측판 보링 - 상단 수평선 */}
              <mesh
                position={[rightPanelXCenter, boringY + holeRadius, depth / 2 + mmToThreeUnits(1)]}
                renderOrder={100}
              >
                <planeGeometry args={[lineLength, lineThickness]} />
                <meshBasicMaterial
                  color={holeColor}
                  side={THREE.DoubleSide}
                  depthTest={false}
                />
              </mesh>
              {/* 우측판 보링 - 하단 수평선 */}
              <mesh
                position={[rightPanelXCenter, boringY - holeRadius, depth / 2 + mmToThreeUnits(1)]}
                renderOrder={100}
              >
                <planeGeometry args={[lineLength, lineThickness]} />
                <meshBasicMaterial
                  color={holeColor}
                  side={THREE.DoubleSide}
                  depthTest={false}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    );
  }

  // 탑뷰 (top) - 양쪽 측판에 보링 표시 (위에서 내려다본 관통홀)
  // 탑뷰에서는 Y축 방향으로 관통된 모든 보링이 겹쳐서 보임
  // 깊이(Z) 방향의 3개 위치에 3mm 너비 관통홀 표시 (좌/우 세로선 2개로 표현)
  if (view2DDirection === 'top') {
    // 좌측판 X 중앙
    const leftPanelXCenter = -totalWidth / 2 + basicThickness / 2;
    // 우측판 X 중앙
    const rightPanelXCenter = totalWidth / 2 - basicThickness / 2;

    // 세로선 길이 (측판 두께)
    const lineLength = basicThickness;
    const lineThickness = mmToThreeUnits(0.3); // 선 두께
    const holeRadius = mmToThreeUnits(holeDiameter / 2); // 1.5mm

    return (
      <group>
        {/* 좌측판 보링 - 깊이 방향 3개 위치 */}
        {holeZPositions.map((zPos, holeIndex) => (
          <group key={`left-hole-${holeIndex}`}>
            {/* 앞쪽 세로선 */}
            <mesh
              position={[leftPanelXCenter, height / 2 + mmToThreeUnits(1), zPos + holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial
                color={holeColor}
                side={THREE.DoubleSide}
                depthTest={false}
              />
            </mesh>
            {/* 뒤쪽 세로선 */}
            <mesh
              position={[leftPanelXCenter, height / 2 + mmToThreeUnits(1), zPos - holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial
                color={holeColor}
                side={THREE.DoubleSide}
                depthTest={false}
              />
            </mesh>
          </group>
        ))}
        {/* 우측판 보링 - 깊이 방향 3개 위치 */}
        {holeZPositions.map((zPos, holeIndex) => (
          <group key={`right-hole-${holeIndex}`}>
            {/* 앞쪽 세로선 */}
            <mesh
              position={[rightPanelXCenter, height / 2 + mmToThreeUnits(1), zPos + holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial
                color={holeColor}
                side={THREE.DoubleSide}
                depthTest={false}
              />
            </mesh>
            {/* 뒤쪽 세로선 */}
            <mesh
              position={[rightPanelXCenter, height / 2 + mmToThreeUnits(1), zPos - holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial
                color={holeColor}
                side={THREE.DoubleSide}
                depthTest={false}
              />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  return null;
};

export default SidePanelBoring;
