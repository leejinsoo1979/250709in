import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Line, Text, Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useTheme } from '@/contexts/ThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';

interface CleanCAD2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
  isStep2?: boolean;
}

/**
 * 깔끔한 CAD 스타일 2D 뷰어 (그리드 없음)
 * 이미지와 동일한 스타일의 치수선과 가이드라인만 표시
 */
const CleanCAD2D: React.FC<CleanCAD2DProps> = ({ viewDirection, showDimensions: showDimensionsProp, isStep2 }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  const { view2DDirection, showDimensions: showDimensionsFromStore, showDimensionsText } = useUIStore();
  
  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;
  
  console.log('🎯 CleanCAD2D showDimensions:', {
    showDimensionsProp,
    showDimensionsFromStore,
    showDimensions,
    viewDirection
  });
  const { updateColumn } = useSpaceConfigStore();
  const groupRef = useRef<THREE.Group>(null);
  const { theme } = useTheme();
  const { colors } = useThemeColors();

  // 편집 상태 관리
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingSide, setEditingSide] = useState<'left' | 'right' | 'width' | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드가 활성화되면 입력 필드에 포커스
  useEffect(() => {
    if (editingColumnId && editingSide && inputRef.current) {
      // 더 긴 지연시간과 더 안정적인 포커스 처리
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
          // 추가로 클릭 이벤트도 발생시켜 확실히 포커스
          inputRef.current.click();
        }
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [editingColumnId, editingSide]);

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;

  // CSS 변수에서 실제 테마 색상 가져오기
  const getThemeColorFromCSS = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const computedColor = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName).trim();
      return computedColor || fallback;
    }
    return fallback;
  };

  // 3D 모드에서는 검정색, 2D 모드에서는 테마 색상 사용
  const primaryColor = getThemeColorFromCSS('--theme-primary', '#10b981');
  const dimensionColor = currentViewDirection === '3D' ? '#666666' : primaryColor;  // 연한 회색으로 변경
  const textColor = currentViewDirection === '3D' ? '#666666' : primaryColor;  // 연한 회색으로 변경
  const guideColor = currentViewDirection === '3D' ? '#999999' : primaryColor;  // 더 연한 색상
  const subGuideColor = currentViewDirection === '3D' ? '#cccccc' : primaryColor;  // 더 연한 색상
  const gridColor = getThemeColorFromCSS('--theme-border', '#e5e7eb');
  
  // 프레임 치수 색상도 테마 색상 사용
  const frameDimensionColor = primaryColor;

  // 기둥 간격 편집 핸들러
  const handleColumnDistanceEdit = (columnId: string, side: 'left' | 'right' | 'width', currentValue: number) => {
    console.log('🖱️ 기둥 간격 편집 시작:', { columnId, side, currentValue });
    
    // 기존 편집 모드 먼저 해제
    if (editingColumnId) {
      setEditingColumnId(null);
      setEditingSide(null);
      setEditingValue('');
    }
    
    // 잠시 후 새로운 편집 모드 활성화
    setTimeout(() => {
      setEditingColumnId(columnId);
      setEditingSide(side);
      setEditingValue(currentValue.toString());
    }, 50);
  };

  const handleEditComplete = () => {
    if (!editingColumnId || !editingSide) return;
    
    const value = parseInt(editingValue) || 0;
    const column = spaceInfo.columns?.find(col => col.id === editingColumnId);
    
    if (!column) return;

    console.log('✅ 편집 완료:', { columnId: editingColumnId, side: editingSide, value });

    const spaceWidthM = spaceInfo.width * 0.01;
    const columnWidthM = column.width * 0.01;

    if (editingSide === 'left') {
      // 왼쪽 벽과 기둥 좌측면 사이의 간격
      const newX = -(spaceWidthM / 2) + (value * 0.01) + (columnWidthM / 2);
      updateColumn(editingColumnId, { position: [newX, column.position[1], column.position[2]] });
    } else if (editingSide === 'right') {
      // 오른쪽 벽과 기둥 우측면 사이의 간격
      const newX = (spaceWidthM / 2) - (value * 0.01) - (columnWidthM / 2);
      updateColumn(editingColumnId, { position: [newX, column.position[1], column.position[2]] });
    } else if (editingSide === 'width') {
      // 기둥 너비 변경
      updateColumn(editingColumnId, { width: value });
    }

    setEditingColumnId(null);
    setEditingSide(null);
    setEditingValue('');
  };

  const handleEditCancel = () => {
    console.log('❌ 편집 취소');
    setEditingColumnId(null);
    setEditingSide(null);
    setEditingValue('');
  };

  // 편집 가능한 라벨 컴포넌트
  const EditableLabel = ({ 
    columnId, 
    side, 
    currentValue, 
    position, 
    color = currentViewDirection === '3D' ? '#000000' : '#4CAF50',
    label 
  }: {
    columnId: string;
    side: 'left' | 'right' | 'width';
    currentValue: number;
    position: [number, number, number];
    color?: string;
    label: string;
  }) => {
    const isEditing = editingColumnId === columnId && editingSide === side;
    
    if (isEditing) {
      return (
        <Html
          position={position}
          center
          style={{ pointerEvents: 'auto' }}
          occlude={false}
          zIndexRange={[10000, 10001]}
          transform={false}
        >
          <div 
            style={{
              position: 'relative',
              zIndex: 10000,
              background: currentViewDirection === '3D' 
                ? `rgba(0, 0, 0, 0.8)` 
                : `rgba(${color === '#4CAF50' ? '76, 175, 80' : '33, 150, 243'}, 0.95)`,
              color: 'white',
              padding: '8px 12px',
              borderRadius: '8px',
              border: `2px solid ${color}`,
              minWidth: '120px',
              textAlign: 'center',
              boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={editingValue}
              onChange={(e) => {
                console.log('📝 입력 변경:', e.target.value);
                setEditingValue(e.target.value);
              }}
              onBlur={() => {
                console.log('👋 포커스 잃음');
                handleEditComplete();
              }}
              onKeyDown={(e) => {
                console.log('⌨️ 키 입력:', e.key);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleEditComplete();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleEditCancel();
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              style={{
                border: 'none',
                outline: 'none',
                width: '80px',
                fontSize: '16px',
                textAlign: 'center',
                background: currentViewDirection === '3D' ? 'white' : 'var(--theme-surface)',
                color: currentViewDirection === '3D' ? '#333' : 'var(--theme-text)',
                borderRadius: '4px',
                padding: '6px',
                fontWeight: 'bold'
              }}
              autoFocus
              placeholder="폭"
            />
            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.9 }}>
              {label}
            </div>
          </div>
        </Html>
      );
    }

    return (
              <Html
          position={position}
          center
          style={{ 
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: 99999
          }}
          occlude={false}
          zIndexRange={[9999, 10000]}
          prepend={false}
          portal={undefined}
          transform={false}
          sprite={false}
        >
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            color: currentViewDirection === '3D' ? '#000000' : (color === '#4CAF50' ? '#2E7D32' : '#2196F3'),
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            border: `2px solid ${color}`,
            cursor: 'pointer',
            userSelect: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            position: 'relative',
            zIndex: 100000,
            pointerEvents: 'auto',
            isolation: 'isolate'
          }}
          ref={(element) => {
            if (element) {
              // 전역 이벤트 리스너 추가
                             const handleGlobalClick = (e: globalThis.MouseEvent) => {
                 if (element.contains(e.target as Node)) {
                   console.log('🎯 전역 클릭 감지됨:', { columnId, side, currentValue });
                   e.preventDefault();
                   e.stopPropagation();
                   e.stopImmediatePropagation();
                   handleColumnDistanceEdit(columnId, side, currentValue);
                   return false;
                 }
               };
               
               const handleGlobalMouseDown = (e: globalThis.MouseEvent) => {
                 if (element.contains(e.target as Node)) {
                   console.log('🎯 전역 마우스다운 감지됨:', { columnId, side });
                   e.preventDefault();
                   e.stopPropagation();
                   e.stopImmediatePropagation();
                   return false;
                 }
               };
              
                             // 캡처 단계에서 이벤트 처리 - 우선순위 높게
               document.addEventListener('mousedown', handleGlobalMouseDown, true);
               document.addEventListener('click', handleGlobalClick, true);
               
               return () => {
                 document.removeEventListener('mousedown', handleGlobalMouseDown, true);
                 document.removeEventListener('click', handleGlobalClick, true);
               };
            }
          }}
                                  onClick={(e) => {
              console.log('🖱️ 라벨 클릭됨:', { columnId, side, currentValue });
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.preventDefault();
              e.nativeEvent?.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation();
              handleColumnDistanceEdit(columnId, side, currentValue);
            }}
            onMouseDown={(e) => {
              console.log('🖱️ 마우스 다운:', { columnId, side, currentValue });
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.preventDefault();
              e.nativeEvent?.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation();
            }}
            onMouseUp={(e) => {
              console.log('🖱️ 마우스 업:', { columnId, side, currentValue });
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.preventDefault();
              e.nativeEvent?.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation();
            }}
          onTouchStart={(e) => {
            console.log('👆 터치 시작:', { columnId, side, currentValue });
            e.preventDefault();
            e.stopPropagation();
            handleColumnDistanceEdit(columnId, side, currentValue);
          }}
          onPointerDown={(e) => {
            console.log('👆 포인터 다운:', { columnId, side, currentValue });
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            console.log('👆 포인터 업:', { columnId, side, currentValue });
            e.preventDefault();
            e.stopPropagation();
          }}
                 >
          {currentValue}
        </div>
      </Html>
    );
  };

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
  }, [currentViewDirection, showDimensions, placedModules.length, JSON.stringify(placedModules.map(m => ({ id: m.id, moduleId: m.moduleId, customDepth: m.customDepth, position: m.position }))), JSON.stringify(spaceInfo.columns)]); // placedModules와 columns 변경사항을 세밀하게 감지
  
  // 치수 표시가 비활성화된 경우에도 기둥은 렌더링 (hooks 호출 후에 체크)
  // showDimensions가 false일 때는 치수선은 숨기지만 기둥은 표시
  
  
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
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 좌측 화살표 */}
        <Line
          points={createArrowHead([leftOffset, topDimensionY, 0.002], [leftOffset + 0.05, topDimensionY, 0.002])}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 우측 화살표 */}
        <Line
          points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.05, topDimensionY, 0.002])}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 전체 폭 (프레임 포함) 치수 텍스트 - Text 3D 사용 */}
        {(showDimensionsText || isStep2) && (
          <Text
            position={[mmToThreeUnits(spaceInfo.width) / 2 + leftOffset, topDimensionY + mmToThreeUnits(40), 0.01]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
          >
            {spaceInfo.width}
          </Text>
        )}
        
        {/* 연장선 (좌측 프레임) */}
        <Line
          points={[[leftOffset, 0, 0.001], [leftOffset, topDimensionY + mmToThreeUnits(20), 0.001]]}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 연장선 (우측 프레임) */}
        <Line
          points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, 0, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY + mmToThreeUnits(20), 0.001]]}
          color={dimensionColor}
          lineWidth={1}
        />
      </group>
      
      {/* 좌측 프레임 치수선 / 노서라운드일 때는 이격거리/엔드패널 치수선 */}
      {!isStep2 && (
      <group>
        {spaceInfo.surroundType === 'no-surround' ? (
          /* 노서라운드 모드: 좌측 이격거리/엔드패널 치수선 */
          (() => {
            // 벽 유무에 따라 값과 텍스트 결정
            const hasLeftWall = spaceInfo.installType === 'builtin' || 
                               (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left);
            const leftValue = hasLeftWall ? 2 : 20;
            const leftText = hasLeftWall ? '이격 2' : 'EP 20';
            
            return (
              <>
                {/* 치수선 */}
                <Line
                  points={[[leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002]]}
                  color={dimensionColor}
                  lineWidth={2}
                />
                
                {/* 좌측 화살표 */}
                <Line
                  points={createArrowHead([leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={dimensionColor}
                  lineWidth={2}
                />
                
                {/* 우측 화살표 */}
                <Line
                  points={createArrowHead([leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue) - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={dimensionColor}
                  lineWidth={2}
                />
                
                {/* 좌측 치수 텍스트 */}
                {showDimensionsText && (
                  <Text
                    position={[leftOffset + mmToThreeUnits(leftValue) / 2, topDimensionY - mmToThreeUnits(90), 0.01]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                  >
                    {leftText}
                  </Text>
                )}
                {/* 연장선 */}
                <Line
                  points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[leftOffset + mmToThreeUnits(leftValue), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.5}
                />
              </>
            );
          })()
        ) : (
          /* 서라운드 모드: 기존 좌측 프레임 치수선 */
          <>
            {/* 치수선 */}
            <Line
              points={[[leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(frameSize.left), topDimensionY - mmToThreeUnits(120), 0.002]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([leftOffset + mmToThreeUnits(frameSize.left), topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(frameSize.left) - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 좌측 프레임 치수 텍스트 */}
            <Text
              position={[leftOffset + mmToThreeUnits(frameSize.left) / 2, topDimensionY - mmToThreeUnits(90), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
            >
              {frameSize.left}
            </Text>
            
            {/* 연장선 */}
            <Line
              points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[leftOffset + mmToThreeUnits(frameSize.left), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(frameSize.left), topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </>
        )}
      </group>
      )}
      
      {/* 우측 프레임 치수선 / 노서라운드일 때는 이격거리/엔드패널 치수선 */}
      {!isStep2 && (
      <group>
        {spaceInfo.surroundType === 'no-surround' ? (
          /* 노서라운드 모드: 우측 이격거리/엔드패널 치수선 */
          (() => {
            // 벽 유무에 따라 값과 텍스트 결정
            const hasRightWall = spaceInfo.installType === 'builtin' || 
                                (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right);
            const rightValue = hasRightWall ? 2 : 20;
            const rightText = hasRightWall ? '이격 2' : 'EP 20';
            
            return (
              <>
                {/* 치수선 */}
                <Line
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002]]}
                  color={textColor}
                  lineWidth={2}
                />
                
                {/* 좌측 화살표 */}
                <Line
                  points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={textColor}
                  lineWidth={2}
                />
                
                {/* 우측 화살표 */}
                <Line
                  points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={textColor}
                  lineWidth={2}
                />
                
                {/* 우측 치수 텍스트 */}
                <Text
                  position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) / 2, topDimensionY - mmToThreeUnits(90), 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                >
                  {rightText}
                </Text>
                
                {/* 연장선 */}
                <Line
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.5}
                />
              </>
            );
          })()
        ) : (
          /* 서라운드 모드: 기존 우측 프레임 치수선 */
          <>
            {/* 치수선 */}
            <Line
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 우측 프레임 치수 텍스트 */}
            <Text
              position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) / 2, topDimensionY - mmToThreeUnits(90), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
            >
              {frameSize.right}
            </Text>
            
            {/* 연장선 */}
            <Line
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </>
        )}
      </group>
      )}
      
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
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftX, columnDimensionY, 0.002], [leftX + 0.03, columnDimensionY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([rightX, columnDimensionY, 0.002], [rightX - 0.03, columnDimensionY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
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
                  border: '1px solid #999',
              borderRadius: '2px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
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
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, columnDimensionY + mmToThreeUnits(15), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </group>
        );
      })}
      
      {/* 좌측 전체 높이 치수선 - 가구 배치 시에만 표시 (Step 2는 예외) */}
      {(placedModules.length > 0 || isStep2) && (
      <group>
        {/* 치수선 */}
        <Line
          points={[[leftDimensionX + leftOffset, 0, 0.002], [leftDimensionX + leftOffset, spaceHeight, 0.002]]}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 하단 화살표 */}
        <Line
          points={createArrowHead([leftDimensionX + leftOffset, 0, 0.002], [leftDimensionX + leftOffset, 0.05, 0.002])}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 상단 화살표 */}
        <Line
          points={createArrowHead([leftDimensionX + leftOffset, spaceHeight, 0.002], [leftDimensionX + leftOffset, spaceHeight - 0.05, 0.002])}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 전체 높이 치수 텍스트 - Text 3D 사용 */}
        <Text
          position={[leftDimensionX + leftOffset - mmToThreeUnits(60), spaceHeight / 2, 0.01]}
          fontSize={largeFontSize}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, -Math.PI / 2]}
        >
          {spaceInfo.height}
        </Text>
        
        {/* 연장선 (하단) */}
        <Line
          points={[[leftOffset, 0, 0.001], [leftDimensionX + leftOffset - mmToThreeUnits(20), 0, 0.001]]}
          color={dimensionColor}
          lineWidth={1}
        />
        
        {/* 연장선 (상단) */}
        <Line
          points={[[leftOffset, spaceHeight, 0.001], [leftDimensionX + leftOffset - mmToThreeUnits(20), spaceHeight, 0.001]]}
          color={dimensionColor}
          lineWidth={1}
        />
      </group>
      )}
      
      {/* 우측 3구간 높이 치수선 (상부프레임 + 캐비넷배치영역 + 하부프레임) */}
      {!isStep2 && (
      <group>
        {(() => {
          const rightDimensionX = mmToThreeUnits(spaceInfo.width) + leftOffset + mmToThreeUnits(is3DMode ? 120 : 200); // 우측 치수선 위치 (3D에서는 더 가까이)
          
          // 띄워서 배치인지 확인
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
          
          const topFrameHeight = frameSize.top; // 상부 프레임 높이
          const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0; // 하부 프레임 높이 (받침대가 있는 경우만)
          const cabinetPlacementHeight = spaceInfo.height - topFrameHeight - bottomFrameHeight - floatHeight; // 캐비넷 배치 영역 (띄움 높이 제외)
          
          const bottomY = mmToThreeUnits(floatHeight); // 프레임 시작점 (띄워서 배치 시 올라감)
          const bottomFrameTopY = mmToThreeUnits(floatHeight + bottomFrameHeight); // 하부 프레임 상단
          const cabinetAreaTopY = mmToThreeUnits(floatHeight + bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
          const topY = spaceHeight; // 최상단
          
          return (
            <>
              {/* 0. 띄움 높이 - 띄워서 배치인 경우에만 표시 (우측) */}
              {isFloating && floatHeight > 0 && (
                <group>
                  <Line
                    points={[[rightDimensionX + mmToThreeUnits(100), 0, 0.002], [rightDimensionX + mmToThreeUnits(100), mmToThreeUnits(floatHeight), 0.002]]}
                    color={textColor}
                    lineWidth={2}
                  />
                  <Line
                    points={createArrowHead([rightDimensionX + mmToThreeUnits(100), 0, 0.002], [rightDimensionX + mmToThreeUnits(100), -0.03, 0.002])}
                    color={textColor}
                    lineWidth={2}
                  />
                  <Line
                    points={createArrowHead([rightDimensionX + mmToThreeUnits(100), mmToThreeUnits(floatHeight), 0.002], [rightDimensionX + mmToThreeUnits(100), mmToThreeUnits(floatHeight) + 0.03, 0.002])}
                    color={textColor}
                    lineWidth={2}
                  />
                  <Text
                    position={[rightDimensionX + mmToThreeUnits(100) + mmToThreeUnits(30), mmToThreeUnits(floatHeight / 2), 0.01]}
                    fontSize={baseFontSize * 0.9}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    띄움 {floatHeight}
                  </Text>
                  {/* 연장선들 - 좌측으로 1800mm 이동 */}
                  <Line
                    points={[[-mmToThreeUnits(1800), 0, 0.002], [mmToThreeUnits(spaceInfo.width) - mmToThreeUnits(1800), 0, 0.002]]}
                    color={textColor}
                    lineWidth={0.5}
                    dashed
                    dashSize={0.01}
                    gapSize={0.005}
                  />
                  <Line
                    points={[[-mmToThreeUnits(1800), mmToThreeUnits(floatHeight), 0.002], [mmToThreeUnits(spaceInfo.width) - mmToThreeUnits(1800), mmToThreeUnits(floatHeight), 0.002]]}
                    color={textColor}
                    lineWidth={0.5}
                    dashed
                    dashSize={0.01}
                    gapSize={0.005}
                  />
                </group>
              )}
              
              {/* 1. 하부 프레임 높이 - 받침대가 있는 경우에만 표시 */}
              {bottomFrameHeight > 0 && (
              <group>
                <Line
                  points={[[rightDimensionX, bottomY, 0.002], [rightDimensionX, bottomFrameTopY, 0.002]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([rightDimensionX, bottomY, 0.002], [rightDimensionX, 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, bottomFrameTopY - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Text
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(bottomFrameHeight / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
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
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, bottomFrameTopY + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, cabinetAreaTopY - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Text
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {cabinetPlacementHeight}
                </Text>
              </group>
              
              {/* 3. 상부 프레임 높이 / 노서라운드일 때는 상부 이격거리 */}
              <group>
                <Line
                  points={[[rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, topY, 0.002]]}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                />
                <Line
                  points={createArrowHead([rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, cabinetAreaTopY + 0.03, 0.002])}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                />
                <Line
                  points={createArrowHead([rightDimensionX, topY, 0.002], [rightDimensionX, topY - 0.03, 0.002])}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                />
                <Text
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(spaceInfo.height - topFrameHeight / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={spaceInfo.surroundType === 'no-surround' ? colors.primary : "black"}
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
                color={dimensionColor}
                lineWidth={0.5}
              />
              {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
              {bottomFrameHeight > 0 && (
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, bottomFrameTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), bottomFrameTopY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              )}
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, cabinetAreaTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), cabinetAreaTopY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, topY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), topY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
            </>
          );
        })()}
      </group>
      )}
      

      {/* 가구별 실시간 치수선 및 가이드 (가구가 배치된 경우에만 표시) */}
      {placedModules.length > 0 && placedModules.map((module, index) => {
        const moduleData = getModuleById(
          module.moduleId,
          { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
          spaceInfo
        );
        
        if (!moduleData) return null;
        
        // 기둥에 의해 조정된 너비와 위치 사용
        const actualWidth = module.adjustedWidth || moduleData.dimensions.width;
        const moduleWidth = mmToThreeUnits(actualWidth);
        // 조정된 위치가 있으면 사용, 없으면 원래 위치 사용
        const actualPositionX = module.adjustedPosition?.x || module.position.x;
        const leftX = actualPositionX - moduleWidth / 2;
        const rightX = actualPositionX + moduleWidth / 2;
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
        
        // 듀얼 가구의 경우 좌우 폭 계산 (조정된 너비 기반)
        let leftWidth, rightWidth;
        if (isDualModule) {
          if (moduleData.modelConfig?.rightAbsoluteWidth) {
            // 원래 비율을 유지하면서 조정
            const originalRatio = moduleData.modelConfig.rightAbsoluteWidth / moduleData.dimensions.width;
            rightWidth = actualWidth * originalRatio;
            leftWidth = actualWidth - rightWidth;
          } else {
            // 50:50 분할
            leftWidth = actualWidth / 2;
            rightWidth = actualWidth / 2;
          }
        } else {
          leftWidth = actualWidth;
          rightWidth = 0;
        }
        
        const leftThreeWidth = mmToThreeUnits(leftWidth);
        const rightThreeWidth = mmToThreeUnits(rightWidth);
        
        return (
          <group key={`module-guide-${index}`} renderOrder={999999}>
            {/* 가구 좌측 가이드라인 (점선) - 캐비넷 하단부터 시작 */}
            <Line
              points={[[leftX, spaceHeight, 0.001], [leftX, spaceHeight, 0.001]]}
              color={gridColor}
              lineWidth={0.5}
              dashed
              dashSize={0.02}
              gapSize={0.01}
              renderOrder={999999}
            />
            
            {/* 가구 우측 가이드라인 (점선) - 캐비넷 하단부터 시작 */}
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, spaceHeight, 0.001]]}
              color={gridColor}
              lineWidth={0.5}
              dashed
              dashSize={0.02}
              gapSize={0.01}
              renderOrder={999999}
            />
            
            {/* 가구 치수선 */}
            <Line
              points={[[leftX, dimY, 0.002], [rightX, dimY, 0.002]]}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftX, dimY, 0.002], [leftX + 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([rightX, dimY, 0.002], [rightX - 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            
            {/* 가구 치수 텍스트 - Text 사용 */}
            <Text
              position={[actualPositionX, dimY - mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={999999}
            >
              {Math.round(actualWidth)}
            </Text>
            
            
            {/* 연장선 - 하부 프레임에서 전체 가로 치수 보조선까지 확장 */}
            <Line
              points={[[leftX, spaceHeight, 0.001], [leftX, topDimensionY + mmToThreeUnits(20), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, topDimensionY + mmToThreeUnits(20), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
          </group>
        );
      })}
      
      {/* 기둥별 치수선 (가구와 동일한 스타일) */}
      {spaceInfo.columns && spaceInfo.columns.length > 0 && spaceInfo.columns.map((column, index) => {
        const columnWidthM = column.width * 0.01;
        const leftX = column.position[0] - columnWidthM / 2;
        const rightX = column.position[0] + columnWidthM / 2;
        const dimY = topDimensionY - mmToThreeUnits(120); // 가구 치수와 동일한 레벨
        
        return (
          <group key={`column-dim-${column.id}`}>
            {/* 기둥 치수선 */}
            <Line
              points={[[leftX, dimY, 0.002], [rightX, dimY, 0.002]]}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftX, dimY, 0.002], [leftX + 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([rightX, dimY, 0.002], [rightX - 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            
            {/* 기둥 치수 텍스트 */}
            <Text
              position={[column.position[0], dimY - mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={999999}
            >
              {Math.round(column.width)}
            </Text>
            
            {/* 연장선 - 가구와 동일하게 전체 가로 치수선까지 확장 */}
            <Line
              points={[[leftX, spaceHeight, 0.001], [leftX, topDimensionY + mmToThreeUnits(20), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
              renderOrder={999999}
            />
            <Line
              points={[[rightX, spaceHeight, 0.001], [rightX, topDimensionY + mmToThreeUnits(20), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
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
    const topDimensionY = actualSpaceHeight + mmToThreeUnits(hasPlacedModules ? 280 : 200);
    const leftDimensionX = -mmToThreeUnits(200); // 좌측 치수선 X 위치
    
    return (
      <group>
        {/* 상단 전체 깊이 치수선 */}
        <group>
          {/* 치수선 */}
          <Line
            points={[[leftDimensionX, topDimensionY, spaceZOffset], [leftDimensionX, topDimensionY, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전면 화살표 */}
          <Line
            points={createArrowHead([leftDimensionX, topDimensionY, spaceZOffset], [leftDimensionX, topDimensionY, spaceZOffset + 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 후면 화살표 */}
          <Line
            points={createArrowHead([leftDimensionX, topDimensionY, spaceZOffset + panelDepth], [leftDimensionX, topDimensionY, spaceZOffset + panelDepth - 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 깊이 치수 텍스트 */}
          {(showDimensionsText || isStep2) && (
            <Text
              position={[leftDimensionX - mmToThreeUnits(60), topDimensionY, spaceZOffset + panelDepth / 2]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              rotation={[0, Math.PI / 2, 0]}
            >
              {spaceInfo.depth}
            </Text>
          )}
          
          {/* 연장선 (전면) */}
          <Line
            points={[[0, 0, spaceZOffset], [leftDimensionX - mmToThreeUnits(20), 0, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset], [leftDimensionX - mmToThreeUnits(20), actualSpaceHeight, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 연장선 (후면) */}
          <Line
            points={[[0, 0, spaceZOffset + panelDepth], [leftDimensionX - mmToThreeUnits(20), 0, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset + panelDepth], [leftDimensionX - mmToThreeUnits(20), actualSpaceHeight, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>
        
        {/* 좌측 전체 높이 치수선 */}
        <group>
          {/* 치수선 */}
          <Line
            points={[[leftDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [leftDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrowHead([leftDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [leftDimensionX, 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrowHead([leftDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [leftDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 높이 치수 텍스트 */}
          {(showDimensionsText || isStep2) && (
            <Text
              position={[leftDimensionX - mmToThreeUnits(60), actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(200)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              rotation={[0, 0, Math.PI / 2]}
            >
              {spaceInfo.height}
            </Text>
          )}
          
          {/* 연장선 */}
          <Line
            points={[[0, 0, spaceZOffset], [0, 0, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset], [0, actualSpaceHeight, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>



        {/* 캐비넷이 배치된 경우에만 깊이 치수선 표시 */}
        {placedModules.length > 0 && (
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
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 화살표들 */}
                <Line
                  points={createArrowHead([0, dimY, cabinetDepthStart], [0, dimY, cabinetDepthStart + 0.03], 0.015)}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([0, dimY, cabinetDepthEnd], [0, dimY, cabinetDepthEnd - 0.03], 0.015)}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 치수 텍스트 */}
                <Text
                  position={[0, dimY + mmToThreeUnits(40), furnitureZOffset]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                    rotation={[0, -Math.PI / 2, 0]}
                >
                  {furnitureDepthMm}
                </Text>

                {/* 연장선들 */}
                <Line
                  points={[[0, 0, cabinetDepthStart], [0, dimY + mmToThreeUnits(20), cabinetDepthStart]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[0, 0, cabinetDepthEnd], [0, dimY + mmToThreeUnits(20), cabinetDepthEnd]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
              </>
            );
          })()}
        </group>
        )}
        
        {/* 캐비넷이 배치된 경우에만 좌측 전체 높이 치수선 표시 */}
        {placedModules.length > 0 && (
        <group>
          {/* 치수선 */}
          <Line
            points={[[0, 0, spaceZOffset - mmToThreeUnits(200)], [0, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrowHead([0, 0, spaceZOffset - mmToThreeUnits(200)], [0, 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrowHead([0, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [0, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 높이 치수 텍스트 */}
          <Text
            position={[0, actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(240)]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
              rotation={[0, -Math.PI / 2, -Math.PI / 2]}
          >
            {spaceInfo.height}
          </Text>
          
          {/* 연장선 (하단) */}
          <Line
            points={[[0, 0, spaceZOffset], [0, 0, spaceZOffset - mmToThreeUnits(220)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 연장선 (상단) */}
          <Line
            points={[[0, spaceHeight, spaceZOffset], [0, spaceHeight, spaceZOffset - mmToThreeUnits(220)]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>
        )}

        {/* 캐비넷이 배치된 경우에만 우측 3구간 높이 치수선 표시 */}
        {placedModules.length > 0 && (
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
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([0, bottomY, rightDimensionZ], [0, 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY - 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                    position={[0, mmToThreeUnits(bottomFrameHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                      rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {bottomFrameHeight}
                  </Text>
                </group>
                )}
                
                {/* 2. 캐비넷 배치 높이 */}
                <group>
                  <Line
                    points={[[0, bottomFrameTopY, rightDimensionZ], [0, cabinetAreaTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY - 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                    position={[0, bottomFrameTopY + mmToThreeUnits(cabinetPlacementHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {cabinetPlacementHeight}
                  </Text>
                </group>
                
                {/* 3. 상부 프레임 높이 / 노서라운드일 때는 상부 이격거리 */}
                <group>
                  <Line
                    points={[[0, cabinetAreaTopY, rightDimensionZ], [0, topY, rightDimensionZ]]}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY + 0.03, rightDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                  />
                  <Line
                    points={createArrowHead([0, topY, rightDimensionZ], [0, topY - 0.03, rightDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                  />
                  <Text
                    position={[0, cabinetAreaTopY + mmToThreeUnits(topFrameHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                  </Text>
                </group>

                {/* 연장선들 */}
                <Line
                  points={[[0, bottomY, spaceZOffset], [0, bottomY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                <Line
                  points={[[0, bottomFrameTopY, spaceZOffset], [0, bottomFrameTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                )}
                <Line
                  points={[[0, cabinetAreaTopY, spaceZOffset], [0, cabinetAreaTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[0, topY, spaceZOffset], [0, topY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
              </>
            );
          })()}
        </group>
        )}

        
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
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureBackZ], [furnitureX, dimY, furnitureBackZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureFrontZ], [furnitureX, dimY, furnitureFrontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 치수 텍스트 */}
              <Text
                position={[furnitureX, dimY + mmToThreeUnits(40), (furnitureBackZ + furnitureFrontZ) / 2]}
                fontSize={baseFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
              >
                {actualDepth}
              </Text>

              {/* 연장선 (가구 상단에서 치수선까지 긴 보조선) */}
              <Line
                points={[[furnitureX, actualSpaceHeight + mmToThreeUnits(30), furnitureBackZ], [furnitureX, dimY + mmToThreeUnits(50), furnitureBackZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={[[furnitureX, actualSpaceHeight + mmToThreeUnits(30), furnitureFrontZ], [furnitureX, dimY + mmToThreeUnits(50), furnitureFrontZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
            </group>
          );
        })}
        
        {/* 좌측뷰 전용: 가로 폭 치수선 추가 */}
        <group>
          {/* 상단 전체 폭 치수선 */}
          <Line
            points={[[-actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0], [actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 좌측 화살표 */}
          <Line
            points={createArrowHead([-actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0], [-actualSpaceWidth/2 + 0.05, actualSpaceHeight + mmToThreeUnits(100), 0])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 우측 화살표 */}
          <Line
            points={createArrowHead([actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(100), 0], [actualSpaceWidth/2 - 0.05, actualSpaceHeight + mmToThreeUnits(100), 0])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 폭 치수 텍스트 */}
          <Text
            position={[0, actualSpaceHeight + mmToThreeUnits(140), 0]}
            fontSize={largeFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
          >
            {spaceInfo.width}
          </Text>
          
          {/* 연장선들 */}
          <Line
            points={[[-actualSpaceWidth/2, 0, 0], [-actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(120), 0]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth/2, 0, 0], [actualSpaceWidth/2, actualSpaceHeight + mmToThreeUnits(120), 0]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>
      </group>
    );
  };

  // 우측뷰 치수선 - Room.tsx와 정확히 동일한 좌표계 사용
  const renderRightView = () => {
    if (viewDirection !== 'right') return null;
    
    // Room.tsx와 동일한 계산
    const panelDepthMm = spaceInfo.depth || 600;
    const furnitureDepthMm = 600;
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth);
    const spaceHeight = mmToThreeUnits(spaceInfo.height);
    const panelDepth = mmToThreeUnits(panelDepthMm);
    const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    
    // Room.tsx와 완전히 동일한 Z 오프셋 계산
    const spaceZOffset = -panelDepth / 2;
    const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
    
    const actualSpaceWidth = mmToThreeUnits(spaceInfo.width);
    const actualSpaceHeight = mmToThreeUnits(spaceInfo.height);
    
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topDimensionY = actualSpaceHeight + mmToThreeUnits(hasPlacedModules ? 280 : 200);
    const rightDimensionX = actualSpaceWidth + mmToThreeUnits(200); // 우측 치수선 X 위치
    
    return (
      <group>
        {/* 상단 전체 깊이 치수선 */}
        <group>
          {/* 치수선 */}
          <Line
            points={[[rightDimensionX, topDimensionY, spaceZOffset], [rightDimensionX, topDimensionY, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전면 화살표 */}
          <Line
            points={createArrowHead([rightDimensionX, topDimensionY, spaceZOffset], [rightDimensionX, topDimensionY, spaceZOffset + 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 후면 화살표 */}
          <Line
            points={createArrowHead([rightDimensionX, topDimensionY, spaceZOffset + panelDepth], [rightDimensionX, topDimensionY, spaceZOffset + panelDepth - 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 깊이 치수 텍스트 */}
          {(showDimensionsText || isStep2) && (
            <Text
              position={[rightDimensionX + mmToThreeUnits(60), topDimensionY, spaceZOffset + panelDepth / 2]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              rotation={[0, -Math.PI / 2, 0]}
            >
              {spaceInfo.depth}
            </Text>
          )}
          
          {/* 연장선 (전면) */}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset], [rightDimensionX + mmToThreeUnits(20), 0, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset], [rightDimensionX + mmToThreeUnits(20), actualSpaceHeight, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 연장선 (후면) */}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset + panelDepth], [rightDimensionX + mmToThreeUnits(20), 0, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset + panelDepth], [rightDimensionX + mmToThreeUnits(20), actualSpaceHeight, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>
        
        {/* 우측 전체 높이 치수선 */}
        <group>
          {/* 치수선 */}
          <Line
            points={[[rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 하단 화살표 */}
          <Line
            points={createArrowHead([rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 상단 화살표 */}
          <Line
            points={createArrowHead([rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 높이 치수 텍스트 */}
          {(showDimensionsText || isStep2) && (
            <Text
              position={[rightDimensionX + mmToThreeUnits(60), actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(200)]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              rotation={[0, 0, -Math.PI / 2]}
            >
              {spaceInfo.height}
            </Text>
          )}
          
          {/* 연장선 */}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset], [actualSpaceWidth, 0, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset], [actualSpaceWidth, actualSpaceHeight, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>

        {/* 좌측 3구간 높이 치수선 */}
        <group>
          {(() => {
            const leftDimensionZ = spaceZOffset + panelDepth + mmToThreeUnits(120);
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
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomY, leftDimensionZ], [spaceWidth, 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY - 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                    position={[spaceWidth, mmToThreeUnits(bottomFrameHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
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
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY - 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                    position={[spaceWidth, mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {cabinetPlacementHeight}
                  </Text>
                </group>
                
                {/* 3. 상부 프레임 높이 / 노서라운드일 때는 상부 이격거리 */}
                <group>
                  <Line
                    points={[[spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, topY, leftDimensionZ]]}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY + 0.03, leftDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topY, leftDimensionZ], [spaceWidth, topY - 0.03, leftDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={spaceInfo.surroundType === 'no-surround' ? 2 : 1}
                  />
                  <Text
                    position={[spaceWidth, mmToThreeUnits(spaceInfo.height - topFrameHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                  </Text>
                </group>
                
                {/* 연장선들 */}
                <Line
                  points={[[spaceWidth, bottomY, spaceZOffset], [spaceWidth, bottomY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                <Line
                  points={[[spaceWidth, bottomFrameTopY, spaceZOffset], [spaceWidth, bottomFrameTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                )}
                <Line
                  points={[[spaceWidth, cabinetAreaTopY, spaceZOffset], [spaceWidth, cabinetAreaTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[spaceWidth, topY, spaceZOffset + spaceDepth], [spaceWidth, topY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
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
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([spaceWidth, dimY, spaceZOffset], [spaceWidth, dimY, spaceZOffset + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([spaceWidth, dimY, spaceZOffset + moduleDepth], [spaceWidth, dimY, spaceZOffset + moduleDepth - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 치수 텍스트 */}
              <Text
                position={[spaceWidth, dimY - mmToThreeUnits(30), spaceZOffset + moduleDepth / 2]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
              >
                {actualDepth}
              </Text>

              {/* 연장선 (가구에서 치수선까지 긴 보조선) */}
              <Line
                points={[[spaceWidth, spaceHeight, spaceZOffset], [spaceWidth, dimY + mmToThreeUnits(30), spaceZOffset]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={[[spaceWidth, spaceHeight, spaceZOffset + moduleDepth], [spaceWidth, dimY + mmToThreeUnits(30), spaceZOffset + moduleDepth]]}
                color={dimensionColor}
                lineWidth={0.5}
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
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
    const baseFrameThickness = mmToThreeUnits(18); // 하부 프레임 두께
    const baseFrameY = 0; // 바닥 기준
    const baseFrameZ = spaceZOffset + spaceDepth/2 - mmToThreeUnits(20); // 3D와 동일하게 앞쪽에서 20mm 뒤로
    const baseFrameWidth = spaceWidth - (spaceInfo.surroundType === 'no-surround' ? 0 : (mmToThreeUnits(frameSize.left) + mmToThreeUnits(frameSize.right)));
    const baseFrameX = spaceXOffset + spaceWidth/2;
    
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
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 좌측 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset, spaceHeight, mainDimZ], [spaceXOffset + 0.05, spaceHeight, mainDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 우측 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, mainDimZ], [spaceXOffset + spaceWidth - 0.05, spaceHeight, mainDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 전체 폭 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[0, spaceHeight + 0.1, mainDimZ - mmToThreeUnits(40)]}
                  fontSize={largeFontSize}
                  color={textColor}
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
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      <Line
                        points={[
                          [spaceXOffset + spaceWidth, spaceHeight, frameZ], 
                          [spaceXOffset + spaceWidth, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color={dimensionColor}
                        lineWidth={0.5}
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
            
            // 노서라운드일 때는 이격거리 표시, 서라운드일 때는 프레임 폭 표시
            const isNoSurround = spaceInfo.surroundType === 'no-surround';
            const leftValue = isNoSurround ? (spaceInfo.gapConfig?.left || 2) : frameSize.left;
            
            return (
              <>
                <Line
                  points={[[spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 좌측 프레임 화살표들 */}
                <Line
                  points={createArrowHead([spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue) - 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 좌측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[spaceXOffset + mmToThreeUnits(leftValue / 2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {leftValue}
                </Text>
              </>
            );
          })()}
        </group>
        
        {/* 우측 프레임 폭 치수선 - 외부로 이동 */}
        <group>
          {(() => {
            const frameDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 80 : 60);
            
            // 노서라운드일 때는 이격거리 표시, 서라운드일 때는 프레임 폭 표시
            const isNoSurround = spaceInfo.surroundType === 'no-surround';
            const rightValue = isNoSurround ? (spaceInfo.gapConfig?.right || 2) : frameSize.right;
            
            return (
              <>
                <Line
                  points={[[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth, spaceHeight, frameDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 우측 프레임 화살표들 */}
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - mmToThreeUnits(rightValue) + 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 우측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue / 2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {rightValue}
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
            color={subGuideColor}
            lineWidth={1}
          />
          
          {/* 좌측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset, spaceHeight, spaceZOffset], [spaceXOffset, spaceHeight, spaceZOffset + spaceDepth]]}
            color={subGuideColor}
            lineWidth={1}
          /> */}
          
          {/* 우측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset + spaceWidth, spaceHeight, spaceZOffset], [spaceXOffset + spaceWidth, spaceHeight, spaceZOffset + spaceDepth]]}
            color={subGuideColor}
            lineWidth={1}
          /> */}
        </group>

              {/* 좌측 치수선 - 좌측에 배치된 캐비넷만 고려 */}
      {placedModules.length > 0 && (() => {
        // 좌측에 배치된 가구 중에서 가장 깊은 가구 찾기 (x < 0인 가구만)
        let deepestBackZ = Infinity;
        let deepestFrontZ = -Infinity;
        let deepestFurnitureRightX = spaceXOffset;
        let hasLeftFurniture = false;
        
        placedModules.forEach((module) => {
          // 좌측에 배치된 가구만 고려 (x 좌표가 음수)
          if (module.position.x >= 0) return;
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData || !moduleData.dimensions) {
            return;
          }
          
          // 실제 깊이 정보 (스타일러장의 우측 660mm 깊이 고려)
          const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
          const moduleWidthMm = moduleData.dimensions.width;
          const isStylerModule = moduleData.id.includes('dual-2drawer-styler');
          
          const moduleWidth = mmToThreeUnits(moduleWidthMm);
          const rightX = module.position.x + moduleWidth / 2;
          
          // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산
          const panelDepthMm = 1500;
          const furnitureDepthMm = 600;
          const doorThicknessMm = 20;
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          
          let furnitureBackZ, furnitureFrontZ;
          
          if (isStylerModule) {
            // 스타일러장: 우측이 660mm로 더 깊음
            const leftDepthMm = actualDepthMm; // 좌측: 600mm
            const rightDepthMm = 660; // 우측: 스타일러장 고정 깊이
            
            const leftDepth = mmToThreeUnits(leftDepthMm);
            const rightDepth = mmToThreeUnits(rightDepthMm);
            
            // 기본 가구 Z 오프셋
            const zOffset = -panelDepth / 2;
            const baseFurnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
            
            // 좌측 부분 위치
            const leftFurnitureZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2;
            const leftBackZ = leftFurnitureZ - leftDepth/2;
            const leftFrontZ = leftFurnitureZ + leftDepth/2;
            
            // 우측 부분 위치 (깊이 차이만큼 뒤로 이동)
            const depthOffset = (leftDepth - rightDepth) / 2; // (600-660)/2 = -30mm
            const rightFurnitureZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2 + depthOffset;
            const rightBackZ = rightFurnitureZ - rightDepth/2;
            const rightFrontZ = rightFurnitureZ + rightDepth/2;
            
            // 전체에서 가장 뒤쪽과 앞쪽 선택
            furnitureBackZ = Math.min(leftBackZ, rightBackZ);
            furnitureFrontZ = Math.max(leftFrontZ, rightFrontZ);
          } else {
            // 일반 가구: 동일한 깊이
            const depth = mmToThreeUnits(actualDepthMm);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
            furnitureBackZ = furnitureZ - depth/2;
            furnitureFrontZ = furnitureZ + depth/2;
          }
          
          hasLeftFurniture = true; // 좌측에 가구가 있음을 표시
          
          // 가장 뒤쪽과 앞쪽 가구 찾기
          if (furnitureBackZ < deepestBackZ) {
            deepestBackZ = furnitureBackZ;
            deepestFurnitureRightX = rightX;
          }
          if (furnitureFrontZ > deepestFrontZ) {
            deepestFrontZ = furnitureFrontZ;
          }
        });
        
        // 좌측에 가구가 없거나 유효한 치수가 없으면 표시하지 않음
        if (!hasLeftFurniture || deepestBackZ === Infinity || deepestFrontZ === -Infinity) {
          return null;
        }
        
        // 실제 캐비넷 깊이 계산 (mm 단위)
        const cabinetDepthMm = Math.round((deepestFrontZ - deepestBackZ) / 0.01);
        const leftDimensionX = spaceXOffset - mmToThreeUnits(200);
        
        return (
          <group key="cabinet-depth-dimension">
            {/* 치수선 */}
            <Line
              points={[[leftDimensionX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 화살표들 */}
            <Line
              points={createArrowHead([leftDimensionX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestBackZ + 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={createArrowHead([leftDimensionX, spaceHeight, deepestFrontZ], [leftDimensionX, spaceHeight, deepestFrontZ - 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 캐비넷 깊이 텍스트 */}
            <Text
              position={[leftDimensionX - mmToThreeUnits(40), spaceHeight + 0.1, (deepestBackZ + deepestFrontZ) / 2]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {cabinetDepthMm}
            </Text>

            {/* 연장선들 - 캐비넷 뒷면과 앞면에서 치수선까지 */}
            <Line
              points={[[deepestFurnitureRightX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestBackZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[deepestFurnitureRightX, spaceHeight, deepestFrontZ], [leftDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </group>
        );
      })()}

        {/* 우측 치수선 - 우측에 배치된 캐비넷만 고려 */}
        {placedModules.length > 0 && (() => {
          // 우측에 배치된 가구 중에서 가장 깊은 가구 찾기 (x >= 0인 가구만)
          let deepestBackZ = Infinity;
          let deepestFrontZ = -Infinity;
          let deepestFurnitureLeftX = spaceXOffset;
          let hasRightFurniture = false;
          
          placedModules.forEach((module) => {
            // 우측에 배치된 가구만 고려 (x 좌표가 0 이상)
            if (module.position.x < 0) return;
            
            const moduleData = getModuleById(
              module.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            
            if (!moduleData || !moduleData.dimensions) {
              return;
            }
            
            // 실제 깊이 정보 (스타일러장의 우측 660mm 깊이 고려)
            const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
            const moduleWidthMm = moduleData.dimensions.width;
            const isStylerModule = moduleData.id.includes('dual-2drawer-styler');
            
            const moduleWidth = mmToThreeUnits(moduleWidthMm);
            const leftX = module.position.x - moduleWidth / 2;
            
            // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산
        const panelDepthMm = 1500;
        const furnitureDepthMm = 600;
        const doorThicknessMm = 20;
            
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const doorThickness = mmToThreeUnits(doorThicknessMm);
            
            let furnitureBackZ, furnitureFrontZ;
            
            if (isStylerModule) {
              // 스타일러장: 우측이 660mm로 더 깊음 (DualType5.tsx와 동일한 계산)
              const rightDepthMm = 660; // 우측: 스타일러장 고정 깊이
              const rightDepth = mmToThreeUnits(rightDepthMm);
              
              // 기본 가구 Z 오프셋 (600mm 기준)
              const zOffset = -panelDepth / 2;
              const baseFurnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
              
              // 스타일러장 우측 부분 위치 계산 (DualType5 컴포넌트와 동일)
              // furnitureZOffset에서 시작해서 스타일러장 깊이만큼 조정
              const stylerZOffset = baseFurnitureZOffset + (furnitureDepth - rightDepth) / 2;
              const stylerZ = stylerZOffset + rightDepth/2 - doorThickness - rightDepth/2;
              furnitureBackZ = stylerZ - rightDepth/2;
              furnitureFrontZ = stylerZ + rightDepth/2;
            } else {
              // 일반 가구: 동일한 깊이
              const depth = mmToThreeUnits(actualDepthMm);
              const zOffset = -panelDepth / 2;
              const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
              const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
              furnitureBackZ = furnitureZ - depth/2;
              furnitureFrontZ = furnitureZ + depth/2;
            }
            
            hasRightFurniture = true; // 우측에 가구가 있음을 표시
            
            // 가장 뒤쪽과 앞쪽 가구 찾기
            if (furnitureBackZ < deepestBackZ) {
              deepestBackZ = furnitureBackZ;
              deepestFurnitureLeftX = leftX;
            }
            if (furnitureFrontZ > deepestFrontZ) {
              deepestFrontZ = furnitureFrontZ;
            }
          });
          
          // 우측에 가구가 없거나 유효한 치수가 없으면 표시하지 않음
          if (!hasRightFurniture || deepestBackZ === Infinity || deepestFrontZ === -Infinity) {
            return null;
          }
          
          // 실제 캐비넷 깊이 계산 (mm 단위)
          const cabinetDepthMm = Math.round((deepestFrontZ - deepestBackZ) / 0.01);
          const rightDimensionX = spaceXOffset + spaceWidth + mmToThreeUnits(200);
        
        return (
            <group key="right-cabinet-depth-dimension">
            {/* 치수선 */}
            <Line
                points={[[rightDimensionX, spaceHeight, deepestBackZ], [rightDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 화살표들 */}
            <Line
                points={createArrowHead([rightDimensionX, spaceHeight, deepestBackZ], [rightDimensionX, spaceHeight, deepestBackZ + 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
                points={createArrowHead([rightDimensionX, spaceHeight, deepestFrontZ], [rightDimensionX, spaceHeight, deepestFrontZ - 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
              {/* 캐비넷 깊이 텍스트 */}
            <Text
                position={[rightDimensionX + mmToThreeUnits(40), spaceHeight + 0.1, (deepestBackZ + deepestFrontZ) / 2]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
                {cabinetDepthMm}
            </Text>

              {/* 연장선들 - 캐비넷 뒷면과 앞면에서 치수선까지 */}
            <Line
                points={[[deepestFurnitureLeftX, spaceHeight, deepestBackZ], [rightDimensionX, spaceHeight, deepestBackZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
                points={[[deepestFurnitureLeftX, spaceHeight, deepestFrontZ], [rightDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
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
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 뒤쪽 화살표 (가구 뒷면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, deepestModuleBackZ + 0.05])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 앞쪽 화살표 (좌측 프레임 앞면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, leftFrameFrontZ], [leftDimensionX, spaceHeight, leftFrameFrontZ - 0.05])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 좌측 프레임 앞면에서 가장 깊은 가구 뒷면까지의 거리 표시 */}
                  <Text
                    position={[leftDimensionX - mmToThreeUnits(40), spaceHeight + 0.1, deepestModuleBackZ + (leftFrameFrontZ - deepestModuleBackZ) / 2]}
                    fontSize={baseFontSize}
                    color={dimensionColor}
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
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      {/* 좌측 프레임 앞면에서 치수선까지 */}
                      <Line
                        points={[[spaceXOffset, spaceHeight, leftFrameFrontZ], [leftDimensionX - mmToThreeUnits(20), spaceHeight, leftFrameFrontZ]]}
                        color={dimensionColor}
                        lineWidth={0.5}
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
          
          // 기둥에 의해 조정된 너비와 위치 사용
          const actualWidth = module.adjustedWidth || moduleData.dimensions.width;
          const moduleWidth = mmToThreeUnits(actualWidth);
          // 조정된 위치가 있으면 사용, 없으면 원래 위치 사용
          const actualPositionX = module.adjustedPosition?.x || module.position.x;
          const leftX = actualPositionX - moduleWidth / 2;
          const rightX = actualPositionX + moduleWidth / 2;
          
          // 캐비넷 외부로 치수선 이동 (앞쪽으로)
          const dimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 120 : 80);
          
          return (
            <group key={`top-module-dim-${index}`}>
              {/* 캐비넷 폭 치수선 */}
              <Line
                points={[[leftX, spaceHeight, dimZ], [rightX, spaceHeight, dimZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([leftX, spaceHeight, dimZ], [leftX + 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([rightX, spaceHeight, dimZ], [rightX - 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 캐비넷 폭 치수 텍스트 - 상단뷰용 회전 적용 */}
              <Text
                position={[actualPositionX, spaceHeight + 0.1, dimZ - mmToThreeUnits(30)]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {Math.round(actualWidth)}
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
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      {/* 우측 연장선 */}
                      <Line
                        points={[[rightX, spaceHeight, rightFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor}
                        lineWidth={0.5}
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
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      <Line
                        points={[[rightX, spaceHeight, furnitureFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                    </>
                  );
                }
              })()}
            </group>
          );
        })}

        {/* 기둥별 치수선 - 상부뷰 (가구와 동일한 스타일) */}
        {spaceInfo.columns && spaceInfo.columns.length > 0 && spaceInfo.columns.map((column, index) => {
          const columnWidthM = column.width * 0.01;
          const leftX = column.position[0] - columnWidthM / 2;
          const rightX = column.position[0] + columnWidthM / 2;
          const dimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 120 : 80); // 가구 치수와 동일한 레벨
          
          return (
            <group key={`top-column-dim-${column.id}`}>
              {/* 기둥 치수선 */}
              <Line
                points={[[leftX, spaceHeight, dimZ], [rightX, spaceHeight, dimZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 좌측 화살표 */}
              <Line
                points={createArrowHead([leftX, spaceHeight, dimZ], [leftX + 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 우측 화살표 */}
              <Line
                points={createArrowHead([rightX, spaceHeight, dimZ], [rightX - 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 기둥 치수 텍스트 - 상단뷰용 회전 적용 */}
              <Text
                position={[column.position[0], spaceHeight + 0.1, dimZ - mmToThreeUnits(30)]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {Math.round(column.width)}
              </Text>
              
              {/* 연장선 - 가구와 동일한 길이로 수정 */}
              <Line
                points={[[leftX, spaceHeight, spaceZOffset], [leftX, spaceHeight, dimZ - mmToThreeUnits(50)]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={[[rightX, spaceHeight, spaceZOffset], [rightX, spaceHeight, dimZ - mmToThreeUnits(50)]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
            </group>
          );
        })}

        {/* 우측 치수선 - 우측 프레임 앞면부터 가구 가장 뒷면까지 거리 (비활성화) */}
        {false && placedModules.length > 0 && (() => {
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
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightmostBackZ], [rightDimensionX, spaceHeight, rightmostBackZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightFrameFrontZ], [rightDimensionX, spaceHeight, rightFrameFrontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 거리 텍스트 */}
              <Text
                position={[rightDimensionX + mmToThreeUnits(40), spaceHeight + 0.1, (rightmostBackZ + rightFrameFrontZ) / 2]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {distanceMm}
              </Text>

              {/* 연장선들 - 실제 가구의 정확한 위치에서 짧게 */}
              <Line
                points={[[rightFurnitureLeftEdge, spaceHeight, rightmostBackZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightmostBackZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              {/* 우측 프레임 앞면 연장선 - 공간 벽에서 짧게 */}
              <Line
                points={[[spaceXOffset + spaceWidth, spaceHeight, rightFrameFrontZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightFrameFrontZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
            </group>
          );
        })()}

        {/* 도어 치수 표시 - 도어가 실제로 설치된 캐비넷에만 표시 */}
        {placedModules.length > 0 && placedModules.filter(module => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          // moduleData.hasDoor: 도어 가능 여부, module.hasDoor: 실제 설치 여부
          return moduleData && moduleData.hasDoor && module.hasDoor;
        }).map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          // 도어가 없으면 표시하지 않음
          if (!moduleData || !moduleData.hasDoor) return null;
          
          const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
          const moduleWidth = mmToThreeUnits(moduleData.dimensions.width);
          const leftX = module.position.x - moduleWidth / 2;
          const rightX = module.position.x + moduleWidth / 2;
          
          // 스타일러장인지 확인 (듀얼 서랍+스타일러 타입)
          const isStylerType = moduleData.id.includes('dual-2drawer-styler');
          
          // 도어 위치 계산 (FurnitureItem.tsx와 동일)
          const panelDepthMm = 1500;
          const furnitureDepthMm = 600;
          const stylerDepthMm = 660; // 스타일러장 깊이
          const doorThicknessMm = 18;
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const stylerDepth = mmToThreeUnits(stylerDepthMm);
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          
          // 스타일러장의 경우 우측 부분의 깊이와 위치가 다름 (DualType5.tsx와 동일한 로직)
          let leftDoorFrontZ, rightDoorFrontZ, leftDoorBackZ, rightDoorBackZ;
          
          if (isStylerType) {
            // DualType5.tsx 로직 참고: 좌우 비대칭 깊이 처리
            const leftDepthMm = actualDepthMm; // 좌측: 600mm (또는 customDepth)
            const rightDepthMm = 660; // 우측: 스타일러장 고정 깊이
            
            const leftDepth = mmToThreeUnits(leftDepthMm);
            const rightDepth = mmToThreeUnits(rightDepthMm);
            
            // 기본 가구 Z 오프셋 (600mm 기준)
            const baseFurnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
            
            // 좌측 도어 위치 (기본 위치)
            leftDoorFrontZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2 + leftDepth/2;
            leftDoorBackZ = leftDoorFrontZ - doorThickness;
            
            // 우측 도어 위치 수정: 좌측 도어와 동일한 Z 라인에 정렬
            // 스타일러장 우측 도어도 같은 라인에 있도록 leftDoorFrontZ와 동일하게 설정
            rightDoorFrontZ = leftDoorFrontZ;
            rightDoorBackZ = leftDoorBackZ;
          } else {
            // 일반 가구: 동일한 깊이
            const depth = mmToThreeUnits(actualDepthMm);
            const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
            const doorFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2 + depth/2;
            const doorBackZ = doorFrontZ - doorThickness;
            
            leftDoorFrontZ = rightDoorFrontZ = doorFrontZ;
            leftDoorBackZ = rightDoorBackZ = doorBackZ;
          }
          
          // 하위 호환성을 위한 기본값 설정
          const doorFrontZ = leftDoorFrontZ;
          const doorBackZ = leftDoorBackZ;
          
          // 듀얼 도어인지 확인 (id에 'dual'이 포함되어 있으면 듀얼 도어로 간주)
          const isDualDoor = moduleData.id?.includes('dual');
          
          // 실제 도어의 x축 위치 계산
          let leftDoorLeftX, leftDoorRightX, rightDoorLeftX, rightDoorRightX;
          
          if (isDualDoor) {
            // 듀얼 도어: 좌우 각각의 도어 경계
            const centerX = module.position.x;
            leftDoorLeftX = leftX;
            leftDoorRightX = centerX;
            rightDoorLeftX = centerX;
            rightDoorRightX = rightX;
          } else {
            // 싱글 도어: 전체 영역
            leftDoorLeftX = leftX;
            leftDoorRightX = rightX;
            rightDoorLeftX = leftX;
            rightDoorRightX = rightX;
          }
          
          return (
            <group key={`door-dimension-${index}`}>
              {/* 하단 도어 치수 - 듀얼인 경우 각각 따로, 싱글인 경우 전체 */}
              {/* 모든 도어의 치수는 leftDoorFrontZ를 사용하여 동일한 Z 라인에 배치 */}
              {isDualDoor ? (
                // 듀얼 도어: 좌우 각각 치수 표시
                <>
                  {/* 좌측 도어 치수 */}
                  <group>
                    <Line
                      points={[[leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={createArrowHead([leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorLeftX + 0.015, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={createArrowHead([leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorRightX - 0.015, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Text
                      position={[(leftDoorLeftX + leftDoorRightX) / 2, spaceHeight + 0.1, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 120 : 100)]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      {Math.round((moduleData.dimensions.width - 6) / 2)}
                    </Text>
                    <Line
                      points={[[leftDoorLeftX, spaceHeight, leftDoorFrontZ], [leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={[[leftDoorRightX, spaceHeight, leftDoorFrontZ], [leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                  </group>
                  
                  {/* 우측 도어 치수 - 모든 도어와 동일한 Z 라인 사용 */}
                  <group>
                    <Line
                      points={[[rightDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={createArrowHead([rightDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorLeftX + 0.015, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={createArrowHead([rightDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX - 0.015, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Text
                      position={[(rightDoorLeftX + rightDoorRightX) / 2, spaceHeight + 0.1, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 120 : 100)]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      {Math.round((moduleData.dimensions.width - 6) / 2)}
                    </Text>
                    <Line
                      points={[[rightDoorLeftX, spaceHeight, leftDoorFrontZ], [rightDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={[[rightDoorRightX, spaceHeight, leftDoorFrontZ], [rightDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                  </group>
                  
                  {/* 중간 세로 가이드선 - 듀얼 도어를 나누는 중간선이 가로 치수선까지 확장 */}
                  <group>
                    <Line
                      points={[[module.position.x, spaceHeight, leftDoorFrontZ], [module.position.x, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                  </group>
                </>
              ) : (
                // 싱글 도어: 전체 치수 표시
                <group>
                  <Line
                    points={[[leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorLeftX + 0.02, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], 0.01)}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX - 0.02, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], 0.01)}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                    position={[(leftDoorLeftX + rightDoorRightX) / 2, spaceHeight + 0.1, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 120 : 100)]}
                    fontSize={baseFontSize}
                    color={dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {moduleData.dimensions.width - 3}
                  </Text>
                  <Line
                    points={[[leftDoorLeftX, spaceHeight, doorFrontZ], [leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={[[rightDoorRightX, spaceHeight, doorFrontZ], [rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                </group>
              )}
              
              {/* 도어 두께 치수 - 좌측에 표시, z축 위로 10mm 이동 */}
              <group>
                {/* 도어 두께 치수선 (좌측, z축을 위로 22mm 이동하여 실제 도어 위치에 맞춤) */}
                <Line
                  points={[[spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 도어 두께 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18) + 0.02], 0.01)}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0) - 0.02], 0.01)}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 도어 두께 텍스트 (중앙 위치) */}
                <Text
                  position={[spaceXOffset - mmToThreeUnits(240), spaceHeight + 0.1, -mmToThreeUnits(9)]}
                  fontSize={baseFontSize}
                  color={dimensionColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {doorThicknessMm}
                </Text>
                {/* 도어 두께 연결선 - 실제 도어 위치에 맞춤 */}
                <Line
                  points={[[leftDoorLeftX, spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(180), spaceHeight, -mmToThreeUnits(18)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[leftDoorLeftX, spaceHeight, mmToThreeUnits(0)], [spaceXOffset - mmToThreeUnits(180), spaceHeight, mmToThreeUnits(0)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
              </group>
            </group>
          );
        })}
                  </>
      )}

      
    </group>
  );
  };

  // 기둥만 렌더링하는 함수
  const renderColumns = () => {
    // 기둥 관련 거리 표시는 ColumnDistanceLabels에서 더블클릭 시에만 표시
    return null;
  };

  console.log('🎨 CleanCAD2D 최종 렌더링:', {
    currentViewDirection,
    showDimensions,
    hasColumns: !!spaceInfo.columns,
    columnCount: spaceInfo.columns?.length,
    shouldRenderColumns: currentViewDirection === 'front'
  });

  return (
    <group ref={groupRef} renderOrder={999999}>
      {/* 치수선은 showDimensions가 true이고 showDimensionsText가 true일 때만 렌더링 */}
      {showDimensions && showDimensionsText && renderDimensions()}
      
      {/* 기둥은 showDimensions가 true일 때만 렌더링 (2D 정면 뷰에서만) */}
      {showDimensions && currentViewDirection === 'front' && renderColumns()}
    </group>
  );
};

export default CleanCAD2D;