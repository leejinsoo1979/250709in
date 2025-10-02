import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { Text } from '@react-three/drei';
import NativeLine from '../elements/NativeLine';
import { useUIStore } from '@/store/uiStore';
import BoxWithEdges from './components/BoxWithEdges';


interface DrawerRendererProps {
  drawerCount: number;
  innerWidth: number;
  innerHeight: number;
  depth: number;
  basicThickness: number;
  yOffset?: number; // 전체 서랍 그룹의 Y축 오프셋
  // 타입4 가구 전용: 개별 서랍 높이 지원
  drawerHeights?: number[]; // 각 서랍 높이 배열 [176, 176, 256, 256]
  gapHeight?: number; // 서랍 간 공백 높이 (23.6mm)
  material: THREE.Material; // 가구 모듈과 동일한 재질 사용
  renderMode: 'solid' | 'wireframe'; // 렌더 모드 추가
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
  drawerHeights,
  gapHeight = 0,
  material,
  renderMode,
}) => {
  const showDimensions = useUIStore(state => state.showDimensions);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const { viewMode } = useSpace3DView();
  
  // 치수 표시용 색상 설정
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  
  const dimensionColor = viewMode === '3D' ? getThemeColor() : '#4CAF50';
  const baseFontSize = viewMode === '3D' ? 0.45 : 0.32;
  
  if (drawerCount <= 0) {
    return null;
  }

  // 서랍 높이 계산 로직 선택
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 서랍을 앞으로 100mm 이동
  const drawerZOffset = mmToThreeUnits(0);
  
  // 서랍 구조 상수
  // 손잡이 판 두께(특수 패널 두께) - 18mm
  const SPECIAL_PANEL_THICKNESS = 18; // mm
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
  
  // 개별 서랍 렌더링 함수 (본체 + 손잡이 판)
  const renderDrawer = (drawerWidth: number, drawerHeight: number, drawerDepth: number, centerPosition: [number, number, number], key: string, isTopDrawer: boolean = false) => {
    const [centerX, centerY, centerZ] = centerPosition;
    
    // 서랍 실제 깊이 계산: 가구 앞면에서 30mm 후퇴, 뒷면에서 17mm 전진 = 총 47mm 감소
    const actualDrawerDepth = drawerDepth - mmToThreeUnits(47);
    
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
        
        {/* 서랍밑판 (Drawer Bottom) - 5mm 두께, 사방 판재에 끼워짐 (폭은 76mm 더 줄이고, 깊이는 26mm 짧음) */}
        <BoxWithEdges
          args={[drawerWidth - mmToThreeUnits(76) - mmToThreeUnits(26), mmToThreeUnits(5), drawerBodyDepth - mmToThreeUnits(26)]}
          position={[centerX, centerY - drawerHeight/2 + basicThickness + mmToThreeUnits(15) + mmToThreeUnits(5)/2, drawerBodyCenterZ]}
          material={material}
          renderMode={renderMode}
        />
        
        {/* 앞면 (얇은 판) - 손잡이 판보다 30mm 작게, 폭은 좌우 38mm씩 총 76mm 줄임 */}
        <BoxWithEdges
          args={[drawerWidth - mmToThreeUnits(76), drawerHeight - mmToThreeUnits(30), basicThickness]}
          position={[centerX, centerY, drawerBodyCenterZ + drawerBodyDepth/2 - basicThickness/2]}
          material={material}
          renderMode={renderMode}
        />
        
        {/* 뒷면 - 앞면 판과 높이 맞춤, 폭은 좌우 38mm씩 총 76mm 줄임 */}
        <BoxWithEdges
          args={[drawerWidth - mmToThreeUnits(76), drawerHeight - mmToThreeUnits(30), basicThickness]}
          position={[centerX, centerY, drawerBodyCenterZ - drawerBodyDepth/2 + basicThickness/2]}
          material={material}
          renderMode={renderMode}
        />
        
        {/* 왼쪽 면 - 앞뒤 판재 두께(36mm) 고려하여 깊이 축소, 앞면 판과 높이 맞춤, 안쪽으로 38mm 더 들어옴 */}
        <BoxWithEdges
          args={[basicThickness, drawerHeight - mmToThreeUnits(30), drawerBodyDepth - basicThickness * 2]}
          position={[centerX - drawerWidth/2 + basicThickness/2 + mmToThreeUnits(38), centerY, drawerBodyCenterZ]}
          material={material}
          renderMode={renderMode}
        />
        
        {/* 오른쪽 면 - 앞뒤 판재 두께(36mm) 고려하여 깊이 축소, 앞면 판과 높이 맞춤, 안쪽으로 38mm 더 들어옴 */}
        <BoxWithEdges
          args={[basicThickness, drawerHeight - mmToThreeUnits(30), drawerBodyDepth - basicThickness * 2]}
          position={[centerX + drawerWidth/2 - basicThickness/2 - mmToThreeUnits(38), centerY, drawerBodyCenterZ]}
          material={material}
          renderMode={renderMode}
        />
        
        {/* === 손잡이 판 (앞쪽, 20mm 두께) === */}
        <BoxWithEdges
          args={[drawerWidth, drawerHeight, HANDLE_PLATE_THICKNESS]}
          position={[centerX, centerY, centerZ + actualDrawerDepth/2 - HANDLE_PLATE_THICKNESS/2]}
          material={material}
          renderMode={renderMode}
        />
        
        {/* 상단면은 제외 (서랍이 열려있어야 함) */}
        
        {/* CAD 기호 (삼각형) 및 서랍 깊이 표시 */}
        {showDimensions && !(viewMode === '2D' && view2DDirection === 'top') && (
          <group>
            {/* 삼각형 CAD 기호 - 최상단 서랍에만 표시, 2D 모드에서만 */}
            {isTopDrawer && viewMode === '2D' && (
              <NativeLine
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
            
            {/* 서랍 깊이 표시 - 서랍 전면에 표시 */}
            <group>
              {/* 3D 모드일 때 그림자 효과 */}
              {viewMode === '3D' && (
                <Text
                        renderOrder={1000}
                        depthTest={false}
                  position={[
                    centerX + 0.01,
                    centerY - 0.01,
                    viewMode === '3D' ? depth/2 + 0.1 - 0.01 : centerZ + actualDrawerDepth/2 + 0.1
                  ]}
                  fontSize={baseFontSize}
                  color="rgba(0, 0, 0, 0.3)"
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={998}
                >
                  D{Math.round((actualDrawerDepth - HANDLE_PLATE_THICKNESS) * 100)}
                </Text>
              )}
              <Text
                        renderOrder={1000}
                        depthTest={false}
                position={[
                  centerX,
                  centerY,
                  viewMode === '3D' ? depth/2 + 0.1 : centerZ + actualDrawerDepth/2 + 0.1
                ]}
                fontSize={baseFontSize}
                color="#008B8B"
                anchorX="center"
                anchorY="middle"
                renderOrder={999}
                depthTest={false}
              >
                D{Math.round((actualDrawerDepth - HANDLE_PLATE_THICKNESS) * 100)}
              </Text>
            </group>
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
      <group position={[0, yOffset, drawerZOffset]}>
        {drawerHeights.map((drawerHeight, i) => {
          // 서랍 중심 위치 계산
          const drawerCenter = currentY + mmToThreeUnits(drawerHeight) / 2;
          
          const drawer = renderDrawer(
            innerWidth - mmToThreeUnits(24), // 서랍 폭 = 내경 - 24mm (좌우 각각 12mm 간격)
            mmToThreeUnits(drawerHeight) - basicThickness/2,
            depth - basicThickness,
            [0, drawerCenter, basicThickness/2],
            `custom-drawer-${i}`,
            i === drawerHeights.length - 1 // 마지막 인덱스가 최상단 서랍
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
      <group position={[0, yOffset, drawerZOffset]}>
        {Array.from({ length: drawerCount }, (_, i) => {
          const relativeYPosition = (-innerHeight / 2) + (i + 0.5) * drawerHeight;
          
          return renderDrawer(
            innerWidth - mmToThreeUnits(24), // 서랍 폭 = 내경 - 24mm (좌우 각각 12mm 간격)
            drawerHeight - basicThickness/2,
            depth - basicThickness,
            [0, relativeYPosition, basicThickness/2],
            `drawer-${i}`,
            i === drawerCount - 1 // 마지막 인덱스가 최상단 서랍
          );
        })}
      </group>
    );
  }
};

export default DrawerRenderer; 