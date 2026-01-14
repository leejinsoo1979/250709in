/**
 * 보링 위치 시각화 컴포넌트
 * 3D 뷰어에서 보링 위치를 원통/원형으로 표시
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Cylinder, Circle, Line } from '@react-three/drei';
import type { Boring, BoringFace, BoringType } from '@/domain/boring/types';

// ============================================
// 타입
// ============================================

interface BoringVisualizationProps {
  borings: Boring[];
  panelPosition: { x: number; y: number; z: number };  // 패널 위치 (Three.js 단위)
  panelSize: { width: number; height: number; thickness: number };  // 패널 크기 (mm)
  panelFace: BoringFace;  // 패널이 어느 면인지 (측판의 내면, 상판의 하면 등)
  viewMode: '2D' | '3D';
  opacity?: number;
  showLabels?: boolean;
}

interface SingleBoringProps {
  boring: Boring;
  position: [number, number, number];
  rotation: [number, number, number];
  viewMode: '2D' | '3D';
  opacity: number;
  showLabel?: boolean;
}

// ============================================
// 상수
// ============================================

// 보링 타입별 색상
const BORING_COLORS: Record<BoringType, string> = {
  'hinge-cup': '#ff4444',      // 빨강 - 힌지 컵홀
  'hinge-screw': '#ff8888',    // 연한 빨강 - 힌지 나사홀
  'cam-housing': '#4444ff',    // 파랑 - 캠 하우징
  'cam-bolt': '#8888ff',       // 연한 파랑 - 캠 볼트
  'shelf-pin': '#44ff44',      // 초록 - 선반핀
  'adjustable-foot': '#ffff44', // 노랑 - 조절발
  'drawer-rail': '#ff44ff',    // 마젠타 - 서랍레일
  'drawer-rail-slot': '#ff88ff', // 연한 마젠타 - 서랍레일 장공
  'custom': '#888888',         // 회색 - 커스텀
};

// mm를 Three.js 단위로 변환
const mmToThreeUnits = (mm: number) => mm * 0.01;

// ============================================
// 단일 보링 컴포넌트
// ============================================

const SingleBoring: React.FC<SingleBoringProps> = ({
  boring,
  position,
  rotation,
  viewMode,
  opacity,
  showLabel = false,
}) => {
  const color = BORING_COLORS[boring.type] || BORING_COLORS.custom;
  const radius = mmToThreeUnits(boring.diameter / 2);
  const depth = mmToThreeUnits(boring.depth);

  // 장공인 경우 타원형으로 표시
  const isSlot = boring.type === 'drawer-rail-slot' && boring.slotWidth && boring.slotHeight;

  if (viewMode === '2D') {
    // 2D 모드: 원형으로 표시
    return (
      <group position={position}>
        <Circle args={[radius, 32]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </Circle>
        {/* 외곽선 */}
        <Circle args={[radius * 1.1, 32]}>
          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={opacity * 0.5}
            side={THREE.DoubleSide}
            wireframe
          />
        </Circle>
      </group>
    );
  }

  // 3D 모드: 원통으로 표시
  return (
    <group position={position} rotation={rotation}>
      <Cylinder
        args={[radius, radius, depth, 16]}
        position={[0, -depth / 2, 0]}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          metalness={0.3}
          roughness={0.7}
        />
      </Cylinder>
      {/* 상단 원형 (보링 입구) */}
      <Circle args={[radius, 16]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity * 0.8}
          side={THREE.DoubleSide}
        />
      </Circle>
    </group>
  );
};

// ============================================
// 메인 컴포넌트
// ============================================

const BoringVisualization: React.FC<BoringVisualizationProps> = ({
  borings,
  panelPosition,
  panelSize,
  panelFace,
  viewMode,
  opacity = 0.8,
  showLabels = false,
}) => {
  // 보링 위치 계산
  const boringElements = useMemo(() => {
    return borings.map((boring, index) => {
      // 패널 좌표계에서 Three.js 좌표계로 변환
      // boring.x, boring.y는 패널의 2D 좌표계 (패널 좌하단 기준)
      const boringX = mmToThreeUnits(boring.x);
      const boringY = mmToThreeUnits(boring.y);
      const panelThickness = mmToThreeUnits(panelSize.thickness);

      let position: [number, number, number] = [0, 0, 0];
      let rotation: [number, number, number] = [0, 0, 0];

      // 보링 면에 따라 위치와 회전 계산
      switch (boring.face) {
        case 'front':
          // 전면: Z축 방향으로 보링
          position = [
            panelPosition.x + boringX - mmToThreeUnits(panelSize.width / 2),
            panelPosition.y + boringY,
            panelPosition.z + mmToThreeUnits(panelSize.thickness / 2),
          ];
          rotation = [Math.PI / 2, 0, 0];
          break;

        case 'back':
          // 후면: Z축 반대 방향으로 보링
          position = [
            panelPosition.x + boringX - mmToThreeUnits(panelSize.width / 2),
            panelPosition.y + boringY,
            panelPosition.z - mmToThreeUnits(panelSize.thickness / 2),
          ];
          rotation = [-Math.PI / 2, 0, 0];
          break;

        case 'left':
          // 좌측면: X축 반대 방향으로 보링
          position = [
            panelPosition.x - mmToThreeUnits(panelSize.thickness / 2),
            panelPosition.y + boringY,
            panelPosition.z + boringX - mmToThreeUnits(panelSize.width / 2),
          ];
          rotation = [0, 0, Math.PI / 2];
          break;

        case 'right':
          // 우측면: X축 방향으로 보링
          position = [
            panelPosition.x + mmToThreeUnits(panelSize.thickness / 2),
            panelPosition.y + boringY,
            panelPosition.z + boringX - mmToThreeUnits(panelSize.width / 2),
          ];
          rotation = [0, 0, -Math.PI / 2];
          break;

        case 'top':
          // 상면: Y축 방향으로 보링
          position = [
            panelPosition.x + boringX - mmToThreeUnits(panelSize.width / 2),
            panelPosition.y + mmToThreeUnits(panelSize.thickness / 2),
            panelPosition.z + boringY - mmToThreeUnits(panelSize.height / 2),
          ];
          rotation = [0, 0, 0];
          break;

        case 'bottom':
          // 하면: Y축 반대 방향으로 보링
          position = [
            panelPosition.x + boringX - mmToThreeUnits(panelSize.width / 2),
            panelPosition.y - mmToThreeUnits(panelSize.thickness / 2),
            panelPosition.z + boringY - mmToThreeUnits(panelSize.height / 2),
          ];
          rotation = [Math.PI, 0, 0];
          break;
      }

      return (
        <SingleBoring
          key={`${boring.id}-${index}`}
          boring={boring}
          position={position}
          rotation={rotation}
          viewMode={viewMode}
          opacity={opacity}
          showLabel={showLabels}
        />
      );
    });
  }, [borings, panelPosition, panelSize, viewMode, opacity, showLabels]);

  if (borings.length === 0) {
    return null;
  }

  return <group>{boringElements}</group>;
};

export default BoringVisualization;
