import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { EdgesGeometry, LineBasicMaterial, LineSegments } from 'three';

interface VentilationCapProps {
  position: [number, number, number];
  diameter?: number; // mm 단위
  thickness?: number; // mm 단위 (기본 9mm)
  renderMode: '2d' | '3d';
}

const createCirclePoints = (radius: number, segments: number = 48): [number, number, number][] => {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
  }
  return points;
};

/**
 * VentilationCap 컴포넌트
 * 3D에서는 백패널과 맞닿는 흰색 타공 환기캡 모델을, 2D에서는 동일 위치에 도면용 심볼을 렌더링한다.
 * 기본 크기: 직경 98mm, 두께 9mm
 */
export const VentilationCap: React.FC<VentilationCapProps> = ({
  position,
  diameter = 98,
  thickness = 9,
  renderMode: _renderMode
}) => {
  const { view2DDirection } = useUIStore();
  const { viewMode } = useSpace3DView();

  // 단위 변환 함수
  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  const {
    innerCirclePoints,
    outerCirclePoints,
    rimGeometry,
    perforatedGeometry,
    rimDepth,
    faceDepth,
    holePositions
  } = useMemo(() => {
    const outerRadius = mmToThreeUnits(diameter) / 2;
    const rimDepth = mmToThreeUnits(thickness * 0.5);
    const faceDepth = mmToThreeUnits(thickness * 0.3);
    const recessRadius = outerRadius * 0.74;

    const holeDiameterMm = 7;
    const holeSpacingMm = 11;
    const holeRadius = mmToThreeUnits(holeDiameterMm / 2);
    const spacing = mmToThreeUnits(holeSpacingMm);
    const maxSteps = Math.floor((recessRadius - holeRadius * 1.2) / spacing);

    const perforatedShape = new THREE.Shape();
    perforatedShape.absarc(0, 0, recessRadius, 0, Math.PI * 2, false);

    const holePositions: Array<{ x: number; y: number; radius: number }> = [];

    for (let ix = -maxSteps; ix <= maxSteps; ix++) {
      for (let iy = -maxSteps; iy <= maxSteps; iy++) {
        const offset = ix % 2 !== 0 ? spacing / 2 : 0; // 살짝 어긋난 배열로 밀집 타공 연출
        const hx = ix * spacing;
        const hy = iy * spacing + offset;
        const distance = Math.sqrt(hx * hx + hy * hy);
        if (distance + holeRadius <= recessRadius - spacing * 0.2) {
          const holePath = new THREE.Path();
          holePath.absarc(hx, hy, holeRadius, 0, Math.PI * 2, true);
          perforatedShape.holes.push(holePath);
          holePositions.push({ x: hx, y: hy, radius: holeRadius });
        }
      }
    }

    const perforatedGeometry = new THREE.ExtrudeGeometry(perforatedShape, {
      depth: faceDepth,
      bevelEnabled: false
    });

    const rimShape = new THREE.Shape();
    rimShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
    const rimInnerPath = new THREE.Path();
    rimInnerPath.absarc(0, 0, recessRadius * 0.98, 0, Math.PI * 2, true);
    rimShape.holes.push(rimInnerPath);

    const rimGeometry = new THREE.ExtrudeGeometry(rimShape, {
      depth: rimDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelThickness: mmToThreeUnits(0.8),
      bevelSize: mmToThreeUnits(0.9)
    });

    const outerCirclePoints = createCirclePoints(outerRadius, 64);
    const innerCirclePoints = createCirclePoints(recessRadius, 48);

    return {
      innerCirclePoints,
      outerCirclePoints,
      rimGeometry,
      perforatedGeometry,
      rimDepth,
      faceDepth,
      holePositions
    };
  }, [diameter, thickness]);

  const isFrontView = viewMode === '2D' && view2DDirection === 'front';
  const is3DMode = viewMode === '3D';
  const requestedRenderMode = _renderMode === '2d' || _renderMode === '3d' ? _renderMode : null;
  const renderAs3D = requestedRenderMode ? requestedRenderMode === '3d' : is3DMode;
  const renderAs2D = requestedRenderMode ? requestedRenderMode === '2d' : (!is3DMode && isFrontView);

  if (!renderAs3D && !renderAs2D) {
    return null;
  }

  const faceColor = '#ffffff';
  const rimColor = '#ffffff';
  const lineColor = '#FF00FF';
  const crossLineLength = mmToThreeUnits(150) / 2;
  const liftOffset = mmToThreeUnits(0.05); // 백패널 접촉을 유지하면서 미세한 z-fighting 방지

  if (renderAs3D) {
    const rimEdges = useMemo(() => new EdgesGeometry(rimGeometry, 30), [rimGeometry]);
    const perforatedEdges = useMemo(() => new EdgesGeometry(perforatedGeometry, 15), [perforatedGeometry]);

    return (
      <group name="ventilation-cap" position={position}>
        <group position={[0, 0, liftOffset]}>
          <mesh
            name="ventilation-cap-rim"
            geometry={rimGeometry}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={rimColor}
              metalness={0}
              roughness={0.04}
              emissive={rimColor}
              emissiveIntensity={0.25}
            />
          </mesh>
          {/* Rim 윤곽선 */}
          <primitive object={new LineSegments(rimEdges, new LineBasicMaterial({
            color: '#333333',
            linewidth: 1,
            opacity: 0.4,
            transparent: true,
            depthTest: true,
            depthWrite: false
          }))} />

          <mesh
            name="ventilation-cap-perforated"
            geometry={perforatedGeometry}
            position={[0, 0, rimDepth - faceDepth]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial
              color={faceColor}
              metalness={0}
              roughness={0.08}
              emissive={faceColor}
              emissiveIntensity={0.2}
            />
          </mesh>
          {/* Perforated 면 윤곽선 (타공 구멍 포함) */}
          <primitive
            object={new LineSegments(perforatedEdges, new LineBasicMaterial({
              color: '#333333',
              linewidth: 1,
              opacity: 0.4,
              transparent: true,
              depthTest: true,
              depthWrite: false
            }))}
            position={[0, 0, rimDepth - faceDepth]}
          />
        </group>
      </group>
    );
  }

  // 2D 정면 도면 표현: 기존 도면 심볼 (동심원 + 십자선)
  return (
    <group name="ventilation-cap-2d" position={position}>
      <Line name="ventilation-cap-outer" points={outerCirclePoints} color={lineColor} lineWidth={1} />
      <Line name="ventilation-cap-inner" points={innerCirclePoints} color={lineColor} lineWidth={1} />
      <Line
        name="ventilation-cap-cross-h"
        points={[
          [-crossLineLength, 0, 0],
          [crossLineLength, 0, 0]
        ]}
        color={lineColor}
        lineWidth={0.5}
      />
      <Line
        name="ventilation-cap-cross-v"
        points={[
          [0, -crossLineLength, 0],
          [0, crossLineLength, 0]
        ]}
        color={lineColor}
        lineWidth={0.5}
      />
    </group>
  );
};
