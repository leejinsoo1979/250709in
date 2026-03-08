import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { Text, useGLTF, Line } from '@react-three/drei';
import NativeLine from '../elements/NativeLine';
import { useUIStore } from '@/store/uiStore';
import BoxWithEdges from './components/BoxWithEdges';
import DimensionText from './components/DimensionText';
import { useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';

/**
 * 서랍 측판 보링 시각화 컴포넌트
 * 2D 뷰에서 서랍 좌/우 측판의 레일 장착 보링홀을 표시합니다.
 */
interface DrawerSidePanelBoringProps {
  // 서랍 치수
  drawerWidth: number;
  drawerHeight: number;
  drawerDepth: number;
  centerPosition: [number, number, number];
  sideThickness: number;
  sidePanelOffset: number; // 서랍 가장자리에서 측판까지의 오프셋 (38mm)
  drawerIndex: number;
  mmToThreeUnits: (mm: number) => number;
  viewMode: '2D' | '3D';
  view2DDirection: 'front' | 'top' | 'left' | 'right';
}

const DrawerSidePanelBoring: React.FC<DrawerSidePanelBoringProps> = ({
  drawerWidth,
  drawerHeight,
  drawerDepth,
  centerPosition,
  sideThickness,
  sidePanelOffset,
  drawerIndex,
  mmToThreeUnits,
  viewMode,
  view2DDirection,
}) => {
  // 2D 뷰가 아니면 렌더링하지 않음
  if (viewMode !== '2D') {
    return null;
  }

  const [centerX, centerY, centerZ] = centerPosition;

  // 보링 홀 설정
  const holeDiameter = 3; // mm
  const holeRadius = mmToThreeUnits(holeDiameter / 2); // 1.5mm
  const lineThickness = mmToThreeUnits(0.3); // 선 두께
  const holeColor = '#666666'; // 회색

  // 서랍 측판 X 위치
  const leftPanelX = centerX - drawerWidth / 2 + sideThickness / 2 + sidePanelOffset;
  const rightPanelX = centerX + drawerWidth / 2 - sideThickness / 2 - sidePanelOffset;

  // 보링 Y 위치: 앞판/뒷판 체결용 - 위/중간/아래 3개
  // 위아래 끝에서 20mm 떨어진 위치 + 중간
  const edgeOffsetY = mmToThreeUnits(20); // 끝에서 20mm
  const topBoringY = centerY + drawerHeight / 2 - edgeOffsetY; // 위쪽 (끝에서 20mm)
  const middleBoringY = centerY; // 중간
  const bottomBoringY = centerY - drawerHeight / 2 + edgeOffsetY; // 아래쪽 (끝에서 20mm)
  const boringYPositions = [topBoringY, middleBoringY, bottomBoringY];

  // 보링 Z 위치: 앞판, 뒷판 중간 지점 (2개)
  // 앞판은 drawerDepth/2 - sideThickness/2 위치, 뒷판은 -drawerDepth/2 + sideThickness/2 위치
  const frontPanelZ = centerZ + drawerDepth / 2 - sideThickness / 2; // 앞판 중간
  const backPanelZ = centerZ - drawerDepth / 2 + sideThickness / 2; // 뒷판 중간
  const boringZPositions = [frontPanelZ, backPanelZ];

  // 측면뷰 (left/right) - 해당 측판에만 보링 표시 (원형)
  // 앞/뒤 패널 각각에 3개의 보링 (위/중간/아래) = 총 6개
  if (view2DDirection === 'left' || view2DDirection === 'right') {
    const xPosition = view2DDirection === 'left' ? leftPanelX : rightPanelX;
    const holeOuterRadius = mmToThreeUnits(holeDiameter / 2);
    const holeInnerRadius = holeOuterRadius * 0.6;

    return (
      <group>
        {boringZPositions.map((zPos, zIndex) => (
          boringYPositions.map((yPos, yIndex) => (
            <mesh
              key={`drawer-${drawerIndex}-boring-z${zIndex}-y${yIndex}`}
              position={[xPosition, yPos, zPos]}
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
          ))
        ))}
      </group>
    );
  }

  // 정면뷰 (front) - 양쪽 측판에 3개의 보링 (위/중간/아래)
  // 각 보링은 상/하 수평선으로 표현 (3mm 간격)
  if (view2DDirection === 'front') {
    const lineLength = sideThickness;

    return (
      <group>
        {boringYPositions.map((yPos, yIndex) => (
          <group key={`drawer-${drawerIndex}-front-boring-y${yIndex}`}>
            {/* 좌측판 보링 - 상단/하단 수평선 */}
            <mesh
              position={[leftPanelX, yPos + holeRadius, centerZ + drawerDepth / 2 + mmToThreeUnits(1)]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            <mesh
              position={[leftPanelX, yPos - holeRadius, centerZ + drawerDepth / 2 + mmToThreeUnits(1)]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>

            {/* 우측판 보링 - 상단/하단 수평선 */}
            <mesh
              position={[rightPanelX, yPos + holeRadius, centerZ + drawerDepth / 2 + mmToThreeUnits(1)]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            <mesh
              position={[rightPanelX, yPos - holeRadius, centerZ + drawerDepth / 2 + mmToThreeUnits(1)]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  // 탑뷰 (top) - 양쪽 측판에 2개의 세로선 (깊이 방향 3개 위치)
  if (view2DDirection === 'top') {
    const lineLength = sideThickness;

    return (
      <group>
        {boringZPositions.map((zPos, holeIndex) => (
          <group key={`drawer-${drawerIndex}-top-boring-${holeIndex}`}>
            {/* 좌측판 보링 - 앞/뒤 세로선 */}
            <mesh
              position={[leftPanelX, centerY + drawerHeight / 2 + mmToThreeUnits(1), zPos + holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            <mesh
              position={[leftPanelX, centerY + drawerHeight / 2 + mmToThreeUnits(1), zPos - holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>

            {/* 우측판 보링 - 앞/뒤 세로선 */}
            <mesh
              position={[rightPanelX, centerY + drawerHeight / 2 + mmToThreeUnits(1), zPos + holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>
            <mesh
              position={[rightPanelX, centerY + drawerHeight / 2 + mmToThreeUnits(1), zPos - holeRadius]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={100}
            >
              <planeGeometry args={[lineLength, lineThickness]} />
              <meshBasicMaterial color={holeColor} side={THREE.DoubleSide} depthTest={false} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  return null;
};


interface DrawerRendererProps {
  drawerCount: number;
  innerWidth: number;
  innerHeight: number;
  depth: number;
  basicThickness: number;
  yOffset?: number; // 전체 서랍 그룹의 Y축 오프셋
  zOffset?: number; // 전체 서랍 그룹의 Z축 오프셋 (섹션 깊이 조정용)
  // 타입4 가구 전용: 개별 서랍 높이 지원
  drawerHeights?: number[]; // 각 서랍 높이 배열 [176, 176, 256, 256]
  gapHeight?: number; // 서랍 간 공백 높이 (23.6mm)
  material: THREE.Material; // 가구 모듈과 동일한 재질 사용
  renderMode: 'solid' | 'wireframe'; // 렌더 모드 추가
  isHighlighted?: boolean; // 가구 강조 여부
  textureUrl?: string; // 텍스처 URL
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' }; // 패널별 결 방향
  furnitureId?: string; // 가구 ID
  sectionName?: string; // 섹션 이름 (예: "(상)", "(하)")
}

/**
 * DrawerRenderer 컴포넌트
 * 
 * 서랍장을 렌더링합니다.
 * 각 서랍은 5면 구조(상단면 제외)로 구성됩니다.
 * 
 * 타입4 가구의 경우 불균등한 서랍 높이 지원:
 * - 위쪽 2개: 176mm (작은 서랍)  
 * - 아래쪽 2개: 256mm (큰 서랍)
 * - 공백: 23.6mm씩 5곳 (위+사이3곳+아래)
 */
export const DrawerRenderer: React.FC<DrawerRendererProps> = ({
  drawerCount,
  innerWidth,
  innerHeight,
  depth,
  basicThickness,
  yOffset = 0,
  zOffset = 0,
  drawerHeights,
  sectionName = '',
  gapHeight = 0,
  material,
  renderMode,
  isHighlighted = false,
  textureUrl,
  panelGrainDirections,
  furnitureId,
}) => {
  const showDimensions = useUIStore(state => state.showDimensions);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const highlightedPanel = useUIStore(state => state.highlightedPanel);
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const { viewMode } = useSpace3DView();


  // 레일 모델 및 중심 오프셋
  const [railModel, setRailModel] = React.useState<THREE.Group | null>(null);
  const [railCenterOffset, setRailCenterOffset] = React.useState<THREE.Vector3 | null>(null);

  // 레일 재질: 옷봉과 동일 (3D: 메탈릭, 2D: 흰색)
  const railMaterial = React.useMemo(() => {
    if (viewMode === '3D') {
      return new THREE.MeshStandardMaterial({
        color: '#e8e8e8',
        metalness: 0.9,
        roughness: 0.25,
        envMapIntensity: 2.0,
        emissive: new THREE.Color('#b8b8b8'),
        emissiveIntensity: 0.15
      });
    } else {
      return new THREE.MeshBasicMaterial({
        color: '#FFFFFF'
      });
    }
  }, [viewMode]);

  // 레일 재질 cleanup
  React.useEffect(() => {
    return () => {
      railMaterial.dispose();
    };
  }, [railMaterial]);

  React.useEffect(() => {
    const loader = new ColladaLoader();
    loader.load('/models/drawer-rail.dae', (collada) => {
      console.log('📦 레일 DAE 로드됨');

      const scene = collada.scene;

      // DAE 단위: inch → Three.js units: × 0.254
      const scale = 0.254;
      scene.scale.set(scale, scale, scale);

      // Z-UP → Y-UP 좌표계 변환
      scene.rotation.x = -Math.PI / 2;

      // 매트릭스 업데이트
      scene.updateMatrixWorld(true);

      // Bounding box 중심 계산
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());

      console.log('📐 레일 center offset:', { x: center.x, y: center.y, z: center.z });

      // 중심 오프셋 저장 (배치 시 보정용)
      setRailCenterOffset(center);
      setRailModel(scene);
      console.log('✅ 서랍 레일 로드 완료');
    }, undefined, (error) => {
      console.error('❌ 레일 로드 실패:', error);
    });
  }, []);

  // 패널 비활성화용 material - 한 번만 생성하고 재사용
  const panelDimmedMaterial = React.useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#666666'),
      transparent: true,
      opacity: 0.1
    });
    mat.needsUpdate = true;
    return mat;
  }, []); // 한 번만 생성

  // 패널용 material 결정 - useCallback로 최적화
  const getPanelMaterial = React.useCallback((panelName: string) => {
    // 패널 ID 생성
    const panelId = `${furnitureId}-${panelName}`;

    // 패널이 강조되어야 하는지 확인
    const isHighlighted = highlightedPanel === panelId;

    if (highlightedPanel) {
      console.log('🎨 DrawerRenderer getPanelMaterial:', {
        panelName,
        furnitureId,
        panelId,
        highlightedPanel,
        isHighlighted,
        result: isHighlighted ? 'ORIGINAL' : 'DEFAULT'
      });
    }

    // 항상 원래 material 사용 (dimming 제거)
    return material;
  }, [highlightedPanel, furnitureId, material]);

  // 디버그: 측면 뷰에서 렌더링 확인
  React.useEffect(() => {
    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      console.log('🔍 DrawerRenderer in side view:', {
        viewMode,
        view2DDirection,
        showDimensions,
        showDimensionsText,
        drawerCount
      });
    }
  }, [viewMode, view2DDirection, showDimensions, showDimensionsText, drawerCount]);

  if (drawerCount <= 0) {
    return null;
  }

  // 서랍 높이 계산 로직 선택
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 서랍을 앞으로 100mm 이동
  const drawerZOffset = mmToThreeUnits(0);
  
  // 서랍 구조 상수
  // 손잡이 판 두께(마이다) - 15mm
  const SPECIAL_PANEL_THICKNESS = 15; // mm
  const HANDLE_PLATE_THICKNESS = mmToThreeUnits(SPECIAL_PANEL_THICKNESS);
  // 서랍 옆면(앞, 뒤, 좌, 우) 두께 상수 (15mm)
  const DRAWER_SIDE_THICKNESS = mmToThreeUnits(15); // mm 단위 변환 일관 적용
  // 서랍 바닥 두께 상수 (9mm)
  const DRAWER_BOTTOM_THICKNESS = mmToThreeUnits(9); // mm 단위 변환 일관 적용
  
  // TopSupportPanel 기본 설정: 앞쪽 85mm 잘라내고, 뒤쪽은 백패널 공간 피하기
  const topSupportPanelDepth = depth - mmToThreeUnits(85 + 17 + 9); // 가구depth - (85+17+9) = depth - 111mm
  const topSupportPanelY = innerHeight / 2 - basicThickness - mmToThreeUnits(9); // 내경 상단에서 18+9mm 아래

  // TopSupportPanel Z축 위치: 모듈 앞면에서 85mm 뒤로 시작
  const topSupportPanelZ = depth/2 - topSupportPanelDepth/2 - mmToThreeUnits(85); // 앞쪽 85mm 후퇴

  // 서랍속장 (Drawer Interior Frame) 설정 - ㄷ자 프레임
  // 구조: 좌우 수직 패널 + 뒤쪽 수평 패널(좌우 연결) + 앞쪽 수평 패널(좌/우 각각)

  // 백패널 두께 (basicThickness의 절반 = 9mm)
  const backPanelThickness = basicThickness / 2; // 9mm

  // 공통 설정
  const drawerFrameThickness = basicThickness; // 18mm
  const drawerFrameHeight = innerHeight; // 전달받은 내경 높이 그대로 사용

  // 서랍속장 (Drawer Interior Frame) - ㄷ자 프레임
  // 구조: 좌/우 각각 수직패널 + 후면수평패널(상단) + 전면수평패널(하단)
  // 수평 패널들은 수직 패널의 안쪽(서랍 방향)으로 27mm 돌출

  // 수평 패널 공통 치수
  const horizontalPanelWidth = mmToThreeUnits(27); // X축 폭: 27mm (수직패널에서 측판쪽으로 돌출)
  const horizontalPanelHeight = drawerFrameHeight; // 수직 패널과 동일한 높이
  const horizontalPanelDepthBack = drawerFrameThickness; // 후면 수평 패널 Z축 깊이: 18mm
  const horizontalPanelDepthFront = drawerFrameThickness; // 전면 수평 패널 Z축 깊이: 18mm

  // 1. 수직 패널 (세로로 긴 패널, 전체 높이)
  // 깊이: 백패널에서 18mm 앞부터 전면 85mm 전까지 (17mm 추가 감소하여 전면에서 85mm 위치)
  const verticalPanelDepth = depth - mmToThreeUnits(85) - backPanelThickness - mmToThreeUnits(18) - mmToThreeUnits(17);
  const verticalPanelZ = -depth/2 + backPanelThickness + mmToThreeUnits(18) + verticalPanelDepth/2 - mmToThreeUnits(1);

  // 2. 후면 수평 패널 (좌/우 각각) - 실제로는 전면에 위치
  // Y 위치: 전달받은 내경 중앙
  // Z 위치: 전면에서 85mm 뒤 (앞쪽) - 17mm 추가 후퇴
  // Z 깊이: 18mm (전면이므로)
  const backHorizontalPanelY = 0; // 전달받은 내경 중앙
  const backHorizontalPanelZ = depth/2 - mmToThreeUnits(85) - horizontalPanelDepthFront/2 - mmToThreeUnits(1) - mmToThreeUnits(17);

  // 4. 전면 추가 프레임 (좌/우 각각) - 전면 수평 패널 앞에 붙음
  // X축 폭: 45mm, Y축 높이: 수직 패널과 동일, Z축 깊이: 18mm
  const frontExtraFrameWidth = mmToThreeUnits(45);
  const frontExtraFrameHeight = drawerFrameHeight; // 수직 패널과 동일한 높이
  const frontExtraFrameDepth = drawerFrameThickness;
  const frontExtraFrameY = 0; // 전달받은 내경 중앙
  const frontExtraFrameZ = backHorizontalPanelZ + horizontalPanelDepthFront/2 + frontExtraFrameDepth/2; // 전면 수평 패널 앞에 붙음

  // 3. 전면 수평 패널 (좌/우 각각) - 실제로는 후면에 위치
  // Y 위치: 전달받은 내경 중앙
  // Z 위치: 백패널 앞면과 맞닿음 (뒤쪽)
  // Z 깊이: 18mm (후면이므로)
  const frontHorizontalPanelY = 0; // 전달받은 내경 중앙
  const frontHorizontalPanelZ = -depth/2 + basicThickness + backPanelThickness + horizontalPanelDepthBack/2 - mmToThreeUnits(1);
  
  // 개별 서랍 렌더링 함수 (본체 + 손잡이 판)
  const renderDrawer = (drawerWidth: number, drawerHeight: number, drawerDepth: number, centerPosition: [number, number, number], key: string, isTopDrawer: boolean = false, drawerIndex: number = 0) => {
    const [centerX, centerY, centerZ] = centerPosition;
    
    // 서랍 실제 깊이 계산: 가구 앞면에서 30mm 후퇴, 뒷면에서 30mm 전진 = 총 60mm 감소
    const actualDrawerDepth = drawerDepth - mmToThreeUnits(60);
    
    // 서랍 본체 깊이 (손잡이 판 20mm 제외)
    const drawerBodyDepth = actualDrawerDepth - HANDLE_PLATE_THICKNESS;
    // 서랍 본체 중심 (뒤쪽으로 10mm 이동)
    const drawerBodyCenterZ = centerZ - HANDLE_PLATE_THICKNESS / 2;
    
    return (
      <group key={key}>
        {/* === 서랍 본체 (깊이 20mm 줄임) === */}
        
        {/* 바닥면 - 앞면 판에 맞춰 15mm 위로 */}
        {/* <BoxWithEdges
          args={[drawerWidth, basicThickness, drawerBodyDepth]}
          position={[centerX, centerY - drawerHeight/2 + basicThickness/2 + mmToThreeUnits(15), drawerBodyCenterZ]}
          material={material}
        /> */}
        
        {/* 서랍밑판 (Drawer Bottom) - 5mm 두께, 사방 판재에 끼워짐 (폭은 70mm 더 줄이고, 깊이는 20mm 짧음) */}
        {/* 프레임 두께 18mm→15mm 변경으로 바닥판 확장: 좌우 +6mm(76→70), 앞뒤 +6mm(26→20) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 바닥` : `서랍${drawerIndex + 1} 바닥`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-bottom-${mat.uuid}`}
              args={[drawerWidth - mmToThreeUnits(70) - mmToThreeUnits(26), mmToThreeUnits(5), drawerBodyDepth - mmToThreeUnits(20)]}
              position={[centerX, centerY - drawerHeight/2 + basicThickness + mmToThreeUnits(10) + mmToThreeUnits(5)/2, drawerBodyCenterZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 앞면 (얇은 판) - 좌우 측판 안쪽에 끼워짐 (좌우 15mm씩 추가 축소) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 앞판` : `서랍${drawerIndex + 1} 앞판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-front-${mat.uuid}`}
              args={[drawerWidth - mmToThreeUnits(107), drawerHeight - mmToThreeUnits(30), DRAWER_SIDE_THICKNESS]}
              position={[centerX, centerY, drawerBodyCenterZ + drawerBodyDepth/2 - DRAWER_SIDE_THICKNESS/2]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 뒷면 - 좌우 측판 안쪽에 끼워짐 (좌우 15mm씩 추가 축소) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 뒷판` : `서랍${drawerIndex + 1} 뒷판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-back-${mat.uuid}`}
              args={[drawerWidth - mmToThreeUnits(107), drawerHeight - mmToThreeUnits(30), DRAWER_SIDE_THICKNESS]}
              position={[centerX, centerY, drawerBodyCenterZ - drawerBodyDepth/2 + DRAWER_SIDE_THICKNESS/2]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 왼쪽 면 - 앞뒤로 15mm씩 확장하여 전체 깊이 사용 */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 좌측판` : `서랍${drawerIndex + 1} 좌측판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-left-${mat.uuid}`}
              args={[DRAWER_SIDE_THICKNESS, drawerHeight - mmToThreeUnits(30), drawerBodyDepth]}
              position={[centerX - drawerWidth/2 + DRAWER_SIDE_THICKNESS/2 + mmToThreeUnits(38), centerY, drawerBodyCenterZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 오른쪽 면 - 앞뒤로 15mm씩 확장하여 전체 깊이 사용 */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 우측판` : `서랍${drawerIndex + 1} 우측판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-right-${mat.uuid}`}
              args={[DRAWER_SIDE_THICKNESS, drawerHeight - mmToThreeUnits(30), drawerBodyDepth]}
              position={[centerX + drawerWidth/2 - DRAWER_SIDE_THICKNESS/2 - mmToThreeUnits(38), centerY, drawerBodyCenterZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* === 손잡이 판 (앞쪽, 20mm 두께) === */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1}(마이다)` : `서랍${drawerIndex + 1}(마이다)`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-handle-${mat.uuid}`}
              args={[drawerWidth, drawerHeight, HANDLE_PLATE_THICKNESS]}
              position={[centerX, centerY, centerZ + actualDrawerDepth/2 - HANDLE_PLATE_THICKNESS/2]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* === 서랍 레일 (좌/우) === */}
        {(() => {
          // 2D에서는 레일 숨김
          if (viewMode === '2D') {
            return null;
          }

          // 서랍 옆판 위치 기준으로 레일 위치 동적 계산
          // 서랍 옆판 오프셋 (38mm) + 옆판 두께 (15mm) + 레일 추가 오프셋 (19.5mm) = 72.5mm
          const drawerSidePanelOffset = mmToThreeUnits(38); // 서랍 옆판이 서랍 가장자리에서 안쪽으로 들어온 거리
          const railAdditionalOffset = mmToThreeUnits(19.5); // 레일과 서랍 옆판 안쪽 가장자리 사이 간격

          // 서랍 옆판 안쪽 가장자리 위치
          const leftSidePanelInnerEdge = centerX - drawerWidth/2 + drawerSidePanelOffset + DRAWER_SIDE_THICKNESS;
          const rightSidePanelInnerEdge = centerX + drawerWidth/2 - drawerSidePanelOffset - DRAWER_SIDE_THICKNESS;

          // 레일 위치 = 서랍 옆판 안쪽 가장자리 + 추가 오프셋 + 0.5mm 안쪽 이동
          const railLeftX = leftSidePanelInnerEdge + railAdditionalOffset + mmToThreeUnits(0.5);
          const railRightX = rightSidePanelInnerEdge - railAdditionalOffset - mmToThreeUnits(0.5);
          const railY = centerY - drawerHeight/2 + mmToThreeUnits(25.5);
          const railZ = drawerBodyCenterZ - mmToThreeUnits(8); // 백패널 방향으로 8mm 이동
          const railLength = drawerBodyDepth - mmToThreeUnits(20); // 레일 길이

          if (!railModel || !railCenterOffset) return null;

          const offsetX = railCenterOffset.x;
          const offsetY = railCenterOffset.y;
          const offsetZ = railCenterOffset.z;

          // 2D 모드: 테마에 따른 색상으로 레일 렌더링 (옷봉과 동일)
          // 라이트 모드: 짙은 회색(#808080), 다크 모드: 흰색(#FFFFFF)
          if (viewMode === '2D') {
            const leftRail = railModel.clone();
            leftRail.scale.x *= -1;
            const rightRail = railModel.clone();

            const railColor = view2DTheme === 'light' ? '#808080' : '#FFFFFF';
            const rail2DMaterial = new THREE.MeshBasicMaterial({
              color: railColor,
              transparent: true,
              opacity: 0.4
            });

            [leftRail, rightRail].forEach(rail => {
              rail.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.material = rail2DMaterial;
                }
              });
            });

            return (
              <>
                <primitive
                  key={`drawer-${drawerIndex}-rail-left-2d`}
                  object={leftRail}
                  position={[railLeftX + offsetX, railY - offsetY, railZ - offsetZ]}
                />
                <primitive
                  key={`drawer-${drawerIndex}-rail-right-2d`}
                  object={rightRail}
                  position={[railRightX - offsetX, railY - offsetY, railZ - offsetZ]}
                />
              </>
            );
          }

          // 3D 모드: DAE 모델 렌더링
          const leftRail = railModel.clone();
          leftRail.scale.x *= -1;
          const rightRail = railModel.clone();

          [leftRail, rightRail].forEach(rail => {
            rail.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.material = railMaterial;
              }
            });
          });

          return (
            <>
              <primitive
                key={`drawer-${drawerIndex}-rail-left`}
                object={leftRail}
                position={[railLeftX + offsetX, railY - offsetY, railZ - offsetZ]}
              />
              <primitive
                key={`drawer-${drawerIndex}-rail-right`}
                object={rightRail}
                position={[railRightX - offsetX, railY - offsetY, railZ - offsetZ]}
              />
            </>
          );
        })()}

        {/* === 서랍 측판 보링 (2D 뷰) === */}
        <DrawerSidePanelBoring
          drawerWidth={drawerWidth}
          drawerHeight={drawerHeight - mmToThreeUnits(30)}
          drawerDepth={drawerBodyDepth}
          centerPosition={[centerX, centerY, drawerBodyCenterZ]}
          sideThickness={DRAWER_SIDE_THICKNESS}
          sidePanelOffset={mmToThreeUnits(38)}
          drawerIndex={drawerIndex}
          mmToThreeUnits={mmToThreeUnits}
          viewMode={viewMode}
          view2DDirection={view2DDirection}
        />

        {/* 상단면은 제외 (서랍이 열려있어야 함) */}

        {/* CAD 기호 (삼각형) 및 서랍 깊이 표시 */}
        {showDimensions && showDimensionsText && !(viewMode === '2D' && view2DDirection === 'top') && (
          <group>
            {/* 삼각형 CAD 기호 - 최상단 서랍에만 표시, 2D 모드에서만 */}
            {isTopDrawer && viewMode === '2D' && (
              <NativeLine name="dimension_line"
                points={[
                  [centerX - mmToThreeUnits(30), centerY + drawerHeight/2 + mmToThreeUnits(gapHeight || 23.6) - mmToThreeUnits(30), centerZ + actualDrawerDepth/2 + 0.1],
                  [centerX, centerY + drawerHeight/2 + mmToThreeUnits(gapHeight || 23.6), centerZ + actualDrawerDepth/2 + 0.1],
                  [centerX + mmToThreeUnits(30), centerY + drawerHeight/2 + mmToThreeUnits(gapHeight || 23.6) - mmToThreeUnits(30), centerZ + actualDrawerDepth/2 + 0.1],
                  [centerX - mmToThreeUnits(30), centerY + drawerHeight/2 + mmToThreeUnits(gapHeight || 23.6) - mmToThreeUnits(30), centerZ + actualDrawerDepth/2 + 0.1]
                ]}
                color="#FF0000"
                lineWidth={1}
                dashed={false}
              />
            )}
            
            {/* 서랍 깊이 표시 - DimensionText 컴포넌트 사용 (3D에서는 숨김) */}
            {viewMode !== '3D' && (
              <DimensionText
                value={(actualDrawerDepth - HANDLE_PLATE_THICKNESS) * 100}
                position={[
                  centerX,
                  centerY,
                  centerZ + actualDrawerDepth/2 + 0.1
                ]}
                prefix="D"
                color="#008B8B"
                forceShow={true}
              />
            )}
          </group>
        )}
      </group>
    );
  };
  
  if (drawerHeights && drawerHeights.length === drawerCount && gapHeight > 0) {
    // 개별 서랍 높이 지정된 가구: 높이 + 공백 적용
    
    // 서랍 위치 계산 (아래에서부터 쌓아올리기)
    let currentY = -innerHeight / 2; // 서랍장 하단 시작점
    
    // 바닥 공백
    currentY += mmToThreeUnits(gapHeight);
    
    return (
      <group position={[0, yOffset, drawerZOffset + zOffset]}>
        {/* === 서랍속장 ㄷ자 프레임 (좌/우 각각 3개 패널 = 총 6개) === */}

        {/* 1. 좌측 수직 패널 (전체 높이, 측판에서 27mm 떨어짐) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌)` : `서랍속장(좌)`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-left-vertical-${mat.uuid}`}
              args={[drawerFrameThickness, drawerFrameHeight, verticalPanelDepth]}
              position={[-innerWidth/2 + horizontalPanelWidth + drawerFrameThickness/2 + mmToThreeUnits(0.5), 0, verticalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 2. 우측 수직 패널 (전체 높이, 측판에서 27mm 떨어짐) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우)` : `서랍속장(우)`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-right-vertical-${mat.uuid}`}
              args={[drawerFrameThickness, drawerFrameHeight, verticalPanelDepth]}
              position={[innerWidth/2 - horizontalPanelWidth - drawerFrameThickness/2 - mmToThreeUnits(0.5), 0, verticalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 3. 좌측 후면 수평 패널 (상단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌) 후면` : `서랍속장(좌) 후면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-back-left-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthFront]}
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(0.5), backHorizontalPanelY, backHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 4. 우측 후면 수평 패널 (상단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우) 후면` : `서랍속장(우) 후면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-back-right-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthFront]}
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(0.5), backHorizontalPanelY, backHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 5. 좌측 전면 추가 프레임 (상단, 전면 수평 패널 앞에 붙음) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌) 전면추가` : `서랍속장(좌) 전면추가`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-extra-left-${mat.uuid}`}
              args={[frontExtraFrameWidth, frontExtraFrameHeight, frontExtraFrameDepth]}
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(9) + mmToThreeUnits(0.5), frontExtraFrameY, frontExtraFrameZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 6. 우측 전면 추가 프레임 (상단, 전면 수평 패널 앞에 붙음) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우) 전면추가` : `서랍속장(우) 전면추가`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-extra-right-${mat.uuid}`}
              args={[frontExtraFrameWidth, frontExtraFrameHeight, frontExtraFrameDepth]}
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(9) - mmToThreeUnits(0.5), frontExtraFrameY, frontExtraFrameZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 7. 좌측 전면 수평 패널 (하단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌) 전면` : `서랍속장(좌) 전면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-left-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthBack]}
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(0.5), frontHorizontalPanelY, frontHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 8. 우측 전면 수평 패널 (하단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우) 전면` : `서랍속장(우) 전면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-right-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthBack]}
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(0.5), frontHorizontalPanelY, frontHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {drawerHeights.map((drawerHeight, i) => {
          // 서랍 중심 위치 계산
          const drawerCenter = currentY + mmToThreeUnits(drawerHeight) / 2;

          const drawer = renderDrawer(
            innerWidth - mmToThreeUnits(24), // 서랍 폭 = 내경 - 24mm (좌우 각각 12mm 간격)
            mmToThreeUnits(drawerHeight),
            depth - basicThickness,
            [0, drawerCenter, basicThickness/2],
            `custom-drawer-${i}`,
            i === drawerHeights.length - 1, // 마지막 인덱스가 최상단 서랍
            i // 서랍 인덱스 전달
          );

          // 다음 서랍을 위해 Y 위치 업데이트
          currentY += mmToThreeUnits(drawerHeight + gapHeight);

          return drawer;
        })}
      </group>
    );
  } else {
    // 기존 방식: 균등 분할
    const drawerHeight = innerHeight / drawerCount;

    return (
      <group position={[0, yOffset, drawerZOffset + zOffset]}>
        {/* === 서랍속장 ㄷ자 프레임 (좌/우 각각 3개 패널 = 총 6개) === */}

        {/* 1. 좌측 수직 패널 (전체 높이, 측판에서 27mm 떨어짐) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌)` : `서랍속장(좌)`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-left-vertical-${mat.uuid}`}
              args={[drawerFrameThickness, drawerFrameHeight, verticalPanelDepth]}
              position={[-innerWidth/2 + horizontalPanelWidth + drawerFrameThickness/2 + mmToThreeUnits(0.5), 0, verticalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 2. 우측 수직 패널 (전체 높이, 측판에서 27mm 떨어짐) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우)` : `서랍속장(우)`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-right-vertical-${mat.uuid}`}
              args={[drawerFrameThickness, drawerFrameHeight, verticalPanelDepth]}
              position={[innerWidth/2 - horizontalPanelWidth - drawerFrameThickness/2 - mmToThreeUnits(0.5), 0, verticalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 3. 좌측 후면 수평 패널 (상단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌) 후면` : `서랍속장(좌) 후면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-back-left-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthFront]}
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(0.5), backHorizontalPanelY, backHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 4. 우측 후면 수평 패널 (상단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우) 후면` : `서랍속장(우) 후면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-back-right-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthFront]}
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(0.5), backHorizontalPanelY, backHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 5. 좌측 전면 추가 프레임 (상단, 전면 수평 패널 앞에 붙음) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌) 전면추가` : `서랍속장(좌) 전면추가`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-extra-left-${mat.uuid}`}
              args={[frontExtraFrameWidth, frontExtraFrameHeight, frontExtraFrameDepth]}
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(9) + mmToThreeUnits(0.5), frontExtraFrameY, frontExtraFrameZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 6. 우측 전면 추가 프레임 (상단, 전면 수평 패널 앞에 붙음) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우) 전면추가` : `서랍속장(우) 전면추가`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-extra-right-${mat.uuid}`}
              args={[frontExtraFrameWidth, frontExtraFrameHeight, frontExtraFrameDepth]}
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(9) - mmToThreeUnits(0.5), frontExtraFrameY, frontExtraFrameZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 7. 좌측 전면 수평 패널 (하단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(좌) 전면` : `서랍속장(좌) 전면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-left-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthBack]}
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(0.5), frontHorizontalPanelY, frontHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {/* 8. 우측 전면 수평 패널 (하단, 측판과 수직패널 사이 - 바깥쪽 돌출) */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍속장(우) 전면` : `서랍속장(우) 전면`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-frame-front-right-${mat.uuid}`}
              args={[horizontalPanelWidth, horizontalPanelHeight, horizontalPanelDepthBack]}
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(0.5), frontHorizontalPanelY, frontHorizontalPanelZ]}
              material={mat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })()}

        {Array.from({ length: drawerCount }, (_, i) => {
          const relativeYPosition = (-innerHeight / 2) + (i + 0.5) * drawerHeight;

          return renderDrawer(
            innerWidth - mmToThreeUnits(24), // 서랍 폭 = 내경 - 24mm (좌우 각각 12mm 간격)
            drawerHeight,
            depth - basicThickness,
            [0, relativeYPosition, basicThickness/2],
            `drawer-${i}`,
            i === drawerCount - 1, // 마지막 인덱스가 최상단 서랍
            i // 서랍 인덱스 전달
          );
        })}
      </group>
    );
  }
};

export default DrawerRenderer; 