import React, { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { 
  calculateRoomDimensions, 
  calculateFloorFinishHeight,
  calculatePanelDepth,
  calculateFurnitureDepth,
  calculateFrameThickness,
  calculateBaseFrameWidth,
  calculateTopBottomFrameHeight,
  calculateBaseFrameHeight
} from '../../utils/geometry';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';
import { useSpace3DView } from '../../context/useSpace3DView';
import PlacedFurnitureContainer from './furniture/PlacedFurnitureContainer';

interface RoomProps {
  spaceInfo: SpaceInfo;
  floorColor?: string;
  viewMode?: '2D' | '3D';
  materialConfig?: {
    doorColor: string;
  };
}

// mm를 Three.js 단위로 변환 (1mm = 0.01 Three.js units)
const mmToThreeUnits = (mm: number): number => mm * 0.01;

const END_PANEL_THICKNESS = 18; // 18mm

// 2D 모드용 Box with Edges 컴포넌트 - EdgesGeometry 사용으로 일관성 확보
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode: 'solid' | 'wireframe';
}> = ({ args, position, material, renderMode }) => {
  const geometry = useMemo(() => new THREE.BoxGeometry(...args), [args]);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  
  return (
    <group position={position}>
      {/* Solid 모드일 때만 면 렌더링 */}
      {renderMode === 'solid' && (
        <mesh geometry={geometry} receiveShadow castShadow>
          <primitive object={material} />
        </mesh>
      )}
      {/* 모서리 라인 렌더링 */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color="#666666" linewidth={1} />
      </lineSegments>
    </group>
  );
};

const Room: React.FC<RoomProps> = ({
  spaceInfo,
  floorColor = '#FF9966',
  viewMode = '3D',
  materialConfig
}) => {
  const { renderMode } = useSpace3DView(); // context에서 renderMode 가져오기
  
  const { width: widthMm, height: heightMm } = calculateRoomDimensions(spaceInfo);
  const floorFinishHeightMm = calculateFloorFinishHeight(spaceInfo);
  const panelDepthMm = calculatePanelDepth(spaceInfo); // 사용자 설정 깊이 사용
  const furnitureDepthMm = calculateFurnitureDepth(); // 가구/프레임용 (600mm)
  const frameThicknessMm = calculateFrameThickness(spaceInfo);
  const baseFrameMm = calculateBaseFrameWidth(spaceInfo);
  const topBottomFrameHeightMm = calculateTopBottomFrameHeight(spaceInfo);
  const baseFrameHeightMm = calculateBaseFrameHeight(spaceInfo);
  
  // mm를 Three.js 단위로 변환
  const width = mmToThreeUnits(widthMm);
  const height = mmToThreeUnits(heightMm);
  const panelDepth = mmToThreeUnits(panelDepthMm); // 공간 메쉬용 (1500mm)
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm); // 가구/프레임용 (600mm)
  const floorFinishHeight = mmToThreeUnits(floorFinishHeightMm);
  const frameThickness = {
    left: mmToThreeUnits(frameThicknessMm.left),
    right: mmToThreeUnits(frameThicknessMm.right)
  };
  const baseFrame = {
    width: mmToThreeUnits(baseFrameMm.width)
  };
  const topBottomFrameHeight = mmToThreeUnits(topBottomFrameHeightMm);
  const baseFrameHeight = mmToThreeUnits(baseFrameHeightMm);
  

  
  // 공통 프레임 재질 생성 함수 (자연스러운 목재 질감)
  const createFrameMaterial = useCallback(() => {
    const frameColor = materialConfig?.doorColor || '#FFFFFF';
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(frameColor),
      transparent: renderMode === 'wireframe',  // 와이어프레임 모드에서만 투명
      opacity: renderMode === 'wireframe' ? 0.3 : 1.0,  // 와이어프레임: 투명, 솔리드: 불투명
      clearcoat: 0.1,        // 코팅 반사 최소화 (0.2 → 0.1)
      clearcoatRoughness: 0.8, // 코팅 거칠기 증가 (0.6 → 0.8)
      metalness: 0.0,        // 완전 비금속 (0.1 → 0.0)
      roughness: 0.7,        // 표면 거칠기 증가 (0.5 → 0.7)
      reflectivity: 0.2,     // 반사율 더 감소 (0.3 → 0.2)
      envMapIntensity: 0.0,  // 환경맵 완전 제거
      emissive: new THREE.Color(0x000000)  // 자체발광 완전 제거
    });
  }, [materialConfig?.doorColor, renderMode]);

  // 각 프레임별 재질 생성
  const baseFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]);
  const leftFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]);
  const leftSubFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]); // 왼쪽 서브프레임 전용 머터리얼
  const rightFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]);
  const rightSubFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]); // 오른쪽 서브프레임 전용 머터리얼
  const topFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]);
  const topSubFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]);
  const baseSubFrameMaterial = useMemo(() => createFrameMaterial(), [createFrameMaterial]); // 하단 서브프레임 전용 머터리얼
  
  // MaterialFactory를 사용한 재질 생성 (자동 캐싱으로 성능 최적화)
  const frontToBackGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  const horizontalGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  const leftHorizontalGradientMaterial = useMemo(() => MaterialFactory.createWallMaterial(), []);
  

  
  // 3D 룸 중앙 정렬을 위한 오프셋 계산
  const xOffset = -width / 2; // 가로 중앙 (전체 폭의 절반을 왼쪽으로)
  const yOffset = 0; // 바닥 기준
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙 (앞뒤 대칭)
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 가구/프레임용 깊이: 뒷벽에서 600mm만 나오도록
  
  // 전체 그룹을 z축 방향으로 약간 조정 (앞으로 당겨서 중앙에 오도록)
  const groupZOffset = 0; // 필요에 따라 조정 가능 (양수: 앞으로, 음수: 뒤로)
  
  // 공간 메쉬 확장 깊이 (300mm = 3 Three.js units)
  const extensionDepth = mmToThreeUnits(300);
  const extendedPanelDepth = panelDepth + extensionDepth;
  // 뒷쪽은 고정하고 앞쪽으로만 확장 (기존 zOffset 사용)
  const extendedZOffset = zOffset;
  
  // 상단/하단 패널의 너비 (좌우 프레임 사이의 공간)
  const topBottomPanelWidth = baseFrame.width;
  
  // 최종적으로 사용할 패널 너비 (baseFrame.width가 이미 이격거리를 고려하여 계산됨)
  const finalPanelWidth = baseFrame.width;
  
  // 패널 X 좌표 계산 (노서라운드일 때는 이격거리를 고려한 정확한 중앙 정렬)
  const topBottomPanelX = spaceInfo.surroundType === 'no-surround' 
    ? 0 // 노서라운드 모드에서는 정확히 중앙(원점)에 배치
    : xOffset + frameThickness.left + topBottomPanelWidth / 2;

  // 바닥재료가 있을 때 좌우 패널의 시작 Y 위치와 높이 조정
  const panelStartY = spaceInfo.hasFloorFinish && floorFinishHeight > 0 ? floorFinishHeight : 0;
  
  // 띄워서 배치일 때 높이 조정
  const floatHeight = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float' 
    ? mmToThreeUnits(spaceInfo.baseConfig.floatHeight || 0) 
    : 0;
  
  // 좌우 프레임 높이 (띄워서 배치일 때 줄어듦)
  const adjustedPanelHeight = height - floatHeight;
  
  // 상단 요소들의 Y 위치 (띄워서 배치일 때 위로 이동)
  const topElementsY = panelStartY + height - topBottomFrameHeight/2;
  
  // 좌우 프레임의 시작 Y 위치 (띄워서 배치일 때 위로 이동)
  const sideFrameStartY = panelStartY + floatHeight;
  const sideFrameCenterY = sideFrameStartY + adjustedPanelHeight/2;

  // 벽 여부 확인
  const { wallConfig } = spaceInfo;

  return (
    <group position={[0, 0, groupZOffset]}>
      {/* 주변 벽면들 - ShaderMaterial 기반 그라데이션 (3D 모드에서만 표시) */}
      {viewMode === '3D' && (
        <>
          {/* 왼쪽 외부 벽면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) */}
          <mesh
            position={[-width/2 - 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[extendedPanelDepth, height]} />
            <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal')} />
          </mesh>
          
          {/* 오른쪽 외부 벽면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) - 반대 방향 */}
          <mesh
            position={[width/2 + 0.001, panelStartY + height/2, extendedZOffset + extendedPanelDepth/2]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[extendedPanelDepth, height]} />
            <primitive object={MaterialFactory.createShaderGradientWallMaterial('horizontal-reverse')} />
          </mesh>
          
          {/* 상단 외부 벽면 (천장) - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) - 세로 반대 방향 */}
          <mesh
            position={[xOffset + width/2, panelStartY + height + 0.001, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[width, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical-reverse')} />
          </mesh>
          
          {/* 바닥면 - ShaderMaterial 그라데이션 (앞쪽: 흰색, 뒤쪽: 회색) */}
          <mesh
            position={[xOffset + width/2, panelStartY - 0.001, extendedZOffset + extendedPanelDepth/2]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[width, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createShaderGradientWallMaterial('vertical')} />
          </mesh>
          
          {/* 벽장 공간의 3면에서 나오는 그라데이션 오버레이들 - 입체감 효과 */}
          
          {(() => {
            const showGradients = false; // 그라디언트 면 비활성화 (기존 메쉬와 겹침 방지)
            return showGradients && (
              <>
                {/* 좌측 벽면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[-width/2 - 0.001, panelStartY + adjustedPanelHeight/2, zOffset + panelDepth/2 + 10.81]}
                  rotation={[0, -Math.PI / 2, 0]} // 우측과 반대 방향
                >
                  <planeGeometry args={[panelDepth + 10, adjustedPanelHeight]} />
                  <primitive object={leftHorizontalGradientMaterial} />
                </mesh>
                
                {/* 우측 벽면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[width/2 + 0.001, panelStartY + adjustedPanelHeight/2, zOffset + panelDepth/2 + 10.81]}
                  rotation={[0, Math.PI / 2, 0]} // Y축 기준 시계반대방향 90도 회전
                >
                  <planeGeometry args={[panelDepth + 10, adjustedPanelHeight]} />
                  <primitive object={horizontalGradientMaterial} />
                </mesh>
                
                {/* 윗면에서 나오는 그라데이션 (가구 공간 내부로 Z축 확장) */}
                <mesh
                  position={[0, panelStartY + height + 0.001, zOffset + panelDepth/2 + 10.81]}
                  rotation={[Math.PI / 2, 0, 0]} // 윗면을 향하도록 90도 회전
                >
                  <planeGeometry args={[width, panelDepth + 10]} />
                  <primitive object={frontToBackGradientMaterial} />
                </mesh>
              </>
            );
          })()}
          
          {/* 뒤쪽 외부 벽면 - 투명 처리 */}
          <mesh
            position={[xOffset + width/2, panelStartY + height/2, zOffset - 0.01]}
          >
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial 
              color="#ffffff" 
              transparent={true}
              opacity={0.0}
              side={THREE.DoubleSide}
            />
          </mesh>
          
          {/* 모서리 음영 라인들 - 벽면이 만나는 모서리에 어두운 선 */}
          
          {/* 왼쪽 세로 모서리 (좌측벽과 뒷벽 사이) */}
          <mesh
            position={[-width/2, panelStartY + height/2, zOffset + panelDepth/2]}
            rotation={[0, 0, 0]}
          >
            <planeGeometry args={[0.02, height]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 세로 모서리 (우측벽과 뒷벽 사이) */}
          <mesh
            position={[width/2, panelStartY + height/2, zOffset + panelDepth/2]}
            rotation={[0, 0, 0]}
          >
            <planeGeometry args={[0.02, height]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 상단 가로 모서리 (천장과 뒷벽 사이) */}
          <mesh
            position={[xOffset + width/2, panelStartY + height, zOffset + panelDepth/2]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <planeGeometry args={[0.02, width]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 하단 가로 모서리 (바닥과 뒷벽 사이) */}
          <mesh
            position={[xOffset + width/2, panelStartY, zOffset + panelDepth/2]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <planeGeometry args={[0.02, width]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 왼쪽 위 세로 모서리 (좌측벽과 천장 사이) */}
          <mesh
            position={[-width/2, panelStartY + height, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 위 세로 모서리 (우측벽과 천장 사이) */}
          <mesh
            position={[width/2, panelStartY + height, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 왼쪽 아래 세로 모서리 (좌측벽과 바닥 사이) */}
          <mesh
            position={[-width/2, panelStartY, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
          
          {/* 오른쪽 아래 세로 모서리 (우측벽과 바닥 사이) */}
          <mesh
            position={[width/2, panelStartY, extendedZOffset + extendedPanelDepth/2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.02, extendedPanelDepth]} />
            <primitive object={MaterialFactory.createEdgeShadowMaterial()} />
          </mesh>
        </>
      )}
      
      {/* 바닥 마감재가 있는 경우 - 전체 가구 폭으로 설치 */}
      {spaceInfo.hasFloorFinish && floorFinishHeight > 0 && (
        <BoxWithEdges
          args={[width, floorFinishHeight, extendedPanelDepth]}
          position={[xOffset + width/2, yOffset + floorFinishHeight/2, extendedZOffset + extendedPanelDepth/2]}
          material={new THREE.MeshLambertMaterial({ color: floorColor, transparent: true, opacity: 0.3 })}
          renderMode={renderMode}
        />
      )}
      
      {/* 왼쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {spaceInfo.surroundType !== 'no-surround' &&
        (spaceInfo.installType === 'built-in' || 
        spaceInfo.installType === 'semi-standing' || 
        spaceInfo.installType === 'free-standing') && (
        <BoxWithEdges
          args={[
            frameThickness.left, 
            adjustedPanelHeight, 
            // 설치 타입과 벽 여부에 따라 깊이 결정
            (spaceInfo.installType === 'semi-standing' && !wallConfig?.left) || 
            spaceInfo.installType === 'free-standing' 
              ? furnitureDepth - mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 없는 경우 엔드패널 (가구 깊이 - 프레임 두께)
              : mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우 프레임 (18mm)
          ]}
          position={[
            xOffset + frameThickness.left/2, 
            sideFrameCenterY, 
            // 캐비넷 앞면 위치로 통일
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2
          ]}
          material={leftFrameMaterial}
          renderMode={renderMode}
        />
      )}
      
      {/* 오른쪽 프레임/엔드 패널 - 바닥재료 위에서 시작 */}
      {spaceInfo.surroundType !== 'no-surround' &&
        (spaceInfo.installType === 'built-in' || 
        spaceInfo.installType === 'semi-standing' || 
        spaceInfo.installType === 'free-standing') && (
        <BoxWithEdges
          args={[
            frameThickness.right, 
            adjustedPanelHeight, 
            // 설치 타입과 벽 여부에 따라 깊이 결정
            (spaceInfo.installType === 'semi-standing' && !wallConfig?.right) || 
            spaceInfo.installType === 'free-standing' 
              ? furnitureDepth - mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 없는 경우 엔드패널 (가구 깊이 - 프레임 두께)
              : mmToThreeUnits(END_PANEL_THICKNESS)  // 벽이 있는 경우 프레임 (18mm)
          ]}
          position={[
            xOffset + width - frameThickness.right/2, 
            sideFrameCenterY, 
            // 캐비넷 앞면 위치로 통일
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2
          ]}
          material={rightFrameMaterial}
          renderMode={renderMode}
        />
      )}
      
      {/* 상단 패널 - ㄱ자 모양으로 구성 */}
      {/* 수평 상단 프레임 - 좌우 프레임 사이에만 배치 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {topBottomFrameHeightMm > 0 && (
        <>
          {/* 노서라운드 모드에서 상단프레임 폭 디버깅 */}
          {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [상단프레임] 이격거리${spaceInfo.gapConfig.size}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${finalPanelWidth.toFixed(2)}`)}
          
          <BoxWithEdges
            args={[
              finalPanelWidth, 
              topBottomFrameHeight, 
              mmToThreeUnits(END_PANEL_THICKNESS)
            ]}
            position={[
              topBottomPanelX, // 중앙 정렬
              topElementsY, 
              // 캐비넷 앞면에서 30mm 뒤로 이동
              furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30)
            ]}
            material={topFrameMaterial}
            renderMode={renderMode}
          />
        </>
      )}
      
      {/* 상단 서브프레임 - 상단 프레임에서 앞쪽으로 내려오는 판 (ㄱ자의 세로 부분, X축 기준 90도 회전) */}
      {/* 상단 프레임 높이가 18mm보다 클 때만 렌더링 (서브프레임 높이 18mm와 비교) */}
      {topBottomFrameHeightMm > 18 && (
        <group 
          position={[
            topBottomPanelX, 
            topElementsY - topBottomFrameHeight/2 + mmToThreeUnits(END_PANEL_THICKNESS)/2, // 상단 프레임 하단에 정확히 맞물림 (패널 두께의 절반만큼 위로)
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 // 캐비넷 앞면 위치로 통일
          ]}
          rotation={[Math.PI / 2, 0, 0]} // X축 기준 90도 회전
        >
          <BoxWithEdges
            args={[
              finalPanelWidth, 
              mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
              mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
            ]}
            position={[0, 0, 0]} // group 내에서 원점에 배치
            material={topSubFrameMaterial}
            renderMode={renderMode}
          />
        </group>
      )}
      
      {/* 왼쪽 서브프레임 - 왼쪽 프레임에서 오른쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {spaceInfo.surroundType !== 'no-surround' &&
        (spaceInfo.installType === 'built-in' || 
        (spaceInfo.installType === 'semi-standing' && wallConfig?.left)) && (
        <group 
          position={[
            xOffset + frameThickness.left + mmToThreeUnits(40)/2 - mmToThreeUnits(29), // 왼쪽 프레임과 L자 모양으로 맞물림 (38mm 왼쪽으로)
            sideFrameCenterY, 
            // 캐비넷 앞면에서 30mm 뒤로 이동
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30)
          ]}
          rotation={[0, Math.PI / 2, 0]} // Y축 기준 90도 회전
        >
          <BoxWithEdges
            args={[
              mmToThreeUnits(40), // 오른쪽으로 40mm 나오는 깊이
              adjustedPanelHeight, // 왼쪽 프레임과 동일한 높이
              mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
            ]}
            position={[0, 0, 0]} // group 내에서 원점에 배치
            material={leftSubFrameMaterial}
            renderMode={renderMode}
          />
        </group>
      )}
      
      {/* 오른쪽 서브프레임 - 오른쪽 프레임에서 왼쪽으로 들어오는 판 (ㄱ자의 가로 부분, Y축 기준 90도 회전) */}
      {/* 벽이 있는 경우에만 렌더링 (엔드패널에는 서브프레임 없음) */}
      {spaceInfo.surroundType !== 'no-surround' &&
        (spaceInfo.installType === 'built-in' || 
        (spaceInfo.installType === 'semi-standing' && wallConfig?.right)) && (
        <group 
          position={[
            xOffset + width - frameThickness.right - mmToThreeUnits(40)/2 + mmToThreeUnits(29), // 오른쪽 프레임과 L자 모양으로 맞물림 (29mm 오른쪽으로)
            sideFrameCenterY, 
            // 캐비넷 앞면에서 30mm 뒤로 이동
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30)
          ]}
          rotation={[0, Math.PI / 2, 0]} // Y축 기준 90도 회전
        >
          <BoxWithEdges
            args={[
              mmToThreeUnits(40), // 왼쪽으로 40mm 나오는 깊이
              adjustedPanelHeight, // 오른쪽 프레임과 동일한 높이
              mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
            ]}
            position={[0, 0, 0]} // group 내에서 원점에 배치
            material={rightSubFrameMaterial}
            renderMode={renderMode}
          />
        </group>
      )}
      
      {/* 하단 프레임 - 받침대 역할 (가구 앞면에 배치, 문 안쪽에 숨김) */}
      {baseFrameHeightMm > 0 && (
        <>
          {/* 노서라운드 모드에서 하부프레임 폭 디버깅 */}
          {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && console.log(`🔧 [하부프레임] 이격거리${spaceInfo.gapConfig.size}mm: 실제폭=${baseFrameMm.width}mm, Three.js=${finalPanelWidth.toFixed(2)}`)}
          
          <BoxWithEdges
            args={[
              finalPanelWidth, 
              baseFrameHeight, 
              mmToThreeUnits(END_PANEL_THICKNESS) // 18mm 두께로 ㄱ자 메인 프레임
            ]}
            position={[
              topBottomPanelX, // 중앙 정렬
              panelStartY + baseFrameHeight/2, 
              // 캐비넷 앞면에서 30mm 뒤로 이동
              furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30)
            ]}
            material={baseFrameMaterial}
            renderMode={renderMode}
          />
        </>
      )}
      
      {/* 하단 서브프레임 - 하단 프레임에서 앞쪽으로 올라오는 판 (ㄱ자의 세로 부분, X축 기준 -90도 회전) */}
      {baseFrameHeightMm > 0 && (
                  <group 
            position={[
                          topBottomPanelX, // 중앙 정렬 (하단 프레임과 동일)
            panelStartY + baseFrameHeight - mmToThreeUnits(END_PANEL_THICKNESS)/2, // 하단 프레임 상단에서 ㄱ모양으로 맞물림 (서브프레임 아랫면이 프레임 윗면과 맞춤)
            furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2 - mmToThreeUnits(30) // 상부 서브 프레임과 동일한 Z축 위치 (30mm 뒤로)
          ]}
          rotation={[-Math.PI / 2, 0, 0]} // X축 기준 -90도 회전 (상단과 반대 방향)
        >
          <BoxWithEdges
            args={[
              finalPanelWidth, 
              mmToThreeUnits(40), // 앞쪽으로 40mm 나오는 깊이
              mmToThreeUnits(END_PANEL_THICKNESS) // 얇은 두께
            ]}
            position={[0, 0, 0]} // group 내에서 원점에 배치
            material={baseSubFrameMaterial}
            renderMode={renderMode}
          />
        </group>
      )}
      
      {/* 배치된 가구들 */}
      <PlacedFurnitureContainer />
    </group>
  );
};

export default Room; 