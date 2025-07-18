import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '../../../utils/indexing';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useThree } from '@react-three/fiber';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';

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
      {(viewMode !== '3D' && ((viewMode === '2D' && renderMode === 'solid') || renderMode === 'wireframe')) && (
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
  moduleWidth: number; // 가구 폭 (mm) - 무시됨, 도어는 항상 원래 슬롯 크기
  moduleDepth: number; // 가구 깊이 (mm)
  hingePosition?: 'left' | 'right'; // 힌지 위치 (기본값: right)
  spaceInfo: SpaceInfo;
  color?: string;
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm) - 도어 크기는 이 값 사용
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위) - 도어 위치는 이 값 사용
  moduleData?: any; // 실제 듀얼캐비넷 분할 정보를 위한 모듈 데이터
}

const DoorModule: React.FC<DoorModuleProps> = ({
  moduleWidth,
  moduleDepth,
  hingePosition = 'right',
  spaceInfo,
  color,
  doorXOffset = 0, // 사용하지 않음
  originalSlotWidth,
  slotCenterX,
  moduleData
}) => {
  // Store에서 재질 설정과 도어 상태 가져오기
  const { spaceInfo: storeSpaceInfo } = useSpaceConfigStore();
  const { doorsOpen } = useUIStore();
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  
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
  
  // 도어 재질 생성 함수 (듀얼 가구용 개별 재질 생성)
  const createDoorMaterial = useCallback(() => {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorColor),
      metalness: 0.0,        // 완전 비금속 (프레임과 동일)
      roughness: 0.6,        // 프레임과 동일한 거칠기
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(0x000000),  // 자체발광 완전 제거
      transparent: renderMode === 'wireframe' || (viewMode === '2D' && renderMode === 'solid') || isGhost,  // 프레임과 동일한 투명도 조건
      opacity: renderMode === 'wireframe' ? 0.3 : (viewMode === '2D' && renderMode === 'solid') ? 0.5 : isGhost ? 0.4 : 1.0,  // 프레임과 동일한 투명도 처리
    });

    return material;
  }, [doorColor, renderMode, viewMode, isGhost]);

  // 싱글 가구용 도어 재질
  const doorMaterial = useMemo(() => createDoorMaterial(), [createDoorMaterial]);

  // 듀얼 가구용 왼쪽 도어 재질 (별도 인스턴스)
  const leftDoorMaterial = useMemo(() => createDoorMaterial(), [createDoorMaterial]);

  // 듀얼 가구용 오른쪽 도어 재질 (별도 인스턴스)
  const rightDoorMaterial = useMemo(() => createDoorMaterial(), [createDoorMaterial]);

  // 도어 배치 시 그림자 즉시 업데이트
  useEffect(() => {
    if (viewMode === '3D' && gl && gl.shadowMap) {
      // 그림자 맵 강제 업데이트
      gl.shadowMap.needsUpdate = true;
      
      // 다음 프레임에서 렌더링 강제 업데이트
      requestAnimationFrame(() => {
        gl.shadowMap.needsUpdate = true;
      });
      
              if (import.meta.env.DEV) {
          console.log('🌟 DoorModule - 그림자 강제 업데이트 완료');
        }
    }
  }, [viewMode, gl]); // 뷰모드와 GL 컨텍스트 변경 시에만 그림자 업데이트

  // 텍스처 적용 함수
  const applyTextureToMaterial = useCallback((material: THREE.MeshStandardMaterial, textureUrl: string | undefined, doorSide: string) => {
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (isCabinetTexture1(textureUrl)) {
        console.log(`🚪 ${doorSide} Cabinet Texture1 즉시 어둡게 적용 중...`);
        applyCabinetTexture1Settings(material);
        console.log(`✅ ${doorSide} Cabinet Texture1 즉시 색상 적용 완료 (공통 설정 사용)`);
      }
      
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl, 
        (texture) => {
          console.log(`✅ ${doorSide} 도어 텍스처 로딩 성공:`, textureUrl);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);
          material.map = texture;
          
          // Cabinet Texture1이 아닌 경우에만 기본 설정 적용
          if (!isCabinetTexture1(textureUrl)) {
            material.color.setHex(0xffffff); // 다른 텍스처는 기본 흰색
            material.toneMapped = true; // 기본 톤 매핑 활성화
            material.roughness = 0.6; // 기본 거칠기
          }
          
          material.needsUpdate = true;
        },
        undefined,
        (error) => {
          console.error(`❌ ${doorSide} 도어 텍스처 로딩 실패:`, textureUrl, error);
        }
      );
    } else if (material) {
      console.log(`🧹 ${doorSide} 도어 텍스처 제거, 색상만 사용`);
      // 텍스처가 없으면 맵 제거하고 기본 색상으로 복원
      material.map = null;
      material.color.set(doorColor);
      material.toneMapped = true; // 기본 톤 매핑 복원
      material.roughness = 0.6; // 기본 거칠기 복원
      material.needsUpdate = true;
    }
  }, [doorColor]);

  // 도어 텍스처 적용 (텍스처 URL 변경 시에만)
  useEffect(() => {
    const textureUrl = materialConfig.doorTexture;
    console.log('🚪 Door Texture URL:', textureUrl);
    
    // 텍스처 변경 시에만 실행 (material 참조 변경은 무시)
    applyTextureToMaterial(doorMaterial, textureUrl, '싱글');
    applyTextureToMaterial(leftDoorMaterial, textureUrl, '왼쪽');
    applyTextureToMaterial(rightDoorMaterial, textureUrl, '오른쪽');
  }, [materialConfig.doorTexture]); // material 객체는 의존성에서 제거
  
  // 투명도 설정: renderMode에 따라 조정
  const opacity = renderMode === 'wireframe' ? 0.3 : 1.0;
  // 인덱싱 정보 계산
  const indexing = calculateSpaceIndexing(spaceInfo);
  const columnWidth = indexing.columnWidth;
  
  // 도어 크기는 항상 원래 슬롯 크기 사용 (기둥 침범과 무관)
  // moduleWidth는 기둥 침범 시 줄어든 캐비넷 너비이므로 절대 사용하면 안됨
  const actualDoorWidth = originalSlotWidth || indexing.columnWidth; // 원래 슬롯 너비만 사용
  
  // 듀얼 가구인지 확인 (원래 슬롯 크기 기준)
  const isDualFurniture = Math.abs(actualDoorWidth - (columnWidth * 2)) < 50;
  
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

  // 도어 위치 계산: 원래 슬롯 중심 사용 (기존 방식)
  const doorGroupX = slotCenterX || 0; // 원래 슬롯 중심 X 좌표 (Three.js 단위)

  if (isDualFurniture) {
    // 듀얼 가구: 도어 크기는 기존 방식 (슬롯사이즈 - 3mm), 위치만 실제 캐비넷과 맞춤
    const totalWidth = actualDoorWidth; // 원래 슬롯 크기 사용
    const doorWidth = (totalWidth - 3) / 2; // 기존 방식: (슬롯사이즈 - 3mm) / 2
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    // 도어는 항상 균등분할 (캐비넷이 비대칭이어도 도어는 대칭)
    const innerWidth = mmToThreeUnits(totalWidth); // 전체 내경 너비
    const leftXOffset = -innerWidth / 4;  // 전체 너비의 1/4 왼쪽
    const rightXOffset = innerWidth / 4;  // 전체 너비의 1/4 오른쪽
    
    // 힌지 축 위치 (각 도어의 바깥쪽 가장자리에서 9mm 안쪽)
    const leftHingeX = leftXOffset + (-doorWidthUnits / 2 + hingeOffsetUnits);  // 왼쪽 도어: 왼쪽 가장자리 + 9mm
    const rightHingeX = rightXOffset + (doorWidthUnits / 2 - hingeOffsetUnits); // 오른쪽 도어: 오른쪽 가장자리 - 9mm

    console.log('🚪 듀얼 도어 위치 (균등분할):', {
      totalWidth,
      doorWidth,
      mode: '균등분할 (도어는 항상 대칭)',
      leftXOffset: leftXOffset.toFixed(3),
      rightXOffset: rightXOffset.toFixed(3),
      leftHingeX: leftHingeX.toFixed(3),
      rightHingeX: rightHingeX.toFixed(3),
      doorGroupX: doorGroupX
    });

    return (
      <group position={[doorGroupX, 0, 0]}> {/* 듀얼 캐비넷도 원래 슬롯 중심에 배치 */}
        {/* 왼쪽 도어 - 왼쪽 힌지 (왼쪽 가장자리에서 회전) */}
        <group position={[leftHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualLeftDoorSpring.rotation}>
            <BoxWithEdges
              position={[doorWidthUnits / 2 - hingeOffsetUnits, 0.1, 0]} // 도어를 힌지 기준으로 오른쪽에 배치
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              material={leftDoorMaterial}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
        
        {/* 오른쪽 도어 - 오른쪽 힌지 (오른쪽 가장자리에서 회전) */}
        <group position={[rightHingeX, doorYPosition, doorDepth / 2]}>
          <animated.group rotation-y={dualRightDoorSpring.rotation}>
            <BoxWithEdges
              position={[-doorWidthUnits / 2 + hingeOffsetUnits, 0.1, 0]} // 도어를 힌지 기준으로 왼쪽에 배치
              args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
              material={rightDoorMaterial}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
      </group>
    );
  } else {
    // 싱글 가구: 하나의 문 - 힌지 위치에 따라 회전축을 문의 가장자리에서 10mm 안쪽으로 이동
    // 문의 폭 = 원래 슬롯 전체 폭 - 3mm (갭)
    const doorWidth = actualDoorWidth - 3; // 슬롯사이즈 - 3mm
    const doorWidthUnits = mmToThreeUnits(doorWidth);
    
    // 힌지 위치에 따른 회전축 오프셋 계산
    const hingeAxisOffset = hingePosition === 'left' 
      ? -doorWidthUnits / 2 + hingeOffsetUnits  // 왼쪽 힌지: 왼쪽 가장자리에서 9mm 안쪽
      : doorWidthUnits / 2 - hingeOffsetUnits;  // 오른쪽 힌지: 오른쪽 가장자리에서 9mm 안쪽
    
    // 도어 위치: 회전축이 힌지 위치에 맞게 조정
    const doorPositionX = -hingeAxisOffset; // 회전축 보정을 위한 도어 위치 조정
    
    return (
      <group position={[doorGroupX + hingeAxisOffset, doorYPosition, doorDepth / 2]}>
        <animated.group rotation-y={hingePosition === 'left' ? leftHingeDoorSpring.rotation : rightHingeDoorSpring.rotation}>
          <BoxWithEdges
            position={[doorPositionX, 0.1, 0]}
            args={[doorWidthUnits, doorHeight, doorThicknessUnits]}
            material={doorMaterial}
            renderMode={renderMode}
          />
        </animated.group>
      </group>
    );
  }
};

export default DoorModule; 