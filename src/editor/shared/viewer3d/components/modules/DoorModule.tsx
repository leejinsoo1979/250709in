import React, { useState, useEffect, useMemo } from 'react';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '../../../utils/indexing';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useThree } from '@react-three/fiber';

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
  const createDoorMaterial = () => {
    const { viewMode } = useSpace3DView();
    
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
  };

  // 싱글 가구용 도어 재질
  const doorMaterial = useMemo(() => createDoorMaterial(), [doorColor, renderMode, isGhost]);

  // 듀얼 가구용 왼쪽 도어 재질 (별도 인스턴스)
  const leftDoorMaterial = useMemo(() => createDoorMaterial(), [doorColor, renderMode, isGhost]);

  // 듀얼 가구용 오른쪽 도어 재질 (별도 인스턴스)
  const rightDoorMaterial = useMemo(() => createDoorMaterial(), [doorColor, renderMode, isGhost]);

  // 도어 배치 시 그림자 즉시 업데이트
  useEffect(() => {
    if (viewMode === '3D' && gl && gl.shadowMap) {
      // 그림자 맵 강제 업데이트
      gl.shadowMap.needsUpdate = true;
      
      // 다음 프레임에서 렌더링 강제 업데이트
      requestAnimationFrame(() => {
        gl.shadowMap.needsUpdate = true;
      });
      
      console.log('🌟 DoorModule - 그림자 강제 업데이트 완료');
    }
  }, [viewMode, gl, doorMaterial, leftDoorMaterial, rightDoorMaterial]); // 도어 재질 변경 시에도 그림자 업데이트

  // 텍스처 적용 함수
  const applyTextureToMaterial = (material: THREE.MeshStandardMaterial, textureUrl: string | undefined, doorSide: string) => {
    if (textureUrl && material) {
      // 즉시 재질 업데이트를 위해 텍스처 로딩 전에 색상 설정
      if (textureUrl.toLowerCase().includes('cabinet texture1')) {
        console.log(`🚪 ${doorSide} Cabinet Texture1 즉시 어둡게 적용 중...`);
        material.color.setRGB(0.15, 0.15, 0.15); // 실제 재질에 맞는 다크 그레이 (조금 밝게)
        material.toneMapped = false; // 톤 매핑 비활성화
        material.envMapIntensity = 0.0; // 환경맵 완전 제거
        material.emissive.setHex(0x000000); // 자체발광 완전 차단
        material.roughness = 0.8; // 거칠기 증가로 더 어둡게
        material.needsUpdate = true;
        console.log(`✅ ${doorSide} Cabinet Texture1 즉시 색상 적용 완료`);
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
          if (!textureUrl.toLowerCase().includes('cabinet texture1')) {
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
  };

  // 싱글 가구 도어 텍스처 적용
  useEffect(() => {
    const textureUrl = materialConfig.doorTexture;
    console.log('🚪 Single Door Texture URL:', textureUrl, 'Material:', doorMaterial);
    applyTextureToMaterial(doorMaterial, textureUrl, '싱글');
  }, [materialConfig.doorTexture, doorMaterial]);

  // 듀얼 가구 왼쪽 도어 텍스처 적용
  useEffect(() => {
    const textureUrl = materialConfig.doorTexture;
    console.log('🚪 Left Door Texture URL:', textureUrl, 'Material:', leftDoorMaterial);
    applyTextureToMaterial(leftDoorMaterial, textureUrl, '왼쪽');
  }, [materialConfig.doorTexture, leftDoorMaterial]);

  // 듀얼 가구 오른쪽 도어 텍스처 적용
  useEffect(() => {
    const textureUrl = materialConfig.doorTexture;
    console.log('🚪 Right Door Texture URL:', textureUrl, 'Material:', rightDoorMaterial);
    applyTextureToMaterial(rightDoorMaterial, textureUrl, '오른쪽');
  }, [materialConfig.doorTexture, rightDoorMaterial]);
  
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
              material={leftDoorMaterial}
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
              material={rightDoorMaterial}
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
              material={doorMaterial}
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
              material={doorMaterial}
              renderMode={renderMode}
            />
          </animated.group>
        </group>
      );
    }
  }
};

export default DoorModule; 