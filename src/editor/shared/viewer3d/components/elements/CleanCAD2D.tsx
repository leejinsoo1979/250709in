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
  }, [currentViewDirection, showDimensions, placedModules]); // placedModules 의존성 추가로 가구 변경시에도 적용
  
  // 치수 표시가 비활성화된 경우 아무것도 렌더링하지 않음 (hooks 호출 후에 체크)
  if (!showDimensions) {
    return null;
  }
  
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 공간 크기 (Three.js 단위)
  const spaceHeight = mmToThreeUnits(spaceInfo.height);
  
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

  // 정면뷰 치수선 - 3D 모드에서는 Z축을 앞으로 이동
  const zOffset = is3DMode ? 0.5 : 0; // 3D 모드에서 Z축 오프셋
  
  const renderFrontView = () => (
    <group position={[0, 0, zOffset]} renderOrder={9999}>
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
          fontSize={0.6}
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
          fontSize={0.5}
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
          fontSize={0.5}
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
                  fontSize: '14px',
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
          fontSize={0.6}
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
          const bottomFrameHeight = spaceInfo.baseConfig?.height || 65; // 하부 프레임 높이 (받침대)
          const cabinetPlacementHeight = spaceInfo.height - topFrameHeight - bottomFrameHeight; // 캐비넷 배치 영역
          
          const bottomY = 0; // 바닥
          const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight); // 하부 프레임 상단
          const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
          const topY = spaceHeight; // 최상단
          
          return (
            <>
              {/* 1. 하부 프레임 높이 */}
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
                  fontSize={0.5}
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
                  fontSize={0.5}
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
                  fontSize={0.5}
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
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, bottomFrameTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), bottomFrameTopY, 0.001]]}
                color="#666666"
                lineWidth={1}
              />
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
              fontSize={0.5}
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
    </group>
  );

  // 좌측뷰 치수선
  const renderLeftView = () => (
    <group>
      {/* 좌측뷰 깊이 치수선 */}
      <Line
        points={[[0, spaceHeight + mmToThreeUnits(100), 0], [0, spaceHeight + mmToThreeUnits(100), mmToThreeUnits(spaceInfo.depth)]]}
        color="#666666"
        lineWidth={1}
      />
      <Text
        position={[0, spaceHeight + mmToThreeUnits(140), mmToThreeUnits(spaceInfo.depth) / 2]}
        fontSize={0.6}
        color="black"
        anchorX="center"
        anchorY="middle"
      >
        {spaceInfo.depth}
      </Text>
      
      {/* 좌측뷰 높이 치수선 */}
      <Line
        points={[[-mmToThreeUnits(100), 0, 0], [-mmToThreeUnits(100), spaceHeight, 0]]}
        color="#666666"
        lineWidth={1}
      />
      <Text
        position={[-mmToThreeUnits(140), spaceHeight / 2, 0]}
        fontSize={0.6}
        color="black"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, -Math.PI / 2]}
      >
        {spaceInfo.height}
      </Text>
    </group>
  );

  // 우측뷰 치수선
  const renderRightView = () => (
    <group>
      {/* 우측뷰 깊이 치수선 */}
      <Line
        points={[[mmToThreeUnits(spaceInfo.width), spaceHeight + mmToThreeUnits(100), 0], [mmToThreeUnits(spaceInfo.width), spaceHeight + mmToThreeUnits(100), mmToThreeUnits(spaceInfo.depth)]]}
        color="#666666"
        lineWidth={1}
      />
      <Text
        position={[mmToThreeUnits(spaceInfo.width), spaceHeight + mmToThreeUnits(140), mmToThreeUnits(spaceInfo.depth) / 2]}
        fontSize={0.6}
        color="black"
        anchorX="center"
        anchorY="middle"
      >
        {spaceInfo.depth}
      </Text>
      
      {/* 우측뷰 높이 치수선 */}
      <Line
        points={[[mmToThreeUnits(spaceInfo.width) + mmToThreeUnits(100), 0, 0], [mmToThreeUnits(spaceInfo.width) + mmToThreeUnits(100), spaceHeight, 0]]}
        color="#666666"
        lineWidth={1}
      />
      <Text
        position={[mmToThreeUnits(spaceInfo.width) + mmToThreeUnits(140), spaceHeight / 2, 0]}
        fontSize={0.6}
        color="black"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, -Math.PI / 2]}
      >
        {spaceInfo.height}
      </Text>
    </group>
  );

  // 상단뷰 치수선
  const renderTopView = () => (
    <group>
      {/* 상단뷰 너비 치수선 */}
      <Line
        points={[[0, spaceHeight, -mmToThreeUnits(100)], [mmToThreeUnits(spaceInfo.width), spaceHeight, -mmToThreeUnits(100)]]}
        color="#666666"
        lineWidth={1}
      />
      <Text
        position={[mmToThreeUnits(spaceInfo.width) / 2, spaceHeight, -mmToThreeUnits(140)]}
        fontSize={0.6}
        color="black"
        anchorX="center"
        anchorY="middle"
      >
        {spaceInfo.width}
      </Text>
      
      {/* 상단뷰 깊이 치수선 */}
      <Line
        points={[[-mmToThreeUnits(100), spaceHeight, 0], [-mmToThreeUnits(100), spaceHeight, mmToThreeUnits(spaceInfo.depth)]]}
        color="#666666"
        lineWidth={1}
      />
      <Text
        position={[-mmToThreeUnits(140), spaceHeight, mmToThreeUnits(spaceInfo.depth) / 2]}
        fontSize={0.4}
        color="black"
        anchorX="center"
        anchorY="middle"
        rotation={[0, 0, -Math.PI / 2]}
      >
        {spaceInfo.depth}
      </Text>
    </group>
  );

  return (
    <group ref={groupRef} renderOrder={999999}>
      {renderDimensions()}
    </group>
  );
};

export default CleanCAD2D;