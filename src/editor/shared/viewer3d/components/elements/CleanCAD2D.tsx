import React, { useEffect, useRef } from 'react';
import { Line, Text, Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface CleanCAD2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
}

/**
 * 깔끔한 CAD 스타일 2D 뷰어 (그리드 없음)
 * 이미지와 동일한 스타일의 치수선과 가이드라인만 표시
 */
const CleanCAD2D: React.FC<CleanCAD2DProps> = ({ viewDirection }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { view2DDirection, showDimensions } = useUIStore();
  const groupRef = useRef<THREE.Group>(null);
  
  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  
  // 모든 자식 요소의 renderOrder를 설정
  useEffect(() => {
    if (groupRef.current) {
      // 그룹 자체의 renderOrder 설정
      groupRef.current.renderOrder = 999999;
      
      groupRef.current.traverse((child) => {
        // 타입 안전하게 처리
        if ('material' in child && child.material) {
          child.renderOrder = 999999; // 최대한 높은 값으로 설정
          if (child.material instanceof THREE.Material) {
            child.material.depthTest = false;
            child.material.depthWrite = false; // 깊이 쓰기도 비활성화
            child.material.needsUpdate = true;
          }
        }
      });
    }
  }, [currentViewDirection, showDimensions, placedModules.length, JSON.stringify(placedModules.map(m => ({ id: m.id, moduleId: m.moduleId, customDepth: m.customDepth, position: m.position })))]); // placedModules 변경사항을 세밀하게 감지
  
  // 치수 표시가 비활성화된 경우 아무것도 렌더링하지 않음 (hooks 호출 후에 체크)
  if (!showDimensions) {
    return null;
  }
  
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 공간 크기 (Three.js 단위)
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  
  // 폰트 크기 - 적당한 고정값 사용
  const baseFontSize = 0.4; // 적당한 크기
  const largeFontSize = 0.5; // 큰 텍스트
  const smallFontSize = 0.35; // 작은 텍스트
  
  // 인덱싱 계산 (컬럼 정보)
  const indexing = calculateSpaceIndexing(spaceInfo);
  const { threeUnitBoundaries, columnCount } = indexing;
  
  // 치수선 위치 설정 - 3D 모드에서는 더 위쪽에 배치
  const hasPlacedModules = placedModules.length > 0;
  const is3DMode = currentViewDirection === '3D'; // 3D 모드인지 판단
  const topDimensionY = spaceHeight + mmToThreeUnits(hasPlacedModules ? (is3DMode ? 350 : 280) : (is3DMode ? 270 : 200)); // 상단 전체 치수선
  const columnDimensionY = spaceHeight + mmToThreeUnits(120); // 컬럼 치수선
  const leftDimensionX = -mmToThreeUnits(is3DMode ? 250 : 200); // 좌측 치수선 (3D에서는 더 왼쪽)
  
  // 좌측 오프셋 (가로 공간치수의 절반)
  const leftOffset = -mmToThreeUnits(spaceInfo.width / 2);
  
  // 프레임 사이즈 정보
  const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
  
  // 화살표 생성 함수
  const createArrowHead = (start: [number, number, number], end: [number, number, number], size = 0.015) => {
    const direction = new THREE.Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2]).normalize();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(size);
    
    return [
      [start[0] + direction.x * size + perpendicular.x, start[1] + direction.y * size + perpendicular.y, start[2]],
      start,
      [start[0] + direction.x * size - perpendicular.x, start[1] + direction.y * size - perpendicular.y, start[2]]
    ] as [number, number, number][];
  };

  // 뷰 방향별 치수선 렌더링
  const renderDimensions = () => {
    switch (currentViewDirection) {
      case '3D':
      case 'front':
        return renderFrontView();
      case 'left':
        return renderLeftView();
      case 'right':
        return renderRightView();
      case 'top':
        return renderTopView();
      default:
        return renderFrontView();
    }
  };

  // 정면뷰 치수선 - Z축 좌표 0에 배치
  const frontFrameZ = 0; // Z축 0 위치
  const zOffset = is3DMode ? frontFrameZ : 0; // 3D 모드에서 Z축 0 위치로 배치
  
  const renderFrontView = () => (
    <group position={[0, 0, zOffset]} renderOrder={9999}>
      {/* 정면도 치수선들 */}
      {(
        <>
          {/* 상단 전체 프레임 포함 폭 치수선 */}
          <group>
        {/* 치수선 */}
        <Line
          points={[[leftOffset, topDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY, 0.002]]}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrowHead([leftOffset, topDimensionY, 0.002], [leftOffset + 0.05, topDimensionY, 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.05, topDimensionY, 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 전체 폭 (프레임 포함) 치수 텍스트 - Text 3D 사용 */}
        <Text
          position={[mmToThreeUnits(spaceInfo.width) / 2 + leftOffset, topDimensionY + mmToThreeUnits(40), 0.01]}
          fontSize={largeFontSize}
          color="black"
          anchorX="center"
          anchorY="middle"
        >
          {spaceInfo.width}
        </Text>
        
        {/* 연장선 (좌측 프레임) */}
        <Line
          points={[[leftOffset, 0, 0.001], [leftOffset, topDimensionY + mmToThreeUnits(20), 0.001]]}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 연장선 (우측 프레임) */}
        <Line
          points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, 0, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY + mmToThreeUnits(20), 0.001]]}
          color="#666666"
          lineWidth={1}
        />
      </group>
      
      {/* 좌측 프레임 치수선 */}
      <group>
        {/* 치수선 */}
        <Line
          points={[[leftOffset, topDimensionY - mmToThreeUnits(60), 0.002], [leftOffset + mmToThreeUnits(frameSize.left), topDimensionY - mmToThreeUnits(60), 0.002]]}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrowHead([leftOffset, topDimensionY - mmToThreeUnits(60), 0.002], [leftOffset + 0.02, topDimensionY - mmToThreeUnits(60), 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrowHead([leftOffset + mmToThreeUnits(frameSize.left), topDimensionY - mmToThreeUnits(60), 0.002], [leftOffset + mmToThreeUnits(frameSize.left) - 0.02, topDimensionY - mmToThreeUnits(60), 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 좌측 프레임 치수 텍스트 */}
        <Text
          position={[leftOffset + mmToThreeUnits(frameSize.left) / 2, topDimensionY - mmToThreeUnits(30), 0.01]}
          fontSize={baseFontSize}
          color="black"
          anchorX="center"
          anchorY="middle"
        >
          {frameSize.left}
        </Text>
        
        {/* 연장선 */}
        <Line
          points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY - mmToThreeUnits(40), 0.001]]}
          color="#666666"
          lineWidth={1}
        />
        <Line
          points={[[leftOffset + mmToThreeUnits(frameSize.left), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(frameSize.left), topDimensionY - mmToThreeUnits(40), 0.001]]}
          color="#666666"
          lineWidth={1}
        />
      </group>
      
      {/* 우측 프레임 치수선 */}
      <group>
        {/* 치수선 */}
        <Line
          points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY - mmToThreeUnits(60), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(60), 0.002]]}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY - mmToThreeUnits(60), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) + 0.02, topDimensionY - mmToThreeUnits(60), 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(60), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, topDimensionY - mmToThreeUnits(60), 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 우측 프레임 치수 텍스트 */}
        <Text
          position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) / 2, topDimensionY - mmToThreeUnits(30), 0.01]}
          fontSize={baseFontSize}
          color="black"
          anchorX="center"
          anchorY="middle"
        >
          {frameSize.right}
        </Text>
        
        {/* 연장선 */}
        <Line
          points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY - mmToThreeUnits(40), 0.001]]}
          color="#666666"
          lineWidth={1}
        />
        <Line
          points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(40), 0.001]]}
          color="#666666"
          lineWidth={1}
        />
      </group>
      
      {/* 각 컬럼 너비 치수선 - 히든 처리 */}
      {false && placedModules.length > 0 && columnCount > 1 && threeUnitBoundaries.slice(0, -1).map((leftX, index) => {
        const rightX = threeUnitBoundaries[index + 1];
        const columnWidth = (rightX - leftX) / 0.01; // Three.js 단위를 mm로 변환
        const centerX = (leftX + rightX) / 2;
        
        return (
          <group key={`column-dimension-${index}`}>
            {/* 컬럼 치수선 */}
            <Line
              points={[[leftX, columnDimensionY, 0.002], [rightX, columnDimensionY, 0.002]]}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftX, columnDimensionY, 0.002], [leftX + 0.03, columnDimensionY, 0.002], 0.01)}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([rightX, columnDimensionY, 0.002], [rightX - 0.03, columnDimensionY, 0.002], 0.01)}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 컬럼 너비 텍스트 */}
            <Html
              position={[centerX, columnDimensionY + mmToThreeUnits(25), 0.01]}
              center
              style={{ pointerEvents: 'none' }}
          occlude={false}
            >
              <div
                style={{
                  background: 'white',
                  color: 'black',
                  padding: '1px 4px',
                  fontSize: '15px',
                  fontWeight: 'normal',
                  fontFamily: 'Arial, sans-serif',
                  border: '1px solid #666',
              borderRadius: '2px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
              >
                {Math.round(columnWidth)}
              </div>
            </Html>
            
            {/* 연장선 (컬럼 구분선) */}
            <Line
              points={[[leftX, spaceHeight, 0.001], [leftX, columnDimensionY + mmToThreeUnits(15), 0.001]]}
              color="#666666"
              lineWidth={1}
            />
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, columnDimensionY + mmToThreeUnits(15), 0.001]]}
              color="#666666"
              lineWidth={1}
            />
          </group>
        );
      })}
      
      {/* 좌측 전체 높이 치수선 */}
      <group>
        {/* 치수선 */}
        <Line
          points={[[leftDimensionX + leftOffset, 0, 0.002], [leftDimensionX + leftOffset, spaceHeight, 0.002]]}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrowHead([leftDimensionX + leftOffset, 0, 0.002], [leftDimensionX + leftOffset, 0.05, 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrowHead([leftDimensionX + leftOffset, spaceHeight, 0.002], [leftDimensionX + leftOffset, spaceHeight - 0.05, 0.002])}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 전체 높이 치수 텍스트 - Text 3D 사용 */}
        <Text
          position={[leftDimensionX + leftOffset - mmToThreeUnits(60), spaceHeight / 2, 0.01]}
          fontSize={largeFontSize}
          color="black"
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, -Math.PI / 2]}
        >
          {spaceInfo.height}
        </Text>
        
        {/* 연장선 (하단) */}
        <Line
          points={[[leftOffset, 0, 0.001], [leftDimensionX + leftOffset - mmToThreeUnits(20), 0, 0.001]]}
          color="#666666"
          lineWidth={1}
        />
        
        {/* 연장선 (상단) */}
        <Line
          points={[[leftOffset, spaceHeight, 0.001], [leftDimensionX + leftOffset - mmToThreeUnits(20), spaceHeight, 0.001]]}
          color="#666666"
          lineWidth={1}
        />
      </group>
      
      {/* 우측 3구간 높이 치수선 (상부프레임 + 캐비넷배치영역 + 하부프레임) */}
      <group>
        {(() => {
          const rightDimensionX = mmToThreeUnits(spaceInfo.width) + leftOffset + mmToThreeUnits(is3DMode ? 120 : 200); // 우측 치수선 위치 (3D에서는 더 가까이)
          const topFrameHeight = frameSize.top; // 상부 프레임 높이
          const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0; // 하부 프레임 높이 (받침대가 있는 경우만)
          const cabinetPlacementHeight = spaceInfo.height - topFrameHeight - bottomFrameHeight; // 캐비넷 배치 영역
          
          const bottomY = 0; // 바닥
          const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight); // 하부 프레임 상단
          const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
          const topY = spaceHeight; // 최상단
          
          return (
            <>
              {/* 1. 하부 프레임 높이 - 받침대가 있는 경우에만 표시 */}
              {bottomFrameHeight > 0 && (
                <group>
                  <Line
                    points={[[rightDimensionX, bottomY, 0.002], [rightDimensionX, bottomFrameTopY, 0.002]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([rightDimensionX, bottomY, 0.002], [rightDimensionX, 0.03, 0.002])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, bottomFrameTopY - 0.03, 0.002])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(bottomFrameHeight / 2), 0.01]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {bottomFrameHeight}
                  </Text>
                </group>
              )}
              
              {/* 2. 캐비넷 배치 높이 */}
              <group>
                <Line
                  points={[[rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, cabinetAreaTopY, 0.002]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, bottomFrameTopY + 0.03, 0.002])}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, cabinetAreaTopY - 0.03, 0.002])}
                  color="#666666"
                  lineWidth={1}
                />
                <Text
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight / 2), 0.01]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {cabinetPlacementHeight}
                </Text>
              </group>
              
              {/* 3. 상부 프레임 높이 */}
              <group>
                <Line
                  points={[[rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, topY, 0.002]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, cabinetAreaTopY + 0.03, 0.002])}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([rightDimensionX, topY, 0.002], [rightDimensionX, topY - 0.03, 0.002])}
                  color="#666666"
                  lineWidth={1}
                />
                <Text
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(spaceInfo.height - topFrameHeight / 2), 0.01]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {topFrameHeight}
                </Text>
              </group>
              
              {/* 연장선들 */}
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, bottomY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), bottomY, 0.001]]}
                color="#666666"
                lineWidth={1}
              />
              {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
              {bottomFrameHeight > 0 && (
                <Line
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, bottomFrameTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), bottomFrameTopY, 0.001]]}
                  color="#666666"
                  lineWidth={1}
                />
              )}
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, cabinetAreaTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), cabinetAreaTopY, 0.001]]}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, topY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), topY, 0.001]]}
                color="#666666"
                lineWidth={1}
              />
            </>
          );
        })()}
      </group>
      

      {/* 가구별 실시간 치수선 및 가이드 (가구가 배치된 경우에만 표시) */}
      {placedModules.length > 0 && placedModules.map((module, index) => {
        const moduleData = getModuleById(
          module.moduleId,
          { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
          spaceInfo
        );
        
        if (!moduleData) return null;
        
        const moduleWidth = mmToThreeUnits(moduleData.dimensions.width);
        const leftX = module.position.x - moduleWidth / 2;
        const rightX = module.position.x + moduleWidth / 2;
        const dimY = topDimensionY - mmToThreeUnits(120); // 상단 전체 치수 아래 위치 (간격 증가)
        
        // 듀얼 가구인지 확인 (이름에 'dual' 포함)
        const isDualModule = moduleData.id.includes('dual');
        
        // 섹션 구조 가져오기
        const leftSections = isDualModule ? 
          (moduleData.modelConfig?.leftSections || moduleData.modelConfig?.sections || []) :
          (moduleData.modelConfig?.sections || []);
        const rightSections = isDualModule ? 
          (moduleData.modelConfig?.rightSections || moduleData.modelConfig?.sections || []) :
          [];
        
        // 듀얼 가구의 경우 좌우 폭 계산
        let leftWidth, rightWidth;
        if (isDualModule) {
          if (moduleData.modelConfig?.rightAbsoluteWidth) {
            rightWidth = moduleData.modelConfig.rightAbsoluteWidth;
            leftWidth = moduleData.dimensions.width - rightWidth;
          } else {
            // 50:50 분할
            leftWidth = moduleData.dimensions.width / 2;
            rightWidth = moduleData.dimensions.width / 2;
          }
        } else {
          leftWidth = moduleData.dimensions.width;
          rightWidth = 0;
        }
        
        const leftThreeWidth = mmToThreeUnits(leftWidth);
        const rightThreeWidth = mmToThreeUnits(rightWidth);
        
        return (
          <group key={`module-guide-${index}`} renderOrder={999999}>
            {/* 가구 좌측 가이드라인 (점선) - 캐비넷 하단부터 시작 */}
            <Line
              points={[[leftX, spaceHeight, 0.001], [leftX, spaceHeight, 0.001]]}
              color="#cccccc"
              lineWidth={1}
              dashed
              dashSize={0.02}
              gapSize={0.01}
              renderOrder={999999}
            />
            
            {/* 가구 우측 가이드라인 (점선) - 캐비넷 하단부터 시작 */}
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, spaceHeight, 0.001]]}
              color="#cccccc"
              lineWidth={1}
              dashed
              dashSize={0.02}
              gapSize={0.01}
              renderOrder={999999}
            />
            
            {/* 가구 치수선 */}
            <Line
              points={[[leftX, dimY, 0.002], [rightX, dimY, 0.002]]}
              color="#666666"
              lineWidth={1}
              renderOrder={999999}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftX, dimY, 0.002], [leftX + 0.02, dimY, 0.002], 0.01)}
              color="#666666"
              lineWidth={1}
              renderOrder={999999}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([rightX, dimY, 0.002], [rightX - 0.02, dimY, 0.002], 0.01)}
              color="#666666"
              lineWidth={1}
              renderOrder={999999}
            />
            
            {/* 가구 치수 텍스트 - Text 사용 */}
            <Text
              position={[module.position.x, dimY - mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color="#666666"
              anchorX="center"
              anchorY="middle"
              renderOrder={999999}
            >
              {moduleData.dimensions.width}
            </Text>
            
            
            {/* 연장선 - 하부 프레임에서 전체 가로 치수 보조선까지 확장 */}
            <Line
              points={[[leftX, spaceHeight, 0.001], [leftX, topDimensionY + mmToThreeUnits(20), 0.001]]}
              color="#666666"
              lineWidth={1}
              renderOrder={999999}
            />
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, topDimensionY + mmToThreeUnits(20), 0.001]]}
              color="#666666"
              lineWidth={1}
              renderOrder={999999}
            />
          </group>
        );
      })}
        </>
      )}
    </group>
  );

  // 좌측뷰 치수선 - Room.tsx와 정확히 동일한 좌표계 사용
  const renderLeftView = () => {
    if (viewDirection !== 'left') return null;
    
    // Room.tsx와 동일한 계산 - 실제 spaceInfo 값 사용
    const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이 사용
    const furnitureDepthMm = 600; // 가구 공간 깊이는 고정
    const panelDepth = mmToThreeUnits(panelDepthMm);
    const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    
    // Room.tsx와 완전히 동일한 Z 오프셋 계산
    const spaceZOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
    const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2; // 가구/프레임용
    
    // 실제 공간 크기 (Room.tsx와 동일)
    const actualSpaceWidth = mmToThreeUnits(spaceInfo.width);
    const actualSpaceHeight = mmToThreeUnits(spaceInfo.height);
    
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    
    return (
      <group>
        {/* 상단 전체 깊이 치수선 - 좌측뷰에서는 항상 표시 */}
        {(currentViewDirection === 'left' || placedModules.filter(m => m.position.x < 0).length === 0) && (
          <group>
            {/* 치수선 */}
            <Line
              points={[[0, actualSpaceHeight + mmToThreeUnits(200), furnitureZOffset - furnitureDepth/2], [0, actualSpaceHeight + mmToThreeUnits(200), furnitureZOffset + furnitureDepth/2]]}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([0, actualSpaceHeight + mmToThreeUnits(200), furnitureZOffset - furnitureDepth/2], [0, actualSpaceHeight + mmToThreeUnits(200), furnitureZOffset - furnitureDepth/2 + 0.05])}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([0, actualSpaceHeight + mmToThreeUnits(200), furnitureZOffset + furnitureDepth/2], [0, actualSpaceHeight + mmToThreeUnits(200), furnitureZOffset + furnitureDepth/2 - 0.05])}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 전체 깊이 치수 텍스트 */}
            <Text
              position={[0, actualSpaceHeight + mmToThreeUnits(240), furnitureZOffset]}
              fontSize={largeFontSize}
              color="black"
              anchorX="center"
              anchorY="middle"
            >
              {panelDepthMm}
            </Text>
            
            {/* 연장선 (앞면) */}
            <Line
              points={[[0, 0, furnitureZOffset + furnitureDepth/2], [0, actualSpaceHeight + mmToThreeUnits(220), furnitureZOffset + furnitureDepth/2]]}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 연장선 (뒷면) */}
            <Line
              points={[[0, 0, furnitureZOffset - furnitureDepth/2], [0, actualSpaceHeight + mmToThreeUnits(220), furnitureZOffset - furnitureDepth/2]]}
              color="#666666"
              lineWidth={1}
            />
          </group>
        )}

        {/* 앞쪽 프레임 깊이 치수선 */}
        <group>
          {(() => {
            // 앞쪽 프레임 두께 (도어 두께 + 여백)
            const frontFrameThickness = 30; // mm
            const dimY = actualSpaceHeight + mmToThreeUnits(80);
            const frontFrameStart = furnitureZOffset + furnitureDepth/2;
            const frontFrameEnd = frontFrameStart + mmToThreeUnits(frontFrameThickness);
            
            return (
              <>
                {/* 치수선 */}
                <Line
                  points={[[0, dimY, frontFrameStart], [0, dimY, frontFrameEnd]]}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 화살표들 */}
                <Line
                  points={createArrowHead([0, dimY, frontFrameStart], [0, dimY, frontFrameStart + 0.02], 0.01)}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([0, dimY, frontFrameEnd], [0, dimY, frontFrameEnd - 0.02], 0.01)}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 치수 텍스트 */}
                <Text
                  position={[0, dimY + mmToThreeUnits(40), (frontFrameStart + frontFrameEnd) / 2]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                >
                  {frontFrameThickness}
                </Text>

                {/* 연장선들 */}
                <Line
                  points={[[0, 0, frontFrameStart], [0, dimY + mmToThreeUnits(20), frontFrameStart]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, 0, frontFrameEnd], [0, dimY + mmToThreeUnits(20), frontFrameEnd]]}
                  color="#666666"
                  lineWidth={1}
                />
              </>
            );
          })()}
        </group>

        {/* 뒤쪽 프레임 깊이 치수선 */}
        <group>
          {(() => {
            // 뒤쪽 프레임 두께
            const backFrameThickness = (panelDepthMm - furnitureDepthMm) / 2; // mm
            const dimY = actualSpaceHeight + mmToThreeUnits(80);
            const backFrameStart = spaceZOffset;
            const backFrameEnd = furnitureZOffset - furnitureDepth/2;
            
            return (
              <>
                {/* 치수선 */}
                <Line
                  points={[[0, dimY, backFrameStart], [0, dimY, backFrameEnd]]}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 화살표들 */}
                <Line
                  points={createArrowHead([0, dimY, backFrameStart], [0, dimY, backFrameStart + 0.02], 0.01)}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([0, dimY, backFrameEnd], [0, dimY, backFrameEnd - 0.02], 0.01)}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 치수 텍스트 */}
                <Text
                  position={[0, dimY + mmToThreeUnits(40), (backFrameStart + backFrameEnd) / 2]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                >
                  {Math.round(backFrameThickness)}
                </Text>

                {/* 연장선들 */}
                <Line
                  points={[[0, 0, backFrameStart], [0, dimY + mmToThreeUnits(20), backFrameStart]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, 0, backFrameEnd], [0, dimY + mmToThreeUnits(20), backFrameEnd]]}
                  color="#666666"
                  lineWidth={1}
                />
              </>
            );
          })()}
        </group>

        {/* 캐비넷 배치 영역의 실제 깊이 치수선 */}
        <group>
          {(() => {
            const dimY = actualSpaceHeight + mmToThreeUnits(140);
            const cabinetDepthStart = furnitureZOffset - furnitureDepth/2;
            const cabinetDepthEnd = furnitureZOffset + furnitureDepth/2;
            
            return (
              <>
                {/* 치수선 */}
                <Line
                  points={[[0, dimY, cabinetDepthStart], [0, dimY, cabinetDepthEnd]]}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 화살표들 */}
                <Line
                  points={createArrowHead([0, dimY, cabinetDepthStart], [0, dimY, cabinetDepthStart + 0.03], 0.015)}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([0, dimY, cabinetDepthEnd], [0, dimY, cabinetDepthEnd - 0.03], 0.015)}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 치수 텍스트 */}
                <Text
                  position={[0, dimY + mmToThreeUnits(40), furnitureZOffset]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                >
                  {furnitureDepthMm}
                </Text>

                {/* 연장선들 */}
                <Line
                  points={[[0, 0, cabinetDepthStart], [0, dimY + mmToThreeUnits(20), cabinetDepthStart]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, 0, cabinetDepthEnd], [0, dimY + mmToThreeUnits(20), cabinetDepthEnd]]}
                  color="#666666"
                  lineWidth={1}
                />
              </>
            );
          })()}
        </group>
        
        {/* 좌측 전체 높이 치수선 */}
        <group>
          {/* 치수선 */}
          <Line
            points={[[0, 0, spaceZOffset - mmToThreeUnits(200)], [0, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrowHead([0, 0, spaceZOffset - mmToThreeUnits(200)], [0, 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrowHead([0, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [0, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 전체 높이 치수 텍스트 */}
          <Text
            position={[0, actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(240)]}
            fontSize={largeFontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, -Math.PI / 2]}
          >
            {spaceInfo.height}
          </Text>
          
          {/* 연장선 (하단) */}
          <Line
            points={[[0, 0, spaceZOffset], [0, 0, spaceZOffset - mmToThreeUnits(220)]]}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 연장선 (상단) */}
          <Line
            points={[[0, spaceHeight, spaceZOffset], [0, spaceHeight, spaceZOffset - mmToThreeUnits(220)]]}
            color="#666666"
            lineWidth={1}
          />
        </group>

        {/* 우측 3구간 높이 치수선 (상부프레임 + 캐비넷배치영역 + 하부프레임) */}
        <group>
          {(() => {
            const rightDimensionZ = spaceZOffset + panelDepth + mmToThreeUnits(120); // 우측 치수선 위치
            const topFrameHeight = frameSize.top; // 상부 프레임 높이
            const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0; // 하부 프레임 높이 (받침대가 있는 경우만)
            const cabinetPlacementHeight = spaceInfo.height - topFrameHeight - bottomFrameHeight; // 캐비넷 배치 영역
            
            const bottomY = 0; // 바닥
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight); // 하부 프레임 상단
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
            const topY = actualSpaceHeight; // 최상단
            
            return (
              <>
                {/* 1. 하부 프레임 높이 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                  <group>
                    <Line
                      points={[[0, bottomY, rightDimensionZ], [0, bottomFrameTopY, rightDimensionZ]]}
                      color="#666666"
                      lineWidth={1}
                    />
                    <Line
                      points={createArrowHead([0, bottomY, rightDimensionZ], [0, 0.03, rightDimensionZ])}
                      color="#666666"
                      lineWidth={1}
                    />
                    <Line
                      points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY - 0.03, rightDimensionZ])}
                      color="#666666"
                      lineWidth={1}
                    />
                    <Text
                      position={[0, mmToThreeUnits(bottomFrameHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                      fontSize={baseFontSize}
                      color="black"
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, -Math.PI / 2]}
                    >
                      {bottomFrameHeight}
                    </Text>
                  </group>
                )}
                
                {/* 2. 캐비넷 배치 높이 */}
                <group>
                  <Line
                    points={[[0, bottomFrameTopY, rightDimensionZ], [0, cabinetAreaTopY, rightDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY + 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY - 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[0, bottomFrameTopY + mmToThreeUnits(cabinetPlacementHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {cabinetPlacementHeight}
                  </Text>
                </group>
                
                {/* 3. 상부 프레임 높이 */}
                <group>
                  <Line
                    points={[[0, cabinetAreaTopY, rightDimensionZ], [0, topY, rightDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY + 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, topY, rightDimensionZ], [0, topY - 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[0, cabinetAreaTopY + mmToThreeUnits(topFrameHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                  </Text>
                </group>

                {/* 연장선들 */}
                <Line
                  points={[[0, bottomY, spaceZOffset], [0, bottomY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color="#666666"
                  lineWidth={1}
                />
                {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                  <Line
                    points={[[0, bottomFrameTopY, spaceZOffset], [0, bottomFrameTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                    color="#666666"
                    lineWidth={1}
                  />
                )}
                <Line
                  points={[[0, cabinetAreaTopY, spaceZOffset], [0, cabinetAreaTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, topY, spaceZOffset], [0, topY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color="#666666"
                  lineWidth={1}
                />
              </>
            );
          })()}
        </group>

        {/* 우측 3구간 높이 치수선 */}
        <group>
          {(() => {
            const rightDimensionZ = spaceZOffset + panelDepth + mmToThreeUnits(3);
            const topFrameHeight = frameSize.top;
            const bottomFrameHeight = spaceInfo.baseConfig?.height || 65;
            const cabinetPlacementHeight = spaceInfo.height - topFrameHeight - bottomFrameHeight;
            
            const bottomY = 0;
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight);
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight);
            const topY = spaceHeight;
            
            return (
              <>
                {/* 1. 하부 프레임 높이 */}
                <group>
                  <Line
                    points={[[0, bottomY, rightDimensionZ], [0, bottomFrameTopY, rightDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomY, rightDimensionZ], [0, 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY - 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[mmToThreeUnits(40), mmToThreeUnits(bottomFrameHeight / 2), rightDimensionZ]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {bottomFrameHeight}
                  </Text>
                </group>
                
                {/* 2. 캐비넷 배치 높이 */}
                <group>
                  <Line
                    points={[[0, bottomFrameTopY, rightDimensionZ], [0, cabinetAreaTopY, rightDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY + 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY - 0.03, rightDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[mmToThreeUnits(40), mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight / 2), rightDimensionZ]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {cabinetPlacementHeight}
                  </Text>
                </group>
                
                {/* 3. 상부 프레임 높이 */}
                <group>
                  <Line
                    points={[[0, cabinetAreaTopY, rightDimensionZ], [0, topY, rightDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY + 0.02, rightDimensionZ], 0.01)}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, topY, rightDimensionZ], [0, topY - 0.02, rightDimensionZ], 0.01)}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[mmToThreeUnits(40), mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight + topFrameHeight / 2), rightDimensionZ]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                  </Text>
                </group>
                
                {/* 연장선들 (가구 후면에서 치수선까지) */}
                <Line
                  points={[[0, bottomY, furnitureZOffset + furnitureDepth/2], [0, bottomY, rightDimensionZ - mmToThreeUnits(10)]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, bottomFrameTopY, furnitureZOffset + furnitureDepth/2], [0, bottomFrameTopY, rightDimensionZ - mmToThreeUnits(10)]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, cabinetAreaTopY, furnitureZOffset + furnitureDepth/2], [0, cabinetAreaTopY, rightDimensionZ - mmToThreeUnits(10)]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[0, topY, furnitureZOffset + furnitureDepth/2], [0, topY, rightDimensionZ - mmToThreeUnits(10)]]}
                  color="#666666"
                  lineWidth={1}
                />
              </>
            );
          })()}
        </group>
        
        {/* 가구별 치수선 (좌측뷰에서는 깊이 치수) - 좌측뷰에서는 모든 가구 표시 */}
        {placedModules.length > 0 && placedModules
          .filter((module) => {
            // 좌측뷰에서는 모든 가구 표시, 다른 뷰에서는 좌측 배치 가구만
            return currentViewDirection === 'left' || module.position.x < 0;
          })
          .map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData) return null;
          
          // 실제 가구 깊이와 위치 계산 (FurnitureItem.tsx와 동일)
          const actualDepth = module.customDepth || moduleData.dimensions.depth;
          const moduleDepth = mmToThreeUnits(actualDepth);
          
          // 실제 가구 Z 위치 계산 (FurnitureItem.tsx와 동일)
          const doorThickness = mmToThreeUnits(20);
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;
          const furnitureBackZ = furnitureZ - moduleDepth/2;
          const furnitureFrontZ = furnitureZ + moduleDepth/2;
          
          // 치수선은 가구의 X 위치에 표시
          const dimY = spaceHeight + mmToThreeUnits(200);
          const furnitureX = module.position.x;
          
          return (
            <group key={`left-module-dim-${index}`}>
              {/* 가구 깊이 치수선 */}
              <Line
                points={[[furnitureX, dimY, furnitureBackZ], [furnitureX, dimY, furnitureFrontZ]]}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureBackZ], [furnitureX, dimY, furnitureBackZ + 0.02], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureFrontZ], [furnitureX, dimY, furnitureFrontZ - 0.02], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 치수 텍스트 */}
              <Text
                position={[furnitureX, dimY + mmToThreeUnits(40), (furnitureBackZ + furnitureFrontZ) / 2]}
                fontSize={baseFontSize}
                color="black"
                anchorX="center"
                anchorY="middle"
              >
                {actualDepth}
              </Text>

              {/* 연장선 (가구 상단에서 치수선까지 긴 보조선) */}
              <Line
                points={[[furnitureX, actualSpaceHeight + mmToThreeUnits(30), furnitureBackZ], [furnitureX, dimY + mmToThreeUnits(50), furnitureBackZ]]}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={[[furnitureX, actualSpaceHeight + mmToThreeUnits(30), furnitureFrontZ], [furnitureX, dimY + mmToThreeUnits(50), furnitureFrontZ]]}
                color="#666666"
                lineWidth={1}
              />
            </group>
          );
        })}
        
        {/* 좌측뷰 전용: 가로 폭 치수선 추가 */}
        <group>
          {/* 상단 전체 폭 치수선 */}
          <Line
            points={[[-actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0], [actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0]]}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 좌측 화살표 */}
          <Line
            points={createArrowHead([-actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0], [-actualSpaceWidth/2 + 0.05, actualSpaceHeight + mmToThreeUnits(100), 0])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 우측 화살표 */}
          <Line
            points={createArrowHead([actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0], [actualSpaceWidth/2 - 0.05, actualSpaceHeight + mmToThreeUnits(100), 0])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 전체 폭 치수 텍스트 */}
          <Text
            position={[0, actualSpaceHeight + mmToThreeUnits(140), 0]}
            fontSize={largeFontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {spaceInfo.width}
          </Text>
          
          {/* 연장선들 */}
          <Line
            points={[[-actualSpaceWidth/2, 0, 0], [-actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(120), 0]]}
            color="#666666"
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth/2, 0, 0], [actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(120), 0]]}
            color="#666666"
            lineWidth={1}
          />
        </group>
      </group>
    );
  };

  // 우측뷰 치수선 - 객체 좌표계와 맞춤
  const renderRightView = () => {
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth);
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topDimensionY = spaceHeight + mmToThreeUnits(hasPlacedModules ? 280 : 200);
    const rightDimensionZ = -mmToThreeUnits(200);
    
    // 우측뷰에서는 Z축이 가로(깊이), Y축이 세로(높이)
    // 공간은 Z축 중심에서 -depth/2 ~ +depth/2로 배치됨
    const spaceZOffset = -spaceDepth / 2;
    
    return (
      <group>
        {/* 상단 전체 깊이 치수선 */}
        <group>
          <Line
            points={[[spaceWidth, topDimensionY, spaceZOffset], [spaceWidth, topDimensionY, spaceZOffset + spaceDepth]]}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 전면 화살표 */}
          <Line
            points={createArrowHead([spaceWidth, topDimensionY, spaceZOffset], [spaceWidth, topDimensionY, spaceZOffset + 0.05])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 후면 화살표 */}
          <Line
            points={createArrowHead([spaceWidth, topDimensionY, spaceZOffset + spaceDepth], [spaceWidth, topDimensionY, spaceZOffset + spaceDepth - 0.05])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 전체 깊이 치수 텍스트 */}
          <Text
            position={[spaceWidth, topDimensionY + mmToThreeUnits(40), spaceZOffset + spaceDepth / 2]}
            fontSize={largeFontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
          >
            {spaceInfo.depth}
          </Text>
          
          {/* 연장선 (가구 우측면에서 조금 떨어진 위치에서 시작) */}
          <Line
            points={[[spaceWidth, 0, spaceZOffset], [spaceWidth, topDimensionY + mmToThreeUnits(20), spaceZOffset]]}
            color="#666666"
            lineWidth={1}
          />
          <Line
            points={[[spaceWidth, 0, spaceZOffset + spaceDepth], [spaceWidth, topDimensionY + mmToThreeUnits(20), spaceZOffset + spaceDepth]]}
            color="#666666"
            lineWidth={1}
          />
        </group>
        
        {/* 우측 전체 높이 치수선 */}
        <group>
          <Line
            points={[[spaceWidth, 0, rightDimensionZ], [spaceWidth, spaceHeight, rightDimensionZ]]}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrowHead([spaceWidth, 0, rightDimensionZ], [spaceWidth, 0.05, rightDimensionZ])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrowHead([spaceWidth, spaceHeight, rightDimensionZ], [spaceWidth, spaceHeight - 0.05, rightDimensionZ])}
            color="#666666"
            lineWidth={1}
          />
          
          {/* 전체 높이 치수 텍스트 */}
          <Text
            position={[spaceWidth, spaceHeight / 2, rightDimensionZ - mmToThreeUnits(60)]}
            fontSize={largeFontSize}
            color="black"
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, -Math.PI / 2]}
          >
            {spaceInfo.height}
          </Text>
          
          {/* 연장선 (가구 우측면에서 조금 떨어진 위치에서 시작) */}
          <Line
            points={[[spaceWidth, 0, spaceZOffset], [spaceWidth, 0, rightDimensionZ - mmToThreeUnits(20)]]}
            color="#666666"
            lineWidth={1}
          />
          <Line
            points={[[spaceWidth, spaceHeight, spaceZOffset], [spaceWidth, spaceHeight, rightDimensionZ - mmToThreeUnits(20)]]}
            color="#666666"
            lineWidth={1}
          />
        </group>

        {/* 좌측 3구간 높이 치수선 */}
        <group>
          {(() => {
            const leftDimensionZ = spaceZOffset + spaceDepth + mmToThreeUnits(120);
            const topFrameHeight = frameSize.top;
            const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
            const cabinetPlacementHeight = spaceInfo.height - topFrameHeight - bottomFrameHeight;
            
            const bottomY = 0;
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight);
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight);
            const topY = spaceHeight;
            
            return (
              <>
                {/* 1. 하부 프레임 높이 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                  <group>
                    <Line
                      points={[[spaceWidth, bottomY, leftDimensionZ], [spaceWidth, bottomFrameTopY, leftDimensionZ]]}
                      color="#666666"
                      lineWidth={1}
                    />
                    <Line
                      points={createArrowHead([spaceWidth, bottomY, leftDimensionZ], [spaceWidth, 0.03, leftDimensionZ])}
                      color="#666666"
                      lineWidth={1}
                    />
                    <Line
                      points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY - 0.03, leftDimensionZ])}
                      color="#666666"
                      lineWidth={1}
                    />
                    <Text
                      position={[spaceWidth, mmToThreeUnits(bottomFrameHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                      fontSize={baseFontSize}
                      color="black"
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, -Math.PI / 2]}
                    >
                      {bottomFrameHeight}
                    </Text>
                  </group>
                )}
                
                {/* 2. 캐비넷 배치 높이 */}
                <group>
                  <Line
                    points={[[spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY, leftDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY + 0.03, leftDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY - 0.03, leftDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[spaceWidth, mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {cabinetPlacementHeight}
                  </Text>
                </group>
                
                {/* 3. 상부 프레임 높이 */}
                <group>
                  <Line
                    points={[[spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, topY, leftDimensionZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY + 0.03, leftDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topY, leftDimensionZ], [spaceWidth, topY - 0.03, leftDimensionZ])}
                    color="#666666"
                    lineWidth={1}
                  />
                  <Text
                    position={[spaceWidth, mmToThreeUnits(spaceInfo.height - topFrameHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color="black"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                  </Text>
                </group>
                
                {/* 연장선들 */}
                <Line
                  points={[[spaceWidth, bottomY, spaceZOffset + spaceDepth], [spaceWidth, bottomY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color="#666666"
                  lineWidth={1}
                />
                {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                  <Line
                    points={[[spaceWidth, bottomFrameTopY, spaceZOffset + spaceDepth], [spaceWidth, bottomFrameTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                    color="#666666"
                    lineWidth={1}
                  />
                )}
                <Line
                  points={[[spaceWidth, cabinetAreaTopY, spaceZOffset + spaceDepth], [spaceWidth, cabinetAreaTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={[[spaceWidth, topY, spaceZOffset + spaceDepth], [spaceWidth, topY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color="#666666"
                  lineWidth={1}
                />
              </>
            );
          })()}
        </group>
        
        {/* 가구별 치수선 (우측뷰에서는 깊이 치수) */}
        {placedModules.length > 0 && placedModules.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData) return null;
          
          const actualDepth = module.customDepth || moduleData.dimensions.depth;
          const moduleDepth = mmToThreeUnits(actualDepth);
          const dimY = topDimensionY - mmToThreeUnits(120);
          
          return (
            <group key={`right-module-dim-${index}`}>
              {/* 가구 깊이 치수선 */}
              <Line
                points={[[spaceWidth, dimY, spaceZOffset], [spaceWidth, dimY, spaceZOffset + moduleDepth]]}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([spaceWidth, dimY, spaceZOffset], [spaceWidth, dimY, spaceZOffset + 0.02], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={createArrowHead([spaceWidth, dimY, spaceZOffset + moduleDepth], [spaceWidth, dimY, spaceZOffset + moduleDepth - 0.02], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 치수 텍스트 */}
              <Text
                position={[spaceWidth, dimY - mmToThreeUnits(30), spaceZOffset + moduleDepth / 2]}
                fontSize={baseFontSize}
                color="#666666"
                anchorX="center"
                anchorY="middle"
              >
                {actualDepth}
              </Text>

              {/* 연장선 (가구에서 치수선까지 긴 보조선) */}
              <Line
                points={[[spaceWidth, spaceHeight, spaceZOffset], [spaceWidth, dimY + mmToThreeUnits(30), spaceZOffset]]}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={[[spaceWidth, spaceHeight, spaceZOffset + moduleDepth], [spaceWidth, dimY + mmToThreeUnits(30), spaceZOffset + moduleDepth]]}
                color="#666666"
                lineWidth={1}
              />
            </group>
          );
        })}
      </group>
    );
  };

  // 상단뷰 치수선 - 객체 좌표계와 맞춤 (상부 프레임 가로길이, 좌우 프레임 폭, 캐비넷 폭만 표시)
  const renderTopView = () => {
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth);
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topDimensionZ = -mmToThreeUnits(hasPlacedModules ? 200 : 150);
    
    // 상단뷰에서는 X축이 가로(폭), Z축이 세로(깊이)  
    // 공간은 중앙에서 -width/2 ~ +width/2, -depth/2 ~ +depth/2로 배치됨
    const spaceXOffset = -spaceWidth / 2;
    const spaceZOffset = -spaceDepth / 2;
    
    return (
      <group>
        {/* 탑뷰 치수선들 - 좌측면도가 아닐 때만 표시 */}
        {viewDirection !== 'left' && (
          <>
        {/* 상단 전체 폭 치수선 (상부 프레임의 가로 길이) - 외부로 이동 */}
        <group>
          {(() => {
            // 전체 가로 치수선을 캐비넷 외부(앞쪽)로 이동
            const mainDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 200 : 150);
            
            return (
              <>
                <Line
                  points={[[spaceXOffset, spaceHeight, mainDimZ], [spaceXOffset + spaceWidth, spaceHeight, mainDimZ]]}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 좌측 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset, spaceHeight, mainDimZ], [spaceXOffset + 0.05, spaceHeight, mainDimZ])}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 우측 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, mainDimZ], [spaceXOffset + spaceWidth - 0.05, spaceHeight, mainDimZ])}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 전체 폭 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[0, spaceHeight + 0.1, mainDimZ - mmToThreeUnits(40)]}
                  fontSize={largeFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {spaceInfo.width}
                </Text>
                
                {/* 연장선 - 좌우 프레임 앞쪽으로 더 연장 */}
                {(() => {
                  // 프레임 앞선 위치 계산 - 더 앞쪽으로 연장
                  const panelDepthMm = 1500;
                  const furnitureDepthMm = 600;
                  const panelDepth = mmToThreeUnits(panelDepthMm);
                  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                  const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
                  const frameZ = furnitureZOffset + furnitureDepth/2; // 30mm 더 앞으로 (- 30mm 제거)
                  
                  return (
                    <>
                      <Line
                        points={[
                          [spaceXOffset, spaceHeight, frameZ], 
                          [spaceXOffset, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color="#666666"
                        lineWidth={1}
                      />
                      <Line
                        points={[
                          [spaceXOffset + spaceWidth, spaceHeight, frameZ], 
                          [spaceXOffset + spaceWidth, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color="#666666"
                        lineWidth={1}
                      />
                    </>
                  );
                })()}
              </>
            );
          })()}
        </group>
        
        {/* 좌측 프레임 폭 치수선 - 외부로 이동 */}
        <group>
          {(() => {
            const frameDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 80 : 60);
            
            return (
              <>
                <Line
                  points={[[spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(frameSize.left), spaceHeight, frameDimZ]]}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 좌측 프레임 화살표들 */}
                <Line
                  points={createArrowHead([spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + 0.02, spaceHeight, frameDimZ])}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([spaceXOffset + mmToThreeUnits(frameSize.left), spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(frameSize.left) - 0.02, spaceHeight, frameDimZ])}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 좌측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[spaceXOffset + mmToThreeUnits(frameSize.left / 2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {frameSize.left}
                </Text>
              </>
            );
          })()}
        </group>
        
        {/* 우측 프레임 폭 치수선 - 외부로 이동 */}
        <group>
          {(() => {
            const frameDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 80 : 60);
            
            return (
              <>
                <Line
                  points={[[spaceXOffset + spaceWidth - mmToThreeUnits(frameSize.right), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth, spaceHeight, frameDimZ]]}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 우측 프레임 화살표들 */}
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth - mmToThreeUnits(frameSize.right), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - mmToThreeUnits(frameSize.right) + 0.02, spaceHeight, frameDimZ])}
                  color="#666666"
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - 0.02, spaceHeight, frameDimZ])}
                  color="#666666"
                  lineWidth={1}
                />
                
                {/* 우측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[spaceXOffset + spaceWidth - mmToThreeUnits(frameSize.right / 2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                  fontSize={baseFontSize}
                  color="black"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {frameSize.right}
                </Text>
              </>
            );
          })()}
        </group>
        
        {/* 뒷벽과 좌우 벽 실선 표시 */}
        <group>
          {/* 뒷벽 (정면 반대쪽, Z=0 근처) */}
          <Line
            points={[[spaceXOffset, spaceHeight, spaceZOffset], [spaceXOffset + spaceWidth, spaceHeight, spaceZOffset]]}
            color="#999999"
            lineWidth={1}
          />
          
          {/* 좌측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset, spaceHeight, spaceZOffset], [spaceXOffset, spaceHeight, spaceZOffset + spaceDepth]]}
            color="#999999"
            lineWidth={1}
          /> */}
          
          {/* 우측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset + spaceWidth, spaceHeight, spaceZOffset], [spaceXOffset + spaceWidth, spaceHeight, spaceZOffset + spaceDepth]]}
            color="#999999"
            lineWidth={1}
          /> */}
        </group>

              {/* 좌측 치수선 - 좌측 프레임 앞면부터 가구 가장 뒷면까지 거리 */}
      {placedModules.length > 0 && (() => {
        // 모든 배치된 가구 중에서 가장 깊은 가구 찾기
        let deepestBackZ = Infinity;
        let deepestFurnitureRightX = spaceXOffset;
        
        placedModules.forEach((module) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData || !moduleData.dimensions) {
            return;
          }
          
          // 실제 깊이 정보
          const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
          const moduleWidthMm = moduleData.dimensions.width;
          
          const moduleWidth = mmToThreeUnits(moduleWidthMm);
          const rightX = module.position.x + moduleWidth / 2;
          
          // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산
          const panelDepthMm = 1500;
          const furnitureDepthMm = 600;
          const doorThicknessMm = 20;
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          const depth = mmToThreeUnits(actualDepthMm);
          
          // FurnitureItem.tsx와 동일한 계산
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
          const furnitureBackZ = furnitureZ - depth/2;
          
          // 가장 뒤쪽에 있는 가구 찾기 (Z값이 가장 작은 것)
          if (furnitureBackZ < deepestBackZ) {
            deepestBackZ = furnitureBackZ;
            deepestFurnitureRightX = rightX;
          }
        });
        
        if (deepestBackZ === Infinity) {
          return null;
        }
        
        // 좌측 프레임 내측면 위치 계산
        const panelDepthMm = 1500;
        const furnitureDepthMm = 600;
        const doorThicknessMm = 20;
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const doorThickness = mmToThreeUnits(doorThicknessMm);
        const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
        const leftFrameInnerZ = furnitureZOffset + furnitureDepth / 2 - doorThickness - mmToThreeUnits(30);
        
        // 실제 거리 계산 (mm 단위)
        const distanceMm = Math.round((leftFrameInnerZ - deepestBackZ) / 0.01);
        const leftDimensionX = spaceXOffset - mmToThreeUnits(200);
        
        return (
          <group key="left-frame-to-furniture-dimension">
            {/* 치수선 */}
            <Line
              points={[[leftDimensionX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, leftFrameInnerZ]]}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 화살표들 */}
            <Line
              points={createArrowHead([leftDimensionX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestBackZ + 0.02], 0.01)}
              color="#666666"
              lineWidth={1}
            />
            <Line
              points={createArrowHead([leftDimensionX, spaceHeight, leftFrameInnerZ], [leftDimensionX, spaceHeight, leftFrameInnerZ - 0.02], 0.01)}
              color="#666666"
              lineWidth={1}
            />
            
            {/* 거리 텍스트 */}
            <Text
              position={[leftDimensionX - mmToThreeUnits(40), spaceHeight + 0.1, (deepestBackZ + leftFrameInnerZ) / 2]}
              fontSize={baseFontSize}
              color="#666666"
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {distanceMm}
            </Text>

            {/* 연장선들 - 실제 가구의 정확한 위치에서 치수선까지 */}
            <Line
              points={[[deepestFurnitureRightX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestBackZ]]}
              color="#666666"
              lineWidth={1}
            />
            {/* 좌측 프레임 내측면 연장선 - 공간 벽에서 치수선까지 */}
            <Line
              points={[[spaceXOffset, spaceHeight, leftFrameInnerZ], [leftDimensionX, spaceHeight, leftFrameInnerZ]]}
              color="#666666"
              lineWidth={1}
            />
          </group>
        );
      })()}

        {/* 기존 복잡한 좌측 치수선 주석 처리 */}
        {false && placedModules.length > 0 && (
          <group>
            {(() => {
              const leftDimensionX = spaceXOffset - mmToThreeUnits(200);
              
              // 디버깅을 위한 로그
              console.log('🔍 [상단뷰 치수] 배치된 가구들:', placedModules.map(m => ({
                id: m.id,
                moduleId: m.moduleId,
                customDepth: m.customDepth,
                position: m.position
              })));
              
              // 모든 배치된 가구의 실제 앞면과 뒷면 위치를 계산하여 최대 범위 찾기
              let minBackZ = Infinity;
              let maxFrontZ = -Infinity;
              
              placedModules.forEach(module => {
                const moduleData = getModuleById(
                  module.moduleId,
                  { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                  spaceInfo
                );
                
                if (!moduleData) {
                  console.log('❌ [상단뷰 치수] 모듈 데이터 없음:', module.moduleId);
                  return;
                }
                
                const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
                console.log(`📏 [상단뷰 치수] 가구 ${module.id}:`);
                console.log(`  - moduleId: ${module.moduleId}`);
                console.log(`  - customDepth: ${module.customDepth}`);
                console.log(`  - moduleData.dimensions.depth: ${moduleData.dimensions.depth}`);
                console.log(`  - moduleData.defaultDepth: ${moduleData.defaultDepth}`);
                console.log(`  - 최종 사용 깊이: ${actualDepthMm}mm`);
                
                // 실제 가구 위치 계산 (FurnitureItem.tsx와 완전히 동일한 방식)
                const panelDepthMm = 1500; // 전체 공간 깊이
                const furnitureDepthMm = 600; // 가구 공간 깊이  
                const doorThicknessMm = 20;
                
                const panelDepth = mmToThreeUnits(panelDepthMm);
                const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                const doorThickness = mmToThreeUnits(doorThicknessMm);
                const depth = mmToThreeUnits(actualDepthMm);
                
                // FurnitureItem.tsx와 동일한 계산
                const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
                const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm
                const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
                
                // 가구의 앞면과 뒷면 계산
                const furnitureBackZ = furnitureZ - depth/2;
                const furnitureFrontZ = furnitureZ + depth/2;
                
                console.log(`📐 [상단뷰 치수] 가구 ${module.id}: 뒷면Z=${furnitureBackZ.toFixed(3)}, 앞면Z=${furnitureFrontZ.toFixed(3)}`);
                
                minBackZ = Math.min(minBackZ, furnitureBackZ);
                maxFrontZ = Math.max(maxFrontZ, furnitureFrontZ);
              });
              
              // 가장 깊은 가구의 실제 깊이를 먼저 계산
              let deepestModuleDepthMm = 0;
              
              // 가장 깊이가 깊은 가구 찾기 (보조선 연결용)
              let deepestModule = null;
              
              placedModules.forEach(module => {
                const moduleData = getModuleById(
                  module.moduleId,
                  { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                  spaceInfo
                );
                
                if (!moduleData) return;
                
                const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
                
                if (actualDepthMm > deepestModuleDepthMm) {
                  deepestModuleDepthMm = actualDepthMm;
                  deepestModule = module;
                }
              });
              
              // @ts-ignore
              console.log(`🏆 [상단뷰 치수] 가장 깊은 가구: ${deepestModule?.module?.id}, 깊이: ${deepestModuleDepthMm}mm`);
              
              // 좌측 프레임 앞면 위치 계산
              const panelDepthMm = 1500;
              const furnitureDepthMm = 600;
              const doorThicknessMm = 20;
              const frameThicknessMm = 20; // 프레임 두께
              
              const panelDepth = mmToThreeUnits(panelDepthMm);
              const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
              const doorThickness = mmToThreeUnits(doorThicknessMm);
              const frameThickness = mmToThreeUnits(frameThicknessMm);
              const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
              
              // 도어 앞면 위치
              const doorFrontZ = furnitureZOffset + (furnitureDepth + mmToThreeUnits(20)) / 2;
              // 좌측 프레임 앞면 위치 (도어 앞면에서 프레임 두께만큼 더 앞쪽)
              const leftFrameFrontZ = doorFrontZ + frameThickness;
              
              console.log(`🏠 [상단뷰 치수] spaceZOffset: ${spaceZOffset.toFixed(3)}`);
              console.log(`🏠 [상단뷰 치수] furnitureZOffset: ${furnitureZOffset.toFixed(3)}`);
              console.log(`🏠 [상단뷰 치수] doorFrontZ: ${doorFrontZ.toFixed(3)}`);
              
              // 가장 깊은 가구의 앞면과 뒷면 위치 계산
              let deepestModuleBackZ = spaceZOffset; // 기본값: 뒷벽
              let deepestModuleFrontZ = spaceZOffset; // 기본값: 뒷벽
              
              if (deepestModule && deepestModule.module) {
                const moduleData = getModuleById(
                  deepestModule.module.moduleId,
                  { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                  spaceInfo
                );
                
                if (moduleData?.dimensions) {
                  const actualDepthMm = deepestModule.module.customDepth || moduleData?.dimensions.depth || 0;
                  const depth = mmToThreeUnits(actualDepthMm);
                  
                  const panelDepth = mmToThreeUnits(1500);
                  const furnitureDepth = mmToThreeUnits(600);
                  const doorThickness = mmToThreeUnits(20);
                  const zOffset = -panelDepth / 2;
                  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
                  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
                  
                  deepestModuleBackZ = furnitureZ - depth/2; // 가장 깊은 가구의 뒷면
                  deepestModuleFrontZ = furnitureZ + depth/2; // 가장 깊은 가구의 앞면
                }
              }
              
              // 좌측 프레임 앞면에서 가장 깊은 가구 뒷면까지의 실제 거리 계산 (mm 단위)
              const actualDistanceMm = Math.round((leftFrameFrontZ - deepestModuleBackZ) / 0.01);
              
              console.log(`📏 [상단뷰 치수] 좌측 프레임 앞면 Z: ${leftFrameFrontZ.toFixed(3)}`);
              console.log(`📏 [상단뷰 치수] 가장 깊은 가구 뒷면 Z: ${deepestModuleBackZ.toFixed(3)}`);
              console.log(`📏 [상단뷰 치수] Z 차이: ${(leftFrameFrontZ - deepestModuleBackZ).toFixed(3)}`);
              console.log(`📏 [상단뷰 치수] 실제 거리: ${actualDistanceMm}mm`);
              
              return (
                <>
                  <Line
                    points={[[leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, leftFrameFrontZ]]}
                    color="#666666"
                    lineWidth={1}
                  />
                  
                  {/* 뒤쪽 화살표 (가구 뒷면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, deepestModuleBackZ + 0.05])}
                    color="#666666"
                    lineWidth={1}
                  />
                  
                  {/* 앞쪽 화살표 (좌측 프레임 앞면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, leftFrameFrontZ], [leftDimensionX, spaceHeight, leftFrameFrontZ - 0.05])}
                    color="#666666"
                    lineWidth={1}
                  />
                  
                  {/* 좌측 프레임 앞면에서 가장 깊은 가구 뒷면까지의 거리 표시 */}
                  <Text
                    position={[leftDimensionX - mmToThreeUnits(40), spaceHeight + 0.1, deepestModuleBackZ + (leftFrameFrontZ - deepestModuleBackZ) / 2]}
                    fontSize={baseFontSize}
                    color="#666666"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, Math.PI / 2]}
                  >
                    {actualDistanceMm}
                  </Text>
                  
                  {/* 연장선 - 좌측 프레임 앞면과 가장 깊은 가구 뒷면에서 시작 */}
                  {deepestModule && (
                    <>
                      {/* 가구 뒷면에서 치수선까지 */}
                      <Line
                        points={[[deepestModule.position.x, spaceHeight, deepestModuleBackZ], [leftDimensionX - mmToThreeUnits(20), spaceHeight, deepestModuleBackZ]]}
                        color="#666666"
                        lineWidth={1}
                      />
                      {/* 좌측 프레임 앞면에서 치수선까지 */}
                      <Line
                        points={[[spaceXOffset, spaceHeight, leftFrameFrontZ], [leftDimensionX - mmToThreeUnits(20), spaceHeight, leftFrameFrontZ]]}
                        color="#666666"
                        lineWidth={1}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </group>
        )}

        {/* 캐비넷별 폭 치수선 - 외부로 이동하고 정면처럼 표시 */}
        {placedModules.length > 0 && placedModules.map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData) return null;
          
          const moduleWidth = mmToThreeUnits(moduleData.dimensions.width);
          const leftX = module.position.x - moduleWidth / 2;
          const rightX = module.position.x + moduleWidth / 2;
          
          // 캐비넷 외부로 치수선 이동 (앞쪽으로)
          const dimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 120 : 80);
          
          return (
            <group key={`top-module-dim-${index}`}>
              {/* 캐비넷 폭 치수선 */}
              <Line
                points={[[leftX, spaceHeight, dimZ], [rightX, spaceHeight, dimZ]]}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([leftX, spaceHeight, dimZ], [leftX + 0.02, spaceHeight, dimZ], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={createArrowHead([rightX, spaceHeight, dimZ], [rightX - 0.02, spaceHeight, dimZ], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 캐비넷 폭 치수 텍스트 - 상단뷰용 회전 적용 */}
              <Text
                position={[module.position.x, spaceHeight + 0.1, dimZ - mmToThreeUnits(30)]}
                fontSize={baseFontSize}
                color="#666666"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {moduleData.dimensions.width}
              </Text>

              {/* 연장선들 - 가구 앞단에서 치수선까지 */}
              {(() => {
                // 좌우 깊이가 다른 가구인지 확인
                const isDualModule = moduleData?.id.includes('dual') || false;
                const rightAbsoluteDepth = moduleData?.modelConfig?.rightAbsoluteDepth;
                const hasAsymmetricDepth = isDualModule && rightAbsoluteDepth;
                
                const panelDepthMm = 1500;
                const furnitureDepthMm = 600;
                const doorThicknessMm = 20;
                const actualDepthMm = module.customDepth || moduleData?.dimensions?.depth || 580;
                
                const panelDepth = mmToThreeUnits(panelDepthMm);
                const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                const doorThickness = mmToThreeUnits(doorThicknessMm);
                
                const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
                
                if (hasAsymmetricDepth) {
                  // 좌우 깊이가 다른 경우: 각각 다른 깊이로 계산
                  const leftDepthMm = actualDepthMm; // 좌측은 기본 깊이
                  const rightDepthMm = rightAbsoluteDepth; // 우측은 절대 깊이
                  
                  const leftDepth = mmToThreeUnits(leftDepthMm);
                  const rightDepth = mmToThreeUnits(rightDepthMm);
                  
                  // 좌측 앞면 (기본 깊이)
                  const leftFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2 + leftDepth/2;
                  // 우측 앞면 (절대 깊이) - 깊이 차이만큼 앞쪽으로 이동
                  const rightFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2 + rightDepth/2 + (leftDepth - rightDepth) / 2;
                  
                  return (
                    <>
                      {/* 좌측 연장선 */}
                      <Line
                        points={[[leftX, spaceHeight, leftFrontZ], [leftX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color="#666666"
                        lineWidth={1}
                      />
                      {/* 우측 연장선 */}
                      <Line
                        points={[[rightX, spaceHeight, rightFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color="#666666"
                        lineWidth={1}
                      />
                    </>
                  );
                } else {
                  // 좌우 깊이가 동일한 경우: 기존 로직
                  const moduleDepth = mmToThreeUnits(actualDepthMm);
                  const furnitureFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2 + moduleDepth/2;
                  
                  return (
                    <>
                      <Line
                        points={[[leftX, spaceHeight, furnitureFrontZ], [leftX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color="#666666"
                        lineWidth={1}
                      />
                      <Line
                        points={[[rightX, spaceHeight, furnitureFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color="#666666"
                        lineWidth={1}
                      />
                    </>
                  );
                }
              })()}
            </group>
          );
        })}

        {/* 우측 치수선 - 우측 프레임 앞면부터 가구 가장 뒷면까지 거리 */}
        {placedModules.length > 0 && (() => {
          // 우측에 배치된 가구들의 가장 뒷면과 X 위치 찾기
          let rightmostBackZ = Infinity;
          let rightFurnitureX = spaceXOffset + mmToThreeUnits(spaceInfo.width); // 기본값: 공간 오른쪽 끝
          let rightFurnitureLeftEdge = spaceXOffset + mmToThreeUnits(spaceInfo.width); // 우측 가구의 왼쪽 끝 모서리
          
          placedModules.forEach((module) => {
            const moduleData = getModuleById(
              module.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            
            if (!moduleData || !moduleData.dimensions) return;
            
            // FurnitureItem.tsx와 완전히 동일한 계산
            const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
            const moduleWidthMm = moduleData.dimensions.width;
            const moduleWidth = mmToThreeUnits(moduleWidthMm);
            const leftX = module.position.x - moduleWidth / 2;
            const rightX = module.position.x + moduleWidth / 2;
            
            // 우측 절반에 있는 가구만 고려 (공간 중앙 기준)
            const spaceWidth = mmToThreeUnits(spaceInfo.width);
            const spaceCenterX = spaceXOffset + spaceWidth / 2;
            
            if (rightX > spaceCenterX) {
              // 좌우 깊이가 다른 가구인지 확인 (스타일러장 등)
              const isDualModule = moduleData.id.includes('dual');
              const rightAbsoluteDepth = moduleData.modelConfig?.rightAbsoluteDepth;
              const hasAsymmetricDepth = isDualModule && rightAbsoluteDepth;
              
              // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산
              const panelDepthMm = 1500;
              const furnitureDepthMm = 600;
              const doorThicknessMm = 20;
              
              const panelDepth = mmToThreeUnits(panelDepthMm);
              const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
              const doorThickness = mmToThreeUnits(doorThicknessMm);
              
              // FurnitureItem.tsx와 동일한 계산
              const zOffset = -panelDepth / 2;
              const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
              
              let furnitureBackZ;
              
              if (hasAsymmetricDepth) {
                // 좌우 깊이가 다른 경우: 우측 절대 깊이 사용
                const leftDepthMm = actualDepthMm;
                const rightDepthMm = rightAbsoluteDepth!;
                const leftDepth = mmToThreeUnits(leftDepthMm);
                const rightDepth = mmToThreeUnits(rightDepthMm);
                
                console.log('🔍 [스타일러장 디버깅]');
                console.log('- 모듈ID:', moduleData.id);
                console.log('- actualDepthMm (좌측):', leftDepthMm);
                console.log('- rightAbsoluteDepth (우측):', rightDepthMm);
                console.log('- leftDepth (Three.js):', leftDepth);
                console.log('- rightDepth (Three.js):', rightDepth);
                console.log('- furnitureZOffset:', furnitureZOffset);
                console.log('- furnitureDepth:', furnitureDepth);
                console.log('- doorThickness:', doorThickness);
                
                // 우측 가구의 실제 배치 위치 (깊이 차이 반영) - DualType5와 동일하게 계산
                // DualType5에서는 우측이 660mm로 더 깊으므로, 우측 뒷면이 더 뒤로 나와야 함
                const rightFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2;
                furnitureBackZ = rightFurnitureZ - rightDepth/2;
                console.log('- rightFurnitureZ (가구 중심, 수정된 계산):', rightFurnitureZ);
                console.log('- furnitureBackZ (가구 뒷면, 수정된 계산):', furnitureBackZ);
              } else {
                // 좌우 깊이가 동일한 경우: FurnitureItem.tsx와 동일
                const depth = mmToThreeUnits(actualDepthMm);
                const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
                furnitureBackZ = furnitureZ - depth/2;
              }
              
              if (furnitureBackZ < rightmostBackZ) {
                rightmostBackZ = furnitureBackZ;
                rightFurnitureLeftEdge = leftX; // 실제 가구의 왼쪽 끝
              }
            }
          });
          
          if (rightmostBackZ === Infinity) return null;
          
          // 우측 프레임 앞면 위치 계산 (Room.tsx와 동일)
          const panelDepthMm = 1500;
          const furnitureDepthMm = 600; // 실제 가구 공간 깊이 (FurnitureItem.tsx와 동일)
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          
          const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
          // Room.tsx의 실제 우측 프레임 위치 (가구 앞면에서 30mm 뒤로)
          const rightFrameFrontZ = furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(30);
          
          // 거리 계산 (mm 단위) - 우측 프레임 앞면부터 실제 가구 뒷면까지의 실제 거리  
          const distanceMm = Math.round((rightFrameFrontZ - rightmostBackZ) / 0.01);
          
          // 치수선을 오른쪽에 표시
          const spaceWidth = mmToThreeUnits(spaceInfo.width);
          const rightDimensionX = spaceXOffset + spaceWidth + mmToThreeUnits(200);
          
          return (
            <group key="right-frame-to-furniture-dimension">
              {/* 치수선 */}
              <Line
                points={[[rightDimensionX, spaceHeight, rightmostBackZ], [rightDimensionX, spaceHeight, rightFrameFrontZ]]}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightmostBackZ], [rightDimensionX, spaceHeight, rightmostBackZ + 0.02], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightFrameFrontZ], [rightDimensionX, spaceHeight, rightFrameFrontZ - 0.02], 0.01)}
                color="#666666"
                lineWidth={1}
              />
              
              {/* 거리 텍스트 */}
              <Text
                position={[rightDimensionX + mmToThreeUnits(40), spaceHeight + 0.1, (rightmostBackZ + rightFrameFrontZ) / 2]}
                fontSize={baseFontSize}
                color="#666666"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {distanceMm}
              </Text>

              {/* 연장선들 - 실제 가구의 정확한 위치에서 짧게 */}
              <Line
                points={[[rightFurnitureLeftEdge, spaceHeight, rightmostBackZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightmostBackZ]]}
                color="#666666"
                lineWidth={1}
              />
              {/* 우측 프레임 앞면 연장선 - 공간 벽에서 짧게 */}
              <Line
                points={[[spaceXOffset + spaceWidth, spaceHeight, rightFrameFrontZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightFrameFrontZ]]}
                color="#666666"
                lineWidth={1}
              />
            </group>
          );
        })()}
          </>
        )}
      </group>
    );
  };

  return (
    <group ref={groupRef} renderOrder={999999}>
      {renderDimensions()}
    </group>
  );
};

export default CleanCAD2D;