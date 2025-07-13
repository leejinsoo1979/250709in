import React, { useState, useEffect, useMemo } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '../../../utils/indexing';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';

// BoxWithEdges 컴포넌트 정의
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = ({ args, position, material, renderMode }) => {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  
  const { viewMode } = useSpace3DView();
  
  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh geometry={geometry} receiveShadow={viewMode === '3D'} castShadow={viewMode === '3D'}>
          <primitive object={material} />
        </mesh>
      )}
      {/* 윤곽선 렌더링 */}
      {((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe') && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial 
            color={renderMode === 'wireframe' ? "#333333" : "#666666"} 
            linewidth={1} 
          />
        </lineSegments>
      )}
    </group>
  );
};

interface DoorModuleProps {
  moduleWidth: number; // 가구 폭 (mm)
  moduleDepth: number; // 가구 깊이 (mm)
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: right)
  spaceInfo: SpaceInfo;
  color?: string;
}

const DoorModule: React.FC<DoorModuleProps> = ({
  moduleWidth,
  moduleDepth,
  hingePosition = 'right',
  spaceInfo,
  color
}) => {
  // Store에서 재질 설정과 도어 상태 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { doorsOpen } = useUIStore();
  const { renderMode } = useSpace3DView(); // context에서 renderMode 가져오기
  
  // props로 받은 spaceInfo를 우선 사용, 없으면 store에서 가져오기
  const currentSpaceInfo = spaceInfo || storeSpaceInfo;
  const materialConfig = currentSpaceInfo.materialConfig || { 
    interiorColor: '#FFFFFF', 
    doorColor: '#FFFFFF' 
  };

  // 색상 설정: color prop이 있으면 사용, 없으면 현재 spaceInfo의 도어 색상 사용
  let doorColor = color || materialConfig.doorColor;
  // 혹시라도 rgba/hex8 등 알파값이 포함된 경우 알파값 무시 (불투명 hex로 변환)
  if (typeof doorColor === 'string') {
    // hex8 (#RRGGBBAA) → hex6 (#RRGGBB)
    if (/^#([0-9a-fA-F]{8})$/.test(doorColor)) {
      doorColor = '#' + doorColor.slice(1, 7);
    }
    // rgba() → rgb()로 변환
    if (/^rgba\(/.test(doorColor)) {
      const rgb = doorColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        doorColor = `#${(+rgb[1]).toString(16).padStart(2, '0')}${(+rgb[2]).toString(16).padStart(2, '0')}${(+rgb[3]).toString(16).padStart(2, '0')}`;
      }
    }
  }
  
  // 강제: 솔리드 모드에서는 무조건 고스트 아님
  const isGhost = renderMode !== 'solid' && !!color;
  
  // 도어 재질 생성 (프레임과 동일한 재질로 통일)
  const createDoorMaterial = () => {
    const { viewMode } = useSpace3DView();
    
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorColor),
      metalness: 0.0,        // 완전 비금속 (프레임과 동일)
      roughness: 0.6,        // 프레임과 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(0x000000),  // 자체발광 완전 제거
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isGhost,  // 프레임과 동일한 투명도 조건
      opacity: renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid') ? 0.5 : isGhost ? 0.4 : 1.0,  // 프레임과 동일한 투명도 처리
    });
  };
  
  // 디버깅 로그
  console.log('🚪 DoorModule 렌더링:', {
    propColor: color,
    propSpaceInfo: spaceInfo?.materialConfig,
    storeSpaceInfo: storeSpaceInfo.materialConfig,
    currentSpaceInfo: currentSpaceInfo.materialConfig,
    materialConfig,
    finalDoorColor: doorColor
  });

  // 투명도 설정: renderMode에 따라 조정
  const opacity = renderMode === 'wireframe' ? 0.3 : 1.0;
  // 인덱싱 정보 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  const columnWidth = indexing.columnWidth;
  
  // 듀얼 가구인지 확인 (폭이 컬럼 너비의 2배에 가까우면 듀얼)
  const isDualFurniture = Math.abs(moduleWidth - (columnWidth * 2)) < 50;
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 도어 두께 (요구사항: 20mm)
  const doorThickness = 20;
  const doorThicknessUnits = mmToThreeUnits(doorThickness);
  
  // === 문 높이 계산 ===
  // 문 높이 = 전체 공간 높이 - 바닥재 높이 (내경 공간 높이)
  const fullSpaceHeight = spaceInfo.height;
  const floorHeight = spaceInfo.hasFloorFinish ? (spaceInfo.floorFinish?.height || 0) : 0;
  const actualDoorHeight = fullSpaceHeight - floorHeight;
  const doorHeight = mmToThreeUnits(actualDoorHeight - 30); // 30mm 줄임 (기존 20mm에서 10mm 추가)
  
  // === 문 Y 위치 계산 (기존 작동하던 로직으로 복원) ===
  // 
  // 핵심 원리: Three.js 좌표계에서 Y=0은 바닥 기준
  // 문의 기본 위치는 Y=0 (바닥)에서 시작하여 위로 올라감
  // 
  // 조정 로직:
  // 1. 바닥재가 있으면 바닥재 높이의 절반만큼 위로 (바닥재 중심에서 시작)
  // 2. 상단 프레임과의 간격을 위해 상단 프레임 높이의 절반만큼 위로
  // 3. 받침대가 있으면 받침대 높이의 절반만큼 아래로 (받침대 공간 확보)
  //
  let doorYPosition: number;
  
  if (spaceInfo.baseConfig?.type === 'floor') {
    // 받침대 있음: 상단 프레임 높이의 절반만큼 위로 + 받침대 높이의 절반만큼 아래로 조정
    const topFrameHeight = spaceInfo.frameSize?.top || 50;
    const baseFrameHeight = spaceInfo.baseConfig.height || 65;
    doorYPosition = floorHeight > 0 
      ? mmToThreeUnits(topFrameHeight) / 2 - mmToThreeUnits(baseFrameHeight) / 2
      : mmToThreeUnits(topFrameHeight) / 2 - mmToThreeUnits(baseFrameHeight) / 2;
  } else {
    // 받침대 없음: 상단 프레임 높이의 절반만큼 위로 조정
    const topFrameHeight = spaceInfo.frameSize?.top || 50;
    doorYPosition = floorHeight > 0 ? mmToThreeUnits(topFrameHeight) / 2 : mmToThreeUnits(topFrameHeight) / 2;
  }
  
  // 도어 깊이는 가구 깊이에서 10mm 바깥쪽으로 나오게 (가구 몸체와 겹침 방지)
  const doorDepth = mmToThreeUnits(moduleDepth) + mmToThreeUnits(20); // 10mm 바깥쪽으로
  
  // 패널 두께 (18mm)와 힌지 위치 오프셋(9mm) 상수 정의
  const panelThickness = 18;
  const hingeOffset = panelThickness / 2; // 9mm
  const hingeOffsetUnits = mmToThreeUnits(hingeOffset);
  
  // 애니메이션 설정 - 힌지 위치별로 별도 애니메이션 (80도 열림)
  const leftHingeDoorSpring = useSpring({
    // 왼쪽 힌지: 반시계방향으로 열림 (오른쪽으로 열림) - 80도
    rotation: doorsOpen ? -4 * Math.PI / 9 : 0,
    config: { tension: 70, friction: 20 }
  });
  
  const rightHingeDoorSpring = useSpring({
    // 오른쪽 힌지: 시계방향으로 열림 (왼쪽으로 열림) - 80도
    rotation: doorsOpen ? 4 * Math.PI / 9 : 0,
    config: { tension: 70, friction: 20 }
  });
  
  // 듀얼 가구용 애니메이션 설정 (80도 열림)
  const dualLeftDoorSpring = useSpring({
    rotation: doorsOpen ? -4 * Math.PI / 9 : 0, // 왼쪽 문: 반시계방향 (바깥쪽으로) - 80도
    config: { tension: 70, friction: 20 }
  });
  
  const dualRightDoorSpring = useSpring({
    rotation: doorsOpen ? 4 * Math.PI / 9 : 0, // 오른쪽 문: 시계방향 (바깥쪽으로) - 80도
    config: { tension: 70, friction: 20 }
  });

  if (isDualFurniture) {
    // 듀얼 가구: 두 개의 문 (힌지 위치는 각 문의 바깥쪽)
    // 각 문의 폭 = (전체 폭 - 양쪽 1.5mm - 가운데 3mm) / 2
    const totalWidth = moduleWidth;
    const doorWidth = (totalWidth - 1.5 - 1.5 - 3) / 2;
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    // 첫 번째 문 위치 (왼쪽) - 바깥쪽 1.5mm 유격 확보 후 문 중앙 위치
    const leftDoorX = mmToThreeUnits(-totalWidth / 2 + 1.5 + doorWidth / 2);
    // 두 번째 문 위치 (오른쪽) - 바깥쪽 1.5mm 유격 확보 후 문 중앙 위치
    const rightDoorX = mmToThreeUnits(totalWidth / 2 - 1.5 - doorWidth / 2);

    return (
      <group>
        {/* 왼쪽 문 - 회전축을 문의 왼쪽 가장자리에서 10mm 안쪽에 위치 */}
        <group position={[leftDoorX - doorWidthUnits/2 + hingeOffsetUnits, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualLeftDoorSpring.rotation}>
            <BoxWithEdges
              position={[doorWidthUnits/2 - hingeOffsetUnits, 0.1, 0]}
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              material={createDoorMaterial()}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
        
        {/* 오른쪽 문 - 회전축을 문의 오른쪽 가장자리에서 10mm 안쪽에 위치 */}
        <group position={[rightDoorX + doorWidthUnits/2 - hingeOffsetUnits, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualRightDoorSpring.rotation}>
            <BoxWithEdges
              position={[-doorWidthUnits/2 + hingeOffsetUnits, 0.1, 0]}
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              material={createDoorMaterial()}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
      </group>
    );
  } else {
    // 싱글 가구: 하나의 문 - 힌지 위치에 따라 회전축을 문의 가장자리에서 10mm 안쪽으로 이동
    // 문의 폭 = 전체 폭 - 양쪽 1.5mm
    const doorWidth = moduleWidth - 1.5 - 1.5;
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    if (hingePosition === 'left') {
      // 왼쪽 힌지: 회전축을 문의 왼쪽 가장자리에서 10mm 안쪽에 위치
      // 문의 오른쪽 가장자리가 가구 오른쪽 끝에서 1.5mm 안쪽에 오도록 조정
      return (
        <group position={[-mmToThreeUnits(moduleWidth)/2 + mmToThreeUnits(1.5) + hingeOffsetUnits, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={leftHingeDoorSpring.rotation}>
            <BoxWithEdges
              position={[doorWidthUnits/2 - hingeOffsetUnits, 0.1, 0]}
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              material={createDoorMaterial()}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
      );
    } else {
      // 오른쪽 힌지: 회전축을 문의 오른쪽 가장자리에서 10mm 안쪽에 위치
      // 문의 왼쪽 가장자리가 가구 왼쪽 끝에서 1.5mm 안쪽에 오도록 조정
      return (
        <group position={[mmToThreeUnits(moduleWidth)/2 - mmToThreeUnits(1.5) - hingeOffsetUnits, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={rightHingeDoorSpring.rotation}>
            <BoxWithEdges
              position={[-doorWidthUnits/2 + hingeOffsetUnits, 0.1, 0]}
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              material={createDoorMaterial()}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
      );
    }
  }
};

export default DoorModule; 