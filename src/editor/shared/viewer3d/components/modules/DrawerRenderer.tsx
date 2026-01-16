import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { Text, useGLTF } from '@react-three/drei';
import NativeLine from '../elements/NativeLine';
import { useUIStore } from '@/store/uiStore';
import BoxWithEdges from './components/BoxWithEdges';
import DimensionText from './components/DimensionText';
import { useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';


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
  const { viewMode } = useSpace3DView();

  // 레일 모델 로드
  const [railModel, setRailModel] = React.useState<THREE.Group | null>(null);

  React.useEffect(() => {
    const loader = new ColladaLoader();
    loader.load('/models/drawer-rail.dae', (collada) => {
      console.log('📦 레일 DAE 로드됨');

      const scene = collada.scene;

      // DAE 단위: inch (0.0254m)
      // inch → mm: × 25.4, mm → Three.js units: × 0.01
      // 총: inch × 0.254
      const scale = 0.254;
      scene.scale.set(scale, scale, scale);

      // Z-UP → Y-UP 좌표계 변환
      scene.rotation.x = -Math.PI / 2;

      // 원점 기준으로 위치 리셋
      scene.position.set(0, 0, 0);

      setRailModel(scene);
      console.log('✅ 서랍 레일 로드 완료, scale:', scale);
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

  // 서랍속장 디버깅용 초록색 material (2D 뷰에서 사용)
  const drawerFrameDebugMaterial = React.useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00ff00'),
      transparent: true,
      opacity: 0.8
    });
    mat.needsUpdate = true;
    return mat;
  }, []);

  // 패널용 material 결정 - useCallback로 최적화
  const getPanelMaterial = React.useCallback((panelName: string) => {
    // 2D 모드에서 서랍속장 패널은 초록색으로 표시
    if (viewMode === '2D' && panelName.includes('서랍속장')) {
      return drawerFrameDebugMaterial;
    }

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
  }, [highlightedPanel, furnitureId, material, viewMode, drawerFrameDebugMaterial]);

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
              position={[centerX, centerY - drawerHeight/2 + basicThickness + mmToThreeUnits(15) + mmToThreeUnits(5)/2, drawerBodyCenterZ]}
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

        {/* 앞면 (얇은 판) - 손잡이 판보다 30mm 작게, 폭은 좌우 38mm씩 총 76mm 줄임 */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 앞판` : `서랍${drawerIndex + 1} 앞판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-front-${mat.uuid}`}
              args={[drawerWidth - mmToThreeUnits(76), drawerHeight - mmToThreeUnits(30), DRAWER_SIDE_THICKNESS]}
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

        {/* 뒷면 - 앞면 판과 높이 맞춤, 폭은 좌우 38mm씩 총 76mm 줄임 */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 뒷판` : `서랍${drawerIndex + 1} 뒷판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-back-${mat.uuid}`}
              args={[drawerWidth - mmToThreeUnits(76), drawerHeight - mmToThreeUnits(30), DRAWER_SIDE_THICKNESS]}
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

        {/* 왼쪽 면 - 앞뒤 판재 두께(30mm) 고려하여 깊이 축소, 앞면 판과 높이 맞춤, 안쪽으로 38mm 더 들어옴 */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 좌측판` : `서랍${drawerIndex + 1} 좌측판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-left-${mat.uuid}`}
              args={[DRAWER_SIDE_THICKNESS, drawerHeight - mmToThreeUnits(30), drawerBodyDepth - DRAWER_SIDE_THICKNESS * 2]}
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

        {/* 오른쪽 면 - 앞뒤 판재 두께(30mm) 고려하여 깊이 축소, 앞면 판과 높이 맞춤, 안쪽으로 38mm 더 들어옴 */}
        {(() => {
          const panelName = sectionName ? `${sectionName}서랍${drawerIndex + 1} 우측판` : `서랍${drawerIndex + 1} 우측판`;
          const mat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`drawer-${drawerIndex}-right-${mat.uuid}`}
              args={[DRAWER_SIDE_THICKNESS, drawerHeight - mmToThreeUnits(30), drawerBodyDepth - DRAWER_SIDE_THICKNESS * 2]}
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
        {/* 서랍속장 내측면(-innerWidth/2+45mm)과 서랍 측판 외측면(-innerWidth/2+50mm) 사이 */}
        {railModel && (
          <>
            {/* 좌측 레일 - 서랍속장과 서랍 측판 사이 */}
            <primitive
              key={`drawer-${drawerIndex}-rail-left`}
              object={railModel.clone()}
              position={[
                centerX - drawerWidth/2 + mmToThreeUnits(36), // 서랍속장-서랍 사이 (drawerWidth 기준 36mm)
                centerY - drawerHeight/2 + mmToThreeUnits(15), // 서랍 바닥 근처
                drawerBodyCenterZ // 서랍 본체 중심
              ]}
            />
            {/* 우측 레일 - 서랍속장과 서랍 측판 사이 */}
            {(() => {
              const rightRail = railModel.clone();
              rightRail.scale.x *= -1; // X축 반전 (좌우 대칭)
              return (
                <primitive
                  key={`drawer-${drawerIndex}-rail-right`}
                  object={rightRail}
                  position={[
                    centerX + drawerWidth/2 - mmToThreeUnits(36), // 서랍속장-서랍 사이
                    centerY - drawerHeight/2 + mmToThreeUnits(15), // 서랍 바닥 근처
                    drawerBodyCenterZ // 서랍 본체 중심
                  ]}
                />
              );
            })()}
          </>
        )}

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
            
            {/* 서랍 깊이 표시 - DimensionText 컴포넌트 사용 */}
            <DimensionText
              value={(actualDrawerDepth - HANDLE_PLATE_THICKNESS) * 100}
              position={[
                centerX,
                centerY,
                viewMode === '3D' ? depth/2 + 0.1 : centerZ + actualDrawerDepth/2 + 0.1
              ]}
              prefix="D"
              color="#008B8B"
              forceShow={true}
            />
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
              position={[-innerWidth/2 + horizontalPanelWidth + drawerFrameThickness/2, 0, verticalPanelZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth - drawerFrameThickness/2, 0, verticalPanelZ]}
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
              position={[-innerWidth/2 + horizontalPanelWidth/2, backHorizontalPanelY, backHorizontalPanelZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth/2, backHorizontalPanelY, backHorizontalPanelZ]}
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
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(9), frontExtraFrameY, frontExtraFrameZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(9), frontExtraFrameY, frontExtraFrameZ]}
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
              position={[-innerWidth/2 + horizontalPanelWidth/2, frontHorizontalPanelY, frontHorizontalPanelZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth/2, frontHorizontalPanelY, frontHorizontalPanelZ]}
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
            mmToThreeUnits(drawerHeight) - basicThickness/2,
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
              position={[-innerWidth/2 + horizontalPanelWidth + drawerFrameThickness/2, 0, verticalPanelZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth - drawerFrameThickness/2, 0, verticalPanelZ]}
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
              position={[-innerWidth/2 + horizontalPanelWidth/2, backHorizontalPanelY, backHorizontalPanelZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth/2, backHorizontalPanelY, backHorizontalPanelZ]}
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
              position={[-innerWidth/2 + horizontalPanelWidth/2 + mmToThreeUnits(9), frontExtraFrameY, frontExtraFrameZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth/2 - mmToThreeUnits(9), frontExtraFrameY, frontExtraFrameZ]}
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
              position={[-innerWidth/2 + horizontalPanelWidth/2, frontHorizontalPanelY, frontHorizontalPanelZ]}
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
              position={[innerWidth/2 - horizontalPanelWidth/2, frontHorizontalPanelY, frontHorizontalPanelZ]}
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
            drawerHeight - basicThickness/2,
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